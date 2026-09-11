// Contrato común con el que la suite oculta llama a cualquier solución.
// El enunciado fija la API exacta, así que el juez escribe __bench__/adapter.ts re-exportando `compile` de la
// solución tal cual (sin envolverla: los tests de tipos necesitan sus tipos originales).

export interface Match {
  /** Posición de inicio en unidades UTF-16. */
  index: number;
  /** [0] texto de la coincidencia; [i] grupo i o undefined si no participó. */
  captures: ArrayLike<string | undefined>;
  /** Grupo con nombre → texto o undefined; {} si no hay grupos con nombre. */
  groups: Record<string, string | undefined>;
}

export interface RegexStream {
  feed(chunk: string): Match[];
  end(): Match[];
}

export interface Regex {
  readonly source: string;
  readonly flags: string;
  lastIndex: number;
  exec(input: string): Match | null;
  stream(): RegexStream;
}

/** Patrón o flags no válidos: lanza SyntaxError. */
export type Compile = (pattern: string, flags?: string) => Regex;
