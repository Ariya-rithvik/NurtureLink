// One-Euro low-pass filter for noisy signals (gaze coords, cursor motion).
//
// Adapted from Géry Casiez et al, "1€ Filter: A Simple Speed-based Low-pass
// Filter for Noisy Input in Interactive Systems" (CHI 2012), via the JS
// implementation in tanhanwei/Nutshell/gaze/gaze-core.js (MIT).
//
// The cutoff frequency adapts to the speed of the signal: slow movements get
// strong smoothing (no jitter at rest), fast movements get little smoothing
// (no lag while moving). Perfect for cursor / gaze tracking.

export type OneEuroOptions = {
  minCutoff?: number; // base cutoff (Hz). lower = more smoothing at rest
  beta?: number; // sensitivity to speed. higher = less smoothing when moving
  dCutoff?: number; // derivative cutoff
};

export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev: number | null = null;

  constructor(opts: OneEuroOptions = {}) {
    this.minCutoff = opts.minCutoff ?? 0.4;
    this.beta = opts.beta ?? 0.0025;
    this.dCutoff = opts.dCutoff ?? 1.0;
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * Math.max(1e-3, cutoff));
    return 1 / (1 + tau / Math.max(1e-4, dt));
  }

  filter(value: number, timestampMs: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(timestampMs)) {
      return value;
    }
    if (this.tPrev === null || this.xPrev === null) {
      this.tPrev = timestampMs;
      this.xPrev = value;
      this.dxPrev = 0;
      return value;
    }
    const dt = Math.max(1e-4, (timestampMs - this.tPrev) / 1000);

    // Estimate derivative, smooth it
    const dxRaw = (value - this.xPrev) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    const dxSmooth = aD * dxRaw + (1 - aD) * this.dxPrev;

    // Adaptive cutoff based on speed
    const cutoff = this.minCutoff + this.beta * Math.abs(dxSmooth);
    const a = this.alpha(cutoff, dt);
    const xSmooth = a * value + (1 - a) * this.xPrev;

    this.tPrev = timestampMs;
    this.xPrev = xSmooth;
    this.dxPrev = dxSmooth;
    return xSmooth;
  }

  reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
}

/** Convenience: filter (x, y) together with two independent OneEuroFilters. */
export class OneEuro2D {
  private fx: OneEuroFilter;
  private fy: OneEuroFilter;

  constructor(opts?: OneEuroOptions) {
    this.fx = new OneEuroFilter(opts);
    this.fy = new OneEuroFilter(opts);
  }

  filter(x: number, y: number, timestampMs: number): { x: number; y: number } {
    return {
      x: this.fx.filter(x, timestampMs),
      y: this.fy.filter(y, timestampMs),
    };
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }
}
