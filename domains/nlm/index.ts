// nlm: NotebookLM notebooks planned locally and changed only through gated effects.
// The planning and brand runtime is Frames' own code, ported as-is (domains/nlm/frames,
// with its tests in verify/tests/nlm-frames). Frames never called NotebookLM from code;
// here an external step opens an effect window only after its gate is consumed: the
// guard lets the host use exactly those MCP tools, and the step closes the window
// when every planned operation has a receipt with its readback.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  missingFrom,
  relTo,
  requestFromHost,
  type Handler,
  type HandlerCtx,
  type SchemaCheck,
} from '../../engine/handler-kit.ts';
import {
  NotebookIntentV1Schema,
  NotebookPlanV1Schema,
  NotebookProfileV1Schema,
  StudioBriefV1Schema,
} from './frames/contracts/index.ts';
import {
  buildNotebookPlan,
  buildOperationIdempotencyKeys,
  buildStudioBrief,
  compileNotebookSystemPrompt,
} from './frames/runtime/index.ts';

const byId = (ctx: HandlerCtx, id: string) => ctx.outputs.find((o) => o.id === id);
const art = (ctx: HandlerCtx, name: string) => path.join(ctx.runDir, 'artifacts', name);
const json = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as unknown;
const zodCheck =
  (schema: { parse: (v: unknown) => unknown }): SchemaCheck =>
  (c) => {
    try {
      schema.parse(JSON.parse(c));
      return null;
    } catch (e) {
      return (e as Error).message.slice(0, 300);
    }
  };

// N02: the host writes the profile; the step compiles the notebook's system prompt.
const profile: Handler = async (ctx) => {
  const host = missingFrom(ctx).filter((o) => o.id !== 'system-prompt');
  if (host.length) return requestFromHost(ctx, host);
  const prompt = compileNotebookSystemPrompt(
    NotebookProfileV1Schema.parse(json(art(ctx, 'notebook-profile.json'))),
  );
  const out = byId(ctx, 'system-prompt');
  if (out) ctx.write(relTo(ctx, out.file), prompt.endsWith('\n') ? prompt : `${prompt}\n`);
  return { status: 'done', note: 'system prompt compilado desde el perfil' };
};

// N03: the host drafts the plan; Frames' buildNotebookPlan validates it and assigns
// its id, and the step lists the idempotency key of every operation.
const plan: Handler = async (ctx) => {
  const host = missingFrom(ctx).filter((o) => o.id !== 'notebook-plan');
  if (host.length) return requestFromHost(ctx, host);
  let built: ReturnType<typeof buildNotebookPlan>;
  try {
    built = buildNotebookPlan(
      json(art(ctx, 'notebook-plan-draft.json')) as Parameters<typeof buildNotebookPlan>[0],
    );
  } catch (e) {
    return { status: 'needs_input', note: `plan inválido: ${(e as Error).message.slice(0, 300)}` };
  }
  const out = byId(ctx, 'notebook-plan');
  if (out)
    ctx.write(
      relTo(ctx, out.file),
      JSON.stringify({ ...built, idempotencyKeys: buildOperationIdempotencyKeys(built) }, null, 2) + '\n',
    );
  const external = built.operations.filter(
    (o) => o.effect === 'EXTERNAL_MUTATION' || o.effect === 'DESTRUCTIVE',
  );
  return {
    status: 'done',
    note: `plan ${built.planId}: ${built.operations.length} operaciones, ${external.length} externas`,
  };
};

type Receipt = { operations?: { operationId?: string; status?: string; readback?: string }[] };

// An external step: open the window, ask the host for the effect and its receipt,
// accept it only with a readback for every operation of this stage, then close.
const effect =
  (tools: string[], receiptId: string, what: string): Handler =>
  async (ctx) => {
    const receipt = byId(ctx, receiptId);
    if (!receipt) return { status: 'blocked', note: `el paso no declara ${receiptId}` };
    const window = (closed: boolean) =>
      ctx.write('effects/open.json', JSON.stringify({ step: ctx.step.id, tools, closed }, null, 2) + '\n');
    const planFile = art(ctx, 'notebook-plan.json');
    const ops = existsSync(planFile)
      ? NotebookPlanV1Schema.parse(
          Object.fromEntries(
            Object.entries(json(planFile) as object).filter(([k]) => k !== 'idempotencyKeys'),
          ),
        ).operations.filter((o) => o.stage === ctx.step.id)
      : [];
    if (!existsSync(receipt.file)) {
      window(false);
      return requestFromHost(
        ctx,
        [receipt],
        [
          `## Efecto externo: ${what}`,
          `- El gate se consumió: la ventana deja usar ${tools.join(', ')} hasta que el recibo quede aceptado.`,
          `- Operaciones del plan en esta etapa: ${ops.map((o) => `${o.operationId} (${o.action})`).join(', ') || 'ninguna declarada'}.`,
          '- Tras cada una, léela de vuelta y escribe el recibo: {"operations":[{"operationId","status":"done","readback"}]}.',
        ],
      );
    }
    const got = new Map(((json(receipt.file) as Receipt).operations ?? []).map((o) => [o.operationId, o]));
    const missing = ops
      .filter((o) => got.get(o.operationId)?.status !== 'done' || !got.get(o.operationId)?.readback?.trim())
      .map((o) => o.operationId);
    if (missing.length)
      return { status: 'needs_input', note: `recibo sin readback para: ${missing.join(', ')}` };
    window(true);
    return { status: 'done', note: `${what}: ${ops.length} operaciones con readback · ventana cerrada` };
  };

// N06: the studio brief goes through Frames' buildStudioBrief.
const studioBrief: Handler = async (ctx) => {
  const host = missingFrom(ctx);
  if (host.length) return requestFromHost(ctx, host);
  try {
    buildStudioBrief(StudioBriefV1Schema.parse(json(art(ctx, 'studio-brief.json'))));
  } catch (e) {
    return { status: 'needs_input', note: `studio brief inválido: ${(e as Error).message.slice(0, 300)}` };
  }
  return { status: 'done', note: 'studio brief válido' };
};

const NLM = (names: string[]) => names.flatMap((n) => [`mcp__notebooklm__${n}`, `mcp__notebooklm-mcp__${n}`]);

export const nlm: { handlers: Record<string, Handler>; schemas: Record<string, SchemaCheck> } = {
  handlers: {
    'nlm.profile': profile,
    'nlm.plan': plan,
    'nlm.studio-brief': studioBrief,
    'nlm.materialize': effect(
      NLM(['notebook_create', 'source_add', 'source_sync_drive', 'notebook_get', 'source_describe']),
      'materialize-receipt',
      'crear el cuaderno e importar las fuentes',
    ),
    'nlm.studio': effect(
      NLM(['studio_create', 'studio_status', 'download_artifact']),
      'studio-receipt',
      'generar en Studio',
    ),
    'nlm.share': effect(
      NLM(['notebook_share_invite', 'notebook_share_status']),
      'share-receipt',
      'compartir el cuaderno',
    ),
  },
  schemas: {
    'notebook-intent-v1': zodCheck(NotebookIntentV1Schema),
    'notebook-profile-v1': zodCheck(NotebookProfileV1Schema),
    'studio-brief-v1': zodCheck(StudioBriefV1Schema),
    'notebook-plan-draft': (c) => {
      try {
        buildNotebookPlan(JSON.parse(c) as Parameters<typeof buildNotebookPlan>[0]);
        return null;
      } catch (e) {
        return (e as Error).message.slice(0, 300);
      }
    },
  },
};
