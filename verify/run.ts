// pnpm verify: every step runs once and reports ok · gap · red. Exit 1 on any red,
// or when gaps exceed the ratchet in verify/gaps.json.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadRegistry, invariants } from '../engine/registry.ts';
import { handlers, schemas } from '../engine/handlers.ts';
import { drift } from '../engine/gen.ts';
import { repoPath } from '../engine/paths.ts';
import { routingReport } from './evals/routing.ts';
import { parityReport } from './parity/run.ts';
import {
  checkPortability,
  checkPrivacy,
  checkDomainBoundary,
  checkInventory,
  checkVendor,
} from './checks/index.ts';

type Status = 'ok' | 'gap' | 'red';
type Result = { status: Status; detail: string; gaps?: string[] };
type StepFn = () => Result;

const sh = (cmd: string, args: string[]): Result => {
  const r = spawnSync(cmd, args, { cwd: repoPath(), encoding: 'utf8', shell: process.platform === 'win32' });
  const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-6).join('\n');
  return r.status === 0
    ? { status: 'ok', detail: `${cmd} ${args.join(' ')}` }
    : { status: 'red', detail: tail };
};
const fromProblems = (problems: string[], okMsg: string): Result =>
  problems.length ? { status: 'red', detail: problems.join('\n') } : { status: 'ok', detail: okMsg };

const STEPS: [string, StepFn][] = [
  ['format', () => sh('pnpm', ['exec', 'prettier', '--check', '.', '--log-level', 'warn'])],
  ['typecheck', () => sh('pnpm', ['exec', 'tsc', '--noEmit'])],
  ['boundary', () => fromProblems(checkDomainBoundary(), 'domains/ no escribe al disco por su cuenta')],
  [
    'registry',
    () => {
      const f = invariants(loadRegistry(), { handlers: handlers.keys(), schemas: schemas.keys() });
      const red = f.filter((x) => x.level === 'red').map((x) => x.msg);
      const gaps = f.filter((x) => x.level === 'gap').map((x) => x.msg);
      if (red.length) return { status: 'red', detail: red.join('\n') };
      return gaps.length
        ? { status: 'gap', detail: `${gaps.length} declaraciones aun sin ejecutor`, gaps }
        : { status: 'ok', detail: 'invariantes' };
    },
  ],
  ['gen', () => fromProblems(drift(), 'adapters y contrato al día, dentro del presupuesto')],
  ['test', () => sh('pnpm', ['exec', 'vitest', 'run', '--reporter=dot'])],
  [
    'routing',
    () => {
      const r = routingReport();
      const m = Object.entries(r.metrics)
        .map(([k, v]) => `${k} ${v}%`)
        .join(' · ');
      return r.below.length ? { status: 'red', detail: r.below.join('\n') } : { status: 'ok', detail: m };
    },
  ],
  ['privacy', () => fromProblems(checkPrivacy(), 'sin secretos ni rutas privadas en archivos versionados')],
  ['portability', () => fromProblems(checkPortability(), 'sin symlinks, sin /bin/sh, sin flags GNU')],
  [
    'inventory',
    () => {
      const r = checkInventory();
      return r.problems.length
        ? { status: 'red', detail: r.problems.join('\n') }
        : { status: 'ok', detail: r.detail };
    },
  ],
  [
    'vendor',
    () => {
      const packs = loadRegistry().packs;
      const problems = checkVendor();
      return fromProblems(problems, `${packs.length} packs fijados por versión e integridad`);
    },
  ],
  [
    'parity',
    () => {
      const rows = parityReport();
      const red = rows.filter((r) => r.status === 'red');
      const ok = rows.filter((r) => r.status === 'ok');
      // Planned families are already counted as gaps by the registry step: count them once.
      const planned = rows.filter((r) => r.status === 'gap');
      if (red.length)
        return {
          status: 'red',
          detail: red.flatMap((r) => r.problems.map((p) => `${r.family}: ${p}`)).join('\n'),
        };
      const summary = ok.map((r) => `${r.family} ${r.verdict}`).join(', ') || 'ninguna activa';
      return planned.length
        ? { status: 'gap', detail: `sucesión ok: ${summary} · ${planned.length} planificadas`, gaps: [] }
        : { status: 'ok', detail: `sucesión ok: ${summary}` };
    },
  ],
  [
    'visual:decks',
    () => {
      // A real browser over every deck case; no browser is a gap, never green.
      const r = spawnSync(process.execPath, [repoPath('verify/visual/run-cases.ts')], { encoding: 'utf8' });
      const out = `${r.stdout}${r.stderr}`.trim();
      if (r.status === 3) return { status: 'gap', detail: out, gaps: ['visual: sin navegador'] };
      return r.status === 0
        ? { status: 'ok', detail: out.split('\n').pop() ?? '' }
        : { status: 'red', detail: out };
    },
  ],
  [
    'hooks:other-hosts',
    () => {
      // A real deny through each host's contract; Codex has no documented pre-tool hook
      // and carries a signed waiver (docs/adr/0004-hosts.md).
      const probe = (host: string, payload: object, key: string) => {
        const r = spawnSync(process.execPath, [repoPath('engine/guard/hook.ts'), '--host', host], {
          input: JSON.stringify(payload),
          encoding: 'utf8',
        });
        return r.status === 2 && r.stdout.includes(key)
          ? null
          : `${host}: el guard no bloqueó (exit ${r.status})`;
      };
      const push = { command: 'git push' };
      const problems = [
        probe(
          'gemini',
          { hook_event_name: 'BeforeTool', tool_name: 'run_shell_command', tool_input: push },
          '"decision":"deny"',
        ),
        probe('copilot', { toolName: 'bash', toolArgs: push }, '"permissionDecision":"deny"'),
      ].filter((x): x is string => !!x);
      return fromProblems(
        problems,
        'gemini y copilot bloquean con el guard · codex: waiver ADR 0004 (sin hook documentado)',
      );
    },
  ],
];

const only = process.argv.slice(2);
const mark = { ok: 'ok ', gap: 'gap', red: 'RED' };
let red = 0;
const gaps: string[] = [];
for (const [name, fn] of STEPS) {
  if (only.length && !only.includes(name)) continue;
  let r: Result;
  try {
    r = fn();
  } catch (e) {
    r = { status: 'red', detail: (e as Error).message };
  }
  if (r.status === 'red') red++;
  if (r.status === 'gap') gaps.push(...(r.gaps ?? [name]));
  console.log(`${mark[r.status]}  ${name.padEnd(18)} ${r.detail.split('\n')[0]}`);
  if (r.status === 'red') for (const l of r.detail.split('\n').slice(1)) console.log(`     ${l}`);
}

// Ratchet: the number of accepted gaps only goes down.
const ratchetFile = repoPath('verify/gaps.json');
const ratchet = JSON.parse(readFileSync(ratchetFile, 'utf8')) as { max_gaps: number };
if (!only.length) {
  if (gaps.length > ratchet.max_gaps) {
    red++;
    console.log(`RED  ratchet             ${gaps.length} gaps > tope ${ratchet.max_gaps}`);
  } else if (gaps.length < ratchet.max_gaps && process.env.FRAMES_RATCHET === 'write') {
    writeFileSync(ratchetFile, JSON.stringify({ max_gaps: gaps.length }, null, 2) + '\n');
    console.log(`ok   ratchet             tope bajado a ${gaps.length}`);
  } else console.log(`ok   ratchet             ${gaps.length}/${ratchet.max_gaps} gaps aceptados`);
}
console.log(red ? `verify: RED (${red})` : `verify: ok con ${gaps.length} gap(s) declarados`);
process.exit(red ? 1 : 0);
