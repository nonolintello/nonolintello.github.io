import type {
  Activity,
  AppNotification,
  Athlete,
  AthleteGoal,
  Challenge,
  ChallengeParticipation,
  Comment,
  Goal,
  PlannedWorkout,
  Club,
  ContentItem,
  LeaderboardEntry,
  Race,
  RouteSuggestion,
  SportEvent,
  TrainingBlock,
  WellnessDay,
  WorkoutType,
} from '../domain/types';
import { prDistanceLabel, WORKOUT_LABELS } from '../domain/types';
import { addDays, daysBetween, startOfDay, startOfWeek, toISODate } from '../analytics/time';
import { currentRecords } from '../analytics/bestEfforts';
import { distanceIn, distanceLabel, formatDuration } from '../domain/units';
import { clamp } from '../analytics/stats';
import { chance, gaussian, intRange, mulberry32, phasesFor, pick, range, smoothNoise, type Rng } from './random';
import { CLUBS, CONTENT, events, notifications, routes, type NotificationFacts } from './world';
import { simulateRun, type SessionType } from './runSimulator';

export interface DemoDataset {
  me: Athlete;
  athletes: Athlete[];
  activities: Activity[];
  goal: Goal;
  challenges: Challenge[];
  participations: ChallengeParticipation[];
  comments: Comment[];
  plan: PlannedWorkout[];
  races: Race[];
  block: TrainingBlock;
  wellness: WellnessDay[];
  objectives: AthleteGoal[];
  notifications: AppNotification[];
  content: ContentItem[];
  clubs: Club[];
  events: SportEvent[];
  routes: RouteSuggestion[];
  leaderboards: Record<string, LeaderboardEntry[]>;
}

/**
 * Recovers the session type from a generated title.
 *
 * The simulator knows the type when it builds each run but the Activity model
 * deliberately does not store it — a real import from a watch would not carry
 * one either. Inferring it here keeps the demo honest about what the plan can
 * actually match against.
 */
const inferWorkoutType = (title: string): WorkoutType => {
  const t = title.toLowerCase();
  if (/interval|repeats/.test(t)) return 'intervals';
  if (/tempo|threshold/.test(t)) return 'tempo';
  if (/race|parkrun|time trial/.test(t)) return 'race';
  if (/long/.test(t)) return 'long';
  if (/recovery|shakeout|easy legs/.test(t)) return 'recovery';
  if (/steady|progression|moderate/.test(t)) return 'steady';
  return 'easy';
};

const PRESCRIPTIONS: Partial<Record<WorkoutType, string[]>> = {
  intervals: [
    '6 × 800 m at 5K effort, 2 min jog recovery',
    '5 × 1 km at threshold, 90 s float',
    '12 × 400 m at mile effort, 60 s recovery',
  ],
  tempo: [
    '20 min continuous at threshold, 10 min either side easy',
    '4 × 8 min at threshold, 2 min float',
    '2 × 15 min at half-marathon effort, 3 min jog',
  ],
  long: [
    'Conversational throughout — finish feeling you could carry on',
    'Last 20 minutes lifted to steady',
    'Rolling terrain, effort even rather than pace even',
  ],
  steady: ['Progressive — start easy, finish at steady', 'Even effort, controlled breathing'],
  easy: ['Fully aerobic. If in doubt, slower'],
  recovery: ['Short and genuinely easy. Cadence light'],
};

/**
 * Builds the training plan around the generated history.
 *
 * Past sessions are reconstructed from what was actually run and matched to
 * their activity, so adherence is real rather than asserted; a couple are left
 * unmatched because the athlete missed them. Future weeks follow the same
 * weekly shape the block has been using.
 */
const generatePlan = (
  rng: Rng,
  now: Date,
  myActivities: readonly Activity[],
  athleteId: string,
): PlannedWorkout[] => {
  const plan: PlannedWorkout[] = [];
  const weekStart = startOfWeek(now);
  const historyStart = addDays(weekStart, -28).getTime();
  let index = 0;

  // Past four weeks: one planned session per activity actually completed.
  for (const activity of myActivities) {
    const at = new Date(activity.startedAt).getTime();
    if (at < historyStart) continue;
    const type = inferWorkoutType(activity.title);
    const options = PRESCRIPTIONS[type];
    plan.push({
      id: `plan-${index++}`,
      athleteId,
      date: toISODate(new Date(activity.startedAt)),
      type,
      title: WORKOUT_LABELS[type],
      prescription: options ? pick(rng, options) : undefined,
      targetDistanceM: Math.round(activity.distanceM / 500) * 500,
      completedActivityId: activity.id,
    });
  }

  // A couple of sessions that were planned and missed — adherence below 100%
  // is what makes the number worth showing at all.
  for (const offset of [-9, -18]) {
    const date = addDays(weekStart, offset);
    if (date.getTime() >= now.getTime()) continue;
    plan.push({
      id: `plan-${index++}`,
      athleteId,
      date: toISODate(date),
      type: 'easy',
      title: WORKOUT_LABELS.easy,
      prescription: PRESCRIPTIONS.easy?.[0],
      targetDistanceM: 8000,
      skipped: true,
    });
  }

  // Rest of this week plus the next two, following the block's weekly shape.
  const template: { dayOffset: number; type: WorkoutType; distanceM: number }[] = [
    { dayOffset: 1, type: 'intervals', distanceM: 11000 },
    { dayOffset: 2, type: 'easy', distanceM: 9000 },
    { dayOffset: 3, type: 'steady', distanceM: 10000 },
    { dayOffset: 4, type: 'rest', distanceM: 0 },
    { dayOffset: 5, type: 'easy', distanceM: 8000 },
    { dayOffset: 6, type: 'long', distanceM: 21000 },
  ];

  for (let week = 0; week < 3; week++) {
    const start = addDays(weekStart, week * 7);
    for (const slot of template) {
      const date = addDays(start, slot.dayOffset);
      // Never plan into the past, and never double-book a completed day.
      if (date.getTime() < startOfDay(now).getTime()) continue;
      const iso = toISODate(date);
      if (plan.some((p) => p.date === iso)) continue;

      // Alternate the midweek quality session week to week.
      const type: WorkoutType =
        slot.type === 'intervals' && week % 2 === 1 ? 'tempo' : slot.type;
      const options = PRESCRIPTIONS[type];

      plan.push({
        id: `plan-${index++}`,
        athleteId,
        date: iso,
        type,
        title: WORKOUT_LABELS[type],
        prescription: options ? pick(rng, options) : undefined,
        targetDistanceM: slot.distanceM || undefined,
        // Volume creeps up gently across the block.
        targetDurationS: slot.distanceM ? Math.round((slot.distanceM / 1000) * 340) : undefined,
      });
    }
  }

  return plan.sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Ninety days of wellness data that responds to training.
 *
 * HRV falls and resting heart rate rises in the days after hard or long
 * sessions, then recover. Without that coupling the recovery metrics would be
 * decorative noise, and every insight drawn from them would be false.
 */
const generateWellness = (
  rng: Rng,
  now: Date,
  activities: readonly Activity[],
  athlete: Athlete,
): WellnessDay[] => {
  const days = 90;
  const baseHrv = 68;
  const baseRhr = athlete.restingHr ?? 46;
  const sleepPhases = phasesFor(rng, 3);

  // Training stress per day, so wellness can lag it.
  const loadByDay = new Map<string, number>();
  for (const activity of activities) {
    const key = toISODate(new Date(activity.startedAt));
    const stress =
      (activity.movingSeconds / 60) * (activity.perceivedExertion ?? 4) * 0.12;
    loadByDay.set(key, (loadByDay.get(key) ?? 0) + stress);
  }

  const out: WellnessDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(startOfDay(now), -i);
    const iso = toISODate(date);

    // Residual stress: yesterday counts most, with two days of carry-over.
    const stressToday = loadByDay.get(iso) ?? 0;
    const stressYesterday = loadByDay.get(toISODate(addDays(date, -1))) ?? 0;
    const stressTwoDays = loadByDay.get(toISODate(addDays(date, -2))) ?? 0;
    const residual = stressYesterday * 0.6 + stressTwoDays * 0.25 + stressToday * 0.15;

    const t = (days - i) / days;

    // The last four days close on a deliberate downturn: short sleep and
    // suppressed HRV after the block's biggest week. Without a real dip
    // somewhere in the history, the recovery model and the adaptive training
    // recommendation have nothing to detect and neither can be demonstrated.
    const dipDays = 4;
    const dipDepth = i < dipDays ? (dipDays - i) / dipDays : 0;

    const sleepMinutes = clamp(
      430 +
        smoothNoise(sleepPhases, t * 9) * 55 +
        gaussian(rng, 0, 22) -
        residual * 0.25 -
        dipDepth * 62,
      300,
      560,
    );

    const hrvMs = clamp(
      baseHrv -
        residual * 0.42 +
        gaussian(rng, 0, 3.4) +
        (sleepMinutes - 430) * 0.022 -
        dipDepth * 11,
      32,
      110,
    );

    const restingHr = clamp(
      baseRhr + residual * 0.085 + gaussian(rng, 0, 1.1) - (sleepMinutes - 430) * 0.006,
      38,
      70,
    );

    out.push({
      date: iso,
      sleepMinutes: Math.round(sleepMinutes),
      sleepQuality: clamp(0.42 + (sleepMinutes - 430) / 900 + gaussian(rng, 0, 0.05), 0.2, 0.85),
      hrvMs: Math.round(hrvMs),
      restingHr: Math.round(restingHr),
      soreness: Math.round(clamp(1.6 + residual * 0.02 + gaussian(rng, 0, 0.4), 1, 5)),
      mood: Math.round(clamp(3.8 - residual * 0.01 + gaussian(rng, 0, 0.4), 1, 5)),
    });
  }

  return out;
};

const generateObjectives = (now: Date, athleteId: string): AthleteGoal[] => [
  {
    id: 'goal-marathon-sub3',
    athleteId,
    kind: 'race_time',
    title: 'Sub-3 marathon',
    targetSeconds: 3 * 3600 - 1,
    targetDistanceM: 42195,
    raceId: 'race-philly-marathon',
    targetDate: toISODate(addDays(now, 73)),
    createdAt: addDays(now, -150).toISOString(),
  },
  {
    id: 'goal-annual-mileage',
    athleteId,
    kind: 'distance_volume',
    title: '1,500 miles this year',
    targetDistanceM: 1500 * 1609.344,
    targetDate: `${now.getFullYear()}-12-31`,
    createdAt: `${now.getFullYear()}-01-01T08:00:00.000Z`,
  },
  {
    id: 'goal-consistency',
    athleteId,
    kind: 'consistency',
    title: 'Run 5 times a week',
    targetCount: 5,
    createdAt: addDays(now, -90).toISOString(),
  },
];

const generateRaces = (now: Date, athleteId: string): Race[] => [
  {
    id: 'race-rothman-8k',
    athleteId,
    name: 'Rothman 8K',
    date: toISODate(addDays(now, 19)),
    distanceM: 8000,
    location: 'Philadelphia, PA',
    goalSeconds: 32 * 60 + 30,
  },
  {
    id: 'race-tuneup-half',
    athleteId,
    name: 'Philadelphia Half Marathon',
    date: toISODate(addDays(now, 45)),
    distanceM: 21097,
    location: 'Philadelphia, PA',
    goalSeconds: 85 * 60,
  },
  {
    id: 'race-philly-marathon',
    athleteId,
    name: 'Philadelphia Marathon',
    date: toISODate(addDays(now, 73)),
    distanceM: 42195,
    location: 'Philadelphia, PA',
    goalSeconds: 3 * 3600 - 1,
    isGoalRace: true,
  },
];

const HOME = { lat: 39.9526, lon: -75.1652 }; // Philadelphia — river flats plus Fairmount hills.

const TRAINING_WEEKS = 26;

/** Week index within the block → race distance. */
const RACE_WEEKS: Record<number, number> = { 11: 5000, 17: 10000, 23: 5000 };

interface PlannedSession {
  dayOffset: number;
  type: SessionType;
  share: number;
}

/**
 * A week of training. Quality on Tuesday, long run Sunday, easy days between —
 * the standard amateur structure, which is what makes the generated history
 * read as a real training block rather than noise.
 */
const planWeek = (
  rng: Rng,
  runsThisWeek: number,
  weekIndex: number,
  raceDistanceM: number | null,
): PlannedSession[] => {
  const qualityType: SessionType = weekIndex % 2 === 0 ? 'intervals' : 'tempo';
  const sessions: PlannedSession[] = [
    { dayOffset: 2, type: 'easy', share: 0.16 },
    { dayOffset: 6, type: 'long', share: 0.32 },
  ];

  // Race weeks drop the midweek quality session — nobody does intervals on
  // Tuesday and races on Saturday.
  if (raceDistanceM != null) {
    sessions.push({ dayOffset: 5, type: 'race', share: 0.14 });
  } else {
    sessions.push({ dayOffset: 1, type: qualityType, share: 0.2 });
  }

  if (runsThisWeek >= 4) {
    sessions.push({ dayOffset: 3, type: chance(rng, 0.3) ? 'steady' : 'easy', share: 0.17 });
  }
  if (runsThisWeek >= 5) {
    sessions.push({ dayOffset: 5, type: 'easy', share: 0.15 });
  }
  if (runsThisWeek >= 6) {
    sessions.push({ dayOffset: 4, type: 'recovery', share: 0.1 });
  }

  return sessions;
};

/**
 * Six months of training for the demo athlete.
 *
 * Deliberately imperfect: a four-week cycle with a down week, an illness gap, a
 * plateau, and two races that produce genuine records. A linear ramp would make
 * every trend the analytics engine reports look trivially correct.
 */
export const generateDemoDataset = (now: Date = new Date(), seed = 20260910): DemoDataset => {
  const rng = mulberry32(seed);

  const me: Athlete = {
    id: 'athlete-me',
    handle: 'davidhart',
    displayName: 'David Hart',
    bio: 'Chasing sub-3 in Philadelphia. Kelly Drive most mornings.',
    location: 'Philadelphia, PA',
    birthDate: '1992-03-18',
    restingHr: 46,
    maxHr: 189,
    weightKg: 71,
    primarySport: 'running',
    unitPreference: 'imperial',
    profileVisibility: 'public',
    defaultActivityVisibility: 'followers',
    routePrivacyRadiusM: 250,
    createdAt: addDays(now, -TRAINING_WEEKS * 7 - 20).toISOString(),
  };

  const activities: Activity[] = [];
  const currentWeekStart = startOfWeek(now);
  let activityIndex = 0;

  for (let w = 0; w < TRAINING_WEEKS; w++) {
    const weeksAgo = TRAINING_WEEKS - 1 - w;
    const weekStart = addDays(currentWeekStart, -weeksAgo * 7);
    const progress = w / (TRAINING_WEEKS - 1);

    // 5K speed improves with a mid-block plateau, not on a straight line.
    const plateau = progress > 0.45 && progress < 0.62 ? -0.012 : 0;
    // Ends near a 19:40 5K, which projects to roughly a 3:08 marathon — a
    // believable distance from the sub-3 goal rather than already there.
    const fiveKSpeed =
      4.02 + 0.24 * Math.pow(progress, 0.75) + plateau + gaussian(rng, 0, 0.008);

    // Volume grows in four-week cycles: three building, one absorbing.
    const cyclePosition = w % 4;
    const cycleMultiplier = cyclePosition === 3 ? 0.72 : 1 + cyclePosition * 0.06;
    // ~35 to ~53 miles a week, the range a sub-3 build actually lives in.
    let weeklyKm = (56 + progress * 30) * cycleMultiplier * (1 + gaussian(rng, 0, 0.05));

    // Illness — two weeks of almost nothing, then a cautious return.
    const illnessWeek = 9;
    let runsThisWeek = intRange(rng, 4, 5);
    if (w === illnessWeek) {
      weeklyKm *= 0.18;
      runsThisWeek = 1;
    } else if (w === illnessWeek + 1) {
      weeklyKm *= 0.55;
      runsThisWeek = 3;
    }

    // Three races in the block: two 5Ks bracketing a 10K, so the record chain
    // shows a genuine breakthrough rather than a single isolated effort.
    const raceDistanceM = RACE_WEEKS[w] ?? null;

    const sessions = planWeek(rng, runsThisWeek, w, raceDistanceM);
    const totalShare = sessions.reduce((a, s) => a + s.share, 0);

    for (const session of sessions) {
      const day = addDays(weekStart, session.dayOffset);
      // Stop at "now" so the current week is genuinely partial.
      if (day.getTime() > now.getTime()) continue;
      const isRace = session.type === 'race';
      // The odd missed session, as happens. Races are never skipped.
      if (!isRace && chance(rng, 0.07)) continue;

      const type = session.type;
      const distanceM = isRace
        ? (raceDistanceM as number)
        : clamp(
            ((weeklyKm * 1000 * session.share) / totalShare) * (1 + gaussian(rng, 0, 0.06)),
            3000,
            34000,
          );

      const startHour = type === 'race' ? range(rng, 9, 10.5) : type === 'long' ? range(rng, 8, 10) : range(rng, 6.5, 19);
      const startedAt = new Date(day);
      startedAt.setHours(Math.floor(startHour), Math.floor((startHour % 1) * 60), 0, 0);
      if (startedAt.getTime() > now.getTime()) continue;

      const hillFactor = isRace
        ? range(rng, 0.02, 0.1) // Races are run on flat, fast courses.
        : type === 'long' && chance(rng, 0.35)
          ? range(rng, 0.55, 0.85)
          : range(rng, 0.05, 0.4);

      activities.push(
        simulateRun({
          id: `act-me-${activityIndex++}`,
          athleteId: me.id,
          startedAt,
          sessionType: type,
          distanceM,
          fiveKSpeedMps: fiveKSpeed,
          restingHr: me.restingHr as number,
          maxHr: me.maxHr as number,
          hillFactor,
          homeLat: HOME.lat,
          homeLon: HOME.lon,
          visibility: 'public',
          rng,
        }),
      );
    }
  }

  const { athletes: friends, activities: friendActivities } = generateFriends(rng, now);

  // Social signal on the athlete's own public runs and friends' runs alike.
  for (const a of [...activities, ...friendActivities]) {
    const ageDays = (now.getTime() - new Date(a.startedAt).getTime()) / 86_400_000;
    if (ageDays > 21) continue;
    a.likeCount = intRange(rng, 0, a.distanceM > 15000 ? 34 : 18);
    a.commentCount = chance(rng, 0.45) ? intRange(rng, 1, 5) : 0;
    a.likedByMe = a.athleteId !== me.id && chance(rng, 0.3);
  }

  const goal: Goal = {
    id: 'goal-current-week',
    athleteId: me.id,
    metric: 'distance',
    period: 'week',
    targetValue: 45000,
    startsOn: toISODate(currentWeekStart),
    endsOn: toISODate(addDays(currentWeekStart, 6)),
  };

  const { challenges, participations } = generateChallenges(rng, now, me.id, friends);
  const comments = generateComments(rng, [...activities, ...friendActivities], friends, now);
  const plan = generatePlan(rng, now, activities, me.id);
  const races = generateRaces(now, me.id);
  const wellness = generateWellness(rng, now, activities, me);
  const objectives = generateObjectives(now, me.id);
  const leaderboards = generateLeaderboards(rng, me, friends);

  const block: TrainingBlock = {
    id: 'block-marathon-build',
    athleteId: me.id,
    name: 'Marathon build',
    focus:
      'Threshold volume and a progressive long run, building toward the Philadelphia Marathon.',
    startsOn: toISODate(addDays(startOfWeek(now), -49)),
    endsOn: toISODate(addDays(startOfWeek(now), 63)),
    targetRaceId: 'race-philly-marathon',
  };

  return {
    me,
    athletes: [me, ...friends],
    activities: [...activities, ...friendActivities],
    goal,
    challenges,
    participations,
    comments,
    plan,
    races,
    block,
    wellness,
    objectives,
    notifications: notifications(
      now,
      friends,
      activities[activities.length - 1]?.id,
      notificationFacts(now, activities, wellness, races, me),
    ),
    content: CONTENT,
    clubs: CLUBS,
    events: events(now),
    routes: routes(rng),
    leaderboards,
  };
};

/** Facts the notification copy is written from, so nothing it claims is invented. */
const notificationFacts = (
  now: Date,
  activities: readonly Activity[],
  wellness: readonly WellnessDay[],
  races: readonly Race[],
  athlete: Athlete,
): NotificationFacts => {
  const unit = athlete.unitPreference;
  const hrvOf = (fromDaysAgo: number, toDaysAgo: number) => {
    const from = now.getTime() - fromDaysAgo * 86_400_000;
    const to = now.getTime() - toDaysAgo * 86_400_000;
    const values = wellness
      .filter((d) => {
        const t = new Date(`${d.date}T12:00:00`).getTime();
        return t >= from && t < to;
      })
      .map((d) => d.hrvMs)
      .filter((v): v is number => v != null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };

  const recentHrv = hrvOf(7, 0);
  const baseHrv = hrvOf(28, 7);
  const hrvChangePercent =
    recentHrv != null && baseHrv != null && baseHrv > 0
      ? ((recentHrv - baseHrv) / baseHrv) * 100
      : 0;

  // Best completed week in the current block.
  const weekTotals = new Map<number, number>();
  for (const activity of activities) {
    if (activity.athleteId !== athlete.id) continue;
    const key = startOfWeek(new Date(activity.startedAt)).getTime();
    weekTotals.set(key, (weekTotals.get(key) ?? 0) + activity.distanceM);
  }
  const thisWeek = startOfWeek(now).getTime();
  const bestWeek = Math.max(
    0,
    ...[...weekTotals.entries()].filter(([k]) => k < thisWeek).map(([, v]) => v),
  );

  const mine = activities
    .filter((a) => a.athleteId === athlete.id)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  const longRun = [...mine].sort((a, b) => b.distanceM - a.distanceM)[0];

  const records = currentRecords(mine, athlete.id);
  const beaten = records
    .filter((r) => r.previousElapsedSeconds != null)
    .sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())[0];

  const goalRace = races.find((r) => r.isGoalRace) ?? races[races.length - 1];

  return {
    hrvChangePercent,
    bestWeekLabel: `${distanceIn(bestWeek, unit).toFixed(1)} ${distanceLabel(unit)} — your highest of this block.`,
    recentPrLabel: beaten
      ? `${prDistanceLabel(beaten.distanceM)} in ${formatDuration(beaten.elapsedSeconds)} — ${Math.round((beaten.previousElapsedSeconds as number) - beaten.elapsedSeconds)} seconds faster than your previous best.`
      : null,
    longRunLabel: longRun
      ? `Long run — ${distanceIn(longRun.distanceM, unit).toFixed(1)} ${distanceLabel(unit)}`
      : 'Recent activity',
    raceName: goalRace?.name ?? 'Your goal race',
    raceWeeksAway: goalRace
      ? Math.max(1, Math.round(daysBetween(startOfDay(now), new Date(`${goalRace.date}T00:00:00`)) / 7))
      : 0,
  };
};

/** Weekly mileage leaderboards, with the demo athlete placed mid-pack. */
const generateLeaderboards = (
  rng: Rng,
  me: Athlete,
  friends: readonly Athlete[],
): Record<string, LeaderboardEntry[]> => {
  const build = (people: { id: string; name: string; base: number }[]): LeaderboardEntry[] =>
    people
      .map((p) => ({
        athleteId: p.id,
        displayName: p.name,
        value: p.base * 1000 * (1 + gaussian(rng, 0, 0.1)),
        rank: 0,
        isMe: p.id === me.id,
      }))
      .sort((a, b) => b.value - a.value)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));

  return {
    friends: build([
      { id: me.id, name: me.displayName, base: 50 },
      ...friends.map((f) => ({
        id: f.id,
        name: f.displayName,
        base: f.id === 'athlete-priya' ? 92 : f.id === 'athlete-mara' ? 74 : f.id === 'athlete-noe' ? 46 : f.id === 'athlete-ines' ? 58 : f.id === 'athlete-tomas' ? 51 : 22,
      })),
    ]),
    club: build([
      { id: me.id, name: me.displayName, base: 50 },
      { id: 'x1', name: 'Ray Okafor', base: 71 },
      { id: 'x2', name: 'Hannah Weiss', base: 64 },
      { id: 'x3', name: 'Diego Ramos', base: 58 },
      { id: 'x4', name: 'Casey Lin', base: 44 },
      { id: 'x5', name: 'Owen Bradley', base: 39 },
    ]),
  };
};

const FRIEND_SEEDS: readonly {
  id: string;
  handle: string;
  name: string;
  bio: string;
  location: string;
  speed: number;
  weeklyKm: number;
  hilly: number;
}[] = [
  {
    id: 'athlete-mara',
    handle: 'maralaurent',
    name: 'Mara Laurent',
    bio: 'Marathon build, block two. Coffee first.',
    location: 'Philadelphia, PA',
    speed: 4.1,
    weeklyKm: 78,
    hilly: 0.25,
  },
  {
    id: 'athlete-noe',
    handle: 'noe',
    name: 'Noé Sengel',
    bio: 'Kelly Drive regular. Chasing a sub-20 5K.',
    location: 'Philadelphia, PA',
    speed: 3.88,
    weeklyKm: 62,
    hilly: 0.2,
  },
  {
    id: 'athlete-tomas',
    handle: 'tomasrun',
    name: 'Tomás Ferreira',
    bio: 'Trail over tarmac, always.',
    location: 'Wissahickon, PA',
    speed: 3.62,
    weeklyKm: 54,
    hilly: 0.85,
  },
  {
    id: 'athlete-ines',
    handle: 'ines.k',
    name: 'Inès Kaddouri',
    bio: '5K specialist. Track Tuesdays.',
    location: 'Brooklyn, NY',
    speed: 4.42,
    weeklyKm: 64,
    hilly: 0.1,
  },
  {
    id: 'athlete-jonas',
    handle: 'jonasbeck',
    name: 'Jonas Beck',
    bio: 'Back after two years off. Slowly.',
    location: 'Philadelphia, PA',
    speed: 3.05,
    weeklyKm: 26,
    hilly: 0.2,
  },
  {
    id: 'athlete-priya',
    handle: 'priyaruns',
    name: 'Priya Raman',
    bio: 'Ultra runner. Coach. Occasionally sleeps.',
    location: 'Boulder, CO',
    speed: 3.48,
    weeklyKm: 98,
    hilly: 0.95,
  },
];

const generateFriends = (rng: Rng, now: Date) => {
  const athletes: Athlete[] = [];
  const activities: Activity[] = [];

  FRIEND_SEEDS.forEach((seed, seedIndex) => {
    athletes.push({
      id: seed.id,
      handle: seed.handle,
      displayName: seed.name,
      bio: seed.bio,
      location: seed.location,
      restingHr: intRange(rng, 42, 58),
      maxHr: intRange(rng, 180, 196),
      primarySport: seed.hilly > 0.6 ? 'trail_running' : 'running',
      unitPreference: 'metric',
      profileVisibility: 'public',
      defaultActivityVisibility: 'public',
      routePrivacyRadiusM: 200,
      createdAt: addDays(now, -400).toISOString(),
    });

    // Eight weeks of structured training, not a scatter of recent runs.
    //
    // Context labels are comparative — records, longest runs, biggest weeks all
    // need a past to be measured against. With only a handful of activities the
    // feed can say nothing interesting about anyone but the demo athlete.
    const FRIEND_WEEKS = 8;
    const weekTemplate: { dayOffset: number; type: SessionType; share: number }[] = [
      { dayOffset: 1, type: 'intervals', share: 0.2 },
      { dayOffset: 2, type: 'easy', share: 0.17 },
      { dayOffset: 4, type: 'tempo', share: 0.19 },
      { dayOffset: 6, type: 'long', share: 0.32 },
    ];

    let counter = 0;
    for (let w = 0; w < FRIEND_WEEKS; w++) {
      const weeksAgo = FRIEND_WEEKS - 1 - w;
      const weekStart = addDays(startOfWeek(now), -weeksAgo * 7);
      // Gentle build so longest runs and biggest weeks actually progress.
      const weekKm = seed.weeklyKm * (0.82 + (w / (FRIEND_WEEKS - 1)) * 0.28) * (1 + gaussian(rng, 0, 0.07));

      for (const slot of weekTemplate) {
        if (chance(rng, 0.12)) continue;
        const day = addDays(weekStart, slot.dayOffset);
        const hour = range(rng, 6.5, 19);
        const startedAt = new Date(day);
        startedAt.setHours(Math.floor(hour), Math.floor((hour % 1) * 60), 0, 0);
        if (startedAt.getTime() > now.getTime()) continue;

        const distanceM = clamp(
          weekKm * 1000 * slot.share * (1 + gaussian(rng, 0, 0.08)),
          3500,
          42000,
        );

        activities.push(
          simulateRun({
            id: `act-${seedIndex}-${counter++}`,
            athleteId: seed.id,
            startedAt,
            sessionType: slot.type,
            distanceM,
            fiveKSpeedMps: seed.speed * (0.97 + (w / (FRIEND_WEEKS - 1)) * 0.04),
            restingHr: 50,
            maxHr: 190,
            hillFactor: seed.hilly,
            homeLat: HOME.lat + gaussian(rng, 0, 0.05),
            homeLon: HOME.lon + gaussian(rng, 0, 0.05),
            visibility: 'public',
            rng,
          }),
        );
      }
    }
  });

  return { athletes, activities };
};

const generateChallenges = (rng: Rng, now: Date, myId: string, friends: readonly Athlete[]) => {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const weekStart = startOfWeek(now);

  const challenges: Challenge[] = [
    {
      id: 'ch-monthly-distance',
      slug: 'october-200',
      name: '200 km in a month',
      description: 'Cover 200 kilometres before the month is out. Any pace, any terrain.',
      sport: 'running',
      kind: 'distance',
      targetValue: 200000,
      startsAt: monthStart.toISOString(),
      endsAt: monthEnd.toISOString(),
      isOfficial: true,
      xpReward: 350,
      participantCount: 12483,
      accentColor: '#FF5A36',
    },
    {
      id: 'ch-consistency',
      slug: 'five-in-seven',
      name: 'Five in seven',
      description: 'Run five times in the next seven days. Frequency over distance.',
      sport: 'running',
      kind: 'activity_count',
      targetValue: 5,
      startsAt: weekStart.toISOString(),
      endsAt: addDays(weekStart, 7).toISOString(),
      isOfficial: true,
      xpReward: 200,
      participantCount: 3921,
      accentColor: '#38BDF8',
    },
    {
      id: 'ch-elevation',
      slug: 'vertical-3000',
      name: '3,000 m vertical',
      description: 'Climb the height of a serious alpine peak, one hill rep at a time.',
      sport: 'running',
      kind: 'elevation_gain',
      targetValue: 3000,
      startsAt: monthStart.toISOString(),
      endsAt: monthEnd.toISOString(),
      isOfficial: false,
      xpReward: 300,
      participantCount: 874,
      accentColor: '#A78BFA',
    },
    {
      id: 'ch-head-to-head',
      slug: 'beat-mara',
      name: 'Beat Mara this week',
      description: 'Out-run Mara Laurent on total distance before Sunday midnight.',
      sport: 'running',
      kind: 'head_to_head',
      startsAt: weekStart.toISOString(),
      endsAt: addDays(weekStart, 7).toISOString(),
      isOfficial: false,
      xpReward: 150,
      participantCount: 2,
      accentColor: '#34D399',
    },
  ];

  const participations: ChallengeParticipation[] = [
    {
      challengeId: 'ch-monthly-distance',
      athleteId: myId,
      progressValue: range(rng, 118000, 154000),
      rank: intRange(rng, 400, 2200),
    },
    {
      challengeId: 'ch-consistency',
      athleteId: myId,
      progressValue: intRange(rng, 2, 4),
      rank: intRange(rng, 90, 800),
    },
  ];

  for (const friend of friends.slice(0, 3)) {
    participations.push({
      challengeId: 'ch-monthly-distance',
      athleteId: friend.id,
      progressValue: range(rng, 90000, 210000),
      rank: intRange(rng, 100, 3000),
    });
  }

  return { challenges, participations };
};

const COMMENT_BODIES = [
  'That climb looks brutal. Nice work.',
  'Splits are so even, textbook pacing.',
  'Whats the route? Looks like a good loop.',
  'Flying at the moment 👀',
  'See you Sunday for the long one?',
  'Massive session.',
  'This is the fittest you have looked all year.',
  'How were the legs after?',
];

const generateComments = (
  rng: Rng,
  activities: readonly Activity[],
  friends: readonly Athlete[],
  now: Date,
): Comment[] => {
  const comments: Comment[] = [];
  let index = 0;

  for (const activity of activities) {
    if (activity.commentCount === 0) continue;
    const ageDays = (now.getTime() - new Date(activity.startedAt).getTime()) / 86_400_000;
    if (ageDays > 14) continue;

    for (let i = 0; i < activity.commentCount; i++) {
      const author = pick(rng, friends);
      comments.push({
        id: `comment-${index++}`,
        activityId: activity.id,
        athleteId: author.id,
        body: pick(rng, COMMENT_BODIES),
        createdAt: new Date(
          new Date(activity.startedAt).getTime() + range(rng, 0.5, 20) * 3_600_000,
        ).toISOString(),
      });
    }
  }

  return comments;
};
