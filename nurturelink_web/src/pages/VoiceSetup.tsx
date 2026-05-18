import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mic,
  Square,
  Camera,
  Play,
  RotateCcw,
  Check,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import ErrorBanner from '../components/ErrorBanner';
import Spinner from '../components/Spinner';
import {
  listVoices,
  matchVoice,
  type Voice,
  type VoiceMatchResponse,
} from '../lib/api';
import {
  saveProfile,
  speak,
  type VoiceProfile,
  loadProfile,
  clearProfile,
} from '../lib/voiceProfile';
import {
  startAudioRecording,
  startCamera,
  captureFrame,
  type RecorderController,
} from '../lib/recorder';

type Step = 'idle' | 'recording' | 'analyzing' | 'done';

export default function VoiceSetup() {
  const navigate = useNavigate();
  const existing = loadProfile();

  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [matchResult, setMatchResult] = useState<VoiceMatchResponse | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(
    existing?.voiceId ?? null,
  );
  const [name, setName] = useState(existing?.parentName ?? '');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(
    existing?.photoDataUrl,
  );

  const recorderRef = useRef<RecorderController | null>(null);
  const recordedAudioRef = useRef<Blob | null>(null);

  // Camera capture modal
  const [cameraOpen, setCameraOpen] = useState(false);

  useEffect(() => {
    listVoices()
      .then(setVoices)
      .catch((e) => setError(`Backend offline: ${e.message}`));
  }, []);

  async function startRecording() {
    setError(null);
    try {
      recorderRef.current = await startAudioRecording();
      setStep('recording');
    } catch (e) {
      setError(`Mic error: ${(e as Error).message}`);
      setStep('idle');
    }
  }

  async function stopRecording() {
    const rec = recorderRef.current;
    if (!rec) return;
    setStep('analyzing');
    try {
      const audio = await rec.stop();
      recordedAudioRef.current = audio.blob;
      const result = await matchVoice(audio.blob);
      setMatchResult(result);
      setSelectedVoiceId(result.matched_voice_id);
      setStep('done');
    } catch (e) {
      setError(`Voice analysis failed: ${(e as Error).message}`);
      setStep('idle');
    } finally {
      recorderRef.current = null;
    }
  }

  async function previewVoice() {
    if (!selectedVoiceId) return;
    setPreviewing(true);
    setError(null);
    try {
      await speak(
        `Hello little one, mommy loves you. Are you feeling happy today?`,
        selectedVoiceId,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  }

  function selectedVoiceData(): Voice | undefined {
    return voices.find((v) => v.id === selectedVoiceId);
  }

  function scoreFor(voiceId: string): number {
    const m = matchResult;
    if (!m) return 0;
    if (m.matched_voice_id === voiceId) return m.match_score;
    const alt = m.alternatives.find((a) => a.id === voiceId);
    return alt?.match_score ?? 0;
  }

  function handleSave() {
    if (!selectedVoiceId) return;
    const v = selectedVoiceData();
    const m = matchResult;
    const profile: VoiceProfile = {
      voiceId: selectedVoiceId,
      displayName: v?.display_name ?? selectedVoiceId,
      matchScore: m ? scoreFor(selectedVoiceId) : existing?.matchScore ?? 0,
      accent: v?.accent ?? existing?.accent ?? '',
      personality: v?.personality ?? existing?.personality ?? '',
      parentName: name.trim(),
      photoDataUrl,
    };
    saveProfile(profile);
    navigate('/');
  }

  function handleClear() {
    clearProfile();
    setMatchResult(null);
    setSelectedVoiceId(null);
    setName('');
    setPhotoDataUrl(undefined);
    setStep('idle');
  }

  const matchedVoiceData = matchResult
    ? voices.find((v) => v.id === matchResult.matched_voice_id)
    : null;

  return (
    <div>
      <PageHeader
        eyebrow="Setup"
        title="Set up your voice"
        description="Record about 10 seconds. NurtureLink matches your pitch and tone to a natural voice. Used whenever the app speaks for you."
        action={
          existing && (
            <button
              onClick={handleClear}
              className="btn-secondary"
              style={{ color: 'var(--color-danger)' }}
            >
              <Trash2 className="h-4 w-4" />
              Clear profile
            </button>
          )
        }
      />

      {error && (
        <div className="mb-5">
          <ErrorBanner message={error} />
        </div>
      )}

      {/* Step 1: Record */}
      <div className="card mb-5 p-6">
        <div className="mb-4 flex items-center gap-2">
          <StepDot done={step === 'done' || step === 'analyzing'} active={step === 'idle' || step === 'recording'} number={1} />
          <h3 className="text-[16px] font-bold">Record your voice</h3>
        </div>
        <p
          className="ml-9 mb-4 max-w-xl text-[13px]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Speak naturally for ~10 seconds. Try saying:{' '}
          <span
            className="italic"
            style={{ color: 'var(--color-text-primary)' }}
          >
            "My sweet little one, today we had so much fun. I love you with all
            my heart."
          </span>
        </p>
        <div className="ml-9">
          {step === 'idle' && (
            <button onClick={startRecording} className="btn-primary">
              <Mic className="h-4 w-4" />
              Start recording
            </button>
          )}
          {step === 'recording' && (
            <div className="flex items-center gap-3">
              <button onClick={stopRecording} className="btn-primary">
                <Square className="h-4 w-4" />
                Stop recording
              </button>
              <RecordingDot />
              <span
                className="text-[13px] font-medium"
                style={{ color: 'var(--color-accent)' }}
              >
                Recording...
              </span>
            </div>
          )}
          {step === 'analyzing' && (
            <div className="flex items-center gap-2.5">
              <Spinner size={16} />
              <span className="text-[13px] font-medium">
                Analyzing your voice...
              </span>
            </div>
          )}
          {step === 'done' && (
            <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: 'var(--color-success)' }}>
              <Check className="h-4 w-4" />
              Voice analyzed
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Match result + alternatives */}
      {matchResult && matchedVoiceData && (
        <div className="card mb-5 p-6">
          <div className="mb-4 flex items-center gap-2">
            <StepDot done={false} active number={2} />
            <h3 className="text-[16px] font-bold">Choose your voice</h3>
          </div>

          <div
            className="ml-9 mb-5 rounded-xl border p-4"
            style={{
              background: 'var(--color-accent-soft)',
              borderColor: 'var(--color-accent)',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div
                  className="text-[12px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--color-accent-text)' }}
                >
                  Best match
                </div>
                <div className="mt-1 text-[18px] font-bold">
                  {matchedVoiceData.display_name}
                </div>
                <div
                  className="text-[13px]"
                  style={{ color: 'var(--color-accent-text)' }}
                >
                  {matchedVoiceData.accent} · {matchedVoiceData.personality}
                </div>
                <div
                  className="mt-1 text-[12px]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Detected {matchResult.analysis.estimated_gender}, ~
                  {Math.round(matchResult.analysis.mean_pitch_hz)} Hz · Match{' '}
                  {Math.round(matchResult.match_score * 100)}%
                </div>
              </div>
              <button
                onClick={previewVoice}
                disabled={previewing}
                className="btn-secondary"
              >
                {previewing ? (
                  <Spinner size={14} />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Preview
              </button>
            </div>
          </div>

          <div className="ml-9 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {voices
              .slice()
              .sort((a, b) => scoreFor(b.id) - scoreFor(a.id))
              .map((voice) => {
                const isSelected = voice.id === selectedVoiceId;
                const score = scoreFor(voice.id);
                return (
                  <button
                    key={voice.id}
                    onClick={() => setSelectedVoiceId(voice.id)}
                    className="rounded-xl border p-3 text-left transition-colors"
                    style={{
                      borderColor: isSelected
                        ? 'var(--color-accent)'
                        : 'var(--color-border)',
                      background: isSelected
                        ? 'var(--color-accent-soft)'
                        : 'var(--color-bg-card)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-[13px] font-bold">
                        {voice.display_name}
                      </div>
                      {isSelected && (
                        <Check
                          className="h-3.5 w-3.5"
                          style={{ color: 'var(--color-accent)' }}
                        />
                      )}
                    </div>
                    <div
                      className="mt-0.5 text-[11px]"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {voice.accent} · {voice.personality}
                      {score > 0 && ` · ${Math.round(score * 100)}% match`}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Step 3: Photo + name */}
      <div className="card mb-5 p-6">
        <div className="mb-4 flex items-center gap-2">
          <StepDot done={false} active number={3} />
          <h3 className="text-[16px] font-bold">
            Photo & name <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>(optional)</span>
          </h3>
        </div>
        <p
          className="ml-9 mb-4 max-w-xl text-[13px]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Adds a face for your child to see when NurtureLink speaks. Stored only
          on this device.
        </p>

        <div className="ml-9 flex flex-wrap items-center gap-4">
          <div
            className="h-20 w-20 overflow-hidden rounded-full border-2"
            style={{
              background: 'var(--color-bg-elevated)',
              borderColor: 'var(--color-border)',
            }}
          >
            {photoDataUrl ? (
              <img
                src={photoDataUrl}
                alt="Your photo"
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center text-2xl font-bold"
                style={{ color: 'var(--color-text-subtle)' }}
              >
                {name.slice(0, 1).toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              className="btn-secondary"
              onClick={() => {
                setError(null);
                setCameraOpen(true);
              }}
            >
              {photoDataUrl ? (
                <RotateCcw className="h-4 w-4" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              {photoDataUrl ? 'Retake' : 'Add photo'}
            </button>
            {photoDataUrl && (
              <button
                className="btn-secondary"
                onClick={() => setPhotoDataUrl(undefined)}
                style={{ color: 'var(--color-danger)' }}
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </button>
            )}
          </div>
        </div>

        <div className="ml-9 mt-5 max-w-md">
          <label
            className="mb-1.5 block text-[12px] font-semibold"
            style={{ color: 'var(--color-text-muted)' }}
          >
            How should your child hear you addressed?
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mama, Mommy, Anita..."
            className="w-full rounded-xl border px-3.5 py-2.5 text-[14px] outline-none transition-colors"
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
      </div>

      <div className="flex justify-end">
        <button
          className="btn-primary"
          disabled={!selectedVoiceId}
          onClick={handleSave}
        >
          Save profile
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {cameraOpen && (
        <CameraCaptureModal
          onCancel={() => setCameraOpen(false)}
          onCapture={(dataUrl) => {
            setPhotoDataUrl(dataUrl);
            setCameraOpen(false);
          }}
        />
      )}
    </div>
  );
}

function RecordingDot() {
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{
        background: 'var(--color-accent)',
        animation: 'pulse 1s ease-in-out infinite',
      }}
    />
  );
}

function StepDot({
  number,
  done,
  active,
}: {
  number: number;
  done?: boolean;
  active?: boolean;
}) {
  const color = done
    ? 'var(--color-success)'
    : active
      ? 'var(--color-accent)'
      : 'var(--color-text-subtle)';
  return (
    <div
      className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
      style={{
        background: 'var(--color-bg-elevated)',
        border: `1.5px solid ${color}`,
        color,
      }}
    >
      {done ? <Check className="h-3 w-3" /> : number}
    </div>
  );
}

function CameraCaptureModal({
  onCancel,
  onCapture,
}: {
  onCancel: () => void;
  onCapture: (dataUrl: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const streamRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    startCamera('user')
      .then(({ stream, stop }) => {
        if (cancelled) {
          stop();
          return;
        }
        streamRef.current = { stop };
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.onloadedmetadata = () => {
            v.play();
            setStreaming(true);
          };
        }
      })
      .catch((e) => setError(`Camera error: ${e.message}`));
    return () => {
      cancelled = true;
      streamRef.current?.stop();
    };
  }, []);

  async function snap() {
    if (!videoRef.current) return;
    try {
      const frame = await captureFrame(videoRef.current);
      onCapture(frame.dataUrl);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div
        className="card w-full max-w-lg overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="border-b px-5 py-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <h3 className="text-[15px] font-bold">Take your photo</h3>
          <p
            className="mt-0.5 text-[12px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Hold the camera at eye level and look straight ahead.
          </p>
        </div>
        <div className="aspect-[4/3] w-full bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        </div>
        {error && (
          <div className="px-5 pt-4">
            <ErrorBanner message={error} />
          </div>
        )}
        <div
          className="flex justify-end gap-2 border-t px-5 py-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!streaming}
            onClick={snap}
          >
            <Camera className="h-4 w-4" />
            Capture
          </button>
        </div>
      </div>
    </div>
  );
}
