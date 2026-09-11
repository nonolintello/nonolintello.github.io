import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import type { ActivityStream } from '@ai/core';
import { colors, radius } from '../theme/tokens';

/**
 * Renders the GPS trace as a normalised SVG path.
 *
 * Deliberately not a tile map: the route's shape is the recognisable part, it
 * needs no API key or network round-trip, and it renders identically on iOS,
 * Android and web. A tile provider can sit behind this later without the
 * calling screens changing.
 */
export const RouteMap = ({
  stream,
  width,
  height,
  color = colors.accent,
  strokeWidth = 2.6,
  /** Metres to hide at each end of the trace. */
  privacyRadiusM = 0,
  showEndpoints = true,
}: {
  stream?: ActivityStream;
  width: number;
  height: number;
  color?: string;
  strokeWidth?: number;
  privacyRadiusM?: number;
  showEndpoints?: boolean;
}) => {
  const lats = stream?.latitude;
  const lons = stream?.longitude;
  const dist = stream?.distanceM;

  if (!lats || !lons || lats.length < 2) {
    return (
      <View
        style={{
          width,
          height,
          borderRadius: radius.md,
          backgroundColor: 'rgba(255,255,255,0.03)',
        }}
      />
    );
  }

  // Privacy trim: drop the opening and closing metres so a public activity
  // never reveals where the athlete lives.
  let from = 0;
  let to = lats.length - 1;
  if (privacyRadiusM > 0 && dist && dist.length === lats.length) {
    const total = dist[dist.length - 1] as number;
    if (total > privacyRadiusM * 2.5) {
      while (from < to && (dist[from] as number) < privacyRadiusM) from++;
      while (to > from && total - (dist[to] as number) < privacyRadiusM) to--;
    }
  }

  const latSlice = lats.slice(from, to + 1);
  const lonSlice = lons.slice(from, to + 1);
  if (latSlice.length < 2) return <View style={{ width, height }} />;

  const minLat = Math.min(...latSlice);
  const maxLat = Math.max(...latSlice);
  const minLon = Math.min(...lonSlice);
  const maxLon = Math.max(...lonSlice);

  // Longitude degrees shrink with latitude; without this correction routes look
  // horizontally stretched.
  const midLat = (minLat + maxLat) / 2;
  const lonScale = Math.cos((midLat * Math.PI) / 180);

  const spanLat = Math.max(1e-6, maxLat - minLat);
  const spanLon = Math.max(1e-6, (maxLon - minLon) * lonScale);

  const pad = strokeWidth * 2 + 6;
  const availW = width - pad * 2;
  const availH = height - pad * 2;
  const scale = Math.min(availW / spanLon, availH / spanLat);

  const drawnW = spanLon * scale;
  const drawnH = spanLat * scale;
  const offsetX = pad + (availW - drawnW) / 2;
  const offsetY = pad + (availH - drawnH) / 2;

  const toX = (lon: number) => offsetX + (lon - minLon) * lonScale * scale;
  // Latitude increases northward; SVG y increases downward.
  const toY = (lat: number) => offsetY + (maxLat - lat) * scale;

  // Sample down: a 500-point path costs more than it renders on a small card.
  const step = Math.max(1, Math.floor(latSlice.length / 220));
  let d = '';
  for (let i = 0; i < latSlice.length; i += step) {
    const x = toX(lonSlice[i] as number);
    const y = toY(latSlice[i] as number);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  const lastX = toX(lonSlice[latSlice.length - 1] as number);
  const lastY = toY(latSlice[latSlice.length - 1] as number);
  d += `L${lastX.toFixed(1)},${lastY.toFixed(1)}`;

  const startX = toX(lonSlice[0] as number);
  const startY = toY(latSlice[0] as number);

  return (
    <Svg width={width} height={height}>
      {/* Soft halo under a solid line. A two-colour gradient would imply the
          route encodes a variable, which it does not. */}
      <Path
        d={d}
        stroke={color}
        strokeOpacity={0.16}
        strokeWidth={strokeWidth * 2.6}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Path
        d={d}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {showEndpoints ? (
        <>
          <Circle cx={startX} cy={startY} r={strokeWidth * 1.5} fill={colors.bg} stroke={colors.success} strokeWidth={1.8} />
          <Circle cx={lastX} cy={lastY} r={strokeWidth * 1.5} fill={colors.bg} stroke={colors.accent} strokeWidth={1.8} />
        </>
      ) : null}
    </Svg>
  );
};

/** Filled elevation silhouette. Reads as terrain rather than as a chart. */
export const ElevationProfile = ({
  stream,
  width,
  height = 64,
  color = colors.violet,
}: {
  stream?: ActivityStream;
  width: number;
  height?: number;
  color?: string;
}) => {
  const alt = stream?.altitudeM;
  const dist = stream?.distanceM;
  if (!alt || !dist || alt.length < 2) return <View style={{ width, height }} />;

  const min = Math.min(...alt);
  const max = Math.max(...alt);
  const span = max - min || 1;
  const total = dist[dist.length - 1] as number;

  const step = Math.max(1, Math.floor(alt.length / 200));
  let d = `M0,${height}`;
  for (let i = 0; i < alt.length; i += step) {
    const x = ((dist[i] as number) / total) * width;
    const y = height - (((alt[i] as number) - min) / span) * (height - 4) - 2;
    d += `L${x.toFixed(1)},${y.toFixed(1)}`;
  }
  d += `L${width},${height} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.55} />
          <Stop offset="1" stopColor={color} stopOpacity={0.05} />
        </LinearGradient>
      </Defs>
      <Path d={d} fill="url(#elevGrad)" stroke={color} strokeWidth={1.4} />
    </Svg>
  );
};
