import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  buildAthleteProfile,
  distanceIn,
  distanceLabel,
  type Athlete,
  type AthleteProfile,
  type CoachAthleteLink,
  type Race,
  type TrainingPlan,
} from '@ai/core';
import { Screen } from '../../src/components/Screen';
import { Icon } from '../../src/components/Icon';
import { Avatar, Body, Button, Caption, Card, Divider, Label, Pill, Row, SectionHeader } from '../../src/components/ui';
import { useApp } from '../../src/data/store';
import { colors, hairline, radius, space, type } from '../../src/theme/tokens';

interface Roster {
  link: CoachAthleteLink;
  athlete: Athlete;
  profile: AthleteProfile | null;
  goalRace: Race | null;
  plan: TrainingPlan | null;
}

/**
 * The coach's home: every athlete they work with, each with the two or three
 * numbers a coach glances at before opening someone up — this week's volume,
 * how they're recovering, and whether there is a plan in flight.
 */
export default function CoachDashboard() {
  const router = useRouter();
  const { coach, signOutCoach, repository } = useApp();
  const [roster, setRoster] = useState<Roster[]>([]);
  const [handle, setHandle] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Athlete[]>([]);
  const unit = 'imperial' as const;

  const load = useCallback(async () => {
    if (!coach) return;
    const links = await repository.getCoachLinks(coach.id);
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const rows = await Promise.all(
      links.map(async (link): Promise<Roster | null> => {
        const athlete = await repository.getAthlete(link.athleteId);
        if (!athlete) return null;
        if (link.status !== 'connected') {
          return { link, athlete, profile: null, goalRace: null, plan: null };
        }
        const [activities, races, plans] = await Promise.all([
          repository.getActivities(athlete.id),
          repository.getRaces(athlete.id),
          repository.getPlans(athlete.id),
        ]);
        const profile = buildAthleteProfile(athlete, activities, null, now, { races });
        const goalRace = races.find((r) => r.isGoalRace && r.date >= todayIso) ?? null;
        const plan = plans.find((p) => p.endsOn >= todayIso) ?? null;
        return { link, athlete, profile, goalRace, plan };
      }),
    );
    const list = rows.filter((r): r is Roster => r !== null);
    setRoster(list);
    const linked = new Set(list.map((r) => r.athlete.id));
    const all = await repository.searchAthletes('');
    setCandidates(all.filter((a) => !linked.has(a.id) && a.id !== coach.athleteId));
  }, [coach, repository]);

  // Only an arrival without a session goes to sign-in; signing out from here
  // navigates away itself, and the stale screen must not fight it.
  useEffect(() => {
    if (!coach) router.replace('/coach/login');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (coach) void load();
    }, [coach, load]),
  );

  if (!coach) return null;

  const invite = async (target: string) => {
    setInviteError(null);
    try {
      await repository.inviteAthlete(coach.id, target);
      setHandle('');
      await load();
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Could not invite');
    }
  };

  const connected = roster.filter((r) => r.link.status === 'connected');
  const pending = roster.filter((r) => r.link.status !== 'connected');

  return (
    <Screen contentStyle={{ paddingHorizontal: space.lg, gap: space.xl }}>
      {/* Header ---------------------------------------------------------- */}
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Label style={{ color: colors.cyan }}>Coach mode</Label>
          <Text style={[type.display, { fontSize: 30, lineHeight: 34, marginTop: 4 }]}>{coach.displayName}</Text>
          {coach.credential ? <Caption style={{ marginTop: 3 }}>{coach.credential}</Caption> : null}
        </View>
        <Pressable
          onPress={() => {
            router.replace('/');
            signOutCoach();
          }}
          style={{
            paddingHorizontal: space.md,
            paddingVertical: 8,
            borderRadius: radius.pill,
            borderWidth: hairline,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <Text style={[type.caption, { fontWeight: '700', color: colors.textSecondary }]}>Athlete view</Text>
        </Pressable>
      </Row>

      <Card>
        <Row style={{ justifyContent: 'space-around' }}>
          <Stat label="Athletes" value={String(connected.length)} />
          <Stat label="Invited" value={String(pending.length)} />
          <Stat label="With a plan" value={String(connected.filter((r) => r.plan).length)} />
          <Stat
            label="Racing soon"
            value={String(connected.filter((r) => r.goalRace).length)}
          />
        </Row>
      </Card>

      {/* Roster ---------------------------------------------------------- */}
      <View>
        <SectionHeader title="Your athletes" />
        <Card padded={false}>
          {connected.length === 0 ? (
            <Caption style={{ padding: space.lg }}>No athletes yet. Invite one below.</Caption>
          ) : (
            connected.map((r, i) => {
              const p = r.profile;
              const weekM = p?.currentWeek.distanceM ?? 0;
              const recovery = p?.recovery.label;
              const recoveryTone =
                recovery === 'excellent' || recovery === 'good'
                  ? colors.success
                  : recovery === 'fair'
                    ? colors.warn
                    : colors.danger;
              const daysToRace = r.goalRace
                ? Math.max(0, Math.round((new Date(`${r.goalRace.date}T00:00:00`).getTime() - Date.now()) / 86_400_000))
                : null;
              return (
                <View key={r.athlete.id}>
                  <Pressable
                    onPress={() => router.push(`/coach/athlete/${r.athlete.id}`)}
                    style={({ pressed }) => [{ padding: space.lg, paddingVertical: space.md }, pressed && { opacity: 0.7 }]}
                  >
                    <Row>
                      <Avatar name={r.athlete.displayName} size={42} />
                      <View style={{ flex: 1 }}>
                        <Text style={type.bodyStrong}>{r.athlete.displayName}</Text>
                        <Caption style={{ fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                          {r.goalRace
                            ? `${r.goalRace.name} in ${daysToRace}d`
                            : `Level ${p?.level.level ?? '—'} · ${p?.level.title ?? ''}`}
                          {r.plan ? ` · ${r.plan.name}` : ' · No plan'}
                        </Caption>
                        <Row gap={space.md} style={{ marginTop: 6 }}>
                          <Caption style={{ fontSize: 11.5 }}>
                            <Text style={{ color: colors.text, fontWeight: '700' }}>
                              {distanceIn(weekM, unit).toFixed(0)} {distanceLabel(unit)}
                            </Text>{' '}
                            this week
                          </Caption>
                          {recovery ? (
                            <Caption style={{ fontSize: 11.5 }}>
                              recovery <Text style={{ color: recoveryTone, fontWeight: '700' }}>{recovery}</Text>
                            </Caption>
                          ) : null}
                        </Row>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[type.metricSmall, { fontSize: 18 }]}>{Math.round(p?.score.overall ?? 0)}</Text>
                        <Caption style={{ fontSize: 10.5, color: colors.textTertiary }}>score</Caption>
                      </View>
                      <Icon name="chevronRight" size={16} color={colors.textTertiary} />
                    </Row>
                  </Pressable>
                  {i < connected.length - 1 ? <Divider /> : null}
                </View>
              );
            })
          )}
        </Card>
      </View>

      {/* Pending ---------------------------------------------------------- */}
      {pending.length > 0 ? (
        <View>
          <SectionHeader title="Invitations sent" />
          <Card padded={false}>
            {pending.map((r, i) => (
              <View key={r.athlete.id}>
                <Row style={{ padding: space.lg, paddingVertical: space.md }}>
                  <Avatar name={r.athlete.displayName} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.bodyStrong}>{r.athlete.displayName}</Text>
                    <Caption style={{ fontSize: 12 }}>@{r.athlete.handle} · waiting for them to accept</Caption>
                  </View>
                  <Pill tone="warn">Invited</Pill>
                  <Pressable
                    hitSlop={8}
                    onPress={async () => {
                      await repository.removeAthlete(coach.id, r.athlete.id);
                      await load();
                    }}
                  >
                    <Icon name="close" size={16} color={colors.textTertiary} />
                  </Pressable>
                </Row>
                {i < pending.length - 1 ? <Divider /> : null}
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {/* Invite ---------------------------------------------------------- */}
      <View>
        <SectionHeader title="Invite an athlete" />
        <Card style={{ gap: space.md }}>
          <Row gap={space.sm}>
            <TextInput
              value={handle}
              onChangeText={setHandle}
              autoCapitalize="none"
              placeholder="@handle on MOOV"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { flex: 1 }]}
              onSubmitEditing={() => handle && invite(handle)}
            />
            <Button onPress={() => handle && invite(handle)}>Invite</Button>
          </Row>
          {inviteError ? <Caption style={{ color: colors.danger }}>{inviteError}</Caption> : null}
          {candidates.length > 0 ? (
            <View>
              <Caption style={{ fontSize: 11.5, color: colors.textTertiary, marginBottom: space.sm }}>
                On MOOV and not yet coached
              </Caption>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {candidates.slice(0, 6).map((a) => (
                  <Pressable
                    key={a.id}
                    onPress={() => invite(a.handle)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingLeft: 4,
                      paddingRight: space.md,
                      paddingVertical: 4,
                      borderRadius: radius.pill,
                      backgroundColor: 'rgba(255,255,255,0.05)',
                    }}
                  >
                    <Avatar name={a.displayName} size={22} />
                    <Text style={[type.caption, { color: colors.text }]}>@{a.handle}</Text>
                    <Icon name="plus" size={11} color={colors.accent} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </Card>
      </View>

      <Body style={{ fontSize: 12.5, lineHeight: 18, color: colors.textTertiary, textAlign: 'center' }}>
        Athletes share their data once they accept. You see what MOOV Intelligence sees.
      </Body>
    </Screen>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <View style={{ alignItems: 'center' }}>
    <Text style={[type.metricSmall, { fontSize: 20 }]}>{value}</Text>
    <Caption style={{ fontSize: 10.5, color: colors.textTertiary, marginTop: 2 }}>{label}</Caption>
  </View>
);

const styles = {
  input: {
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: hairline,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    color: colors.text,
    fontSize: 15,
  },
};
