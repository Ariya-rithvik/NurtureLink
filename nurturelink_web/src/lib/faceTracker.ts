// MediaPipe Face Landmarker — Google's free in-browser face + iris detector.
// 478 landmarks per face, includes iris positions. We compute gaze direction
// from iris position relative to eye corners (IRIS mode) OR from nose vs face
// centroid (HEAD mode, adapted from tanhanwei/Nutshell MIT). One-Euro filter
// smooths the output in both modes.

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { OneEuro2D } from './oneEuroFilter';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10/wasm';

// Iris + eye corners (MediaPipe FaceMesh).
const LEFT_IRIS_CENTER = 468;
const LEFT_EYE_INNER = 133;
const LEFT_EYE_OUTER = 33;
const LEFT_EYE_TOP = 159;
const LEFT_EYE_BOTTOM = 145;
const RIGHT_IRIS_CENTER = 473;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;
const RIGHT_EYE_TOP = 386;
const RIGHT_EYE_BOTTOM = 374;

// Head-pose landmarks
const NOSE_TIP = 1;
const FACE_LEFT = 234; // user's right cheek
const FACE_RIGHT = 454; // user's left cheek
const FACE_TOP = 10; // forehead
const FACE_BOTTOM = 152; // chin

export type GazeMode = 'iris' | 'head';

export type GazeVector = {
  x: number; // -1..+1 (subject-perspective right = +)
  y: number; // -1..+1 (down = +)
  confidence: number; // 0..1
  mode: GazeMode;
};

export type FaceTracker = {
  start: (video: HTMLVideoElement, onGaze: (g: GazeVector) => void) => Promise<void>;
  stop: () => Promise<void>;
  setMode: (m: GazeMode) => void;
  /** Capture current head/iris pose as the "looking at center" baseline. */
  calibrateCenter: () => void;
};

type Point = { x: number; y: number };

let landmarker: FaceLandmarker | null = null;
let initPromise: Promise<FaceLandmarker> | null = null;

async function getLandmarker(): Promise<FaceLandmarker> {
  if (landmarker) return landmarker;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE);
    const lm = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
    landmarker = lm;
    return lm;
  })();
  return initPromise;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
}

// -------- IRIS mode --------

function computeIrisGaze(result: FaceLandmarkerResult): GazeVector | null {
  const faces = result.faceLandmarks;
  if (!faces || faces.length === 0) return null;
  const lm = faces[0];
  if (!lm[LEFT_IRIS_CENTER] || !lm[RIGHT_IRIS_CENTER]) return null;

  function eyeRatio(
    iris: Point,
    inner: Point,
    outer: Point,
    top: Point,
    bottom: Point,
  ): { h: number; v: number; open: number } {
    const dx = outer.x - inner.x;
    const dy = bottom.y - top.y;
    const eyeOpen = Math.abs(dy) / Math.max(0.001, Math.abs(dx));
    const ih = (iris.x - inner.x) / (dx || 0.001);
    const iv = (iris.y - top.y) / (dy || 0.001);
    return { h: ih, v: iv, open: eyeOpen };
  }

  const left = eyeRatio(
    lm[LEFT_IRIS_CENTER],
    lm[LEFT_EYE_INNER],
    lm[LEFT_EYE_OUTER],
    lm[LEFT_EYE_TOP],
    lm[LEFT_EYE_BOTTOM],
  );
  const right = eyeRatio(
    lm[RIGHT_IRIS_CENTER],
    lm[RIGHT_EYE_INNER],
    lm[RIGHT_EYE_OUTER],
    lm[RIGHT_EYE_TOP],
    lm[RIGHT_EYE_BOTTOM],
  );

  const hAvg = (left.h + right.h) / 2;
  const vAvg = (left.v + right.v) / 2;

  const x = clamp((hAvg - 0.5) * 3, -1, 1);
  const y = clamp((vAvg - 0.5) * 4, -1, 1);
  const xCorrected = -x; // image is mirrored

  const openness = Math.min(1, (left.open + right.open) / 0.7);
  return { x: xCorrected, y, confidence: openness, mode: 'iris' };
}

// -------- HEAD mode (Nutshell-style) --------
// Track nose tip's position within the face bounding box. Diff from a
// calibrated center → gaze vector. Much more reliable than iris for users
// who can't move their eyes precisely.

type HeadCal = { cx: number; cy: number };
let headCal: HeadCal | null = null;

function computeHeadGaze(result: FaceLandmarkerResult): GazeVector | null {
  const faces = result.faceLandmarks;
  if (!faces || faces.length === 0) return null;
  const lm = faces[0];
  if (!lm[NOSE_TIP] || !lm[FACE_LEFT] || !lm[FACE_RIGHT]) return null;

  // Build a face-local coordinate system. Normalise nose position to
  // [0..1] inside the face bounding box.
  const xMin = Math.min(lm[FACE_LEFT].x, lm[FACE_RIGHT].x);
  const xMax = Math.max(lm[FACE_LEFT].x, lm[FACE_RIGHT].x);
  const yMin = lm[FACE_TOP].y;
  const yMax = lm[FACE_BOTTOM].y;

  const w = Math.max(0.001, xMax - xMin);
  const h = Math.max(0.001, yMax - yMin);
  const nx = (lm[NOSE_TIP].x - xMin) / w; // 0..1
  const ny = (lm[NOSE_TIP].y - yMin) / h; // 0..1

  // Auto-calibrate on first frame if no calibration captured yet.
  if (!headCal) headCal = { cx: nx, cy: ny };

  // Deviation from centre, amplified. Right-of-centre nose (in subject frame
  // after mirroring) = subject looking RIGHT.
  const dx = (nx - headCal.cx) * 3.5;
  const dy = (ny - headCal.cy) * 4.0;

  // Image is mirrored, so subject's right is image's left → flip x.
  const x = clamp(-dx, -1, 1);
  const y = clamp(dy, -1, 1);

  // Confidence: how close to the calibrated center frame (looking around still
  // gives high confidence; massive jumps suggest noise / not-facing-camera).
  const off = Math.hypot(dx, dy);
  const confidence = clamp(1 - off * 0.25, 0.3, 1);
  return { x, y, confidence, mode: 'head' };
}

function captureHeadCenter(result: FaceLandmarkerResult): boolean {
  const faces = result.faceLandmarks;
  if (!faces || faces.length === 0) return false;
  const lm = faces[0];
  if (!lm[NOSE_TIP] || !lm[FACE_LEFT] || !lm[FACE_RIGHT]) return false;
  const xMin = Math.min(lm[FACE_LEFT].x, lm[FACE_RIGHT].x);
  const xMax = Math.max(lm[FACE_LEFT].x, lm[FACE_RIGHT].x);
  const yMin = lm[FACE_TOP].y;
  const yMax = lm[FACE_BOTTOM].y;
  const w = Math.max(0.001, xMax - xMin);
  const h = Math.max(0.001, yMax - yMin);
  headCal = {
    cx: (lm[NOSE_TIP].x - xMin) / w,
    cy: (lm[NOSE_TIP].y - yMin) / h,
  };
  return true;
}

// -------- public factory --------

export function createFaceTracker(): FaceTracker {
  let rafId: number | null = null;
  let running = false;
  let mode: GazeMode = 'iris';
  let pendingCalibrate = false;

  // Tuned: minCutoff low for smooth-at-rest, beta moderate so fast moves
  // still get through without lag. Matches Nutshell's HEAD_FILTER_*
  // constants reasonably well.
  const smoother = new OneEuro2D({ minCutoff: 0.5, beta: 0.005, dCutoff: 1.0 });

  return {
    async start(video, onGaze) {
      const lm = await getLandmarker();
      running = true;
      smoother.reset();

      const tick = () => {
        if (!running) return;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          try {
            const ts = performance.now();
            const result = lm.detectForVideo(video, ts);

            if (pendingCalibrate) {
              const captured = captureHeadCenter(result);
              if (captured) {
                pendingCalibrate = false;
                smoother.reset();
              }
            }

            const raw =
              mode === 'head'
                ? computeHeadGaze(result)
                : computeIrisGaze(result);
            if (raw) {
              const sm = smoother.filter(raw.x, raw.y, ts);
              onGaze({ ...raw, x: sm.x, y: sm.y });
            }
          } catch {
            /* keep looping */
          }
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    },

    async stop() {
      running = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    },

    setMode(m) {
      mode = m;
      smoother.reset();
    },

    calibrateCenter() {
      pendingCalibrate = true;
    },
  };
}
