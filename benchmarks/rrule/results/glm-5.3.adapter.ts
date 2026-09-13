import type { Expand } from './contract';
import { expandOccurrences } from '../src/index';

export const expand: Expand = (input) => {
  const occurrences = expandOccurrences({
    start: input.dtstartLocal,
    rule: input.rrule,
    timeZone: input.tz,
    from: new Date(input.from),
    to: new Date(input.to),
  });
  return occurrences.map((d) => d.toISOString());
};
