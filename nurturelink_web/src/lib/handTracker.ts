// Thin wrapper around MediaPipe Hands loaded via <script> in index.html.
// Detects 21 landmarks per hand at ~30 fps in the browser. Free, instant.

export type Landmark = { x: number; y: number; z: number };
export type Handedness = 'Left' | 'Right';
export type DetectedHand = {
  landmarks: Landmark[]; // 21 points, normalized 0..1 in image space
  handedness: Handedness;
  score: number;
};

type MpHandsResults = {
  multiHandLandmarks?: Landmark[][];
  multiHandedness?: { label: Handedness; score: number; index: number }[];
};

type MpHands = {
  setOptions: (opts: Record<string, unknown>) => void;
  send: (input: { image: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement }) => Promise<void>;
  onResults: (cb: (r: MpHandsResults) => void) => void;
  close: () => Promise<void>;
};

type MpHandsCtor = new (config: {
  locateFile: (file: string) => string;
}) => MpHands;

declare global {
  interface Window {
    Hands?: MpHandsCtor;
  }
}

async function awaitMediaPipe(timeoutMs = 8000): Promise<MpHandsCtor> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (typeof window !== 'undefined' && window.Hands) return window.Hands;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    'MediaPipe Hands did not load. Check internet — the script comes from cdn.jsdelivr.net.',
  );
}

export type HandTracker = {
  start: (video: HTMLVideoElement) => Promise<void>;
  stop: () => Promise<void>;
};

const CDN_PREFIX = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/';

export async function createHandTracker(
  onHands: (hands: DetectedHand[]) => void,
): Promise<HandTracker> {
  const Hands = await awaitMediaPipe();
  const hands = new Hands({
    locateFile: (file: string) => `${CDN_PREFIX}${file}`,
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 0, // fastest model
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });

  hands.onResults((r) => {
    const out: DetectedHand[] = [];
    const lm = r.multiHandLandmarks ?? [];
    const hd = r.multiHandedness ?? [];
    for (let i = 0; i < lm.length; i++) {
      out.push({
        landmarks: lm[i],
        handedness: hd[i]?.label ?? 'Right',
        score: hd[i]?.score ?? 0,
      });
    }
    onHands(out);
  });

  let rafId: number | null = null;
  let running = false;

  async function loop(video: HTMLVideoElement) {
    if (!running) return;
    if (video.readyState >= 2) {
      try {
        await hands.send({ image: video });
      } catch {
        /* swallow, keep looping */
      }
    }
    rafId = requestAnimationFrame(() => loop(video));
  }

  return {
    async start(video) {
      running = true;
      await loop(video);
    },
    async stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      try {
        await hands.close();
      } catch {
        /* ignore */
      }
    },
  };
}
