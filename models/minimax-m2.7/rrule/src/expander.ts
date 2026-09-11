import { ParsedRRule, LocalDateTime, Occurrence } from './types.js';
import { parseRRule, getWeekdayIndex } from './parser.js';
import { Timezone, createTimezone } from './timezone.js';

const WEEKDAY_NUMBERS: Record<string, number> = {
  'SU': 0, 'MO': 1, 'TU': 2, 'WE': 3, 'TH': 4, 'FR': 5, 'SA': 6
};

export function expandRecurrences(
  startDate: Date,
  rruleString: string,
  timezoneName: string,
  rangeStart: Date,
  rangeEnd: Date
): Occurrence[] {
  const rule = parseRRule(rruleString);
  const tz = createTimezone(timezoneName);

  const startLocal = tz.fromTimestamp(startDate.getTime());
  const occurrences: Occurrence[] = [];

  switch (rule.freq) {
    case 'DAILY':
      expandDaily(startLocal, rule, tz, rangeStart, rangeEnd, occurrences);
      break;
    case 'WEEKLY':
      expandWeekly(startLocal, rule, tz, rangeStart, rangeEnd, occurrences);
      break;
    case 'MONTHLY':
      expandMonthly(startLocal, rule, tz, rangeStart, rangeEnd, occurrences);
      break;
  }

  return occurrences;
}

function expandDaily(
  start: LocalDateTime,
  rule: ParsedRRule,
  tz: Timezone,
  rangeStart: Date,
  rangeEnd: Date,
  occurrences: Occurrence[]
): void {
  let current = { ...start };
  let generated = 0;
  const maxIterations = (rule.count || 1000) + (rule.until ? 1000 : 0);
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    if (rule.count && generated >= rule.count) break;
    if (rule.until) {
      const untilTs = rule.until.getTime();
      const currentTs = tz.toTimestamp(current);
      if (currentTs > untilTs) break;
    }

    const ts = tz.toTimestamp(current);
    if (ts >= rangeStart.getTime() && ts <= rangeEnd.getTime()) {
      occurrences.push({ localDateTime: { ...current }, timestamp: ts });
    }

    if (ts > rangeEnd.getTime() && generated > 0) break;

    current = tz.addDays(current, rule.interval);
    generated++;
  }
}

function expandWeekly(
  start: LocalDateTime,
  rule: ParsedRRule,
  tz: Timezone,
  rangeStart: Date,
  rangeEnd: Date,
  occurrences: Occurrence[]
): void {
  const startWeekday = new Date(tz.toTimestamp(start)).getDay();
  const targetWeekdays = rule.byDay.length > 0
    ? rule.byDay.map(e => getWeekdayIndex(e.day))
    : [startWeekday];

  let weekStart = getWeekStart(start, tz);
  let generated = 0;
  let weekCount = 0;
  const maxWeeks = (rule.count || 500) * 2;
  let iterations = 0;

  while (iterations < maxWeeks) {
    iterations++;

    for (const weekday of targetWeekdays.sort((a, b) => a - b)) {
      let dayOffset = weekday - weekStart.day;
      if (dayOffset < 0) dayOffset += 7;

      const occurrence = tz.addDays(weekStart, dayOffset);
      const occurrenceWithTime = tz.setTime(
        occurrence,
        start.hour,
        start.minute,
        start.second
      );
      const ts = tz.toTimestamp(occurrenceWithTime);

      if (rule.count && generated >= rule.count) break;
      if (rule.until) {
        const untilTs = rule.until.getTime();
        if (ts > untilTs) break;
      }

      if (ts >= rangeStart.getTime() && ts <= rangeEnd.getTime()) {
        occurrences.push({ localDateTime: { ...occurrenceWithTime }, timestamp: ts });
        generated++;
      }
    }

    if (rule.count && generated >= rule.count) break;
    if (rule.until && occurrences.length > 0) {
      const lastTs = occurrences[occurrences.length - 1].timestamp;
      if (lastTs > rule.until.getTime()) break;
    }

    weekStart = tz.addDays(weekStart, 7 * rule.interval);
    weekCount++;

    const lastOccurrence = occurrences[occurrences.length - 1];
    if (lastOccurrence && lastOccurrence.timestamp > rangeEnd.getTime()) {
      const weekStartTs = tz.toTimestamp(weekStart);
      if (weekStartTs > rangeEnd.getTime() + 7 * 24 * 60 * 60 * 1000) break;
    }
  }
}

function getWeekStart(date: LocalDateTime, tz: Timezone): LocalDateTime {
  const weekday = new Date(tz.toTimestamp(date)).getDay();
  return tz.addDays(date, -weekday);
}

function expandMonthly(
  start: LocalDateTime,
  rule: ParsedRRule,
  tz: Timezone,
  rangeStart: Date,
  rangeEnd: Date,
  occurrences: Occurrence[]
): void {
  let current = { ...start };
  let generated = 0;
  let iterations = 0;
  const maxIterations = (rule.count || 500) * 2;

  while (iterations < maxIterations) {
    iterations++;

    if (rule.count && generated >= rule.count) break;
    if (rule.until) {
      const untilTs = tz.toTimestamp(current);
      if (untilTs > rule.until.getTime()) break;
    }

    for (const byDay of rule.byDay) {
      const occurrence = getMonthlyOccurrence(current, byDay, tz);
      if (!occurrence) continue;

      const occurrenceWithTime = tz.setTime(
        occurrence,
        start.hour,
        start.minute,
        start.second
      );
      const ts = tz.toTimestamp(occurrenceWithTime);

      if (rule.count && generated >= rule.count) break;
      if (rule.until) {
        const untilTs = rule.until.getTime();
        if (ts > untilTs) break;
      }

      if (ts >= rangeStart.getTime() && ts <= rangeEnd.getTime()) {
        occurrences.push({ localDateTime: { ...occurrenceWithTime }, timestamp: ts });
        generated++;
      }
    }

    if (rule.count && generated >= rule.count) break;

    const lastOccurrence = occurrences[occurrences.length - 1];
    if (lastOccurrence && lastOccurrence.timestamp > rangeEnd.getTime()) {
      const nextMonth = tz.addMonths(current, rule.interval);
      const nextTs = tz.toTimestamp(nextMonth);
      if (nextTs > rangeEnd.getTime() + 35 * 24 * 60 * 60 * 1000) break;
    }

    current = tz.addMonths(current, rule.interval);
  }
}

function getMonthlyOccurrence(
  monthDate: LocalDateTime,
  byDay: { day: string; position?: number },
  tz: Timezone
): LocalDateTime | null {
  const weekdayNum = WEEKDAY_NUMBERS[byDay.day];
  const position = byDay.position || 0;

  if (position < 0) {
    return getLastWeekdayOfMonth(monthDate.year, monthDate.month, weekdayNum, tz);
  } else if (position >= 1) {
    return getNthWeekdayOfMonth(monthDate.year, monthDate.month, weekdayNum, position, tz);
  } else {
    const firstOfMonth = { year: monthDate.year, month: monthDate.month, day: 1 };
    const firstWeekday = new Date(tz.toTimestamp(firstOfMonth as LocalDateTime)).getDay();
    let dayOffset = weekdayNum - firstWeekday;
    if (dayOffset < 0) dayOffset += 7;
    return { ...firstOfMonth, day: dayOffset + 1 } as LocalDateTime;
  }
}

function getNthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  position: number,
  tz: Timezone
): LocalDateTime | null {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = firstDay.getDay();
  let day = 1 + ((weekday - firstWeekday + 7) % 7);
  day += (position - 1) * 7;

  const lastDay = new Date(Date.UTC(year, month, 0)).getDate();
  if (day > lastDay) return null;

  return { year, month, day, hour: 0, minute: 0, second: 0, isDst: false };
}

function getLastWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  tz: Timezone
): LocalDateTime | null {
  const lastDay = new Date(Date.UTC(year, month, 0)).getDate();
  const lastDayDate = new Date(Date.UTC(year, month - 1, lastDay));
  const lastWeekday = lastDayDate.getDay();
  let dayOffset = weekday - lastWeekday;
  if (dayOffset > 0) dayOffset -= 7;
  const day = lastDay + dayOffset;

  if (day < 1) return null;

  return { year, month, day, hour: 0, minute: 0, second: 0, isDst: false };
}

export { Timezone };
