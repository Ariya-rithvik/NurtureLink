import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HeartHandshake,
  Mic,
  Plus,
  Trash2,
  Activity,
  Pause,
  Play,
  Volume2,
  AlertCircle,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import ErrorBanner from '../components/ErrorBanner';
import ParentAvatar from '../components/ParentAvatar';
import { loadProfile, speak } from '../lib/voiceProfile';
import { analyzeCryOnly } from '../lib/api';

type Phrase = {
  id: string;
  text: string;
};

const DEFAULT_PHRASES: Phrase[] = [
  { id: 'p1', text: 'Shhh, mama is right here. You are safe.' },
  { id: 'p2', text: 'I love you. Breathe with me, sweet baby.' },
  { id: 'p3', text: 'It is okay to feel big feelings. I am with you.' },
];

const PHRASES_KEY = 'nurturelink.calmcue.phrases.v1';
const SAMPLE_MS = 3500;
const COOLDOWN_MS = 12_000;
const RMS_THRESHOLD = 0.025;

type Status =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'detected'; level: number }
  | { kind: 'responding'; phrase: string }
  | { kind: 'cooldown'; until: number };

export default function CalmCue() {
  const profile = loadProfile();
  const [phrases, setPhrases] = useState<Phrase[]>(() => loadPhrases());
  const [newPhrase, setNewPhrase] = useState('');
  const [armed, setArmed] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [eventLog, setEventLog] = useState<
    { at: Date; level: number; phrase: string; cry?: string }[]
  >([]);
  const [liveLevel, setLiveLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const recordingChunks = useRef<BlobPart[]>([]);
  const lastCheckRef = useRef<number>(0);
  const cooldownUntilRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const phraseIndexRef = useRef(0);

  useEffect(() => savePhrases(phrases), [phrases]);

  useEffect(() => () => stopListening(), []);

  function loadPhrases(): Phrase[] {
    try {
      const raw = localStorage.getItem(PHRASES_KEY);
      if (raw) return JSON.parse(raw) as Phrase[];
    } catch {
      /* ignore */
    }
    return DEFAULT_PHRASES;
  }
  function savePhrases(list: Phrase[]) {
    localStorage.setItem(PHRASES_KEY, JSON.stringify(list));
  }

  async function startListening() {
    if (!profile) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;

      setArmed(true);
      setStatus({ kind: 'listening' });
      tick();
    } catch (e) {
      setError(`Mic error: ${(e as Error).message}`);
    }
  }

  function stopListening() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    setArmed(false);
    setStatus({ kind: 'idle' });
    setLiveLevel(0);
  }

  function tick() {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    setLiveLevel(rms);

    const now = performance.now();
    if (now < cooldownUntilRef.current) {
      // Still cooling down
      setStatus({ kind: 'cooldown', until: cooldownUntilRef.current });
    } else if (
      rms > RMS_THRESHOLD &&
      now - lastCheckRef.current > 1500 &&
      !recRef.current
    ) {
      lastCheckRef.current = now;
      setStatus({ kind: 'detected', level: rms });
      captureAndDecide(rms);
    } else if (status.kind === 'cooldown' || status.kind === 'detected') {
      setStatus({ kind: 'listening' });
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  async function captureAndDecide(level: number) {
    const stream = streamRef.current;
    if (!stream) return;

    try {
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recRef.current = rec;
      recordingChunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordingChunks.current.push(e.data);
      };

      const stopPromise = new Promise<Blob>((resolve) => {
        rec.onstop = () =>
          resolve(new Blob(recordingChunks.current, { type: mime }));
      });

      rec.start();
      await new Promise((r) => setTimeout(r, SAMPLE_MS));
      rec.stop();
      const blob = await stopPromise;
      recRef.current = null;

      let cryLabel: string | undefined;
      try {
        const cry = await analyzeCryOnly(blob);
        if (cry.confidence > 0.35) cryLabel = cry.top_label;
      } catch {
        /* not a baby cry — fall through and respond anyway */
      }

      respond(level, cryLabel);
    } catch (e) {
      setError(`Capture error: ${(e as Error).message}`);
      recRef.current = null;
    }
  }

  async function respond(level: number, cryLabel?: string) {
    if (phrases.length === 0) return;
    const phrase = pickNextPhrase(cryLabel);
    setStatus({ kind: 'responding', phrase: phrase.text });
    setEventLog((log) => [
      { at: new Date(), level, phrase: phrase.text, cry: cryLabel },
      ...log.slice(0, 19),
    ]);
    try {
      await speak(phrase.text);
    } catch (e) {
      setError(`Voice playback failed: ${(e as Error).message}`);
    }
    cooldownUntilRef.current = performance.now() + COOLDOWN_MS;
  }

  function pickNextPhrase(cryLabel?: string): Phrase {
    // Try to match cry context to phrase keywords first.
    if (cryLabel) {
      const lowered = cryLabel.toLowerCase();
      const matched = phrases.find((p) =>
        p.text.toLowerCase().includes(lowered),
      );
      if (matched) return matched;
    }
    const next = phrases[phraseIndexRef.current % phrases.length];
    phraseIndexRef.current += 1;
    return next;
  }

  function addPhrase() {
    const text = newPhrase.trim();
    if (!text) return;
    setPhrases((p) => [{ id: crypto.randomUUID(), text }, ...p]);
    setNewPhrase('');
  }

  function removePhrase(id: string) {
    setPhrases((p) => p.filter((x) => x.id !== id));
  }

  async function previewPhrase(phrase: string) {
    try {
      await speak(phrase);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!profile) return <NeedsProfile />;

  return (
    <div>
      <PageHeader
        eyebrow="For the child"
        title="CalmCue"
        description="When your child cries, CalmCue plays your soothing voice automatically. For the seconds you can't be there fast enough."
      />

      {error && (
        <div className="mb-5">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_1fr]">
        {/* Monitor */}
        <div className="card overflow-hidden p-0">
          <div
            className="border-b p-6"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="mb-5 flex justify-center">
              <ParentAvatar profile={profile} size={120} />
            </div>

            <StatusPill status={status} />

            <div className="mt-5">
              <Meter level={liveLevel} active={armed} />
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              {!armed ? (
                <button onClick={startListening} className="btn-primary">
                  <Activity className="h-4 w-4" />
                  Start listening
                </button>
              ) : (
                <button onClick={stopListening} className="btn-secondary">
                  <Pause className="h-4 w-4" />
                  Stop
                </button>
              )}
            </div>
          </div>

          {/* Event log */}
          <div className="p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[14px] font-bold">Recent comfort events</h3>
              <span
                className="text-[11px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {eventLog.length} this session
              </span>
            </div>
            {eventLog.length === 0 ? (
              <p
                className="text-[12px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                CalmCue logs every time it responds. Nothing yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {eventLog.map((e, i) => (
                  <li
                    key={i}
                    className="rounded-lg border px-3 py-2 text-[12px]"
                    style={{
                      borderColor: 'var(--color-border)',
                      background: 'var(--color-bg-elevated)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="font-semibold"
                        style={{ color: 'var(--color-accent-text)' }}
                      >
                        {e.cry ? `Cry: ${e.cry}` : 'Distress sound'}
                      </span>
                      <span
                        className="text-[10px]"
                        style={{ color: 'var(--color-text-subtle)' }}
                      >
                        {e.at.toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="mt-0.5 italic">"{e.phrase}"</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Phrase library */}
        <div className="card overflow-hidden p-0">
          <div
            className="border-b p-5"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <h3 className="text-[15px] font-bold">Your soothing phrases</h3>
            <p
              className="mt-1 text-[12px]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              These are what your child hears in your voice when CalmCue
              responds. Add your real words.
            </p>
          </div>

          <div className="p-5">
            <div className="mb-4 flex gap-2">
              <input
                value={newPhrase}
                onChange={(e) => setNewPhrase(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addPhrase();
                }}
                placeholder="It's okay, mama is here..."
                className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-[13px] outline-none"
                style={{
                  background: 'var(--color-bg-card)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              />
              <button onClick={addPhrase} className="btn-primary">
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>

            <ul className="space-y-2">
              {phrases.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start gap-2 rounded-lg border p-3"
                  style={{
                    borderColor: 'var(--color-border)',
                    background: 'var(--color-bg-elevated)',
                  }}
                >
                  <span className="min-w-0 flex-1 text-[13px]">{p.text}</span>
                  <button
                    onClick={() => previewPhrase(p.text)}
                    className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--color-accent-soft)]"
                    title="Preview"
                  >
                    <Play
                      className="h-3.5 w-3.5"
                      style={{ color: 'var(--color-accent)' }}
                    />
                  </button>
                  <button
                    onClick={() => removePhrase(p.id)}
                    className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[color-mix(in_oklch,var(--color-danger)_15%,transparent)]"
                    title="Remove"
                  >
                    <Trash2
                      className="h-3.5 w-3.5"
                      style={{ color: 'var(--color-danger)' }}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <p
        className="mt-8 max-w-3xl text-[12px] leading-relaxed"
        style={{ color: 'var(--color-text-subtle)' }}
      >
        Safety: CalmCue is for the seconds before you can be there in person —
        not a replacement. Always check on your child if distress continues.
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  let label: string;
  let color: string;
  let icon = <Activity className="h-3.5 w-3.5" />;

  switch (status.kind) {
    case 'idle':
      label = 'Not listening';
      color = 'var(--color-text-muted)';
      icon = <Pause className="h-3.5 w-3.5" />;
      break;
    case 'listening':
      label = 'Listening for your child';
      color = 'var(--color-success)';
      break;
    case 'detected':
      label = 'Distress detected — checking...';
      color = 'var(--color-warning)';
      icon = <AlertCircle className="h-3.5 w-3.5" />;
      break;
    case 'responding':
      label = `Soothing: "${status.phrase.slice(0, 40)}${status.phrase.length > 40 ? '...' : ''}"`;
      color = 'var(--color-accent)';
      icon = <Volume2 className="h-3.5 w-3.5" />;
      break;
    case 'cooldown':
      label = 'Letting the moment settle...';
      color = 'var(--color-text-muted)';
      break;
  }

  return (
    <div
      className="mx-auto flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold"
      style={{
        background: 'var(--color-bg-elevated)',
        borderColor: 'var(--color-border)',
        color,
      }}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

function Meter({ level, active }: { level: number; active: boolean }) {
  const pct = Math.min(1, level * 12);
  return (
    <div className="mx-auto max-w-xs">
      <div className="mb-1 flex justify-between text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
        <span>Sound level</span>
        <span>{active ? 'Live' : 'Off'}</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--color-bg-elevated)' }}
      >
        <div
          className="h-full transition-[width] duration-100"
          style={{
            width: `${Math.round(pct * 100)}%`,
            background: pct > RMS_THRESHOLD * 12
              ? 'var(--color-warning)'
              : 'var(--color-accent)',
          }}
        />
      </div>
    </div>
  );
}

function NeedsProfile() {
  return (
    <div>
      <PageHeader title="CalmCue" description="Comfort in your voice — automatically." />
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
          CalmCue plays your real voice. Quick setup first.
        </p>
        <Link to="/voice-setup" className="btn-primary mt-2">
          <Mic className="h-4 w-4" />
          Set up voice
        </Link>
      </div>
    </div>
  );
}

// Expose for sidebar icon import
export { HeartHandshake };
