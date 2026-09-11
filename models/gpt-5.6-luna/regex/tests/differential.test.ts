import { describe, expect, it } from 'vitest';
import { compile } from '../src/index';

function normalize(value: { index: number; captures: readonly unknown[]; groups: unknown } | null) {
  return value && {
    index: value.index,
    captures: [...value.captures],
    groups: value.groups ?? {},
  };
}

describe('differential examples', () => {
  const patterns = [
    '',
    'a',
    'ab',
    'a|b',
    'ab|a',
    'a|ab',
    '(a)',
    '(a|b)',
    '(a|b)*',
    '(a|b)+',
    '(a|b)?',
    '(a*)*',
    '(a?)*',
    '(a|aa)*b',
    '(a|aa)*?b',
    '(ab|a)*',
    '((a|b)+)?',
    '(a(b|c)*)+',
    '(?:a{0,2}){1,2}',
    'a??',
    '(?:ab)*?',
    '(a|)*b',
    '(|a)*b',
    '((a)*)*',
    '()*',
    '(()*)*',
    '((?:)*)',
    '(?:a{0,2})+',
    'a?',
    'a*',
    'a+',
    'a{0}',
    'a{1}',
    'a{2,}',
    'a{1,3}',
    'a{1,3}?',
    'a+b+',
    'a*b*',
    '[ab]',
    '[^ab]',
    '[a-z]',
    '[a-z0-9_]+',
    '[é-ê]',
    '[^a]',
    '[\\d-]',
    '[\\b]',
    '[\\x61-\\x63]',
    '\\d+',
    '\\w+',
    '\\s+',
    '\\D',
    '.',
    '^a',
    'a$',
    '^$',
    '\\b',
    '\\B',
    '(a)(b)?(c*)',
    '(a|(b(c)))',
    '(?<x>a)(?<y>b)?',
    '(?=a)a',
    '(?!a).',
    '(?=a*)a*',
    '(a)\\1',
    '(?<x>ab)\\k<x>',
    '(a+?)\\1',
    '(?=(a|ab))\\1',
    '(?!(a+))a',
    '(?=(a+))a+',
    '(?:(?=(a))a)+',
    '(a)?\\1',
    '(a*)\\1',
    '(?<x>a)?\\k<x>',
  ];
  const inputs = [
    '',
    'a',
    'b',
    'c',
    'aa',
    'ab',
    'ba',
    'abc',
    'aabb',
    'xxa',
    'a\nb',
    'a\n',
    'a\r',
    'a\r\n',
    'a\u2028',
    '😀',
    'a😀b',
  ];
  const flags = ['', 'i', 'm', 's', 'u', 'iu', 'mu', 'su'];

  it('agrees with the native implementation across representative cases', () => {
    for (const pattern of patterns) {
      for (const input of inputs) {
        for (const flag of flags) {
          let native: RegExp;
          try {
            native = new RegExp(pattern, flag);
          } catch {
            continue;
          }
          const actual = normalize(compile(pattern, flag).exec(input));
          const nativeMatch = native.exec(input);
          const expected = nativeMatch && {
            index: nativeMatch.index,
            captures: [...nativeMatch],
            groups: nativeMatch.groups ?? {},
          };
          expect(actual, `${pattern} /${flag}/ ${JSON.stringify(input)}`).toEqual(expected);
        }
      }
    }
  });
});
