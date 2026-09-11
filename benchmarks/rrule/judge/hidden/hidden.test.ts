// Suite oculta: se copia a __bench__/ solo después de que el juez termine.
import { expect, test } from 'vitest';
import cases from './cases.json';
import { expand } from './adapter';
import { buildInput, normalize } from './helpers';

for (const c of cases) {
  test(`[${c.id}] ${c.name}`, async () => {
    expect(normalize(await expand(buildInput(c)))).toEqual(c.expected);
  });
}
