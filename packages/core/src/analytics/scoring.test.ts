import { describe, expect, it } from 'vitest';
import type { Activity, Athlete } from '../domain/types';
import { computeAthleteScore, computeWeeklyScore, piecewise, progressScore } from './scoring';
import { computeGoalProgress } from './goals';
import { addDays } from './time';

const NOW = new Date('2026-09-10T18:00:00');

const athlete: Pick<Athlete, 'restingHr' | 'maxHr' | 'birthDate'> = {
  restingHr: 50,
  maxHr: 190,
  birthDate: '1995-01-01',
};

/** Steady-speed stream, dense enough for best-effort extraction. */
const streamFor = (distanceM: number, speedMps: number) => {
  const timeOffsetS: number[] = [];
  const dist: number[] = [];
  const interval = 5;
  for (let t = 0; ; t += interval) {
    const d = speedMps * t;
    timeOffsetS.push(t);
    dist.push(Math.min(d, distanceM));
    if (d >= distanceM) break;
  }
  return { timeOffsetS, distanceM: dist };
};

interface BlockSpec {
  weeks: number;
  runsPerWeek: number;
  distanceM: number;
  speedMps: number;
  /** Weeks ago the block ends. */
  endingWeeksAgo: number;
  elevationPerRunM?: number;
}

const buildBlock = (spec: BlockSpec, idPrefix: string): Activity[] => {
  const out: Activity[] = [];
  let n = 0;
  for (let w = 0; w < spec.weeks; w++) {
    const weeksAgo = spec.endingWeeksAgo + (spec.weeks - 1 - w);
    for (let r = 0; r < spec.runsPerWeek; r++) {
      const started = addDays(NOW, -(weeksAgo * 7) - r * 2 - 1);
      const stream = streamFor(spec.distanceM, spec.speedMps);
      const seconds = stream.timeOffsetS[stream.timeOffsetS.length - 1] as number;
      out.push({
        id: `${idPrefix}-${n++}`,
        athleteId: 'a',
        sport: 'running',
        title: 'Aerobic run',
        startedAt: started.toISOString(),
        startTimezone: 'UTC',
        elapsedSeconds: seconds,
        movingSeconds: seconds,
        distanceM: spec.distanceM,
        elevationGainM: spec.elevationPerRunM ?? 40,
        avgHeartRate: Math.round(140 + (spec.speedMps - 3) * 22),
        maxHeartRate: 185,
        avgCadenceSpm: 172,
        visibility: 'private',
        source: 'manual',
        stream,
        likeCount: 0,
        commentCount: 0,
      });
    }
  }
  return out;
};

describe('progressScore', () => {
  it('puts no change at the midpoint', () => {
    expect(progressScore(0, 0.02)).toBeCloseTo(50, 5);
  });

  it('rewards improvement and penalises regression symmetrically', () => {
    expect(progressScore(0.02, 0.02)).toBeGreaterThan(70);
    expect(progressScore(-0.02, 0.02)).toBeLessThan(30);
  });

  it('is neutral when there is no baseline to compare against', () => {
    expect(progressScore(null, 0.02)).toBe(50);
  });
});

describe('piecewise', () => {
  it('clamps outside the control points and interpolates between them', () => {
    const points = [
      [0, 0],
      [10, 100],
    ] as const;
    expect(piecewise(-5, points)).toBe(0);
    expect(piecewise(15, points)).toBe(100);
    expect(piecewise(5, points)).toBeCloseTo(50);
  });
});

describe('computeAthleteScore — progression over genetics', () => {
  // A slow runner getting steadily faster at constant volume, so the only
  // thing that varies between the two athletes is rate of improvement.
  const improvingBeginner = [
    ...buildBlock(
      { weeks: 12, runsPerWeek: 4, distanceM: 8000, speedMps: 2.45, endingWeeksAgo: 12 },
      'beg-1',
    ),
    ...buildBlock(
      { weeks: 4, runsPerWeek: 4, distanceM: 8000, speedMps: 2.65, endingWeeksAgo: 8 },
      'beg-2',
    ),
    ...buildBlock(
      { weeks: 4, runsPerWeek: 4, distanceM: 8000, speedMps: 2.85, endingWeeksAgo: 4 },
      'beg-3',
    ),
    ...buildBlock(
      { weeks: 4, runsPerWeek: 4, distanceM: 8000, speedMps: 3.05, endingWeeksAgo: 0 },
      'beg-4',
    ),
  ];

  // A much faster runner who has been completely flat for six months.
  const plateauedFastRunner = buildBlock(
    { weeks: 24, runsPerWeek: 4, distanceM: 12000, speedMps: 4.3, endingWeeksAgo: 0 },
    'fast',
  );

  it('scores the improving beginner higher on progression', () => {
    const beginner = computeAthleteScore(improvingBeginner, athlete, NOW);
    const fast = computeAthleteScore(plateauedFastRunner, athlete, NOW);
    expect(beginner.progression.value).toBeGreaterThan(fast.progression.value);
  });

  it('scores the improving beginner higher on speed despite being far slower', () => {
    const beginner = computeAthleteScore(improvingBeginner, athlete, NOW);
    const fast = computeAthleteScore(plateauedFastRunner, athlete, NOW);
    // The absolute band still favours the fast runner, but personal progress
    // carries 65% of the dimension — improvement has to win here.
    expect(beginner.speed.value).toBeGreaterThan(fast.speed.value);
  });

  it('still lets the beginner reach a competitive overall score', () => {
    const beginner = computeAthleteScore(improvingBeginner, athlete, NOW);
    expect(beginner.overall).toBeGreaterThan(55);
  });

  it('lets a consistent beginner score highly on consistency alone', () => {
    const beginner = computeAthleteScore(improvingBeginner, athlete, NOW);
    expect(beginner.consistency.value).toBeGreaterThan(70);
  });

  it('flags insufficient data rather than inventing a score', () => {
    const sparse = buildBlock(
      { weeks: 1, runsPerWeek: 1, distanceM: 5000, speedMps: 3, endingWeeksAgo: 0 },
      'sparse',
    );
    expect(computeAthleteScore(sparse, athlete, NOW).hasSufficientData).toBe(false);
  });
});

describe('computeWeeklyScore — volume is not rewarded without limit', () => {
  const baseline = buildBlock(
    { weeks: 4, runsPerWeek: 4, distanceM: 10000, speedMps: 3.2, endingWeeksAgo: 1 },
    'base',
  );

  const weekAt = (multiplier: number): Activity[] =>
    buildBlock(
      {
        weeks: 1,
        runsPerWeek: 4,
        distanceM: 10000 * multiplier,
        speedMps: 3.2,
        endingWeeksAgo: 0,
      },
      `week-${multiplier}`,
    );

  const volumeOf = (activities: Activity[]) =>
    computeWeeklyScore(activities, baseline, athlete, null, NOW).components.find(
      (c) => c.key === 'volume',
    )?.earned as number;

  it('peaks in the productive band rather than at the maximum', () => {
    const sensible = volumeOf(weekAt(1.2));
    const excessive = volumeOf(weekAt(2.2));
    expect(sensible).toBeGreaterThan(excessive);
  });

  it('scores a doubled week below a normal week', () => {
    expect(volumeOf(weekAt(2.0))).toBeLessThan(volumeOf(weekAt(1.0)));
  });

  it('does not punish an athlete who has not set a goal', () => {
    const withoutGoal = computeWeeklyScore(weekAt(1), baseline, athlete, null, NOW);
    const goalComponent = withoutGoal.components.find((c) => c.key === 'goal');
    expect(goalComponent?.earned).toBeGreaterThan(0);
  });

  it('awards full goal credit when the goal is met', () => {
    const week = weekAt(1);
    const goal = {
      id: 'g',
      athleteId: 'a',
      metric: 'distance' as const,
      period: 'week' as const,
      targetValue: 15000,
      startsOn: '2026-09-07',
      endsOn: '2026-09-13',
    };
    const progress = computeGoalProgress(goal, week, NOW);
    const scored = computeWeeklyScore(week, baseline, athlete, progress, NOW);
    const goalComponent = scored.components.find((c) => c.key === 'goal');
    expect(progress.isComplete).toBe(true);
    expect(goalComponent?.earned).toBe(25);
  });

  it('never lets a component exceed its own maximum', () => {
    const week = weekAt(1.25);
    const goal = {
      id: 'g',
      athleteId: 'a',
      metric: 'distance' as const,
      period: 'week' as const,
      targetValue: 1000,
      startsOn: '2026-09-07',
      endsOn: '2026-09-13',
    };
    const progress = computeGoalProgress(goal, week, NOW);
    for (const c of computeWeeklyScore(week, baseline, athlete, progress, NOW).components) {
      expect(c.earned).toBeLessThanOrEqual(c.max);
    }
  });

  it('never exceeds 100', () => {
    const week = weekAt(1.25);
    const goal = {
      id: 'g',
      athleteId: 'a',
      metric: 'distance' as const,
      period: 'week' as const,
      targetValue: 1000,
      startsOn: '2026-09-07',
      endsOn: '2026-09-13',
    };
    const progress = computeGoalProgress(goal, week, NOW);
    expect(computeWeeklyScore(week, baseline, athlete, progress, NOW).total).toBeLessThanOrEqual(100);
  });
});
