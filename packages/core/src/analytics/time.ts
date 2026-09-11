/**
 * All week arithmetic is ISO-8601 (Monday start) and done in local time.
 * Training weeks are a human concept — an athlete's Sunday long run belongs to
 * the week they perceive, not to whatever UTC says.
 */

export const DAY_MS = 86_400_000;

export const startOfDay = (d: Date): Date => {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
};

export const startOfWeek = (d: Date): Date => {
  const out = startOfDay(d);
  // getDay(): 0 = Sunday. Shift so Monday is 0.
  const offset = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - offset);
  return out;
};

export const addDays = (d: Date, n: number): Date => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};

export const addWeeks = (d: Date, n: number): Date => addDays(d, n * 7);

export const endOfWeek = (d: Date): Date => {
  const out = addDays(startOfWeek(d), 7);
  out.setMilliseconds(-1);
  return out;
};

/** Calendar days between, ignoring time of day — avoids DST off-by-one. */
export const daysBetween = (a: Date, b: Date): number =>
  Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);

export const isSameDay = (a: Date, b: Date): boolean =>
  startOfDay(a).getTime() === startOfDay(b).getTime();

export const toISODate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export interface DateRange {
  start: Date;
  /** Exclusive. */
  end: Date;
}

export const weekRange = (weekStart: Date): DateRange => ({
  start: startOfWeek(weekStart),
  end: addDays(startOfWeek(weekStart), 7),
});

export const inRange = (d: Date, range: DateRange): boolean =>
  d.getTime() >= range.start.getTime() && d.getTime() < range.end.getTime();

/** Most recent `count` week ranges, oldest first, ending with the week containing `now`. */
export const trailingWeeks = (now: Date, count: number): DateRange[] => {
  const current = startOfWeek(now);
  const out: DateRange[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(weekRange(addWeeks(current, -i)));
  return out;
};

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const relativeDayLabel = (date: Date, now: Date): string => {
  const diff = daysBetween(date, now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  if (diff < 14) return 'Last week';
  if (diff < 60) return `${Math.floor(diff / 7)} weeks ago`;
  return `${Math.floor(diff / 30)} months ago`;
};
