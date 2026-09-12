import {
  buildActivityContextResolver,
  generateDemoDataset,
  type Activity,
  type ActivityContext,
  type Athlete,
  type AthleteRepository,
  type Challenge,
  type ChallengeParticipation,
  type Coach,
  type CoachAthleteLink,
  type Comment,
  type DemoDataset,
  type FeedPage,
  type Goal,
  type NewActivityInput,
  type PlannedWorkout,
  type Race,
  type RaceEntry,
  type TrainingBlock,
  type TrainingPlan,
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
    return this.data.plan
      .filter((p) => p.athleteId === athleteId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getRaces(athleteId: string): Promise<Race[]> {
    return this.data.races
      .filter((r) => r.athleteId === athleteId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getRaceEntries(): Promise<RaceEntry[]> {
    return this.data.raceEntries;
  }

  async registerForEvent(eventId: string, expectedSeconds?: number): Promise<RaceEntry> {
    const existing = this.data.raceEntries.find(
      (e) => e.eventId === eventId && e.athleteId === this.data.me.id,
    );
    if (existing) {
      existing.expectedSeconds = expectedSeconds;
      return existing;
    }
    const entry: RaceEntry = {
      id: `entry-new-${this.nextId++}`,
      eventId,
      athleteId: this.data.me.id,
      expectedSeconds,
      registeredAt: new Date().toISOString(),
    };
    this.data.raceEntries.push(entry);
    return entry;
  }

  async withdrawFromEvent(eventId: string): Promise<void> {
    this.data.raceEntries = this.data.raceEntries.filter(
      (e) => !(e.eventId === eventId && e.athleteId === this.data.me.id),
    );
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

  // Coaching ------------------------------------------------------------

  async signInCoach(input: { email: string; displayName?: string; credential?: string }): Promise<Coach> {
    const email = input.email.trim().toLowerCase();
    const existing = this.data.coaches.find((c) => c.email.toLowerCase() === email);
    if (existing) return existing;
    const coach: Coach = {
      id: `coach-new-${this.nextId++}`,
      displayName: input.displayName?.trim() || email.split('@')[0] || 'Coach',
      email,
      credential: input.credential?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    this.data.coaches.push(coach);
    return coach;
  }

  async getCoach(coachId: string): Promise<Coach | null> {
    return this.data.coaches.find((c) => c.id === coachId) ?? null;
  }

  async getCoachLinks(coachId: string): Promise<CoachAthleteLink[]> {
    return this.data.coachLinks.filter((l) => l.coachId === coachId);
  }

  async getCoachForAthlete(athleteId: string): Promise<Coach | null> {
    const link = this.data.coachLinks.find((l) => l.athleteId === athleteId && l.status === 'connected');
    return link ? ((await this.getCoach(link.coachId)) ?? null) : null;
  }

  async inviteAthlete(coachId: string, handle: string): Promise<CoachAthleteLink> {
    const athlete = this.data.athletes.find((a) => a.handle.toLowerCase() === handle.replace(/^@/, '').toLowerCase());
    if (!athlete) throw new Error(`No athlete @${handle} on MOOV`);
    const existing = this.data.coachLinks.find((l) => l.coachId === coachId && l.athleteId === athlete.id);
    if (existing) return existing;
    const link: CoachAthleteLink = {
      coachId,
      athleteId: athlete.id,
      status: 'invited',
      invitedAt: new Date().toISOString(),
    };
    this.data.coachLinks.push(link);
    return link;
  }

  async acceptCoachInvite(coachId: string, athleteId: string): Promise<CoachAthleteLink> {
    const link = this.data.coachLinks.find((l) => l.coachId === coachId && l.athleteId === athleteId);
    if (!link) throw new Error('No invitation to accept');
    link.status = 'connected';
    link.connectedAt = new Date().toISOString();
    return link;
  }

  async removeAthlete(coachId: string, athleteId: string): Promise<void> {
    this.data.coachLinks = this.data.coachLinks.filter((l) => !(l.coachId === coachId && l.athleteId === athleteId));
  }

  async searchAthletes(query: string): Promise<Athlete[]> {
    const q = query.trim().replace(/^@/, '').toLowerCase();
    return this.data.athletes.filter(
      (a) => !q || a.handle.toLowerCase().includes(q) || a.displayName.toLowerCase().includes(q),
    );
  }

  async getPlans(athleteId: string): Promise<TrainingPlan[]> {
    return this.data.plans.filter((p) => p.athleteId === athleteId);
  }

  async assignPlan(plan: TrainingPlan, workouts: PlannedWorkout[]): Promise<TrainingPlan> {
    // One plan per athlete at a time: the new one supersedes anything that
    // overlaps it, and self-planned sessions from its start date give way.
    this.data.plans = this.data.plans.filter((p) => p.athleteId !== plan.athleteId || p.endsOn < plan.startsOn);
    this.data.plan = this.data.plan.filter((w) => w.athleteId !== plan.athleteId || w.date < plan.startsOn);
    this.data.plans.push(plan);
    this.data.plan.push(...workouts);
    this.contextResolvers.delete(plan.athleteId);
    return plan;
  }

  async updatePlan(plan: TrainingPlan): Promise<TrainingPlan> {
    const idx = this.data.plans.findIndex((p) => p.id === plan.id);
    const updated = { ...plan, updatedAt: new Date().toISOString() };
    if (idx >= 0) this.data.plans[idx] = updated;
    else this.data.plans.push(updated);
    return updated;
  }

  async deletePlan(planId: string): Promise<void> {
    const plan = this.data.plans.find((p) => p.id === planId);
    this.data.plans = this.data.plans.filter((p) => p.id !== planId);
    this.data.plan = this.data.plan.filter((w) => w.planId !== planId);
    if (plan) this.contextResolvers.delete(plan.athleteId);
  }

  async upsertWorkout(workout: PlannedWorkout): Promise<PlannedWorkout> {
    const idx = this.data.plan.findIndex((w) => w.id === workout.id);
    if (idx >= 0) this.data.plan[idx] = workout;
    else this.data.plan.push(workout);
    const plan = workout.planId ? this.data.plans.find((p) => p.id === workout.planId) : null;
    if (plan) plan.updatedAt = new Date().toISOString();
    this.contextResolvers.delete(workout.athleteId);
    return workout;
  }

  async deleteWorkout(workoutId: string): Promise<void> {
    const workout = this.data.plan.find((w) => w.id === workoutId);
    this.data.plan = this.data.plan.filter((w) => w.id !== workoutId);
    if (workout) this.contextResolvers.delete(workout.athleteId);
  }

  async modifyWorkout(workoutId: string, changes: Partial<PlannedWorkout>, note: string): Promise<PlannedWorkout> {
    const workout = this.data.plan.find((w) => w.id === workoutId);
    if (!workout) throw new Error(`Unknown workout ${workoutId}`);
    Object.assign(workout, changes, { modified: true, modifiedNote: note });
    this.contextResolvers.delete(workout.athleteId);
    return workout;
  }
}
