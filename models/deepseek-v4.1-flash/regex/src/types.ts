// Type-level pattern analysis: infers the shape of `captures` and `groups`
// from a string literal pattern.

type GroupInfo = { name: string | null; anc: number[] };

type Push<T extends readonly unknown[], V> = [...T, V];

type HasAny<A extends number[], B extends number> = A extends [
  infer H extends number,
  ...infer R extends number[],
]
  ? H extends B
    ? true
    : HasAny<R, B>
  : false;

type AllZero<D extends string> = D extends ''
  ? true
  : D extends `0${infer R}`
    ? AllZero<R>
    : false;

type TakeDigits<S extends string, Acc extends string = ''> = S extends `${infer D}${infer R}`
  ? D extends '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
    ? TakeDigits<R, `${Acc}${D}`>
    : { digits: Acc; rest: S }
  : { digits: Acc; rest: S };

type IsZeroMin<S extends string> = S extends `?${string}`
  ? true
  : S extends `*${string}`
    ? true
    : S extends `{${infer After}`
      ? TakeDigits<After> extends { digits: infer Digits extends string; rest: infer Rest extends string }
        ? Digits extends ''
          ? false
          : AllZero<Digits> extends true
            ? Rest extends `,${string}`
              ? true
              : Rest extends `}${string}`
                ? true
                : false
            : false
        : false
      : false;

type SkipClass<S extends string> = S extends `\\${infer _C}${infer R}`
  ? SkipClass<R>
  : S extends `]${infer R}`
    ? R
    : S extends `${infer _C}${infer R}`
      ? SkipClass<R>
      : '';

type ScanResult<
  Gs extends GroupInfo[],
  A extends number[],
  Z extends number[],
  L extends number[],
> = { groups: Gs; alt: A; zero: Z; look: L };

type Scan<
  Rest extends string,
  Ids extends unknown[],
  Open extends number[],
  Gs extends GroupInfo[],
  A extends number[],
  Z extends number[],
  L extends number[],
> = Rest extends ''
  ? ScanResult<Gs, A, Z, L>
  : Rest extends `\\${infer _C}${infer R}`
    ? Scan<R, Ids, Open, Gs, A, Z, L>
    : Rest extends `[${infer R}`
      ? Scan<SkipClass<R>, Ids, Open, Gs, A, Z, L>
      : Rest extends `(${infer Tail}`
        ? Tail extends `?:${infer R}`
          ? Scan<R, Push<Ids, 0>, Push<Open, Ids['length']>, Gs, A, Z, L>
          : Tail extends `?=${infer R}`
            ? Scan<R, Push<Ids, 0>, Push<Open, Ids['length']>, Gs, A, Z, Push<L, Ids['length']>>
            : Tail extends `?!${infer R}`
              ? Scan<R, Push<Ids, 0>, Push<Open, Ids['length']>, Gs, A, Z, Push<L, Ids['length']>>
              : Tail extends `?<${infer Name}>${infer R}`
                ? Scan<
                    R,
                    Push<Ids, 0>,
                    Push<Open, Ids['length']>,
                    Push<Gs, { name: Name; anc: Push<Open, Ids['length']> }>,
                    A,
                    Z,
                    L
                  >
                : Scan<
                    Tail,
                    Push<Ids, 0>,
                    Push<Open, Ids['length']>,
                    Push<Gs, { name: null; anc: Push<Open, Ids['length']> }>,
                    A,
                    Z,
                    L
                  >
        : Rest extends `)${infer Tail}`
          ? Open extends [...infer RestOpen extends number[], infer Top extends number]
            ? Scan<
                Tail,
                Ids,
                RestOpen,
                Gs,
                A,
                IsZeroMin<Tail> extends true ? Push<Z, Top> : Z,
                L
              >
            : Scan<Tail, Ids, Open, Gs, A, Z, L>
          : Rest extends `|${infer R}`
            ? Open extends [...infer _RestOpen extends number[], infer Top extends number]
              ? Scan<R, Ids, Open, Gs, Push<A, Top>, Z, L>
              : Scan<R, Ids, Open, Gs, A, Z, L>
            : Rest extends `${infer _C}${infer R}`
              ? Scan<R, Ids, Open, Gs, A, Z, L>
              : ScanResult<Gs, A, Z, L>;

type GroupOptional<
  G extends GroupInfo,
  A extends number[],
  Z extends number[],
  L extends number[],
> = HasAny<G['anc'], A[number] | Z[number] | L[number]> extends true ? true : false;

type CapturesFrom<
  Gs extends GroupInfo[],
  A extends number[],
  Z extends number[],
  L extends number[],
> = [
  string,
  ...{
    [K in keyof Gs]: GroupOptional<Gs[K], A, Z, L> extends true ? string | undefined : string;
  },
];

type NamedFrom<
  Gs extends GroupInfo[],
  A extends number[],
  Z extends number[],
  L extends number[],
  Acc = {},
> = Gs extends [infer H extends GroupInfo, ...infer T extends GroupInfo[]]
  ? H['name'] extends string
    ? NamedFrom<
        T,
        A,
        Z,
        L,
        Acc & {
          [K in H['name']]: GroupOptional<H, A, Z, L> extends true ? string | undefined : string;
        }
      >
    : NamedFrom<T, A, Z, L, Acc>
  : Acc;

type ScanOne<P extends string> = Scan<P, [0], [0], [], [], [], []>;

type PatternCaptures<P extends string> = ScanOne<P> extends {
  groups: infer Gs extends GroupInfo[];
  alt: infer A extends number[];
  zero: infer Z extends number[];
  look: infer L extends number[];
}
  ? CapturesFrom<Gs, A, Z, L>
  : [string];

type PatternGroups<P extends string> = ScanOne<P> extends {
  groups: infer Gs extends GroupInfo[];
  alt: infer A extends number[];
  zero: infer Z extends number[];
  look: infer L extends number[];
}
  ? NamedFrom<Gs, A, Z, L>
  : {};

export type Captures<P extends string> = string extends P
  ? [string, ...(string | undefined)[]]
  : PatternCaptures<P>;

export type Groups<P extends string> = string extends P
  ? Record<string, string | undefined>
  : PatternGroups<P>;

export interface Match<P extends string = string> {
  index: number;
  captures: Captures<P>;
  groups: Groups<P>;
}

export interface RegexStream<P extends string = string> {
  feed(chunk: string): Match<P>[];
  end(): Match<P>[];
}

export interface Regex<P extends string = string> {
  readonly source: string;
  readonly flags: string;
  lastIndex: number;
  exec(input: string): Match<P> | null;
  stream(): RegexStream<P>;
}
