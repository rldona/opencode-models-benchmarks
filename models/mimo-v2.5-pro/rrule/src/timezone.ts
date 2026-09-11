export interface TimeZoneParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      fractionalSecondDigits: 3,
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

export function dateToParts(date: Date, timeZone: string): TimeZoneParts {
  const fmt = getFormatter(timeZone);
  const parts = fmt.formatToParts(date);
  const map = new Map(parts.map(p => [p.type, p.value]));
  return {
    year: Number(map.get('year')),
    month: Number(map.get('month')),
    day: Number(map.get('day')),
    hour: Number(map.get('hour')),
    minute: Number(map.get('minute')),
    second: Number(map.get('second')),
    millisecond: Number(map.get('fractionalSecond') ?? '0'),
  };
}

export function partsToDate(parts: TimeZoneParts, timeZone: string): Date {
  const { year, month, day, hour, minute, second, millisecond } = parts;
  
  // Start with a UTC guess, then adjust
  // We'll use a binary search approach to find the UTC time that corresponds to these local parts
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  
  // Check what the guess maps to in the target timezone
  const guessParts = dateToParts(new Date(guess), timeZone);
  const guessLocal = Date.UTC(
    guessParts.year, guessParts.month - 1, guessParts.day,
    guessParts.hour, guessParts.minute, guessParts.second, guessParts.millisecond
  );
  
  // Calculate offset
  const offset = guessLocal - guess;
  
  // Apply offset and verify
  const candidate = new Date(guess - offset);
  const candidateParts = dateToParts(candidate, timeZone);
  
  // Verify the candidate matches our desired parts
  if (
    candidateParts.year === year &&
    candidateParts.month === month &&
    candidateParts.day === day &&
    candidateParts.hour === hour &&
    candidateParts.minute === minute &&
    candidateParts.second === second
  ) {
    return candidate;
  }
  
  // If there's a DST transition, we might be in a gap or overlap
  // Try adjusting by ±1 hour
  for (const adjust of [3600000, -3600000]) {
    const adjusted = new Date(candidate.getTime() + adjust);
    const adjustedParts = dateToParts(adjusted, timeZone);
    if (
      adjustedParts.year === year &&
      adjustedParts.month === month &&
      adjustedParts.day === day &&
      adjustedParts.hour === hour &&
      adjustedParts.minute === minute &&
      adjustedParts.second === second
    ) {
      return adjusted;
    }
  }
  
  // Return the best guess
  return candidate;
}

export function addDays(date: Date, days: number, timeZone: string): Date {
  const parts = dateToParts(date, timeZone);
  const newParts: TimeZoneParts = {
    ...parts,
    day: parts.day + days,
  };
  return partsToDate(newParts, timeZone);
}

export function addMonths(date: Date, months: number, timeZone: string): Date {
  const parts = dateToParts(date, timeZone);
  let newMonth = parts.month + months;
  let newYear = parts.year;
  
  while (newMonth > 12) {
    newMonth -= 12;
    newYear++;
  }
  while (newMonth < 1) {
    newMonth += 12;
    newYear--;
  }
  
  // Clamp day to last day of month
  const maxDay = getDaysInMonth(newYear, newMonth);
  const newDay = Math.min(parts.day, maxDay);
  
  return partsToDate({
    ...parts,
    year: newYear,
    month: newMonth,
    day: newDay,
  }, timeZone);
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getWeekday(date: Date, timeZone: string): number {
  const parts = dateToParts(date, timeZone);
  // Create a date in UTC to get the day of week
  const utcDate = Date.UTC(parts.year, parts.month - 1, parts.day);
  return new Date(utcDate).getUTCDay(); // 0=Sun, 1=Mon, ...
}

export const WEEKDAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};
