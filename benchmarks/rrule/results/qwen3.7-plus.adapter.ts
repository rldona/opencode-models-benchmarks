import type { Expand } from './contract';
import { expandRecurrences } from '../src/expand';

export const expand: Expand = (input) => {
  const dtstart = new Date(input.dtstartUtc);
  const rangeStart = new Date(input.from);
  const rangeEnd = new Date(input.to);

  const results = expandRecurrences(dtstart, input.rrule, input.tz, rangeStart, rangeEnd);

  return results.map((d) => d.toISOString());
};
