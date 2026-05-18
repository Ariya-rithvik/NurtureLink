// All backend calls live here. Base URL configurable via VITE_BACKEND_URL.

const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ??
  'http://127.0.0.1:8000';

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Backend ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// -------- Voice --------

export type Voice = {
  id: string;
  display_name: string;
  gender: string;
  age_band: string;
  pitch_hint: number;
  personality: string;
  accent: string;
};

export type VoiceAnalysis = {
  mean_pitch_hz: number;
  pitch_std_hz: number;
  estimated_gender: string;
  speaking_rate_per_sec: number;
  duration_sec: number;
};

export type VoiceMatchResponse = {
  matched_voice_id: string;
  match_score: number;
  analysis: VoiceAnalysis;
  alternatives: (Voice & { match_score: number })[];
};

export async function listVoices(): Promise<Voice[]> {
  const res = await fetch(`${BACKEND_URL}/voice/profiles`);
  const data = await asJson<{ voices: Voice[] }>(res);
  return data.voices;
}

export async function matchVoice(blob: Blob): Promise<VoiceMatchResponse> {
  const form = new FormData();
  form.append('audio', blob, 'voice_sample.webm');
  const res = await fetch(`${BACKEND_URL}/voice/match`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(60 * 1000),
  });
  return asJson<VoiceMatchResponse>(res);
}

export async function speak(text: string, voiceId: string): Promise<Blob> {
  const res = await fetch(`${BACKEND_URL}/voice/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id: voiceId }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Speak ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.blob();
}

// -------- Sign --------

export type SignResult = {
  recognized_sign: string;
  confidence: number;
  spoken_text: string;
  visual_cues: string[];
};

export async function analyzeSign(
  imageBlob: Blob,
  language = 'English',
): Promise<SignResult> {
  const form = new FormData();
  form.append('image', imageBlob, 'sign.jpg');
  form.append('language', language);
  const res = await fetch(`${BACKEND_URL}/analyze/sign`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  return asJson<SignResult>(res);
}

// -------- Story --------

export type StoryScene = {
  scene_number: number;
  narration: string;
  illustration: string;
};

export type Story = {
  title: string;
  scenes: StoryScene[];
  closing_line: string;
  safety_note: string;
};

export async function generateStory(payload: {
  child_age_years: number;
  theme: string;
  parent_voice_note?: string;
  language?: string;
}): Promise<Story> {
  const res = await fetch(`${BACKEND_URL}/story/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: 'English', parent_voice_note: '', ...payload }),
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  return asJson<Story>(res);
}

// -------- Cry classifier --------

export type CryPrediction = { label: string; score: number };

export type CryResult = {
  top_label: string;
  confidence: number;
  model_id: string;
  predictions: CryPrediction[];
};

export async function analyzeCryOnly(audioBlob: Blob): Promise<CryResult> {
  const form = new FormData();
  form.append('audio', audioBlob, 'cry.webm');
  const res = await fetch(`${BACKEND_URL}/analyze/cry-only`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(2 * 60 * 1000),
  });
  return asJson<CryResult>(res);
}

// -------- Parent bridge --------

export type ParentBridgeAssessment = {
  likely_need: string;
  confidence: number;
  distress_level: number;
  audio_evidence: string[];
  vision_evidence: string[];
  context_evidence: string[];
  parent_message: string;
  suggested_action: string;
  safety_note: string;
};

export async function analyzeParentBridge(payload: {
  audio: Blob;
  image: Blob;
  lastFedMinutes: number;
  lastDiaperMinutes: number;
  language?: string;
}): Promise<ParentBridgeAssessment> {
  const form = new FormData();
  form.append('audio', payload.audio, 'cry.webm');
  form.append('image', payload.image, 'baby.jpg');
  form.append('last_fed_minutes_ago', String(payload.lastFedMinutes));
  form.append('last_diaper_minutes_ago', String(payload.lastDiaperMinutes));
  form.append('language', payload.language ?? 'English');
  const res = await fetch(`${BACKEND_URL}/analyze/parent-bridge`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  return asJson<ParentBridgeAssessment>(res);
}

// -------- Child voice check-in --------

export type ChildCheckin = {
  id: string;
  timestamp: string;
  status: string;
  confidence: number;
  emotional_state: string;
  visual_cues: string[];
  changes_detected: string[];
  caregiver_message: string;
  suggested_action: string;
  safety_note: string;
};

export async function analyzeChildVoice(payload: {
  image: Blob;
  childAgeYears: number;
  communicationStyle: string;
  caregiverConcern: string;
  language?: string;
}): Promise<ChildCheckin> {
  const form = new FormData();
  form.append('image', payload.image, 'child.jpg');
  form.append('child_age_years', String(payload.childAgeYears));
  form.append('communication_style', payload.communicationStyle);
  form.append('caregiver_concern', payload.caregiverConcern);
  form.append('language', payload.language ?? 'English');
  const res = await fetch(`${BACKEND_URL}/analyze/child-voice`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  return asJson<ChildCheckin>(res);
}

export const apiBaseUrl = BACKEND_URL;

// -------- Image illustrations (Pollinations.ai — free, no key) --------

const ILLUSTRATION_STYLE =
  'soft watercolor childrens book illustration, gentle, warm pastel colors, cozy, kind, dreamy, low contrast, no text, no words';

export function illustrationUrl(prompt: string, seed: number, size = 720): string {
  const enriched = `${prompt}. ${ILLUSTRATION_STYLE}`;
  const encoded = encodeURIComponent(enriched.slice(0, 500));
  // Default Pollinations model returns in ~2s. flux takes 90s+ (browser times out).
  return `https://image.pollinations.ai/prompt/${encoded}?width=${size}&height=${Math.round(size * 0.66)}&nologo=true&seed=${seed}`;
}

