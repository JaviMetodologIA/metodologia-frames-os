// Golden for meta.maintain, read from Frames' maintenance code (read-only): the work order
// limits, the path rules, the three routing questions, what the handoff checked in the
// diff, and what it did not (the order's own churn target, doctor, docs against the diff).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoPath } from '../../../engine/paths.ts';

const FRAMES =
  process.env.FRAMES_ROOT ?? path.join(os.homedir(), 'Documents/workspace/metodologia-frames-agent-os');
const W = '02_proceso/workflows/maintenance';
const read = (f: string) => readFileSync(path.join(FRAMES, f), 'utf8');
const core = read(`${W}/frames-maintain-v1.ts`);
const route = read(`${W}/route-maintenance-v1.ts`);
const docs = read(`${W}/documentation-gate-v1.ts`);
const cli = read('05_verificacion/scripts/frames-maintain.ts');

const v = {
  source: `Frames ${W} y 05_verificacion/scripts/frames-maintain.ts`,
  max_files: Number(/order\.budget\.maxFiles > (\d+)/.exec(core)?.[1]),
  hard_max_churn: Number(/policy\.hardMaxChurnLines !== (\d+)/.exec(cli)?.[1]),
  write_equals_expected: /canonicalize\(order\.writeSet\) !== canonicalize\(order\.expectedOutputs\)/.test(
    core,
  ),
  changed_equals_write_set:
    /FM-DIRTY001/.test(cli) &&
    /canonicalize\(paths\.all\) !== canonicalize\(\[\.\.\.order\.writeSet\]\.sort\(\)\)/.test(cli),
  tools: [...(/\['apply-patch', 'git-read-only', 'pnpm'\]/.exec(core)?.[0] ?? '').matchAll(/'([^']+)'/g)].map(
    (m) => m[1],
  ),
  reserved_names: /con\|prn\|aux\|nul/.test(core),
  questions: [...route.matchAll(/: '(¿[^']+\?)'/g)].map((m) => m[1]),
  churn_vs_order_target: /actual > policy\.targetChurnLines/.test(cli),
  runs_doctor: /doctor/.test(cli),
  docs_against_diff: /changed|diff/.test(docs),
};
const d = repoPath('verify/parity/golden/meta.maintain/frames-os');
mkdirSync(d, { recursive: true });
writeFileSync(path.join(d, 'frames-projection.json'), JSON.stringify(v, null, 2) + '\n');
console.log('golden meta.maintain:', JSON.stringify(v));
