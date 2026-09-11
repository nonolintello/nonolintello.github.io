import type { Activity, AthleteGoal, PersonalRecord, Race } from '../domain/types';
import { distanceIn, distanceLabel, type UnitPreference } from '../domain/units';
import { isRunning } from '../domain/types';
import { predictFromRecords } from './bestEfforts';
import { piecewise } from './scoring';
import { clamp, round, sum } from './stats';
import { DAY_MS, daysBetween, startOfDay } from './time';

export interface GoalProjection {
  goal: AthleteGoal;
  /** Where the athlete is projected to finish, for race_time goals. */
  predictedSeconds: number | null;
  targetSeconds: number | null;
  /** Seconds still to find. Negative means already ahead of target. */
  gapSeconds: number | null;
  /** 0..1 of the way from where they started to the target. */
  progress: number;
  onTrack: boolean;
  daysRemaining: number | null;
  summary: string;
}

const formatGap = (seconds: number): string => {
  const total = Math.round(Math.abs(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
};

/**
 * Progress toward a season goal, measured against a projection rather than the
 * calendar.
 *
 * A goal that is 60% of the way through its timeline is not 60% complete —
 * what matters is whether current fitness projects to the target, which is why
 * this reports the gap in seconds rather than a share of elapsed time.
 */
export const goalProjection = (
  goal: AthleteGoal,
  records: readonly PersonalRecord[],
  activities: readonly Activity[],
  now: Date,
  unit: UnitPreference = 'metric',
): GoalProjection => {
  const daysRemaining = goal.targetDate ? daysBetween(startOfDay(now), new Date(`${goal.targetDate}T00:00:00`)) : null;

  if (goal.kind === 'race_time' && goal.targetSeconds && goal.targetDistanceM) {
    const prediction = predictFromRecords(records, goal.targetDistanceM);
    const predictedSeconds = prediction?.predictedSeconds ?? null;
    const gapSeconds = predictedSeconds != null ? predictedSeconds - goal.targetSeconds : null;

    // Progress is measured from a nominal 12% slower-than-target starting
    // point, so an athlete who begins well off the pace still sees movement.
    const start = goal.targetSeconds * 1.12;
    const progress =
      predictedSeconds != null
        ? clamp((start - predictedSeconds) / (start - goal.targetSeconds), 0, 1)
        : 0;

    return {
      goal,
      predictedSeconds,
      targetSeconds: goal.targetSeconds,
      gapSeconds,
      progress,
      onTrack: gapSeconds != null && gapSeconds <= goal.targetSeconds * 0.02,
      daysRemaining,
      summary:
        gapSeconds == null
          ? 'Not enough race-distance efforts to project from yet.'
          : gapSeconds <= 0
            ? `Current fitness projects ${formatGap(gapSeconds)} inside your target.`
            : `Current fitness projects ${formatGap(gapSeconds)} outside your target.`,
    };
  }

  if (goal.kind === 'distance_volume' && goal.targetDistanceM) {
    const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
    const covered = sum(
      activities
        .filter((a) => isRunning(a.sport) && new Date(a.startedAt).getTime() >= yearStart)
        .map((a) => a.distanceM),
    );
    const progress = clamp(covered / goal.targetDistanceM, 0, 1);
    const dayOfYear = Math.max(1, daysBetween(new Date(now.getFullYear(), 0, 1), now) + 1);
    const projected = (covered / dayOfYear) * 365;

    return {
      goal,
      predictedSeconds: null,
      targetSeconds: null,
      gapSeconds: null,
      progress,
      onTrack: projected >= goal.targetDistanceM,
      daysRemaining,
      summary:
        projected >= goal.targetDistanceM
          ? `On pace for ${Math.round(distanceIn(projected, unit)).toLocaleString()} ${distanceLabel(unit)} by year end.`
          : `On pace for ${Math.round(distanceIn(projected, unit)).toLocaleString()} ${distanceLabel(unit)} — short of target at the current rate.`,
    };
  }

  if (goal.kind === 'consistency' && goal.targetCount) {
    const fourWeeksAgo = now.getTime() - 28 * DAY_MS;
    const runs = activities.filter(
      (a) => isRunning(a.sport) && new Date(a.startedAt).getTime() >= fourWeeksAgo,
    ).length;
    const perWeek = runs / 4;
    const progress = clamp(perWeek / goal.targetCount, 0, 1);
    return {
      goal,
      predictedSeconds: null,
      targetSeconds: null,
      gapSeconds: null,
      progress,
      onTrack: perWeek >= goal.targetCount * 0.95,
      daysRemaining,
      summary: `Averaging ${round(perWeek, 1)} runs a week against a target of ${goal.targetCount}.`,
    };
  }

  return {
    goal,
    predictedSeconds: null,
    targetSeconds: null,
    gapSeconds: null,
    progress: 0,
    onTrack: true,
    daysRemaining,
    summary: 'Tracking.',
  };
};

export interface ReadinessFactor {
  key: string;
  label: string;
  /** 0..100. */
  score: number;
  weight: number;
  detail: string;
}

export interface RaceReadiness {
  race: Race;
  daysUntil: number;
  /** 0..100 composite. */
  percent: number;
  factors: ReadinessFactor[];
  limiter: ReadinessFactor | null;
}

/**
 * How prepared the athlete is for a specific race.
 *
 * Deliberately multi-factor: a projection alone says nothing about whether the
 * athlete has done the specific work the distance demands. Each factor is
 * reported separately so the athlete can see *what* is holding them back, which
 * is the only part that is actionable.
 */
export const raceReadiness = (
  race: Race,
  records: readonly PersonalRecord[],
  activities: readonly Activity[],
  consistencyScore: number,
  form: number,
  fitness: number,
  now: Date,
  unit: UnitPreference = 'metric',
): RaceReadiness => {
  const until = daysBetween(startOfDay(now), new Date(`${race.date}T00:00:00`));
  const eightWeeksAgo = now.getTime() - 56 * DAY_MS;
  const recent = activities.filter(
    (a) => isRunning(a.sport) && new Date(a.startedAt).getTime() >= eightWeeksAgo,
  );

  const longest = Math.max(0, ...recent.map((a) => a.distanceM));
  const weeklyVolume = sum(recent.map((a) => a.distanceM)) / 8;

  // Longer races need proportionally less of the distance in training.
  const longRunTarget = race.distanceM >= 30000 ? race.distanceM * 0.78 : race.distanceM * 1.05;
  const longRunScore = piecewise(longest / longRunTarget, [
    [0.4, 10],
    [0.6, 35],
    [0.8, 62],
    [1.0, 92],
    [1.25, 100],
  ]);

  const volumeTarget = race.distanceM >= 30000 ? 65000 : race.distanceM >= 15000 ? 48000 : 35000;
  const volumeScore = piecewise(weeklyVolume / volumeTarget, [
    [0.4, 15],
    [0.65, 45],
    [0.85, 72],
    [1.0, 90],
    [1.3, 100],
  ]);

  const prediction = predictFromRecords(records, race.distanceM);
  const goalScore =
    race.goalSeconds && prediction
      ? piecewise(prediction.predictedSeconds / race.goalSeconds, [
          [0.95, 100],
          [1.0, 92],
          [1.03, 70],
          [1.07, 45],
          [1.15, 15],
        ])
      : prediction
        ? 75
        : 45;

  // Freshness only matters close to the race; deep in a block, fatigue is fine.
  const taperWindow = clamp(1 - until / 21, 0, 1);
  const freshness = fitness > 0 ? clamp(50 + (form / fitness) * 160, 0, 100) : 50;
  const formScore = 50 + (freshness - 50) * taperWindow;

  const factors: ReadinessFactor[] = [
    {
      key: 'projection',
      label: 'Projected performance',
      score: goalScore,
      weight: 0.3,
      detail:
        prediction && race.goalSeconds
          ? `Projecting ${Math.round(prediction.predictedSeconds / 60)} min against a ${Math.round(race.goalSeconds / 60)} min target`
          : 'No goal time set',
    },
    {
      key: 'longRun',
      label: 'Specific endurance',
      score: longRunScore,
      weight: 0.27,
      detail: `Longest run ${round(distanceIn(longest, unit), 1)} ${distanceLabel(unit)} against ${round(distanceIn(longRunTarget, unit), 1)} needed`,
    },
    {
      key: 'volume',
      label: 'Training volume',
      score: volumeScore,
      weight: 0.23,
      detail: `${round(distanceIn(weeklyVolume, unit), 1)} ${distanceLabel(unit)} per week over eight weeks`,
    },
    {
      key: 'consistency',
      label: 'Consistency',
      score: consistencyScore,
      weight: 0.1,
      detail: 'Frequency and adherence across the block',
    },
    {
      key: 'freshness',
      label: 'Freshness',
      score: formScore,
      weight: 0.1,
      detail:
        until > 21
          ? 'Not yet relevant — still building'
          : form >= 0
            ? 'Carrying little fatigue into race week'
            : 'Still carrying training fatigue',
    },
  ];

  const percent = round(
    clamp(sum(factors.map((f) => f.score * f.weight)), 0, 100),
    0,
  );

  const limiter = [...factors]
    .filter((f) => f.weight >= 0.2)
    .sort((a, b) => a.score - b.score)[0] ?? null;

  return { race, daysUntil: until, percent, factors, limiter };
};
