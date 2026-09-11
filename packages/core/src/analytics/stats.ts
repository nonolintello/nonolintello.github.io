/** Statistical primitives. Every function tolerates empty input by returning null. */

export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

export const mean = (xs: readonly number[]): number | null =>
  xs.length === 0 ? null : sum(xs) / xs.length;

export const median = (xs: readonly number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? ((s[mid - 1] as number) + (s[mid] as number)) / 2 : (s[mid] as number);
};

export const stdDev = (xs: readonly number[]): number | null => {
  if (xs.length < 2) return null;
  const m = mean(xs) as number;
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
};

/** Coefficient of variation — spread normalised by level, so it compares across athletes. */
export const coefficientOfVariation = (xs: readonly number[]): number | null => {
  const m = mean(xs);
  const sd = stdDev(xs);
  if (m == null || sd == null || m === 0) return null;
  return sd / Math.abs(m);
};

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Maps any real number into 0..1, centred at `centre`. `slope` sets the steepness. */
export const sigmoid = (x: number, centre = 0, slope = 1): number =>
  1 / (1 + Math.exp(-slope * (x - centre)));

/** Linear interpolation between output bounds as x moves between input bounds. */
export const lerpClamped = (x: number, x0: number, x1: number, y0: number, y1: number): number => {
  if (x1 === x0) return y0;
  return clamp(y0 + ((x - x0) / (x1 - x0)) * (y1 - y0), Math.min(y0, y1), Math.max(y0, y1));
};

export interface LinearFit {
  slope: number;
  intercept: number;
  /** Coefficient of determination — how much of the variance the line explains. */
  rSquared: number;
  n: number;
}

/** Ordinary least squares. Returns null below 3 points, where a slope is noise. */
export const linearRegression = (points: readonly { x: number; y: number }[]): LinearFit | null => {
  const n = points.length;
  if (n < 3) return null;
  const mx = mean(points.map((p) => p.x)) as number;
  const my = mean(points.map((p) => p.y)) as number;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = my - slope * mx;
  let ssRes = 0;
  let ssTot = 0;
  for (const p of points) {
    const pred = slope * p.x + intercept;
    ssRes += (p.y - pred) ** 2;
    ssTot += (p.y - my) ** 2;
  }
  return { slope, intercept, rSquared: ssTot === 0 ? 1 : 1 - ssRes / ssTot, n };
};

/**
 * Exponentially weighted moving average. Used for training load, where recent
 * work must count for more than work from three weeks ago.
 */
export const ewma = (xs: readonly number[], halfLifeDays: number): number | null => {
  if (xs.length === 0) return null;
  const alpha = 1 - Math.exp(-Math.LN2 / halfLifeDays);
  let acc = xs[0] as number;
  for (let i = 1; i < xs.length; i++) acc = alpha * (xs[i] as number) + (1 - alpha) * acc;
  return acc;
};

/** Trailing simple moving average, aligned to the end of the series. */
export const rollingMean = (xs: readonly number[], window: number): (number | null)[] =>
  xs.map((_, i) => (i + 1 < window ? null : mean(xs.slice(i + 1 - window, i + 1))));

export const percentChange = (current: number, baseline: number): number | null => {
  if (baseline === 0 || !Number.isFinite(baseline)) return null;
  return (current - baseline) / baseline;
};

export const round = (x: number, decimals = 1): number => {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
};
