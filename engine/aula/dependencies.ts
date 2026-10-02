import { lstatSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { within } from '../paths.ts';
import { AulaKind, Edition, digest } from './catalog.ts';

export const Hash = z.string().regex(/^[a-f0-9]{64}$/);
export const Ref = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/)
  .refine((ref) => ref.split('/').every((part) => !['', '.', '..'].includes(part)));
export const BuildDependency = z
  .object({
    role: z.enum([
      'profile',
      'font',
      'core-catalog',
      'bank-manifest',
      'bank-catalog',
      'asset',
      'linked-piece',
    ]),
    ref: Ref,
    sha256: Hash,
  })
  .strict();
export const AssetEvidence = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    kind: z.enum(['icon', 'scene']),
    sha256: Hash,
    source: z.enum(['core', 'bank']),
    catalogSha256: Hash,
  })
  .strict();
export const BuildFields = {
  buildDependencies: z.array(BuildDependency).max(1024).optional(),
  assetEvidence: z.array(AssetEvidence).max(416).optional(),
  profile: z.object({ id: Edition, sha256: Hash }).strict().optional(),
  engineVersion: z.enum(['1.1.0', '1.2.0']).optional(),
};
export const Metadata = z
  .object({ ...BuildFields, bankRef: Ref.optional() })
  .strict()
  .superRefine((b, c) => {
    const fields = ['buildDependencies', 'assetEvidence', 'profile', 'engineVersion'] as const;
    if (fields.some((key) => b[key] !== undefined) && fields.some((key) => b[key] === undefined))
      c.addIssue({ code: 'custom', message: 'AULA-BUILD-BINDING-INCOMPLETE' });
    const deps = b.buildDependencies ?? [];
    if (new Set(deps.map((d) => d.ref)).size !== deps.length)
      c.addIssue({ code: 'custom', message: 'AULA-DEPENDENCY-DUPLICATE' });
    const evidence = b.assetEvidence ?? [];
    if (new Set(evidence.map((a) => a.kind + '/' + a.id)).size !== evidence.length)
      c.addIssue({ code: 'custom', message: 'AULA-EVIDENCE-DUPLICATE' });
    if (b.bankRef && !b.engineVersion) c.addIssue({ code: 'custom', message: 'AULA-BANK-NOT-SUPPORTED' });
    if (
      b.engineVersion &&
      (!deps.some((d) => d.role === 'profile' && d.sha256 === b.profile?.sha256) ||
        (b.profile?.id === 'metodologia' && !deps.some((d) => d.role === 'font')) ||
        !deps.some((d) => d.role === 'core-catalog'))
    )
      c.addIssue({ code: 'custom', message: 'AULA-PROFILE-DEPENDENCIES-INCOMPLETE' });
    for (const a of evidence)
      if (
        !deps.some((d) => d.role === 'asset' && d.sha256 === a.sha256) ||
        !deps.some(
          (d) =>
            d.role === (a.source === 'core' ? 'core-catalog' : 'bank-catalog') &&
            d.sha256 === a.catalogSha256,
        )
      )
        c.addIssue({ code: 'custom', message: 'AULA-ASSET-EVIDENCE-UNBOUND' });
  });
export type BuildMetadata = z.infer<typeof Metadata>;
export function buildMetadata(value: Record<string, unknown>, bankRef?: string): BuildMetadata {
  return Metadata.parse({
    ...Object.fromEntries(
      Object.keys(BuildFields)
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, value[key]]),
    ),
    ...(bankRef ? { bankRef } : {}),
  });
}
export const BuildBindings = z
  .object({
    schema: z.literal('aula-build-bindings-v1'),
    engineFiles: z
      .record(Ref, Hash)
      .refine(
        (files) => ['runtime.py', 'app.js', 'style.css'].every((name) => files[name] !== undefined),
        'AULA-ENGINE-BINDING-INCOMPLETE',
      ),
    skillSha256: Hash,
    sourceSha256: Hash,
    kind: AulaKind,
    edition: Edition,
    ...BuildFields,
    bankRef: Ref.optional(),
  })
  .strict()
  .superRefine((b, c) => {
    const parsed = Metadata.safeParse({
      ...Object.fromEntries(
        Object.keys(BuildFields)
          .filter((key) => b[key as keyof typeof b] !== undefined)
          .map((key) => [key, b[key as keyof typeof b]]),
      ),
      ...(b.bankRef ? { bankRef: b.bankRef } : {}),
    });
    if (!parsed.success)
      for (const issue of parsed.error.issues) c.addIssue({ code: 'custom', message: issue.message });
    if (b.profile && b.profile.id !== b.edition)
      c.addIssue({ code: 'custom', message: 'AULA-PROFILE-EDITION-MISMATCH' });
  });
export function bankRootForRun(runDir: string, bankRef?: string): string | undefined {
  if (!bankRef) return undefined;
  const root = within(runDir, Ref.parse(bankRef));
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink())
    throw new Error('AULA-BANK-ROOT-UNSAFE');
  return root;
}
export function verifyBuildDependencies(
  engine: string,
  sourceDir: string,
  bank: string | undefined,
  b: BuildMetadata,
) {
  for (const dep of b.buildDependencies ?? []) {
    const fromBank = dep.ref.startsWith('bank/');
    const fromInput = dep.role === 'linked-piece' && dep.ref.startsWith('input/');
    if (fromBank && !bank) throw new Error('AULA-BANK-REQUIRED');
    if (!fromBank && !fromInput && !dep.ref.startsWith('assets/core/'))
      throw new Error('AULA-DEPENDENCY-REF');
    const root = fromBank ? bank! : fromInput ? sourceDir : engine;
    if (lstatSync(root).isSymbolicLink()) throw new Error('AULA-DEPENDENCY-SYMLINK');
    const ref = fromBank ? dep.ref.slice(5) : fromInput ? dep.ref.slice(6) : dep.ref;
    const file = within(root, ref);
    if (!lstatSync(file).isFile() || digest(readFileSync(file)) !== dep.sha256)
      throw new Error(`AULA-DEPENDENCY-STALE: ${dep.ref}`);
  }
  if (b.buildDependencies?.some((d) => d.ref.startsWith('bank/')))
    for (const name of ['manifest.json', 'catalog.json'])
      if (!b.buildDependencies.some((d) => d.ref === 'bank/' + name))
        throw new Error('AULA-BANK-BINDING-INCOMPLETE');
}
export function assertSameBuildBinding(expected: BuildMetadata, actual: BuildMetadata) {
  if (digest(JSON.stringify(Metadata.parse(expected))) !== digest(JSON.stringify(Metadata.parse(actual))))
    throw new Error('AULA-BUILD-BINDING-STALE');
}
