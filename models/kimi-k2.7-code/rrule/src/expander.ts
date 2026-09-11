import { parseRRule } from './parser.js';
import {
  type LocalParts,
  type RRule,
  type DayOfWeek,
  type ByDayPart,
  dayToNumber,
  DAY_ORDER
} from './types.js';
import {
  getParts,
  partsToUtc,
  parseLocalDateTime,
  addDays,
  addMonths,
  daysInMonth,
  isoLocal
} from './timezone.js';

const UTC_SUNDAY = 0;
const UTC_MONDAY = 1;

function gregorianWeekday(year: number, month: number, day: number): DayOfWeek {
  const utcDow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const map: DayOfWeek[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  return map[utcDow];
}

function mondayOfWeek(parts: LocalParts): LocalParts {
  const dow = dayToNumber(gregorianWeekday(parts.year, parts.month, parts.day));
  // dow: MO=0, TU=1, ... SU=6
  const daysBack = dow; // Monday is dow 0
  return addDays(parts, -daysBack);
}

function generateDaily(rule: RRule, startParts: LocalParts, tzid: string, startTs: number): number[] {
  const out: number[] = [];
  let current = startParts;
  let index = 0;

  while (true) {
    const ts = partsToUtc(current, tzid);
    if (ts >= startTs) {
      out.push(ts);
    }
    index += rule.interval;
    current = addDays(startParts, index);
    if (index > 365 * 100) break; // safety
  }

  return out;
}

function generateWeekly(rule: RRule, startParts: LocalParts, tzid: string, startTs: number): number[] {
  const out: number[] = [];
  const baseMonday = mondayOfWeek(startParts);
  const targetDays: DayOfWeek[] = rule.byday?.length
    ? [...rule.byday].sort((a, b) => dayToNumber(a.day) - dayToNumber(b.day)).map((b) => b.day)
    : [gregorianWeekday(startParts.year, startParts.month, startParts.day)];

  let weekIndex = 0;
  while (true) {
    const weekMonday = addDays(baseMonday, weekIndex * 7 * rule.interval);
    for (const day of targetDays) {
      const candidate = addDays(weekMonday, dayToNumber(day));
      const ts = partsToUtc(candidate, tzid);
      if (ts >= startTs) {
        out.push(ts);
      }
    }
    weekIndex++;
    if (weekIndex > 52 * 100) break; // safety
  }

  return out;
}

function dayForByDaySpec(year: number, month: number, spec: ByDayPart): number | null {
  const lastDay = daysInMonth(year, month);
  const targetDow = dayToNumber(spec.day);

  if (spec.pos === undefined) {
    // Without position: not expected for MONTHLY in this subset, fallback to first occurrence.
    const firstDow = dayToNumber(gregorianWeekday(year, month, 1));
    const offset = (targetDow - firstDow + 7) % 7;
    return 1 + offset;
  }

  if (spec.pos > 0) {
    const firstDow = dayToNumber(gregorianWeekday(year, month, 1));
    const offset = (targetDow - firstDow + 7) % 7;
    const day = 1 + offset + (spec.pos - 1) * 7;
    return day <= lastDay ? day : null;
  }

  // Negative position: count from end.
  const lastDow = dayToNumber(gregorianWeekday(year, month, lastDay));
  const offset = (lastDow - targetDow + 7) % 7;
  const day = lastDay - offset + (spec.pos + 1) * 7;
  return day >= 1 ? day : null;
}

function generateMonthly(rule: RRule, startParts: LocalParts, tzid: string, startTs: number): number[] {
  const out: number[] = [];

  let monthIndex = 0;
  while (true) {
    const monthBase = addMonths(startParts, monthIndex * rule.interval);
    const lastDay = daysInMonth(monthBase.year, monthBase.month);
    const monthTimestamps: number[] = [];

    if (rule.byday?.length) {
      for (const spec of rule.byday) {
        const day = dayForByDaySpec(monthBase.year, monthBase.month, spec);
        if (day !== null) {
          const candidate: LocalParts = {
            year: monthBase.year,
            month: monthBase.month,
            day,
            hour: startParts.hour,
            minute: startParts.minute,
            second: startParts.second
          };
          const ts = partsToUtc(candidate, tzid);
          if (ts >= startTs) {
            monthTimestamps.push(ts);
          }
        }
      }
    } else {
      if (startParts.day <= lastDay) {
        const candidate: LocalParts = {
          year: monthBase.year,
          month: monthBase.month,
          day: startParts.day,
          hour: startParts.hour,
          minute: startParts.minute,
          second: startParts.second
        };
        const ts = partsToUtc(candidate, tzid);
        if (ts >= startTs) {
          monthTimestamps.push(ts);
        }
      }
    }

    monthTimestamps.sort((a, b) => a - b);
    out.push(...monthTimestamps);

    monthIndex++;
    if (monthIndex > 12 * 100) break; // safety
  }

  return out;
}

function generateTimestamps(rule: RRule, startParts: LocalParts, tzid: string, startTs: number): number[] {
  switch (rule.freq) {
    case 'DAILY':
      return generateDaily(rule, startParts, tzid, startTs);
    case 'WEEKLY':
      return generateWeekly(rule, startParts, tzid, startTs);
    case 'MONTHLY':
      return generateMonthly(rule, startParts, tzid, startTs);
    default:
      throw new Error(`Unsupported FREQ: ${(rule as RRule).freq}`);
  }
}

export function expand(
  dtstart: string,
  rrule: string,
  tzid: string,
  rangeStart: Date,
  rangeEnd: Date
): Date[] {
  if (rangeStart.getTime() >= rangeEnd.getTime()) {
    throw new Error('rangeStart must be before rangeEnd');
  }

  const rule = parseRRule(rrule);
  const startParts = parseLocalDateTime(dtstart);
  const startTs = partsToUtc(startParts, tzid);
  const untilTs = rule.until ? rule.until.getTime() : Infinity;

  const candidates = generateTimestamps(rule, startParts, tzid, startTs);

  const results: Date[] = [];
  let generated = 0;

  for (const ts of candidates) {
    if (rule.count !== undefined && generated >= rule.count) break;
    if (ts > untilTs) break;

    generated++;

    if (ts >= rangeStart.getTime() && ts < rangeEnd.getTime()) {
      results.push(new Date(ts));
    }

    // If no COUNT/UNTIL, stop once we are past the requested range.
    if (rule.count === undefined && rule.until === undefined && ts > rangeEnd.getTime()) {
      break;
    }

    // Hard safety break.
    if (generated > 10000) break;
  }

  return results;
}
