export function initDynamicFavicon() {
  const CONFIG = {
    frameCount: 47,
    frameSize: 64,
    displaySize: 32,
    fps: 15
  };

  const spriteImg = new Image();
  spriteImg.src = '/sprite.png';

  spriteImg.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = CONFIG.displaySize;
    canvas.height = CONFIG.displaySize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 性能优化 1: 预渲染所有帧，避免每次 tick 都调用昂贵的 toDataURL
    const frames: string[] = [];
    for (let i = 0; i < CONFIG.frameCount; i++) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        spriteImg,
        i * CONFIG.frameSize, 0, CONFIG.frameSize, CONFIG.frameSize,
        0, 0, canvas.width, canvas.height
      );
      frames.push(canvas.toDataURL('image/png'));
    }

    let faviconLink = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (!faviconLink) {
      faviconLink = document.createElement('link');
      faviconLink.rel = 'icon';
      document.head.appendChild(faviconLink);
    }

    let currentIndex = 0;

    // 性能优化 2: 使用 Web Worker 绕过浏览器对后台标签页 setInterval 的降频限制
    // 这样即使切换到其他网页，动态图标依然可以保持 15fps 播放
    const workerCode = `
      let timer = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          timer = setInterval(() => self.postMessage('tick'), 1000 / ${CONFIG.fps});
        }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));

    worker.onmessage = () => {
      faviconLink.href = frames[currentIndex];
      currentIndex = (currentIndex + 1) % CONFIG.frameCount;
    };

    worker.postMessage('start');
  };
}
