import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ear,
  Mic,
  MicOff,
  Smile,
  Frown,
  Heart,
  AlertCircle,
  Trash2,
  ExternalLink,
  Volume2,
  Languages,
  Type,
  Send,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import ErrorBanner from '../components/ErrorBanner';
import { loadProfile, speak } from '../lib/voiceProfile';

// Lightweight typings for the (unprefixed) Web Speech API.
type SpeechRecognitionAlternativeLite = { transcript: string };
type SpeechRecognitionResultLite = {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLite;
};
type SpeechRecognitionEventLite = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLite>;
};
type SpeechRecognitionErrorEventLite = { error: string; message?: string };
type SpeechRecognitionLite = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLite) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLite) => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLite;
function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

const EMOTIONAL_KEYWORDS: Record<string, { emoji: string; mood: Mood }> = {
  love: { emoji: '❤️', mood: 'happy' },
  loves: { emoji: '❤️', mood: 'happy' },
  hug: { emoji: '🫂', mood: 'happy' },
  happy: { emoji: '😊', mood: 'happy' },
  yay: { emoji: '🎉', mood: 'happy' },
  play: { emoji: '🧸', mood: 'happy' },
  story: { emoji: '📖', mood: 'happy' },
  mama: { emoji: '👩', mood: 'happy' },
  mommy: { emoji: '👩', mood: 'happy' },
  daddy: { emoji: '👨', mood: 'happy' },
  papa: { emoji: '👨', mood: 'happy' },
  hungry: { emoji: '🍎', mood: 'urgent' },
  food: { emoji: '🍎', mood: 'urgent' },
  eat: { emoji: '🍎', mood: 'urgent' },
  water: { emoji: '💧', mood: 'urgent' },
  thirsty: { emoji: '💧', mood: 'urgent' },
  drink: { emoji: '💧', mood: 'urgent' },
  sleep: { emoji: '😴', mood: 'calm' },
  tired: { emoji: '😴', mood: 'calm' },
  sleepy: { emoji: '😴', mood: 'calm' },
  bed: { emoji: '🛏️', mood: 'calm' },
  potty: { emoji: '🚽', mood: 'urgent' },
  bathroom: { emoji: '🚽', mood: 'urgent' },
  toilet: { emoji: '🚽', mood: 'urgent' },
  hurt: { emoji: '🤕', mood: 'sad' },
  hurts: { emoji: '🤕', mood: 'sad' },
  pain: { emoji: '🤕', mood: 'sad' },
  ouch: { emoji: '🤕', mood: 'sad' },
  scared: { emoji: '😨', mood: 'sad' },
  afraid: { emoji: '😨', mood: 'sad' },
  fear: { emoji: '😨', mood: 'sad' },
  sad: { emoji: '😢', mood: 'sad' },
  cry: { emoji: '😢', mood: 'sad' },
  crying: { emoji: '😢', mood: 'sad' },
  angry: { emoji: '😠', mood: 'sad' },
  mad: { emoji: '😠', mood: 'sad' },
  cold: { emoji: '🥶', mood: 'urgent' },
  hot: { emoji: '🥵', mood: 'urgent' },
  help: { emoji: '🆘', mood: 'urgent' },
  please: { emoji: '🙏', mood: 'calm' },
  thanks: { emoji: '🙏', mood: 'calm' },
  bye: { emoji: '👋', mood: 'calm' },
  hello: { emoji: '👋', mood: 'happy' },
  hi: { emoji: '👋', mood: 'happy' },
  yes: { emoji: '👍', mood: 'happy' },
  no: { emoji: '👎', mood: 'sad' },
  more: { emoji: '➕', mood: 'urgent' },
  stop: { emoji: '✋', mood: 'urgent' },
};

type Mood = 'happy' | 'sad' | 'urgent' | 'calm';

type Heard = {
  id: string;
  text: string;
  at: Date;
  mood: Mood;
  emoji: string[];
};

const HISTORY_KEY = 'nurturelink.earbridge.history.v1';
const MOOD_STYLE: Record<Mood, { color: string; label: string; icon: React.ReactNode }> = {
  happy: { color: 'var(--color-success)', label: 'Happy', icon: <Smile className="h-4 w-4" /> },
  sad: { color: 'var(--color-danger)', label: 'Upset', icon: <Frown className="h-4 w-4" /> },
  urgent: { color: 'var(--color-warning)', label: 'Needs something', icon: <AlertCircle className="h-4 w-4" /> },
  calm: { color: 'var(--color-text-muted)', label: 'Calm', icon: <Heart className="h-4 w-4" /> },
};

function detectKeywords(text: string): { emoji: string[]; mood: Mood } {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  const emojis: string[] = [];
  const moodCount: Record<Mood, number> = { happy: 0, sad: 0, urgent: 0, calm: 0 };

  for (const w of words) {
    const hit = EMOTIONAL_KEYWORDS[w];
    if (hit) {
      if (!emojis.includes(hit.emoji)) emojis.push(hit.emoji);
      moodCount[hit.mood]++;
    }
  }

  const sorted = (Object.entries(moodCount) as [Mood, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  const mood: Mood = sorted[0]?.[0] ?? 'calm';
  return { emoji: emojis, mood };
}

export default function EarBridge() {
  const SpeechRecognition = useMemo(getSpeechRecognitionCtor, []);
  const supported = !!SpeechRecognition;

  const profile = loadProfile();
  const recRef = useRef<SpeechRecognitionLite | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [history, setHistory] = useState<Heard[]>(() => loadHistory());
  const [echoing, setEchoing] = useState(false);
  const [networkRetry, setNetworkRetry] = useState(0);
  const [manualText, setManualText] = useState('');
  const retryTimerRef = useRef<number | null>(null);

  useEffect(() => () => recRef.current?.abort(), []);

  function loadHistory(): Heard[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      return (JSON.parse(raw) as Heard[]).map((h) => ({
        ...h,
        at: new Date(h.at),
      }));
    } catch {
      return [];
    }
  }

  function persistHistory(next: Heard[]) {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(next.map((h) => ({ ...h, at: h.at.toISOString() }))),
    );
  }

  const start = useCallback(() => {
    if (!SpeechRecognition) {
      setError(
        'Speech recognition isn\'t supported in this browser. Use Chrome or Edge.',
      );
      return;
    }
    setError(null);
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (e) => {
      let interim = '';
      let finalSeg = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) finalSeg += transcript;
        else interim += transcript;
      }

      if (finalSeg.trim()) {
        const text = finalSeg.trim();
        recordHeard(text);
        setInterimText('');
        setNetworkRetry(0); // success, reset retry counter
        setError(null);
      } else {
        setInterimText(interim);
      }
    };

    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;

      if (e.error === 'network') {
        // Chrome's SpeechRecognition routes audio to Google's servers.
        // Network errors mean the browser can't reach Google. Auto-retry
        // a few times before giving up.
        setNetworkRetry((n) => {
          const next = n + 1;
          if (next <= 3) {
            setError(
              `Chrome's speech service was unreachable (attempt ${next}/3). Retrying...`,
            );
            retryTimerRef.current = window.setTimeout(() => {
              if (listeningRef.current) {
                try {
                  rec.start();
                } catch {
                  /* ignore */
                }
              }
            }, 2000 * next);
          } else {
            setError(
              "Chrome's speech recognition couldn't reach Google's servers (offline or blocked). " +
                'Use the "Type what you heard" field below as a fallback.',
            );
            listeningRef.current = false;
            setListening(false);
          }
          return next;
        });
        return;
      }

      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError(
          'Microphone access denied. Click the lock icon in the address bar and allow microphone.',
        );
        listeningRef.current = false;
        setListening(false);
        return;
      }

      setError(`Speech recognition: ${e.error}`);
    };

    rec.onend = () => {
      if (recRef.current === rec && listeningRef.current) {
        try {
          rec.start();
        } catch {
          /* ignore */
        }
      }
    };

    recRef.current = rec;
    listeningRef.current = true;
    setListening(true);
    rec.start();
  }, [SpeechRecognition]);

  const listeningRef = useRef(false);

  function stop() {
    listeningRef.current = false;
    setListening(false);
    recRef.current?.stop();
    recRef.current = null;
    setInterimText('');
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setNetworkRetry(0);
  }

  function recordHeard(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const { emoji, mood } = detectKeywords(trimmed);
    const entry: Heard = {
      id: crypto.randomUUID(),
      text: trimmed,
      at: new Date(),
      mood,
      emoji,
    };
    setFinalText(trimmed);
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, 30);
      persistHistory(next);
      return next;
    });
  }

  function submitManual() {
    const t = manualText.trim();
    if (!t) return;
    recordHeard(t);
    setManualText('');
    setError(null);
  }

  function clearHistory() {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
    setFinalText('');
  }

  async function echo(text: string) {
    if (!profile) return;
    setEchoing(true);
    setError(null);
    try {
      await speak(text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEchoing(false);
    }
  }

  const live = interimText || finalText;
  const liveMood = live ? detectKeywords(live).mood : 'calm';
  const liveEmoji = live ? detectKeywords(live).emoji : [];

  return (
    <div>
      <PageHeader
        eyebrow="For the parent"
        title="EarBridge"
        description="Your child speaks → you read. Live captions, emotion cues, and an optional AI sign-language avatar for what they said."
      />

      {!supported && (
        <div className="mb-5">
          <ErrorBanner message="Speech recognition needs Chrome or Edge. Firefox / Safari aren't supported yet." />
        </div>
      )}

      {error && (
        <div className="mb-5">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Live captions */}
        <div className="card flex flex-col p-7">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-3 w-3 items-center justify-center rounded-full ${
                  listening ? 'animate-pulse' : ''
                }`}
                style={{
                  background: listening
                    ? 'var(--color-accent)'
                    : 'var(--color-text-subtle)',
                }}
              />
              <span
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {listening ? 'Listening for your child' : 'Not listening'}
              </span>
            </div>
            {live && (
              <MoodPill mood={liveMood} />
            )}
          </div>

          {/* Big caption area */}
          <div
            className="relative flex min-h-[260px] flex-col justify-center rounded-xl border-2 border-dashed p-6"
            style={{
              borderColor: live
                ? MOOD_STYLE[liveMood].color
                : 'var(--color-border)',
              background: live
                ? 'var(--color-bg-elevated)'
                : 'transparent',
            }}
          >
            {liveEmoji.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center justify-center gap-3 text-5xl">
                {liveEmoji.map((e, i) => (
                  <span key={i}>{e}</span>
                ))}
              </div>
            )}

            <div
              className="text-center font-bold leading-snug"
              style={{
                fontSize: live ? '32px' : '17px',
                color: live
                  ? 'var(--color-text-primary)'
                  : 'var(--color-text-subtle)',
                letterSpacing: '-0.02em',
              }}
            >
              {live ||
                (listening
                  ? 'Speak now — caption will appear here in real time.'
                  : 'Tap "Start listening" and ask your child a question.')}
              {interimText && !finalText.includes(interimText) && (
                <span
                  className="opacity-60"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {' '}
                </span>
              )}
            </div>
          </div>

          {/* Action row */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {!listening ? (
              <button onClick={start} className="btn-primary" disabled={!supported}>
                <Mic className="h-4 w-4" />
                Start listening
              </button>
            ) : (
              <button onClick={stop} className="btn-secondary">
                <MicOff className="h-4 w-4" />
                Stop
              </button>
            )}

            {finalText && (
              <>
                <a
                  href={`https://sign.mt/?spl=en&sgn=ase&text=${encodeURIComponent(
                    finalText,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                >
                  <Languages className="h-4 w-4" />
                  Watch in ASL
                  <ExternalLink className="h-3 w-3" />
                </a>
                {profile && (
                  <button
                    className="btn-secondary"
                    disabled={echoing}
                    onClick={() => echo(finalText)}
                  >
                    <Volume2 className="h-4 w-4" />
                    Echo back
                  </button>
                )}
              </>
            )}
          </div>

          {/* Manual fallback — useful when Chrome's speech-to-text can't reach Google */}
          <div className="mt-5">
            <div
              className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <Type className="h-3 w-3" />
              Type what you heard (fallback)
            </div>
            <div className="flex gap-2">
              <input
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitManual();
                }}
                placeholder="e.g. Mama, I'm hungry"
                className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-[14px] outline-none"
                style={{
                  background: 'var(--color-bg-card)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              />
              <button
                onClick={submitManual}
                disabled={!manualText.trim()}
                className="btn-secondary"
              >
                <Send className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
          </div>

          <p
            className="mt-5 text-[12px] leading-relaxed"
            style={{ color: 'var(--color-text-subtle)' }}
          >
            Speech captions use Chrome's speech recognition (which routes audio
            to Google's servers and needs internet). If it fails, type what you
            heard above — emotion detection still works.
          </p>
        </div>

        {/* History */}
        <div className="card flex flex-col overflow-hidden p-0">
          <div
            className="flex items-center justify-between border-b p-5"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-2">
              <Ear className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
              <h3 className="text-[14px] font-bold">What you've heard</h3>
            </div>
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg-elevated)]"
              >
                <Trash2
                  className="h-3.5 w-3.5"
                  style={{ color: 'var(--color-danger)' }}
                />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {history.length === 0 ? (
              <p
                className="px-2 py-6 text-center text-[12px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                What your child says will appear here. Captions are saved on this device only.
              </p>
            ) : (
              <ul className="space-y-2">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="rounded-lg border p-3"
                    style={{
                      borderColor: 'var(--color-border)',
                      background: 'var(--color-bg-elevated)',
                    }}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <MoodPill mood={h.mood} />
                      <span
                        className="text-[10px]"
                        style={{ color: 'var(--color-text-subtle)' }}
                      >
                        {h.at.toLocaleTimeString()}
                      </span>
                    </div>
                    {h.emoji.length > 0 && (
                      <div className="mb-1 text-xl">{h.emoji.join(' ')}</div>
                    )}
                    <div
                      className="text-[14px] font-semibold leading-snug"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {h.text}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <p
        className="mt-8 max-w-3xl text-[12px] leading-relaxed"
        style={{ color: 'var(--color-text-subtle)' }}
      >
        Safety: keyword-based emotion cues are hints, not diagnosis. If your
        child says something distressing, check on them.
      </p>

      {!profile && (
        <div
          className="mt-6 flex items-center gap-3 rounded-xl border p-4 text-[13px]"
          style={{
            background: 'var(--color-accent-soft)',
            borderColor: 'var(--color-accent)',
            color: 'var(--color-accent-text)',
          }}
        >
          <Mic className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Want to "echo back" in your own voice? Set up your voice profile.
          </span>
          <Link to="/voice-setup" className="btn-primary">
            Set up voice
          </Link>
        </div>
      )}
    </div>
  );
}

function MoodPill({ mood }: { mood: Mood }) {
  const style = MOOD_STYLE[mood];
  return (
    <div
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{
        background: 'var(--color-bg-elevated)',
        color: style.color,
        border: `1px solid ${style.color}`,
      }}
    >
      {style.icon}
      <span>{style.label}</span>
    </div>
  );
}
