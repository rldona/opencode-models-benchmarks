# SQL — Resultados

Prompt: [PROMPT.md](PROMPT.md) · Carpeta de trabajo de cada modelo: `models/<modelo>/sql/` · Datos en bruto: [results/](results/)

La tabla la regenera `node scripts/bench.mjs collect|judge|report --test sql`. Las columnas que no genera el script (a partir de **Notas**) se conservan tal cual. Desglose de la nota, aciertos por categoría y comentarios del juez: [DETAILS.md](DETAILS.md) · Cómo se calcula: [RUBRIC.md](RUBRIC.md).

| Modelo | Nota | Estado | Suite oculta | Cód. | Cal. tests | Cobertura | Aislamiento | Tests | Otras TZ | tsc | Deps extra | LOC src/test | T. activo | T. total | Intervenciones | Pasos | Tools (err) | Tok. in | Tok. out | Tok. razon. | Tok. caché | Coste | Variante | Notas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DeepSeek V4 Pro (New) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| DeepSeek V4.1 Flash |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| GLM-5.3-Flash |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| GPT-5.6 Luna |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Grok 4.6 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Hy4 preview |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Kimi K2.7 Code |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Kimi K3 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| LongCat-2.0 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| MiMo V2.5 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| MiMo V2.5 Pro |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| MiniMax-M2.7 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| MiniMax-M3 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Muse Spark 1.3 Contributor |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Qwen3.6 Plus |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Qwen3.7 Max |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Qwen3.7 Plus |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Qwen3.8 Flash |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Qwen3.8 Max |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

## Leyenda

- **Nota** (0-10): corrección 5 + autonomía 1 + tests propios 1,5 + código 2 + robustez 0,5 − penalización. Ver [RUBRIC.md](RUBRIC.md).
- **Suite oculta**: casos de referencia (173, resultados calculados con SQLite) que pasa la solución. **Cód.** / **Cal. tests**: nota del juez sobre 10. **Cobertura**: escenarios del enunciado que sus tests cubren según el juez.
- **Estado**: ✅ todos los tests del modelo pasan al re-ejecutarlos · ❌ alguno falla o no hay tests · ⏳ ejecutando · ⛔ sin proyecto (nota 0) o cortado por cuota (repetir) · ⚠️ avisos (ver el JSON).
- **Aislamiento**: ✅ limpio · 🔒 intentó leer fuera de su carpeta pero se bloqueó · ⚠️ accedió a otras rutas del repo (contaminado) · 👀 exploró tu carpeta personal fuera del benchmark (no contamina, pero se registra) · ℹ️ contexto del editor.
- **Otras TZ**: no aplica a esta prueba (—).
- **Deps extra**: dependencias distintas de `vitest`, `@vitest/*`, `typescript` y `@types/node`.
- **Intervenciones**: mensajes del usuario tras la aprobación del plan + preguntas durante la construcción. `corte` = respuestas cortadas por el límite de tokens.
- **T. activo** / **T. total**, **Pasos**, **Tools (err)**, **Tokens**, **Coste**: como en RRULE.
