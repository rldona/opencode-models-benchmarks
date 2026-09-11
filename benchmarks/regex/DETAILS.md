# regex — Detalle de la nota

Generado por `node scripts/bench.mjs report`. Cómo se calcula: [RUBRIC.md](RUBRIC.md).

## Ranking

| # | Modelo | Nota | Corrección /6 | Autonomía /1 | Tests propios /1 | Código /1.5 | Robustez /0.5 | Penalización |
|---|---|---|---|---|---|---|---|---|
| 1 | DeepSeek V4.1 Flash | **8.7** | 5.91 | 1 | 0.95 | 1.35 | 0.5 | -1 |
| 2 | GPT-5.6 Luna | **8.7** | 5.68 | 1 | 0.95 | 0.6 | 0.5 |  |

## DeepSeek V4.1 Flash — 8.7

> Implementación muy sólida: motor propio (sin depender del RegExp del lenguaje salvo validaciones auxiliares) con backtracking memoizado para garantizar tiempo lineal y un motor NFA incremental genuino para streaming, tipos a nivel de tipos correctos y tests exhaustivos comparados contra RegExp nativo. El defecto más relevante es que el streaming con el flag 'y' se degrada a un modo buffer-and-wait que no entrega coincidencias a tiempo ni limita la memoria usada, sin que los propios tests lo detecten.

- **Corrección** 5.91/6: suite oculta 554/561 (main: 2 caso(s) colgaron o tumbaron el proceso y se aislaron (285, 379)) · por bloque (ponderados): **semantica 351/355** (40) · rendimiento 14/14 (20) · streaming 77/77 (15) · **tipos 40/43** (15) · retro 72/72 (10) — capturas 37/37 · cuantificadores 19/19 · alternancia 8/8 · **clases 23/25** · anclas 19/19 · flags 14/14 · mayusculas 38/38 · unicode 23/23 · retro 22/22 · lookahead 15/15 · sintaxis 22/22 · **azar 148/150** · azar-retro 35/35 · streaming 45/45 · a-tiempo 32/32 · rendimiento 14/14 · **tipos 40/43**
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 0.95/1: pasan 0.25/0.25 (349/349) · cobertura 0.25/0.25 · cantidad 0.25/0.25 · calidad 0.2/0.25 (8/10)
- **Código** 1.35/1.5 (9/10)
- **Robustez** 0.5/0.5 · **Penalización** -1 (usa el motor de expresiones del lenguaje en tareas auxiliares: src/parser.ts líneas 336, 371, 390, 426 y 456: usa literales /regex/.test(...) solo para validar identificadores de nombre de grupo y dígitos hexadecimales de escapes, no para hacer coincidir el patrón de entrada.)
- Cobertura de lo pedido: ✅ capturasRepeticion · ✅ perezososCodiciosos · ✅ mayusculas · ✅ paresSustitutos · ✅ lastIndex · ✅ tiempoLineal · ✅ streaming · ✅ tipos

**Código**

- + Arquitectura en fases limpia: parser a AST, compilador a bytecode tipo VM (Save/Clear/Split/Loop/LoopBack/SetReg/EmptyCheck), y dos motores de ejecución bien separados.
- + Backtracker con memoización de estados (pc, pos) fallidos/activos que garantiza tiempo lineal cuando no hay backreferences ni lookahead, incluyendo un análisis de qué instrucciones son 'sensibles a registro' (dependientes de la iteración del bucle) para excluirlas de la memoización de forma correcta.
- + Motor de streaming (NfaStream) es una auténtica simulación Thompson-NFA incremental con hilos, pausas en asserts que dependen de más texto, y compactación del buffer reteniendo solo lo necesario; no es un buffer-and-reprocess.
- + Semántica de ECMAScript centralizada (canonicalización de 'i' con y sin 'u', puntos de código con pares sustitutos, limpieza de capturas por iteración) en chars.ts/casefold.ts, sin duplicación evidente ni 'any'.
- − stream() cae a BufferedStream (que acumula todo el buffer y no libera matches hasta end()) en cuanto el patrón tiene el flag 'y', aunque no tenga backreferences ni lookahead, incumpliendo el requisito de entrega temprana y de guardar solo el texto necesario para ese caso.
- − El mismo fallback se activa si loopCount > 30, un límite arbitrario no documentado en el enunciado que podría afectar a patrones complejos legítimos.
- − Alguna duplicación entre Backtracker.search/matchAt (construcción de captures, normalización unicode) que podría factorizarse.

**Tests**

- + La mayoría de los tests de exec/sintaxis comparan directamente contra el RegExp nativo (incluyendo lastIndex), lo que da valores esperados independientes de la implementación.
- + Tests de streaming muy rigurosos: comparan contra matchAll con distintos tamaños de trozo y además verifican el momento exacto de entrega feed a feed (p. ej. 'waits while a greedy repetition could still extend', '\d+' definitividad, división de pares sustitutos entre chunks).
- + Casos límite bien cubiertos: mayúsculas Unicode con 'i'/'iu' (ẞ, Kelvin sign, ſ, Ω), backreferences a grupos no participantes, lastIndex con valores fuera de rango tipo ToLength, patrones inválidos variados.
- + Test de rendimiento explícito para streaming (2MB en chunks de 1KB) y para tiempo lineal con los tres patrones patológicos del enunciado más 'a*b' sobre 100k caracteres.
- − Los tests de tipos no usan aserciones de igualdad de tipos (p. ej. expectTypeOf); solo asignan a variables anotadas, lo que no detecta si un campo que debería ser 'string' es en realidad más amplio.
- − No hay ningún test que distinga el comportamiento de streaming con flag 'y' en cuanto al momento exacto de entrega (el test de sticky solo compara el resultado final agregado), por lo que no detecta el bug de BufferedStream para ese caso.

**Bugs detectados por el juez**

- 🐛 stream() con el flag 'y' usa BufferedStream incluso sin backreferences ni lookahead: todas las coincidencias se retrasan hasta end() y se guarda el texto completo en memoria, en vez de entregarlas en cuanto son definitivas y liberar el buffer no necesario (src/regex.ts líneas 72-82).
- 🐛 El mismo fallback a BufferedStream se dispara cuando loopCount > 30, un límite interno no derivado del enunciado que penaliza patrones legítimos con muchas repeticiones anidadas.

**Casos de la suite oculta que fallan**

- ✗ [072] clase vacía no coincide nunca
- ✗ [073] [^] coincide con todo
- ✗ [285] azar $|(?:[a-c]?)*(b)b?? /i
- ✗ [379] azar (b{0,2}((?<g3>$.*?c|b?)+?b??)?)(?:c) /
- ✗ [538] alternativa dentro del grupo: el grupo es obligatorio
- ✗ [539] alternativa con rama vacía dentro del grupo
- ✗ [540] grupo en una rama de un grupo

<sub>Juez: claude:sonnet · 2026-09-11 19:40 · adaptador: [results/deepseek-v4.1-flash.adapter.ts](results/deepseek-v4.1-flash.adapter.ts)</sub>

## GPT-5.6 Luna — 8.7

> Motor sólido en su núcleo (Pike VM lineal más backtracking acotado para retrorreferencias/lookahead, plegado Unicode cuidadoso y una batería diferencial muy completa contra RegExp nativo), pero el cumplimiento del requisito de streaming lineal se consigue mediante un atajo hardcodeado para el patrón exacto del ejemplo del enunciado, no mediante un algoritmo genuinamente lineal en el caso general.

- **Corrección** 5.68/6: suite oculta 540/561 · por bloque (ponderados): **semantica 344/355** (40) · **rendimiento 12/14** (20) · **streaming 74/77** (15) · tipos 43/43 (15) · **retro 67/72** (10) — capturas 37/37 · cuantificadores 19/19 · alternancia 8/8 · clases 25/25 · anclas 19/19 · flags 14/14 · mayusculas 38/38 · unicode 23/23 · **retro 21/22** · lookahead 15/15 · sintaxis 22/22 · **azar 139/150** · **azar-retro 31/35** · **streaming 43/45** · **a-tiempo 31/32** · **rendimiento 12/14** · tipos 43/43
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 0.95/1: pasan 0.25/0.25 (33/33) · cobertura 0.25/0.25 · cantidad 0.25/0.25 · calidad 0.2/0.25 (8/10)
- **Código** 0.6/1.5 (4/10)
- **Robustez** 0.5/0.5
- Cobertura de lo pedido: ✅ capturasRepeticion · ✅ perezososCodiciosos · ✅ mayusculas · ✅ paresSustitutos · ✅ lastIndex · ✅ tiempoLineal · ✅ streaming · ✅ tipos

**Código**

- + Arquitectura clara: parser a AST, compilación a un autómata tipo Pike VM (hilos con prioridad, sin backtracking) para el camino rápido, y una vía separada de backtracking acotado solo para backreferencias y lookahead.
- + Semántica ECMAScript cuidada y centralizada: lectura por punto de código con pares sustitutos, plegado de mayúsculas Unicode y no-Unicode con los casos especiales documentados (Kelvin, ẞ/ß, İ/ı, ſ/s).
- − El rendimiento lineal del streaming que exige el enunciado (2 MB en trozos de 1 KB con \d+ en menos de 2 s) solo se cumple porque hay un atajo hardcodeado (`fastDigits`) que se activa únicamente si `source === '\\d+'` exactamente; con un patrón equivalente ('(?:\\d)+') procesar solo 200 KB tarda ~30 s, deja claro que el motor de streaming general no es lineal.
- − `isDefinitive()` decide si una coincidencia es definitiva probando un conjunto fijo de caracteres 'sonda' y reejecutando el matcher sobre el buffer, en vez de razonar sobre el estado de los hilos del autómata; no es una garantía formal y reprocesa el buffer completo en cada `feed`.
- − Hay parches específicos para la forma exacta de un patrón (p. ej. `isBareNotWordAssertion`, que desactiva el ajuste de posición inicial con pares sustitutos solo cuando el patrón es literalmente `\\B`) en vez de una regla general para la interacción sticky+unicode+aserciones.

**Tests**

- + Batería diferencial muy amplia contra RegExp nativo (~90 patrones × 17 entradas × 8 combinaciones de flags) con valores esperados calculados de forma independiente, más allá de lo pedido.
- + Tests de streaming con valores exactos de qué devuelve cada `feed`/`end`, incluida la división de pares sustitutos entre trozos y coincidencias vacías.
- + Tests de tipos con `@ts-expect-error` en los accesos que deben fallar y comprobación de los tipos derivados para capturas posicionales y con nombre.
- − El único test de rendimiento de streaming usa exactamente el patrón ('\\d+') que activa el atajo hardcodeado, por lo que no ejercita de verdad la linealidad del motor general de streaming.
- − Los tests de tipos comprueban con asignaciones y errores esperados, no con aserciones de igualdad de tipos (p. ej. un `expectTypeOf`), lo que deja pasar tipos más anchos de lo debido.

**Bugs detectados por el juez**

- 🐛 El rendimiento lineal de streaming solo se cumple para el patrón literal '\\d+' gracias a un atajo hardcodeado (`fastDigits` en `RegexStreamImplementation`); un patrón equivalente como '(?:\\d)+' tarda ~30 s en procesar solo 200 KB en trozos de 1 KB, muy por encima del presupuesto de 2 s por 2 MB del enunciado.
- 🐛 `isDefinitive()` usa un conjunto fijo de caracteres de sondeo para decidir si una coincidencia de streaming es definitiva en vez de razonar sobre el estado real del autómata, por lo que no hay garantía formal de que cubra todos los patrones/clases posibles.
- 🐛 El ajuste de posición inicial para evitar partir un par sustituto con flags 'u'+stateful se desactiva mediante un caso especial ad-hoc (`isBareNotWordAssertion`) solo cuando el patrón completo es `\\B`, en vez de una regla general para esa interacción.

**Casos de la suite oculta que fallan**

- ✗ [201] a grupo reiniciado en la iteración (1)
- ✗ [263] azar (?<g1>)? /
- ✗ [267] azar ((?:)((?:[^a]\w)+(a+A*|\b\b^))??$){0,2}| /iu
- ✗ [268] azar ((?<g2>)(?<g3>))?b? /
- ✗ [281] azar ((([ab]|$|[ab]*?))(?<g4>()){1,2}?)? /g
- ✗ [286] azar .?\w((?<g2>(\d?|bc[ab])?a)) /s
- ✗ [288] azar \w{0,2}()A|.|\s(?:([ab]+?(?:\b)??.){2}) /s
- ✗ [297] azar a|()?| /gi
- ✗ [319] azar ((?:))(((c\s*?)|(?:\B){2,}?|)*){2} /i
- ✗ [322] azar \B(|)? /
- ✗ [331] azar [ab]*()? /i
- ✗ [344] azar ((?<g2>b[^a])?){1,2}.{0,2}? /m
- ✗ [398] azar (?<g1>b*\1)+ /i
- ✗ [400] azar (\1(?:(?=\sb*\d?))??) /
- ✗ [401] azar b{2,}|b(bA*\1)(?=)|(())+ /g
- ✗ [412] azar (\s|\1[a-c]+?|)+(.)+? /s
- ✗ [432] stream: vacío con u avanza por punto de código
- ✗ [454] stream: azar ()?(?:[^a]*){0,2} /s
- ✗ [484] a tiempo: repetición de grupo
- ✗ [517] stream: emails sobre 1 MB en trozos de 997
- ✗ [518] stream: (a|a)*b con una coincidencia de 200.000

<sub>Juez: claude:sonnet · 2026-09-11 20:44 · adaptador: [results/gpt-5.6-luna.adapter.ts](results/gpt-5.6-luna.adapter.ts)</sub>
