export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(tz: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(tz, fmt);
  }
  return fmt;
}

export function utcToWall(tz: string, utcMs: number): WallTime {
  const parts = getFormatter(tz).formatToParts(new Date(utcMs));
  const values: Record<string, string> = {};
  for (const { type, value } of parts) values[type] = value;
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour ?? 0),
    minute: Number(values.minute ?? 0),
    second: Number(values.second ?? 0),
    millisecond: new Date(utcMs).getUTCMilliseconds(),
  };
}

/**
 * Converts a wall-clock time in the given IANA timezone to a UTC instant.
 * Handles DST transitions (spring-forward / fall-back). Ambiguous local
 * times (during fall-back overlap) resolve to the first occurrence.
 */
export function wallTimeToUtc(
  tz: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
  millisecond = 0,
): number {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);

  for (let i = 0; i < 2; i++) {
    const wall = utcToWall(tz, guess);
    const asUtc = Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
      wall.second,
      wall.millisecond,
    );
    const offset = asUtc - guess;
    guess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offset;
  }

  const check = utcToWall(tz, guess);
  if (
    check.year !== year ||
    check.month !== month ||
    check.day !== day ||
    check.hour !== hour ||
    check.minute !== minute ||
    check.second !== second
  ) {
    const fmt = getFormatter(tz);
    const offsetMs =
      Date.UTC(check.year, check.month - 1, check.day, check.hour, check.minute, check.second) -
      guess;
    throw new Error(
      `Local time ${year}-${month}-${day}T${hour}:${minute} does not exist in timezone ${tz} (offset would be ${offsetMs}ms). Nearest: ${fmt.format(new Date(guess))}`,
    );
  }
  return guess;
}

export function getWallParts(tz: string, utcMs: number): number[] {
  const w = utcToWall(tz, utcMs);
  return [w.year, w.month, w.day, w.hour, w.minute, w.second];
}
