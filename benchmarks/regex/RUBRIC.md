# Regex — Cómo se calcula la nota (0-10)

Prueba diferenciadora, pensada para que llegar al 9–10 cueste incluso a los modelos de frontera. Combina cuatro problemas que chocan entre sí:
- **Semántica exacta de ECMAScript.** La especificación la define con backtracking.
- **Tiempo lineal.** Descarta el backtracking.
- **Streaming con emisión en el momento exacto.** Es un requisito nuevo, sin un motor existente que copiar.
- **Tipos deducidos del patrón.** Exige escribir un parser en el sistema de tipos de TypeScript.

Pesos en [bench.json](bench.json); fórmula en `computeScore` de [scripts/bench.mjs](../../scripts/bench.mjs).

| Bloque | Máx | De dónde sale |
|---|---|---|
| **Corrección** | 6 | Suite oculta de 561 casos, **ponderada por bloques** (tabla de abajo): cada bloque pesa lo indicado sea cual sea su número de casos. 0 si no se pudo conectar la solución. |
| **Autonomía** (no bloquea) | 1 | 0 intervenciones = 1 · 1 = 0,5 · 2 o más = 0. 0 si no terminó o hubo timeout (90 min). La fase *plan* es libre; en autopiloto cada "Continúa" automático cuenta. |
| **Tests propios** | 1 | ¼ pasan al re-ejecutarlos · ¼ escenarios pedidos cubiertos (juez, 8) · ¼ cantidad (10+ tests) · ¼ calidad (juez) |
| **Calidad de código** | 1,5 | Nota del juez sobre 10 |
| **Robustez** | 0,5 | ½ `tsc` limpio · ½ sin dependencias extra |
| **Motor prohibido** | nota 0 | Si el código de `src/` usa `RegExp`, literales `/…/`, `eval`, `Function`, `child_process`, `worker_threads` o `vm` (análisis estático), o si el juez ve que delega en el motor del lenguaje por otra vía (`String.prototype.match` con un texto, etc.) |
| **Penalización** | −1,5 | Otros paquetes externos importados desde el código |

## Suite oculta

| Bloque | Peso | Casos | Qué mide |
|---|---|---|---|
| `semantica` | 40 | 355 | capturas dentro de repeticiones (reinicio por iteración, regla del bucle vacío), perezosos, alternancia, clases y escapes, anclas, flags y `lastIndex`, `i` con y sin `u` (ſ, signo Kelvin, sigma final, ß…), pares sustitutos, errores de sintaxis, y 150 patrones al azar |
| `retro` | 10 | 72 | retrorreferencias (a grupos que no participan, hacia delante, insensibles a mayúsculas) y lookahead (atómico, capturas en negativos), con 35 al azar |
| `streaming` | 15 | 77 | 45 comparan la lista final con trozos que cortan coincidencias y pares sustitutos; 32 comprueban **lo que devuelve cada `feed`** (ni antes ni después) |
| `rendimiento` | 20 | 14 | patrones patológicos para el backtracking (`(a|a)*b`, `(x+x+)+y`, `(?:a?){25}a{25}`…), búsqueda cuadrática (`a*b` sobre 100.000 `a`, `.*.*=.*`), capturas enormes, `iu` y astrales; streaming de 1–2 MB. Límite 1–2 s por caso. **V8 no pasa varios**: tarda 5–11 s en `a*b` y `.*.*=.*` |
| `tipos` | 15 | 43 | número de grupos y tupla `captures`, opcionalidad (`?`, `*`, `{0,…}`, perezosos, alternativas, lookahead, anidada), grupos con nombre, escapes y clases que contienen paréntesis, patrón no literal, tipos en `stream()`; los accesos que deben fallar llevan `@ts-expect-error` |

`DETAILS.md` muestra, para cada modelo, los aciertos por bloque y por categoría.

Cómo se calcula lo esperado ([oracle/gen-cases.mjs](judge/oracle/gen-cases.mjs)); nada está escrito a mano:
- **Resultados de ejecución:** `RegExp` de V8. Solo se conservan los casos en los que **JavaScriptCore** (el motor de Safari) da exactamente lo mismo, así la suite mide la especificación y no las peculiaridades de un motor.
- **Streaming a tiempo:** para cada prefijo del texto se prueban todas las continuaciones cortas, y es definitivo lo que todas comparten. El caso se descarta si ese resultado cambia al alargar las continuaciones.
- **Rendimiento:** las huellas se calculan con el motor lineal experimental de V8, salvo los casos sin coincidencia evidente, en los que el texto no contiene el carácter que exige el patrón.
- **Tipos:** se compilan con `tsc` **7.0.2**, fijado por el benchmark e igual para todos, sea cual sea la versión que instale cada modelo.

Toda la suite se valida con una solución de referencia: pasa el 100 % de lo que no depende del rendimiento, y en rendimiento pasa todo lo que V8 puede ejecutar.

Para regenerar: `node benchmarks/regex/judge/oracle/gen-cases.mjs`. Necesita macOS, porque usa JavaScriptCore.

## Juez y adaptador

El enunciado fija la API exacta, así que el adaptador de [judge/bench/contract.ts](judge/bench/contract.ts) solo re-exporta `compile` de la solución, sin envolverla, para que los tests de tipos vean sus tipos originales. El juez (por defecto `claude:sonnet`) comprueba además que `src/` no delegue en el motor del lenguaje por vías que el análisis estático no ve, y valora código y tests. La suite oculta se pasa sobre una copia del proyecto sin cambios del juez.
