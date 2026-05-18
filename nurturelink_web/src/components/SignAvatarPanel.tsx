import { useEffect, useMemo, useState } from 'react';
import { Hand, ExternalLink, X, Loader2 } from 'lucide-react';

type Props = {
  text: string;
  onClose?: () => void;
};

/**
 * Embeds sign.mt's real 3D ASL avatar with the given text pre-filled.
 * The iframe loads their public translation page and renders the signing
 * avatar inline. No API key needed.
 */
export default function SignAvatarPanel({ text, onClose }: Props) {
  const url = useMemo(() => {
    const encoded = encodeURIComponent(text.trim());
    // sign.mt translation route: spl=spoken-language, sgn=signed-language
    return `https://sign.mt/?spl=en&sgn=ase&text=${encoded}`;
  }, [text]);

  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setTimedOut(false);
    const t = window.setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [url]);

  return (
    <div
      className="card overflow-hidden p-0"
      style={{ borderColor: 'var(--color-accent)' }}
    >
      <div
        className="flex items-center justify-between border-b px-5 py-3"
        style={{
          background: 'var(--color-accent-soft)',
          borderColor: 'var(--color-accent)',
        }}
      >
        <div
          className="flex items-center gap-2 text-[13px] font-bold"
          style={{ color: 'var(--color-accent-text)' }}
        >
          <Hand className="h-4 w-4" />
          <span>Showing in ASL (American Sign Language)</span>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md p-1.5 transition-colors hover:bg-white/40"
            title="Open larger in new tab"
          >
            <ExternalLink
              className="h-4 w-4"
              style={{ color: 'var(--color-accent-text)' }}
            />
          </a>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-md p-1.5 transition-colors hover:bg-white/40"
              title="Close"
            >
              <X
                className="h-4 w-4"
                style={{ color: 'var(--color-accent-text)' }}
              />
            </button>
          )}
        </div>
      </div>

      <div
        className="relative w-full bg-black"
        style={{ aspectRatio: '4 / 3', minHeight: 280 }}
      >
        {!loaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/70">
            <Loader2
              className="h-6 w-6 animate-spin"
              style={{ color: 'var(--color-accent)' }}
            />
            <div className="text-[12px] font-semibold text-white">
              Loading sign.mt avatar...
            </div>
            {timedOut && (
              <div className="px-6 text-center text-[11px] text-white/70">
                Slow connection? You can{' '}
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  open it in a new tab
                </a>{' '}
                instead.
              </div>
            )}
          </div>
        )}
        <iframe
          src={url}
          title="Sign language avatar"
          className="h-full w-full"
          allow="autoplay"
          onLoad={() => setLoaded(true)}
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      <div
        className="border-t px-5 py-2.5 text-[11px]"
        style={{
          borderColor: 'var(--color-border)',
          background: 'var(--color-bg-elevated)',
          color: 'var(--color-text-muted)',
        }}
      >
        Powered by{' '}
        <a
          href="https://sign.mt"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          sign.mt
        </a>{' '}
        — open research on sign language translation.
      </div>
    </div>
  );
}
