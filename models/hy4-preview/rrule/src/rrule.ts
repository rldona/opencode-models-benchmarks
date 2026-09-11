import {
  type Civil,
  type Weekday,
  WEEKDAYS,
  addDays,
  addMonths,
  allWeekdaysOfMonth,
  civil,
  civilToUtcMs,
  compareCivil,
  daysInMonth,
  isWeekday,
  mod,
  nthWeekdayOfMonth,
  weekdayIndex,
  weekdayOf,
  withMonth,
} from './civil';
import { assertTimeZone, civilToInstant, formatInZone, instantToCivil, type AmbiguousPolicy, type GapPolicy } from './tz';

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface ByDay {
  ordinal?: number;
  weekday: Weekday;
}

export interface Until {
  civil: Civil;
  utc: boolean;
  dateOnly: boolean;
}

export interface Rule {
  freq: Freq;
  interval: number;
  byDay: ByDay[];
  byMonthDay: number[];
  count?: number;
  until?: Until;
  wkst: Weekday;
}

export interface ExpandOptions {
  start: Date | string | number;
  rule: Rule | string;
  timeZone: string;
  rangeStart: Date | string | number;
  rangeEnd: Date | string | number;
  maxOccurrences?: number;
  ambiguous?: AmbiguousPolicy;
  gap?: GapPolicy;
}

const DEFAULT_MAX_OCCURRENCES = 100_000;

const NAIVE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;
const ABSOLUTE_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const UNTIL_PATTERN = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/;
const BYDAY_PATTERN = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/;

export function parseNaiveDateTime(value: string): Civil {
  const match = NAIVE_PATTERN.exec(value.trim());
  if (!match) throw new Error(`Fecha/hora local inválida: ${value}`);
  const fraction = match[8] ? Number(match[8].padEnd(3, '0')) : 0;
  return civil(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0), fraction);
}

function parseUntil(value: string): Until {
  const match = UNTIL_PATTERN.exec(value.trim().toUpperCase());
  if (!match) throw new Error(`UNTIL inválido: ${value}`);
  const dateOnly = match[4] === undefined;
  return {
    civil: civil(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0), 0),
    utc: match[7] === 'Z',
    dateOnly,
  };
}

export function toInstant(value: Date | string | number, timeZone: string): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const text = value.trim();
  if (ABSOLUTE_PATTERN.test(text)) {
    const parsed = Date.parse(text);
    if (Number.isNaN(parsed)) throw new Error(`Fecha/hora absoluta inválida: ${value}`);
    return parsed;
  }
  return civilToInstant(parseNaiveDateTime(text), timeZone);
}

export function parseByDay(value: string): ByDay[] {
  return value.split(',').map((token) => {
    const raw = token.trim().toUpperCase();
    if (raw.length === 0) throw new Error(`BYDAY vacío: ${value}`);
    const match = BYDAY_PATTERN.exec(raw);
    if (!match) throw new Error(`BYDAY inválido: ${token}`);
    const ordinal = match[1] ? Number(match[1]) : undefined;
    if (ordinal === 0) throw new Error(`BYDAY con ordinal 0 no válido: ${token}`);
    return ordinal === undefined ? { weekday: match[2] as Weekday } : { ordinal, weekday: match[2] as Weekday };
  });
}

export function parseRRule(input: string): Rule {
  const text = input.trim().replace(/^RRULE:/i, '');
  const rule: Rule = { freq: 'DAILY', interval: 1, byDay: [], byMonthDay: [], wkst: 'MO' };
  const seen = new Set<string>();

  for (const chunk of text.split(';')) {
    if (chunk.length === 0) continue;
    const separator = chunk.indexOf('=');
    if (separator < 0) throw new Error(`Parámetro RRULE sin "=", en: ${chunk}`);
    const key = chunk.slice(0, separator).trim().toUpperCase();
    const value = chunk.slice(separator + 1).trim();
    if (seen.has(key)) throw new Error(`Parámetro RRULE duplicado: ${key}`);
    seen.add(key);

    switch (key) {
      case 'FREQ': {
        const freq = value.toUpperCase();
        if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') {
          throw new Error(`FREQ no soportado: ${value} (sólo DAILY, WEEKLY, MONTHLY)`);
        }
        rule.freq = freq;
        break;
      }
      case 'INTERVAL': {
        const interval = Number(value);
        if (!Number.isInteger(interval) || interval < 1) throw new Error(`INTERVAL inválido: ${value}`);
        rule.interval = interval;
        break;
      }
      case 'BYDAY':
        rule.byDay = parseByDay(value);
        break;
      case 'BYMONTHDAY': {
        rule.byMonthDay = value.split(',').map((token) => {
          const n = Number(token.trim());
          if (!Number.isInteger(n) || n === 0 || n < -31 || n > 31) throw new Error(`BYMONTHDAY inválido: ${token}`);
          return n;
        });
        break;
      }
      case 'COUNT': {
        const count = Number(value);
        if (!Number.isInteger(count) || count < 0) throw new Error(`COUNT inválido: ${value}`);
        rule.count = count;
        break;
      }
      case 'UNTIL':
        rule.until = parseUntil(value);
        break;
      case 'WKST': {
        const wkst = value.trim().toUpperCase();
        if (!isWeekday(wkst)) throw new Error(`WKST inválido: ${value}`);
        rule.wkst = wkst;
        break;
      }
      default:
        throw new Error(`Parámetro RRULE no soportado: ${key}`);
    }
  }

  if (!seen.has('FREQ')) throw new Error('La regla debe incluir FREQ');
  return rule;
}

function resolveUntil(until: Until, timeZone: string): number {
  if (until.utc) return civilToUtcMs(until.civil);
  if (until.dateOnly) {
    const endOfDay = civil(until.civil.year, until.civil.month, until.civil.day, 23, 59, 59, 999);
    return civilToInstant(endOfDay, timeZone);
  }
  return civilToInstant(until.civil, timeZone);
}

function monthlyDays(rule: Rule, start: Civil, year: number, month: number): number[] {
  const days = new Set<number>();
  const dim = daysInMonth(year, month);

  if (rule.byDay.length > 0) {
    for (const byDay of rule.byDay) {
      const weekday = weekdayIndex(byDay.weekday);
      if (byDay.ordinal === undefined) {
        for (const day of allWeekdaysOfMonth(year, month, weekday)) days.add(day);
      } else {
        const day = nthWeekdayOfMonth(year, month, weekday, byDay.ordinal);
        if (day !== null) days.add(day);
      }
    }
  } else if (rule.byMonthDay.length > 0) {
    for (const monthDay of rule.byMonthDay) {
      const day = monthDay > 0 ? monthDay : dim + 1 + monthDay;
      if (day >= 1 && day <= dim) days.add(day);
    }
  } else if (start.day <= dim) {
    days.add(start.day);
  }

  return [...days].sort((a, b) => a - b);
}

function* candidates(start: Civil, rule: Rule): Generator<Civil> {
  const interval = rule.interval;

  if (rule.freq === 'DAILY') {
    const allowed = rule.byDay.length > 0 ? new Set(rule.byDay.map((d) => weekdayIndex(d.weekday))) : null;
    for (let step = 0; ; step += 1) {
      const candidate = addDays(start, step * interval);
      if (allowed && !allowed.has(weekdayOf(candidate))) continue;
      yield candidate;
    }
  }

  if (rule.freq === 'WEEKLY') {
    const wkst = weekdayIndex(rule.wkst);
    const weekStart = addDays(start, -mod(weekdayOf(start) - wkst, 7));
    const offsets =
      rule.byDay.length > 0
        ? [...new Set(rule.byDay.map((d) => mod(weekdayIndex(d.weekday) - wkst, 7)))].sort((a, b) => a - b)
        : [mod(weekdayOf(start) - wkst, 7)];

    for (let week = 0; ; week += 1) {
      const base = addDays(weekStart, week * 7 * interval);
      for (const offset of offsets) {
        const candidate = addDays(base, offset);
        if (compareCivil(candidate, start) < 0) continue;
        yield candidate;
      }
    }
  }

  for (let step = 0; ; step += 1) {
    const anchor = addMonths(start, step * interval);
    for (const day of monthlyDays(rule, start, anchor.year, anchor.month)) {
      const candidate = withMonth(start, anchor.year, anchor.month, day);
      if (compareCivil(candidate, start) < 0) continue;
      yield candidate;
    }
  }
}

export function expand(options: ExpandOptions): Date[] {
  const rule = typeof options.rule === 'string' ? parseRRule(options.rule) : options.rule;
  const timeZone = options.timeZone;
  assertTimeZone(timeZone);

  const startInstant = toInstant(options.start, timeZone);
  const rangeStart = toInstant(options.rangeStart, timeZone);
  const rangeEnd = toInstant(options.rangeEnd, timeZone);
  const until = rule.until ? resolveUntil(rule.until, timeZone) : Number.POSITIVE_INFINITY;
  const maxOccurrences = options.maxOccurrences ?? DEFAULT_MAX_OCCURRENCES;

  const startCivil = instantToCivil(startInstant, timeZone);
  const toInstantOptions = { ambiguous: options.ambiguous, gap: options.gap };
  const occurrences: Date[] = [];
  let produced = 0;
  let steps = 0;

  for (const candidate of candidates(startCivil, rule)) {
    if (steps++ >= maxOccurrences) break;
    const instant = civilToInstant(candidate, timeZone, toInstantOptions);
    if (instant > until) break;

    produced += 1;
    if (rule.count !== undefined && produced > rule.count) break;

    if (instant >= rangeStart && instant < rangeEnd) occurrences.push(new Date(instant));
    if (instant >= rangeEnd) break;
  }

  return occurrences;
}

export { WEEKDAYS, formatInZone, instantToCivil, civilToInstant, type AmbiguousPolicy, type GapPolicy, type Civil, type Weekday };
