import {
  buildActivityContextResolver,
  generateDemoDataset,
  type Activity,
  type ActivityContext,
  type Athlete,
  type AthleteRepository,
  type Challenge,
  type ChallengeParticipation,
  type Comment,
  type DemoDataset,
  type FeedPage,
  type Goal,
  type NewActivityInput,
  type PlannedWorkout,
  type Race,
  type TrainingBlock,
} from '@ai/core';

/**
 * In-memory implementation of the repository port, backed by the generated
 * demo athlete. Every screen talks to this through AthleteRepository, so
 * replacing it with a Postgres-backed implementation changes this file only.
 */
export class DemoRepository implements AthleteRepository {
  private data: DemoDataset;
  private following: Set<string>;
  private likes: Set<string>;
  private nextId = 1;

  /**
   * Context resolvers are per-athlete and expensive to build, so they are
   * cached and invalidated only when that athlete's activities change.
   */
  private contextResolvers = new Map<string, (a: Activity) => ActivityContext[]>();

  constructor(now: Date = new Date()) {
    this.data = generateDemoDataset(now);
    // The demo athlete already follows everyone in the seed set.
    this.following = new Set(this.data.athletes.filter((a) => a.id !== this.data.me.id).map((a) => a.id));
    this.likes = new Set(this.data.activities.filter((a) => a.likedByMe).map((a) => a.id));
  }

  private resolverFor(athleteId: string) {
    const cached = this.contextResolvers.get(athleteId);
    if (cached) return cached;
    const resolver = buildActivityContextResolver(
      this.data.activities.filter((a) => a.athleteId === athleteId),
      athleteId === this.data.me.id ? this.data.plan : [],
    );
    this.contextResolvers.set(athleteId, resolver);
    return resolver;
  }

  private withContext(activity: Activity): Activity {
    return {
      ...activity,
      likedByMe: this.likes.has(activity.id),
      context: this.resolverFor(activity.athleteId)(activity),
    };
  }

  async getCurrentAthlete(): Promise<Athlete> {
    return this.data.me;
  }

  async getAthlete(id: string): Promise<Athlete | null> {
    return this.data.athletes.find((a) => a.id === id) ?? null;
  }

  async getAthleteByHandle(handle: string): Promise<Athlete | null> {
    return this.data.athletes.find((a) => a.handle === handle) ?? null;
  }

  async getActivities(athleteId: string): Promise<Activity[]> {
    return this.data.activities
      .filter((a) => a.athleteId === athleteId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .map((a) => this.withContext(a));
  }

  async getActivity(id: string): Promise<Activity | null> {
    const found = this.data.activities.find((a) => a.id === id);
    return found ? this.withContext(found) : null;
  }

  async createActivity(input: NewActivityInput): Promise<Activity> {
    const activity: Activity = {
      id: `act-new-${this.nextId++}`,
      athleteId: this.data.me.id,
      sport: input.sport,
      title: input.title,
      description: input.description,
      startedAt: input.startedAt,
      startTimezone: 'America/New_York',
      elapsedSeconds: input.elapsedSeconds ?? input.movingSeconds,
      movingSeconds: input.movingSeconds,
      distanceM: input.distanceM,
      elevationGainM: input.elevationGainM,
      avgHeartRate: input.avgHeartRate,
      avgCadenceSpm: input.avgCadenceSpm,
      perceivedExertion: input.perceivedExertion,
      visibility: input.visibility ?? this.data.me.defaultActivityVisibility,
      source: 'manual',
      likeCount: 0,
      commentCount: 0,
    };
    this.data.activities.push(activity);
    // The new session changes what counts as a record or a longest run.
    this.contextResolvers.delete(activity.athleteId);
    return this.withContext(activity);
  }

  async getFeed(cursor?: string, limit = 15): Promise<FeedPage> {
    const visible = this.data.activities
      .filter((a) => a.athleteId === this.data.me.id || this.following.has(a.athleteId))
      .filter((a) => a.visibility !== 'private')
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    const offset = cursor ? Number.parseInt(cursor, 10) : 0;
    const page = visible.slice(offset, offset + limit);
    const next = offset + limit;

    return {
      activities: page.map((a) => this.withContext(a)),
      nextCursor: next < visible.length ? String(next) : null,
    };
  }

  async getActiveGoal(): Promise<Goal | null> {
    return this.data.goal;
  }

  async getPlan(athleteId: string): Promise<PlannedWorkout[]> {
    return this.data.plan.filter((p) => p.athleteId === athleteId);
  }

  async getRaces(athleteId: string): Promise<Race[]> {
    return this.data.races
      .filter((r) => r.athleteId === athleteId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getCurrentBlock(athleteId: string): Promise<TrainingBlock | null> {
    return this.data.block.athleteId === athleteId ? this.data.block : null;
  }

  async getWellness(athleteId: string) {
    return athleteId === this.data.me.id ? this.data.wellness : [];
  }

  async getObjectives(athleteId: string) {
    return this.data.objectives.filter((o) => o.athleteId === athleteId);
  }

  async getNotifications() {
    return this.data.notifications;
  }

  markNotificationsRead() {
    for (const n of this.data.notifications) n.read = true;
  }

  async getContent() {
    return this.data.content;
  }

  async getClubs() {
    return this.data.clubs;
  }

  async getEvents() {
    return this.data.events;
  }

  async getRoutes() {
    return this.data.routes;
  }

  async getLeaderboard(key: string) {
    return this.data.leaderboards[key] ?? [];
  }

  /** Global search across athletes, clubs, events, routes and content. */
  async search(query: string) {
    const q = query.trim().toLowerCase();
    if (!q) return { athletes: [], clubs: [], events: [], routes: [], content: [] };
    const match = (text: string) => text.toLowerCase().includes(q);
    return {
      athletes: this.data.athletes.filter(
        (a) => match(a.displayName) || match(a.handle) || match(a.location ?? ''),
      ),
      clubs: this.data.clubs.filter((c) => match(c.name) || match(c.location)),
      events: this.data.events.filter((e) => match(e.name) || match(e.location)),
      routes: this.data.routes.filter((r) => match(r.name) || match(r.location)),
      content: this.data.content.filter((c) => match(c.title) || match(c.authorName) || match(c.topic)),
    };
  }

  async setGoal(goal: Omit<Goal, 'id'>): Promise<Goal> {
    this.data.goal = { ...goal, id: this.data.goal.id };
    return this.data.goal;
  }

  async getChallenges(): Promise<Challenge[]> {
    return this.data.challenges;
  }

  async getParticipations(athleteId: string): Promise<ChallengeParticipation[]> {
    return this.data.participations.filter((p) => p.athleteId === athleteId);
  }

  async joinChallenge(challengeId: string, athleteId: string): Promise<ChallengeParticipation> {
    const existing = this.data.participations.find(
      (p) => p.challengeId === challengeId && p.athleteId === athleteId,
    );
    if (existing) return existing;
    const participation: ChallengeParticipation = { challengeId, athleteId, progressValue: 0 };
    this.data.participations.push(participation);
    return participation;
  }

  async getComments(activityId: string): Promise<Comment[]> {
    return this.data.comments
      .filter((c) => c.activityId === activityId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async addComment(activityId: string, body: string): Promise<Comment> {
    const comment: Comment = {
      id: `comment-new-${this.nextId++}`,
      activityId,
      athleteId: this.data.me.id,
      body,
      createdAt: new Date().toISOString(),
    };
    this.data.comments.push(comment);
    const activity = this.data.activities.find((a) => a.id === activityId);
    if (activity) activity.commentCount += 1;
    return comment;
  }

  async toggleLike(activityId: string): Promise<Activity> {
    const activity = this.data.activities.find((a) => a.id === activityId);
    if (!activity) throw new Error(`Unknown activity ${activityId}`);
    if (this.likes.has(activityId)) {
      this.likes.delete(activityId);
      activity.likeCount = Math.max(0, activity.likeCount - 1);
      activity.likedByMe = false;
    } else {
      this.likes.add(activityId);
      activity.likeCount += 1;
      activity.likedByMe = true;
    }
    return this.withContext(activity);
  }

  async getSuggestedAthletes(limit = 10): Promise<Athlete[]> {
    return this.data.athletes.filter((a) => a.id !== this.data.me.id).slice(0, limit);
  }

  async toggleFollow(athleteId: string): Promise<boolean> {
    if (this.following.has(athleteId)) {
      this.following.delete(athleteId);
      return false;
    }
    this.following.add(athleteId);
    return true;
  }

  async isFollowing(athleteId: string): Promise<boolean> {
    return this.following.has(athleteId);
  }
}
