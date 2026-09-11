import type { RRule } from './types';
import { localToUTC, utcToLocal, type LocalParts } from './timezone';

const MAX_TZ_OFFSET_MS = 14 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonthsParts(base: LocalParts, months: number): LocalParts {
  const total = base.year * 12 + (base.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12 + 1;
  return { ...base, year, month };
}

function localPartsToUTC(p: LocalParts): number {
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
}

function addDaysParts(base: LocalParts, days: number): LocalParts {
  const ms = localPartsToUTC(base) + days * DAY_MS;
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: base.hour,
    minute: base.minute,
  };
}

function weekdayOfParts(p: LocalParts): number {
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  pos: number
): number {
  if (pos > 0) {
    const firstDayWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const daysUntil = (weekday - firstDayWeekday + 7) % 7;
    return 1 + daysUntil + (pos - 1) * 7;
  }
  const lastDay = daysInMonth(year, month);
  const lastDayWeekday = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  const daysBack = (lastDayWeekday - weekday + 7) % 7;
  return lastDay - daysBack + (pos + 1) * 7;
}

function startOfWeek(p: LocalParts): LocalParts {
  const wd = weekdayOfParts(p);
  return addDaysParts(p, -wd);
}

export function expand(
  rule: RRule,
  startUTC: number,
  tz: string,
  rangeStart: number,
  rangeEnd: number
): number[] {
  const results: number[] = [];
  const startLocal = utcToLocal(startUTC, tz);
  const interval = rule.interval;

  let totalGenerated = 0;

  const pastRange = (utc: number): boolean => {
    if (rule.count === undefined && rule.until === undefined) {
      return utc > rangeEnd + MAX_TZ_OFFSET_MS;
    }
    return false;
  };

  const hitLimit = (utc: number): boolean => {
    if (rule.until !== undefined && utc > rule.until) return true;
    if (rule.count !== undefined && totalGenerated >= rule.count) return true;
    return false;
  };

  const emit = (local: LocalParts): boolean => {
    const utc = localToUTC(local.year, local.month, local.day, local.hour, local.minute, tz);

    if (hitLimit(utc)) return false;
    if (pastRange(utc)) return false;

    totalGenerated++;

    if (utc >= rangeStart && utc <= rangeEnd) {
      results.push(utc);
    }
    return true;
  };

  if (rule.freq === 'DAILY') {
    let offset = 0;
    while (true) {
      const candidate = addDaysParts(startLocal, offset * interval);
      if (!emit(candidate)) break;
      offset++;
    }
  } else if (rule.freq === 'WEEKLY') {
    if (rule.byday && rule.byday.length > 0) {
      const weekStart = startOfWeek(startLocal);
      let weekOffset = 0;
      while (true) {
        const base = addDaysParts(weekStart, weekOffset * 7 * interval);
        for (const bd of [...rule.byday].sort((a, b) => a.weekday - b.weekday)) {
          const candidate = addDaysParts(base, bd.weekday);
          if (weekOffset === 0 && localPartsToUTC(candidate) < localPartsToUTC(startLocal)) {
            continue;
          }
          if (!emit(candidate)) return results;
        }
        weekOffset++;
      }
    } else {
      let weekOffset = 0;
      while (true) {
        const candidate = addDaysParts(startLocal, weekOffset * 7 * interval);
        if (!emit(candidate)) break;
        weekOffset++;
      }
    }
  } else if (rule.freq === 'MONTHLY') {
    if (rule.byday && rule.byday.length > 0) {
      let monthOffset = 0;
      while (true) {
        const ref = addMonthsParts(startLocal, monthOffset * interval);
        for (const bd of rule.byday) {
          if (bd.pos !== null) {
            const day = nthWeekdayOfMonth(ref.year, ref.month, bd.weekday, bd.pos);
            const candidate: LocalParts = {
              year: ref.year,
              month: ref.month,
              day,
              hour: startLocal.hour,
              minute: startLocal.minute,
            };
            if (monthOffset === 0 && localPartsToUTC(candidate) < localPartsToUTC(startLocal)) {
              continue;
            }
            if (!emit(candidate)) return results;
          } else {
            const firstOfWeekday = nthWeekdayOfMonth(ref.year, ref.month, bd.weekday, 1);
            for (let n = 0; n < 5; n++) {
              const day = firstOfWeekday + n * 7;
              if (day > daysInMonth(ref.year, ref.month)) break;
              const candidate: LocalParts = {
                year: ref.year,
                month: ref.month,
                day,
                hour: startLocal.hour,
                minute: startLocal.minute,
              };
              if (monthOffset === 0 && localPartsToUTC(candidate) < localPartsToUTC(startLocal)) {
                continue;
              }
              if (!emit(candidate)) return results;
            }
          }
        }
        monthOffset++;
      }
    } else {
      let monthOffset = 0;
      while (true) {
        const ref = addMonthsParts(startLocal, monthOffset * interval);
        const maxDay = daysInMonth(ref.year, ref.month);
        if (startLocal.day > maxDay) {
          monthOffset++;
          continue;
        }
        const candidate: LocalParts = {
          year: ref.year,
          month: ref.month,
          day: startLocal.day,
          hour: startLocal.hour,
          minute: startLocal.minute,
        };
        if (!emit(candidate)) break;
        monthOffset++;
      }
    }
  }

  return results;
}
