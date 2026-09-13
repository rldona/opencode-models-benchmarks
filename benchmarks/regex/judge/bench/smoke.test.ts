// Comprobación mínima para el juez: el adaptador compila y conecta con la solución.
import { expect, test } from 'vitest';
import type { Compile } from './contract';
import { compile as solution } from './adapter';

const compile = solution as unknown as Compile;

test('smoke: exec con grupos', () => {
  const m = compile('(\\d+)-(?<b>[a-z]+)').exec('xx 12-ab');
  expect(m?.index).toBe(3);
  expect(Array.from(m!.captures)).toEqual(['12-ab', '12', 'ab']);
  expect(m?.groups).toEqual({ b: 'ab' });
});

test('smoke: lastIndex con g', () => {
  const re = compile('a', 'g');
  expect(re.exec('aba')?.index).toBe(0);
  expect(re.lastIndex).toBe(1);
  expect(re.exec('aba')?.index).toBe(2);
  expect(re.exec('aba')).toBeNull();
  expect(re.lastIndex).toBe(0);
});

test('smoke: stream', () => {
  const s = compile('\\d+').stream();
  const out = [...s.feed('1 2'), ...s.feed('3 4'), ...s.end()];
  expect(out.map((m) => m.captures[0])).toEqual(['1', '23', '4']);
});

test('smoke: patrón no válido lanza SyntaxError', () => {
  expect(() => compile('(')).toThrow(SyntaxError);
});
