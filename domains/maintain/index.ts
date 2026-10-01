// meta.maintain: Frames' route R9 (M00-M06). Frames' frames:maintain inspected, planned
// and prepared a handoff; at handoff it required the changed paths to equal the write set
// and capped churn at a fixed 1200 lines (frames-maintain.ts:154-161). Here M04 also holds
// the change to the order's own budget and runs doctor on the copy, M05 closes the docs
// against the diff and the inventory drift, and M06 hands off a candidate bound to the
// sha M04 verified. The person commits after `outcome`.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  missingFrom,
  relTo,
  requestFromHost,
  type Handler,
  type HandlerCtx,
  type SchemaCheck,
} from '../../engine/handler-kit.ts';
import { repoPath } from '../../engine/paths.ts';
import { loadRegistry } from '../../engine/registry.ts';
import { discoverLocalExtensions } from '../skills/frames/local-extensions/index.ts';
import { ImpactPlan, MUTATION_CLASSES } from '../skills/index.ts';

const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const json = <T = unknown>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const put = (ctx: HandlerCtx, id: string, data: unknown) => {
  const o = ctx.outputs.find((x) => x.id === id);
  if (o)
    ctx.write(relTo(ctx, o.file), typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');
};
const input = (ctx: HandlerCtx, id: string) => {
  const f = ctx.inputs[id];
  if (!f || !existsSync(f)) throw new Error(`falta el insumo ${id}`);
  return f;
};
const repoRoot = (ctx: HandlerCtx) => String(ctx.facts.repo ?? repoPath());

// Git with no user or system config, like Frames' gitEnv(): the answer depends only on the repo.
const git = (root: string, args: string[]) =>
  execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_OPTIONAL_LOCKS: '0',
      LC_ALL: 'C',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });

export function inspect(root: string) {
  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  return {
    head: git(root, ['rev-parse', 'HEAD']).trim(),
    tree: git(root, ['rev-parse', 'HEAD^{tree}']).trim(),
    clean: status === '',
    entries: status.split('\0').filter(Boolean).length,
    status_sha256: sha(status),
  };
}

// Frames' ecosystem inventory (ecosystem-inventory-v1.ts), rebuilt from this repo's own
// declarations: families, steps, gates, agents, packs, skills, templates, local extensions.
export function ecosystem(root: string) {
  const reg = loadRegistry(path.join(root, 'registry'));
  const items: { kind: string; id: string; ref: string; state: string }[] = [
    ...reg.families.map((f) => ({
      kind: 'ROUTE',
      id: f.id,
      ref: `registry/families/${f.id}.yml`,
      state: f.status,
    })),
    ...reg.families.flatMap((f) =>
      f.steps.map((s) => ({
        kind: 'WORKFLOW',
        id: `${f.id}/${s.id}`,
        ref: `registry/families/${f.id}.yml`,
        state: s.handler,
      })),
    ),
    ...reg.gates.map((g) => ({ kind: 'GATE', id: g.id, ref: 'registry/gates.yml', state: g.kind })),
    ...reg.agents.map((a) => ({ kind: 'AGENT', id: a.id, ref: 'registry/agents.yml', state: 'ACTIVE' })),
    ...reg.packs.map((p) => ({ kind: 'ASSET', id: p.id, ref: 'registry/vendor.lock.json', state: 'PINNED' })),
  ];
  const skills = path.join(root, 'skills');
  if (existsSync(skills))
    for (const d of readdirSync(skills).sort())
      if (existsSync(path.join(skills, d, 'SKILL.md')))
        items.push({
          kind: 'SKILL',
          id: d,
          ref: `skills/${d}/SKILL.md`,
          state: sha(readFileSync(path.join(skills, d, 'SKILL.md'))).slice(0, 12),
        });
  for (const r of discoverLocalExtensions({ repository_root: root }).records)
    items.push({ kind: 'LOCAL_EXTENSION', id: r.extension_id, ref: r.manifest_ref, state: r.state });
  items.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
  return { schema: 'ecosystem-inventory-v1', items, source_sha256: sha(JSON.stringify(items)) };
}

export function inventoryDelta(before: ReturnType<typeof ecosystem>, after: ReturnType<typeof ecosystem>) {
  const key = (i: { kind: string; id: string }) => `${i.kind}:${i.id}`;
  const b = new Map(before.items.map((i) => [key(i), i]));
  const a = new Map(after.items.map((i) => [key(i), i]));
  return {
    added: [...a.keys()].filter((k) => !b.has(k)),
    removed: [...b.keys()].filter((k) => !a.has(k)),
    changed: [...a.keys()].filter((k) => b.has(k) && b.get(k)!.state !== a.get(k)!.state),
  };
}

// Frames' route-maintenance-v1.ts: the three questions a change must answer before it is planned.
const Request = z.strictObject({
  schema_version: z.literal('maintenance-request-v1'),
  request: z.string().trim().min(1).max(2000),
  change_summary: z.string().trim().min(1).max(500).optional(),
  target_surface: z.string().trim().min(1).max(240).optional(),
  expected_outcome: z.string().trim().min(1).max(500).optional(),
  change_class: z.enum(MUTATION_CLASSES),
});
export const blockingQuestions = (r: z.infer<typeof Request>) =>
  [
    r.change_summary ? null : '¿Qué comportamiento quieres corregir o evolucionar?',
    r.target_surface ? null : '¿Qué parte de Frames está afectada?',
    r.expected_outcome ? null : '¿Qué resultado observable confirmará el cambio?',
  ].filter((q): q is string => q !== null);

// Frames' assertFramesMaintainFileRefV1 (frames-maintain-v1.ts:78-99), same rules.
const RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
export const badRef = (ref: string) =>
  ref !== ref.normalize('NFKC') ||
  ref.includes('\\') ||
  ref.startsWith('/') ||
  ref
    .split('/')
    .some(
      (p) =>
        !p ||
        p === '.' ||
        p === '..' ||
        p.endsWith('.') ||
        p.endsWith(' ') ||
        p.includes(':') ||
        /[*?[\]{}]/u.test(p) ||
        RESERVED.test(p) ||
        [...p].some((c) => (c.codePointAt(0) ?? 0) <= 31 || c === '\u007f'),
    );

export const MAX_FILES = 12; // frames-maintain-v1.ts:127
export const MAX_CHURN = 1200;
const WorkOrder = z
  .strictObject({
    schema_version: z.literal('work-order-v1'),
    work_order_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,79}$/),
    change_class: z.enum(MUTATION_CLASSES),
    write_set: z.array(z.string()).min(1).max(MAX_FILES),
    expected_outputs: z.array(z.string()).min(1).max(MAX_FILES),
    tools: z.array(z.enum(['apply-patch', 'git-read-only', 'pnpm'])).max(3),
    budget: z.strictObject({
      target_files: z.number().int().min(1),
      max_files: z.number().int().min(1).max(MAX_FILES),
      max_churn: z.number().int().min(1).max(MAX_CHURN),
    }),
    acceptance: z.array(z.string().min(3).max(280)).min(1).max(12),
    stop_rule: z.string().min(3).max(500),
    documentation_impact: ImpactPlan,
  })
  .superRefine((o, c) => {
    const issue = (message: string) => c.addIssue({ code: 'custom', message });
    const bad = o.write_set.filter(badRef);
    if (bad.length) issue(`rutas inválidas: ${bad.join(', ')}`);
    const folded = o.write_set.map((r) => r.normalize('NFKC').toUpperCase());
    if (new Set(folded).size !== folded.length) issue('dos rutas del write set son la misma');
    if ([...o.write_set].sort().join() !== [...o.expected_outputs].sort().join())
      issue('write_set y expected_outputs difieren');
    if (o.budget.target_files !== o.write_set.length) issue('budget.target_files ≠ archivos del write set');
    if (o.budget.target_files > o.budget.max_files) issue('target_files supera max_files');
    if (o.write_set.some((r) => /^(work|local)\//.test(r)))
      issue('work/ y local/ no se mantienen por esta vía');
    if (o.documentation_impact.changeClass !== o.change_class)
      issue('la clase del plan documental difiere de la orden');
  });
type WorkOrder = z.infer<typeof WorkOrder>;

// Frames' count for a new file (frames-maintain.ts:139): lines, not counting a final newline.
const lines = (b: string) => (b ? b.split('\n').length - (b.endsWith('\n') ? 1 : 0) : 0);

export type Change = { path: string; added: number; removed: number; deleted: boolean };

// Everything that differs from the frozen base: tracked edits (staged or not) and untracked files.
export function changesSince(root: string, base: string): Change[] {
  const out = new Map<string, Change>();
  for (const line of git(root, ['diff', '--numstat', '-z', '--no-renames', base])
    .split('\0')
    .filter(Boolean)) {
    const [a = '0', r = '0', p = ''] = line.split('\t');
    out.set(p, {
      path: p,
      added: Number(a) || 0,
      removed: Number(r) || 0,
      deleted: !existsSync(path.join(root, p)),
    });
  }
  for (const p of git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))
    out.set(p, {
      path: p,
      added: lines(readFileSync(path.join(root, p), 'utf8')),
      removed: 0,
      deleted: false,
    });
  return [...out.values()].sort((x, y) => x.path.localeCompare(y.path));
}

export function checkDiff(order: WorkOrder, changes: Change[]): string[] {
  const allowed = new Set(order.write_set);
  const errs: string[] = [];
  const outside = changes.filter((c) => !allowed.has(c.path)).map((c) => c.path);
  if (outside.length) errs.push(`fuera del write set: ${outside.join(', ')}`);
  const untouched = order.write_set.filter((p) => !changes.some((c) => c.path === p));
  if (untouched.length) errs.push(`el write set promete y no cambia: ${untouched.join(', ')}`);
  if (changes.length > order.budget.max_files)
    errs.push(`${changes.length} archivos > max_files ${order.budget.max_files}`);
  const churn = changes.reduce((n, c) => n + c.added + c.removed, 0);
  if (churn > order.budget.max_churn)
    errs.push(`${churn} líneas de cambio > max_churn ${order.budget.max_churn}`);
  return errs;
}

export const candidateSha = (root: string, changes: Change[]) =>
  sha(
    changes
      .map((c) => `${c.path}\0${c.deleted ? 'DELETED' : sha(readFileSync(path.join(root, c.path)))}`)
      .join('\n'),
  );

// M00
const freeze: Handler = async (ctx) => {
  const root = repoRoot(ctx);
  const i = inspect(root);
  if (!i.clean)
    return {
      status: 'blocked',
      note: `el árbol tiene ${i.entries} cambio(s) sin commit: guárdalos antes de congelar la base`,
    };
  put(ctx, 'inspection', { schema: 'maintain-inspection-v1', ...i });
  put(ctx, 'inventory-base', ecosystem(root));
  return { status: 'done', note: `base congelada en ${i.head.slice(0, 12)}` };
};

// M02: the work order is authored; this checks it against Frames' limits and the base.
const plan: Handler = async (ctx) => {
  const miss = missingFrom(ctx, ['work-order']);
  if (miss.length) return requestFromHost(ctx, miss);
  const req = Request.parse(json(input(ctx, 'maintenance-request')));
  const r = WorkOrder.safeParse(json(ctx.outputs.find((o) => o.id === 'work-order')!.file));
  if (!r.success) return { status: 'needs_input', note: r.error.issues.map((x) => x.message).join('; ') };
  const order = r.data;
  if (order.change_class !== req.change_class)
    return {
      status: 'needs_input',
      note: `la orden es ${order.change_class} y el pedido ${req.change_class}`,
    };
  const base = json<{ head: string }>(input(ctx, 'inspection'));
  const now = inspect(repoRoot(ctx));
  if (now.head !== base.head || !now.clean)
    return { status: 'blocked', note: 'la base cambió desde M00: vuelve a congelarla' };
  put(
    ctx,
    'plan-report',
    [
      `# Orden ${order.work_order_id} · ${order.change_class}`,
      '',
      `Base: \`${base.head}\` · hasta ${order.budget.max_files} archivos y ${order.budget.max_churn} líneas.`,
      '',
      '## Write set',
      ...order.write_set.map((p) => `- \`${p}\``),
      '',
      '## Aceptación',
      ...order.acceptance.map((a) => `- ${a}`),
      '',
      `Regla de parada: ${order.stop_rule}`,
      '',
    ].join('\n'),
  );
  return {
    status: 'done',
    note: `orden válida: ${order.write_set.length} archivo(s) sobre ${base.head.slice(0, 12)}`,
  };
};

// M04
const verify: Handler = async (ctx) => {
  const root = repoRoot(ctx);
  const base = json<{ head: string }>(input(ctx, 'inspection'));
  const order = WorkOrder.parse(json(input(ctx, 'work-order')));
  const changes = changesSince(root, base.head);
  const errs = checkDiff(order, changes);
  // Imported here: verify/doctor.ts reads the handler registry this domain is part of.
  const { doctor } = await import('../../verify/doctor.ts');
  const checks = await doctor(root, { quick: true });
  for (const c of checks) if (c.status === 'fail') errs.push(`doctor ${c.id}: ${c.detail}`);
  const verdict = {
    schema: 'maintain-verify-v1',
    base: base.head,
    changes,
    churn: changes.reduce((n, c) => n + c.added + c.removed, 0),
    doctor: checks,
    candidate_sha256: candidateSha(root, changes),
    problems: errs,
  };
  put(ctx, 'verify', verdict);
  put(
    ctx,
    'verify-report',
    [
      `# Verificación de ${order.work_order_id}`,
      '',
      `${changes.length} archivo(s), ${verdict.churn} línea(s) de cambio.`,
      '',
      ...(errs.length
        ? errs.map((e) => `- ${e}`)
        : ['Dentro de la orden y del presupuesto; doctor sin fallas.']),
      '',
    ].join('\n'),
  );
  return errs.length
    ? { status: 'needs_input', note: errs.join('; ') }
    : { status: 'done', note: `${changes.length} archivo(s), ${verdict.churn} líneas, dentro de la orden` };
};

const sameCandidate = (ctx: HandlerCtx, root: string) => {
  const v = json<{ base: string; candidate_sha256: string }>(input(ctx, 'verify'));
  const changes = changesSince(root, v.base);
  return { v, changes, same: candidateSha(root, changes) === v.candidate_sha256 };
};

// M05: each REQUIRED surface's docs must be among the changed files, and a change in the
// declared inventory must reach CHANGELOG.md.
export function docsProblems(
  order: WorkOrder,
  changed: string[],
  delta: ReturnType<typeof inventoryDelta>,
): string[] {
  const errs: string[] = [];
  const req = order.documentation_impact.surfaces.flatMap((s) => (s.disposition === 'REQUIRED' ? [s] : []));
  for (const s of req) {
    const stale = s.sourceRefs.filter((r) => !changed.includes(r));
    if (stale.length) errs.push(`${s.surface} sin actualizar: ${stale.join(', ')}`);
  }
  const drift = delta.added.length + delta.removed.length + delta.changed.length;
  if (drift) {
    if (!changed.includes('CHANGELOG.md')) errs.push(`el inventario cambió (${drift}) y CHANGELOG.md no`);
    for (const need of ['INDEXES_INVENTORIES', 'CHANGELOG_COMPATIBILITY'])
      if (!req.some((s) => s.surface === need))
        errs.push(`el inventario cambió y ${need} no está como REQUIRED`);
  }
  return errs;
}

const docs: Handler = async (ctx) => {
  const root = repoRoot(ctx);
  const { changes, same } = sameCandidate(ctx, root);
  if (!same) return { status: 'needs_input', note: 'el candidato cambió desde M04: vuelve a verificar' };
  const order = WorkOrder.parse(json(input(ctx, 'work-order')));
  const delta = inventoryDelta(json(input(ctx, 'inventory-base')), ecosystem(root));
  const changed = changes.filter((c) => !c.deleted).map((c) => c.path);
  const errs = docsProblems(order, changed, delta);
  put(ctx, 'inventory-delta', { schema: 'inventory-delta-v1', ...delta });
  put(ctx, 'docs-closure-receipt', {
    schema: 'documentation-closure-receipt-v1',
    status: errs.length ? 'BLOCKED' : 'PASS',
    problems: errs,
    sources: changed.map((ref) => ({ ref, sha256: sha(readFileSync(path.join(root, ref))) })),
  });
  return errs.length
    ? { status: 'needs_input', note: errs.join('; ') }
    : {
        status: 'done',
        note: `documentación cerrada; inventario: +${delta.added.length} −${delta.removed.length} ~${delta.changed.length}`,
      };
};

// M06
const handoff: Handler = async (ctx) => {
  const root = repoRoot(ctx);
  const { v, changes, same } = sameCandidate(ctx, root);
  if (!same) return { status: 'needs_input', note: 'el candidato cambió desde M04: vuelve a verificar' };
  const order = WorkOrder.parse(json(input(ctx, 'work-order')));
  const req = Request.parse(json(input(ctx, 'maintenance-request')));
  if (inspect(root).head !== v.base)
    return {
      status: 'blocked',
      note: 'hubo un commit desde M00: la promoción es de la persona, después de outcome',
    };
  put(ctx, 'handoff', {
    schema: 'maintain-handoff-v1',
    work_order_id: order.work_order_id,
    base: v.base,
    candidate_sha256: v.candidate_sha256,
    files: changes.map((c) => c.path),
    guardian: 'M04 verify + M05 docs',
    promotion: 'la persona, tras el gate outcome',
  });
  put(
    ctx,
    'handoff-report',
    [
      `# Entrega de ${order.work_order_id}`,
      '',
      `${req.change_summary ?? req.request}`,
      '',
      `Candidato \`${v.candidate_sha256.slice(0, 16)}\` sobre \`${v.base.slice(0, 12)}\`: ${changes.length} archivo(s).`,
      '',
      'Tras aprobar `outcome`, la persona hace el commit:',
      '',
      '```bash',
      `git add ${changes.map((c) => c.path).join(' ')}`,
      '```',
      '',
    ].join('\n'),
  );
  return { status: 'done', note: `candidato ${v.candidate_sha256.slice(0, 12)} listo para promover` };
};

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
    if (!r.success)
      return r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ');
    return extra ? extra(r.data as never) : null;
  };

export const maintain: { handlers: Record<string, Handler>; schemas: Record<string, SchemaCheck> } = {
  handlers: {
    'maintain.freeze': freeze,
    'maintain.plan': plan,
    'maintain.verify': verify,
    'maintain.docs': docs,
    'maintain.handoff': handoff,
  },
  schemas: {
    'maintenance-request-v1': zodCheck(Request, (r: z.infer<typeof Request>) => {
      const q = blockingQuestions(r);
      return q.length ? `faltan datos: ${q.join(' ')}` : null;
    }),
    'work-order-v1': zodCheck(WorkOrder),
  },
};
