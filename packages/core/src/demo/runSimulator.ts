import type { Activity, ActivityStream, Split, Visibility } from '../domain/types';
import { clamp } from '../analytics/stats';
import { gaussian, phasesFor, range, smoothNoise, type Rng } from './random';

export type SessionType = 'easy' | 'long' | 'steady' | 'tempo' | 'intervals' | 'race' | 'recovery';

/** Target speed as a fraction of the athlete's current 5K speed. */
const SESSION_INTENSITY: Record<SessionType, number> = {
  recovery: 0.66,
  easy: 0.73,
  long: 0.71,
  steady: 0.81,
  tempo: 0.89,
  intervals: 0.83,
  race: 1.0,
};

/**
 * Titles carry no time-of-day word of their own — the generator prefixes one
 * drawn from the actual start time, so a run never reads "Morning easy run"
 * against a 14:20 timestamp.
 */
const SESSION_TITLES: Record<SessionType, string[]> = {
  recovery: ['recovery jog', 'shakeout', 'easy legs'],
  easy: ['easy run', 'aerobic run', 'steady miles'],
  long: ['long run', 'long effort', 'endurance run'],
  steady: ['steady state run', 'progression run', 'moderate effort'],
  tempo: ['tempo run', 'threshold session', 'sustained tempo'],
  intervals: ['interval session', 'track repeats', 'speed intervals', '400m repeats'],
  race: ['parkrun', 'time trial', 'race'],
};

const timeOfDayWord = (hour: number): string =>
  hour < 11 ? 'Morning' : hour < 14 ? 'Midday' : hour < 18 ? 'Afternoon' : 'Evening';

export interface SimulationInput {
  id: string;
  athleteId: string;
  startedAt: Date;
  sessionType: SessionType;
  distanceM: number;
  /** The athlete's 5K speed in m/s at this point in their history. */
  fiveKSpeedMps: number;
  restingHr: number;
  maxHr: number;
  /** 0 = flat riverside, 1 = sustained hills. */
  hillFactor: number;
  homeLat: number;
  homeLon: number;
  visibility?: Visibility;
  rng: Rng;
}

const SAMPLE_INTERVAL_S = 5;

/**
 * Generates a full activity with a second-by-second stream.
 *
 * The simulation is physiological rather than cosmetic: heart rate responds to
 * speed and gradient with a lag and drifts upward over time, cadence tracks
 * speed, and pace decays through long efforts. The analytics engine then finds
 * genuine structure in the result — cardiac drift, negative splits, best
 * efforts — instead of patterns that were hard-coded for it to find.
 */
export const simulateRun = (input: SimulationInput): Activity => {
  const {
    id,
    athleteId,
    startedAt,
    sessionType,
    distanceM,
    fiveKSpeedMps,
    restingHr,
    maxHr,
    hillFactor,
    homeLat,
    homeLon,
    rng,
  } = input;

  const targetSpeed = fiveKSpeedMps * SESSION_INTENSITY[sessionType];
  const terrainPhases = phasesFor(rng, 4);
  const wanderPhases = phasesFor(rng, 3);
  const timeOffsetS: number[] = [];
  const distanceSamples: number[] = [];
  const latitude: number[] = [];
  const longitude: number[] = [];
  const altitudeM: number[] = [];
  const heartRate: number[] = [];
  const cadenceSpm: number[] = [];
  const velocityMps: number[] = [];

  const hrSpan = maxHr - restingHr;
  const baseAltitude = range(rng, 20, 180);
  // Amplitude of the terrain profile over the whole route.
  const terrainAmplitude = 8 + hillFactor * 95;

  /**
   * The route is a closed loop built from a handful of low-order harmonics
   * rather than an integrated random walk.
   *
   * A random walk with a "steer home" term produces a knot of self-crossings,
   * which is exactly what a real route is not: roads and paths curve gently and
   * rarely cross themselves. Summing a few harmonics over one revolution gives
   * an organic lobed circuit that closes cleanly where it started.
   */
  const METRES_PER_DEG_LAT = 111_320;
  const metresPerDegLon = Math.max(1, METRES_PER_DEG_LAT * Math.cos((homeLat * Math.PI) / 180));

  const centerLat = homeLat + gaussian(rng, 0, 0.006);
  const centerLon = homeLon + gaussian(rng, 0, 0.006);
  const orientation = rng() * Math.PI * 2;
  // A circle of this radius has a circumference of exactly the run distance.
  const baseRadius = (distanceM / (2 * Math.PI)) * range(rng, 0.86, 1.04);
  const harmonics = [
    { k: 2, amp: range(rng, 0.1, 0.32), phase: rng() * Math.PI * 2 },
    { k: 3, amp: range(rng, 0.04, 0.18), phase: rng() * Math.PI * 2 },
    { k: 5, amp: range(rng, 0.015, 0.07), phase: rng() * Math.PI * 2 },
  ];

  const positionAt = (t: number) => {
    const theta = t * Math.PI * 2;
    let r = baseRadius;
    for (const h of harmonics) r *= 1 + h.amp * Math.sin(h.k * theta + h.phase);
    const angle = theta + orientation;
    return {
      lat: centerLat + (Math.sin(angle) * r) / METRES_PER_DEG_LAT,
      lon: centerLon + (Math.cos(angle) * r) / metresPerDegLon,
    };
  };

  const start = positionAt(0);
  let lat = start.lat;
  let lon = start.lon;

  let covered = 0;
  let elapsed = 0;
  let hr = restingHr + hrSpan * 0.35;
  let elevationGain = 0;
  let elevationLoss = 0;
  let previousAltitude = baseAltitude;

  // Interval sessions alternate work and float blocks rather than holding an
  // average, so the resulting stream really does contain fast segments.
  const intervalPeriodS = range(rng, 180, 300);
  const workFraction = 0.45;

  let guard = 0;
  while (covered < distanceM && guard++ < 20000) {
    const progress = covered / distanceM;

    // --- Terrain -----------------------------------------------------------
    const altitude = baseAltitude + terrainAmplitude * smoothNoise(terrainPhases, progress * 2.4);
    const altitudeDelta = altitude - previousAltitude;
    if (altitudeDelta > 0) elevationGain += altitudeDelta;
    else elevationLoss -= altitudeDelta;
    previousAltitude = altitude;

    // --- Target speed for this instant -------------------------------------
    let instantTarget = targetSpeed;

    if (sessionType === 'intervals') {
      const phase = (elapsed % intervalPeriodS) / intervalPeriodS;
      instantTarget = phase < workFraction ? fiveKSpeedMps * 1.04 : fiveKSpeedMps * 0.62;
    } else if (sessionType === 'tempo') {
      // Warm-up and cool-down bracket the sustained portion.
      if (progress < 0.15) instantTarget = fiveKSpeedMps * 0.72;
      else if (progress > 0.85) instantTarget = fiveKSpeedMps * 0.7;
    } else if (sessionType === 'steady') {
      // Progression: finishes faster than it starts.
      instantTarget = targetSpeed * (0.94 + progress * 0.12);
    } else if (sessionType === 'race') {
      instantTarget = fiveKSpeedMps * (progress < 0.1 ? 0.97 : progress > 0.9 ? 1.04 : 1.0);
    }

    // Gradient costs speed uphill and returns less than it took downhill.
    const gradient = altitudeDelta / Math.max(1, targetSpeed * SAMPLE_INTERVAL_S);
    const gradeEffect = 1 - clamp(gradient, -0.12, 0.12) * (gradient > 0 ? 3.4 : 1.6);

    // Long efforts decay; short ones barely do.
    const fatigue =
      sessionType === 'long'
        ? 1 - progress * range(rng, 0.04, 0.085)
        : sessionType === 'race' || sessionType === 'tempo'
          ? 1 - progress * 0.015
          : 1 - progress * 0.02;

    const wander = 1 + smoothNoise(wanderPhases, progress * 9) * 0.045;
    const speed = clamp(instantTarget * gradeEffect * fatigue * wander, 1.2, 7.5);

    // --- Heart rate --------------------------------------------------------
    const intensityRatio = speed / fiveKSpeedMps;
    let targetHrr = clamp(0.95 * intensityRatio ** 1.2, 0.3, 1.02);
    // Cardiac drift: the same pace costs more as the session goes on.
    targetHrr *= 1 + progress * (sessionType === 'long' ? 0.075 : 0.035);
    const targetHr = restingHr + hrSpan * clamp(targetHrr, 0.25, 1);
    // First-order lag — heart rate cannot step instantly.
    hr += (targetHr - hr) * 0.09;

    // --- Cadence -----------------------------------------------------------
    const cadence = clamp(
      158 + (speed - 2.6) * 13 + smoothNoise(wanderPhases, progress * 15) * 2.2,
      145,
      200,
    );

    // --- Position ----------------------------------------------------------
    const stepM = speed * SAMPLE_INTERVAL_S;
    const here = positionAt(progress);
    lat = here.lat;
    lon = here.lon;

    timeOffsetS.push(elapsed);
    distanceSamples.push(covered);
    latitude.push(lat);
    longitude.push(lon);
    altitudeM.push(altitude);
    heartRate.push(Math.round(hr));
    cadenceSpm.push(Math.round(cadence));
    velocityMps.push(speed);

    covered += stepM;
    elapsed += SAMPLE_INTERVAL_S;
  }

  // Final sample lands exactly on the target distance.
  timeOffsetS.push(elapsed);
  distanceSamples.push(distanceM);
  latitude.push(lat);
  longitude.push(lon);
  altitudeM.push(previousAltitude);
  heartRate.push(Math.round(hr));
  cadenceSpm.push(cadenceSpm[cadenceSpm.length - 1] ?? 170);
  velocityMps.push(velocityMps[velocityMps.length - 1] ?? targetSpeed);

  const stream: ActivityStream = {
    timeOffsetS,
    distanceM: distanceSamples,
    latitude,
    longitude,
    altitudeM,
    heartRate,
    cadenceSpm,
    velocityMps,
  };

  const movingSeconds = elapsed;
  // A little stopped time: lights, gates, a pause at the top of a climb.
  const elapsedSeconds = Math.round(movingSeconds * range(rng, 1.005, 1.05));

  const avgHr = Math.round(heartRate.reduce((a, b) => a + b, 0) / heartRate.length);
  const avgCadence = cadenceSpm.reduce((a, b) => a + b, 0) / cadenceSpm.length;

  const titles = SESSION_TITLES[sessionType];
  const noun = titles[Math.floor(rng() * titles.length)] as string;
  const title = `${timeOfDayWord(startedAt.getHours())} ${noun}`;

  return {
    id,
    athleteId,
    sport: hillFactor > 0.65 ? 'trail_running' : 'running',
    title,
    startedAt: startedAt.toISOString(),
    startTimezone: 'America/New_York',
    elapsedSeconds,
    movingSeconds,
    distanceM: Math.round(distanceM),
    elevationGainM: Math.round(elevationGain),
    elevationLossM: Math.round(elevationLoss),
    avgHeartRate: avgHr,
    maxHeartRate: Math.max(...heartRate),
    avgCadenceSpm: Math.round(avgCadence * 10) / 10,
    calories: Math.round((distanceM / 1000) * 62 + movingSeconds * 0.02),
    perceivedExertion:
      sessionType === 'race' ? 9 : sessionType === 'intervals' || sessionType === 'tempo' ? 7 : sessionType === 'long' ? 5 : 3,
    visibility: input.visibility ?? 'followers',
    source: 'coros',
    sourceActivityId: `coros-${id}`,
    stream,
    splits: buildSplits(stream),
    likeCount: 0,
    commentCount: 0,
  };
};

/** Per-kilometre splits, derived from the stream rather than invented. */
export const buildSplits = (stream: ActivityStream): Split[] => {
  const splits: Split[] = [];
  const { distanceM, timeOffsetS, heartRate, altitudeM, cadenceSpm } = stream;
  const total = distanceM[distanceM.length - 1] ?? 0;
  const kmCount = Math.floor(total / 1000);

  let cursor = 0;
  let previousTime = 0;

  for (let km = 1; km <= kmCount; km++) {
    const target = km * 1000;
    while (cursor < distanceM.length && (distanceM[cursor] as number) < target) cursor++;
    const time = timeOffsetS[Math.min(cursor, timeOffsetS.length - 1)] as number;

    const from = Math.max(0, cursor - Math.floor(1000 / 12));
    const hrSlice = heartRate?.slice(from, cursor).filter((h) => h > 0) ?? [];
    const cadSlice = cadenceSpm?.slice(from, cursor) ?? [];

    let gain = 0;
    if (altitudeM) {
      for (let i = from + 1; i <= Math.min(cursor, altitudeM.length - 1); i++) {
        const delta = (altitudeM[i] as number) - (altitudeM[i - 1] as number);
        if (delta > 0) gain += delta;
      }
    }

    splits.push({
      index: km,
      distanceM: 1000,
      elapsedSeconds: Math.round(time - previousTime),
      avgHeartRate:
        hrSlice.length > 0 ? Math.round(hrSlice.reduce((a, b) => a + b, 0) / hrSlice.length) : undefined,
      elevationGainM: Math.round(gain),
      avgCadenceSpm:
        cadSlice.length > 0
          ? Math.round((cadSlice.reduce((a, b) => a + b, 0) / cadSlice.length) * 10) / 10
          : undefined,
    });
    previousTime = time;
  }

  return splits;
};
