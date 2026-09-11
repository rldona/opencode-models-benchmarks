Eres el juez de un benchmark de modelos de programación. En este directorio está la solución que un modelo generó para el enunciado de abajo. Tu trabajo tiene tres partes y debes hacerlas en orden. No modifiques ningún fichero fuera de `__bench__/`.

## Enunciado que recibió el modelo

<<<
{{PROMPT}}
>>>

## 1. Escribe el adaptador `__bench__/adapter.ts`

Hay una suite de tests oculta que llama a todas las soluciones con el mismo contrato, definido en `__bench__/contract.ts`. Escribe `__bench__/adapter.ts` exportando:

```ts
import type { Expand } from './contract';
export const expand: Expand = (input) => { /* ... */ };
```

Reglas estrictas:
- Usa **solo la API pública de la solución** (lo que exporta su código fuente). Importa desde sus ficheros con rutas relativas (`../src/...`).
- El adaptador **solo traduce formatos**: construir los argumentos que espera la solución a partir de `input` (que trae la regla en texto y ya parseada, el inicio como hora local y como instante UTC, y la ventana) y convertir su salida a instantes ISO UTC. Para convertir entre hora local e instante puedes usar `__bench__/helpers.ts`.
- **Prohibido** calcular ocurrencias, corregir o compensar bugs de la solución, reordenar, deduplicar o filtrar resultados para "arreglarlos". Si la API de la solución no permite algo que pide el enunciado (p. ej. no acepta ventana), haz la adaptación mínima imprescindible y apúntala en `adapter.workarounds`.
- Compruébalo con: `node_modules/.bin/vitest run --config __bench__/vitest.config.mjs`. Ese smoke test solo verifica que el adaptador conecta. Si falla por un bug de la solución (no del adaptador), no lo arregles: déjalo y anótalo en `bugs`.

## 2. Evalúa el código y los tests

Lee el código fuente y los tests de la solución (ignora `node_modules/` y `__bench__/`). Puedes ejecutar sus tests.

Evalúa **respecto al enunciado**, no respecto a `__bench__/contract.ts`: el contrato (ventana `[from, to)`, formatos de entrada y salida) es una convención interna de este benchmark que el modelo no conocía. No penalices que la solución use otra convención razonable (p. ej. ventana cerrada, otra firma) donde el enunciado no dice nada.

**coverage**: para cada escenario que el enunciado pide testear, `true` solo si hay al menos un test con aserciones concretas (fechas u horas esperadas) de ese escenario:
- `dstOctubreMadrid`: evento semanal que cruza el cambio de hora de octubre en Europe/Madrid, comprobando que se mantiene la hora local.
- `ultimoViernes`: "último viernes de mes" (BYDAY=-1FR).
- `mesesSin31`: meses sin día 31.
- `countConByday`: COUNT combinado con BYDAY.

**codeQuality** (0-10), calidad de la implementación:
- 9-10: diseño claro y bien separado (parseo, cálculo de zona horaria, generación), tipos precisos sin `any`, algoritmo acotado y eficiente (no itera día a día sin límite), valida entradas y falla con errores claros, sin código muerto ni hacks.
- 6-8: correcto y legible, con defectos menores (algo de duplicación, validación incompleta, funciones largas).
- 3-5: funciona en lo básico pero es frágil: lógica enrevesada, casos límite ignorados, dependiente de la zona horaria de la máquina, tipos laxos.
- 0-2: incompleto, incorrecto en lo esencial o muy difícil de mantener.

**testQuality** (0-10), calidad de los tests (no cuentes cuántos hay, eso se mide aparte):
- 9-10: aserciones exactas sobre instantes y hora local, cubren casos límite más allá de lo pedido (UNTIL inclusivo, INTERVAL, ventanas parciales, varias zonas), valores esperados independientes del código (no calculados con la propia implementación), nombres descriptivos.
- 6-8: cubren lo pedido con aserciones concretas, pocos casos límite.
- 3-5: aserciones débiles (solo longitudes, `toBeDefined`, `> 0`), o esperados calculados con el propio código.
- 0-2: tests triviales, tautológicos o ausentes.

**bugs**: errores concretos que detectes leyendo o ejecutando (máximo 5, una frase cada uno).

## 3. Escribe `__bench__/judge.json`

Exactamente con esta forma (JSON válido, textos en español, frases cortas):

```json
{
  "adapter": { "ok": true, "workarounds": [] },
  "coverage": { "dstOctubreMadrid": true, "ultimoViernes": true, "mesesSin31": true, "countConByday": true },
  "codeQuality": { "score": 7, "strengths": ["..."], "weaknesses": ["..."] },
  "testQuality": { "score": 6, "strengths": ["..."], "weaknesses": ["..."] },
  "bugs": ["..."],
  "summary": "Una o dos frases con la valoración global."
}
```

`adapter.ok` es `false` solo si fue imposible conectar la solución con el contrato (API inexistente, no compila…). Máximo 4 elementos en cada lista de strengths/weaknesses.
