import { isWeekday, weekdayIndex } from './civil';
import { RRuleError } from './errors';
import { toInstantMs } from './tz';
import type { ByDayItem, DateInput, Frequency, RecurrenceRule, Weekday } from './types';

export interface ResolvedByDay {
  readonly weekday: Weekday;
  /** 0 = Monday .. 6 = Sunday. */
  readonly weekdayIdx: number;
  /** `undefined` for plain weekdays (e.g. `FR`). */
  readonly ordinal?: number;
}

export interface ResolvedRule {
  readonly freq: Frequency;
  readonly interval: number;
  readonly byDay: readonly ResolvedByDay[];
  readonly count?: number;
  readonly until?: Date;
  readonly wkst: Weekday;
  readonly wkstIdx: number;
}

export interface ParseOptions {
  /** Used to resolve a zone-less `UNTIL` value; when absent, zone-less means UTC. */
  readonly timeZone?: string;
}

const FREQUENCIES: readonly Frequency[] = ['DAILY', 'WEEKLY', 'MONTHLY'];

const OUT_OF_SUBSET_FREQ = new Set(['YEARLY', 'HOURLY', 'MINUTELY', 'SECONDLY']);

const UNSUPPORTED_PARTS = new Set([
  'BYMONTH',
  'BYMONTHDAY',
  'BYSETPOS',
  'BYYEARDAY',
  'BYWEEKNO',
  'BYHOUR',
  'BYMINUTE',
  'BYSECOND',
  'BYEASTER',
]);

const SUPPORTED_PARTS = ['FREQ', 'INTERVAL', 'BYDAY', 'COUNT', 'UNTIL', 'WKST'] as const;

const BYDAY_TOKEN = /^([+-]?\d{1,2})?([A-Z]{2})$/;

/** Intermediate, already-validated representation shared by the string and object paths. */
interface RuleParts {
  freq?: Frequency;
  interval?: number;
  byDay?: ByDayItem[];
  count?: number;
  untilMs?: number;
  wkst?: Weekday;
}

/** Parses an `RRULE` string such as `FREQ=WEEKLY;BYDAY=2TU,-1FR;COUNT=8`. */
export function parseRRule(input: string, options: ParseOptions = {}): RecurrenceRule {
  if (typeof input !== 'string') {
    throw new RRuleError('RRULE must be provided as a string or a RecurrenceRule object', 'PARSE');
  }
  return buildRule(parseRuleString(input, options));
}

/** Validates a rule given as a string or as an object, and resolves its defaults. */
export function normalizeRule(
  input: string | RecurrenceRule,
  options: ParseOptions = {},
): ResolvedRule {
  const parts = typeof input === 'string' ? parseRuleString(input, options) : readRuleObject(input, options);
  return toResolved(buildRule(parts));
}

function parseRuleString(input: string, options: ParseOptions): RuleParts {
  let text = input.trim();
  if (/^rrule:/i.test(text)) text = text.slice('RRULE:'.length).trim();
  if (text.length === 0) {
    throw new RRuleError('RRULE is empty', 'PARSE');
  }

  const parts: RuleParts = {};
  const seen = new Set<string>();
  for (const chunk of text.split(';')) {
    const part = chunk.trim();
    if (part.length === 0) continue;
    const separator = part.indexOf('=');
    if (separator <= 0) {
      throw new RRuleError(`Malformed RRULE part "${part}" (expected KEY=VALUE)`, 'PARSE');
    }
    const key = part.slice(0, separator).trim().toUpperCase();
    const value = part.slice(separator + 1).trim();
    if (value.length === 0) {
      throw new RRuleError(`RRULE part "${key}" has no value`, 'PARSE');
    }
    if (UNSUPPORTED_PARTS.has(key)) {
      throw new RRuleError(
        `RRULE part "${key}" is outside the supported subset (${SUPPORTED_PARTS.join(', ')})`,
        'UNSUPPORTED',
      );
    }
    if (!(SUPPORTED_PARTS as readonly string[]).includes(key)) {
      throw new RRuleError(`Unknown RRULE part "${key}"`, 'PARSE');
    }
    if (seen.has(key)) {
      throw new RRuleError(`RRULE part "${key}" is specified more than once`, 'PARSE');
    }
    seen.add(key);
    readPart(parts, key, value, options);
  }
  return parts;
}

function readPart(parts: RuleParts, key: string, value: string, options: ParseOptions): void {
  switch (key) {
    case 'FREQ':
      parts.freq = parseFrequency(value);
      return;
    case 'INTERVAL':
      parts.interval = parsePositiveInt(value, 'INTERVAL');
      return;
    case 'COUNT':
      parts.count = parsePositiveInt(value, 'COUNT');
      return;
    case 'WKST':
      parts.wkst = parseWeekday(value, 'WKST');
      return;
    case 'UNTIL':
      parts.untilMs = parseUntil(value, options.timeZone);
      return;
    case 'BYDAY':
      parts.byDay = parseByDay(value);
      return;
    default:
      throw new RRuleError(`Unknown RRULE part "${key}"`, 'PARSE');
  }
}

function readRuleObject(rule: RecurrenceRule, options: ParseOptions): RuleParts {
  if (rule === null || typeof rule !== 'object') {
    throw new RRuleError('RRULE must be provided as a string or a RecurrenceRule object', 'PARSE');
  }
  const parts: RuleParts = {};
  if (rule.freq !== undefined) parts.freq = parseFrequency(String(rule.freq));
  if (rule.interval !== undefined) parts.interval = readPositiveInt(rule.interval, 'INTERVAL');
  if (rule.count !== undefined) parts.count = readPositiveInt(rule.count, 'COUNT');
  if (rule.wkst !== undefined) parts.wkst = parseWeekday(String(rule.wkst), 'WKST');
  if (rule.until !== undefined) parts.untilMs = parseUntil(rule.until, options.timeZone);
  if (rule.byDay !== undefined) {
    if (!Array.isArray(rule.byDay)) {
      throw new RRuleError('BYDAY must be an array of weekday items', 'PARSE');
    }
    parts.byDay = rule.byDay.map(readByDayItem);
  }
  return parts;
}

function readByDayItem(item: ByDayItem): ByDayItem {
  if (item === null || typeof item !== 'object') {
    throw new RRuleError(`Invalid BYDAY item: ${String(item)}`, 'PARSE');
  }
  const weekday = parseWeekday(String(item.weekday), 'BYDAY');
  if (item.ordinal === undefined) return { weekday };
  const ordinal = item.ordinal;
  if (!Number.isInteger(ordinal) || ordinal === 0 || Math.abs(ordinal) > 5) {
    throw new RRuleError(`Invalid BYDAY ordinal ${String(ordinal)} (expected 1..5 or -1..-5)`, 'PARSE');
  }
  return { weekday, ordinal };
}

function buildRule(parts: RuleParts): RecurrenceRule {
  if (parts.freq === undefined) {
    throw new RRuleError('RRULE is missing the required FREQ part', 'PARSE');
  }
  if (parts.count !== undefined && parts.untilMs !== undefined) {
    throw new RRuleError('COUNT and UNTIL must not both be present in a rule (RFC 5545)', 'CONFLICT');
  }
  assertFreqByDayCombination(parts.freq, parts.byDay ?? []);

  const rule: {
    freq: Frequency;
    interval?: number;
    byDay?: ByDayItem[];
    count?: number;
    until?: Date;
    wkst?: Weekday;
  } = { freq: parts.freq };
  if (parts.interval !== undefined) rule.interval = parts.interval;
  if (parts.byDay !== undefined) rule.byDay = parts.byDay;
  if (parts.count !== undefined) rule.count = parts.count;
  if (parts.untilMs !== undefined) rule.until = new Date(parts.untilMs);
  if (parts.wkst !== undefined) rule.wkst = parts.wkst;
  return rule;
}

function toResolved(rule: RecurrenceRule): ResolvedRule {
  const wkst = rule.wkst ?? 'MO';
  const resolved: {
    freq: Frequency;
    interval: number;
    byDay: ResolvedByDay[];
    count?: number;
    until?: Date;
    wkst: Weekday;
    wkstIdx: number;
  } = {
    freq: rule.freq,
    interval: rule.interval ?? 1,
    byDay: (rule.byDay ?? []).map((item) => {
      const weekdayIdx = weekdayIndex(item.weekday);
      return item.ordinal === undefined
        ? { weekday: item.weekday, weekdayIdx }
        : { weekday: item.weekday, weekdayIdx, ordinal: item.ordinal };
    }),
    wkst,
    wkstIdx: weekdayIndex(wkst),
  };
  if (rule.count !== undefined) resolved.count = rule.count;
  if (rule.until !== undefined) {
    resolved.until = rule.until instanceof Date ? rule.until : new Date(parseUntil(rule.until));
  }
  return resolved;
}

function parseUntil(value: DateInput, timeZone?: string): number {
  return toInstantMs(value, timeZone);
}

function parseFrequency(value: string): Frequency {
  const freq = value.trim().toUpperCase();
  if ((FREQUENCIES as readonly string[]).includes(freq)) {
    return freq as Frequency;
  }
  if (OUT_OF_SUBSET_FREQ.has(freq)) {
    throw new RRuleError(
      `FREQ=${freq} is outside the supported subset (${FREQUENCIES.join(', ')})`,
      'UNSUPPORTED',
    );
  }
  throw new RRuleError(`Invalid FREQ value "${value}"`, 'PARSE');
}

function parseByDay(value: string): ByDayItem[] {
  const tokens = value
    .split(',')
    .map((token) => token.trim().toUpperCase())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    throw new RRuleError('BYDAY has no weekday values', 'PARSE');
  }

  const items: ByDayItem[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const match = BYDAY_TOKEN.exec(token);
    const ordinalText = match?.[1];
    const weekdayText = match?.[2];
    if (weekdayText === undefined || !isWeekday(weekdayText)) {
      throw new RRuleError(`Invalid BYDAY value "${token}" (expected e.g. FR, 2TU, -1FR)`, 'PARSE');
    }
    let ordinal: number | undefined;
    if (ordinalText !== undefined) {
      ordinal = Number(ordinalText);
      if (!Number.isInteger(ordinal) || ordinal === 0 || Math.abs(ordinal) > 5) {
        throw new RRuleError(`Invalid BYDAY ordinal in "${token}" (expected 1..5 or -1..-5)`, 'PARSE');
      }
    }
    const key = `${ordinalText ?? ''}${weekdayText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(ordinal === undefined ? { weekday: weekdayText } : { weekday: weekdayText, ordinal });
  }
  return items;
}

function assertFreqByDayCombination(freq: Frequency, byDay: readonly ByDayItem[]): void {
  if (byDay.length === 0) return;
  if (freq === 'DAILY') {
    throw new RRuleError('BYDAY must not be combined with FREQ=DAILY (RFC 5545)', 'CONFLICT');
  }
  if (freq === 'WEEKLY' && byDay.some((item) => item.ordinal !== undefined)) {
    throw new RRuleError('BYDAY ordinals (e.g. 2TU) are not valid with FREQ=WEEKLY', 'CONFLICT');
  }
}

function parseWeekday(value: string, part: string): Weekday {
  const weekday = value.trim().toUpperCase();
  if (!isWeekday(weekday)) {
    throw new RRuleError(`Invalid ${part} value "${value}"`, 'PARSE');
  }
  return weekday;
}

function parsePositiveInt(value: string, part: string): number {
  if (!/^\d+$/.test(value)) {
    throw new RRuleError(`${part} must be a positive integer, got "${value}"`, 'PARSE');
  }
  return readPositiveInt(Number(value), part);
}

function readPositiveInt(value: number, part: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RRuleError(`${part} must be a positive integer, got ${String(value)}`, 'PARSE');
  }
  return value;
}
