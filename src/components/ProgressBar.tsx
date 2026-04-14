import React, { useEffect, useRef } from 'react';

interface ProgressBarProps {
  audioRef: React.RefObject<HTMLAudioElement>;
}

export function ProgressBar({ audioRef }: ProgressBarProps) {
  const progressRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let animationFrameId: number;
    
    const updateProgress = () => {
      if (audioRef.current && progressRef.current) {
        const currentTime = audioRef.current.currentTime || 0;
        let duration = audioRef.current.duration;
        if (isNaN(duration) || !isFinite(duration)) {
          duration = 1;
        }
        progressRef.current.value = currentTime.toString();
        progressRef.current.max = duration.toString();
        progressRef.current.style.background = `linear-gradient(to right, #2563eb ${(currentTime / duration) * 100}%, #e5e7eb ${(currentTime / duration) * 100}%)`;
      }
      animationFrameId = requestAnimationFrame(updateProgress);
    };

    updateProgress();

    return () => cancelAnimationFrame(animationFrameId);
  }, [audioRef]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Number(e.target.value);
  };

  return (
    <input 
      ref={progressRef}
      type="range" 
      min={0} 
      step="0.01"
      onChange={handleSeek}
      className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:rounded-full"
    />
  );
}
