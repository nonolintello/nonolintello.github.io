import { describe, expect, it } from 'vitest';
import { buildAthleteProfile } from './profile';
import { buildRoadmap, type RaceRoadmap, type LevelRoadmap } from './roadmap';
import { generateDemoDataset } from '../demo/dataset';

const NOW = new Date('2026-09-10T18:00:00');
const dataset = generateDemoDataset(NOW);
const mine = dataset.activities.filter((a) => a.athleteId === dataset.me.id);
const profile = buildAthleteProfile(dataset.me, mine, dataset.goal, NOW, { races: dataset.races });

const base = {
  profile,
  activities: mine,
  plan: dataset.plan,
  block: dataset.block,
  events: dataset.events,
  now: NOW,
};

describe('race roadmap', () => {
  const roadmap = buildRoadmap({ ...base, races: dataset.races }) as RaceRoadmap;

  it('walks toward the goal race', () => {
    expect(roadmap.kind).toBe('race');
    expect(roadmap.race.id).toBe('race-philly-marathon');
    expect(roadmap.event?.course?.lat.length).toBeGreaterThan(10);
    expect(roadmap.position).toBeGreaterThan(0);
    expect(roadmap.position).toBeLessThan(1);
  });

  it('starts at the block and ends at the race, in order', () => {
    const first = roadmap.checkpoints[0];
    const last = roadmap.checkpoints[roadmap.checkpoints.length - 1];
    expect(first?.kind).toBe('start');
    expect(last?.kind).toBe('race');
    expect(last?.position).toBe(1);
    for (let i = 1; i < roadmap.checkpoints.length; i++) {
      expect(roadmap.checkpoints[i]!.position).toBeGreaterThanOrEqual(roadmap.checkpoints[i - 1]!.position);
    }
  });

  it('marks only past checkpoints as done and picks the next upcoming one', () => {
    for (const c of roadmap.checkpoints) {
      const past = new Date(`${c.date}T00:00:00`).getTime() < NOW.getTime();
      if (c.status === 'done' && c.kind !== 'fitness') expect(past).toBe(true);
      if (c.status === 'upcoming') expect(past).toBe(false);
    }
    expect(roadmap.next).not.toBeNull();
    expect(roadmap.next?.status).not.toBe('done');
    expect(roadmap.doneCount).toBeGreaterThan(1);
  });

  it('includes banked long runs, tune-up races, a taper and a fitness check', () => {
    const kinds = new Set(roadmap.checkpoints.map((c) => c.kind));
    expect(kinds.has('long_run')).toBe(true);
    expect(kinds.has('tune_up')).toBe(true);
    expect(kinds.has('taper')).toBe(true);
    expect(kinds.has('fitness')).toBe(true);
    const tuneUps = roadmap.checkpoints.filter((c) => c.kind === 'tune_up');
    expect(tuneUps.map((c) => c.raceId)).toContain('race-rothman-8k');
  });
});

describe('level roadmap', () => {
  const roadmap = buildRoadmap({ ...base, races: [] }) as LevelRoadmap;

  it('falls back to the level ladder without a race', () => {
    expect(roadmap.kind).toBe('level');
    expect(roadmap.level).toBe(profile.level.level);
    expect(roadmap.checkpoints.some((c) => c.status === 'current')).toBe(true);
    expect(roadmap.next?.kind).toBe('long_run');
    expect(roadmap.position).toBeGreaterThanOrEqual(0);
    expect(roadmap.position).toBeLessThanOrEqual(1);
  });
});
