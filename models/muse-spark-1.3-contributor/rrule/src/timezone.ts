/**
 * Utilidades de zona horaria IANA usando solo la API `Intl` estándar.
 * Estrategia: iterar en "wall-clock" local y convertir a UTC,
 * para que la hora local se preserve aunque haya cambio DST.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
  millisecond: number; // 0-999
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  formatterCache.set(timeZone, fmt);
  return fmt;
}

export function validateTimeZone(timeZone: string): void {
  try {
    getFormatter(timeZone);
    // Forzar que lance si la zona es inválida.
    getFormatter(timeZone).format(new Date(0));
  } catch {
    throw new Error(`Invalid IANA time zone: ${timeZone}`);
  }
  // Comprobación extra: Intl acepta cualquier string en algunas versiones
  // sin lanzar hasta formatear; si no lanza, verificamos con supportedValuesOf.
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    if (supported && !supported.includes(timeZone)) {
      throw new Error(`Invalid IANA time zone: ${timeZone}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Invalid IANA time zone")) {
      throw e;
    }
    // Si supportedValuesOf no existe, ignorar.
  }
}

/** Offset en ms tal que local = UTC + offset. */
export function getTimeZoneOffsetMs(timeZone: string, utcMs: number): number {
  const parts = utcToZonedParts(timeZone, utcMs);
  const wallAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  return wallAsUtc - utcMs;
}

export function utcToZonedParts(timeZone: string, utcMs: number): ZonedParts {
  const fmt = getFormatter(timeZone);
  const partList = fmt.formatToParts(new Date(utcMs));
  const get = (type: string): string => {
    const found = partList.find((p) => p.type === type);
    if (!found) throw new Error(`Missing ${type} part for time zone conversion`);
    return found.value;
  };
  let hour = Number(get("hour"));
  // Defensa: algunos motores devuelven "24" para medianoche.
  if (hour === 24) hour = 0;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
    millisecond: new Date(utcMs).getUTCMilliseconds(),
  };
}

function partsEqual(a: ZonedParts, b: ZonedParts): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second &&
    a.millisecond === b.millisecond
  );
}

function wallAsUtcMs(p: ZonedParts): number {
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, p.millisecond);
}

/** Intenta convertir un wall-time a UTC con un offset inicial dado. Devuelve null si no hay round-trip exacto (gap). */
function tryConvertWithInitialOffset(
  timeZone: string,
  parts: ZonedParts,
  initialOffsetMs: number,
): number | null {
  const wall = wallAsUtcMs(parts);
  let offset = initialOffsetMs;
  let utc = wall - offset;
  for (let i = 0; i < 3; i++) {
    const next = getTimeZoneOffsetMs(timeZone, utc);
    if (next === offset) break;
    offset = next;
    utc = wall - offset;
  }
  // Verificación round-trip (sin ms para evitar ruido, luego con ms).
  const back = utcToZonedParts(timeZone, utc);
  if (partsEqual(back, parts)) return utc;
  return null;
}

/**
 * Convierte un wall-time local (en `timeZone`) a instante UTC (ms).
 * - Hora ambigua (repetición otoño): devuelve la PRIMERA ocurrencia.
 * - Hora inexistente (salto primavera): avanza a la primera hora válida posterior.
 */
export function zonedTimeToUtc(timeZone: string, parts: ZonedParts): number {
  const wall = wallAsUtcMs(parts);

  const offsetsToTry = new Set<number>();
  // Muestrear antes/después para capturar ambos lados de una transición.
  offsetsToTry.add(getTimeZoneOffsetMs(timeZone, wall - 12 * 3600_000));
  offsetsToTry.add(getTimeZoneOffsetMs(timeZone, wall + 12 * 3600_000));
  offsetsToTry.add(getTimeZoneOffsetMs(timeZone, wall));

  const candidates: number[] = [];
  for (const off of offsetsToTry) {
    const utc = tryConvertWithInitialOffset(timeZone, parts, off);
    if (utc !== null) candidates.push(utc);
  }
  if (candidates.length > 0) {
    // Primera ocurrencia ante ambigüedad.
    return Math.min(...candidates);
  }

  // Gap (hora inexistente): avanzar minuto a minuto hasta encontrar hora válida.
  // El wall + N minutos en aritmética UTC equivale a sumar N minutos civiles.
  for (let addMin = 1; addMin <= 4 * 60; addMin++) {
    const shiftedWallMs = wall + addMin * 60_000;
    const shifted = new Date(shiftedWallMs);
    const shiftedParts: ZonedParts = {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds(),
      millisecond: shifted.getUTCMilliseconds(),
    };
    // Reintentar conversión del wall desplazado.
    const wall2 = wallAsUtcMs(shiftedParts);
    const offs = new Set<number>();
    offs.add(getTimeZoneOffsetMs(timeZone, wall2 - 12 * 3600_000));
    offs.add(getTimeZoneOffsetMs(timeZone, wall2 + 12 * 3600_000));
    offs.add(getTimeZoneOffsetMs(timeZone, wall2));
    for (const off of offs) {
      const utc = tryConvertWithInitialOffset(timeZone, shiftedParts, off);
      if (utc !== null) return utc;
    }
  }
  throw new Error("Unable to resolve local time to UTC (gap too large?)");
}
