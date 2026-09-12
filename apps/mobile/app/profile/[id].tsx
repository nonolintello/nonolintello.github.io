import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  buildAthleteProfile,
  distanceIn,
  distanceLabel,
  elevationIn,
  elevationLabel,
  formatDuration,
  formatDurationCompact,
  formatPace,
  paceSecondsPerUnit,
  prDistanceLabel,
  relativeDayLabel,
  type Athlete,
  type AthleteProfile,
} from '@ai/core';
import { Screen } from '../../src/components/Screen';
import { Icon, type IconName } from '../../src/components/Icon';
import { ScoreRadar } from '../../src/components/charts';
import {
  Avatar,
  Body,
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

interface Badge {
  icon: IconName;
  title: string;
  detail: string;
  tone: string;
}

/**
 * Badges are derived from the profile rather than stored, so they can never
 * disagree with the numbers on the same screen.
 */
const badgesFor = (profile: AthleteProfile): Badge[] => {
  const out: Badge[] = [];

  if (profile.streakWeeks >= 4) {
    out.push({
      icon: 'flame',
      title: `${profile.streakWeeks}-week streak`,
      detail: 'Consecutive weeks with a run',
      tone: colors.accent,
    });
  }

  const longest = Math.max(0, ...profile.trailingWeeks.map((w) => w.longestRunM));
  if (longest > 0) {
    out.push({
      icon: 'clock',
      title: `${(longest / 1000).toFixed(1)} km`,
      detail: 'Longest run in 12 weeks',
      tone: colors.cyan,
    });
  }

  const improved = profile.records.filter((r) => r.previousElapsedSeconds != null).length;
  if (improved > 0) {
    out.push({
      icon: 'trophy',
      title: `${improved} record${improved === 1 ? '' : 's'}`,
      detail: 'Personal bests beaten',
      tone: colors.warn,
    });
  }

  if (profile.totals.elevationGainM > 1000) {
    out.push({
      icon: 'mountain',
      title: `${Math.round(profile.totals.elevationGainM).toLocaleString()} m`,
      detail: 'Total elevation climbed',
      tone: colors.violet,
    });
  }

  return out;
};

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { me, profile: myProfile, repository, athleteById, events, raceEntries, coach, myCoach } = useApp();

  const athleteId = String(id);
  const isMe = athleteId === me.id;

  const [athlete, setAthlete] = useState<Athlete | null>(isMe ? me : (athleteById(athleteId) ?? null));
  const [profile, setProfile] = useState<AthleteProfile | null>(isMe ? myProfile : null);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    if (isMe) {
      setAthlete(me);
      setProfile(myProfile);
      return;
    }
    let cancelled = false;
    (async () => {
      const [found, activities, isFollowing] = await Promise.all([
        repository.getAthlete(athleteId),
        repository.getActivities(athleteId),
        repository.isFollowing(athleteId),
      ]);
      if (cancelled || !found) return;
      setAthlete(found);
      setProfile(buildAthleteProfile(found, activities, null));
      setFollowing(isFollowing);
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId, isMe, me, myProfile, repository]);

  if (!athlete || !profile) {
    return (
      <Screen contentStyle={{ paddingHorizontal: space.lg }}>
        <BackBar onPress={() => router.back()} />
        <Caption>Loading profile…</Caption>
      </Screen>
    );
  }

  const unit = me.unitPreference;
  const badges = badgesFor(profile);

  // This athlete's start-list entries joined to their events, soonest first.
  // Past events drop off: a profile shows what someone is building toward.
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = raceEntries
    .filter((e) => e.athleteId === athleteId)
    .flatMap((entry) => {
      const event = events.find((ev) => ev.id === entry.eventId);
      return event && event.date >= today ? [{ entry, event }] : [];
    })
    .sort((a, b) => a.event.date.localeCompare(b.event.date));
  const racingWithMe = new Set(
    raceEntries.filter((e) => e.athleteId === me.id).map((e) => e.eventId),
  );

  return (
    <Screen contentStyle={{ paddingHorizontal: space.lg, gap: space.xl }}>
      <BackBar onPress={() => router.back()} />

      {/* Athlete card ------------------------------------------------------ */}
      <Card style={{ alignItems: 'center', paddingVertical: space.xl }}>
        <Avatar name={athlete.displayName} size={82} />
        <Text style={[type.title, { fontSize: 22, marginTop: space.md }]}>{athlete.displayName}</Text>
        <Caption style={{ color: colors.textTertiary, marginTop: 2 }}>
          @{athlete.handle}
          {athlete.location ? ` · ${athlete.location}` : ''}
        </Caption>

        {athlete.bio ? (
          <Body style={{ textAlign: 'center', marginTop: space.md, paddingHorizontal: space.md }}>
            {athlete.bio}
          </Body>
        ) : null}

        <Row gap={space.sm} style={{ marginTop: space.lg }}>
          <Pill tone="violet">
            Level {profile.level.level} · {profile.level.title}
          </Pill>
          {profile.streakWeeks >= 2 ? (
            <Pill tone="accent" icon={<Icon name="flame" size={12} color={colors.accent} />}>
              {profile.streakWeeks}w streak
            </Pill>
          ) : null}
        </Row>

        {/* Level progress */}
        <View style={{ alignSelf: 'stretch', marginTop: space.lg }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <Caption style={{ fontSize: 12, color: colors.textTertiary }}>
              {profile.level.xpIntoLevel.toLocaleString()} XP
            </Caption>
            <Caption style={{ fontSize: 12, color: colors.textTertiary }}>
              {(profile.level.xpForNextLevel - profile.level.xpIntoLevel).toLocaleString()} to level{' '}
              {profile.level.level + 1}
            </Caption>
          </Row>
          <View style={styles.track}>
            <View
              style={[
                styles.trackFill,
                { width: `${profile.level.progress * 100}%`, backgroundColor: colors.violet },
              ]}
            />
          </View>
        </View>

        {!isMe ? (
          <Pressable
            onPress={async () => setFollowing(await repository.toggleFollow(athleteId))}
            style={{
              marginTop: space.lg,
              paddingHorizontal: space.xl,
              paddingVertical: 11,
              borderRadius: radius.pill,
              backgroundColor: following ? 'rgba(255,255,255,0.07)' : colors.accent,
            }}
          >
            <Text
              style={{
                fontWeight: '700',
                fontSize: 14,
                color: following ? colors.textSecondary : colors.textInverse,
              }}
            >
              {following ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
        ) : null}
      </Card>

      {/* Lifetime totals --------------------------------------------------- */}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Total
            label="Activities"
            value={profile.totals.activityCount.toLocaleString()}
          />
          <Total
            label="Distance"
            value={Math.round(distanceIn(profile.totals.distanceM, unit)).toLocaleString()}
            unit={distanceLabel(unit)}
          />
          <Total
            label="Time"
            value={formatDurationCompact(profile.totals.movingSeconds)}
          />
          <Total
            label="Climb"
            value={Math.round(elevationIn(profile.totals.elevationGainM, unit)).toLocaleString()}
            unit={elevationLabel(unit)}
          />
        </Row>
      </Card>

      {/* Upcoming races ---------------------------------------------------- */}
      {upcoming.length > 0 ? (
        <View>
          <SectionHeader title="Next races" />
          <Card padded={false}>
            {upcoming.map(({ entry, event }, i) => {
              const date = new Date(`${event.date}T00:00:00`);
              const others = raceEntries.filter(
                (e) => e.eventId === event.id && e.athleteId !== athleteId,
              ).length;
              return (
                <View key={entry.id}>
                  <Pressable
                    onPress={() => router.push(`/event/${event.id}`)}
                    style={({ pressed }) => [
                      { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, paddingVertical: space.md },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <View style={{ width: 44, alignItems: 'center' }}>
                      <Text style={[type.label, { color: colors.accent, fontSize: 9.5 }]}>
                        {date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}
                      </Text>
                      <Text style={[type.metricSmall, { fontSize: 18 }]}>{date.getDate()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={type.bodyStrong} numberOfLines={1}>
                        {event.name}
                      </Text>
                      <Caption style={{ fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                        {event.distanceM ? `${prDistanceLabel(event.distanceM)} · ` : ''}
                        {!isMe && racingWithMe.has(event.id)
                          ? "You're racing this too"
                          : others > 0
                            ? `${others} ${others === 1 ? 'other' : 'others'} from MOOV`
                            : event.location}
                      </Caption>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {entry.expectedSeconds != null ? (
                        <>
                          <Text style={[type.metricSmall, { fontSize: 17 }]}>
                            {formatDuration(entry.expectedSeconds)}
                          </Text>
                          {event.distanceM ? (
                            <Caption style={{ fontSize: 11, color: colors.textTertiary }}>
                              {formatPace(paceSecondsPerUnit(event.distanceM, entry.expectedSeconds, unit))} /
                              {distanceLabel(unit)}
                            </Caption>
                          ) : null}
                        </>
                      ) : (
                        <Caption style={{ fontSize: 12, color: colors.textTertiary }}>No target</Caption>
                      )}
                    </View>
                    <Icon name="chevronRight" size={16} color={colors.textTertiary} />
                  </Pressable>
                  {i < upcoming.length - 1 ? <Divider /> : null}
                </View>
              );
            })}
          </Card>
        </View>
      ) : null}

      {/* Athlete score ----------------------------------------------------- */}
      <View>
        <SectionHeader title="Athlete score" />
        <Card style={{ alignItems: 'center' }}>
          <Row gap={6} style={{ alignItems: 'flex-end' }}>
            <Text style={[type.display, { fontSize: 46, lineHeight: 48 }]}>
              {Math.round(profile.score.overall)}
            </Text>
            <Text style={[type.caption, { color: colors.textTertiary, marginBottom: 7 }]}>/ 100</Text>
          </Row>
          {!profile.score.hasSufficientData ? (
            <Caption style={{ marginTop: 4, textAlign: 'center' }}>
              Limited recent history — this score will sharpen with more training
            </Caption>
          ) : null}
          <ScoreRadar
            size={Math.min(310, width - space.lg * 3)}
            color={isMe ? colors.accent : colors.cyan}
            axes={[
              { label: 'Speed', value: profile.score.speed.value },
              { label: 'Endurance', value: profile.score.endurance.value },
              { label: 'Climbing', value: profile.score.climbing.value },
              { label: 'Progress', value: profile.score.progression.value },
              { label: 'Consistency', value: profile.score.consistency.value },
            ]}
          />
        </Card>
      </View>

      {/* Badges ------------------------------------------------------------ */}
      {badges.length > 0 ? (
        <View>
          <SectionHeader title="Achievements" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            {badges.map((b) => (
              <Card key={b.title} style={{ width: (width - space.lg * 2 - space.md) / 2 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: radius.sm,
                    backgroundColor: `${b.tone}22`,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: space.md,
                  }}
                >
                  <Icon name={b.icon} size={16} color={b.tone} />
                </View>
                <Text style={[type.metricSmall, { fontSize: 18 }]}>{b.title}</Text>
                <Caption style={{ fontSize: 11.5, marginTop: 3, color: colors.textTertiary }}>
                  {b.detail}
                </Caption>
              </Card>
            ))}
          </View>
        </View>
      ) : null}

      {/* Records ----------------------------------------------------------- */}
      {profile.records.length > 0 ? (
        <View>
          <SectionHeader title="Personal records" />
          <Card padded={false}>
            {profile.records.map((r, i) => (
              <View key={r.id}>
                <Pressable
                  onPress={() => r.activityId && router.push(`/activity/${r.activityId}`)}
                >
                  <Row style={{ padding: space.lg, paddingVertical: space.md }}>
                    <Icon name="trophy" size={16} color={colors.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={[type.bodyStrong, { fontSize: 14.5 }]}>
                        {prDistanceLabel(r.distanceM)}
                      </Text>
                      <Caption style={{ fontSize: 11.5, color: colors.textTertiary, marginTop: 1 }}>
                        {relativeDayLabel(new Date(r.achievedAt), new Date())}
                      </Caption>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[type.metricSmall, { fontSize: 17 }]}>
                        {formatDuration(r.elapsedSeconds)}
                      </Text>
                      {r.previousElapsedSeconds != null ? (
                        <Caption style={{ fontSize: 11.5, color: colors.success, marginTop: 1 }}>
                          −{Math.round(r.previousElapsedSeconds - r.elapsedSeconds)}s
                        </Caption>
                      ) : null}
                    </View>
                  </Row>
                </Pressable>
                {i < profile.records.length - 1 ? <Divider /> : null}
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {/* Recent ------------------------------------------------------------ */}
      <View>
        <SectionHeader title="Recent activity" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space.md, paddingRight: space.lg }}
        >
          {profile.recentActivities.slice(0, 8).map((a) => (
            <Card
              key={a.id}
              style={{ width: 150 }}
              onPress={() => router.push(`/activity/${a.id}`)}
            >
              <Label>{relativeDayLabel(new Date(a.startedAt), new Date())}</Label>
              <Text style={[type.metricSmall, { marginTop: space.sm }]}>
                {distanceIn(a.distanceM, unit).toFixed(1)}
                <Text style={[type.caption, { color: colors.textTertiary }]}> {distanceLabel(unit)}</Text>
              </Text>
              <Caption style={{ fontSize: 12, marginTop: 4 }} >
                {formatDurationCompact(a.movingSeconds)}
              </Caption>
              <Text style={[type.caption, { fontSize: 12, marginTop: space.sm }]} numberOfLines={2}>
                {a.title}
              </Text>
            </Card>
          ))}
        </ScrollView>
      </View>

      {isMe ? (
        <Card onPress={() => router.push(coach ? '/coach' : '/coach/login')} style={{ borderColor: colors.cyanSoft }}>
          <Row gap={space.md}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: radius.sm,
                backgroundColor: colors.cyanSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="community" size={18} color={colors.cyan} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>{coach ? `Coach mode · ${coach.displayName}` : 'MOOV for coaches'}</Text>
              <Body style={{ fontSize: 13, marginTop: 3, lineHeight: 18 }}>
                {coach
                  ? 'Back to your athletes, plans and roster.'
                  : myCoach
                    ? `You're coached by ${myCoach.displayName}. Coaches sign in here.`
                    : 'Manage athletes and prescribe training from what MOOV knows about them.'}
              </Body>
            </View>
            <Icon name="chevronRight" size={16} color={colors.textTertiary} />
          </Row>
        </Card>
      ) : null}

      {isMe ? (
        <Card>
          <Row gap={space.md}>
            <Icon name="settings" size={18} color={colors.textTertiary} />
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>Privacy</Text>
              <Body style={{ fontSize: 13, marginTop: 3, lineHeight: 18 }}>
                Profile is {athlete.profileVisibility}. New activities default to{' '}
                {athlete.defaultActivityVisibility}, with {athlete.routePrivacyRadiusM} m hidden at each
                end of every route.
              </Body>
            </View>
          </Row>
        </Card>
      ) : null}
    </Screen>
  );
}

const BackBar = ({ onPress }: { onPress: () => void }) => (
  <Pressable onPress={onPress} hitSlop={12} style={{ alignSelf: 'flex-start', marginBottom: space.sm }}>
    <Row gap={4}>
      <Icon name="chevronLeft" size={20} color={colors.textSecondary} />
      <Text style={[type.caption, { color: colors.textSecondary, fontWeight: '600' }]}>Back</Text>
    </Row>
  </Pressable>
);

const Total = ({ label, value, unit }: { label: string; value: string; unit?: string }) => (
  <View>
    <Label style={{ marginBottom: 5 }}>{label}</Label>
    <Row gap={3} style={{ alignItems: 'flex-end' }}>
      <Text style={[type.metricSmall, { fontSize: 18 }]}>{value}</Text>
      {unit ? (
        <Text style={[type.caption, { fontSize: 11, color: colors.textTertiary, marginBottom: 2 }]}>
          {unit}
        </Text>
      ) : null}
    </Row>
  </View>
);

const styles = {
  track: {
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden' as const,
  },
  trackFill: {
    height: '100%' as const,
    borderRadius: radius.pill,
  },
};
