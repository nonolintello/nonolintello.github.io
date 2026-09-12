import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  distanceIn,
  distanceLabel,
  formatDuration,
  formatDurationCompact,
  prDistanceLabel,
  predictFromRecords,
  relativeDayLabel,
  workoutStatus,
  WORKOUT_LABELS,
} from '@ai/core';
import { Screen } from '../../../src/components/Screen';
import { Icon } from '../../../src/components/Icon';
import { InsightCard } from '../../../src/components/InsightCard';
import { RoadmapMap } from '../../../src/components/RoadmapMap';
import { Avatar, Body, Button, Caption, Card, Divider, Label, Pill, Row, SectionHeader } from '../../../src/components/ui';
import { useApp } from '../../../src/data/store';
import { useAthleteView } from '../../../src/data/useAthleteView';
import { colors, radius, space, type } from '../../../src/theme/tokens';

/**
 * One athlete, as the coach sees them: MOOV's read on where they are, the plan
 * in flight and how it is going, and the same insights the athlete gets. The
 * coach's decisions start here, so this screen is about state, not settings.
 */
export default function CoachAthleteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { coach } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  // Coming back from the plan editor must show the plan that was just assigned.
  const [version, setVersion] = useState(0);
  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));
  const view = useAthleteView(String(id), version);

  useEffect(() => {
    if (!coach) router.replace('/coach/login');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!coach) return null;
  if (!view) {
    return (
      <Screen contentStyle={{ paddingHorizontal: space.lg }}>
        <BackBar onPress={() => router.back()} />
        <Caption>Loading athlete…</Caption>
      </Screen>
    );
  }

  const { athlete, profile, races, plan, plans, roadmap, insights, activities } = view;
  const unit = athlete.unitPreference;
  const todayIso = new Date().toISOString().slice(0, 10);
  const goalRace = races.find((r) => r.isGoalRace && r.date >= todayIso) ?? null;
  const activePlan = plans.find((p) => p.endsOn >= todayIso) ?? null;
  const planWorkouts = activePlan ? plan.filter((w) => w.planId === activePlan.id) : [];
  const counts = planWorkouts.reduce(
    (acc, w) => {
      const s = workoutStatus(w, todayIso);
      if (w.type === 'rest') return acc;
      if (s === 'completed') acc.completed++;
      else if (s === 'modified') acc.modified++;
      else if (s === 'missed') acc.missed++;
      else acc.upcoming++;
      return acc;
    },
    { completed: 0, modified: 0, missed: 0, upcoming: 0 },
  );
  const nextKey = planWorkouts.filter((w) => w.keyWorkout && w.date >= todayIso).slice(0, 2);
  const readiness = goalRace ? profile.raceReadiness.find((r) => r.race.id === goalRace.id) : null;
  const projection = goalRace ? predictFromRecords(profile.records, goalRace.distanceM) : null;
  const recoveryTone =
    profile.recovery.label === 'excellent' || profile.recovery.label === 'good'
      ? colors.success
      : profile.recovery.label === 'fair'
        ? colors.warn
        : colors.danger;

  return (
    <Screen contentStyle={{ paddingHorizontal: space.lg, gap: space.xl }}>
      <BackBar onPress={() => router.back()} />

      {/* Athlete --------------------------------------------------------- */}
      <Card>
        <Row>
          <Avatar name={athlete.displayName} size={54} />
          <View style={{ flex: 1 }}>
            <Text style={[type.title, { fontSize: 21 }]}>{athlete.displayName}</Text>
            <Caption style={{ marginTop: 2 }}>
              @{athlete.handle}
              {athlete.location ? ` · ${athlete.location}` : ''}
            </Caption>
          </View>
          <Pressable onPress={() => router.push(`/profile/${athlete.id}`)} hitSlop={8}>
            <Caption style={{ color: colors.accent, fontWeight: '700' }}>Profile</Caption>
          </Pressable>
        </Row>
        {athlete.bio ? <Body style={{ marginTop: space.md, fontSize: 13.5, lineHeight: 19 }}>{athlete.bio}</Body> : null}

        <Divider style={{ marginVertical: space.lg }} />

        <Row style={{ justifyContent: 'space-between' }}>
          <Stat label="Score" value={String(Math.round(profile.score.overall))} />
          <Stat label="Form" value={profile.fitness.formLabel} tone={colors.cyan} />
          <Stat label="Recovery" value={profile.recovery.label} tone={recoveryTone} />
          <Stat
            label="This week"
            value={`${distanceIn(profile.currentWeek.distanceM, unit).toFixed(0)} ${distanceLabel(unit)}`}
          />
          <Stat label="Streak" value={`${profile.streakWeeks}w`} />
        </Row>
      </Card>

      {/* Goal + plan ------------------------------------------------------ */}
      <View>
        <SectionHeader title="Goal and plan" />
        <Card style={{ gap: space.lg }}>
          {goalRace ? (
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Row gap={space.sm}>
                  <Icon name="trophy" size={14} color={colors.accent} />
                  <Text style={type.bodyStrong}>{goalRace.name}</Text>
                </Row>
                <Caption style={{ marginTop: 3 }}>
                  {prDistanceLabel(goalRace.distanceM)}
                  {goalRace.goalSeconds ? ` · target ${formatDuration(goalRace.goalSeconds)}` : ''}
                  {readiness ? ` · ${readiness.percent}% ready` : ''}
                </Caption>
                {readiness?.limiter ? (
                  <Caption style={{ marginTop: 3, fontSize: 12, color: colors.textTertiary }}>
                    Limiter: {readiness.limiter.label.toLowerCase()} — {readiness.limiter.detail.toLowerCase()}
                  </Caption>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[type.metric, { color: colors.accent }]}>
                  {Math.max(0, Math.round((new Date(`${goalRace.date}T00:00:00`).getTime() - Date.now()) / 86_400_000))}
                </Text>
                <Caption style={{ fontSize: 11, color: colors.textTertiary }}>days</Caption>
              </View>
            </Row>
          ) : (
            <Body style={{ fontSize: 13.5, lineHeight: 19 }}>
              No goal race on the calendar. {athlete.displayName.split(' ')[0]} is on the level ladder — Level{' '}
              {profile.level.level}, {profile.level.title}.
            </Body>
          )}

          <Divider />

          {activePlan ? (
            <>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Label style={{ color: colors.cyan }}>Assigned plan</Label>
                  <Text style={[type.subtitle, { marginTop: 4 }]}>{activePlan.name}</Text>
                  <Caption style={{ marginTop: 2 }}>
                    {activePlan.startsOn} → {activePlan.endsOn}
                  </Caption>
                </View>
                <Pill tone="cyan">
                  Week {planWeek(activePlan.startsOn)} of {planWeeks(activePlan.startsOn, activePlan.endsOn)}
                </Pill>
              </Row>
              <Row style={{ justifyContent: 'space-around' }}>
                <Stat label="Completed" value={String(counts.completed)} tone={colors.success} />
                <Stat label="Modified" value={String(counts.modified)} tone={colors.warn} />
                <Stat label="Missed" value={String(counts.missed)} tone={counts.missed ? colors.danger : colors.text} />
                <Stat label="Ahead" value={String(counts.upcoming)} />
              </Row>
              {nextKey.length > 0 ? (
                <View style={{ gap: space.sm }}>
                  {nextKey.map((w) => (
                    <Row key={w.id} gap={space.sm}>
                      <Icon name="target" size={13} color={colors.accent} />
                      <Caption style={{ flex: 1 }} numberOfLines={1}>
                        <Text style={{ color: colors.text, fontWeight: '700' }}>{w.title}</Text> ·{' '}
                        {new Date(`${w.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                        {w.targetDistanceM ? ` · ${distanceIn(w.targetDistanceM, unit).toFixed(0)} ${distanceLabel(unit)}` : ''}
                      </Caption>
                    </Row>
                  ))}
                </View>
              ) : null}
              <Button variant="secondary" onPress={() => router.push(`/coach/plan/${athlete.id}`)}>
                Open plan
              </Button>
            </>
          ) : (
            <>
              <Body style={{ fontSize: 13.5, lineHeight: 19 }}>
                No coach plan yet.{' '}
                {goalRace
                  ? `MOOV projects ${
                      projection ? formatDuration(projection.predictedSeconds) : 'a finish'
                    }${goalRace.goalSeconds ? ` against a ${formatDuration(goalRace.goalSeconds)} target` : ''} — a block built to the race would put the key sessions on their roadmap.`
                  : 'A block would give their training a destination.'}
              </Body>
              <Button onPress={() => router.push(`/coach/plan/${athlete.id}`)}>Create a plan</Button>
            </>
          )}
        </Card>
      </View>

      {/* Roadmap --------------------------------------------------------- */}
      <View>
        <SectionHeader title="Their roadmap" />
        <Card padded={false}>
          <View style={{ padding: space.lg, paddingBottom: 0 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={type.subtitle}>
                {roadmap.kind === 'race' ? roadmap.race.name : `Level ${roadmap.level} · ${roadmap.title}`}
              </Text>
              <Caption>{roadmap.doneCount}/{roadmap.checkpoints.length} banked</Caption>
            </Row>
            <Caption style={{ marginTop: 2 }}>{roadmap.summary}</Caption>
          </View>
          <RoadmapMap
            roadmap={roadmap}
            width={width - space.lg * 2}
            height={Math.min(380, (width - space.lg * 2) * 1.05)}
            selectedId={selected}
            onSelect={setSelected}
          />
        </Card>
      </View>

      {/* Intelligence ---------------------------------------------------- */}
      {insights.length > 0 ? (
        <View>
          <SectionHeader title="What MOOV noticed" />
          <View style={{ gap: space.md }}>
            {insights.slice(0, 3).map((insight) => (
              <InsightCard key={insight.id} insight={insight} compact />
            ))}
          </View>
        </View>
      ) : null}

      {/* Readiness ------------------------------------------------------- */}
      {readiness ? (
        <View>
          <SectionHeader title="Race readiness" />
          <Card style={{ gap: space.sm }}>
            {readiness.factors.map((f) => (
              <Row key={f.key} style={{ justifyContent: 'space-between' }}>
                <Caption style={{ color: colors.textSecondary, flex: 1 }}>{f.label}</Caption>
                <Row gap={space.sm}>
                  <View style={styles.miniTrack}>
                    <View
                      style={[
                        styles.trackFill,
                        { width: `${f.score}%`, backgroundColor: f.score >= 70 ? colors.success : colors.warn },
                      ]}
                    />
                  </View>
                  <Text style={[type.caption, { width: 26, textAlign: 'right', color: colors.textTertiary }]}>
                    {Math.round(f.score)}
                  </Text>
                </Row>
              </Row>
            ))}
          </Card>
        </View>
      ) : null}

      {/* Records + recent ------------------------------------------------ */}
      {profile.records.length > 0 ? (
        <View>
          <SectionHeader title="Personal records" />
          <Card padded={false}>
            {profile.records.slice(0, 4).map((r, i) => (
              <View key={r.id}>
                <Row style={{ padding: space.lg, paddingVertical: space.md }}>
                  <Icon name="trophy" size={14} color={colors.warn} />
                  <Text style={[type.bodyStrong, { flex: 1, fontSize: 14 }]}>{prDistanceLabel(r.distanceM)}</Text>
                  <Text style={[type.metricSmall, { fontSize: 16 }]}>{formatDuration(r.elapsedSeconds)}</Text>
                </Row>
                {i < Math.min(4, profile.records.length) - 1 ? <Divider /> : null}
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <View>
        <SectionHeader title="Recent training" />
        <Card padded={false}>
          {activities.slice(0, 6).map((a, i) => {
            const prescribed = plan.find((w) => w.completedActivityId === a.id);
            return (
              <View key={a.id}>
                <Pressable
                  onPress={() => router.push(`/activity/${a.id}`)}
                  style={({ pressed }) => [{ padding: space.lg, paddingVertical: space.md }, pressed && { opacity: 0.7 }]}
                >
                  <Row>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.bodyStrong, { fontSize: 14 }]} numberOfLines={1}>
                        {a.title}
                      </Text>
                      <Caption style={{ fontSize: 12, marginTop: 2 }}>
                        {relativeDayLabel(new Date(a.startedAt), new Date())}
                        {prescribed ? ` · prescribed: ${prescribed.title || WORKOUT_LABELS[prescribed.type]}` : ''}
                      </Caption>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[type.metricSmall, { fontSize: 16 }]}>
                        {distanceIn(a.distanceM, unit).toFixed(1)} {distanceLabel(unit)}
                      </Text>
                      <Caption style={{ fontSize: 11, color: colors.textTertiary }}>
                        {formatDurationCompact(a.movingSeconds)}
                      </Caption>
                    </View>
                  </Row>
                </Pressable>
                {i < Math.min(6, activities.length) - 1 ? <Divider /> : null}
              </View>
            );
          })}
        </Card>
      </View>
    </Screen>
  );
}

const planWeeks = (startsOn: string, endsOn: string) =>
  Math.max(1, Math.ceil((new Date(`${endsOn}T00:00:00`).getTime() - new Date(`${startsOn}T00:00:00`).getTime() + 86_400_000) / (7 * 86_400_000)));
const planWeek = (startsOn: string) =>
  Math.max(1, Math.floor((Date.now() - new Date(`${startsOn}T00:00:00`).getTime()) / (7 * 86_400_000)) + 1);

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <View style={{ alignItems: 'center' }}>
    <Text style={[type.metricSmall, { fontSize: 16, color: tone ?? colors.text, textTransform: 'capitalize' }]}>
      {value}
    </Text>
    <Caption style={{ fontSize: 10.5, color: colors.textTertiary, marginTop: 2 }}>{label}</Caption>
  </View>
);

const BackBar = ({ onPress }: { onPress: () => void }) => (
  <Pressable onPress={onPress} hitSlop={12} style={{ alignSelf: 'flex-start', marginBottom: space.sm }}>
    <Row gap={4}>
      <Icon name="chevronLeft" size={20} color={colors.textSecondary} />
      <Text style={[type.caption, { color: colors.textSecondary, fontWeight: '600' }]}>Athletes</Text>
    </Row>
  </Pressable>
);

const styles = {
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
};
