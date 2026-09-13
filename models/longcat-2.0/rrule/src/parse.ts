import type { ByDay, Freq, RRule, Weekday } from './types';
import { weekdayToNum } from './timezone';

const VALID_FREQS: Freq[] = ['DAILY', 'WEEKLY', 'MONTHLY'];

function parseByDay(raw: string): ByDay {
  const match = raw.match(/^(-?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
  if (!match) throw new Error(`Invalid BYDAY value: ${raw}`);
  const pos = match[1] !== undefined ? parseInt(match[1], 10) : null;
  return { weekday: weekdayToNum(match[2] as Weekday), pos };
}

export function parseRRule(str: string): RRule {
  const parts = str.split(';').filter((p) => p.length > 0);
  const rule: RRule = { freq: 'DAILY', interval: 1 };

  for (const part of parts) {
    const [key, ...rest] = part.split('=');
    const value = rest.join('=');
    switch (key) {
      case 'FREQ':
        if (!VALID_FREQS.includes(value as Freq)) {
          throw new Error(`Invalid FREQ: ${value}`);
        }
        rule.freq = value as Freq;
        break;
      case 'INTERVAL':
        rule.interval = parseInt(value, 10);
        if (rule.interval < 1) throw new Error(`Invalid INTERVAL: ${value}`);
        break;
      case 'COUNT':
        rule.count = parseInt(value, 10);
        if (rule.count < 1) throw new Error(`Invalid COUNT: ${value}`);
        break;
      case 'UNTIL':
        rule.until = Date.parse(value);
        if (isNaN(rule.until)) throw new Error(`Invalid UNTIL: ${value}`);
        break;
      case 'BYDAY':
        rule.byday = value.split(',').map(parseByDay);
        break;
      default:
        throw new Error(`Unknown RRULE key: ${key}`);
    }
  }

  return rule;
}
