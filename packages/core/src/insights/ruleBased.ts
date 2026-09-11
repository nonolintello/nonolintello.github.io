import type { Activity, Insight, InsightKind } from '../domain/types';
import { PR_DISTANCES_M, prDistanceLabel } from '../domain/types';
import {
  distanceIn,
  distanceLabel,
  elevationIn,
  elevationLabel,
  formatDuration,
  formatPace,
  paceSecondsPerUnit,
} from '../domain/units';
import type { AthleteProfile } from '../analytics/profile';
import { bestEffortForDistance, predictFromRecords } from '../analytics/bestEfforts';
import { aerobicEfficiency, cadenceStability, heartRateDecoupling, isHardSession } from '../analytics/efficiency';
import { mean, round } from '../analytics/stats';
import type {
  ActivityInsightRequest,
  InsightProvider,
  QuestionRequest,
  WeeklyInsightRequest,
} from './port';
import { nextInsightId } from './port';

const GENERATOR = 'rule-based';
const VERSION = '1.0.0';

interface Draft {
  kind: InsightKind;
  headline: string;
  body: string;
  evidence: Record<string, number | string | null>;
  confidence?: number;
}

const toInsight = (
  draft: Draft,
  athleteId: string,
  scope: Insight['scope'],
  extra: Partial<Insight> = {},
): Insight => ({
  id: nextInsightId(scope),
  athleteId,
  scope,
  kind: draft.kind,
  headline: draft.headline,
  body: draft.body,
  evidence: draft.evidence,
  confidence: draft.confidence,
  generator: GENERATOR,
  generatorVersion: VERSION,
  createdAt: new Date().toISOString(),
  ...extra,
});

/**
 * Deterministic insight generation from the structured athlete profile.
 *
 * Every statement it produces is derived from a computed metric and carries the
 * evidence that produced it. Nothing is asserted that the numbers do not
 * support, and anything extrapolated is emitted as `prediction` rather than
 * `fact` so the UI can label it honestly.
 */
export class RuleBasedInsightProvider implements InsightProvider {
  readonly name = GENERATOR;
  readonly version = VERSION;

  async generateActivityInsights({ activity, profile }: ActivityInsightRequest): Promise<Insight[]> {
    return this.activityDrafts(activity, profile).map((d) =>
      toInsight(d, profile.athlete.id, 'activity', { activityId: activity.id }),
    );
  }

  async generateWeeklyInsights({ profile }: WeeklyInsightRequest): Promise<Insight[]> {
    return this.weeklyDrafts(profile).map((d) =>
      toInsight(d, profile.athlete.id, 'week', { periodStart: profile.currentWeek.weekStart }),
    );
  }

  async answerQuestion({ question, profile }: QuestionRequest): Promise<Insight[]> {
    return this.questionDrafts(question, profile).map((d) =>
      toInsight(d, profile.athlete.id, 'athlete'),
    );
  }

  /**
   * Routes a question to the metrics that answer it.
   *
   * Intent matching rather than language understanding: each branch is a real
   * answer computed from the athlete's own data. When a model sits behind this
   * port it replaces the matching, not the analytics underneath.
   */
  private questionDrafts(question: string, profile: AthleteProfile): Draft[] {
    const q = question.toLowerCase();
    const unit = profile.athlete.unitPreference;
    const label = distanceLabel(unit);
    const { efficiency, trends, load, score } = profile;

    // "Am I getting fitter?"
    if (/fitter|fitness|improv|getting better|progress/.test(q)) {
      const signals: string[] = [];
      if (efficiency.direction === 'improving' && efficiency.changeRatio != null) {
        signals.push(
          `you are covering ${round(efficiency.changeRatio * 100, 1)}% more ground per heartbeat than a month ago`,
        );
      }
      const recentPrs = profile.records.filter(
        (r) => r.previousElapsedSeconds != null && Date.now() - new Date(r.achievedAt).getTime() < 84 * 86_400_000,
      ).length;
      if (recentPrs > 0) signals.push(`you have set ${recentPrs} personal record${recentPrs > 1 ? 's' : ''} in 12 weeks`);
      if (trends.volume.direction === 'up' && trends.volume.changeRatio != null) {
        signals.push(`weekly volume is up ${round(trends.volume.changeRatio * 100, 0)}%`);
      }
      // A flat trend is not evidence of improvement, only of maintenance.
      if (trends.pace.direction === 'down' && trends.pace.changeRatio != null) {
        signals.push(`average pace has improved ${round(Math.abs(trends.pace.changeRatio) * 100, 1)}%`);
      }

      const positive = signals.length >= 2;
      const joined = signals.join(', ');
      return [
        {
          kind: 'metric',
          headline: positive
            ? 'Yes — the aerobic markers are moving the right way'
            : signals.length === 1
              ? 'Partly — one clear signal, not yet a trend'
              : 'Holding steady rather than climbing',
          body: signals.length
            ? `${joined.charAt(0).toUpperCase()}${joined.slice(1)}. ${positive ? 'Two or more independent signals moving together is the strongest evidence available short of racing.' : 'One signal on its own can be noise — look for a second before drawing conclusions.'}`
            : `Your efficiency, pace and volume trends are all flat against the previous month. That is maintenance, not decline — and after ${profile.streakWeeks} weeks of consistency, a plateau usually means the current stimulus has become comfortable.`,
          evidence: {
            efficiencyChange: efficiency.changeRatio,
            volumeChange: trends.volume.changeRatio,
            paceChange: trends.pace.changeRatio,
            recentPrs,
          },
          confidence: positive ? 0.8 : 0.6,
        },
      ];
    }

    // "Why have my runs felt harder this week?"
    if (/harder|tired|fatigue|heav|slugg|struggl|tough|why.*hard/.test(q)) {
      const causes: string[] = [];
      if (load.ratio != null && load.ratio > 1.3) {
        causes.push(
          `your last seven days carry ${round(load.ratio, 2)}× your 28-day baseline load`,
        );
      }
      if (profile.currentWeek.hardSessionCount >= 2) {
        causes.push(`${profile.currentWeek.hardSessionCount} quality sessions already this week`);
      }
      if (
        profile.currentWeek.elevationGainM > profile.previousWeek.elevationGainM * 1.4 &&
        profile.currentWeek.elevationGainM > 200
      ) {
        causes.push(
          `${Math.round(elevationIn(profile.currentWeek.elevationGainM, unit)).toLocaleString()} ${elevationLabel(unit)} of climbing against ${Math.round(elevationIn(profile.previousWeek.elevationGainM, unit)).toLocaleString()} last week`,
        );
      }
      if (
        profile.currentWeek.avgHeartRate != null &&
        profile.previousWeek.avgHeartRate != null &&
        profile.currentWeek.avgHeartRate > profile.previousWeek.avgHeartRate + 3
      ) {
        causes.push(
          `average heart rate is ${Math.round(profile.currentWeek.avgHeartRate - profile.previousWeek.avgHeartRate)} bpm higher than last week`,
        );
      }

      return [
        {
          kind: causes.length ? 'metric' : 'fact',
          headline: causes.length
            ? 'Your load is ahead of what you have adapted to'
            : 'Nothing in the data explains it',
          body: causes.length
            ? `${causes.length === 1 ? 'One thing stands out' : `${causes.length === 2 ? 'Two' : 'Three'} things stand out`}: ${causes.join('; ')}. Effort feeling high is the expected response — it usually resolves within a few easy days.`
            : `Load, intensity mix, climbing and heart rate are all in line with your recent weeks. When training data looks normal and running still feels hard, the cause is usually outside it — sleep, stress, fuelling or illness — none of which this app can see yet.`,
          evidence: {
            loadRatio: load.ratio,
            loadStatus: load.status,
            hardSessions: profile.currentWeek.hardSessionCount,
            avgHrThisWeek: profile.currentWeek.avgHeartRate,
            avgHrLastWeek: profile.previousWeek.avgHeartRate,
          },
          confidence: causes.length ? 0.75 : 0.5,
        },
      ];
    }

    // "What should I run tomorrow?"
    if (/tomorrow|next run|what should i|what do i (run|do)/.test(q)) {
      const overreaching = load.status === 'overreaching';
      const recentHard = profile.recentActivities
        .filter((a) => Date.now() - new Date(a.startedAt).getTime() < 3 * 86_400_000)
        .filter(isHardSession).length;

      const recommendation = overreaching
        ? 'An easy 30–40 minutes, or a full rest day'
        : recentHard > 0
          ? `An easy aerobic run, ${round(distanceIn(profile.currentWeek.distanceM, unit) / 4, 0)}–${round(distanceIn(profile.currentWeek.distanceM, unit) / 3, 0)} ${label}`
          : profile.currentWeek.hardSessionCount === 0
            ? 'A quality session — tempo or intervals'
            : 'A steady aerobic run';

      return [
        {
          kind: 'recommendation',
          headline: recommendation,
          body: overreaching
            ? `Your seven-day load sits at ${round(load.ratio ?? 0, 2)}× your baseline. The adaptation from the last block happens during the easy days, not the hard ones.`
            : recentHard > 0
              ? `You completed a quality session within the last three days. Easy running now consolidates that work rather than competing with it.`
              : profile.currentWeek.hardSessionCount === 0
                ? `You have run ${profile.currentWeek.activityCount} times this week, all aerobic, and your load is ${load.status}. There is room for one hard session.`
                : `Your intensity mix is already balanced this week. Aerobic volume is the useful addition.`,
          evidence: {
            loadRatio: load.ratio,
            loadStatus: load.status,
            hardSessionsThisWeek: profile.currentWeek.hardSessionCount,
            hardSessionsLast3Days: recentHard,
          },
          confidence: 0.7,
        },
      ];
    }

    // "What's my biggest weakness?"
    if (/weak|worst|opportunit|focus on|improve most|limiter/.test(q)) {
      const dims = [
        { key: 'Speed', c: score.speed, advice: 'One structured session a week — intervals or a sustained tempo — moves this fastest.' },
        { key: 'Endurance', c: score.endurance, advice: 'Extend your longest run by about 10% a week, keeping everything else easy.' },
        { key: 'Consistency', c: score.consistency, advice: 'Three shorter runs beat one long one here. Frequency drives this more than volume.' },
        { key: 'Climbing', c: score.climbing, advice: 'Routing one weekly run over rolling terrain shifts this without adding training stress.' },
      ].sort((a, b) => a.c.value - b.c.value);

      const weakest = dims[0] as (typeof dims)[number];
      const strongest = dims[dims.length - 1] as (typeof dims)[number];

      return [
        {
          kind: 'recommendation',
          headline: `${weakest.key} — ${Math.round(weakest.c.value)} against ${Math.round(strongest.c.value)} for ${strongest.key.toLowerCase()}`,
          body: `${weakest.c.explanation} ${weakest.advice}`,
          evidence: {
            weakest: weakest.key,
            weakestValue: weakest.c.value,
            strongest: strongest.key,
            strongestValue: strongest.c.value,
          },
          confidence: 0.7,
        },
      ];
    }

    // "How does this month compare to last month?"
    if (/compare|last month|this month|versus|vs\b/.test(q)) {
      const weeks = profile.trailingWeeks;
      const recent = weeks.slice(-5, -1);
      const previous = weeks.slice(-9, -5);
      const sumOf = (ws: typeof weeks, pick: (w: (typeof weeks)[number]) => number) =>
        ws.reduce((a, w) => a + pick(w), 0);

      const recentKm = sumOf(recent, (w) => w.distanceM);
      const previousKm = sumOf(previous, (w) => w.distanceM);
      const recentRuns = sumOf(recent, (w) => w.activityCount);
      const previousRuns = sumOf(previous, (w) => w.activityCount);
      const change = previousKm > 0 ? (recentKm - previousKm) / previousKm : null;

      return [
        {
          kind: 'metric',
          headline:
            change == null
              ? 'Not enough history to compare'
              : `${change >= 0 ? 'Up' : 'Down'} ${round(Math.abs(change) * 100, 0)}% on distance`,
          body: `The last four complete weeks: ${round(distanceIn(recentKm, unit), 1)} ${label} across ${recentRuns} runs. The four before that: ${round(distanceIn(previousKm, unit), 1)} ${label} across ${previousRuns} runs. ${
            change != null && Math.abs(change) < 0.08
              ? 'Essentially flat — consistent block-to-block volume.'
              : change != null && change > 0
                ? 'A genuine step up in training load.'
                : 'A lighter block, whether planned or not.'
          }`,
          evidence: { recentDistanceM: recentKm, previousDistanceM: previousKm, recentRuns, previousRuns, change },
        },
      ];
    }

    // "Am I ready to race?"
    if (/ready|race|sub[- ]?\d|break \d|goal time|pb|pr\b/.test(q)) {
      const raced = new Set(profile.records.map((r) => r.distanceM));
      const target = PR_DISTANCES_M.find((d) => !raced.has(d)) ?? 5000;
      const prediction = predictFromRecords(profile.records, target, { excludeSameDistance: true });

      if (!prediction) {
        return [
          {
            kind: 'fact',
            headline: 'No race-distance efforts to project from yet',
            body: 'Once you have a hard effort over a standard distance, projections for the others become possible.',
            evidence: { recordCount: profile.records.length },
          },
        ];
      }

      return [
        {
          kind: 'prediction',
          headline: `${prDistanceLabel(target)} in roughly ${formatDuration(prediction.predictedSeconds)}`,
          body: `Projected from your ${prDistanceLabel(prediction.basedOnDistanceM)} best of ${formatDuration(prediction.basedOnSeconds)}. Your endurance score is ${Math.round(score.endurance.value)} and load is ${load.status}, which supports the estimate — but it assumes race-day effort and specific preparation. It is a projection, not a result.`,
          evidence: {
            targetDistanceM: target,
            predictedSeconds: round(prediction.predictedSeconds, 0),
            basedOnDistanceM: prediction.basedOnDistanceM,
            enduranceScore: score.endurance.value,
          },
          confidence: prediction.confidence,
        },
      ];
    }

    // Unmatched: say so plainly, and answer the question actually asked of the data.
    return [
      {
        kind: 'fact',
        headline: 'I can only answer from your training data so far',
        body: `Here is where you stand: athlete score ${Math.round(score.overall)}, ${round(distanceIn(profile.currentWeek.distanceM, unit), 1)} ${label} this week across ${profile.currentWeek.activityCount} runs, load ${load.status}, and a ${profile.streakWeeks}-week streak. Try one of the suggested questions for something more specific.`,
        evidence: {
          overallScore: score.overall,
          weekDistanceM: profile.currentWeek.distanceM,
          loadStatus: load.status,
        },
      },
    ];
  }

  private activityDrafts(activity: Activity, profile: AthleteProfile): Draft[] {
    const unit = profile.athlete.unitPreference;
    const drafts: Draft[] = [];

    const pace = paceSecondsPerUnit(activity.distanceM, activity.movingSeconds, unit);
    const label = distanceLabel(unit);

    // How this run's pace compares to the athlete's recent norm.
    const comparable = profile.recentActivities.filter(
      (a) => a.id !== activity.id && a.movingSeconds > 600,
    );
    const baselinePace = mean(
      comparable
        .map((a) => paceSecondsPerUnit(a.distanceM, a.movingSeconds, unit))
        .filter((p): p is number => p != null),
    );

    if (pace != null && baselinePace != null) {
      const delta = baselinePace - pace;
      const ef = aerobicEfficiency(activity);
      const baselineEf = mean(
        comparable.map(aerobicEfficiency).filter((e): e is number => e != null),
      );

      if (Math.abs(delta) >= 4) {
        const faster = delta > 0;
        // The strongest available statement: faster at equal or lower HR.
        const efficiencyGain =
          ef != null && baselineEf != null && ef > baselineEf * 1.02 && faster;

        // Past a minute, "129s" stops being readable as a pace difference.
        const deltaLabel =
          Math.abs(delta) >= 60
            ? formatDuration(Math.abs(delta))
            : `${Math.round(Math.abs(delta))}s`;

        drafts.push({
          kind: efficiencyGain ? 'metric' : 'fact',
          headline: `${deltaLabel} per ${label} ${faster ? 'faster' : 'slower'} than your recent average`,
          body: efficiencyGain
            ? `You held ${formatPace(pace)}/${label} at an average of ${activity.avgHeartRate} bpm. That is faster than your recent average pace at a comparable heart rate, which points to improving aerobic efficiency rather than simply a harder effort.`
            : faster
              ? `You averaged ${formatPace(pace)}/${label} against a recent average of ${formatPace(baselinePace)}/${label}.`
              : `You averaged ${formatPace(pace)}/${label}, slower than your recent average of ${formatPace(baselinePace)}/${label} — consistent with an easy or recovery session.`,
          evidence: {
            pace: round(pace, 1),
            baselinePace: round(baselinePace, 1),
            deltaSeconds: round(delta, 1),
            efficiency: ef != null ? round(ef, 3) : null,
            baselineEfficiency: baselineEf != null ? round(baselineEf, 3) : null,
          },
        });
      }
    }

    // Cardiac drift vs. cadence: separates fatigue from a pacing decision.
    if (activity.stream) {
      const decoupling = heartRateDecoupling(activity.stream);
      const cadence = cadenceStability(activity.stream);

      if (decoupling?.significant) {
        const drifted = decoupling.driftPercent < 0;
        drafts.push({
          kind: 'metric',
          headline: drifted
            ? 'Heart rate drifted upward in the second half'
            : 'You held or improved efficiency through the second half',
          body: drifted
            ? cadence?.stable
              ? `Your pace-per-heartbeat fell ${Math.abs(round(decoupling.driftPercent, 1))}% between the first and second half, while cadence stayed within ${round(cadence.variationPercent, 1)}% of ${Math.round(cadence.averageSpm)} spm. Stable cadence alongside rising heart rate suggests aerobic fatigue rather than form breaking down.`
              : `Your pace-per-heartbeat fell ${Math.abs(round(decoupling.driftPercent, 1))}% between halves${cadence ? `, and cadence varied by ${round(cadence.variationPercent, 1)}%` : ''}. Both moving together points to accumulated fatigue affecting your mechanics.`
            : `Your pace-per-heartbeat improved ${round(decoupling.driftPercent, 1)}% from the first half to the second — a well-executed negative split.`,
          evidence: {
            driftPercent: round(decoupling.driftPercent, 2),
            firstHalfEfficiency: round(decoupling.firstHalfEf, 3),
            secondHalfEfficiency: round(decoupling.secondHalfEf, 3),
            cadenceVariation: cadence ? round(cadence.variationPercent, 2) : null,
          },
        });
      }

      // Any standard-distance record set inside this activity.
      for (const record of profile.records) {
        if (record.activityId !== activity.id) continue;
        const effort = bestEffortForDistance(activity.stream, record.distanceM);
        if (!effort) continue;
        const improvement =
          record.previousElapsedSeconds != null
            ? record.previousElapsedSeconds - record.elapsedSeconds
            : null;
        drafts.push({
          kind: 'fact',
          headline: `New ${prDistanceLabel(record.distanceM)} personal record`,
          body:
            improvement != null
              ? `You covered ${prDistanceLabel(record.distanceM)} in ${formatDuration(record.elapsedSeconds)} during this run — ${Math.round(improvement)} seconds faster than your previous best.`
              : `You covered ${prDistanceLabel(record.distanceM)} in ${formatDuration(record.elapsedSeconds)} during this run, your first recorded effort at this distance.`,
          evidence: {
            distanceM: record.distanceM,
            seconds: round(record.elapsedSeconds, 1),
            previousSeconds: record.previousElapsedSeconds ?? null,
          },
        });
      }
    }

    // Where the session sits in the current block, and what should follow.
    const recentHard = profile.recentActivities
      .filter((a) => new Date(a.startedAt).getTime() > Date.now() - 7 * 86_400_000)
      .filter(isHardSession).length;

    if (recentHard >= 3) {
      drafts.push({
        kind: 'recommendation',
        headline: 'Consider an easy aerobic session next',
        body: `You have completed ${recentHard} quality sessions in the last seven days. A comfortable aerobic run would let the adaptations from that work consolidate before the next hard effort.`,
        evidence: { hardSessionsLast7Days: recentHard, loadRatio: profile.load.ratio },
        confidence: 0.7,
      });
    } else if (profile.load.status === 'overreaching') {
      drafts.push({
        kind: 'recommendation',
        headline: 'Your recent load is well above your baseline',
        body: `Your seven-day training load is ${round(profile.load.ratio ?? 0, 2)}× your 28-day baseline. Ratios sustained above 1.5 are associated with elevated injury risk — an easier few days would bring this back into a productive range.`,
        evidence: { acute: round(profile.load.acute, 1), chronic: round(profile.load.chronic, 1), ratio: profile.load.ratio },
        confidence: 0.75,
      });
    }

    // Every activity opens with what actually happened, before any
    // interpretation of it — the analysis should never lead with a conclusion.
    const descriptor = isHardSession(activity)
      ? 'A quality session'
      : activity.distanceM >= 18000
        ? 'A long aerobic effort'
        : 'A steady aerobic session';

    drafts.unshift({
      kind: 'fact',
      headline: `${round(distanceIn(activity.distanceM, unit), 2)} ${label} in ${formatDuration(activity.movingSeconds)}`,
      body: `${descriptor}${pace ? ` averaging ${formatPace(pace)}/${label}` : ''}${activity.avgHeartRate ? ` at ${activity.avgHeartRate} bpm` : ''}${activity.elevationGainM ? `, climbing ${Math.round(elevationIn(activity.elevationGainM, unit)).toLocaleString()} ${elevationLabel(unit)}` : ''}.`,
      evidence: {
        distanceM: activity.distanceM,
        movingSeconds: activity.movingSeconds,
        avgHeartRate: activity.avgHeartRate ?? null,
        elevationGainM: activity.elevationGainM ?? null,
      },
    });

    return drafts;
  }

  private weeklyDrafts(profile: AthleteProfile): Draft[] {
    const drafts: Draft[] = [];
    const unit = profile.athlete.unitPreference;
    const label = distanceLabel(unit);
    const { currentWeek, previousWeek, trends, efficiency } = profile;

    if (efficiency.direction === 'improving' && efficiency.changeRatio != null) {
      drafts.push({
        kind: 'metric',
        headline: 'You are running faster at the same heart rate',
        body: `Across your last ${efficiency.sampleCount} steady runs, pace-per-heartbeat is up ${round(efficiency.changeRatio * 100, 1)}% against the previous four weeks. This is the clearest single indicator that your aerobic base is developing.`,
        evidence: {
          changeRatio: round(efficiency.changeRatio, 4),
          current: efficiency.current != null ? round(efficiency.current, 3) : null,
          baseline: efficiency.baseline != null ? round(efficiency.baseline, 3) : null,
          sampleCount: efficiency.sampleCount,
        },
      });
    }

    if (trends.volume.changeRatio != null && Math.abs(trends.volume.changeRatio) > 0.08) {
      const up = trends.volume.changeRatio > 0;
      const pct = round(Math.abs(trends.volume.changeRatio) * 100, 0);
      drafts.push({
        kind: 'metric',
        headline: up
          ? `Weekly volume is up ${pct}% over four weeks`
          : `Weekly volume is down ${pct}% over four weeks`,
        body: up
          ? `You are averaging ${round(distanceIn(trends.volume.current ?? 0, unit), 1)} ${label} per week, against ${round(distanceIn(trends.volume.baseline ?? 0, unit), 1)} ${label} previously. ${trends.volume.changeRatio > 0.3 ? 'That is a steep ramp — watch for accumulating fatigue.' : 'That is a healthy rate of progression.'}`
          : `You are averaging ${round(distanceIn(trends.volume.current ?? 0, unit), 1)} ${label} per week, down from ${round(distanceIn(trends.volume.baseline ?? 0, unit), 1)} ${label}. If this was not a planned down block, consistency is the fastest thing to recover.`,
        evidence: {
          currentWeeklyM: trends.volume.current,
          baselineWeeklyM: trends.volume.baseline,
          changeRatio: round(trends.volume.changeRatio, 4),
        },
      });
    }

    if (profile.streakWeeks >= 3) {
      drafts.push({
        kind: 'fact',
        headline: `${profile.streakWeeks} consecutive weeks of training`,
        body: `You have run at least once a week for ${profile.streakWeeks} weeks running. Consistency at this length is what moves the aerobic markers that shorter blocks cannot.`,
        evidence: { streakWeeks: profile.streakWeeks, streakDays: profile.streakDays },
      });
    }

    // Race prediction, always explicitly labelled as a prediction.
    //
    // Targets a distance the athlete has not raced where possible: projecting a
    // 5K from their own 5K record only restates the record back to them.
    if (profile.records.length > 0) {
      const raced = new Set(profile.records.map((r) => r.distanceM));
      const target = PR_DISTANCES_M.find((d) => !raced.has(d)) ?? 5000;
      const prediction = predictFromRecords(profile.records, target, {
        excludeSameDistance: true,
      });

      if (prediction) {
        drafts.push({
          kind: 'prediction',
          headline: `Estimated ${prDistanceLabel(target).toLowerCase()} potential: ${formatDuration(prediction.predictedSeconds)}`,
          body: `Extrapolated from your ${prDistanceLabel(prediction.basedOnDistanceM)} best of ${formatDuration(prediction.basedOnSeconds)} using an endurance model. It assumes race-day effort and specific preparation for the distance — a projection, not a measured result.`,
          evidence: {
            targetDistanceM: target,
            predictedSeconds: round(prediction.predictedSeconds, 0),
            basedOnDistanceM: prediction.basedOnDistanceM,
            basedOnSeconds: round(prediction.basedOnSeconds, 0),
          },
          confidence: prediction.confidence,
        });
      }
    }

    if (profile.goal && !profile.goal.isComplete && profile.goal.daysRemaining > 0) {
      const g = profile.goal;
      drafts.push({
        kind: 'recommendation',
        headline: g.onTrack ? 'On track for your weekly goal' : 'Behind pace for your weekly goal',
        body: g.onTrack
          ? `You are at ${Math.round(g.percentComplete)}% with ${g.daysRemaining} day${g.daysRemaining === 1 ? '' : 's'} left. Maintaining your current rate finishes this comfortably.`
          : `You are at ${Math.round(g.percentComplete)}% with ${g.daysRemaining} day${g.daysRemaining === 1 ? '' : 's'} remaining, which needs ${round(distanceIn(g.requiredDailyRate, unit), 1)} ${label} per day to close. Consider whether the goal or the schedule should flex.`,
        evidence: {
          percentComplete: round(g.percentComplete, 1),
          daysRemaining: g.daysRemaining,
          requiredDailyRate: round(g.requiredDailyRate, 1),
        },
        confidence: 0.8,
      });
    }

    // Weakest dimension, framed as the highest-leverage thing to work on.
    const dims = [
      { key: 'speed', c: profile.score.speed },
      { key: 'endurance', c: profile.score.endurance },
      { key: 'consistency', c: profile.score.consistency },
      { key: 'climbing', c: profile.score.climbing },
    ].sort((a, b) => a.c.value - b.c.value);
    const weakest = dims[0];

    if (weakest && profile.score.hasSufficientData) {
      const guidance: Record<string, string> = {
        speed:
          'Adding one structured session a week — intervals or a sustained tempo — is the most direct way to move this.',
        endurance:
          'Extending your longest run by roughly 10% a week is the standard route, provided the rest of the week stays easy.',
        consistency:
          'Three shorter runs beat one long one here. Frequency drives this dimension more than volume.',
        climbing:
          'Routing even one weekly run over rolling terrain will shift this without adding training stress.',
      };
      drafts.push({
        kind: 'recommendation',
        headline: `${weakest.key.charAt(0).toUpperCase()}${weakest.key.slice(1)} is your biggest opportunity`,
        body: `${weakest.c.explanation} ${guidance[weakest.key] ?? ''}`.trim(),
        evidence: { dimension: weakest.key, value: weakest.c.value },
        confidence: 0.65,
      });
    }

    if (drafts.length === 0) {
      drafts.push({
        kind: 'fact',
        headline: 'Week in progress',
        body: `${currentWeek.activityCount} run${currentWeek.activityCount === 1 ? '' : 's'} so far this week against ${previousWeek.activityCount} last week.`,
        evidence: {
          thisWeekCount: currentWeek.activityCount,
          lastWeekCount: previousWeek.activityCount,
        },
      });
    }

    return drafts;
  }
}
