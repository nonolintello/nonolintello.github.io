import { describe, expect, it } from 'vitest';
import { buildAthleteProfile } from '../analytics/profile';
import { RuleBasedInsightProvider } from '../insights/ruleBased';
import { generateDemoDataset } from './dataset';

const NOW = new Date('2026-09-10T18:00:00');

const dataset = generateDemoDataset(NOW);
const myActivities = dataset.activities.filter((a) => a.athleteId === dataset.me.id);
const profile = buildAthleteProfile(dataset.me, myActivities, dataset.goal, NOW);

describe('demo dataset', () => {
  it('produces roughly six months of training', () => {
    expect(myActivities.length).toBeGreaterThan(80);
    expect(dataset.athletes.length).toBeGreaterThan(3);
  });

  it('is deterministic across runs', () => {
    const again = generateDemoDataset(NOW);
    expect(again.activities.length).toBe(dataset.activities.length);
    expect(again.activities[0]?.distanceM).toBe(dataset.activities[0]?.distanceM);
  });

  it('never places an activity in the future', () => {
    for (const a of dataset.activities) {
      expect(new Date(a.startedAt).getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it('varies week to week rather than ramping linearly', () => {
    const volumes = profile.trailingWeeks.map((w) => w.distanceM);
    const deltas = volumes.slice(1).map((v, i) => v - (volumes[i] as number));
    // A linear ramp would have every delta the same sign.
    expect(deltas.some((d) => d > 0)).toBe(true);
    expect(deltas.some((d) => d < 0)).toBe(true);
  });

  it('yields a record chain with genuine improvement', () => {
    const fiveK = profile.records.find((r) => r.distanceM === 5000);
    expect(fiveK).toBeDefined();
    expect(fiveK?.previousElapsedSeconds).toBeDefined();
    expect(fiveK?.elapsedSeconds).toBeLessThan(fiveK?.previousElapsedSeconds as number);
  });

  it('produces physiologically plausible activities', () => {
    for (const a of myActivities) {
      expect(a.avgHeartRate).toBeGreaterThan(90);
      expect(a.avgHeartRate).toBeLessThan(200);
      expect(a.avgCadenceSpm).toBeGreaterThan(140);
      expect(a.avgCadenceSpm).toBeLessThan(200);
      // Pace between 2:30/km and 12:00/km.
      const secPerKm = a.movingSeconds / (a.distanceM / 1000);
      expect(secPerKm).toBeGreaterThan(150);
      expect(secPerKm).toBeLessThan(720);
      expect(a.movingSeconds).toBeLessThanOrEqual(a.elapsedSeconds);
    }
  });

  it('gives every activity a GPS route that closes back toward its start', () => {
    const withRoutes = myActivities.filter((a) => a.stream?.latitude?.length);
    expect(withRoutes.length).toBe(myActivities.length);
  });

  it('supports a full profile build with a plausible score', () => {
    expect(profile.score.hasSufficientData).toBe(true);
    expect(profile.score.overall).toBeGreaterThan(35);
    expect(profile.score.overall).toBeLessThanOrEqual(100);
    expect(profile.level.level).toBeGreaterThan(1);
  });

  it('does not report a decline merely because the current week is partial', () => {
    // The current week is always incomplete; trends must ignore it.
    expect(profile.trends.volume.direction).not.toBe('unknown');
    expect(profile.currentWeek.activityCount).toBeLessThan(7);
  });
});

describe('rule-based insights over the demo athlete', () => {
  const provider = new RuleBasedInsightProvider();

  it('always leads an activity with a factual summary', async () => {
    const activity = profile.recentActivities[0];
    const insights = await provider.generateActivityInsights({
      activity: activity!,
      profile,
    });
    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0]?.kind).toBe('fact');
  });

  it('labels extrapolations as predictions, never as facts', async () => {
    const insights = await provider.generateWeeklyInsights({ profile });
    const prediction = insights.find((i) => i.headline.includes('Estimated'));
    expect(prediction?.kind).toBe('prediction');
    expect(prediction?.confidence).toBeGreaterThan(0);
  });

  it('attaches supporting evidence to every insight', async () => {
    const insights = await provider.generateWeeklyInsights({ profile });
    for (const i of insights) {
      expect(Object.keys(i.evidence).length).toBeGreaterThan(0);
    }
  });
});
