import { useEffect, useRef } from "react";

interface LiquidBackgroundProps {
  imageUrl?: string;
}

export function LiquidBackground({ imageUrl = "/background.png" }: LiquidBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const script = document.createElement("script");
    script.type = "module";
    script.textContent = `
      import LiquidBackground from 'https://cdn.jsdelivr.net/npm/threejs-components@0.0.30/build/backgrounds/liquid1.min.js';
      const canvas = document.getElementById('refraction-canvas');
      if (canvas) {
        const app = LiquidBackground(canvas);
        app.loadImage('${imageUrl}');
        // 调整参数以获得更好的水波纹和折射效果，降低中心高光
        app.liquidPlane.material.metalness = 0.1;
        app.liquidPlane.material.roughness = 0.6;
        app.liquidPlane.uniforms.displacementScale.value = 2.8; // 提高折射强度，使波纹更明显
        app.setRain(false);
        
        // 拦截 addDrop 方法：
        // 1. 完全禁用鼠标滑过产生的水波纹（原脚本中 onMove 的 strength 为 0.0025）
        // 2. 允许点击产生波纹（onClick 的 strength 为 0.05）
        // 3. 允许音乐可视化产生的波纹
        const originalAddDrop = app.liquidPlane.addDrop.bind(app.liquidPlane);
        app.liquidPlane.addDrop = (x, y, radius, strength) => {
          if (strength === 0.0025) {
            return; // 忽略鼠标滑过的波纹
          }
          originalAddDrop(x, y, radius, strength);
        };

        window.__refractionStageApp = app;
      }
    `;
    document.body.appendChild(script);

    return () => {
      if (window.__refractionStageApp?.dispose) {
        window.__refractionStageApp.dispose();
      }
      script.parentNode?.removeChild(script);
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
