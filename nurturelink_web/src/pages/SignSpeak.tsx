import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Camera,
  Hand,
  Mic,
  RotateCw,
  Volume2,
  Zap,
  Brain,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import ErrorBanner from '../components/ErrorBanner';
import Spinner from '../components/Spinner';
import ParentAvatar from '../components/ParentAvatar';
import { loadProfile, speak } from '../lib/voiceProfile';
import { analyzeSign, type SignResult } from '../lib/api';
import { captureFrame, startCamera } from '../lib/recorder';
import {
  createHandTracker,
  type DetectedHand,
  type HandTracker,
  type Landmark,
} from '../lib/handTracker';
import {
  classifyGesture,
  spokenFor,
  type SignWord,
} from '../lib/signClassifier';

const VOCAB = [
  'hello',
  'mama',
  'papa',
  'i love you',
  'food',
  'water',
  'sleep',
  'story',
  'hug',
  'yes',
  'no',
  'more',
  'stop',
  'please',
  'thank you',
  'help',
  'play',
  'happy',
];

type Turn = {
  word: SignWord | string;
  spoken: string;
  confidence: number;
  at: Date;
  source: 'live' | 'gemma';
};

const HOLD_MS = 1000; // hold the same gesture this long before triggering speech
const COOLDOWN_MS = 2500;

export default function SignSpeak() {
  const [profile] = useState(() => loadProfile());

  // Camera
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStopRef = useRef<(() => void) | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [trackerReady, setTrackerReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live detection state
  const [currentWord, setCurrentWord] = useState<SignWord>('unclear');
  const [currentConfidence, setCurrentConfidence] = useState(0);
  const [currentReason, setCurrentReason] = useState('');
  const stableSinceRef = useRef<{ word: SignWord; at: number } | null>(null);
  const lastSpokeRef = useRef<{ word: SignWord; at: number } | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    (async () => {
      try {
        const { stream, stop } = await startCamera('user');
        if (cancelled) {
          stop();
          return;
        }
        cameraStopRef.current = stop;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await new Promise<void>((res) => {
          v.onloadedmetadata = () => res();
        });
        await v.play();
        setCameraReady(true);

        // Start hand tracker
        try {
          const tracker = await createHandTracker((hands) => {
            handleHands(hands);
            drawSkeleton(hands);
          });
          if (cancelled) {
            await tracker.stop();
            return;
          }
          trackerRef.current = tracker;
          await tracker.start(v);
          setTrackerReady(true);
        } catch (e) {
          setError(
            'Hand tracker failed to load (' +
              (e as Error).message +
              '). You can still use Deep analysis below.',
          );
        }
      } catch (e) {
        setError(`Camera: ${(e as Error).message}`);
      }
    })();

    return () => {
      cancelled = true;
      trackerRef.current?.stop().catch(() => undefined);
      cameraStopRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleHands(hands: DetectedHand[]) {
    const { word, confidence, reason } = classifyGesture(hands);
    setCurrentWord(word);
    setCurrentConfidence(confidence);
    setCurrentReason(reason);

    const now = performance.now();

    if (word === 'unclear' || confidence < 0.5) {
      stableSinceRef.current = null;
      setHoldProgress(0);
      return;
    }

    const stable = stableSinceRef.current;
    if (!stable || stable.word !== word) {
      stableSinceRef.current = { word, at: now };
      setHoldProgress(0);
      return;
    }

    const elapsed = now - stable.at;
    setHoldProgress(Math.min(1, elapsed / HOLD_MS));

    if (elapsed >= HOLD_MS) {
      // Avoid repeating the same word too quickly
      const lastSpoken = lastSpokeRef.current;
      if (
        !lastSpoken ||
        lastSpoken.word !== word ||
        now - lastSpoken.at > COOLDOWN_MS
      ) {
        lastSpokeRef.current = { word, at: now };
        speakWord(word, confidence);
      }
      stableSinceRef.current = null;
      setHoldProgress(0);
    }
  }

  async function speakWord(word: SignWord, confidence: number) {
    const text = spokenFor(word);
    if (!text) return;
    setTurns((prev) => [
      {
        word,
        spoken: text,
        confidence,
        at: new Date(),
        source: 'live' as const,
      },
      ...prev,
    ]);
    try {
      await speak(text);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function drawSkeleton(hands: DetectedHand[]) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth || 640;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight || 480;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const connections: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20],
      [0, 17],
    ];

    const accent = getComputedStyle(document.body)
      .getPropertyValue('--color-accent')
      .trim() || '#D97757';

    for (const h of hands) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const [a, b] of connections) {
        const pa = h.landmarks[a];
        const pb = h.landmarks[b];
        ctx.moveTo(pa.x * canvas.width, pa.y * canvas.height);
        ctx.lineTo(pb.x * canvas.width, pb.y * canvas.height);
      }
      ctx.stroke();

      ctx.fillStyle = accent;
      for (const p of h.landmarks) {
        ctx.beginPath();
        ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  async function deepAnalyze() {
    const v = videoRef.current;
    if (!v) return;
    setReading(true);
    setError(null);
    try {
      const frame = await captureFrame(v);
      const result: SignResult = await analyzeSign(frame.blob);
      setTurns((prev) => [
        {
          word: result.recognized_sign,
          spoken: result.spoken_text,
          confidence: result.confidence,
          at: new Date(),
          source: 'gemma' as const,
        },
        ...prev,
      ]);
      if (
        result.recognized_sign !== 'unclear' &&
        result.spoken_text
      ) {
        await speak(result.spoken_text);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  }

  async function replay(text: string) {
    if (!text) return;
    try {
      await speak(text);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!profile) return <NeedsProfile />;

  const showStatus = currentWord !== 'unclear' && currentConfidence >= 0.5;

  return (
    <div>
      <PageHeader
        eyebrow="Communicate"
        title="SignSpeak"
        description="Real-time hand tracking. Hold a sign for one second and it speaks in your voice. No 60-second wait."
      />

      {error && (
        <div className="mb-5">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Camera card */}
        <div className="card overflow-hidden p-0">
          <div className="relative aspect-[4/3] w-full bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full -scale-x-100"
            />

            {/* Live status overlay */}
            {showStatus && (
              <div
                className="absolute left-3 top-3 rounded-xl border-2 px-4 py-2.5 backdrop-blur-md"
                style={{
                  background: 'rgba(0,0,0,0.55)',
                  borderColor: 'var(--color-accent)',
                }}
              >
                <div
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--color-accent)' }}
                >
                  Detected
                </div>
                <div className="text-[20px] font-black text-white">
                  {currentWord}
                </div>
                <div className="text-[10px] text-white/70">
                  {Math.round(currentConfidence * 100)}% · {currentReason}
                </div>
                <div
                  className="mt-2 h-1 w-32 overflow-hidden rounded-full"
                  style={{ background: 'rgba(255,255,255,0.18)' }}
                >
                  <div
                    className="h-full transition-[width] duration-100"
                    style={{
                      width: `${Math.round(holdProgress * 100)}%`,
                      background: 'var(--color-accent)',
                    }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-white/60">
                  Hold {Math.max(0, Math.ceil((1 - holdProgress) * 1))}s to speak
                </div>
              </div>
            )}

            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center text-white/60">
                Camera loading...
              </div>
            )}
            {cameraReady && !trackerReady && (
              <div
                className="absolute bottom-3 left-3 rounded-full px-3 py-1.5 text-[11px] backdrop-blur-md"
                style={{ background: 'rgba(0,0,0,0.55)', color: 'white' }}
              >
                <Spinner size={12} /> &nbsp; Loading hand tracker...
              </div>
            )}
          </div>

          {/* Mode indicator + manual fallback */}
          <div
            className="flex flex-wrap items-center gap-3 border-t px-5 py-4"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div
              className="flex items-center gap-1.5 text-[12px] font-medium"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <Zap
                className="h-3.5 w-3.5"
                style={{ color: 'var(--color-accent)' }}
              />
              <span>Live mode · ~30fps · instant</span>
            </div>
            <div
              className="flex items-center gap-1.5 text-[12px]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <Volume2 className="h-3.5 w-3.5" />
              <span>Speaks as {profile.displayName}</span>
            </div>
            <div className="flex-1" />
            <button
              onClick={deepAnalyze}
              disabled={!cameraReady || reading}
              className="btn-secondary"
              title="Send the current frame to Gemma for a careful interpretation (slow)"
            >
              {reading ? (
                <Spinner size={14} />
              ) : (
                <Brain className="h-4 w-4" />
              )}
              {reading ? 'Gemma reading... (≈60s)' : 'Deep analysis'}
            </button>
          </div>
        </div>

        {/* Right column: avatar + vocab + history */}
        <div className="flex flex-col gap-5">
          <div className="card flex flex-col items-center p-5">
            <ParentAvatar profile={profile} size={110} />
          </div>

          <div className="card p-5">
            <h3 className="text-[14px] font-bold">Vocabulary</h3>
            <p
              className="mt-1 text-[12px]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Hold any of these for 1 second — instant.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {VOCAB.map((v) => (
                <span
                  key={v}
                  className={`chip ${
                    currentWord === v && currentConfidence >= 0.5
                      ? 'chip-accent'
                      : ''
                  }`}
                >
                  {v}
                </span>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="text-[14px] font-bold">Recent</h3>
            {turns.length === 0 ? (
              <p
                className="mt-2 text-[12px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Hold a sign for 1 second to speak it.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {turns.slice(0, 8).map((t, i) => (
                  <TurnRow key={i} turn={t} onReplay={() => replay(t.spoken)} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TurnRow({
  turn,
  onReplay,
}: {
  turn: Turn;
  onReplay: () => void;
}) {
  const isUnclear = turn.word === 'unclear';
  return (
    <li>
      <div
        className="flex items-start gap-2 rounded-lg border p-3"
        style={{
          borderColor: isUnclear ? 'var(--color-border)' : 'var(--color-accent)',
          background: isUnclear
            ? 'var(--color-bg-elevated)'
            : 'var(--color-accent-soft)',
        }}
      >
        <div className="min-w-0 flex-1">
          <div
            className="text-[14px] font-bold"
            style={{
              color: isUnclear
                ? 'var(--color-text-muted)'
                : 'var(--color-accent-text)',
            }}
          >
            {turn.spoken || turn.word}
          </div>
          <div
            className="text-[11px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {turn.source === 'live' ? (
              <span className="inline-flex items-center gap-1">
                <Zap className="h-2.5 w-2.5" /> live · {turn.word}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Brain className="h-2.5 w-2.5" /> Gemma · {turn.word}
              </span>
            )}
            {' · '}
            {Math.round(turn.confidence * 100)}% ·{' '}
            {turn.at.toLocaleTimeString()}
          </div>
        </div>
        {!isUnclear && (
          <button
            onClick={onReplay}
            className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-white/40"
          >
            <RotateCw
              className="h-3.5 w-3.5"
              style={{ color: 'var(--color-accent)' }}
            />
          </button>
        )}
      </div>
    </li>
  );
}

function NeedsProfile() {
  return (
    <div>
      <PageHeader title="SignSpeak" description="Sign language to spoken voice." />
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
          SignSpeak speaks in your voice. Quick setup first.
        </p>
        <Link to="/voice-setup" className="btn-primary mt-2">
          <Camera className="h-4 w-4" />
          <Mic className="h-4 w-4" />
          Set up voice
        </Link>
      </div>
    </div>
  );
}

// Avoid an "unused" warning for the Landmark import used implicitly via DetectedHand
export type { Landmark };
