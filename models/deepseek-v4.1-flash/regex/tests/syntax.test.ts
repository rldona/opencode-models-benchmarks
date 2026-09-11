import { describe, expect, it } from 'vitest';
import { compile } from '../src/index.js';

describe('flags', () => {
  it('accepts the supported flags and returns them in canonical order', () => {
    expect(compile('a', 'yusmig').flags).toBe('gimsuy');
    expect(compile('a', 'i').flags).toBe('i');
    expect(compile('a').flags).toBe('');
    expect(compile('a').source).toBe('a');
  });

  it('rejects unknown flags', () => {
    expect(() => compile('a', 'z')).toThrow(SyntaxError);
    expect(() => compile('a', 'gz')).toThrow(SyntaxError);
  });

  it('rejects repeated flags', () => {
    expect(() => compile('a', 'gg')).toThrow(SyntaxError);
    expect(() => compile('a', 'uiu')).toThrow(SyntaxError);
  });

  it('rejects the unsupported d and v flags', () => {
    expect(() => compile('a', 'd')).toThrow(SyntaxError);
    expect(() => compile('a', 'v')).toThrow(SyntaxError);
  });
});

describe('invalid patterns', () => {
  const invalid = [
    '(',
    ')',
    '(?',
    '(?:',
    '(?=',
    '(?!',
    '(?<x>',
    '(?<x>a',
    '(?<x>a)(?<x>b)',
    '[',
    '[a',
    '[z-a]',
    '*',
    '+',
    '?',
    'a**',
    'a{2,1}',
    'a{',
    'a{,2}',
    '\\',
    '\\c',
    '\\c1',
    '\\x',
    '\\xZZ',
    '\\u',
    '\\uZZZZ',
    '\\u{110000}',
    '\\k<none>',
    '(a)\\k<none>',
    '(a)\\2',
    '\\1',
    'a|*',
    '[\\B]',
  ];

  for (const pattern of invalid) {
    it(`throws SyntaxError for /${pattern}/`, () => {
      expect(() => compile(pattern)).toThrow(SyntaxError);
    });
  }

  it('rejects \\u{...} without the u flag', () => {
    expect(() => compile('\\u{61}')).toThrow(SyntaxError);
  });

  it('accepts valid patterns next to the invalid list', () => {
    expect(compile('(a)(b)\\2\\1').exec('abba')?.captures[0]).toBe('abba');
  });
});

describe('backreference edge cases', () => {
  it('forward references match the empty string', () => {
    expect(compile('\\1(a)').exec('a')?.captures[0]).toBe('a');
    expect(compile('(?:\\1(a))').exec('a')?.captures[1]).toBe('a');
  });

  it('named forward references are allowed', () => {
    expect(compile('\\k<x>(?<x>a)').exec('a')?.captures[0]).toBe('a');
  });

  it('backreferences respect the i flag', () => {
    expect(compile('(a)\\1', 'i').exec('aA')?.captures[0]).toBe('aA');
    expect(compile('(a)\\1', 'i').exec('ab')).toBeNull();
  });

  it('backreferences to non-participating groups match empty', () => {
    const m = compile('(a)?b\\1').exec('b');
    expect(m?.captures[0]).toBe('b');
    expect(m?.captures[1]).toBeUndefined();
  });
});

describe('word boundaries', () => {
  it('uses folded word characters with u and i', () => {
    expect(compile('\\b\\u212a\\b', 'iu').exec(' \u212a ')?.index).toBe(1);
    expect(compile('\\b\\u212a\\b', 'i').exec(' \u212a ')).toBeNull();
    expect(compile('\\w', 'iu').exec('\u212a')?.index).toBe(0);
    expect(compile('\\w', 'i').exec('\u212a')).toBeNull();
    expect(compile('\\w', 'iu').exec('\u017f')?.index).toBe(0);
  });

  it('complements predefined classes with fold-aware semantics', () => {
    expect(compile('[\\W]', 'iu').exec('\u212a')).toBeNull();
    expect(compile('[^\\W]', 'iu').exec('\u212a')?.index).toBe(0);
    expect(compile('\\W', 'iu').exec('\u212a')).toBeNull();
    expect(compile('[a\\W]', 'iu').exec('b')).toBeNull();
    expect(compile('[a\\W]', 'iu').exec('!')?.index).toBe(0);
    expect(compile('[^\\w]', 'iu').exec('K')).toBeNull();
    expect(compile('[^\\w]', 'iu').exec(' ')?.index).toBe(0);
    expect(compile('[^\\D]', 'iu').exec('5')?.index).toBe(0);
    expect(compile('[^\\S]', 'iu').exec(' ')?.index).toBe(0);
  });

  it('negates explicit ranges after folding', () => {
    expect(compile('[^a-z]', 'iu').exec('A')).toBeNull();
    expect(compile('[^a-z]', 'u').exec('A')?.index).toBe(0);
    expect(compile('[a-z]', 'i').exec('A')?.index).toBe(0);
    expect(compile('[^\\u212a]', 'i').exec('k')?.index).toBe(0);
    expect(compile('[\\u212a]', 'i').exec('k')).toBeNull();
  });
});

describe('empty patterns and anchors', () => {
  it('empty pattern matches the empty string at index 0', () => {
    const m = compile('').exec('abc');
    expect(m?.index).toBe(0);
    expect(m?.captures[0]).toBe('');
  });

  it('anchors work with m', () => {
    const m = compile('^b$', 'm').exec('a\nb\nc');
    expect(m?.index).toBe(2);
  });
});
