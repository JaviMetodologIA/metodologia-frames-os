# ADR 0004 · Guard en los otros hosts

- Estado: aceptado · 2026-09-24
- Contexto: el guard (`engine/guard/policy.ts`) solo corría en Claude Code. El gap `hooks:other-hosts` esperaba el formato oficial de cada host. [DOC]

## Decisión

Un solo guard; cada host lo llama con `--host` y recibe la respuesta en su propio contrato. `engine/gen.ts` genera los archivos. [CÓDIGO]

| Host           | Archivo generado                  | Evento                                                               | Cómo bloquea                                                              | Fuente oficial (vista el 2026-09-24)                 |
| -------------- | --------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------- |
| Claude Code    | `.claude/settings.json`           | `PreToolUse`, `Stop`                                                 | `hookSpecificOutput.permissionDecision: deny`, exit 0                     | ya integrado                                         |
| Gemini CLI     | `.gemini/settings.json`           | `BeforeTool` (`run_shell_command`, `write_file`, `replace`, `mcp_*`) | stdout `{"decision":"deny","reason"}`, exit 2, razón en stderr            | geminicli.com/docs/hooks/reference                   |
| GitHub Copilot | `.github/hooks/frames-guard.json` | `preToolUse` (`bash`, `edit`, `create`)                              | stdout `{"permissionDecision":"deny","permissionDecisionReason"}`, exit 2 | docs.github.com/en/copilot/reference/hooks-reference |
| Codex CLI      | `.codex/config.toml`              | —                                                                    | no hay hook pre-tool documentado                                          | developers.openai.com/codex/agent-approvals-security |

- El guard normaliza las dos formas de payload de Copilot: camelCase (`toolName`, `toolArgs`, donde `toolArgs` puede llegar como texto JSON) y la compatible con Claude. [CÓDIGO]
- Todos los hosts fallan cerrado: si el payload no se entiende, la llamada se niega. [CÓDIGO]
- `pnpm verify` corre un push de prueba contra Gemini y contra Copilot, y falla si alguno no bloquea. [CÓDIGO]

## Waiver firmado: Codex CLI

Codex no documenta ningún hook que corra antes de una herramienta. Sus controles documentados son `sandbox_mode = "workspace-write"` (el sistema operativo limita la escritura) y `approval_policy = "on-request"`, y eso es lo que genera `.codex/config.toml`. [DOC]

- Consecuencia: en Codex, el guard no revisa cada llamada. Queda protegido por el sandbox, por el `pre-commit` de privacidad y formato, y porque `frames approve` exige una terminal interactiva, cosa que el agente no tiene. [CÓDIGO]
- Condición para retirar el waiver: que Codex documente un hook pre-tool, o que se verifique la sintaxis de `codex execpolicy` contra su fuente. [SUPUESTO: `execpolicy` podría expresar las reglas de denegación; sus claves exactas no se verificaron]

## Pendiente de confirmar

- Copilot: la página oficial no dice si los hooks están en GA o en preview. [DOC]
- Gemini CLI: una página menciona un reemplazo por otro CLI para cuentas gratuitas; no se confirmó con una segunda fuente. [SUPUESTO]
