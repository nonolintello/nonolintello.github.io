import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, hairline, radius, space, type } from '../theme/tokens';

export const Card = ({
  children,
  style,
  padded = true,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  onPress?: () => void;
}) => {
  const content = (
    <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
};

export const Label = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => (
  <Text style={[type.label, style]}>{children}</Text>
);

export const Title = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => (
  <Text style={[type.title, style]}>{children}</Text>
);

export const Body = ({
  children,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) => (
  <Text style={[type.body, style]} numberOfLines={numberOfLines}>
    {children}
  </Text>
);

export const Caption = ({
  children,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) => (
  <Text style={[type.caption, style]} numberOfLines={numberOfLines}>
    {children}
  </Text>
);

/**
 * A number with its unit and label. The unit sits at a smaller size on the
 * value's baseline so the figure itself stays the thing the eye lands on.
 */
export const Metric = ({
  value,
  unit,
  label,
  tone = 'default',
  size = 'medium',
}: {
  value: string;
  unit?: string;
  label?: string;
  tone?: 'default' | 'accent' | 'cyan' | 'success' | 'muted';
  size?: 'display' | 'medium' | 'small';
}) => {
  const toneColor = {
    default: colors.text,
    accent: colors.accent,
    cyan: colors.cyan,
    success: colors.success,
    muted: colors.textSecondary,
  }[tone];

  const valueStyle =
    size === 'display' ? type.display : size === 'small' ? type.metricSmall : type.metric;
  const unitSize = size === 'display' ? 20 : size === 'small' ? 12 : 15;

  return (
    <View>
      {label ? <Label style={{ marginBottom: 6 }}>{label}</Label> : null}
      <View style={styles.metricRow}>
        <Text style={[valueStyle, { color: toneColor }]}>{value}</Text>
        {unit ? (
          <Text
            style={[
              type.caption,
              { color: colors.textTertiary, fontSize: unitSize, marginLeft: 4, marginBottom: 3 },
            ]}
          >
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

export const Pill = ({
  children,
  tone = 'neutral',
  icon,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'cyan' | 'success' | 'warn' | 'violet' | 'danger';
  icon?: ReactNode;
}) => {
  const map = {
    neutral: { bg: 'rgba(255,255,255,0.06)', fg: colors.textSecondary },
    accent: { bg: colors.accentSoft, fg: colors.accent },
    cyan: { bg: colors.cyanSoft, fg: colors.cyan },
    success: { bg: colors.successSoft, fg: colors.success },
    warn: { bg: colors.warnSoft, fg: colors.warn },
    violet: { bg: colors.violetSoft, fg: colors.violet },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
  }[tone];

  return (
    <View style={[styles.pill, { backgroundColor: map.bg }]}>
      {icon}
      <Text style={[type.caption, { color: map.fg, fontWeight: '700', fontSize: 12 }]}>
        {children}
      </Text>
    </View>
  );
};

/**
 * Initials rather than a remote image. Avoids a network dependency for the
 * prototype and degrades predictably when an athlete has no photo.
 */
export const Avatar = ({
  name,
  size = 40,
  tone,
}: {
  name: string;
  size?: number;
  tone?: string;
}) => {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  // Stable colour per person, so the same athlete always looks the same.
  const palette = [colors.accent, colors.cyan, colors.violet, colors.success, colors.warn];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const background = tone ?? palette[hash % palette.length] ?? colors.accent;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: colors.textInverse,
          fontWeight: '800',
          fontSize: size * 0.38,
          letterSpacing: -0.3,
        }}
      >
        {initials}
      </Text>
    </View>
  );
};

export const Row = ({
  children,
  style,
  gap = space.md,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
}) => <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;

export const Divider = ({ style }: { style?: StyleProp<ViewStyle> }) => (
  <View style={[styles.divider, style]} />
);

export const SectionHeader = ({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) => (
  <View style={styles.sectionHeader}>
    <Label>{title}</Label>
    {action ? (
      <Pressable onPress={onAction} hitSlop={10}>
        <Text style={[type.caption, { color: colors.accent, fontWeight: '700' }]}>{action}</Text>
      </Pressable>
    ) : null}
  </View>
);

export const Button = ({
  children,
  onPress,
  variant = 'primary',
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  style?: StyleProp<ViewStyle>;
}) => {
  const variantStyle =
    variant === 'primary'
      ? { backgroundColor: colors.accent }
      : variant === 'secondary'
        ? { backgroundColor: colors.surfaceRaised, borderWidth: hairline, borderColor: colors.border }
        : { backgroundColor: 'transparent' };
  const textColor = variant === 'primary' ? colors.textInverse : colors.text;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, variantStyle, pressed && { opacity: 0.75 }, style]}
    >
      <Text style={{ color: textColor, fontWeight: '700', fontSize: 15, letterSpacing: -0.2 }}>
        {children}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardPadded: {
    padding: space.lg,
  },
  pressed: {
    opacity: 0.7,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  divider: {
    height: hairline,
    backgroundColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  button: {
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
});
