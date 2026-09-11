import type { Activity, Athlete, WellnessDay } from '../domain/types';
import { isRunning } from '../domain/types';
import { clamp, mean, percentChange, round } from './stats';
import { DAY_MS, daysBetween, startOfDay, toISODate } from './time';
import { heartRateProfile, trainingLoad, type HeartRateProfile } from './trainingLoad';

export type Trend = 'up' | 'down' | 'flat';

export interface TrendedMetric {
  value: number;
  /** Same metric two weeks ago, for the arrow. */
  previous: number;
  trend: Trend;
  changeRatio: number | null;
}

const trendOf = (current: number, previous: number, threshold = 0.04): TrendedMetric => {
  const changeRatio = percentChange(current, previous);
  const trend: Trend =
    changeRatio == null || Math.abs(changeRatio) < threshold
      ? 'flat'
      : changeRatio > 0
        ? 'up'
        : 'down';
  return { value: current, previous, trend, changeRatio };
};

/** Daily training load for the last `days` days, oldest first. */
export const dailyLoadSeries = (
  activities: readonly Activity[],
  profile: HeartRateProfile,
  now: Date,
  days: number,
): number[] => {
  const series = new Array<number>(days).fill(0);
  const today = startOfDay(now);
  for (const activity of activities) {
    if (!isRunning(activity.sport)) continue;
    const age = daysBetween(new Date(activity.startedAt), today);
    if (age < 0 || age >= days) continue;
    const index = days - 1 - age;
    series[index] = (series[index] as number) + (activity.trainingLoad ?? trainingLoad(activity, profile));
  }
  return series;
};

/**
 * Exponentially weighted average over a daily series, seeded from the series
 * mean so the first days are not artificially depressed.
 */
const impulseResponse = (series: readonly number[], timeConstant: number): number[] => {
  const alpha = 1 - Math.exp(-1 / timeConstant);
  const seed = mean(series.slice(0, Math.min(series.length, timeConstant))) ?? 0;
  let acc = seed;
  return series.map((value) => {
    acc = acc + alpha * (value - acc);
    return acc;
  });
};

export interface FitnessState {
  /** Chronic training load — the fitness you have built. */
  fitness: TrendedMetric;
  /** Acute training load — the fatigue you are carrying. */
  fatigue: TrendedMetric;
  /** Fitness minus fatigue. Positive means fresh, negative means loaded. */
  form: number;
  formLabel: 'fresh' | 'balanced' | 'productive' | 'strained';
  /** Daily fitness series for charting, oldest first. */
  fitnessSeries: number[];
  fatigueSeries: number[];
}

/**
 * Banister impulse–response model: a 42-day time constant for fitness and 7 for
 * fatigue. Fitness accumulates slowly and decays slowly; fatigue does both
 * quickly. Their difference is why an athlete can be simultaneously fitter than
 * ever and too tired to show it.
 */
export const fitnessState = (
  activities: readonly Activity[],
  athlete: Pick<Athlete, 'restingHr' | 'maxHr' | 'birthDate'>,
  now: Date,
): FitnessState => {
  const days = 120;
  const series = dailyLoadSeries(activities, heartRateProfile(athlete), now, days);

  const fitnessSeries = impulseResponse(series, 42);
  const fatigueSeries = impulseResponse(series, 7);

  const last = <T,>(xs: T[], offset = 0): T => xs[xs.length - 1 - offset] as T;

  const fitnessNow = last(fitnessSeries);
  const fitnessThen = last(fitnessSeries, 14);
  const fatigueNow = last(fatigueSeries);
  const fatigueThen = last(fatigueSeries, 14);
  const form = fitnessNow - fatigueNow;

  const formLabel: FitnessState['formLabel'] =
    form > fitnessNow * 0.15
      ? 'fresh'
      : form > -fitnessNow * 0.05
        ? 'balanced'
        : form > -fitnessNow * 0.25
          ? 'productive'
          : 'strained';

  return {
    fitness: trendOf(fitnessNow, fitnessThen),
    fatigue: trendOf(fatigueNow, fatigueThen, 0.08),
    form,
    formLabel,
    fitnessSeries: fitnessSeries.slice(-90),
    fatigueSeries: fatigueSeries.slice(-90),
  };
};

export interface RecoveryState {
  /** 0–100. Composite of HRV, resting heart rate, sleep and accumulated load. */
  score: number;
  label: 'poor' | 'fair' | 'good' | 'excellent';
  trend: Trend;
  hrv: TrendedMetric | null;
  restingHr: TrendedMetric | null;
  sleepMinutes: TrendedMetric | null;
  /** Consecutive days the score has fallen — the signal worth acting on. */
  decliningDays: number;
  series: { date: string; score: number }[];
}

const recoveryScoreFor = (
  day: WellnessDay,
  baseline: { hrv: number; restingHr: number; sleep: number },
  fatigueRatio: number,
): number => {
  // Each component is scored against the athlete's own baseline, not a
  // population norm — HRV in particular is meaningless between people.
  //
  // Calibrated so a typical day lands in the low 60s: sitting at your own
  // baseline is "fine", not "poor". Only a genuine departure should alarm.
  const hrvScore =
    day.hrvMs != null ? clamp(62 + ((day.hrvMs - baseline.hrv) / baseline.hrv) * 220, 0, 100) : 60;
  const rhrScore =
    day.restingHr != null
      ? clamp(62 - ((day.restingHr - baseline.restingHr) / baseline.restingHr) * 420, 0, 100)
      : 60;
  const sleepScore =
    day.sleepMinutes != null
      ? clamp(
          (64 + ((day.sleepMinutes - baseline.sleep) / baseline.sleep) * 140) *
            (0.88 + (day.sleepQuality ?? 0.5) * 0.24),
          0,
          100,
        )
      : 60;
  const loadScore = clamp(100 - (fatigueRatio - 1) * 120, 0, 100);

  return clamp(0.34 * hrvScore + 0.24 * rhrScore + 0.27 * sleepScore + 0.15 * loadScore, 0, 100);
};

export const recoveryState = (
  wellness: readonly WellnessDay[],
  fitness: FitnessState,
  now: Date,
): RecoveryState => {
  if (wellness.length === 0) {
    return {
      score: 50,
      label: 'fair',
      trend: 'flat',
      hrv: null,
      restingHr: null,
      sleepMinutes: null,
      decliningDays: 0,
      series: [],
    };
  }

  const sorted = [...wellness].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-60);

  const baseline = {
    hrv: mean(recent.map((d) => d.hrvMs).filter((v): v is number => v != null)) ?? 60,
    restingHr: mean(recent.map((d) => d.restingHr).filter((v): v is number => v != null)) ?? 55,
    sleep: mean(recent.map((d) => d.sleepMinutes).filter((v): v is number => v != null)) ?? 450,
  };

  const fatigueRatio =
    fitness.fitness.value > 0 ? fitness.fatigue.value / fitness.fitness.value : 1;

  const series = sorted.map((day) => ({
    date: day.date,
    score: round(recoveryScoreFor(day, baseline, fatigueRatio), 0),
  }));

  const scores = series.map((s) => s.score);
  const score = scores[scores.length - 1] ?? 50;

  // How many days in a row the score has fallen.
  let decliningDays = 0;
  for (let i = scores.length - 1; i > 0; i--) {
    if ((scores[i] as number) < (scores[i - 1] as number)) decliningDays++;
    else break;
  }

  const windowOf = (pick: (d: WellnessDay) => number | undefined, offsetDays: number) => {
    const cutoff = now.getTime() - offsetDays * DAY_MS;
    const values = sorted
      .filter((d) => new Date(`${d.date}T12:00:00`).getTime() >= cutoff)
      .map(pick)
      .filter((v): v is number => v != null);
    return mean(values);
  };

  const trended = (pick: (d: WellnessDay) => number | undefined, threshold: number) => {
    const current = windowOf(pick, 7);
    const previous = windowOf(pick, 28);
    if (current == null || previous == null) return null;
    return trendOf(current, previous, threshold);
  };

  const recentMean = mean(scores.slice(-7)) ?? score;
  const priorMean = mean(scores.slice(-28, -7)) ?? recentMean;

  return {
    score,
    label: score >= 80 ? 'excellent' : score >= 65 ? 'good' : score >= 45 ? 'fair' : 'poor',
    trend: trendOf(recentMean, priorMean, 0.04).trend,
    hrv: trended((d) => d.hrvMs, 0.04),
    restingHr: trended((d) => d.restingHr, 0.025),
    sleepMinutes: trended((d) => d.sleepMinutes, 0.05),
    decliningDays,
    series: series.slice(-30),
  };
};

/**
 * VO2 max from a recent 5K-equivalent effort.
 *
 * Velocity at VO2 max is roughly 5K pace divided by 0.95, and VO2 max is about
 * 0.2 ml/kg/min per metre-per-minute plus resting metabolism. Approximate, but
 * it moves correctly with fitness, which is what the trend needs.
 */
export const estimateVo2Max = (fiveKSeconds: number | null): number | null => {
  if (fiveKSeconds == null || fiveKSeconds <= 0) return null;
  const velocityMPerMin = 5000 / (fiveKSeconds / 60);
  const vVo2Max = velocityMPerMin / 0.95;
  return round(0.2 * vVo2Max + 3.5, 1);
};

export const todayWellness = (wellness: readonly WellnessDay[], now: Date): WellnessDay | null =>
  wellness.find((d) => d.date === toISODate(now)) ??
  [...wellness].sort((a, b) => b.date.localeCompare(a.date))[0] ??
  null;
