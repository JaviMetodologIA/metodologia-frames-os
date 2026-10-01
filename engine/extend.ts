// `frames extend <run>`: installs the private extension a skills.build run validated,
// and only after a person approved its L04 gate. Frames' frames-extend --apply wrote the
// package straight into the repo behind a hash the caller supplied; here the package
// comes from the run, the approval is the engine's sha-bound gate, and a package that
// changed since L04 or no longer loads as ACTIVE_LOCAL is removed again.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  createLocalActivationReceipt,
  discoverLocalExtensions,
} from '../domains/skills/frames/local-extensions/index.ts';
import { repoPath } from './paths.ts';
import { loadRun, runDir } from './run.ts';

export function installExtension(runId: string, root = repoPath()): { id: string; ref: string } {
  const s = loadRun(runId);
  if (s.family !== 'skills.build') throw new Error('EXTEND-FAMILY: el run no es de skills.build');
  if (s.steps.find((x) => x.id === 'L04')?.status !== 'done')
    throw new Error(
      'EXTEND-GATE: L04 no está aprobado; la persona corre pnpm frames approve <run> acceptance',
    );
  const dir = runDir(runId);
  const brief = JSON.parse(
    readFileSync(path.join(dir, 'artifacts', 'local-extension-brief-v1.json'), 'utf8'),
  ) as {
    extension_id: string;
  };
  const receipt = JSON.parse(
    readFileSync(path.join(dir, 'artifacts', 'local-activation-receipt-v1.json'), 'utf8'),
  ) as { manifest_sha256: string };
  const ref = path.posix.join('local/extensions', ...brief.extension_id.split('.').slice(1));
  const target = path.join(root, ref);
  if (existsSync(target)) throw new Error(`EXTEND-COLLISION: ${ref} ya existe`);
  cpSync(path.join(dir, ref), target, { recursive: true, errorOnExist: true });
  try {
    const rec = discoverLocalExtensions({ repository_root: root }).records.find(
      (r) => r.extension_id === brief.extension_id,
    );
    if (rec?.state !== 'ACTIVE_LOCAL') throw new Error(`EXTEND-ACTIVATION: ${rec?.state ?? 'no aparece'}`);
    if (rec.manifest_sha256 !== receipt.manifest_sha256)
      throw new Error('EXTEND-DRIFT: el paquete cambió desde el recibo de L04');
    writeFileSync(
      path.join(target, 'activation-receipt.json'),
      `${JSON.stringify(createLocalActivationReceipt(rec), null, 2)}\n`,
      { flag: 'wx' },
    );
  } catch (e) {
    rmSync(target, { recursive: true, force: true });
    throw e;
  }
  return { id: brief.extension_id, ref };
}
