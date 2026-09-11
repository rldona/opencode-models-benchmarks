/**
 * Parser/validator for the supported RRULE subset:
 * FREQ (DAILY | WEEKLY | MONTHLY), INTERVAL, BYDAY (with optional ordinal,
 * e.g. `2TU` / `-1FR`), COUNT, UNTIL.
 */

import { InvalidTimeZoneError, utcMs, type WallClock } from './timezone';

export const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type Freq = (typeof FREQUENCIES)[number];

/** Indexes match `Date#getUTCDay`, i.e. Sunday = 0. */
export const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export interface ByDaySpec {
  code: WeekdayCode;
  /** Position within the month: 1..5 or -1..-5. `null` means "every". */
  ordinal: number | null;
}

export type Until =
  | { kind: 'absolute'; instant: Date }
  | { kind: 'floating'; wall: WallClock };

export interface RRule {
  freq: Freq;
  interval: number;
  byDay: ByDaySpec[] | null;
  count: number | null;
  until: Until | null;
  /** Re-exported for callers that want to surface tolerated input. */
  warnings: string[];
}

export { InvalidTimeZoneError };

/** Thrown when a rule string / object is not a valid (supported) RRULE. */
export class RRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RRuleError';
  }
}

export interface RRuleInput {
  freq: Freq | string;
  interval?: number;
  byDay?: Array<string | { code?: WeekdayCode; weekday?: string; ordinal?: number | null }>;
  count?: number | null;
  until?: Date | string | number | null;
  /** `RRULE:` prefix is tolerated, so raw `UNTIL` values may be `Z` or bare. */
}

const WEEKDAY_INDEX: Record<string, number> = Object.fromEntries(
  WEEKDAY_CODES.map((code, index) => [code, index]),
);

/**
 * Accepts `20261231T235959Z` (UTC) or `20261231T235959` (floating local time),
 * plus anything `new Date()` understands when a `Z`/offset is present.
 */
export function parseRuleDate(value: string): Until {
  const compact = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(?:\.(\d{3}))?Z?)?$/i;
  const match = compact.exec(value.trim());
  if (match === null) {
    // Fall back to ISO-8601 with offset (e.g. "2026-12-31T23:59:59Z").
    const parsed = new Date(value.trim());
    if (Number.isNaN(parsed.getTime())) {
      throw new RRuleError(`Invalid UNTIL value "${value}" (expected YYYYMMDDTHHMMSS[Z]).`);
    }
    return { kind: 'absolute', instant: parsed };
  }
  const [, y, mo, d, hh = '00', mm = '00', ss = '00', fraction = '000'] = match;
  const wall: WallClock = {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(hh),
    minute: Number(mm),
    second: Number(ss),
    ms: Number(fraction),
  };
  if (/[zZ]$/.test(value.trim())) {
    const instant = new Date(
      utcMs(wall.year, wall.month, wall.day, wall.hour, wall.minute, wall.second, wall.ms),
    );
    if (Number.isNaN(instant.getTime())) {
      throw new RRuleError(`Invalid UNTIL value "${value}".`);
    }
    return { kind: 'absolute', instant };
  }
  return { kind: 'floating', wall };
}

export function parseByDayToken(token: string): ByDaySpec {
  const trimmed = token.trim().toUpperCase();
  const match = /^([+-]?\d*)(SU|MO|TU|WE|TH|FR|SA)$/.exec(trimmed);
  if (match === null) {
    throw new RRuleError(
      `Invalid BYDAY value "${token}". Expected MO|TU|WE|TH|FR|SA|SU with an optional ordinal such as 2TU or -1FR.`,
    );
  }
  const [, ordinalPart, code] = match;
  const weekdayCode = code as WeekdayCode;
  if (ordinalPart === '' || ordinalPart === undefined) {
    return { code: weekdayCode, ordinal: null };
  }
  const ordinal = Number(ordinalPart);
  if (!Number.isInteger(ordinal) || ordinal === 0 || Math.abs(ordinal) > 5) {
    throw new RRuleError(
      `Invalid BYDAY ordinal in "${token}": expected a non-zero integer between -5 and 5.`,
    );
  }
  return { code: weekdayCode, ordinal };
}

function normalizeByDay(
  value: Array<string | { code?: WeekdayCode; weekday?: string; ordinal?: number | null }>,
): ByDaySpec[] {
  return value.map((entry) => {
    if (typeof entry === 'string') return parseByDayToken(entry);
    const raw = entry.code ?? entry.weekday;
    if (raw === undefined) throw new RRuleError('BYDAY entry is missing its weekday code.');
    const spec = parseByDayToken(raw);
    const ordinal = entry.ordinal ?? null;
    if (ordinal === null) return spec;
    if (!Number.isInteger(ordinal) || ordinal === 0 || Math.abs(ordinal) > 5) {
      throw new RRuleError(`Invalid BYDAY ordinal ${ordinal}: expected -5..-1 or 1..5.`);
    }
    return { code: spec.code, ordinal };
  });
}

function normalizeInterval(value: number | undefined, warnings: string[]): number {
  if (value === undefined) return 1;
  if (!Number.isInteger(value) || value < 1) {
    throw new RRuleError(`Invalid INTERVAL ${value}: expected a positive integer.`);
  }
  if (value > 10_000) {
    warnings.push(`INTERVAL ${value} is unusually large.`);
  }
  return value;
}

/** Validates a rule object. */
export function normalizeRule(input: RRuleInput): RRule {
  const warnings: string[] = [];
  const freqRaw = typeof input.freq === 'string' ? input.freq.trim().toUpperCase() : input.freq;
  if (!(FREQUENCIES as readonly string[]).includes(freqRaw)) {
    throw new RRuleError(
      `Unsupported FREQ "${String(input.freq)}". Supported values: ${FREQUENCIES.join(', ')}.`,
    );
  }
  const freq = freqRaw as Freq;
  const interval = normalizeInterval(input.interval, warnings);

  let byDay: ByDaySpec[] | null = null;
  if (input.byDay !== undefined && input.byDay !== null) {
    if (input.byDay.length === 0) {
      throw new RRuleError('BYDAY must list at least one weekday.');
    }
    if (freq === 'DAILY') {
      throw new RRuleError('BYDAY is not supported with FREQ=DAILY.');
    }
    byDay = normalizeByDay(input.byDay);
    if (freq === 'WEEKLY' && byDay.some((spec) => spec.ordinal !== null)) {
      warnings.push('BYDAY ordinals are ignored with FREQ=WEEKLY.');
      byDay = byDay.map((spec) => ({ ...spec, ordinal: null }));
    }
    const seen = new Set<string>();
    for (const spec of byDay) {
      if (seen.has(spec.code)) {
        throw new RRuleError(`Duplicate BYDAY weekday "${spec.code}".`);
      }
      seen.add(spec.code);
    }
  }

  if (input.count !== undefined && input.count !== null) {
    if (!Number.isInteger(input.count) || input.count < 1) {
      throw new RRuleError(`Invalid COUNT ${input.count}: expected a positive integer.`);
    }
  }

  let until: Until | null = null;
  if (input.until !== undefined && input.until !== null) {
    if (input.count !== undefined && input.count !== null) {
      throw new RRuleError('COUNT and UNTIL are mutually exclusive.');
    }
    until =
      input.until instanceof Date || typeof input.until === 'number'
        ? { kind: 'absolute', instant: new Date(input.until) }
        : parseRuleDate(input.until);
  }

  return { freq, interval, byDay, count: input.count ?? null, until, warnings };
}

/** Parses an RRULE string such as `FREQ=WEEKLY;INTERVAL=2;BYDAY=2TU,-1FR;COUNT=4`. */
export function parseRRule(input: string): RRule {
  const trimmed = input.trim();
  if (trimmed === '') throw new RRuleError('RRULE must not be empty.');
  const withoutPrefix = /^RRULE:/i.test(trimmed) ? trimmed.slice('RRULE:'.length) : trimmed;
  const collected: Record<string, string[]> = {};
  for (const rawPart of withoutPrefix.split(';')) {
    const part = rawPart.trim();
    if (part === '') continue;
    const eq = part.indexOf('=');
    if (eq <= 0) throw new RRuleError(`Invalid RRULE part "${rawPart}" (expected KEY=VALUE).`);
    const key = part.slice(0, eq).trim().toUpperCase();
    const value = part.slice(eq + 1).trim();
    (collected[key] ??= []).push(value);
  }

  const supported = ['FREQ', 'INTERVAL', 'BYDAY', 'COUNT', 'UNTIL'];
  for (const key of Object.keys(collected)) {
    if (!supported.includes(key)) {
      throw new RRuleError(`Unsupported RRULE part "${key}". Supported: ${supported.join(', ')}.`);
    }
  }
  const single = (key: string): string | undefined => {
    const values = collected[key];
    if (values === undefined) return undefined;
    if (values.length > 1) throw new RRuleError(`RRULE part "${key}" must appear only once.`);
    const value = values[0];
    if (value === undefined || value === '') throw new RRuleError(`RRULE part "${key}" has no value.`);
    return value;
  };

  const freq = single('FREQ');
  if (freq === undefined) throw new RRuleError('RRULE is missing the required FREQ part.');
  const interval = single('INTERVAL');
  const count = single('COUNT');
  const until = single('UNTIL');
  const byDay = collected['BYDAY'];

  const asNumber = (key: string, raw: string | undefined): number | undefined => {
    if (raw === undefined) return undefined;
    if (!/^\d+$/.test(raw)) throw new RRuleError(`RRULE part ${key}="${raw}" must be a positive integer.`);
    return Number(raw);
  };

  return normalizeRule({
    freq,
    interval: asNumber('INTERVAL', interval),
    count: asNumber('COUNT', count),
    until: until,
    byDay: byDay === undefined ? undefined : byDay.flatMap((chunk) => chunk.split(',')),
  });
}

export function resolveRule(input: string | RRuleInput): RRule {
  return typeof input === 'string' ? parseRRule(input) : normalizeRule(input);
}

/** Weekday index (Mon = 1 ... Sun = 7) for a `WEEKDAY_CODES` entry. */
export function weekdayIndexOfCode(code: WeekdayCode): number {
  const jsDay = WEEKDAY_INDEX[code];
  if (jsDay === undefined) throw new RRuleError(`Unknown weekday code "${code}".`);
  return jsDay === 0 ? 7 : jsDay;
}
