import { describe, expect, it } from 'vitest';
import { compile } from '../src/index';

function result(value: { index: number; captures: unknown[]; groups: unknown } | null) {
  return value && { index: value.index, captures: value.captures, groups: value.groups };
}

function compare(pattern: string, flags: string, input: string) {
  const actual = compile(pattern, flags).exec(input);
  const native = new RegExp(pattern, flags).exec(input);
  expect(result(actual)).toEqual(native && { index: native.index, captures: [...native], groups: native.groups ?? {} });
}

describe('ECMAScript semantics', () => {
  it('keeps the source and canonicalizes flag order', () => {
    const regex = compile('a\\nb', 'yusmig');
    expect(regex.source).toBe('a\\nb');
    expect(regex.flags).toBe('gimsuy');
  });

  it('supports escapes, classes, anchors and dot modes', () => {
    for (const [pattern, flags, input] of [
      ['\\t\\n\\v\\f\\r\\0', '', '\t\n\v\f\r\0'],
      ['\\cA\\x42\\u0043', '', '\x01BC'],
      ['[a-cx-z]+', '', 'bbxyz'],
      ['[^a-c]+', '', 'xyz'],
      ['\\D+\\W+\\S+', '', 'a-!x'],
      ['^a+$', 'm', 'x\naa\ny'],
      ['.', '', '\n'],
      ['.', 's', '\n'],
      ['\\bword\\B', '', 'word!'],
    ]) compare(pattern, flags, input);
  });

  it('preserves greedy and lazy priority', () => {
    for (const [pattern, input] of [
      ['a+', 'aaaa'],
      ['a+?', 'aaaa'],
      ['a{2,4}', 'aaaaa'],
      ['a{2,4}?', 'aaaaa'],
      ['(a|aa)+', 'aaaa'],
      ['(a|aa)+?', 'aaaa'],
      ['(a|b)*c', 'aabbc'],
      ['(a|b)*?c', 'aabbc'],
    ]) compare(pattern, '', input);
  });

  it('implements capture reset and captures in repetitions', () => {
    for (const [pattern, input] of [
      ['(?:(a)|(b))+', 'ab'],
      ['(a(b)?)+', 'aba'],
      ['(?<x>a(?<y>b)?)+', 'aba'],
      ['(?:(a)?b)+', 'bab'],
    ]) compare(pattern, '', input);
  });

  it('implements backreferences and lookahead', () => {
    for (const [pattern, input] of [
      ['(a+)\\1', 'aaaa'],
      ['(?<x>ab)\\k<x>', 'abab'],
      ['(?=(a+))a\\1', 'aaaa'],
      ['(?!a)(.)', 'ba'],
      ['(?!(a))b', 'b'],
    ]) compare(pattern, '', input);
  });

  it('handles ignoreCase, unicode and surrogate pairs', () => {
    for (const [pattern, flags, input] of [
      ['k', 'i', '\u212A'],
      ['k', 'iu', '\u212A'],
      ['s', 'iu', '\u017F'],
      ['s', 'i', '\u017F'],
      ['i', 'iu', '\u0131'],
      ['ß', 'iu', 'ẞ'],
      ['\\u{10400}', 'iu', '\u{10428}'],
      ['\\w+', 'iu', '\u212A\u017Fabc'],
      ['.', '', '😀'],
      ['.', 'u', '😀'],
      ['^.$', 'u', '😀'],
      ['^..$', '', '😀'],
      ['\\u{1f600}', 'u', '😀'],
    ]) compare(pattern, flags, input);
  });

  it('follows representative Unicode case-fold pairs', () => {
    const values = ['A', 'a', 'É', 'é', 'Ā', 'ā', 'Σ', 'σ', 'ς', 'ſ', 'S', 'K', 'K', 'İ', 'i', 'ı', 'ß', 'ẞ', '𐐀', '𐐨'];
    for (const flags of ['i', 'iu']) {
      for (const pattern of values) {
        for (const input of values) compare(pattern, flags, input);
      }
    }
  });

  it('rejects invalid flags and unicode-invalid syntax', () => {
    for (const flags of ['q', 'gg', 'ii', 'd', 'v']) expect(() => compile('a', flags)).toThrow(SyntaxError);
    for (const pattern of [
      '(',
      '[',
      '\\k<x>',
      '\\1',
      '\\u{1f600}',
      '{',
      'a{2,1}',
      '(?<=a)',
      '[\\d-a]',
      '\\-',
    ]) {
      const flags = pattern === '\\u{1f600}' ? '' : 'u';
      let thrown = false;
      try {
        compile(pattern, flags);
      } catch (error) {
        thrown = error instanceof SyntaxError;
      }
      expect(thrown, pattern).toBe(true);
    }
  });

  it('supports global and sticky lastIndex', () => {
    const global = compile('a', 'g');
    const expected = /a/g;
    for (let count = 0; count < 4; count += 1) {
      const actual = global.exec('baab');
      const native = expected.exec('baab');
      expect(result(actual)).toEqual(native && { index: native.index, captures: [...native], groups: {} });
      expect(global.lastIndex).toBe(expected.lastIndex);
    }
    const sticky = compile('a', 'y');
    sticky.lastIndex = 1;
    expect(sticky.exec('baab')?.index).toBe(1);
    expect(sticky.lastIndex).toBe(2);
    sticky.lastIndex = 3;
    expect(sticky.exec('baab')?.index).toBeUndefined();
    expect(sticky.lastIndex).toBe(0);

    const stateless = compile('a');
    stateless.lastIndex = 4;
    expect(stateless.exec('a')?.index).toBe(0);
    expect(stateless.lastIndex).toBe(4);

    const beyondEnd = compile('', 'g');
    beyondEnd.lastIndex = 10;
    expect(beyondEnd.exec('a')).toBeNull();
    expect(beyondEnd.lastIndex).toBe(0);

    for (const pattern of ['.', 'a?', '\\b', '\\B']) {
      const actual = compile(pattern, 'uy');
      const native = new RegExp(pattern, 'uy');
      actual.lastIndex = 2;
      native.lastIndex = 2;
      const actualMatch = actual.exec('a😀b');
      const nativeMatch = native.exec('a😀b');
      expect(actualMatch && [actualMatch.index, actualMatch.captures]).toEqual(
        nativeMatch && [nativeMatch.index, [...nativeMatch]],
      );
    }
  });
});
