import { speak as apiSpeak } from './api';

export type VoiceProfile = {
  voiceId: string;
  displayName: string;
  matchScore: number;
  accent: string;
  personality: string;
  parentName: string;
  photoDataUrl?: string;
};

const KEY = 'nurturelink.profile.v1';

export function loadProfile(): VoiceProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VoiceProfile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: VoiceProfile): void {
  localStorage.setItem(KEY, JSON.stringify(profile));
  window.dispatchEvent(new CustomEvent('profile:changed', { detail: profile }));
}

export function clearProfile(): void {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent('profile:changed', { detail: null }));
}

// One shared audio element for the whole app so we never overlap playback.
let audio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let amplitudeRaf: number | null = null;

function broadcastAmplitude() {
  if (!analyser) return;
  const buf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / buf.length);
  window.dispatchEvent(new CustomEvent('voice:amplitude', { detail: rms }));
  amplitudeRaf = requestAnimationFrame(broadcastAmplitude);
}

function stopAmplitudeLoop() {
  if (amplitudeRaf) cancelAnimationFrame(amplitudeRaf);
  amplitudeRaf = null;
  window.dispatchEvent(new CustomEvent('voice:amplitude', { detail: 0 }));
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  audio.crossOrigin = 'anonymous';

  audio.addEventListener('play', () => {
    // Lazy-init Web Audio graph for amplitude broadcast.
    if (!audioCtx) {
      try {
        const Ctor =
          (window as unknown as { AudioContext?: typeof AudioContext })
            .AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (Ctor && audio) {
          audioCtx = new Ctor();
          const source = audioCtx.createMediaElementSource(audio);
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          analyser.connect(audioCtx.destination);
        }
      } catch {
        /* analyser not critical, ignore */
      }
    }
    audioCtx?.resume();
    if (analyser && !amplitudeRaf) broadcastAmplitude();
    window.dispatchEvent(new CustomEvent('voice:start'));
  });
  audio.addEventListener('ended', () => {
    cleanupUrl();
    stopAmplitudeLoop();
    window.dispatchEvent(new CustomEvent('voice:end'));
  });
  audio.addEventListener('pause', () => {
    stopAmplitudeLoop();
    window.dispatchEvent(new CustomEvent('voice:end'));
  });

  return audio;
}

function cleanupUrl() {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

export async function speak(text: string, voiceIdOverride?: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const profile = loadProfile();
  const voiceId = voiceIdOverride ?? profile?.voiceId;
  if (!voiceId) {
    throw new Error('No voice profile set. Visit Voice Setup first.');
  }

  const blob = await apiSpeak(trimmed, voiceId);
  const url = URL.createObjectURL(blob);

  const el = ensureAudio();
  el.pause();
  cleanupUrl();
  currentObjectUrl = url;
  el.src = url;
  await el.play();
}

export function stopSpeaking(): void {
  audio?.pause();
  cleanupUrl();
}

export function isSpeaking(): boolean {
  return !!audio && !audio.paused;
}
