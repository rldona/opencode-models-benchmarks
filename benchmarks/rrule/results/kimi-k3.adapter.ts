import type { Expand } from './contract';
import { expandRecurrence } from '../src/rrule';

export const expand: Expand = (input) => {
  const occurrences = expandRecurrence(input.dtstartLocal, input.rrule, {
    timezone: input.tz,
    from: input.from,
    to: input.to,
  });
  return occurrences.map((d) => d.toISOString());
};
