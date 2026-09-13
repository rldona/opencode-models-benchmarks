import { parseRRule } from "./rrule.js";
import { utcToZonedParts, validateTimeZone, zonedTimeToUtc } from "./timezone.js";
import type { ZonedParts } from "./timezone.js";

export interface ExpandOptions {
  /** Instante DTSTART (Date, ISO string o ms UTC). */
  start: string | Date | number;
  /** Regla RRULE del subconjunto soportado. */
  rrule: string;
  /** Zona IANA, p.ej. "Europe/Madrid". */
  timeZone: string;
  /** Filtro inferior inclusivo. */
  rangeStart: string | Date | number;
  /** Filtro superior exclusivo. */
  rangeEnd: string | Date | number;
}

export function toUtcMs(v: string | Date | number, name: string): number {
  if (v instanceof Date) {
    const t = v.getTime();
    if (Number.isNaN(t)) throw new Error(`Invalid ${name} Date`);
    return t;
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`Invalid ${name}`);
    return Math.trunc(v);
  }
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new Error(`Invalid ${name}: ${v}`);
  return t;
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/** 0=Dom .. 6=Sáb. */
export function civilWeekday(year: number, month1to12: number, day: number): number {
  return new Date(Date.UTC(year, month1to12 - 1, day)).getUTCDay();
}

export interface CivilDate {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

export function addDaysCivil(date: CivilDate, n: number): CivilDate {
  const ms = Date.UTC(date.y, date.m - 1, date.d) + n * 86_400_000;
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function addMonthsCivil(year: number, month1to12: number, delta: number): { y: number; m: number } {
  const total = year * 12 + (month1to12 - 1) + delta;
  const norm = ((total % 12) + 12) % 12;
  return { y: Math.floor(total / 12), m: norm + 1 };
}

/** Lunes civil de la semana que contiene a `date` (semana Lun-Dom). */
export function mondayOfWeek(date: CivilDate): CivilDate {
  const wd = civilWeekday(date.y, date.m, date.d); // 0=Dom
  const offsetFromMonday = (wd + 6) % 7; // Lun=0 .. Dom=6
  return addDaysCivil(date, -offsetFromMonday);
}

function monthDatesForMonthly(
  y: number,
  m: number,
  startDay: number,
  byday: { weekday: number; ordinal?: number }[],
): CivilDate[] {
  if (byday.length === 0) {
    const dim = daysInMonth(y, m);
    if (startDay < 1 || startDay > dim) return []; // mes sin ese día (p.ej. 31 feb) -> saltar
    return [{ y, m, d: startDay }];
  }
  const dim = daysInMonth(y, m);
  const out: CivilDate[] = [];
  const seen = new Set<number>();
  for (const entry of byday) {
    if (entry.ordinal === undefined) {
      for (let d = 1; d <= dim; d++) {
        if (civilWeekday(y, m, d) === entry.weekday) {
          if (!seen.has(d)) {
            seen.add(d);
            out.push({ y, m, d });
          }
        }
      }
    } else {
      const n = entry.ordinal;
      let d: number | null = null;
      if (n > 0) {
        // Primer `weekday` del mes.
        let first = -1;
        for (let dd = 1; dd <= 7; dd++) {
          if (civilWeekday(y, m, dd) === entry.weekday) {
            first = dd;
            break;
          }
        }
        if (first !== -1) {
          const cand = first + (n - 1) * 7;
          if (cand >= 1 && cand <= dim) d = cand;
        }
      } else {
        // Último `weekday` del mes hacia atrás.
        let last = -1;
        for (let dd = dim; dd > dim - 7; dd--) {
          if (civilWeekday(y, m, dd) === entry.weekday) {
            last = dd;
            break;
          }
        }
        if (last !== -1) {
          const cand = last + (n + 1) * 7;
          if (cand >= 1 && cand <= dim) d = cand;
        }
      }
      if (d !== null && !seen.has(d)) {
        seen.add(d);
        out.push({ y, m, d });
      }
    }
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

const MAX_PERIODS = 100_000;
const MAX_CANDIDATES = 200_000;

/**
 * Expande recurrencias. Itera en calendario civil local y convierte a UTC,
 * por lo que la hora local se preserva a través de cambios DST.
 * Rango: [rangeStart, rangeEnd). UNTIL inclusivo. COUNT cuenta desde DTSTART.
 */
export function expandRecurrence(opts: ExpandOptions): Date[] {
  const { rrule, timeZone } = opts;
  validateTimeZone(timeZone);
  const rule = parseRRule(rrule);

  const startMs = toUtcMs(opts.start, "start");
  const rangeStartMs = toUtcMs(opts.rangeStart, "rangeStart");
  const rangeEndMs = toUtcMs(opts.rangeEnd, "rangeEnd");
  if (rangeEndMs < rangeStartMs) throw new Error("rangeEnd must be >= rangeStart");

  const startParts = utcToZonedParts(timeZone, startMs);
  const timeOfDay = {
    hour: startParts.hour,
    minute: startParts.minute,
    second: startParts.second,
    millisecond: startParts.millisecond,
  };
  const startCivil: CivilDate = { y: startParts.year, m: startParts.month, d: startParts.day };
  const startWeekday = civilWeekday(startCivil.y, startCivil.m, startCivil.d);

  const toUtc = (c: CivilDate): number => {
    const p: ZonedParts = {
      year: c.y,
      month: c.m,
      day: c.d,
      hour: timeOfDay.hour,
      minute: timeOfDay.minute,
      second: timeOfDay.second,
      millisecond: timeOfDay.millisecond,
    };
    return zonedTimeToUtc(timeZone, p);
  };

  const result: Date[] = [];
  let generated = 0; // ocurrencias generadas desde DTSTART (para COUNT)
  let candidatesSeen = 0;

  const consider = (utcMs: number): boolean => {
    // Devuelve false si hay que parar por completo.
    if (utcMs < startMs) return true; // anterior a DTSTART: ni cuenta ni se incluye
    if (rule.untilMs !== undefined && utcMs > rule.untilMs) return false; // monotónico -> parar
    candidatesSeen++;
    if (candidatesSeen > MAX_CANDIDATES) throw new Error("Recurrence expansion too large");
    generated++;
    if (rule.count !== undefined && generated > rule.count) return false;
    if (utcMs >= rangeStartMs && utcMs < rangeEndMs) result.push(new Date(utcMs));
    // Si ya superamos el rango y la secuencia es monótona, podemos parar,
    // salvo que COUNT aún no se haya alcanzado y el rango futuro importe... no:
    // más allá de rangeEnd nada se incluirá, así que parar es seguro.
    if (utcMs >= rangeEndMs) {
      // Pero cuidado: UNTIL/COUNT ya se manejan arriba. Como es monótono, parar.
      // Solo continuamos si utcMs < rangeEndMs.
      return false;
    }
    return true;
  };

  if (rule.freq === "DAILY") {
    for (let k = 0; k < MAX_PERIODS; k++) {
      const civil = addDaysCivil(startCivil, k * rule.interval);
      const utc = toUtc(civil);
      if (rule.untilMs !== undefined && utc > rule.untilMs) break;
      if (rule.count !== undefined && generated >= rule.count) break;
      const cont = consider(utc);
      if (!cont) {
        // `consider` devuelve false por COUNT/UNTIL/rango superado.
        // Distinguir: si fue por utc < startMs no ocurre aquí (k=0 es start).
        break;
      }
      // Heurística de parada: si llevamos 20 periodos más allá de rangeEnd, salir.
      // (consider ya sale al superar rangeEnd, así que este bucle termina solo.)
    }
  } else if (rule.freq === "WEEKLY") {
    const weekdays =
      rule.byday.length === 0 ? [startWeekday] : rule.byday.map((b) => b.weekday);
    const uniqSorted = [...new Set(weekdays)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const baseMonday = mondayOfWeek(startCivil);
    for (let w = 0; w < MAX_PERIODS; w++) {
      const monday = addDaysCivil(baseMonday, w * rule.interval * 7);
      let hitRangeEnd = false;
      for (const wd of uniqSorted) {
        const offset = (wd + 6) % 7;
        const civil = addDaysCivil(monday, offset);
        const utc = toUtc(civil);
        if (utc < startMs) continue;
        if (rule.untilMs !== undefined && utc > rule.untilMs) return result;
        if (rule.count !== undefined && generated >= rule.count) return result;
        candidatesSeen++;
        if (candidatesSeen > MAX_CANDIDATES) throw new Error("Recurrence expansion too large");
        generated++;
        if (rule.count !== undefined && generated > rule.count) return result;
        if (utc >= rangeStartMs && utc < rangeEndMs) result.push(new Date(utc));
        if (utc >= rangeEndMs) hitRangeEnd = true;
      }
      if (hitRangeEnd) break;
      // Corte de seguridad: si el lunes base ya supera rangeEnd + margen y no hay COUNT infinito relevante.
      const mondayUtc = toUtc(monday);
      if (mondayUtc >= rangeEndMs && rule.count === undefined) {
        // La semana actual ya se procesó; las siguientes serán mayores.
        break;
      }
      if (rule.count !== undefined && generated >= rule.count) break;
    }
  } else {
    // MONTHLY
    for (let k = 0; k < MAX_PERIODS; k++) {
      const step = k * rule.interval;
      const total = startCivil.y * 12 + (startCivil.m - 1) + step;
      const yy = Math.floor(total / 12);
      const mm = ((total % 12) + 12) % 12 + 1;
      const civils = monthDatesForMonthly(yy, mm, startCivil.d, rule.byday);
      let hitRangeEnd = false;
      for (const civil of civils) {
        const utc = toUtc(civil);
        if (utc < startMs) continue;
        if (rule.untilMs !== undefined && utc > rule.untilMs) return result;
        if (rule.count !== undefined && generated >= rule.count) return result;
        candidatesSeen++;
        if (candidatesSeen > MAX_CANDIDATES) throw new Error("Recurrence expansion too large");
        generated++;
        if (rule.count !== undefined && generated > rule.count) return result;
        if (utc >= rangeStartMs && utc < rangeEndMs) result.push(new Date(utc));
        if (utc >= rangeEndMs) hitRangeEnd = true;
      }
      if (hitRangeEnd) break;
      if (civils.length === 0) {
        // Mes saltado (p.ej. 31 feb): comprobar si ya estamos más allá del rango.
        // Estimar con el día 1 del mes a la hora de referencia.
        const probe = toUtc({ y: yy, m: mm, d: 1 });
        if (probe >= rangeEndMs && rule.count === undefined) {
          // Podría haber meses futuros dentro del rango, así que NO romper por un solo salto.
          // Solo romper si el mes actual completo está más allá de rangeEnd y UNTIL.
          // Como los meses crecen, si día 1 ya supera rangeEnd, meses siguientes también.
          break;
        }
        void probe;
      } else {
        const lastUtc = toUtc(civils[civils.length - 1] as CivilDate);
        if (lastUtc >= rangeEndMs) break;
      }
      if (rule.count !== undefined && generated >= rule.count) break;
      // Si no hay COUNT/UNTIL y ya pasamos rangeEnd, el break de arriba lo cubre.
      // Seguridad adicional: si el primer día del próximo mes supera rangeEnd y UNTIL, salir.
      if (rule.untilMs !== undefined) {
        const probeNext = toUtc({ y: yy, m: mm, d: 1 });
        if (probeNext > rule.untilMs + 366 * 86_400_000) break;
      }
    }
  }

  result.sort((a, b) => a.getTime() - b.getTime());
  return result;
}
