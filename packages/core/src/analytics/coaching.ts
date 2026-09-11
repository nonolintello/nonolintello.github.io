import type { PlannedWorkout, WorkoutType } from '../domain/types';
import { WORKOUT_LABELS, isQualityWorkout } from '../domain/types';
import type { AthleteProfile } from './profile';
import { round } from './stats';
import { DAY_MS, startOfDay } from './time';

export interface WorkoutAdjustment {
  original: PlannedWorkout;
  suggestedType: WorkoutType;
  suggestedTitle: string;
  suggestedPrescription: string;
  /** Why the plan is being questioned, in the athlete's own numbers. */
  reason: string;
  /** What is given up by not doing the original session. */
  tradeoff: string;
  severity: 'advisory' | 'strong';
}

/**
 * Checks the next hard session against how the athlete is actually recovering.
 *
 * This is the hinge between Intelligence and Training: Intelligence reports
 * that recovery has fallen, and this decides what to do about the specific
 * session on Saturday. It only questions sessions that carry real stress —
 * quality work and long runs. Easy running is rarely what needs adjusting, and
 * a plan that flinches at every dip stops being a plan.
 */
export const nextWorkoutAdjustment = (
  profile: AthleteProfile,
  plan: readonly PlannedWorkout[],
  now: Date = new Date(),
): WorkoutAdjustment | null => {
  const today = startOfDay(now).getTime();
  // Five days: far enough to catch the next real stressor, near enough that the
  // recovery signal it is judged against is still relevant on the day.
  const horizon = today + 5 * DAY_MS;

  // Long runs count alongside quality work. In a marathon block the long run is
  // the single biggest stressor of the week, and running it under-recovered
  // costs more than moving it.
  const isSignificant = (p: PlannedWorkout) => isQualityWorkout(p.type) || p.type === 'long';

  const candidate = [...plan]
    .filter((p) => !p.completedActivityId && !p.skipped && isSignificant(p))
    .filter((p) => {
      const at = new Date(`${p.date}T00:00:00`).getTime();
      return at >= today && at <= horizon;
    })
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  if (!candidate) return null;

  const { recovery, load, fitness } = profile;

  const reasons: string[] = [];
  let severity: WorkoutAdjustment['severity'] = 'advisory';

  if (recovery.decliningDays >= 3) {
    reasons.push(`recovery has fallen ${recovery.decliningDays} days running`);
    severity = 'strong';
  }
  if (recovery.score < 50) {
    reasons.push(`your recovery score is ${Math.round(recovery.score)}, below your normal range`);
    severity = 'strong';
  } else if (recovery.score < 62) {
    reasons.push(`your recovery score is ${Math.round(recovery.score)}`);
  }
  if (load.status === 'overreaching' && load.ratio != null) {
    reasons.push(`seven-day load is ${round(load.ratio, 2)}× your baseline`);
    severity = 'strong';
  }
  if (recovery.hrv?.trend === 'down' && recovery.hrv.changeRatio != null) {
    reasons.push(`HRV is down ${Math.abs(Math.round(recovery.hrv.changeRatio * 100))}% on your baseline`);
  }
  if (fitness.formLabel === 'strained') {
    reasons.push('you are carrying more fatigue than fitness');
  }

  // One soft signal is noise. Two or more, or any strong one, is a pattern.
  if (reasons.length === 0 || (severity === 'advisory' && reasons.length < 2)) return null;

  // A long run is shortened rather than replaced — the endurance stimulus still
  // matters, the duration is what gets trimmed.
  const easier: WorkoutType = candidate.type === 'long' ? 'long' : candidate.type === 'race' ? 'steady' : 'easy';

  return {
    original: candidate,
    suggestedType: easier,
    suggestedTitle: candidate.type === 'long' ? 'Shortened long run' : WORKOUT_LABELS[easier],
    suggestedPrescription:
      candidate.type === 'long'
        ? 'Cut it to around 60 minutes, entirely conversational'
        : easier === 'easy'
          ? '45 minutes fully aerobic, conversational throughout'
          : '40 minutes steady, nothing above threshold',
    reason: `Your planned ${WORKOUT_LABELS[candidate.type].toLowerCase()} may be too aggressive — ${joinReasons(reasons)}.`,
    tradeoff:
      severity === 'strong'
        ? `${candidate.type === 'long' ? 'Trimming one long run' : 'Moving one quality session by a couple of days'} costs almost nothing across a block. Running it under-recovered usually costs more.`
        : 'You could still run it as planned — treat this as a flag rather than an instruction.',
    severity,
  };
};

const joinReasons = (reasons: string[]): string => {
  if (reasons.length === 1) return reasons[0] as string;
  return `${reasons.slice(0, -1).join(', ')} and ${reasons[reasons.length - 1]}`;
};

/**
 * What the athlete should do today when the plan has nothing scheduled, or when
 * the scheduled session has already been completed.
 */
export const recommendToday = (
  profile: AthleteProfile,
): { title: string; detail: string; type: WorkoutType } => {
  const { recovery, load, currentWeek } = profile;

  if (recovery.score < 48 || load.status === 'overreaching') {
    return {
      type: 'rest',
      title: 'Rest or a short shakeout',
      detail: `Recovery is at ${Math.round(recovery.score)} and your load is ${load.status}. Adaptation happens on days like this.`,
    };
  }

  if (currentWeek.hardSessionCount === 0 && recovery.score >= 62) {
    return {
      type: 'tempo',
      title: 'A quality session',
      detail: 'No hard running yet this week and recovery is holding. There is room for threshold work.',
    };
  }

  return {
    type: 'easy',
    title: 'An easy aerobic run',
    detail: 'Volume with low cost — the bulk of what builds the aerobic base.',
  };
};
