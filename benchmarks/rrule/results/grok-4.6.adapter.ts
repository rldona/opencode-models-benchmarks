import type { Expand } from './contract';
import { expand } from '../src/index';

export const expand_: Expand = (input) => {
  const dtstart = new Date(input.dtstartUtc);
  const rangeStart = new Date(input.from);
  const rangeEnd = new Date(input.to);
  return expand(dtstart, input.rrule, input.tz, rangeStart, rangeEnd).map((d) => d.toISOString());
};

export { expand_ as expand };
