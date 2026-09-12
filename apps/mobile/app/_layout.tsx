import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { AppProvider } from '../src/data/store';
import { colors } from '../src/theme/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="light" />
        <AppProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="activity/[id]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="profile/[id]" />
            <Stack.Screen name="event/[id]" />
            {/* Coach mode is a separate surface on the same data. */}
            <Stack.Screen name="coach/login" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="coach/index" />
            <Stack.Screen name="coach/athlete/[id]" />
            <Stack.Screen name="coach/plan/[athleteId]" />
            {/* Actions and global surfaces arrive as sheets, not destinations. */}
            <Stack.Screen name="log" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="notifications" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="search" options={{ animation: 'fade' }} />
          </Stack>
        </AppProvider>
      </View>
    </SafeAreaProvider>
  );
}
