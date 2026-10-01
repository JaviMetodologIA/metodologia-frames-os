// Content domain: brief (ported as-is from Frames), the written piece and its
// review. Handlers write only through ctx.write.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  missingFrom,
  relTo,
  requestFromHost,
  markdownCheck,
  type Handler,
  type SchemaCheck,
} from '../../engine/handler-kit.ts';
import YAML from 'yaml';
import { repoPath } from '../../engine/paths.ts';
import { parseFramesBriefMarkdown } from './brief/model.ts';
import { verifyBriefParity } from './brief/parity.ts';
import { renderFramesBriefHtml } from './brief/renderer.ts';
import { documentParity, htmlCheck, renderDocument } from './html.ts';
import { PromptsV1, promptsGate, renderLibrary } from './prompts.ts';
import { loadTokens } from '../deck/index.ts';
import { librarySmoke } from '../../verify/visual/library-smoke.ts';

const read = (f: string) => readFileSync(f, 'utf8');

type Field = { field_id: string; value?: unknown };
const frontmatter = (md: string) => {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(md);
  return m ? (YAML.parse(m[1]!) as { deliverable_id?: string; fields?: Field[] }) : null;
};

// A frames-deliverable-v1 document: every field its Frames template declares is
// present and filled. Frames accepted the template as it came, ⟦UNKNOWN⟧ included.
export const deliverableCheck: SchemaCheck = (c) => {
  const base = markdownCheck(c);
  if (base) return base;
  let fm: ReturnType<typeof frontmatter>;
  try {
    fm = frontmatter(c);
  } catch (e) {
    return `frontmatter inválido: ${(e as Error).message.slice(0, 120)}`;
  }
  if (!fm?.deliverable_id) return 'sin frontmatter con deliverable_id';
  const tpl = repoPath('domains/content/templates', `${fm.deliverable_id}.template.md`);
  if (!existsSync(tpl)) return `deliverable_id desconocido: ${fm.deliverable_id}`;
  const want = (frontmatter(read(tpl))?.fields ?? []).map((f) => f.field_id);
  const got = new Map((fm.fields ?? []).map((f) => [f.field_id, f.value]));
  const empty = want.filter((id) => {
    const v = got.get(id);
    return v === undefined || v === null || String(v).trim() === '';
  });
  return empty.length ? `campos sin llenar: ${empty.join(', ')}` : null;
};
const byId = (ctx: Parameters<Handler>[0], id: string) => ctx.outputs.find((o) => o.id === id);

// P03: the host writes brief.md (12 sections, self-hashed); the step renders and
// verifies brief.html in the same pass. Frames needed a manual --apply for this.
// Frames' brief page, ported byte for byte (the golden compares it), fails the visual gate
// twice: its table of contents and step numbers are #137dc5 on white (4.0:1 and 4.4:1; the
// governance strip is white on it), and the 64-character hash in the footer overflows at
// 390 px. The fix is CSS layered on top.
const BRIEF_FIX =
  '<style>.toc a,.step-index{color:var(--text)}.governance-strip{background:var(--navy)}footer{overflow-wrap:anywhere}</style>';
export const patchBriefHtml = (html: string) => html.replace('</head>', `${BRIEF_FIX}</head>`);
// Frames' parity rule (html === its projection of the markdown) on the page minus that one
// layer: any other difference still fails.
export const briefParity = (md: string, html: string) => {
  const r = verifyBriefParity(md, html.replace(BRIEF_FIX, ''));
  return html.includes(BRIEF_FIX)
    ? r
    : { ...r, status: 'FAIL' as const, issues: [...r.issues, 'BRIEF_VISUAL_FIX_MISSING'] };
};

const brief: Handler = async (ctx) => {
  const hostWritten = missingFrom(ctx).filter((o) => o.id !== 'brief-html');
  if (hostWritten.length)
    return requestFromHost(ctx, hostWritten, [
      '## Brief',
      '- 12 secciones H2 en orden; `content_sha256` se calcula con `createFramesBriefMarkdown` (domains/content/brief/model.ts).',
    ]);
  const md = read(byId(ctx, 'brief')!.file);
  let html: string;
  try {
    html = patchBriefHtml(renderFramesBriefHtml(md));
  } catch (e) {
    return { status: 'needs_input', note: `brief inválido: ${(e as Error).message}` };
  }
  const out = byId(ctx, 'brief-html');
  if (out) ctx.write(relTo(ctx, out.file), html);
  const parity = briefParity(md, html);
  if (parity.status !== 'PASS')
    return { status: 'blocked', note: `paridad MD/HTML: ${parity.issues.join(', ')}` };
  return { status: 'done', note: `brief ${parity.content_sha256.slice(0, 12)} con HTML en paridad` };
};

// Render one markdown artifact into its offline HTML twin.
const renderPiece =
  (source: (ctx: Parameters<Handler>[0]) => string | undefined, target: string, state: string): Handler =>
  async (ctx) => {
    const hostWritten = missingFrom(ctx).filter((o) => o.id !== target);
    if (hostWritten.length) return requestFromHost(ctx, hostWritten);
    const src = source(ctx);
    if (!src || !existsSync(src)) return { status: 'blocked', note: 'no hay pieza que renderizar' };
    const md = read(src);
    const html = renderDocument({ title: 'Pieza', kicker: 'MetodologIA · Frames OS', state, markdown: md });
    const out = byId(ctx, target);
    if (!out) return { status: 'blocked', note: `el paso no declara ${target}` };
    ctx.write(relTo(ctx, out.file), html);
    const issues = documentParity(md, html);
    return issues.length
      ? { status: 'blocked', note: `paridad MD/HTML: ${issues.join(', ')}` }
      : { status: 'done', note: `${target} en paridad con ${path.basename(src)}` };
  };

// P07: the review verdict decides whether P08 (edit) runs.
const review: Handler = async (ctx) => {
  const missing = missingFrom(ctx);
  if (missing.length)
    return requestFromHost(ctx, missing, [
      '## Veredicto',
      '- `verdict-v1` lleva una línea `verdict: PASS | REVISE | BLOCKED`.',
    ]);
  const verdict = /verdict\s*:\s*(PASS|REVISE|BLOCKED)\b/i
    .exec(read(byId(ctx, 'verdict-v1')!.file))?.[1]
    ?.toUpperCase();
  if (!verdict)
    return { status: 'needs_input', note: 'verdict-v1 no declara `verdict: PASS | REVISE | BLOCKED`' };
  if (verdict === 'BLOCKED') return { status: 'blocked', note: 'la revisión bloqueó la pieza' };
  return { status: 'done', note: `veredicto ${verdict}`, facts: { revise: verdict === 'REVISE' } };
};

const artifact = (ctx: Parameters<Handler>[0], id: string) => path.join(ctx.runDir, 'artifacts', `${id}.md`);

// P05 as a library: the host writes prompts.yml (prompts-v1); the step renders the
// interactive HTML and checks it in a browser.
const library: Handler = async (ctx) => {
  const hostWritten = missingFrom(ctx).filter((o) => !['prompts-library', 'library-report'].includes(o.id));
  if (hostWritten.length) return requestFromHost(ctx, hostWritten);
  const src = path.join(ctx.runDir, 'artifacts', 'prompts.yml');
  if (!existsSync(src)) return { status: 'blocked', note: 'no hay prompts.yml' };
  let pack: PromptsV1;
  try {
    pack = PromptsV1.parse(YAML.parse(read(src)));
  } catch (e) {
    return { status: 'needs_input', note: `prompts.yml inválido: ${(e as Error).message.slice(0, 300)}` };
  }
  const errs = promptsGate(pack);
  if (errs.length) return { status: 'needs_input', note: `gates de prompts: ${errs.join('; ')}` };
  const out = byId(ctx, 'prompts-library');
  if (!out) return { status: 'blocked', note: 'el paso no declara prompts-library' };
  const tokens = loadTokens(typeof ctx.facts.brand_tokens === 'string' ? ctx.facts.brand_tokens : undefined);
  const file = ctx.write(relTo(ctx, out.file), renderLibrary(pack, tokens));
  const smoke = await librarySmoke(file);
  if (!smoke) return { status: 'blocked', note: 'gate visual sin navegador' };
  const report = byId(ctx, 'library-report');
  if (report)
    ctx.write(
      relTo(ctx, report.file),
      [
        '# Gate visual',
        '',
        ...smoke.checked.map((c) => `- ok: ${c}`),
        ...smoke.problems.map((x) => `- rojo: ${x}`),
      ].join('\n') + '\n',
    );
  return smoke.problems.length
    ? { status: 'needs_input', note: `gate visual: ${smoke.problems.join('; ')}` }
    : { status: 'done', note: `${pack.prompts.length} prompts en la biblioteca · gates ok` };
};

export const content: { handlers: Record<string, Handler>; schemas: Record<string, SchemaCheck> } = {
  handlers: {
    'content.brief': brief,
    'content.piece': renderPiece((ctx) => byId(ctx, 'piece')?.file, 'piece-html', 'RENDERED_DRAFT'),
    'content.review': review,
    'prompts.library': library,
    // The accepted version: the edit candidate when P08 ran, otherwise the piece.
    'content.final': renderPiece(
      (ctx) => [artifact(ctx, 'edit-candidate-v1'), artifact(ctx, 'piece')].find((f) => existsSync(f)),
      'final-html',
      'RENDERED_DRAFT → aceptación humana',
    ),
  },
  schemas: {
    'frames-brief-v1': (c) => {
      try {
        parseFramesBriefMarkdown(c);
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    },
    html: htmlCheck,
    'deliverable-v1': deliverableCheck,
    'prompts-v1': (c) => {
      try {
        const errs = promptsGate(PromptsV1.parse(YAML.parse(c)));
        return errs.length ? errs.join('; ') : null;
      } catch (e) {
        return (e as Error).message.slice(0, 300);
      }
    },
  },
};
