const DAY_MAP: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export interface ByDayRule {
  ordinal: number | null;
  dayOfWeek: number;
}

export interface ParsedRRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  byDay: ByDayRule[] | null;
  byMonthDay: number[] | null;
  count: number | null;
  until: Date | null;
}

function parseByDay(value: string): ByDayRule[] {
  return value.split(',').map((part) => {
    const match = part.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
    if (!match) throw new Error(`Invalid BYDAY part: ${part}`);
    return {
      ordinal: match[1] ? parseInt(match[1], 10) : null,
      dayOfWeek: DAY_MAP[match[2]],
    };
  });
}

export function parseRRule(rrule: string): ParsedRRule {
  const parts = rrule.split(';');
  const result: ParsedRRule = {
    freq: 'DAILY',
    interval: 1,
    byDay: null,
    byMonthDay: null,
    count: null,
    until: null,
  };

  for (const part of parts) {
    const [key, ...rest] = part.split('=');
    const value = rest.join('=');
    switch (key) {
      case 'FREQ':
        if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(value)) {
          throw new Error(`Unsupported FREQ: ${value}`);
        }
        result.freq = value as ParsedRRule['freq'];
        break;
      case 'INTERVAL':
        result.interval = parseInt(value, 10);
        break;
      case 'BYDAY':
        result.byDay = parseByDay(value);
        break;
      case 'BYMONTHDAY':
        result.byMonthDay = value.split(',').map(Number);
        break;
      case 'COUNT':
        result.count = parseInt(value, 10);
        break;
      case 'UNTIL':
        result.until = new Date(value);
        break;
      default:
        throw new Error(`Unsupported RRULE part: ${key}`);
    }
  }

  return result;
}

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getDayOfWeek(year: number, month: number, day: number): number {
  return new Date(year, month, day).getDay();
}

function resolveByDayForMonth(
  year: number,
  month: number,
  byDay: ByDayRule[],
): number[] {
  const days: number[] = [];
  const lastDay = getLastDayOfMonth(year, month);

  for (const rule of byDay) {
    if (rule.ordinal !== null) {
      if (rule.ordinal > 0) {
        let count = 0;
        for (let d = 1; d <= lastDay; d++) {
          if (getDayOfWeek(year, month, d) === rule.dayOfWeek) {
            count++;
            if (count === rule.ordinal) {
              days.push(d);
              break;
            }
          }
        }
      } else {
        let count = 0;
        for (let d = lastDay; d >= 1; d--) {
          if (getDayOfWeek(year, month, d) === rule.dayOfWeek) {
            count++;
            if (count === -rule.ordinal) {
              days.push(d);
              break;
            }
          }
        }
      }
    } else {
      for (let d = 1; d <= lastDay; d++) {
        if (getDayOfWeek(year, month, d) === rule.dayOfWeek) {
          days.push(d);
        }
      }
    }
  }

  return [...new Set(days)].sort((a, b) => a - b);
}

function createDateInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timezone: string,
): Date {
  const candidate = new Date(year, month, day, hour, minute, second, 0);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(candidate);
  const getPart = (type: string) => {
    const p = parts.find((x) => x.type === type);
    return p ? parseInt(p.value, 10) : 0;
  };

  const tzYear = getPart('year');
  const tzMonth = getPart('month');
  const tzDay = getPart('day');
  const tzHour = getPart('hour');
  const tzMinute = getPart('minute');
  const tzSecond = getPart('second');

  if (
    tzYear === year &&
    tzMonth === month + 1 &&
    tzDay === day &&
    tzHour === hour &&
    tzMinute === minute &&
    tzSecond === second
  ) {
    return candidate;
  }

  const diffMs = candidate.getTime() -
    new Date(
      tzYear,
      tzMonth - 1,
      tzDay,
      tzHour,
      tzMinute,
      tzSecond,
      0,
    ).getTime();

  return new Date(candidate.getTime() + diffMs);
}

export interface Occurrence {
  start: Date;
}

export function expandRRule(
  dtstart: string,
  rrule: string,
  timezone: string,
  windowStart: string,
  windowEnd: string,
): Occurrence[] {
  const rule = parseRRule(rrule);
  const winStart = new Date(windowStart);
  const winEnd = new Date(windowEnd);

  const localDt = new Date(dtstart);
  const startYear = localDt.getFullYear();
  const startMonth = localDt.getMonth();
  const startDay = localDt.getDate();
  const startHour = localDt.getHours();
  const startMinute = localDt.getMinutes();
  const startSecond = localDt.getSeconds();

  const firstOccurrence = createDateInTimezone(
    startYear,
    startMonth,
    startDay,
    startHour,
    startMinute,
    startSecond,
    timezone,
  );

  const occurrences: Occurrence[] = [];
  let count = 0;
  const maxIterations = 10000;
  let iterations = 0;

  if (rule.freq === 'DAILY') {
    let year = startYear;
    let month = startMonth;
    let day = startDay;

    while (iterations < maxIterations) {
      iterations++;

      const occ = createDateInTimezone(
        year,
        month,
        day,
        startHour,
        startMinute,
        startSecond,
        timezone,
      );

      if (occ >= winStart && occ <= winEnd) {
        if (rule.until && occ > rule.until) break;
        occurrences.push({ start: occ });
        count++;
        if (rule.count && count >= rule.count) break;
      }

      if (occ > winEnd && !rule.until) break;
      if (rule.until && occ > rule.until) break;

      day += rule.interval;
      const maxDay = getLastDayOfMonth(year, month);
      while (day > maxDay) {
        day -= maxDay;
        month++;
        if (month > 11) {
          month = 0;
          year++;
        }
      }

      if (occ > winEnd && count > 0) break;
    }
  } else if (rule.freq === 'WEEKLY') {
    const startDate = new Date(
      startYear,
      startMonth,
      startDay,
      startHour,
      startMinute,
      startSecond,
    );
    const startDow = startDate.getDay();

    const daysOfWeek = rule.byDay
      ? rule.byDay.map((r) => r.dayOfWeek)
      : [startDow];

    let currentDate = new Date(
      startYear,
      startMonth,
      startDay,
      startHour,
      startMinute,
      startSecond,
    );
    let weekOffset = 0;
    let weekStartDate: Date;

    while (iterations < maxIterations) {
      iterations++;

      weekStartDate = new Date(currentDate);
      weekStartDate.setDate(currentDate.getDate() + weekOffset * 7 * rule.interval);

      const weekDow = weekStartDate.getDay();
      const daysInThisWeek: number[] = [];

      for (const dow of daysOfWeek) {
        let diff = dow - weekDow;
        if (diff < 0 && weekOffset === 0 && dow < startDow) {
          diff += 7;
        }
        if (weekOffset === 0 && dow < startDow) continue;
        const dayOffset = ((dow - weekDow + 7) % 7);
        daysInThisWeek.push(dayOffset);
      }

      const dayOffsets = [...new Set(daysInThisWeek)].sort((a, b) => a - b);

      for (const dayOffset of dayOffsets) {
        const candidateDate = new Date(weekStartDate);
        candidateDate.setDate(weekStartDate.getDate() + dayOffset);

        const occ = createDateInTimezone(
          candidateDate.getFullYear(),
          candidateDate.getMonth(),
          candidateDate.getDate(),
          startHour,
          startMinute,
          startSecond,
          timezone,
        );

        if (occ >= winStart && occ <= winEnd) {
          if (rule.until && occ > rule.until) break;
          occurrences.push({ start: occ });
          count++;
          if (rule.count && count >= rule.count) break;
        }

        if (rule.count && count >= rule.count) break;
        if (rule.until && occ > rule.until) break;
      }

      if (rule.count && count >= rule.count) break;
      if (occurrences.length > 0 && dayOffsets.length > 0) {
        const lastOffset = dayOffsets[dayOffsets.length - 1];
        const lastCandidate = new Date(weekStartDate);
        lastCandidate.setDate(weekStartDate.getDate() + lastOffset);
        if (lastCandidate > winEnd) break;
      }

      weekOffset++;
    }
  } else if (rule.freq === 'MONTHLY') {
    let year = startYear;
    let month = startMonth;

    while (iterations < maxIterations) {
      iterations++;

      let daysOfMonth: number[] = [];

      if (rule.byDay && rule.byDay.some((r) => r.ordinal !== null)) {
        daysOfMonth = resolveByDayForMonth(year, month, rule.byDay);
      } else if (rule.byDay) {
        daysOfMonth = resolveByDayForMonth(year, month, rule.byDay);
      } else if (rule.byMonthDay) {
        const lastDay = getLastDayOfMonth(year, month);
        daysOfMonth = rule.byMonthDay
          .filter((d) => d <= lastDay && d >= 1)
          .sort((a, b) => a - b);
      } else {
        const lastDay = getLastDayOfMonth(year, month);
        daysOfMonth = [Math.min(startDay, lastDay)];
      }

      for (const day of daysOfMonth) {
        const occ = createDateInTimezone(
          year,
          month,
          day,
          startHour,
          startMinute,
          startSecond,
          timezone,
        );

        if (occ >= winStart && occ <= winEnd) {
          if (rule.until && occ > rule.until) break;
          occurrences.push({ start: occ });
          count++;
          if (rule.count && count >= rule.count) break;
        }

        if (rule.count && count >= rule.count) break;
        if (rule.until && occ > rule.until) break;
      }

      if (rule.count && count >= rule.count) break;
      if (rule.until) {
        const lastOcc = createDateInTimezone(
          year,
          month,
          daysOfMonth[daysOfMonth.length - 1] || 1,
          startHour,
          startMinute,
          startSecond,
          timezone,
        );
        if (lastOcc > rule.until) break;
      }

      const maxDayInMonth = getLastDayOfMonth(year, month);
      const lastCheck = createDateInTimezone(
        year,
        month,
        maxDayInMonth,
        startHour,
        startMinute,
        startSecond,
        timezone,
      );
      if (lastCheck > winEnd && occurrences.length > 0) break;

      month += rule.interval;
      while (month > 11) {
        month -= 12;
        year++;
      }
    }
  }

  return occurrences.sort((a, b) => a.start.getTime() - b.start.getTime());
}
