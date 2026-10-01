#!/usr/bin/env node
// Hook entry for every host that has one: Claude Code (PreToolUse + Stop), Gemini CLI
// (BeforeTool, `--host gemini`) and Copilot (preToolUse, `--host copilot`). Reads the
// payload from stdin JSON and answers in each host's documented contract. Fails
// closed: if the guard itself breaks, the call is denied.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { decide, toolCall } from './policy.ts';
import { repoPath, workDir } from '../paths.ts';

type Payload = {
  hook_event_name?: string;
  session_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  toolName?: string;
  toolArgs?: Record<string, unknown> | string;
};

const argv = process.argv.slice(2);
const host = argv.includes('--host') ? argv[argv.indexOf('--host') + 1] : 'claude';

// A deny in each host's contract. Gemini: stdout {decision, reason} + exit 2 with the
// reason on stderr. Copilot: stdout {permissionDecision, permissionDecisionReason} +
// exit 2 (forced deny). Claude Code: hookSpecificOutput with exit 0.
function deny(reason: string): { out: object; code: number } {
  if (host === 'gemini') {
    process.stderr.write(reason);
    return { out: { decision: 'deny', reason }, code: 2 };
  }
  if (host === 'copilot')
    return { out: { permissionDecision: 'deny', permissionDecisionReason: reason }, code: 2 };
  return {
    out: {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    },
    code: 0,
  };
}

const readStdin = async () => {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

function preToolUse(p: Payload): { out: object; code: number } | null {
  const d = decide(toolCall(p));
  return d.decision === 'allow' ? null : deny(`frames guard: ${d.reason}`);
}

function stop(p: Payload): object | null {
  const notes: string[] = [];
  const maxTurns = Number(
    /max_turns\s*:\s*(\d+)/.exec(readFileSync(repoPath('docs/scope.md'), 'utf8'))?.[1] ?? 0,
  );
  const sid = (p.session_id ?? 'unknown').replace(/[^a-zA-Z0-9-]/g, '');
  const counter = path.join(workDir(), 'sessions', `${sid}.json`);
  mkdirSync(path.dirname(counter), { recursive: true });
  const turns =
    (existsSync(counter) ? (JSON.parse(readFileSync(counter, 'utf8')) as { turns: number }).turns : 0) + 1;
  writeFileSync(counter, JSON.stringify({ turns }) + '\n');
  if (maxTurns && turns > maxTurns)
    notes.push(`limite de ${maxTurns} turnos superado (${turns}): escribe la cápsula y cierra la sesión`);
  const runs = path.join(workDir(), 'runs');
  for (const id of existsSync(runs) ? readdirSync(runs) : []) {
    const f = path.join(runs, id, 'run.json');
    if (!existsSync(f)) continue;
    const s = JSON.parse(readFileSync(f, 'utf8')) as { steps: { id: string; status: string }[] };
    const open = s.steps.find((x) => x.status !== 'done' && x.status !== 'skipped');
    if (open && open.status !== 'pending')
      notes.push(`run ${id} en ${open.id} (${open.status}): pnpm frames status ${id} --capsule`);
  }
  return notes.length ? { systemMessage: `frames: ${notes.join(' · ')}` } : null;
}

const raw = await readStdin();
let res: { out: object; code: number } | null;
try {
  const p = JSON.parse(raw || '{}') as Payload;
  const s = p.hook_event_name === 'Stop' ? stop(p) : null;
  res = p.hook_event_name === 'Stop' ? (s ? { out: s, code: 0 } : null) : preToolUse(p);
} catch (e) {
  res = deny(`frames guard falló y bloquea por seguridad: ${(e as Error).message}`);
}
if (res) process.stdout.write(JSON.stringify(res.out));
process.exitCode = res?.code ?? 0;
