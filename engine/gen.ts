// Generates every host-facing file from the registry and this module: the always
// loaded contract (AGENTS/CLAUDE/GEMINI/Copilot), host skills and commands, and the
// Claude Code settings with hooks. `--check` fails on drift or on a contract over
// its token budget. Frontmatter always starts at byte 0 (Frames defect 1).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Registry } from '../registry/schema.ts';
import { loadRegistry } from './registry.ts';
import { repoPath } from './paths.ts';

export const CONTRACT_TOKENS = 1800;
const MARK = 'GENERADO por `pnpm gen` (engine/gen.ts). No editar a mano: edita la fuente.';

function contract(reg: Registry): string {
  const rows = reg.families.map(
    (f) => `| \`${f.id}\` | ${f.title} | ${f.status === 'active' ? 'activa' : `ola ${f.wave}`} |`,
  );
  return `<!-- ${MARK} -->

# Frames OS · MetodologIA

Sucesor de Frames ContentOS. Lo declarado en \`registry/\` es lo que el motor ejecuta. [CÓDIGO]

## Arranque

- \`pnpm install --frozen-lockfile\` (Node 22.23.1, pnpm 11.9.0).
- Pedido nuevo: \`pnpm frames route "<pedido>"\`. Si responde R0, haz su pregunta: como máximo 3 preguntas bloqueantes.
- Con familia clara: \`pnpm frames start <familia> --request "<pedido>"\`, luego \`pnpm frames next <run>\` hasta el siguiente gate.
- Retomar: \`pnpm frames status\` y \`pnpm frames status <run> --capsule\`.

## Flujo

- Cada paso lo ejecuta el motor; \`engine/cli.ts\` es la única ruta de escritura del estado de un run.
- Si \`next\` devuelve \`needs_input\`, escribe los artefactos pedidos en \`requests/\` del run y vuelve a llamar \`next\`.
- Un gate humano se aprueba con \`frames approve\`. **Lo corre la persona en su terminal; el agente nunca.**
- \`hard_stop\` (publicar, postular) no lo aprueba el motor: la persona actúa fuera.

## Verificación

- Gate: \`pnpm verify\` (ok · gap · red). Nada queda «listo» sin verify en ok o gap declarado.
- Ruteo: \`pnpm frames eval\`; los pisos solo suben.

## Definición de done

- El artefacto existe, pasa su schema y su gate; la evidencia es el archivo, no la afirmacion.
- \`pnpm verify\` sin red.
- Cada afirmación lleva evidence tag: [CÓDIGO] [CONFIG] [DOC] [INFERENCIA] [SUPUESTO].

## Reglas

- Una sola marca por entregable: MetodologIA por defecto; marca blanca por solicitud explícita. Identidades privadas entran por tokens externos.
- Aula usa nueve formatos, incluido el taller inmersivo; decks comerciales seleccionan \`renderer=frames-aula\`. El catálogo liga las 20 skills al motor por hashes.
- Sin efectos externos (publicar, enviar, NotebookLM, n8n) sin gate humano consumido.
- Generados (este archivo, adapters de host, settings): edita \`engine/gen.ts\` o \`registry/\` y corre \`pnpm gen\`.
- Alcance de escritura: \`docs/scope.md\` (el guard lo aplica).

## Familias

| Familia | Que hace | Estado |
|---|---|---|
${rows.join('\n')}
`;
}

const skill = (host: string) => `---
name: frames
description: Crear, mejorar o planear contenido con Frames OS (MetodologIA) — Aula dinámica, talleres inmersivos, masterclasses, workbooks, módulos, decks comerciales MetodologIA o marca blanca, piezas, carruseles, campañas, CV, video, NotebookLM y skills. Usar para producir o mejorar comunicación y aprendizaje.
---
<!-- ${MARK} -->

# Frames (${host})

1. \`pnpm frames route "<pedido>"\`: familia sugerida (top-3) o una pregunta R0.
2. Confirma con la persona si el margen es bajo; luego \`pnpm frames start <familia> --request "<pedido>"\`. La intención conserva formato y edición.
3. \`pnpm frames next <run>\` avanza un paso; si pide insumos, escríbelos donde indica y repite.
4. En un gate humano detente: la persona corre \`pnpm frames approve <run> <gate>\`.
`;

function settings(): string {
  const hook = '$CLAUDE_PROJECT_DIR/engine/guard/hook.ts';
  const entry = (matcher: string | undefined) => ({
    ...(matcher ? { matcher } : {}),
    hooks: [{ type: 'command', command: hook, timeout: 10 }],
  });
  const doc = {
    worktree: { baseRef: 'fresh' },
    permissions: {
      deny: [
        'Bash(git push:*)',
        'Bash(git reset --hard:*)',
        'Bash(pnpm frames approve:*)',
        'Bash(node engine/cli.ts approve:*)',
        'Read(./.env)',
        'Read(./.env.*)',
      ],
    },
    hooks: {
      PreToolUse: [entry('Bash'), entry('Write|Edit|MultiEdit|NotebookEdit'), entry('mcp__.*')],
      Stop: [entry(undefined)],
    },
  };
  return JSON.stringify(doc, null, 2) + '\n';
}

export function outputs(reg: Registry): Record<string, string> {
  const body = contract(reg);
  return {
    'AGENTS.md': body,
    'CLAUDE.md': `<!-- ${MARK} -->\n\n@AGENTS.md\n\n## Claude Code\n\n- Hooks en \`.claude/settings.json\`: el guard (\`engine/guard/hook.ts\`) niega push, \`--no-verify\`, \`reset --hard\`, \`frames approve\`, secretos y escrituras fuera de \`docs/scope.md\`.\n- Skill del host: \`.claude/skills/frames/SKILL.md\`.\n`,
    // Gemini and Copilot do not resolve @imports: they get the contract inlined.
    'GEMINI.md': body + `\n## Gemini CLI\n\n- Comando: \`/frames <pedido>\` llama \`pnpm frames route\`.\n`,
    '.github/copilot-instructions.md': body,
    '.claude/settings.json': settings(),
    '.claude/skills/frames/SKILL.md': skill('Claude Code'),
    '.agents/skills/frames/SKILL.md': skill('Codex'),
    // Gemini CLI hooks (docs: geminicli.com/docs/hooks/reference): BeforeTool, stdin JSON,
    // exit 2 or {decision:"deny"} blocks. Same guard, host flag picks the contract.
    '.gemini/settings.json':
      JSON.stringify(
        {
          hooks: {
            BeforeTool: [
              {
                matcher: '(run_shell_command|write_file|replace|mcp_.*)',
                hooks: [
                  { type: 'command', command: 'node engine/guard/hook.ts --host gemini', timeout: 10000 },
                ],
              },
            ],
          },
        },
        null,
        2,
      ) + '\n',
    // Copilot hooks (docs.github.com/en/copilot/reference/hooks-reference): preToolUse,
    // stdin JSON, {permissionDecision:"deny"} or exit 2 blocks; the cloud agent reads
    // .github/hooks from the default branch.
    '.github/hooks/frames-guard.json':
      JSON.stringify(
        {
          version: 1,
          hooks: {
            preToolUse: [
              {
                matcher: 'bash|edit|create',
                type: 'command',
                command: 'node engine/guard/hook.ts --host copilot',
              },
            ],
          },
        },
        null,
        2,
      ) + '\n',
    // Codex CLI documents no pre-tool hook (developers.openai.com/codex/agent-approvals-security):
    // the documented controls are the sandbox and the approval policy. The guard cannot run
    // per tool call here; ADR 0004 records the limit.
    '.codex/config.toml': `# ${MARK}\n# Codex no documenta hooks pre-tool: el guard no corre por llamada. Límite registrado en docs/adr/0004.\napproval_policy = "on-request"\nsandbox_mode = "workspace-write"\n`,
    '.gemini/commands/frames.toml': `# ${MARK}\ndescription = "Frames OS: enruta un pedido de contenido"\nprompt = """\nCorre \`pnpm frames route "{{args}}"\` y sigue el flujo de AGENTS.md: haz la pregunta R0 si aparece; si no, confirma la familia y usa \`pnpm frames start\`.\n"""\n`,
  };
}

export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

export function drift(reg: Registry = loadRegistry()): string[] {
  const problems: string[] = [];
  for (const [rel, want] of Object.entries(outputs(reg))) {
    const file = repoPath(rel);
    if (!existsSync(file)) problems.push(`${rel}: falta (corre pnpm gen)`);
    else if (readFileSync(file, 'utf8') !== want)
      problems.push(`${rel}: difiere de su fuente (corre pnpm gen)`);
    if (rel.endsWith('SKILL.md') && !want.startsWith('---\n'))
      problems.push(`${rel}: frontmatter no está en el byte 0`);
  }
  const tokens = estimateTokens(outputs(reg)['AGENTS.md'] ?? '');
  if (tokens > CONTRACT_TOKENS) problems.push(`AGENTS.md: ${tokens} tokens > presupuesto ${CONTRACT_TOKENS}`);
  return problems;
}

export function generate({ check }: { check: boolean }): number {
  const reg = loadRegistry();
  if (check) {
    const problems = drift(reg);
    for (const p of problems) console.log(`DRIFT ${p}`);
    if (!problems.length)
      console.log(`gen: al día · AGENTS.md ~${estimateTokens(outputs(reg)['AGENTS.md'] ?? '')} tokens`);
    return problems.length ? 1 : 0;
  }
  for (const [rel, data] of Object.entries(outputs(reg))) {
    const file = repoPath(rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, data);
  }
  console.log(`gen: ${Object.keys(outputs(reg)).length} archivos escritos`);
  return 0;
}
