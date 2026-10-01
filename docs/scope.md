# Alcance del agente

Declaración ejecutable: `engine/guard/policy.ts` lee estas líneas en cada llamada de herramienta.
Editar aqui cambia lo que el guard permite. [CÓDIGO]

## Scope

- fair_game: `engine/**`, `registry/**`, `domains/**`, `skills/**`, `brand/**`, `verify/**`, `docs/**`, `scripts/**`, `work/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`, `README.md`, `CHANGELOG.md`, `WORKTREES.md`, `harness-manifest.json`, `.gitignore`, `.gitattributes`, `.prettierrc.json`, `.prettierignore`, `.worktreeinclude`
- hands_off: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.claude/settings.json`, `.claude/skills/**`, `.agents/**`, `.gemini/**`, `.github/copilot-instructions.md`, `.github/hooks/**`, `.codex/**`, `verify/evals/routing/heldout.json`, `verify/evals/routing/heldout-v2.json`, `verify/evals/routing/heldout-v3.json`, `verify/parity/golden/**`, `work/runs/*/approvals/**`, `work/runs/*/effects/**`, `local/**`
- mcp_allow: `mcp__plugin_context7_context7__*`, `mcp__notebooklm*__notebook_list`, `mcp__notebooklm*__notebook_get`, `mcp__notebooklm*__notebook_describe`, `mcp__notebooklm*__notebook_query`, `mcp__notebooklm*__source_describe`, `mcp__notebooklm*__studio_status`

Los generados se cambian editando su fuente (`engine/gen.ts`, `registry/`) y corriendo `pnpm gen`.
hands_off gana sobre fair_game.

## Stop conditions

- max_turns: 60
- no progress: dos pasos seguidos en `needs_input` sin cambio de artefactos, el agente para y escribe la capsula (`pnpm frames status <run> --capsule`).

## Retirement condition

- Retirar este alcance cuando `registry/` declare el alcance por familia y el guard lo lea de ahi.
