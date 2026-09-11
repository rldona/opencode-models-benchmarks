export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    });
    formatters.set(timeZone, fmt);
  }
  return fmt;
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const map: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function offsetMs(ms: number, timeZone: string): number {
  const parts = getZonedParts(new Date(ms), timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - ms;
}

function matches(
  parts: ZonedParts,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean {
  return (
    parts.year === year &&
    parts.month === month &&
    parts.day === day &&
    parts.hour === hour &&
    parts.minute === minute &&
    parts.second === second
  );
}

export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date | null {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = utcGuess - offsetMs(utcGuess, timeZone);
  instant = utcGuess - offsetMs(instant, timeZone);

  const candidates = [instant, instant - 3600000, instant + 3600000];
  for (const ms of candidates) {
    if (matches(getZonedParts(new Date(ms), timeZone), year, month, day, hour, minute, second)) {
      return new Date(ms);
    }
  }
  return null;
}
