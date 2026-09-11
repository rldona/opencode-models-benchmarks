export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addDays(
  year: number,
  month: number,
  day: number,
  days: number,
): { year: number; month: number; day: number } {
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

export function addMonths(
  year: number,
  month: number,
  months: number,
): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + months;
  const y = Math.floor(idx / 12);
  const m = ((idx % 12) + 12) % 12;
  return { year: y, month: m + 1 };
}

export function startOfWeek(
  year: number,
  month: number,
  day: number,
  wkst: number,
): { year: number; month: number; day: number } {
  const wd = weekdayOf(year, month, day);
  const back = (wd - wkst + 7) % 7;
  return addDays(year, month, day, -back);
}

export function nthWeekdayInMonth(
  year: number,
  month: number,
  weekday: number,
  nth: number,
): number | null {
  const dim = daysInMonth(year, month);
  if (nth > 0) {
    const firstWd = weekdayOf(year, month, 1);
    const first = 1 + ((weekday - firstWd + 7) % 7);
    const day = first + (nth - 1) * 7;
    return day <= dim ? day : null;
  }
  if (nth < 0) {
    const lastWd = weekdayOf(year, month, dim);
    const last = dim - ((lastWd - weekday + 7) % 7);
    const day = last + (nth + 1) * 7;
    return day >= 1 ? day : null;
  }
  return null;
}

export function weekdaysInMonth(
  year: number,
  month: number,
  weekday: number,
): number[] {
  const dim = daysInMonth(year, month);
  const firstWd = weekdayOf(year, month, 1);
  let day = 1 + ((weekday - firstWd + 7) % 7);
  const days: number[] = [];
  while (day <= dim) {
    days.push(day);
    day += 7;
  }
  return days;
}
