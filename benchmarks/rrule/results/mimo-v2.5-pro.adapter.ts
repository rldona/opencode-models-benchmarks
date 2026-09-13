// Adaptador: traduce el contrato del benchmark a la API de la solución (src/*).
import type { Expand } from './contract';
import { expandOccurrences } from '../src/rrule.js';

export const expand: Expand = (input) => {
  const occurrences = expandOccurrences({
    startDate: new Date(input.dtstartUtc),
    rrule: input.rrule,
    timeZone: input.tz,
    rangeStart: new Date(input.from),
    rangeEnd: new Date(input.to),
  });

  return occurrences.map((occ) => occ.start.toISOString());
};
