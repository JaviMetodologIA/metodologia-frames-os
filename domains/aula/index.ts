// Aula preserves frames-aula-v1 as authored data; no lossy conversion to deck-v1.
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { aulaBuild } from '../../engine/aula/bridge.ts';
import { AulaKind, Edition, digest, selectAula } from '../../engine/aula/catalog.ts';
import {
  missingFrom,
  relTo,
  requestFromHost,
  type Handler,
  type HandlerCtx,
  type SchemaCheck,
} from '../../engine/handler-kit.ts';
import { within } from '../../engine/paths.ts';

const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Approval = z
  .object({
    gate: z.string(),
    step: z.string(),
    artifact_shas: z.record(z.string(), Hash),
    nonce: z.string().min(1),
    consumed: z.literal(true),
  })
  .strict();
const Ref = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/)
  .refine((p) => p.split('/').every((s) => !['', '.', '..'].includes(s)));
export const AulaReceipt = z
  .object({
    schema: z.literal('aula-run-receipt-v1'),
    state: z.literal('RENDERED_DRAFT'),
    skill: z.string(),
    kind: AulaKind,
    edition: Edition,
    source: Ref,
    sourceSha256: Hash,
    skillSha256: Hash,
    engineFiles: z.record(Ref, Hash),
    approvals: z.record(z.string(), z.object({ nonce: z.string(), artifacts: z.record(Ref, Hash) }).strict()),
    outputs: z.record(Ref, Hash),
  })
  .strict();

const selected = (ctx: HandlerCtx) => ({
  kind: AulaKind.parse(
    ctx.facts.renderer === 'frames-aula' && ctx.facts.aula_format === undefined
      ? 'dynamic-commercial-decks'
      : ctx.facts.aula_format,
  ),
  edition: Edition.parse(ctx.facts.edition ?? 'metodologia'),
});

function gateProof(ctx: Pick<HandlerCtx, 'runDir'>, gate: string) {
  const file = within(ctx.runDir, 'approvals', gate + '.json');
  if (!existsSync(file)) throw new Error(`AULA-APPROVAL-MISSING: ${gate}`);
  const approval = Approval.parse(JSON.parse(readFileSync(file, 'utf8')) as unknown);
  const state = JSON.parse(readFileSync(within(ctx.runDir, 'run.json'), 'utf8')) as {
    steps: { id: string; outputs: { id: string; file: string; sha256: string }[] }[];
  };
  const step = state.steps.find((s) => s.id === approval.step);
  if (!step || approval.gate !== gate || !step.outputs.length)
    throw new Error(`AULA-APPROVAL-INVALID: ${gate}`);
  const artifacts: Record<string, string> = {};
  for (const out of step.outputs) {
    if (!out.file.startsWith(ctx.runDir + path.sep)) throw new Error('AULA-APPROVAL-PATH');
    const hash = digest(readFileSync(out.file));
    if (approval.artifact_shas[out.id] !== hash || out.sha256 !== hash)
      throw new Error(`AULA-APPROVAL-STALE: ${gate}`);
    artifacts[path.relative(ctx.runDir, out.file)] = hash;
  }
  if (Object.keys(approval.artifact_shas).length !== step.outputs.length)
    throw new Error(`AULA-APPROVAL-INVALID: ${gate}`);
  return { nonce: approval.nonce, artifacts };
}

const Intake = z
  .object({
    schema: z.literal('commercial-intake-v1'),
    audience: z.string().min(1),
    problem: z.string().min(1),
    decision: z.string().min(1),
    type: z.enum([
      'simple',
      'prospeccion',
      'comercial',
      'tecnico',
      'arquitectura',
      'defensa-tecnica',
      'defensa-funcional',
      'defensa-negocio',
      'defensa-hibrida',
      'cierre-training',
      'formacion',
      'webinar-panel',
    ]),
    mode: z.enum(['comercial', 'tecnico']),
    edition: Edition,
    pillars: z
      .array(z.object({ achieves: z.string().min(1), proof: z.string().min(1) }).strict())
      .default([]),
  })
  .strict()
  .superRefine((d, c) => {
    if (d.type !== 'simple' && d.pillars.length !== 3)
      c.addIssue({ code: 'custom', message: 'three achieves/proof pillars required' });
  });
const Source = z
  .object({
    schemaVersion: z.literal('frames-aula-v1'),
    title: z.unknown(),
    sections: z.array(z.unknown()).min(1),
  })
  .passthrough();
const check =
  (schema: z.ZodType): SchemaCheck =>
  (body) => {
    try {
      schema.parse(JSON.parse(body) as unknown);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

// Only hash-declared sibling HTML files enter an index. No ambient imports.
function boundAssets(sourceFile: string, raw: string): Record<string, Buffer> {
  const doc = JSON.parse(raw) as { assetFiles?: unknown };
  if (doc.assetFiles === undefined) return {};
  const hashes = z.record(z.string().regex(/^[a-z][a-z0-9-]*\.html$/), Hash).parse(doc.assetFiles);
  const assets: Record<string, Buffer> = {};
  const dir = path.dirname(sourceFile);
  for (const [name, hash] of Object.entries(hashes)) {
    const file = within(dir, name);
    if (lstatSync(file).isSymbolicLink()) throw new Error('AULA-ASSET-SYMLINK');
    const bytes = readFileSync(file);
    if (digest(bytes) !== hash) throw new Error(`AULA-ASSET-HASH: ${name}`);
    assets[name] = bytes;
  }
  return assets;
}

const sourceHandler: Handler = async (ctx) => {
  try {
    const { kind, edition } = selected(ctx);
    gateProof(ctx, 'direction');
    const capability = selectAula(kind, edition).skill;
    const absent = missingFrom(ctx);
    if (absent.length)
      return requestFromHost(ctx, absent, [
        `Capacidad: ${capability.id}; fuente completa frames-aula-v1.`,
        `Ejemplo: ${capability.source}/examples/input.json. Preserve campos, prompts, idiomas y pieceSections.`,
        'La especificación requiere el gate humano sources-and-spec; un score escrito por el host no lo sustituye.',
      ]);
    const file = ctx.outputs.find((o) => o.id === 'aula-source')?.file;
    if (!file) throw new Error('AULA-SOURCE-NOT-DECLARED');
    const raw = readFileSync(file, 'utf8');
    Source.parse(JSON.parse(raw) as unknown);
    if (kind === 'dynamic-commercial-decks') {
      gateProof(ctx, 'outcome');
      const intakeFile = ctx.inputs['commercial-intake'];
      if (!intakeFile) throw new Error('AULA-INTAKE-MISSING');
      const intake = Intake.parse(JSON.parse(readFileSync(intakeFile, 'utf8')) as unknown);
      const src = JSON.parse(raw) as Record<string, unknown>;
      if (intake.edition !== edition || src.mode !== intake.mode || src.deckType !== intake.type)
        throw new Error('AULA-INTAKE-SPEC-MISMATCH: edition/type/mode');
      if (intake.type !== 'simple') {
        const thesis = src.thesis as { pillars?: unknown } | undefined;
        if (JSON.stringify(thesis?.pillars) !== JSON.stringify(intake.pillars))
          throw new Error('AULA-INTAKE-SPEC-MISMATCH: pillars');
      }
    }
    aulaBuild(raw, kind, edition, false, boundAssets(file, raw));
    return { status: 'done', note: `especificación válida · ${capability.id} · aprobación humana pendiente` };
  } catch (e) {
    return { status: 'blocked', note: (e as Error).message };
  }
};

const renderHandler: Handler = async (ctx) => {
  try {
    const { kind, edition } = selected(ctx);
    const approvals = {
      direction: gateProof(ctx, 'direction'),
      'sources-and-spec': gateProof(ctx, 'sources-and-spec'),
      ...(kind === 'dynamic-commercial-decks' ? { outcome: gateProof(ctx, 'outcome') } : {}),
    };
    const source = ctx.inputs['aula-source'];
    if (!source) throw new Error('AULA-SOURCE-MISSING');
    const raw = readFileSync(source, 'utf8');
    const result = aulaBuild(raw, kind, edition, true, boundAssets(source, raw));
    const html = ctx.outputs.find((o) => o.id === 'aula-html');
    const receiptOut = ctx.outputs.find((o) => o.id === 'aula-receipt');
    if (!html || !receiptOut) throw new Error('AULA-OUTPUT-NOT-DECLARED');
    const outputs: Record<string, string> = {};
    for (const [name, bytes] of result.files) {
      const rel = `artifacts/aula/${name}`;
      ctx.write(rel, bytes);
      outputs[rel] = digest(bytes);
    }
    const entry =
      result.files.get(kind === 'module' ? 'index.html' : 'artifact.html') ??
      [...result.files].find(([n]) => n.endsWith('.html'))?.[1];
    if (!entry) throw new Error('AULA-HTML-MISSING');
    const preview =
      kind === 'module' || kind === 'index'
        ? entry
            .toString()
            .replace(/href="([a-z][a-z0-9-]*\.html)"/g, 'href="aula/$1"')
            .replace(/"href":\s*"([a-z][a-z0-9-]*\.html)"/g, '"href": "aula/$1"')
        : entry.toString();
    ctx.write(relTo(ctx, html.file), preview);
    outputs[relTo(ctx, html.file)] = digest(preview);
    const receipt = AulaReceipt.parse({
      schema: 'aula-run-receipt-v1',
      state: 'RENDERED_DRAFT',
      skill: result.skill.id,
      kind,
      edition,
      source: relTo(ctx, source),
      sourceSha256: digest(raw),
      skillSha256: result.skill.files['SKILL.md'],
      engineFiles: result.catalog.engine.files,
      approvals,
      outputs,
    });
    ctx.write(relTo(ctx, receiptOut.file), JSON.stringify(receipt, null, 2) + '\n');
    return {
      status: 'done',
      note: `${result.skill.id} ejecutada · ${outputs && Object.keys(outputs).length} archivos hash-bound · RENDERED_DRAFT`,
    };
  } catch (e) {
    return { status: 'blocked', note: (e as Error).message };
  }
};

// Checks material files again at acceptance, not merely a host-authored score.
export const receiptCheck: SchemaCheck = (content, file) => {
  try {
    const r = AulaReceipt.parse(JSON.parse(content) as unknown);
    const chosen = selectAula(r.kind, r.edition);
    if (
      chosen.skill.id !== r.skill ||
      chosen.skill.files['SKILL.md'] !== r.skillSha256 ||
      JSON.stringify(chosen.catalog.engine.files) !== JSON.stringify(r.engineFiles)
    )
      throw new Error('AULA-RECEIPT-CATALOG-MISMATCH');
    if (!file) return null;
    const run = path.dirname(path.dirname(file));
    const expectedGates = [
      'direction',
      'sources-and-spec',
      ...(r.kind === 'dynamic-commercial-decks' ? ['outcome'] : []),
    ].sort();
    if (Object.keys(r.approvals).sort().join() !== expectedGates.join())
      throw new Error('AULA-RECEIPT-APPROVALS-MISMATCH');
    for (const gate of expectedGates)
      if (JSON.stringify(gateProof({ runDir: run }, gate)) !== JSON.stringify(r.approvals[gate]))
        throw new Error(`AULA-RECEIPT-APPROVAL-STALE: ${gate}`);
    if (r.source !== 'artifacts/aula-source.json') throw new Error('AULA-RECEIPT-SOURCE-MISMATCH');
    const sourceFile = within(run, r.source);
    const source = readFileSync(sourceFile, 'utf8');
    const expected = aulaBuild(
      source,
      r.kind,
      r.edition,
      false,
      boundAssets(sourceFile, source),
    ).plan.outputs.map((name) => `artifacts/aula/${name}`);
    expected.push('artifacts/aula-html.html');
    if (expected.sort().join() !== Object.keys(r.outputs).sort().join())
      throw new Error('AULA-RECEIPT-FILES-MISMATCH');
    for (const [rel, hash] of Object.entries({
      ...r.outputs,
      [r.source]: r.sourceSha256,
      ...Object.assign({}, ...Object.values(r.approvals).map((p) => p.artifacts)),
    } as Record<string, string>)) {
      const abs = within(run, rel);
      for (let p = abs; p !== run; p = path.dirname(p))
        if (lstatSync(p).isSymbolicLink()) throw new Error('AULA-RECEIPT-SYMLINK');
      if (digest(readFileSync(abs)) !== hash) throw new Error(`AULA-RECEIPT-STALE: ${rel}`);
    }
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};

const finalHandler: Handler = async (ctx) => {
  try {
    if (ctx.facts.revise === true)
      return {
        status: 'needs_input',
        note: 'REVISE: preserve este run; cree un successor con fuente corregida y nuevos gates humanos.',
      };
    const file = ctx.inputs['aula-receipt'];
    if (!file) throw new Error('AULA-RECEIPT-MISSING');
    const content = readFileSync(file, 'utf8');
    const err = receiptCheck(content, file);
    if (err) throw new Error(err);
    const out = ctx.outputs.find((o) => o.id === 'aula-final-receipt');
    if (!out) throw new Error('AULA-OUTPUT-NOT-DECLARED');
    ctx.write(relTo(ctx, out.file), content);
    return {
      status: 'done',
      note: 'archivos, procedencia y aprobaciones verificadas; aceptación humana pendiente',
    };
  } catch (e) {
    return { status: 'blocked', note: (e as Error).message };
  }
};

export const aula: { handlers: Record<string, Handler>; schemas: Record<string, SchemaCheck> } = {
  handlers: { 'aula.source': sourceHandler, 'aula.render': renderHandler, 'aula.final': finalHandler },
  schemas: {
    'frames-aula-v1': check(Source),
    'commercial-intake-v1': check(Intake),
    'aula-receipt-v1': receiptCheck,
  },
};
