import type { ByDayToken, ExpandOptions, WallDateTime, Weekday } from './types.js';
import { assertValidTimeZone, localToInstant, wallClockOf } from './timezone.js';
import { normalizeRule } from './rrule.js';

const MS_PER_DAY = 86_400_000;
const MAX_CANDIDATES = 1_000_000;
const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

interface SimpleDate {
  year: number;
  month: number;
  day: number;
}

const INSTANT_SUFFIX_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const LOCAL_START_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

function toInstant(value: Date | string, what: string): number {
  if (value instanceof Date) {
    const t = value.getTime();
    if (Number.isNaN(t)) {
      throw new TypeError(`${what} no es una fecha válida`);
    }
    return t;
  }
  const s = value.trim();
  if (!INSTANT_SUFFIX_RE.test(s)) {
    throw new TypeError(
      `${what} debe ser un instante con zona horaria explícita (Z u offset): "${value}"`
    );
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) {
    throw new TypeError(`${what} no es una fecha válida: "${value}"`);
  }
  return t;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekdayIndex(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

function addDays(date: SimpleDate, days: number): SimpleDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day) + days * MS_PER_DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function cmpDate(a: SimpleDate, b: SimpleDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

function nthWeekdayOfMonth(year: number, month: number, day: Weekday, ord: number): number | null {
  const target = WEEKDAYS.indexOf(day);
  if (ord > 0) {
    const firstIdx = weekdayIndex(year, month, 1);
    const d = 1 + ((target - firstIdx + 7) % 7) + (ord - 1) * 7;
    return d <= daysInMonth(year, month) ? d : null;
  }
  const last = daysInMonth(year, month);
  const lastIdx = weekdayIndex(year, month, last);
  const d = last - ((lastIdx - target + 7) % 7) - (-ord - 1) * 7;
  return d >= 1 ? d : null;
}

function allWeekdaysInMonth(year: number, month: number, day: Weekday): number[] {
  const target = WEEKDAYS.indexOf(day);
  const out: number[] = [];
  for (let d = 1; d <= daysInMonth(year, month); d += 1) {
    if (weekdayIndex(year, month, d) === target) {
      out.push(d);
    }
  }
  return out;
}

function resolveStart(value: Date | string, timeZone: string): WallDateTime {
  if (value instanceof Date) {
    const t = value.getTime();
    if (Number.isNaN(t)) {
      throw new TypeError('start no es una fecha válida');
    }
    return wallClockOf(t, timeZone);
  }
  const s = value.trim();
  if (INSTANT_SUFFIX_RE.test(s)) {
    return wallClockOf(toInstant(s, 'start'), timeZone);
  }
  const m = LOCAL_START_RE.exec(s);
  if (!m) {
    throw new TypeError(`start debe ser una fecha ISO local o un instante: "${value}"`);
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = m[4] === undefined ? 0 : Number(m[4]);
  const minute = m[5] === undefined ? 0 : Number(m[5]);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new TypeError(`start fuera de rango: "${value}"`);
  }
  return { year, month, day, hour, minute, second };
}

function* dailyCandidates(start: WallDateTime, interval: number): Generator<WallDateTime> {
  let cursor: SimpleDate = { year: start.year, month: start.month, day: start.day };
  while (true) {
    yield {
      year: cursor.year,
      month: cursor.month,
      day: cursor.day,
      hour: start.hour,
      minute: start.minute,
      second: start.second,
    };
    cursor = addDays(cursor, interval);
  }
}

function* weeklyCandidates(
  start: WallDateTime,
  interval: number,
  days: number[]
): Generator<WallDateTime> {
  let weekStart = addDays(
    { year: start.year, month: start.month, day: start.day },
    -weekdayIndex(start.year, start.month, start.day)
  );
  while (true) {
    for (const idx of days) {
      const d = addDays(weekStart, idx);
      yield {
        year: d.year,
        month: d.month,
        day: d.day,
        hour: start.hour,
        minute: start.minute,
        second: start.second,
      };
    }
    weekStart = addDays(weekStart, 7 * interval);
  }
}

function* monthlyCandidates(
  start: WallDateTime,
  interval: number,
  byDay: ByDayToken[] | undefined
): Generator<WallDateTime> {
  let year = start.year;
  let month = start.month;
  while (true) {
    const days: number[] = [];
    if (byDay === undefined) {
      if (start.day <= daysInMonth(year, month)) {
        days.push(start.day);
      }
    } else {
      for (const token of byDay) {
        if (token.ord === undefined) {
          days.push(...allWeekdaysInMonth(year, month, token.day));
        } else {
          const d = nthWeekdayOfMonth(year, month, token.day, token.ord);
          if (d !== null) {
            days.push(d);
          }
        }
      }
    }
    days.sort((a, b) => a - b);
    let prev = 0;
    for (const d of days) {
      if (d !== prev) {
        yield {
          year,
          month,
          day: d,
          hour: start.hour,
          minute: start.minute,
          second: start.second,
        };
        prev = d;
      }
    }
    month += interval;
    while (month > 12) {
      month -= 12;
      year += 1;
    }
  }
}

export function expandOccurrences(options: ExpandOptions): Date[] {
  assertValidTimeZone(options.timeZone);
  const rule = normalizeRule(options.rule);
  const from = toInstant(options.from, 'from');
  const to = toInstant(options.to, 'to');
  if (from > to) {
    throw new RangeError('from debe ser anterior o igual a to');
  }
  const start = resolveStart(options.start, options.timeZone);
  const interval = rule.interval ?? 1;
  const startDate: SimpleDate = { year: start.year, month: start.month, day: start.day };

  let generator: Generator<WallDateTime>;
  if (rule.freq === 'DAILY') {
    generator = dailyCandidates(start, interval);
  } else if (rule.freq === 'WEEKLY') {
    const days =
      rule.byDay === undefined
        ? [weekdayIndex(start.year, start.month, start.day)]
        : [...new Set(rule.byDay.map((t) => WEEKDAYS.indexOf(t.day)))].sort((a, b) => a - b);
    generator = weeklyCandidates(start, interval, days);
  } else {
    generator = monthlyCandidates(start, interval, rule.byDay);
  }

  const until = rule.until === undefined ? null : toInstant(rule.until, 'until');
  const out: Date[] = [];
  let remaining = rule.count ?? Number.POSITIVE_INFINITY;
  let examined = 0;

  for (const candidate of generator) {
    examined += 1;
    if (examined > MAX_CANDIDATES) {
      throw new RangeError(
        `Se examinaron más de ${MAX_CANDIDATES} candidatos; acota la ventana o usa COUNT/UNTIL`
      );
    }
    if (cmpDate(candidate, startDate) < 0) {
      continue;
    }
    const instant = localToInstant(candidate, options.timeZone);
    if (until !== null && instant > until) {
      break;
    }
    if (instant > to) {
      break;
    }
    remaining -= 1;
    if (instant >= from) {
      out.push(new Date(instant));
    }
    if (remaining <= 0) {
      break;
    }
  }
  return out;
}
