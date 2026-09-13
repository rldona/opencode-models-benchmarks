type CharList<S extends string, Out extends string[] = []> =
  S extends `${infer First}${infer Rest}`
    ? CharList<Rest, [...Out, First]>
    : Out;

type TakeClass<
  T extends string[],
  Out extends string[] = ['['],
> = T extends []
  ? [Out, []]
  : T extends [infer First extends string, ...infer Rest extends string[]]
    ? First extends '\\'
      ? Rest extends [infer Escaped extends string, ...infer After extends string[]]
        ? TakeClass<After, [...Out, First, Escaped]>
        : [Out, []]
      : First extends ']'
        ? [[...Out, First], Rest]
        : TakeClass<Rest, [...Out, First]>
    : [Out, []];

type TakeGroup<
  T extends string[],
  Depth extends unknown[] = [unknown],
  Out extends string[] = [],
> = T extends []
  ? [Out, []]
  : T extends [infer First extends string, ...infer Rest extends string[]]
    ? First extends '\\'
      ? Rest extends [infer Escaped extends string, ...infer After extends string[]]
        ? TakeGroup<After, Depth, [...Out, First, Escaped]>
        : [Out, []]
      : First extends '['
        ? TakeClass<Rest> extends [
            infer Class extends string[],
            infer After extends string[],
          ]
          ? TakeGroup<After, Depth, [...Out, ...Class]>
          : [Out, []]
        : First extends '('
          ? TakeGroup<Rest, [unknown, ...Depth], [...Out, First]>
          : First extends ')'
            ? Depth extends [unknown]
              ? [Out, Rest]
              : TakeGroup<Rest, Depth extends [unknown, ...infer Tail] ? Tail : [], [...Out, First]>
            : TakeGroup<Rest, Depth, [...Out, First]>
    : [Out, []];

type TakeName<
  T extends string[],
  Out extends string = '',
> = T extends []
  ? [Out, []]
  : T extends [infer First extends string, ...infer Rest extends string[]]
    ? First extends '>'
      ? [Out, Rest]
      : TakeName<Rest, `${Out}${First}`>
    : [Out, []];

type GroupHeader<T extends string[]> = T extends ['?', ':', ...infer Rest extends string[]]
  ? ['plain', '', Rest]
  : T extends ['?', '=', ...infer Rest extends string[]]
    ? ['lookahead', '', Rest]
    : T extends ['?', '!', ...infer Rest extends string[]]
      ? ['negative-lookahead', '', Rest]
      : T extends ['?', '<', ...infer Rest extends string[]]
        ? TakeName<Rest> extends [infer Name extends string, infer After extends string[]]
          ? ['capture', Name, After]
          : ['capture', '', Rest]
        : ['capture', '', T];

type HasTopLevelBar<T extends string[]> = T extends []
  ? false
  : T extends ['\\', string, ...infer Rest extends string[]]
    ? HasTopLevelBar<Rest>
    : T extends ['[', ...infer Rest extends string[]]
      ? TakeClass<Rest> extends [unknown, infer After extends string[]]
        ? HasTopLevelBar<After>
        : false
      : T extends ['(', ...infer Rest extends string[]]
        ? TakeGroup<Rest> extends [unknown, infer After extends string[]]
          ? HasTopLevelBar<After>
          : false
        : T extends ['|', ...string[]]
          ? true
          : T extends [string, ...infer Rest extends string[]]
            ? HasTopLevelBar<Rest>
            : false;

type SkipToBraceEnd<T extends string[]> = T extends []
  ? []
  : T extends [infer First extends string, ...infer Rest extends string[]]
    ? First extends '}'
      ? Rest
      : SkipToBraceEnd<Rest>
    : [];

type SkipQuantifier<T extends string[]> = T extends ['*', '?', ...infer Rest extends string[]]
  ? Rest
  : T extends ['+', '?', ...infer Rest extends string[]]
    ? Rest
    : T extends ['?', '?', ...infer Rest extends string[]]
      ? Rest
      : T extends ['*', ...infer Rest extends string[]]
        ? Rest
        : T extends ['+', ...infer Rest extends string[]]
          ? Rest
          : T extends ['?', ...infer Rest extends string[]]
            ? Rest
            : T extends ['{', ...infer Rest extends string[]]
              ? SkipToBraceEnd<Rest> extends [infer First extends string, ...infer After extends string[]]
                ? First extends '?'
                  ? After
                  : [First, ...After]
                : []
              : T;

type IsZeroPrefix<T extends string[]> = T extends ['0', ...string[]] ? true : false;

type QuantifierIsOptional<T extends string[]> = T extends ['*', ...string[]]
  ? true
  : T extends ['?', ...string[]]
    ? true
    : T extends ['+', ...string[]]
      ? false
      : T extends ['{', ...infer Rest extends string[]]
        ? IsZeroPrefix<Rest> extends true
          ? true
          : false
        : false;

type CaptureInfo<Name extends string | undefined, Optional extends boolean> = {
  name: Name;
  optional: Optional;
};

type ScanPattern<
  T extends string[],
  Optional extends boolean = false,
  InLookahead extends boolean = false,
  Out extends CaptureInfo<string | undefined, boolean>[] = [],
> = T extends []
  ? Out
  : T extends ['\\', string, ...infer Rest extends string[]]
    ? ScanPattern<Rest, Optional, InLookahead, Out>
    : T extends ['[', ...infer Rest extends string[]]
      ? TakeClass<Rest> extends [unknown, infer After extends string[]]
        ? ScanPattern<After, Optional, InLookahead, Out>
        : Out
      : T extends ['(', ...infer Rest extends string[]]
        ? TakeGroup<Rest> extends [infer Body extends string[], infer AfterClose extends string[]]
          ? GroupHeader<Body> extends [
              infer Kind extends string,
              infer Name extends string,
              infer Inner extends string[],
            ]
            ? QuantifierIsOptional<AfterClose> extends infer QuantOptional extends boolean
              ? SkipQuantifier<AfterClose> extends infer AfterQuant extends string[]
                ? HasTopLevelBar<Inner> extends true
                  ? ScanGroup<
                      Kind,
                      Name,
                      Inner,
                      AfterQuant,
                      Optional,
                      InLookahead,
                      true,
                      QuantOptional,
                      Out
                    >
                  : ScanGroup<
                      Kind,
                      Name,
                      Inner,
                      AfterQuant,
                      Optional,
                      InLookahead,
                      false,
                      QuantOptional,
                      Out
                    >
                : Out
              : Out
            : Out
          : Out
        : T extends [string, ...infer Rest extends string[]]
          ? ScanPattern<Rest, Optional, InLookahead, Out>
          : Out;

type ScanGroup<
  Kind extends string,
  Name extends string,
  Inner extends string[],
  AfterQuant extends string[],
  ParentOptional extends boolean,
  InLookahead extends boolean,
  HasBar extends boolean,
  QuantOptional extends boolean,
  Out extends CaptureInfo<string | undefined, boolean>[],
> = Kind extends 'capture'
  ? [
      ...Out,
      CaptureInfo<
        Name extends '' ? undefined : Name,
        ParentOptional extends true ? true : InLookahead extends true ? true : QuantOptional
      >,
      ...ScanPattern<
        Inner,
        ParentOptional extends true
          ? true
          : QuantOptional extends true
            ? true
            : InLookahead extends true
              ? true
              : HasBar,
        InLookahead
      >,
      ...ScanPattern<AfterQuant, ParentOptional, InLookahead>,
    ]
  : [
      ...Out,
      ...ScanPattern<
        Inner,
        ParentOptional extends true
          ? true
          : QuantOptional extends true
            ? true
            : InLookahead extends true
              ? true
              : HasBar,
        Kind extends 'lookahead' | 'negative-lookahead' ? true : InLookahead
      >,
      ...ScanPattern<AfterQuant, ParentOptional, InLookahead>,
    ];

type PatternCaptures<P extends string> = HasTopLevelBar<CharList<P>> extends true
  ? ScanPattern<CharList<P>, true>
  : ScanPattern<CharList<P>>;

type CaptureValue<I> = I extends { optional: true } ? string | undefined : string;

type CapturesTuple<
  I extends CaptureInfo<string | undefined, boolean>[],
  Out extends unknown[] = [string],
> = I extends [infer First, ...infer Rest extends CaptureInfo<string | undefined, boolean>[]]
  ? CapturesTuple<Rest, [...Out, CaptureValue<First>]>
  : Out;

type NamedGroups<
  I extends CaptureInfo<string | undefined, boolean>[],
> = I[number] extends infer One
  ? One extends { name: infer Name extends string; optional: infer Optional extends boolean }
    ? Name extends ''
      ? never
      : { [Key in Name]: Optional extends true ? string | undefined : string }
    : never
  : never;

type MergeGroups<T> = {
  [Key in T extends Record<string, unknown> ? keyof T : never]: T extends Record<Key, infer Value>
    ? Value
    : never;
};

type LiteralResult<P extends string> = {
  captures: CapturesTuple<PatternCaptures<P>>;
  groups: MergeGroups<NamedGroups<PatternCaptures<P>>>;
};

type DynamicResult = {
  captures: [string, ...(string | undefined)[]];
  groups: Record<string, string | undefined>;
};

export type MatchShape<P extends string> = string extends P ? DynamicResult : LiteralResult<P>;

export interface Match<P extends string = string> {
  index: number;
  captures: MatchShape<P>['captures'];
  groups: MatchShape<P>['groups'];
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
