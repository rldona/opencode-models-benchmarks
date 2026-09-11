import type { Expand } from './contract';
import { expandRecurrence } from '../src/expand';

export const expand: Expand = (input) => {
  const occurrences = expandRecurrence({
    start: input.dtstartUtc,
    rrule: input.rrule,
    timeZone: input.tz,
    rangeStart: input.from,
    rangeEnd: input.to,
  });
  return occurrences.map((d) => d.toISOString());
};
