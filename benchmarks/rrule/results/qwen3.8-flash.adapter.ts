import type { Expand } from './contract';
import { expandRecurrences } from '../src/expand';

export const expand: Expand = (input) => {
  const occurrences = expandRecurrences({
    dtstart: input.dtstartLocal,
    rrule: input.rrule,
    timeZone: input.tz,
    from: input.from,
    to: input.to,
  });
  return occurrences.map((occurrence) => occurrence.start.toISOString());
};
