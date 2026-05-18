// Rule-based gesture classifier on top of MediaPipe Hands' 21 landmarks.
// Lightweight, instant, deterministic. Not a real ASL recognizer — but enough
// for the demo vocabulary that pairs well with our voice clone.
//
// MediaPipe Hands landmark indices:
//   0   wrist
//   1-4 thumb (CMC, MCP, IP, TIP)
//   5-8 index (MCP, PIP, DIP, TIP)
//   9-12  middle
//   13-16 ring
//   17-20 pinky
// Y axis grows DOWNWARD in image space.

import type { DetectedHand, Landmark } from './handTracker';

export type SignWord =
  | 'hello'
  | 'mama'
  | 'papa'
  | 'i love you'
  | 'food'
  | 'water'
  | 'sleep'
  | 'story'
  | 'hug'
  | 'yes'
  | 'no'
  | 'more'
  | 'stop'
  | 'please'
  | 'thank you'
  | 'help'
  | 'play'
  | 'happy'
  | 'unclear';

const FINGER_TIPS = [4, 8, 12, 16, 20];
const FINGER_PIPS = [3, 6, 10, 14, 18];

function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Is finger i extended? Compares tip to PIP joint distance from wrist. */
function fingerExtended(lm: Landmark[], finger: 0 | 1 | 2 | 3 | 4): boolean {
  const tip = lm[FINGER_TIPS[finger]];
  const pip = lm[FINGER_PIPS[finger]];
  const wrist = lm[0];
  if (finger === 0) {
    // Thumb: judge by x-distance from index MCP since thumb extends sideways
    const indexMcp = lm[5];
    return Math.abs(tip.x - indexMcp.x) > Math.abs(pip.x - indexMcp.x);
  }
  return dist(tip, wrist) > dist(pip, wrist) * 1.05;
}

type ExtendedFlags = {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
};

function extendedFlags(lm: Landmark[]): ExtendedFlags {
  return {
    thumb: fingerExtended(lm, 0),
    index: fingerExtended(lm, 1),
    middle: fingerExtended(lm, 2),
    ring: fingerExtended(lm, 3),
    pinky: fingerExtended(lm, 4),
  };
}

/** Roughly: are tip and PIP above wrist (tip.y less than wrist.y in image)? */
function fingerPointsUp(lm: Landmark[], finger: 0 | 1 | 2 | 3 | 4): boolean {
  return lm[FINGER_TIPS[finger]].y < lm[0].y - 0.08;
}

function fingerPointsDown(lm: Landmark[], finger: 0 | 1 | 2 | 3 | 4): boolean {
  return lm[FINGER_TIPS[finger]].y > lm[0].y + 0.08;
}

function handCenter(lm: Landmark[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (const p of lm) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / lm.length, y: sy / lm.length };
}

export function classifyGesture(hands: DetectedHand[]): {
  word: SignWord;
  confidence: number;
  reason: string;
} {
  if (hands.length === 0) {
    return { word: 'unclear', confidence: 0, reason: 'no hand detected' };
  }

  // TWO-HAND GESTURES first ------------------------------------
  if (hands.length >= 2) {
    const [h1, h2] = hands;
    const c1 = handCenter(h1.landmarks);
    const c2 = handCenter(h2.landmarks);
    const sep = Math.hypot(c1.x - c2.x, c1.y - c2.y);

    // Hands together / crossed at chest → "i love you" or "hug"
    if (sep < 0.18) {
      const f1 = extendedFlags(h1.landmarks);
      const f2 = extendedFlags(h2.landmarks);
      // Open palms together = hug
      if (
        f1.index && f1.middle && f1.ring &&
        f2.index && f2.middle && f2.ring
      ) {
        return { word: 'hug', confidence: 0.85, reason: 'open palms together' };
      }
      // Otherwise interpret as "i love you"
      return { word: 'i love you', confidence: 0.8, reason: 'hands together at chest' };
    }

    // Both hands open palms raised high → "happy" / "play"
    if (
      c1.y < 0.4 && c2.y < 0.4 &&
      hands.every((h) => {
        const f = extendedFlags(h.landmarks);
        return f.index && f.middle && f.ring && f.pinky;
      })
    ) {
      return { word: 'happy', confidence: 0.78, reason: 'both palms raised' };
    }
  }

  // SINGLE-HAND GESTURES -----------------------------------------
  const h = hands[0];
  const lm = h.landmarks;
  const f = extendedFlags(lm);

  // Thumbs up — thumb extended, others curled, thumb tip above wrist
  if (f.thumb && !f.index && !f.middle && !f.ring && !f.pinky && fingerPointsUp(lm, 0)) {
    return { word: 'yes', confidence: 0.92, reason: 'thumbs up' };
  }

  // Thumbs down — thumb extended, others curled, thumb tip below wrist
  if (f.thumb && !f.index && !f.middle && !f.ring && !f.pinky && fingerPointsDown(lm, 0)) {
    return { word: 'no', confidence: 0.9, reason: 'thumbs down' };
  }

  // Open palm, all 5 fingers extended → "stop" (if pointing up) or "hello" (if waving)
  if (f.thumb && f.index && f.middle && f.ring && f.pinky) {
    if (fingerPointsUp(lm, 2)) {
      return { word: 'stop', confidence: 0.85, reason: 'open palm raised' };
    }
    return { word: 'hello', confidence: 0.85, reason: 'open palm' };
  }

  // Closed fist (no fingers extended) → "more"
  if (!f.thumb && !f.index && !f.middle && !f.ring && !f.pinky) {
    return { word: 'more', confidence: 0.78, reason: 'closed fist' };
  }

  // Index finger only → pointing → "stop" if up, "papa" if forward
  if (!f.thumb && f.index && !f.middle && !f.ring && !f.pinky) {
    if (fingerPointsUp(lm, 1)) {
      return { word: 'help', confidence: 0.75, reason: 'index finger raised' };
    }
    return { word: 'papa', confidence: 0.68, reason: 'pointing' };
  }

  // Index + middle (peace sign / "V") → "happy" / "play"
  if (!f.thumb && f.index && f.middle && !f.ring && !f.pinky) {
    return { word: 'play', confidence: 0.8, reason: 'peace sign' };
  }

  // Index + middle + ring (three fingers up) → "water" (W in ASL)
  if (!f.thumb && f.index && f.middle && f.ring && !f.pinky) {
    return { word: 'water', confidence: 0.78, reason: 'three fingers up (W)' };
  }

  // Pinky only → "no" (small)
  if (!f.thumb && !f.index && !f.middle && !f.ring && f.pinky) {
    return { word: 'no', confidence: 0.65, reason: 'pinky only' };
  }

  // Thumb + index ("L" shape) → "love"
  if (f.thumb && f.index && !f.middle && !f.ring && !f.pinky) {
    return { word: 'i love you', confidence: 0.7, reason: 'L shape (ILY without pinky)' };
  }

  // ASL "I love you" — thumb + index + pinky (middle + ring curled)
  if (f.thumb && f.index && !f.middle && !f.ring && f.pinky) {
    return { word: 'i love you', confidence: 0.95, reason: 'ASL "I love you"' };
  }

  // Hand near the mouth (y small ~ near top of image) with closed fist → food
  const center = handCenter(lm);
  if (center.y < 0.4 && !f.middle && !f.ring) {
    return { word: 'food', confidence: 0.6, reason: 'hand near mouth' };
  }

  // Hand near cheek with open palm → sleep
  if (center.y > 0.3 && center.y < 0.7 && f.index && f.middle) {
    return { word: 'sleep', confidence: 0.55, reason: 'hand near cheek' };
  }

  return { word: 'unclear', confidence: 0.3, reason: 'no rule matched' };
}

/** Spoken text for the matched word. Slightly different from the bare label. */
export function spokenFor(word: SignWord): string {
  const phrases: Record<SignWord, string> = {
    hello: 'Hello!',
    mama: 'Mama is here.',
    papa: 'Papa is here.',
    'i love you': 'I love you.',
    food: 'I want some food.',
    water: 'I would like some water.',
    sleep: 'Time to sleep.',
    story: 'Story time!',
    hug: 'Come give me a hug.',
    yes: 'Yes.',
    no: 'No.',
    more: 'More, please.',
    stop: 'Stop, please.',
    please: 'Please.',
    'thank you': 'Thank you.',
    help: 'I need help.',
    play: 'Let’s play!',
    happy: 'I am so happy!',
    unclear: '',
  };
  return phrases[word];
}
