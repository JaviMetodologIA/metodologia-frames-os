// Load-bearing checks kept from Frames (privacy, portability) plus the ones this
// design needs (domain write boundary, inventory coverage). Each returns problems.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadRegistry } from '../../engine/registry.ts';
import { repoPath } from '../../engine/paths.ts';
import { digest } from '../../engine/aula/catalog.ts';

// Tracked + untracked-but-not-ignored files: what a commit would carry.
export function versionedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: repoPath(),
    encoding: 'utf8',
  });
  return out.split('\0').filter((f) => f && existsSync(repoPath(f)) && statSync(repoPath(f)).isFile());
}

const TEXT = /\.(ts|mjs|js|json|ya?ml|md|toml|sh|txt|html|css)$|^[^.]+$/;

export const SECRETS: [RegExp, string][] = [
  [/AKIA[0-9A-Z]{16}/, 'AWS key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}/, 'GitHub token'],
  [/\bsk-(ant-|proj-)?[A-Za-z0-9_-]{24,}/, 'API key'],
  [/\/Users\/[a-z][\w.-]+\/|[A-Z]:\\Users\\/, 'ruta local absoluta'],
];

// The guard and checks name secret shapes on purpose; they are the only exemptions.
const PRIVACY_EXEMPT = new Set([
  'engine/guard/policy.ts',
  'verify/checks/index.ts',
  'verify/tests/guard.test.ts',
]);

const OFL_FONTS = new Set([
  '983676516167748b74de6f4771fb384c664fd913acb8b471122ecacf5da5ea6c',
  '0f7b311b2f3279e4eef9b2f968bcdbab6e28f4daeb1f049f4f278a902bcd82f7',
]);
export function privacyScanBody(body: string): string {
  return body.replace(/data:font\/ttf;base64,([A-Za-z0-9+/]+={0,2})/g, (uri, encoded: string) => {
    const bytes = Buffer.from(encoded, 'base64');
    return bytes.toString('base64') === encoded && OFL_FONTS.has(digest(bytes))
      ? 'data:font/ttf;base64,[verified-ofl-font]'
      : uri;
  });
}

export function checkPrivacy(): string[] {
  const problems: string[] = [];
  for (const f of versionedFiles()) {
    if (PRIVACY_EXEMPT.has(f) || !TEXT.test(path.basename(f))) continue;
    const body = privacyScanBody(readFileSync(repoPath(f), 'utf8'));
    for (const [re, what] of SECRETS) if (re.test(body)) problems.push(`${f}: ${what}`);
  }
  return problems;
}

export function checkPortability(): string[] {
  const problems: string[] = [];
  const staged = execFileSync('git', ['ls-files', '-s'], { cwd: repoPath(), encoding: 'utf8' });
  for (const line of staged.split('\n'))
    if (line.startsWith('120000')) problems.push(`symlink versionado: ${line.split('\t')[1]}`);
  for (const f of versionedFiles()) {
    if (!/\.(sh|ts|mjs|json)$/.test(f) && !f.startsWith('scripts/git-hooks/')) continue;
    if (f === 'verify/checks/index.ts') continue;
    const body = readFileSync(repoPath(f), 'utf8');
    if (/^#!\/bin\/sh\b/m.test(body)) problems.push(`${f}: #!/bin/sh (usa #!/usr/bin/env bash o node)`);
    if (/\bsed -i (?!'')|\breadlink -f\b|\bgrep -P\b|\bstat -c\b/.test(body))
      problems.push(`${f}: flag solo GNU`);
  }
  return problems;
}

const FS_WRITE =
  /\b(writeFileSync|writeFile|appendFileSync|appendFile|rmSync|rm|unlinkSync|unlink|mkdirSync|renameSync|createWriteStream)\s*\(/;

// Handlers write only through ctx.write, which the engine confines to the run dir.
// Frames' career runner, ported as-is: these files write, and each confines its writes
// to work/private with Frames' own guards (career-runner.ts:54-59, pdf-adapter.ts:41-44).
// The successor's handlers call only the pure functions; the list is explicit on purpose.
const PORTED_WRITERS = new Set(
  [
    'brief-renderer',
    'career-runner',
    'document-renderer',
    'generate-workflow-templates',
    'pdf-adapter',
    'route-career',
  ]
    .map((f) => `domains/career/frames/_runner/${f}.ts`)
    // Frames' release capsule store, ported as-is; no handler calls it (S08 writes via ctx.write).
    .concat(['domains/skills/frames/experience/atomic-capsule-store.ts']),
);

export function checkDomainBoundary(): string[] {
  const dir = repoPath('domains');
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true }))
      e.isDirectory()
        ? walk(path.join(d, e.name))
        : e.name.endsWith('.ts') && files.push(path.join(d, e.name));
  };
  walk(dir);
  return files
    .filter((f) => !PORTED_WRITERS.has(path.relative(repoPath(), f).split(path.sep).join('/')))
    .filter((f) => /from 'node:fs'/.test(readFileSync(f, 'utf8')) && FS_WRITE.test(readFileSync(f, 'utf8')))
    .map((f) => `${path.relative(repoPath(), f)}: escribe al disco sin ctx.write`);
}

export function checkInventory(): { problems: string[]; detail: string } {
  const file = repoPath('verify/parity/frames-inventory.json');
  if (!existsSync(file)) return { problems: ['falta frames-inventory.json (pnpm inventory)'], detail: '' };
  const inv = JSON.parse(readFileSync(file, 'utf8')) as {
    frames_commit: string;
    entries: { kind: string; id: string; destination: string }[];
  };
  const families = new Set(loadRegistry().families.map((f) => f.id));
  const engine = new Set(['engine:classify', 'engine:runs', 'engine:eval', 'engine:gen']);
  const problems = inv.entries
    .filter((e) => !families.has(e.destination) && !engine.has(e.destination))
    .map((e) => `${e.kind} ${e.id}: destino ${e.destination} no existe`);
  return { problems, detail: `${inv.entries.length} capacidades de Frames ${inv.frames_commit} con destino` };
}

// Every npm pack in the vendor lock matches package.json and the pnpm lockfile byte
// for byte: the version and the integrity pnpm verifies the tarball against.
export function checkVendor(): string[] {
  const problems: string[] = [];
  const pkg = JSON.parse(readFileSync(repoPath('package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const lock = readFileSync(repoPath('pnpm-lock.yaml'), 'utf8');
  for (const p of loadRegistry().packs) {
    if (!('npm' in p)) continue;
    const spec = pkg.dependencies?.[p.npm] ?? pkg.devDependencies?.[p.npm];
    if (spec !== p.version)
      problems.push(`${p.id}: package.json fija ${spec ?? 'nada'}, el lock ${p.version}`);
    if (!lock.includes(`${p.npm}@${p.version}:\n    resolution: {integrity: ${p.integrity}}`))
      problems.push(`${p.id}: la integridad del pnpm-lock no coincide con vendor.lock.json`);
    if (!existsSync(repoPath(p.used_by))) problems.push(`${p.id}: used_by ${p.used_by} no existe`);
  }
  return problems;
}
