import type { Activity, Insight } from '../domain/types';
import type { AthleteProfile } from '../analytics/profile';

export interface ActivityInsightRequest {
  activity: Activity;
  profile: AthleteProfile;
}

export interface WeeklyInsightRequest {
  profile: AthleteProfile;
}

export interface QuestionRequest {
  question: string;
  profile: AthleteProfile;
}

/**
 * The questions Intelligence offers up front. Chosen because each one is
 * answerable from computed metrics alone — the athlete gets a real answer
 * today, and the same question routes to a language model later without the
 * surface changing.
 */
export const SUGGESTED_QUESTIONS: readonly string[] = [
  'Am I getting fitter?',
  'Why have my runs felt harder this week?',
  'What should I run tomorrow?',
  "What's my biggest weakness?",
  'How does this month compare to last month?',
  'Am I ready to race?',
];

/**
 * The seam between the athlete data layer and whatever generates prose.
 *
 * Both implementations receive the same structured AthleteProfile — never raw
 * activity rows. That constraint is the whole point: the analytics engine is
 * the defensible asset, and a language model is one interchangeable renderer of
 * what it already knows.
 */
export interface InsightProvider {
  readonly name: string;
  readonly version: string;
  generateActivityInsights(request: ActivityInsightRequest): Promise<Insight[]>;
  generateWeeklyInsights(request: WeeklyInsightRequest): Promise<Insight[]>;
  /** Answers an athlete's question using their own data. */
  answerQuestion(request: QuestionRequest): Promise<Insight[]>;
}

let counter = 0;
export const nextInsightId = (prefix: string): string => `${prefix}-${Date.now()}-${counter++}`;
