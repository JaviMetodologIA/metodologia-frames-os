# ADR 0006 · Skills y mantenimiento

- Estado: aceptado · 2026-09-24
- Contexto: en Frames, las rutas R8 (extensiones y skills) y R9 (mantenimiento) eran contratos y CLIs de solo lectura. `skills-system-cli.ts` lanzaba `SSS_SCAFFOLD_GATE_AND_WORK_ORDER_REQUIRED` al aplicar. El eval recibía los aciertos ya escritos. `frames:maintain` inspeccionaba, planeaba y preparaba el handoff. En el handoff exigía que los archivos cambiados fueran el write set y aplicaba un tope fijo de 1200 líneas; no comparaba con el presupuesto de la orden, no corría doctor y no cerraba la documentación contra el diff. [CÓDIGO]

## Decisión

- **skills.build, vía local (L00–L05).** El loader, el chequeo de hashes, las dependencias y el recibo de activación de Frames se portan tal cual (`domains/skills/frames/`).
  - La extensión se arma dentro del run.
  - L03 la valida y prueba que una copia alterada queda `BLOCKED`.
  - `frames extend <run>` la instala en `local/` solo después del gate de L04. Esa carpeta nunca se versiona.
  - La ruta de Frames `04_estado/local/extensions` pasa a `local/extensions`. [CÓDIGO]
- **skills.build, vía sistema (S00–S09).** Estas piezas de Frames se usan sin cambios: la regla de demotion, la política de efectos, los schemas y el veredicto PASS/REVISE/UNKNOWN.
  - Cada caso del eval lo puntúa el clasificador del motor, candidato frente a base. El veredicto se calcula; no se declara.
  - Si la demotion decide que basta una instrucción, una referencia o una herramienta, el run termina ahí. [CÓDIGO]
- **meta.maintain (M00–M06).** Tiene tres gates humanos: `direction` en M02 (el cambio aprobado), `acceptance` en M04 (el candidato verificado) y `outcome` en M06 (la promoción). RT-01 conduce el run.
  - M00 congela el commit base y exige el árbol limpio.
  - M02 valida la orden de trabajo con los límites de Frames: 12 archivos, `writeSet = expectedOutputs` y 1200 líneas de cambio.
  - M04 exige que el diff sea exactamente el write set, que no supere el presupuesto de líneas de la orden y que `doctor` (modo rápido) no falle sobre la copia.
  - M05 cierra la documentación y calcula la deriva del inventario del ecosistema.
  - M06 entrega un handoff atado al sha del candidato. [CÓDIGO]

## Waivers firmados

| Qué                                                                                          | Por qué                                                                                                                                              | Mientras tanto                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release con cuatro actores distintos (AUTHOR, REVIEWER, GUARDIAN, APPROVER; `release.ts:27`) | Un consultor solo no puede producir cuatro recibos de actores distintos sin inventarlos.                                                             | La cápsula S08 nombra las aprobaciones humanas del run, leídas de su log: `sources-and-spec`, `direction` y `acceptance`. Cada una es de un solo uso y va atada al sha de sus artefactos. |
| Productor distinto del verificador en el recibo de cierre documental                         | Mismo motivo.                                                                                                                                        | El recibo lo calcula el handler a partir de los archivos y sus hashes; el host no lo escribe.                                                                                             |
| Ejecutor de defensa técnica (`technical-defense-executor-*.ts`)                              | Depende de un proyecto de Frames (`projects/agentic-workflow-adoption-v1`) y no es genérico.                                                         | El loader lo trata como cualquier extensión de modo `code`: sin un runner de sandbox confiable queda `VALIDATED_NOT_RUNNABLE`.                                                            |
| Biblioteca de 213 skills de Frames (`03_artefactos/skills/`)                                 | Eran las instrucciones de sus rutas. Aquí esas instrucciones viven en el registro (pasos, agentes, plantillas). Portarlas duplicaría la declaración. | Se retira la referencia a `content-os-router` y `content-os-creative` de `content.piece`. Las skills nuevas salen por skills.build.                                                       |
| Probes de host (Claude, Codex, Gemini, ChatGPT)                                              | Frames tampoco los tenía y prohibía marcar PASS sin probe.                                                                                           | El reporte de compatibilidad los deja en `UNKNOWN`; solo `P0_PORTABLE` puede pasar.                                                                                                       |
| Binding de mantenimiento a una rama `codex/...` de un repositorio remoto                     | El repo es local y no tiene remoto (ADR 0001).                                                                                                       | El binding es el commit base y el árbol congelados en M00.                                                                                                                                |

## Consecuencias

- `local/` queda en `.gitignore`. Una extensión privada nunca llega a un commit. [CONFIG]
- Promover una skill a `skills/` o un cambio de mantenimiento a un commit lo hace la persona, después del gate `outcome`. [DOC]
- [SUPUESTO: el clasificador por tokens es un proxy razonable del disparo de una skill. Mide si la descripción atrae los pedidos correctos, no la calidad de la respuesta.]
