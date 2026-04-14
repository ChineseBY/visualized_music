import { useEffect, useRef } from "react";

interface LiquidBackgroundProps {
  imageUrl?: string;
}

export function LiquidBackground({ imageUrl = "/bg_02.jpg" }: LiquidBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    let app: any;

    import('https://cdn.jsdelivr.net/npm/threejs-components@0.0.30/build/backgrounds/liquid1.min.js')
      .then((module) => {
        const LiquidBackground = module.default;
        if (!canvasRef.current) return;
        
        app = LiquidBackground(canvasRef.current);
        app.loadImage(imageUrl);
        
        // 调整参数以获得更好的水波纹和折射效果，降低中心高光
        if (imageUrl.includes('bg_03.jpg')) {
          // 针对 bg_03.jpg (较亮壁纸) 的特殊优化：
          // 降低金属度，提高粗糙度，以消除刺眼的高光反射
          app.liquidPlane.material.metalness = 0.0;
          app.liquidPlane.material.roughness = 0.9;
          app.liquidPlane.uniforms.displacementScale.value = 1.8; // 稍微降低折射强度，使波纹更柔和
        } else {
          // 其他壁纸保持原有效果
          app.liquidPlane.material.metalness = 0.1;
          app.liquidPlane.material.roughness = 0.6;
          app.liquidPlane.uniforms.displacementScale.value = 2.8; // 提高折射强度，使波纹更明显
        }
        app.setRain(false);
        
        // 拦截 addDrop 方法：
        // 1. 完全禁用鼠标滑过产生的水波纹（原脚本中 onMove 的 strength 为 0.0025）
        // 2. 允许点击产生波纹（onClick 的 strength 为 0.05）
        // 3. 允许音乐可视化产生的波纹
        const originalAddDrop = app.liquidPlane.addDrop.bind(app.liquidPlane);
        app.liquidPlane.addDrop = (x: number, y: number, radius: number, strength: number) => {
          if (strength === 0.0025) {
            return; // 忽略鼠标滑过的波纹
          }
          originalAddDrop(x, y, radius, strength);
        };

        window.__refractionStageApp = app;
      })
      .catch(console.error);

    return () => {
      if (app && app.dispose) {
        app.dispose();
      } else if (window.__refractionStageApp?.dispose) {
        window.__refractionStageApp.dispose();
      }
    };
  }, [imageUrl]);

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden -z-10 bg-[#f0e6e6]">
      <canvas
        ref={canvasRef}
        id="refraction-canvas"
        className="fixed inset-0 w-full h-full"
      />
    </div>
  );
}

declare global {
  interface Window {
    __refractionStageApp?: { dispose?: () => void };
  }
}
