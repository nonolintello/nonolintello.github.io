import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import {
  distanceIn,
  distanceLabel,
  elevationIn,
  elevationLabel,
  formatDuration,
  formatDurationCompact,
  formatPace,
  prDistanceLabel,
  relativeDayLabel,
  statusLabel,
  summariseStatus,
  WEEKDAY_LABELS,
  type Trend,
  type TrendedMetric,
} from '@ai/core';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon, type IconName } from '../../src/components/Icon';
import { InsightCard } from '../../src/components/InsightCard';
import { AskMoov } from '../../src/components/AskMoov';
import { HistoryBars, LineChart, ScoreRadar, WeekBars } from '../../src/components/charts';
import { Body, Card, Caption, Divider, Label, Pill, Row, SectionHeader } from '../../src/components/ui';
import { useApp } from '../../src/data/store';
import { colors, radius, space, type } from '../../src/theme/tokens';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

/**
 * Arrow direction is not the same as good news: rising fatigue is a warning,
 * rising fitness is not. Each metric declares which way is favourable.
 */
const TrendArrow = ({ trend, favourableUp }: { trend: Trend; favourableUp: boolean }) => {
  if (trend === 'flat') {
    return <Text style={{ color: colors.textTertiary, fontSize: 15, fontWeight: '700' }}>→</Text>;
  }
  const good = (trend === 'up') === favourableUp;
  return (
    <Text style={{ color: good ? colors.success : colors.warn, fontSize: 15, fontWeight: '700' }}>
      {trend === 'up' ? '↑' : '↓'}
    </Text>
  );
};

const StatusMetric = ({
  label,
  value,
  trend,
  favourableUp,
  tone,
}: {
  label: string;
  value: string;
  trend: Trend;
  favourableUp: boolean;
  tone: string;
}) => (
  <View style={{ flex: 1, gap: 5 }}>
    <Label style={{ fontSize: 9.5 }}>{label}</Label>
    <Row gap={5}>
      <Text style={[type.metricSmall, { fontSize: 18, color: tone }]}>{value}</Text>
      <TrendArrow trend={trend} favourableUp={favourableUp} />
    </Row>
  </View>
);

const MetricRow = ({
  icon,
  label,
  value,
  unit,
  detail,
  metric,
  favourableUp = true,
}: {
  icon: IconName;
  label: string;
  value: string;
  unit?: string;
  detail?: string;
  metric?: TrendedMetric | null;
  favourableUp?: boolean;
}) => (
  <Row gap={space.md}>
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: radius.sm,
        backgroundColor: 'rgba(255,255,255,0.055)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={16} color={colors.textSecondary} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={[type.bodyStrong, { fontSize: 14.5 }]}>{label}</Text>
      {detail ? (
        <Caption style={{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }}>{detail}</Caption>
      ) : null}
    </View>
    <Row gap={6}>
      <Row gap={3} style={{ alignItems: 'flex-end' }}>
        <Text style={[type.metricSmall, { fontSize: 17 }]}>{value}</Text>
        {unit ? (
          <Text style={[type.caption, { fontSize: 11, color: colors.textTertiary, marginBottom: 2 }]}>
            {unit}
          </Text>
        ) : null}
      </Row>
      {metric ? <TrendArrow trend={metric.trend} favourableUp={favourableUp} /> : null}
    </Row>
  </Row>
);

export default function IntelligenceScreen() {
  const { me, profile, weeklyInsights, unreadCount } = useApp();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const unit = me.unitPreference;
  const chartWidth = width - space.lg * 2 - space.lg * 2;

  const { currentWeek, score, records, level, fitness, recovery } = profile;
  const todayIndex = (new Date().getDay() + 6) % 7;
  const status = statusLabel(score.overall);

  const paceIn = (secPerKm: number | null) =>
    secPerKm == null ? null : unit === 'imperial' ? secPerKm * 1.609344 : secPerKm;

  return (
    <Screen contentStyle={{ paddingHorizontal: space.lg, gap: space.xl }}>
      <ScreenHeader
        eyebrow={greeting()}
        title={me.displayName.split(' ')[0] ?? me.displayName}
        athleteName={me.displayName}
        athleteId={me.id}
        unreadCount={unreadCount}
      />

      {/* Athlete status ---------------------------------------------------- */}
      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Label>Athlete status</Label>
            <Row gap={space.sm} style={{ alignItems: 'flex-end', marginTop: space.sm }}>
              <Text style={[type.display, { fontSize: 58, lineHeight: 60 }]}>
                {Math.round(score.overall)}
              </Text>
              <Text
                style={[
                  type.title,
                  { color: colors.accent, marginBottom: 9, textTransform: 'capitalize' },
                ]}
              >
                {status}
              </Text>
            </Row>
          </View>
          <Pill tone="violet">
            Lv {level.level} · {level.title}
          </Pill>
        </Row>

        <Divider style={{ marginVertical: space.lg }} />

        <Row gap={space.sm}>
          <StatusMetric
            label="Fitness"
            value={Math.round(fitness.fitness.value).toString()}
            trend={fitness.fitness.trend}
            favourableUp
            tone={colors.cyan}
          />
          <StatusMetric
            label="Recovery"
            value={Math.round(recovery.score).toString()}
            trend={recovery.trend}
            favourableUp
            tone={colors.success}
          />
          <StatusMetric
            label="Fatigue"
            value={Math.round(fitness.fatigue.value).toString()}
            trend={fitness.fatigue.trend}
            favourableUp={false}
            tone={colors.warn}
          />
          <StatusMetric
            label="Load"
            value={Math.round(currentWeek.trainingLoad).toString()}
            trend={profile.trends.volume.direction === 'unknown' ? 'flat' : profile.trends.volume.direction}
            favourableUp
            tone={colors.violet}
          />
        </Row>

        <Divider style={{ marginVertical: space.lg }} />

        <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
          <Icon name="sparkle" size={15} color={colors.violet} />
          <Body style={{ flex: 1, lineHeight: 22 }}>{summariseStatus(profile)}</Body>
        </Row>
      </Card>

      {/* Ask MOOV ---------------------------------------------------------- */}
      <AskMoov />

      {/* Proactive insights ------------------------------------------------ */}
      {weeklyInsights.length > 0 ? (
        <View>
          <SectionHeader title="What MOOV noticed" />
          <View style={{ gap: space.md }}>
            {weeklyInsights.slice(0, 4).map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </View>
        </View>
      ) : null}

      {/* Races ------------------------------------------------------- */}
      <View>
        <SectionHeader title="Race readiness" action="Roadmap" onAction={() => router.push('/journey')} />
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

      {/* Performance ------------------------------------------------------- */}
      <View>
        <SectionHeader title="Performance" />
        <Card style={{ gap: space.lg }}>
          <MetricRow
            icon="zap"
            label="VO2 max"
            value={profile.vo2Max ? profile.vo2Max.toFixed(1) : '—'}
            unit="ml/kg/min"
            detail="Estimated from recent efforts"
          />
          <Divider />
          <MetricRow
            icon="pulse"
            label="Aerobic efficiency"
            value={
              profile.efficiency.changeRatio != null
                ? `${profile.efficiency.changeRatio > 0 ? '+' : ''}${(profile.efficiency.changeRatio * 100).toFixed(1)}%`
                : '—'
            }
            detail="Pace per heartbeat vs last month"
            metric={
              profile.efficiency.changeRatio != null
                ? {
                    value: profile.efficiency.changeRatio,
                    previous: 0,
                    trend:
                      profile.efficiency.direction === 'improving'
                        ? 'up'
                        : profile.efficiency.direction === 'declining'
                          ? 'down'
                          : 'flat',
                    changeRatio: profile.efficiency.changeRatio,
                  }
                : null
            }
          />
          <Divider />
          <MetricRow
            icon="clock"
            label="Average pace"
            value={formatPace(paceIn(profile.trends.pace.current))}
            unit={`/${distanceLabel(unit)}`}
            detail="Four-week average"
            metric={
              profile.trends.pace.changeRatio != null
                ? {
                    value: profile.trends.pace.current ?? 0,
                    previous: profile.trends.pace.baseline ?? 0,
                    trend: profile.trends.pace.direction === 'unknown' ? 'flat' : profile.trends.pace.direction,
                    changeRatio: profile.trends.pace.changeRatio,
                  }
                : null
            }
            favourableUp={false}
          />
          <Divider />
          <MetricRow
            icon="heart"
            label="Average heart rate"
            value={
              profile.trends.heartRate.current ? Math.round(profile.trends.heartRate.current).toString() : '—'
            }
            unit="bpm"
            detail="Four-week average"
            metric={
              profile.trends.heartRate.changeRatio != null
                ? {
                    value: profile.trends.heartRate.current ?? 0,
                    previous: profile.trends.heartRate.baseline ?? 0,
                    trend:
                      profile.trends.heartRate.direction === 'unknown'
                        ? 'flat'
                        : profile.trends.heartRate.direction,
                    changeRatio: profile.trends.heartRate.changeRatio,
                  }
                : null
            }
            favourableUp={false}
          />
        </Card>
      </View>

      {/* Personal records -------------------------------------------------- */}
      <View>
        <SectionHeader title="Personal records" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space.md, paddingRight: space.lg }}
        >
          {records.map((r) => {
            const improvement =
              r.previousElapsedSeconds != null ? r.previousElapsedSeconds - r.elapsedSeconds : null;
            return (
              <Card
                key={r.id}
                style={{ width: 176 }}
                onPress={r.activityId ? () => router.push(`/activity/${r.activityId}`) : undefined}
              >
                <Row gap={6}>
                  <Icon name="trophy" size={13} color={colors.accent} />
                  <Label style={{ color: colors.accent }}>{prDistanceLabel(r.distanceM)}</Label>
                </Row>
                <Text style={[type.metric, { marginTop: space.sm, fontSize: 28 }]}>
                  {formatDuration(r.elapsedSeconds)}
                </Text>
                <Caption style={{ marginTop: 3, fontSize: 12 }}>
                  {formatPace(r.elapsedSeconds / distanceIn(r.distanceM, unit))}/{distanceLabel(unit)}
                </Caption>
                <Divider style={{ marginVertical: space.md }} />
                {improvement != null ? (
                  <Caption style={{ fontSize: 12, color: colors.success }}>
                    {Math.round(improvement)}s faster
                  </Caption>
                ) : (
                  <Caption style={{ fontSize: 12, color: colors.textTertiary }}>First effort</Caption>
                )}
                <Caption style={{ fontSize: 11.5, color: colors.textTertiary, marginTop: 3 }}>
                  {relativeDayLabel(new Date(r.achievedAt), new Date())}
                </Caption>
              </Card>
            );
          })}
        </ScrollView>
      </View>

      {/* Recovery ---------------------------------------------------------- */}
      <View>
        <SectionHeader title="Recovery" />
        <Card>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Row gap={6} style={{ alignItems: 'flex-end' }}>
                <Text style={[type.display, { fontSize: 46, lineHeight: 48 }]}>
                  {Math.round(recovery.score)}
                </Text>
                <Text style={[type.caption, { color: colors.textTertiary, marginBottom: 7 }]}>/ 100</Text>
              </Row>
              <Pill
                tone={
                  recovery.label === 'excellent'
                    ? 'success'
                    : recovery.label === 'good'
                      ? 'cyan'
                      : recovery.label === 'fair'
                        ? 'warn'
                        : 'danger'
                }
              >
                {recovery.label}
              </Pill>
            </View>
            {recovery.series.length > 3 ? (
              <LineChart
                points={recovery.series.map((s, i) => ({ x: i, y: s.score }))}
                width={Math.min(190, width * 0.44)}
                height={78}
                color={colors.success}
                yTicks={2}
                formatY={(v) => String(Math.round(v))}
              />
            ) : null}
          </Row>

          <Divider style={{ marginVertical: space.lg }} />

          <View style={{ gap: space.lg }}>
            <MetricRow
              icon="moon"
              label="Sleep"
              value={
                recovery.sleepMinutes
                  ? `${Math.floor(recovery.sleepMinutes.value / 60)}h ${String(Math.round(recovery.sleepMinutes.value % 60)).padStart(2, '0')}m`
                  : '—'
              }
              detail="Nightly average, last 7 days"
              metric={recovery.sleepMinutes}
              favourableUp
            />
            <Divider />
            <MetricRow
              icon="pulse"
              label="HRV"
              value={recovery.hrv ? Math.round(recovery.hrv.value).toString() : '—'}
              unit="ms"
              detail="Overnight average"
              metric={recovery.hrv}
              favourableUp
            />
            <Divider />
            <MetricRow
              icon="heart"
              label="Resting heart rate"
              value={recovery.restingHr ? Math.round(recovery.restingHr.value).toString() : '—'}
              unit="bpm"
              detail="Overnight average"
              metric={recovery.restingHr}
              favourableUp={false}
            />
          </View>
        </Card>
      </View>

      {/* Athlete profile --------------------------------------------------- */}
      <View>
        <SectionHeader title="Athlete profile" />
        <Card style={{ alignItems: 'center' }}>
          <ScoreRadar
            size={Math.min(310, width - space.lg * 3)}
            axes={[
              { label: 'Speed', value: score.speed.value },
              { label: 'Endurance', value: score.endurance.value },
              { label: 'Climbing', value: score.climbing.value },
              { label: 'Progress', value: score.progression.value },
              { label: 'Consistency', value: score.consistency.value },
            ]}
          />

          <View style={{ alignSelf: 'stretch', gap: space.md, marginTop: space.sm }}>
            {[
              { key: 'Speed', c: score.speed },
              { key: 'Endurance', c: score.endurance },
              { key: 'Consistency', c: score.consistency },
              { key: 'Climbing', c: score.climbing },
              { key: 'Progression', c: score.progression },
            ].map(({ key, c }) => (
              <View key={key}>
                <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={[type.bodyStrong, { fontSize: 14 }]}>{key}</Text>
                  <Text style={[type.metricSmall, { fontSize: 16 }]}>{Math.round(c.value)}</Text>
                </Row>
                <View style={styles.track}>
                  <View
                    style={[styles.trackFill, { width: `${c.value}%`, backgroundColor: colors.cyan }]}
                  />
                </View>
                <Caption style={{ marginTop: 5, fontSize: 12, color: colors.textTertiary }}>
                  {c.explanation}
                </Caption>
              </View>
            ))}
          </View>
        </Card>
      </View>

      {/* History ----------------------------------------------------------- */}
      <View>
        <SectionHeader title="This week" />
        <Card>
          <WeekBars
            values={currentWeek.dailyDistanceM.map((m) => distanceIn(m, unit))}
            labels={WEEKDAY_LABELS}
            todayIndex={todayIndex}
          />
          <Divider style={{ marginVertical: space.lg }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.lg }}>
            <MiniStat
              label="Runs"
              value={String(currentWeek.activityCount)}
              sub={`${profile.previousWeek.activityCount} last week`}
            />
            <MiniStat
              label="Distance"
              value={distanceIn(currentWeek.distanceM, unit).toFixed(1)}
              sub={distanceLabel(unit)}
            />
            <MiniStat label="Time" value={formatDurationCompact(currentWeek.movingSeconds)} sub="moving" />
            <MiniStat
              label="Avg pace"
              value={formatPace(paceIn(currentWeek.avgPaceSecPerKm))}
              sub={`/${distanceLabel(unit)}`}
            />
            <MiniStat
              label="Climb"
              value={Math.round(elevationIn(currentWeek.elevationGainM, unit)).toLocaleString()}
              sub={elevationLabel(unit)}
            />
            <MiniStat
              label="Avg HR"
              value={currentWeek.avgHeartRate ? String(Math.round(currentWeek.avgHeartRate)) : '—'}
              sub="bpm"
            />
          </View>
        </Card>
      </View>

      <View>
        <SectionHeader title="12-week volume" />
        <Card>
          <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
            <View>
              <Label>Weekly average</Label>
              <Text style={[type.metricSmall, { marginTop: 3 }]}>
                {distanceIn(profile.trends.volume.current ?? 0, unit).toFixed(1)} {distanceLabel(unit)}
              </Text>
            </View>
            {profile.trends.volume.changeRatio != null ? (
              <Pill
                tone={profile.trends.volume.favourable ? 'success' : 'warn'}
                icon={
                  <Icon
                    name={profile.trends.volume.direction === 'up' ? 'trendUp' : 'trendDown'}
                    size={12}
                    color={profile.trends.volume.favourable ? colors.success : colors.warn}
                  />
                }
              >
                {`${profile.trends.volume.changeRatio > 0 ? '+' : ''}${Math.round(profile.trends.volume.changeRatio * 100)}%`}
              </Pill>
            ) : null}
          </Row>
          <HistoryBars
            width={chartWidth}
            height={150}
            color={colors.accent}
            values={profile.trailingWeeks.map((w) => distanceIn(w.distanceM, unit))}
            highlightLast
            formatValue={(v) => v.toFixed(0)}
            leftLabel="12 weeks ago"
            rightLabel="This week"
          />
        </Card>
      </View>

      <View>
        <SectionHeader title="Recent activity" />
        <Card padded={false}>
          {profile.recentActivities.slice(0, 6).map((a, i) => (
            <Pressable key={a.id} onPress={() => router.push(`/activity/${a.id}`)}>
              <View style={{ padding: space.lg, paddingVertical: space.md }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.bodyStrong, { fontSize: 14.5 }]} numberOfLines={1}>
                      {a.title}
                    </Text>
                    <Caption style={{ fontSize: 12, marginTop: 2, color: colors.textTertiary }}>
                      {relativeDayLabel(new Date(a.startedAt), new Date())} ·{' '}
                      {formatDurationCompact(a.movingSeconds)}
                      {a.avgHeartRate ? ` · ${a.avgHeartRate} bpm` : ''}
                    </Caption>
                  </View>
                  <Row gap={space.sm}>
                    <Text style={[type.metricSmall, { fontSize: 17 }]}>
                      {distanceIn(a.distanceM, unit).toFixed(1)}
                    </Text>
                    <Icon name="chevronRight" size={16} color={colors.textTertiary} />
                  </Row>
                </Row>
              </View>
              {i < 5 ? <Divider /> : null}
            </Pressable>
          ))}
        </Card>
      </View>

      <Caption style={{ textAlign: 'center', color: colors.textTertiary, fontSize: 11.5 }}>
        {profile.totals.activityCount} activities ·{' '}
        {Math.round(distanceIn(profile.totals.distanceM, unit)).toLocaleString()} {distanceLabel(unit)} ·{' '}
        {Math.round(elevationIn(profile.totals.elevationGainM, unit)).toLocaleString()}{' '}
        {elevationLabel(unit)} climbed
      </Caption>
    </Screen>
  );
}

const MiniStat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <View style={{ width: '33.33%' }}>
    <Label style={{ marginBottom: 4 }}>{label}</Label>
    <Text style={[type.metricSmall, { fontSize: 19 }]}>{value}</Text>
    {sub ? (
      <Text style={[type.caption, { fontSize: 11.5, color: colors.textTertiary, marginTop: 1 }]}>
        {sub}
      </Text>
    ) : null}
  </View>
);

const styles = {
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.07)',
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
};
