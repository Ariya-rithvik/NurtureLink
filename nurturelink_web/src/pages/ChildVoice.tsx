import { useEffect, useRef, useState } from 'react';
import { Camera, ShieldCheck } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import ErrorBanner from '../components/ErrorBanner';
import Spinner from '../components/Spinner';
import {
  analyzeChildVoice,
  type ChildCheckin,
} from '../lib/api';
import { startCamera, captureFrame } from '../lib/recorder';

const STYLES = [
  { value: 'non-verbal', label: 'Non-verbal' },
  { value: 'limited speech', label: 'Limited speech' },
  { value: 'AAC/device communication', label: 'AAC device' },
  { value: 'gesture/sign based', label: 'Gesture / sign' },
];

const STATUS_COLOR: Record<string, string> = {
  stable: 'var(--color-success)',
  mild_change: 'var(--color-warning)',
  needs_attention: 'var(--color-warning)',
  urgent_check: 'var(--color-danger)',
  unclear: 'var(--color-text-muted)',
};

export default function ChildVoice() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'analyzing'>('idle');
  const [result, setResult] = useState<ChildCheckin | null>(null);

  const [age, setAge] = useState(8);
  const [style, setStyle] = useState(STYLES[0].value);
  const [concern, setConcern] = useState('No specific concern. Daily check-in.');

  useEffect(() => {
    let cancelled = false;
    startCamera('user')
      .then(({ stream, stop }) => {
        if (cancelled) {
          stop();
          return;
        }
        stopRef.current = stop;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.onloadedmetadata = () => {
            v.play();
            setReady(true);
          };
        }
      })
      .catch((e) => setError(`Camera error: ${e.message}`));
    return () => {
      cancelled = true;
      stopRef.current?.();
    };
  }, []);

  async function captureAndAnalyze() {
    const v = videoRef.current;
    if (!v) return;
    setError(null);
    setResult(null);
    setPhase('analyzing');
    try {
      const frame = await captureFrame(v);
      const result = await analyzeChildVoice({
        image: frame.blob,
        childAgeYears: age,
        communicationStyle: style,
        caregiverConcern: concern,
      });
      setResult(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhase('idle');
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Wellness"
        title="Child Voice Check-in"
        description="A gentle visual check-in for children who can't easily say how they feel. Not diagnostic."
      />

      {error && (
        <div className="mb-5">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="card overflow-hidden p-0">
          <div className="aspect-[4/3] w-full bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full -scale-x-100 object-cover"
            />
          </div>
          <div
            className="border-t p-5"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Child age</Label>
                <div className="text-[15px] font-bold">
                  {age} years
                </div>
                <input
                  type="range"
                  min={1}
                  max={18}
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="mt-1 w-full accent-[var(--color-accent)]"
                />
              </div>
              <div>
                <Label>Communication</Label>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-[13px] outline-none"
                  style={{
                    background: 'var(--color-bg-card)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {STYLES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <Label>Caregiver concern</Label>
              <textarea
                value={concern}
                onChange={(e) => setConcern(e.target.value)}
                rows={2}
                className="mt-1 w-full resize-none rounded-xl border px-3 py-2 text-[13px] outline-none"
                style={{
                  background: 'var(--color-bg-card)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>

            <button
              className="btn-primary mt-5 w-full justify-center"
              disabled={!ready || phase === 'analyzing'}
              onClick={captureAndAnalyze}
            >
              {phase === 'analyzing' ? (
                <>
                  <Spinner size={14} />
                  Analyzing...
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4" />
                  Capture check-in
                </>
              )}
            </button>
          </div>
        </div>

        <div>
          {!result && phase === 'idle' && (
            <div
              className="card flex h-full min-h-[260px] flex-col items-center justify-center p-8 text-center"
              style={{ borderStyle: 'dashed' }}
            >
              <ShieldCheck
                className="mb-3 h-8 w-8"
                style={{ color: 'var(--color-accent)' }}
              />
              <h3 className="text-[15px] font-bold">No check-in yet</h3>
              <p
                className="mt-1 max-w-xs text-[13px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Visual signals help caregivers notice changes calmly.
              </p>
            </div>
          )}
          {result && <CheckinCard result={result} />}
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] font-bold uppercase tracking-wider"
      style={{ color: 'var(--color-text-muted)' }}
    >
      {children}
    </div>
  );
}

function CheckinCard({ result }: { result: ChildCheckin }) {
  const color = STATUS_COLOR[result.status] ?? STATUS_COLOR.unclear;
  return (
    <div className="card overflow-hidden p-0">
      <div
        className="border-b p-5"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Status
        </div>
        <h3
          className="mt-1 text-[24px] font-bold capitalize leading-tight"
          style={{ color }}
        >
          {result.status.replace(/_/g, ' ')}
        </h3>
        <div
          className="mt-1 text-[13px]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {result.emotional_state} · Confidence{' '}
          {Math.round(result.confidence * 100)}%
        </div>
      </div>
      <div className="space-y-4 p-5">
        <div>
          <div
            className="mb-1 text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Caregiver message
          </div>
          <p className="text-[14px] leading-relaxed">
            {result.caregiver_message}
          </p>
        </div>
        <div>
          <div
            className="mb-1 text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Suggested action
          </div>
          <p className="text-[14px] leading-relaxed">
            {result.suggested_action}
          </p>
        </div>
        {result.visual_cues.length > 0 && (
          <div>
            <div
              className="mb-1 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Visual cues
            </div>
            <ul className="space-y-0.5 text-[13px]">
              {result.visual_cues.map((c, i) => (
                <li key={i}>· {c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div
        className="border-t px-5 py-3 text-[11px]"
        style={{
          borderColor: 'var(--color-border)',
          background: 'var(--color-bg-elevated)',
          color: 'var(--color-text-muted)',
        }}
      >
        {result.safety_note}
      </div>
    </div>
  );
}
