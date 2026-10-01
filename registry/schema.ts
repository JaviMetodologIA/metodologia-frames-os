// Registry schema: the single declaration the engine executes. Every check, host
// adapter and generated doc derives from these records; nothing is declared that
// the runtime does not read.
import { z } from 'zod';

const Id = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, 'id: lowercase, digits, . _ -');
const AgentId = z.string().regex(/^RT-\d{2}$/);
const StepId = z.string().regex(/^[A-Z]{1,2}\d{2}$/);

// Step predicate over typed run facts: { fact, eq } | { all } | { any } | { not }.
export type Pred =
  { fact: string; eq: string | number | boolean } | { all: Pred[] } | { any: Pred[] } | { not: Pred };
export const Pred: z.ZodType<Pred> = z.lazy(() =>
  z.union([
    z.object({ fact: z.string(), eq: z.union([z.string(), z.number(), z.boolean()]) }).strict(),
    z.object({ all: z.array(Pred).min(1) }).strict(),
    z.object({ any: z.array(Pred).min(1) }).strict(),
    z.object({ not: Pred }).strict(),
  ]),
);

export const Output = z
  .object({ id: Id, schema: Id, required: z.boolean().default(true), when: Pred.optional() })
  .strict();

export const Step = z
  .object({
    id: StepId,
    title: z.string().min(1),
    handler: Id,
    when: Pred.optional(),
    inputs: z.array(Id).default([]),
    outputs: z.array(Output).default([]),
    agent: AgentId,
    skills: z.array(Id).default([]),
    effect: z.enum(['none', 'local', 'external']).default('none'),
    gate: Id.optional(),
    template: z.string().optional(),
  })
  .strict();

export const Improvement = z.object({ id: Id, claim: z.string().min(1), check: z.string().min(1) }).strict();

export const Family = z
  .object({
    id: Id,
    title: z.string().min(1),
    // Frames route kept for traceability of the successor mapping.
    frames_route: z.string().regex(/^R\d+(-[A-Z]+)?$/),
    status: z.enum(['planned', 'active']),
    wave: z.number().int().min(0).max(7),
    intent: z
      .object({
        examples: z.array(z.string().min(3)).min(3),
        negatives: z.array(z.string().min(3)).default([]),
      })
      .strict(),
    // At most three blocking questions (Frames router rule).
    slots: z
      .array(z.object({ id: Id, question: z.string().min(1), required: z.boolean() }).strict())
      .max(3)
      .default([]),
    improvements: z.array(Improvement).default([]),
    steps: z.array(Step).default([]),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.status === 'active' && f.steps.length === 0)
      ctx.addIssue({ code: 'custom', message: `${f.id}: an active family needs steps` });
  });

export const Gate = z
  .object({
    id: Id,
    kind: z.enum(['human', 'hard_stop']),
    checkpoint: z.enum(['outcome', 'sources_and_spec', 'direction', 'acceptance', 'correction']).nullable(),
    summary: z.string().min(1),
  })
  .strict();

export const Agent = z
  .object({
    id: AgentId,
    title: z.string().min(1),
    purpose: z.string().min(1),
    tools_allow: z.array(z.string()).min(1),
    tools_deny: z.array(z.string()).min(1),
    stop_rules: z
      .array(
        z
          .object({
            id: Id,
            condition: z.string().min(1),
            result: z.enum(['BLOCK', 'RETURN', 'ESCALATE']),
          })
          .strict(),
      )
      .min(1),
    done: z.array(z.string().min(1)).min(1),
  })
  .strict();

const GitPack = z
  .object({
    id: Id,
    url: z.string().url(),
    commit: z.string().regex(/^[0-9a-f]{7,40}$/),
    tree_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    licence: z.string().min(1),
    osi: z.boolean(),
    optional: z.boolean(),
  })
  .strict();
// An npm package pinned by version and lockfile integrity (pnpm verifies the tarball).
const NpmPack = z
  .object({
    id: Id,
    npm: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    integrity: z.string().startsWith('sha512-'),
    licence: z.string().min(1),
    osi: z.boolean(),
    optional: z.boolean(),
    used_by: z.string().min(1),
  })
  .strict();
export const Pack = z.union([GitPack, NpmPack]);

export type Step = z.infer<typeof Step>;
export type Family = z.infer<typeof Family>;
export type Gate = z.infer<typeof Gate>;
export type Agent = z.infer<typeof Agent>;
export type Pack = z.infer<typeof Pack>;
export type Registry = { families: Family[]; gates: Gate[]; agents: Agent[]; packs: Pack[] };
