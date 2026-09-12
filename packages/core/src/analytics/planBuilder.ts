import type { PlannedWorkout, Race, TrainingPlan, WorkoutType } from '../domain/types';
import { WORKOUT_LABELS } from '../domain/types';
import { addDays, daysBetween, startOfWeek, toISODate } from './time';

/**
 * Builds a periodised plan a coach can start from and then edit.
 *
 * The template is the coach's assistant, not the coach: it lays down the
 * shape every distance-running block shares — a 3:1 build, a peak, a taper —
 * scaled to what the athlete is currently doing, and marks the sessions the
 * block hinges on as key workouts so they surface on the athlete's roadmap.
 * Everything it writes is an ordinary PlannedWorkout the coach can change.
 */

export interface PlanTemplateInput {
  athleteId: string;
  coachId: string;
  name: string;
  startsOn: string;
  /** Number of weeks. Defaults to the weeks until the race, capped at 16. */
  weeks?: number;
  race?: Race | null;
  /** Current weekly volume; the first week starts a touch below it. */
  currentWeeklyM: number;
  /** Longest recent run; the long-run progression starts just above it. */
  longestRunM: number;
  now: Date;
  focus?: string;
}

export interface GeneratedPlan {
  plan: TrainingPlan;
  workouts: PlannedWorkout[];
}

const round500 = (m: number) => Math.max(0, Math.round(m / 500) * 500);

/** Peak long run and taper length by race distance. */
const shapeFor = (distanceM: number | undefined) => {
  if (!distanceM) return { peakLongM: 22000, taperWeeks: 1, peakWeeklyMul: 1.25 };
  if (distanceM >= 40000) return { peakLongM: 34000, taperWeeks: 3, peakWeeklyMul: 1.3 };
  if (distanceM >= 20000) return { peakLongM: 21000, taperWeeks: 2, peakWeeklyMul: 1.25 };
  if (distanceM >= 15000) return { peakLongM: 18000, taperWeeks: 1, peakWeeklyMul: 1.2 };
  return { peakLongM: 14000, taperWeeks: 1, peakWeeklyMul: 1.15 };
};

const PRESCRIPTIONS: Record<WorkoutType, string> = {
  rest: 'Full rest. Sleep is training too.',
  recovery: 'Conversational and short. Legs, not lungs.',
  easy: 'Fully aerobic. If in doubt, slower.',
  long: 'Steady from the start; the last quarter can lift to marathon effort.',
  steady: 'Comfortably hard, about an hour of marathon-pace effort.',
  tempo: '3 × 10 min at threshold, 2 min float between.',
  intervals: '6 × 1 km at 5K effort, 90 s jog.',
  race: 'Race day. Trust the work.',
};

/**
 * Weekly skeleton: Monday rest, Tuesday quality, Wednesday easy, Thursday
 * steady or tempo, Friday rest, Saturday easy, Sunday long. Shares of the
 * week's volume sum to one, with the long run carrying the most.
 */
const SKELETON: { day: number; type: WorkoutType; share: number }[] = [
  { day: 0, type: 'rest', share: 0 },
  { day: 1, type: 'intervals', share: 0.17 },
  { day: 2, type: 'easy', share: 0.15 },
  { day: 3, type: 'tempo', share: 0.18 },
  { day: 4, type: 'rest', share: 0 },
  { day: 5, type: 'easy', share: 0.14 },
  { day: 6, type: 'long', share: 0.36 },
];

export const generatePlanFromTemplate = (input: PlanTemplateInput): GeneratedPlan => {
  const start = startOfWeek(new Date(`${input.startsOn}T00:00:00`));
  const raceDay = input.race ? new Date(`${input.race.date}T00:00:00`) : null;
  // Race day is included whichever weekday it falls on.
  const weeksToRace = raceDay ? Math.max(1, Math.floor(daysBetween(start, raceDay) / 7) + 1) : null;
  const weeks = Math.min(16, Math.max(2, input.weeks ?? weeksToRace ?? 12));
  const shape = shapeFor(input.race?.distanceM);
  const taperWeeks = Math.min(shape.taperWeeks, Math.max(1, weeks - 2));
  const buildWeeks = weeks - taperWeeks;

  const baseWeeklyM = Math.max(20000, input.currentWeeklyM * 0.95);
  const peakWeeklyM = baseWeeklyM * shape.peakWeeklyMul;
  // Start just above their longest, but always leave room to build to the peak.
  const baseLongM = Math.max(12000, Math.min(input.longestRunM + 2000, shape.peakLongM * 0.8));

  const planId = `plan-${input.athleteId}-${start.getTime()}`;
  const workouts: PlannedWorkout[] = [];

  for (let w = 0; w < weeks; w++) {
    const weekStart = addDays(start, w * 7);
    const isTaper = w >= buildWeeks;
    const isPeak = w === buildWeeks - 1;
    // 3:1 — every fourth build week drops back to absorb the work.
    const isDown = !isTaper && (w + 1) % 4 === 0 && !isPeak;
    const buildProgress = buildWeeks > 1 ? w / (buildWeeks - 1) : 1;

    let weeklyM = isTaper
      ? peakWeeklyM * (0.72 - (w - buildWeeks) * 0.18)
      : baseWeeklyM + (peakWeeklyM - baseWeeklyM) * Math.min(1, buildProgress);
    if (isDown) weeklyM *= 0.78;

    const longM = isTaper
      ? Math.max(10000, shape.peakLongM * (0.6 - (w - buildWeeks) * 0.15))
      : isDown
        ? baseLongM + (shape.peakLongM - baseLongM) * Math.max(0, buildProgress - 0.15) * 0.8
        : baseLongM + (shape.peakLongM - baseLongM) * Math.min(1, buildProgress);

    for (const slot of SKELETON) {
      const date = addDays(weekStart, slot.day);
      const iso = toISODate(date);
      const isRaceDay = raceDay && iso === input.race?.date;
      const afterRace = raceDay && date.getTime() > raceDay.getTime();
      if (afterRace) continue;

      let type: WorkoutType = slot.type;
      let distanceM = slot.type === 'long' ? longM : weeklyM * slot.share;
      let keyWorkout = false;
      let title = WORKOUT_LABELS[type];
      let prescription = PRESCRIPTIONS[type];

      if (isRaceDay) {
        type = 'race';
        distanceM = input.race?.distanceM ?? distanceM;
        title = input.race?.name ?? 'Race';
        prescription = PRESCRIPTIONS.race;
        keyWorkout = true;
      } else if (isTaper && (type === 'intervals' || type === 'tempo')) {
        // Taper keeps a touch of sharpness, never a full session.
        type = w === weeks - 1 ? 'easy' : 'steady';
        distanceM *= 0.7;
        title = w === weeks - 1 ? 'Easy with strides' : 'Sharpener';
        prescription = w === weeks - 1 ? '20 min easy, 4 × 20 s strides.' : '15 min at marathon effort, then easy.';
      } else if (isDown && (type === 'intervals' || type === 'tempo')) {
        type = 'steady';
        title = 'Steady';
        prescription = 'Down week. Rhythm, not effort.';
      } else if (type === 'long') {
        // The long runs that move the ceiling are the milestones of the block.
        if (isPeak) {
          keyWorkout = true;
          title = 'Peak long run';
          prescription = 'The longest run of the block. Practise race-day fuelling.';
        } else if (!isDown && w > 0 && w % 2 === 0 && !isTaper) {
          keyWorkout = true;
          title = 'Progressive long run';
          prescription = 'Final 30 minutes at marathon effort.';
        }
      } else if (type === 'tempo' && !isTaper && !isDown && w === Math.floor(buildWeeks / 2)) {
        keyWorkout = true;
        title = 'Threshold benchmark';
        prescription = '2 × 20 min at threshold — the fitness check for the block.';
      }

      // Race week: the two days before are shakeouts.
      if (raceDay && !isRaceDay && daysBetween(date, raceDay) <= 2 && daysBetween(date, raceDay) > 0) {
        type = 'recovery';
        distanceM = 4000;
        title = 'Shakeout';
        prescription = 'Fifteen minutes with a few strides. Stay off your feet after.';
      }

      workouts.push({
        id: `${planId}-${w}-${slot.day}`,
        athleteId: input.athleteId,
        date: iso,
        type,
        title,
        prescription,
        targetDistanceM: type === 'rest' ? undefined : round500(distanceM),
        planId,
        source: 'coach',
        keyWorkout: keyWorkout || undefined,
      });
    }
  }

  const last = workouts[workouts.length - 1];
  const plan: TrainingPlan = {
    id: planId,
    coachId: input.coachId,
    athleteId: input.athleteId,
    name: input.name,
    startsOn: toISODate(start),
    endsOn: last?.date ?? toISODate(addDays(start, weeks * 7 - 1)),
    targetRaceId: input.race?.id,
    focus: input.focus,
    createdAt: input.now.toISOString(),
    updatedAt: input.now.toISOString(),
  };

  return { plan, workouts };
};

/** Weekly totals for a plan editor's header row. */
export const planWeekSummary = (workouts: readonly PlannedWorkout[], weekStartIso: string) => {
  const weekStart = new Date(`${weekStartIso}T00:00:00`);
  const end = addDays(weekStart, 6);
  const inWeek = workouts.filter((p) => p.date >= toISODate(weekStart) && p.date <= toISODate(end));
  return {
    distanceM: inWeek.reduce((s, p) => s + (p.targetDistanceM ?? 0), 0),
    sessions: inWeek.filter((p) => p.type !== 'rest').length,
    keyWorkouts: inWeek.filter((p) => p.keyWorkout).length,
  };
};
