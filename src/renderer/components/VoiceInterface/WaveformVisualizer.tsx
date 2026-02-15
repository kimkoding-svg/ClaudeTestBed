import React, { useEffect, useRef } from 'react';

interface WaveformVisualizerProps {
  isActive: boolean;
  volume: number;
  className?: string;
}

export function WaveformVisualizer({ isActive, volume, className = '' }: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const barsRef = useRef<number[]>(new Array(32).fill(0));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      const barCount = barsRef.current.length;
      const barWidth = width / barCount;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      if (isActive) {
        // Update bars with smooth animation
        for (let i = 0; i < barCount; i++) {
          const targetHeight = volume * (0.3 + Math.random() * 0.7);
          barsRef.current[i] += (targetHeight - barsRef.current[i]) * 0.2;
        }
      } else {
        // Fade out bars
        for (let i = 0; i < barCount; i++) {
          barsRef.current[i] *= 0.9;
        }
      }

      // Draw bars
      ctx.fillStyle = isActive ? '#3b82f6' : '#9ca3af'; // blue-500 or gray-400

      for (let i = 0; i < barCount; i++) {
        const barHeight = barsRef.current[i] * height * 0.8;
        const x = i * barWidth;
        const y = (height - barHeight) / 2;

        ctx.fillRect(x, y, barWidth - 2, barHeight);
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, volume]);

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        width={384}
        height={80}
        className="w-full h-20 rounded-lg bg-gray-50"
      />
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
          Ready to record
        </div>
      )}
    </div>
  );
}
