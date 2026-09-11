import type { Expand } from './contract';
import { expandRecurrences } from '../src/rrule-expander.js';

// La solución expone expandRecurrences(dtstart, rruleStr, timeZone, rangeStart, rangeEnd): Date[]
// que ya casa directamente con el contrato del benchmark (ventana [from, to)).
export const expand: Expand = (input) => {
  const dtstart = new Date(input.dtstartUtc);
  const rangeStart = new Date(input.from);
  const rangeEnd = new Date(input.to);

  return expandRecurrences(dtstart, input.rrule, input.tz, rangeStart, rangeEnd);
};
