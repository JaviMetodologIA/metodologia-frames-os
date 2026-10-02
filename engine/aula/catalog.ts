// Material capabilities: packages and their renderer are both hash-bound.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import YAML from 'yaml';
import { repoPath } from '../paths.ts';

export const AULA_KINDS = [
  'immersive-class',
  'workshop-immersive',
  'masterclass',
  'workbook',
  'lean-coffee',
  'playbook',
  'playbook-immersive',
  'index',
  'module',
  'dynamic-commercial-decks',
] as const;
export const AulaKind = z.enum(AULA_KINDS);
export const Edition = z.enum(['metodologia', 'white-label']);
export type AulaKind = z.infer<typeof AulaKind>;
export type Edition = z.infer<typeof Edition>;
export const digest = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Ref = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/)
  .refine((p) => p.split('/').every((s) => s !== '..' && s !== '.' && s !== ''), 'unsafe reference');
const Capability = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    version: z.string().min(1),
    kind: AulaKind,
    edition: Edition,
    source: Ref,
    handler: z.literal('aula.render'),
    files: z.record(Ref, Hash),
  })
  .strict();
const Catalog = z
  .object({
    schema: z.literal('aula-capabilities-v1'),
    state: z.literal('ACTIVE_LOCAL'),
    engine: z.object({ source: Ref, files: z.record(Ref, Hash) }).strict(),
    capabilities: z.array(Capability).length(AULA_KINDS.length * Edition.options.length),
  })
  .strict();
export type AulaCatalog = z.infer<typeof Catalog>;
export type AulaCapability = z.infer<typeof Capability>;

function walk(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => {
      const rel = prefix + e.name;
      if (e.isSymbolicLink()) throw new Error(`AULA-SYMLINK: ${rel}`);
      return e.isDirectory() ? walk(path.join(dir, e.name), rel + '/') : [rel];
    })
    .sort();
}

export function verifyTree(source: string, files: Record<string, string>): void {
  const root = repoPath(source);
  for (let at = root; at !== repoPath(); at = path.dirname(at))
    if (!existsSync(at) || lstatSync(at).isSymbolicLink()) throw new Error(`AULA-SOURCE-MISSING: ${source}`);
  const actual = walk(root);
  if (actual.join('\n') !== Object.keys(files).sort().join('\n'))
    throw new Error(`AULA-FILE-SET-MISMATCH: ${source}`);
  for (const f of actual)
    if (digest(readFileSync(path.join(root, f))) !== files[f])
      throw new Error(`AULA-HASH-MISMATCH: ${source}/${f}`);
}

export function loadAulaCatalog(file = repoPath('registry/aula-capabilities.json')): AulaCatalog {
  const catalog = Catalog.parse(JSON.parse(readFileSync(file, 'utf8')) as unknown);
  verifyTree(catalog.engine.source, catalog.engine.files);
  const keys = new Set<string>();
  const ids = new Set<string>();
  for (const skill of catalog.capabilities) {
    const key = `${skill.edition}/${skill.kind}`;
    if (keys.has(key) || ids.has(skill.id)) throw new Error(`AULA-DUPLICATE: ${key}`);
    keys.add(key);
    ids.add(skill.id);
    verifyTree(skill.source, skill.files);
    const meta = JSON.parse(readFileSync(repoPath(skill.source, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    if (
      meta.name !== skill.id ||
      meta.version !== skill.version ||
      meta.kind !== skill.kind ||
      meta.edition !== skill.edition
    )
      throw new Error(`AULA-PACKAGE-MISMATCH: ${skill.id}`);
    if (meta.sourceEngineSha256 !== catalog.engine.files['runtime.py'])
      throw new Error(`AULA-ENGINE-META-MISMATCH: ${skill.id}`);
    const body = readFileSync(repoPath(skill.source, 'SKILL.md'), 'utf8');
    const front = /^---\n([\s\S]*?)\n---\n/.exec(body)?.[1];
    if (!front) throw new Error(`AULA-SKILL-METADATA-MISSING: ${skill.id}`);
    const active = z
      .object({
        name: z.literal(skill.id),
        metadata: z
          .object({
            lifecycle_state: z.literal('active'),
            execution_scope: z.literal('local-draft-generation'),
          })
          .passthrough(),
      })
      .passthrough();
    if (!active.safeParse(YAML.parse(front) as unknown).success)
      throw new Error(`AULA-SKILL-NOT-ACTIVE: ${skill.id}`);
    for (const f of ['runtime.py', 'app.js', 'style.css'])
      if (skill.files[`engine/${f}`] !== catalog.engine.files[f])
        throw new Error(`AULA-ENGINE-DIVERGENCE: ${skill.id}/${f}`);
  }
  for (const edition of Edition.options)
    for (const kind of AULA_KINDS)
      if (!keys.has(`${edition}/${kind}`)) throw new Error(`AULA-CAPABILITY-MISSING: ${edition}/${kind}`);
  return catalog;
}

export function selectAula(
  kind: AulaKind,
  edition: Edition,
): { skill: AulaCapability; catalog: AulaCatalog } {
  const catalog = loadAulaCatalog();
  const skill = catalog.capabilities.find((s) => s.kind === kind && s.edition === edition);
  if (!skill) throw new Error(`AULA-CAPABILITY-MISSING: ${edition}/${kind}`);
  return { skill, catalog };
}
