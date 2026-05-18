// Lightweight Gemini REST client. The user provides their own API key
// (from Google AI Studio at aistudio.google.com) so we never embed one.
// We use the public REST endpoint directly — no SDK needed.

const KEY_STORAGE = 'nurturelink.geminiKey.v1';

// Free-tier quotas are separate per model. gemini-2.5-flash has more
// generous limits on the free tier as of May 2026.
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

export function getGeminiKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function setGeminiKey(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) {
    localStorage.removeItem(KEY_STORAGE);
  } else {
    localStorage.setItem(KEY_STORAGE, trimmed);
  }
  window.dispatchEvent(new CustomEvent('gemini:keyChanged'));
}

export function hasGeminiKey(): boolean {
  return !!getGeminiKey();
}

export type GazeGuess = {
  row: number;
  col: number;
  confidence: number;
  reason?: string;
};

/** Render the grid into an ASCII table for the prompt. */
function describeGrid(grid: string[][]): string {
  const rows = grid
    .map((row, r) => `Row ${r}: ${row.map((p, c) => `[${r},${c}] ${p}`).join(' | ')}`)
    .join('\n');
  return rows;
}

async function blobToBase64(blob: Blob): Promise<{ base64: string; mimeType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
  return {
    base64: dataUrl.split(',')[1],
    mimeType: blob.type || 'image/jpeg',
  };
}

function buildPrompt(grid: string[][]): string {
  const maxRow = grid.length - 1;
  const maxCol = (grid[0]?.length ?? 1) - 1;
  return `Look at this webcam frame. The user is sitting in front of a screen with a
phrase-tile grid (top-left = [0,0], bottom-right = [${maxRow},${maxCol}]).
Decide which tile they are most likely looking at based on head & eye direction.

The webcam image is mirrored: user's RIGHT appears on the LEFT of the image.
So if their eyes/head point to the LEFT of the image, they are looking at the
RIGHT side of the grid (higher col).

Grid contents:
${describeGrid(grid)}

Fill the response schema:
- row: integer 0..${maxRow}, or -1 if you can't tell
- col: integer 0..${maxCol}, or -1 if you can't tell
- confidence: 0.0..1.0 — how sure are you
- reason: one short phrase about what you saw`;
}

/** Call one Gemini model and parse the gaze JSON. May throw 429 etc. */
async function callGeminiModel(
  model: string,
  key: string,
  prompt: string,
  base64: string,
  mimeType: string,
  signal: AbortSignal | undefined,
): Promise<GazeGuess> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    key,
  )}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 256,
      responseMimeType: 'application/json',
      // Force structured output. Without this gemini-2.5-flash sometimes
      // emits a "Here is the JSON requested" preamble that eats the token
      // budget.
      responseSchema: {
        type: 'OBJECT',
        properties: {
          row: { type: 'INTEGER' },
          col: { type: 'INTEGER' },
          confidence: { type: 'NUMBER' },
          reason: { type: 'STRING' },
        },
        required: ['row', 'col', 'confidence'],
      },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const txt = await res.text();
    const err = new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  const data = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
  };
  const cand = data.candidates?.[0];
  const raw = cand?.content?.parts?.[0]?.text ?? '';

  // With responseSchema set, Gemini usually returns clean JSON. But it may
  // still wrap with ``` fences or a preamble. Strip both, then look for the
  // last complete {...} block (in case the answer was truncated).
  const cleaned = raw.replace(/```json|```/g, '').trim();
  let jsonStr = cleaned;
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    jsonStr = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(jsonStr) as GazeGuess;
  } catch {
    const finish = cand?.finishReason ? ` (finishReason=${cand.finishReason})` : '';
    throw new Error(
      `Gemini returned non-JSON${finish}: ${raw.slice(0, 200) || '(empty response)'}`,
    );
  }
}

/**
 * Ask Gemini Vision to look at a webcam frame and guess which grid tile the
 * user is looking at. Automatically tries fallback models if the primary is
 * rate-limited (429) or unavailable (404).
 */
export async function guessGazeFromImage(
  imageBlob: Blob,
  grid: string[][],
  opts: { model?: string; signal?: AbortSignal } = {},
): Promise<GazeGuess> {
  const key = getGeminiKey();
  if (!key) throw new Error('No Gemini API key configured.');

  const { base64, mimeType } = await blobToBase64(imageBlob);
  const prompt = buildPrompt(grid);

  const models = opts.model
    ? [opts.model, ...FALLBACK_MODELS.filter((m) => m !== opts.model)]
    : [...FALLBACK_MODELS];

  let lastError: Error | null = null;
  for (const model of models) {
    try {
      const parsed = await callGeminiModel(model, key, prompt, base64, mimeType, opts.signal);
      const rows = grid.length;
      const cols = grid[0]?.length ?? 0;
      return {
        row: clamp(Number(parsed.row ?? -1), -1, rows - 1),
        col: clamp(Number(parsed.col ?? -1), -1, cols - 1),
        confidence: clamp(Number(parsed.confidence ?? 0), 0, 1),
        reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
      };
    } catch (e) {
      const err = e as Error & { status?: number };
      lastError = err;
      // Retry on 429 (quota) or 404 (model not available for this key).
      if (err.status === 429 || err.status === 404) {
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error('All Gemini models failed.');
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return -1;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

// -------- GuardianWatch: child hazard detection --------

export type HazardSeverity = 'safe' | 'info' | 'warning' | 'danger';

export type HazardReport = {
  severity: HazardSeverity;
  hazard_type: string; // "sharp_object" | "heat" | "toxic" | "fall" | "stranger" | "distress" | "none" | ...
  description: string;
  spoken_message: string; // calm, child-directed sentence to play in parent's voice
};

const HAZARD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    severity: { type: 'STRING', enum: ['safe', 'info', 'warning', 'danger'] },
    hazard_type: { type: 'STRING' },
    description: { type: 'STRING' },
    spoken_message: { type: 'STRING' },
  },
  required: ['severity', 'hazard_type', 'description', 'spoken_message'],
};

export type WatchTarget = 'child' | 'elder';

function buildGuardianPrompt(
  age: number,
  name: string,
  roomContext: string,
  target: WatchTarget,
): string {
  if (target === 'elder') {
    return `You are GuardianWatch — a calm AI watching over an older adult while their
family caregiver isn't in the room. You see one webcam frame.

Person name: ${name || 'the person'}
Approximate age: ${age} years
Room / context: ${roomContext || 'unspecified'}

Watch for these conditions, in order of priority:
1. DANGER: fallen on floor, lying motionless, slumped over, hand clutching chest
   (possible cardiac), face down, head injury / blood, choking (hand at throat),
   unconscious (eyes closed + unnatural posture), stove fire / smoke.
2. WARNING: unsteady standing / leaning hard on furniture, sitting on floor and
   unable to rise, prolonged head-down / nodding-off posture in a dangerous spot,
   medication confusion (multiple pills out), wandering toward exits.
3. INFO: small risk that just deserves attention.
4. SAFE: relaxed sitting, walking normally, eating, reading, sleeping in bed.

For severity "danger" / "warning", the spoken_message must be:
- 10–20 words
- Calm, respectful, warm — this will be played in their family caregiver's voice
- A direct question or instruction first (e.g. "Mom, are you okay? I'm calling someone.")
- Use their name if natural

If "safe", return spoken_message "". Never invent panic. Never mention "AI".

Return JSON matching the schema.`;
  }

  return `You are GuardianWatch — a calm AI watching over a child while their parent
isn't in the room. You see one webcam frame.

Child name: ${name || 'the child'}
Child age: ${age} years
Room / context: ${roomContext || 'unspecified'}

Look for hazards or distress, in order of priority:
1. DANGER: open fire/stove, sharp objects in hands/mouth, climbing high furniture,
   near pool/water alone, choking, unconscious, hand on chest, bleeding, stranger.
2. WARNING: small objects near mouth, electronics being chewed, running with stick,
   reaching for chemicals/medicine, near edge of bed/sofa, on stairs.
3. INFO: gently risky behaviour worth noting but not urgent.
4. SAFE: nothing concerning.

If you see nothing concerning, return severity "safe" and spoken_message "".

For severity "danger" / "warning", the spoken_message must be:
- 8–18 words
- Calm, loving tone (this will be played in the child's parent's own voice)
- Direct instruction (e.g. "Sweetie, please put down the knife. Mama is coming.")
- Use the child's name if natural

Never invent panic. Never mention "AI". Speak as if the parent is speaking.

Return JSON matching the schema.`;
}

export async function detectHazard(
  imageBlob: Blob,
  age: number,
  name: string,
  roomContext: string,
  opts: { model?: string; signal?: AbortSignal; target?: WatchTarget } = {},
): Promise<HazardReport> {
  const key = getGeminiKey();
  if (!key) throw new Error('No Gemini API key configured.');

  const { base64, mimeType } = await blobToBase64(imageBlob);
  const prompt = buildGuardianPrompt(age, name, roomContext, opts.target ?? 'child');

  const models = opts.model
    ? [opts.model, ...FALLBACK_MODELS.filter((m) => m !== opts.model)]
    : [...FALLBACK_MODELS];

  let lastError: Error | null = null;
  for (const model of models) {
    try {
      const result = await callGeminiHazard(model, key, prompt, base64, mimeType, opts.signal);
      return normalizeHazard(result);
    } catch (e) {
      const err = e as Error & { status?: number };
      lastError = err;
      if (err.status === 429 || err.status === 404) continue;
      throw err;
    }
  }
  throw lastError ?? new Error('All Gemini models failed.');
}

async function callGeminiHazard(
  model: string,
  key: string,
  prompt: string,
  base64: string,
  mimeType: string,
  signal: AbortSignal | undefined,
): Promise<Partial<HazardReport>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    key,
  )}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 256,
      responseMimeType: 'application/json',
      responseSchema: HAZARD_SCHEMA,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const txt = await res.text();
    const err = new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  };
  const cand = data.candidates?.[0];
  const raw = cand?.content?.parts?.[0]?.text ?? '';
  const cleaned = raw.replace(/```json|```/g, '').trim();

  if (!cleaned) {
    const finish = cand?.finishReason ? ` finishReason=${cand.finishReason}` : '';
    throw new Error(`Gemini returned empty response.${finish}`);
  }

  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  const jsonStr = first >= 0 && last > first ? cleaned.slice(first, last + 1) : cleaned;

  try {
    return JSON.parse(jsonStr) as Partial<HazardReport>;
  } catch {
    throw new Error(`Gemini returned malformed JSON: ${cleaned.slice(0, 120)}`);
  }
}

// -------- Emergency call script --------

export type EmergencyScript = {
  call_number: string; // e.g. "911", "108", "112"
  opening_line: string;
  facts: string[]; // bulleted facts to recite
  closing_line: string;
};

const EMERGENCY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    call_number: { type: 'STRING' },
    opening_line: { type: 'STRING' },
    facts: { type: 'ARRAY', items: { type: 'STRING' } },
    closing_line: { type: 'STRING' },
  },
  required: ['call_number', 'opening_line', 'facts', 'closing_line'],
};

export async function generateEmergencyScript(payload: {
  target: WatchTarget;
  name: string;
  age: number;
  roomContext: string;
  hazardDescription: string;
  hazardType: string;
  location?: { latitude: number; longitude: number };
  countryHint?: string;
}): Promise<EmergencyScript> {
  const key = getGeminiKey();
  if (!key) throw new Error('No Gemini API key configured.');

  const targetLabel = payload.target === 'elder' ? 'older adult' : 'young child';

  const locText = payload.location
    ? `Approximate GPS: ${payload.location.latitude.toFixed(5)}, ${payload.location.longitude.toFixed(5)}.`
    : 'GPS not available — caller will speak the address.';

  const prompt = `Write a short emergency call script that a panicked family member could
read out loud to dispatch.

Situation: a ${targetLabel} named ${payload.name || 'the person'} (age ${payload.age})
was just observed by an AI camera in their ${payload.roomContext || 'home'}.
Hazard: ${payload.hazardType} — ${payload.hazardDescription}.
${locText}
Country hint: ${payload.countryHint || 'unspecified — choose 112 / 911 / 108 by region or default to local emergency number'}.

Schema:
- call_number: the local emergency number (911 US, 999 UK, 112 EU, 108 India, etc.)
- opening_line: the first sentence to say (clear and short)
- facts: 4–7 short bullet facts in the order to say them (who, where, what, how long, special needs)
- closing_line: what to say while waiting

Keep total under 90 words. Use clear simple language a stressed person can read.`;

  const models = [...FALLBACK_MODELS];
  let lastError: Error | null = null;
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
        key,
      )}`;
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 400,
          responseMimeType: 'application/json',
          responseSchema: EMERGENCY_SCHEMA,
        },
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        const err = new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const first = cleaned.indexOf('{');
      const last = cleaned.lastIndexOf('}');
      const jsonStr = first >= 0 && last > first ? cleaned.slice(first, last + 1) : cleaned;
      return JSON.parse(jsonStr) as EmergencyScript;
    } catch (e) {
      lastError = e as Error;
      const status = (e as Error & { status?: number }).status;
      if (status === 429 || status === 404) continue;
      throw e;
    }
  }
  throw lastError ?? new Error('All Gemini models failed.');
}

const ALLOWED_SEVERITIES: HazardSeverity[] = ['safe', 'info', 'warning', 'danger'];
function normalizeHazard(p: Partial<HazardReport>): HazardReport {
  let severity = (p.severity ?? 'safe').toLowerCase() as HazardSeverity;
  if (!ALLOWED_SEVERITIES.includes(severity)) severity = 'safe';
  return {
    severity,
    hazard_type: p.hazard_type?.toString().toLowerCase().replace(/\s+/g, '_') || 'none',
    description: p.description?.toString() || '',
    spoken_message:
      severity === 'safe' ? '' : (p.spoken_message?.toString() || '').slice(0, 240),
  };
}
