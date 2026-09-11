import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { relativeDayLabel, type NotificationKind } from '@ai/core';
import { Screen } from '../src/components/Screen';
import { Icon, type IconName } from '../src/components/Icon';
import { Body, Caption, Card, Divider, Row } from '../src/components/ui';
import { useApp } from '../src/data/store';
import { colors, radius, space, type } from '../src/theme/tokens';

const KIND_STYLE: Record<NotificationKind, { icon: IconName; color: string }> = {
  activity: { icon: 'pulse', color: colors.cyan },
  comment: { icon: 'comment', color: colors.textSecondary },
  like: { icon: 'heartFilled', color: colors.accent },
  follow: { icon: 'community', color: colors.violet },
  challenge: { icon: 'trophy', color: colors.warn },
  achievement: { icon: 'flame', color: colors.accent },
  personal_record: { icon: 'trophy', color: colors.accent },
  recommendation: { icon: 'target', color: colors.accent },
  race_reminder: { icon: 'calendar', color: colors.cyan },
  insight: { icon: 'sparkle', color: colors.violet },
};

export default function NotificationsScreen() {
  const { notifications, markNotificationsRead } = useApp();
  const router = useRouter();

  // Mark read on leaving, not on arrival, so the unread styling is visible
  // while the athlete is actually reading the list.
  useEffect(() => () => markNotificationsRead(), [markNotificationsRead]);

  return (
    <Screen contentStyle={{ paddingHorizontal: space.lg, gap: space.lg }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={[type.title, { fontSize: 24 }]}>Notifications</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Close">
          <Icon name="close" size={20} color={colors.textSecondary} />
        </Pressable>
      </Row>

      <Card padded={false}>
        {notifications.map((n, i) => {
          const style = KIND_STYLE[n.kind];
          return (
            <View key={n.id}>
              <Pressable
                onPress={() => n.activityId && router.push(`/activity/${n.activityId}`)}
                style={({ pressed }) => pressed && { opacity: 0.7 }}
              >
                <Row
                  gap={space.md}
                  style={{
                    padding: space.lg,
                    paddingVertical: space.md,
                    alignItems: 'flex-start',
                    backgroundColor: n.read ? 'transparent' : 'rgba(255,90,54,0.045)',
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: radius.sm,
                      backgroundColor: `${style.color}1F`,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name={style.icon} size={16} color={style.color} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[type.bodyStrong, { fontSize: 14.5 }]}>{n.title}</Text>
                    {n.body ? (
                      <Body style={{ fontSize: 13, marginTop: 2, lineHeight: 18 }}>{n.body}</Body>
                    ) : null}
                    <Caption style={{ fontSize: 11.5, color: colors.textTertiary, marginTop: 4 }}>
                      {relativeDayLabel(new Date(n.createdAt), new Date())}
                    </Caption>
                  </View>

                  {!n.read ? (
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 4,
                        backgroundColor: colors.accent,
                        marginTop: 6,
                      }}
                    />
                  ) : null}
                </Row>
              </Pressable>
              {i < notifications.length - 1 ? <Divider /> : null}
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}
