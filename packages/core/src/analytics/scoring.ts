import type { Activity, Athlete, GoalProgress } from '../domain/types';
import { isRunning } from '../domain/types';
import { predictFromRecords, currentRecords } from './bestEfforts';
import { efficiencyTrend, isHardSession } from './efficiency';
import { clamp, coefficientOfVariation, percentChange, round, sigmoid, sum } from './stats';
import { heartRateProfile } from './trainingLoad';
import { DAY_MS, daysBetween, startOfDay, startOfWeek, addWeeks } from './time';

export const SCORING_ALGORITHM_VERSION = '1.0.0';

/**
 * Piecewise-linear mapping through control points, clamped at both ends.
 * Preferred over a formula because the control points are readable and can be
 * tuned against real athlete data without re-deriving anything.
 */
export const piecewise = (x: number, points: readonly (readonly [number, number])[]): number => {
  if (points.length === 0) return 0;
  const first = points[0] as readonly [number, number];
  const last = points[points.length - 1] as readonly [number, number];
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i] as readonly [number, number];
    const b = points[i + 1] as readonly [number, number];
    if (x >= a[0] && x <= b[0]) {
      const t = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
      return a[1] + t * (b[1] - a[1]);
    }
  }
  return last[1];
};

/**
 * Turns a proportional change against the athlete's own baseline into 0..100,
 * where "no change" sits at 50.
 *
 * This is the mechanism that lets a beginner out-score an elite: the input is
 * always a ratio against that athlete's own past, never an absolute number.
 */
export const progressScore = (changeRatio: number | null, meaningfulChange: number): number => {
  if (changeRatio == null || !Number.isFinite(changeRatio)) return 50;
  // Scaled so a change of `meaningfulChange` lands near 73 and double that near 88.
  return clamp(sigmoid(changeRatio, 0, 2 / meaningfulChange) * 100, 0, 100);
};

const ABSOLUTE_WEIGHT = 0.35;
const PERSONAL_WEIGHT = 0.65;

const blend = (absolute: number, personal: number): number =>
  clamp(ABSOLUTE_WEIGHT * absolute + PERSONAL_WEIGHT * personal, 0, 100);

interface Window {
  activities: Activity[];
  days: number;
}

const windowOf = (activities: readonly Activity[], now: Date, fromDaysAgo: number, toDaysAgo = 0): Window => {
  const end = now.getTime() - toDaysAgo * DAY_MS;
  const start = now.getTime() - fromDaysAgo * DAY_MS;
  return {
    activities: activities.filter((a) => {
      const t = new Date(a.startedAt).getTime();
      return t >= start && t < end && isRunning(a.sport);
    }),
    days: fromDaysAgo - toDaysAgo,
  };
};

const totalDistance = (w: Window) => sum(w.activities.map((a) => a.distanceM));
const totalElevation = (w: Window) => sum(w.activities.map((a) => a.elevationGainM ?? 0));
const weeklyDistance = (w: Window) => (w.days > 0 ? totalDistance(w) / (w.days / 7) : 0);
const longestRun = (w: Window) => Math.max(0, ...w.activities.map((a) => a.distanceM));
const runsPerWeek = (w: Window) => (w.days > 0 ? w.activities.length / (w.days / 7) : 0);

export interface ScoreComponent {
  value: number;
  absolute: number;
  personal: number;
  /** Plain-language explanation of what drove this number. */
  explanation: string;
  evidence: Record<string, number | string | null>;
}

export interface AthleteScore {
  overall: number;
  speed: ScoreComponent;
  endurance: ScoreComponent;
  consistency: ScoreComponent;
  climbing: ScoreComponent;
  progression: ScoreComponent;
  algorithmVersion: string;
  computedAt: string;
  /** False when there is too little history for the score to mean anything. */
  hasSufficientData: boolean;
}

const DIMENSION_WEIGHTS = {
  speed: 0.2,
  endurance: 0.2,
  // Consistency and progression together carry half the overall score: showing
  // up and improving must outrank raw ability.
  consistency: 0.25,
  climbing: 0.1,
  progression: 0.25,
} as const;

/** Reference 5K times mapped to an absolute speed band, in seconds. */
const SPEED_BANDS: readonly (readonly [number, number])[] = [
  [2100, 5], // 35:00
  [1800, 18], // 30:00
  [1620, 32], // 27:00
  [1500, 45], // 25:00
  [1380, 56], // 23:00
  [1302, 66], // 21:42
  [1200, 76], // 20:00
  [1080, 87], // 18:00
  [990, 94], // 16:30
  [900, 99], // 15:00
];

const speedDimension = (activities: readonly Activity[], now: Date): ScoreComponent => {
  const recent = windowOf(activities, now, 84);
  const prior = windowOf(activities, now, 168, 84);

  const recentRecords = currentRecords(recent.activities, 'tmp');
  const priorRecords = currentRecords(prior.activities, 'tmp');

  const recent5k = predictFromRecords(recentRecords, 5000)?.predictedSeconds ?? null;
  const prior5k = predictFromRecords(priorRecords, 5000)?.predictedSeconds ?? null;

  const absolute = recent5k != null ? piecewise(recent5k, SPEED_BANDS) : 40;

  // A faster time is a smaller number, so invert to make improvement positive.
  const change = recent5k != null && prior5k != null ? percentChange(prior5k, recent5k) : null;
  // 2% off a 5K time over a training block is a strong improvement.
  const personal = progressScore(change, 0.02);

  const explanation =
    recent5k == null
      ? 'Not enough recent efforts to estimate 5K speed.'
      : change == null
        ? `Estimated 5K equivalent of ${Math.round(recent5k / 60)} min from recent efforts.`
        : change > 0.005
          ? `5K equivalent improved ${round(change * 100, 1)}% versus the previous 12 weeks.`
          : change < -0.005
            ? `5K equivalent is ${round(-change * 100, 1)}% slower than the previous 12 weeks.`
            : 'Speed is holding steady against your previous block.';

  return {
    value: blend(absolute, personal),
    absolute,
    personal,
    explanation,
    evidence: { recent5kSeconds: recent5k, prior5kSeconds: prior5k, changeRatio: change },
  };
};

const ENDURANCE_LONG_RUN_BANDS: readonly (readonly [number, number])[] = [
  [3000, 5],
  [8000, 25],
  [13000, 45],
  [18000, 62],
  [21097, 72],
  [26000, 82],
  [32000, 91],
  [42195, 99],
];

const ENDURANCE_VOLUME_BANDS: readonly (readonly [number, number])[] = [
  [5000, 5],
  [15000, 25],
  [30000, 45],
  [45000, 62],
  [65000, 78],
  [90000, 90],
  [120000, 98],
];

const enduranceDimension = (activities: readonly Activity[], now: Date): ScoreComponent => {
  const recent = windowOf(activities, now, 56);
  const prior = windowOf(activities, now, 112, 56);

  const recentLongest = longestRun(recent);
  const priorLongest = longestRun(prior);
  const recentVolume = weeklyDistance(recent);
  const priorVolume = weeklyDistance(prior);

  const absolute =
    0.5 * piecewise(recentLongest, ENDURANCE_LONG_RUN_BANDS) +
    0.5 * piecewise(recentVolume, ENDURANCE_VOLUME_BANDS);

  const longestChange = priorLongest > 0 ? percentChange(recentLongest, priorLongest) : null;
  const volumeChange = priorVolume > 0 ? percentChange(recentVolume, priorVolume) : null;
  const personal =
    0.5 * progressScore(longestChange, 0.15) + 0.5 * progressScore(volumeChange, 0.15);

  const explanation =
    recent.activities.length === 0
      ? 'No running in the last eight weeks.'
      : `Longest run ${round(recentLongest / 1000, 1)} km, averaging ${round(recentVolume / 1000, 1)} km per week.`;

  return {
    value: blend(absolute, personal),
    absolute,
    personal,
    explanation,
    evidence: {
      longestRunM: recentLongest,
      weeklyVolumeM: recentVolume,
      longestChange,
      volumeChange,
    },
  };
};

/**
 * Consistency is measured entirely against the athlete's own pattern, so it is
 * the dimension where a beginner can legitimately score 90+ from week one.
 */
const consistencyDimension = (activities: readonly Activity[], now: Date): ScoreComponent => {
  const recent = windowOf(activities, now, 28);
  const extended = windowOf(activities, now, 84);

  const frequency = runsPerWeek(recent);
  // Four runs a week is treated as the point of strong habit, not a ceiling.
  const frequencyScore = piecewise(frequency, [
    [0, 0],
    [1, 22],
    [2, 45],
    [3, 66],
    [4, 84],
    [5, 93],
    [6, 98],
  ]);

  // Fraction of the last eight weeks containing at least two runs.
  const weekStart = startOfWeek(now);
  let weeksWithRuns = 0;
  for (let i = 0; i < 8; i++) {
    const start = addWeeks(weekStart, -i).getTime();
    const end = start + 7 * DAY_MS;
    const count = extended.activities.filter((a) => {
      const t = new Date(a.startedAt).getTime();
      return t >= start && t < end;
    }).length;
    if (count >= 2) weeksWithRuns++;
  }
  const adherenceScore = (weeksWithRuns / 8) * 100;

  // Evenly spaced runs beat the same volume crammed into a weekend.
  const times = recent.activities
    .map((a) => new Date(a.startedAt).getTime())
    .sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    gaps.push(((times[i] as number) - (times[i - 1] as number)) / DAY_MS);
  }
  const gapCv = coefficientOfVariation(gaps);
  const regularityScore = gapCv == null ? 50 : clamp(100 - gapCv * 85, 0, 100);

  const value = clamp(0.45 * frequencyScore + 0.35 * adherenceScore + 0.2 * regularityScore, 0, 100);

  return {
    value,
    absolute: frequencyScore,
    personal: adherenceScore,
    explanation:
      recent.activities.length === 0
        ? 'No activity in the last four weeks.'
        : `${round(frequency, 1)} runs per week, with activity in ${weeksWithRuns} of the last 8 weeks.`,
    evidence: {
      runsPerWeek: frequency,
      weeksWithRuns,
      gapVariation: gapCv,
    },
  };
};

const climbingDimension = (activities: readonly Activity[], now: Date): ScoreComponent => {
  const recent = windowOf(activities, now, 56);
  const prior = windowOf(activities, now, 112, 56);

  const recentDist = totalDistance(recent);
  const priorDist = totalDistance(prior);
  // Metres climbed per kilometre run — comparable across athletes and terrain.
  const recentRate = recentDist > 0 ? totalElevation(recent) / (recentDist / 1000) : 0;
  const priorRate = priorDist > 0 ? totalElevation(prior) / (priorDist / 1000) : 0;

  const absolute = piecewise(recentRate, [
    [0, 3],
    [4, 22],
    [8, 42],
    [12, 58],
    [18, 74],
    [28, 89],
    [40, 98],
  ]);

  const change = priorRate > 0 ? percentChange(recentRate, priorRate) : null;
  const personal = progressScore(change, 0.2);

  return {
    value: blend(absolute, personal),
    absolute,
    personal,
    explanation: `${Math.round(totalElevation(recent))} m climbed over eight weeks, ${round(recentRate, 1)} m per km.`,
    evidence: { elevationPerKm: recentRate, priorElevationPerKm: priorRate, changeRatio: change },
  };
};

/**
 * Progression is the purest self-relative dimension: it asks only whether this
 * athlete is getting better, using efficiency, records and sensible volume
 * growth. Volume growth is deliberately scored to peak in the healthy range
 * rather than to increase without bound.
 */
const progressionDimension = (
  activities: readonly Activity[],
  athlete: Pick<Athlete, 'restingHr' | 'maxHr' | 'birthDate'>,
  now: Date,
): ScoreComponent => {
  const trend = efficiencyTrend(activities, now);
  const efficiencyScore = progressScore(trend.changeRatio, 0.03);

  const twelveWeeks = windowOf(activities, now, 84);
  const records = currentRecords(twelveWeeks.activities, 'tmp');
  const recentPrCount = records.filter(
    (r) => daysBetween(new Date(r.achievedAt), now) <= 84 && r.previousElapsedSeconds != null,
  ).length;
  const prScore = piecewise(recentPrCount, [
    [0, 40],
    [1, 65],
    [2, 80],
    [3, 90],
    [5, 98],
  ]);

  const recentVolume = weeklyDistance(windowOf(activities, now, 28));
  const priorVolume = weeklyDistance(windowOf(activities, now, 84, 28));
  const volumeChange = priorVolume > 0 ? percentChange(recentVolume, priorVolume) : null;
  // Peaks around +12% and falls away past +35%, where growth stops being training.
  const volumeScore =
    volumeChange == null
      ? 50
      : piecewise(volumeChange, [
          [-0.4, 15],
          [-0.15, 40],
          [0, 58],
          [0.12, 88],
          [0.25, 78],
          [0.4, 52],
          [0.7, 25],
        ]);

  const value = clamp(0.4 * efficiencyScore + 0.3 * prScore + 0.3 * volumeScore, 0, 100);

  const explanation =
    trend.direction === 'improving'
      ? `Aerobic efficiency up ${round((trend.changeRatio ?? 0) * 100, 1)}% over four weeks.`
      : recentPrCount > 0
        ? `${recentPrCount} personal record${recentPrCount > 1 ? 's' : ''} in the last 12 weeks.`
        : 'Holding your current level — no clear improvement signal yet.';

  return {
    value,
    absolute: prScore,
    personal: efficiencyScore,
    explanation,
    evidence: {
      efficiencyChange: trend.changeRatio,
      efficiencyDirection: trend.direction,
      recentPrCount,
      volumeChange,
      // Referenced so the HR profile stays part of the audit trail.
      maxHr: heartRateProfile(athlete).maxHr,
    },
  };
};

export const computeAthleteScore = (
  activities: readonly Activity[],
  athlete: Pick<Athlete, 'restingHr' | 'maxHr' | 'birthDate'>,
  now: Date = new Date(),
): AthleteScore => {
  const speed = speedDimension(activities, now);
  const endurance = enduranceDimension(activities, now);
  const consistency = consistencyDimension(activities, now);
  const climbing = climbingDimension(activities, now);
  const progression = progressionDimension(activities, athlete, now);

  const overall =
    speed.value * DIMENSION_WEIGHTS.speed +
    endurance.value * DIMENSION_WEIGHTS.endurance +
    consistency.value * DIMENSION_WEIGHTS.consistency +
    climbing.value * DIMENSION_WEIGHTS.climbing +
    progression.value * DIMENSION_WEIGHTS.progression;

  const recentCount = windowOf(activities, now, 56).activities.length;

  return {
    overall: round(clamp(overall, 0, 100), 1),
    speed: { ...speed, value: round(speed.value, 1) },
    endurance: { ...endurance, value: round(endurance.value, 1) },
    consistency: { ...consistency, value: round(consistency.value, 1) },
    climbing: { ...climbing, value: round(climbing.value, 1) },
    progression: { ...progression, value: round(progression.value, 1) },
    algorithmVersion: SCORING_ALGORITHM_VERSION,
    computedAt: now.toISOString(),
    hasSufficientData: recentCount >= 4,
  };
};

// ---------------------------------------------------------------------------
// Weekly score
// ---------------------------------------------------------------------------

export interface WeeklyScoreComponent {
  key: string;
  label: string;
  earned: number;
  max: number;
  detail: string;
}

export interface WeeklyScore {
  total: number;
  grade: 'exceptional' | 'strong' | 'solid' | 'building' | 'light';
  components: WeeklyScoreComponent[];
  algorithmVersion: string;
}

const gradeFor = (total: number): WeeklyScore['grade'] => {
  if (total >= 85) return 'exceptional';
  if (total >= 70) return 'strong';
  if (total >= 55) return 'solid';
  if (total >= 35) return 'building';
  return 'light';
};

/**
 * Scores a single training week out of 100.
 *
 * Volume is scored against the athlete's own four-week baseline and peaks
 * between 1.0× and 1.3×, then declines above 1.6×. Running more is not
 * automatically better, and the score should not push an athlete toward the
 * ramp rate that injures them.
 */
export const computeWeeklyScore = (
  weekActivities: readonly Activity[],
  baselineActivities: readonly Activity[],
  athlete: Pick<Athlete, 'restingHr' | 'maxHr' | 'birthDate'>,
  goalProgress: GoalProgress | null,
  now: Date = new Date(),
): WeeklyScore => {
  const runs = weekActivities.filter((a) => isRunning(a.sport));
  const distance = sum(runs.map((a) => a.distanceM));
  const elevation = sum(runs.map((a) => a.elevationGainM ?? 0));

  const baselineRuns = baselineActivities.filter((a) => isRunning(a.sport));
  const baselineWeeklyDistance = baselineRuns.length > 0 ? sum(baselineRuns.map((a) => a.distanceM)) / 4 : 0;
  const baselineWeeklyElevation =
    baselineRuns.length > 0 ? sum(baselineRuns.map((a) => a.elevationGainM ?? 0)) / 4 : 0;
  const baselineFrequency = baselineRuns.length / 4;

  const components: WeeklyScoreComponent[] = [];

  // Goal completion — 25
  const goalMax = 25;
  // Neutral when no goal is set, so not setting one isn't itself a penalty.
  const goalEarned = goalProgress ? clamp(goalProgress.ratio, 0, 1) * goalMax : goalMax * 0.5;
  components.push({
    key: 'goal',
    label: 'Weekly goal',
    earned: round(goalEarned, 1),
    max: goalMax,
    detail: goalProgress
      ? `${Math.round(goalProgress.percentComplete)}% of your goal`
      : 'No goal set this week',
  });

  // Consistency — 20
  const consistencyMax = 20;
  const daysActive = new Set(runs.map((a) => startOfDay(new Date(a.startedAt)).getTime())).size;
  const frequencyTarget = Math.max(3, Math.round(baselineFrequency));
  const consistencyEarned = clamp(daysActive / frequencyTarget, 0, 1) * consistencyMax;
  components.push({
    key: 'consistency',
    label: 'Consistency',
    earned: round(consistencyEarned, 1),
    max: consistencyMax,
    detail: `${daysActive} training day${daysActive === 1 ? '' : 's'}`,
  });

  // Volume relative to own baseline — 20
  const volumeMax = 20;
  const volumeRatio = baselineWeeklyDistance > 0 ? distance / baselineWeeklyDistance : distance > 0 ? 1 : 0;
  const volumeEarned =
    piecewise(volumeRatio, [
      [0, 0],
      [0.4, 30],
      [0.7, 62],
      [1.0, 90],
      [1.25, 100],
      [1.5, 88],
      [1.75, 60],
      [2.2, 30],
    ]) / 100 * volumeMax;
  components.push({
    key: 'volume',
    label: 'Volume',
    earned: round(volumeEarned, 1),
    max: volumeMax,
    detail:
      baselineWeeklyDistance > 0
        ? `${round(volumeRatio, 2)}× your 4-week average`
        : `${round(distance / 1000, 1)} km`,
  });

  // Intensity distribution — 15. Rewards one or two quality sessions inside a
  // mostly easy week, which is how endurance training actually works.
  const intensityMax = 15;
  const hardCount = runs.filter(isHardSession).length;
  const easyRatio = runs.length > 0 ? (runs.length - hardCount) / runs.length : 0;
  const hardScore = piecewise(hardCount, [
    [0, 45],
    [1, 90],
    [2, 100],
    [3, 72],
    [4, 40],
  ]);
  const easyScore = piecewise(easyRatio, [
    [0, 20],
    [0.5, 60],
    [0.75, 95],
    [1, 80],
  ]);
  const intensityEarned = ((0.6 * hardScore + 0.4 * easyScore) / 100) * intensityMax;
  components.push({
    key: 'intensity',
    label: 'Intensity mix',
    earned: round(intensityEarned, 1),
    max: intensityMax,
    detail:
      runs.length === 0
        ? 'No sessions'
        : `${hardCount} quality, ${runs.length - hardCount} aerobic`,
  });

  // Progression — 12
  const progressionMax = 12;
  const allRecords = currentRecords([...baselineActivities, ...weekActivities], 'tmp');
  const prsThisWeek = allRecords.filter(
    (r) => new Date(r.achievedAt).getTime() >= now.getTime() - 7 * DAY_MS,
  ).length;
  const trend = efficiencyTrend([...baselineActivities, ...weekActivities], now);
  const progressionEarned =
    clamp(
      (prsThisWeek > 0 ? 0.6 : 0) +
        (trend.direction === 'improving' ? 0.4 : trend.direction === 'stable' ? 0.2 : 0.1),
      0,
      1,
    ) * progressionMax;
  components.push({
    key: 'progression',
    label: 'Progression',
    earned: round(progressionEarned, 1),
    max: progressionMax,
    detail:
      prsThisWeek > 0
        ? `${prsThisWeek} personal record${prsThisWeek > 1 ? 's' : ''}`
        : trend.direction === 'improving'
          ? 'Aerobic efficiency improving'
          : 'No breakthrough this week',
  });

  // Climbing — 8
  const climbingMax = 8;
  const elevationRatio =
    baselineWeeklyElevation > 0 ? elevation / baselineWeeklyElevation : elevation > 0 ? 1 : 0;
  const climbingEarned =
    (piecewise(elevationRatio, [
      [0, 10],
      [0.5, 45],
      [1, 85],
      [1.5, 100],
      [2.5, 100],
    ]) /
      100) *
    climbingMax;
  components.push({
    key: 'climbing',
    label: 'Climbing',
    earned: round(climbingEarned, 1),
    max: climbingMax,
    detail: `${Math.round(elevation)} m gained`,
  });

  const total = round(clamp(sum(components.map((c) => c.earned)), 0, 100), 0);

  return { total, grade: gradeFor(total), components, algorithmVersion: SCORING_ALGORITHM_VERSION };
};
