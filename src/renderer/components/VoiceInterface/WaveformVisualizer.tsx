import React, { useEffect, useRef } from 'react';

interface WaveformVisualizerProps {
  isActive: boolean;
  volume: number;
  className?: string;
}

export function WaveformVisualizer({ isActive, volume, className = '' }: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const waveformRef = useRef<number[]>(new Array(192).fill(0.5)); // Buffer for waveform history

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      // Clear canvas with fade effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, width, height);

      if (isActive) {
        // Shift waveform left and add new sample
        waveformRef.current.shift();
        const amplifiedVolume = Math.min(volume * 4, 1); // 4x amplification for visibility
        waveformRef.current.push(0.5 + (amplifiedVolume * (Math.random() - 0.5)));
      } else {
        // Decay towards center when inactive
        waveformRef.current.shift();
        waveformRef.current.push(0.5 + (waveformRef.current[waveformRef.current.length - 1] - 0.5) * 0.95);
      }

      // Draw waveform with glow effect
      const pointCount = waveformRef.current.length;
      const xStep = width / pointCount;

      // Draw glow
      ctx.strokeStyle = isActive ? 'rgba(249, 115, 22, 0.3)' : 'rgba(249, 115, 22, 0.1)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < pointCount; i++) {
        const x = i * xStep;
        const y = waveformRef.current[i] * height;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Draw main waveform line
      ctx.strokeStyle = isActive ? 'rgba(249, 115, 22, 0.9)' : 'rgba(249, 115, 22, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < pointCount; i++) {
        const x = i * xStep;
        const y = waveformRef.current[i] * height;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Draw center line
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

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
        width={768}
        height={80}
        className="w-full h-20 rounded-lg bg-black border border-orange-900/30"
        style={{ boxShadow: isActive ? '0 0 20px rgba(249, 115, 22, 0.3)' : 'none' }}
      />
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center text-orange-700/50 text-xs font-mono tracking-wider uppercase">
          {'>'} AUDIO.INPUT.STANDBY
        </div>
      )}
    </div>
  );
}
