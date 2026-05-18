import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  Shield,
  Play,
  Pause,
  KeyRound,
  Mic,
  Camera,
  Volume2,
  AlertTriangle,
  CheckCircle2,
  Settings,
  Trash2,
  RotateCw,
  Eye,
  Baby,
  UserRound,
  MapPin,
  PhoneCall,
  Send,
  X,
  Phone,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import ErrorBanner from '../components/ErrorBanner';
import InfoBanner from '../components/InfoBanner';
import ParentAvatar from '../components/ParentAvatar';
import GeminiKeyDialog from '../components/GeminiKeyDialog';
import { loadProfile, speak } from '../lib/voiceProfile';
import { startCamera, captureFrame } from '../lib/recorder';
import {
  detectHazard,
  generateEmergencyScript,
  hasGeminiKey,
  type HazardReport,
  type HazardSeverity,
  type WatchTarget,
  type EmergencyScript,
} from '../lib/geminiClient';

type Incident = {
  id: string;
  at: Date;
  severity: HazardSeverity;
  hazardType: string;
  description: string;
  spoken: string;
  thumbnail: string;
};

const SETTINGS_KEY = 'nurturelink.guardian.settings.v1';
const INCIDENTS_KEY = 'nurturelink.guardian.incidents.v1';
const POLL_INTERVAL_MS = 12000; // every 12s — saves Gemini quota vs 3fps
const COOLDOWN_MS = 25_000; // wait this long after a warning before speaking again

type Settings = {
  childName: string;
  childAge: number;
  roomContext: string;
  speakOnWarning: boolean;
  target: WatchTarget;
  familyPhone: string;
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return defaultSettings();
}
function defaultSettings(): Settings {
  return {
    childName: 'Sweetie',
    childAge: 4,
    roomContext: 'living room',
    speakOnWarning: true,
    target: 'child',
    familyPhone: '',
  };
}
function persistSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
function loadIncidents(): Incident[] {
  try {
    const raw = localStorage.getItem(INCIDENTS_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as Incident[]).map((i) => ({ ...i, at: new Date(i.at) }));
  } catch {
    return [];
  }
}
function persistIncidents(list: Incident[]) {
  localStorage.setItem(
    INCIDENTS_KEY,
    JSON.stringify(list.map((i) => ({ ...i, at: i.at.toISOString() }))),
  );
}

const SEVERITY_STYLE: Record<HazardSeverity, { color: string; label: string; icon: React.ElementType }> = {
  safe: { color: 'var(--color-success)', label: 'Safe', icon: CheckCircle2 },
  info: { color: 'var(--color-text-muted)', label: 'Info', icon: Eye },
  warning: { color: 'var(--color-warning)', label: 'Warning', icon: AlertTriangle },
  danger: { color: 'var(--color-danger)', label: 'Danger', icon: ShieldAlert },
};

export default function GuardianWatch() {
  const profile = loadProfile();
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(() => hasGeminiKey());
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [currentReport, setCurrentReport] = useState<HazardReport | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>(() => loadIncidents());
  const [busy, setBusy] = useState(false);

  // Escalation state
  const [emergency, setEmergency] = useState<{
    incident: Incident;
    location: GeolocationCoordinates | null;
    script: EmergencyScript | null;
    scriptBusy: boolean;
  } | null>(null);
  const dangerStreakRef = useRef(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStopRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastSpokenAtRef = useRef<number>(0);

  useEffect(() => persistSettings(settings), [settings]);
  useEffect(() => persistIncidents(incidents), [incidents]);

  useEffect(() => {
    const onKey = () => setHasKey(hasGeminiKey());
    window.addEventListener('gemini:keyChanged', onKey);
    return () => window.removeEventListener('gemini:keyChanged', onKey);
  }, []);

  useEffect(() => () => stop(), []); // cleanup on unmount

  async function start() {
    if (!hasKey) {
      setShowKeyDialog(true);
      return;
    }
    setError(null);
    setInfo(null);
    try {
      const { stream, stop: stopCam } = await startCamera('user');
      cameraStopRef.current = stopCam;
      const v = videoRef.current;
      if (!v) throw new Error('Video element not ready.');
      v.srcObject = stream;
      await new Promise<void>((res) => {
        v.onloadedmetadata = () => res();
      });
      await v.play();
      setRunning(true);
      // First check immediately, then poll
      tick();
      timerRef.current = window.setInterval(tick, POLL_INTERVAL_MS);
    } catch (e) {
      setError(`Couldn't start GuardianWatch: ${(e as Error).message}`);
    }
  }

  function stop() {
    setRunning(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    cameraStopRef.current?.();
    cameraStopRef.current = null;
    setBusy(false);
  }

  async function tick() {
    const v = videoRef.current;
    if (!v || v.readyState < 2) return;
    if (busy) return; // skip if previous detection still running
    setBusy(true);
    try {
      const frame = await captureFrame(v, 720);
      const report = await detectHazard(
        frame.blob,
        settings.childAge,
        settings.childName,
        settings.roomContext,
        { target: settings.target },
      );
      setCurrentReport(report);

      if (report.severity === 'danger') {
        dangerStreakRef.current += 1;
      } else {
        dangerStreakRef.current = 0;
      }

      if (report.severity === 'danger' || report.severity === 'warning') {
        const now = performance.now();
        const isDanger = report.severity === 'danger';

        const incident: Incident = {
          id: crypto.randomUUID(),
          at: new Date(),
          severity: report.severity,
          hazardType: report.hazard_type,
          description: report.description,
          spoken: report.spoken_message,
          thumbnail: frame.dataUrl,
        };
        setIncidents((prev) => [incident, ...prev].slice(0, 30));

        // Speak only if user has a profile, message is non-empty, cooldown passed.
        const canSpeak =
          settings.speakOnWarning &&
          profile &&
          report.spoken_message.trim().length > 0 &&
          now - lastSpokenAtRef.current >= (isDanger ? 5_000 : COOLDOWN_MS);
        if (canSpeak) {
          lastSpokenAtRef.current = now;
          try {
            await speak(report.spoken_message);
          } catch (e) {
            setError(`Voice failed: ${(e as Error).message}`);
          }
        }

        // Escalate: 2 consecutive danger readings → open the emergency overlay.
        if (isDanger && dangerStreakRef.current >= 2 && !emergency) {
          openEmergency(incident);
        }
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('429')) {
        setError(
          "Gemini's free tier quota hit — waiting before the next check. " +
            'Pause and resume later, or add a fresh key.',
        );
        stop();
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  function clearIncidents() {
    setIncidents([]);
  }

  async function openEmergency(incident: Incident) {
    setEmergency({ incident, location: null, script: null, scriptBusy: true });

    // Try to get GPS coordinates (browser asks permission). Don't block.
    const locPromise = new Promise<GeolocationCoordinates | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos.coords),
        () => resolve(null),
        { timeout: 8000, maximumAge: 300_000 },
      );
    });

    const location = await locPromise;
    setEmergency((prev) => (prev ? { ...prev, location } : prev));

    // Generate the emergency call script via Gemini.
    try {
      const script = await generateEmergencyScript({
        target: settings.target,
        name: settings.childName,
        age: settings.childAge,
        roomContext: settings.roomContext,
        hazardDescription: incident.description,
        hazardType: incident.hazardType,
        location: location
          ? { latitude: location.latitude, longitude: location.longitude }
          : undefined,
      });
      setEmergency((prev) => (prev ? { ...prev, script, scriptBusy: false } : prev));
    } catch (e) {
      setError(`Emergency script: ${(e as Error).message}`);
      setEmergency((prev) => (prev ? { ...prev, scriptBusy: false } : prev));
    }
  }

  function closeEmergency() {
    setEmergency(null);
    dangerStreakRef.current = 0;
  }

  function replay(text: string) {
    if (!text) return;
    speak(text).catch((e) => setError((e as Error).message));
  }

  return (
    <div>
      <PageHeader
        eyebrow="For the child"
        title="GuardianWatch"
        description="An always-on AI guardian that watches the room and speaks to your child in your voice when it sees something risky."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowKeyDialog(true)}
              className="btn-secondary"
              title="Gemini API key"
            >
              <KeyRound className="h-4 w-4" />
              Key
            </button>
            {!running ? (
              <button onClick={start} className="btn-primary">
                <Play className="h-4 w-4" />
                Start watching
              </button>
            ) : (
              <button onClick={stop} className="btn-secondary">
                <Pause className="h-4 w-4" />
                Stop
              </button>
            )}
          </div>
        }
      />

      {error && (
        <div className="mb-5">
          <ErrorBanner message={error} />
        </div>
      )}
      {info && (
        <div className="mb-5">
          <InfoBanner message={info} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* Camera + live verdict */}
        <div className="card overflow-hidden p-0">
          <div className="relative aspect-[4/3] w-full bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full -scale-x-100 object-cover"
            />

            {!running && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white">
                <Shield
                  className="h-8 w-8"
                  style={{ color: 'var(--color-accent)' }}
                />
                <div className="text-[14px] font-bold">GuardianWatch is off</div>
                <div className="text-[12px] opacity-70">
                  Tap "Start watching" when you can't be in the room.
                </div>
              </div>
            )}

            {running && currentReport && (
              <VerdictBadge report={currentReport} busy={busy} />
            )}
          </div>

          {/* Settings */}
          <div
            className="border-t p-5"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div
              className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <Settings className="h-3 w-3" /> Context
            </div>
            {/* Watch target toggle */}
            <div className="mb-3 flex gap-2">
              <button
                onClick={() =>
                  setSettings({ ...settings, target: 'child', childAge: 4 })
                }
                className="card flex flex-1 items-center gap-2 p-3 text-left transition-colors"
                style={{
                  borderColor:
                    settings.target === 'child'
                      ? 'var(--color-accent)'
                      : 'var(--color-border)',
                  background:
                    settings.target === 'child'
                      ? 'var(--color-accent-soft)'
                      : 'var(--color-bg-card)',
                }}
              >
                <Baby
                  className="h-4 w-4 shrink-0"
                  style={{
                    color:
                      settings.target === 'child'
                        ? 'var(--color-accent)'
                        : 'var(--color-text-muted)',
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold">Child mode</div>
                  <div
                    className="text-[10px]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    Sharp objects, fire, choking, stairs
                  </div>
                </div>
              </button>
              <button
                onClick={() =>
                  setSettings({ ...settings, target: 'elder', childAge: 75 })
                }
                className="card flex flex-1 items-center gap-2 p-3 text-left transition-colors"
                style={{
                  borderColor:
                    settings.target === 'elder'
                      ? 'var(--color-accent)'
                      : 'var(--color-border)',
                  background:
                    settings.target === 'elder'
                      ? 'var(--color-accent-soft)'
                      : 'var(--color-bg-card)',
                }}
              >
                <UserRound
                  className="h-4 w-4 shrink-0"
                  style={{
                    color:
                      settings.target === 'elder'
                        ? 'var(--color-accent)'
                        : 'var(--color-text-muted)',
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold">Elder mode</div>
                  <div
                    className="text-[10px]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    Falls, chest pain, immobility
                  </div>
                </div>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>{settings.target === 'elder' ? 'Person name' : 'Child name'}</Label>
                <input
                  value={settings.childName}
                  onChange={(e) => setSettings({ ...settings, childName: e.target.value })}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-[13px] outline-none"
                  style={{
                    background: 'var(--color-bg-card)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
              <div>
                <Label>Age</Label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={settings.target === 'elder' ? 110 : 12}
                    value={settings.childAge}
                    onChange={(e) =>
                      setSettings({ ...settings, childAge: Number(e.target.value) })
                    }
                    className="flex-1 accent-[var(--color-accent)]"
                  />
                  <span className="w-10 text-[13px] font-bold">{settings.childAge}</span>
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label>Room / context</Label>
                <input
                  value={settings.roomContext}
                  onChange={(e) => setSettings({ ...settings, roomContext: e.target.value })}
                  placeholder={
                    settings.target === 'elder'
                      ? "bedroom, bathroom, kitchen..."
                      : 'kitchen, living room, bathroom...'
                  }
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-[13px] outline-none"
                  style={{
                    background: 'var(--color-bg-card)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Family contact phone (for WhatsApp alert)</Label>
                <input
                  value={settings.familyPhone}
                  onChange={(e) =>
                    setSettings({ ...settings, familyPhone: e.target.value })
                  }
                  placeholder="+1 415 555 0123"
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-[13px] outline-none"
                  style={{
                    background: 'var(--color-bg-card)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
              <label
                className="flex cursor-pointer items-center gap-2 text-[12px] sm:col-span-2"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <input
                  type="checkbox"
                  checked={settings.speakOnWarning}
                  onChange={(e) =>
                    setSettings({ ...settings, speakOnWarning: e.target.checked })
                  }
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
                <span>
                  <span
                    className="font-semibold"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    Speak to child in my voice
                  </span>{' '}
                  on warning/danger ({POLL_INTERVAL_MS / 1000}s polling)
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Right side: parent avatar + incident log */}
        <div className="flex flex-col gap-5">
          {profile ? (
            <div className="card flex flex-col items-center p-5">
              <ParentAvatar profile={profile} size={120} />
              <p
                className="mt-3 text-center text-[12px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                When GuardianWatch sees danger, your face glows here while it
                speaks the warning to your child in your voice.
              </p>
            </div>
          ) : (
            <div
              className="card p-5"
              style={{
                background: 'var(--color-accent-soft)',
                borderColor: 'var(--color-accent)',
              }}
            >
              <div className="mb-2 flex items-center gap-2 text-[13px] font-bold">
                <Mic className="h-4 w-4" /> Voice profile recommended
              </div>
              <p className="text-[12px]" style={{ color: 'var(--color-accent-text)' }}>
                GuardianWatch can speak warnings in any voice, but it's far more
                comforting for your child to hear YOU.
              </p>
              <Link to="/voice-setup" className="btn-primary mt-3">
                Set up voice
              </Link>
            </div>
          )}

          <div className="card overflow-hidden p-0">
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <h3 className="text-[14px] font-bold">Incidents</h3>
              {incidents.length > 0 && (
                <button
                  onClick={clearIncidents}
                  className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg-elevated)]"
                  title="Clear log"
                >
                  <Trash2
                    className="h-3.5 w-3.5"
                    style={{ color: 'var(--color-danger)' }}
                  />
                </button>
              )}
            </div>
            {incidents.length === 0 ? (
              <p
                className="px-5 py-6 text-center text-[12px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                No incidents yet. Logged warnings and dangers will appear here.
              </p>
            ) : (
              <ul className="max-h-[60vh] overflow-y-auto p-3">
                {incidents.map((i) => (
                  <li key={i.id}>
                    <IncidentRow incident={i} onReplay={() => replay(i.spoken)} />
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
        Safety: GuardianWatch is not a replacement for an adult in the room. It
        does not detect every hazard. Use it as an extra set of eyes for the few
        moments you must look away.
      </p>

      {showKeyDialog && (
        <GeminiKeyDialog
          onClose={() => setShowKeyDialog(false)}
          onSaved={(k) => {
            setHasKey(!!k.trim());
            if (k.trim() && !running) start();
          }}
        />
      )}

      {emergency && (
        <EmergencyOverlay
          incident={emergency.incident}
          location={emergency.location}
          script={emergency.script}
          scriptBusy={emergency.scriptBusy}
          settings={settings}
          onClose={closeEmergency}
        />
      )}
    </div>
  );
}

function EmergencyOverlay({
  incident,
  location,
  script,
  scriptBusy,
  settings,
  onClose,
}: {
  incident: Incident;
  location: GeolocationCoordinates | null;
  script: EmergencyScript | null;
  scriptBusy: boolean;
  settings: Settings;
  onClose: () => void;
}) {
  const targetLabel = settings.target === 'elder' ? 'older adult' : 'child';
  const locText = location
    ? `https://www.google.com/maps?q=${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`
    : '';

  function whatsappLink(): string {
    const lines = [
      `🚨 GuardianWatch alert (${settings.target.toUpperCase()})`,
      `${targetLabel}: ${settings.childName} (age ${settings.childAge})`,
      `Room: ${settings.roomContext}`,
      `Hazard: ${incident.hazardType.replace(/_/g, ' ')} — ${incident.description}`,
      `Time: ${incident.at.toLocaleString()}`,
    ];
    if (locText) lines.push(`Location: ${locText}`);
    lines.push('Please respond.');
    const text = encodeURIComponent(lines.join('\n'));
    const phone = settings.familyPhone.replace(/[^\d+]/g, '');
    return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
    >
      <div
        className="card relative w-full max-w-2xl overflow-hidden p-0"
        style={{ borderColor: 'var(--color-danger)' }}
      >
        {/* Red header */}
        <div
          className="flex items-center justify-between px-6 py-4 text-white"
          style={{ background: 'var(--color-danger)' }}
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            <h2 className="text-[18px] font-bold uppercase tracking-wide">
              Emergency escalation
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 transition-colors hover:bg-white/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[75vh] overflow-y-auto p-6">
          <p
            className="text-[13px] font-semibold"
            style={{ color: 'var(--color-danger)' }}
          >
            Repeated DANGER readings — escalation triggered.
          </p>

          {/* Snapshot + summary */}
          <div className="mt-4 flex gap-4">
            <img
              src={incident.thumbnail}
              alt="incident"
              className="h-28 w-40 shrink-0 -scale-x-100 rounded-lg border-2 object-cover"
              style={{ borderColor: 'var(--color-danger)' }}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-bold capitalize">
                {incident.hazardType.replace(/_/g, ' ')}
              </div>
              <p
                className="mt-0.5 text-[13px] leading-snug"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {incident.description}
              </p>
              <div
                className="mt-2 text-[12px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <strong>{settings.childName}</strong> · age {settings.childAge} ·{' '}
                {settings.roomContext} · {incident.at.toLocaleTimeString()}
              </div>
              {location && (
                <a
                  href={locText}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-[12px] underline"
                  style={{ color: 'var(--color-accent)' }}
                >
                  <MapPin className="h-3 w-3" />
                  {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                </a>
              )}
              {!location && (
                <div
                  className="mt-1.5 flex items-center gap-1 text-[11px]"
                  style={{ color: 'var(--color-text-subtle)' }}
                >
                  <MapPin className="h-3 w-3" /> No GPS — caller will speak the
                  address
                </div>
              )}
            </div>
          </div>

          {/* Emergency call script */}
          <div className="mt-5">
            <div
              className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <PhoneCall className="h-3 w-3" /> Read this to dispatch
            </div>
            {scriptBusy ? (
              <div
                className="rounded-xl border p-4 text-[12px]"
                style={{
                  background: 'var(--color-bg-elevated)',
                  borderColor: 'var(--color-border)',
                }}
              >
                Generating emergency call script via Gemini...
              </div>
            ) : script ? (
              <div
                className="rounded-xl border p-4"
                style={{
                  background: 'var(--color-bg-elevated)',
                  borderColor: 'var(--color-border)',
                }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div
                    className="flex items-center gap-1.5 text-[12px] font-bold"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Call <span className="text-[16px]">{script.call_number}</span>
                  </div>
                  <a
                    href={`tel:${script.call_number}`}
                    className="btn-primary"
                    style={{ background: 'var(--color-danger)' }}
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Tap to dial
                  </a>
                </div>
                <p className="text-[14px] font-semibold leading-snug">
                  {script.opening_line}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {script.facts.map((f, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[13px] leading-snug"
                    >
                      <span
                        className="mt-2 h-1 w-1 shrink-0 rounded-full"
                        style={{ background: 'var(--color-danger)' }}
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <p
                  className="mt-2 text-[12px] italic"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {script.closing_line}
                </p>
              </div>
            ) : (
              <div
                className="rounded-xl border p-4 text-[12px]"
                style={{
                  background: 'var(--color-bg-elevated)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-muted)',
                }}
              >
                Couldn't generate script. Call local emergency services
                immediately. Mention the room, hazard, and the person's age.
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={whatsappLink()}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
              style={{ background: '#25D366' }}
            >
              <Send className="h-4 w-4" />
              Send WhatsApp alert
            </a>
            {locText && (
              <a
                href={locText}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
              >
                <MapPin className="h-4 w-4" />
                Open in Maps
              </a>
            )}
            <button onClick={onClose} className="btn-secondary">
              <X className="h-4 w-4" />
              Dismiss
            </button>
          </div>

          <p
            className="mt-4 text-[11px]"
            style={{ color: 'var(--color-text-subtle)' }}
          >
            This is an AI-generated guess based on a single camera frame. Treat
            it as a prompt to look, not as proof. Call only if you confirm.
          </p>
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

function VerdictBadge({
  report,
  busy,
}: {
  report: HazardReport;
  busy: boolean;
}) {
  const style = SEVERITY_STYLE[report.severity];
  const Icon = style.icon;
  const isAlarming = report.severity === 'warning' || report.severity === 'danger';

  return (
    <div
      className={`absolute left-3 right-3 top-3 rounded-xl border-2 px-4 py-2.5 backdrop-blur-md ${
        isAlarming ? 'animate-pulse' : ''
      }`}
      style={{
        background: 'rgba(0,0,0,0.55)',
        borderColor: style.color,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: style.color }}
          >
            <Icon className="h-3 w-3" />
            {style.label} · {report.hazard_type.replace(/_/g, ' ')}
          </div>
          <div className="mt-0.5 truncate text-[13px] font-semibold text-white">
            {report.description || 'Watching...'}
          </div>
          {report.spoken_message && (
            <div
              className="mt-0.5 truncate text-[11px] italic"
              style={{ color: 'rgba(255,255,255,0.7)' }}
            >
              Speaking: "{report.spoken_message}"
            </div>
          )}
        </div>
        {busy && (
          <div
            className="shrink-0 text-[10px] font-bold"
            style={{ color: 'var(--color-accent)' }}
          >
            Thinking...
          </div>
        )}
      </div>
    </div>
  );
}

function IncidentRow({
  incident,
  onReplay,
}: {
  incident: Incident;
  onReplay: () => void;
}) {
  const style = SEVERITY_STYLE[incident.severity];
  const Icon = style.icon;
  return (
    <div
      className="mb-2 flex items-start gap-3 rounded-lg border p-3"
      style={{
        borderColor:
          incident.severity === 'danger'
            ? 'var(--color-danger)'
            : 'var(--color-border)',
        background: 'var(--color-bg-elevated)',
      }}
    >
      <img
        src={incident.thumbnail}
        alt={incident.description}
        className="h-14 w-20 shrink-0 -scale-x-100 rounded-md object-cover"
      />
      <div className="min-w-0 flex-1">
        <div
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: style.color }}
        >
          <Icon className="h-3 w-3" />
          {style.label} · {incident.hazardType.replace(/_/g, ' ')}
          <span
            className="ml-auto font-normal"
            style={{ color: 'var(--color-text-subtle)' }}
          >
            {incident.at.toLocaleTimeString()}
          </span>
        </div>
        <div className="mt-0.5 text-[12px] leading-snug">{incident.description}</div>
        {incident.spoken && (
          <div className="mt-1 flex items-center gap-1">
            <Volume2 className="h-3 w-3" style={{ color: 'var(--color-accent)' }} />
            <span
              className="text-[11px] italic"
              style={{ color: 'var(--color-text-muted)' }}
            >
              "{incident.spoken}"
            </span>
            <button
              onClick={onReplay}
              className="ml-1 rounded-md p-1 transition-colors hover:bg-[var(--color-bg-card)]"
              title="Play in parent's voice"
            >
              <RotateCw
                className="h-3 w-3"
                style={{ color: 'var(--color-accent)' }}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Suppress unused-import warning for icons referenced via SEVERITY_STYLE only.
export const __keepIconsAlive = [Camera];
