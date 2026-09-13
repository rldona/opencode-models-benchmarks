import type { Expand } from './contract';
import { expandEvents } from '../src/index.js';

export const expand: Expand = (input) => {
  const occurrences = expandEvents({
    start: input.dtstartLocal,
    rule: input.rrule,
    timeZone: input.tz,
    from: input.from,
    to: input.to,
  });
  return occurrences.map((o) => o.utc);
};
