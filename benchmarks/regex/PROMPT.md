En un proyecto TypeScript nuevo con Vitest, implementa un motor de expresiones regulares compatible con las de JavaScript. No uses librerías externas salvo Vitest y TypeScript. El código de `src/` no puede apoyarse en el motor del lenguaje: nada de `RegExp`, literales `/…/`, `eval`, `new Function`, procesos, workers ni `node:vm` (en los tests sí puedes usar `RegExp`, por ejemplo para comparar resultados).

API, exactamente esta y exportada desde `src/index.ts`:

```ts
compile(pattern: string, flags?: string): Regex

interface Regex {
  readonly source: string;              // el patrón recibido
  readonly flags: string;               // los flags, en el orden "gimsuy"
  lastIndex: number;
  exec(input: string): Match | null;
  stream(): RegexStream;
}
interface Match {
  index: number;                        // dónde empieza, en unidades UTF-16 (como en JavaScript)
  captures: …;                          // [0] el texto de la coincidencia; [i] el del grupo i, o undefined si no participó
  groups: …;                            // nombre de grupo → texto o undefined; {} si el patrón no tiene grupos con nombre
}
interface RegexStream {
  feed(chunk: string): Match[];
  end(): Match[];
}
```

Sintaxis y semántica: las de ECMAScript. `exec` debe dar exactamente el mismo resultado que `RegExp.prototype.exec` (posición, texto de cada grupo y `lastIndex`), incluidas las reglas de ECMAScript para las capturas dentro de repeticiones y para las repeticiones que coinciden con la cadena vacía. Debe soportar:
- Alternancia `|`; grupos con captura, `(?:…)` y con nombre `(?<nombre>…)` (nombres ASCII); retrorreferencias `\1`… y `\k<nombre>`; lookahead `(?=…)` y `(?!…)`.
- Cuantificadores `* + ? {n} {n,} {n,m}`, codiciosos y perezosos (con `?` detrás).
- `.`, clases `[…]` y `[^…]` con rangos, `\d \D \w \W \s \S`, anclas `^ $ \b \B`, y los escapes `\t \n \v \f \r \0 \cX \xHH \uHHHH`, `\u{…}` (solo con `u`) y los de los caracteres especiales.
- Flags `g i m s u y`, con su significado en JavaScript. Con `u` se trabaja por puntos de código (pares sustitutos) y `i` usa el plegado de mayúsculas de Unicode; sin `u`, por unidades UTF-16 y con la canonicalización que define la especificación para `i`.
- `lastIndex` como en `RegExp`: con `g` o `y`, `exec` empieza en `lastIndex` (`y` exige que la coincidencia empiece justo ahí) y lo deja al final de la coincidencia, o a 0 si no la hay; sin `g` ni `y`, busca desde el principio y no lo toca.
- Un patrón o unos flags no válidos (flag desconocido o repetido) lanzan `SyntaxError`, como `new RegExp`.

No hace falta soportar lookbehind, `\p{…}`, los flags `d` y `v`, ni grupos con nombre repetidos. Solo se evalúan patrones que también sean válidos con el flag `u` (sin las extensiones heredadas del Anexo B, como `]` o `{` sueltos o los escapes octales).

Tiempo lineal: si el patrón no tiene retrorreferencias ni lookahead, `exec` debe tardar, en el peor caso, un tiempo proporcional al tamaño del patrón (con las repeticiones `{n,m}` desplegadas) por la longitud del texto, incluida la búsqueda de la posición de inicio. Por ejemplo, `(a|a)*b`, `(x+x+)+y` o `.*.*=.*` sobre 50.000 caracteres sin coincidencia, y `a*b` sobre 100.000 `a`, deben tardar menos de 1 segundo. Con retrorreferencias o lookahead no hay requisito de tiempo.

Streaming: `stream()` crea un procesador independiente (no usa ni cambia `lastIndex`) que recibe el texto por trozos. Entre todas las llamadas a `feed` y `end` devuelve las mismas coincidencias, en el mismo orden, que llamar a `exec` una y otra vez sobre el texto completo con el flag `g` añadido (como `String.prototype.matchAll`: tras una coincidencia vacía se avanza una posición, un punto de código con `u`), con `index` relativo al texto completo. Cada llamada devuelve justo las coincidencias que ya son definitivas: una coincidencia es definitiva cuando ningún texto que pudiera llegar después (ni el fin del texto) podría cambiarla ni hacerla desaparecer, a ella ni a las anteriores. `feed` debe devolverla en cuanto lo sea, ni antes ni después, y `end` devuelve las que queden. Los trozos pueden cortar el texto por cualquier sitio, también entre las dos mitades de un par sustituto. Guarda solo el texto que haga falta para las coincidencias aún abiertas, no el texto completo. Con retrorreferencias o lookahead basta con que las coincidencias sean correctas (pueden devolverse más tarde, como muy tarde en `end`). Rendimiento: 2 MB en trozos de 1 KB con `\d+` deben procesarse en menos de 2 segundos.

Tipos: con un patrón literal, TypeScript debe deducir del patrón el tipo del resultado (también en las coincidencias de `stream`):
- `captures` es una tupla con el `[0]` más un elemento por grupo con captura; `groups` tiene exactamente una propiedad por grupo con nombre. Acceder a un índice o a un nombre que no existe es un error de compilación.
- `[0]` es `string`. Un grupo es `string` si participa en toda coincidencia, y `string | undefined` si puede no participar: está dentro de un cuantificador que admite cero repeticiones (`*`, `?`, `{0}`, `{0,m}`, también perezosos), dentro de una de las alternativas de un `|` o dentro de un lookahead.
- Con un `string` no literal: `captures` es `[string, ...(string | undefined)[]]` y `groups` es `Record<string, string | undefined>`.

```ts
const m = compile('(?<year>\\d{4})-(?<month>\\d\\d)(?:T(\\d\\d))?').exec(texto);
if (m) {
  m.groups.year;    // string
  m.captures[3];    // string | undefined
  m.groups.day;     // error de compilación
  m.captures[4];    // error de compilación
}
```

Escribe tests que cubran: capturas dentro de repeticiones, cuantificadores perezosos frente a codiciosos, `i` con y sin `u` (incluidos caracteres fuera de ASCII), pares sustitutos con y sin `u`, `lastIndex` con `g` e `y`, un patrón patológico que demuestre el tiempo lineal, streaming con trozos que corten coincidencias y el momento exacto en que se devuelve cada una, y los tipos deducidos (con `@ts-expect-error` para los accesos que deben fallar). `tsc --noEmit` debe pasar sin errores. Ejecuta los tests y no termines hasta que pasen todos.
