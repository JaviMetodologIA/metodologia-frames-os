#!/usr/bin/env bash
# setup-git.sh — bootstrap git worktree-safe. IDEMPOTENTE. Correr 1× por clon/worktree.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
git config merge.ours.driver true
git config core.hooksPath scripts/git-hooks
chmod +x scripts/git-hooks/* scripts/*.sh 2>/dev/null || true
echo "[setup-git] merge.ours.driver=true · core.hooksPath=scripts/git-hooks · OK en $ROOT"
