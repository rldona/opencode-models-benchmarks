export interface Civil {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

export type Weekday = 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';

export const WEEKDAYS: Weekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const WEEKDAY_INDEX: Record<Weekday, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

export const MS_PER_DAY = 86_400_000;

export function weekdayIndex(weekday: Weekday): number {
  return WEEKDAY_INDEX[weekday];
}

export function civil(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, millisecond = 0): Civil {
  return { year, month, day, hour, minute, second, millisecond };
}

export function isWeekday(value: string): value is Weekday {
  return value === 'SU' || value === 'MO' || value === 'TU' || value === 'WE' || value === 'TH' || value === 'FR' || value === 'SA';
}

export function civilToUtcMs(c: Civil): number {
  return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second, c.millisecond);
}

export function utcMsToCivil(ms: number): Civil {
  const d = new Date(ms);
  return civil(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function weekdayOf(c: Civil): number {
  return new Date(Date.UTC(c.year, c.month - 1, c.day)).getUTCDay();
}

export function addDays(c: Civil, days: number): Civil {
  const ms = Date.UTC(c.year, c.month - 1, c.day) + days * MS_PER_DAY;
  const d = new Date(ms);
  return civil(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), c.hour, c.minute, c.second, c.millisecond);
}

export function addMonths(c: Civil, months: number): Civil {
  const total = (c.year * 12 + (c.month - 1)) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12 + 12) % 12 + 1;
  const day = Math.min(c.day, daysInMonth(year, month));
  return civil(year, month, day, c.hour, c.minute, c.second, c.millisecond);
}

export function withDay(c: Civil, day: number): Civil {
  return civil(c.year, c.month, day, c.hour, c.minute, c.second, c.millisecond);
}

export function withMonth(c: Civil, year: number, month: number, day: number): Civil {
  return civil(year, month, day, c.hour, c.minute, c.second, c.millisecond);
}

export function compareCivil(a: Civil, b: Civil): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  if (a.day !== b.day) return a.day - b.day;
  if (a.hour !== b.hour) return a.hour - b.hour;
  if (a.minute !== b.minute) return a.minute - b.minute;
  if (a.second !== b.second) return a.second - b.second;
  return a.millisecond - b.millisecond;
}

export function mod(value: number, n: number): number {
  return ((value % n) + n) % n;
}

export function nthWeekdayOfMonth(year: number, month: number, weekday: number, ordinal: number): number | null {
  const dim = daysInMonth(year, month);
  if (ordinal > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const day = 1 + mod(weekday - first, 7) + (ordinal - 1) * 7;
    return day <= dim ? day : null;
  }
  const last = new Date(Date.UTC(year, month - 1, dim)).getUTCDay();
  const day = dim - mod(last - weekday, 7) - (Math.abs(ordinal) - 1) * 7;
  return day >= 1 ? day : null;
}

export function allWeekdaysOfMonth(year: number, month: number, weekday: number): number[] {
  const dim = daysInMonth(year, month);
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const start = 1 + mod(weekday - first, 7);
  const days: number[] = [];
  for (let day = start; day <= dim; day += 7) days.push(day);
  return days;
}
