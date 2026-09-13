// Comprobación mínima para el juez: el adaptador compila y conecta con la solución.
import { expect, test } from 'vitest';
import { expand } from './adapter';
import { buildInput, normalize } from './helpers';

test('smoke: DAILY;COUNT=3 en UTC', async () => {
  const input = buildInput({
    dtstart: '2025-01-01T09:00:00',
    tz: 'UTC',
    rrule: 'FREQ=DAILY;COUNT=3',
    from: '2024-12-31T00:00:00Z',
    to: '2025-02-01T00:00:00Z',
  });
  expect(normalize(await expand(input))).toEqual([
    '2025-01-01T09:00:00.000Z',
    '2025-01-02T09:00:00.000Z',
    '2025-01-03T09:00:00.000Z',
  ]);
});
