import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  distanceIn,
  distanceLabel,
  elevationIn,
  elevationLabel,
  formatDuration,
  formatPace,
  paceSecondsPerUnit,
  relativeDayLabel,
  type ActivityStream,
  type Insight,
} from '@ai/core';
import { Screen } from '../../src/components/Screen';
import { Icon } from '../../src/components/Icon';
import { InsightCard } from '../../src/components/InsightCard';
import { LineChart, type SeriesPoint } from '../../src/components/charts';
import { ElevationProfile, RouteMap } from '../../src/components/RouteMap';
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

type Metric = 'pace' | 'heartRate' | 'elevation' | 'cadence';

const METRICS: { key: Metric; label: string; color: string }[] = [
  { key: 'pace', label: 'Pace', color: colors.accent },
  { key: 'heartRate', label: 'Heart rate', color: colors.danger },
  { key: 'elevation', label: 'Elevation', color: colors.violet },
  { key: 'cadence', label: 'Cadence', color: colors.cyan },
];

/**
 * Instantaneous readings are far too noisy to plot directly — GPS jitter alone
 * swings pace by 30s/km between samples. A trailing mean over roughly half a
 * minute keeps the shape of the effort while removing the sensor noise.
 */
/**
 * ~60 seconds at a 5s sample rate. Long enough to suppress GPS jitter, short
 * enough that the work blocks of an interval session still read as distinct.
 */
const SMOOTH_WINDOW = 12;

const smoothSeries = (values: number[], window: number): number[] => {
  const out: number[] = new Array(values.length);
  let acc = 0;
  for (let i = 0; i < values.length; i++) {
    acc += values[i] as number;
    if (i >= window) acc -= values[i - window] as number;
    out[i] = acc / Math.min(i + 1, window);
  }
  return out;
};

const buildSeries = (
  stream: ActivityStream,
  metric: Metric,
  unit: 'metric' | 'imperial',
): SeriesPoint[] => {
  const dist = stream.distanceM;
  const n = dist.length;
  if (n < 4) return [];

  const raw: (number | undefined)[] =
    metric === 'pace'
      ? (stream.velocityMps ?? []).map((v) => (v > 0.5 ? 1 / v : undefined))
      : metric === 'heartRate'
        ? (stream.heartRate ?? []).map((h) => (h > 0 ? h : undefined))
        : metric === 'elevation'
          ? (stream.altitudeM ?? []).map((a) => a)
          : (stream.cadenceSpm ?? []).map((c) => (c > 30 ? c : undefined));

  if (raw.length === 0) return [];

  const filled = raw.map((v, i) => v ?? (raw[Math.max(0, i - 1)] as number) ?? 0);
  const smoothed = metric === 'elevation' ? filled : smoothSeries(filled, SMOOTH_WINDOW);

  // Skip the samples before the smoothing window is full. Otherwise the first
  // point averages in the standing start and every run appears to open with a
  // 13:00/km kilometre that never happened.
  const first = metric === 'elevation' ? 0 : SMOOTH_WINDOW;

  // Roughly 90 plotted points: enough to show structure, cheap enough to render.
  const step = Math.max(1, Math.floor(n / 90));
  const points: SeriesPoint[] = [];
  for (let i = first; i < n; i += step) {
    const x = distanceIn(dist[i] as number, unit);
    let y = smoothed[i] as number;
    if (metric === 'pace') {
      // secondsPerMetre → seconds per display unit.
      y = y * (unit === 'imperial' ? 1609.344 : 1000);
      if (!Number.isFinite(y) || y > 900 || y < 120) continue;
    }
    if (metric === 'elevation') y = elevationIn(y, unit);
    points.push({ x, y });
  }
  return points;
};

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { activityById, athleteById, me, profile, insightProvider, toggleLike } = useApp();

  const activity = activityById(String(id));
  const [metric, setMetric] = useState<Metric>('pace');
  const [insights, setInsights] = useState<Insight[]>([]);

  // Analysis is generated after render, never before it. The activity must be
  // readable the instant it opens, whatever the insight layer is doing.
  //
  // Only for the viewer's own activities: the insight layer reasons against the
  // viewer's profile, so running it over someone else's session would compare
  // their run to your training and call it slow.
  useEffect(() => {
    if (!activity || activity.athleteId !== me.id) {
      setInsights([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const generated = await insightProvider.generateActivityInsights({ activity, profile });
      if (!cancelled) setInsights(generated);
    })();
    return () => {
      cancelled = true;
    };
  }, [activity, profile, insightProvider, me.id]);

  const unit = me.unitPreference;
  const series = useMemo(
    () => (activity?.stream ? buildSeries(activity.stream, metric, unit) : []),
    [activity, metric, unit],
  );

  if (!activity) {
    return (
      <Screen contentStyle={{ paddingHorizontal: space.lg }}>
        <BackBar onPress={() => router.back()} />
        <Body>That activity is no longer available.</Body>
      </Screen>
    );
  }

  const athlete = athleteById(activity.athleteId);
  const isMine = activity.athleteId === me.id;
  const pace = paceSecondsPerUnit(activity.distanceM, activity.movingSeconds, unit);
  const mapWidth = width - space.lg * 2;
  const chartWidth = width - space.lg * 2 - space.lg * 2;
  const activeMetric = METRICS.find((m) => m.key === metric) as (typeof METRICS)[number];

  const splitMaxSeconds = Math.max(...(activity.splits ?? []).map((s) => s.elapsedSeconds), 1);
  const splitMinSeconds = Math.min(...(activity.splits ?? []).map((s) => s.elapsedSeconds), splitMaxSeconds);

  return (
    <Screen contentStyle={{ paddingHorizontal: space.lg, gap: space.xl }}>
      <BackBar onPress={() => router.back()} />

      {/* Title ------------------------------------------------------------ */}
      <View>
        <Row gap={space.md}>
          <Pressable onPress={() => athlete && router.push(`/profile/${athlete.id}`)}>
            <Avatar name={athlete?.displayName ?? '??'} size={40} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong}>{athlete?.displayName}</Text>
            <Caption style={{ fontSize: 12.5, color: colors.textTertiary }}>
              {new Date(activity.startedAt).toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}{' '}
              · {relativeDayLabel(new Date(activity.startedAt), new Date())}
            </Caption>
          </View>
          {activity.visibility === 'private' ? (
            <Pill tone="neutral" icon={<Icon name="lock" size={11} color={colors.textSecondary} />}>
              Private
            </Pill>
          ) : null}
        </Row>

        <Text style={[type.title, { fontSize: 26, marginTop: space.lg }]}>{activity.title}</Text>
      </View>

      {/* Headline metrics -------------------------------------------------- */}
      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Label>Distance</Label>
            <Row gap={4} style={{ alignItems: 'flex-end', marginTop: 4 }}>
              <Text style={[type.display, { fontSize: 44, lineHeight: 46 }]}>
                {distanceIn(activity.distanceM, unit).toFixed(2)}
              </Text>
              <Text style={[type.caption, { color: colors.textTertiary, marginBottom: 6 }]}>
                {distanceLabel(unit)}
              </Text>
            </Row>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Label>Moving time</Label>
            <Text style={[type.metric, { marginTop: 6 }]}>
              {formatDuration(activity.movingSeconds)}
            </Text>
            <Label style={{ marginTop: space.md }}>Avg pace</Label>
            <Text style={[type.metric, { marginTop: 6 }]}>
              {formatPace(pace)}
              <Text style={[type.caption, { color: colors.textTertiary }]}>
                {' '}
                /{distanceLabel(unit)}
              </Text>
            </Text>
          </View>
        </Row>

        <Divider style={{ marginVertical: space.lg }} />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.lg }}>
          <Detail
            label="Elevation"
            value={
              activity.elevationGainM
                ? Math.round(elevationIn(activity.elevationGainM, unit)).toLocaleString()
                : '—'
            }
            unit={elevationLabel(unit)}
          />
          <Detail label="Avg HR" value={activity.avgHeartRate ? String(activity.avgHeartRate) : '—'} unit="bpm" />
          <Detail label="Max HR" value={activity.maxHeartRate ? String(activity.maxHeartRate) : '—'} unit="bpm" />
          <Detail
            label="Cadence"
            value={activity.avgCadenceSpm ? String(Math.round(activity.avgCadenceSpm)) : '—'}
            unit="spm"
          />
          <Detail label="Calories" value={activity.calories ? String(activity.calories) : '—'} unit="kcal" />
          <Detail
            label="Effort"
            value={activity.perceivedExertion ? `${activity.perceivedExertion}/10` : '—'}
          />
        </View>
      </Card>

      {/* Route ------------------------------------------------------------- */}
      {activity.stream?.latitude?.length ? (
        <View>
          <SectionHeader title="Route" />
          <Card padded={false}>
            <RouteMap
              stream={activity.stream}
              width={mapWidth}
              height={260}
              strokeWidth={3}
              privacyRadiusM={isMine ? 0 : (athlete?.routePrivacyRadiusM ?? 200)}
            />
            <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
              <ElevationProfile stream={activity.stream} width={mapWidth - space.lg * 2} height={56} />
              <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
                <Caption style={{ fontSize: 11.5, color: colors.textTertiary }}>
                  {isMine
                    ? 'Full route — only you see this'
                    : `Start and finish hidden within ${athlete?.routePrivacyRadiusM ?? 200} m`}
                </Caption>
                <Caption style={{ fontSize: 11.5, color: colors.textTertiary }}>
                  ↑ {Math.round(activity.elevationGainM ?? 0)} m · ↓{' '}
                  {Math.round(activity.elevationLossM ?? 0)} m
                </Caption>
              </Row>
            </View>
          </Card>
        </View>
      ) : null}

      {/* Analysis ---------------------------------------------------------- */}
      {isMine ? (
        <View>
          <SectionHeader title="Analysis" />
          {insights.length === 0 ? (
            <Card>
              <Caption>Analysing this session…</Caption>
            </Card>
          ) : (
            <View style={{ gap: space.md }}>
              {insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </View>
          )}
        </View>
      ) : null}

      {/* Charts ------------------------------------------------------------ */}
      {activity.stream ? (
        <View>
          <SectionHeader title="Over distance" />
          <Card>
            <View style={styles.segmented}>
              {METRICS.map((m) => {
                const active = m.key === metric;
                return (
                  <Pressable
                    key={m.key}
                    onPress={() => setMetric(m.key)}
                    style={[styles.segment, active && { backgroundColor: colors.surfaceRaised }]}
                  >
                    <Text
                      style={{
                        fontSize: 12.5,
                        fontWeight: '600',
                        color: active ? m.color : colors.textTertiary,
                      }}
                    >
                      {m.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ marginTop: space.lg }}>
              {series.length > 2 ? (
                <LineChart
                  points={series}
                  width={chartWidth}
                  height={170}
                  color={activeMetric.color}
                  invertY={metric === 'pace'}
                  formatY={(v) =>
                    metric === 'pace' ? formatPace(v) : String(Math.round(v))
                  }
                  xLabels={[
                    { at: series[0]?.x ?? 0, label: '0' },
                    {
                      at: series[series.length - 1]?.x ?? 0,
                      label: `${distanceIn(activity.distanceM, unit).toFixed(1)} ${distanceLabel(unit)}`,
                    },
                  ]}
                />
              ) : (
                <Caption>No {activeMetric.label.toLowerCase()} data for this activity.</Caption>
              )}
            </View>
          </Card>
        </View>
      ) : null}

      {/* Splits ------------------------------------------------------------ */}
      {activity.splits && activity.splits.length > 0 ? (
        <View>
          <SectionHeader title="Splits" />
          <Card padded={false}>
            <Row style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm }}>
              <Label style={{ width: 34 }}>KM</Label>
              <Label style={{ width: 58 }}>Pace</Label>
              <View style={{ flex: 1 }} />
              <Label style={{ width: 52, textAlign: 'right' }}>HR</Label>
              <Label style={{ width: 46, textAlign: 'right' }}>Climb</Label>
            </Row>
            <Divider />
            {activity.splits.map((split) => {
              // Bar length is relative to the range within this activity, so the
              // fastest kilometre is always visibly the fastest.
              const range = Math.max(1, splitMaxSeconds - splitMinSeconds);
              const relative = 1 - (split.elapsedSeconds - splitMinSeconds) / range;
              const isFastest = split.elapsedSeconds === splitMinSeconds;
              return (
                <View
                  key={split.index}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: space.lg,
                    paddingVertical: 9,
                  }}
                >
                  <Text style={[type.caption, { width: 34, color: colors.textSecondary }]}>
                    {split.index}
                  </Text>
                  <Text
                    style={[
                      type.caption,
                      {
                        width: 58,
                        color: isFastest ? colors.accent : colors.text,
                        fontWeight: '700',
                        fontVariant: ['tabular-nums'],
                      },
                    ]}
                  >
                    {formatDuration(split.elapsedSeconds)}
                  </Text>
                  <View style={{ flex: 1, paddingHorizontal: space.sm }}>
                    <View
                      style={{
                        height: 7,
                        borderRadius: radius.pill,
                        width: `${18 + relative * 82}%`,
                        backgroundColor: isFastest ? colors.accent : 'rgba(255,255,255,0.14)',
                      }}
                    />
                  </View>
                  <Text
                    style={[
                      type.caption,
                      { width: 52, textAlign: 'right', color: colors.textTertiary, fontVariant: ['tabular-nums'] },
                    ]}
                  >
                    {split.avgHeartRate ?? '—'}
                  </Text>
                  <Text
                    style={[
                      type.caption,
                      { width: 46, textAlign: 'right', color: colors.textTertiary, fontVariant: ['tabular-nums'] },
                    ]}
                  >
                    {split.elevationGainM ? `${split.elevationGainM}m` : '—'}
                  </Text>
                </View>
              );
            })}
          </Card>
        </View>
      ) : null}

      {/* Social ------------------------------------------------------------ */}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable
            onPress={() => toggleLike(activity.id)}
            hitSlop={10}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
          >
            <Icon
              name={activity.likedByMe ? 'heartFilled' : 'heart'}
              size={22}
              color={activity.likedByMe ? colors.accent : colors.textSecondary}
            />
            <Text style={[type.bodyStrong, { fontSize: 14 }]}>
              {activity.likeCount} {activity.likeCount === 1 ? 'kudos' : 'kudos'}
            </Text>
          </Pressable>

          <Row gap={space.sm}>
            <Icon name="comment" size={20} color={colors.textSecondary} />
            <Text style={[type.bodyStrong, { fontSize: 14 }]}>{activity.commentCount}</Text>
          </Row>

          <Icon name="share" size={20} color={colors.textTertiary} />
        </Row>
      </Card>

      <Caption style={{ textAlign: 'center', color: colors.textTertiary, fontSize: 11.5 }}>
        Recorded via {activity.source === 'manual' ? 'manual entry' : activity.source.toUpperCase()}
      </Caption>
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

const Detail = ({ label, value, unit }: { label: string; value: string; unit?: string }) => (
  <View style={{ width: '33.33%' }}>
    <Label style={{ marginBottom: 4 }}>{label}</Label>
    <Row gap={3} style={{ alignItems: 'flex-end' }}>
      <Text style={[type.metricSmall, { fontSize: 19 }]}>{value}</Text>
      {unit ? (
        <Text style={[type.caption, { fontSize: 11, color: colors.textTertiary, marginBottom: 2 }]}>
          {unit}
        </Text>
      ) : null}
    </Row>
  </View>
);

const styles = {
  segmented: {
    flexDirection: 'row' as const,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: radius.sm,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    height: 34,
    borderRadius: radius.sm - 3,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
};
