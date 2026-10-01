// Deck domain: deck-v1 source → offline immersive HTML → content gates → browser
// gate. The brand arrives as a tokens file: MetodologIA by default (brand/), another
// brand through the `brand_tokens` fact pointing outside the repo (never versioned).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import {
  missingFrom,
  relTo,
  requestFromHost,
  type Handler,
  type HandlerCtx,
  type SchemaCheck,
} from '../../engine/handler-kit.ts';
import { repoPath } from '../../engine/paths.ts';
import { deckHtmlGate, deckSourceGate, layoutParity, type Layout } from './gates.ts';
import { renderPlaybook } from './playbook.ts';
import { FORMATS, carouselGate, renderFrames, type Format } from './frames.ts';
import { captureMp4, capturePngs, contactSheet } from '../../engine/capture.ts';
import { VIDEO, captionsVtt, videoGate } from './video.ts';
import { framesSmoke } from '../../verify/visual/frames-smoke.ts';
import { i18nGate, loadCatalogs, localize } from '../motion/i18n.ts';
import { scrollSmoke } from '../../verify/visual/scroll-smoke.ts';
import { renderDeck } from './render.ts';
import { DeckV1, TokensV1 } from './schema.ts';
import { deckSmoke } from '../../verify/visual/deck-smoke.ts';

export const DEFAULT_TOKENS = 'brand/metodologia.deck-tokens.json';

export function loadTokens(file?: string): TokensV1 {
  const p = file ? path.resolve(file) : repoPath(DEFAULT_TOKENS);
  return TokensV1.parse(JSON.parse(readFileSync(p, 'utf8')));
}

export function parseDeck(yml: string): DeckV1 {
  return DeckV1.parse(YAML.parse(yml));
}

const byId = (ctx: HandlerCtx, id: string) => ctx.outputs.find((o) => o.id === id);
const artifact = (ctx: HandlerCtx, id: string, ext: string) =>
  path.join(ctx.runDir, 'artifacts', `${id}${ext}`);
const tokensOf = (ctx: HandlerCtx) =>
  loadTokens(typeof ctx.facts.brand_tokens === 'string' ? ctx.facts.brand_tokens : undefined);

type Targets = { deck: string; playbook: string; workbook: string };

// Render a deck source into its three layouts, localize them when the source declares
// languages (catalogs in artifacts/i18n/<lang>.json), and hold each to its gates.
const render =
  (source: (ctx: HandlerCtx) => string | undefined, out: Targets, reportId: string): Handler =>
  async (ctx) => {
    const ours = new Set([...Object.values(out), reportId]);
    const hostWritten = missingFrom(ctx).filter((o) => !ours.has(o.id));
    if (hostWritten.length) return requestFromHost(ctx, hostWritten);
    const src = source(ctx);
    if (!src || !existsSync(src)) return { status: 'blocked', note: 'no hay deck.yml que renderizar' };
    const deck = parseDeck(readFileSync(src, 'utf8'));
    const tokens = tokensOf(ctx);
    const langs = deck.meta.langs;
    const catalogs = loadCatalogs(path.join(ctx.runDir, 'artifacts', 'i18n'), langs);
    const deckHtml = renderDeck(deck, tokens);
    const pages: Record<Layout, string> = {
      deck: deckHtml,
      playbook: renderPlaybook(deck, tokens),
      workbook: renderPlaybook(deck, tokens, { workbook: true }),
    };
    const errs = [...deckSourceGate(deck)];
    const files: Partial<Record<Layout, string>> = {};
    for (const layout of ['deck', 'playbook', 'workbook'] as const) {
      const decl = byId(ctx, out[layout]);
      if (!decl) continue; // the step does not ask for this layout
      const html = pages[layout];
      const file = path.join(ctx.runDir, relTo(ctx, decl.file));
      errs.push(
        ...deckHtmlGate(html, deck, tokens, (f) => existsSync(path.join(path.dirname(file), f)), layout),
        ...(layout === 'deck' ? [] : layoutParity(deckHtml, html, layout)),
        ...(langs.length > 1 ? i18nGate(html, langs, catalogs).map((e) => `${layout}: ${e}`) : []),
      );
      if (!errs.length)
        files[layout] = ctx.write(
          relTo(ctx, decl.file),
          langs.length > 1 ? localize(html, langs, catalogs) : html,
        );
    }
    if (errs.length) {
      const hint = errs.some((e) => /traducciones/.test(e))
        ? ` · siembra los catálogos con: pnpm frames i18n ${relTo(ctx, src)} --dir ${relTo(ctx, path.join(ctx.runDir, 'artifacts', 'i18n'))}`
        : '';
      return { status: 'needs_input', note: `gates del deck: ${[...new Set(errs)].join('; ')}${hint}` };
    }
    const lines = ['# Gate visual', ''];
    let problems = 0;
    for (const [layout, file] of Object.entries(files)) {
      const smoke =
        layout === 'deck' ? await deckSmoke(file) : await scrollSmoke(file, layout === 'workbook');
      if (!smoke) {
        lines.push('- gap: sin navegador disponible; nada quedó verificado en pantalla');
        const report = byId(ctx, reportId);
        if (report) ctx.write(relTo(ctx, report.file), lines.join('\n') + '\n');
        return { status: 'blocked', note: 'gate visual sin navegador: no se acepta un deck sin verlo' };
      }
      lines.push(
        `## ${layout}`,
        ...smoke.checked.map((c) => `- ok: ${c}`),
        ...smoke.problems.map((p) => `- rojo: ${p}`),
        '',
      );
      problems += smoke.problems.length;
    }
    const report = byId(ctx, reportId);
    if (report) ctx.write(relTo(ctx, report.file), lines.join('\n') + '\n');
    return problems
      ? { status: 'needs_input', note: `gate visual: ${problems} problema(s), ver ${reportId}` }
      : {
          status: 'done',
          note: `${deck.slides.length} láminas en ${Object.keys(files).join(', ')}${langs.length > 1 ? ` · ${langs.join('/')}` : ''} · gates ok (${tokens.name})`,
        };
  };

// Social frames: HTML (playable), one PNG per card at its freeze point, a contact
// sheet and an asset manifest with every PNG's sha256 and alt text. Frames rendered
// the same outputs but hard-coded the card count and never read its safe zone.
const frames =
  (source: (ctx: HandlerCtx) => string | undefined, prefix: string): Handler =>
  async (ctx) => {
    const src = source(ctx);
    if (!src || !existsSync(src)) return { status: 'blocked', note: 'no hay fuente del carrusel' };
    const d = parseDeck(readFileSync(src, 'utf8'));
    const tokens = tokensOf(ctx);
    const format = (typeof ctx.facts.format === 'string' ? ctx.facts.format : 'carousel') as Format;
    if (!(format in FORMATS)) return { status: 'needs_input', note: `formato desconocido: ${format}` };
    const html = renderFrames(d, tokens, format);
    const errs = [
      ...deckSourceGate(d, { axis: false }),
      ...carouselGate(d),
      ...deckHtmlGate(html, d, tokens),
    ];
    if (errs.length) return { status: 'needs_input', note: `gates del carrusel: ${errs.join('; ')}` };
    const htmlOut = byId(ctx, `${prefix}-html`);
    if (!htmlOut) return { status: 'blocked', note: `el paso no declara ${prefix}-html` };
    const file = ctx.write(relTo(ctx, htmlOut.file), html);
    const smoke = await framesSmoke(file);
    if (!smoke)
      return { status: 'blocked', note: 'gate visual sin navegador: no se acepta un carrusel sin verlo' };
    const shots = await capturePngs({ html: file });
    const dir = path.join(path.dirname(htmlOut.file), `${prefix}-frames`);
    const assets = shots.map((f, k) => {
      const name = `${String(k + 1).padStart(2, '0')}-${f.slide}.png`;
      ctx.write(relTo(ctx, path.join(dir, name)), f.png!);
      return { file: `${prefix}-frames/${name}`, slide: f.slide, sha256: f.sha256, alt: d.slides[k]!.alt };
    });
    const sheet = await contactSheet(
      shots.map((f) => f.png!),
      tokens.palette.ink,
    );
    ctx.write(relTo(ctx, path.join(dir, 'contact-sheet.png')), sheet);
    const { w, h } = FORMATS[format];
    const manifest = byId(ctx, `${prefix}-manifest`);
    if (manifest)
      ctx.write(
        relTo(ctx, manifest.file),
        JSON.stringify(
          {
            schema: 'carousel-asset-manifest-v1',
            format,
            size: [w, h],
            caption: d.meta.caption,
            alt: d.meta.alt,
            cta: d.meta.cta,
            frames: assets,
          },
          null,
          2,
        ) + '\n',
      );
    const report = byId(ctx, `${prefix}-visual-report`);
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
      : {
          status: 'done',
          note: `${assets.length} tarjetas ${w}x${h} + hoja de contacto · gates ok (${tokens.name})`,
        };
  };

// video.method: story frames played beat by beat (each for its hold), joined by the
// slides' transitions, with WebVTT captions equal to the narration and a manifest that
// binds the MP4, its frame digest and its captions. No audio: see ADR 0005.
const video =
  (source: (ctx: HandlerCtx) => string | undefined, prefix: string): Handler =>
  async (ctx) => {
    const src = source(ctx);
    if (!src || !existsSync(src)) return { status: 'blocked', note: 'no hay storyboard' };
    const d = parseDeck(readFileSync(src, 'utf8'));
    const tokens = tokensOf(ctx);
    const format = (typeof ctx.facts.format === 'string' ? ctx.facts.format : 'story') as Format;
    if (!(format in FORMATS)) return { status: 'needs_input', note: `formato desconocido: ${format}` };
    const html = renderFrames(d, tokens, format);
    const errs = [...deckSourceGate(d, { axis: false }), ...videoGate(d), ...deckHtmlGate(html, d, tokens)];
    if (errs.length) return { status: 'needs_input', note: `gates del video: ${errs.join('; ')}` };
    const out = (id: string) => byId(ctx, `${prefix}-${id}`);
    const htmlOut = out('html');
    const mp4Out = out('mp4');
    if (!htmlOut || !mp4Out)
      return { status: 'blocked', note: `el paso no declara ${prefix}-html y ${prefix}-mp4` };
    const file = ctx.write(relTo(ctx, htmlOut.file), html);
    const smoke = await framesSmoke(file);
    if (!smoke) return { status: 'blocked', note: 'gate visual sin navegador' };
    if (smoke.problems.length)
      return { status: 'needs_input', note: `gate visual: ${smoke.problems.join('; ')}` };
    const r = await captureMp4({ html: file, out: mp4Out.file, fps: VIDEO.fps, useHold: true });
    const trs = d.slides.map((x) => x.transition ?? d.meta.transition);
    const vtt = captionsVtt(d, trs);
    const cap = out('captions');
    if (cap) ctx.write(relTo(ctx, cap.file), vtt);
    const { w, h } = FORMATS[format];
    const manifest = out('manifest');
    if (manifest)
      ctx.write(
        relTo(ctx, manifest.file),
        JSON.stringify(
          {
            schema: 'video-manifest-v1',
            format,
            size: [w, h],
            fps: VIDEO.fps,
            beats: d.slides.length,
            duration_s: +r.duration.toFixed(3),
            frames: r.frames,
            sha256: r.sha256,
            frames_digest: r.framesDigest,
            audio: 'none',
            captions: cap ? path.basename(cap.file) : null,
          },
          null,
          2,
        ) + '\n',
      );
    const report = out('visual-report');
    if (report)
      ctx.write(
        relTo(ctx, report.file),
        ['# Gate visual', '', ...smoke.checked.map((c) => `- ok: ${c}`)].join('\n') + '\n',
      );
    return {
      status: 'done',
      note: `${d.slides.length} beats · ${r.duration.toFixed(1)} s · ${r.frames} cuadros ${w}x${h} · subtítulos · gates ok`,
    };
  };

export const deck: { handlers: Record<string, Handler>; schemas: Record<string, SchemaCheck> } = {
  handlers: {
    'deck.render': render(
      (ctx) => artifact(ctx, 'deck', '.yml'),
      { deck: 'deck-html', playbook: 'playbook-html', workbook: 'workbook-html' },
      'visual-report',
    ),
    // Final version: the revised source when D06 ran, otherwise the original.
    // A NotebookLM study guide: the grounded notes as a scroll page.
    'nlm.guide': render(
      (ctx) => artifact(ctx, 'study-guide', '.yml'),
      { deck: 'guide-deck-html', playbook: 'guide-html', workbook: 'guide-workbook-html' },
      'guide-visual-report',
    ),
    // A campaign landing: the same deck-v1 as a scroll page (playbook only).
    'campaign.landing': render(
      (ctx) => artifact(ctx, 'landing', '.yml'),
      { deck: 'landing-deck-html', playbook: 'landing-html', workbook: 'landing-workbook-html' },
      'landing-visual-report',
    ),
    'video.render': video((ctx) => artifact(ctx, 'storyboard', '.yml'), 'video'),
    'video.final': video(
      (ctx) =>
        [artifact(ctx, 'storyboard-v2', '.yml'), artifact(ctx, 'storyboard', '.yml')].find((f) =>
          existsSync(f),
        ),
      'final',
    ),
    'carousel.render': frames((ctx) => artifact(ctx, 'carousel', '.yml'), 'carousel'),
    'carousel.final': frames(
      (ctx) =>
        [artifact(ctx, 'carousel-v2', '.yml'), artifact(ctx, 'carousel', '.yml')].find((f) => existsSync(f)),
      'final',
    ),
    'deck.final': render(
      (ctx) => [artifact(ctx, 'deck-v2', '.yml'), artifact(ctx, 'deck', '.yml')].find((f) => existsSync(f)),
      { deck: 'final-html', playbook: 'final-playbook-html', workbook: 'final-workbook-html' },
      'final-visual-report',
    ),
  },
  schemas: {
    'storyboard-v1': (c) => {
      try {
        const d = parseDeck(c);
        const errs = [...deckSourceGate(d, { axis: false }), ...videoGate(d)];
        return errs.length ? errs.join('; ') : null;
      } catch (e) {
        return (e as Error).message.slice(0, 400);
      }
    },
    'carousel-v1': (c) => {
      try {
        const d = parseDeck(c);
        const errs = [...deckSourceGate(d, { axis: false }), ...carouselGate(d)];
        return errs.length ? errs.join('; ') : null;
      } catch (e) {
        return (e as Error).message.slice(0, 400);
      }
    },
    'deck-v1': (c) => {
      try {
        const errs = deckSourceGate(parseDeck(c));
        return errs.length ? errs.join('; ') : null;
      } catch (e) {
        return (e as Error).message.slice(0, 400);
      }
    },
  },
};
