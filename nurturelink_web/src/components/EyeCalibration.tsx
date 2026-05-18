import { useEffect, useState } from 'react';
import { Eye, Check } from 'lucide-react';
import { recordCalibrationPoint } from '../lib/eyeTracker';

// 9 points spaced around the viewport, in viewport-relative fractions.
const POINTS: { x: number; y: number }[] = [
  { x: 0.1, y: 0.1 },
  { x: 0.5, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.1, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 0.9, y: 0.5 },
  { x: 0.1, y: 0.9 },
  { x: 0.5, y: 0.9 },
  { x: 0.9, y: 0.9 },
];

const CLICKS_PER_POINT = 5;

type Props = {
  onDone: () => void;
  onCancel: () => void;
};

export default function EyeCalibration({ onDone, onCancel }: Props) {
  const [current, setCurrent] = useState(0);
  const [clicks, setClicks] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  async function handleClick(e: React.MouseEvent) {
    const px = e.clientX;
    const py = e.clientY;
    await recordCalibrationPoint(px, py);

    const nextClicks = clicks + 1;
    if (nextClicks >= CLICKS_PER_POINT) {
      const nextIndex = current + 1;
      if (nextIndex >= POINTS.length) {
        onDone();
      } else {
        setCurrent(nextIndex);
        setClicks(0);
      }
    } else {
      setClicks(nextClicks);
    }
  }

  const point = POINTS[current];

  return (
    <div
      className="fixed inset-0 z-[60] cursor-crosshair"
      style={{ background: 'rgba(0,0,0,0.78)' }}
    >
      {/* Heads-up bar */}
      <div
        className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full border px-4 py-2 text-[13px] font-semibold backdrop-blur-md"
        style={{
          background: 'rgba(0,0,0,0.55)',
          borderColor: 'var(--color-accent)',
          color: 'white',
        }}
      >
        <span className="inline-flex items-center gap-2">
          <Eye className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
          Look at the dot and click it
          <span style={{ color: 'var(--color-accent)' }}>
            ({current + 1}/{POINTS.length} · {clicks}/{CLICKS_PER_POINT})
          </span>
        </span>
      </div>

      <button
        onClick={onCancel}
        className="absolute right-6 top-6 rounded-full px-4 py-2 text-[12px] font-semibold"
        style={{ background: 'rgba(255,255,255,0.18)', color: 'white' }}
      >
        Cancel (Esc)
      </button>

      {/* Calibration point */}
      <div
        onClick={handleClick}
        className="absolute"
        style={{
          left: `${point.x * 100}%`,
          top: `${point.y * 100}%`,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <div className="relative">
          {/* Outer pulsing ring */}
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: 'var(--color-accent)',
              opacity: 0.5,
              animation: 'nl-ring-pulse 1.4s ease-out infinite',
            }}
          />
          {/* Filled center */}
          <div
            className="relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-full"
            style={{
              background: 'var(--color-accent)',
              boxShadow:
                '0 0 0 4px rgba(255,255,255,0.95), 0 0 24px 6px color-mix(in oklch, var(--color-accent) 60%, transparent)',
            }}
          >
            <span className="text-[14px] font-black text-white">
              {clicks > 0 ? `${CLICKS_PER_POINT - clicks}` : <Check className="h-4 w-4 opacity-0" />}
            </span>
          </div>
        </div>
      </div>

      {/* Progress bar at bottom */}
      <div className="absolute bottom-8 left-1/2 w-[60%] -translate-x-1/2">
        <div
          className="h-1 w-full overflow-hidden rounded-full"
          style={{ background: 'rgba(255,255,255,0.18)' }}
        >
          <div
            className="h-full transition-all duration-200"
            style={{
              width: `${((current * CLICKS_PER_POINT + clicks) / (POINTS.length * CLICKS_PER_POINT)) * 100}%`,
              background: 'var(--color-accent)',
            }}
          />
        </div>
        <div
          className="mt-2 text-center text-[11px]"
          style={{ color: 'rgba(255,255,255,0.7)' }}
        >
          Calibrating eye tracker · keep your head still
        </div>
      </div>
    </div>
  );
}
