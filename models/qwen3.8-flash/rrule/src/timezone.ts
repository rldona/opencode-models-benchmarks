/**
 * Timezone helpers built only on `Intl.DateTimeFormat` (no Temporal, no deps).
 *
 * The core idea of this module: recurrence rules are always evaluated on the
 * *wall clock* of a zone (2026-03-29 02:30 in Europe/Madrid), and the wall
 * clock is only turned into an absolute instant at the very end. That is what
 * keeps "every Wednesday at 09:00 local" at 09:00 local across DST changes.
 */

export interface WallClock {
  /** Proleptic year, e.g. 2026 */
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
  /** 0-23 */
  hour: number;
  minute: number;
  second: number;
  ms: number;
}

export type InstantLike = Date | number | string;

export interface ZonedInstant {
  instant: Date;
  epochMs: number;
  /** Wall clock that was asked for. */
  requestedWall: WallClock;
  /** Wall clock that `instant` actually renders as. */
  resolvedWall: WallClock;
  /**
   * - `exact`       the wall clock maps to exactly one instant.
   * - `ambiguous`   the wall clock happens twice (fall-back); we pick the
   *                 *earliest* instant, i.e. the first occurrence.
   * - `nonexistent` the wall clock is skipped by a spring-forward gap; we
   *                 return the transition instant itself.
   */
  status: 'exact' | 'ambiguous' | 'nonexistent';
}

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

/** Thrown for invalid IANA time zone names (wraps Intl's RangeError). */
export class InvalidTimeZoneError extends Error {
  constructor(readonly timeZone: string, cause?: unknown) {
    super(
      `Invalid IANA time zone "${timeZone}". Expected a name such as "Europe/Madrid".`,
      { cause },
    );
    this.name = 'InvalidTimeZoneError';
  }
}

export function toEpochMs(value: InstantLike): number {
  if (typeof value === 'number') return Math.trunc(value);
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  if (Number.isNaN(ms)) throw new RangeError(`Not a valid date: ${String(value)}`);
  return ms;
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** `Date.UTC` is safe for years >= 100; anything lower needs a fix-up. */
export function utcMs(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): number {
  const base = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  if (year >= 0 && year < 100) {
    const fixed = new Date(base);
    fixed.setUTCFullYear(year, month - 1, day);
    return fixed.getTime();
  }
  return base;
}

const formatCache = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatCache.get(timeZone);
  if (fmt === undefined) {
    try {
      fmt = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
    } catch (error) {
      throw new InvalidTimeZoneError(timeZone, error);
    }
    formatCache.set(timeZone, fmt);
  }
  return fmt;
}

/** Reads the local date/time components of an instant as seen in `timeZone`. */
export function instantToWall(timeZone: string, instant: InstantLike): WallClock {
  const epochMs = toEpochMs(instant);
  const parts = zoneFormatter(timeZone).formatToParts(new Date(epochMs));
  const pick = (type: Intl.DateTimeFormatPartTypes, fallback = 0): number => {
    const found = parts.find((part) => part.type === type);
    return found === undefined ? fallback : Number(found.value);
  };
  const year = pick('year', NaN);
  const month = pick('month', NaN);
  const day = pick('day', NaN);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    throw new InvalidTimeZoneError(timeZone);
  }
  return {
    year,
    month,
    day,
    hour: mod(pick('hour'), 24), // ICU may hand back "24" for midnight
    minute: mod(pick('minute'), 60),
    second: mod(pick('second'), 60),
    ms: mod(epochMs, 1000),
  };
}

export function wallToMs(wall: WallClock): number {
  return utcMs(
    wall.year,
    wall.month,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    wall.ms,
  );
}

/**
 * Offset (ms to add to an instant to obtain its local wall clock) in effect at
 * `instant`. Derived from formatting rather than parsing `GMT+01:00` strings,
 * so half-hour/45-minute zones and historical LMT offsets all work.
 */
export function offsetAt(timeZone: string, instant: InstantLike): number {
  const epochMs = toEpochMs(instant);
  const wall = instantToWall(timeZone, epochMs);
  return Math.round((wallToMs(wall) - epochMs) / 1000) * 1000;
}

export function offsetMinutesAt(timeZone: string, instant: InstantLike): number {
  return offsetAt(timeZone, instant) / 1000 / 60;
}

/**
 * The wall clock of `instant` expressed as a UTC-style ordinal. Non-decreasing
 * in `instant`, which is what makes the gap search below possible.
 */
function wallOrdinal(timeZone: string, epochMs: number): number {
  return epochMs + offsetAt(timeZone, epochMs);
}

/**
 * Converts a local wall clock in `timeZone` into an absolute instant.
 *
 * Handles the two DST edge cases:
 *  - fall-back fold: the same wall clock maps to two instants -> earliest wins.
 *  - spring-forward gap: the wall clock never occurs -> return the transition
 *    instant (the moment the clock jumps forward).
 */
export function wallToInstant(timeZone: string, wall: WallClock): ZonedInstant {
  const targetSecond = utcMs(
    wall.year,
    wall.month,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    0,
  );

  const guesses = new Set<number>();
  let guess = targetSecond;
  for (let i = 0; i < 5; i += 1) {
    const next = targetSecond - offsetAt(timeZone, guess);
    if (!guesses.add(next)) break;
    guess = next;
  }
  // Probe well away from the target so a transition inside the window is seen.
  for (const probe of [-72, -24, -3, 3, 24, 72]) {
    guesses.add(targetSecond - offsetAt(timeZone, targetSecond + probe * MS_PER_HOUR));
  }

  const matches = [...guesses]
    .filter((candidate) => wallOrdinal(timeZone, candidate) === targetSecond)
    .sort((a, b) => a - b);

  if (matches.length > 0) {
    const epochMs = matches[0] + wall.ms;
    return {
      instant: new Date(epochMs),
      epochMs,
      requestedWall: wall,
      resolvedWall: instantToWall(timeZone, epochMs),
      status: matches.length > 1 ? 'ambiguous' : 'exact',
    };
  }

  // Gap: find the first instant whose wall clock has passed the requested one.
  let low = targetSecond - 48 * MS_PER_HOUR;
  let high = targetSecond + 48 * MS_PER_HOUR;
  while (high - low > 1) {
    const mid = low + Math.floor((high - low) / 2);
    if (wallOrdinal(timeZone, mid) > targetSecond) high = mid;
    else low = mid;
  }
  return {
    instant: new Date(high),
    epochMs: high,
    requestedWall: wall,
    resolvedWall: instantToWall(timeZone, high),
    status: 'nonexistent',
  };
}

/** `1970-01-01` is a Thursday; this is a plain calendar-day counter. */
export function dayNumber(year: number, month: number, day: number): number {
  return Math.round(utcMs(year, month, day) / MS_PER_DAY);
}

export function wallFromDayNumber(n: number): Pick<WallClock, 'year' | 'month' | 'day'> {
  const date = new Date(n * MS_PER_DAY);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/** ISO weekday with Monday = 1 ... Sunday = 7. */
export function weekdayOf(dayNo: number): number {
  return mod(dayNo + 3, 7) + 1;
}

export function daysInMonth(year: number, month: number): number {
  const lastDay = new Date(utcMs(year, month + 1, 0)).getUTCDate();
  return lastDay;
}

export function addDays(wall: WallClock, days: number): WallClock {
  const moved = wallFromDayNumber(dayNumber(wall.year, wall.month, wall.day) + days);
  return { ...wall, ...moved };
}

export function addMonths(year: number, month: number, months: number): [number, number] {
  const zeroBased = (month - 1) + months;
  const shiftedYear = Math.floor(zeroBased / 12);
  return [year + shiftedYear, mod(zeroBased, 12) + 1];
}

/**
 * Nth weekday of a month, `n > 0` counted from the start and `n < 0` from the
 * end (so `-1` means "last"). Returns null when the month has no such day,
 * e.g. there is no 5th Monday in a month with only four.
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number,
): number | null {
  const first = dayNumber(year, month, 1);
  const last = first + daysInMonth(year, month) - 1;
  const matching: number[] = [];
  for (let day = first; day <= last; day += 1) {
    if (weekdayOf(day) === weekday) matching.push(day);
  }
  const index = n > 0 ? n - 1 : matching.length + n;
  const found = matching[index];
  return found === undefined ? null : found - first + 1;
}

/** Every day-of-month in `year`/`month` whose weekday matches. */
export function weekdaysOfMonth(year: number, month: number, weekday: number): number[] {
  const first = dayNumber(year, month, 1);
  const length = daysInMonth(year, month);
  const offset = mod(weekday - weekdayOf(first), 7);
  const days: number[] = [];
  for (let day = offset + 1; day <= length; day += 7) days.push(day);
  return days;
}

export function formatWallLocal(wall: WallClock): string {
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  return (
    `${pad(wall.year, 4)}${pad(wall.month)}${pad(wall.day)}` +
    `T${pad(wall.hour)}${pad(wall.minute)}${pad(wall.second)}`
  );
}

export function formatWallIso(wall: WallClock): string {
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  const ms = wall.ms === 0 ? '' : `.${pad(wall.ms, 3)}`;
  return (
    `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}` +
    `T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}${ms}`
  );
}
