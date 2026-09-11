import type { Activity, ActivityStream, PersonalRecord, Sport } from '../domain/types';
import { PR_DISTANCES_M } from '../domain/types';
import { isRunning } from '../domain/types';

export interface BestEffort {
  distanceM: number;
  elapsedSeconds: number;
  /** Sample index where the effort began, for chart highlighting. */
  startIndex: number;
  endIndex: number;
}

/**
 * Fastest time to cover `targetM` anywhere inside the activity — not just from
 * the start line. A 5K PR set during the middle of a 10-mile run is still a 5K
 * PR, and only a sliding window finds it.
 *
 * Linear interpolation at the window's leading edge matters: with a sample
 * every few seconds, snapping to sample boundaries costs several seconds of
 * accuracy, which is the difference between a PR and a near miss.
 *
 * O(n) — the start pointer only ever moves forward.
 */
export const bestEffortForDistance = (stream: ActivityStream, targetM: number): BestEffort | null => {
  const dist = stream.distanceM;
  const time = stream.timeOffsetS;
  const n = Math.min(dist.length, time.length);
  if (n < 2 || targetM <= 0) return null;

  const total = dist[n - 1] as number;
  if (total < targetM) return null;

  let best: BestEffort | null = null;
  let i = 0;

  for (let j = 1; j < n; j++) {
    const dj = dist[j] as number;
    // Advance i to the last index whose window still covers the target.
    while (i + 1 < j && dj - (dist[i + 1] as number) >= targetM) i++;

    const di = dist[i] as number;
    if (dj - di < targetM) continue;

    // Exact crossing point sits between sample i and i+1.
    const dNext = dist[i + 1] as number;
    const tI = time[i] as number;
    const tNext = time[i + 1] as number;
    const wanted = dj - targetM;
    const segment = dNext - di;
    const fraction = segment > 0 ? (wanted - di) / segment : 0;
    const startTime = tI + (tNext - tI) * Math.max(0, Math.min(1, fraction));
    const elapsed = (time[j] as number) - startTime;

    if (elapsed > 0 && (best === null || elapsed < best.elapsedSeconds)) {
      best = { distanceM: targetM, elapsedSeconds: elapsed, startIndex: i, endIndex: j };
    }
  }

  return best;
};

export const bestEfforts = (
  stream: ActivityStream,
  distances: readonly number[] = PR_DISTANCES_M,
): BestEffort[] =>
  distances
    .map((d) => bestEffortForDistance(stream, d))
    .filter((e): e is BestEffort => e !== null);

export interface DetectedRecord {
  distanceM: number;
  elapsedSeconds: number;
  activityId: string;
  achievedAt: string;
  previousElapsedSeconds?: number;
  previousAchievedAt?: string;
}

/**
 * Replays activities in chronological order and keeps the running best for each
 * distance. Replaying rather than querying means a back-filled import from a
 * watch lands in the right place in PR history instead of falsely appearing to
 * be today's breakthrough.
 */
export const detectPersonalRecords = (
  activities: readonly Activity[],
  distances: readonly number[] = PR_DISTANCES_M,
): DetectedRecord[] => {
  const chronological = [...activities]
    .filter((a) => isRunning(a.sport) && a.stream)
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  const currentBest = new Map<number, DetectedRecord>();
  const timeline: DetectedRecord[] = [];

  for (const activity of chronological) {
    const stream = activity.stream;
    if (!stream) continue;
    for (const distance of distances) {
      const effort = bestEffortForDistance(stream, distance);
      if (!effort) continue;
      const existing = currentBest.get(distance);
      if (existing && existing.elapsedSeconds <= effort.elapsedSeconds) continue;

      const record: DetectedRecord = {
        distanceM: distance,
        elapsedSeconds: effort.elapsedSeconds,
        activityId: activity.id,
        achievedAt: activity.startedAt,
        ...(existing
          ? {
              previousElapsedSeconds: existing.elapsedSeconds,
              previousAchievedAt: existing.achievedAt,
            }
          : {}),
      };
      currentBest.set(distance, record);
      timeline.push(record);
    }
  }

  return timeline;
};

export const currentRecords = (
  activities: readonly Activity[],
  athleteId: string,
  sport: Sport = 'running',
): PersonalRecord[] => {
  const timeline = detectPersonalRecords(activities);
  const latest = new Map<number, DetectedRecord>();
  for (const r of timeline) latest.set(r.distanceM, r);

  return [...latest.values()]
    .sort((a, b) => a.distanceM - b.distanceM)
    .map((r) => ({
      id: `pr-${athleteId}-${r.distanceM}`,
      athleteId,
      sport,
      distanceM: r.distanceM,
      elapsedSeconds: r.elapsedSeconds,
      activityId: r.activityId,
      achievedAt: r.achievedAt,
      previousElapsedSeconds: r.previousElapsedSeconds,
      previousAchievedAt: r.previousAchievedAt,
      isCurrent: true,
    }));
};

/**
 * Riegel endurance model: T2 = T1 × (D2/D1)^1.06. The exponent encodes that
 * pace decays as distance grows.
 *
 * Output is always a PREDICTION, never a fact — it assumes race-day effort and
 * appropriate endurance training, neither of which we can observe. Accuracy
 * degrades as the extrapolation stretches, which `confidence` reflects.
 */
export const RIEGEL_EXPONENT = 1.06;

export interface RacePrediction {
  distanceM: number;
  predictedSeconds: number;
  basedOnDistanceM: number;
  basedOnSeconds: number;
  confidence: number;
}

export const predictRaceTime = (
  knownDistanceM: number,
  knownSeconds: number,
  targetDistanceM: number,
): RacePrediction => {
  const ratio = targetDistanceM / knownDistanceM;
  const predicted = knownSeconds * ratio ** RIEGEL_EXPONENT;
  // Confidence falls off with the size of the extrapolation in either direction.
  const stretch = Math.abs(Math.log2(ratio));
  const confidence = Math.max(0.25, Math.min(0.92, 0.92 - stretch * 0.18));
  return {
    distanceM: targetDistanceM,
    predictedSeconds: predicted,
    basedOnDistanceM: knownDistanceM,
    basedOnSeconds: knownSeconds,
    confidence,
  };
};

/**
 * Projects a target distance from whichever record yields the fastest estimate.
 *
 * Not the nearest record, which is the intuitive choice but wrong here: long
 * "records" are routinely set during easy long runs rather than races, so a
 * 21 km best effort from a conversational Sunday run would drag a marathon
 * projection an hour slow. An athlete's potential is defined by their best
 * performance at any distance, so the fastest projection is the honest one —
 * the same logic behind VDOT-style tables.
 *
 * `excludeSameDistance` matters when the output is shown as a forecast:
 * anchoring a 5K projection on their 5K record just restates the record.
 * Analytics needing a normalised equivalent leave it off.
 */
export const predictFromRecords = (
  records: readonly PersonalRecord[],
  targetDistanceM: number,
  options: { excludeSameDistance?: boolean } = {},
): RacePrediction | null => {
  const usable = options.excludeSameDistance
    ? records.filter((r) => r.distanceM !== targetDistanceM)
    : records;
  if (usable.length === 0) return null;

  return usable
    .map((record) => predictRaceTime(record.distanceM, record.elapsedSeconds, targetDistanceM))
    .reduce((best, candidate) =>
      candidate.predictedSeconds < best.predictedSeconds ? candidate : best,
    );
};
