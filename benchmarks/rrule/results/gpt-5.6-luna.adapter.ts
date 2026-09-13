import type { Expand } from './contract';
import { expandOccurrences } from '../src/rrule';

export const expand: Expand = (input) => {
  const start = new Date(input.dtstartUtc);
  const rangeStart = new Date(input.from);
  const rangeEnd = new Date(input.to);

  const occurrences = expandOccurrences(start, input.rrule, input.tz, rangeStart, rangeEnd);

  return occurrences.map((d) => d.toISOString());
};
