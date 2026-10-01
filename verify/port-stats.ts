// Porting pace measured from git history, never estimated. Each commit carries
// `Port-Unit: <unit> Class: asis|rewrite|new`; this reads them and projects the
// remaining inventory once enough units exist to calibrate (>= 10).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { repoPath } from '../engine/paths.ts';
import { loadRegistry } from '../engine/registry.ts';

type Unit = { sha: string; day: string; unit: string; cls: string; added: number; removed: number };

export function units(): Unit[] {
  const SEP = '\x1e';
  const raw = execFileSync(
    'git',
    ['log', '--reverse', `--format=${SEP}%h %cs%n%(trailers:key=Port-Unit,valueonly)`, '--numstat'],
    { cwd: repoPath(), encoding: 'utf8' },
  );
  const out: Unit[] = [];
  for (const block of raw.split(SEP).filter((b) => b.trim())) {
    const [head = '', ...rest] = block.split('\n');
    const [sha = '', day = ''] = head.split(' ');
    const trailer = rest.find((l) => /^\S+ Class: (asis|rewrite|new)$/.test(l.trim()));
    if (!trailer) continue;
    const [unit = '', , cls = ''] = trailer.trim().split(' ');
    let added = 0;
    let removed = 0;
    for (const l of rest) {
      const m = /^(\d+)\t(\d+)\t(.+)$/.exec(l);
      if (m && !/pnpm-lock\.yaml|frames-inventory\.json/.test(m[3] ?? '')) {
        added += Number(m[1]);
        removed += Number(m[2]);
      }
    }
    out.push({ sha, day, unit, cls, added, removed });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const us = units();
  const days = new Set(us.map((u) => u.day)).size || 1;
  const byClass = new Map<string, Unit[]>();
  for (const u of us) byClass.set(u.cls, [...(byClass.get(u.cls) ?? []), u]);
  console.log(`unidades: ${us.length} en ${days} día(s) activo(s)`);
  for (const [cls, list] of byClass)
    console.log(
      `  ${cls.padEnd(7)} ${list.length} unidad(es) · +${list.reduce((a, u) => a + u.added, 0)} líneas`,
    );
  // Pace is measured in the inventory's own unit: Frames capabilities whose
  // destination already executes (an active family or an engine capability).
  // Commit units are a different granularity and never feed the projection.
  const inv = JSON.parse(readFileSync(repoPath('verify/parity/frames-inventory.json'), 'utf8')) as {
    entries: { destination: string }[];
  };
  const active = new Set(
    loadRegistry()
      .families.filter((f) => f.status === 'active')
      .map((f) => f.id),
  );
  const covered = inv.entries.filter(
    (e) => active.has(e.destination) || e.destination.startsWith('engine:'),
  ).length;
  const remaining = inv.entries.length - covered;
  console.log(
    `inventario de Frames: ${covered}/${inv.entries.length} capacidades ya ejecutan (${Math.round((covered / inv.entries.length) * 100)} %)`,
  );
  if (us.length < 10) console.log(`proyección: pendiente (hacen falta >=10 unidades; hay ${us.length}).`);
  else
    console.log(
      `proyección ingenua: ${(covered / days).toFixed(0)} capacidades/día activo · faltan ${remaining} · ~${Math.ceil(remaining / (covered / days))} días activos (p50 sin calibrar: las familias restantes no pesan igual)`,
    );
}
