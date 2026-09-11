import type { AthleteProfile } from '../analytics/profile';
import { round } from '../analytics/stats';

export type StatusLabel = 'elite' | 'strong' | 'solid' | 'building' | 'developing';

export const statusLabel = (overall: number): StatusLabel =>
  overall >= 85 ? 'elite' : overall >= 72 ? 'strong' : overall >= 58 ? 'solid' : overall >= 42 ? 'building' : 'developing';

/**
 * The paragraph Intelligence opens with.
 *
 * Deliberately written as one connected observation rather than a list of
 * metrics: the value of the status card is the *relationship* between fitness,
 * load and recovery, which is exactly what an athlete cannot see by reading
 * four numbers side by side. It ends on a consequence, never on a statistic.
 */
export const summariseStatus = (profile: AthleteProfile): string => {
  const { fitness, recovery, trends, load, efficiency } = profile;
  const parts: string[] = [];

  // 1. Where fitness is going.
  if (fitness.fitness.trend === 'up') {
    parts.push('Your fitness continues to build');
  } else if (fitness.fitness.trend === 'down') {
    parts.push('Your fitness has eased back over the last two weeks');
  } else {
    parts.push('Your fitness is holding steady');
  }

  // 2. What the training has been doing to produce that.
  if (trends.volume.changeRatio != null && Math.abs(trends.volume.changeRatio) > 0.08) {
    const pct = Math.round(Math.abs(trends.volume.changeRatio) * 100);
    parts.push(
      trends.volume.changeRatio > 0
        ? `on the back of a ${pct}% increase in weekly volume`
        : `after a ${pct}% reduction in weekly volume`,
    );
  } else if (efficiency.direction === 'improving' && efficiency.changeRatio != null) {
    parts.push(
      `with aerobic efficiency up ${round(efficiency.changeRatio * 100, 1)}% against last month`,
    );
  }

  const opening = `${parts.join(' ')}.`;

  // 3. The tension worth acting on — load against recovery.
  let consequence: string;
  if (load.status === 'overreaching' && recovery.score < 60) {
    consequence = `Your seven-day load is ${round(load.ratio ?? 0, 2)}× your baseline and recovery has not kept pace, so the next few days matter more than the next session does.`;
  } else if (load.status === 'overreaching') {
    consequence = `Your seven-day load sits at ${round(load.ratio ?? 0, 2)}× your baseline. Recovery is holding for now, but that ratio is not sustainable for long.`;
  } else if (recovery.decliningDays >= 3) {
    consequence = `Recovery has declined ${recovery.decliningDays} days running, which usually shows up as heavy legs before it shows up in your pace.`;
  } else if (recovery.score < 50) {
    consequence =
      'Recovery is below your normal range, so an easier session would likely return more than a hard one.';
  } else if (fitness.formLabel === 'fresh' && fitness.fitness.trend !== 'down') {
    consequence = 'You are carrying little fatigue — a good window for a hard session or a race.';
  } else {
    consequence = 'Load and recovery are in balance, which is where adaptation actually happens.';
  }

  return `${opening} ${consequence}`;
};
