// Golden for skills.build, read from Frames' skill-system and local-extension code
// (read-only): the eval verdict rule, the coverage floor, the demotion order, whether any
// code computes a case's pass, whether scaffold/extend ever apply, and the release rules.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoPath } from '../../../engine/paths.ts';

const FRAMES =
  process.env.FRAMES_ROOT ?? path.join(os.homedir(), 'Documents/workspace/metodologia-frames-agent-os');
const W = '02_proceso/workflows';
const read = (f: string) => readFileSync(path.join(FRAMES, f), 'utf8');
const governance = read(`${W}/skill-systems/governance.ts`);
const contracts = read(`${W}/skill-systems/contracts.ts`);
const release = read(`${W}/skill-systems/release.ts`);
const cli = read('05_verificacion/scripts/skills-system-cli.ts');
const extend = read('05_verificacion/scripts/frames-extend.ts');
const loader = read(`${W}/local-extensions/loader.ts`) + read(`${W}/local-extensions/dependencies.ts`);
const paths = read(`${W}/local-extensions/paths.ts`);
const demotion = /decideSmallestComponentV1 = [\s\S]*?\n\};/.exec(governance)?.[0] ?? '';

const v = {
  source: `Frames ${W}/skill-systems, ${W}/local-extensions, 05_verificacion/scripts`,
  verdict_rule:
    /!coverageSufficient \? 'UNKNOWN' : candidatePasses > baselinePasses \? 'PASS' : 'REVISE'/.test(
      governance,
    ),
  minimum_eligible_floor: Number(
    /minimum_eligible_cases: z\.number\(\)\.int\(\)\.min\((\d+)\)/.exec(contracts)?.[1],
  ),
  demotion_kinds: [...demotion.matchAll(/kind: '(\w+)'/g)].map((m) => m[1]),
  // Only the schema and the verdict function name candidate_pass: nothing scores a case.
  passes_declared:
    !/candidate_pass\s*[:=]\s*(?!z\.)/.test(cli) && /evaluate = \(root: string, input: unknown\)/.test(cli),
  scaffold_applies: !/SSS_SCAFFOLD_GATE_AND_WORK_ORDER_REQUIRED/.test(cli),
  extend_requires_approval: /FRAMES-EXTEND-GATE001/.test(extend),
  loader_detects_hash: /CONTENT_HASH_MISMATCH/.test(loader),
  local_root: /resolve\(repository, '([^']+)'\)/.exec(paths)?.[1],
  release_actor_separation: Number(/new Set\(actors\)\.size !== (\d+)/.exec(release)?.[1]),
  release_host_unproven: /SSS_RELEASE_HOST_UNPROVEN/.test(release),
};
const d = repoPath('verify/parity/golden/skills.build/frames-os');
mkdirSync(d, { recursive: true });
writeFileSync(path.join(d, 'frames-projection.json'), JSON.stringify(v, null, 2) + '\n');
console.log('golden skills.build:', JSON.stringify(v));
