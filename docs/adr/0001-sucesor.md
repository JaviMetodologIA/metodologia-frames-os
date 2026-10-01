# ADR 0001 · Frames OS nace como sucesor limpio de Frames ContentOS

Estado: aceptado · 2026-09-24 · decide: Javier Montaño (owner)

## Contexto

Frames ContentOS (`metodologia-frames-agent-os`, commit `c6d0ba61`) funciona, pero declara mucho mas
de lo que ejecuta [CÓDIGO]:

- 12 rutas en `router.yml` que ningun código de runtime lee;
- 43 `workflow.yml`, de los que `frames:assist` materializa 2 handlers;
- gates que son strings;
- 28 pasos de verify, de los cuales unos 10 atrapan regresiones.

El plan histórico completo permanece en un archivo local no distribuido; este ADR contiene las decisiones públicas necesarias.

## Decisión

- Repo nuevo, sin historia, local, sin remoto. Frames queda intacto como referencia.
- **Lo declarado es lo ejecutado.** `registry/` es la única declaración. El motor la lee en runtime y de
  ella salen checks, adapters de host y el contrato siempre cargado.
- **Criterio de sucesión, no de paridad.** Ninguna capacidad de Frames se pierde (`verify/parity/frames-inventory.json`, 168
  entradas con destino). Cada familia declara `improvements[]` con su check, y `superset` es el
  veredicto esperado.
- **Alcance:** 13 familias de producto mas `meta.maintain` (R9). R0–R5 son capacidades del motor:
  - R0 → clasificador;
  - R1–R4 → `start`/`status`/cápsula;
  - R5 → `frames eval`.
- **Presentaciones HTML inmersivas** como familia de primera clase (`deck.immersive`, ola 2). Referencias:
  - A: Puntos Colombia, `build_class6.py` y `validate_class6.py`;
  - B: Agentic SDLC, `immersive.py`, `playbook.py` y `check-motion.mjs`.

  Se hereda la técnica, nunca la marca: el repo solo trae la marca Metodología.

- **Vendor:** solo `source-lock`, instalado bajo demanda. Fuera: los 111 wrappers `dev-*/design-*/gstack-*`.
- **Stack:** Node 22.23.1 con TypeScript nativo (sin `tsx`, `erasableSyntaxOnly`), pnpm 11.9.0, Zod 4.3.6,
  yaml 2.9.0, Vitest 4.1.10. Playwright entra en la ola 2.

## Procedencia

| Origen                                                  | Que se tomo                                              | Como                                           |
| ------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| Frames `c6d0ba61` `02_proceso/agents/RT-*/contract.yml` | 11 agentes                                               | script de port → `registry/agents.yml`         |
| Frames `router.yml`, `first-turn-signals-v1.ts`, README | ejemplos de intención y `train.json`                     | reescrito                                      |
| Frames `ADOPTION-V1.md`                                 | 4 checkpoints + giro correctivo, capsula de 1.800 tokens | `registry/gates.yml`, `engine/run.ts`          |
| Frames `harness-upgrade-plan.md`                        | defectos 1–7 y guards                                    | nacen resueltos (ver abajo)                    |
| `scaffold-repo` (kit local)                             | `core.hooksPath`, worktrees, `.gitattributes`            | se conserva `scripts/`; `sync-mirrors.sh` sale |

Autoria del código de Frames y de los decks de referencia: propia (confirmado por el owner).

## Defectos de Frames que este repo no hereda

1. Frontmatter fuera del byte 0 → `gen --check` lo exige; hay un test.
2. Gemini que se invoca a si mismo → el comando llama `pnpm frames route`.
3. Guard que recomienda `--no-verify` → el guard lo niega; ningun mensaje lo sugiere.
4. Guard PII duplicado → un solo `pre-commit`.
5. Tool policy sin enforcement → `.claude/settings.json` generado, con `permissions.deny` y hooks.
6. Vendor sin licencia → `vendor.lock.json` exige licencia; un non-OSI solo puede ser opcional.
7. Checks que ensucian el árbol → ningun check escribe receipts por corrida.

## Desvios del plan, declarados

- `scripts/` existe (hooks de git del kit) aunque el layout del plan no lo lista.
- Lint = `tsc` estricto + `boundary` (sin `node:fs` de escritura en `domains/`). ESLint entra si hace falta.
- `render.html` pasa a la ola 1 junto con el renderer del brief que porta.
- Hooks de Gemini, Codex y Copilot: `gap` hasta verificar su formato contra la doc oficial.
- `held-out` de ruteo se midio después de un ajuste generico del stemmer; los ejemplos y umbrales no se
  tocaron contra el. En la ola 1 se agrega un `heldout-v2` escrito antes de medir.
- El auditor del toolkit (H2) solo mira `*.sh` en `.claude/hooks/`, y el hook de este repo es
  `engine/guard/hook.ts`. H2 sale rojo por ese limite del auditor, no del repo. Se corrige en el auditor.

## Consecuencias

`pnpm verify` es tri-estado (ok · gap · red) con un ratchet de gaps que solo baja (`verify/gaps.json`).
El esfuerzo se mide con el trailer `Port-Unit` de cada commit, no se estima.
