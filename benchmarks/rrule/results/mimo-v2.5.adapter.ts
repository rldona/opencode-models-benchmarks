import type { Expand } from './contract';
import { expandRRule } from '../src/index.js';

export const expand: Expand = (input) => {
  return expandRRule(
    input.rrule,
    new Date(input.dtstartUtc),
    input.tz,
    new Date(input.from),
    new Date(input.to),
  );
};
