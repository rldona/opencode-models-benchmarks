import { type RRule, type Freq, type DayOfWeek, type ByDayPart, DAY_ORDER } from './types.js';

export function parseRRule(input: string): RRule {
  let str = input.trim();
  if (str.toUpperCase().startsWith('RRULE:')) {
    str = str.slice(6);
  }

  const parts = str.split(';').filter(Boolean);
  const rule: Partial<RRule> = { interval: 1 };

  for (const part of parts) {
    const [rawKey, rawValue] = part.split('=');
    const key = rawKey.toUpperCase();
    const value = rawValue;

    switch (key) {
      case 'FREQ':
        rule.freq = parseFreq(value);
        break;
      case 'INTERVAL':
        rule.interval = parseInt(value, 10);
        if (rule.interval < 1) {
          throw new Error('INTERVAL must be >= 1');
        }
        break;
      case 'COUNT':
        rule.count = parseInt(value, 10);
        if (rule.count < 1) {
          throw new Error('COUNT must be >= 1');
        }
        break;
      case 'UNTIL':
        rule.until = parseUntil(value);
        break;
      case 'BYDAY':
        rule.byday = parseByDay(value);
        break;
      default:
        // Unknown properties are ignored for this subset.
        break;
    }
  }

  if (!rule.freq) {
    throw new Error('FREQ is required');
  }

  return rule as RRule;
}

function parseFreq(value: string): Freq {
  const upper = value.toUpperCase();
  if (upper !== 'DAILY' && upper !== 'WEEKLY' && upper !== 'MONTHLY') {
    throw new Error(`Unsupported FREQ: ${value}`);
  }
  return upper;
}

function parseUntil(value: string): Date {
  const upper = value.toUpperCase();
  // iCalendar format: YYYYMMDDTHHMMSS[Z]
  const m = upper.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) {
    throw new Error(`Invalid UNTIL value: ${value}`);
  }
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ? 'Z' : ''}`;
  return new Date(iso);
}

function parseByDay(value: string): ByDayPart[] {
  return value.split(',').map((part) => {
    const match = part.trim().match(/^(-?\d+)?([A-Z]{2})$/i);
    if (!match) {
      throw new Error(`Invalid BYDAY part: ${part}`);
    }
    const day = match[2].toUpperCase() as DayOfWeek;
    if (!DAY_ORDER.includes(day)) {
      throw new Error(`Invalid weekday: ${day}`);
    }
    return {
      pos: match[1] ? parseInt(match[1], 10) : undefined,
      day
    };
  });
}
