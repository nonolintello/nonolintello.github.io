import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import type { Roadmap, RoadmapCheckpoint } from '@ai/core';
import { colors, radius, space, type } from '../theme/tokens';

/**
 * The journey drawn on the race course.
 *
 * The course polyline is the road; the athlete's position and every checkpoint
 * are placed along it by fraction of its length. Behind them, the path is
 * painted solid up to today and faint beyond it, so the picture says at a
 * glance how far along the build is and what is still to come — the same thing
 * a race-day spectator map says, which is the point.
 *
 * Interaction is on top of the SVG rather than inside it: hit testing and the
 * callout are ordinary Views positioned at projected coordinates, which keeps
 * touch handling and typography identical across iOS, Android and web.
 *
 * Without a course (no race) a stylised switchback path stands in, so the level
 * ladder reads as the same kind of journey.
 */

interface Point {
  x: number;
  y: number;
}

/** Winding path for the level roadmap, top-left to bottom-right. */
const switchbacks = (w: number, h: number): Point[] => {
  const pts: Point[] = [];
  const rows = 3;
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const row = Math.floor(t * rows);
    const local = t * rows - row;
    const x = row % 2 === 0 ? local : 1 - local;
    const y = (row + Math.sin(local * Math.PI) * 0.18) / rows;
    pts.push({ x: x * w, y: y * h });
  }
  return pts;
};

const project = (course: { lat: number[]; lon: number[] }, w: number, h: number): Point[] => {
  const minLat = Math.min(...course.lat);
  const maxLat = Math.max(...course.lat);
  const minLon = Math.min(...course.lon);
  const maxLon = Math.max(...course.lon);
  const lonScale = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanLat = Math.max(1e-6, maxLat - minLat);
  const spanLon = Math.max(1e-6, (maxLon - minLon) * lonScale);
  const scale = Math.min(w / spanLon, h / spanLat);
  const offX = (w - spanLon * scale) / 2;
  const offY = (h - spanLat * scale) / 2;
  return course.lat.map((lat, i) => ({
    x: offX + ((course.lon[i] as number) - minLon) * lonScale * scale,
    y: offY + (maxLat - lat) * scale,
  }));
};

/** Cumulative length so a 0..1 fraction maps to a point on the polyline. */
const alongPath = (pts: Point[]) => {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Point;
    const b = pts[i] as Point;
    cum.push((cum[i - 1] as number) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[cum.length - 1] || 1;
  return (t: number): Point => {
    const target = Math.min(1, Math.max(0, t)) * total;
    let i = 1;
    while (i < cum.length - 1 && (cum[i] as number) < target) i++;
    const a = pts[i - 1] as Point;
    const b = pts[i] as Point;
    const segment = (cum[i] as number) - (cum[i - 1] as number) || 1;
    const f = (target - (cum[i - 1] as number)) / segment;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  };
};

const toD = (pts: Point[]) =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');

const KIND_COLOR: Record<RoadmapCheckpoint['kind'], string> = {
  start: colors.textSecondary,
  long_run: colors.cyan,
  workout: colors.cyan,
  record: colors.warn,
  volume: colors.violet,
  fitness: colors.violet,
  tune_up: colors.warn,
  taper: colors.success,
  race: colors.accent,
  level: colors.violet,
};

export const checkpointColor = (c: RoadmapCheckpoint) => KIND_COLOR[c.kind];

const FONT = 'system-ui, -apple-system, sans-serif';

/** Soft, repeating ring around the athlete's marker. */
const Pulse = ({ x, y }: { x: number; y: number }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const size = 44;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: colors.accent,
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }],
      }}
    />
  );
};

export const RoadmapMap = ({
  roadmap,
  width,
  height,
  selectedId,
  onSelect,
}: {
  roadmap: Roadmap;
  width: number;
  height: number;
  /** Highlighted checkpoint, shared with the list below the map. */
  selectedId?: string | null;
  /** Tapping a marker selects it; tapping empty road clears the selection. */
  onSelect?: (id: string | null) => void;
}) => {
  const pad = 22;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const at = useMemo(() => {
    const course = roadmap.kind === 'race' ? roadmap.event?.course : undefined;
    const raw = course && course.lat.length > 1 ? project(course, w, h) : switchbacks(w, h);
    const shifted = raw.map((p) => ({ x: p.x + pad, y: p.y + pad }));
    return alongPath(shifted);
  }, [roadmap, w, h]);

  // Split the road at today's position so the travelled part can be solid.
  const split = useMemo(() => {
    const cut = roadmap.position;
    const done: Point[] = [];
    const todo: Point[] = [];
    const steps = 240;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      (t <= cut ? done : todo).push(at(t));
    }
    const here = at(cut);
    done.push(here);
    todo.unshift(here);
    return { done, todo, here };
  }, [roadmap.position, at]);

  const markers = useMemo(
    () =>
      roadmap.checkpoints
        .filter((c) => c.kind !== 'start')
        .map((c) => ({ checkpoint: c, point: at(c.position), color: checkpointColor(c) })),
    [roadmap.checkpoints, at],
  );

  // Distance ticks every 5 km of the race, so the road reads as a course.
  const ticks = useMemo(() => {
    if (roadmap.kind !== 'race') return [];
    const every = 5000 / roadmap.race.distanceM;
    const out: { label: string; point: Point }[] = [];
    for (let t = every, k = 5; t < 0.985; t += every, k += 5) out.push({ label: `${k}`, point: at(t) });
    return out;
  }, [roadmap, at]);

  const finish = at(1);
  const start = at(0);
  const selected = markers.find((m) => m.checkpoint.id === selectedId) ?? null;

  const handlePress = (x: number, y: number) => {
    // Nearest marker within reach wins; otherwise the tap clears selection.
    let best: { id: string; d: number } | null = null;
    for (const m of markers) {
      const d = Math.hypot(m.point.x - x, m.point.y - y);
      if (d < 28 && (!best || d < best.d)) best = { id: m.checkpoint.id, d };
    }
    onSelect?.(best?.id ?? null);
  };

  // Callout placement: above the marker, flipped below near the top edge and
  // clamped horizontally so it never leaves the card.
  const calloutW = Math.min(220, width - space.lg * 2);
  const calloutLeft = selected ? Math.min(Math.max(selected.point.x - calloutW / 2, 6), width - calloutW - 6) : 0;
  const calloutAbove = selected ? selected.point.y > 84 : true;

  return (
    <View style={{ width, height }}>
      <Pressable
        style={{ width, height }}
        onPress={(e) => handlePress(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      >
        <Svg width={width} height={height} pointerEvents="none">
          {/* Road: faint ahead, solid behind, with a soft halo on the travelled part. */}
          <Path d={toD(split.todo)} stroke={colors.borderStrong} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 7" />
          <Path d={toD(split.done)} stroke={colors.accent} strokeOpacity={0.18} strokeWidth={11} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Path d={toD(split.done)} stroke={colors.accent} strokeWidth={3.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />

          {/* 5 km ticks. */}
          {ticks.map((tick) => (
            <G key={tick.label}>
              <Line
                x1={tick.point.x - 3}
                y1={tick.point.y - 3}
                x2={tick.point.x + 3}
                y2={tick.point.y + 3}
                stroke={colors.textTertiary}
                strokeWidth={1.4}
              />
              <SvgText x={tick.point.x + 6} y={tick.point.y - 5} fill={colors.textTertiary} fontSize={8} fontWeight="700" fontFamily={FONT}>
                {tick.label}
              </SvgText>
            </G>
          ))}

          {/* Start and finish. */}
          <Circle cx={start.x} cy={start.y} r={5} fill={colors.bg} stroke={colors.textSecondary} strokeWidth={2} />
          <SvgText x={start.x} y={start.y + 18} fill={colors.textSecondary} fontSize={9} fontWeight="800" fontFamily={FONT} textAnchor="middle" letterSpacing={1}>
            START
          </SvgText>
          <G>
            <Circle cx={finish.x} cy={finish.y} r={11} fill={colors.accent} fillOpacity={0.18} />
            <Circle cx={finish.x} cy={finish.y} r={6.5} fill={colors.bg} stroke={colors.accent} strokeWidth={2.4} />
            <SvgText x={finish.x} y={finish.y - 16} fill={colors.accent} fontSize={9.5} fontWeight="800" fontFamily={FONT} textAnchor="middle" letterSpacing={1}>
              FINISH
            </SvgText>
          </G>

          {/* Checkpoints. Done ones are filled, upcoming are hollow. */}
          {markers
            .filter((m) => m.checkpoint.kind !== 'race')
            .map(({ checkpoint: c, point: p, color }) => {
              const done = c.status === 'done';
              const isSelected = c.id === selectedId;
              return (
                <G key={c.id}>
                  {isSelected ? <Circle cx={p.x} cy={p.y} r={13} fill={color} fillOpacity={0.22} /> : null}
                  <Circle
                    cx={p.x}
                    cy={p.y}
                    r={isSelected ? 6.5 : 4.5}
                    fill={done ? color : colors.bg}
                    stroke={color}
                    strokeOpacity={done || isSelected ? 1 : 0.7}
                    strokeWidth={2}
                  />
                </G>
              );
            })}

          {/* You are here. */}
          <Circle cx={split.here.x} cy={split.here.y} r={14} fill={colors.accent} fillOpacity={0.14} />
          <Circle cx={split.here.x} cy={split.here.y} r={7} fill={colors.accent} stroke={colors.bg} strokeWidth={2.5} />
        </Svg>
      </Pressable>

      <Pulse x={split.here.x} y={split.here.y} />

      {/* Callout for the selected checkpoint. */}
      {selected ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: calloutLeft,
            width: calloutW,
            ...(calloutAbove ? { bottom: height - selected.point.y + 14 } : { top: selected.point.y + 14 }),
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
            borderRadius: radius.sm,
            backgroundColor: colors.surfaceRaised,
            borderWidth: 1,
            borderColor: `${selected.color}88`,
          }}
        >
          <Text style={[type.label, { color: selected.color, fontSize: 9 }]}>
            {selected.checkpoint.status === 'done'
              ? 'Banked'
              : selected.checkpoint.status === 'missed'
                ? 'Missed'
                : selected.checkpoint.kind === 'race'
                  ? 'Destination'
                  : 'Ahead'}
            {roadmap.kind === 'race'
              ? ` · ${new Date(`${selected.checkpoint.date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
              : ''}
          </Text>
          <Text style={[type.bodyStrong, { fontSize: 13.5, marginTop: 2 }]} numberOfLines={1}>
            {selected.checkpoint.title}
          </Text>
          <Text style={[type.caption, { fontSize: 11.5, marginTop: 2, color: colors.textSecondary }]} numberOfLines={2}>
            {selected.checkpoint.detail}
          </Text>
        </View>
      ) : null}
    </View>
  );
};
