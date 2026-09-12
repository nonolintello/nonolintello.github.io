import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import {
  addDays,
  buildRoadmap,
  daysUntil,
  distanceIn,
  distanceLabel,
  formatDuration,
  formatDurationCompact,
  isQualityWorkout,
  nextWorkout,
  nextWorkoutAdjustment,
  planAdherence,
  planWeekDays,
  prDistanceLabel,
  recommendToday,
  startOfWeek,
  toISODate,
  WEEKDAY_LABELS,
  WORKOUT_LABELS,
  type PlannedWorkout,
  type RoadmapCheckpoint,
  type WorkoutType,
} from '@ai/core';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon, type IconName } from '../../src/components/Icon';
import { ProgressRing } from '../../src/components/charts';
import { RoadmapMap, checkpointColor } from '../../src/components/RoadmapMap';
import {
  Body,
  Button,
  Caption,
  Card,
  Divider,
  Label,
  Pill,
  Row,
  SectionHeader,
} from '../../src/components/ui';
import { useApp } from '../../src/data/store';
import { colors, radius, space, type } from '../../src/theme/tokens';

const WORKOUT_ICON: Record<WorkoutType, IconName> = {
  rest: 'rest',
  recovery: 'heart',
  easy: 'pulse',
  long: 'clock',
  steady: 'trendUp',
  tempo: 'flame',
  intervals: 'flame',
  race: 'trophy',
};

const workoutTone = (t: WorkoutType) =>
  t === 'race' ? colors.accent : isQualityWorkout(t) ? colors.warn : t === 'rest' ? colors.textTertiary : colors.cyan;

export default function TrainingScreen() {
  const { me, profile, plan, races, raceEntries, block, events, myActivities, activityById, unreadCount } = useApp();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const unit = me.unitPreference;

  const now = new Date();
  const weekStart = startOfWeek(now);
  const todayIso = toISODate(now);

  const [acceptedAdjustment, setAcceptedAdjustment] = useState(false);
  const [tab, setTab] = useState<'roadmap' | 'today' | 'calendar'>('roadmap');
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<string | null>(null);

  const adherence = planAdherence(plan, weekStart);
  const upcoming = nextWorkout(plan, now);
  const todayWorkout = plan.find((p) => p.date === todayIso && p.type !== 'rest');
  const todayDone = Boolean(todayWorkout?.completedActivityId);
  const adjustment = useMemo(
    () => nextWorkoutAdjustment(profile, plan, now),
    // now is intentionally excluded: it changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, plan],
  );
  const suggestion = recommendToday(profile);
  const { recovery } = profile;

  const roadmap = useMemo(
    () => buildRoadmap({ profile, activities: myActivities, plan, races, block, events, now, unit }),
    // now is intentionally excluded: it changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, myActivities, plan, races, block, events, unit],
  );
  const focusCheckpoint =
    roadmap.checkpoints.find((c) => c.id === selectedCheckpoint) ?? roadmap.next;
  const openCheckpoint = (c: RoadmapCheckpoint) => {
    if (c.activityId) router.push(`/activity/${c.activityId}`);
    else if (c.raceId) {
      const eventId = races.find((r) => r.id === c.raceId)?.eventId;
      if (eventId) router.push(`/event/${eventId}`);
    }
  };

  const blockWeeks = block
    ? Math.max(1, Math.round((new Date(block.endsOn).getTime() - new Date(block.startsOn).getTime()) / (7 * 86_400_000)))
    : 0;
  const blockWeek = block
    ? Math.max(1, Math.round((weekStart.getTime() - new Date(`${block.startsOn}T00:00:00`).getTime()) / (7 * 86_400_000)) + 1)
    : 0;

  return (
    <Screen contentStyle={{ paddingHorizontal: space.lg, gap: space.xl }}>
      <ScreenHeader
        eyebrow="Improve me"
        title="Training"
        athleteName={me.displayName}
        athleteId={me.id}
        unreadCount={unreadCount}
      />

      <SegmentedTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'roadmap', label: 'Roadmap' },
          { value: 'today', label: 'Today' },
          { value: 'calendar', label: 'Calendar' },
        ]}
      />

      {tab === 'roadmap' ? (
        <>
          {/* Roadmap ----------------------------------------------------- */}
          <Card padded={false}>
            <View style={{ padding: space.lg, paddingBottom: 0 }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Label>{roadmap.kind === 'race' ? 'Destination' : 'Progression'}</Label>
                  <Text style={[type.title, { fontSize: 21, marginTop: 4 }]}>
                    {roadmap.kind === 'race' ? roadmap.race.name : `Level ${roadmap.level} · ${roadmap.title}`}
                  </Text>
                  <Caption style={{ marginTop: 3 }}>{roadmap.summary}</Caption>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[type.metric, { color: colors.accent }]}>
                    {roadmap.kind === 'race' ? roadmap.daysRemaining : `${Math.round(roadmap.position * 100)}%`}
                  </Text>
                  <Caption style={{ fontSize: 11, color: colors.textTertiary }}>
                    {roadmap.kind === 'race' ? 'days to go' : 'of the ladder'}
                  </Caption>
                </View>
              </Row>
            </View>

            <RoadmapMap
              roadmap={roadmap}
              width={width - space.lg * 2}
              height={Math.min(320, (width - space.lg * 2) * 0.9)}
              selectedId={focusCheckpoint?.id ?? null}
            />

            <Divider />
            <Row style={{ padding: space.lg, paddingVertical: space.md, justifyContent: 'space-between' }}>
              <Row gap={space.lg}>
                <Row gap={6}>
                  <View style={[styles.dot, { backgroundColor: colors.accent }]} />
                  <Caption style={{ fontSize: 11.5 }}>You</Caption>
                </Row>
                <Row gap={6}>
                  <View style={[styles.dot, { backgroundColor: colors.cyan }]} />
                  <Caption style={{ fontSize: 11.5 }}>Banked</Caption>
                </Row>
                <Row gap={6}>
                  <View style={[styles.dot, { borderWidth: 1.5, borderColor: colors.textSecondary }]} />
                  <Caption style={{ fontSize: 11.5 }}>Ahead</Caption>
                </Row>
              </Row>
              <Caption style={{ fontSize: 11.5, color: colors.textTertiary }}>
                {roadmap.doneCount}/{roadmap.checkpoints.length} checkpoints
              </Caption>
            </Row>
          </Card>

          {/* Focus checkpoint -------------------------------------------- */}
          {focusCheckpoint ? (
            <Card
              style={{ borderColor: `${checkpointColor(focusCheckpoint)}55` }}
              onPress={
                focusCheckpoint.activityId || focusCheckpoint.raceId ? () => openCheckpoint(focusCheckpoint) : undefined
              }
            >
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Label style={{ color: checkpointColor(focusCheckpoint) }}>
                    {focusCheckpoint.id === roadmap.next?.id ? 'Next checkpoint' : checkpointLabel(focusCheckpoint)}
                  </Label>
                  <Text style={[type.subtitle, { marginTop: 4 }]}>{focusCheckpoint.title}</Text>
                  <Body style={{ fontSize: 13, lineHeight: 19, marginTop: 4 }}>{focusCheckpoint.detail}</Body>
                </View>
                {roadmap.kind === 'race' ? (
                  <View style={{ alignItems: 'flex-end', marginLeft: space.md }}>
                    <Text style={[type.metricSmall, { fontSize: 20 }]}>
                      {Math.abs(daysUntil(focusCheckpoint.date, now))}
                    </Text>
                    <Caption style={{ fontSize: 11, color: colors.textTertiary }}>
                      {daysUntil(focusCheckpoint.date, now) >= 0 ? 'days away' : 'days ago'}
                    </Caption>
                  </View>
                ) : null}
              </Row>
              {focusCheckpoint.activityId || focusCheckpoint.raceId ? (
                <Row gap={4} style={{ marginTop: space.md }}>
                  <Caption style={{ color: colors.accent, fontWeight: '700' }}>
                    {focusCheckpoint.activityId ? 'Open the run' : 'Open the race'}
                  </Caption>
                  <Icon name="chevronRight" size={14} color={colors.accent} />
                </Row>
              ) : null}
            </Card>
          ) : null}

          {/* Checkpoint list ----------------------------------------------- */}
          <View>
            <SectionHeader title="The journey" />
            <Card padded={false}>
              {roadmap.checkpoints.map((c, i) => {
                const color = checkpointColor(c);
                const isFocus = c.id === focusCheckpoint?.id;
                const done = c.status === 'done';
                return (
                  <View key={c.id}>
                    <Pressable
                      onPress={() => setSelectedCheckpoint(c.id)}
                      style={({ pressed }) => [
                        styles.journeyRow,
                        isFocus && { backgroundColor: 'rgba(255,255,255,0.035)' },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <View style={{ width: 22, alignItems: 'center', alignSelf: 'stretch' }}>
                        <View
                          style={[
                            styles.journeyDot,
                            done
                              ? { backgroundColor: color }
                              : c.status === 'missed'
                                ? { borderWidth: 2, borderColor: colors.danger }
                                : { borderWidth: 2, borderColor: color, opacity: c.status === 'current' ? 1 : 0.7 },
                          ]}
                        >
                          {done ? <Icon name="check" size={9} color={colors.textInverse} /> : null}
                        </View>
                        {i < roadmap.checkpoints.length - 1 ? (
                          <View style={[styles.journeyLine, done && { backgroundColor: `${color}66` }]} />
                        ) : null}
                      </View>
                      <View style={{ flex: 1, paddingBottom: space.md }}>
                        <Row style={{ justifyContent: 'space-between' }}>
                          <Text
                            style={[
                              type.bodyStrong,
                              { fontSize: 14.5, flex: 1 },
                              !done && c.status !== 'current' && { color: colors.textSecondary },
                            ]}
                            numberOfLines={1}
                          >
                            {c.title}
                          </Text>
                          {roadmap.kind === 'race' ? (
                            <Caption style={{ fontSize: 11.5, color: colors.textTertiary }}>
                              {new Date(`${c.date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                            </Caption>
                          ) : null}
                        </Row>
                        <Caption style={{ fontSize: 12, marginTop: 2, color: colors.textTertiary }} numberOfLines={2}>
                          {c.status === 'missed' ? 'Missed · ' : ''}
                          {c.detail}
                        </Caption>
                      </View>
                    </Pressable>
                  </View>
                );
              })}
            </Card>
          </View>

          {/* Races ------------------------------------------------------- */}
          <View>
            <SectionHeader title="Races" />
            <View style={{ gap: space.md }}>
              {profile.raceReadiness.map((r) => (
                <Card
                  key={r.race.id}
                  style={r.race.isGoalRace ? { borderColor: colors.accentSoft } : undefined}
                >
                  <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Row gap={space.sm}>
                        <Text style={type.subtitle}>{r.race.name}</Text>
                        {r.race.isGoalRace ? <Pill tone="accent">Goal race</Pill> : null}
                      </Row>
                      <Caption style={{ marginTop: 4, color: colors.textTertiary }}>
                        {prDistanceLabel(r.race.distanceM)}
                        {r.race.goalSeconds ? ` · target ${formatDuration(r.race.goalSeconds)}` : ''}
                      </Caption>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[type.metric, { color: r.race.isGoalRace ? colors.accent : colors.text }]}>
                        {r.daysUntil}
                      </Text>
                      <Caption style={{ fontSize: 11, color: colors.textTertiary }}>days</Caption>
                    </View>
                  </Row>

                  <Divider style={{ marginVertical: space.lg }} />

                  <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                    <Label>Race readiness</Label>
                    <Text style={[type.metricSmall, { fontSize: 17 }]}>{r.percent}%</Text>
                  </Row>
                  <View style={styles.track}>
                    <View
                      style={[
                        styles.trackFill,
                        {
                          width: `${r.percent}%`,
                          backgroundColor:
                            r.percent >= 80 ? colors.success : r.percent >= 60 ? colors.warn : colors.danger,
                        },
                      ]}
                    />
                  </View>

                  <View style={{ gap: space.sm, marginTop: space.lg }}>
                    {r.factors.map((f) => (
                      <Row key={f.key} style={{ justifyContent: 'space-between' }}>
                        <Caption style={{ color: colors.textSecondary, flex: 1 }}>{f.label}</Caption>
                        <Row gap={space.sm}>
                          <View style={[styles.miniTrack]}>
                            <View
                              style={[
                                styles.trackFill,
                                {
                                  width: `${f.score}%`,
                                  backgroundColor: f.score >= 70 ? colors.success : colors.warn,
                                },
                              ]}
                            />
                          </View>
                          <Text
                            style={[
                              type.caption,
                              { width: 26, textAlign: 'right', color: colors.textTertiary },
                            ]}
                          >
                            {Math.round(f.score)}
                          </Text>
                        </Row>
                      </Row>
                    ))}
                  </View>

                  {r.limiter ? (
                    <Row gap={space.sm} style={{ marginTop: space.md, alignItems: 'flex-start' }}>
                      <Icon name="target" size={13} color={colors.accent} />
                      <Body style={{ flex: 1, fontSize: 13, lineHeight: 19 }}>
                        {r.limiter.label} is the limiter — {r.limiter.detail.toLowerCase()}.
                      </Body>
                    </Row>
                  ) : null}

                  {r.race.eventId ? (
                    <StartListLink
                      count={raceEntries.filter((e) => e.eventId === r.race.eventId && e.athleteId !== me.id).length}
                      onPress={() => router.push(`/event/${r.race.eventId}`)}
                    />
                  ) : null}
                </Card>
              ))}
            </View>
          </View>

          {/* Season objectives ------------------------------------------- */}
          <View>
            <SectionHeader title="Season goals" />
            <View style={{ gap: space.md }}>
              {profile.objectives.map((o) => (
                <Card key={o.goal.id}>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={type.subtitle}>{o.goal.title}</Text>
                      {o.daysRemaining != null && o.daysRemaining > 0 ? (
                        <Caption style={{ marginTop: 3, color: colors.textTertiary }}>
                          {o.daysRemaining} days remaining
                        </Caption>
                      ) : null}
                    </View>
                    <Pill tone={o.onTrack ? 'success' : 'warn'}>
                      {o.onTrack ? 'On track' : 'Behind'}
                    </Pill>
                  </Row>

                  {o.targetSeconds && o.predictedSeconds ? (
                    <Row style={{ justifyContent: 'space-between', marginTop: space.lg }}>
                      <View>
                        <Label>Predicted</Label>
                        <Text style={[type.metric, { marginTop: 4 }]}>
                          {formatDuration(o.predictedSeconds)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Label>Target</Label>
                        <Text style={[type.metric, { marginTop: 4, color: colors.accent }]}>
                          {formatDuration(o.targetSeconds)}
                        </Text>
                      </View>
                    </Row>
                  ) : null}

                  <View style={{ marginTop: space.lg }}>
                    <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                      <Caption style={{ color: colors.textTertiary }}>Progress</Caption>
                      <Caption style={{ color: colors.text, fontWeight: '700' }}>
                        {Math.round(o.progress * 100)}%
                      </Caption>
                    </Row>
                    <View style={styles.track}>
                      <View
                        style={[
                          styles.trackFill,
                          {
                            width: `${Math.max(2, o.progress * 100)}%`,
                            backgroundColor: o.onTrack ? colors.success : colors.accent,
                          },
                        ]}
                      />
                    </View>
                  </View>

                  <Row gap={space.sm} style={{ marginTop: space.md, alignItems: 'flex-start' }}>
                    <Icon name="sparkle" size={13} color={colors.violet} />
                    <Body style={{ flex: 1, fontSize: 13, lineHeight: 19 }}>{o.summary}</Body>
                  </Row>
                </Card>
              ))}
            </View>
          </View>

          {/* This week's goal -------------------------------------------- */}
          <SectionHeader title="This week" />
          {profile.goal ? (
            <Card style={{ alignItems: 'center', paddingVertical: space.xl }}>
              <ProgressRing progress={profile.goal.ratio} size={164} strokeWidth={13}>
                <Text style={[type.display, { fontSize: 42, lineHeight: 44 }]}>
                  {distanceIn(profile.goal.currentValue, unit).toFixed(1)}
                </Text>
                <Text style={[type.caption, { color: colors.textTertiary, marginTop: 2 }]}>
                  of {distanceIn(profile.goal.targetValue, unit).toFixed(0)} {distanceLabel(unit)}
                </Text>
              </ProgressRing>
              <Caption style={{ marginTop: space.lg, color: colors.textTertiary }}>
                This week ·{' '}
                {profile.goal.isComplete
                  ? 'goal met'
                  : `${distanceIn(profile.goal.remaining, unit).toFixed(1)} ${distanceLabel(unit)} to go`}
              </Caption>
            </Card>
          ) : null}

        </>
      ) : null}

      {tab === 'today' ? (
        <>
          {/* Today ------------------------------------------------------- */}
          <View>
            <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
              <Label>
                {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              </Label>
              <Row gap={5}>
                <Label>Recovery</Label>
                <Text
                  style={[
                    type.label,
                    {
                      color:
                        recovery.label === 'excellent' || recovery.label === 'good'
                          ? colors.success
                          : recovery.label === 'fair'
                            ? colors.warn
                            : colors.danger,
                    },
                  ]}
                >
                  {recovery.label}
                </Text>
              </Row>
            </Row>

            <Card>
              {todayWorkout ? (
                <>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Row gap={space.md}>
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: radius.sm,
                          backgroundColor: `${workoutTone(todayWorkout.type)}1F`,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon
                          name={WORKOUT_ICON[todayWorkout.type]}
                          size={21}
                          color={workoutTone(todayWorkout.type)}
                        />
                      </View>
                      <View>
                        <Text style={[type.title, { fontSize: 20 }]}>
                          {WORKOUT_LABELS[todayWorkout.type]}
                        </Text>
                        <Caption style={{ marginTop: 2, color: colors.textTertiary }}>
                          {todayDone ? 'Completed' : "Today's workout"}
                        </Caption>
                      </View>
                    </Row>
                    {todayWorkout.targetDistanceM ? (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={type.metric}>
                          {distanceIn(todayWorkout.targetDistanceM, unit).toFixed(1)}
                        </Text>
                        <Caption style={{ fontSize: 11, color: colors.textTertiary }}>
                          {distanceLabel(unit)}
                        </Caption>
                      </View>
                    ) : null}
                  </Row>

                  {todayWorkout.prescription ? (
                    <>
                      <Divider style={{ marginVertical: space.lg }} />
                      <Label style={{ marginBottom: 6 }}>Purpose</Label>
                      <Body style={{ lineHeight: 21 }}>{todayWorkout.prescription}</Body>
                    </>
                  ) : null}

                  <View style={{ marginTop: space.lg }}>
                    {todayDone ? (
                      <Button
                        variant="secondary"
                        onPress={() =>
                          todayWorkout.completedActivityId &&
                          router.push(`/activity/${todayWorkout.completedActivityId}`)
                        }
                      >
                        View activity
                      </Button>
                    ) : (
                      <Button onPress={() => router.push('/log')}>Start workout</Button>
                    )}
                  </View>
                </>
              ) : (
                <>
                  <Row gap={space.md}>
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: radius.sm,
                        backgroundColor: colors.accentSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon name="sparkle" size={20} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Label style={{ color: colors.accent }}>Recommended</Label>
                      <Text style={[type.title, { fontSize: 19, marginTop: 3 }]}>
                        {suggestion.title}
                      </Text>
                    </View>
                  </Row>
                  <Divider style={{ marginVertical: space.lg }} />
                  <Body style={{ lineHeight: 21 }}>{suggestion.detail}</Body>
                  <View style={{ marginTop: space.lg }}>
                    <Button onPress={() => router.push('/log')}>Log a run</Button>
                  </View>
                </>
              )}
            </Card>
          </View>

          {/* Adaptive recommendation ------------------------------------- */}
          {adjustment ? (
            <Card
              style={{
                borderColor: acceptedAdjustment ? colors.successSoft : colors.accentSoft,
              }}
            >
              <Row gap={space.sm} style={{ marginBottom: space.md }}>
                <Icon
                  name={acceptedAdjustment ? 'check' : 'sparkle'}
                  size={15}
                  color={acceptedAdjustment ? colors.success : colors.accent}
                />
                <Label style={{ color: acceptedAdjustment ? colors.success : colors.accent }}>
                  {acceptedAdjustment ? 'Plan updated' : 'MOOV recommendation'}
                </Label>
                {!acceptedAdjustment && adjustment.severity === 'strong' ? (
                  <Pill tone="warn">Worth acting on</Pill>
                ) : null}
              </Row>

              {acceptedAdjustment ? (
                <Body style={{ lineHeight: 21 }}>
                  {new Date(`${adjustment.original.date}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: 'long',
                  })}
                  ’s session is now {adjustment.suggestedTitle.toLowerCase()} —{' '}
                  {adjustment.suggestedPrescription.toLowerCase()}. The{' '}
                  {WORKOUT_LABELS[adjustment.original.type].toLowerCase()} moves later in the week.
                </Body>
              ) : (
                <>
                  <Text style={[type.subtitle, { marginBottom: 6 }]}>{adjustment.reason}</Text>

                  <View
                    style={{
                      marginTop: space.md,
                      padding: space.md,
                      borderRadius: radius.sm,
                      backgroundColor: 'rgba(255,255,255,0.035)',
                      gap: space.sm,
                    }}
                  >
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Caption style={{ color: colors.textTertiary }}>Planned</Caption>
                      <Caption style={{ color: colors.textSecondary, textDecorationLine: 'line-through' }}>
                        {WORKOUT_LABELS[adjustment.original.type]}
                      </Caption>
                    </Row>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Caption style={{ color: colors.textTertiary }}>Suggested</Caption>
                      <Caption style={{ color: colors.accent, fontWeight: '700' }}>
                        {adjustment.suggestedTitle}
                      </Caption>
                    </Row>
                    <Caption style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>
                      {adjustment.suggestedPrescription}
                    </Caption>
                  </View>

                  <Body style={{ fontSize: 13, lineHeight: 19, marginTop: space.md }}>
                    {adjustment.tradeoff}
                  </Body>

                  <Row gap={space.sm} style={{ marginTop: space.lg }}>
                    <Button style={{ flex: 1 }} onPress={() => setAcceptedAdjustment(true)}>
                      Accept
                    </Button>
                    <Button
                      variant="secondary"
                      style={{ flex: 1 }}
                      onPress={() =>
                        Alert.alert(
                          'Keeping the plan',
                          'The session stays as scheduled. MOOV will keep watching your recovery.',
                        )
                      }
                    >
                      Keep plan
                    </Button>
                  </Row>
                </>
              )}
            </Card>
          ) : null}

          {/* This week --------------------------------------------------- */}
          <View>
            <SectionHeader title="This week" />
            <Card>
              <Row style={{ justifyContent: 'space-between', marginBottom: space.lg }}>
                <View>
                  <Label>Sessions completed</Label>
                  <Row gap={4} style={{ alignItems: 'flex-end', marginTop: 4 }}>
                    <Text style={type.metric}>{adherence.completed}</Text>
                    <Text style={[type.caption, { color: colors.textTertiary, marginBottom: 5 }]}>
                      of {adherence.planned} planned
                    </Text>
                  </Row>
                </View>
                <Pill tone={adherence.ratio >= 0.8 ? 'success' : adherence.ratio >= 0.5 ? 'cyan' : 'warn'}>
                  {Math.round(adherence.ratio * 100)}% adherence
                </Pill>
              </Row>

              <Row gap={6}>
                {planWeekDays(plan, weekStart).map((workout, i) => {
                  const date = toISODate(addDays(weekStart, i));
                  const isToday = date === todayIso;
                  const done = Boolean(workout?.completedActivityId);
                  const rest = !workout || workout.type === 'rest';
                  return (
                    <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                      <Text
                        style={[
                          type.label,
                          { fontSize: 9.5, color: isToday ? colors.accent : colors.textTertiary },
                        ]}
                      >
                        {WEEKDAY_LABELS[i]}
                      </Text>
                      <View
                        style={{
                          width: '100%',
                          height: 44,
                          borderRadius: radius.sm,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: done
                            ? colors.successSoft
                            : rest || workout?.skipped
                              ? 'rgba(255,255,255,0.035)'
                              : `${workoutTone(workout.type)}1F`,
                          borderWidth: isToday ? 1 : 0,
                          borderColor: colors.accent,
                        }}
                      >
                        {done ? (
                          <Icon name="check" size={16} color={colors.success} strokeWidth={2.6} />
                        ) : rest ? (
                          <Icon name="rest" size={14} color={colors.textTertiary} />
                        ) : workout.skipped ? (
                          <Text style={{ color: colors.textTertiary, fontSize: 15 }}>–</Text>
                        ) : (
                          <Icon
                            name={WORKOUT_ICON[workout.type]}
                            size={15}
                            color={workoutTone(workout.type)}
                          />
                        )}
                      </View>
                    </View>
                  );
                })}
              </Row>
            </Card>
          </View>

          {/* Next up ----------------------------------------------------- */}
          {upcoming && upcoming.date !== todayIso ? (
            <View>
              <SectionHeader title="Next up" />
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row gap={space.md}>
                    <Icon
                      name={WORKOUT_ICON[upcoming.type]}
                      size={18}
                      color={workoutTone(upcoming.type)}
                    />
                    <View>
                      <Text style={type.subtitle}>{WORKOUT_LABELS[upcoming.type]}</Text>
                      <Caption style={{ marginTop: 2, color: colors.textTertiary }}>
                        {whenLabel(upcoming.date, now)}
                        {upcoming.targetDurationS
                          ? ` · around ${formatDurationCompact(upcoming.targetDurationS)}`
                          : ''}
                      </Caption>
                    </View>
                  </Row>
                  {upcoming.targetDistanceM ? (
                    <Text style={type.metricSmall}>
                      {distanceIn(upcoming.targetDistanceM, unit).toFixed(1)} {distanceLabel(unit)}
                    </Text>
                  ) : null}
                </Row>
                {upcoming.prescription ? (
                  <>
                    <Divider style={{ marginVertical: space.md }} />
                    <Body style={{ fontSize: 13.5, lineHeight: 19 }}>{upcoming.prescription}</Body>
                  </>
                ) : null}
              </Card>
            </View>
          ) : null}
        </>
      ) : null}

      {tab === 'calendar' ? (
        <View style={{ gap: space.lg }}>
          {[0, 1, 2].map((weekOffset) => {
            const start = addDays(weekStart, weekOffset * 7);
            const days = planWeekDays(plan, start).filter(
              (w): w is PlannedWorkout => w !== null && w.type !== 'rest',
            );
            if (days.length === 0) return null;
            const weekDistance = days.reduce((a, w) => a + (w.targetDistanceM ?? 0), 0);

            return (
              <View key={weekOffset}>
                <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
                  <Label>
                    {weekOffset === 0
                      ? 'This week'
                      : weekOffset === 1
                        ? 'Next week'
                        : `Week of ${new Date(start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
                  </Label>
                  <Caption style={{ fontSize: 12, color: colors.textTertiary }}>
                    {distanceIn(weekDistance, unit).toFixed(0)} {distanceLabel(unit)} planned
                  </Caption>
                </Row>

                <Card padded={false}>
                  {days.map((workout, i) => {
                    const completed = workout.completedActivityId
                      ? activityById(workout.completedActivityId)
                      : undefined;
                    return (
                      <View key={workout.id}>
                        <Pressable
                          onPress={() => completed && router.push(`/activity/${completed.id}`)}
                        >
                          <Row style={{ padding: space.lg, paddingVertical: space.md }}>
                            <View style={{ width: 34 }}>
                              <Text
                                style={[
                                  type.label,
                                  {
                                    fontSize: 9.5,
                                    color: workout.date === todayIso ? colors.accent : colors.textTertiary,
                                  },
                                ]}
                              >
                                {new Date(`${workout.date}T00:00:00`)
                                  .toLocaleDateString(undefined, { weekday: 'short' })
                                  .toUpperCase()}
                              </Text>
                              <Text style={[type.caption, { color: colors.textSecondary, marginTop: 1 }]}>
                                {new Date(`${workout.date}T00:00:00`).getDate()}
                              </Text>
                            </View>

                            <View style={{ flex: 1 }}>
                              <Row gap={6}>
                                <Icon
                                  name={WORKOUT_ICON[workout.type]}
                                  size={14}
                                  color={workoutTone(workout.type)}
                                />
                                <Text style={[type.bodyStrong, { fontSize: 14.5 }]}>
                                  {WORKOUT_LABELS[workout.type]}
                                </Text>
                              </Row>
                              {workout.prescription ? (
                                <Caption
                                  style={{ fontSize: 12, marginTop: 3, color: colors.textTertiary }}
                                  numberOfLines={1}
                                >
                                  {workout.prescription}
                                </Caption>
                              ) : null}
                            </View>

                            {completed ? (
                              <Row gap={4}>
                                <Icon name="check" size={14} color={colors.success} strokeWidth={2.6} />
                                <Text style={[type.caption, { color: colors.success }]}>
                                  {distanceIn(completed.distanceM, unit).toFixed(1)}
                                </Text>
                              </Row>
                            ) : workout.skipped ? (
                              <Caption style={{ fontSize: 12, color: colors.textTertiary }}>Missed</Caption>
                            ) : workout.targetDistanceM ? (
                              <Caption style={{ fontSize: 12.5, color: colors.textSecondary }}>
                                {distanceIn(workout.targetDistanceM, unit).toFixed(1)} {distanceLabel(unit)}
                              </Caption>
                            ) : null}
                          </Row>
                        </Pressable>
                        {i < days.length - 1 ? <Divider /> : null}
                      </View>
                    );
                  })}
                </Card>
              </View>
            );
          })}

          {block ? (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={type.subtitle}>{block.name}</Text>
                <Pill tone="cyan">
                  Week {Math.min(blockWeek, blockWeeks)} of {blockWeeks}
                </Pill>
              </Row>
              <Body style={{ marginTop: space.sm, lineHeight: 21 }}>{block.focus}</Body>
              <View style={[styles.track, { marginTop: space.lg }]}>
                <View
                  style={[
                    styles.trackFill,
                    {
                      width: `${Math.min(100, (blockWeek / blockWeeks) * 100)}%`,
                      backgroundColor: colors.cyan,
                    },
                  ]}
                />
              </View>
            </Card>
          ) : null}
        </View>
      ) : null}

    </Screen>
  );
}

const checkpointLabel = (c: RoadmapCheckpoint) =>
  c.status === 'done' ? 'Banked' : c.status === 'missed' ? 'Missed' : c.status === 'current' ? 'Today' : 'Ahead';

/** Who else from MOOV is on this start list — the social half of a race card. */
const StartListLink = ({ count, onPress }: { count: number; onPress: () => void }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [{ marginTop: space.lg }, pressed && { opacity: 0.7 }]}>
    <Row style={{ justifyContent: 'space-between' }}>
      <Row gap={space.sm}>
        <Icon name="community" size={14} color={colors.cyan} />
        <Caption style={{ color: colors.textSecondary }}>
          {count === 0
            ? 'Nobody else from MOOV yet'
            : `${count} ${count === 1 ? 'other' : 'others'} from MOOV racing`}
        </Caption>
      </Row>
      <Row gap={4}>
        <Caption style={{ color: colors.accent, fontWeight: '700' }}>Start list</Caption>
        <Icon name="chevronRight" size={14} color={colors.accent} />
      </Row>
    </Row>
  </Pressable>
);

const SegmentedTabs = <T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) => (
  <View style={styles.segmented}>
    {options.map((o) => {
      const active = o.value === value;
      return (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[styles.segment, active && { backgroundColor: colors.surfaceRaised }]}
        >
          <Text
            style={{ fontSize: 13.5, fontWeight: '600', color: active ? colors.text : colors.textTertiary }}
          >
            {o.label}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

const whenLabel = (isoDate: string, now: Date): string => {
  const days = daysUntil(isoDate, now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' });
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
};

const styles = {
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  journeyRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  journeyDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 1,
  },
  journeyLine: {
    width: 2,
    flex: 1,
    minHeight: 18,
    marginTop: 3,
    // Runs into the next row's top padding so the rail reads as continuous.
    marginBottom: -space.md,
    backgroundColor: colors.border,
  },
  track: {
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden' as const,
  },
  miniTrack: {
    width: 70,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden' as const,
  },
  trackFill: {
    height: '100%' as const,
    borderRadius: radius.pill,
  },
  segmented: {
    flexDirection: 'row' as const,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: radius.sm,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    height: 38,
    borderRadius: radius.sm - 3,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
};
