import { RRule } from './types.js';
import { parseRRule } from './parse.js';
import { LocalParts, utcToLocal, localToUtc } from './tz.js';

const DAY_MAP: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(year: number, month: number, offset: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + offset;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function addDaysLocal(local: LocalParts, days: number): LocalParts {
  const d = new Date(Date.UTC(local.year, local.month - 1, local.day + days));
  return { ...local, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function dayOfWeek(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function* generateDaily(
  startLocal: LocalParts,
  rrule: RRule,
  tz: string,
): Generator<Date> {
  let i = 0;
  while (true) {
    const d = addDaysLocal(startLocal, i);
    yield localToUtc(d.year, d.month, d.day, d.hour, d.minute, d.second, tz);
    i += rrule.interval;
  }
}

function* generateWeekly(
  dtstart: Date,
  startLocal: LocalParts,
  rrule: RRule,
  tz: string,
): Generator<Date> {
  const days = rrule.byday
    ? rrule.byday.map((b) => DAY_MAP[b.day]).sort((a, b) => a - b)
    : [dayOfWeek(startLocal.year, startLocal.month, startLocal.day)];

  const dow = dayOfWeek(startLocal.year, startLocal.month, startLocal.day);
  const offsetFromMonday = (dow + 6) % 7;
  const baseMonday = addDaysLocal(startLocal, -offsetFromMonday);

  const dtstartMs = dtstart.getTime();

  let week = 0;
  while (true) {
    const weekMonday = addDaysLocal(baseMonday, week * rrule.interval * 7);
    const candidates: Date[] = [];

    for (const d of days) {
      const dayOffset = (d + 6) % 7;
      const date = addDaysLocal(weekMonday, dayOffset);
      const utc = localToUtc(date.year, date.month, date.day, date.hour, date.minute, date.second, tz);
      if (utc.getTime() >= dtstartMs) {
        candidates.push(utc);
      }
    }

    candidates.sort((a, b) => a.getTime() - b.getTime());
    for (const c of candidates) yield c;

    week++;
  }
}

function* generateMonthly(
  dtstart: Date,
  startLocal: LocalParts,
  rrule: RRule,
  tz: string,
): Generator<Date> {
  const dtstartMs = dtstart.getTime();

  if (rrule.byday && rrule.byday.some((b) => b.ordinal !== undefined)) {
    yield* generateMonthlyOrdinal(startLocal, rrule, tz, dtstartMs);
  } else if (rrule.byday && rrule.byday.length > 0) {
    yield* generateMonthlyAllDays(startLocal, rrule, tz, dtstartMs);
  } else {
    yield* generateMonthlyDayOfMonth(startLocal, rrule, tz);
  }
}

function* generateMonthlyOrdinal(
  startLocal: LocalParts,
  rrule: RRule,
  tz: string,
  dtstartMs: number,
): Generator<Date> {
  let monthOff = 0;
  while (true) {
    const { year, month } = addMonths(startLocal.year, startLocal.month, monthOff);
    const totalDays = daysInMonth(year, month);
    const candidates: Date[] = [];

    for (const token of rrule.byday!) {
      const targetDow = DAY_MAP[token.day];
      const ord = token.ordinal ?? 1;
      let day: number;

      if (ord < 0) {
        const lastDow = dayOfWeek(year, month, totalDays);
        const back = (lastDow - targetDow + 7) % 7;
        day = totalDays - back + (ord + 1) * 7;
      } else {
        const firstDow = dayOfWeek(year, month, 1);
        const first = 1 + ((targetDow - firstDow + 7) % 7);
        day = first + (ord - 1) * 7;
      }

      if (day >= 1 && day <= totalDays) {
        const utc = localToUtc(year, month, day, startLocal.hour, startLocal.minute, startLocal.second, tz);
        if (utc.getTime() >= dtstartMs) candidates.push(utc);
      }
    }

    candidates.sort((a, b) => a.getTime() - b.getTime());
    for (const c of candidates) yield c;
    monthOff += rrule.interval;
  }
}

function* generateMonthlyAllDays(
  startLocal: LocalParts,
  rrule: RRule,
  tz: string,
  dtstartMs: number,
): Generator<Date> {
  let monthOff = 0;
  while (true) {
    const { year, month } = addMonths(startLocal.year, startLocal.month, monthOff);
    const totalDays = daysInMonth(year, month);
    const candidates: Date[] = [];

    for (const token of rrule.byday!) {
      const targetDow = DAY_MAP[token.day];
      const firstDow = dayOfWeek(year, month, 1);
      let day = 1 + ((targetDow - firstDow + 7) % 7);

      while (day <= totalDays) {
        const utc = localToUtc(year, month, day, startLocal.hour, startLocal.minute, startLocal.second, tz);
        if (utc.getTime() >= dtstartMs) candidates.push(utc);
        day += 7;
      }
    }

    candidates.sort((a, b) => a.getTime() - b.getTime());
    for (const c of candidates) yield c;
    monthOff += rrule.interval;
  }
}

function* generateMonthlyDayOfMonth(
  startLocal: LocalParts,
  rrule: RRule,
  tz: string,
): Generator<Date> {
  const targetDay = startLocal.day;
  let monthOff = 0;
  while (true) {
    const { year, month } = addMonths(startLocal.year, startLocal.month, monthOff);
    if (targetDay <= daysInMonth(year, month)) {
      yield localToUtc(year, month, targetDay, startLocal.hour, startLocal.minute, startLocal.second, tz);
    }
    monthOff += rrule.interval;
  }
}

export function expandRecurrences(
  dtstart: Date,
  rruleStr: string,
  timeZone: string,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  const rrule = parseRRule(rruleStr);
  const startLocal = utcToLocal(dtstart, timeZone);
  const results: Date[] = [];
  let count = 0;

  let gen: Generator<Date>;
  switch (rrule.freq) {
    case 'DAILY':
      gen = generateDaily(startLocal, rrule, timeZone);
      break;
    case 'WEEKLY':
      gen = generateWeekly(dtstart, startLocal, rrule, timeZone);
      break;
    case 'MONTHLY':
      gen = generateMonthly(dtstart, startLocal, rrule, timeZone);
      break;
    default:
      throw new Error(`Unsupported frequency: ${rrule.freq}`);
  }

  const rangeEndMs = rangeEnd.getTime();
  const rangeStartMs = rangeStart.getTime();

  for (const candidate of gen) {
    const ms = candidate.getTime();

    if (rrule.until && ms > rrule.until.getTime()) break;
    if (ms > rangeEndMs) break;

    count++;
    if (rrule.count !== undefined && count > rrule.count) break;

    if (ms >= rangeStartMs) {
      results.push(candidate);
    }
  }

  return results;
}
