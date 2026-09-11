import { Frequency, ParsedRRule, Weekday, WeekdayPosition } from './types.js';

const WEEKDAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

function parseByDay(value: string): WeekdayPosition[] {
  return value.split(',').map(item => {
    const match = item.match(/^(-?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/);
    if (!match) {
      throw new Error(`Invalid BYDAY value: ${item}`);
    }
    const position = match[1] ? Number(match[1]) : undefined;
    const weekday = match[2] as Weekday;
    return { weekday, position };
  });
}

export function parseRRule(input: string): ParsedRRule {
  const parts = input.split(';');
  let freq: Frequency | undefined;
  let interval = 1;
  let byDay: WeekdayPosition[] | undefined;
  let count: number | undefined;
  let until: Date | undefined;

  for (const part of parts) {
    const [key, value] = part.split('=');
    switch (key) {
      case 'FREQ':
        if (value === 'DAILY' || value === 'WEEKLY' || value === 'MONTHLY') {
          freq = value;
        } else {
          throw new Error(`Invalid FREQ value: ${value}`);
        }
        break;
      case 'INTERVAL':
        interval = Number(value);
        if (interval < 1) throw new Error('INTERVAL must be >= 1');
        break;
      case 'BYDAY':
        byDay = parseByDay(value);
        break;
      case 'COUNT':
        count = Number(value);
        if (count < 1) throw new Error('COUNT must be >= 1');
        break;
      case 'UNTIL':
        until = parseUntil(value);
        break;
    }
  }

  if (!freq) {
    throw new Error('FREQ is required');
  }

  return { freq, interval, byDay, count, until };
}

function parseUntil(value: string): Date {
  // Format: YYYYMMDD or YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!match) {
    throw new Error(`Invalid UNTIL value: ${value}`);
  }
  const [, year, month, day, hour, minute, second, utc] = match;
  
  // If no time component (just date), treat as end of day (23:59:59.999) for inclusive behavior
  if (!hour && !minute && !second) {
    if (utc) {
      return new Date(Date.UTC(
        Number(year), Number(month) - 1, Number(day),
        23, 59, 59, 999
      ));
    }
    return new Date(
      Number(year), Number(month) - 1, Number(day),
      23, 59, 59, 999
    );
  }
  
  if (utc) {
    return new Date(Date.UTC(
      Number(year), Number(month) - 1, Number(day),
      Number(hour ?? '0'), Number(minute ?? '0'), Number(second ?? '0')
    ));
  }
  return new Date(
    Number(year), Number(month) - 1, Number(day),
    Number(hour ?? '0'), Number(minute ?? '0'), Number(second ?? '0')
  );
}
