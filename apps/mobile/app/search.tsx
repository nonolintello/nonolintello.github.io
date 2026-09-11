import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { distanceIn, distanceLabel, type Athlete, type Club, type ContentItem, type RouteSuggestion, type SportEvent } from '@ai/core';
import { Screen } from '../src/components/Screen';
import { Icon } from '../src/components/Icon';
import { Avatar, Caption, Card, Divider, Label, Row } from '../src/components/ui';
import { useApp } from '../src/data/store';
import { colors, hairline, radius, space, type } from '../src/theme/tokens';

interface Results {
  athletes: Athlete[];
  clubs: Club[];
  events: SportEvent[];
  routes: RouteSuggestion[];
  content: ContentItem[];
}

const EMPTY: Results = { athletes: [], clubs: [], events: [], routes: [], content: [] };

const SUGGESTIONS = ['Philadelphia', 'marathon', 'trail', 'Mara', 'recovery'];

export default function SearchScreen() {
  const { repository, me } = useApp();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = await repository.search(query);
      if (!cancelled) setResults(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [query, repository]);

  const unit = me.unitPreference;
  const total =
    results.athletes.length +
    results.clubs.length +
    results.events.length +
    results.routes.length +
    results.content.length;

  return (
    <Screen contentStyle={{ paddingHorizontal: space.lg, gap: space.lg }}>
      <Row gap={space.md}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            height: 46,
            borderRadius: radius.sm,
            paddingHorizontal: space.md,
            backgroundColor: 'rgba(255,255,255,0.055)',
            borderWidth: hairline,
            borderColor: colors.border,
          }}
        >
          <Icon name="search" size={17} color={colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder="Athletes, clubs, races, routes"
            placeholderTextColor={colors.textTertiary}
            style={{ flex: 1, color: colors.text, fontSize: 15 }}
          />
        </View>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={[type.caption, { color: colors.accent, fontWeight: '700' }]}>Cancel</Text>
        </Pressable>
      </Row>

      {query.trim().length === 0 ? (
        <View style={{ gap: space.md }}>
          <Label>Try searching for</Label>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                onPress={() => setQuery(s)}
                style={{
                  paddingHorizontal: space.md,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderWidth: hairline,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>{s}</Text>
              </Pressable>
            ))}
          </Row>
        </View>
      ) : total === 0 ? (
        <Card>
          <Caption>No matches for “{query.trim()}”.</Caption>
        </Card>
      ) : (
        <>
          {results.athletes.length > 0 ? (
            <Section title="Athletes">
              {results.athletes.map((a, i) => (
                <View key={a.id}>
                  <Pressable onPress={() => router.push(`/profile/${a.id}`)}>
                    <Row style={{ padding: space.lg, paddingVertical: space.md }}>
                      <Avatar name={a.displayName} size={38} />
                      <View style={{ flex: 1 }}>
                        <Text style={type.bodyStrong}>{a.displayName}</Text>
                        <Caption style={{ fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                          @{a.handle} · {a.location}
                        </Caption>
                      </View>
                      <Icon name="chevronRight" size={16} color={colors.textTertiary} />
                    </Row>
                  </Pressable>
                  {i < results.athletes.length - 1 ? <Divider /> : null}
                </View>
              ))}
            </Section>
          ) : null}

          {results.clubs.length > 0 ? (
            <Section title="Clubs">
              {results.clubs.map((c, i) => (
                <View key={c.id}>
                  <Row style={{ padding: space.lg, paddingVertical: space.md }}>
                    <Icon name="community" size={18} color={colors.violet} />
                    <View style={{ flex: 1 }}>
                      <Text style={type.bodyStrong}>{c.name}</Text>
                      <Caption style={{ fontSize: 12, marginTop: 1 }}>
                        {c.memberCount.toLocaleString()} members · {c.location}
                      </Caption>
                    </View>
                  </Row>
                  {i < results.clubs.length - 1 ? <Divider /> : null}
                </View>
              ))}
            </Section>
          ) : null}

          {results.events.length > 0 ? (
            <Section title="Events">
              {results.events.map((e, i) => (
                <View key={e.id}>
                  <Row style={{ padding: space.lg, paddingVertical: space.md }}>
                    <Icon name="calendar" size={18} color={colors.cyan} />
                    <View style={{ flex: 1 }}>
                      <Text style={type.bodyStrong}>{e.name}</Text>
                      <Caption style={{ fontSize: 12, marginTop: 1 }}>
                        {new Date(`${e.date}T00:00:00`).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                        })}{' '}
                        · {e.location}
                      </Caption>
                    </View>
                  </Row>
                  {i < results.events.length - 1 ? <Divider /> : null}
                </View>
              ))}
            </Section>
          ) : null}

          {results.routes.length > 0 ? (
            <Section title="Routes">
              {results.routes.map((r, i) => (
                <View key={r.id}>
                  <Row style={{ padding: space.lg, paddingVertical: space.md }}>
                    <Icon name="route" size={18} color={colors.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={type.bodyStrong}>{r.name}</Text>
                      <Caption style={{ fontSize: 12, marginTop: 1 }}>
                        {distanceIn(r.distanceM, unit).toFixed(1)} {distanceLabel(unit)} · {r.location}
                      </Caption>
                    </View>
                  </Row>
                  {i < results.routes.length - 1 ? <Divider /> : null}
                </View>
              ))}
            </Section>
          ) : null}

          {results.content.length > 0 ? (
            <Section title="Content">
              {results.content.map((c, i) => (
                <View key={c.id}>
                  <Row style={{ padding: space.lg, paddingVertical: space.md }}>
                    <Icon name="play" size={18} color={colors.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={type.bodyStrong} numberOfLines={2}>
                        {c.title}
                      </Text>
                      <Caption style={{ fontSize: 12, marginTop: 1 }}>
                        {c.authorName} · {c.durationLabel}
                      </Caption>
                    </View>
                  </Row>
                  {i < results.content.length - 1 ? <Divider /> : null}
                </View>
              ))}
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View>
    <Label style={{ marginBottom: space.sm }}>{title}</Label>
    <Card padded={false}>{children}</Card>
  </View>
);
