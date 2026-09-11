import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  distanceLabel,
  formatPace,
  kmToMetres,
  milesToMetres,
  paceSecondsPerUnit,
  type Sport,
  type Visibility,
} from '@ai/core';
import { Screen } from '../src/components/Screen';
import { Icon } from '../src/components/Icon';
import { Body, Button, Caption, Card, Divider, Label, Row, SectionHeader } from '../src/components/ui';
import { useApp } from '../src/data/store';
import { colors, hairline, radius, space, type } from '../src/theme/tokens';

const SPORTS: { value: Sport; label: string }[] = [
  { value: 'running', label: 'Road' },
  { value: 'trail_running', label: 'Trail' },
  { value: 'treadmill_running', label: 'Treadmill' },
];

const VISIBILITIES: { value: Visibility; label: string }[] = [
  { value: 'public', label: 'Everyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'private', label: 'Only me' },
];

export default function RecordScreen() {
  const { me, createActivity } = useApp();
  const router = useRouter();
  const unit = me.unitPreference;

  const [sport, setSport] = useState<Sport>('running');
  const [title, setTitle] = useState('');
  const [distance, setDistance] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [elevation, setElevation] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [effort, setEffort] = useState(5);
  const [visibility, setVisibility] = useState<Visibility>(me.defaultActivityVisibility);
  const [saving, setSaving] = useState(false);

  const distanceValue = Number.parseFloat(distance) || 0;
  const distanceM = unit === 'imperial' ? milesToMetres(distanceValue) : kmToMetres(distanceValue);
  const movingSeconds =
    (Number.parseInt(hours, 10) || 0) * 3600 +
    (Number.parseInt(minutes, 10) || 0) * 60 +
    (Number.parseInt(seconds, 10) || 0);

  const pace = useMemo(
    () => paceSecondsPerUnit(distanceM, movingSeconds, unit),
    [distanceM, movingSeconds, unit],
  );

  const valid = distanceM > 0 && movingSeconds > 0;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const created = await createActivity({
        sport,
        title: title.trim() || defaultTitle(),
        startedAt: new Date().toISOString(),
        distanceM,
        movingSeconds,
        elevationGainM: Number.parseFloat(elevation) || undefined,
        avgHeartRate: Number.parseInt(heartRate, 10) || undefined,
        perceivedExertion: effort,
        visibility,
      });
      reset();
      router.push(`/activity/${created.id}`);
    } catch {
      Alert.alert('Could not save', 'Something went wrong logging that activity.');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setTitle('');
    setDistance('');
    setHours('');
    setMinutes('');
    setSeconds('');
    setElevation('');
    setHeartRate('');
    setEffort(5);
  };

  return (
    <Screen contentStyle={{ paddingHorizontal: space.lg, gap: space.xl }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={[type.title, { fontSize: 24 }]}>Log an activity</Text>
          <Caption style={{ marginTop: 4 }}>
            Connect a watch later to import automatically. For now, add it by hand.
          </Caption>
        </View>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityLabel="Close"
          style={{
            width: 34,
            height: 34,
            borderRadius: radius.sm,
            backgroundColor: 'rgba(255,255,255,0.06)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="close" size={18} color={colors.textSecondary} strokeWidth={2.4} />
        </Pressable>
      </Row>

      <Card>
        <Label>Distance</Label>
        <Row style={{ alignItems: 'flex-end', marginTop: space.sm }}>
          <TextInput
            value={distance}
            onChangeText={setDistance}
            placeholder="0.00"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
            style={[type.display, { fontSize: 52, lineHeight: 56, flex: 1, padding: 0 }]}
          />
          <Text style={[type.title, { color: colors.textTertiary, marginBottom: 8 }]}>
            {distanceLabel(unit)}
          </Text>
        </Row>

        <Divider style={{ marginVertical: space.lg }} />

        <Label>Moving time</Label>
        <Row gap={space.lg} style={{ marginTop: space.sm }}>
          <TimeField value={hours} onChange={setHours} placeholder="00" suffix="h" />
          <TimeField value={minutes} onChange={setMinutes} placeholder="00" suffix="m" />
          <TimeField value={seconds} onChange={setSeconds} placeholder="00" suffix="s" />
        </Row>

        {valid ? (
          <>
            <Divider style={{ marginVertical: space.lg }} />
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <Label>Pace</Label>
                <Text style={[type.metric, { marginTop: 4 }]}>
                  {formatPace(pace)}
                  <Text style={[type.caption, { color: colors.textTertiary }]}>
                    {' '}
                    /{distanceLabel(unit)}
                  </Text>
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Label>Speed</Label>
                <Text style={[type.metric, { marginTop: 4 }]}>
                  {((distanceM / movingSeconds) * 3.6).toFixed(1)}
                  <Text style={[type.caption, { color: colors.textTertiary }]}> km/h</Text>
                </Text>
              </View>
            </Row>
          </>
        ) : null}
      </Card>

      <View>
        <SectionHeader title="Details" />
        <Card style={{ gap: space.lg }}>
          <View>
            <Label style={{ marginBottom: space.sm }}>Sport</Label>
            <Segmented
              options={SPORTS.map((s) => ({ value: s.value, label: s.label }))}
              value={sport}
              onChange={(v) => setSport(v as Sport)}
            />
          </View>

          <View>
            <Label style={{ marginBottom: space.sm }}>Title</Label>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={defaultTitle()}
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
            />
          </View>

          <Row gap={space.md}>
            <View style={{ flex: 1 }}>
              <Label style={{ marginBottom: space.sm }}>Elevation (m)</Label>
              <TextInput
                value={elevation}
                onChangeText={setElevation}
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Label style={{ marginBottom: space.sm }}>Avg HR</Label>
              <TextInput
                value={heartRate}
                onChangeText={setHeartRate}
                placeholder="—"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                style={styles.input}
              />
            </View>
          </Row>

          <View>
            <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
              <Label>Perceived effort</Label>
              <Text style={[type.caption, { color: colors.accent, fontWeight: '700' }]}>
                {effort} · {effortLabel(effort)}
              </Text>
            </Row>
            <Row gap={5}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setEffort(n)}
                  style={{
                    flex: 1,
                    height: 34,
                    borderRadius: radius.sm,
                    backgroundColor: n <= effort ? colors.accent : 'rgba(255,255,255,0.06)',
                    opacity: n <= effort ? 0.35 + (n / 10) * 0.65 : 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: n <= effort ? colors.textInverse : colors.textTertiary,
                    }}
                  >
                    {n}
                  </Text>
                </Pressable>
              ))}
            </Row>
          </View>
        </Card>
      </View>

      <View>
        <SectionHeader title="Who can see this" />
        <Card>
          <Segmented
            options={VISIBILITIES.map((v) => ({ value: v.value, label: v.label }))}
            value={visibility}
            onChange={(v) => setVisibility(v as Visibility)}
          />
          <Row gap={space.sm} style={{ marginTop: space.md, alignItems: 'flex-start' }}>
            <Icon name="lock" size={14} color={colors.textTertiary} />
            <Body style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>
              {visibility === 'private'
                ? 'Only you will ever see this activity, including its route.'
                : `The first and last ${me.routePrivacyRadiusM} m of your route stay hidden from everyone else.`}
            </Body>
          </Row>
        </Card>
      </View>

      <Button onPress={save} variant={valid ? 'primary' : 'secondary'} style={{ opacity: valid ? 1 : 0.5 }}>
        {saving ? 'Saving…' : 'Save activity'}
      </Button>

      <Caption style={{ textAlign: 'center', color: colors.textTertiary }}>
        Your analysis updates the moment it saves.
      </Caption>
    </Screen>
  );
}

const defaultTitle = () => {
  const h = new Date().getHours();
  if (h < 11) return 'Morning run';
  if (h < 14) return 'Midday run';
  if (h < 18) return 'Afternoon run';
  return 'Evening run';
};

const effortLabel = (n: number) =>
  n <= 2 ? 'Very easy' : n <= 4 ? 'Easy' : n <= 6 ? 'Moderate' : n <= 8 ? 'Hard' : 'Maximal';

const TimeField = ({
  value,
  onChange,
  placeholder,
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suffix: string;
}) => (
  <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textTertiary}
      keyboardType="number-pad"
      maxLength={2}
      style={[type.metric, { padding: 0, width: 52 }]}
    />
    <Text style={[type.caption, { color: colors.textTertiary, marginBottom: 4, marginLeft: 1 }]}>
      {suffix}
    </Text>
  </View>
);

const Segmented = <T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
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
            style={{
              fontSize: 13.5,
              fontWeight: '600',
              color: active ? colors.text : colors.textTertiary,
            }}
          >
            {o.label}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

const styles = {
  input: {
    height: 46,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: hairline,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    color: colors.text,
    fontSize: 15,
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
