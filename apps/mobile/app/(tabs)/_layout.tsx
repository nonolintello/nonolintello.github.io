import { Tabs } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../../src/components/Icon';
import { colors, hairline, radius, space, type } from '../../src/theme/tokens';

/**
 * Understand me · Improve me · Connect me · Inspire me.
 *
 * All four are destinations, not actions — logging an activity is a verb and
 * lives behind the "+" in the header instead of occupying a tab.
 */
const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index', label: 'Intelligence', icon: 'pulse' },
  { name: 'training', label: 'Training', icon: 'target' },
  { name: 'community', label: 'Community', icon: 'community' },
  { name: 'discover', label: 'Discover', icon: 'compass' },
];

/**
 * Structural typing of just the tab-bar surface we use, rather than importing
 * from @react-navigation — expo-router owns that dependency and the exact
 * package it resolves to has moved between SDK versions.
 */
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    emit(event: { type: 'tabPress'; target: string; canPreventDefault: true }): {
      defaultPrevented: boolean;
    };
    navigate(name: string): void;
  };
}

/**
 * Custom bar rather than the default: Activity is a primary action, not a peer
 * of the other three, and the accent treatment is what says so.
 */
const TabBar = ({ state, navigation }: TabBarProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.bgElevated,
        borderTopWidth: hairline,
        borderTopColor: colors.border,
        paddingTop: space.md,
        paddingBottom: Math.max(insets.bottom, space.md),
        paddingHorizontal: space.sm,
      }}
    >
      {state.routes.map((route, index) => {
        const tab = TABS.find((t) => t.name === route.name);
        if (!tab) return null;
        const focused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={{ flex: 1, alignItems: 'center', gap: 5 }}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={tab.label}
          >
            <View style={{ height: 30, justifyContent: 'center' }}>
              <Icon
                name={tab.icon}
                size={22}
                color={focused ? colors.accent : colors.textTertiary}
                strokeWidth={focused ? 2.3 : 1.9}
              />
            </View>
            <Text
              style={[
                type.label,
                {
                  fontSize: 9,
                  letterSpacing: 0.6,
                  color: focused ? colors.text : colors.textTertiary,
                },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="training" />
      <Tabs.Screen name="community" />
      <Tabs.Screen name="discover" />
    </Tabs>
  );
}
