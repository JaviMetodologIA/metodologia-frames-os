// One-time inventory of what Frames ContentOS can do, so the successor can prove
// it lost nothing: every entry must map to a family or an engine capability.
// Reads Frames read-only (FRAMES_ROOT); writes verify/parity/frames-inventory.json.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { repoPath } from '../../engine/paths.ts';

export type Entry = { kind: string; id: string; title: string; source: string; destination: string };

const FRAMES =
  process.env.FRAMES_ROOT ?? path.join(os.homedir(), 'Documents/workspace/metodologia-frames-agent-os');

// Declared mapping (the plan's coverage table). Step ids map by exact id first, then by prefix.
const STEP_DEST: Record<string, string> = {
  P04: 'content.campaign',
  P09: 'content.campaign',
  P06: 'content.prompts',
  C03: 'career.search',
  C04: 'career.search',
  C05: 'career.cover',
  C07: 'career.cover',
  C09: 'career.cover',
};
// A deliverable that belongs to another family than its Frames step.
const DELIVERABLE_DEST: Record<string, string> = {
  'executive-presentation-v1': 'deck.immersive',
  'brief-campaign-map-v1': 'content.campaign',
  'campaign-charter-v1': 'content.campaign',
  'universal-prompts-v1': 'content.prompts',
};
const PREFIX_DEST: Record<string, string> = {
  P: 'content.piece',
  C: 'career.cv',
  L: 'skills.build',
  S: 'skills.build',
  M: 'meta.maintain',
};
const ROUTE_DEST: Record<string, string> = {
  R0: 'engine:classify',
  R1: 'engine:runs',
  R2: 'engine:runs',
  R3: 'engine:runs',
  'R3-LOOSE': 'engine:runs',
  R4: 'engine:runs',
  R5: 'engine:eval',
  R6: 'content.piece',
  R7: 'career.cv',
  R8: 'skills.build',
  R9: 'meta.maintain',
  R10: 'nlm',
};
// Entry points users touched; the rest of Frames' 106 scripts were checks or tooling.
const CLI_DEST: Record<string, string> = {
  'frames:assist': 'engine:classify',
  'frames:extend': 'skills.build',
  'frames:maintain': 'meta.maintain',
  'mw:run': 'content.piece',
  'video-os': 'video.method',
  trainer: 'trainer',
  'carousel:build': 'content.carousel',
  'carousel:render': 'content.carousel',
  'render:all': 'video.method',
  cb: 'deck.immersive',
  'host:install': 'engine:gen',
  doctor: 'meta.maintain',
};
const PROFILE_DEST: Record<string, string> = {
  'commercial-proposal': 'deck.immersive',
  'content-os-slideshow': 'deck.immersive',
  'content-os-bento-slides': 'deck.immersive',
  improve: 'improve',
};

const rel = (p: string) => path.relative(FRAMES, p).split(path.sep).join('/');

function walk(dir: string, name: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'node_modules' ? [] : walk(p, name);
    return d.name === name ? [p] : [];
  });
}

export function extract(): { frames_commit: string; entries: Entry[] } {
  const entries: Entry[] = [];
  const wfRoot = path.join(FRAMES, '02_proceso/workflows');
  for (const file of walk(wfRoot, 'workflow.yml')) {
    const wf = YAML.parse(readFileSync(file, 'utf8')) as {
      workflow_id: string;
      title: string;
      // Multimedia and career workflows list objects; skill-system workflows list plain ids.
      outputs?: ({ deliverable_id: string; artifact: string; required?: boolean } | string)[];
    };
    const id = wf.workflow_id;
    const dest = STEP_DEST[id] ?? PREFIX_DEST[id.charAt(0)] ?? 'UNMAPPED';
    entries.push({ kind: 'step', id, title: wf.title, source: rel(file), destination: dest });
    // Deliverables go to their step's family unless DELIVERABLE_DEST moves them.
    for (const o of wf.outputs ?? []) {
      const did = typeof o === 'string' ? o : o.deliverable_id;
      entries.push({
        kind: 'deliverable',
        id: `${id}/${did}`,
        title: typeof o === 'string' ? o : o.artifact,
        source: rel(file),
        destination: DELIVERABLE_DEST[did] ?? dest,
      });
    }
  }
  for (const v of ['V00', 'V01', 'V02', 'V03', 'V04'])
    entries.push({
      kind: 'step',
      id: v,
      title: 'Video OS',
      source: '02_proceso/workflows/video-os/_schema',
      destination: 'video.method',
    });
  const nlm = YAML.parse(readFileSync(path.join(wfRoot, 'notebooklm-os/commands.yml'), 'utf8')) as Record<
    string,
    Record<string, { starts_at: string }>
  >;
  for (const cmds of Object.values(nlm))
    if (cmds && typeof cmds === 'object')
      for (const [cmd, spec] of Object.entries(cmds))
        if (spec && typeof spec === 'object' && 'starts_at' in spec)
          entries.push({
            kind: 'nlm-command',
            id: cmd,
            title: `desde ${spec.starts_at}`,
            source: '02_proceso/workflows/notebooklm-os/commands.yml',
            destination: 'nlm',
          });
  for (const m of ['intake', 'spec', 'build', 'verify', 'package', 'benchmark'])
    entries.push({
      kind: 'trainer-mode',
      id: m,
      title: `trainer --mode ${m}`,
      source: '02_proceso/workflows/trainer-os/runner.ts',
      destination: 'trainer',
    });
  const router = YAML.parse(readFileSync(path.join(FRAMES, '02_proceso/governance/router.yml'), 'utf8')) as {
    routes: { id: string; signal?: string }[];
  };
  for (const r of router.routes)
    entries.push({
      kind: 'route',
      id: r.id,
      title: r.signal ?? '',
      source: '02_proceso/governance/router.yml',
      destination: ROUTE_DEST[r.id] ?? 'UNMAPPED',
    });
  const scripts = (
    JSON.parse(readFileSync(path.join(FRAMES, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
  ).scripts;
  for (const [name, dest] of Object.entries(CLI_DEST)) {
    if (!(name in scripts)) continue;
    entries.push({
      kind: 'cli',
      id: name,
      title: scripts[name] ?? '',
      source: 'package.json',
      destination: dest,
    });
  }
  for (const [id, dest] of Object.entries(PROFILE_DEST))
    entries.push({
      kind: 'profile',
      id,
      title: 'perfil o skill de presentacion/mejora',
      source: 'router.yml R6 + 03_artefactos/skills',
      destination: dest,
    });
  entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  const frames_commit = execFileSync('git', ['-C', FRAMES, 'rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  return { frames_commit, entries };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inv = extract();
  writeFileSync(repoPath('verify/parity/frames-inventory.json'), JSON.stringify(inv, null, 2) + '\n');
  const unmapped = inv.entries.filter((e) => e.destination === 'UNMAPPED');
  console.log(
    `inventario: ${inv.entries.length} entradas de Frames ${inv.frames_commit} · sin destino ${unmapped.length}`,
  );
  for (const u of unmapped) console.log(`  UNMAPPED ${u.kind} ${u.id} (${u.source})`);
}
