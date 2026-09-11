# RRULE — Cómo se calcula la nota (0-10)

`node scripts/bench.mjs judge <slug>` (después de `collect`). La fórmula está en `computeScore` de [scripts/bench.mjs](../../scripts/bench.mjs).

| Bloque | Máx | De dónde sale |
|---|---|---|
| **Corrección** | 4 | Suite oculta de 19 casos ([judge/hidden/cases.json](judge/hidden/cases.json)): `4 × aciertos / 19`. 0 si no se pudo conectar la solución. |
| **Autonomía** (no bloquea) | 1 | 0 intervenciones del usuario = 1 · 1 = 0,5 · 2 o más = 0. 0 si la sesión no terminó o hubo timeout. Si la sesión empezó en el agente *plan* de opencode, el mensaje que aprueba el plan y pasa a *build* no cuenta. Las preguntas del modelo con la herramienta `question` durante la fase *plan* no cuentan (ese agente está para aclarar antes de aprobar y todos pasan por él); durante *build* cada una cuenta como una intervención. En autopiloto (`run`) no hay preguntas y cada "Continúa" automático cuenta como intervención. |
| **Tests propios** | 2 | 0,5 si todos pasan al re-ejecutarlos (proporcional y a la mitad si no) · 0,5 × escenarios pedidos cubiertos (juez) · 0,5 × min(nº tests / 10, 1) · 0,5 × calidad de tests del juez / 10 |
| **Calidad de código** | 2 | `2 × nota del juez / 10` |
| **Robustez** | 1 | 0,5 × proporción de ejecuciones en otras TZ que pasan · 0,25 `tsc` limpio (0,1 si no hay tsconfig) · 0,25 sin dependencias extra en package.json |
| **Sin proyecto** | nota 0 | Si la sesión terminó sin generar un proyecto (p. ej. se cortó por el límite de tokens y no siguió) |
| **Penalización** | −1,5 | Si el código de la solución (no los tests) importa paquetes externos (el enunciado lo prohíbe) |

## Suite oculta

Los 19 casos cubren lo que pide el enunciado y la semántica básica de RFC 5545: DST de octubre y marzo (Madrid, Nueva York, Sídney), `-1FR`, `2TU`, `1MO,-1MO`, `BYDAY` sin ordinal en MONTHLY, día 31 (RFC: los meses sin ese día se **saltan**, no se ajustan al último día), COUNT contado desde el inicio y no desde la ventana, UNTIL inclusivo, INTERVAL en semanas empezando a mitad de semana (WKST=MO), una regla infinita consultada en 2030 y una ventana vacía. Ningún caso tiene ocurrencias en los bordes de la ventana, así que da igual si la solución la trata como abierta o cerrada.

Los valores esperados se calcularon con un generador independiente (fuerza bruta día a día + `Intl`), sin ningún motor RRULE.

Como cada modelo inventa su propia API, el juez escribe un **adaptador** (`results/<slug>.adapter.ts`) que solo traduce formatos al contrato común ([judge/bench/contract.ts](judge/bench/contract.ts)). El juez no ve la suite oculta, trabaja sobre una copia fuera del repo y cualquier cambio suyo fuera de `__bench__/` se descarta antes de ejecutar la suite. Conviene revisar los adaptadores: deben ser unas pocas líneas sin lógica de fechas.

## Juez

Por defecto `claude:sonnet` (Claude Code en modo `-p`, sin MCP ni ajustes de usuario, con herramientas limitadas a leer, escribir en `__bench__/` y ejecutar vitest/tsc). Se usa un modelo que no compite para evitar que un modelo se juzgue a sí mismo. Alternativas: `--judge claude:opus` o `--judge opencode-go/<id>`.

La nota del juez tiene cierta variabilidad entre ejecuciones (±0,5 aprox. en la nota final). `judge` reutiliza el veredicto guardado salvo con `--force`. Así, re-ejecutar solo vuelve a pasar la suite oculta.
