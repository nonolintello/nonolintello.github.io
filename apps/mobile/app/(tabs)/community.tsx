import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { distanceIn, distanceLabel, type Challenge } from '@ai/core';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ActivityCard } from '../../src/components/ActivityCard';
import { Icon, type IconName } from '../../src/components/Icon';
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

type FeedFilter = 'following' | 'friends' | 'suggested';

const CHALLENGE_ICON: Record<Challenge['kind'], IconName> = {
  distance: 'target',
  duration: 'clock',
  activity_count: 'flame',
  elevation_gain: 'mountain',
  streak: 'flame',
  personal_best: 'trophy',
  head_to_head: 'community',
};

export default function CommunityScreen() {
  const {
    feed,
    me,
    athleteById,
    toggleLike,
    loadMoreFeed,
    challenges,
    participations,
    leaderboards,
    unreadCount,
    suggested,
  } = useApp();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<FeedFilter>('following');
  const [board, setBoard] = useState<'friends' | 'club'>('friends');
  const unit = me.unitPreference;

  // "Friends" is the subset that follows back; suggested is everyone else.
  const FRIEND_IDS = new Set(['athlete-noe', 'athlete-mara', 'athlete-jonas']);
  const visible = feed.filter((a) => {
    if (filter === 'friends') return FRIEND_IDS.has(a.athleteId) || a.athleteId === me.id;
    if (filter === 'suggested') return !FRIEND_IDS.has(a.athleteId) && a.athleteId !== me.id;
    return true;
  });

  const headToHead = challenges.find((c) => c.kind === 'head_to_head');

  return (
    <Screen
      contentStyle={{ paddingHorizontal: space.lg, gap: space.lg }}
      onEndReached={loadMoreFeed}
    >
      <ScreenHeader
        eyebrow="Connect me"
        title="Community"
        athleteName={me.displayName}
        athleteId={me.id}
        unreadCount={unreadCount}
      />

      {/* Challenges -------------------------------------------------------- */}
      <View>
        <SectionHeader title="Challenges" />
        <View style={{ gap: space.md }}>
          {headToHead ? (
            <Card style={{ borderColor: colors.accentSoft }}>
              <Row gap={space.sm} style={{ marginBottom: space.md }}>
                <Icon name="community" size={15} color={colors.accent} />
                <Label style={{ color: colors.accent }}>Head to head</Label>
                <View style={{ flex: 1 }} />
                <Caption style={{ fontSize: 12, color: colors.textTertiary }}>3 days left</Caption>
              </Row>

              {(leaderboards.friends ?? []).slice(0, 2).map((entry) => {
                const top = (leaderboards.friends ?? [])[0]?.value ?? 1;
                return (
                  <View key={entry.athleteId} style={{ marginBottom: space.md }}>
                    <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                      <Row gap={space.sm}>
                        <Avatar name={entry.displayName} size={26} />
                        <Text
                          style={[
                            type.bodyStrong,
                            { fontSize: 14, color: entry.isMe ? colors.accent : colors.text },
                          ]}
                        >
                          {entry.isMe ? 'You' : entry.displayName}
                        </Text>
                      </Row>
                      <Text style={[type.metricSmall, { fontSize: 16 }]}>
                        {distanceIn(entry.value, unit).toFixed(1)} {distanceLabel(unit)}
                      </Text>
                    </Row>
                    <View style={styles.track}>
                      <View
                        style={[
                          styles.trackFill,
                          {
                            width: `${(entry.value / top) * 100}%`,
                            backgroundColor: entry.isMe ? colors.accent : 'rgba(255,255,255,0.22)',
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </Card>
          ) : null}

          {challenges
            .filter((c) => c.kind !== 'head_to_head')
            .map((c) => {
              const p = participations.find((x) => x.challengeId === c.id);
              const ratio = c.targetValue && p ? Math.min(1, p.progressValue / c.targetValue) : 0;
              const accent = c.accentColor ?? colors.accent;
              const fmt = (v: number) =>
                c.kind === 'distance'
                  ? `${distanceIn(v, unit).toFixed(0)} ${distanceLabel(unit)}`
                  : c.kind === 'elevation_gain'
                    ? `${Math.round(v).toLocaleString()} m`
                    : `${Math.round(v)} runs`;

              return (
                <Card key={c.id}>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Row gap={space.md} style={{ flex: 1 }}>
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: radius.sm,
                          backgroundColor: `${accent}22`,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon name={CHALLENGE_ICON[c.kind]} size={16} color={accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={type.subtitle}>{c.name}</Text>
                        <Caption style={{ fontSize: 12, marginTop: 2, color: colors.textTertiary }}>
                          {c.participantCount.toLocaleString()} athletes
                        </Caption>
                      </View>
                    </Row>
                    {c.isOfficial ? <Pill tone="cyan">Official</Pill> : null}
                  </Row>

                  {p && c.targetValue ? (
                    <View style={{ marginTop: space.lg }}>
                      <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={[type.caption, { color: colors.text, fontWeight: '700' }]}>
                          {fmt(p.progressValue)}
                        </Text>
                        <Caption style={{ color: colors.textTertiary }}>of {fmt(c.targetValue)}</Caption>
                      </Row>
                      <View style={styles.track}>
                        <View
                          style={[styles.trackFill, { width: `${ratio * 100}%`, backgroundColor: accent }]}
                        />
                      </View>
                      {p.rank ? (
                        <Caption style={{ marginTop: 8, fontSize: 12, color: colors.textTertiary }}>
                          Rank #{p.rank.toLocaleString()} of {c.participantCount.toLocaleString()}
                        </Caption>
                      ) : null}
                    </View>
                  ) : (
                    <Row style={{ marginTop: space.md, justifyContent: 'space-between' }}>
                      <Caption style={{ color: colors.textTertiary }}>{c.description}</Caption>
                      <Pill tone="accent">+{c.xpReward} XP</Pill>
                    </Row>
                  )}
                </Card>
              );
            })}
        </View>
      </View>

      {/* Leaderboard ------------------------------------------------------- */}
      <View>
        <SectionHeader title="Leaderboard" />
        <Card padded={false}>
          <View style={{ padding: space.md, paddingBottom: 0 }}>
            <View style={styles.segmented}>
              {(['friends', 'club'] as const).map((key) => {
                const active = board === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setBoard(key)}
                    style={[styles.segment, active && { backgroundColor: colors.surfaceRaised }]}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: active ? colors.text : colors.textTertiary,
                        textTransform: 'capitalize',
                      }}
                    >
                      {key}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Label style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm }}>
            Weekly distance
          </Label>

          {(leaderboards[board] ?? []).map((entry, i, all) => (
            <View key={entry.athleteId}>
              <Row
                style={{
                  paddingHorizontal: space.lg,
                  paddingVertical: space.md,
                  backgroundColor: entry.isMe ? 'rgba(255,90,54,0.06)' : 'transparent',
                }}
              >
                <Text
                  style={[
                    type.caption,
                    { width: 24, color: entry.rank <= 3 ? colors.accent : colors.textTertiary, fontWeight: '700' },
                  ]}
                >
                  {entry.rank}
                </Text>
                <Avatar name={entry.displayName} size={32} />
                <Text
                  style={[
                    type.bodyStrong,
                    { flex: 1, fontSize: 14, color: entry.isMe ? colors.accent : colors.text },
                  ]}
                  numberOfLines={1}
                >
                  {entry.isMe ? 'You' : entry.displayName}
                </Text>
                <Text style={[type.metricSmall, { fontSize: 16 }]}>
                  {distanceIn(entry.value, unit).toFixed(1)}
                </Text>
              </Row>
              {i < all.length - 1 ? <Divider /> : null}
            </View>
          ))}
        </Card>
      </View>

      {/* Feed -------------------------------------------------------------- */}
      <View>
        <SectionHeader title="Feed" />
        <View style={styles.segmented}>
          {(['following', 'friends', 'suggested'] as const).map((key) => {
            const active = filter === key;
            return (
              <Pressable
                key={key}
                onPress={() => setFilter(key)}
                style={[styles.segment, active && { backgroundColor: colors.surfaceRaised }]}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: active ? colors.text : colors.textTertiary,
                    textTransform: 'capitalize',
                  }}
                >
                  {key}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {visible.length === 0 ? (
        <Card>
          <Body>No activities in this view yet.</Body>
        </Card>
      ) : (
        visible.map((activity) => {
          const athlete = athleteById(activity.athleteId);
          const isMine = activity.athleteId === me.id;
          return (
            <ActivityCard
              key={activity.id}
              activity={activity}
              athlete={athlete}
              unit={unit}
              privacyRadiusM={isMine ? 0 : (athlete?.routePrivacyRadiusM ?? 200)}
              onLike={() => toggleLike(activity.id)}
            />
          );
        })
      )}

      {/* Athletes ---------------------------------------------------------- */}
      <View>
        <SectionHeader title="Athletes you follow" />
        <Card padded={false}>
          {suggested.map((a, i) => (
            <View key={a.id}>
              <Pressable onPress={() => router.push(`/profile/${a.id}`)}>
                <Row style={{ padding: space.lg, paddingVertical: space.md }}>
                  <Avatar name={a.displayName} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.bodyStrong} numberOfLines={1}>
                      {a.displayName}
                    </Text>
                    <Caption style={{ fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                      @{a.handle} · {a.location}
                    </Caption>
                  </View>
                  <Icon name="chevronRight" size={16} color={colors.textTertiary} />
                </Row>
              </Pressable>
              {i < suggested.length - 1 ? <Divider /> : null}
            </View>
          ))}
        </Card>
      </View>

      <View style={{ alignItems: 'center', paddingVertical: space.lg }}>
        <Caption style={{ color: colors.textTertiary }}>You're all caught up</Caption>
      </View>
    </Screen>
  );
}

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
  segmented: {
    flexDirection: 'row' as const,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: radius.sm,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    height: 36,
    borderRadius: radius.sm - 3,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
};
