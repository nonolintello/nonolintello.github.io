import { describe, expect, it } from 'vitest';
import { generatePlanFromTemplate } from './planBuilder';
import { buildRoadmap, type RaceRoadmap } from './roadmap';
import { buildAthleteProfile } from './profile';
import { generateDemoDataset } from '../demo/dataset';
import type { Race } from '../domain/types';

const NOW = new Date('2026-09-10T18:00:00');
const race: Race = {
  id: 'race-x',
  athleteId: 'a',
  name: 'City Marathon',
  date: '2026-11-22',
  distanceM: 42195,
  goalSeconds: 3 * 3600,
  isGoalRace: true,
};

describe('plan template', () => {
  const { plan, workouts } = generatePlanFromTemplate({
    athleteId: 'a',
    coachId: 'c',
    name: 'Marathon build',
    startsOn: '2026-09-14',
    race,
    currentWeeklyM: 60000,
    longestRunM: 26000,
    now: NOW,
  });

  it('runs from the start week to race day and ends on the race', () => {
    expect(plan.startsOn).toBe('2026-09-14');
    expect(plan.endsOn).toBe(race.date);
    const last = workouts[workouts.length - 1];
    expect(last?.type).toBe('race');
    expect(last?.keyWorkout).toBe(true);
  });

  it('builds then tapers', () => {
    const weekly = new Map<string, number>();
    for (const w of workouts) {
      const monday = new Date(`${w.date}T00:00:00`);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const key = monday.toISOString().slice(0, 10);
      weekly.set(key, (weekly.get(key) ?? 0) + (w.targetDistanceM ?? 0));
    }
    const volumes = [...weekly.values()];
    const peak = Math.max(...volumes.slice(0, -1));
    expect(volumes[0]).toBeLessThan(peak);
    // The last full week before race week is well below the peak.
    expect(volumes[volumes.length - 2]).toBeLessThan(peak * 0.8);
  });

  it('marks a handful of key workouts, including the peak long run', () => {
    const keys = workouts.filter((w) => w.keyWorkout);
    expect(keys.length).toBeGreaterThanOrEqual(3);
    expect(keys.some((w) => w.title === 'Peak long run')).toBe(true);
    for (const w of workouts) expect(w.source).toBe('coach');
  });

  it('never lets the long run exceed the peak for the distance', () => {
    for (const w of workouts.filter((w) => w.type === 'long')) {
      expect(w.targetDistanceM).toBeLessThanOrEqual(34000);
    }
  });
});

describe('roadmap with a coach plan', () => {
  it('turns key workouts into checkpoints', () => {
    const dataset = generateDemoDataset(NOW);
    const mine = dataset.activities.filter((a) => a.athleteId === dataset.me.id);
    const profile = buildAthleteProfile(dataset.me, mine, dataset.goal, NOW, { races: dataset.races });
    const goalRace = dataset.races.find((r) => r.isGoalRace)!;
    const { workouts } = generatePlanFromTemplate({
      athleteId: dataset.me.id,
      coachId: 'c',
      name: 'Marathon build',
      startsOn: '2026-09-14',
      race: goalRace,
      currentWeeklyM: 70000,
      longestRunM: 30000,
      now: NOW,
    });
    const roadmap = buildRoadmap({
      profile,
      activities: mine,
      plan: workouts,
      races: dataset.races,
      block: dataset.block,
      events: dataset.events,
      now: NOW,
    }) as RaceRoadmap;
    const fromPlan = roadmap.checkpoints.filter((c) => c.plannedWorkoutId);
    expect(fromPlan.length).toBeGreaterThanOrEqual(3);
    expect(fromPlan.every((c) => c.status === 'upcoming')).toBe(true);
    // The template's peak long run replaces the synthesised one.
    expect(roadmap.checkpoints.some((c) => c.id === 'peak-long')).toBe(false);
  });
});
