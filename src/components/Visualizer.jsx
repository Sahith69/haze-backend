import React, { useEffect, useRef } from 'react';
import { X, Activity } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export default function Visualizer() {
  const { isVisualizerOpen, setIsVisualizerOpen, analyserRef, isPlaying, currentTrack } = usePlayer();
  const canvasRef = useRef(null);
  const animationFrameId = useRef(null);

  useEffect(() => {
    if (!isVisualizerOpen || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;

    // Handle high DPI displays
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const bufferLength = analyser ? analyser.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      ctx.clearRect(0, 0, width, height);

      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(dataArray);
      } else {
        // Subtle ambient wave when paused
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = Math.sin(Date.now() / 400 + i / 5) * 15 + 10;
        }
      }

      // Draw mirrored spectrum bars
      const numBars = 64;
      const barWidth = (width / numBars) * 0.7;
      const barGap = (width / numBars) * 0.3;

      for (let i = 0; i < numBars; i++) {
        const val = dataArray[i] || 0;
        const percent = val / 255;
        const barHeight = Math.max(4, percent * (height * 0.55));
        const x = i * (barWidth + barGap);
        const y = height / 2 - barHeight / 2;

        // Gradient from bright white center to subtle glow
        const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0.2)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 3, 3]);
        ctx.fill();
      }

      // Draw central connecting waveform line
      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';

      for (let i = 0; i < numBars; i++) {
        const val = dataArray[i] || 0;
        const percent = val / 255;
        const barHeight = percent * (height * 0.3);
        const x = i * (barWidth + barGap) + barWidth / 2;
        const y = height / 2 - barHeight;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      animationFrameId.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isVisualizerOpen, isPlaying, analyserRef]);

  if (!isVisualizerOpen) return null;

  return (
    <div className="fixed inset-0 top-0 bottom-22 bg-black/95 backdrop-blur-2xl z-30 flex flex-col select-none animate-fadeIn">
      {/* Header bar */}
      <div className="h-16 px-8 flex items-center justify-between border-b border-neutral-900/60 shrink-0">
        <div className="flex items-center gap-3">
          <Activity className="w-4 h-4 text-white" />
          <span className="text-xs font-semibold tracking-wider uppercase text-neutral-400 font-mono">
            Audio Spectrum Visualizer
          </span>
        </div>
        <button
          onClick={() => setIsVisualizerOpen(false)}
          className="p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-900 transition-colors"
          title="Close Visualizer (V or Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Center visualizer canvas */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
        {currentTrack && (
          <div className="absolute top-12 text-center select-none pointer-events-none">
            <h3 className="text-lg font-bold text-white tracking-wide">{currentTrack.title}</h3>
            <p className="text-xs text-neutral-400 font-medium">{currentTrack.artist}</p>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className="w-full max-w-4xl h-80 rounded-2xl bg-neutral-950/40 border border-neutral-900/60 shadow-[0_0_50px_rgba(255,255,255,0.03)]"
        />

        <div className="mt-8 flex items-center gap-4 text-xs font-mono text-neutral-500">
          <span>20 Hz</span>
          <div className="w-48 h-px bg-neutral-800" />
          <span>20 kHz</span>
        </div>
      </div>
    </div>
  );
}
