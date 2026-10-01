// Succession check per family (replaces "parity"):
//   1. no loss: every Frames step/deliverable routed to this family is declared or waived;
//   2. cases: the successor reproduces Frames' golden (equal) or adds to it (superset);
//   3. improvements: each declared improvement points at a test that exists.
// Planned families are gaps; any problem in an active family is red.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { Family } from '../../registry/schema.ts';
import { loadRegistry } from '../../engine/registry.ts';
import { repoPath } from '../../engine/paths.ts';
import { compare } from './compare.ts';

export type FamilyVerdict = {
  family: string;
  status: 'ok' | 'gap' | 'red';
  verdict?: 'equal' | 'superset';
  problems: string[];
  notes: string[];
};

type Inventory = { entries: { kind: string; id: string; destination: string }[] };
type Waivers = Record<string, { id: string; reason: string; by: string }[]>;

function improvementResolves(check: string): string | null {
  const [file = '', title = ''] = check.split('#');
  const abs = repoPath(file);
  if (!existsSync(abs)) return `${check}: el archivo no existe`;
  return readFileSync(abs, 'utf8').includes(`'${title}'`) ? null : `${check}: no hay un test con ese nombre`;
}

export function familyVerdict(fam: Family, inv: Inventory, waivers: Waivers): FamilyVerdict {
  if (fam.status === 'planned')
    return { family: fam.id, status: 'gap', problems: [], notes: [`ola ${fam.wave}`] };
  const problems: string[] = [];
  const notes: string[] = [];
  const outputs = new Set(fam.steps.flatMap((s) => s.outputs.map((o) => o.id)));
  const steps = new Set(fam.steps.map((s) => s.id));
  const waived = new Set((waivers[fam.id] ?? []).map((w) => w.id));
  for (const e of inv.entries.filter((x) => x.destination === fam.id)) {
    if (e.kind === 'deliverable') {
      const id = e.id.split('/')[1] ?? '';
      if (!outputs.has(id) && !waived.has(e.id))
        problems.push(`pérdida: entregable ${e.id} sin paso ni waiver`);
    }
    if (e.kind === 'step' && !steps.has(e.id) && !waived.has(e.id))
      problems.push(`pérdida: paso ${e.id} sin destino ni waiver`);
  }
  const casesDir = repoPath('verify/parity/cases', fam.id);
  const cases = existsSync(casesDir) ? readdirSync(casesDir).sort() : [];
  if (!cases.length) problems.push('sin casos de paridad');
  let superset = false;
  for (const c of cases) {
    const r = compare(fam.id, c);
    if (r.verdict === 'red') problems.push(`caso ${c}: ${r.detail}`);
    else notes.push(`caso ${c}: ${r.verdict}`);
    if (r.verdict === 'superset') superset = true;
  }
  if (fam.improvements.length) {
    for (const imp of fam.improvements) {
      const err = improvementResolves(imp.check);
      if (err) problems.push(`mejora ${imp.id}: ${err}`);
    }
    superset = true;
  }
  return {
    family: fam.id,
    status: problems.length ? 'red' : 'ok',
    verdict: superset ? 'superset' : 'equal',
    problems,
    notes,
  };
}

export function parityReport(only?: string): FamilyVerdict[] {
  const inv = JSON.parse(readFileSync(repoPath('verify/parity/frames-inventory.json'), 'utf8')) as Inventory;
  const wf = repoPath('verify/parity/waivers.yml');
  const waivers = (existsSync(wf) ? YAML.parse(readFileSync(wf, 'utf8')) : {}) as Waivers;
  return loadRegistry()
    .families.filter((f) => !only || f.id === only)
    .map((f) => familyVerdict(f, inv, waivers));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fam = process.argv.indexOf('--family');
  const rows = parityReport(fam > 0 ? process.argv[fam + 1] : undefined);
  for (const r of rows) {
    console.log(`${r.status.padEnd(3)}  ${r.family.padEnd(17)} ${r.verdict ?? ''} ${r.notes.join(' · ')}`);
    for (const p of r.problems) console.log(`     ${p}`);
  }
  process.exit(rows.some((r) => r.status === 'red') ? 1 : 0);
}
