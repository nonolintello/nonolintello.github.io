import type { Activity, Goal, GoalMetric, GoalProgress } from '../domain/types';
import { isRunning } from '../domain/types';
import { clamp, sum } from './stats';
import { heartRateProfile, trainingLoad } from './trainingLoad';
import { DAY_MS, daysBetween, startOfDay } from './time';

export const goalMetricValue = (activities: readonly Activity[], metric: GoalMetric): number => {
  switch (metric) {
    case 'distance':
      return sum(activities.map((a) => a.distanceM));
    case 'duration':
      return sum(activities.map((a) => a.movingSeconds));
    case 'activity_count':
      return activities.length;
    case 'elevation_gain':
      return sum(activities.map((a) => a.elevationGainM ?? 0));
    case 'training_load':
      return sum(
        activities.map(
          (a) => a.trainingLoad ?? trainingLoad(a, heartRateProfile({})),
        ),
      );
  }
};

export const computeGoalProgress = (
  goal: Goal,
  activities: readonly Activity[],
  now: Date = new Date(),
): GoalProgress => {
  const start = new Date(`${goal.startsOn}T00:00:00`);
  const end = new Date(`${goal.endsOn}T00:00:00`);
  const endExclusive = new Date(end.getTime() + DAY_MS);

  const inPeriod = activities.filter((a) => {
    const t = new Date(a.startedAt).getTime();
    if (t < start.getTime() || t >= endExclusive.getTime()) return false;
    if (goal.sport) return a.sport === goal.sport;
    return isRunning(a.sport);
  });

  const currentValue = goalMetricValue(inPeriod, goal.metric);
  const ratio = goal.targetValue > 0 ? currentValue / goal.targetValue : 0;
  const remaining = Math.max(0, goal.targetValue - currentValue);

  const totalDays = Math.max(1, daysBetween(start, end) + 1);
  const elapsedDays = clamp(daysBetween(start, startOfDay(now)) + 1, 0, totalDays);
  const daysRemaining = Math.max(0, totalDays - elapsedDays);

  const dailyRate = elapsedDays > 0 ? currentValue / elapsedDays : 0;
  const projectedValue = dailyRate * totalDays;
  const requiredDailyRate = daysRemaining > 0 ? remaining / daysRemaining : remaining;

  return {
    goal,
    currentValue,
    targetValue: goal.targetValue,
    ratio,
    percentComplete: clamp(ratio * 100, 0, 999),
    remaining,
    isComplete: currentValue >= goal.targetValue,
    daysRemaining,
    requiredDailyRate,
    // "On track" compares the projection to the target rather than comparing
    // today's total to today's share, so a rest day doesn't read as failure.
    projectedValue,
    onTrack: currentValue >= goal.targetValue || projectedValue >= goal.targetValue * 0.98,
  };
};
