import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Mic,
  Square,
  Baby,
  Activity,
  Check,
  Loader2,
  Volume2,
  Brain,
  Image as ImageIcon,
  Sparkles,
  Send,
  AlertCircle,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import ErrorBanner from '../components/ErrorBanner';
import {
  analyzeCryOnly,
  analyzeParentBridge,
  type CryResult,
  type ParentBridgeAssessment,
} from '../lib/api';
import {
  captureFrame,
  startCamera,
} from '../lib/recorder';

const RECORD_MS = 7000;
const QUALITY_PEAK_MIN = 0.04; // below this we abort instead of feeding silence to Gemma

type StepId =
  | 'record'
  | 'cry'
  | 'photo'
  | 'gemma'
  | 'done';

type StepStatus = 'pending' | 'active' | 'done' | 'failed' | 'skipped';

type StepState = { status: StepStatus; detail?: string };

const STEPS: { id: StepId; label: string; icon: React.ElementType }[] = [
  { id: 'record', label: 'Recording 5 seconds of cry', icon: Mic },
  { id: 'cry', label: 'Cry classifier (AST + features)', icon: Volume2 },
  { id: 'photo', label: 'Capturing baby photo', icon: ImageIcon },
  { id: 'gemma', label: 'Gemma reasoning over audio + image', icon: Brain },
  { id: 'done', label: 'Diagnosis ready', icon: Check },
];

export default function ParentBridge() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopCameraRef = useRef<(() => void) | null>(null);

  // Recording infra
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunks = useRef<BlobPart[]>([]);
  const rafRef = useRef<number | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [steps, setSteps] = useState<Record<StepId, StepState>>({
    record: { status: 'pending' },
    cry: { status: 'pending' },
    photo: { status: 'pending' },
    gemma: { status: 'pending' },
    done: { status: 'pending' },
  });

  const [running, setRunning] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [liveLevel, setLiveLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);

  const [cry, setCry] = useState<CryResult | null>(null);
  const [result, setResult] = useState<ParentBridgeAssessment | null>(null);
  const [lastFedMinutes, setLastFedMinutes] = useState(180);
  const [lastDiaperMinutes, setLastDiaperMinutes] = useState(120);

  useEffect(() => {
    let cancelled = false;
    startCamera('environment')
      .then(({ stream, stop }) => {
        if (cancelled) {
          stop();
          return;
        }
        stopCameraRef.current = stop;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.onloadedmetadata = () => {
            v.play();
            setCameraReady(true);
          };
        }
      })
      .catch((e) => setError(`Camera error: ${e.message}`));
    return () => {
      cancelled = true;
      stopCameraRef.current?.();
      cleanupAudio();
    };
  }, []);

  function setStep(id: StepId, patch: Partial<StepState>) {
    setSteps((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function resetSteps() {
    setSteps({
      record: { status: 'pending' },
      cry: { status: 'pending' },
      photo: { status: 'pending' },
      gemma: { status: 'pending' },
      done: { status: 'pending' },
    });
    setCry(null);
    setResult(null);
    setError(null);
    setRecordElapsed(0);
    setLiveLevel(0);
    setPeakLevel(0);
  }

  function cleanupAudio() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try {
      recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    analyserRef.current = null;
  }

  async function run() {
    if (running) return;
    resetSteps();
    setRunning(true);

    try {
      // ----- STEP 1: record audio -----
      setStep('record', { status: 'active', detail: 'Listening...' });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // Live amplitude meter
      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        const ctx = new Ctor();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        analyserRef.current = analyser;
      }

      // Recorder
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = rec;
      recordingChunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordingChunks.current.push(e.data);
      };
      const stoppedPromise = new Promise<Blob>((resolve) => {
        rec.onstop = () =>
          resolve(new Blob(recordingChunks.current, { type: mime }));
      });
      rec.start();

      const startedAt = performance.now();
      let localPeak = 0;
      const meterLoop = () => {
        const a = analyserRef.current;
        if (!a) return;
        const buf = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        setLiveLevel(rms);
        if (rms > localPeak) {
          localPeak = rms;
          setPeakLevel(rms);
        }
        const elapsed = performance.now() - startedAt;
        setRecordElapsed(elapsed);
        if (elapsed < RECORD_MS) {
          rafRef.current = requestAnimationFrame(meterLoop);
        }
      };
      rafRef.current = requestAnimationFrame(meterLoop);

      await new Promise((r) => setTimeout(r, RECORD_MS));
      rec.stop();
      const audioBlob = await stoppedPromise;
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      if (audioBlob.size < 1000) {
        throw new Error(
          "Audio capture produced 0 bytes. Check your mic isn't muted.",
        );
      }
      if (localPeak < QUALITY_PEAK_MIN) {
        // Audio is too quiet — abort. Feeding silence to Gemma wastes 60s
        // and returns wrong answers. Ask the user to retry.
        setStep('record', {
          status: 'failed',
          detail:
            `Audio too quiet (peak ${localPeak.toFixed(3)}, need ≥ ${QUALITY_PEAK_MIN}). ` +
            'Turn up the cry source, move closer to the mic, or check your mic isn\'t muted. Pipeline aborted.',
        });
        throw new Error(
          `Audio too quiet — peak ${localPeak.toFixed(3)} is below quality threshold ${QUALITY_PEAK_MIN}.`,
        );
      }
      setStep('record', {
        status: 'done',
        detail: `Captured ${(audioBlob.size / 1024).toFixed(0)} KB · peak ${localPeak.toFixed(2)} · ${(RECORD_MS / 1000).toFixed(0)}s`,
      });

      // ----- STEP 2: cry classifier (fast) -----
      setStep('cry', { status: 'active', detail: 'Classifying cry type...' });
      const cryResult = await analyzeCryOnly(audioBlob);
      setCry(cryResult);
      setStep('cry', {
        status: 'done',
        detail: `${cryResult.top_label} (${Math.round(
          cryResult.confidence * 100,
        )}%)`,
      });

      // ----- STEP 3: photo -----
      setStep('photo', { status: 'active', detail: 'Snapping baby...' });
      const v = videoRef.current;
      if (!v) throw new Error('Camera not ready.');
      const frame = await captureFrame(v);
      setStep('photo', {
        status: 'done',
        detail: `Captured ${(frame.blob.size / 1024).toFixed(0)} KB image`,
      });

      // ----- STEP 4: Gemma reasoning over audio + image + context -----
      setStep('gemma', {
        status: 'active',
        detail:
          'Gemma is reasoning about audio + image + feed / diaper context. This takes ~1-2 minutes on CPU.',
      });
      const r = await analyzeParentBridge({
        audio: audioBlob,
        image: frame.blob,
        lastFedMinutes,
        lastDiaperMinutes,
      });
      setResult(r);
      setStep('gemma', {
        status: 'done',
        detail: `Likely need: ${r.likely_need} · distress ${r.distress_level}/10 · confidence ${Math.round(r.confidence * 100)}%`,
      });

      // ----- STEP 5: done -----
      setStep('done', { status: 'done', detail: 'All clear.' });
    } catch (e) {
      setError((e as Error).message);
      // Mark first active step as failed
      setSteps((prev) => {
        const next = { ...prev };
        for (const id of ['record', 'cry', 'photo', 'gemma'] as StepId[]) {
          if (next[id].status === 'active') {
            next[id] = {
              status: 'failed',
              detail: (e as Error).message,
            };
            break;
          }
        }
        return next;
      });
    } finally {
      cleanupAudio();
      setRunning(false);
    }
  }

  const recordingActive = steps.record.status === 'active';
  const livePct = Math.min(1, liveLevel * 12);
  const peakPct = Math.min(1, peakLevel * 12);
  const elapsedPct = Math.min(1, recordElapsed / RECORD_MS);

  return (
    <div>
      <PageHeader
        eyebrow="Wellness"
        title="Parent Bridge"
        description="Record a cry, snap a photo, and watch each step run. Step indicators tell you exactly what's happening."
      />

      {error && (
        <div className="mb-5">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_1fr]">
        {/* Left: camera + controls */}
        <div className="card overflow-hidden p-0">
          <div className="relative aspect-[4/3] w-full bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
            />

            {/* Live recording overlay */}
            {recordingActive && (
              <div
                className="absolute inset-x-3 bottom-3 rounded-xl border-2 px-4 py-3 backdrop-blur-md"
                style={{
                  background: 'rgba(0,0,0,0.65)',
                  borderColor: 'var(--color-accent)',
                }}
              >
                <div className="flex items-center justify-between text-[12px] font-bold text-white">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 animate-pulse rounded-full"
                      style={{ background: 'var(--color-accent)' }}
                    />
                    Recording cry
                  </span>
                  <span>
                    {(recordElapsed / 1000).toFixed(1)}s / 5.0s
                  </span>
                </div>
                {/* Elapsed bar */}
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
                  style={{ background: 'rgba(255,255,255,0.15)' }}
                >
                  <div
                    className="h-full transition-[width] duration-100"
                    style={{
                      width: `${elapsedPct * 100}%`,
                      background: 'var(--color-accent)',
                    }}
                  />
                </div>
                {/* Live audio level */}
                <div className="mt-2 flex items-center gap-2">
                  <Volume2 className="h-3 w-3 text-white/70" />
                  <div
                    className="relative h-2 flex-1 overflow-hidden rounded-full"
                    style={{ background: 'rgba(255,255,255,0.12)' }}
                  >
                    {/* Peak hold */}
                    <div
                      className="absolute inset-y-0 w-0.5"
                      style={{
                        left: `${peakPct * 100}%`,
                        background: 'rgba(255,255,255,0.6)',
                      }}
                    />
                    {/* Live RMS */}
                    <div
                      className="h-full transition-[width] duration-75"
                      style={{
                        width: `${livePct * 100}%`,
                        background:
                          livePct > 0.15
                            ? 'var(--color-success)'
                            : livePct > 0.04
                              ? 'var(--color-warning)'
                              : 'var(--color-danger)',
                      }}
                    />
                  </div>
                  <span
                    className="font-mono text-[10px] tabular-nums"
                    style={{ color: 'rgba(255,255,255,0.8)' }}
                  >
                    {liveLevel.toFixed(3)}
                  </span>
                </div>
                <div
                  className="mt-1 text-[10px]"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                >
                  Bar should jump while audio plays. If it stays flat, your mic
                  isn't picking up the sound.
                </div>
              </div>
            )}
          </div>

          <div
            className="border-t p-5"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <Slider
              label="Last fed"
              value={lastFedMinutes}
              onChange={setLastFedMinutes}
              unit="min ago"
            />
            <div className="mt-3">
              <Slider
                label="Last diaper"
                value={lastDiaperMinutes}
                onChange={setLastDiaperMinutes}
                unit="min ago"
              />
            </div>

            <div
              className="mt-4 rounded-lg border p-3 text-[12px]"
              style={{
                background: 'var(--color-bg-elevated)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-muted)',
              }}
            >
              <div className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Accuracy mode (always on)
              </div>
              <p className="mt-0.5 leading-snug">
                Records {RECORD_MS / 1000}s of audio, runs the cry classifier,
                snaps a baby photo, and lets Gemma reason over everything for
                the most reliable answer. Plan for ~1-2 min total.
              </p>
            </div>

            <button
              className="btn-primary mt-4 w-full justify-center"
              disabled={!cameraReady || running}
              onClick={run}
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running pipeline...
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" />
                  <Camera className="h-4 w-4" />
                  Record {RECORD_MS / 1000}s cry + diagnose
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: stepped progress + results */}
        <div className="flex flex-col gap-5">
          <div className="card overflow-hidden p-0">
            <div
              className="border-b px-5 py-3"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <h3 className="text-[14px] font-bold">Pipeline</h3>
              <p
                className="text-[11px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Each step shows live status. Watch the spinner turn into a check.
              </p>
            </div>
            <ol className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {STEPS.map((s, i) => (
                <li key={s.id} style={{ borderColor: 'var(--color-border)' }}>
                  <StepRow
                    index={i + 1}
                    label={s.label}
                    icon={s.icon}
                    state={steps[s.id]}
                  />
                </li>
              ))}
            </ol>
          </div>

          {/* Cry classifier result */}
          {cry && <CryResultCard cry={cry} />}

          {/* Gemma result */}
          {result && <AssessmentCard result={result} />}

          {!cry && !result && !running && (
            <div
              className="card flex flex-col items-center justify-center p-6 text-center"
              style={{ borderStyle: 'dashed' }}
            >
              <Baby
                className="mb-2 h-7 w-7"
                style={{ color: 'var(--color-accent)' }}
              />
              <div className="text-[14px] font-bold">No analysis yet</div>
              <p
                className="mt-1 max-w-xs text-[12px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Press the big button on the left to start the pipeline. Watch
                each step turn green.
              </p>
            </div>
          )}
        </div>
      </div>

      <p
        className="mt-8 max-w-3xl text-[12px] leading-relaxed"
        style={{ color: 'var(--color-text-subtle)' }}
      >
        Safety: this is not a medical diagnosis or abuse detection. If breathing,
        skin colour, or movement looks unusual, seek urgent help.
      </p>
    </div>
  );
}

function StepRow({
  index,
  label,
  icon: Icon,
  state,
}: {
  index: number;
  label: string;
  icon: React.ElementType;
  state: StepState;
}) {
  let badge: React.ReactNode;
  let badgeColor = 'var(--color-text-subtle)';
  let labelColor: string = 'var(--color-text-muted)';
  let bgColor = 'var(--color-bg-card)';

  switch (state.status) {
    case 'pending':
      badge = <span>{index}</span>;
      break;
    case 'active':
      badge = <Loader2 className="h-3.5 w-3.5 animate-spin" />;
      badgeColor = 'var(--color-accent)';
      labelColor = 'var(--color-text-primary)';
      bgColor = 'var(--color-accent-soft)';
      break;
    case 'done':
      badge = <Check className="h-3.5 w-3.5" />;
      badgeColor = 'var(--color-success)';
      labelColor = 'var(--color-text-primary)';
      break;
    case 'failed':
      badge = <AlertCircle className="h-3.5 w-3.5" />;
      badgeColor = 'var(--color-danger)';
      labelColor = 'var(--color-danger)';
      break;
    case 'skipped':
      badge = <span>—</span>;
      labelColor = 'var(--color-text-subtle)';
      break;
  }

  return (
    <div
      className="flex items-start gap-3 px-5 py-3.5 transition-colors"
      style={{ background: bgColor }}
    >
      <div
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[11px] font-bold"
        style={{
          borderColor: badgeColor,
          color: badgeColor,
          background:
            state.status === 'done' || state.status === 'active'
              ? 'transparent'
              : 'transparent',
        }}
      >
        {badge}
      </div>
      <Icon
        className="mt-1 h-3.5 w-3.5 shrink-0"
        style={{ color: badgeColor }}
      />
      <div className="min-w-0 flex-1">
        <div
          className="text-[13px] font-semibold"
          style={{ color: labelColor }}
        >
          {label}
        </div>
        {state.detail && (
          <div
            className="mt-0.5 text-[11px] leading-snug"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {state.detail}
          </div>
        )}
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span
          className="text-[12px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {label}
        </span>
        <span className="text-[13px] font-bold">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={360}
        step={15}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />
    </div>
  );
}

function CryResultCard({ cry }: { cry: CryResult }) {
  return (
    <div
      className="card overflow-hidden p-0"
      style={{ borderColor: 'var(--color-accent)' }}
    >
      <div
        className="border-b px-5 py-4"
        style={{
          background: 'var(--color-accent-soft)',
          borderColor: 'var(--color-accent)',
        }}
      >
        <div
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Cry classifier
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <h3
            className="text-[22px] font-bold capitalize"
            style={{ color: 'var(--color-accent-text)' }}
          >
            {cry.top_label}
          </h3>
          <span
            className="text-[13px] font-semibold"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {Math.round(cry.confidence * 100)}%
          </span>
        </div>
      </div>
      <div className="p-5">
        <div
          className="mb-1 text-[11px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--color-text-muted)' }}
        >
          All scores
        </div>
        <ul className="space-y-1.5">
          {cry.predictions.map((p, i) => (
            <li key={i} className="flex items-center gap-2 text-[12px]">
              <span
                className="w-20 shrink-0 font-semibold"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {p.label}
              </span>
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full"
                style={{ background: 'var(--color-bg-elevated)' }}
              >
                <div
                  className="h-full"
                  style={{
                    width: `${Math.round(p.score * 100)}%`,
                    background: 'var(--color-accent)',
                  }}
                />
              </div>
              <span
                className="w-10 shrink-0 text-right font-mono tabular-nums"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {Math.round(p.score * 100)}%
              </span>
            </li>
          ))}
        </ul>
        <div
          className="mt-3 text-[10px]"
          style={{ color: 'var(--color-text-subtle)' }}
        >
          Model: {cry.model_id}
        </div>
      </div>
    </div>
  );
}

const NEED_COLORS: Record<string, { soft: string; strong: string }> = {
  hunger: { soft: 'var(--color-accent-soft)', strong: 'var(--color-accent)' },
  tired: { soft: 'var(--color-accent-soft)', strong: 'var(--color-warning)' },
  gas: { soft: 'var(--color-accent-soft)', strong: 'var(--color-warning)' },
  burping: { soft: 'var(--color-accent-soft)', strong: 'var(--color-warning)' },
  pain: { soft: 'var(--color-accent-soft)', strong: 'var(--color-danger)' },
  discomfort: { soft: 'var(--color-accent-soft)', strong: 'var(--color-warning)' },
  unknown: { soft: 'var(--color-bg-elevated)', strong: 'var(--color-text-muted)' },
};

function AssessmentCard({ result }: { result: ParentBridgeAssessment }) {
  const color =
    NEED_COLORS[result.likely_need.toLowerCase()] ?? NEED_COLORS.unknown;
  const need = result.likely_need.replace(/_/g, ' ');

  return (
    <div className="card overflow-hidden p-0">
      <div
        className="border-b p-5"
        style={{
          background: color.soft,
          borderColor: color.strong,
        }}
      >
        <div
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Gemma diagnosis
        </div>
        <h3 className="mt-1 text-[24px] font-bold capitalize leading-tight">
          {need}
        </h3>
        <div
          className="mt-1 text-[12px] font-semibold"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Confidence {Math.round(result.confidence * 100)}% · Distress{' '}
          {result.distress_level}/10
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <div
            className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <Sparkles className="h-3 w-3" /> Suggested action
          </div>
          <p className="text-[13px] leading-relaxed">{result.suggested_action}</p>
        </div>
        <div>
          <div
            className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <Send className="h-3 w-3" /> Parent message
          </div>
          <p className="text-[13px] leading-relaxed">{result.parent_message}</p>
        </div>
      </div>

      <div
        className="border-t px-5 py-3 text-[11px]"
        style={{
          borderColor: 'var(--color-border)',
          background: 'var(--color-bg-elevated)',
          color: 'var(--color-text-muted)',
        }}
      >
        <Activity className="mr-1 inline h-3 w-3" />
        {result.safety_note}
      </div>
    </div>
  );
}
