import { describe, expect, it } from "vitest";
import { expandRecurrence } from "./expand.js";

const TZ = "Europe/Madrid";

function localParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    hm: `${get("hour")}:${get("minute")}:${get("second")}`,
    hour: Number(get("hour")),
    weekday: get("weekday"),
  };
}

function localYMD(date: Date, timeZone: string): string {
  return localParts(date, timeZone).ymd;
}

describe("expansor RRULE", () => {
  it("evento semanal que cruza el cambio de hora de octubre en Europe/Madrid preserva la hora local", () => {
    // Cambio 2025: domingo 26-oct, 03:00 CEST -> 02:00 CET (+02 -> +01).
    const occ = expandRecurrence({
      start: "2025-09-01T10:00:00+02:00", // lunes 10:00 local
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      timeZone: TZ,
      rangeStart: "2025-09-01T00:00:00Z",
      rangeEnd: "2025-11-10T00:00:00Z",
    });

    const isos = occ.map((d) => d.toISOString());
    expect(isos).toEqual([
      "2025-09-01T08:00:00.000Z",
      "2025-09-08T08:00:00.000Z",
      "2025-09-15T08:00:00.000Z",
      "2025-09-22T08:00:00.000Z",
      "2025-09-29T08:00:00.000Z",
      "2025-10-06T08:00:00.000Z",
      "2025-10-13T08:00:00.000Z",
      "2025-10-20T08:00:00.000Z",
      // Tras el cambio, las 10:00 locales son las 09:00Z.
      "2025-10-27T09:00:00.000Z",
      "2025-11-03T09:00:00.000Z",
    ]);

    // Todas deben ser lunes a las 10:00 en hora local de Madrid.
    for (const d of occ) {
      const lp = localParts(d, TZ);
      expect(lp.weekday).toBe("Mon");
      expect(lp.hour).toBe(10);
      expect(lp.hm).toBe("10:00:00");
    }
  });

  it("último viernes de mes (BYDAY=-1FR)", () => {
    const occ = expandRecurrence({
      start: "2026-01-30T12:00:00+01:00", // viernes 30-ene-2026 12:00 CET
      rrule: "FREQ=MONTHLY;BYDAY=-1FR",
      timeZone: TZ,
      rangeStart: "2026-01-01T00:00:00Z",
      rangeEnd: "2026-07-01T00:00:00Z",
    });

    const ymds = occ.map((d) => localYMD(d, TZ));
    expect(ymds).toEqual([
      "2026-01-30",
      "2026-02-27",
      "2026-03-27",
      "2026-04-24",
      "2026-05-29",
      "2026-06-26",
    ]);

    // Propiedad: cada ocurrencia es viernes y es el último viernes (d+7 cae en otro mes).
    for (const d of occ) {
      const lp = localParts(d, TZ);
      expect(lp.weekday).toBe("Fri");
      expect(lp.hour).toBe(12);
      const [y, m, day] = ymds[occ.indexOf(d)]!.split("-").map(Number);
      const dim = new Date(Date.UTC(y as number, m as number, 0)).getUTCDate();
      expect(day as number).toBeGreaterThanOrEqual(dim - 6);
    }
  });

  it("meses sin día 31 se saltan (sin desplazar al 30)", () => {
    const occ = expandRecurrence({
      start: "2026-01-31T10:00:00+01:00",
      rrule: "FREQ=MONTHLY",
      timeZone: TZ,
      rangeStart: "2026-01-01T00:00:00Z",
      rangeEnd: "2026-07-01T00:00:00Z",
    });

    const ymds = occ.map((d) => localYMD(d, TZ));
    // Feb (28), Abr (30) y Jun (30) no tienen 31 -> se omiten.
    expect(ymds).toEqual(["2026-01-31", "2026-03-31", "2026-05-31"]);

    for (const d of occ) {
      expect(localParts(d, TZ).hour).toBe(10);
    }
    // Marzo/mayo ya están en horario de verano (+02), enero en +01.
    expect(occ.map((d) => d.toISOString())).toEqual([
      "2026-01-31T09:00:00.000Z",
      "2026-03-31T08:00:00.000Z",
      "2026-05-31T08:00:00.000Z",
    ]);
  });

  it("COUNT combinado con BYDAY cuenta ocurrencias, no periodos", () => {
    const occ = expandRecurrence({
      start: "2026-01-05T09:00:00+01:00", // lunes
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=5",
      timeZone: TZ,
      rangeStart: "2026-01-01T00:00:00Z",
      rangeEnd: "2026-03-01T00:00:00Z",
    });

    expect(occ.map((d) => d.toISOString())).toEqual([
      "2026-01-05T08:00:00.000Z", // lun
      "2026-01-07T08:00:00.000Z", // mié
      "2026-01-09T08:00:00.000Z", // vie
      "2026-01-12T08:00:00.000Z", // lun
      "2026-01-14T08:00:00.000Z", // mié
    ]);
    expect(occ).toHaveLength(5);
  });

  it("COUNT se cuenta desde DTSTART aunque el rango empiece después", () => {
    const occ = expandRecurrence({
      start: "2026-01-05T09:00:00+01:00",
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=5",
      timeZone: TZ,
      rangeStart: "2026-01-10T00:00:00Z",
      rangeEnd: "2026-03-01T00:00:00Z",
    });
    // Solo sobreviven las 2 últimas de las 5 generadas.
    expect(occ.map((d) => d.toISOString())).toEqual([
      "2026-01-12T08:00:00.000Z",
      "2026-01-14T08:00:00.000Z",
    ]);
  });

  it("soporta forma 2TU en MONTHLY", () => {
    const occ = expandRecurrence({
      start: "2026-01-01T10:00:00+01:00",
      rrule: "FREQ=MONTHLY;BYDAY=2TU",
      timeZone: TZ,
      rangeStart: "2026-01-01T00:00:00Z",
      rangeEnd: "2026-04-01T00:00:00Z",
    });
    // Segundos martes: 13-ene, 10-feb, 10-mar.
    expect(occ.map((d) => localYMD(d, TZ))).toEqual([
      "2026-01-13",
      "2026-02-10",
      "2026-03-10",
    ]);
  });

  it("INTERVAL semanal y UNTIL inclusivo", () => {
    const occ = expandRecurrence({
      start: "2026-01-05T10:00:00+01:00",
      rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;UNTIL=20260202T090000Z",
      timeZone: TZ,
      rangeStart: "2026-01-01T00:00:00Z",
      rangeEnd: "2026-04-01T00:00:00Z",
    });
    // Cada 2 semanas: 5-ene, 19-ene, 2-feb (UNTIL coincide exactamente -> incluido).
    expect(occ.map((d) => d.toISOString())).toEqual([
      "2026-01-05T09:00:00.000Z",
      "2026-01-19T09:00:00.000Z",
      "2026-02-02T09:00:00.000Z",
    ]);
  });

  it("DAILY preserva hora local cruzando DST", () => {
    const occ = expandRecurrence({
      start: "2025-10-24T09:00:00+02:00",
      rrule: "FREQ=DAILY;INTERVAL=1",
      timeZone: TZ,
      rangeStart: "2025-10-24T00:00:00Z",
      rangeEnd: "2025-10-29T00:00:00Z",
    });
    expect(occ.map((d) => d.toISOString())).toEqual([
      "2025-10-24T07:00:00.000Z",
      "2025-10-25T07:00:00.000Z",
      // El 26-oct el cambio ocurre a la 01:00Z; las 09:00 locales ya son CET (+01).
      "2025-10-26T08:00:00.000Z",
      "2025-10-27T08:00:00.000Z",
      "2025-10-28T08:00:00.000Z",
    ]);
    for (const d of occ) expect(localParts(d, TZ).hm).toBe("09:00:00");
  });
});
