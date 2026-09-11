import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import {
  distanceLabel,
  elevationIn,
  elevationLabel,
  formatDistance,
  formatDurationCompact,
  formatPace,
  paceSecondsPerUnit,
  relativeDayLabel,
  contextSentence,
  type Activity,
  type ActivityContext,
  type Athlete,
  type UnitPreference,
} from '@ai/core';
import { colors, radius, space, type } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { RouteMap } from './RouteMap';
import { Avatar, Card, Pill, Row } from './ui';

const clockTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * Each kind of context gets its own colour, so the feed communicates *what sort
 * of* notable this was before the label is even read — a record looks different
 * from a comeback at a glance.
 */
const CONTEXT_STYLE: Record<
  ActivityContext['kind'],
  { tone: 'accent' | 'cyan' | 'success' | 'warn' | 'violet' | 'neutral'; icon: IconName; color: string }
> = {
  personal_record: { tone: 'accent', icon: 'trophy', color: colors.accent },
  season_best: { tone: 'warn', icon: 'trophy', color: colors.warn },
  longest: { tone: 'cyan', icon: 'clock', color: colors.cyan },
  comeback: { tone: 'violet', icon: 'flame', color: colors.violet },
  negative_split: { tone: 'success', icon: 'trendUp', color: colors.success },
  biggest_climb: { tone: 'violet', icon: 'mountain', color: colors.violet },
  streak: { tone: 'accent', icon: 'flame', color: colors.accent },
  plan_session: { tone: 'neutral', icon: 'target', color: colors.textSecondary },
  session_role: { tone: 'neutral', icon: 'calendar', color: colors.textSecondary },
  volume_milestone: { tone: 'cyan', icon: 'target', color: colors.cyan },
};

export const ActivityCard = ({
  activity,
  athlete,
  unit,
  privacyRadiusM = 0,
  onLike,
}: {
  activity: Activity;
  athlete: Athlete | undefined;
  unit: UnitPreference;
  privacyRadiusM?: number;
  onLike?: () => void;
}) => {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const mapWidth = width - space.lg * 2 - 2;
  const pace = paceSecondsPerUnit(activity.distanceM, activity.movingSeconds, unit);
  const insight = contextSentence(activity.context ?? [], athlete?.displayName ?? 'This athlete');

  const open = () => router.push(`/activity/${activity.id}`);

  return (
    <Card padded={false}>
      <Pressable onPress={open}>
        <View style={{ padding: space.lg, paddingBottom: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Pressable onPress={() => athlete && router.push(`/profile/${athlete.id}`)}>
              <Avatar name={athlete?.displayName ?? '??'} size={42} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>{athlete?.displayName ?? 'Unknown athlete'}</Text>
              <Text style={[type.caption, { color: colors.textTertiary, marginTop: 1 }]}>
                {relativeDayLabel(new Date(activity.startedAt), new Date())} at{' '}
                {clockTime(activity.startedAt)}
              </Text>
            </View>
            {activity.visibility === 'private' ? (
              <Icon name="lock" size={15} color={colors.textTertiary} />
            ) : null}
          </View>

          <Text style={[type.subtitle, { marginTop: space.md }]}>{activity.title}</Text>

          {activity.context && activity.context.length > 0 ? (
            <>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: space.sm, flexWrap: 'wrap' }}>
                {activity.context.slice(0, 2).map((c, i) => {
                  const style = CONTEXT_STYLE[c.kind];
                  return (
                    <Pill
                      key={i}
                      tone={style.tone}
                      icon={<Icon name={style.icon} size={12} color={style.color} />}
                    >
                      {c.label}
                    </Pill>
                  );
                })}
              </View>

              {/* The differentiator: why this run mattered, not just that it happened. */}
              {insight ? (
                <View
                  style={{
                    marginTop: space.md,
                    padding: space.md,
                    borderRadius: radius.sm,
                    backgroundColor: colors.violetSoft,
                    gap: 5,
                  }}
                >
                  <Row gap={5}>
                    <Icon name="sparkle" size={11} color={colors.violet} />
                    <Text style={[type.label, { color: colors.violet, fontSize: 9.5 }]}>
                      MOOV Insight
                    </Text>
                  </Row>
                  <Text style={[type.caption, { color: colors.text, lineHeight: 19, fontSize: 13.5 }]}>
                    {insight}
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', paddingHorizontal: space.lg, gap: space.xl, marginBottom: space.md }}>
          <Stat label={`Distance`} value={formatDistance(activity.distanceM, unit)} unit={distanceLabel(unit)} />
          <Stat label="Pace" value={formatPace(pace)} unit={`/${distanceLabel(unit)}`} />
          <Stat label="Time" value={formatDurationCompact(activity.movingSeconds)} />
          {activity.elevationGainM ? (
            <Stat
              label="Climb"
              value={String(Math.round(elevationIn(activity.elevationGainM, unit)))}
              unit={elevationLabel(unit)}
            />
          ) : null}
        </View>

        {activity.stream?.latitude?.length ? (
          <View
            style={{
              marginHorizontal: space.lg,
              borderRadius: radius.md,
              overflow: 'hidden',
              backgroundColor: 'rgba(255,255,255,0.025)',
            }}
          >
            <RouteMap
              stream={activity.stream}
              width={mapWidth}
              height={150}
              privacyRadiusM={privacyRadiusM}
            />
          </View>
        ) : null}
      </Pressable>

      <View style={styles.footer}>
        <Pressable
          onPress={onLike}
          hitSlop={10}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Icon
            name={activity.likedByMe ? 'heartFilled' : 'heart'}
            size={19}
            color={activity.likedByMe ? colors.accent : colors.textSecondary}
          />
          <Text style={[type.caption, { color: activity.likedByMe ? colors.accent : colors.textSecondary }]}>
            {activity.likeCount}
          </Text>
        </Pressable>

        <Pressable
          onPress={open}
          hitSlop={10}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Icon name="comment" size={18} color={colors.textSecondary} />
          <Text style={[type.caption, { color: colors.textSecondary }]}>{activity.commentCount}</Text>
        </Pressable>

        <View style={{ flex: 1 }} />
        <Icon name="share" size={17} color={colors.textTertiary} />
      </View>
    </Card>
  );
};

const Stat = ({ label, value, unit }: { label: string; value: string; unit?: string }) => (
  <View>
    <Text style={[type.label, { marginBottom: 3 }]}>{label}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <Text style={type.metricSmall}>{value}</Text>
      {unit ? (
        <Text style={[type.caption, { color: colors.textTertiary, fontSize: 11, marginLeft: 2, marginBottom: 2 }]}>
          {unit}
        </Text>
      ) : null}
    </View>
  </View>
);

const styles = {
  footer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xl,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    marginTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
};
