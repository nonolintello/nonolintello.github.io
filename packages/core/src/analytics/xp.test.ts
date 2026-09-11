import { describe, expect, it } from 'vitest';
import type { Activity, PersonalRecord } from '../domain/types';
import { activityXp, buildXpLedger, DAILY_ACTIVITY_XP_CAP, levelForXp, totalXp, xpForLevel } from './xp';

/** Local-time timestamp. Hours must be zero-padded or Date.parse rejects the string. */
const localAt = (date: string, hour: number): string => `${date}T${String(hour).padStart(2, '0')}:00:00`;

const run = (id: string, minutes: number, startedAt: string, distanceM = minutes * 200): Activity => ({
  id,
  athleteId: 'a',
  sport: 'running',
  title: 'Easy run',
  startedAt,
  startTimezone: 'UTC',
  elapsedSeconds: minutes * 60,
  movingSeconds: minutes * 60,
  distanceM,
  elevationGainM: 20,
  visibility: 'private',
  source: 'manual',
  likeCount: 0,
  commentCount: 0,
});

describe('activityXp', () => {
  it('grows sub-linearly with duration so junk volume cannot be farmed', () => {
    const oneHour = activityXp(run('a', 60, '2026-09-01T08:00:00Z'));
    const threeHours = activityXp(run('b', 180, '2026-09-01T08:00:00Z'));
    expect(threeHours).toBeGreaterThan(oneHour);
    // Three times the duration must be worth well under three times the XP.
    expect(threeHours).toBeLessThan(oneHour * 2.2);
  });

  it('awards nothing for a trivially short activity', () => {
    expect(activityXp(run('a', 2, '2026-09-01T08:00:00Z'))).toBe(0);
  });

  it('ignores sports outside the running family for now', () => {
    const cycling = { ...run('a', 60, '2026-09-01T08:00:00Z'), sport: 'cycling' as const };
    expect(activityXp(cycling)).toBe(0);
  });
});

describe('buildXpLedger', () => {
  it('caps a single day so splitting one run into many uploads gains nothing', () => {
    // Local-time timestamps: the cap groups by local day, so a UTC fixture
    // would straddle midnight on machines west of Greenwich.
    const split = Array.from({ length: 6 }, (_, i) => run(`s${i}`, 20, localAt('2026-09-01', 8 + i)));
    expect(totalXp(buildXpLedger(split, []))).toBeLessThanOrEqual(DAILY_ACTIVITY_XP_CAP);
  });

  it('applies the cap per day rather than globally', () => {
    const oneDay = Array.from({ length: 6 }, (_, i) => run(`a${i}`, 20, localAt('2026-09-01', 8 + i)));
    const twoDays = [
      ...Array.from({ length: 6 }, (_, i) => run(`b${i}`, 20, localAt('2026-09-01', 8 + i))),
      ...Array.from({ length: 6 }, (_, i) => run(`c${i}`, 20, localAt('2026-09-02', 8 + i))),
    ];
    expect(totalXp(buildXpLedger(twoDays, []))).toBe(totalXp(buildXpLedger(oneDay, [])) * 2);
  });

  it('awards records far more than volume, so meaningful behaviour dominates', () => {
    const record: PersonalRecord = {
      id: 'pr1',
      athleteId: 'a',
      sport: 'running',
      distanceM: 5000,
      elapsedSeconds: 1300,
      achievedAt: '2026-09-01T08:30:00Z',
      previousElapsedSeconds: 1350,
      isCurrent: true,
    };
    const withRecord = buildXpLedger([run('a', 45, '2026-09-01T08:00:00Z')], [record]);
    const withoutRecord = buildXpLedger([run('a', 45, '2026-09-01T08:00:00Z')], []);
    expect(totalXp(withRecord) - totalXp(withoutRecord)).toBe(250);
  });

  it('does not award XP for a first-ever effort with nothing to beat', () => {
    const firstEver: PersonalRecord = {
      id: 'pr1',
      athleteId: 'a',
      sport: 'running',
      distanceM: 5000,
      elapsedSeconds: 1300,
      achievedAt: '2026-09-01T08:30:00Z',
      isCurrent: true,
    };
    const ledger = buildXpLedger([], [firstEver]);
    expect(totalXp(ledger)).toBe(0);
  });

  it('is idempotent — replaying the same input cannot inflate a total', () => {
    const activities = [run('a', 45, '2026-09-01T08:00:00Z')];
    const once = totalXp(buildXpLedger(activities, []));
    const twice = totalXp(buildXpLedger([...activities, ...activities], []));
    expect(twice).toBe(once);
  });
});

describe('levelForXp', () => {
  it('starts everyone at level 1', () => {
    expect(levelForXp(0).level).toBe(1);
  });

  it('increases monotonically and reports progress within the level', () => {
    const low = levelForXp(500);
    const high = levelForXp(50000);
    expect(high.level).toBeGreaterThan(low.level);
    expect(low.progress).toBeGreaterThanOrEqual(0);
    expect(low.progress).toBeLessThanOrEqual(1);
  });

  it('makes later levels progressively more expensive', () => {
    const early = xpForLevel(3) - xpForLevel(2);
    const late = xpForLevel(21) - xpForLevel(20);
    expect(late).toBeGreaterThan(early * 2);
  });
});
