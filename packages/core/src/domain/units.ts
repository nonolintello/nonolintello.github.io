/**
 * Every distance in the system is metres and every duration is seconds.
 * Conversion happens at the display boundary only — an athlete's unit
 * preference must never reach the analytics engine.
 */

export const METRES_PER_MILE = 1609.344;
export const METRES_PER_KM = 1000;
export const FEET_PER_METRE = 3.280839895;

export type UnitPreference = 'metric' | 'imperial';

export const metresToKm = (m: number) => m / METRES_PER_KM;
export const metresToMiles = (m: number) => m / METRES_PER_MILE;
export const milesToMetres = (mi: number) => mi * METRES_PER_MILE;
export const kmToMetres = (km: number) => km * METRES_PER_KM;
export const metresToFeet = (m: number) => m * FEET_PER_METRE;

export const distanceIn = (metres: number, unit: UnitPreference) =>
  unit === 'imperial' ? metresToMiles(metres) : metresToKm(metres);

export const elevationIn = (metres: number, unit: UnitPreference) =>
  unit === 'imperial' ? metresToFeet(metres) : metres;

export const distanceLabel = (unit: UnitPreference) => (unit === 'imperial' ? 'mi' : 'km');
export const elevationLabel = (unit: UnitPreference) => (unit === 'imperial' ? 'ft' : 'm');

/** Seconds per kilometre or per mile, depending on preference. */
export const paceSecondsPerUnit = (
  distanceMetres: number,
  seconds: number,
  unit: UnitPreference,
): number | null => {
  if (distanceMetres <= 0 || seconds <= 0) return null;
  const units = distanceIn(distanceMetres, unit);
  if (units <= 0) return null;
  return seconds / units;
};

export const speedMps = (distanceMetres: number, seconds: number): number =>
  seconds > 0 ? distanceMetres / seconds : 0;

/** 8:24 style. Rounds to whole seconds; carries a 59.6 up to the next minute. */
export const formatPace = (secondsPerUnit: number | null): string => {
  if (secondsPerUnit == null || !Number.isFinite(secondsPerUnit) || secondsPerUnit <= 0) return '—';
  const total = Math.round(secondsPerUnit);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/** 21:42 under an hour, 1:04:18 above it. */
export const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/** Compact form for cards: 1h 04m, 42m, 45s. */
export const formatDurationCompact = (seconds: number): string => {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
};

export const formatDistance = (metres: number, unit: UnitPreference, decimals = 2): string =>
  distanceIn(metres, unit).toFixed(decimals);

export const formatSignedSeconds = (seconds: number): string => {
  const sign = seconds < 0 ? '-' : '+';
  return `${sign}${formatDuration(Math.abs(seconds))}`;
};
