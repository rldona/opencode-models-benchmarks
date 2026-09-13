import {
  addDays,
  dayNumber,
  daysInMonth,
  fromDayNumber,
  nthWeekdayOfMonth,
  shiftMonth,
  startOfWeek,
  weekdayDaysInMonth,
  weekdayOf,
  type CivilDate,
} from './civil';
import { RRuleError } from './errors';
import { normalizeRule, type ResolvedRule } from './parse';
import {
  canonicalTimeZone,
  describeInstant,
  instantToZonedParts,
  toInstantMs,
  zonedTimeToInstant,
  type ZonedFields,
} from './tz';
import type { ExpandOptions, NonExistentLocalTimePolicy, Occurrence } from './types';

/** Safety valve so a pathological rule can never loop forever. */
export const MAX_CANDIDATES = 10_000;

interface SeriesContext {
  readonly timeZone: string;
  readonly rule: ResolvedRule;
  readonly dtstartMs: number;
  readonly startDate: CivilDate;
  readonly timeOfDay: Omit<ZonedFields, 'year' | 'month' | 'day'>;
  readonly rangeStartMs: number;
  /** `null` means "no upper bound". */
  readonly rangeEndMs: number | null;
  readonly policy: NonExistentLocalTimePolicy;
  readonly limit: number;
}

/** Every occurrence of the series inside `[rangeStart, rangeEnd]`, ascending. */
export function expand(options: ExpandOptions): Occurrence[] {
  return [...iterate(options)];
}

/** Lazy version of {@link expand}: occurrences are produced one at a time. */
export function* iterate(options: ExpandOptions): Generator<Occurrence, void, undefined> {
  const context = prepare(options);
  const { rule, timeZone } = context;
  const untilMs = rule.until?.getTime();

  let produced = 0;
  let candidates = 0;
  let seriesIndex = 0;
  let previousInstant = Number.NEGATIVE_INFINITY;

  for (const date of candidateDates(rule, context.startDate)) {
    if (++candidates > MAX_CANDIDATES) {
      throw new RRuleError(
        `Generated more than ${MAX_CANDIDATES} candidate dates without finishing. ` +
          'Narrow rangeEnd, lower COUNT/UNTIL, or pass a `limit`.',
        'LIMIT',
      );
    }

    const instant = zonedTimeToInstant(
      timeZone,
      { year: date.year, month: date.month, day: date.day, ...context.timeOfDay },
      context.policy,
    );
    // `skip` policy: the local time does not exist, the occurrence is dropped and
    // does not consume COUNT.
    if (instant === null) continue;
    // RFC 5545: nothing is ever generated before DTSTART (e.g. BYDAY=MO,WE,FR starting
    // on a Wednesday must not emit the Monday of that same week).
    if (instant < context.dtstartMs) continue;
    if (instant <= previousInstant) continue;

    if (untilMs !== undefined && instant > untilMs) return;
    if (rule.count !== undefined && seriesIndex >= rule.count) return;
    // Everything from here on is later than the range, and COUNT/UNTIL can only shorten
    // the series, never extend it: stop for good.
    if (context.rangeEndMs !== null && instant > context.rangeEndMs) return;

    previousInstant = instant;
    const index = seriesIndex++;

    if (instant < context.rangeStartMs) continue;
    yield toOccurrence(timeZone, instant, index);
    if (++produced >= context.limit) return;
  }
}

function toOccurrence(timeZone: string, instant: number, index: number): Occurrence {
  return { start: new Date(instant), index, ...describeInstant(timeZone, instant) };
}

function prepare(options: ExpandOptions): SeriesContext {
  if (options === null || typeof options !== 'object') {
    throw new RRuleError('expand() requires an options object', 'INPUT');
  }
  const timeZone = canonicalTimeZone(options.timeZone);
  const parseOptions = { timeZone };
  const rule = normalizeRule(options.rule, parseOptions);
  const policy: NonExistentLocalTimePolicy = options.onNonExistentLocalTime ?? 'shift';
  if (policy !== 'shift' && policy !== 'skip') {
    throw new RRuleError(`Unknown onNonExistentLocalTime policy "${String(policy)}"`, 'INPUT');
  }

  const dtstartMs = toInstantMs(options.dtstart, timeZone);
  const dtParts = instantToZonedParts(timeZone, dtstartMs);
  const rangeStartMs =
    options.rangeStart === undefined ? dtstartMs : toInstantMs(options.rangeStart, timeZone);
  const rangeEndMs = options.rangeEnd === undefined ? null : toInstantMs(options.rangeEnd, timeZone);

  if (rangeEndMs !== null && rangeEndMs < rangeStartMs) {
    throw new RRuleError('rangeEnd must not be earlier than rangeStart', 'RANGE');
  }
  if (rangeEndMs === null && rule.count === undefined && rule.until === undefined) {
    throw new RRuleError(
      'Unbounded expansion: pass rangeEnd, or a rule with COUNT or UNTIL',
      'INPUT',
    );
  }

  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  if (!(limit > 0)) {
    throw new RRuleError(`limit must be a positive number, got ${String(options.limit)}`, 'INPUT');
  }

  return {
    timeZone,
    rule,
    dtstartMs,
    startDate: { year: dtParts.year, month: dtParts.month, day: dtParts.day },
    timeOfDay: {
      hour: dtParts.hour,
      minute: dtParts.minute,
      second: dtParts.second,
      millisecond: dtParts.millisecond,
    },
    rangeStartMs,
    rangeEndMs,
    policy,
    limit,
  };
}

function candidateDates(rule: ResolvedRule, start: CivilDate): Iterable<CivilDate> {
  switch (rule.freq) {
    case 'DAILY':
      return dailyDates(rule, start);
    case 'WEEKLY':
      return weeklyDates(rule, start);
    case 'MONTHLY':
      return monthlyDates(rule, start);
    default:
      throw new RRuleError(`Unsupported FREQ "${String(rule.freq as string)}"`, 'UNSUPPORTED');
  }
}

function* dailyDates(rule: ResolvedRule, start: CivilDate): Iterable<CivilDate> {
  for (let period = 0; ; period++) {
    yield addDays(start, period * rule.interval);
  }
}

function* weeklyDates(rule: ResolvedRule, start: CivilDate): Iterable<CivilDate> {
  // Days of the week, ordered from WKST onwards (RFC 5545 week semantics).
  const offsets =
    rule.byDay.length > 0
      ? rule.byDay
          .map((item) => item.weekdayIdx)
          .sort(
            (a, b) =>
              (a - rule.wkstIdx + 7) % 7 - ((b - rule.wkstIdx + 7) % 7),
          )
      : [weekdayOf(start)];
  const unique = [...new Set(offsets)];
  const firstDayOfWeek = dayNumber(startOfWeek(start, rule.wkstIdx));

  for (let period = 0; ; period++) {
    const weekStart = firstDayOfWeek + 7 * period * rule.interval;
    for (const offset of unique) {
      yield fromDayNumber(weekStart + offset);
    }
  }
}

function* monthlyDates(rule: ResolvedRule, start: CivilDate): Iterable<CivilDate> {
  for (let period = 0; ; period++) {
    const { year, month } = shiftMonth(start.year, start.month, period * rule.interval);
    const length = daysInMonth(year, month);
    let days: number[];

    if (rule.byDay.length === 0) {
      // RFC 5545: a month that does not contain DTSTART's day-of-month is skipped
      // (31 January never rolls over to 3 February).
      days = start.day <= length ? [start.day] : [];
    } else {
      const selected = new Set<number>();
      for (const item of rule.byDay) {
        if (item.ordinal === undefined) {
          for (const day of weekdayDaysInMonth(year, month, item.weekdayIdx)) selected.add(day);
        } else {
          const day = nthWeekdayOfMonth(year, month, item.weekdayIdx, item.ordinal);
          if (day !== null) selected.add(day);
        }
      }
      days = [...selected].sort((a, b) => a - b);
    }

    for (const day of days) yield { year, month, day };
  }
}
