import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { repoPath } from '../../engine/paths.ts';
import { deck as deckDomain, loadTokens, parseDeck } from '../../domains/deck/index.ts';
import { loadRegistry } from '../../engine/registry.ts';
import { mkdirSync } from 'node:fs';
import { deckHtmlGate, deckSourceGate, layoutParity } from '../../domains/deck/gates.ts';
import { renderPlaybook } from '../../domains/deck/playbook.ts';
import { scrollSmoke } from '../visual/scroll-smoke.ts';
import { i18nGate, localize, pageTexts, seedCatalogs } from '../../domains/motion/i18n.ts';
import { launch } from '../../engine/browser.ts';
import { pathToFileURL } from 'node:url';
import { renderDeck } from '../../domains/deck/render.ts';
import { KINDS, type DeckV1 } from '../../domains/deck/schema.ts';
import { contrast, onFor } from '../../domains/deck/scenes.ts';
import { deckSmoke } from '../visual/deck-smoke.ts';
import { parityReport } from '../parity/run.ts';

const tokens = loadTokens();
const sample = () =>
  parseDeck(readFileSync(repoPath('verify/parity/cases/deck.immersive/frames-os/deck.yml'), 'utf8'));
const tmp = mkdtempSync(path.join(os.tmpdir(), 'frames-deck-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// A small deck that still covers an axis in the first third.
const tiny = (over: Partial<DeckV1['slides'][number]> = {}): DeckV1 =>
  parseDeck(
    YAML.stringify({
      schema: 'deck-v1',
      meta: { title: 'Prueba', axis: 'Una idea que sostiene la prueba entera.', lang: 'es' },
      acts: [
        { id: 'a', title: 'Uno' },
        { id: 'b', title: 'Dos' },
      ],
      slides: [
        {
          id: 'eje',
          act: 'a',
          kind: 'axis',
          title: 'Eje',
          chain: ['Uno', 'Dos'],
          scene_label: 'Cadena de dos pasos',
        },
        {
          id: 'flujo',
          act: 'b',
          kind: 'flow',
          title: 'Flujo',
          chain: ['A', 'B', 'C'],
          scene_label: 'Flujo de tres cajas',
        },
        {
          id: 'cierre',
          act: 'b',
          kind: 'close',
          title: 'Cierre',
          items: ['uno', 'dos'],
          scene_label: 'Lista que aparece',
          ...over,
        },
      ],
    }),
  );

describe('deck.immersive', () => {
  it('renders every kind from one typed source and passes both gate sets', () => {
    const deck = sample();
    const html = renderDeck(deck, tokens);
    expect(new Set(deck.slides.map((s) => s.kind)).size).toBe(KINDS.length);
    expect(deckSourceGate(deck)).toEqual([]);
    expect(deckHtmlGate(html, deck, tokens)).toEqual([]);
  });

  it('a broken link fails the gate', () => {
    const deck = tiny({ links: [{ label: 'Taller', href: '02_Workshop.html' }] });
    const errs = deckHtmlGate(renderDeck(deck, tokens), deck, tokens, () => false);
    expect(errs.some((e) => /enlace roto: 02_Workshop\.html/.test(e))).toBe(true);
    const inDeck = tiny({ links: [{ label: 'Volver', href: '#no-existe' }] });
    expect(
      deckHtmlGate(renderDeck(inDeck, tokens), inDeck, tokens).some((e) => /no es una lámina/.test(e)),
    ).toBe(true);
  });

  it('text on every token fill clears 4.5 to 1', () => {
    const on = onFor(tokens);
    const fills: [string, string][] = [
      ['var(--accent)', tokens.palette.accent],
      ...tokens.accents.map((h, i) => [`var(--c${i + 1})`, h] as [string, string]),
    ];
    for (const [v, hex] of fills) {
      const text = on(v) === 'var(--ink)' ? tokens.palette.ink : '#ffffff';
      expect(contrast(hex, text), v).toBeGreaterThanOrEqual(4.5);
    }
    expect(on('var(--accent)')).toBe('var(--ink)'); // never white on gold (MetodologIA rule)
  });

  it('ships print mode and presenter notes', () => {
    const html = renderDeck(sample(), tokens);
    expect(html).toMatch(/@media print\{[^}]*\{/);
    expect(html).toContain("k==='n'||k==='N'");
    expect(html).toContain('data-notes="Abrir con la pregunta');
  });

  it('declares a transition per slide and the runtime skips it under reduced motion', () => {
    const deck = sample();
    const html = renderDeck(deck, tokens);
    const declared = [...html.matchAll(/<section class="slide" id="([^"]+)"[^>]*data-tr="([a-z]+)"/g)];
    expect(declared).toHaveLength(deck.slides.length);
    expect(new Set(declared.map((m) => m[2]))).toEqual(new Set(['fade', 'push', 'zoom', 'morph', 'none']));
    expect(html).toContain("document.startViewTransition&&!b.classList.contains('reduced')");
    expect(html).toMatch(/html\[data-tr=morph\] \.slide\.active h1\{view-transition-name:vt-title\}/);
  });

  it('a spanish deck with missing accents fails', () => {
    const deck = tiny({ title: 'La aprobacion del metodo' });
    expect(deckSourceGate(deck).join()).toMatch(/tildes faltantes: aprobacion, metodo/);
    expect(deckSourceGate(tiny({ title: 'La aprobación del método' }))).toEqual([]);
    // A correctly accented word is not cut at its accent («funcionó» is not «funcion»).
    expect(deckSourceGate(tiny({ title: 'Lo que no funcionó y la relación' }))).toEqual([]);
  });

  it('a forbidden name on screen fails; the same word as a file name in capitals does not', () => {
    const named = tiny({ title: 'Cierre con Claude' });
    named.meta.forbidden_terms = ['Claude'];
    expect(deckHtmlGate(renderDeck(named, tokens), named, tokens).join()).toMatch(
      /término prohibido en pantalla: Claude/,
    );
    const file = tiny({ title: 'Cierre con CLAUDE.md' });
    file.meta.forbidden_terms = ['Claude'];
    expect(deckHtmlGate(renderDeck(file, tokens), file, tokens)).toEqual([]);
  });

  it('keeps the axis in the first third', () => {
    const deck = tiny();
    deck.slides.push(deck.slides.shift()!); // axis moves to the end
    expect(deckSourceGate(deck).join()).toMatch(/primer tercio/);
  });

  it('never lets an evidence tag reach the screen', () => {
    const deck = tiny({ title: 'Cierre con fuente [CÓDIGO]' });
    const html = renderDeck(deck, tokens);
    expect(html).not.toContain('[CÓDIGO]');
    expect(deckHtmlGate(html, deck, tokens)).toEqual([]);
  });

  it('a hex outside the tokens fails the gate', () => {
    const deck = tiny();
    const html = renderDeck(deck, tokens).replace('</style>', '.x{color:#ff00ff}</style>');
    expect(deckHtmlGate(html, deck, tokens).join()).toMatch(/hex fuera de tokens: #ff00ff/);
  });

  it('the visual gate catches a scene that does not move', async () => {
    const deck = tiny();
    const good = path.join(tmp, 'good.html');
    writeFileSync(good, renderDeck(deck, tokens));
    const okRun = await deckSmoke(good);
    if (!okRun) return; // no browser here: verify reports visual:decks as a gap, never green
    expect(okRun.problems).toEqual([]);
    // Freeze the flow slide by stripping its animations: the gate must see it.
    const html = readFileSync(good, 'utf8').replace(
      /(<section class="slide" id="flujo"[\s\S]*?<\/section>)/,
      (sec) => sec.replace(/<animate(Motion|Transform)?\b[^>]*\/>/g, ''),
    );
    const bad = path.join(tmp, 'bad.html');
    writeFileSync(bad, html);
    const badRun = await deckSmoke(bad);
    expect(badRun?.problems.some((p) => /flujo.*no se mueve/.test(p))).toBe(true);
  }, 120_000);

  it('deck, playbook and workbook say the same thing on every slide', () => {
    const deck = sample();
    const d = renderDeck(deck, tokens);
    const pb = renderPlaybook(deck, tokens);
    const wb = renderPlaybook(deck, tokens, { workbook: true });
    expect(layoutParity(d, pb, 'playbook')).toEqual([]);
    expect(layoutParity(d, wb, 'workbook')).toEqual([]);
    expect(deckHtmlGate(pb, deck, tokens, () => false, 'playbook')).toEqual([]);
    expect(deckHtmlGate(wb, deck, tokens, () => false, 'workbook')).toEqual([]);
    const drifted = pb.replace('Lo declarado es lo ejecutado</h1>', 'Otra cosa</h1>');
    expect(layoutParity(d, drifted, 'playbook').join()).toMatch(/el texto de portada difiere del deck/);
    const lost = wb.replace(/data-w="w-reto"/, 'data-x="w-reto"');
    expect(deckHtmlGate(lost, deck, tokens, () => false, 'workbook').join()).toMatch(
      /reto: el ejercicio no llegó/,
    );
  });

  it('the workbook keeps its answers, and a workbook that forgets them fails', async () => {
    const deck = tiny({ interactive: { kind: 'checklist', title: 'Lista', items: ['uno', 'dos'] } });
    const good = path.join(tmp, 'wb.html');
    writeFileSync(good, renderPlaybook(deck, tokens, { workbook: true }));
    const ok = await scrollSmoke(good, true);
    if (!ok) return; // no browser: a gap, never green
    expect(ok.problems).toEqual([]);
    const bad = path.join(tmp, 'wb-bad.html');
    writeFileSync(bad, readFileSync(good, 'utf8').replace('localStorage.setItem(K,JSON.stringify(st))', '0'));
    expect((await scrollSmoke(bad, true))?.problems.join()).toMatch(/no sobrevivió a la recarga/);
  }, 120_000);

  it('one page carries every language; a missing or altered translation fails', async () => {
    const deck = tiny();
    deck.meta.langs = ['es', 'en'];
    const html = renderDeck(deck, tokens);
    const { catalogs } = seedCatalogs([html], ['es', 'en'], {});
    expect(i18nGate(html, ['es', 'en'], catalogs).join()).toMatch(/en: faltan \d+ traducciones/);
    const en = Object.fromEntries(Object.keys(catalogs.en!).map((k) => [k, `EN ${k}`]));
    expect(i18nGate(html, ['es', 'en'], { en })).toEqual([]);
    expect(
      i18nGate(html, ['es', 'en'], { en: { ...en, 'Flujo de tres cajas': 'Flow of 3 boxes' } }).join(),
    ).toMatch(/marcadores distintos/);
    const page = localize(html, ['es', 'en'], { en });
    expect(deckHtmlGate(page, deck, tokens)).toEqual([]);
    expect(page).not.toMatch(/innerHTML=C\./);
    expect(pageTexts(page)).toContain('Eje');
    const file = path.join(tmp, 'i18n.html');
    writeFileSync(file, page);
    const browser = await launch();
    if (!browser) return; // no browser: a gap, never green
    try {
      const tab = await browser.newPage();
      await tab.goto(pathToFileURL(file).href);
      await tab.click('.langs button[data-lang=en]');
      expect(await tab.$eval('section.slide.active h1', (e) => e.textContent)).toBe('EN Eje');
      expect(await tab.$eval('section.slide.active svg.scene', (e) => e.getAttribute('aria-label'))).toBe(
        'EN Cadena de dos pasos',
      );
      expect(await tab.$eval('section.slide.active', (e) => e.id)).toBe('eje'); // the click did not advance
      await tab.reload();
      expect(await tab.evaluate(() => document.documentElement.lang)).toBe('en');
    } finally {
      await browser.close();
    }
  }, 60_000);

  it('the run step renders deck, playbook and workbook, localized, and asks for missing catalogs', async () => {
    const run = mkdtempSync(path.join(tmp, 'run-'));
    mkdirSync(path.join(run, 'artifacts', 'i18n'), { recursive: true });
    const d = tiny({ interactive: { kind: 'notes', prompt: 'Una nota' } });
    d.meta.langs = ['es', 'en'];
    writeFileSync(path.join(run, 'artifacts', 'deck.yml'), YAML.stringify(d));
    const step = loadRegistry()
      .families.find((f) => f.id === 'deck.immersive')!
      .steps.find((x) => x.id === 'D03')!;
    const ext = (schema: string) => (schema === 'html' ? '.html' : '.md');
    const ctx = {
      runDir: run,
      step,
      facts: {},
      inputs: {},
      outputs: step.outputs.map((o) => ({
        id: o.id,
        schema: o.schema,
        required: true,
        file: path.join(run, 'artifacts', `${o.id}${ext(o.schema)}`),
      })),
      write: (rel: string, data: string | Buffer) => {
        const f = path.join(run, rel);
        writeFileSync(f, data);
        return f;
      },
    };
    const asked = await deckDomain.handlers['deck.render']!(ctx);
    expect(asked.status).toBe('needs_input');
    expect(asked.note).toMatch(/faltan \d+ traducciones[\s\S]*pnpm frames i18n/);
    const pages = [renderDeck(d, tokens), renderPlaybook(d, tokens, { workbook: true })];
    const { catalogs } = seedCatalogs(pages, ['es', 'en'], {});
    const en = Object.fromEntries(Object.keys(catalogs.en!).map((k) => [k, `EN ${k}`]));
    writeFileSync(path.join(run, 'artifacts', 'i18n', 'en.json'), JSON.stringify(en));
    const done = await deckDomain.handlers['deck.render']!(ctx);
    if (done.status === 'blocked') return; // no browser: a gap, never green
    expect(done).toMatchObject({ status: 'done' });
    for (const id of ['deck-html', 'playbook-html', 'workbook-html'])
      expect(readFileSync(path.join(run, 'artifacts', `${id}.html`), 'utf8')).toContain('id="i18n"');
  }, 180_000);

  it('succession: Frames never rendered a deck; this one passes and each improvement has a test', () => {
    const [r] = parityReport('deck.immersive');
    expect(r?.problems).toEqual([]);
    expect(r).toMatchObject({ status: 'ok', verdict: 'superset' });
  });
});
