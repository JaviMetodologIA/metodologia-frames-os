// `frames doctor`: a read-only health battery, cheap checks first. Frames' doctor.ts ran
// ten checks and wrote a YAML snapshot; this prints the same kind of list and exits 1 on
// any fail. `quick` keeps only what a maintenance run needs (registry, adapters) and can
// point at another checkout, which is how meta.maintain M04 uses it.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { launch } from '../engine/browser.ts';
import { drift } from '../engine/gen.ts';
import { handlers, schemas } from '../engine/handlers.ts';
import { repoPath } from '../engine/paths.ts';
import { invariants, loadRegistry } from '../engine/registry.ts';
import { loadRun } from '../engine/run.ts';
import { checkVendor } from './checks/index.ts';

export type Check = { id: string; status: 'pass' | 'warn' | 'fail' | 'skip'; detail: string };

const run = (cmd: string, args: string[], cwd?: string) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

export async function doctor(root = repoPath(), { quick = false } = {}): Promise<Check[]> {
  const out: Check[] = [];
  const add = (id: string, status: Check['status'], detail: string) => out.push({ id, status, detail });
  const here = path.resolve(root) === repoPath();

  if (!quick) {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      engines: { node: string; pnpm: string };
    };
    const node = process.versions.node;
    add('node', node === pkg.engines.node ? 'pass' : 'warn', `${node} (fijado ${pkg.engines.node})`);
    const pnpm = run('pnpm', ['--version']);
    add(
      'pnpm',
      pnpm === pkg.engines.pnpm ? 'pass' : 'warn',
      `${pnpm ?? 'no instalado'} (fijado ${pkg.engines.pnpm})`,
    );
  }

  try {
    const reg = loadRegistry(path.join(root, 'registry'));
    const f = invariants(reg, { handlers: handlers.keys(), schemas: schemas.keys() });
    const red = f.filter((x) => x.level === 'red');
    add(
      'registry',
      red.length ? 'fail' : 'pass',
      red.length
        ? red.map((x) => x.msg).join('; ')
        : `${reg.families.filter((x) => x.status === 'active').length}/${reg.families.length} familias activas · ${f.length} gap(s)`,
    );
    if (here) {
      const d = drift(reg);
      add('adapters', d.length ? 'fail' : 'pass', d.length ? d.join('; ') : 'adapters y contrato al día');
    } else add('adapters', 'skip', 'otra copia: se generan desde el repo');
  } catch (e) {
    add('registry', 'fail', (e as Error).message.slice(0, 300));
  }
  if (quick) return out;

  const hooks = run('git', ['config', 'core.hooksPath'], root);
  add(
    'hooks',
    hooks === 'scripts/git-hooks' ? 'pass' : 'warn',
    hooks ? `core.hooksPath=${hooks}` : 'sin hooks de git (corre pnpm install)',
  );
  const vendor = here ? checkVendor() : [];
  add(
    'vendor',
    vendor.length ? 'fail' : 'pass',
    vendor.length ? vendor.join('; ') : 'packs fijados por versión e integridad',
  );
  const browser = await launch().catch(() => null);
  add(
    'browser',
    browser ? 'pass' : 'warn',
    browser
      ? 'Chromium arranca: gate visual y captura disponibles'
      : 'sin navegador: el gate visual queda en gap',
  );
  await browser?.close();
  const ff = run('ffmpeg', ['-version']);
  add('ffmpeg', ff ? 'pass' : 'warn', ff ? (ff.split('\n')[0] ?? '') : 'sin ffmpeg: capture --mp4 no corre');

  const dir = path.join(root, 'work', 'runs');
  const ids = existsSync(dir) ? readdirSync(dir) : [];
  const waiting = here
    ? ids.flatMap((id) => {
        try {
          const st = loadRun(id).steps.find((x) => x.status === 'awaiting_gate');
          return st ? [`${id} ${st.id}`] : [];
        } catch {
          return [`${id} ilegible`];
        }
      })
    : [];
  add(
    'runs',
    'pass',
    `${ids.length} run(s)${waiting.length ? ` · esperan gate: ${waiting.join(', ')}` : ''}`,
  );
  return out;
}
