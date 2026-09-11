import { RRuleError } from './errors';
import type { Weekday } from './types';

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

export const WEEKDAYS: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

const WEEKDAY_INDEX: Readonly<Record<Weekday, number>> = {
  MO: 0,
  TU: 1,
  WE: 2,
  TH: 3,
  FR: 4,
  SA: 5,
  SU: 6,
};

/** A calendar date with no time and no time zone. */
export interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function isWeekday(value: string): value is Weekday {
  return Object.hasOwn(WEEKDAY_INDEX, value.toUpperCase());
}

export function weekdayIndex(weekday: Weekday): number {
  return WEEKDAY_INDEX[weekday];
}

/** `Date.UTC` without the two-digit-year pitfall (`Date.UTC(26, ...)` means 1926). */
export function utcMs(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millisecond);
  return date.getTime();
}

export function dayNumber(date: CivilDate): number {
  return Math.floor(utcMs(date.year, date.month, date.day) / DAY_MS);
}

export function fromDayNumber(value: number): CivilDate {
  const date = new Date(Math.floor(value) * DAY_MS);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function addDays(date: CivilDate, days: number): CivilDate {
  return fromDayNumber(dayNumber(date) + days);
}

export function daysInMonth(year: number, month: number): number {
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return dayNumber({ ...next, day: 1 }) - dayNumber({ year, month, day: 1 });
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/** 0 = Monday .. 6 = Sunday. */
export function weekdayOf(date: CivilDate): number {
  const jsDay = new Date(utcMs(date.year, date.month, date.day)).getUTCDay();
  return (jsDay + 6) % 7;
}

export function startOfWeek(date: CivilDate, wkst: number): CivilDate {
  const delta = (weekdayOf(date) - wkst + 7) % 7;
  return addDays(date, -delta);
}

/**
 * Day-of-month of the `ordinal`-th `weekdayIdx` of a month.
 * `ordinal` is 1..5 from the start or -1..-5 from the end.
 * Returns `null` when the month does not contain it (e.g. the 5th Monday).
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekdayIdx: number,
  ordinal: number,
): number | null {
  const length = daysInMonth(year, month);
  if (ordinal > 0) {
    const first = 1 + ((weekdayIdx - weekdayOf({ year, month, day: 1 }) + 7) % 7);
    const day = first + 7 * (ordinal - 1);
    return day <= length ? day : null;
  }
  const last = length - ((weekdayOf({ year, month, day: length }) - weekdayIdx + 7) % 7);
  const day = last + 7 * (ordinal + 1);
  return day >= 1 ? day : null;
}

/** Every day-of-month of a given weekday, ascending. */
export function weekdayDaysInMonth(year: number, month: number, weekdayIdx: number): number[] {
  const first = 1 + ((weekdayIdx - weekdayOf({ year, month, day: 1 }) + 7) % 7);
  const length = daysInMonth(year, month);
  const days: number[] = [];
  for (let day = first; day <= length; day += 7) days.push(day);
  return days;
}

export function compareCivilDate(a: CivilDate, b: CivilDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

export function formatCivilDate(date: CivilDate): string {
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}

export function pad(value: number, width: number): string {
  const sign = value < 0 ? '-' : '';
  return sign + Math.abs(Math.trunc(value)).toString().padStart(width, '0');
}

export function assertCivilDate(date: CivilDate, context: string): void {
  const { year, month, day } = date;
  const valid =
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month);
  if (!valid) {
    throw new RRuleError(`${context}: invalid date "${formatCivilDate(date)}"`, 'INPUT');
  }
}
