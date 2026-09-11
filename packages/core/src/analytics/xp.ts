import type { Activity, PersonalRecord } from '../domain/types';
import { isRunning } from '../domain/types';
import { clamp, sum } from './stats';
import { isHardSession } from './efficiency';
import { DAY_MS, startOfDay } from './time';

export interface XpEvent {
  amount: number;
  reason: string;
  dedupKey: string;
  activityId?: string;
  occurredAt: string;
}

export const DAILY_ACTIVITY_XP_CAP = 220;

/**
 * XP from a single activity.
 *
 * Deliberately sub-linear in duration (square-root scaled): a three-hour run
 * earns more than a one-hour run, but nowhere near three times as much. Without
 * this, the optimal strategy is junk volume — long, slow, valueless mileage
 * accumulated purely to farm the progression system. Meaningful behaviour
 * (records, goals, streaks, challenges) is where the large awards live instead.
 */
export const activityXp = (activity: Activity): number => {
  if (!isRunning(activity.sport)) return 0;
  const minutes = activity.movingSeconds / 60;
  if (minutes < 5) return 0;

  const base = 14 * Math.sqrt(minutes);
  const qualityMultiplier = isHardSession(activity) ? 1.25 : 1;
  // Elevation is rewarded, but capped so hill repeats can't be farmed either.
  const climbBonus = Math.min(30, (activity.elevationGainM ?? 0) * 0.08);

  return Math.round(clamp(base * qualityMultiplier + climbBonus, 0, DAILY_ACTIVITY_XP_CAP));
};

export const XP_AWARDS = {
  personalRecord: 250,
  goalComplete: 200,
  challengeComplete: 350,
  streakWeek: 120,
  firstActivityOfWeek: 40,
} as const;

/**
 * Builds the full XP ledger. Every event carries a dedup key so replaying the
 * ledger — after a re-import or a backfill — cannot inflate a total.
 */
export const buildXpLedger = (
  activities: readonly Activity[],
  records: readonly PersonalRecord[],
  completedGoalIds: readonly string[] = [],
  completedChallengeIds: readonly string[] = [],
): XpEvent[] => {
  const events: XpEvent[] = [];

  const byDay = new Map<number, Activity[]>();
  for (const a of activities) {
    if (!isRunning(a.sport)) continue;
    const day = startOfDay(new Date(a.startedAt)).getTime();
    const list = byDay.get(day) ?? [];
    list.push(a);
    byDay.set(day, list);
  }

  // Apply the daily cap across all of a day's activities, so splitting one run
  // into five uploads is worth no more than logging it once.
  for (const dayActivities of byDay.values()) {
    let dayTotal = 0;
    for (const a of dayActivities) {
      const raw = activityXp(a);
      const allowed = Math.max(0, Math.min(raw, DAILY_ACTIVITY_XP_CAP - dayTotal));
      if (allowed <= 0) continue;
      dayTotal += allowed;
      events.push({
        amount: allowed,
        reason: 'activity',
        dedupKey: `activity:${a.id}`,
        activityId: a.id,
        occurredAt: a.startedAt,
      });
    }
  }

  for (const r of records) {
    if (r.previousElapsedSeconds == null) continue;
    events.push({
      amount: XP_AWARDS.personalRecord,
      reason: `personal_record:${r.distanceM}`,
      dedupKey: `pr:${r.id}`,
      activityId: r.activityId,
      occurredAt: r.achievedAt,
    });
  }

  for (const id of completedGoalIds) {
    events.push({
      amount: XP_AWARDS.goalComplete,
      reason: 'goal_complete',
      dedupKey: `goal:${id}`,
      occurredAt: new Date().toISOString(),
    });
  }

  for (const id of completedChallengeIds) {
    events.push({
      amount: XP_AWARDS.challengeComplete,
      reason: 'challenge_complete',
      dedupKey: `challenge:${id}`,
      occurredAt: new Date().toISOString(),
    });
  }

  // Deduplicate defensively — the ledger is the single source of truth for XP.
  const seen = new Set<string>();
  return events.filter((e) => {
    if (seen.has(e.dedupKey)) return false;
    seen.add(e.dedupKey);
    return true;
  });
};

export const totalXp = (events: readonly XpEvent[]): number => sum(events.map((e) => e.amount));

export interface LevelInfo {
  level: number;
  currentXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number;
  title: string;
}

/**
 * Level thresholds grow quadratically, so early levels arrive quickly and later
 * ones represent real accumulated training rather than a week of enthusiasm.
 */
export const xpForLevel = (level: number): number =>
  level <= 1 ? 0 : Math.round(400 * (level - 1) ** 1.55);

export const LEVEL_TITLES: readonly (readonly [number, string])[] = [
  [1, 'Newcomer'],
  [3, 'Runner'],
  [6, 'Committed'],
  [10, 'Consistent'],
  [15, 'Seasoned'],
  [21, 'Endurance'],
  [28, 'Formidable'],
  [36, 'Relentless'],
  [45, 'Elite'],
];

export const titleForLevel = (level: number): string => {
  let title = 'Newcomer';
  for (const [threshold, name] of LEVEL_TITLES) {
    if (level >= threshold) title = name;
  }
  return title;
};

export const levelForXp = (xp: number): LevelInfo => {
  let level = 1;
  while (level < 99 && xp >= xpForLevel(level + 1)) level++;
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const span = Math.max(1, ceiling - floor);
  return {
    level,
    currentXp: xp,
    xpIntoLevel: xp - floor,
    xpForNextLevel: ceiling - floor,
    progress: clamp((xp - floor) / span, 0, 1),
    title: titleForLevel(level),
  };
};

/** Consecutive weeks containing at least one run, counting back from `now`. */
export const currentStreakWeeks = (activities: readonly Activity[], now: Date): number => {
  const weeks = new Set<number>();
  for (const a of activities) {
    if (!isRunning(a.sport)) continue;
    const d = startOfDay(new Date(a.startedAt));
    const monday = new Date(d);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    weeks.add(monday.getTime());
  }

  const thisMonday = new Date(startOfDay(now));
  thisMonday.setDate(thisMonday.getDate() - ((thisMonday.getDay() + 6) % 7));

  let streak = 0;
  let cursor = thisMonday.getTime();
  // An empty current week doesn't break the streak until the week is over.
  if (!weeks.has(cursor)) cursor -= 7 * DAY_MS;
  while (weeks.has(cursor)) {
    streak++;
    cursor -= 7 * DAY_MS;
  }
  return streak;
};

/** Consecutive days containing at least one run. */
export const currentStreakDays = (activities: readonly Activity[], now: Date): number => {
  const days = new Set(
    activities
      .filter((a) => isRunning(a.sport))
      .map((a) => startOfDay(new Date(a.startedAt)).getTime()),
  );
  let streak = 0;
  let cursor = startOfDay(now).getTime();
  if (!days.has(cursor)) cursor -= DAY_MS;
  while (days.has(cursor)) {
    streak++;
    cursor -= DAY_MS;
  }
  return streak;
};
