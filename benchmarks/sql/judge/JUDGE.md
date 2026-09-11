Eres el juez de un benchmark de modelos de programación. En este directorio está la solución que un modelo generó para el enunciado de abajo. Tu trabajo tiene tres partes y debes hacerlas en orden. No modifiques ningún fichero fuera de `__bench__/`.

## Enunciado que recibió el modelo

<<<
{{PROMPT}}
>>>

## 1. Escribe el adaptador `__bench__/adapter.ts`

Hay una suite de tests oculta que llama a todas las soluciones con el mismo contrato, definido en `__bench__/contract.ts`. Escribe `__bench__/adapter.ts` exportando:

```ts
import type { Query } from './contract';
export const query: Query = (tables, sql) => { /* ... */ };
```

Reglas estrictas:
- Usa **solo la API pública de la solución** (lo que exporta su código fuente). Importa desde sus ficheros con rutas relativas (`../src/...`).
- El adaptador **solo traduce formatos**: convertir `tables` (`{ nombre: { columns, rows } }`, filas como arrays) al formato que espera la solución y su resultado a `{ columns, rows }` con filas como arrays en el orden del SELECT.
- **Prohibido** interpretar o reescribir el SQL, calcular resultados, corregir o compensar bugs, reordenar, deduplicar o filtrar filas, o capturar errores: si la solución lanza, el error debe propagarse. Si la API de la solución no permite algo que pide el enunciado (p. ej. devuelve objetos y pierde columnas repetidas), haz la adaptación mínima imprescindible y apúntala en `adapter.workarounds`.
- Compruébalo con: `node_modules/.bin/vitest run --config __bench__/vitest.config.mjs`. Ese smoke test solo verifica que el adaptador conecta. Si falla por un bug de la solución (no del adaptador), no lo arregles: déjalo y anótalo en `bugs`.

## 2. Evalúa el código y los tests

Lee el código fuente y los tests de la solución (ignora `node_modules/` y `__bench__/`). Puedes ejecutar sus tests.

Evalúa **respecto al enunciado**, no respecto a `__bench__/contract.ts`: el contrato es una convención interna de este benchmark que el modelo no conocía.

**coverage**: para cada escenario que el enunciado pide testear, `true` solo si hay al menos un test con aserciones concretas (filas esperadas) de ese escenario:
- `nullNotInAgregados`: NULL en NOT IN y en agregados (COUNT/SUM/AVG con NULL).
- `leftJoin`: LEFT JOIN con filas sin pareja.
- `groupByHaving`: GROUP BY con HAVING.
- `orderByNullsLimit`: ORDER BY con NULL y LIMIT/OFFSET.
- `divisionEnteraReal`: división entera frente a real.
- `rendimiento`: el caso de rendimiento con tablas grandes y un límite de tiempo.

**codeQuality** (0-10), calidad de la implementación:
- 9-10: fases claras y separadas (lexer, parser a AST, resolución de nombres, evaluación/ejecución), tipos precisos sin `any`, semántica de NULL y de enteros/reales centralizada (no dispersa en cada operador), joins por igualdad con hash u otra estrategia eficiente, errores claros, sin código muerto ni hacks.
- 6-8: correcto y legible, con defectos menores (algo de duplicación, parser con casos especiales, validación incompleta).
- 3-5: funciona en lo básico pero es frágil: parser a base de expresiones regulares o `split`, precedencias incorrectas, casos límite ignorados, tipos laxos.
- 0-2: incompleto, incorrecto en lo esencial o muy difícil de mantener.

**testQuality** (0-10), calidad de los tests (no cuentes cuántos hay, eso se mide aparte):
- 9-10: aserciones exactas sobre filas, cubren casos límite más allá de lo pedido (precedencia, errores, columnas repetidas, DISTINCT, CASE, LIKE), valores esperados independientes del código, nombres descriptivos.
- 6-8: cubren lo pedido con aserciones concretas, pocos casos límite.
- 3-5: aserciones débiles (solo número de filas, `toBeDefined`), o esperados calculados con el propio motor.
- 0-2: tests triviales, tautológicos o ausentes.

**bugs**: errores concretos que detectes leyendo o ejecutando (máximo 5, una frase cada uno).

## 3. Escribe `__bench__/judge.json`

Exactamente con esta forma (JSON válido, textos en español, frases cortas):

```json
{
  "adapter": { "ok": true, "workarounds": [] },
  "coverage": { "nullNotInAgregados": true, "leftJoin": true, "groupByHaving": true, "orderByNullsLimit": true, "divisionEnteraReal": true, "rendimiento": true },
  "codeQuality": { "score": 7, "strengths": ["..."], "weaknesses": ["..."] },
  "testQuality": { "score": 6, "strengths": ["..."], "weaknesses": ["..."] },
  "bugs": ["..."],
  "summary": "Una o dos frases con la valoración global."
}
```

`adapter.ok` es `false` solo si fue imposible conectar la solución con el contrato (API inexistente, no compila…). Máximo 4 elementos en cada lista de strengths/weaknesses.
