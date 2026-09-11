import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  distanceLabel,
  formatDuration,
  formatPace,
  paceSecondsPerUnit,
  prDistanceLabel,
  predictFromRecords,
  type Athlete,
  type RaceEntry,
} from '@ai/core';
import { Screen } from '../../src/components/Screen';
import { Icon } from '../../src/components/Icon';
import {
  Avatar,
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
import { colors, space, type } from '../../src/theme/tokens';

/** "1:32:00", "92:00", "32:30" or "1h32" → seconds. Forgiving on purpose. */
const parseExpectedTime = (raw: string): number | undefined => {
  const cleaned = raw.trim().toLowerCase().replace(/h/g, ':').replace(/m/g, ':').replace(/s/g, '');
  if (!cleaned) return undefined;
  const parts = cleaned.split(':').map((p) => Number.parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return undefined;
  if (parts.length === 1) return (parts[0] as number) * 60;
  if (parts.length === 2) return (parts[0] as number) * 60 + (parts[1] as number);
  return (parts[0] as number) * 3600 + (parts[1] as number) * 60 + (parts[2] as number);
};

interface StartListRow {
  entry: RaceEntry;
  athlete: Athlete;
  isMe: boolean;
  following: boolean;
}

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { me, profile, events, raceEntries, athleteById, repository, registerForEvent, withdrawFromEvent } =
    useApp();

  const eventId = String(id);
  const event = events.find((e) => e.id === eventId);
  const unit = me.unitPreference;

  const entries = useMemo(() => raceEntries.filter((e) => e.eventId === eventId), [raceEntries, eventId]);
  const myEntry = entries.find((e) => e.athleteId === me.id);

  // Following is only known to the repository; resolve it once per start list.
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pairs = await Promise.all(
        entries.map(async (e) => [e.athleteId, await repository.isFollowing(e.athleteId)] as const),
      );
      if (!cancelled) setFollowing(Object.fromEntries(pairs));
    })();
    return () => {
      cancelled = true;
    };
  }, [entries, repository]);

  // Sorted by expected time, fastest first; the undecided sit at the bottom
  // in registration order so the list still reads as a start list.
  const rows = useMemo<StartListRow[]>(
    () =>
      entries
        .map((entry) => ({
          entry,
          athlete: athleteById(entry.athleteId),
          isMe: entry.athleteId === me.id,
          following: Boolean(following[entry.athleteId]),
        }))
        .filter((r): r is StartListRow => Boolean(r.athlete))
        .sort((a, b) => {
          const ta = a.entry.expectedSeconds ?? Number.POSITIVE_INFINITY;
          const tb = b.entry.expectedSeconds ?? Number.POSITIVE_INFINITY;
          if (ta !== tb) return ta - tb;
          return a.entry.registeredAt.localeCompare(b.entry.registeredAt);
        }),
    [entries, athleteById, me.id, following],
  );

  // What the engine thinks the demo athlete could run, from their records.
  // Shown beside the declared target so the two can be compared, never merged.
  const prediction = useMemo(
    () => (event?.distanceM ? predictFromRecords(profile.records, event.distanceM) : null),
    [event?.distanceM, profile.records],
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  if (!event) {
    return (
      <Screen contentStyle={{ paddingHorizontal: space.lg }}>
        <BackBar onPress={() => router.back()} />
        <Caption>This event is no longer listed.</Caption>
      </Screen>
    );
  }

  const date = new Date(`${event.date}T00:00:00`);
  const daysUntil = Math.max(0, Math.round((date.getTime() - Date.now()) / 86_400_000));
  const friendsRacing = rows.filter((r) => r.following).length;
  const declared = rows.map((r) => r.entry.expectedSeconds).filter((s): s is number => s != null);
  const median = declared.length
    ? (declared[Math.floor((declared.length - 1) / 2)] as number)
    : null;
  const myRank = myEntry?.expectedSeconds != null ? rows.findIndex((r) => r.isMe) + 1 : null;

  const openEditor = () => {
    const seed = myEntry?.expectedSeconds ?? prediction?.predictedSeconds;
    setDraft(seed != null ? formatDuration(Math.round(seed / 30) * 30) : '');
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await registerForEvent(event.id, parseExpectedTime(draft));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async () => {
    setSaving(true);
    try {
      await withdrawFromEvent(event.id);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const draftSeconds = parseExpectedTime(draft);

  return (
    <Screen contentStyle={{ paddingHorizontal: space.lg, gap: space.xl }}>
      <BackBar onPress={() => router.back()} />

      {/* Event card -------------------------------------------------------- */}
      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Row gap={space.sm}>
              <Pill tone={event.kind === 'race' ? 'accent' : event.kind === 'competition' ? 'warn' : 'neutral'}>
                {event.kind}
              </Pill>
              {myEntry ? (
                <Pill tone="success" icon={<Icon name="check" size={12} color={colors.success} />}>
                  You're in
                </Pill>
              ) : null}
            </Row>
            <Text style={[type.title, { fontSize: 22, marginTop: space.md }]}>{event.name}</Text>
            <Caption style={{ marginTop: 4 }}>
              {event.distanceM ? `${prDistanceLabel(event.distanceM)} · ` : ''}
              {event.location}
            </Caption>
          </View>
          <View style={{ alignItems: 'center', marginLeft: space.md }}>
            <Text style={[type.label, { color: colors.accent, fontSize: 9.5 }]}>
              {date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}
            </Text>
            <Text style={[type.metric, { fontSize: 30 }]}>{date.getDate()}</Text>
            <Caption style={{ fontSize: 11, color: colors.textTertiary }}>
              {daysUntil === 0 ? 'today' : `in ${daysUntil}d`}
            </Caption>
          </View>
        </Row>

        <Divider style={{ marginVertical: space.lg }} />

        <Row style={{ justifyContent: 'space-around' }}>
          <Stat label="From MOOV" value={String(rows.length)} />
          <Stat label="You follow" value={String(friendsRacing)} />
          <Stat label="Median target" value={median != null ? formatDuration(median) : '—'} />
          {event.participantCount ? (
            <Stat label="Field" value={event.participantCount.toLocaleString()} />
          ) : null}
        </Row>
      </Card>

      {/* My entry ---------------------------------------------------------- */}
      <View>
        <SectionHeader title={myEntry ? 'Your entry' : 'Race it'} />
        <Card>
          {editing ? (
            <>
              <Label>Expected finish time</Label>
              <Row gap={space.md} style={{ marginTop: space.sm, alignItems: 'flex-end' }}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="h:mm:ss"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numbers-and-punctuation"
                  autoFocus
                  style={[type.metric, { width: 168, padding: 0 }]}
                />
                {draftSeconds != null && event.distanceM ? (
                  <Caption style={{ flex: 1, marginBottom: 6 }}>
                    {formatPace(paceSecondsPerUnit(event.distanceM, draftSeconds, unit))} /{distanceLabel(unit)}
                  </Caption>
                ) : null}
              </Row>
              {prediction ? (
                <Pressable onPress={() => setDraft(formatDuration(Math.round(prediction.predictedSeconds / 30) * 30))}>
                  <Row gap={space.sm} style={{ marginTop: space.md, alignItems: 'flex-start' }}>
                    <Icon name="sparkle" size={13} color={colors.violet} />
                    <Body style={{ flex: 1, fontSize: 13, lineHeight: 19 }}>
                      MOOV projects {formatDuration(prediction.predictedSeconds)} from your{' '}
                      {prDistanceLabel(prediction.basedOnDistanceM)} best. Tap to use it.
                    </Body>
                  </Row>
                </Pressable>
              ) : null}
              <Caption style={{ marginTop: space.sm, fontSize: 12, color: colors.textTertiary }}>
                Leave blank to register without a target.
              </Caption>
              <Row gap={space.sm} style={{ marginTop: space.lg }}>
                <Button onPress={save} style={{ flex: 1 }}>
                  {saving ? 'Saving…' : myEntry ? 'Update' : 'Register'}
                </Button>
                <Button variant="secondary" onPress={() => setEditing(false)}>
                  Cancel
                </Button>
              </Row>
            </>
          ) : myEntry ? (
            <>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View>
                  <Label>Your target</Label>
                  <Text style={[type.metric, { marginTop: 4 }]}>
                    {myEntry.expectedSeconds != null ? formatDuration(myEntry.expectedSeconds) : 'No target'}
                  </Text>
                  {myEntry.expectedSeconds != null && event.distanceM ? (
                    <Caption style={{ marginTop: 2 }}>
                      {formatPace(paceSecondsPerUnit(event.distanceM, myEntry.expectedSeconds, unit))} /
                      {distanceLabel(unit)}
                      {myRank ? ` · ${ordinal(myRank)} of ${declared.length} on MOOV` : ''}
                    </Caption>
                  ) : null}
                </View>
                {prediction ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Label>Projected</Label>
                    <Text style={[type.metricSmall, { marginTop: 4, color: colors.violet }]}>
                      {formatDuration(prediction.predictedSeconds)}
                    </Text>
                  </View>
                ) : null}
              </Row>
              <Row gap={space.sm} style={{ marginTop: space.lg }}>
                <Button variant="secondary" onPress={openEditor} style={{ flex: 1 }}>
                  Edit target
                </Button>
                <Button variant="ghost" onPress={withdraw}>
                  {saving ? '…' : 'Withdraw'}
                </Button>
              </Row>
            </>
          ) : (
            <>
              <Body style={{ fontSize: 13.5, lineHeight: 20 }}>
                {friendsRacing > 0
                  ? `${friendsRacing} ${friendsRacing === 1 ? 'athlete' : 'athletes'} you follow ${
                      friendsRacing === 1 ? 'is' : 'are'
                    } racing. Add yourself and a target time to see where you'd line up.`
                  : 'Nobody you follow is in yet. Be the first from your circle on the start list.'}
              </Body>
              <Button onPress={openEditor} style={{ marginTop: space.lg }}>
                Register
              </Button>
            </>
          )}
        </Card>
      </View>

      {/* Start list -------------------------------------------------------- */}
      <View>
        <SectionHeader title={`Start list · ${rows.length} from MOOV`} />
        <Card padded={false}>
          {rows.length === 0 ? (
            <Caption style={{ padding: space.lg }}>No MOOV athletes have entered yet.</Caption>
          ) : (
            rows.map((r, i) => (
              <View key={r.entry.id}>
                <Pressable
                  onPress={() => router.push(`/profile/${r.athlete.id}`)}
                  style={({ pressed }) => [
                    { padding: space.lg, paddingVertical: space.md },
                    r.isMe && { backgroundColor: colors.accentSoft },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Row>
                    <Text
                      style={[
                        type.metricSmall,
                        { width: 26, fontSize: 15, color: r.entry.expectedSeconds != null ? colors.textSecondary : colors.textTertiary },
                      ]}
                    >
                      {r.entry.expectedSeconds != null ? i + 1 : '·'}
                    </Text>
                    <Avatar name={r.athlete.displayName} size={38} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={type.bodyStrong}>
                        {r.isMe ? 'You' : r.athlete.displayName}
                      </Text>
                      <Caption numberOfLines={1} style={{ fontSize: 12, marginTop: 2 }}>
                        {r.following && !r.isMe ? (
                          <Text style={{ color: colors.cyan, fontWeight: '600' }}>Following · </Text>
                        ) : null}
                        @{r.athlete.handle}
                        {r.athlete.location ? ` · ${r.athlete.location}` : ''}
                      </Caption>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {r.entry.expectedSeconds != null ? (
                        <>
                          <Text style={[type.metricSmall, { fontSize: 17, color: r.isMe ? colors.accent : colors.text }]}>
                            {formatDuration(r.entry.expectedSeconds)}
                          </Text>
                          {event.distanceM ? (
                            <Caption style={{ fontSize: 11, color: colors.textTertiary }}>
                              {formatPace(paceSecondsPerUnit(event.distanceM, r.entry.expectedSeconds, unit))} /
                              {distanceLabel(unit)}
                            </Caption>
                          ) : null}
                        </>
                      ) : (
                        <Caption style={{ fontSize: 12, color: colors.textTertiary }}>No target yet</Caption>
                      )}
                    </View>
                    <Icon name="chevronRight" size={16} color={colors.textTertiary} />
                  </Row>
                </Pressable>
                {i < rows.length - 1 ? <Divider /> : null}
              </View>
            ))
          )}
        </Card>
        <Caption style={{ marginTop: space.md, fontSize: 11.5, color: colors.textTertiary, textAlign: 'center' }}>
          Times are what athletes say they're aiming for, not predictions.
        </Caption>
      </View>
    </Screen>
  );
}

const ordinal = (n: number) => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <View style={{ alignItems: 'center' }}>
    <Text style={[type.metricSmall, { fontSize: 18 }]}>{value}</Text>
    <Caption style={{ fontSize: 10.5, color: colors.textTertiary, marginTop: 2 }}>{label}</Caption>
  </View>
);

const BackBar = ({ onPress }: { onPress: () => void }) => (
  <Pressable onPress={onPress} hitSlop={12} style={{ alignSelf: 'flex-start', marginBottom: space.sm }}>
    <Row gap={4}>
      <Icon name="chevronLeft" size={20} color={colors.textSecondary} />
      <Text style={[type.caption, { color: colors.textSecondary, fontWeight: '600' }]}>Back</Text>
    </Row>
  </Pressable>
);
