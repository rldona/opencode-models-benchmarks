import type { WallDateTime } from './types.js';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function assertValidTimeZone(timeZone: string): void {
  try {
    formatterFor(timeZone);
  } catch {
    throw new RangeError(`Zona horaria IANA no válida o no soportada: "${timeZone}"`);
  }
}

export function wallClockOf(instant: number, timeZone: string): WallDateTime {
  const parts = formatterFor(timeZone).formatToParts(instant);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;
  for (const part of parts) {
    switch (part.type) {
      case 'year':
        year = Number(part.value);
        break;
      case 'month':
        month = Number(part.value);
        break;
      case 'day':
        day = Number(part.value);
        break;
      case 'hour':
        hour = Number(part.value);
        break;
      case 'minute':
        minute = Number(part.value);
        break;
      case 'second':
        second = Number(part.value);
        break;
    }
  }
  return { year, month, day, hour, minute, second };
}

function utcOfWall(wall: WallDateTime): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
}

function sameWall(a: WallDateTime, b: WallDateTime): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second
  );
}

export function offsetMsAt(instant: number, timeZone: string): number {
  return utcOfWall(wallClockOf(instant, timeZone)) - instant;
}

function addSecondsToWall(wall: WallDateTime, seconds: number): WallDateTime {
  const d = new Date(utcOfWall(wall) + seconds * 1000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

export function localToInstant(wall: WallDateTime, timeZone: string): number {
  let current = wall;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const guess = utcOfWall(current);
    const offsets = new Set<number>();
    for (const probe of [guess - 86_400_000, guess, guess + 86_400_000]) {
      offsets.add(offsetMsAt(probe, timeZone));
    }
    const candidates: number[] = [];
    for (const offset of offsets) {
      const candidate = guess - offset;
      if (sameWall(wallClockOf(candidate, timeZone), current)) {
        candidates.push(candidate);
      }
    }
    if (candidates.length > 0) {
      return Math.min(...candidates);
    }
    const gapMs = Math.max(...offsets) - Math.min(...offsets);
    if (gapMs <= 0) {
      break;
    }
    current = addSecondsToWall(current, gapMs / 1000);
  }
  throw new RangeError(
    `No se pudo resolver la hora local ${wall.year}-${wall.month}-${wall.day} ` +
      `${wall.hour}:${wall.minute}:${wall.second} en ${timeZone}`
  );
}
