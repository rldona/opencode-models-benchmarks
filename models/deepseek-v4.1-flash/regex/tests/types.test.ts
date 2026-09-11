import { describe, expect, it } from 'vitest';
import { compile } from '../src/index.js';

const text = '2024-03T05 1999-12';

describe('pattern literal type inference', () => {
  it('infers captures tuple and named groups', () => {
    const m = compile('(?<year>\\d{4})-(?<month>\\d\\d)(?:T(\\d\\d))?').exec(text);
    if (m) {
      const year: string = m.groups.year;
      const month: string = m.groups.month;
      const full: string = m.captures[0];
      const third: string | undefined = m.captures[3];
      void year;
      void month;
      void full;
      void third;
      // @ts-expect-error there is no group named "day"
      m.groups.day;
      // @ts-expect-error the captures tuple has only 4 entries
      m.captures[4];
    }
  });

  it('marks groups inside alternations as optional', () => {
    const m = compile('(a)|(b)').exec('a');
    if (m) {
      const first: string | undefined = m.captures[1];
      const second: string | undefined = m.captures[2];
      void first;
      void second;
    }
  });

  it('marks groups inside zero-min quantifiers as optional', () => {
    const q = compile('(a)?').exec('a');
    if (q) {
      const g: string | undefined = q.captures[1];
      void g;
    }
    const star = compile('(a)*').exec('');
    if (star) {
      const g: string | undefined = star.captures[1];
      void g;
    }
    const bounded = compile('(a){0,3}').exec('');
    if (bounded) {
      const g: string | undefined = bounded.captures[1];
      void g;
    }
    const exact = compile('(a){2}').exec('aa');
    if (exact) {
      const g: string = exact.captures[1];
      void g;
    }
  });

  it('marks groups inside lookaheads as optional', () => {
    const m = compile('(?=(a))').exec('a');
    if (m) {
      const g: string | undefined = m.captures[1];
      void g;
    }
  });

  it('keeps always-participating groups as string', () => {
    const m = compile('(a)(b)').exec('ab');
    if (m) {
      const a: string = m.captures[1];
      const b: string = m.captures[2];
      void a;
      void b;
    }
  });

  it('types groups as an empty object when there are no named groups', () => {
    const m = compile('(a)').exec('a');
    if (m) {
      // @ts-expect-error no properties on {}
      m.groups.anything;
    }
  });

  it('uses fallback shapes for non-literal patterns', () => {
    const dynamic: string = '(a)';
    const m = compile(dynamic).exec('a');
    if (m) {
      const full: string = m.captures[0];
      const rest: string | undefined = m.captures[1];
      const named: string | undefined = m.groups.whatever;
      void full;
      void rest;
      void named;
    }
  });

  it('types stream matches with the same shapes', () => {
    const stream = compile('(?<n>\\d+)(x)?').stream();
    for (const m of stream.feed('123')) {
      const n: string = m.groups.n;
      const x: string | undefined = m.captures[2];
      void n;
      void x;
      // @ts-expect-error there is no group named "missing"
      m.groups.missing;
    }
  });
});

describe('generic interface annotations', () => {
  it('literal patterns are assignable to the untyped Regex interface', () => {
    const generic: import('../src/index.js').Regex = compile('(a)');
    const captures: [string, ...(string | undefined)[]] = generic
      .exec('a')!
      .captures;
    const groups: Record<string, string | undefined> = generic.exec('a')!.groups;
    expect(generic.exec('a')?.captures[0]).toBe('a');
    void captures;
    void groups;
    const streamGeneric: import('../src/index.js').RegexStream = generic.stream();
    void streamGeneric;
  });
});

