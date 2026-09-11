import type { Activity, ActivityContext, PlannedWorkout } from '../domain/types';
import { isRunning, prDistanceLabel, WORKOUT_LABELS } from '../domain/types';
import { bestEffortForDistance, detectPersonalRecords } from './bestEfforts';
import { heartRateDecoupling, isHardSession } from './efficiency';
import { DAY_MS, daysBetween, startOfDay, startOfWeek, toISODate } from './time';

const SEASON_DISTANCES = [5000, 10000] as const;

/**
 * Explains why each activity was notable within an athlete's own history.
 *
 * This is the Community differentiator in data form: a feed should say why an
 * eight-mile run mattered — first run back, fastest this year, a negative split
 * — not merely that it happened. Every label is comparative; nothing is
 * reported unless it beats, or breaks from, what that athlete normally does.
 *
 * Built as a resolver because the expensive parts — replaying the record
 * timeline, extracting best efforts from every stream — are per-athlete, not
 * per-activity. Deriving one activity at a time would redo that work for every
 * card in the feed.
 */
export const buildActivityContextResolver = (
  athleteActivities: readonly Activity[],
  plan: readonly PlannedWorkout[] = [],
) => {
  const runs = athleteActivities
    .filter((a) => isRunning(a.sport))
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  // One replay of the record timeline for the whole history.
  const recordsByActivity = new Map<string, { distanceM: number; gainSeconds: number }[]>();
  for (const record of detectPersonalRecords(runs)) {
    if (record.previousElapsedSeconds == null) continue;
    const list = recordsByActivity.get(record.activityId) ?? [];
    list.push({
      distanceM: record.distanceM,
      gainSeconds: Math.round(record.previousElapsedSeconds - record.elapsedSeconds),
    });
    recordsByActivity.set(record.activityId, list);
  }

  // One best-effort extraction per activity per standard distance.
  const effortsByActivity = new Map<string, Map<number, number>>();
  for (const activity of runs) {
    if (!activity.stream) continue;
    const efforts = new Map<number, number>();
    for (const distance of SEASON_DISTANCES) {
      if (activity.distanceM < distance) continue;
      const effort = bestEffortForDistance(activity.stream, distance);
      if (effort) efforts.set(distance, effort.elapsedSeconds);
    }
    effortsByActivity.set(activity.id, efforts);
  }

  const indexById = new Map(runs.map((a, i) => [a.id, i]));

  // Weekly totals, accumulated in order, so "biggest week" can be answered at
  // the moment the activity that caused it was logged rather than in hindsight.
  const weekKeyOf = (a: Activity) => startOfWeek(new Date(a.startedAt)).getTime();
  const weekTotals = new Map<number, number>();
  const weekTotalAfter: number[] = [];
  for (const activity of runs) {
    const key = weekKeyOf(activity);
    const total = (weekTotals.get(key) ?? 0) + activity.distanceM;
    weekTotals.set(key, total);
    weekTotalAfter.push(total);
  }
  const planByActivity = new Map(
    plan.filter((p) => p.completedActivityId).map((p) => [p.completedActivityId as string, p]),
  );

  // Running maximum distance before each position, so "longest yet" is O(1).
  const longestBefore: number[] = [];
  let runningMax = 0;
  for (const activity of runs) {
    longestBefore.push(runningMax);
    runningMax = Math.max(runningMax, activity.distanceM);
  }

  return (activity: Activity): ActivityContext[] => {
    const index = indexById.get(activity.id);
    if (index == null) return [];

    const out: ActivityContext[] = [];
    const at = new Date(activity.startedAt).getTime();
    const prior = runs.slice(0, index);

    // --- Records ----------------------------------------------------------
    for (const record of recordsByActivity.get(activity.id) ?? []) {
      out.push({
        kind: 'personal_record',
        label: `${prDistanceLabel(record.distanceM)} PR · ${record.gainSeconds}s faster`,
        weight: 100,
      });
    }

    // --- Time away --------------------------------------------------------
    const previous = prior[prior.length - 1];
    if (previous) {
      const gapDays = daysBetween(new Date(previous.startedAt), new Date(activity.startedAt));
      if (gapDays >= 5) {
        out.push({ kind: 'comeback', label: `First run back after ${gapDays} days`, weight: 90 });
      }
    } else if (runs.length > 1) {
      out.push({ kind: 'comeback', label: 'First recorded run', weight: 85 });
    }

    // --- Longest ----------------------------------------------------------
    const priorLongest = longestBefore[index] ?? 0;
    if (index >= 3 && activity.distanceM > priorLongest) {
      out.push({ kind: 'longest', label: 'Longest run yet', weight: 95 });
    } else if (index >= 6) {
      const window = prior.filter((a) => at - new Date(a.startedAt).getTime() <= 84 * DAY_MS);
      const longest12 = Math.max(0, ...window.map((a) => a.distanceM));
      if (window.length >= 6 && activity.distanceM > longest12) {
        out.push({ kind: 'longest', label: 'Longest run in 12 weeks', weight: 70 });
      }
    }

    // --- Season best ------------------------------------------------------
    // Only where the distance has been covered before this year, so a
    // first-ever effort is not dressed up as a result.
    if (!out.some((c) => c.kind === 'personal_record')) {
      const yearStart = new Date(new Date(activity.startedAt).getFullYear(), 0, 1).getTime();
      const mine = effortsByActivity.get(activity.id);

      for (const distance of SEASON_DISTANCES) {
        const seconds = mine?.get(distance);
        if (seconds == null) continue;

        const priorSeason = prior
          .filter((a) => new Date(a.startedAt).getTime() >= yearStart)
          .map((a) => effortsByActivity.get(a.id)?.get(distance))
          .filter((s): s is number => s != null);

        if (priorSeason.length >= 3 && seconds < Math.min(...priorSeason)) {
          out.push({
            kind: 'season_best',
            label: `Fastest ${prDistanceLabel(distance)} this year`,
            weight: 80,
          });
          break;
        }
      }
    }

    // --- Execution --------------------------------------------------------
    if (activity.stream && activity.distanceM >= 6000) {
      const decoupling = heartRateDecoupling(activity.stream);
      if (decoupling && decoupling.driftPercent > 2.5) {
        out.push({ kind: 'negative_split', label: 'Negative split', weight: 60 });
      }
    }

    // --- Terrain ----------------------------------------------------------
    const climb = activity.elevationGainM ?? 0;
    if (climb > 200) {
      const recentClimbs = prior
        .filter((a) => at - new Date(a.startedAt).getTime() <= 30 * DAY_MS)
        .map((a) => a.elevationGainM ?? 0);
      if (recentClimbs.length >= 4 && climb > Math.max(...recentClimbs)) {
        out.push({
          kind: 'biggest_climb',
          label: 'Biggest climb this month',
          weight: 55,
        });
      }
    }

    // --- Volume milestone ---------------------------------------------------
    // Compared against completed weeks only, so a partial week cannot "win".
    const weekKey = weekKeyOf(activity);
    const priorWeekTotals = [...weekTotals.entries()]
      .filter(([key]) => key < weekKey && weekKey - key <= 8 * 7 * DAY_MS)
      .map(([, total]) => total);
    if (priorWeekTotals.length >= 4) {
      const best = Math.max(...priorWeekTotals);
      const totalNow = weekTotalAfter[index] ?? 0;
      const totalBefore = totalNow - activity.distanceM;
      // Only the run that actually crossed the threshold gets the label.
      if (totalNow > best && totalBefore <= best) {
        out.push({ kind: 'volume_milestone', label: 'Biggest week in two months', weight: 65 });
      }
    }

    // --- Role in the week ---------------------------------------------------
    // Training context rather than a result: what this session was *for*.
    const hard = isHardSession(activity);
    const sameWeekBefore = prior.filter((a) => weekKeyOf(a) === weekKey);
    const lastRun = prior[prior.length - 1];

    if (hard && sameWeekBefore.some(isHardSession)) {
      out.push({ kind: 'session_role', label: 'Second quality session this week', weight: 45 });
    } else if (
      !hard &&
      lastRun &&
      isHardSession(lastRun) &&
      at - new Date(lastRun.startedAt).getTime() <= 2 * DAY_MS
    ) {
      out.push({ kind: 'session_role', label: 'Recovery day after a hard session', weight: 42 });
    } else if (
      lastRun &&
      daysBetween(new Date(lastRun.startedAt), new Date(activity.startedAt)) === 1 &&
      activity.distanceM >= 10000
    ) {
      out.push({ kind: 'session_role', label: 'Back-to-back training days', weight: 38 });
    }

    // --- Where it sat in the plan -----------------------------------------
    const planned = planByActivity.get(activity.id);
    if (planned && planned.type !== 'easy' && planned.type !== 'rest') {
      out.push({
        kind: 'plan_session',
        label: `${WORKOUT_LABELS[planned.type]} from the plan`,
        weight: 50,
      });
    }

    return out.sort((a, b) => b.weight - a.weight);
  };
};

/**
 * Composes the feed's "MOOV Insight" line from an activity's context.
 *
 * A feed that only reports numbers makes every activity look the same. Saying
 * *why* a run mattered is the difference, and it has to read as a sentence
 * someone would say rather than a list of badges.
 *
 * Written without pronouns: the athlete's pronouns are not something the app
 * knows, and guessing them from a name would be wrong for real users.
 */
export const contextSentence = (
  contexts: readonly ActivityContext[],
  displayName: string,
): string | null => {
  if (contexts.length === 0) return null;

  const firstName = displayName.split(' ')[0] ?? displayName;
  const possessive = firstName.endsWith('s') ? `${firstName}'` : `${firstName}'s`;

  const lead = contexts[0] as ActivityContext;
  const support = contexts[1];

  const leadClause = (() => {
    switch (lead.kind) {
      case 'personal_record':
        return `A new ${lead.label.replace(' PR · ', ' personal record, ')}`;
      case 'season_best':
        return `${possessive} ${lead.label.replace('Fastest', 'fastest')}`;
      case 'longest':
        return lead.label === 'Longest run yet'
          ? `${possessive} longest run to date`
          : `${possessive} ${lead.label.toLowerCase()}`;
      case 'comeback':
        return lead.label;
      case 'volume_milestone':
        return `This run took ${firstName} past ${lead.label.toLowerCase()}`;
      case 'biggest_climb':
        return `${possessive} ${lead.label.toLowerCase()}`;
      case 'negative_split':
        return `${firstName} ran the second half more efficiently than the first`;
      case 'session_role':
      case 'plan_session':
        return lead.label;
      default:
        return lead.label;
    }
  })();

  const supportClause = (() => {
    if (!support) return null;
    switch (support.kind) {
      case 'negative_split':
        return 'the second half was stronger than the first';
      case 'session_role':
        return support.label.toLowerCase();
      case 'volume_milestone':
        return 'it also made this the biggest week in two months';
      case 'biggest_climb':
        return support.label.toLowerCase();
      case 'longest':
        return support.label.toLowerCase();
      case 'season_best':
        return support.label.toLowerCase();
      default:
        return null;
    }
  })();

  return supportClause ? `${leadClause} — ${supportClause}.` : `${leadClause}.`;
};

export interface PlanAdherence {
  weekStart: string;
  planned: number;
  completed: number;
  skipped: number;
  /** 0..1 of planned sessions actually done. */
  ratio: number;
}

export const planAdherence = (plan: readonly PlannedWorkout[], weekStart: Date): PlanAdherence => {
  const start = startOfDay(weekStart).getTime();
  const end = start + 7 * DAY_MS;
  const week = plan.filter((p) => {
    const t = new Date(`${p.date}T00:00:00`).getTime();
    return t >= start && t < end && p.type !== 'rest';
  });

  const completed = week.filter((p) => p.completedActivityId).length;

  return {
    weekStart: toISODate(new Date(start)),
    planned: week.length,
    completed,
    skipped: week.filter((p) => p.skipped).length,
    ratio: week.length > 0 ? completed / week.length : 0,
  };
};

/** The next session still to do, from today forward. */
export const nextWorkout = (plan: readonly PlannedWorkout[], now: Date): PlannedWorkout | null =>
  [...plan]
    .filter((p) => p.type !== 'rest' && !p.completedActivityId && !p.skipped)
    .filter((p) => new Date(`${p.date}T00:00:00`).getTime() >= startOfDay(now).getTime())
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;

export const daysUntil = (isoDate: string, now: Date): number =>
  daysBetween(startOfDay(now), new Date(`${isoDate}T00:00:00`));

/** Planned sessions for one week, Monday first, with empty days as null. */
export const planWeekDays = (
  plan: readonly PlannedWorkout[],
  weekStart: Date,
): (PlannedWorkout | null)[] => {
  const days: (PlannedWorkout | null)[] = new Array(7).fill(null);
  const start = startOfDay(weekStart).getTime();
  for (const workout of plan) {
    const offset = Math.round((new Date(`${workout.date}T00:00:00`).getTime() - start) / DAY_MS);
    if (offset >= 0 && offset < 7) days[offset] = workout;
  }
  return days;
};
