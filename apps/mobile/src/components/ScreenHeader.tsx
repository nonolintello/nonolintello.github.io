import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, radius, space, type } from '../theme/tokens';
import { Icon } from './Icon';
import { Avatar, Caption, Row } from './ui';
import type { IconName } from './Icon';

const HeaderButton = ({
  icon,
  label,
  onPress,
  badge = 0,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  badge?: number;
}) => (
  <Pressable
    onPress={onPress}
    hitSlop={6}
    accessibilityLabel={label}
    style={({ pressed }) => [
      {
        width: 38,
        height: 38,
        borderRadius: radius.sm,
        backgroundColor: 'rgba(255,255,255,0.055)',
        alignItems: 'center',
        justifyContent: 'center',
      },
      pressed && { opacity: 0.6 },
    ]}
  >
    <Icon name={icon} size={19} color={colors.textSecondary} />
    {badge > 0 ? (
      <View
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          minWidth: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.accent,
        }}
      />
    ) : null}
  </Pressable>
);

/**
 * Shared header for the tab destinations.
 *
 * Logging lives here as a "+" rather than in the tab bar: all four tabs are
 * places you go to understand, improve, connect or be inspired, and adding an
 * activity is none of those — it is an action performed from wherever you are.
 */
export const ScreenHeader = ({
  eyebrow,
  title,
  athleteName,
  athleteId,
  showLogAction = true,
  showGlobalActions = true,
  unreadCount = 0,
  trailing,
}: {
  eyebrow?: string;
  title: string;
  athleteName?: string;
  athleteId?: string;
  showLogAction?: boolean;
  showGlobalActions?: boolean;
  unreadCount?: number;
  trailing?: ReactNode;
}) => {
  const router = useRouter();

  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Caption style={{ color: colors.textTertiary }}>{eyebrow}</Caption> : null}
        <Text style={[type.title, { fontSize: 24, marginTop: eyebrow ? 2 : 0 }]}>{title}</Text>
      </View>

      <Row gap={space.sm}>
        {trailing}

        {showGlobalActions ? (
          <>
            <HeaderButton
              icon="search"
              label="Search"
              onPress={() => router.push('/search')}
            />
            <HeaderButton
              icon="bell"
              label="Notifications"
              onPress={() => router.push('/notifications')}
              badge={unreadCount}
            />
          </>
        ) : null}

        {showLogAction ? (
          <Pressable
            onPress={() => router.push('/log')}
            hitSlop={8}
            accessibilityLabel="Log an activity"
            style={({ pressed }) => [
              {
                width: 38,
                height: 38,
                borderRadius: radius.sm,
                backgroundColor: colors.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Icon name="plus" size={20} color={colors.accent} strokeWidth={2.6} />
          </Pressable>
        ) : null}

        {athleteName && athleteId ? (
          <Pressable
            onPress={() => router.push(`/profile/${athleteId}`)}
            accessibilityLabel="Your profile"
          >
            <Avatar name={athleteName} size={38} />
          </Pressable>
        ) : null}
      </Row>
    </Row>
  );
};
