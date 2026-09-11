import { useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { distanceIn, distanceLabel, elevationIn, elevationLabel, prDistanceLabel } from '@ai/core';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { RouteMap } from '../../src/components/RouteMap';
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

type Section = 'foryou' | 'content' | 'athletes' | 'clubs' | 'events' | 'routes';

const SECTIONS: { value: Section; label: string }[] = [
  { value: 'foryou', label: 'For you' },
  { value: 'content', label: 'Content' },
  { value: 'athletes', label: 'Athletes' },
  { value: 'clubs', label: 'Clubs' },
  { value: 'events', label: 'Events' },
  { value: 'routes', label: 'Routes' },
];

export default function DiscoverScreen() {
  const { me, suggested, content, clubs, events, routes, challenges, repository, unreadCount } = useApp();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const unit = me.unitPreference;
  const [section, setSection] = useState<Section>('foryou');
  const [following, setFollowing] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(suggested.map((a) => [a.id, true])),
  );
  const [joined, setJoined] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(clubs.map((c) => [c.id, Boolean(c.joined)])),
  );

  const toggleFollow = async (id: string) => {
    const next = await repository.toggleFollow(id);
    setFollowing((prev) => ({ ...prev, [id]: next }));
  };

  const cardWidth = width - space.lg * 2;

  const ContentCard = ({ item, wide = false }: { item: (typeof content)[number]; wide?: boolean }) => (
    <Card padded={false} style={{ width: wide ? cardWidth : 176 }}>
      <View
        style={{
          height: wide ? 150 : 200,
          backgroundColor: `${item.accent}1F`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: item.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="play" size={18} color={colors.textInverse} strokeWidth={2} />
        </View>
        <View style={{ position: 'absolute', top: space.md, left: space.md }}>
          <Pill tone="neutral">{item.topic}</Pill>
        </View>
        {item.dataBacked ? (
          <View style={{ position: 'absolute', top: space.md, right: space.md }}>
            <Pill tone="cyan" icon={<Icon name="pulse" size={10} color={colors.cyan} />}>
              Data-backed
            </Pill>
          </View>
        ) : null}
        <Text
          style={[
            type.label,
            { position: 'absolute', bottom: space.md, right: space.md, color: colors.text },
          ]}
        >
          {item.durationLabel}
        </Text>
      </View>
      <View style={{ padding: space.md }}>
        <Text style={[type.bodyStrong, { fontSize: 14, lineHeight: 19 }]} numberOfLines={wide ? 2 : 3}>
          {item.title}
        </Text>
        <Caption style={{ fontSize: 12, marginTop: 5, color: colors.textTertiary }}>
          {item.authorName}
        </Caption>
        {wide && item.summary ? (
          <Body style={{ fontSize: 13, lineHeight: 18, marginTop: space.sm }}>{item.summary}</Body>
        ) : null}
      </View>
    </Card>
  );

  return (
    <Screen contentStyle={{ gap: space.xl }}>
      <View style={{ paddingHorizontal: space.lg }}>
        <ScreenHeader
          eyebrow="Inspire me"
          title="Discover"
          athleteName={me.displayName}
          athleteId={me.id}
          unreadCount={unreadCount}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}
      >
        {SECTIONS.map((s) => {
          const active = s.value === section;
          return (
            <Pressable
              key={s.value}
              onPress={() => setSection(s.value)}
              style={{
                paddingHorizontal: space.md,
                paddingVertical: 9,
                borderRadius: radius.pill,
                backgroundColor: active ? colors.accent : 'rgba(255,255,255,0.05)',
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: active ? colors.textInverse : colors.textSecondary,
                }}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* For you ----------------------------------------------------------- */}
      {section === 'foryou' ? (
        <>
          <View>
            <View style={{ paddingHorizontal: space.lg }}>
              <SectionHeader title="Recommended for you" />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: space.md, paddingHorizontal: space.lg }}
            >
              {content.slice(0, 4).map((item) => (
                <ContentCard key={item.id} item={item} />
              ))}
            </ScrollView>
          </View>

          <View style={{ paddingHorizontal: space.lg }}>
            <SectionHeader title="Challenges to join" />
            <View style={{ gap: space.md }}>
              {challenges.slice(0, 2).map((c) => (
                <Card key={c.id}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={type.subtitle}>{c.name}</Text>
                      <Caption style={{ fontSize: 12.5, marginTop: 3 }}>{c.description}</Caption>
                    </View>
                    <Pill tone="accent">+{c.xpReward} XP</Pill>
                  </Row>
                </Card>
              ))}
            </View>
          </View>

          <View style={{ paddingHorizontal: space.lg }}>
            <SectionHeader title="Athletes to follow" />
            <Card padded={false}>
              {suggested.slice(0, 4).map((a, i) => (
                <View key={a.id}>
                  <AthleteRow
                    name={a.displayName}
                    handle={a.handle}
                    location={a.location ?? ''}
                    following={Boolean(following[a.id])}
                    onPress={() => router.push(`/profile/${a.id}`)}
                    onToggle={() => toggleFollow(a.id)}
                  />
                  {i < 3 ? <Divider /> : null}
                </View>
              ))}
            </Card>
          </View>

          <View style={{ paddingHorizontal: space.lg }}>
            <SectionHeader title="Events near you" />
            <Card padded={false}>
              {events.slice(0, 3).map((e, i) => (
                <View key={e.id}>
                  <Row style={{ padding: space.lg, paddingVertical: space.md }}>
                    <View
                      style={{
                        width: 44,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={[type.label, { color: colors.accent, fontSize: 9.5 }]}>
                        {new Date(`${e.date}T00:00:00`)
                          .toLocaleDateString(undefined, { month: 'short' })
                          .toUpperCase()}
                      </Text>
                      <Text style={[type.metricSmall, { fontSize: 18 }]}>
                        {new Date(`${e.date}T00:00:00`).getDate()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={type.bodyStrong}>{e.name}</Text>
                      <Caption style={{ fontSize: 12, marginTop: 2 }}>
                        {e.distanceM ? `${prDistanceLabel(e.distanceM)} · ` : ''}
                        {e.location}
                      </Caption>
                    </View>
                  </Row>
                  {i < 2 ? <Divider /> : null}
                </View>
              ))}
            </Card>
          </View>
        </>
      ) : null}

      {/* Content ----------------------------------------------------------- */}
      {section === 'content' ? (
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          {content.map((item) => (
            <ContentCard key={item.id} item={item} wide />
          ))}
          <Card>
            <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
              <Icon name="sparkle" size={18} color={colors.violet} />
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong}>Content backed by real data</Text>
                <Body style={{ fontSize: 13, marginTop: 3, lineHeight: 18 }}>
                  Creators can attach the training that produced a result — mileage, workouts, long-run
                  progression. A claim you can inspect is worth more than one you cannot.
                </Body>
              </View>
            </Row>
          </Card>
        </View>
      ) : null}

      {/* Athletes ---------------------------------------------------------- */}
      {section === 'athletes' ? (
        <View style={{ paddingHorizontal: space.lg }}>
          <Card padded={false}>
            {suggested.map((a, i) => (
              <View key={a.id}>
                <AthleteRow
                  name={a.displayName}
                  handle={a.handle}
                  location={a.location ?? ''}
                  bio={a.bio}
                  following={Boolean(following[a.id])}
                  onPress={() => router.push(`/profile/${a.id}`)}
                  onToggle={() => toggleFollow(a.id)}
                />
                {i < suggested.length - 1 ? <Divider /> : null}
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {/* Clubs ------------------------------------------------------------- */}
      {section === 'clubs' ? (
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          {clubs.map((c) => (
            <Card key={c.id}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={type.subtitle}>{c.name}</Text>
                  <Caption style={{ fontSize: 12, marginTop: 3, color: colors.textTertiary }}>
                    {c.memberCount.toLocaleString()} members · {c.location}
                  </Caption>
                </View>
                <Pressable
                  onPress={() => setJoined((prev) => ({ ...prev, [c.id]: !prev[c.id] }))}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: radius.pill,
                    backgroundColor: joined[c.id] ? 'rgba(255,255,255,0.07)' : colors.accent,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: joined[c.id] ? colors.textSecondary : colors.textInverse,
                    }}
                  >
                    {joined[c.id] ? 'Joined' : 'Join'}
                  </Text>
                </Pressable>
              </Row>
              <Body style={{ fontSize: 13.5, lineHeight: 19, marginTop: space.md }}>
                {c.description}
              </Body>
            </Card>
          ))}
        </View>
      ) : null}

      {/* Events ------------------------------------------------------------ */}
      {section === 'events' ? (
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          {events.map((e) => (
            <Card key={e.id}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Row gap={space.sm}>
                    <Text style={type.subtitle}>{e.name}</Text>
                    <Pill tone={e.kind === 'race' ? 'accent' : e.kind === 'competition' ? 'warn' : 'neutral'}>
                      {e.kind}
                    </Pill>
                  </Row>
                  <Caption style={{ fontSize: 12.5, marginTop: 4 }}>
                    {e.distanceM ? `${prDistanceLabel(e.distanceM)} · ` : ''}
                    {e.location}
                  </Caption>
                  {e.participantCount ? (
                    <Caption style={{ fontSize: 12, marginTop: 3, color: colors.textTertiary }}>
                      {e.participantCount.toLocaleString()} entered
                    </Caption>
                  ) : null}
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={[type.label, { color: colors.accent, fontSize: 9.5 }]}>
                    {new Date(`${e.date}T00:00:00`)
                      .toLocaleDateString(undefined, { month: 'short' })
                      .toUpperCase()}
                  </Text>
                  <Text style={[type.metric, { fontSize: 26 }]}>
                    {new Date(`${e.date}T00:00:00`).getDate()}
                  </Text>
                </View>
              </Row>
            </Card>
          ))}
        </View>
      ) : null}

      {/* Routes ------------------------------------------------------------ */}
      {section === 'routes' ? (
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          {routes.map((r) => (
            <Card key={r.id} padded={false}>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.025)' }}>
                <RouteMap
                  stream={
                    r.shape
                      ? {
                          timeOffsetS: r.shape.lat.map((_, i) => i),
                          distanceM: r.shape.lat.map((_, i) => i),
                          latitude: r.shape.lat,
                          longitude: r.shape.lon,
                        }
                      : undefined
                  }
                  width={cardWidth - 2}
                  height={140}
                  color={colors.success}
                  showEndpoints={false}
                />
              </View>
              <View style={{ padding: space.lg }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={type.subtitle}>{r.name}</Text>
                    <Caption style={{ fontSize: 12, marginTop: 3, color: colors.textTertiary }}>
                      {r.location} · {r.popularity.toLocaleString()} athletes
                    </Caption>
                  </View>
                  <Row gap={space.lg}>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Label>Distance</Label>
                      <Text style={[type.metricSmall, { fontSize: 16, marginTop: 2 }]}>
                        {distanceIn(r.distanceM, unit).toFixed(1)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Label>Climb</Label>
                      <Text style={[type.metricSmall, { fontSize: 16, marginTop: 2 }]}>
                        {Math.round(elevationIn(r.elevationGainM, unit))}
                      </Text>
                    </View>
                  </Row>
                </Row>
              </View>
            </Card>
          ))}
          <Caption style={{ textAlign: 'center', color: colors.textTertiary, fontSize: 11.5 }}>
            Distances in {distanceLabel(unit)}, climb in {elevationLabel(unit)}
          </Caption>
        </View>
      ) : null}
    </Screen>
  );
}

const AthleteRow = ({
  name,
  handle,
  location,
  bio,
  following,
  onPress,
  onToggle,
}: {
  name: string;
  handle: string;
  location: string;
  bio?: string;
  following: boolean;
  onPress: () => void;
  onToggle: () => void;
}) => (
  <Pressable onPress={onPress}>
    <Row style={{ padding: space.lg, paddingVertical: space.md, alignItems: 'flex-start' }}>
      <Avatar name={name} size={42} />
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong} numberOfLines={1}>
          {name}
        </Text>
        <Caption style={{ fontSize: 12, marginTop: 1 }} numberOfLines={1}>
          @{handle} · {location}
        </Caption>
        {bio ? (
          <Caption style={{ fontSize: 12.5, marginTop: 4, color: colors.textSecondary }} numberOfLines={2}>
            {bio}
          </Caption>
        ) : null}
      </View>
      <Pressable onPress={onToggle} hitSlop={8}>
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: radius.pill,
            backgroundColor: following ? 'rgba(255,255,255,0.07)' : colors.accent,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: following ? colors.textSecondary : colors.textInverse,
            }}
          >
            {following ? 'Following' : 'Follow'}
          </Text>
        </View>
      </Pressable>
    </Row>
  </Pressable>
);
