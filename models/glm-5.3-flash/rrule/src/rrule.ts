import { Wall, formatWall, validateTimeZone, wallToUtc, zoneParts } from './timezone.js';

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';

type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const WEEKDAY_NAMES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

interface BydayToken {
  ordinal: number | undefined;
  weekday: Weekday;
}

export interface RruleParts {
  freq: Freq;
  interval: number;
  byday: BydayToken[] | undefined;
  count: number | undefined;
  until: string | undefined;
}

const BYDAY_TOKEN = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/i;
const DATE_TIME = /^(\d{4})-?(\d{2})-?(\d{2})(?:[T ](\d{2}):?(\d{2})(?::?(\d{2})(?:\.\d+)?)?([Zz]|[+-]\d{2}:?\d{2})?)?$/;

interface DateTimeArg {
  wall: Wall;
  hasTime: boolean;
  hasOffset: boolean;
  instantMs: number | undefined;
}

export interface ExpandInput {
  start: string;
  rule: string;
  timeZone: string;
  from: string;
  to: string;
}

export interface Occurrence {
  utc: string;
  local: string;
}

const MAX_ITERATIONS = 100_000;
const MAX_OFFSET_MS = 15 * 3_600_000;

function offsetSuffixToMs(suffix: string): number {
  if (suffix === 'Z' || suffix === 'z') {
    return 0;
  }
  const sign = suffix.startsWith('-') ? -1 : 1;
  const digits = suffix.slice(1).replace(':', '');
  const hh = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2));
  return sign * (hh * 60 + mm) * 60_000;
}

export function parseDateTimeArg(raw: string): DateTimeArg {
  const match = DATE_TIME.exec(raw.trim());
  if (!match) {
    throw new Error(
      `Invalid date/time "${raw}" (expected YYYY-MM-DD or YYYY-MM-DDTHH:mm[:ss][Z|±hh:mm])`
    );
  }
  const wall: Wall = {
    y: Number(match[1]),
    mo: Number(match[2]),
    d: Number(match[3]),
    h: match[4] ? Number(match[4]) : 0,
    mi: match[5] ? Number(match[5]) : 0,
    s: match[6] ? Number(match[6]) : 0,
  };
  const hasTime = match[4] !== undefined;
  const suffix = match[7];
  if (!suffix) {
    return { wall, hasTime, hasOffset: false, instantMs: undefined };
  }
  const instantMs =
    Date.UTC(wall.y, wall.mo - 1, wall.d, wall.h, wall.mi, wall.s) - offsetSuffixToMs(suffix);
  return { wall, hasTime, hasOffset: true, instantMs };
}

export function parseRrule(input: string): RruleParts {
  const fields = new Map<string, string>();
  for (const piece of input.split(';')) {
    const token = piece.trim();
    if (!token) {
      continue;
    }
    const eq = token.indexOf('=');
    if (eq <= 0) {
      throw new Error(`Invalid RRULE component "${piece}"`);
    }
    fields.set(token.slice(0, eq).trim().toUpperCase(), token.slice(eq + 1).trim());
  }

  const freqRaw = fields.get('FREQ');
  if (freqRaw === undefined) {
    throw new Error('RRULE is missing FREQ');
  }
  const freq = freqRaw.toUpperCase();
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') {
    throw new Error(`Unsupported FREQ "${freqRaw}", only DAILY, WEEKLY and MONTHLY`);
  }

  let interval = 1;
  const intervalRaw = fields.get('INTERVAL');
  if (intervalRaw !== undefined) {
    interval = Number(intervalRaw);
    if (!Number.isInteger(interval) || interval < 1) {
      throw new Error(`Invalid INTERVAL "${intervalRaw}"`);
    }
  }

  let count: number | undefined;
  const countRaw = fields.get('COUNT');
  if (countRaw !== undefined) {
    count = Number(countRaw);
    if (!Number.isInteger(count) || count < 1) {
      throw new Error(`Invalid COUNT "${countRaw}"`);
    }
  }

  let byday: BydayToken[] | undefined;
  const bydayRaw = fields.get('BYDAY');
  if (bydayRaw !== undefined) {
    const tokens: BydayToken[] = [];
    const seen = new Set<string>();
    for (const piece of bydayRaw.split(',')) {
      const match = BYDAY_TOKEN.exec(piece.trim());
      if (!match) {
        throw new Error(`Invalid BYDAY value "${piece}"`);
      }
      const weekday = WEEKDAY_NAMES.indexOf(
        match[2].toUpperCase() as (typeof WEEKDAY_NAMES)[number]
      ) as Weekday;
      const ordinalRaw = match[1];
      const ordinal = ordinalRaw ? Number(ordinalRaw) : undefined;
      if (ordinal !== undefined && (ordinal === 0 || Math.abs(ordinal) > 5)) {
        throw new Error(`Invalid BYDAY ordinal "${piece}"`);
      }
      const key = `${ordinal ?? ''}:${weekday}`;
      if (!seen.has(key)) {
        seen.add(key);
        tokens.push({ ordinal, weekday });
      }
    }
    if (freq === 'DAILY') {
      throw new Error('BYDAY is only supported with FREQ=WEEKLY or FREQ=MONTHLY');
    }
    if (freq === 'WEEKLY' && tokens.some((token) => token.ordinal !== undefined)) {
      throw new Error('Ordinal BYDAY (e.g. 2TU, -1FR) is only supported with FREQ=MONTHLY');
    }
    byday = tokens;
  }

  const until = fields.get('UNTIL');
  if (until !== undefined) {
    parseDateTimeArg(until);
  }

  return { freq, interval, byday, count, until };
}

function toInstantMs(raw: string, zone: string): number {
  const arg = parseDateTimeArg(raw);
  return arg.hasOffset ? (arg.instantMs as number) : wallToUtc(arg.wall, zone);
}

function resolveUntil(raw: string, zone: string): number {
  const arg = parseDateTimeArg(raw);
  if (arg.hasOffset) {
    return arg.instantMs as number;
  }
  const wall = arg.hasTime ? arg.wall : { ...arg.wall, h: 23, mi: 59, s: 59 };
  return wallToUtc(wall, zone);
}

function wallKey(wall: Wall): number {
  return Date.UTC(wall.y, wall.mo - 1, wall.d, wall.h, wall.mi, wall.s);
}

function weekdayOf(y: number, mo: number, d: number): Weekday {
  return ((new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7) as Weekday;
}

function addDays(wall: Wall, n: number): Wall {
  const t = new Date(Date.UTC(wall.y, wall.mo - 1, wall.d + n));
  return {
    y: t.getUTCFullYear(),
    mo: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    h: wall.h,
    mi: wall.mi,
    s: wall.s,
  };
}

function addMonths(wall: Wall, n: number): Wall {
  const anchor = new Date(Date.UTC(wall.y, wall.mo - 1 + n, 1));
  const y = anchor.getUTCFullYear();
  const mo = anchor.getUTCMonth() + 1;
  return { y, mo, d: Math.min(wall.d, daysInMonth(y, mo)), h: wall.h, mi: wall.mi, s: wall.s };
}

function daysInMonth(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

function bydayDays(y: number, mo: number, token: BydayToken): number[] {
  const matching: number[] = [];
  const last = daysInMonth(y, mo);
  for (let d = 1; d <= last; d++) {
    if (weekdayOf(y, mo, d) === token.weekday) {
      matching.push(d);
    }
  }
  if (token.ordinal === undefined) {
    return matching;
  }
  const index = token.ordinal > 0 ? token.ordinal - 1 : matching.length + token.ordinal;
  const day = matching[index];
  return day === undefined ? [] : [day];
}

export function expandEvents(input: ExpandInput): Occurrence[] {
  const zone = input.timeZone;
  validateTimeZone(zone);
  const rule = parseRrule(input.rule);

  const startArg = parseDateTimeArg(input.start);
  let startWall: Wall;
  let startUtc: number;
  if (startArg.hasOffset) {
    startUtc = startArg.instantMs as number;
    startWall = zoneParts(zone, startUtc);
  } else {
    startWall = startArg.wall;
    startUtc = wallToUtc(startWall, zone);
  }

  const fromMs = toInstantMs(input.from, zone);
  const toMs = toInstantMs(input.to, zone);
  if (toMs < fromMs) {
    return [];
  }
  const untilMs = rule.until === undefined ? undefined : resolveUntil(rule.until, zone);

  const occurrences: Occurrence[] = [];
  let remaining = rule.count ?? Number.POSITIVE_INFINITY;
  let stopped = false;

  const emit = (utc: number): void => {
    remaining -= 1;
    if ((untilMs !== undefined && utc > untilMs) || utc > toMs) {
      stopped = true;
      return;
    }
    if (utc >= fromMs) {
      occurrences.push({ utc: new Date(utc).toISOString(), local: formatWall(zoneParts(zone, utc)) });
    }
  };

  emit(startUtc);
  if (stopped || remaining <= 0) {
    return occurrences;
  }

  if (rule.freq === 'DAILY') {
    for (let k = 1; !stopped && remaining > 0 && k <= MAX_ITERATIONS; k++) {
      const wall = addDays(startWall, k * rule.interval);
      emit(wallToUtc(wall, zone));
    }
  } else if (rule.freq === 'WEEKLY') {
    const startWeekday = weekdayOf(startWall.y, startWall.mo, startWall.d);
    const days: Weekday[] = rule.byday
      ? ([...new Set(rule.byday.map((token) => token.weekday))] as Weekday[]).sort((a, b) => a - b)
      : [startWeekday];
    const firstMonday = addDays(startWall, -startWeekday);
    for (let k = 0; !stopped && remaining > 0 && k <= MAX_ITERATIONS; k++) {
      const weekMonday = addDays(firstMonday, 7 * k * rule.interval);
      for (const weekday of days) {
        const wall = addDays(weekMonday, weekday);
        if (wallKey(wall) <= wallKey(startWall)) {
          continue;
        }
        emit(wallToUtc(wall, zone));
        if (stopped || remaining <= 0) {
          break;
        }
      }
    }
  } else {
    for (let k = 0; !stopped && remaining > 0 && k <= MAX_ITERATIONS; k++) {
      const month = addMonths(startWall, k * rule.interval);
      if (wallKey({ y: month.y, mo: month.mo, d: 1, h: 0, mi: 0, s: 0 }) - MAX_OFFSET_MS > toMs) {
        break;
      }
      const daySet = new Set<number>();
      if (rule.byday) {
        for (const token of rule.byday) {
          for (const d of bydayDays(month.y, month.mo, token)) {
            daySet.add(d);
          }
        }
      } else if (startWall.d <= daysInMonth(month.y, month.mo)) {
        daySet.add(startWall.d);
      }
      const days = [...daySet].sort((a, b) => a - b);
      for (const d of days) {
        const wall: Wall = { y: month.y, mo: month.mo, d, h: startWall.h, mi: startWall.mi, s: startWall.s };
        if (wallKey(wall) <= wallKey(startWall)) {
          continue;
        }
        emit(wallToUtc(wall, zone));
        if (stopped || remaining <= 0) {
          break;
        }
      }
    }
  }

  return occurrences;
}
