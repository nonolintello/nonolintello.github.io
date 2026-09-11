import type { UnitPreference } from './units';

export type Sport =
  | 'running'
  | 'trail_running'
  | 'treadmill_running'
  | 'cycling'
  | 'gravel_cycling'
  | 'mountain_biking'
  | 'indoor_cycling'
  | 'swimming'
  | 'open_water_swimming'
  | 'hiking'
  | 'walking'
  | 'rowing'
  | 'skiing'
  | 'ski_touring'
  | 'strength'
  | 'other';

export const RUNNING_SPORTS: readonly Sport[] = ['running', 'trail_running', 'treadmill_running'];

export const isRunning = (sport: Sport): boolean => RUNNING_SPORTS.includes(sport);

export type Visibility = 'public' | 'followers' | 'private';

export type ActivitySource =
  | 'manual'
  | 'garmin'
  | 'coros'
  | 'apple_health'
  | 'fitbit'
  | 'polar'
  | 'suunto'
  | 'wahoo'
  | 'file_upload';

export interface Athlete {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  birthDate?: string;
  restingHr?: number;
  maxHr?: number;
  weightKg?: number;
  primarySport: Sport;
  unitPreference: UnitPreference;
  profileVisibility: Visibility;
  defaultActivityVisibility: Visibility;
  routePrivacyRadiusM: number;
  createdAt: string;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

/**
 * Parallel sample arrays. All present arrays share the length of timeOffsetS.
 * Stored this way because the analytics engine consumes whole streams and a
 * row-per-sample table costs orders of magnitude more to read.
 */
export interface ActivityStream {
  timeOffsetS: number[];
  distanceM: number[];
  latitude?: number[];
  longitude?: number[];
  altitudeM?: number[];
  heartRate?: number[];
  cadenceSpm?: number[];
  velocityMps?: number[];
}

export interface Split {
  index: number;
  distanceM: number;
  elapsedSeconds: number;
  avgHeartRate?: number;
  elevationGainM?: number;
  avgCadenceSpm?: number;
}

export interface Activity {
  id: string;
  athleteId: string;
  sport: Sport;
  title: string;
  description?: string;
  startedAt: string;
  startTimezone: string;
  elapsedSeconds: number;
  movingSeconds: number;
  distanceM: number;
  elevationGainM?: number;
  elevationLossM?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgCadenceSpm?: number;
  calories?: number;
  perceivedExertion?: number;
  trainingLoad?: number;
  visibility: Visibility;
  source: ActivitySource;
  sourceActivityId?: string;
  photoUrl?: string;
  stream?: ActivityStream;
  splits?: Split[];
  likeCount: number;
  commentCount: number;
  likedByMe?: boolean;
  /** Why this session mattered. Derived, never stored — see deriveActivityContext. */
  context?: ActivityContext[];
}

/** Standard running PR distances. Custom distances are supported by storing metres. */
export const PR_DISTANCES_M = [1609, 5000, 10000, 21097, 42195] as const;

export const PR_DISTANCE_LABELS: Record<number, string> = {
  1609: '1 mile',
  5000: '5K',
  10000: '10K',
  21097: 'Half marathon',
  42195: 'Marathon',
};

export const prDistanceLabel = (m: number) => PR_DISTANCE_LABELS[m] ?? `${(m / 1000).toFixed(1)}K`;

export interface PersonalRecord {
  id: string;
  athleteId: string;
  sport: Sport;
  distanceM: number;
  elapsedSeconds: number;
  activityId?: string;
  achievedAt: string;
  previousElapsedSeconds?: number;
  previousAchievedAt?: string;
  isCurrent: boolean;
}

export type GoalMetric = 'distance' | 'duration' | 'activity_count' | 'elevation_gain' | 'training_load';
export type GoalPeriod = 'week' | 'month' | 'custom';

export interface Goal {
  id: string;
  athleteId: string;
  sport?: Sport;
  metric: GoalMetric;
  period: GoalPeriod;
  targetValue: number;
  startsOn: string;
  endsOn: string;
  completedAt?: string;
}

export interface GoalProgress {
  goal: Goal;
  currentValue: number;
  targetValue: number;
  /** 0..1, uncapped so overachievement is visible. */
  ratio: number;
  percentComplete: number;
  remaining: number;
  isComplete: boolean;
  daysRemaining: number;
  /** What the athlete must average per remaining day to finish on time. */
  requiredDailyRate: number;
  /** Projection from current rate, so the UI can say "on track" honestly. */
  projectedValue: number;
  onTrack: boolean;
}

export type ChallengeKind =
  | 'distance'
  | 'duration'
  | 'activity_count'
  | 'elevation_gain'
  | 'streak'
  | 'personal_best'
  | 'head_to_head';

export interface Challenge {
  id: string;
  slug: string;
  name: string;
  description: string;
  sport?: Sport;
  kind: ChallengeKind;
  targetValue?: number;
  startsAt: string;
  endsAt: string;
  isOfficial: boolean;
  xpReward: number;
  participantCount: number;
  accentColor?: string;
}

export interface ChallengeParticipation {
  challengeId: string;
  athleteId: string;
  progressValue: number;
  completedAt?: string;
  rank?: number;
}

export interface Achievement {
  id: string;
  athleteId: string;
  kind: string;
  tier?: string;
  title: string;
  description?: string;
  activityId?: string;
  earnedAt: string;
}

export interface Follow {
  followerId: string;
  followingId: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  activityId: string;
  athleteId: string;
  body: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Training — the planned side of the model. Activities record what happened;
// these record what was meant to happen, which is what makes adherence,
// "next up", and eventually adaptive coaching expressible.
// ---------------------------------------------------------------------------

export type WorkoutType =
  | 'rest'
  | 'recovery'
  | 'easy'
  | 'long'
  | 'steady'
  | 'tempo'
  | 'intervals'
  | 'race';

export const WORKOUT_LABELS: Record<WorkoutType, string> = {
  rest: 'Rest',
  recovery: 'Recovery',
  easy: 'Easy run',
  long: 'Long run',
  steady: 'Steady',
  tempo: 'Tempo',
  intervals: 'Intervals',
  race: 'Race',
};

/** Hard sessions carry the accent; easy work stays quiet in the calendar. */
export const isQualityWorkout = (type: WorkoutType): boolean =>
  type === 'tempo' || type === 'intervals' || type === 'race';

export interface PlannedWorkout {
  id: string;
  athleteId: string;
  /** Local calendar date, YYYY-MM-DD. A session belongs to a day, not an instant. */
  date: string;
  type: WorkoutType;
  title: string;
  /** Coach-facing prescription, e.g. "4 × 8 min at threshold, 2 min float". */
  prescription?: string;
  targetDistanceM?: number;
  targetDurationS?: number;
  /** Set once a logged activity is matched to this session. */
  completedActivityId?: string;
  skipped?: boolean;
}

export interface Race {
  id: string;
  athleteId: string;
  name: string;
  date: string;
  distanceM: number;
  location?: string;
  goalSeconds?: number;
  /** The race the current block is built around. */
  isGoalRace?: boolean;
  /** The public SportEvent this personal race calendar entry corresponds to. */
  eventId?: string;
}

/**
 * One day of wellness data, as a wearable would report it.
 *
 * Kept separate from Activity because recovery is a property of the athlete on
 * a date, not of any session — you have an HRV reading on a rest day too.
 */
export interface WellnessDay {
  date: string;
  sleepMinutes?: number;
  /** 0..1 — proportion of sleep in deep and REM stages. */
  sleepQuality?: number;
  hrvMs?: number;
  restingHr?: number;
  /** Athlete-reported, 1–5. */
  soreness?: number;
  mood?: number;
}

export type GoalKind = 'race_time' | 'distance_volume' | 'consistency' | 'event_completion' | 'performance';

/**
 * A season-level objective, distinct from the weekly Goal above.
 *
 * Weekly goals are a gamification loop; these are what the athlete is actually
 * training for, and they carry a prediction so progress can be honest rather
 * than a percentage of elapsed time.
 */
export interface AthleteGoal {
  id: string;
  athleteId: string;
  kind: GoalKind;
  title: string;
  /** Target time in seconds for race_time goals. */
  targetSeconds?: number;
  targetDistanceM?: number;
  targetCount?: number;
  raceId?: string;
  targetDate?: string;
  createdAt: string;
}

export type NotificationKind =
  | 'activity'
  | 'comment'
  | 'like'
  | 'follow'
  | 'challenge'
  | 'achievement'
  | 'personal_record'
  | 'recommendation'
  | 'race_reminder'
  | 'insight';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  actorId?: string;
  activityId?: string;
  challengeId?: string;
}

export interface ContentItem {
  id: string;
  title: string;
  authorId?: string;
  authorName: string;
  kind: 'video' | 'article' | 'story' | 'education';
  durationLabel: string;
  topic: string;
  accent: string;
  /** Content backed by the author's real training data is more credible. */
  dataBacked?: boolean;
  summary?: string;
}

export interface Club {
  id: string;
  name: string;
  sport: Sport;
  location: string;
  memberCount: number;
  description: string;
  joined?: boolean;
}

export interface SportEvent {
  id: string;
  name: string;
  date: string;
  location: string;
  distanceM?: number;
  kind: 'race' | 'competition' | 'local';
  participantCount?: number;
}

/**
 * A MOOV athlete's registration in a SportEvent.
 *
 * The expected time is what the athlete declares they are aiming for — a
 * statement of intent, not a projection. The engine's prediction lives on the
 * profile so the two can be shown side by side without being confused.
 */
export interface RaceEntry {
  id: string;
  eventId: string;
  athleteId: string;
  /** Declared target finish time in seconds. */
  expectedSeconds?: number;
  registeredAt: string;
}

export interface RouteSuggestion {
  id: string;
  name: string;
  sport: Sport;
  distanceM: number;
  elevationGainM: number;
  location: string;
  popularity: number;
  /** Sampled polyline for the preview, [lat, lon] pairs. */
  shape?: { lat: number[]; lon: number[] };
}

export interface LeaderboardEntry {
  athleteId: string;
  displayName: string;
  value: number;
  rank: number;
  isMe?: boolean;
}

export interface TrainingBlock {
  id: string;
  athleteId: string;
  name: string;
  focus: string;
  startsOn: string;
  endsOn: string;
  targetRaceId?: string;
}

/**
 * A single, plain-language reason this activity was notable.
 *
 * This is the Community differentiator in data form: a feed should say why an
 * eight-mile run mattered — first run back, fastest in two months, a negative
 * split — not merely that it happened.
 */
export interface ActivityContext {
  kind:
    | 'personal_record'
    | 'season_best'
    | 'longest'
    | 'comeback'
    | 'negative_split'
    | 'biggest_climb'
    | 'streak'
    | 'plan_session'
    | 'session_role'
    | 'volume_milestone';
  label: string;
  /** Ranks importance when a card has room for only one or two. */
  weight: number;
}

/**
 * Insight kind is mandatory throughout the system. The UI renders each kind
 * differently so a prediction can never be mistaken for a measurement.
 */
export type InsightKind = 'fact' | 'metric' | 'prediction' | 'recommendation';
export type InsightScope = 'activity' | 'week' | 'month' | 'athlete';

export interface Insight {
  id: string;
  athleteId: string;
  scope: InsightScope;
  kind: InsightKind;
  activityId?: string;
  periodStart?: string;
  headline: string;
  body: string;
  /** The numbers the statement was derived from — every claim stays traceable. */
  evidence: Record<string, number | string | null>;
  confidence?: number;
  generator: string;
  generatorVersion: string;
  createdAt: string;
}
