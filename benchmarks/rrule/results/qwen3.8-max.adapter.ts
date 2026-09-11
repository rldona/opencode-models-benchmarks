import type { Expand } from './contract';
import { expand as solutionExpand } from '../src/expand';

export const expand: Expand = (input) => {
  const occurrences = solutionExpand({
    dtstart: input.dtstartUtc,
    rule: input.rrule,
    timeZone: input.tz,
    rangeStart: input.from,
    rangeEnd: input.to,
  });

  // El contrato usa una ventana [from, to) semiabierta; la solución usa [rangeStart, rangeEnd]
  // inclusivo en ambos extremos. El enunciado dice "ningún caso tiene ocurrencias justo en
  // los bordes", así que esta diferencia de convención no debería afectar a los resultados,
  // pero se filtra `to` de forma defensiva por si acaso (no altera nada dentro de la ventana).
  const toMs = new Date(input.to).getTime();
  return occurrences
    .filter((occ) => occ.start.getTime() < toMs)
    .map((occ) => occ.start.toISOString());
};
