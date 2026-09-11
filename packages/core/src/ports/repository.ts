import type {
  Activity,
  Athlete,
  Challenge,
  ChallengeParticipation,
  Comment,
  Goal,
  PlannedWorkout,
  Race,
  RaceEntry,
  TrainingBlock,
} from '../domain/types';

export interface FeedPage {
  activities: Activity[];
  nextCursor: string | null;
}

/**
 * The seam between the app and its data source. The demo implementation reads
 * from an in-memory dataset; the production one will call Postgres. Screens are
 * written against this interface only, so swapping the two touches one file.
 */
export interface AthleteRepository {
  getCurrentAthlete(): Promise<Athlete>;
  getAthlete(id: string): Promise<Athlete | null>;
  getAthleteByHandle(handle: string): Promise<Athlete | null>;

  /** All of an athlete's activities, newest first. Streams included. */
  getActivities(athleteId: string): Promise<Activity[]>;
  getActivity(id: string): Promise<Activity | null>;
  createActivity(input: NewActivityInput): Promise<Activity>;

  /** Paginated social feed of followed athletes. */
  getFeed(cursor?: string, limit?: number): Promise<FeedPage>;

  getActiveGoal(athleteId: string): Promise<Goal | null>;
  setGoal(goal: Omit<Goal, 'id'>): Promise<Goal>;

  /** Planned sessions, past and upcoming. */
  getPlan(athleteId: string): Promise<PlannedWorkout[]>;
  getRaces(athleteId: string): Promise<Race[]>;

  /** Every MOOV athlete entered in every event. Small enough to hold whole. */
  getRaceEntries(): Promise<RaceEntry[]>;
  /** Creates or updates the current athlete's entry for an event. */
  registerForEvent(eventId: string, expectedSeconds?: number): Promise<RaceEntry>;
  withdrawFromEvent(eventId: string): Promise<void>;
  getCurrentBlock(athleteId: string): Promise<TrainingBlock | null>;

  getChallenges(): Promise<Challenge[]>;
  getParticipations(athleteId: string): Promise<ChallengeParticipation[]>;
  joinChallenge(challengeId: string, athleteId: string): Promise<ChallengeParticipation>;

  getComments(activityId: string): Promise<Comment[]>;
  addComment(activityId: string, body: string): Promise<Comment>;
  toggleLike(activityId: string): Promise<Activity>;

  getSuggestedAthletes(limit?: number): Promise<Athlete[]>;
  toggleFollow(athleteId: string): Promise<boolean>;
  isFollowing(athleteId: string): Promise<boolean>;
}

export interface NewActivityInput {
  sport: Activity['sport'];
  title: string;
  description?: string;
  startedAt: string;
  distanceM: number;
  movingSeconds: number;
  elapsedSeconds?: number;
  elevationGainM?: number;
  avgHeartRate?: number;
  avgCadenceSpm?: number;
  perceivedExertion?: number;
  visibility?: Activity['visibility'];
}
