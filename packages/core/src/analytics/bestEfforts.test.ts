import { describe, expect, it } from 'vitest';
import type { Activity, ActivityStream } from '../domain/types';
import { bestEffortForDistance, detectPersonalRecords, predictRaceTime } from './bestEfforts';

/** Constant-speed stream, one sample per `intervalS`. */
const steadyStream = (totalM: number, speedMps: number, intervalS = 5): ActivityStream => {
  const timeOffsetS: number[] = [];
  const distanceM: number[] = [];
  for (let t = 0, d = 0; d <= totalM; t += intervalS, d = speedMps * t) {
    timeOffsetS.push(t);
    distanceM.push(Math.min(d, totalM));
    if (d >= totalM) break;
  }
  return { timeOffsetS, distanceM };
};

const activity = (id: string, startedAt: string, stream: ActivityStream): Activity => {
  const total = stream.distanceM[stream.distanceM.length - 1] as number;
  const seconds = stream.timeOffsetS[stream.timeOffsetS.length - 1] as number;
  return {
    id,
    athleteId: 'a1',
    sport: 'running',
    title: 'Test run',
    startedAt,
    startTimezone: 'UTC',
    elapsedSeconds: seconds,
    movingSeconds: seconds,
    distanceM: total,
    visibility: 'private',
    source: 'manual',
    stream,
    likeCount: 0,
    commentCount: 0,
  };
};

describe('bestEffortForDistance', () => {
  it('finds the time for a steady effort within a tolerance of one sample', () => {
    // 5 m/s over 10 km; a 5K should take 1000s.
    const effort = bestEffortForDistance(steadyStream(10000, 5), 5000);
    expect(effort).not.toBeNull();
    expect(effort?.elapsedSeconds).toBeCloseTo(1000, 0);
  });

  it('returns null when the activity is shorter than the target distance', () => {
    expect(bestEffortForDistance(steadyStream(3000, 4), 5000)).toBeNull();
  });

  it('finds a fast segment in the middle rather than measuring from the start line', () => {
    // 2 km slow, then 5 km fast, then 2 km slow.
    const timeOffsetS: number[] = [];
    const distanceM: number[] = [];
    let t = 0;
    let d = 0;
    const push = (speed: number, metres: number) => {
      const end = d + metres;
      while (d < end) {
        timeOffsetS.push(t);
        distanceM.push(d);
        d += speed * 5;
        t += 5;
      }
    };
    push(3, 2000);
    push(5, 5000);
    push(3, 2000);
    timeOffsetS.push(t);
    distanceM.push(d);

    const effort = bestEffortForDistance({ timeOffsetS, distanceM }, 5000);
    // The fast block covers 5 km at 5 m/s = 1000s. Measuring from the start
    // would give roughly 1567s instead.
    expect(effort?.elapsedSeconds).toBeLessThan(1050);
    expect(effort?.elapsedSeconds).toBeGreaterThan(950);
  });

  it('interpolates rather than snapping to sample boundaries', () => {
    // Coarse 30s samples: snapping would cost up to 30s of accuracy.
    const effort = bestEffortForDistance(steadyStream(6000, 5, 30), 5000);
    expect(effort?.elapsedSeconds).toBeCloseTo(1000, 0);
  });
});

describe('detectPersonalRecords', () => {
  it('chains each record to the one it beat', () => {
    const records = detectPersonalRecords(
      [
        activity('a', '2026-01-01T08:00:00Z', steadyStream(6000, 4.0)),
        activity('b', '2026-02-01T08:00:00Z', steadyStream(6000, 4.4)),
      ],
      [5000],
    );

    expect(records).toHaveLength(2);
    expect(records[0]?.previousElapsedSeconds).toBeUndefined();
    expect(records[1]?.previousElapsedSeconds).toBeCloseTo(1250, 0);
    expect(records[1]?.elapsedSeconds).toBeLessThan(records[0]?.elapsedSeconds as number);
  });

  it('does not record a slower effort as a new best', () => {
    const records = detectPersonalRecords(
      [
        activity('a', '2026-01-01T08:00:00Z', steadyStream(6000, 4.4)),
        activity('b', '2026-02-01T08:00:00Z', steadyStream(6000, 4.0)),
      ],
      [5000],
    );
    expect(records).toHaveLength(1);
    expect(records[0]?.activityId).toBe('a');
  });

  it('places a back-filled import in its correct chronological position', () => {
    // The February upload happens last but describes a January run.
    const records = detectPersonalRecords(
      [
        activity('later-upload', '2026-01-01T08:00:00Z', steadyStream(6000, 4.6)),
        activity('earlier', '2026-02-01T08:00:00Z', steadyStream(6000, 4.2)),
      ],
      [5000],
    );
    // The January run is the fastest, so it stands as the only record and the
    // February run must not appear to be a breakthrough.
    expect(records).toHaveLength(1);
    expect(records[0]?.activityId).toBe('later-upload');
  });
});

describe('predictRaceTime', () => {
  it('predicts a slower pace over a longer distance', () => {
    // 20:00 5K projected to 10K should land near 41:40, not 40:00.
    const p = predictRaceTime(5000, 1200, 10000);
    expect(p.predictedSeconds).toBeGreaterThan(2400);
    expect(p.predictedSeconds).toBeLessThan(2560);
  });

  it('loses confidence as the extrapolation stretches', () => {
    const near = predictRaceTime(5000, 1200, 10000);
    const far = predictRaceTime(5000, 1200, 42195);
    expect(far.confidence).toBeLessThan(near.confidence);
  });
});
