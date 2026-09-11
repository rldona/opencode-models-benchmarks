import type { Expand } from './contract';
import { expand as solutionExpand } from '../src/index.js';

export const expand: Expand = (input) => {
  const occurrences = solutionExpand(
    { dtstart: input.dtstartLocal, rrule: input.rrule, tz: input.tz },
    new Date(input.from),
    new Date(input.to),
  );
  return occurrences.map((d) => d.toISOString());
};
