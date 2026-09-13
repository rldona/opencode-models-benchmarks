// Adaptador: traduce el contrato del benchmark a la API pública de la solución.
import type { Expand } from './contract';
import { expandRRule } from '../src/index';

export const expand: Expand = (input) => {
  const dates = expandRRule(input.dtstartLocal, input.rrule, input.tz, input.from, input.to);
  return dates.map((d) => d.toISOString());
};
