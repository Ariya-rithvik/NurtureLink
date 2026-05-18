import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus2, ChevronRight } from 'lucide-react';
import type { VoiceProfile } from '../lib/voiceProfile';
import { loadProfile } from '../lib/voiceProfile';

export default function VoiceProfileChip() {
  const [profile, setProfile] = useState<VoiceProfile | null>(() =>
    loadProfile(),
  );

  useEffect(() => {
    const handler = () => setProfile(loadProfile());
    window.addEventListener('profile:changed', handler);
    return () => window.removeEventListener('profile:changed', handler);
  }, []);

  if (!profile) {
    return (
      <Link
        to="/voice-setup"
        className="flex items-center gap-2.5 rounded-xl border border-dashed px-3 py-3 transition-colors"
        style={{ borderColor: 'var(--color-border-strong)' }}
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: 'var(--color-accent-soft)' }}
        >
          <UserPlus2
            className="h-4 w-4"
            style={{ color: 'var(--color-accent)' }}
            strokeWidth={2.2}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">Set up your voice</div>
          <div
            className="truncate text-[11px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Required for speaking features
          </div>
        </div>
        <ChevronRight
          className="h-4 w-4"
          style={{ color: 'var(--color-text-muted)' }}
        />
      </Link>
    );
  }

  const name = profile.parentName || 'Your voice';

  return (
    <Link
      to="/voice-setup"
      className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-[var(--color-bg-elevated)]"
    >
      <div
        className="h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1"
        style={{ borderColor: 'var(--color-border)' }}
      >
        {profile.photoDataUrl ? (
          <img
            src={profile.photoDataUrl}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-[14px] font-bold"
            style={{
              background: 'var(--color-accent-soft)',
              color: 'var(--color-accent-text)',
            }}
          >
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold">{name}</div>
        <div
          className="truncate text-[11px]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {profile.displayName}
        </div>
      </div>
      <ChevronRight
        className="h-4 w-4"
        style={{ color: 'var(--color-text-muted)' }}
      />
    </Link>
  );
}
