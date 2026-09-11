import { Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { colors, type } from '../theme/tokens';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Ring gauge. Overachievement is shown as a second lap rather than a full ring. */
export const ProgressRing = ({
  progress,
  size = 168,
  strokeWidth = 13,
  color = colors.accent,
  trackColor = 'rgba(255,255,255,0.08)',
  children,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
}) => {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const primary = clamp01(progress);
  const overflow = clamp01(progress - 1);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference * primary} ${circumference}`}
          />
          {overflow > 0 ? (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={colors.success}
              strokeWidth={strokeWidth * 0.5}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${circumference * overflow} ${circumference}`}
            />
          ) : null}
        </G>
      </Svg>
      <View style={{ alignItems: 'center' }}>{children}</View>
    </View>
  );
};

/** Distance per day, Monday first. Today is marked so the week reads at a glance. */
export const WeekBars = ({
  values,
  labels,
  todayIndex,
  height = 92,
  color = colors.accent,
}: {
  values: number[];
  labels: readonly string[];
  todayIndex: number;
  height?: number;
  color?: string;
}) => {
  const max = Math.max(...values, 1);
  const barCount = values.length;

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 6 }}>
        {values.map((v, i) => {
          const isFuture = i > todayIndex;
          const isToday = i === todayIndex;
          const barHeight = Math.max(v > 0 ? 6 : 3, (v / max) * height);
          return (
            <View key={i} style={{ flex: 1, height, justifyContent: 'flex-end' }}>
              <View
                style={{
                  height: barHeight,
                  borderRadius: 5,
                  backgroundColor:
                    v === 0
                      ? 'rgba(255,255,255,0.06)'
                      : isToday
                        ? colors.cyan
                        : isFuture
                          ? 'rgba(255,255,255,0.06)'
                          : color,
                  opacity: v === 0 ? 1 : isFuture ? 0.4 : 1,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
        {Array.from({ length: barCount }).map((_, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text
              style={[
                type.label,
                {
                  fontSize: 9.5,
                  letterSpacing: 0.8,
                  color: i === todayIndex ? colors.cyan : colors.textTertiary,
                },
              ]}
            >
              {labels[i] ?? ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

export interface SeriesPoint {
  x: number;
  y: number;
}

/** Catmull-Rom → cubic Bézier. Keeps the line smooth without overshooting data. */
const smoothPath = (points: SeriesPoint[], toX: (x: number) => number, toY: (y: number) => number) => {
  if (points.length === 0) return '';
  if (points.length < 3) {
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.x).toFixed(2)},${toY(p.y).toFixed(2)}`)
      .join(' ');
  }

  let d = `M${toX((points[0] as SeriesPoint).x).toFixed(2)},${toY((points[0] as SeriesPoint).y).toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)] as SeriesPoint;
    const p1 = points[i] as SeriesPoint;
    const p2 = points[i + 1] as SeriesPoint;
    const p3 = points[Math.min(points.length - 1, i + 2)] as SeriesPoint;

    const c1x = toX(p1.x) + (toX(p2.x) - toX(p0.x)) / 6;
    const c1y = toY(p1.y) + (toY(p2.y) - toY(p0.y)) / 6;
    const c2x = toX(p2.x) - (toX(p3.x) - toX(p1.x)) / 6;
    const c2y = toY(p2.y) - (toY(p3.y) - toY(p1.y)) / 6;

    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${toX(p2.x).toFixed(2)},${toY(p2.y).toFixed(2)}`;
  }
  return d;
};

export const LineChart = ({
  points,
  width,
  height = 150,
  color = colors.cyan,
  fill = true,
  /** Lower values render higher — used for pace, where faster is better. */
  invertY = false,
  yTicks = 3,
  formatY = (v: number) => String(Math.round(v)),
  xLabels,
  smooth = true,
  highlight,
}: {
  points: SeriesPoint[];
  width: number;
  height?: number;
  color?: string;
  fill?: boolean;
  invertY?: boolean;
  yTicks?: number;
  formatY?: (v: number) => string;
  xLabels?: { at: number; label: string }[];
  smooth?: boolean;
  highlight?: { from: number; to: number };
}) => {
  if (points.length < 2) return <View style={{ height }} />;

  const padLeft = 38;
  const padRight = 8;
  const padTop = 10;
  const padBottom = xLabels ? 22 : 8;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  // Breathing room so the line never touches the frame.
  const padY = (maxY - minY) * 0.12 || Math.abs(maxY) * 0.1 || 1;
  minY -= padY;
  maxY += padY;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const toX = (x: number) => padLeft + ((x - minX) / (maxX - minX || 1)) * plotW;
  const toY = (y: number) => {
    const t = (y - minY) / (maxY - minY || 1);
    return padTop + (invertY ? t : 1 - t) * plotH;
  };

  const d = smooth ? smoothPath(points, toX, toY) : points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.x).toFixed(2)},${toY(p.y).toFixed(2)}`)
    .join(' ');

  const areaD = `${d} L${toX(maxX).toFixed(2)},${(padTop + plotH).toFixed(2)} L${toX(minX).toFixed(2)},${(padTop + plotH).toFixed(2)} Z`;

  const ticks = Array.from({ length: yTicks }, (_, i) => minY + ((maxY - minY) / (yTicks - 1)) * i);
  const gradientId = `grad-${color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.32} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      {ticks.map((t, i) => (
        <G key={i}>
          <Line
            x1={padLeft}
            y1={toY(t)}
            x2={width - padRight}
            y2={toY(t)}
            stroke="rgba(255,255,255,0.055)"
            strokeWidth={1}
          />
          <SvgText
            x={padLeft - 7}
            y={toY(t) + 3.5}
            fill={colors.textTertiary}
            fontSize={10}
            textAnchor="end"
          >
            {formatY(t)}
          </SvgText>
        </G>
      ))}

      {highlight ? (
        <Rect
          x={toX(highlight.from)}
          y={padTop}
          width={Math.max(2, toX(highlight.to) - toX(highlight.from))}
          height={plotH}
          fill={colors.accent}
          opacity={0.13}
        />
      ) : null}

      {fill ? <Path d={areaD} fill={`url(#${gradientId})`} /> : null}
      <Path d={d} stroke={color} strokeWidth={2.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />

      {xLabels?.map((l, i) => (
        <SvgText
          key={i}
          x={toX(l.at)}
          y={height - 6}
          fill={colors.textTertiary}
          fontSize={10}
          // Edge labels anchor inward, or they render past the chart's bounds.
          textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}
        >
          {l.label}
        </SvgText>
      ))}
    </Svg>
  );
};

/** Compact trend line with no axes — for inline use inside a row or tile. */
export const Sparkline = ({
  values,
  width = 72,
  height = 26,
  color = colors.textSecondary,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) => {
  if (values.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (width - 2) + 1;
      const y = height - 2 - ((v - min) / span) * (height - 4);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={color} strokeWidth={1.8} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
};

/**
 * Discrete buckets — weekly volume, monthly totals — as bars.
 *
 * A smoothed line across weekly points implies values between the weeks that do
 * not exist, and the interpolation dips toward zero between bars. Weeks are
 * counted, not sampled, so bars are the honest form.
 */
export const HistoryBars = ({
  values,
  width,
  height = 150,
  color = colors.accent,
  /** Renders the final bar as in-progress — the current week is incomplete. */
  highlightLast = false,
  formatValue = (v: number) => v.toFixed(0),
  leftLabel,
  rightLabel,
}: {
  values: number[];
  width: number;
  height?: number;
  color?: string;
  highlightLast?: boolean;
  formatValue?: (v: number) => string;
  leftLabel?: string;
  rightLabel?: string;
}) => {
  if (values.length === 0) return <View style={{ height }} />;

  const padLeft = 34;
  const padBottom = 20;
  const padTop = 10;
  const plotW = width - padLeft - 6;
  const plotH = height - padTop - padBottom;

  const max = Math.max(...values, 1);
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const gap = 4;
  const barW = Math.max(3, plotW / values.length - gap);
  const averageY = padTop + plotH - (average / max) * plotH;

  return (
    <Svg width={width} height={height}>
      {[max, max / 2].map((tick, i) => (
        <G key={i}>
          <Line
            x1={padLeft}
            y1={padTop + plotH - (tick / max) * plotH}
            x2={width - 6}
            y2={padTop + plotH - (tick / max) * plotH}
            stroke="rgba(255,255,255,0.055)"
            strokeWidth={1}
          />
          <SvgText
            x={padLeft - 7}
            y={padTop + plotH - (tick / max) * plotH + 3.5}
            fill={colors.textTertiary}
            fontSize={10}
            textAnchor="end"
          >
            {formatValue(tick)}
          </SvgText>
        </G>
      ))}

      {values.map((v, i) => {
        const barH = Math.max(v > 0 ? 3 : 1.5, (v / max) * plotH);
        const isLast = highlightLast && i === values.length - 1;
        return (
          <Rect
            key={i}
            x={padLeft + i * (barW + gap)}
            y={padTop + plotH - barH}
            width={barW}
            height={barH}
            rx={Math.min(3, barW / 2)}
            fill={isLast ? colors.cyan : color}
            opacity={v === 0 ? 0.18 : isLast ? 0.95 : 0.85}
          />
        );
      })}

      <Line
        x1={padLeft}
        y1={averageY}
        x2={width - 6}
        y2={averageY}
        stroke={colors.textTertiary}
        strokeWidth={1}
        strokeDasharray="3 4"
      />

      {leftLabel ? (
        <SvgText x={padLeft} y={height - 5} fill={colors.textTertiary} fontSize={10} textAnchor="start">
          {leftLabel}
        </SvgText>
      ) : null}
      {rightLabel ? (
        <SvgText x={width - 6} y={height - 5} fill={colors.textTertiary} fontSize={10} textAnchor="end">
          {rightLabel}
        </SvgText>
      ) : null}
    </Svg>
  );
};

export interface RadarAxis {
  label: string;
  value: number;
}

/**
 * Five-axis athlete profile. A shape is read faster than five numbers, and it
 * makes the athlete's imbalance — the point of the dimension breakdown —
 * immediately visible.
 */
export const ScoreRadar = ({
  axes,
  size = 220,
  color = colors.accent,
}: {
  axes: RadarAxis[];
  size?: number;
  color?: string;
}) => {
  const cx = size / 2;
  const cy = size / 2;
  // Leaves room for axis labels: the left and right vertices sit near the
  // horizontal, where a long word like "CONSISTENCY" would otherwise clip.
  const r = size / 2 - 52;
  const n = axes.length;

  const pointAt = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    const radius = (value / 100) * r;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  };

  const rings = [25, 50, 75, 100];
  const shape = axes.map((a, i) => pointAt(i, a.value));

  return (
    <Svg width={size} height={size}>
      {rings.map((ring) => (
        <Polygon
          key={ring}
          points={axes.map((_, i) => { const p = pointAt(i, ring); return `${p.x},${p.y}`; }).join(' ')}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={1}
        />
      ))}

      {axes.map((_, i) => {
        const p = pointAt(i, 100);
        return <Line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />;
      })}

      <Polygon
        points={shape.map((p) => `${p.x},${p.y}`).join(' ')}
        fill={color}
        fillOpacity={0.22}
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {shape.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
      ))}

      {axes.map((a, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const labelRadius = r + 20;
        const x = cx + Math.cos(angle) * labelRadius;
        const y = cy + Math.sin(angle) * labelRadius;
        return (
          <SvgText
            key={a.label}
            x={x}
            y={y + 3.5}
            fill={colors.textTertiary}
            fontSize={9.5}
            fontWeight="700"
            textAnchor="middle"
          >
            {a.label.toUpperCase()}
          </SvgText>
        );
      })}
    </Svg>
  );
};
