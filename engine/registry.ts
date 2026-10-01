// Loads and validates the registry, then checks the cross-record invariants that
// make "declared = executed" true: every reference resolves, and nothing is
// declared that no active step uses.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { Agent, Family, Gate, Pack, type Registry } from '../registry/schema.ts';
import { repoPath } from './paths.ts';
import { loadAulaCatalog } from './aula/catalog.ts';

export function registryDir(): string {
  return process.env.FRAMES_REGISTRY ? path.resolve(process.env.FRAMES_REGISTRY) : repoPath('registry');
}

function parseFile<T>(file: string, schema: z.ZodType<T>): T {
  const raw = readFileSync(file, 'utf8');
  const doc: unknown = file.endsWith('.json') ? JSON.parse(raw) : YAML.parse(raw);
  const res = schema.safeParse(doc);
  if (!res.success) throw new Error(`REGISTRY-INVALID ${path.basename(file)}: ${z.prettifyError(res.error)}`);
  return res.data;
}

export function loadRegistry(dir = registryDir()): Registry {
  const famDir = path.join(dir, 'families');
  const families = readdirSync(famDir)
    .filter((f) => f.endsWith('.yml'))
    .sort()
    .map((f) => {
      const fam = parseFile(path.join(famDir, f), Family);
      if (`${fam.id}.yml` !== f) throw new Error(`REGISTRY-INVALID ${f}: file name must be <id>.yml`);
      return fam;
    });
  return {
    families,
    gates: parseFile(path.join(dir, 'gates.yml'), z.object({ gates: z.array(Gate) })).gates,
    agents: parseFile(path.join(dir, 'agents.yml'), z.object({ agents: z.array(Agent) })).agents,
    packs: parseFile(path.join(dir, 'vendor.lock.json'), z.object({ packs: z.array(Pack) })).packs,
  };
}

export type Finding = { level: 'red' | 'gap'; msg: string };

function dupes(ids: string[]): string[] {
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
}

// handlers/schemas: the ids registered in code. A declared handler with no code
// behind it is exactly the Frames defect this repo exists to prevent.
export function invariants(
  reg: Registry,
  known: { handlers: Iterable<string>; schemas: Iterable<string> },
): Finding[] {
  const out: Finding[] = [];
  const red = (msg: string) => out.push({ level: 'red', msg });
  const handlers = new Set(known.handlers);
  const schemas = new Set(known.schemas);
  const gates = new Map(reg.gates.map((g) => [g.id, g]));
  const agents = new Set(reg.agents.map((a) => a.id));

  for (const [what, ids] of [
    ['family', reg.families.map((f) => f.id)],
    ['gate', reg.gates.map((g) => g.id)],
    ['agent', reg.agents.map((a) => a.id)],
    ['pack', reg.packs.map((p) => p.id)],
  ] as const)
    for (const d of dupes([...ids])) red(`duplicate ${what} id: ${d}`);

  const usedGates = new Set<string>();
  const usedAgents = new Set<string>();
  for (const fam of reg.families) {
    for (const d of dupes(fam.steps.map((s) => s.id))) red(`${fam.id}: duplicate step ${d}`);
    let humanGateSeen = false;
    for (const step of fam.steps) {
      const at = `${fam.id}/${step.id}`;
      if (!agents.has(step.agent)) red(`${at}: unknown agent ${step.agent}`);
      if (!handlers.has(step.handler)) red(`${at}: handler '${step.handler}' has no code`);
      for (const o of step.outputs) if (!schemas.has(o.schema)) red(`${at}: unknown schema ${o.schema}`);
      const gate = step.gate ? gates.get(step.gate) : undefined;
      if (step.gate && !gate) red(`${at}: unknown gate ${step.gate}`);
      if (gate?.kind === 'human') humanGateSeen = true;
      if (step.effect === 'external' && !humanGateSeen && gate?.kind !== 'hard_stop')
        red(`${at}: external effect with no human gate at or before it`);
      if (fam.status === 'active') {
        usedAgents.add(step.agent);
        if (step.gate) usedGates.add(step.gate);
      }
    }
    if (fam.status === 'planned') out.push({ level: 'gap', msg: `${fam.id}: planned (wave ${fam.wave})` });
  }
  for (const g of reg.gates)
    if (!usedGates.has(g.id)) out.push({ level: 'gap', msg: `gate ${g.id}: unreferenced` });
  for (const a of reg.agents)
    if (!usedAgents.has(a.id)) out.push({ level: 'gap', msg: `agent ${a.id}: unreferenced` });
  for (const p of reg.packs)
    if (!p.osi && !p.optional) red(`pack ${p.id}: non-OSI licence must be an optional dependency`);
  if (reg.families.some((f) => f.id === 'aula')) {
    try {
      for (const skill of loadAulaCatalog().capabilities)
        if (!handlers.has(skill.handler)) red(`skill ${skill.id}: handler '${skill.handler}' has no code`);
    } catch (e) {
      red((e as Error).message);
    }
  }
  return out;
}
