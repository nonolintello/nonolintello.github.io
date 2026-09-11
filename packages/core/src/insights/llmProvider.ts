import type { Insight, InsightKind } from '../domain/types';
import { profileToPromptContext } from '../analytics/profile';
import type {
  ActivityInsightRequest,
  InsightProvider,
  QuestionRequest,
  WeeklyInsightRequest,
} from './port';
import { nextInsightId } from './port';
import { RuleBasedInsightProvider } from './ruleBased';

/**
 * Injected rather than importing an SDK, so @ai/core stays dependency-free and
 * the model call can live wherever it belongs — an edge function today, a
 * queue worker once generation moves off the request path.
 */
export type CompletionFn = (input: {
  system: string;
  user: string;
  maxTokens: number;
}) => Promise<string>;

const SYSTEM_PROMPT = `You are the analysis layer of an athlete intelligence platform.

You will receive a JSON object of already-computed metrics about one athlete. Every number has been derived by a deterministic analytics engine. Your job is to express what those numbers mean — never to recompute them, and never to introduce a figure that is not present in the input.

Rules:
- Each insight must be classified: "fact" (directly measured), "metric" (derived from measurements), "prediction" (extrapolated, uncertain), or "recommendation" (suggested action).
- Never present a prediction or a recommendation as a measured result.
- Cite the specific numbers you are reasoning from.
- Be concise and precise. Write for a serious athlete, not a beginner being encouraged.
- Avoid hype. If the data shows nothing notable, say so plainly.

Respond with JSON only: {"insights":[{"kind":"...","headline":"...","body":"...","confidence":0.0}]}`;

interface RawInsight {
  kind?: string;
  headline?: string;
  body?: string;
  confidence?: number;
}

const VALID_KINDS: readonly InsightKind[] = ['fact', 'metric', 'prediction', 'recommendation'];

const parseKind = (value: unknown): InsightKind =>
  typeof value === 'string' && (VALID_KINDS as readonly string[]).includes(value)
    ? (value as InsightKind)
    : 'metric';

/**
 * Language-model backed insights.
 *
 * Falls back to the rule-based provider whenever the model is unavailable or
 * returns something unparseable. Insight generation must never be able to block
 * or fail an activity from being saved.
 */
export class LlmInsightProvider implements InsightProvider {
  readonly name = 'llm';
  readonly version = '1.0.0';

  private readonly fallback = new RuleBasedInsightProvider();

  constructor(
    private readonly complete: CompletionFn,
    private readonly model = 'claude-sonnet-5',
  ) {}

  async generateActivityInsights(request: ActivityInsightRequest): Promise<Insight[]> {
    const { activity, profile } = request;
    const context = {
      scope: 'activity',
      activity: {
        title: activity.title,
        distanceM: activity.distanceM,
        movingSeconds: activity.movingSeconds,
        avgHeartRate: activity.avgHeartRate ?? null,
        avgCadenceSpm: activity.avgCadenceSpm ?? null,
        elevationGainM: activity.elevationGainM ?? null,
      },
      athlete: profileToPromptContext(profile),
    };

    return this.generate(context, request, 'activity', { activityId: activity.id });
  }

  async generateWeeklyInsights(request: WeeklyInsightRequest): Promise<Insight[]> {
    const context = { scope: 'week', athlete: profileToPromptContext(request.profile) };
    return this.generate(context, request, 'week', {
      periodStart: request.profile.currentWeek.weekStart,
    });
  }

  /**
   * The one place a model clearly beats intent matching: free-text questions
   * the rule-based provider can only answer generically.
   */
  async answerQuestion(request: QuestionRequest): Promise<Insight[]> {
    const context = {
      scope: 'question',
      question: request.question,
      athlete: profileToPromptContext(request.profile),
    };
    return this.generate(context, request, 'athlete', {});
  }

  private async generate(
    context: unknown,
    request: ActivityInsightRequest | WeeklyInsightRequest | QuestionRequest,
    scope: Insight['scope'],
    extra: Partial<Insight>,
  ): Promise<Insight[]> {
    const athleteId = request.profile.athlete.id;
    try {
      const raw = await this.complete({
        system: SYSTEM_PROMPT,
        user: JSON.stringify(context),
        maxTokens: 1024,
      });

      const parsed = JSON.parse(raw) as { insights?: RawInsight[] };
      const insights = (parsed.insights ?? [])
        .filter((i) => typeof i.headline === 'string' && typeof i.body === 'string')
        .map<Insight>((i) => ({
          id: nextInsightId(scope),
          athleteId,
          scope,
          kind: parseKind(i.kind),
          headline: i.headline as string,
          body: i.body as string,
          evidence: { source: 'llm', model: this.model },
          confidence: typeof i.confidence === 'number' ? i.confidence : undefined,
          generator: this.name,
          generatorVersion: this.version,
          createdAt: new Date().toISOString(),
          ...extra,
        }));

      if (insights.length === 0) throw new Error('model returned no usable insights');
      return insights;
    } catch {
      if (scope === 'activity') {
        return this.fallback.generateActivityInsights(request as ActivityInsightRequest);
      }
      if (scope === 'athlete') {
        return this.fallback.answerQuestion(request as QuestionRequest);
      }
      return this.fallback.generateWeeklyInsights(request);
    }
  }
}
