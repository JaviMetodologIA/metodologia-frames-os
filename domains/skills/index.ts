// skills.build: Frames' route R8 in two tracks, chosen by the `track` fact.
//   local (default) L00-L05: a private extension under local/ (never versioned), on
//     Frames' own loader, hash checks and activation receipt (ported as-is in frames/).
//   system S00-S09: a skill candidate with Frames' demotion rule, effect policy and
//     PASS/REVISE/UNKNOWN eval verdict (ported as-is). Frames' eval run was a declared
//     record: here each case is scored by the engine's own classifier, candidate vs
//     baseline, so the verdict is computed rather than asserted.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { MIN_SCORE, rank } from '../../engine/classify.ts';
import {
  missingFrom,
  PLACEHOLDER,
  relTo,
  requestFromHost,
  type Handler,
  type HandlerCtx,
  type SchemaCheck,
} from '../../engine/handler-kit.ts';
import { repoPath } from '../../engine/paths.ts';
import type { Registry } from '../../registry/schema.ts';
import { SECRETS } from '../../verify/checks/index.ts';
import {
  createLocalActivationReceipt,
  discoverLocalExtensions,
  LocalExtensionIdSchema,
  routeLocalExtensionIntent,
  type LocalExtensionIntentInput,
  type LocalExtensionRecord,
} from './frames/local-extensions/index.ts';
import {
  ArchitectureDecisionV1Schema,
  CapabilityMapV1Schema,
  ComponentContractV1Schema,
  SkillChangeProposalV1Schema,
  SkillEvalRunV1Schema,
  SkillReviewReportV1Schema,
  SkillSystemCaseV1Schema,
} from './frames/skill-systems/contracts.ts';
import {
  decideSmallestComponentV1,
  effectPolicyV1,
  evaluateSkillRunV1,
} from './frames/skill-systems/governance.ts';

const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const json = <T = unknown>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const out = (ctx: HandlerCtx, id: string) => ctx.outputs.find((o) => o.id === id);
const put = (ctx: HandlerCtx, id: string, data: unknown) => {
  const o = out(ctx, id);
  if (!o) return;
  ctx.write(relTo(ctx, o.file), typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');
};
const input = (ctx: HandlerCtx, id: string) => {
  const f = ctx.inputs[id];
  if (!f || !existsSync(f)) throw new Error(`falta el insumo ${id}`);
  return f;
};
const repoRoot = (ctx: HandlerCtx) => String(ctx.facts.repo ?? repoPath());
const issues = (e: z.ZodError) =>
  e.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ');
const zodCheck =
  (schema: z.ZodType, extra?: (v: never) => string | null): SchemaCheck =>
  (c) => {
    let v: unknown;
    try {
      v = JSON.parse(c);
    } catch (e) {
      return `JSON inválido: ${(e as Error).message}`;
    }
    const r = schema.safeParse(v);
    if (!r.success) return issues(r.error);
    return extra ? extra(r.data as never) : null;
  };

// ---------- schemas the host authors ----------

const Brief = z.strictObject({
  schema_version: z.literal('local-extension-brief-v1'),
  request: z.string().min(8).max(2000),
  extension_kind: z.enum(['skill', 'workflow', 'bundle']),
  scope: z.enum(['PROJECT_LOCAL', 'USER_LOCAL']),
  desired_capability: z.string().min(8).max(500),
  extension_id: LocalExtensionIdSchema,
});

// Frames' documentation-impact-plan-v1 (core/contracts/documentation-governance-v1.ts):
// every one of the 14 surfaces resolves once, and a local plan writes only local docs.
// Its canonicalSha256 field is dropped: the engine binds each artifact's sha at its gate.
export const SURFACES = [
  'QUICK_START',
  'FUNCTIONAL_GUIDE',
  'TECHNICAL_REFERENCE',
  'ARCHITECTURE',
  'WORKFLOW_SEQUENCE',
  'SKILL_CONTEXT',
  'TEMPLATES_DELIVERABLES',
  'ROUTING_COMMANDS',
  'TROUBLESHOOTING',
  'ADR',
  'CHANGELOG_COMPATIBILITY',
  'INDEXES_INVENTORIES',
  'PORTAL',
  'TESTS_EXAMPLES',
] as const;
export const MUTATION_CLASSES = ['CREATE', 'EXPAND', 'EXTEND', 'CORRECT', 'MIGRATE', 'DEPRECATE'] as const;
const Ref = z
  .string()
  .min(1)
  .max(240)
  .refine((v) => !v.startsWith('/') && !v.split('/').includes('..') && !v.includes('\\'), 'ruta no relativa');
export const ImpactPlan = z
  .strictObject({
    schemaVersion: z.literal('documentation-impact-plan-v1'),
    planId: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,79}$/),
    changeClass: z.enum(MUTATION_CLASSES),
    scope: z.enum(['CANONICAL', 'PROJECT_LOCAL', 'USER_LOCAL']),
    affectedIds: z.array(z.string().min(1).max(120)).min(1).max(40),
    surfaces: z
      .array(
        z.discriminatedUnion('disposition', [
          z.strictObject({
            surface: z.enum(SURFACES),
            disposition: z.literal('REQUIRED'),
            sourceRefs: z.array(Ref).min(1).max(20),
          }),
          z.strictObject({
            surface: z.enum(SURFACES),
            disposition: z.literal('NOT_APPLICABLE'),
            reasonCode: z.enum([
              'NO_USER_VISIBLE_CHANGE',
              'NO_ARCHITECTURE_CHANGE',
              'NO_WORKFLOW_CHANGE',
              'NO_ROUTING_CHANGE',
              'NO_COMPATIBILITY_CHANGE',
              'LOCAL_SCOPE_ONLY',
            ]),
          }),
        ]),
      )
      .length(SURFACES.length),
  })
  .superRefine((v, c) => {
    if (new Set(v.surfaces.map((s) => s.surface)).size !== SURFACES.length)
      c.addIssue({ code: 'custom', message: 'cada superficie documental se resuelve una sola vez' });
    if (
      v.scope !== 'CANONICAL' &&
      v.surfaces.some(
        (s) => s.disposition === 'REQUIRED' && s.sourceRefs.some((r) => !r.startsWith('local/')),
      )
    )
      c.addIssue({ code: 'custom', message: 'un plan local solo escribe documentación bajo local/' });
  });
export type ImpactPlan = z.infer<typeof ImpactPlan>;

const Demotion = z.strictObject({
  schema_version: z.literal('demotion-input-v1'),
  repeatable: z.boolean(),
  needsSpecializedJudgment: z.boolean(),
  instructionSufficient: z.boolean(),
  referenceSufficient: z.boolean(),
  toolSufficient: z.boolean(),
});

const EvalPlan = z
  .strictObject({
    schema_version: z.literal('skill-eval-plan-v1'),
    baseline: z.enum(['NO_SKILL', 'PREVIOUS_VERSION']),
    coverage_policy: z.strictObject({
      minimum_eligible_cases: z.number().int().min(2),
      maximum_infrastructure_failure_ratio: z.number().min(0).max(1),
    }),
    cases: z
      .array(
        z.strictObject({
          eval_case_id: z.string().regex(/^[A-Z][A-Z0-9_-]{2,63}$/),
          corpus: z.enum(['DEVELOPMENT', 'HELD_OUT', 'ADVERSARIAL', 'REGRESSION']),
          prompt: z.string().min(4).max(2000),
          should_trigger: z.boolean(),
        }),
      )
      .min(2),
  })
  .superRefine((v, c) => {
    if (!v.cases.some((x) => x.should_trigger) || !v.cases.some((x) => !x.should_trigger))
      c.addIssue({ code: 'custom', message: 'el plan necesita casos que disparan y casos que no' });
    if (new Set(v.cases.map((x) => x.eval_case_id)).size !== v.cases.length)
      c.addIssue({ code: 'custom', message: 'eval_case_id repetido' });
  });
type EvalPlan = z.infer<typeof EvalPlan>;

// A SKILL.md: frontmatter at byte 0 with name and description, then a body.
export function parseSkillMd(c: string): { name: string; description: string; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(c);
  if (!m) throw new Error('falta el frontmatter en el byte 0');
  const fm = YAML.parse(m[1] ?? '') as { name?: unknown; description?: unknown };
  if (typeof fm?.name !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(fm.name))
    throw new Error('name debe ser kebab-case de hasta 64 caracteres');
  if (typeof fm.description !== 'string' || fm.description.length < 20 || fm.description.length > 1024)
    throw new Error('description entre 20 y 1024 caracteres');
  const body = (m[2] ?? '').trim();
  if (!body) throw new Error('el cuerpo está vacío');
  return { name: fm.name, description: fm.description, body };
}

const skillMd: SchemaCheck = (c) => {
  try {
    parseSkillMd(c);
  } catch (e) {
    return (e as Error).message;
  }
  return PLACEHOLDER.test(c) ? `marcador sin llenar: ${PLACEHOLDER.exec(c)?.[0]}` : null;
};

// ---------- local track ----------

const segments = (id: string) => id.split('.').slice(1);
const pkgRel = (id: string) => path.posix.join('local/extensions', ...segments(id));

// L02: the package Frames' frames-extend --apply wrote (frames-extend.ts:116-160),
// materialized inside the run; installing it is `frames extend <run>` after L04's gate.
const scaffold: Handler = async (ctx) => {
  const brief = Brief.parse(json(input(ctx, 'local-extension-brief-v1')));
  const design = readFileSync(input(ctx, 'local-extension-design-v1'), 'utf8');
  ImpactPlan.parse(json(input(ctx, 'documentation-impact-plan-v1')));
  const route = routeLocalExtensionIntent(brief as LocalExtensionIntentInput);
  const stable = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
  const files = new Map([
    ['documentation.md', design.endsWith('\n') ? design : `${design}\n`],
    [
      'sequence.md',
      `# Secuencia\n\n1. Recibir intención.\n2. Validar inputs.\n3. Producir dentro del write set.\n4. Verificar y detener.\n`,
    ],
    ['fixtures/positive.json', stable({ request: brief.request, expected: 'VALID' })],
    ['fixtures/adversarial.json', stable({ request: '../escape', expected: 'BLOCKED' })],
  ]);
  const manifest = {
    schema_version: 'frames-local-extension-v1',
    extension_id: brief.extension_id,
    version: '0.1.0',
    scope: brief.scope,
    kind: brief.extension_kind,
    lifecycle: 'READY',
    enabled: true,
    override_policy: 'never',
    description: route.desired_capability,
    triggers: [brief.request.trim().toLowerCase()],
    capabilities: [
      route.desired_capability
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, ''),
    ],
    inputs: [],
    outputs: [],
    dependencies: [],
    effect_class: 'read_only',
    tools: [],
    read_set: [],
    write_set: [],
    routing: { priority: 'after_canonical', complements: [] },
    execution: { mode: 'declarative' },
    content: [...files].map(([ref, c]) => ({ ref, sha256: sha(c) })),
    documentation: ['documentation.md', 'sequence.md'],
    fixtures: { positive: 'fixtures/positive.json', adversarial: 'fixtures/adversarial.json' },
    budgets: { max_files: 8, max_context_files: 6 },
  };
  const root = pkgRel(brief.extension_id);
  for (const [ref, c] of files) ctx.write(`${root}/${ref}`, c);
  const yml = YAML.stringify(manifest);
  ctx.write(`${root}/extension.yml`, yml);
  put(ctx, 'local-extension-manifest-v1', manifest);
  put(ctx, 'local-extension-package-v1', {
    schema: 'local-extension-package-v1',
    root,
    manifest_sha256: sha(yml),
    files: [...manifest.content, { ref: 'extension.yml', sha256: sha(yml) }],
  });
  return {
    status: 'done',
    note: `paquete ${brief.extension_id} materializado en el run (${files.size + 1} archivos)`,
  };
};

const recordIn = (root: string, id: string): LocalExtensionRecord | undefined =>
  discoverLocalExtensions({ repository_root: root }).records.find((r) => r.extension_id === id);

// L03: Frames' loader validates the package where it sits; then a tampered copy must be
// blocked by the same loader, or the hash check proves nothing.
const validateLocal: Handler = async (ctx) => {
  const brief = Brief.parse(json(input(ctx, 'local-extension-brief-v1')));
  const record = recordIn(ctx.runDir, brief.extension_id);
  if (!record) return { status: 'blocked', note: 'el loader de Frames no encuentra el paquete del run' };
  const root = pkgRel(brief.extension_id);
  for (const f of ['extension.yml', 'sequence.md', 'fixtures/positive.json', 'fixtures/adversarial.json'])
    ctx.write(`probe/${root}/${f}`, readFileSync(path.join(ctx.runDir, root, f)));
  ctx.write(
    `probe/${root}/documentation.md`,
    `${readFileSync(path.join(ctx.runDir, root, 'documentation.md'), 'utf8')}\nalterado\n`,
  );
  const tampered = recordIn(path.join(ctx.runDir, 'probe'), brief.extension_id);
  const detected = tampered?.state === 'BLOCKED' && tampered.reason_codes.includes('CONTENT_HASH_MISMATCH');
  put(ctx, 'local-extension-validation-v1', {
    schema: 'local-extension-validation-v1',
    extension_id: record.extension_id,
    state: record.state,
    reason_codes: record.reason_codes,
    manifest_sha256: record.manifest_sha256 ?? null,
  });
  put(ctx, 'sandbox-probe-v1', {
    schema: 'sandbox-probe-v1',
    mode: 'declarative',
    tamper: 'documentation.md alterado',
    tamper_state: tampered?.state ?? 'MISSING',
    tamper_reason_codes: tampered?.reason_codes ?? [],
    tamper_detected: detected,
  });
  if (record.state !== 'ACTIVE_LOCAL')
    return {
      status: 'needs_input',
      note: `el paquete no valida: ${record.state} ${record.reason_codes.join(', ')}`,
    };
  if (!detected)
    return { status: 'blocked', note: 'la copia alterada no se bloqueó: el chequeo de hash no protege' };
  return {
    status: 'done',
    note: 'paquete válido; la copia alterada queda BLOCKED por CONTENT_HASH_MISMATCH',
  };
};

// L04: Frames' activation receipt over the validated record, and the index of what the
// repo already has active locally. Installing waits for this step's gate.
const activateLocal: Handler = async (ctx) => {
  const brief = Brief.parse(json(input(ctx, 'local-extension-brief-v1')));
  const record = recordIn(ctx.runDir, brief.extension_id);
  if (record?.state !== 'ACTIVE_LOCAL')
    return { status: 'blocked', note: 'el paquete dejó de validar desde L03' };
  const installed = discoverLocalExtensions({ repository_root: repoRoot(ctx) }).records;
  if (installed.some((r) => r.extension_id === brief.extension_id))
    return {
      status: 'needs_input',
      note: `${brief.extension_id} ya existe en local/: usa otro id o evoluciona esa`,
    };
  put(ctx, 'local-activation-receipt-v1', createLocalActivationReceipt(record));
  put(ctx, 'local-extension-index-v1', {
    schema: 'local-extension-index-v1',
    installed: installed.map((r) => ({ id: r.extension_id, state: r.state, scope: r.scope })),
    candidate: {
      id: record.extension_id,
      state: record.state,
      install: `pnpm frames extend ${path.basename(ctx.runDir)}`,
    },
  });
  return {
    status: 'done',
    note: `listo para instalar tras el gate: pnpm frames extend ${path.basename(ctx.runDir)}`,
  };
};

// L05: the installed package must be the one L04 received (same manifest sha, still
// ACTIVE_LOCAL), and every REQUIRED documentation surface must exist with its hash.
const closeLocal: Handler = async (ctx) => {
  const brief = Brief.parse(json(input(ctx, 'local-extension-brief-v1')));
  const receipt = json<{ manifest_sha256: string }>(input(ctx, 'local-activation-receipt-v1'));
  const planFile = input(ctx, 'documentation-impact-plan-v1');
  const plan = ImpactPlan.parse(json(planFile));
  const root = repoRoot(ctx);
  const record = recordIn(root, brief.extension_id);
  if (!record)
    return {
      status: 'needs_input',
      note: `instala primero: pnpm frames extend ${path.basename(ctx.runDir)}`,
    };
  if (record.state !== 'ACTIVE_LOCAL' || record.manifest_sha256 !== receipt.manifest_sha256)
    return { status: 'blocked', note: `lo instalado no es lo que L04 recibió (${record.state})` };
  const refs = plan.surfaces.flatMap((s) => (s.disposition === 'REQUIRED' ? s.sourceRefs : []));
  const missing = refs.filter((r) => !existsSync(path.join(root, r)));
  const sources = refs
    .filter((r) => !missing.includes(r))
    .map((ref) => ({ ref, sha256: sha(readFileSync(path.join(root, ref))) }));
  const pkg = json<{ files: { ref: string; sha256: string }[]; root: string }>(
    input(ctx, 'local-extension-package-v1'),
  );
  put(ctx, 'local-extension-successor-v1', {
    schema: 'local-extension-successor-v1',
    extension_id: record.extension_id,
    version: record.manifest?.version,
    state: record.state,
    installed_ref: pkg.root,
    manifest_sha256: record.manifest_sha256,
  });
  put(ctx, 'documentation-closure-receipt-v1', {
    schema: 'documentation-closure-receipt-v1',
    impact_plan_sha256: sha(readFileSync(planFile)),
    status: missing.length ? 'BLOCKED' : 'PASS',
    missing,
    sources,
    projections: pkg.files.map((f) => ({ ref: `${pkg.root}/${f.ref}`, sha256: f.sha256 })),
  });
  if (missing.length)
    return { status: 'needs_input', note: `faltan superficies documentales: ${missing.join(', ')}` };
  return { status: 'done', note: `${record.extension_id} activa en local/ y su documentación cerrada` };
};

// ---------- system track ----------

// S01: Frames' demotion rule picks the smallest component; anything short of a skill
// ends the run here, with the decision as its result.
const demotion: Handler = async (ctx) => {
  const miss = missingFrom(ctx, ['demotion-input', 'discovery-report']);
  if (miss.length)
    return requestFromHost(ctx, miss, [
      'Responde cada campo de demotion-input-v1 con evidencia en discovery-report.',
    ]);
  const d = decideSmallestComponentV1(Demotion.parse(json(out(ctx, 'demotion-input')!.file)));
  put(ctx, 'demotion-decision', { schema: 'demotion-decision-v1', ...d });
  return d.decision === 'DEMOTE'
    ? { status: 'done', note: `no hace falta una skill: basta ${d.kind}`, facts: { demoted: true } }
    : { status: 'done', note: 'una skill es el componente más pequeño que sirve', facts: { demoted: false } };
};

const PRIVATE_PATH = new RegExp(['/', 'Users/[a-z]|/home/[a-z]|[A-Z]:\\\\', 'Users'].join(''));
const SUPPLY_CHAIN: [(md: string) => boolean, string][] = [
  [(md) => /curl[^\n|]*\|\s*(ba|z)?sh\b/.test(md), 'curl | sh'],
  // npx runs whatever version is latest unless the package names one: pkg@1.2.3.
  [
    (md) =>
      [...md.matchAll(/\bnpx\s+(?:-y\s+)?(@?[a-z][\w./-]*(?:@[\w.^~-]+)?)/g)].some(
        (m) => !/.@\d/.test(m[1] ?? ''),
      ),
    'npx sin versión fijada',
  ],
  [(md) => /\bhttp:\/\//.test(md), 'enlace http sin TLS'],
];

// S05: static checks on the candidate, plus Frames' effect policy against the case's
// effect ceiling (the successor has no trusted runner or sandbox replay: E3+ stops).
export function staticFindings(md: string, effect: 'E0' | 'E1' | 'E2' | 'E3' | 'E4', writes: boolean) {
  const f: string[] = [];
  try {
    parseSkillMd(md);
  } catch (e) {
    f.push(`frontmatter: ${(e as Error).message}`);
  }
  if (md.split('\n').length > 500) f.push('más de 500 líneas: mueve detalle a references/');
  if (PRIVATE_PATH.test(md)) f.push('ruta local absoluta');
  for (const [re, what] of SECRETS) if (re.test(md)) f.push(`secreto: ${what}`);
  for (const [bad, what] of SUPPLY_CHAIN) if (bad(md)) f.push(`cadena de suministro: ${what}`);
  const policy = effectPolicyV1(effect, {
    workOrder: writes,
    trustedRunner: false,
    sandboxReplay: false,
    humanAuthorization: false,
  });
  if (policy.status !== 'PASS')
    f.push(`efecto ${effect}: ${policy.status} ${'gap' in policy ? policy.gap : ''}`.trim());
  return { findings: f, policy };
}

const staticCheck: Handler = async (ctx) => {
  const md = readFileSync(input(ctx, 'skill-candidate'), 'utf8');
  const c = SkillSystemCaseV1Schema.parse(json(input(ctx, 'skill-system-case-v1')));
  const contract = ComponentContractV1Schema.parse(json(input(ctx, 'component-contract-v1')));
  const { findings, policy } = staticFindings(md, c.effect_ceiling, contract.write_set.length > 0);
  put(ctx, 'static-validation-report', {
    schema: 'static-validation-report-v1',
    candidate_sha256: sha(md),
    status: findings.length ? 'BLOCKED' : 'PASS',
    effect_policy: policy,
    findings,
  });
  return findings.length
    ? { status: 'needs_input', note: `el candidato no pasa: ${findings.join('; ')}` }
    : { status: 'done', note: 'candidato limpio: frontmatter, tamaño, privacidad, supply chain y efecto' };
};

// A skill "triggers" on a prompt when the engine's intent scorer, fed only the skill's
// description sentences, clears the same MIN_SCORE a family must clear.
export function triggers(description: string, prompt: string): boolean {
  const examples = description
    .split(/(?<=[.;:])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const reg = {
    families: [{ id: 'skill', title: 'skill', intent: { examples, negatives: [] } }],
  } as unknown as Registry;
  return (rank(reg, prompt)[0]?.score ?? 0) >= MIN_SCORE;
}

const upperId = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '-')
    .slice(0, 60);

// S06: every case scored for the candidate and the baseline, then Frames'
// evaluateSkillRunV1 decides: PASS only with enough eligible cases and more candidate
// passes than baseline passes; REVISE or UNKNOWN send the run back.
const evaluate: Handler = async (ctx) => {
  const candFile = input(ctx, 'skill-candidate');
  const planFile = input(ctx, 'skill-eval-plan');
  const cand = parseSkillMd(readFileSync(candFile, 'utf8'));
  const plan: EvalPlan = EvalPlan.parse(json(planFile));
  const baseFile = path.join(ctx.runDir, 'artifacts', 'skill-baseline.md'); // optional S04 output
  const base =
    plan.baseline === 'PREVIOUS_VERSION'
      ? existsSync(baseFile)
        ? parseSkillMd(readFileSync(baseFile, 'utf8'))
        : null
      : null;
  if (plan.baseline === 'PREVIOUS_VERSION' && !base)
    return {
      status: 'needs_input',
      note: 'el plan compara contra la versión anterior y falta skill-baseline',
    };
  const evidence = [{ ref: 'artifacts/skill-candidate.md', sha256: sha(readFileSync(candFile)) }];
  const run = SkillEvalRunV1Schema.parse({
    schema_version: 'skill-eval-run-v1',
    run_id: upperId(`EVAL-${path.basename(ctx.runDir)}`),
    candidate_ref: 'artifacts/skill-candidate.md',
    candidate_sha256: evidence[0]!.sha256,
    cases: plan.cases.map((k) => ({
      eval_case_id: k.eval_case_id,
      infrastructure_status: 'PASS',
      candidate_pass: triggers(cand.description, k.prompt) === k.should_trigger,
      // No skill never triggers: it passes the negatives and fails the positives.
      baseline_pass: base ? triggers(base.description, k.prompt) === k.should_trigger : !k.should_trigger,
      evidence_refs: evidence,
    })),
    replay_ref: 'artifacts/skill-eval-plan.json',
    replay_sha256: sha(readFileSync(planFile)),
    actor_id: 'frames-os-eval',
    coverage_policy: plan.coverage_policy,
  });
  const summary = evaluateSkillRunV1(run);
  put(ctx, 'skill-eval-run-v1', run);
  put(ctx, 'eval-summary', summary);
  if (summary.verdict !== 'PASS')
    return {
      status: 'needs_input',
      note: `veredicto ${summary.verdict}: candidato ${summary.candidate_passes}/${summary.denominator}, base ${summary.baseline_passes}/${summary.denominator}; ajusta la descripción (S04)`,
    };
  return {
    status: 'done',
    note: `PASS: candidato ${summary.candidate_passes}/${summary.denominator} frente a base ${summary.baseline_passes}/${summary.denominator}`,
  };
};

// S07: the review and the proposal are authored, but both must name the candidate's
// real sha, and only a PASS review moves on.
const review: Handler = async (ctx) => {
  const miss = missingFrom(ctx);
  if (miss.length)
    return requestFromHost(ctx, miss, ['candidate_sha256 = sha256 del archivo skill-candidate.']);
  const cand = sha(readFileSync(input(ctx, 'skill-candidate')));
  const r = SkillReviewReportV1Schema.parse(json(out(ctx, 'skill-review-report-v1')!.file));
  const p = SkillChangeProposalV1Schema.parse(json(out(ctx, 'skill-change-proposal-v1')!.file));
  if (r.candidate_sha256 !== cand || p.candidate_sha256 !== cand)
    return {
      status: 'needs_input',
      note: 'la revisión o la propuesta no nombran el candidato actual (sha distinto)',
    };
  if (p.review_id !== r.review_id) return { status: 'needs_input', note: 'la propuesta cita otra revisión' };
  if (r.verdict !== 'PASS')
    return { status: 'needs_input', note: `revisión ${r.verdict}: ${r.findings.join('; ')}` };
  return { status: 'done', note: `revisión PASS; propuesta ${p.action}` };
};

// S08: the release capsule binds every file by sha and names the run's human approvals
// read from its log. Frames required four receipts from four actors; one consultant
// cannot produce those honestly, so the approvals are the engine's sha-bound gates
// (ADR 0006). No host is marked PASS without a host probe, as in Frames.
const PACKAGED = [
  'skill-candidate',
  'static-validation-report',
  'skill-eval-run-v1',
  'eval-summary',
  'skill-review-report-v1',
  'skill-change-proposal-v1',
];
const packageRelease: Handler = async (ctx) => {
  const files = PACKAGED.map((id) => {
    const f = input(ctx, id);
    return { ref: `artifacts/${path.basename(f)}`, sha256: sha(readFileSync(f)) };
  }).sort((a, b) => a.ref.localeCompare(b.ref));
  const manifest = `${files.map((f) => `${f.sha256}  ${f.ref}`).join('\n')}\n`;
  const log = existsSync(path.join(ctx.runDir, 'log.jsonl'))
    ? readFileSync(path.join(ctx.runDir, 'log.jsonl'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, string>)
    : [];
  const approvals = log
    .filter((e) => e.event === 'approved')
    .map((e) => ({ step: e.step, gate: e.gate, nonce: e.nonce }));
  const stat = json<{ status: string }>(input(ctx, 'static-validation-report'));
  const name = parseSkillMd(readFileSync(input(ctx, 'skill-candidate'), 'utf8')).name;
  const restore = [
    `# Cómo deshacer ${name}`,
    '',
    existsSync(path.join(repoRoot(ctx), 'skills', name))
      ? `1. Restaura \`skills/${name}/SKILL.md\` desde git: \`git checkout HEAD -- skills/${name}\`.`
      : `1. Borra \`skills/${name}/\`: la skill no existía antes de este release.`,
    '2. Corre `pnpm verify`.',
    '',
  ].join('\n');
  put(ctx, 'restore-plan', restore);
  put(ctx, 'compatibility-report', {
    schema: 'compatibility-report-v1',
    profiles: [
      { profile: 'P0_PORTABLE', status: stat.status === 'PASS' ? 'PASS' : 'BLOCKED' },
      ...['Claude', 'Codex', 'Gemini', 'ChatGPT'].map((profile) => ({
        profile,
        status: 'UNKNOWN',
        reason: 'sin probe de host',
      })),
    ],
  });
  put(ctx, 'skill-release-capsule-v1', {
    schema: 'frames-os-skill-release-v1',
    release_id: upperId(`REL-${name}`),
    skill: name,
    state: 'CANDIDATE',
    files,
    package_sha256: sha(manifest),
    restore_sha256: sha(restore),
    approvals,
  });
  if (stat.status !== 'PASS')
    return { status: 'blocked', note: 'P0_PORTABLE no pasa: el análisis estático está bloqueado' };
  if (approvals.length < 3)
    return {
      status: 'blocked',
      note: `el run tiene ${approvals.length} aprobaciones humanas; hacen falta las de S00, S02 y S07`,
    };
  return {
    status: 'done',
    note: `release candidato ${name} · ${files.length} archivos · ${approvals.length} aprobaciones`,
  };
};

// S09: lifecycle events, the migration guide and the inventory delta against skills/.
const lifecycle: Handler = async (ctx) => {
  const cand = readFileSync(input(ctx, 'skill-candidate'), 'utf8');
  const { name } = parseSkillMd(cand);
  const p = SkillChangeProposalV1Schema.parse(json(input(ctx, 'skill-change-proposal-v1')));
  const capsule = json<{ package_sha256: string }>(input(ctx, 'skill-release-capsule-v1'));
  const skillsDir = path.join(repoRoot(ctx), 'skills');
  const current = existsSync(skillsDir)
    ? readdirSync(skillsDir)
        .filter((d) => existsSync(path.join(skillsDir, d, 'SKILL.md')))
        .sort()
    : [];
  const prev = current.includes(name) ? sha(readFileSync(path.join(skillsDir, name, 'SKILL.md'))) : null;
  put(ctx, 'h03-lifecycle-events', {
    schema: 'h03-lifecycle-events-v1',
    events: [
      {
        event: 'RELEASE_CANDIDATE',
        skill: name,
        action: p.action,
        package_sha256: capsule.package_sha256,
        parent_id: p.parent_id,
      },
    ],
  });
  put(ctx, 'inventory-delta', {
    schema: 'inventory-delta-v1',
    before: current,
    added: prev ? [] : [name],
    changed: prev && prev !== sha(cand) ? [{ skill: name, from: prev, to: sha(cand) }] : [],
  });
  put(
    ctx,
    'migration-guide',
    [
      `# Migrar a ${name}`,
      '',
      `Acción: ${p.action}.`,
      p.migration_ref
        ? `Migración detallada: \`${p.migration_ref}\`.`
        : 'No hay migración: nadie dependía de una versión anterior.',
      `Vuelta atrás: \`${p.rollback_ref}\`.`,
      '',
      `Promover es de la persona: copia \`artifacts/skill-candidate.md\` a \`skills/${name}/SKILL.md\` y corre \`pnpm verify\`.`,
      '',
    ].join('\n'),
  );
  return {
    status: 'done',
    note: `${name}: ${prev ? 'evoluciona una skill existente' : 'skill nueva'}; promover es de la persona`,
  };
};

export const skills: { handlers: Record<string, Handler>; schemas: Record<string, SchemaCheck> } = {
  handlers: {
    'skills.scaffold': scaffold,
    'skills.validate-local': validateLocal,
    'skills.activate-local': activateLocal,
    'skills.close-local': closeLocal,
    'skills.demotion': demotion,
    'skills.static': staticCheck,
    'skills.eval': evaluate,
    'skills.review': review,
    'skills.package': packageRelease,
    'skills.lifecycle': lifecycle,
  },
  schemas: {
    'local-extension-brief-v1': zodCheck(Brief, (b: z.infer<typeof Brief>) => {
      const r = routeLocalExtensionIntent(b);
      return r.state === 'READY_FOR_BRIEF_APPROVAL'
        ? null
        : `faltan datos: ${r.blocking_questions.join(' ')}`;
    }),
    'documentation-impact-plan-v1': zodCheck(ImpactPlan),
    'skill-system-case-v1': zodCheck(SkillSystemCaseV1Schema, (c: z.infer<typeof SkillSystemCaseV1Schema>) =>
      c.blocking_gaps.length
        ? `huecos que bloquean: ${c.blocking_gaps.join('; ')}`
        : c.authority_status === 'MISSING'
          ? 'sin autoridad sobre las fuentes'
          : null,
    ),
    'demotion-input-v1': zodCheck(Demotion),
    'capability-map-v1': zodCheck(CapabilityMapV1Schema),
    'skill-architecture-decision-v1': zodCheck(ArchitectureDecisionV1Schema),
    'skill-component-contract-v1': zodCheck(ComponentContractV1Schema),
    'skill-eval-plan-v1': zodCheck(EvalPlan),
    'skill-md-v1': skillMd,
    'skill-review-report-v1': zodCheck(SkillReviewReportV1Schema),
    'skill-change-proposal-v1': zodCheck(SkillChangeProposalV1Schema),
  },
};
