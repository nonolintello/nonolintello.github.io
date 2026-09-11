/**
 * Seeded PRNG. The demo athlete must be identical on every launch — a history
 * that reshuffles would make the analytics look unstable when they are not.
 */
export const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export type Rng = () => number;

export const range = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);

export const intRange = (rng: Rng, min: number, max: number): number =>
  Math.floor(range(rng, min, max + 1));

/** Box-Muller. Bounded to ±3σ so a single tail draw can't produce a 40 km "easy run". */
export const gaussian = (rng: Rng, mean = 0, sd = 1): number => {
  const u = Math.max(1e-9, rng());
  const v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + sd * Math.max(-3, Math.min(3, z));
};

export const pick = <T,>(rng: Rng, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)] as T;

export const chance = (rng: Rng, probability: number): boolean => rng() < probability;

/**
 * Layered sine noise. Used for terrain and pace wander, where the value must
 * drift smoothly rather than jump between samples the way white noise would.
 */
export const smoothNoise = (seedPhases: readonly number[], t: number): number => {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  for (const phase of seedPhases) {
    value += amplitude * Math.sin(2 * Math.PI * frequency * t + phase);
    total += amplitude;
    amplitude *= 0.55;
    frequency *= 2.1;
  }
  return total > 0 ? value / total : 0;
};

export const phasesFor = (rng: Rng, count = 4): number[] =>
  Array.from({ length: count }, () => rng() * Math.PI * 2);
