import type { Activity, ActivityStream } from '../domain/types';
import { isRunning } from '../domain/types';
import { linearRegression, mean, percentChange, type LinearFit } from './stats';

/**
 * Aerobic efficiency: metres covered per heartbeat-minute. Rising EF at a
 * steady heart rate is the cleanest available signal that aerobic fitness is
 * improving, and it is the insight athletes find most convincing because it
 * cannot be faked by simply trying harder.
 */
export const aerobicEfficiency = (activity: Activity): number | null => {
  if (!activity.avgHeartRate || activity.avgHeartRate <= 0) return null;
  if (activity.movingSeconds <= 0 || activity.distanceM <= 0) return null;
  const speedMpm = (activity.distanceM / activity.movingSeconds) * 60;
  return speedMpm / activity.avgHeartRate;
};

export interface EfficiencyTrend {
  current: number | null;
  baseline: number | null;
  changeRatio: number | null;
  fit: LinearFit | null;
  direction: 'improving' | 'declining' | 'stable' | 'unknown';
  sampleCount: number;
}

/**
 * Compares recent efficiency against an earlier baseline window.
 *
 * Only steady aerobic efforts are considered. Intervals and races distort EF
 * badly — anaerobic work drives heart rate up out of proportion to pace — so
 * including them would make the trend track session type rather than fitness.
 */
export const efficiencyTrend = (
  activities: readonly Activity[],
  now: Date,
  recentDays = 28,
  baselineDays = 28,
): EfficiencyTrend => {
  const nowMs = now.getTime();
  const dayMs = 86_400_000;

  const eligible = activities
    .filter((a) => isRunning(a.sport) && a.avgHeartRate != null && a.movingSeconds > 900)
    .filter((a) => !isHardSession(a))
    .map((a) => ({ at: new Date(a.startedAt).getTime(), ef: aerobicEfficiency(a) }))
    .filter((x): x is { at: number; ef: number } => x.ef !== null)
    .sort((a, b) => a.at - b.at);

  const recentCutoff = nowMs - recentDays * dayMs;
  const baselineCutoff = recentCutoff - baselineDays * dayMs;

  const recent = eligible.filter((x) => x.at >= recentCutoff);
  const baseline = eligible.filter((x) => x.at >= baselineCutoff && x.at < recentCutoff);

  const currentMean = mean(recent.map((x) => x.ef));
  const baselineMean = mean(baseline.map((x) => x.ef));
  const changeRatio =
    currentMean != null && baselineMean != null ? percentChange(currentMean, baselineMean) : null;

  const fit = linearRegression(
    eligible
      .filter((x) => x.at >= baselineCutoff)
      .map((x) => ({ x: (x.at - baselineCutoff) / dayMs, y: x.ef })),
  );

  let direction: EfficiencyTrend['direction'] = 'unknown';
  if (changeRatio != null && recent.length >= 3 && baseline.length >= 3) {
    if (changeRatio > 0.02) direction = 'improving';
    else if (changeRatio < -0.02) direction = 'declining';
    else direction = 'stable';
  }

  return {
    current: currentMean,
    baseline: baselineMean,
    changeRatio,
    fit,
    direction,
    sampleCount: recent.length,
  };
};

/**
 * Heuristic for "this was a hard session". Used to exclude efforts from the
 * efficiency trend and to check intensity distribution in the weekly score.
 */
export const isHardSession = (activity: Activity): boolean => {
  if (activity.perceivedExertion != null && activity.perceivedExertion >= 7) return true;
  if (activity.maxHeartRate && activity.avgHeartRate) {
    if (activity.avgHeartRate / activity.maxHeartRate > 0.88) return true;
  }
  const title = activity.title.toLowerCase();
  return /interval|tempo|threshold|race|repeat|fartlek|track|time trial/.test(title);
};

export interface Decoupling {
  /** Percentage drift between first and second half efficiency. */
  driftPercent: number;
  firstHalfEf: number;
  secondHalfEf: number;
  /** Above ~5% suggests aerobic fatigue rather than a pacing decision. */
  significant: boolean;
}

/**
 * Splits an activity in half by time and compares pace-per-heartbeat between
 * the halves. This is what lets the analysis distinguish "you slowed down
 * because you were tired" from "you slowed down because you chose to".
 */
export const heartRateDecoupling = (stream: ActivityStream): Decoupling | null => {
  const hr = stream.heartRate;
  const dist = stream.distanceM;
  const time = stream.timeOffsetS;
  if (!hr || hr.length < 20) return null;

  const n = Math.min(hr.length, dist.length, time.length);
  if (n < 20) return null;
  const mid = Math.floor(n / 2);

  const halfEf = (from: number, to: number): number | null => {
    const dd = (dist[to] as number) - (dist[from] as number);
    const dt = (time[to] as number) - (time[from] as number);
    if (dd <= 0 || dt <= 0) return null;
    const hrSlice = hr.slice(from, to).filter((h) => h > 0);
    const avgHr = mean(hrSlice);
    if (avgHr == null || avgHr <= 0) return null;
    return ((dd / dt) * 60) / avgHr;
  };

  const first = halfEf(0, mid);
  const second = halfEf(mid, n - 1);
  if (first == null || second == null || first === 0) return null;

  const driftPercent = ((second - first) / first) * 100;
  return {
    driftPercent,
    firstHalfEf: first,
    secondHalfEf: second,
    significant: Math.abs(driftPercent) >= 5,
  };
};

export interface CadenceStability {
  averageSpm: number;
  /** Standard deviation as a percentage of the mean. */
  variationPercent: number;
  stable: boolean;
}

/**
 * Cadence that holds while pace falls points to fatigue; cadence that falls
 * with pace points to form breaking down. Distinguishing the two is what makes
 * an activity summary useful rather than decorative.
 */
export const cadenceStability = (stream: ActivityStream): CadenceStability | null => {
  const cadence = stream.cadenceSpm?.filter((c) => c > 30);
  if (!cadence || cadence.length < 20) return null;
  const avg = mean(cadence);
  if (avg == null || avg === 0) return null;
  const variance = mean(cadence.map((c) => (c - avg) ** 2)) as number;
  const variationPercent = (Math.sqrt(variance) / avg) * 100;
  return { averageSpm: avg, variationPercent, stable: variationPercent < 4 };
};
