/**
 * Recurrence expansion: takes a start instant, an RRULE (subset) and an IANA
 * time zone, and yields the occurrences that fall between two instants.
 *
 * All stepping happens on the zone's wall clock (see ./timezone), so a rule
 * such as "every Wednesday at 09:00 in Europe/Madrid" keeps firing at 09:00
 * local time even when the UTC offset changes across the DST boundary.
 */

import {
  addDays,
  addMonths,
  dayNumber,
  daysInMonth,
  formatWallLocal,
  formatWallIso,
  instantToWall,
  nthWeekdayOfMonth,
  offsetAt,
  toEpochMs,
  wallFromDayNumber,
  wallToInstant,
  weekdayOf,
  weekdaysOfMonth,
  type InstantLike,
  type WallClock,
  type ZonedInstant,
} from './timezone';
import {
  InvalidTimeZoneError,
  resolveRule,
  RRuleError,
  weekdayIndexOfCode,
  WEEKDAY_CODES,
  type ByDaySpec,
  type RRule,
  type RRuleInput,
  type WeekdayCode,
} from './rrule';

export interface Occurrence {
  /** `TZID=<zone>:<local>` identifier of this instance (its requested wall clock). */
  recurrenceId: string;
  start: Date;
  /** `start` when no `durationMs` was given. */
  end: Date;
  timeZone: string;
  /** Local date/time as ISO-like text, e.g. `2026-01-30T18:00:00`. */
  wallStart: string;
  /** UTC offset of `start` in minutes (e.g. 120 before, 60 after a DST change). */
  utcOffsetMinutes: number;
  status: ZonedInstant['status'];
}

export interface ExpandParams {
  /**
   * First instant of the series. A `Date`/epoch ms is an absolute instant; a
   * bare local string (`2026-01-30T18:00`) is read in `timeZone`.
   */
  dtstart: Date | number | string;
  rrule: string | RRuleInput;
  /** IANA zone name, e.g. `Europe/Madrid`. */
  timeZone: string;
  /** Inclusive lower bound of the requested window. */
  from?: Date | number | string;
  /** Inclusive upper bound of the requested window. */
  to?: Date | number | string;
  /** Event length in milliseconds; when omitted `end === start`. */
  durationMs?: number;
  /** Safety valve for the number of returned occurrences. */
  maxOccurrences?: number;
  /** Safety valve for the number of candidate steps examined. */
  maxIterations?: number;
}

export class ExpansionLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpansionLimitError';
  }
}

const BARE_LOCAL =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{3}))?)?$/;

function parseBareLocal(value: string): WallClock | null {
  const match = BARE_LOCAL.exec(value.trim());
  if (match === null) return null;
  const [, year, month, day, hour = '00', minute = '00', second = '00', ms = '000'] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
    ms: Number(ms),
  };
}

/** Resolves an input value to an absolute instant, honouring the zone. */
export function resolveInstant(
  value: Date | number | string,
  timeZone: string,
  label = 'date',
): Date {
  if (value instanceof Date || typeof value === 'number') {
    const date = new Date(toEpochMs(value));
    if (Number.isNaN(date.getTime())) throw new RRuleError(`${label} is not a valid date.`);
    return date;
  }
  const bare = parseBareLocal(value);
  if (bare !== null) return wallToInstant(timeZone, bare).instant;
  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) {
    throw new RRuleError(
      `Invalid ${label} "${value}": use an ISO instant (with Z/offset) or a local "YYYY-MM-DDTHH:mm".`,
    );
  }
  return parsed;
}

function assertZone(timeZone: string): void {
  if (typeof timeZone !== 'string' || timeZone.trim() === '') {
    throw new InvalidTimeZoneError(String(timeZone));
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch (error) {
    throw new InvalidTimeZoneError(timeZone, error);
  }
}

function withTime(
  date: Pick<WallClock, 'year' | 'month' | 'day'>,
  time: WallClock,
): WallClock {
  return {
    ...date,
    hour: time.hour,
    minute: time.minute,
    second: time.second,
    ms: time.ms,
  };
}

function codeOfDayNumber(dayNo: number): WeekdayCode {
  const isoWeekday = weekdayOf(dayNo); // Mon = 1 .. Sun = 7
  const code = WEEKDAY_CODES[isoWeekday === 7 ? 0 : isoWeekday];
  if (code === undefined) throw new RRuleError(`Cannot resolve the weekday of day ${dayNo}.`);
  return code;
}

/** ISO weekdays (Mon = 1 .. Sun = 7) targeted by a WEEKLY rule, in week order. */
function weeklyTargetWeekdays(rule: RRule, startWall: WallClock): number[] {
  const specs: ByDaySpec[] =
    rule.byDay ?? [
      {
        code: codeOfDayNumber(dayNumber(startWall.year, startWall.month, startWall.day)),
        ordinal: null,
      },
    ];
  return specs.map((spec) => weekdayIndexOfCode(spec.code)).sort((a, b) => a - b);
}

/**
 * Days of month a MONTHLY rule fires on. An empty array means "this month has
 * no matching day", which is how `31` skips February and how `5MO` skips short
 * months.
 */
function monthlyDays(rule: RRule, year: number, month: number, startDay: number): number[] {
  if (rule.byDay === null) {
    return startDay <= daysInMonth(year, month) ? [startDay] : [];
  }
  const days = new Set<number>();
  for (const spec of rule.byDay) {
    const weekday = weekdayIndexOfCode(spec.code);
    if (spec.ordinal === null) {
      for (const day of weekdaysOfMonth(year, month, weekday)) days.add(day);
    } else {
      const day = nthWeekdayOfMonth(year, month, weekday, spec.ordinal);
      if (day !== null) days.add(day);
    }
  }
  return [...days].sort((a, b) => a - b);
}

/**
 * Wall-clock walker over a rule. A "unit" is one `INTERVAL` step: an interval
 * of days for DAILY, of weeks for WEEKLY and of months for MONTHLY.
 */
interface Walk {
  candidates(fromUnit: number): Generator<WallClock, void, void>;
  /** Greatest unit index that cannot have produced an occurrence after `wall`. */
  skipTo(wall: WallClock): number;
}

function buildWalk(rule: RRule, startWall: WallClock): Walk {
  const interval = rule.interval;
  const startDayNo = dayNumber(startWall.year, startWall.month, startWall.day);

  if (rule.freq === 'DAILY') {
    return {
      *candidates(fromUnit = 0) {
        for (let unit = fromUnit; ; unit += 1) {
          yield addDays(startWall, unit * interval);
        }
      },
      skipTo(wall) {
        const days = Math.max(
          0,
          dayNumber(wall.year, wall.month, wall.day) - startDayNo - 1,
        );
        return Math.floor(days / interval);
      },
    };
  }

  if (rule.freq === 'WEEKLY') {
    const targets = weeklyTargetWeekdays(rule, startWall);
    const startWeek = Math.floor((startDayNo + 3) / 7);
    return {
      *candidates(fromUnit = 0) {
        for (let unit = fromUnit; ; unit += 1) {
          // Monday of the (startWeek + unit * interval)-th week: the dayNumber
          // whose ISO weekday is 1, i.e. dayNumber + 3 is a multiple of 7.
          const monday = 7 * (startWeek + unit * interval) - 3;
          for (const weekday of targets) {
            const dayNo = monday + (weekday - 1);
            if (dayNo < startDayNo) continue;
            yield withTime(wallFromDayNumber(dayNo), startWall);
          }
        }
      },
      skipTo(wall) {
        const weeks = Math.max(
          0,
          Math.floor((dayNumber(wall.year, wall.month, wall.day) + 3) / 7) - startWeek - 1,
        );
        return Math.floor(weeks / interval);
      },
    };
  }

  return {
    *candidates(fromUnit = 0) {
      for (let unit = fromUnit; ; unit += 1) {
        const [year, month] = addMonths(startWall.year, startWall.month, unit * interval);
        for (const day of monthlyDays(rule, year, month, startWall.day)) {
          if (dayNumber(year, month, day) < startDayNo) continue;
          yield withTime({ year, month, day }, startWall);
        }
      }
    },
    skipTo(wall) {
      const months = Math.max(
        0,
        (wall.year - startWall.year) * 12 + (wall.month - startWall.month) - 1,
      );
      return Math.floor(months / interval);
    },
  };
}

function toOccurrence(
  zoned: ZonedInstant,
  timeZone: string,
  durationMs: number | undefined,
): Occurrence {
  return {
    recurrenceId: `TZID=${timeZone}:${formatWallLocal(zoned.requestedWall)}`,
    start: zoned.instant,
    end: new Date(zoned.epochMs + (durationMs ?? 0)),
    timeZone,
    wallStart: formatWallIso(zoned.requestedWall),
    utcOffsetMinutes: offsetAt(timeZone, zoned.epochMs) / 60_000,
    status: zoned.status,
  };
}

/**
 * Lazily generates the series from `dtstart` onwards, applying the optional
 * `[from, to]` window on top of COUNT/UNTIL. COUNT positions are always
 * relative to `dtstart`, never to the window.
 */
export function* generateRecurrences(
  params: ExpandParams,
): Generator<Occurrence, void, void> {
  assertZone(params.timeZone);
  const timeZone = params.timeZone;
  const rule = resolveRule(params.rrule);
  if (params.durationMs !== undefined && (!Number.isFinite(params.durationMs) || params.durationMs < 0)) {
    throw new RRuleError(`Invalid durationMs ${params.durationMs}.`);
  }

  const startMs = resolveInstant(params.dtstart, timeZone, 'dtstart').getTime();
  const startWall = instantToWall(timeZone, startMs);

  const untilMs =
    rule.until === null
      ? null
      : rule.until.kind === 'absolute'
        ? rule.until.instant.getTime()
        : wallToInstant(timeZone, rule.until.wall).epochMs;

  const fromMs =
    params.from === undefined ? null : resolveInstant(params.from, timeZone, 'from').getTime();
  const toMs = params.to === undefined ? null : resolveInstant(params.to, timeZone, 'to').getTime();

  if (fromMs !== null && toMs !== null && fromMs > toMs) {
    throw new RRuleError('Invalid window: "from" is after "to".');
  }
  if (rule.count === null && untilMs === null && toMs === null && params.maxOccurrences === undefined) {
    throw new RRuleError(
      'Unbounded expansion: provide COUNT, UNTIL, a "to" window bound or maxOccurrences.',
    );
  }

  const lowerMs = Math.max(fromMs ?? -Infinity, startMs);
  const upperMs = Math.min(toMs ?? Infinity, untilMs ?? Infinity);
  if (lowerMs > upperMs) return;

  const maxIterations = params.maxIterations ?? 200_000;
  const walk = buildWalk(rule, startWall);
  const fromUnit =
    rule.count === null && fromMs !== null ? walk.skipTo(instantToWall(timeZone, fromMs)) : 0;

  let sequenceIndex = 0;
  let emitted = 0;
  let iterations = 0;

  for (const wall of walk.candidates(fromUnit)) {
    iterations += 1;
    if (iterations > maxIterations) {
      throw new ExpansionLimitError(
        `Stopped after ${maxIterations} candidate steps; narrow UNTIL or the from/to window.`,
      );
    }
    const zoned = wallToInstant(timeZone, wall);
    if (zoned.epochMs < startMs) continue;
    if (zoned.epochMs > upperMs) break;

    sequenceIndex += 1;
    if (zoned.epochMs >= lowerMs) {
      yield toOccurrence(zoned, timeZone, params.durationMs);
      emitted += 1;
      if (params.maxOccurrences !== undefined && emitted >= params.maxOccurrences) return;
    }
    if (rule.count !== null && sequenceIndex >= rule.count) return;
  }
}

/** Expands a series and returns every occurrence inside the window. */
export function expandRecurrences(params: ExpandParams): Occurrence[] {
  return [...generateRecurrences(params)];
}

export { InvalidTimeZoneError, RRuleError };
export type { ByDaySpec, InstantLike, RRule, RRuleInput, WallClock, WeekdayCode };
