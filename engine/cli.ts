#!/usr/bin/env node
// frames: the single entry point and the only write path for run state.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { route } from './classify.ts';
import type { Facts } from './handlers.ts';
import { loadRegistry } from './registry.ts';
import { approve, capsule, loadRun, nextStep, startRun } from './run.ts';
import { workDir } from './paths.ts';

const USAGE = `frames <comando>
  route "<pedido>" [--json]     familia sugerida (top-3) o pregunta si es ambiguo
  families                      familias declaradas y su estado
  start <familia> [--request "<pedido>"] [--fact k=v]  crea un run y extrae formato/edición
  next <run>                    avanza un paso; se detiene en cada gate
  status [<run>] [--capsule]    runs existentes, o el estado o la cápsula de uno
  approve <run> <gate>          aprobación humana (solo terminal interactiva)
  extend <run>                  instala la extensión local de un run skills.build tras su gate L04
  doctor [--json]               salud del entorno: herramientas, registro, adapters, hooks, vendor
  gen [--check]                 regenera adapters de host y contrato
  eval [--json]                 evals de ruteo contra sus pisos
  deck <deck.yml> --out <html> [--brand <tokens.json>] [--layout deck|playbook|workbook|carousel|story|square]
                                renderiza un deck y corre sus gates (marca por tokens)
  course <carpeta>              revisa un curso (landing, masterclass, workbook, playbook, biblioteca)
  i18n <deck.yml> [--dir <i18n>]  siembra los catálogos de idioma con cada texto visible
  capture <html> --png <dir> | --pdf <file> | --mp4 <file> [--fps 30] [--seconds n] [--slides a,b]
                                cuadros deterministas del mismo HTML animado`;

function facts(args: string[]): Facts {
  const out: Facts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--request') out.request = args[++i] ?? '';
    if (args[i] === '--facts') Object.assign(out, JSON.parse(readFileSync(args[++i] ?? '', 'utf8')));
    if (args[i] === '--fact') {
      const [k, ...v] = (args[++i] ?? '').split('=');
      const val = v.join('=');
      out[k ?? ''] =
        val === 'true' ? true : val === 'false' ? false : /^-?\d+(\.\d+)?$/.test(val) ? Number(val) : val;
    }
  }
  return out;
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const json = rest.includes('--json');
  const pos = rest.filter(
    (a, i) => !a.startsWith('--') && !['--fact', '--facts', '--request'].includes(rest[i - 1] ?? ''),
  );
  const reg = () => loadRegistry();
  const print = (o: unknown) => console.log(json || typeof o !== 'string' ? JSON.stringify(o, null, 2) : o);

  switch (cmd) {
    case 'route': {
      const r = route(reg(), pos.join(' '));
      if (json) return (print(r), 0);
      if (r.kind === 'ambiguous') console.log(`R0 · ${r.question}`);
      else {
        const fam = reg().families.find((f) => f.id === r.family);
        console.log(
          `${r.family} · ${fam?.title}${fam?.status === 'planned' ? ` (planificada, ola ${fam.wave})` : ''}`,
        );
      }
      for (const x of r.ranked) console.log(`  ${x.score.toFixed(3)}  ${x.family}`);
      return 0;
    }
    case 'families':
      for (const f of reg().families)
        console.log(`${f.status.padEnd(7)} ola ${f.wave}  ${f.id.padEnd(17)} ${f.title}`);
      return 0;
    case 'start': {
      const s = startRun(reg(), pos[0] ?? '', facts(rest));
      console.log(`run ${s.id} creado · siguiente: pnpm frames next ${s.id}`);
      return 0;
    }
    case 'next': {
      const r = await nextStep(reg(), pos[0] ?? '');
      print(json ? r : `${r.step ?? '-'} · ${r.status} · ${r.note}`);
      return r.status === 'blocked' || r.status === 'hard_stop' ? 2 : 0;
    }
    case 'status': {
      if (!pos[0]) {
        const dir = path.join(workDir(), 'runs');
        for (const id of existsSync(dir) ? readdirSync(dir).sort() : []) {
          const s = loadRun(id);
          const p = s.steps.find((x) => x.status !== 'done' && x.status !== 'skipped');
          console.log(`${id}  ${p ? `${p.id} ${p.status}` : 'completo'}`);
        }
        return 0;
      }
      print(rest.includes('--capsule') ? capsule(reg(), pos[0]) : loadRun(pos[0]));
      return 0;
    }
    case 'approve': {
      const [runId, gate] = pos;
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.error('APPROVE-REQUIRES-TTY: la aprobación la da una persona en una terminal interactiva.');
        return 1;
      }
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const typed = await rl.question(
        `Aprobar gate '${gate}' del run ${runId}. Escribe el id del gate para confirmar: `,
      );
      rl.close();
      if (typed.trim() !== gate) return (console.error('APPROVE-CANCELLED'), 1);
      const tok = approve(reg(), runId ?? '', gate ?? '');
      console.log(
        `aprobado ${tok.gate} para ${tok.step} · un solo uso · atado a ${Object.keys(tok.artifact_shas).length} artefacto(s)`,
      );
      return 0;
    }
    case 'extend': {
      const { installExtension } = await import('./extend.ts');
      const r = installExtension(pos[0] ?? '');
      console.log(`${r.id} instalada en ${r.ref} · ACTIVE_LOCAL · siguiente: pnpm frames next ${pos[0]}`);
      return 0;
    }
    case 'doctor': {
      const { doctor } = await import('../verify/doctor.ts');
      const checks = await doctor();
      if (json) print(checks);
      else
        for (const c of checks)
          console.log(`${c.status.toUpperCase().padEnd(4)} ${c.id.padEnd(10)} ${c.detail}`);
      return checks.some((c) => c.status === 'fail') ? 1 : 0;
    }
    case 'gen': {
      const { generate } = await import('./gen.ts');
      return generate({ check: rest.includes('--check') });
    }
    case 'eval': {
      const { runRoutingEvals } = await import('../verify/evals/routing.ts');
      return runRoutingEvals({ json });
    }
    case 'deck': {
      const { writeFileSync } = await import('node:fs');
      const { loadTokens, parseDeck } = await import('../domains/deck/index.ts');
      const { renderDeck } = await import('../domains/deck/render.ts');
      const { deckHtmlGate, deckSourceGate } = await import('../domains/deck/gates.ts');
      const flag = (f: string) => (rest.includes(f) ? rest[rest.indexOf(f) + 1] : undefined);
      const out = flag('--out');
      if (!pos[0] || !out)
        return (console.error('uso: frames deck <deck.yml> --out <html> [--brand <tokens.json>]'), 1);
      const deck = parseDeck(readFileSync(pos[0], 'utf8'));
      const tokens = loadTokens(flag('--brand'));
      const layout = flag('--layout') ?? 'deck';
      if (['carousel', 'story', 'square'].includes(layout)) {
        const { carouselGate, renderFrames } = await import('../domains/deck/frames.ts');
        const html = renderFrames(deck, tokens, layout as 'carousel');
        writeFileSync(out, html);
        const errs = [
          ...deckSourceGate(deck, { axis: false }),
          ...carouselGate(deck),
          ...deckHtmlGate(html, deck, tokens),
        ];
        for (const e of errs) console.log(`RED  ${e}`);
        console.log(
          `${out}: ${deck.slides.length} tarjetas ${layout} · ${tokens.name} · gates ${errs.length ? 'RED' : 'ok'}`,
        );
        return errs.length ? 1 : 0;
      }
      if (!['deck', 'playbook', 'workbook'].includes(layout))
        return (console.error('--layout: deck | playbook | workbook | carousel | story | square'), 1);
      const { renderPlaybook } = await import('../domains/deck/playbook.ts');
      const { layoutParity } = await import('../domains/deck/gates.ts');
      const deckHtml = renderDeck(deck, tokens);
      const html =
        layout === 'deck' ? deckHtml : renderPlaybook(deck, tokens, { workbook: layout === 'workbook' });
      const lay = layout as 'deck' | 'playbook' | 'workbook';
      const errs = [
        ...deckSourceGate(deck),
        ...deckHtmlGate(html, deck, tokens, (f) => existsSync(path.join(path.dirname(out), f)), lay),
        ...(lay === 'deck' ? [] : layoutParity(deckHtml, html, lay)),
      ];
      const { i18nGate, localize, loadCatalogs } = await import('../domains/motion/i18n.ts');
      const langs = deck.meta.langs;
      const catalogs = loadCatalogs(flag('--i18n') ?? path.join(path.dirname(pos[0]), 'i18n'), langs);
      const i18nErrs = langs.length > 1 ? i18nGate(html, langs, catalogs) : [];
      errs.push(...i18nErrs);
      writeFileSync(out, langs.length > 1 && !i18nErrs.length ? localize(html, langs, catalogs) : html);
      for (const e of errs) console.log(`RED  ${e}`);
      console.log(
        `${out}: ${deck.slides.length} láminas · ${tokens.name} · ${Buffer.byteLength(html)} B · gates ${errs.length ? 'RED' : 'ok'}`,
      );
      return errs.length ? 1 : 0;
    }
    case 'i18n': {
      // Seed or complete the catalogs of a deck: every text any layout shows, per language.
      const { loadTokens, parseDeck } = await import('../domains/deck/index.ts');
      const { renderDeck } = await import('../domains/deck/render.ts');
      const { renderPlaybook } = await import('../domains/deck/playbook.ts');
      const { loadCatalogs, seedCatalogs } = await import('../domains/motion/i18n.ts');
      const { mkdirSync, writeFileSync } = await import('node:fs');
      const flag = (f: string) => (rest.includes(f) ? rest[rest.indexOf(f) + 1] : undefined);
      if (!pos[0]) return (console.error('uso: frames i18n <deck.yml> [--dir <i18n>]'), 1);
      const deck = parseDeck(readFileSync(pos[0], 'utf8'));
      const t = loadTokens();
      const pages = [renderDeck(deck, t), renderPlaybook(deck, t, { workbook: true })];
      const dir = flag('--dir') ?? path.join(path.dirname(pos[0]), 'i18n');
      const langs = deck.meta.langs;
      if (langs.length < 2) return (console.error('meta.langs declara un solo idioma'), 1);
      const { catalogs, report } = seedCatalogs(pages, langs, loadCatalogs(dir, langs));
      mkdirSync(dir, { recursive: true });
      for (const [l, cat] of Object.entries(catalogs))
        writeFileSync(path.join(dir, `${l}.json`), JSON.stringify(cat, null, 2) + '\n');
      for (const line of report) console.log(line);
      return 0;
    }
    case 'course': {
      // Check a course folder (course.yml + its five sources) against Frames' trainer limits.
      const { loadCourse } = await import('../domains/trainer/index.ts');
      if (!pos[0]) return (console.error('uso: frames course <carpeta>'), 1);
      const { errs } = loadCourse(pos[0]);
      for (const e of errs) console.log(`RED  ${e}`);
      console.log(`${pos[0]}: curso ${errs.length ? 'RED' : 'ok'}`);
      return errs.length ? 1 : 0;
    }
    case 'capture': {
      const cap = await import('./capture.ts');
      const flag = (f: string) => (rest.includes(f) ? rest[rest.indexOf(f) + 1] : undefined);
      const html = pos[0];
      const slides = flag('--slides')?.split(',');
      const fps = flag('--fps') ? Number(flag('--fps')) : undefined;
      const seconds = flag('--seconds') ? Number(flag('--seconds')) : undefined;
      const base = { html: html ?? '', ...(slides ? { slides } : {}) };
      if (html && flag('--png')) {
        const frames = await cap.capturePngs({ ...base, outDir: flag('--png')! });
        for (const f of frames) console.log(`${f.slide}  t=${f.t.toFixed(2)}s  ${f.sha256.slice(0, 12)}`);
        return 0;
      }
      if (html && flag('--pdf')) {
        console.log(`${flag('--pdf')}: ${await cap.capturePdf({ ...base, out: flag('--pdf')! })} páginas`);
        return 0;
      }
      if (html && flag('--mp4')) {
        const r = await cap.captureMp4({
          ...base,
          out: flag('--mp4')!,
          ...(fps ? { fps } : {}),
          ...(seconds ? { seconds } : {}),
        });
        console.log(`${flag('--mp4')}: ${r.frames} cuadros · sha256 ${r.sha256.slice(0, 12)}`);
        return 0;
      }
      console.error('uso: frames capture <html> --png <dir> | --pdf <file> | --mp4 <file>');
      return 1;
    }
    default:
      console.log(USAGE);
      return cmd ? 1 : 0;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: Error) => {
    console.error(err.message);
    process.exit(1);
  },
);
