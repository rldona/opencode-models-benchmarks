// Adaptador: traduce el contrato del benchmark a la API pública de la solución.
import type { Expand } from './contract';
import { parseLocal } from './helpers';
import { expand as solutionExpand } from '../src/index.js';

export const expand: Expand = (input) => {
  // La solución espera `dtstart` como un Date cuyos campos UTC representan
  // la hora de pared local en `tz` (ver src/expander.ts: ymdOfWallClock usa
  // getUTCFullYear/getUTCMonth/... sobre dtstart). No es un instante real.
  const p = parseLocal(input.dtstartLocal);
  const dtstart = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));

  // rangeStart/rangeEnd sí son instantes UTC reales (se comparan con el
  // instante real calculado internamente vía zonedWallToUtc).
  const rangeStart = new Date(input.from);
  const rangeEnd = new Date(input.to);

  const result = solutionExpand(input.rrule, dtstart, rangeStart, rangeEnd, input.tz);
  return result.map((d) => d.toISOString());
};
