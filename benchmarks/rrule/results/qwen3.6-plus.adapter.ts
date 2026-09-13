import type { Expand } from './contract';
import { expandRRule } from '../src/rrule-expander';

export const expand: Expand = (input) => {
  const occurrences = expandRRule(
    input.dtstartLocal,
    input.rrule,
    input.tz,
    input.from,
    input.to,
  );
  return occurrences.map((o) => o.start.toISOString());
};
