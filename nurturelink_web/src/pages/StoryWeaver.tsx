// StoryWeaver — illustrations via Pollinations (default model, ~2s each)
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Moon,
  Compass,
  Cat,
  Heart,
  Play,
  PlayCircle,
  Mic,
  Brush,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import ErrorBanner from '../components/ErrorBanner';
import Spinner from '../components/Spinner';
import ParentAvatar from '../components/ParentAvatar';
import { generateStory, illustrationUrl, type Story } from '../lib/api';
import { loadProfile, speak } from '../lib/voiceProfile';

type Theme = { id: string; label: string; prompt: string; icon: LucideIcon };

const THEMES: Theme[] = [
  { id: 'bedtime', label: 'Cozy bedtime', prompt: 'cozy bedtime story', icon: Moon },
  { id: 'adventure', label: 'Brave adventure', prompt: 'brave little adventure', icon: Compass },
  { id: 'animals', label: 'Silly animals', prompt: 'funny silly animals', icon: Cat },
  { id: 'kindness', label: 'Kindness lesson', prompt: 'gentle lesson about kindness', icon: Heart },
];

export default function StoryWeaver() {
  const [profile] = useState(() => loadProfile());
  const [theme, setTheme] = useState<Theme>(THEMES[0]);
  const [age, setAge] = useState(5);
  const [note, setNote] = useState('');
  const [story, setStory] = useState<Story | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [narratingIndex, setNarratingIndex] = useState<number | null>(null);

  async function weave() {
    if (!profile) return;
    setLoading(true);
    setError(null);
    setStory(null);
    try {
      const result = await generateStory({
        child_age_years: age,
        theme: theme.prompt,
        parent_voice_note: note.trim(),
      });
      setStory(result);
    } catch (e) {
      setError(`Story generation failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function narrate(index: number, text: string) {
    if (!text) return;
    setNarratingIndex(index);
    setError(null);
    try {
      await speak(text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setNarratingIndex(null);
    }
  }

  async function narrateFull() {
    if (!story) return;
    const full = [
      story.title,
      ...story.scenes.map((s) => s.narration),
      story.closing_line,
    ]
      .filter(Boolean)
      .join(' ');
    setNarratingIndex(-1);
    setError(null);
    try {
      await speak(full);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setNarratingIndex(null);
    }
  }

  if (!profile) return <NeedsProfile />;

  return (
    <div>
      <PageHeader
        eyebrow="Communicate"
        title="StoryWeaver"
        description="Pick a theme. Gemma writes a four-scene bedtime story narrated in your voice."
      />

      {error && (
        <div className="mb-5">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
        {/* Setup card */}
        <div className="space-y-4">
          <div className="card p-6">
            <div className="mb-5 flex justify-center">
              <ParentAvatar profile={profile} size={120} />
            </div>

            {/* Theme */}
            <div className="mb-5">
              <label
                className="mb-2.5 block text-[12px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Theme
              </label>
              <div className="grid grid-cols-2 gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t)}
                    className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] font-semibold transition-colors"
                    style={{
                      borderColor:
                        theme.id === t.id
                          ? 'var(--color-accent)'
                          : 'var(--color-border)',
                      background:
                        theme.id === t.id
                          ? 'var(--color-accent-soft)'
                          : 'var(--color-bg-card)',
                      color:
                        theme.id === t.id
                          ? 'var(--color-accent-text)'
                          : 'var(--color-text-primary)',
                    }}
                  >
                    <t.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Age */}
            <div className="mb-5">
              <div className="mb-2 flex items-baseline justify-between">
                <label
                  className="text-[12px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Child age
                </label>
                <span className="text-[15px] font-bold">
                  {age} {age === 1 ? 'year' : 'years'}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={12}
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                className="w-full accent-[var(--color-accent)]"
              />
            </div>

            {/* Note */}
            <div className="mb-5">
              <label
                className="mb-2 block text-[12px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Caregiver note <span style={{ fontWeight: 500 }}>(optional)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Favourite animal, mood, lesson to include..."
                className="w-full resize-none rounded-xl border px-3 py-2.5 text-[14px] outline-none transition-colors"
                style={{
                  background: 'var(--color-bg-card)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--color-accent)')
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--color-border)')
                }
              />
            </div>

            <button
              onClick={weave}
              disabled={loading}
              className="btn-primary w-full justify-center"
            >
              {loading ? <Spinner size={16} /> : <Sparkles className="h-4 w-4" />}
              {loading ? 'Gemma is writing... (≈1-3 min)' : 'Weave a story'}
            </button>
          </div>
        </div>

        {/* Story column */}
        <div>
          {!story && !loading && <EmptyStory />}
          {loading && <LoadingStory />}
          {story && (
            <article>
              <div className="mb-5 flex items-start justify-between gap-4">
                <h2
                  className="text-[28px] font-bold leading-tight"
                  style={{ letterSpacing: '-0.025em' }}
                >
                  {story.title}
                </h2>
                <button
                  className="btn-secondary shrink-0"
                  onClick={narrateFull}
                  disabled={narratingIndex !== null}
                >
                  {narratingIndex === -1 ? (
                    <Spinner size={14} />
                  ) : (
                    <PlayCircle className="h-4 w-4" />
                  )}
                  Narrate all
                </button>
              </div>

              <ol className="space-y-5">
                {story.scenes.map((scene, i) => (
                  <li key={i}>
                    <div className="card overflow-hidden p-0">
                      <SceneIllustration
                        prompt={scene.illustration || scene.narration}
                        seed={i * 17 + story.title.length}
                        index={i}
                      />
                      <div className="p-5">
                        <div className="mb-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                              style={{ background: 'var(--color-accent)' }}
                            >
                              {scene.scene_number}
                            </div>
                            <span
                              className="text-[12px] font-bold uppercase tracking-wider"
                              style={{ color: 'var(--color-text-muted)' }}
                            >
                              Scene {scene.scene_number}
                            </span>
                          </div>
                          <button
                            onClick={() => narrate(i, scene.narration)}
                            disabled={narratingIndex !== null}
                            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[var(--color-accent-soft)]"
                          >
                            {narratingIndex === i ? (
                              <Spinner size={14} />
                            ) : (
                              <Play
                                className="h-4 w-4"
                                style={{ color: 'var(--color-accent)' }}
                              />
                            )}
                          </button>
                        </div>
                        <p className="text-[15px] leading-relaxed">
                          {scene.narration}
                        </p>
                        {scene.illustration && (
                          <div
                            className="mt-3 flex items-start gap-2 rounded-lg p-2.5 text-[12px] italic"
                            style={{
                              background: 'var(--color-bg-elevated)',
                              color: 'var(--color-text-muted)',
                            }}
                          >
                            <Brush className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>{scene.illustration}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>

              {story.closing_line && (
                <div
                  className="card mt-4 p-6"
                  style={{
                    background: 'var(--color-accent-soft)',
                    borderColor: 'var(--color-accent)',
                  }}
                >
                  <p
                    className="text-[17px] font-semibold italic leading-relaxed"
                    style={{ color: 'var(--color-accent-text)' }}
                  >
                    {story.closing_line}
                  </p>
                </div>
              )}

              {story.safety_note && (
                <p
                  className="mt-4 text-[12px] leading-relaxed"
                  style={{ color: 'var(--color-text-subtle)' }}
                >
                  {story.safety_note}
                </p>
              )}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}

function SceneIllustration({
  prompt,
  seed,
  index,
}: {
  prompt: string;
  seed: number;
  index: number;
}) {
  // Load images one at a time (stagger by index) to avoid hammering
  // Pollinations with parallel requests that get 500s.
  const [status, setStatus] = useState<'waiting' | 'loading' | 'ok' | 'error'>(
    'waiting',
  );
  const [attempt, setAttempt] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    // Stagger start by index — each scene begins 4s after the previous.
    const startDelay = index * 4000;
    const startTimer = window.setTimeout(() => {
      if (cancelled) return;
      setStatus('loading');
      tryLoad();
    }, startDelay);

    async function tryLoad() {
      const maxAttempts = 4;
      for (let i = 0; i < maxAttempts; i++) {
        if (cancelled) return;
        setAttempt(i);
        // Different seed each retry so server doesn't return same cached 500.
        const url = illustrationUrl(prompt, seed + i * 1009);
        try {
          const res = await fetch(url, { cache: 'force-cache' });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const blob = await res.blob();
          if (cancelled) return;
          if (!blob.type.startsWith('image/')) {
            throw new Error(`Bad content type ${blob.type}`);
          }
          const objectUrl = URL.createObjectURL(blob);
          setBlobUrl(objectUrl);
          setStatus('ok');
          cleanup = () => URL.revokeObjectURL(objectUrl);
          return;
        } catch (e) {
          if (cancelled) return;
          // Backoff before retry
          await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
        }
      }
      if (!cancelled) setStatus('error');
    }

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      if (cleanup) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, seed, index]);

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        background:
          'linear-gradient(135deg, var(--color-accent-soft) 0%, var(--color-bg-elevated) 100%)',
        aspectRatio: '3 / 2',
      }}
    >
      {status === 'waiting' && (
        <div
          className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Queued — painting scene {index + 1} of 4
        </div>
      )}
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Spinner size={20} />
          <div
            className="text-[11px] font-semibold"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Painting the scene{attempt > 0 ? ` (try ${attempt + 1})` : ''}...
          </div>
        </div>
      )}
      {status === 'error' && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <div className="text-[12px] font-semibold">Couldn't paint scene</div>
          <div className="text-[10px]">Pollinations server busy. Try regenerating.</div>
        </div>
      )}
      {status === 'ok' && blobUrl && (
        <img
          src={blobUrl}
          alt={prompt}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
}

function EmptyStory() {
  return (
    <div
      className="card flex h-full min-h-[260px] flex-col items-center justify-center p-8 text-center"
      style={{ borderStyle: 'dashed' }}
    >
      <Sparkles
        className="mb-3 h-8 w-8"
        style={{ color: 'var(--color-accent)' }}
      />
      <h3 className="text-[16px] font-bold">Your story will appear here</h3>
      <p
        className="mt-1 max-w-xs text-[13px]"
        style={{ color: 'var(--color-text-muted)' }}
      >
        Pick a theme on the left and tap Weave. Each scene plays in your matched voice.
      </p>
    </div>
  );
}

function LoadingStory() {
  return (
    <div className="card flex h-full min-h-[260px] flex-col items-center justify-center p-8 text-center">
      <Spinner size={24} />
      <h3 className="mt-4 text-[15px] font-bold">Gemma is writing your story...</h3>
      <p
        className="mt-1 max-w-xs text-[13px]"
        style={{ color: 'var(--color-text-muted)' }}
      >
        This takes about 1-3 minutes on CPU. Each scene will be ready to narrate
        in your voice when done.
      </p>
    </div>
  );
}

function NeedsProfile() {
  return (
    <div>
      <PageHeader title="StoryWeaver" description="Bedtime stories in your voice." />
      <div
        className="card flex flex-col items-start gap-3 p-8"
        style={{
          background: 'var(--color-accent-soft)',
          borderColor: 'var(--color-accent)',
        }}
      >
        <div className="text-[15px] font-bold">Voice profile needed</div>
        <p
          className="max-w-md text-[13px]"
          style={{ color: 'var(--color-accent-text)' }}
        >
          StoryWeaver narrates in your voice. Quick setup first.
        </p>
        <Link to="/voice-setup" className="btn-primary mt-2">
          <Mic className="h-4 w-4" />
          Set up voice
        </Link>
      </div>
    </div>
  );
}
