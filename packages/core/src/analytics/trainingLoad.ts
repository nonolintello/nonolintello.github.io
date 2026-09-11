import type { Activity, Athlete } from '../domain/types';
import { clamp, ewma, sum } from './stats';
import { DAY_MS, daysBetween, startOfDay } from './time';

export const DEFAULT_RESTING_HR = 55;
export const DEFAULT_MAX_HR = 190;

/** Age-predicted max HR (Tanaka), used only when the athlete hasn't supplied one. */
export const estimateMaxHr = (birthDate?: string): number => {
  if (!birthDate) return DEFAULT_MAX_HR;
  const age = (Date.now() - new Date(birthDate).getTime()) / (365.25 * DAY_MS);
  if (!Number.isFinite(age) || age <= 0 || age > 100) return DEFAULT_MAX_HR;
  return Math.round(208 - 0.7 * age);
};

export interface HeartRateProfile {
  restingHr: number;
  maxHr: number;
}

export const heartRateProfile = (athlete: Pick<Athlete, 'restingHr' | 'maxHr' | 'birthDate'>): HeartRateProfile => ({
  restingHr: athlete.restingHr ?? DEFAULT_RESTING_HR,
  maxHr: athlete.maxHr ?? estimateMaxHr(athlete.birthDate),
});

/** Fraction of heart-rate reserve, clamped to a physiologically sane 0..1. */
export const heartRateReserve = (hr: number, profile: HeartRateProfile): number => {
  const span = profile.maxHr - profile.restingHr;
  if (span <= 0) return 0;
  return clamp((hr - profile.restingHr) / span, 0, 1);
};

/**
 * Banister TRIMP. The exponential weighting is what makes this useful: an hour
 * of intervals produces far more load than an hour of jogging, which a
 * duration-only model cannot express.
 *
 * When HR is missing we fall back to a duration × intensity estimate derived
 * from pace, so treadmill and watch-less activities still contribute load.
 */
export const trainingLoad = (activity: Activity, profile: HeartRateProfile): number => {
  const minutes = activity.movingSeconds / 60;
  if (minutes <= 0) return 0;

  if (activity.avgHeartRate != null) {
    const hrr = heartRateReserve(activity.avgHeartRate, profile);
    return minutes * hrr * 0.64 * Math.exp(1.92 * hrr);
  }

  // Fallback: assume an easy-aerobic equivalent scaled by how fast the athlete
  // moved relative to a nominal 5:30/km aerobic reference.
  const speed = activity.distanceM / activity.movingSeconds;
  const referenceSpeed = 1000 / 330;
  const intensity = clamp(speed / referenceSpeed, 0.4, 1.6);
  return minutes * 0.45 * intensity ** 2;
};

export interface LoadBalance {
  /** 7-day exponentially weighted load — what the body is currently absorbing. */
  acute: number;
  /** 28-day exponentially weighted load — the fitness base. */
  chronic: number;
  /** acute / chronic. */
  ratio: number | null;
  status: 'detraining' | 'maintaining' | 'productive' | 'overreaching';
}

/**
 * Acute:chronic workload ratio. Below 0.8 fitness is decaying; 0.8–1.3 is the
 * productive band; above 1.5 injury risk climbs sharply. The bands are why we
 * refuse to reward unlimited volume in the weekly score.
 */
export const loadBalance = (activities: readonly Activity[], profile: HeartRateProfile, now: Date): LoadBalance => {
  const today = startOfDay(now);
  const daily = new Array<number>(28).fill(0);

  for (const a of activities) {
    const age = daysBetween(new Date(a.startedAt), today);
    if (age < 0 || age >= 28) continue;
    // Index 0 is the oldest day in the window so ewma walks forward in time.
    const idx = 27 - age;
    daily[idx] = (daily[idx] as number) + (a.trainingLoad ?? trainingLoad(a, profile));
  }

  const acute = ewma(daily.slice(-7), 3.5) ?? 0;
  const chronic = ewma(daily, 14) ?? 0;
  const ratio = chronic > 0 ? acute / chronic : null;

  let status: LoadBalance['status'] = 'maintaining';
  if (ratio == null) status = 'maintaining';
  else if (ratio < 0.8) status = 'detraining';
  else if (ratio <= 1.3) status = 'productive';
  else if (ratio <= 1.5) status = 'maintaining';
  else status = 'overreaching';

  return { acute, chronic, ratio, status };
};

export const weeklyLoad = (activities: readonly Activity[], profile: HeartRateProfile): number =>
  sum(activities.map((a) => a.trainingLoad ?? trainingLoad(a, profile)));
