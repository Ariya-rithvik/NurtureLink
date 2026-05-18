import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Volume2,
  Backpack,
  Eraser,
  HelpCircle,
  Mic,
  Hand,
  Eye,
  EyeOff,
  Sparkles,
  KeyRound,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import ErrorBanner from '../components/ErrorBanner';
import InfoBanner from '../components/InfoBanner';
import Spinner from '../components/Spinner';
import ParentAvatar from '../components/ParentAvatar';
import SignAvatarPanel from '../components/SignAvatarPanel';
import EyeCalibration from '../components/EyeCalibration';
import GeminiKeyDialog from '../components/GeminiKeyDialog';
import { loadProfile, speak } from '../lib/voiceProfile';
import {
  startEyeTracker,
  stopEyeTracker,
  isEyeTrackerSupported,
} from '../lib/eyeTracker';
import { startCamera, captureFrame } from '../lib/recorder';
import {
  guessGazeFromImage,
  hasGeminiKey,
  type GazeGuess,
} from '../lib/geminiClient';
import {
  createFaceTracker,
  type FaceTracker,
  type GazeMode,
  type GazeVector,
} from '../lib/faceTracker';

const PHRASES: string[][] = [
  ['I love you', 'I am here', 'Thank you'],
  ['Story time', 'Sing a song', 'Look at me'],
  ['Water please', 'Food please', 'Sleep now'],
  ['Yes', 'No', 'Maybe'],
];

const DWELL_MS = 1500;

type Gaze = { x: number; y: number } | null;

export default function EyeBridge() {
  const [profile] = useState(() => loadProfile());
  const [sentence, setSentence] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signText, setSignText] = useState('');
  const [hovered, setHovered] = useState<{ row: number; col: number } | null>(null);
  const [progress, setProgress] = useState(0);

  // Eye tracking state
  const [eyeMode, setEyeMode] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [gaze, setGaze] = useState<Gaze>(null);

  // Gemini gaze mode state
  const [geminiMode, setGeminiMode] = useState(false);
  const [geminiBusy, setGeminiBusy] = useState(false);
  const [geminiGuess, setGeminiGuess] = useState<GazeGuess | null>(null);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [hasKey, setHasKey] = useState(() => hasGeminiKey());
  const geminiVideoRef = useRef<HTMLVideoElement | null>(null);
  const geminiCameraStopRef = useRef<(() => void) | null>(null);
  const geminiLoopRef = useRef<number | null>(null);

  const timerRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const tilesRef = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const handler = () => setHasKey(hasGeminiKey());
    window.addEventListener('gemini:keyChanged', handler);
    return () => window.removeEventListener('gemini:keyChanged', handler);
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
      stopEyeTracker();
    };
  }, []);

  function cleanup() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  // -------- MediaPipe Face Landmarker (free, in-browser) --------
  const faceTrackerRef = useRef<FaceTracker | null>(null);
  const faceCameraStopRef = useRef<(() => void) | null>(null);
  const faceVideoRef = useRef<HTMLVideoElement | null>(null);
  const [faceMode, setFaceMode] = useState(false);
  const [faceLoading, setFaceLoading] = useState(false);
  const [latestGazeVec, setLatestGazeVec] = useState<GazeVector | null>(null);
  const [gazeKind, setGazeKind] = useState<GazeMode>('head');

  function enableEyeTracker() {
    if (!isEyeTrackerSupported()) {
      setError('Webcam eye tracking needs Chrome or Edge with camera access.');
      return;
    }
    setError(null);
    setFaceMode(true);
  }

  function disableEyeTracker() {
    setFaceMode(false);
    faceTrackerRef.current?.stop().catch(() => undefined);
    faceTrackerRef.current = null;
    faceCameraStopRef.current?.();
    faceCameraStopRef.current = null;
    setLatestGazeVec(null);
    setEyeMode(false);
    setCalibrating(false);
    setGaze(null);
    reset();
  }

  // Boot the face tracker once faceMode is on.
  useEffect(() => {
    if (!faceMode) return;
    let cancelled = false;
    setFaceLoading(true);

    (async () => {
      try {
        const { stream, stop } = await startCamera('user');
        if (cancelled) {
          stop();
          return;
        }
        faceCameraStopRef.current = stop;
        const v = faceVideoRef.current;
        if (!v) throw new Error('Face video element did not mount.');
        v.srcObject = stream;
        await new Promise<void>((res) => {
          v.onloadedmetadata = () => res();
        });
        await v.play();

        const tracker = createFaceTracker();
        faceTrackerRef.current = tracker;
        tracker.setMode(gazeKind);
        await tracker.start(v, (g) => {
          if (cancelled) return;
          setLatestGazeVec(g);

          // Convert gaze vector (-1..1) to screen coords inside the grid area.
          const gridEl =
            tilesRef.current['0-0']?.parentElement?.parentElement ?? document.body;
          const r = gridEl.getBoundingClientRect();
          const cx = r.left + r.width / 2 + (g.x * r.width) / 2;
          const cy = r.top + r.height / 2 + (g.y * r.height) / 2;
          setGaze({ x: cx, y: cy });
          if (g.confidence > 0.25) evaluateGazeHit(cx, cy);
        });

        if (!cancelled) {
          setEyeMode(true);
          setFaceLoading(false);
        }
      } catch (e) {
        if (cancelled) return;
        setError(
          `Couldn't start face tracker: ${(e as Error).message}. Mouse hover still works.`,
        );
        setFaceMode(false);
        setFaceLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceMode]);

  function enableGeminiMode() {
    if (!hasKey) {
      setShowKeyDialog(true);
      return;
    }
    setError(null);
    // Setting state first causes the video element to mount.
    // The useEffect below then attaches the camera and starts the loop.
    setGeminiMode(true);
  }

  // Camera + loop lifecycle. Runs once the <video> element has mounted.
  useEffect(() => {
    if (!geminiMode) return;
    let cancelled = false;

    (async () => {
      try {
        const { stream, stop } = await startCamera('user');
        if (cancelled) {
          stop();
          return;
        }
        geminiCameraStopRef.current = stop;
        const v = geminiVideoRef.current;
        if (!v) throw new Error('Video element did not mount.');
        v.srcObject = stream;
        await new Promise<void>((res) => {
          v.onloadedmetadata = () => res();
        });
        await v.play();
        if (cancelled) return;
        runGeminiLoop();
      } catch (e) {
        if (cancelled) return;
        setError(`Couldn't start AI gaze: ${(e as Error).message}`);
        setGeminiMode(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geminiMode]);

  function disableGeminiMode() {
    if (geminiLoopRef.current) {
      clearTimeout(geminiLoopRef.current);
      geminiLoopRef.current = null;
    }
    geminiCameraStopRef.current?.();
    geminiCameraStopRef.current = null;
    setGeminiMode(false);
    setGeminiBusy(false);
    setGeminiGuess(null);
    reset();
  }

  function runGeminiLoop() {
    // Recursive setTimeout — runs one detection then schedules the next.
    async function tick() {
      const v = geminiVideoRef.current;
      if (!v) return;
      setGeminiBusy(true);
      try {
        const frame = await captureFrame(v, 480);
        const guess = await guessGazeFromImage(frame.blob, PHRASES);
        setGeminiGuess(guess);
        if (guess.row >= 0 && guess.col >= 0 && guess.confidence > 0.4) {
          // Treat the Gemini-picked tile the same way as a hover.
          onEnter(guess.row, guess.col);
        }
      } catch (e) {
        setError(`Gemini gaze: ${(e as Error).message}`);
      } finally {
        setGeminiBusy(false);
        geminiLoopRef.current = window.setTimeout(tick, 2500);
      }
    }
    tick();
  }

  useEffect(() => {
    return () => {
      if (geminiLoopRef.current) clearTimeout(geminiLoopRef.current);
      geminiCameraStopRef.current?.();
    };
  }, []);

  // Hit-test gaze position against tile bounding boxes.
  // Sticky behaviour: the *currently hovered* tile has its hit-box expanded
  // by `STICKY_PAD` so micro-jitter from the gaze tracker doesn't drop the
  // dwell progress. Only switch tiles when the gaze is firmly inside a
  // different tile's normal box.
  function evaluateGazeHit(x: number, y: number) {
    if (calibrating) return;

    const STICKY_PAD = 28; // px — how far the cursor can drift outside the
    // hovered tile before we abandon the dwell.

    let firmHit: { row: number; col: number } | null = null;
    let stickyKeepHover = false;

    for (let r = 0; r < PHRASES.length; r++) {
      for (let c = 0; c < PHRASES[r].length; c++) {
        const el = tilesRef.current[`${r}-${c}`];
        if (!el) continue;
        const rect = el.getBoundingClientRect();

        const inside =
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom;

        if (inside && !firmHit) {
          firmHit = { row: r, col: c };
        }

        // Sticky: if this is the hovered tile, allow padded box to keep it.
        if (
          hovered &&
          hovered.row === r &&
          hovered.col === c &&
          x >= rect.left - STICKY_PAD &&
          x <= rect.right + STICKY_PAD &&
          y >= rect.top - STICKY_PAD &&
          y <= rect.bottom + STICKY_PAD
        ) {
          stickyKeepHover = true;
        }
      }
    }

    if (firmHit) {
      if (hovered?.row !== firmHit.row || hovered?.col !== firmHit.col) {
        onEnter(firmHit.row, firmHit.col);
      }
      // else: same tile, RAF tick is already running — do nothing.
    } else if (stickyKeepHover) {
      // Hold the dwell — gaze is in the sticky pad around the hovered tile.
    } else if (hovered) {
      reset();
    }
  }

  function onEnter(row: number, col: number) {
    cleanup();
    setHovered({ row, col });
    startRef.current = performance.now();
    setProgress(0);

    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      const p = Math.min(1, elapsed / DWELL_MS);
      setProgress(p);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    timerRef.current = window.setTimeout(() => {
      const phrase = PHRASES[row][col];
      setSentence((s) => (s ? `${s} ${phrase}` : phrase));
      reset();
    }, DWELL_MS);
  }

  function onLeave(row: number, col: number) {
    if (hovered?.row === row && hovered?.col === col) {
      reset();
    }
  }

  function reset() {
    cleanup();
    setHovered(null);
    setProgress(0);
  }

  async function handleSpeak() {
    if (!sentence.trim() || !profile) return;
    setSpeaking(true);
    setError(null);
    try {
      await speak(sentence);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSpeaking(false);
    }
  }

  function backspaceWord() {
    const trimmed = sentence.trimEnd();
    const idx = trimmed.lastIndexOf(' ');
    setSentence(idx < 0 ? '' : trimmed.slice(0, idx));
  }

  if (!profile) {
    return <NeedsProfile />;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Communicate"
        title="EyeBridge"
        description={
          eyeMode
            ? 'Eye tracking on. Look at a tile for 1.5 seconds to select it.'
            : 'Hover over a tile for 1.5 seconds to select it. Turn on eye tracking to control with your gaze.'
        }
        action={
          <div className="flex flex-wrap gap-2">
            {!eyeMode && !geminiMode && (
              <>
                <button onClick={enableEyeTracker} className="btn-secondary">
                  <Eye className="h-4 w-4" />
                  Use eyes
                </button>
                <button
                  onClick={enableGeminiMode}
                  className="btn-primary"
                  title="Let Gemini watch your face and pick tiles"
                >
                  <Sparkles className="h-4 w-4" />
                  AI gaze (Gemini)
                </button>
                <button
                  onClick={() => setShowKeyDialog(true)}
                  className="btn-secondary"
                  title="Set Gemini API key"
                >
                  <KeyRound className="h-4 w-4" />
                </button>
              </>
            )}
            {eyeMode && (
              <>
                <button
                  onClick={() => setCalibrating(true)}
                  className="btn-secondary"
                >
                  <Eye className="h-4 w-4" />
                  Recalibrate
                </button>
                <button onClick={disableEyeTracker} className="btn-secondary">
                  <EyeOff className="h-4 w-4" />
                  Use mouse
                </button>
              </>
            )}
            {geminiMode && (
              <button onClick={disableGeminiMode} className="btn-secondary">
                <EyeOff className="h-4 w-4" />
                Stop AI gaze
              </button>
            )}
            <a
              href="#help"
              className="btn-secondary"
              onClick={(e) => {
                e.preventDefault();
                alert(
                  'Three input modes:\n\n' +
                    '1. Mouse hover (default) — 1.5s hover selects.\n' +
                    '2. Use eyes — webcam + WebGazer with 9-point calibration.\n' +
                    '3. AI gaze (Gemini) — every 2.5s Gemini watches you and picks a tile.\n\n' +
                    'Mouse and AI gaze are most reliable.',
                );
              }}
            >
              <HelpCircle className="h-4 w-4" />
              How
            </a>
          </div>
        }
      />

      {error && (
        <div className="mb-5">
          {error.startsWith('Webcam eye tracking is unavailable') ||
          error.startsWith('Webcam eye tracking needs') ? (
            <InfoBanner message={error} />
          ) : (
            <ErrorBanner message={error} />
          )}
        </div>
      )}

      {/* Sentence bar + avatar */}
      <div className="card mb-5 flex items-center gap-5 p-5">
        <ParentAvatar profile={profile} size={84} showLabel={false} />
        <div className="min-w-0 flex-1">
          <div
            className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <Volume2 className="h-3 w-3" />
            <span>{profile.parentName || 'You'} · {profile.displayName}</span>
          </div>
          <div
            className="min-h-[28px] text-[20px] font-bold leading-tight"
            style={{ color: sentence ? 'var(--color-text-primary)' : 'var(--color-text-subtle)' }}
          >
            {sentence || 'Your sentence will appear here...'}
          </div>
        </div>

        {/* Gemini gaze mini-preview (always rendered when geminiMode is on,
            hidden on narrow viewports so the sentence bar doesn't overflow) */}
        {geminiMode && (
          <div
            className="shrink-0 overflow-hidden rounded-xl border"
            style={{ borderColor: 'var(--color-accent)' }}
          >
            <video
              ref={geminiVideoRef}
              playsInline
              muted
              className="block h-20 w-28 -scale-x-100 object-cover"
            />
            <div
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold"
              style={{ background: 'var(--color-accent)', color: 'white' }}
            >
              <Sparkles className="h-3 w-3" />
              {geminiBusy ? 'Thinking...' : 'AI gaze'}
            </div>
          </div>
        )}
      </div>

      {/* Gemini status strip */}
      {geminiMode && (
        <div
          className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 text-[12px]"
          style={{
            background: 'var(--color-accent-soft)',
            borderColor: 'var(--color-accent)',
            color: 'var(--color-accent-text)',
          }}
        >
          <Sparkles
            className={`h-3.5 w-3.5 ${geminiBusy ? 'animate-pulse' : ''}`}
          />
          {!geminiGuess && geminiBusy && (
            <span className="font-semibold">Sending first frame to Gemini...</span>
          )}
          {!geminiGuess && !geminiBusy && (
            <span className="font-semibold">
              Camera started. First Gemini guess coming in ~2.5s...
            </span>
          )}
          {geminiGuess && (
            <>
              <span className="font-semibold">
                {geminiBusy ? 'Re-checking... ' : ''}
                Gemini guess:{' '}
                {geminiGuess.row >= 0 && geminiGuess.col >= 0
                  ? `"${PHRASES[geminiGuess.row][geminiGuess.col]}"`
                  : 'no clear gaze'}
              </span>
              <span style={{ color: 'var(--color-text-muted)' }}>
                · {Math.round(geminiGuess.confidence * 100)}% confidence
              </span>
              {geminiGuess.reason && (
                <span
                  className="italic"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  · {geminiGuess.reason}
                </span>
              )}
            </>
          )}
        </div>
      )}

      {/* Phrase grid */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        {PHRASES.map((row, r) =>
          row.map((phrase, c) => {
            const isActive = hovered?.row === r && hovered?.col === c;
            return (
              <button
                key={`${r}-${c}`}
                ref={(el) => {
                  tilesRef.current[`${r}-${c}`] = el;
                }}
                onMouseEnter={() => !eyeMode && onEnter(r, c)}
                onMouseLeave={() => !eyeMode && onLeave(r, c)}
                onClick={() => onEnter(r, c)}
                className="card relative flex aspect-[1.4/1] items-center justify-center overflow-hidden p-4 text-[17px] font-bold transition-all"
                style={{
                  borderColor: isActive
                    ? 'var(--color-accent)'
                    : 'var(--color-border)',
                  background: isActive
                    ? 'var(--color-accent-soft)'
                    : 'var(--color-bg-card)',
                  color: isActive
                    ? 'var(--color-accent-text)'
                    : 'var(--color-text-primary)',
                  boxShadow: isActive
                    ? '0 0 0 4px color-mix(in oklch, var(--color-accent) 15%, transparent)'
                    : 'none',
                }}
              >
                {isActive && (
                  <DwellRing progress={progress} />
                )}
                <span className="relative z-10">{phrase}</span>
              </button>
            );
          }),
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn-secondary"
          onClick={backspaceWord}
          disabled={!sentence}
        >
          <Backpack className="h-4 w-4" />
          Delete word
        </button>
        <button
          className="btn-secondary"
          onClick={() => setSentence('')}
          disabled={!sentence}
        >
          <Eraser className="h-4 w-4" />
          Clear
        </button>
        <div className="flex-1" />
        <button
          className="btn-secondary"
          disabled={!sentence.trim()}
          onClick={() => {
            setSignText(sentence.trim());
            setSignOpen(true);
          }}
        >
          <Hand className="h-4 w-4" />
          Show in ASL
        </button>
        <button
          className="btn-primary"
          disabled={!sentence.trim() || speaking}
          onClick={handleSpeak}
        >
          {speaking ? <Spinner size={14} /> : <Volume2 className="h-4 w-4" />}
          {speaking ? 'Speaking...' : 'Speak'}
        </button>
      </div>

      {/* Inline ASL avatar (sign.mt iframe) */}
      {signOpen && signText && (
        <div className="mt-6">
          <SignAvatarPanel
            text={signText}
            onClose={() => setSignOpen(false)}
          />
        </div>
      )}

      {/* Live gaze cursor */}
      {eyeMode && gaze && !calibrating && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2"
          style={{ left: gaze.x, top: gaze.y }}
        >
          <div
            className="h-5 w-5 rounded-full border-2"
            style={{
              borderColor: 'var(--color-accent)',
              background:
                'color-mix(in oklch, var(--color-accent) 30%, transparent)',
              boxShadow:
                '0 0 16px 4px color-mix(in oklch, var(--color-accent) 35%, transparent)',
            }}
          />
        </div>
      )}

      {/* Hidden video for MediaPipe face tracker */}
      {faceMode && (
        <video
          ref={faceVideoRef}
          playsInline
          muted
          className="pointer-events-none fixed bottom-3 right-3 z-40 h-20 w-28 -scale-x-100 rounded-lg border-2 object-cover opacity-70"
          style={{ borderColor: 'var(--color-accent)' }}
        />
      )}

      {/* Face tracker status + controls */}
      {faceMode && (
        <div
          className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 text-[12px]"
          style={{
            background: 'var(--color-accent-soft)',
            borderColor: 'var(--color-accent)',
            color: 'var(--color-accent-text)',
          }}
        >
          <Eye className="h-3.5 w-3.5" />
          {faceLoading ? (
            <span className="font-semibold">
              Loading MediaPipe Face Landmarker (~10MB model — first load)...
            </span>
          ) : latestGazeVec ? (
            <span className="font-semibold">
              {latestGazeVec.mode === 'head' ? 'Head' : 'Iris'} tracker · gaze ({latestGazeVec.x.toFixed(2)}, {latestGazeVec.y.toFixed(2)}) · {Math.round(latestGazeVec.confidence * 100)}%
            </span>
          ) : (
            <span className="font-semibold">
              Look at the camera to start tracking...
            </span>
          )}

          {/* Mode toggle */}
          <div className="ml-auto flex items-center gap-1.5">
            <span style={{ color: 'var(--color-text-muted)' }}>Mode:</span>
            <div
              className="flex overflow-hidden rounded-full border text-[11px]"
              style={{ borderColor: 'var(--color-accent)' }}
            >
              <button
                onClick={() => {
                  setGazeKind('head');
                  faceTrackerRef.current?.setMode('head');
                }}
                className="px-2.5 py-0.5 font-bold transition-colors"
                style={{
                  background:
                    gazeKind === 'head' ? 'var(--color-accent)' : 'transparent',
                  color:
                    gazeKind === 'head' ? 'white' : 'var(--color-accent-text)',
                }}
              >
                Head
              </button>
              <button
                onClick={() => {
                  setGazeKind('iris');
                  faceTrackerRef.current?.setMode('iris');
                }}
                className="px-2.5 py-0.5 font-bold transition-colors"
                style={{
                  background:
                    gazeKind === 'iris' ? 'var(--color-accent)' : 'transparent',
                  color:
                    gazeKind === 'iris' ? 'white' : 'var(--color-accent-text)',
                }}
              >
                Iris
              </button>
            </div>

            {gazeKind === 'head' && (
              <button
                onClick={() => faceTrackerRef.current?.calibrateCenter()}
                className="ml-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold"
                style={{
                  borderColor: 'var(--color-accent)',
                  color: 'var(--color-accent-text)',
                }}
                title="Look straight ahead and click — calibrates 'center'"
              >
                Center my head
              </button>
            )}
          </div>
        </div>
      )}

      {/* Calibration overlay (legacy — kept for WebGazer flow if re-enabled) */}
      {calibrating && (
        <EyeCalibration
          onDone={() => setCalibrating(false)}
          onCancel={() => {
            setCalibrating(false);
            disableEyeTracker();
          }}
        />
      )}

      {/* Gemini API key dialog */}
      {showKeyDialog && (
        <GeminiKeyDialog
          onClose={() => setShowKeyDialog(false)}
          onSaved={(k) => {
            setHasKey(!!k.trim());
            if (k.trim()) enableGeminiMode();
          }}
        />
      )}
    </div>
  );
}

function DwellRing({ progress }: { progress: number }) {
  // Use a centered circle that respects the container's aspect ratio.
  // The SVG is square (1:1) and centered, so the ring stays a true circle.
  const size = 100;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - progress);
  const secondsLeft = Math.max(0, 1.5 * (1 - progress)).toFixed(1);

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        className="relative"
        style={{ width: '60%', aspectRatio: '1 / 1', maxWidth: 120 }}
      >
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="h-full w-full"
        >
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="color-mix(in oklch, var(--color-accent) 22%, transparent)"
            strokeWidth={stroke}
          />
          {/* Progress arc — animates smoothly via CSS transition */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{
              transition: 'stroke-dashoffset 120ms linear',
              filter:
                'drop-shadow(0 0 6px color-mix(in oklch, var(--color-accent) 60%, transparent))',
            }}
          />
        </svg>
        {/* Center countdown */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-[15px] font-black tabular-nums"
            style={{ color: 'var(--color-accent)' }}
          >
            {secondsLeft}s
          </span>
        </div>
      </div>
    </div>
  );
}

function NeedsProfile() {
  return (
    <div>
      <PageHeader title="EyeBridge" description="Speak with your eyes." />
      <div
        className="card flex flex-col items-start gap-3 p-8"
        style={{ background: 'var(--color-accent-soft)', borderColor: 'var(--color-accent)' }}
      >
        <div className="text-[15px] font-bold">Voice profile needed</div>
        <p className="max-w-md text-[13px]" style={{ color: 'var(--color-accent-text)' }}>
          EyeBridge speaks in your voice, so we need a quick recording first. Takes about a minute.
        </p>
        <Link to="/voice-setup" className="btn-primary mt-2">
          <Mic className="h-4 w-4" />
          Set up voice
        </Link>
      </div>
    </div>
  );
}
