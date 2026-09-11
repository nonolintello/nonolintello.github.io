import { Platform, type TextStyle } from 'react-native';

/**
 * Dark by default. Athletes read this outdoors at 6am and indoors at 9pm, and a
 * near-black ground lets the one accent colour carry all the emphasis without
 * the interface competing with the data.
 */
export const colors = {
  bg: '#07080B',
  bgElevated: '#0C0E13',
  surface: '#101218',
  surfaceRaised: '#171A22',
  surfacePressed: '#1D212B',

  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.14)',

  text: '#F2F4F8',
  textSecondary: '#9AA1AF',
  textTertiary: '#5C6373',
  textInverse: '#07080B',

  /** Energy. Reserved for effort, records and the primary call to action. */
  accent: '#FF5A36',
  accentSoft: 'rgba(255,90,54,0.14)',
  /** Data. Used for measured series — pace, heart rate, elevation. */
  cyan: '#38BDF8',
  cyanSoft: 'rgba(56,189,248,0.14)',
  violet: '#A78BFA',
  violetSoft: 'rgba(167,139,250,0.14)',
  success: '#34D399',
  successSoft: 'rgba(52,211,153,0.14)',
  warn: '#FBBF24',
  warnSoft: 'rgba(251,191,36,0.14)',
  danger: '#F87171',
  dangerSoft: 'rgba(248,113,113,0.14)',

  overlay: 'rgba(7,8,11,0.86)',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

/**
 * Tabular figures everywhere a number can change. Without them a ticking pace
 * or a counting-up distance visibly jitters as glyph widths shift.
 */
const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

const systemFont = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'system-ui',
});

export const type = {
  /** The one enormous number a screen is about. */
  display: {
    fontFamily: systemFont,
    fontSize: 60,
    lineHeight: 62,
    fontWeight: '700',
    letterSpacing: -2.4,
    color: colors.text,
    ...tabular,
  } as TextStyle,
  metric: {
    fontFamily: systemFont,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -1.1,
    color: colors.text,
    ...tabular,
  } as TextStyle,
  metricSmall: {
    fontFamily: systemFont,
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: colors.text,
    ...tabular,
  } as TextStyle,
  title: {
    fontFamily: systemFont,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: colors.text,
  } as TextStyle,
  subtitle: {
    fontFamily: systemFont,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: colors.text,
  } as TextStyle,
  body: {
    fontFamily: systemFont,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '400',
    color: colors.textSecondary,
  } as TextStyle,
  bodyStrong: {
    fontFamily: systemFont,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: colors.text,
  } as TextStyle,
  caption: {
    fontFamily: systemFont,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
    color: colors.textSecondary,
  } as TextStyle,
  /** Micro-label: uppercase, widely tracked. Names a number without shouting. */
  label: {
    fontFamily: systemFont,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '700',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.textTertiary,
  } as TextStyle,
} as const;

export const hairline = 1;

/** Consistent elevation. Kept subtle — heavy shadows read as cheap on dark. */
export const shadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  android: { elevation: 6 },
  default: {},
}) as object;
