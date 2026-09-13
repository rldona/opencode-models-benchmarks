import type { ByDayEntry, Frequency, RRule, Weekday } from './types.js';
import { WEEKDAYS } from './types.js';

const FREQS: readonly Frequency[] = ['DAILY', 'WEEKLY', 'MONTHLY'];

function isFreq(v: string): v is Frequency {
  return (FREQS as readonly string[]).includes(v);
}

function isWeekday(v: string): v is Weekday {
  return (WEEKDAYS as readonly string[]).includes(v);
}

function parseByDayToken(token: string): ByDayEntry {
  const m = /^([+-]?\d+)?([A-Z]{2})$/.exec(token);
  if (!m) {
    throw new Error(`Invalid BYDAY token: "${token}"`);
  }
  const [, posStr, wd] = m;
  if (!isWeekday(wd)) {
    throw new Error(`Invalid weekday in BYDAY: "${wd}"`);
  }
  const entry: ByDayEntry = { weekday: wd };
  if (posStr !== undefined && posStr !== '') {
    const pos = parseInt(posStr, 10);
    if (!Number.isInteger(pos) || pos === 0 || pos > 4 || pos < -4) {
      throw new Error(`Invalid BYDAY position: "${posStr}"`);
    }
    entry.pos = pos;
  }
  return entry;
}

function parseByDay(value: string): ByDayEntry[] {
  return value.split(',').map((s) => parseByDayToken(s.trim()));
}

function parseUntil(value: string): Date {
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)));
  }
  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (dateTime) {
    const [, y, mo, d, h, mi, s, z] = dateTime;
    if (z === 'Z') {
      return new Date(Date.UTC(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10), parseInt(h, 10), parseInt(mi, 10), parseInt(s, 10)));
    }
    return new Date(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10), parseInt(h, 10), parseInt(mi, 10), parseInt(s, 10));
  }
  throw new Error(`Invalid UNTIL value: "${value}"`);
}

export function parseRRule(input: string): RRule {
  if (input.startsWith('RRULE:')) {
    input = input.slice('RRULE:'.length);
  }
  const parts = input.split(';');
  const rule: RRule = { freq: 'DAILY' };
  let freqSet = false;

  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq <= 0) {
      throw new Error(`Invalid RRULE part: "${part}"`);
    }
    const key = part.slice(0, eq).toUpperCase();
    const value = part.slice(eq + 1);

    switch (key) {
      case 'FREQ': {
        if (!isFreq(value)) {
          throw new Error(`Unsupported FREQ: "${value}"`);
        }
        rule.freq = value;
        freqSet = true;
        break;
      }
      case 'INTERVAL': {
        const n = parseInt(value, 10);
        if (!Number.isInteger(n) || n < 1) {
          throw new Error(`Invalid INTERVAL: "${value}"`);
        }
        rule.interval = n;
        break;
      }
      case 'BYDAY': {
        rule.byday = parseByDay(value);
        break;
      }
      case 'COUNT': {
        const n = parseInt(value, 10);
        if (!Number.isInteger(n) || n < 1) {
          throw new Error(`Invalid COUNT: "${value}"`);
        }
        rule.count = n;
        break;
      }
      case 'UNTIL': {
        rule.until = parseUntil(value);
        break;
      }
      default:
        throw new Error(`Unsupported RRULE key: "${key}"`);
    }
  }

  if (!freqSet) {
    throw new Error('RRULE missing FREQ');
  }
  return rule;
}
