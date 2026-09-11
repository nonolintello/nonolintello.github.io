import type {
  Activity,
  Athlete,
  AthleteGoal,
  Goal,
  GoalProgress,
  PersonalRecord,
  Race,
  WellnessDay,
} from '../domain/types';
import { isRunning, PR_DISTANCES_M } from '../domain/types';
import { currentRecords, predictFromRecords, type RacePrediction } from './bestEfforts';
import { efficiencyTrend, isHardSession, type EfficiencyTrend } from './efficiency';
import { computeGoalProgress } from './goals';
import { computeAthleteScore, computeWeeklyScore, type AthleteScore, type WeeklyScore } from './scoring';
import { linearRegression, mean, percentChange, round, sum, type LinearFit } from './stats';
import { heartRateProfile, loadBalance, trainingLoad, type LoadBalance } from './trainingLoad';
import { estimateVo2Max, fitnessState, recoveryState, type FitnessState, type RecoveryState } from './readiness';
import { goalProjection, raceReadiness, type GoalProjection, type RaceReadiness } from './objectives';
import {
  addWeeks,
  DAY_MS,
  inRange,
  startOfWeek,
  toISODate,
  trailingWeeks,
  type DateRange,
} from './time';
import { buildXpLedger, currentStreakDays, currentStreakWeeks, levelForXp, totalXp, type LevelInfo } from './xp';

export interface WeeklySummary {
  weekStart: string;
  activityCount: number;
  distanceM: number;
  movingSeconds: number;
  elevationGainM: number;
  /** Seconds per kilometre, distance-weighted across the week's runs. */
  avgPaceSecPerKm: number | null;
  avgHeartRate: number | null;
  avgCadenceSpm: number | null;
  trainingLoad: number;
  longestRunM: number;
  hardSessionCount: number;
  /** Distance per day of the week, Monday first — drives the weekly bar chart. */
  dailyDistanceM: number[];
}

const summariseWeek = (
  activities: readonly Activity[],
  range: DateRange,
  athlete: Pick<Athlete, 'restingHr' | 'maxHr' | 'birthDate'>,
): WeeklySummary => {
  const hrProfile = heartRateProfile(athlete);
  const runs = activities.filter(
    (a) => isRunning(a.sport) && inRange(new Date(a.startedAt), range),
  );

  const distanceM = sum(runs.map((a) => a.distanceM));
  const movingSeconds = sum(runs.map((a) => a.movingSeconds));

  const dailyDistanceM = new Array<number>(7).fill(0);
  for (const a of runs) {
    const dayIndex = Math.floor(
      (new Date(a.startedAt).getTime() - range.start.getTime()) / DAY_MS,
    );
    if (dayIndex >= 0 && dayIndex < 7) {
      dailyDistanceM[dayIndex] = (dailyDistanceM[dayIndex] as number) + a.distanceM;
    }
  }

  // Heart rate and cadence are weighted by duration, not averaged flat: a
  // 20-minute recovery jog should not pull a two-hour long run's average around.
  const weightedBy = (pick: (a: Activity) => number | undefined): number | null => {
    let weight = 0;
    let acc = 0;
    for (const a of runs) {
      const v = pick(a);
      if (v == null) continue;
      acc += v * a.movingSeconds;
      weight += a.movingSeconds;
    }
    return weight > 0 ? acc / weight : null;
  };

  return {
    weekStart: toISODate(range.start),
    activityCount: runs.length,
    distanceM,
    movingSeconds,
    elevationGainM: sum(runs.map((a) => a.elevationGainM ?? 0)),
    avgPaceSecPerKm: distanceM > 0 ? movingSeconds / (distanceM / 1000) : null,
    avgHeartRate: weightedBy((a) => a.avgHeartRate),
    avgCadenceSpm: weightedBy((a) => a.avgCadenceSpm),
    trainingLoad: sum(runs.map((a) => a.trainingLoad ?? trainingLoad(a, hrProfile))),
    longestRunM: runs.length > 0 ? Math.max(...runs.map((a) => a.distanceM)) : 0,
    hardSessionCount: runs.filter(isHardSession).length,
    dailyDistanceM,
  };
};

export interface MetricTrend {
  metric: string;
  current: number | null;
  baseline: number | null;
  changeRatio: number | null;
  direction: 'up' | 'down' | 'flat' | 'unknown';
  /** True when the direction is a good thing for this metric. */
  favourable: boolean | null;
  fit: LinearFit | null;
}

const buildTrend = (
  metric: string,
  weekly: readonly WeeklySummary[],
  pick: (w: WeeklySummary) => number | null,
  lowerIsBetter = false,
  threshold = 0.03,
): MetricTrend => {
  const series = weekly
    .map((w, i) => ({ x: i, y: pick(w) }))
    .filter((p): p is { x: number; y: number } => p.y != null && Number.isFinite(p.y));

  const recent = series.slice(-4).map((p) => p.y);
  const baselineSlice = series.slice(-12, -4).map((p) => p.y);
  const current = mean(recent);
  const baseline = mean(baselineSlice);
  const changeRatio = current != null && baseline != null ? percentChange(current, baseline) : null;

  let direction: MetricTrend['direction'] = 'unknown';
  if (changeRatio != null) {
    if (changeRatio > threshold) direction = 'up';
    else if (changeRatio < -threshold) direction = 'down';
    else direction = 'flat';
  }

  const favourable =
    direction === 'flat' ? true : direction === 'unknown' ? null : lowerIsBetter ? direction === 'down' : direction === 'up';

  return { metric, current, baseline, changeRatio, direction, favourable, fit: linearRegression(series) };
};

/**
 * The structured view of an athlete that every downstream consumer reads —
 * dashboard, insight generator, and later the LLM reasoning layer.
 *
 * Nothing downstream is allowed to touch raw activity rows. Keeping the
 * boundary here is what makes the insight layer swappable: a language model
 * receives this object, never the database.
 */
export interface AthleteProfile {
  athlete: Athlete;
  generatedAt: string;

  level: LevelInfo;
  score: AthleteScore;
  weeklyScore: WeeklyScore;

  currentWeek: WeeklySummary;
  previousWeek: WeeklySummary;
  trailingWeeks: WeeklySummary[];

  goal: GoalProgress | null;
  records: PersonalRecord[];
  predictions: RacePrediction[];

  load: LoadBalance;
  efficiency: EfficiencyTrend;
  trends: {
    volume: MetricTrend;
    pace: MetricTrend;
    heartRate: MetricTrend;
    elevation: MetricTrend;
    frequency: MetricTrend;
  };

  fitness: FitnessState;
  recovery: RecoveryState;
  vo2Max: number | null;
  /** Season objectives, not the weekly gamification goal above. */
  objectives: GoalProjection[];
  raceReadiness: RaceReadiness[];

  streakDays: number;
  streakWeeks: number;
  totalXp: number;

  recentActivities: Activity[];
  totals: {
    activityCount: number;
    distanceM: number;
    movingSeconds: number;
    elevationGainM: number;
  };
}

export interface ProfileContext {
  wellness?: readonly WellnessDay[];
  objectives?: readonly AthleteGoal[];
  races?: readonly Race[];
}

export const buildAthleteProfile = (
  athlete: Athlete,
  activities: readonly Activity[],
  goal: Goal | null,
  now: Date = new Date(),
  context: ProfileContext = {},
): AthleteProfile => {
  const sorted = [...activities].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  const weeks = trailingWeeks(now, 13);
  const weekly = weeks.map((r) => summariseWeek(sorted, r, athlete));
  const currentWeek = weekly[weekly.length - 1] as WeeklySummary;
  const previousWeek = weekly[weekly.length - 2] as WeeklySummary;
  // Trends compare completed weeks only. Including today's partial week would
  // report a decline every Monday morning purely as an artefact of the clock.
  const completedWeeks = weekly.slice(0, -1);

  const thisWeekStart = startOfWeek(now);
  const weekActivities = sorted.filter(
    (a) => new Date(a.startedAt).getTime() >= thisWeekStart.getTime(),
  );
  const baselineStart = addWeeks(thisWeekStart, -4).getTime();
  const baselineActivities = sorted.filter((a) => {
    const t = new Date(a.startedAt).getTime();
    return t >= baselineStart && t < thisWeekStart.getTime();
  });

  const goalProgress = goal ? computeGoalProgress(goal, sorted, now) : null;
  const records = currentRecords(sorted, athlete.id);
  const ledger = buildXpLedger(sorted, records);
  const xp = totalXp(ledger);

  const predictions = PR_DISTANCES_M.map((d) => predictFromRecords(records, d)).filter(
    (p): p is RacePrediction => p !== null,
  );

  const score = computeAthleteScore(sorted, athlete, now);
  const fitness = fitnessState(sorted, athlete, now);
  const recovery = recoveryState(context.wellness ?? [], fitness, now);
  const fiveKEquivalent = predictFromRecords(records, 5000)?.predictedSeconds ?? null;

  const objectives = (context.objectives ?? []).map((objective) =>
    goalProjection(objective, records, sorted, now, athlete.unitPreference),
  );

  const readiness = (context.races ?? [])
    .filter((race) => new Date(`${race.date}T00:00:00`).getTime() >= now.getTime())
    .map((race) =>
      raceReadiness(
        race,
        records,
        sorted,
        score.consistency.value,
        fitness.form,
        fitness.fitness.value,
        now,
        athlete.unitPreference,
      ),
    );

  return {
    athlete,
    generatedAt: now.toISOString(),
    level: levelForXp(xp),
    score,
    weeklyScore: computeWeeklyScore(weekActivities, baselineActivities, athlete, goalProgress, now),
    currentWeek,
    previousWeek,
    trailingWeeks: weekly,
    goal: goalProgress,
    records,
    predictions,
    load: loadBalance(sorted, heartRateProfile(athlete), now),
    efficiency: efficiencyTrend(sorted, now),
    trends: {
      volume: buildTrend('weekly_distance', completedWeeks, (w) => w.distanceM),
      pace: buildTrend('avg_pace', completedWeeks, (w) => w.avgPaceSecPerKm, true, 0.015),
      heartRate: buildTrend('avg_heart_rate', completedWeeks, (w) => w.avgHeartRate, true, 0.015),
      elevation: buildTrend('elevation_gain', completedWeeks, (w) => w.elevationGainM),
      frequency: buildTrend('activity_count', completedWeeks, (w) => w.activityCount),
    },
    fitness,
    recovery,
    vo2Max: estimateVo2Max(fiveKEquivalent),
    objectives,
    raceReadiness: readiness,
    streakDays: currentStreakDays(sorted, now),
    streakWeeks: currentStreakWeeks(sorted, now),
    totalXp: xp,
    recentActivities: sorted.slice(0, 30),
    totals: {
      activityCount: sorted.length,
      distanceM: sum(sorted.map((a) => a.distanceM)),
      movingSeconds: sum(sorted.map((a) => a.movingSeconds)),
      elevationGainM: sum(sorted.map((a) => a.elevationGainM ?? 0)),
    },
  };
};

/** Compact serialisation for handing an athlete's state to a language model. */
export const profileToPromptContext = (profile: AthleteProfile): Record<string, unknown> => ({
  athlete: {
    displayName: profile.athlete.displayName,
    level: profile.level.level,
    unitPreference: profile.athlete.unitPreference,
  },
  overallScore: profile.score.overall,
  dimensions: {
    speed: profile.score.speed.value,
    endurance: profile.score.endurance.value,
    consistency: profile.score.consistency.value,
    climbing: profile.score.climbing.value,
    progression: profile.score.progression.value,
  },
  currentWeek: {
    runs: profile.currentWeek.activityCount,
    distanceKm: round(profile.currentWeek.distanceM / 1000, 1),
    avgPaceSecPerKm: profile.currentWeek.avgPaceSecPerKm,
    trainingLoad: round(profile.currentWeek.trainingLoad, 0),
  },
  trends: Object.fromEntries(
    Object.entries(profile.trends).map(([k, v]) => [
      k,
      { direction: v.direction, changeRatio: v.changeRatio, favourable: v.favourable },
    ]),
  ),
  load: { ratio: profile.load.ratio, status: profile.load.status },
  efficiency: { direction: profile.efficiency.direction, changeRatio: profile.efficiency.changeRatio },
  records: profile.records.map((r) => ({
    distanceM: r.distanceM,
    seconds: round(r.elapsedSeconds, 0),
    achievedAt: r.achievedAt,
  })),
  streakWeeks: profile.streakWeeks,
});
