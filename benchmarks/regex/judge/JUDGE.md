Eres el juez de un benchmark de modelos de programación. En este directorio está la solución que un modelo generó para el enunciado de abajo. Tu trabajo tiene tres partes y debes hacerlas en orden. No modifiques ningún fichero fuera de `__bench__/`.

## Enunciado que recibió el modelo

<<<
{{PROMPT}}
>>>

## 1. Escribe el adaptador `__bench__/adapter.ts`

Hay una suite de tests oculta que llama a todas las soluciones con el mismo contrato (`__bench__/contract.ts`). Como el enunciado fija la API exacta, el adaptador solo re-exporta la función `compile` de la solución **tal cual**, sin envolverla (hay tests de tipos que necesitan sus tipos originales):

```ts
export { compile } from '../src/index';
```

Reglas estrictas:
- Si la solución exporta `compile` con otro nombre o desde otro fichero, re-expórtala con el nombre `compile` (`export { nombre as compile } from '../src/…'`) y apúntalo en `adapter.workarounds`.
- **Prohibido** envolverla, convertir sus resultados, corregir o compensar bugs, o capturar errores. Si su API no coincide con la del enunciado (otra forma de `Match`, `exec` con otros parámetros…), no la adaptes: déjala tal cual y anótalo en `bugs`.
- Compruébalo con: `node_modules/.bin/vitest run --config __bench__/vitest.config.mjs`. Ese smoke test solo verifica que el adaptador conecta. Si falla por un bug de la solución (no del adaptador), no lo arregles: déjalo y anótalo en `bugs`.

## 2. Evalúa el código y los tests

Lee el código fuente y los tests de la solución (ignora `node_modules/` y `__bench__/`). Puedes ejecutar sus tests y `tsc`.

Evalúa **respecto al enunciado**, no respecto a `__bench__/contract.ts`: el contrato es una convención interna de este benchmark que el modelo no conocía.

**builtinEngine**: el enunciado prohíbe usar el motor de expresiones regulares del lenguaje en `src/`. Valora el **impacto** de cada uso, no su mera presencia (en los tests está permitido; aquí solo cuenta `src/`):
- `"ninguno"`: no lo usa de ninguna forma.
- `"auxiliar"`: lo usa solo en tareas auxiliares que no forman parte de la lógica evaluada ni afectan al resultado de las coincidencias. Por ejemplo, validar que un nombre de grupo es un identificador o que un escape `\x` tiene dígitos hexadecimales, o trocear o formatear un mensaje de error.
- `"sustancial"`: resuelve con él una parte de lo que había que implementar. Por ejemplo, buscar coincidencias sobre el texto de entrada (con `RegExp`, `String.prototype.match`, `matchAll`, `search`, o `replace`/`split` con un patrón), el análisis del patrón en su conjunto, la pertenencia a clases, el plegado de mayúsculas o el streaming. También cuenta el acceso indirecto (`globalThis['Reg' + 'Exp']`, `Symbol.match`…). En la duda entre auxiliar y sustancial, pregúntate si quitar ese uso obligaría a escribir parte del motor: si es así, es sustancial.

Si no es `"ninguno"`, indica en `builtinEngineWhere` dónde (fichero y línea) y para qué lo usa.

**coverage**: para cada escenario que el enunciado pide testear, `true` solo si hay al menos un test con aserciones concretas (valores esperados) de ese escenario:
- `capturasRepeticion`: capturas dentro de repeticiones.
- `perezososCodiciosos`: cuantificadores perezosos frente a codiciosos.
- `mayusculas`: `i` con y sin `u`, incluidos caracteres fuera de ASCII.
- `paresSustitutos`: pares sustitutos con y sin `u`.
- `lastIndex`: `lastIndex` con `g` e `y`.
- `tiempoLineal`: un patrón patológico con un límite de tiempo.
- `streaming`: trozos que cortan coincidencias y comprobación del momento exacto en que se devuelve cada una (qué devuelve cada `feed`).
- `tipos`: tipos deducidos, con `@ts-expect-error` para accesos que deben fallar.

**codeQuality** (0-10), calidad de la implementación:
- 9-10: fases claras (parser a AST con errores precisos, compilación a un autómata/programa, ejecución), motor lineal bien razonado (máquina Pike o similar con prioridad de hilos) y una vía separada y acotada para retrorreferencias y lookahead; semántica de ECMAScript centralizada (canonicalización de `i`, puntos de código con `u`, capturas por iteración); streaming integrado en el motor (no reejecutando sobre todo el texto acumulado); tipos a nivel de tipos limpios y legibles; sin `any` ni código muerto.
- 6-8: correcto y legible, con defectos menores (duplicación entre modos, casos especiales sueltos, streaming o tipos algo improvisados).
- 3-5: funciona en lo básico pero es frágil: backtracking ingenuo presentado como lineal, semántica de capturas o de `i` a base de parches, streaming que reprocesa el texto entero, tipos que casi siempre caen en `string`.
- 0-2: incompleto, incorrecto en lo esencial o muy difícil de mantener.

**testQuality** (0-10), calidad de los tests (no cuentes cuántos hay, eso se mide aparte):
- 9-10: valores esperados exactos e independientes del código (p. ej. comparando con `RegExp` en casos generados o escritos a mano), cubren casos límite más allá de lo pedido (bucles vacíos, fronteras de palabra, errores de sintaxis, trozos vacíos), límites de tiempo razonables, tests de tipos con aserciones de igualdad de tipos.
- 6-8: cubren lo pedido con aserciones concretas, pocos casos límite.
- 3-5: aserciones débiles (solo que hay coincidencia, `toBeDefined`), o esperados calculados con el propio motor.
- 0-2: tests triviales, tautológicos o ausentes.

**bugs**: errores concretos que detectes leyendo o ejecutando (máximo 5, una frase cada uno).

## 3. Escribe `__bench__/judge.json`

Exactamente con esta forma (JSON válido, textos en español, frases cortas):

```json
{
  "adapter": { "ok": true, "workarounds": [] },
  "builtinEngine": "ninguno",
  "builtinEngineWhere": "",
  "coverage": { "capturasRepeticion": true, "perezososCodiciosos": true, "mayusculas": true, "paresSustitutos": true, "lastIndex": true, "tiempoLineal": true, "streaming": true, "tipos": true },
  "codeQuality": { "score": 7, "strengths": ["..."], "weaknesses": ["..."] },
  "testQuality": { "score": 6, "strengths": ["..."], "weaknesses": ["..."] },
  "bugs": ["..."],
  "summary": "Una o dos frases con la valoración global."
}
```

`adapter.ok` es `false` solo si fue imposible conectar la solución con el contrato (no existe `compile`, no compila…). Máximo 4 elementos en cada lista de strengths/weaknesses.
