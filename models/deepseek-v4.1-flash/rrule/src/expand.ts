import type { ByDay, NormalizedRule, Weekday } from "./parse";
import type { CalendarDate } from "./timezone";
import {
  addDays,
  addMonths,
  compareDates,
  daysInMonth,
  localToUtc,
  partsInZone,
  weekdayOf,
} from "./timezone";

const WEEKDAY_INDEX: Record<Weekday, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const MONDAY_FIRST: readonly Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const MAX_ITERATIONS = 1_000_000;

function* dailyDates(anchor: CalendarDate, interval: number): Generator<CalendarDate> {
  let current = anchor;
  while (true) {
    yield current;
    current = addDays(current, interval);
  }
}

function* weeklyDates(
  anchor: CalendarDate,
  interval: number,
  byDay: readonly ByDay[],
): Generator<CalendarDate> {
  if (byDay.length === 0) {
    let current = anchor;
    while (true) {
      yield current;
      current = addDays(current, interval * 7);
    }
    return;
  }

  const daysFromMonday = (weekdayOf(anchor) + 6) % 7;
  let weekStart = addDays(anchor, -daysFromMonday);

  while (true) {
    for (const weekday of MONDAY_FIRST) {
      if (!byDay.some((entry) => entry.weekday === weekday)) continue;
      const date = addDays(weekStart, (WEEKDAY_INDEX[weekday] + 6) % 7);
      if (compareDates(date, anchor) >= 0) yield date;
    }
    weekStart = addDays(weekStart, interval * 7);
  }
}

function datesInMonthForByDay(year: number, month: number, spec: ByDay): CalendarDate[] {
  const total = daysInMonth(year, month);
  const target = WEEKDAY_INDEX[spec.weekday];
  const matches: CalendarDate[] = [];

  if (spec.ordinal === undefined) {
    for (let day = 1; day <= total; day++) {
      const date = { year, month, day };
      if (weekdayOf(date) === target) matches.push(date);
    }
    return matches;
  }

  if (spec.ordinal > 0) {
    let seen = 0;
    for (let day = 1; day <= total; day++) {
      const date = { year, month, day };
      if (weekdayOf(date) !== target) continue;
      seen++;
      if (seen === spec.ordinal) return [date];
    }
    return [];
  }

  let seen = 0;
  for (let day = total; day >= 1; day--) {
    const date = { year, month, day };
    if (weekdayOf(date) !== target) continue;
    seen++;
    if (seen === -spec.ordinal) return [date];
  }
  return [];
}

function* monthlyDates(
  anchor: CalendarDate,
  interval: number,
  byDay: readonly ByDay[],
): Generator<CalendarDate> {
  let months = 0;

  while (true) {
    const { year, month } = addMonths(anchor.year, anchor.month, months);

    if (byDay.length === 0) {
      if (anchor.day <= daysInMonth(year, month)) {
        const date = { year, month, day: anchor.day };
        if (compareDates(date, anchor) >= 0) yield date;
      }
    } else {
      const dates: CalendarDate[] = [];
      for (const spec of byDay) dates.push(...datesInMonthForByDay(year, month, spec));
      dates.sort(compareDates);

      const seen = new Set<number>();
      for (const date of dates) {
        const key = date.year * 10000 + date.month * 100 + date.day;
        if (seen.has(key)) continue;
        seen.add(key);
        if (compareDates(date, anchor) >= 0) yield date;
      }
    }

    months += interval;
  }
}

export interface ExpandRequest {
  startMs: number;
  rule: NormalizedRule;
  timeZone: string;
  fromMs: number;
  toMs: number;
}

export function expandOccurrences(request: ExpandRequest): number[] {
  const { startMs, rule, timeZone, fromMs, toMs } = request;

  if (!Number.isFinite(startMs)) throw new Error("start must be a valid date");
  if (Number.isNaN(fromMs)) throw new Error("from must be a valid date");
  if (!Number.isFinite(toMs)) throw new Error("to must be a finite instant");
  if (fromMs > toMs) throw new Error("from must be earlier than or equal to to");

  const anchorParts = partsInZone(startMs, timeZone);
  const anchor: CalendarDate = {
    year: anchorParts.year,
    month: anchorParts.month,
    day: anchorParts.day,
  };

  let dates: Generator<CalendarDate>;
  switch (rule.freq) {
    case "DAILY":
      dates = dailyDates(anchor, rule.interval);
      break;
    case "WEEKLY":
      dates = weeklyDates(anchor, rule.interval, rule.byDay);
      break;
    case "MONTHLY":
      dates = monthlyDates(anchor, rule.interval, rule.byDay);
      break;
  }

  const results: number[] = [];
  let emitted = 0;
  let iterations = 0;

  for (const date of dates) {
    if (rule.count !== undefined && emitted >= rule.count) break;
    if (++iterations > MAX_ITERATIONS) {
      throw new Error("RRULE expansion exceeded the safety limit of iterations");
    }

    const instant = localToUtc(
      date.year,
      date.month,
      date.day,
      anchorParts.hour,
      anchorParts.minute,
      anchorParts.second,
      timeZone,
    );

    if (rule.until !== undefined && instant > rule.until) break;
    if (instant >= toMs) break;

    emitted++;
    if (instant >= fromMs) results.push(instant);
  }

  return results;
}
