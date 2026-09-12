import { useMemo } from 'react';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import type { Roadmap, RoadmapCheckpoint } from '@ai/core';
import { colors } from '../theme/tokens';

/**
 * The journey drawn on the race course.
 *
 * The course polyline is the road; the athlete's position and every checkpoint
 * are placed along it by fraction of its length. Behind them, the path is
 * painted solid up to today and faint beyond it, so the picture says at a
 * glance how far along the build is and what is still to come — the same thing
 * a race-day spectator map says, which is the point.
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

export const RoadmapMap = ({
  roadmap,
  width,
  height,
  selectedId,
}: {
  roadmap: Roadmap;
  width: number;
  height: number;
  /** Highlighted checkpoint, from the list below the map. */
  selectedId?: string | null;
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
    const steps = 160;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      (t <= cut ? done : todo).push(at(t));
    }
    const here = at(cut);
    done.push(here);
    todo.unshift(here);
    return { done, todo, here };
  }, [roadmap.position, at]);

  const finish = at(1);
  const start = at(0);

  return (
    <Svg width={width} height={height}>
      {/* Road: faint ahead, solid behind, with a soft halo on the travelled part. */}
      <Path d={toD(split.todo)} stroke={colors.borderStrong} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 7" />
      <Path d={toD(split.done)} stroke={colors.accent} strokeOpacity={0.18} strokeWidth={11} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d={toD(split.done)} stroke={colors.accent} strokeWidth={3.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />

      {/* Start and finish. */}
      <Circle cx={start.x} cy={start.y} r={5} fill={colors.bg} stroke={colors.textSecondary} strokeWidth={2} />
      <G>
        <Circle cx={finish.x} cy={finish.y} r={11} fill={colors.accent} fillOpacity={0.18} />
        <Circle cx={finish.x} cy={finish.y} r={6.5} fill={colors.bg} stroke={colors.accent} strokeWidth={2.4} />
        <SvgText x={finish.x} y={finish.y - 16} fill={colors.accent} fontSize={9.5} fontWeight="800" fontFamily="system-ui, -apple-system, sans-serif" textAnchor="middle" letterSpacing={1}>
          FINISH
        </SvgText>
      </G>

      {/* Checkpoints. Done ones are filled, upcoming are hollow. */}
      {roadmap.checkpoints
        .filter((c) => c.kind !== 'start' && c.kind !== 'race')
        .map((c) => {
          const p = at(c.position);
          const color = checkpointColor(c);
          const done = c.status === 'done';
          const selected = c.id === selectedId;
          return (
            <G key={c.id}>
              {selected ? <Circle cx={p.x} cy={p.y} r={12} fill={color} fillOpacity={0.22} /> : null}
              <Circle
                cx={p.x}
                cy={p.y}
                r={selected ? 6 : 4.5}
                fill={done ? color : colors.bg}
                stroke={color}
                strokeOpacity={done || selected ? 1 : 0.7}
                strokeWidth={2}
              />
            </G>
          );
        })}

      {/* You are here. */}
      <Circle cx={split.here.x} cy={split.here.y} r={14} fill={colors.accent} fillOpacity={0.14} />
      <Circle cx={split.here.x} cy={split.here.y} r={7} fill={colors.accent} stroke={colors.bg} strokeWidth={2.5} />
    </Svg>
  );
};
