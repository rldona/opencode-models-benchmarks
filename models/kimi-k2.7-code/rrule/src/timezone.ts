import { type LocalParts } from './types.js';

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(tzid: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(tzid);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tzid,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    });
    formatterCache.set(tzid, fmt);
  }
  return fmt;
}

export function getParts(timestamp: number, tzid: string): LocalParts {
  const fmt = getFormatter(tzid);
  const d = new Date(timestamp);
  const parts = fmt.formatToParts(d);

  const extract = (type: string) => {
    const p = parts.find((x) => x.type === type);
    if (!p) throw new Error(`Missing ${type} from DateTimeFormat parts`);
    return parseInt(p.value, 10);
  };

  return {
    year: extract('year'),
    month: extract('month'),
    day: extract('day'),
    hour: extract('hour') === 24 ? 0 : extract('hour'),
    minute: extract('minute'),
    second: extract('second')
  };
}

/**
 * Convert local date-time parts in a given IANA timezone to a UTC timestamp.
 * Iteratively corrects the timestamp until the local parts match.
 */
export function partsToUtc(parts: LocalParts, tzid: string): number {
  const targetNaive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let timestamp = targetNaive;

  for (let i = 0; i < 5; i++) {
    const local = getParts(timestamp, tzid);
    const actualNaive = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    const diff = targetNaive - actualNaive;
    if (diff === 0) {
      return timestamp;
    }
    timestamp += diff;
  }

  return timestamp;
}

export function parseLocalDateTime(iso: string): LocalParts {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) {
    throw new Error(`Expected local date-time format YYYY-MM-DDTHH:mm:ss, got: ${iso}`);
  }
  return {
    year: parseInt(m[1], 10),
    month: parseInt(m[2], 10),
    day: parseInt(m[3], 10),
    hour: parseInt(m[4], 10),
    minute: parseInt(m[5], 10),
    second: parseInt(m[6], 10)
  };
}

export function addDays(parts: LocalParts, days: number): LocalParts {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  d.setUTCDate(d.getUTCDate() + days);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

export function addMonths(parts: LocalParts, months: number): LocalParts {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, 1, 12, 0, 0));
  d.setUTCMonth(d.getUTCMonth() + months);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isoLocal(parts: LocalParts): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}
