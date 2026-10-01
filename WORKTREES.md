# WORKTREES.md — Trabajo concurrente por git worktrees

Este repo es **worktree-ready** (scaffold-repo). Separar _fuente_ de _generado_; 1 scope por worktree.

## Setup (1× por clon/worktree)

```
./scripts/setup-git.sh   # merge=ours (generados) + core.hooksPath (pre-commit, commit-msg)
```

## Crear worktree

- Claude Code: `claude --worktree <scope>` → `.claude/worktrees/<scope>/`, rama `worktree-<scope>`.
- Manual: `git worktree add .claude/worktrees/<scope> -b worktree-<scope>`.
- `baseRef=fresh` (desde `origin/main`; offline → HEAD local) — `.claude/settings.json`.

## Reglas de oro

1. **Generados** (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, adapters de host): NO editar a mano; se regeneran con `pnpm gen`. `merge=ours` evita conflictos; tras un merge, `pnpm gen`.
2. **Editar la fuente** (`registry/`, `engine/gen.ts`), nunca los generados.
3. 1 scope por worktree; no editar el mismo archivo desde dos worktrees.
4. Commit/push seguido; merge feature → main; resolver en main.

## Cleanup

- Limpio sin cambios → auto-remove. Con cambios → `git worktree remove <path>` tras merge/push. `.claude/worktrees/` está gitignored.
