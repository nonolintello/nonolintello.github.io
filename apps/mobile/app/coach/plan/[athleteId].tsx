import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  addDays,
  distanceIn,
  distanceLabel,
  generatePlanFromTemplate,
  kmToMetres,
  milesToMetres,
  planWeekSummary,
  startOfWeek,
  toISODate,
  workoutStatus,
  WORKOUT_LABELS,
  type PlannedWorkout,
  type Race,
  type TrainingPlan,
  type WorkoutType,
} from '@ai/core';
import { Screen } from '../../../src/components/Screen';
import { Icon, type IconName } from '../../../src/components/Icon';
import { Body, Button, Caption, Card, Divider, Label, Pill, Row, SectionHeader } from '../../../src/components/ui';
import { useApp } from '../../../src/data/store';
import { useAthleteView } from '../../../src/data/useAthleteView';
import { colors, hairline, radius, space, type } from '../../../src/theme/tokens';

const TYPES: WorkoutType[] = ['rest', 'recovery', 'easy', 'steady', 'tempo', 'intervals', 'long', 'race'];

const TYPE_ICON: Record<WorkoutType, IconName> = {
  rest: 'rest',
  recovery: 'heart',
  easy: 'pulse',
  long: 'clock',
  steady: 'trendUp',
  tempo: 'flame',
  intervals: 'flame',
  race: 'trophy',
};

const tone = (t: WorkoutType) =>
  t === 'race' ? colors.accent : t === 'tempo' || t === 'intervals' ? colors.warn : t === 'rest' ? colors.textTertiary : colors.cyan;

/**
 * The plan editor. Two states share one screen: drafting a new plan (generate
 * from the template, edit, assign) and editing a plan already in flight (every
 * change saves straight away, so the athlete's calendar is always current).
 *
 * The template does the tedious part; the coach's judgement goes into the
 * key sessions, which is what the athlete's roadmap is built from.
 */
export default function CoachPlanScreen() {
  const { athleteId } = useLocalSearchParams<{ athleteId: string }>();
  const router = useRouter();
  const { coach, me, repository, refreshPlan } = useApp();
  const [version, setVersion] = useState(0);
  const view = useAthleteView(String(athleteId), version);

  const todayIso = toISODate(new Date());
  const existing = view?.plans.find((p) => p.endsOn >= todayIso) ?? null;

  // Draft state for a new plan.
  const [name, setName] = useState('');
  const [focus, setFocus] = useState('');
  const [raceId, setRaceId] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ plan: TrainingPlan; workouts: PlannedWorkout[] } | null>(null);
  const [editing, setEditing] = useState<PlannedWorkout | null>(null);
  const [showAllWeeks, setShowAllWeeks] = useState(false);

  const races = useMemo(
    () => (view?.races ?? []).filter((r) => r.date >= todayIso).sort((a, b) => a.date.localeCompare(b.date)),
    [view?.races, todayIso],
  );
  const goalRace: Race | null = races.find((r) => r.id === raceId) ?? null;

  useEffect(() => {
    if (!view || existing) return;
    const goal = races.find((r) => r.isGoalRace) ?? races[races.length - 1] ?? null;
    setRaceId(goal?.id ?? null);
    setName(goal ? `${goal.name} build` : 'Base block');
    setFocus(
      goal
        ? 'Two quality sessions a week and a long run that grows every fortnight, tapering into race day.'
        : 'Consistent aerobic volume with one quality session a week.',
    );
  }, [view, existing, races]);

  useEffect(() => {
    if (!coach) router.replace('/coach/login');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!coach) return null;
  if (!view) {
    return (
      <Screen contentStyle={{ paddingHorizontal: space.lg }}>
        <BackBar onPress={() => router.back()} label="Athlete" />
        <Caption>Loading…</Caption>
      </Screen>
    );
  }

  const { athlete, profile } = view;
  const unit = athlete.unitPreference;
  const nextMonday = addDays(startOfWeek(new Date()), 7);
  const workouts = existing ? view.plan.filter((w) => w.planId === existing.id) : (draft?.workouts ?? []);
  const plan = existing ?? draft?.plan ?? null;

  const generate = () => {
    const longest = Math.max(0, ...profile.trailingWeeks.map((w) => w.longestRunM));
    const recentWeeks = profile.trailingWeeks.slice(-4);
    const weeklyM = recentWeeks.reduce((s, w) => s + w.distanceM, 0) / Math.max(1, recentWeeks.length);
    const generated = generatePlanFromTemplate({
      athleteId: athlete.id,
      coachId: coach.id,
      name: name || 'Training block',
      startsOn: toISODate(nextMonday),
      race: goalRace,
      weeks: weeks ?? undefined,
      currentWeeklyM: weeklyM,
      longestRunM: longest,
      now: new Date(),
      focus,
    });
    setDraft(generated);
    setShowAllWeeks(true);
  };

  const assign = async () => {
    if (!draft) return;
    await repository.assignPlan({ ...draft.plan, name: name || draft.plan.name, focus }, draft.workouts);
    if (athlete.id === me.id) await refreshPlan();
    setDraft(null);
    setVersion((v) => v + 1);
    Alert.alert('Plan assigned', `${athlete.displayName.split(' ')[0]} will see it in their Journey now.`);
  };

  const saveWorkout = async (w: PlannedWorkout) => {
    if (existing) {
      await repository.upsertWorkout(w);
      if (athlete.id === me.id) await refreshPlan();
      setVersion((v) => v + 1);
    } else if (draft) {
      setDraft({ ...draft, workouts: draft.workouts.map((x) => (x.id === w.id ? w : x)) });
    }
    setEditing(null);
  };

  const removeWorkout = async (w: PlannedWorkout) => {
    // Deleting leaves a rest day rather than a hole: the athlete should never
    // wonder whether a blank day was intended.
    await saveWorkout({ ...w, type: 'rest', title: WORKOUT_LABELS.rest, prescription: undefined, targetDistanceM: undefined, keyWorkout: undefined });
  };

  const removePlan = async () => {
    if (!existing) return;
    await repository.deletePlan(existing.id);
    if (athlete.id === me.id) await refreshPlan();
    setVersion((v) => v + 1);
  };

  // Weeks of the plan, Monday-keyed.
  const weekStarts = plan
    ? Array.from(
        { length: Math.ceil((new Date(`${plan.endsOn}T00:00:00`).getTime() - new Date(`${plan.startsOn}T00:00:00`).getTime() + 86_400_000) / (7 * 86_400_000)) },
        (_, i) => toISODate(addDays(new Date(`${plan.startsOn}T00:00:00`), i * 7)),
      )
    : [];
  const currentWeekIso = toISODate(startOfWeek(new Date()));
  const visibleWeeks = showAllWeeks ? weekStarts : weekStarts.filter((w) => w >= currentWeekIso).slice(0, 3);

  return (
    <Screen contentStyle={{ paddingHorizontal: space.lg, gap: space.xl }}>
      <BackBar onPress={() => router.back()} label={athlete.displayName.split(' ')[0] ?? 'Athlete'} />

      {/* Setup / header --------------------------------------------------- */}
      {!plan ? (
        <>
          <View>
            <Label style={{ color: colors.cyan }}>New plan for {athlete.displayName}</Label>
            <Text style={[type.display, { fontSize: 28, lineHeight: 32, marginTop: space.sm }]}>Build the block</Text>
            <Body style={{ marginTop: space.md, lineHeight: 20, fontSize: 13.5 }}>
              MOOV knows {athlete.displayName.split(' ')[0]} averages{' '}
              {distanceIn(profile.trailingWeeks.slice(-4).reduce((s, w) => s + w.distanceM, 0) / 4, unit).toFixed(0)}{' '}
              {distanceLabel(unit)} a week with a longest run of{' '}
              {distanceIn(Math.max(0, ...profile.trailingWeeks.map((w) => w.longestRunM)), unit).toFixed(0)}{' '}
              {distanceLabel(unit)}. The template starts there and builds to the race.
            </Body>
          </View>

          <Card style={{ gap: space.lg }}>
            <View>
              <Label style={{ marginBottom: space.sm }}>Plan name</Label>
              <TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor={colors.textTertiary} />
            </View>

            <View>
              <Label style={{ marginBottom: space.sm }}>Destination</Label>
              {races.length === 0 ? (
                <Caption>No upcoming race on their calendar — the plan will be a general block.</Caption>
              ) : (
                <View style={{ gap: space.sm }}>
                  {races.map((r) => {
                    const active = r.id === raceId;
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => {
                          setRaceId(r.id);
                          setName(`${r.name} build`);
                        }}
                        style={[styles.option, active && { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[type.bodyStrong, { fontSize: 14 }]}>{r.name}</Text>
                          <Caption style={{ fontSize: 12 }}>
                            {new Date(`${r.date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}
                            {r.isGoalRace ? ' · their goal race' : ''}
                          </Caption>
                        </View>
                        {active ? <Icon name="check" size={16} color={colors.accent} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            <View>
              <Label style={{ marginBottom: space.sm }}>Length</Label>
              <Row gap={space.md}>
                <Stepper
                  value={weeks ?? (goalRace ? Math.min(16, Math.max(2, Math.ceil((new Date(`${goalRace.date}T00:00:00`).getTime() - nextMonday.getTime()) / (7 * 86_400_000)))) : 12)}
                  onChange={setWeeks}
                  min={2}
                  max={16}
                  suffix="weeks"
                />
                <Caption style={{ flex: 1, fontSize: 12 }}>
                  Starts Monday {nextMonday.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  {goalRace ? ' and ends on race day.' : '.'}
                </Caption>
              </Row>
            </View>

            <View>
              <Label style={{ marginBottom: space.sm }}>Focus</Label>
              <TextInput
                value={focus}
                onChangeText={setFocus}
                multiline
                style={[styles.input, { height: 72, paddingTop: 10 }]}
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            <Button onPress={generate}>Generate plan</Button>
          </Card>
        </>
      ) : (
        <Card style={{ borderColor: existing ? colors.cyanSoft : colors.accentSoft }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Label style={{ color: existing ? colors.cyan : colors.accent }}>
                {existing ? 'Assigned plan' : 'Draft — not yet assigned'}
              </Label>
              <Text style={[type.title, { fontSize: 21, marginTop: 4 }]}>{plan.name}</Text>
              <Caption style={{ marginTop: 3 }}>
                {athlete.displayName} · {weekStarts.length} weeks · {plan.startsOn} → {plan.endsOn}
              </Caption>
              {plan.focus ? <Body style={{ fontSize: 13, lineHeight: 19, marginTop: space.sm }}>{plan.focus}</Body> : null}
            </View>
          </Row>
          <Row style={{ justifyContent: 'space-around', marginTop: space.lg }}>
            <Stat label="Sessions" value={String(workouts.filter((w) => w.type !== 'rest').length)} />
            <Stat label="Key" value={String(workouts.filter((w) => w.keyWorkout).length)} tone={colors.accent} />
            <Stat
              label="Peak week"
              value={`${distanceIn(Math.max(0, ...weekStarts.map((ws) => planWeekSummary(workouts, ws).distanceM)), unit).toFixed(0)} ${distanceLabel(unit)}`}
            />
            {existing ? (
              <Stat
                label="Missed"
                value={String(workouts.filter((w) => workoutStatus(w, todayIso) === 'missed').length)}
                tone={colors.danger}
              />
            ) : null}
          </Row>
          {!existing ? (
            <Row gap={space.sm} style={{ marginTop: space.lg }}>
              <Button style={{ flex: 1 }} onPress={assign}>
                Assign to {athlete.displayName.split(' ')[0]}
              </Button>
              <Button variant="secondary" onPress={() => setDraft(null)}>
                Start over
              </Button>
            </Row>
          ) : null}
        </Card>
      )}

      {/* Weeks ----------------------------------------------------------- */}
      {plan ? (
        <View>
          <SectionHeader
            title="Sessions"
            action={showAllWeeks ? 'Upcoming only' : 'All weeks'}
            onAction={() => setShowAllWeeks((v) => !v)}
          />
          <View style={{ gap: space.lg }}>
            {visibleWeeks.map((ws) => {
              const summary = planWeekSummary(workouts, ws);
              const index = weekStarts.indexOf(ws) + 1;
              const days = Array.from({ length: 7 }, (_, d) => toISODate(addDays(new Date(`${ws}T00:00:00`), d)));
              return (
                <View key={ws}>
                  <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
                    <Label>
                      Week {index}
                      {ws === currentWeekIso ? ' · this week' : ''}
                    </Label>
                    <Caption style={{ fontSize: 12, color: colors.textTertiary }}>
                      {distanceIn(summary.distanceM, unit).toFixed(0)} {distanceLabel(unit)} · {summary.sessions} sessions
                    </Caption>
                  </Row>
                  <Card padded={false}>
                    {days.map((dayIso, i) => {
                      const w = workouts.find((x) => x.date === dayIso);
                      const status = w ? workoutStatus(w, todayIso) : 'upcoming';
                      const isEditing = editing?.id === w?.id;
                      return (
                        <View key={dayIso}>
                          <Pressable
                            onPress={() =>
                              setEditing(
                                w ?? {
                                  id: `${plan.id}-${dayIso}`,
                                  athleteId: athlete.id,
                                  date: dayIso,
                                  type: 'easy',
                                  title: WORKOUT_LABELS.easy,
                                  planId: plan.id,
                                  source: 'coach',
                                },
                              )
                            }
                            style={({ pressed }) => [
                              { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, paddingVertical: 10 },
                              isEditing && { backgroundColor: 'rgba(255,255,255,0.035)' },
                              pressed && { opacity: 0.7 },
                            ]}
                          >
                            <View style={{ width: 34 }}>
                              <Text style={[type.label, { fontSize: 9.5, color: dayIso === todayIso ? colors.accent : colors.textTertiary }]}>
                                {new Date(`${dayIso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
                              </Text>
                              <Text style={[type.caption, { color: colors.textSecondary, marginTop: 1 }]}>
                                {new Date(`${dayIso}T00:00:00`).getDate()}
                              </Text>
                            </View>
                            <Icon name={TYPE_ICON[w?.type ?? 'rest']} size={14} color={tone(w?.type ?? 'rest')} />
                            <View style={{ flex: 1 }}>
                              <Row gap={6}>
                                <Text
                                  style={[type.bodyStrong, { fontSize: 14, color: w && w.type !== 'rest' ? colors.text : colors.textTertiary }]}
                                  numberOfLines={1}
                                >
                                  {w?.title ?? 'Rest'}
                                </Text>
                                {w?.keyWorkout ? <Pill tone="accent">Key</Pill> : null}
                              </Row>
                              {w?.prescription && w.type !== 'rest' ? (
                                <Caption style={{ fontSize: 11.5, marginTop: 2, color: colors.textTertiary }} numberOfLines={1}>
                                  {w.prescription}
                                </Caption>
                              ) : null}
                              {w?.modifiedNote ? (
                                <Caption style={{ fontSize: 11.5, marginTop: 2, color: colors.warn }} numberOfLines={1}>
                                  Athlete changed it: {w.modifiedNote}
                                </Caption>
                              ) : null}
                            </View>
                            <StatusMark status={status} isRest={!w || w.type === 'rest'} />
                            {w?.targetDistanceM ? (
                              <Caption style={{ fontSize: 12.5, color: colors.textSecondary, width: 52, textAlign: 'right' }}>
                                {distanceIn(w.targetDistanceM, unit).toFixed(1)} {distanceLabel(unit)}
                              </Caption>
                            ) : (
                              <View style={{ width: 52 }} />
                            )}
                          </Pressable>

                          {isEditing && editing ? (
                            <WorkoutEditor
                              workout={editing}
                              unit={unit}
                              onChange={setEditing}
                              onSave={() => saveWorkout(editing)}
                              onRemove={() => removeWorkout(editing)}
                              onCancel={() => setEditing(null)}
                            />
                          ) : null}
                          {i < 6 ? <Divider /> : null}
                        </View>
                      );
                    })}
                  </Card>
                </View>
              );
            })}
          </View>

          {existing ? (
            <Pressable
              onPress={() =>
                Alert.alert('Remove plan', 'The athlete keeps their history; upcoming sessions are removed.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: removePlan },
                ])
              }
              style={{ alignSelf: 'center', marginTop: space.xl, padding: space.sm }}
            >
              <Caption style={{ color: colors.danger, fontWeight: '700' }}>Remove this plan</Caption>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const StatusMark = ({ status, isRest }: { status: ReturnType<typeof workoutStatus>; isRest: boolean }) => {
  if (isRest) return <View style={{ width: 18 }} />;
  if (status === 'completed') return <Icon name="check" size={16} color={colors.success} />;
  if (status === 'modified') return <Icon name="check" size={16} color={colors.warn} />;
  if (status === 'missed') return <Icon name="close" size={16} color={colors.danger} />;
  if (status === 'today') return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginHorizontal: 5 }} />;
  return <View style={{ width: 18 }} />;
};

const WorkoutEditor = ({
  workout,
  unit,
  onChange,
  onSave,
  onRemove,
  onCancel,
}: {
  workout: PlannedWorkout;
  unit: 'metric' | 'imperial';
  onChange: (w: PlannedWorkout) => void;
  onSave: () => void;
  onRemove: () => void;
  onCancel: () => void;
}) => {
  const [distance, setDistance] = useState(
    workout.targetDistanceM ? distanceIn(workout.targetDistanceM, unit).toFixed(1) : '',
  );
  const setType = (t: WorkoutType) =>
    onChange({
      ...workout,
      type: t,
      title: workout.source === 'coach' && workout.title && workout.title !== WORKOUT_LABELS[workout.type] ? workout.title : WORKOUT_LABELS[t],
      targetDistanceM: t === 'rest' ? undefined : workout.targetDistanceM,
    });
  return (
    <View style={{ padding: space.lg, paddingTop: space.sm, gap: space.md, backgroundColor: 'rgba(255,255,255,0.025)' }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {TYPES.map((t) => {
          const active = workout.type === t;
          return (
            <Pressable
              key={t}
              onPress={() => setType(t)}
              style={{
                paddingHorizontal: space.md,
                paddingVertical: 7,
                borderRadius: radius.pill,
                backgroundColor: active ? `${tone(t)}22` : 'rgba(255,255,255,0.05)',
                borderWidth: hairline,
                borderColor: active ? tone(t) : 'transparent',
              }}
            >
              <Text style={[type.caption, { fontWeight: '700', color: active ? tone(t) : colors.textSecondary }]}>
                {WORKOUT_LABELS[t]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {workout.type !== 'rest' ? (
        <>
          <Row gap={space.md}>
            <View style={{ flex: 1 }}>
              <Label style={{ marginBottom: 6 }}>Title</Label>
              <TextInput
                value={workout.title}
                onChangeText={(title) => onChange({ ...workout, title })}
                style={styles.input}
                placeholderTextColor={colors.textTertiary}
              />
            </View>
            <View style={{ width: 96 }}>
              <Label style={{ marginBottom: 6 }}>{distanceLabel(unit)}</Label>
              <TextInput
                value={distance}
                keyboardType="decimal-pad"
                onChangeText={(v) => {
                  setDistance(v);
                  const n = Number.parseFloat(v);
                  onChange({
                    ...workout,
                    targetDistanceM: Number.isFinite(n) ? Math.round((unit === 'imperial' ? milesToMetres(n) : kmToMetres(n)) / 100) * 100 : undefined,
                  });
                }}
                style={styles.input}
                placeholder="0.0"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
          </Row>
          <View>
            <Label style={{ marginBottom: 6 }}>Prescription</Label>
            <TextInput
              value={workout.prescription ?? ''}
              onChangeText={(prescription) => onChange({ ...workout, prescription })}
              multiline
              style={[styles.input, { height: 64, paddingTop: 10 }]}
              placeholder="What the session is for, in the athlete's terms."
              placeholderTextColor={colors.textTertiary}
            />
          </View>
          <Pressable onPress={() => onChange({ ...workout, keyWorkout: !workout.keyWorkout || undefined })}>
            <Row gap={space.sm}>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  borderWidth: 1.5,
                  borderColor: workout.keyWorkout ? colors.accent : colors.borderStrong,
                  backgroundColor: workout.keyWorkout ? colors.accent : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {workout.keyWorkout ? <Icon name="check" size={12} color={colors.textInverse} /> : null}
              </View>
              <Caption style={{ color: colors.text }}>Key workout — shows on their roadmap</Caption>
            </Row>
          </Pressable>
        </>
      ) : null}

      <Row gap={space.sm}>
        <Button style={{ flex: 1 }} onPress={onSave}>
          Save
        </Button>
        <Button variant="secondary" onPress={onCancel}>
          Cancel
        </Button>
        {workout.type !== 'rest' ? (
          <Button variant="ghost" onPress={onRemove}>
            <Text style={{ color: colors.danger }}>Remove</Text>
          </Button>
        ) : null}
      </Row>
    </View>
  );
};

const Stepper = ({
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix: string;
}) => (
  <Row gap={space.sm}>
    <Pressable onPress={() => onChange(Math.max(min, value - 1))} style={styles.stepBtn}>
      <Text style={[type.bodyStrong, { color: colors.text }]}>−</Text>
    </Pressable>
    <Text style={[type.metricSmall, { fontSize: 18, minWidth: 28, textAlign: 'center' }]}>{value}</Text>
    <Pressable onPress={() => onChange(Math.min(max, value + 1))} style={styles.stepBtn}>
      <Text style={[type.bodyStrong, { color: colors.text }]}>+</Text>
    </Pressable>
    <Caption>{suffix}</Caption>
  </Row>
);

const Stat = ({ label, value, tone: color }: { label: string; value: string; tone?: string }) => (
  <View style={{ alignItems: 'center' }}>
    <Text style={[type.metricSmall, { fontSize: 17, color: color ?? colors.text }]}>{value}</Text>
    <Caption style={{ fontSize: 10.5, color: colors.textTertiary, marginTop: 2 }}>{label}</Caption>
  </View>
);

const BackBar = ({ onPress, label }: { onPress: () => void; label: string }) => (
  <Pressable onPress={onPress} hitSlop={12} style={{ alignSelf: 'flex-start', marginBottom: space.sm }}>
    <Row gap={4}>
      <Icon name="chevronLeft" size={20} color={colors.textSecondary} />
      <Text style={[type.caption, { color: colors.textSecondary, fontWeight: '600' }]}>{label}</Text>
    </Row>
  </Pressable>
);

const styles = {
  input: {
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: hairline,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    color: colors.text,
    fontSize: 14,
  },
  option: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    padding: space.md,
    borderRadius: radius.sm,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: hairline,
    borderColor: colors.border,
  },
};
