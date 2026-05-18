import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import type { VoiceProfile } from '../lib/voiceProfile';

type Props = {
  profile: VoiceProfile;
  size?: number;
  showLabel?: boolean;
};

export default function ParentAvatar({
  profile,
  size = 132,
  showLabel = true,
}: Props) {
  const [speaking, setSpeaking] = useState(false);
  const [amplitude, setAmplitude] = useState(0);
  const mouthRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const start = () => setSpeaking(true);
    const end = () => {
      setSpeaking(false);
      setAmplitude(0);
    };
    const amp = (e: Event) => {
      const ce = e as CustomEvent<number>;
      setAmplitude(ce.detail);
    };
    window.addEventListener('voice:start', start);
    window.addEventListener('voice:end', end);
    window.addEventListener('voice:amplitude', amp as EventListener);
    return () => {
      window.removeEventListener('voice:start', start);
      window.removeEventListener('voice:end', end);
      window.removeEventListener('voice:amplitude', amp as EventListener);
    };
  }, []);

  // Map amplitude (0..~0.4) to a 0..1 strength for the talking pulse.
  const mouthStrength = Math.min(1, amplitude * 4);

  const label = profile.parentName || 'Your voice';

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative"
        style={{ width: size, height: size }}
      >
        {/* Outer breathing rings */}
        {speaking && (
          <>
            <div
              className="absolute inset-0 rounded-full"
              style={{
                animation: 'nl-ring-pulse 1.6s ease-out infinite',
                background: 'var(--color-accent)',
                opacity: 0.18,
              }}
            />
            <div
              className="absolute inset-0 rounded-full"
              style={{
                animation: 'nl-ring-pulse 1.6s ease-out 0.5s infinite',
                background: 'var(--color-accent)',
                opacity: 0.12,
              }}
            />
          </>
        )}

        {/* Photo with bordered ring */}
        <div
          className="relative rounded-full transition-all duration-300"
          style={{
            width: size,
            height: size,
            transform: speaking ? 'scale(1.04)' : 'scale(1)',
            boxShadow: speaking
              ? `0 0 0 6px var(--color-accent-soft), 0 0 40px 6px color-mix(in oklch, var(--color-accent) 55%, transparent)`
              : '0 1px 2px rgba(0,0,0,0.08)',
            border: `3px solid ${speaking ? 'var(--color-accent)' : 'var(--color-border)'}`,
            animation: speaking ? 'nl-breathe 1.6s ease-in-out infinite' : 'none',
          }}
        >
          <div
            className="relative h-full w-full overflow-hidden rounded-full"
            style={{ background: 'var(--color-accent-soft)' }}
          >
            {profile.photoDataUrl ? (
              <img
                src={profile.photoDataUrl}
                alt={label}
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center font-black"
                style={{
                  color: 'var(--color-accent-text)',
                  fontSize: size * 0.32,
                }}
              >
                {label.slice(0, 1).toUpperCase()}
              </div>
            )}

            {/* Mouth zone overlay — reacts to live audio amplitude */}
            {speaking && (
              <div
                ref={mouthRef}
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full mix-blend-multiply"
                style={{
                  bottom: size * 0.18,
                  width: size * (0.22 + 0.18 * mouthStrength),
                  height: size * (0.06 + 0.16 * mouthStrength),
                  background: `radial-gradient(circle, color-mix(in oklch, var(--color-accent) ${
                    25 + Math.round(mouthStrength * 60)
                  }%, transparent) 0%, transparent 70%)`,
                  transition: 'all 80ms ease-out',
                }}
              />
            )}
          </div>
          {speaking && (
            <div
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-md"
              style={{
                background: 'var(--color-accent)',
                color: 'white',
                boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
              }}
            >
              Speaking
            </div>
          )}
        </div>
      </div>

      {showLabel && (
        <div className="mt-5 text-center">
          <div className="text-[18px] font-bold leading-tight">{label}</div>
          <div
            className="mt-0.5 flex items-center justify-center gap-1 text-[12px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <Volume2 className="h-3 w-3" />
            <span>{profile.displayName}</span>
          </div>
        </div>
      )}
    </div>
  );
}
