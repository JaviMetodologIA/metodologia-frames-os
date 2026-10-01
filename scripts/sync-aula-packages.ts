// Import an explicitly chosen portable snapshot; --check is strictly read-only.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AULA_KINDS, digest } from '../engine/aula/catalog.ts';
import { repoPath } from '../engine/paths.ts';

const args = process.argv.slice(2);
const sourceArg = args[args.indexOf('--source') + 1];
if (!args.includes('--source') || !sourceArg)
  throw new Error('usage: sync-aula-packages.ts --source <portable skills directory> [--check]');
const source = path.resolve(sourceArg);
const check = args.includes('--check');
function files(root: string, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (item.name === '__pycache__' || item.name === '.DS_Store') continue;
    if (item.isSymbolicLink()) throw new Error(`symlink refused: ${prefix}${item.name}`);
    const rel = prefix + item.name;
    if (item.isDirectory()) Object.assign(out, files(root, rel + '/'));
    else out[rel] = digest(readFileSync(path.join(root, rel)));
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
const entries = readdirSync(source, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => {
    const dir = path.join(source, e.name);
    const meta = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
      name: string;
      version: string;
      kind: string;
      edition: string;
    };
    if (
      !AULA_KINDS.includes(meta.kind as (typeof AULA_KINDS)[number]) ||
      !['metodologia', 'white-label'].includes(meta.edition)
    )
      throw new Error(`unsupported package: ${e.name}`);
    if (e.name !== meta.name || !/^[a-z0-9-]+$/.test(meta.name)) throw new Error('package identity mismatch');
    return {
      ...meta,
      source: `skills/aula/${meta.name}`,
      handler: 'aula.render' as const,
      files: files(dir),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));
if (entries.length !== 18 || new Set(entries.map((e) => `${e.kind}/${e.edition}`)).size !== 18)
  throw new Error('exactly eighteen kind/edition combinations required');
const engineSource = path.join(source, entries[0]!.name, 'engine');
const engineFiles = files(engineSource);
for (const skill of entries)
  for (const [file, hash] of Object.entries(engineFiles))
    if (skill.files[`engine/${file}`] !== hash) throw new Error(`engine divergence: ${skill.name}/${file}`);
const catalog = {
  schema: 'aula-capabilities-v1',
  state: 'ACTIVE_LOCAL',
  engine: { source: 'engine/aula/runtime', files: engineFiles },
  capabilities: entries.map(({ name, version, kind, edition, source, handler, files }) => ({
    id: name,
    version,
    kind,
    edition,
    source,
    handler,
    files,
  })),
};
const text = JSON.stringify(catalog, null, 2) + '\n';
// Only the eighteen appended rows change; historical inventory bytes stay intact.
const inventoryFile = repoPath('verify/parity/frames-inventory.json');
const inventoryText = readFileSync(inventoryFile, 'utf8');
let nextInventory = inventoryText;
for (const entry of entries) {
  const pattern = new RegExp(
    `^(    \\{[^\\n]*"id": "${entry.name}"[^\\n]*"source_sha256": ")[a-f0-9]{64}("[^\\n]*\\},?)$`,
    'm',
  );
  if (!pattern.test(nextInventory)) throw new Error(`supplemental inventory row missing: ${entry.name}`);
  nextInventory = nextInventory.replace(
    pattern,
    (_match: string, head: string, tail: string) => head + entry.files['SKILL.md'] + tail,
  );
}
if (check) {
  if (readFileSync(repoPath('registry/aula-capabilities.json'), 'utf8') !== text)
    throw new Error('catalog drift');
  for (const e of entries)
    if (JSON.stringify(files(repoPath(e.source))) !== JSON.stringify(e.files))
      throw new Error(`package drift: ${e.name}`);
  if (JSON.stringify(files(repoPath(catalog.engine.source))) !== JSON.stringify(engineFiles))
    throw new Error('engine drift');
  if (inventoryText !== nextInventory) throw new Error('supplemental inventory hashes drift');
} else {
  for (const e of entries) {
    const target = repoPath(e.source);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    mkdirSync(path.dirname(target), { recursive: true });
    for (const f of Object.keys(e.files)) {
      mkdirSync(path.dirname(path.join(target, f)), { recursive: true });
      cpSync(path.join(source, e.name, f), path.join(target, f));
    }
  }
  const target = repoPath(catalog.engine.source);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const f of Object.keys(engineFiles)) cpSync(path.join(engineSource, f), path.join(target, f));
  writeFileSync(repoPath('registry/aula-capabilities.json'), text);
  if (inventoryText !== nextInventory) writeFileSync(inventoryFile, nextInventory);
}
console.log(
  `Aula: ${entries.length} packages, engine and catalog ${check ? 'verified without writes' : 'synchronized'}`,
);
