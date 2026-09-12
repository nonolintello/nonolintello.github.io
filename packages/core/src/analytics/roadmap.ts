import type { Activity, PlannedWorkout, Race, SportEvent, TrainingBlock } from '../domain/types';
import { isRunning, prDistanceLabel } from '../domain/types';
import { distanceIn, distanceLabel, formatDuration, type UnitPreference } from '../domain/units';
import type { AthleteProfile } from './profile';
import { predictFromRecords } from './bestEfforts';
import { LEVEL_TITLES, xpForLevel } from './xp';
import { addDays, DAY_MS, daysBetween, startOfDay, startOfWeek, toISODate } from './time';

/**
 * The roadmap turns a training block into a journey with a destination.
 *
 * A calendar answers "what is on Tuesday?". The roadmap answers "how far along
 * am I, what have I already banked, and what is the next thing that matters?"
 * — which is the question that keeps someone training through week nine.
 *
 * Every checkpoint is derived from data the engine already holds (activities,
 * records, the plan, the race), never authored. That keeps it honest: a
 * checkpoint reads as done only because the athlete actually did it.
 */

export type CheckpointKind =
  | 'start'
  | 'long_run'
  | 'workout'
  | 'record'
  | 'volume'
  | 'fitness'
  | 'tune_up'
  | 'taper'
  | 'race'
  | 'level';

export type CheckpointStatus = 'done' | 'current' | 'upcoming' | 'missed';

export interface RoadmapCheckpoint {
  id: string;
  kind: CheckpointKind;
  title: string;
  detail: string;
  date: string;
  /** 0..1 along the journey. Time-based for race roadmaps, XP-based for levels. */
  position: number;
  status: CheckpointStatus;
  activityId?: string;
  plannedWorkoutId?: string;
  raceId?: string;
}

export interface RaceRoadmap {
  kind: 'race';
  race: Race;
  event: SportEvent | null;
  block: TrainingBlock | null;
  startsOn: string;
  endsOn: string;
  /** 0..1 of the way from block start to race day, by calendar. */
  position: number;
  daysTotal: number;
  daysRemaining: number;
  checkpoints: RoadmapCheckpoint[];
  next: RoadmapCheckpoint | null;
  doneCount: number;
  /** One line on where the athlete stands, written from the numbers. */
  summary: string;
}

export interface LevelRoadmap {
  kind: 'level';
  level: number;
  title: string;
  nextTitle: string;
  /** 0..1 through the current level. */
  position: number;
  xpToNext: number;
  checkpoints: RoadmapCheckpoint[];
  next: RoadmapCheckpoint | null;
  doneCount: number;
  summary: string;
}

export type Roadmap = RaceRoadmap | LevelRoadmap;

export interface RoadmapInput {
  profile: AthleteProfile;
  activities: readonly Activity[];
  plan: readonly PlannedWorkout[];
  races: readonly Race[];
  block: TrainingBlock | null;
  events?: readonly SportEvent[];
  now: Date;
  unit?: UnitPreference;
}

/** Long-run peak and taper length scale with the race distance. */
const raceShape = (distanceM: number) => {
  if (distanceM >= 40000) return { peakLongM: 34000, taperDays: 21 };
  if (distanceM >= 20000) return { peakLongM: 20000, taperDays: 14 };
  if (distanceM >= 15000) return { peakLongM: 18000, taperDays: 10 };
  return { peakLongM: Math.max(12000, distanceM * 1.6), taperDays: 7 };
};

const km = (m: number, unit: UnitPreference) => `${distanceIn(m, unit).toFixed(1)} ${distanceLabel(unit)}`;

const dateOf = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

export const buildRoadmap = (input: RoadmapInput): Roadmap => {
  const now = startOfDay(input.now);
  const upcomingRaces = input.races
    .filter((r) => dateOf(r.date).getTime() >= now.getTime())
    .sort((a, b) => a.date.localeCompare(b.date));
  const goalRace = upcomingRaces.find((r) => r.isGoalRace) ?? upcomingRaces[upcomingRaces.length - 1];

  return goalRace ? buildRaceRoadmap(input, goalRace, now) : buildLevelRoadmap(input, now);
};

const buildRaceRoadmap = (input: RoadmapInput, race: Race, now: Date): RaceRoadmap => {
  const unit = input.unit ?? 'metric';
  const raceDay = dateOf(race.date);
  // Without a block, journey from twelve weeks out — the typical build length.
  const startsOn = input.block?.startsOn ?? toISODate(addDays(raceDay, -84));
  const start = dateOf(startsOn);
  const daysTotal = Math.max(1, daysBetween(start, raceDay));
  const daysElapsed = Math.min(daysTotal, Math.max(0, daysBetween(start, now)));
  const daysRemaining = Math.max(0, daysBetween(now, raceDay));
  const position = daysElapsed / daysTotal;
  const at = (date: Date) => Math.min(1, Math.max(0, daysBetween(start, date) / daysTotal));
  const statusFor = (date: Date): CheckpointStatus =>
    date.getTime() < now.getTime() ? 'done' : date.getTime() === now.getTime() ? 'current' : 'upcoming';

  const shape = raceShape(race.distanceM);
  const checkpoints: RoadmapCheckpoint[] = [];

  checkpoints.push({
    id: 'start',
    kind: 'start',
    title: input.block?.name ?? 'Build begins',
    detail: input.block?.focus ?? `${daysTotal} days to ${race.name}.`,
    date: startsOn,
    position: 0,
    status: 'done',
  });

  // What has been banked: the runs in this block that moved the ceiling.
  const inBlock = input.activities
    .filter((a) => isRunning(a.sport))
    .filter((a) => {
      const t = new Date(a.startedAt).getTime();
      return t >= start.getTime() && t <= input.now.getTime();
    })
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  // Long-run step-ups: each run that was the longest of the block so far, kept
  // only when it was a real step (≥ 2 km over the previous ceiling). Reads as
  // a staircase of "furthest I've gone", which is what a build feels like.
  let ceiling = 0;
  const stepUps: Activity[] = [];
  for (const a of inBlock) {
    if (a.distanceM >= ceiling + 2000 && a.distanceM >= 14000) {
      stepUps.push(a);
      ceiling = a.distanceM;
    }
  }
  for (const a of stepUps.slice(-3)) {
    checkpoints.push({
      id: `long-${a.id}`,
      kind: 'long_run',
      title: `${km(a.distanceM, unit)} long run`,
      detail: a === stepUps[stepUps.length - 1] ? 'Longest run of the build so far.' : 'New longest run of the build.',
      date: toISODate(new Date(a.startedAt)),
      position: at(startOfDay(new Date(a.startedAt))),
      status: 'done',
      activityId: a.id,
    });
  }

  // Biggest week of the build.
  const blockWeeks = input.profile.trailingWeeks.filter((w) => dateOf(w.weekStart).getTime() >= start.getTime());
  const biggest = blockWeeks.reduce<(typeof blockWeeks)[number] | null>(
    (best, w) => (w.distanceM > (best?.distanceM ?? 0) ? w : best),
    null,
  );
  if (biggest && biggest.distanceM > 0 && dateOf(biggest.weekStart).getTime() < startOfWeek(now).getTime()) {
    checkpoints.push({
      id: `week-${biggest.weekStart}`,
      kind: 'volume',
      title: `${km(biggest.distanceM, unit)} week`,
      detail: `Biggest week of the build, ${biggest.activityCount} runs.`,
      date: toISODate(addDays(dateOf(biggest.weekStart), 6)),
      position: at(addDays(dateOf(biggest.weekStart), 6)),
      status: 'done',
    });
  }

  // Records set during the block.
  for (const r of input.profile.records) {
    const when = startOfDay(new Date(r.achievedAt));
    if (when.getTime() < start.getTime() || when.getTime() > now.getTime()) continue;
    checkpoints.push({
      id: `record-${r.id}`,
      kind: 'record',
      title: `${prDistanceLabel(r.distanceM)} record`,
      detail: r.previousElapsedSeconds
        ? `${formatDuration(r.elapsedSeconds)}, ${Math.round(r.previousElapsedSeconds - r.elapsedSeconds)}s faster than the previous best.`
        : `${formatDuration(r.elapsedSeconds)}, first recorded best at this distance.`,
      date: toISODate(when),
      position: at(when),
      status: 'done',
      activityId: r.activityId,
    });
  }

  // Tune-up races on the way to the goal, past and future.
  for (const r of input.races) {
    if (r.id === race.id) continue;
    const when = dateOf(r.date);
    if (when.getTime() < start.getTime() || when.getTime() > raceDay.getTime()) continue;
    checkpoints.push({
      id: `tuneup-${r.id}`,
      kind: 'tune_up',
      title: r.name,
      detail: r.goalSeconds
        ? `Tune-up race · ${km(r.distanceM, unit)} · target ${formatDuration(r.goalSeconds)}`
        : `Tune-up race · ${km(r.distanceM, unit)}`,
      date: r.date,
      position: at(when),
      status: statusFor(when),
      raceId: r.id,
    });
  }

  // The next planned long run. Only one: a plan's horizon is a few weeks and
  // its long runs repeat, and three identical checkpoints say nothing.
  const plannedLongs = input.plan
    .filter((p) => p.type === 'long' && !p.completedActivityId && !p.skipped)
    .filter((p) => dateOf(p.date).getTime() >= now.getTime() && dateOf(p.date).getTime() < raceDay.getTime())
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const p of plannedLongs.slice(0, 1)) {
    checkpoints.push({
      id: `planned-${p.id}`,
      kind: 'long_run',
      title: p.targetDistanceM ? `${km(p.targetDistanceM, unit)} long run` : p.title,
      detail: p.prescription ?? 'Planned long run.',
      date: p.date,
      position: at(dateOf(p.date)),
      status: statusFor(dateOf(p.date)),
      plannedWorkoutId: p.id,
    });
  }

  // Past the plan's horizon the build follows the distance's shape: a peak
  // long run before the taper, then the taper itself.
  const taperStart = addDays(raceDay, -shape.taperDays);
  const peakDay = addDays(taperStart, -1 - ((addDays(taperStart, -1).getDay() + 7) % 7));
  const lastPlanned = plannedLongs[plannedLongs.length - 1];
  const peakCovered = lastPlanned && dateOf(lastPlanned.date).getTime() >= peakDay.getTime();
  if (!peakCovered && peakDay.getTime() > now.getTime() && ceiling < shape.peakLongM) {
    checkpoints.push({
      id: 'peak-long',
      kind: 'long_run',
      title: `${km(shape.peakLongM, unit)} peak long run`,
      detail: `The longest run of the build, ${daysBetween(peakDay, raceDay)} days out.`,
      date: toISODate(peakDay),
      position: at(peakDay),
      status: 'upcoming',
    });
  }
  if (taperStart.getTime() > start.getTime()) {
    checkpoints.push({
      id: 'taper',
      kind: 'taper',
      title: 'Taper begins',
      detail: `${shape.taperDays} days of shedding fatigue while fitness holds.`,
      date: toISODate(taperStart),
      position: at(taperStart),
      status: statusFor(taperStart),
    });
  }

  // Fitness milestone: does current fitness project to the goal time? It is
  // pinned at taper start because that is when the projection is what you
  // will race with; earlier, there is still time to move it.
  const prediction = predictFromRecords(input.profile.records, race.distanceM);
  if (race.goalSeconds && prediction) {
    const gap = prediction.predictedSeconds - race.goalSeconds;
    const onTrack = gap <= 0;
    checkpoints.push({
      id: 'fitness',
      kind: 'fitness',
      title: `Projecting ${formatDuration(race.goalSeconds)}`,
      detail: onTrack
        ? `Current fitness projects ${formatDuration(prediction.predictedSeconds)} — inside the target.`
        : `Projecting ${formatDuration(prediction.predictedSeconds)} today; ${formatDuration(gap)} still to find.`,
      date: toISODate(taperStart),
      position: Math.max(0, at(taperStart) - 0.02),
      status: onTrack ? 'done' : taperStart.getTime() < now.getTime() ? 'missed' : 'upcoming',
    });
  }

  checkpoints.push({
    id: `race-${race.id}`,
    kind: 'race',
    title: race.name,
    detail: race.goalSeconds
      ? `${km(race.distanceM, unit)} · target ${formatDuration(race.goalSeconds)}`
      : km(race.distanceM, unit),
    date: race.date,
    position: 1,
    status: statusFor(raceDay),
    raceId: race.id,
  });

  checkpoints.sort((a, b) => a.position - b.position || a.date.localeCompare(b.date));
  const next = checkpoints.find((c) => c.status === 'current') ?? checkpoints.find((c) => c.status === 'upcoming') ?? null;
  const doneCount = checkpoints.filter((c) => c.status === 'done').length;

  const weeksLeft = Math.round(daysRemaining / 7);
  const summary =
    daysRemaining === 0
      ? 'Race day.'
      : next
        ? `${weeksLeft} ${weeksLeft === 1 ? 'week' : 'weeks'} to go · next: ${next.title.toLowerCase()} ${
            daysBetween(now, dateOf(next.date)) === 0 ? 'today' : `in ${daysBetween(now, dateOf(next.date))}d`
          }`
        : `${weeksLeft} weeks to go.`;

  return {
    kind: 'race',
    race,
    event: input.events?.find((e) => e.id === race.eventId) ?? null,
    block: input.block,
    startsOn,
    endsOn: race.date,
    position,
    daysTotal,
    daysRemaining,
    checkpoints,
    next,
    doneCount,
    summary,
  };
};

/**
 * Without a race there is no date to walk toward, so the journey is the level
 * ladder: the athlete's XP position between named titles, with the concrete
 * things that would move them (a longer run, a streak) as the next steps.
 */
const buildLevelRoadmap = (input: RoadmapInput, now: Date): LevelRoadmap => {
  const unit = input.unit ?? 'metric';
  const { level, streakWeeks, trailingWeeks } = input.profile;
  const titleAt = (l: number) => {
    let title = 'Newcomer';
    for (const [threshold, name] of LEVEL_TITLES) if (l >= threshold) title = name;
    return title;
  };
  const nextTitleLevel = LEVEL_TITLES.find(([threshold]) => threshold > level.level)?.[0] ?? level.level + 1;

  const from = Math.max(1, level.level - 2);
  const to = Math.max(nextTitleLevel, level.level + 3);
  const span = xpForLevel(to) - xpForLevel(from);
  const at = (xp: number) => Math.min(1, Math.max(0, (xp - xpForLevel(from)) / span));

  const checkpoints: RoadmapCheckpoint[] = [];
  for (let l = from; l <= to; l++) {
    const titled = LEVEL_TITLES.some(([t]) => t === l);
    checkpoints.push({
      id: `level-${l}`,
      kind: 'level',
      title: titled ? `${titleAt(l)} · level ${l}` : `Level ${l}`,
      detail: l <= level.level ? 'Reached.' : `${(xpForLevel(l) - level.currentXp).toLocaleString()} XP away.`,
      date: toISODate(now),
      position: at(xpForLevel(l)),
      status: l < level.level ? 'done' : l === level.level ? 'current' : 'upcoming',
    });
  }

  // Concrete next steps, placed just ahead of the athlete on the ladder.
  const longest = Math.max(0, ...trailingWeeks.map((w) => w.longestRunM));
  const nextLong = Math.ceil((longest + 2000) / 1000) * 1000;
  const steps: RoadmapCheckpoint[] = [
    {
      id: 'step-long',
      kind: 'long_run',
      title: `${km(nextLong, unit)} long run`,
      detail: `Longest in 12 weeks is ${km(longest, unit)}.`,
      date: toISODate(now),
      position: Math.min(1, at(level.currentXp) + 0.06),
      status: 'upcoming',
    },
    {
      id: 'step-streak',
      kind: 'volume',
      title: `${Math.max(4, streakWeeks + 1)}-week streak`,
      detail: `Currently ${streakWeeks} ${streakWeeks === 1 ? 'week' : 'weeks'} running.`,
      date: toISODate(now),
      position: Math.min(1, at(level.currentXp) + 0.12),
      status: 'upcoming',
    },
  ];
  checkpoints.push(...steps);
  checkpoints.sort((a, b) => a.position - b.position);

  const next = steps[0] ?? null;
  const xpToNext = level.xpForNextLevel - level.xpIntoLevel;
  return {
    kind: 'level',
    level: level.level,
    title: level.title,
    nextTitle: titleAt(nextTitleLevel),
    position: at(level.currentXp),
    xpToNext,
    checkpoints,
    next,
    doneCount: checkpoints.filter((c) => c.status === 'done').length,
    summary: `Level ${level.level} ${level.title} · ${xpToNext.toLocaleString()} XP to level ${level.level + 1}`,
  };
};

/** Days between two roadmap dates, for callers formatting "in Nd". */
export const roadmapDaysUntil = (checkpoint: RoadmapCheckpoint, now: Date): number =>
  Math.round((dateOf(checkpoint.date).getTime() - startOfDay(now).getTime()) / DAY_MS);
