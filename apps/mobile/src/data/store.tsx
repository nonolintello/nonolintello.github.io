import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  buildAthleteProfile,
  RuleBasedInsightProvider,
  type Activity,
  type Athlete,
  type AthleteProfile,
  type Challenge,
  type ChallengeParticipation,
  type Goal,
  type Insight,
  type InsightProvider,
  type NewActivityInput,
  type PlannedWorkout,
  type Race,
  type RaceEntry,
  type TrainingBlock,
  type AppNotification,
  type AthleteGoal,
  type Club,
  type ContentItem,
  type LeaderboardEntry,
  type RouteSuggestion,
  type SportEvent,
  type WellnessDay,
} from '@ai/core';
import { ActivityIndicator, Text, View } from 'react-native';
import { DemoRepository } from './DemoRepository';
import { colors, type } from '../theme/tokens';

interface AppState {
  ready: boolean;
  me: Athlete;
  profile: AthleteProfile;
  myActivities: Activity[];
  feed: Activity[];
  challenges: Challenge[];
  participations: ChallengeParticipation[];
  suggested: Athlete[];
  weeklyInsights: Insight[];
  plan: PlannedWorkout[];
  races: Race[];
  block: TrainingBlock | null;
  notifications: AppNotification[];
  unreadCount: number;
  content: ContentItem[];
  clubs: Club[];
  events: SportEvent[];
  /** Every MOOV registration across every event, mine included. */
  raceEntries: RaceEntry[];
  routes: RouteSuggestion[];
  leaderboards: Record<string, LeaderboardEntry[]>;
  markNotificationsRead(): void;
  repository: DemoRepository;
  insightProvider: InsightProvider;

  askQuestion(question: string): Promise<Insight[]>;

  toggleLike(activityId: string): Promise<void>;
  addComment(activityId: string, body: string): Promise<void>;
  createActivity(input: NewActivityInput): Promise<Activity>;
  setGoal(goal: Omit<Goal, 'id'>): Promise<void>;
  registerForEvent(eventId: string, expectedSeconds?: number): Promise<void>;
  withdrawFromEvent(eventId: string): Promise<void>;
  loadMoreFeed(): Promise<void>;
  activityById(id: string): Activity | undefined;
  athleteById(id: string): Athlete | undefined;
}

const AppContext = createContext<AppState | null>(null);

export const useApp = (): AppState => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const repository = useMemo(() => new DemoRepository(), []);
  const insightProvider = useMemo<InsightProvider>(() => new RuleBasedInsightProvider(), []);

  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Athlete | null>(null);
  const [myActivities, setMyActivities] = useState<Activity[]>([]);
  const [feed, setFeed] = useState<Activity[]>([]);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [goal, setGoalState] = useState<Goal | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [participations, setParticipations] = useState<ChallengeParticipation[]>([]);
  const [suggested, setSuggested] = useState<Athlete[]>([]);
  const [weeklyInsights, setWeeklyInsights] = useState<Insight[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [plan, setPlan] = useState<PlannedWorkout[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [block, setBlock] = useState<TrainingBlock | null>(null);
  const [wellness, setWellness] = useState<WellnessDay[]>([]);
  const [objectives, setObjectives] = useState<AthleteGoal[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [raceEntries, setRaceEntries] = useState<RaceEntry[]>([]);
  const [routes, setRoutes] = useState<RouteSuggestion[]>([]);
  const [leaderboards, setLeaderboards] = useState<Record<string, LeaderboardEntry[]>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const athlete = await repository.getCurrentAthlete();
      const [activities, page, activeGoal, chal, parts, sugg, workouts, upcoming, currentBlock] =
        await Promise.all([
          repository.getActivities(athlete.id),
          repository.getFeed(),
          repository.getActiveGoal(),
          repository.getChallenges(),
          repository.getParticipations(athlete.id),
          repository.getSuggestedAthletes(),
          repository.getPlan(athlete.id),
          repository.getRaces(athlete.id),
          repository.getCurrentBlock(athlete.id),
        ]);
      if (cancelled) return;
      setPlan(workouts);
      setRaces(upcoming);
      setBlock(currentBlock);

      const [wellnessDays, objectiveList, notifs, contentList, clubList, eventList, entryList, routeList, friendBoard, clubBoard] =
        await Promise.all([
          repository.getWellness(athlete.id),
          repository.getObjectives(athlete.id),
          repository.getNotifications(),
          repository.getContent(),
          repository.getClubs(),
          repository.getEvents(),
          repository.getRaceEntries(),
          repository.getRoutes(),
          repository.getLeaderboard('friends'),
          repository.getLeaderboard('club'),
        ]);
      if (cancelled) return;
      setWellness(wellnessDays);
      setObjectives(objectiveList);
      setNotifications(notifs);
      setContent(contentList);
      setClubs(clubList);
      setEvents(eventList);
      setRaceEntries(entryList);
      setRoutes(routeList);
      setLeaderboards({ friends: friendBoard, club: clubBoard });
      setMe(athlete);
      setMyActivities(activities);
      setFeed(page.activities);
      setFeedCursor(page.nextCursor);
      setGoalState(activeGoal);
      setChallenges(chal);
      setParticipations(parts);
      setSuggested(sugg);
      setAthletes([athlete, ...sugg]);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  // The athlete profile is the single derived source every screen reads.
  // Recomputed only when the underlying activities or goal actually change.
  const profile = useMemo<AthleteProfile | null>(() => {
    if (!me) return null;
    return buildAthleteProfile(me, myActivities, goal, new Date(), {
      wellness,
      objectives,
      races,
    });
  }, [me, myActivities, goal, wellness, objectives, races]);

  // Insight generation is fire-and-forget: it must never gate rendering, and
  // once an LLM sits behind this port it will be a network call.
  const insightRun = useRef(0);
  useEffect(() => {
    if (!profile) return;
    const run = ++insightRun.current;
    (async () => {
      const generated = await insightProvider.generateWeeklyInsights({ profile });
      if (insightRun.current === run) setWeeklyInsights(generated);
    })();
  }, [profile, insightProvider]);

  const refreshMine = useCallback(async () => {
    if (!me) return;
    setMyActivities(await repository.getActivities(me.id));
  }, [me, repository]);

  const toggleLike = useCallback(
    async (activityId: string) => {
      const updated = await repository.toggleLike(activityId);
      setFeed((prev) => prev.map((a) => (a.id === activityId ? { ...updated } : a)));
      setMyActivities((prev) => prev.map((a) => (a.id === activityId ? { ...updated } : a)));
    },
    [repository],
  );

  const addComment = useCallback(
    async (activityId: string, body: string) => {
      await repository.addComment(activityId, body);
      const updated = await repository.getActivity(activityId);
      if (!updated) return;
      setFeed((prev) => prev.map((a) => (a.id === activityId ? { ...updated } : a)));
      setMyActivities((prev) => prev.map((a) => (a.id === activityId ? { ...updated } : a)));
    },
    [repository],
  );

  const createActivity = useCallback(
    async (input: NewActivityInput) => {
      const created = await repository.createActivity(input);
      await refreshMine();
      const page = await repository.getFeed();
      setFeed(page.activities);
      setFeedCursor(page.nextCursor);
      return created;
    },
    [repository, refreshMine],
  );

  const setGoal = useCallback(
    async (next: Omit<Goal, 'id'>) => {
      setGoalState(await repository.setGoal(next));
    },
    [repository],
  );

  const registerForEvent = useCallback(
    async (eventId: string, expectedSeconds?: number) => {
      await repository.registerForEvent(eventId, expectedSeconds);
      setRaceEntries(await repository.getRaceEntries());
    },
    [repository],
  );

  const withdrawFromEvent = useCallback(
    async (eventId: string) => {
      await repository.withdrawFromEvent(eventId);
      setRaceEntries(await repository.getRaceEntries());
    },
    [repository],
  );

  const loadMoreFeed = useCallback(async () => {
    if (!feedCursor) return;
    const page = await repository.getFeed(feedCursor);
    setFeed((prev) => [...prev, ...page.activities]);
    setFeedCursor(page.nextCursor);
  }, [feedCursor, repository]);

  const askQuestion = useCallback(
    async (question: string) => {
      if (!profile) return [];
      return insightProvider.answerQuestion({ question, profile });
    },
    [insightProvider, profile],
  );

  const markNotificationsRead = useCallback(() => {
    repository.markNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [repository]);

  const activityById = useCallback(
    (id: string) => [...myActivities, ...feed].find((a) => a.id === id),
    [myActivities, feed],
  );

  const athleteById = useCallback((id: string) => athletes.find((a) => a.id === id), [athletes]);

  const value = useMemo<AppState | null>(() => {
    if (!me || !profile) return null;
    return {
      ready,
      me,
      profile,
      myActivities,
      feed,
      challenges,
      participations,
      suggested,
      weeklyInsights,
      plan,
      races,
      block,
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
      content,
      clubs,
      events,
      raceEntries,
      routes,
      leaderboards,
      markNotificationsRead,
      repository,
      insightProvider,
      askQuestion,
      toggleLike,
      addComment,
      createActivity,
      setGoal,
      registerForEvent,
      withdrawFromEvent,
      loadMoreFeed,
      activityById,
      athleteById,
    };
  }, [
    ready,
    me,
    profile,
    myActivities,
    feed,
    challenges,
    participations,
    suggested,
    weeklyInsights,
    plan,
    races,
    block,
    notifications,
    content,
    clubs,
    events,
    raceEntries,
    routes,
    leaderboards,
    markNotificationsRead,
    repository,
    insightProvider,
    askQuestion,
    toggleLike,
    addComment,
    createActivity,
    setGoal,
    registerForEvent,
    withdrawFromEvent,
    loadMoreFeed,
    activityById,
    athleteById,
  ]);

  if (!value) return <BootScreen />;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

/** Shown for the few hundred milliseconds the demo history takes to generate. */
const BootScreen = () => (
  <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
    <ActivityIndicator color={colors.accent} />
    <Text style={{ ...type.label, color: colors.textTertiary }}>Building your athlete profile</Text>
  </View>
);
