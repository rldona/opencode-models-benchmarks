export interface ZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const ZONE_PART_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = ZONE_PART_FORMATTER_CACHE.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    ZONE_PART_FORMATTER_CACHE.set(timeZone, f);
  }
  return f;
}

export function getZoneParts(date: Date, timeZone: string): ZoneParts {
  const parts = getFormatter(timeZone).formatToParts(date);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;
  for (const p of parts) {
    switch (p.type) {
      case 'year':
        year = parseInt(p.value, 10);
        break;
      case 'month':
        month = parseInt(p.value, 10);
        break;
      case 'day':
        day = parseInt(p.value, 10);
        break;
      case 'hour':
        hour = parseInt(p.value, 10);
        if (hour === 24) hour = 0;
        break;
      case 'minute':
        minute = parseInt(p.value, 10);
        break;
      case 'second':
        second = parseInt(p.value, 10);
        break;
    }
  }
  return { year, month, day, hour, minute, second };
}

export function getZoneOffsetMs(date: Date, timeZone: string): number {
  const p = getZoneParts(date, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - date.getTime();
}

export function zonedWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = target;
  for (let i = 0; i < 4; i++) {
    const parts = getZoneParts(new Date(utc), timeZone);
    const actual = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    if (actual === target) break;
    utc = utc + (target - actual);
  }
  return new Date(utc);
}
