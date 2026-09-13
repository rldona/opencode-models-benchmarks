import { type Civil, MS_PER_DAY, civil, civilToUtcMs } from './civil';

export type AmbiguousPolicy = 'earlier' | 'later';
export type GapPolicy = 'forward' | 'backward';

const formatters = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  let formatter: Intl.DateTimeFormat;
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
    throw new Error(`Zona horaria desconocida: ${timeZone}`);
  }
  formatters.set(timeZone, formatter);
  return formatter;
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const part = parts.find((p) => p.type === type);
  if (!part) throw new Error(`Intl no devolvió la parte "${type}"`);
  return part.value;
}

export function assertTimeZone(timeZone: string): void {
  getFormatter(timeZone);
}

export function offsetMsAt(timeZone: string, instant: number): number {
  const parts = getFormatter(timeZone).formatToParts(new Date(instant));
  let hour = Number(partValue(parts, 'hour'));
  if (hour === 24) hour = 0;
  const year = Number(partValue(parts, 'year'));
  const month = Number(partValue(parts, 'month'));
  const day = Number(partValue(parts, 'day'));
  const minute = Number(partValue(parts, 'minute'));
  const second = Number(partValue(parts, 'second'));
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const wholeSecond = Math.floor(instant / 1000) * 1000;
  return asUtc - wholeSecond;
}

export function instantToCivil(instant: number, timeZone: string): Civil {
  const parts = getFormatter(timeZone).formatToParts(new Date(instant));
  let hour = Number(partValue(parts, 'hour'));
  if (hour === 24) hour = 0;
  return civil(
    Number(partValue(parts, 'year')),
    Number(partValue(parts, 'month')),
    Number(partValue(parts, 'day')),
    hour,
    Number(partValue(parts, 'minute')),
    Number(partValue(parts, 'second')),
    Math.floor(((instant % 1000) + 1000) % 1000),
  );
}

export interface ToInstantOptions {
  ambiguous?: AmbiguousPolicy;
  gap?: GapPolicy;
}

function uniqueOffsets(offsets: number[]): number[] {
  return [...new Set(offsets)];
}

export function civilToInstant(c: Civil, timeZone: string, options: ToInstantOptions = {}): number {
  const guess = civilToUtcMs(c);
  const candidates = uniqueOffsets([
    offsetMsAt(timeZone, guess - MS_PER_DAY),
    offsetMsAt(timeZone, guess),
    offsetMsAt(timeZone, guess + MS_PER_DAY),
  ]);

  const valid: number[] = [];
  for (const offset of candidates) {
    const instant = guess - offset;
    if (offsetMsAt(timeZone, instant) === offset) valid.push(instant);
  }

  if (valid.length === 1) return valid[0]!;

  if (valid.length > 1) {
    valid.sort((a, b) => a - b);
    return options.ambiguous === 'later' ? valid[valid.length - 1]! : valid[0]!;
  }

  const shifted = candidates.map((offset) => guess - offset).sort((a, b) => a - b);
  return options.gap === 'backward' ? shifted[0]! : shifted[shifted.length - 1]!;
}

export function formatInZone(instant: number | Date, timeZone: string): string {
  const ms = instant instanceof Date ? instant.getTime() : instant;
  const c = instantToCivil(ms, timeZone);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(c.year, 4)}-${pad(c.month)}-${pad(c.day)} ${pad(c.hour)}:${pad(c.minute)}:${pad(c.second)}`;
}
