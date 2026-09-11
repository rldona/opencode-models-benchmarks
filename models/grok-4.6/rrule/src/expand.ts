import {
  addDays,
  addMonths,
  daysInMonth,
  nthWeekdayInMonth,
  startOfWeek,
  weekdayOf,
  weekdaysInMonth,
} from "./civil";
import { parseRRule } from "./parse";
import { getZonedParts, zonedLocalToUtc } from "./timezone";

const MAX_STEPS = 10000;
const WKST = 1;

export function expand(
  dtstart: Date,
  rrule: string,
  timeZone: string,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  if (rangeEnd.getTime() <= rangeStart.getTime()) return [];

  const rule = parseRRule(rrule);
  if (rule.count === 0) return [];

  const start = getZonedParts(dtstart, timeZone);
  const wallMs = dtstart.getMilliseconds();
  const results: Date[] = [];
  let total = 0;

  const take = (year: number, month: number, day: number): boolean => {
    const utc = zonedLocalToUtc(
      year,
      month,
      day,
      start.hour,
      start.minute,
      start.second,
      timeZone,
    );
    if (utc === null) return true;
    const t = utc.getTime() + wallMs;
    if (t < dtstart.getTime()) return true;
    if (rule.until !== undefined && t > rule.until.getTime()) return false;
    if (t >= rangeEnd.getTime()) return false;
    total += 1;
    if (t >= rangeStart.getTime()) results.push(new Date(t));
    if (rule.count !== undefined && total >= rule.count) return false;
    return true;
  };

  if (rule.freq === "DAILY") {
    let y = start.year;
    let m = start.month;
    let d = start.day;
    for (let step = 0; step < MAX_STEPS; step++) {
      if (!take(y, m, d)) break;
      const next = addDays(y, m, d, rule.interval);
      y = next.year;
      m = next.month;
      d = next.day;
    }
    return results;
  }

  if (rule.freq === "WEEKLY") {
    const bydays =
      rule.byday && rule.byday.length > 0
        ? rule.byday
        : [{ weekday: weekdayOf(start.year, start.month, start.day) }];
    const ordered = [...bydays].sort(
      (a, b) => ((a.weekday - WKST + 7) % 7) - ((b.weekday - WKST + 7) % 7),
    );
    let cursor = startOfWeek(start.year, start.month, start.day, WKST);
    for (let step = 0; step < MAX_STEPS; step++) {
      if (step % rule.interval === 0) {
        let cont = true;
        for (const bd of ordered) {
          const date = addDays(
            cursor.year,
            cursor.month,
            cursor.day,
            (bd.weekday - WKST + 7) % 7,
          );
          if (!take(date.year, date.month, date.day)) {
            cont = false;
            break;
          }
        }
        if (!cont) break;
      }
      cursor = addDays(cursor.year, cursor.month, cursor.day, 7);
    }
    return results;
  }

  const endParts = getZonedParts(rangeEnd, timeZone);
  let year = start.year;
  let month = start.month;
  for (let step = 0; step < MAX_STEPS; step++) {
    if (year > endParts.year || (year === endParts.year && month > endParts.month)) {
      break;
    }

    if (rule.byday && rule.byday.length > 0) {
      const days = new Set<number>();
      for (const bd of rule.byday) {
        if (bd.nth !== undefined) {
          const day = nthWeekdayInMonth(year, month, bd.weekday, bd.nth);
          if (day !== null) days.add(day);
        } else {
          for (const day of weekdaysInMonth(year, month, bd.weekday)) days.add(day);
        }
      }
      let cont = true;
      for (const day of [...days].sort((a, b) => a - b)) {
        if (!take(year, month, day)) {
          cont = false;
          break;
        }
      }
      if (!cont) break;
    } else {
      const day = start.day;
      if (day <= daysInMonth(year, month)) {
        if (!take(year, month, day)) break;
      }
    }

    const next = addMonths(year, month, rule.interval);
    year = next.year;
    month = next.month;
  }
  return results;
}
