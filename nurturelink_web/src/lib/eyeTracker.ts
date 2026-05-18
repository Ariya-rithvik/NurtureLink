// Wrapper around WebGazer.js loaded via <script> in index.html.
// We stick to the rock-solid core API (setRegression, setGazeListener, begin,
// end, show*) and avoid chained methods that vary across WebGazer versions.

type GazeData = { x: number; y: number } | null;

type WebGazerLib = {
  setRegression?: (kind: string) => WebGazerLib;
  setGazeListener?: (cb: (data: GazeData, elapsed: number) => void) => WebGazerLib;
  begin?: () => Promise<unknown>;
  end?: () => void;
  pause?: () => void;
  resume?: () => void;
  showVideoPreview?: (b: boolean) => WebGazerLib;
  showPredictionPoints?: (b: boolean) => WebGazerLib;
  showFaceOverlay?: (b: boolean) => WebGazerLib;
  showFaceFeedbackBox?: (b: boolean) => WebGazerLib;
  saveDataAcrossSessions?: (b: boolean) => WebGazerLib;
  applyKalmanFilter?: (b: boolean) => WebGazerLib;
  clearData?: () => Promise<void> | void;
  recordScreenPosition?: (x: number, y: number, type?: string) => void;
  params?: Record<string, unknown>;
};

declare global {
  interface Window {
    webgazer?: WebGazerLib;
  }
}

let started = false;
let listener: ((x: number, y: number) => void) | null = null;
const smoothXBuf: number[] = [];
const smoothYBuf: number[] = [];
const SMOOTH_WINDOW = 5;

function pushSmooth(buf: number[], v: number): number {
  buf.push(v);
  if (buf.length > SMOOTH_WINDOW) buf.shift();
  return buf.reduce((a, b) => a + b, 0) / buf.length;
}

async function awaitWebGazer(timeoutMs = 10000): Promise<WebGazerLib> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (typeof window !== 'undefined' && window.webgazer) {
      return window.webgazer;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    'WebGazer did not load. Check internet — the script comes from cdn.jsdelivr.net.',
  );
}

/** Call a method if it exists, swallow if it doesn't. Returns the lib for chaining. */
function safe<T>(wg: WebGazerLib, fnName: keyof WebGazerLib, ...args: unknown[]): WebGazerLib {
  try {
    const fn = wg[fnName] as unknown;
    if (typeof fn === 'function') {
      (fn as (...a: unknown[]) => unknown).call(wg, ...args);
    }
  } catch {
    /* ignore — different webgazer versions support different methods */
  }
  return wg;
}

export async function startEyeTracker(
  onGaze: (x: number, y: number) => void,
  opts: { showVideo?: boolean } = {},
): Promise<void> {
  const wg = await awaitWebGazer();
  listener = onGaze;

  if (!started) {
    // Set the regression first — required.
    safe(wg, 'setRegression', 'ridge');

    // Set up the gaze callback.
    if (typeof wg.setGazeListener !== 'function') {
      throw new Error(
        'WebGazer is loaded but has no setGazeListener. Try refreshing the page.',
      );
    }
    wg.setGazeListener((data) => {
      if (!data || !listener) return;
      const sx = pushSmooth(smoothXBuf, data.x);
      const sy = pushSmooth(smoothYBuf, data.y);
      listener(sx, sy);
    });

    // Optional smoothing / persistence — call only if methods exist.
    safe(wg, 'saveDataAcrossSessions', true);
    safe(wg, 'applyKalmanFilter', true);

    // Also try setting via params as a fallback (newer WebGazer pattern).
    if (wg.params) {
      try {
        wg.params.applyKalmanFilter = true;
        wg.params.saveDataAcrossSessions = true;
      } catch {
        /* ignore */
      }
    }

    // Hide preview chrome unless caller asked for it.
    safe(wg, 'showVideoPreview', !!opts.showVideo);
    safe(wg, 'showPredictionPoints', false);
    safe(wg, 'showFaceOverlay', !!opts.showVideo);
    safe(wg, 'showFaceFeedbackBox', !!opts.showVideo);

    if (typeof wg.begin !== 'function') {
      throw new Error('WebGazer.begin is missing. Refresh the page.');
    }
    await wg.begin();
    started = true;
  } else {
    // Re-attach listener after a pause/resume.
    if (typeof wg.setGazeListener === 'function') {
      wg.setGazeListener((data) => {
        if (!data || !listener) return;
        const sx = pushSmooth(smoothXBuf, data.x);
        const sy = pushSmooth(smoothYBuf, data.y);
        listener(sx, sy);
      });
    }
    safe(wg, 'resume');
  }
}

export function stopEyeTracker(): void {
  if (typeof window !== 'undefined' && window.webgazer && started) {
    try {
      window.webgazer.end?.();
    } catch {
      /* ignore */
    }
    started = false;
  }
  listener = null;
  smoothXBuf.length = 0;
  smoothYBuf.length = 0;
}

export async function recordCalibrationPoint(x: number, y: number): Promise<void> {
  const wg = await awaitWebGazer();
  if (typeof wg.recordScreenPosition === 'function') {
    wg.recordScreenPosition(x, y, 'click');
  }
}

export async function clearCalibration(): Promise<void> {
  const wg = await awaitWebGazer();
  if (typeof wg.clearData === 'function') {
    await wg.clearData();
  }
}

export function isEyeTrackerSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}
