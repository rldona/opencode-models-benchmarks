import { FreqType, Weekday, ByDayEntry, ParsedRRule } from './types.js';

const WEEKDAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export function parseRRule(rruleString: string): ParsedRRule {
  const parts = rruleString.split(';');
  const result: ParsedRRule = {
    freq: 'DAILY',
    interval: 1,
    byDay: [],
  };

  for (const part of parts) {
    const [key, value] = part.split('=');

    switch (key) {
      case 'FREQ':
        if (value !== 'DAILY' && value !== 'WEEKLY' && value !== 'MONTHLY') {
          throw new Error(`Unsupported FREQ: ${value}`);
        }
        result.freq = value as FreqType;
        break;

      case 'INTERVAL':
        result.interval = parseInt(value, 10);
        if (result.interval < 1) {
          throw new Error('INTERVAL must be at least 1');
        }
        break;

      case 'BYDAY':
        result.byDay = parseByDay(value);
        break;

      case 'COUNT':
        result.count = parseInt(value, 10);
        if (result.count < 1) {
          throw new Error('COUNT must be at least 1');
        }
        break;

      case 'UNTIL':
        result.until = parseUntil(value);
        break;
    }
  }

  return result;
}

function parseByDay(value: string): ByDayEntry[] {
  if (!value) return [];

  return value.split(',').map((entry) => {
    const match = entry.match(/^(-?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/);
    if (!match) {
      throw new Error(`Invalid BYDAY entry: ${entry}`);
    }
    return {
      position: match[1] ? parseInt(match[1], 10) : undefined,
      day: match[2] as Weekday,
    };
  });
}

function parseUntil(value: string): Date {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!match) {
    throw new Error(`Invalid UNTIL format: ${value}`);
  }
  return new Date(Date.UTC(
    parseInt(match[1], 10),
    parseInt(match[2], 10) - 1,
    parseInt(match[3], 10),
    parseInt(match[4], 10),
    parseInt(match[5], 10),
    parseInt(match[6], 10)
  ));
}

export function getWeekdayIndex(day: Weekday): number {
  const index = WEEKDAYS.indexOf(day);
  if (index === -1) throw new Error(`Unknown weekday: ${day}`);
  return index;
}
