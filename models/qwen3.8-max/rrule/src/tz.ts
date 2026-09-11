import {
  HOUR_MS,
  assertCivilDate,
  pad,
  utcMs,
  weekdayOf,
} from './civil';
import { RRuleError } from './errors';
import type { DateInput, NonExistentLocalTimePolicy } from './types';

export interface ZonedFields {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
}

export interface ZonedParts extends ZonedFields {
  /** 0 = Monday .. 6 = Sunday. */
  readonly weekday: number;
}

export interface ZonedTimeResolution {
  /** The chosen instant (already shifted forward when the local time does not exist). */
  readonly instant: number;
  /** `false` when the local time falls inside a spring-forward DST gap. */
  readonly existed: boolean;
  /** `true` when the local time occurs twice (autumn fall-back). */
  readonly ambiguous: boolean;
  /** The actual local wall clock at `instant` (differs from the request when shifted). */
  readonly parts: ZonedParts;
}

const PROBE_SPAN_MS = 13 * HOUR_MS;
const formatters = new Map<string, Intl.DateTimeFormat>();
const canonicalZones = new Map<string, string>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      throw new RRuleError(`Unknown or unsupported IANA time zone: "${timeZone}"`, 'TIMEZONE');
    }
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Validates the zone and returns its canonical IANA name. */
export function canonicalTimeZone(timeZone: string): string {
  if (typeof timeZone !== 'string' || timeZone.length === 0) {
    throw new RRuleError('A non-empty IANA time zone name is required', 'TIMEZONE');
  }
  const cached = canonicalZones.get(timeZone);
  if (cached !== undefined) return cached;
  const resolved = formatterFor(timeZone).resolvedOptions().timeZone;
  canonicalZones.set(timeZone, resolved);
  return resolved;
}

export function assertValidTimeZone(timeZone: string): void {
  canonicalTimeZone(timeZone);
}

function readNumber(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const part = parts.find((candidate) => candidate.type === type);
  if (part === undefined) {
    throw new RRuleError(`Time zone formatting did not return a "${type}" field`, 'TIMEZONE');
  }
  const value = Number(part.value);
  return type === 'hour' && value === 24 ? 0 : value;
}

/** Wall-clock fields of an instant in a time zone. */
export function instantToZonedParts(timeZone: string, instant: number): ZonedParts {
  if (!Number.isFinite(instant)) {
    throw new RRuleError('Cannot convert a non-finite instant to local time', 'INPUT');
  }
  const parts = formatterFor(timeZone).formatToParts(new Date(instant));
  const year = readNumber(parts, 'year');
  const month = readNumber(parts, 'month');
  const day = readNumber(parts, 'day');
  const fields = {
    year,
    month,
    day,
    hour: readNumber(parts, 'hour'),
    minute: readNumber(parts, 'minute'),
    second: readNumber(parts, 'second'),
    millisecond: mod(Math.floor(instant), 1000),
  };
  return { ...fields, weekday: weekdayOf({ year, month, day }) };
}

/** UTC offset of a time zone at an instant, in milliseconds (negative west of UTC). */
export function getOffsetMs(timeZone: string, instant: number): number {
  return offsetMsFromParts(instant, instantToZonedParts(timeZone, instant));
}

function offsetMsFromParts(instant: number, parts: ZonedFields): number {
  const asUtc = utcMs(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export function getOffsetMinutes(timeZone: string, instant: number): number {
  return getOffsetMs(timeZone, instant) / 60_000;
}

function sameFields(actual: ZonedParts, expected: ZonedFields): boolean {
  return (
    actual.year === expected.year &&
    actual.month === expected.month &&
    actual.day === expected.day &&
    actual.hour === expected.hour &&
    actual.minute === expected.minute &&
    actual.second === expected.second &&
    actual.millisecond === expected.millisecond
  );
}

/**
 * Resolves a wall-clock time in a time zone to an instant.
 *
 * - ambiguous local time (occurs twice): the **earliest** instant is chosen;
 * - non-existent local time (DST gap): the instant is shifted forward by the gap size.
 */
export function resolveZonedTime(timeZone: string, fields: ZonedFields): ZonedTimeResolution {
  assertCivilDate(fields, 'Local date');
  assertTimeOfDay(fields);
  const guess = utcMs(
    fields.year,
    fields.month,
    fields.day,
    fields.hour,
    fields.minute,
    fields.second,
    fields.millisecond,
  );

  const offsets = new Set<number>();
  for (const probe of [guess, guess - PROBE_SPAN_MS, guess + PROBE_SPAN_MS]) {
    offsets.add(getOffsetMs(timeZone, probe));
  }

  const valid: number[] = [];
  for (const offset of offsets) {
    const candidate = guess - offset;
    if (sameFields(instantToZonedParts(timeZone, candidate), fields)) valid.push(candidate);
  }

  if (valid.length > 0) {
    const instant = Math.min(...valid);
    return {
      instant,
      existed: true,
      ambiguous: valid.length > 1,
      parts: instantToZonedParts(timeZone, instant),
    };
  }

  // Inside a DST gap: using the pre-transition (smallest) offset pushes the wall clock
  // forward by exactly the size of the gap.
  const instant = guess - Math.min(...offsets);
  return {
    instant,
    existed: false,
    ambiguous: false,
    parts: instantToZonedParts(timeZone, instant),
  };
}

/**
 * Wall-clock time in a time zone as an instant, or `null` when the local time does not
 * exist and `policy` is `skip`.
 */
export function zonedTimeToInstant(
  timeZone: string,
  fields: ZonedFields,
  policy: NonExistentLocalTimePolicy = 'shift',
): number | null {
  const resolved = resolveZonedTime(timeZone, fields);
  if (resolved.existed) return resolved.instant;
  return policy === 'skip' ? null : resolved.instant;
}

export function formatZonedDateTime(timeZone: string, instant: number): string {
  const parts = instantToZonedParts(timeZone, instant);
  return `${civilDateOf(parts)}T${formatTime(parts)}`;
}

export function formatZonedDate(timeZone: string, instant: number): string {
  return civilDateOf(instantToZonedParts(timeZone, instant));
}

export function formatZonedTime(timeZone: string, instant: number): string {
  return formatTime(instantToZonedParts(timeZone, instant));
}

export interface ZonedDescription {
  readonly localDateTime: string;
  readonly localDate: string;
  readonly localTime: string;
  readonly offsetMinutes: number;
}

/** Local wall-clock description of an instant, computed with a single formatter pass. */
export function describeInstant(timeZone: string, instant: number): ZonedDescription {
  const parts = instantToZonedParts(timeZone, instant);
  return {
    localDateTime: `${civilDateOf(parts)}T${formatTime(parts)}`,
    localDate: civilDateOf(parts),
    localTime: formatTime(parts),
    offsetMinutes: offsetMsFromParts(instant, parts) / 60_000,
  };
}

function civilDateOf(parts: ZonedFields): string {
  return `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`;
}

function formatTime(parts: ZonedFields): string {
  const base = `${pad(parts.hour, 2)}:${pad(parts.minute, 2)}:${pad(parts.second, 2)}`;
  return parts.millisecond === 0 ? base : `${base}.${pad(parts.millisecond, 3)}`;
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function assertTimeOfDay(fields: {
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}): void {
  const { hour, minute, second, millisecond } = fields;
  const valid =
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    Number.isInteger(second) &&
    Number.isInteger(millisecond) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59 &&
    millisecond >= 0 &&
    millisecond <= 999;
  if (!valid) {
    throw new RRuleError(
      `Invalid time of day "${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}"`,
      'INPUT',
    );
  }
}

interface ParsedDateTimeString {
  readonly fields: ZonedFields;
  /** `null` for floating (zone-less) values. */
  readonly offsetMs: number | null;
}

const EXTENDED_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;
const BASIC_PATTERN =
  /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(?:(\d{2})(?:[.,](\d{1,9}))?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i;

function parseOffset(designator: string): number {
  if (designator.toUpperCase() === 'Z') return 0;
  const sign = designator.startsWith('-') ? -1 : 1;
  const digits = designator.slice(1).replace(':', '');
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4));
  if (hours > 23 || minutes > 59) {
    throw new RRuleError(`Invalid UTC offset "${designator}"`, 'INPUT');
  }
  return sign * (hours * 60 + minutes) * 60_000;
}

function parseFraction(fraction: string | undefined): number {
  if (fraction === undefined) return 0;
  return Number(fraction.slice(0, 3).padEnd(3, '0'));
}

export function parseDateTimeString(value: string): ParsedDateTimeString {
  const text = value.trim();
  const match = EXTENDED_PATTERN.exec(text) ?? BASIC_PATTERN.exec(text);
  if (match === null) {
    throw new RRuleError(`Unrecognised date/time value: "${value}"`, 'INPUT');
  }
  const [, year, month, day, hour, minute, second, fraction, designator] = match;
  const fields = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour ?? 0),
    minute: Number(minute ?? 0),
    second: Number(second ?? 0),
    millisecond: parseFraction(fraction),
  };
  assertCivilDate(fields, `Date "${text}"`);
  assertTimeOfDay(fields);
  return { fields, offsetMs: designator === undefined ? null : parseOffset(designator) };
}

/**
 * Converts user input to epoch milliseconds.
 *
 * Strings carrying a UTC designator (`Z` or `±hh:mm`) are absolute instants.
 * Zone-less strings are wall-clock values: they are resolved in `timeZone` when one is
 * given, otherwise they are read as UTC. `Date` objects and numbers (epoch ms) are
 * absolute instants.
 */
export function toInstantMs(value: DateInput, timeZone?: string): number {
  if (value instanceof Date) {
    const instant = value.getTime();
    if (Number.isNaN(instant)) throw new RRuleError('Invalid Date instance', 'INPUT');
    return instant;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RRuleError('Invalid numeric instant', 'INPUT');
    return Math.floor(value);
  }
  if (typeof value !== 'string') {
    throw new RRuleError(`Unsupported date input: ${String(value)}`, 'INPUT');
  }
  const parsed = parseDateTimeString(value);
  if (parsed.offsetMs !== null) {
    const { fields } = parsed;
    return (
      utcMs(
        fields.year,
        fields.month,
        fields.day,
        fields.hour,
        fields.minute,
        fields.second,
        fields.millisecond,
      ) - parsed.offsetMs
    );
  }
  if (timeZone === undefined) {
    const { fields } = parsed;
    return utcMs(
      fields.year,
      fields.month,
      fields.day,
      fields.hour,
      fields.minute,
      fields.second,
      fields.millisecond,
    );
  }
  // Range bounds and DTSTART always resolve to an instant, even inside a DST gap.
  return resolveZonedTime(timeZone, parsed.fields).instant;
}
