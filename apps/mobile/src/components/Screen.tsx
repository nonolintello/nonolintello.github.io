import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../theme/tokens';

export const Screen = ({
  children,
  scroll = true,
  contentStyle,
  onRefresh,
  refreshing = false,
  onEndReached,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  onRefresh?: () => void;
  refreshing?: boolean;
  onEndReached?: () => void;
}) => {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: insets.top + space.sm,
    paddingBottom: space.xxxl,
  };

  if (!scroll) {
    return <View style={[{ flex: 1, backgroundColor: colors.bg }, padding, contentStyle]}>{children}</View>;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[padding, contentStyle]}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={
        onEndReached
          ? ({ nativeEvent }) => {
              const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
              if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 600) {
                onEndReached();
              }
            }
          : undefined
      }
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
};
