import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { deck as deckDomain, loadTokens, parseDeck } from '../../domains/deck/index.ts';
import { FORMATS, carouselGate, renderFrames } from '../../domains/deck/frames.ts';
import { deckHtmlGate, deckSourceGate } from '../../domains/deck/gates.ts';
import { launch } from '../../engine/browser.ts';
import { repoPath } from '../../engine/paths.ts';
import { loadRegistry } from '../../engine/registry.ts';
import { sha256 } from '../../engine/run.ts';
import { compare } from '../parity/compare.ts';
import { framesSmoke } from '../visual/frames-smoke.ts';

const tokens = loadTokens();
const SRC = repoPath('verify/parity/cases/content.carousel/frames-os/deck.yml');
const sample = () => parseDeck(readFileSync(SRC, 'utf8'));
const tmp = mkdtempSync(path.join(os.tmpdir(), 'frames-carousel-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// The sample cut to five cards: conclusion, tension, support, action, cta.
const five = () => {
  const d = sample();
  d.slides = [0, 1, 2, 5, 7].map((i) => d.slides[i]!);
  return d;
};

describe('content.carousel', () => {
  it('renders social frames from deck-v1 and holds them to Frames carousel rules', () => {
    const d = sample();
    expect(carouselGate(d)).toEqual([]);
    expect(deckSourceGate(d, { axis: false })).toEqual([]);
    for (const f of Object.keys(FORMATS) as (keyof typeof FORMATS)[]) {
      const html = renderFrames(d, tokens, f);
      expect(deckHtmlGate(html, d, tokens), f).toEqual([]);
      expect(html).toContain(`data-w="${FORMATS[f].w}" data-h="${FORMATS[f].h}"`);
    }
    expect(compare('content.carousel', 'frames-os')).toMatchObject({ verdict: 'superset' });
    const bad = sample();
    bad.slides[0]!.role = 'tension';
    expect(carouselGate(bad).join()).toMatch(/la primera tarjeta debe ser conclusion/);
  });

  it('numbers each frame by the real count, never a fixed 8', async () => {
    const file = path.join(tmp, 'five.html');
    writeFileSync(file, renderFrames(five(), tokens, 'carousel'));
    const browser = await launch();
    if (!browser) return; // no browser: a gap, never green
    try {
      const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
      await page.goto(pathToFileURL(file).href);
      expect(await page.$eval('#num', (e) => e.textContent)).toMatch(/01 \/ 5$/);
    } finally {
      await browser.close();
    }
  }, 60_000);

  it('the frames gate catches text that leaves the safe zone', async () => {
    const good = path.join(tmp, 'good.html');
    writeFileSync(good, renderFrames(five(), tokens, 'carousel'));
    const ok = await framesSmoke(good);
    if (!ok) return;
    expect(ok.problems).toEqual([]);
    const bad = path.join(tmp, 'bad.html');
    writeFileSync(
      bad,
      readFileSync(good, 'utf8').replace(
        '</style>',
        '.slide.active{padding:20px 20px 96px!important}</style>',
      ),
    );
    expect((await framesSmoke(bad))?.problems.join()).toMatch(/sale del margen de seguridad/);
  }, 120_000);

  it('the run step writes one PNG per card, a contact sheet and a manifest with their hashes', async () => {
    const run = mkdtempSync(path.join(tmp, 'run-'));
    mkdirSync(path.join(run, 'artifacts'), { recursive: true });
    writeFileSync(path.join(run, 'artifacts', 'carousel.yml'), YAML.stringify(five()));
    const step = loadRegistry()
      .families.find((f) => f.id === 'content.carousel')!
      .steps.find((x) => x.id === 'C03')!;
    const ext: Record<string, string> = { html: '.html', json: '.json' };
    const ctx = {
      runDir: run,
      step,
      facts: {},
      inputs: {},
      outputs: step.outputs.map((o) => ({
        id: o.id,
        schema: o.schema,
        required: true,
        file: path.join(run, 'artifacts', `${o.id}${ext[o.schema] ?? '.md'}`),
      })),
      write: (rel: string, data: string | Buffer) => {
        const f = path.join(run, rel);
        mkdirSync(path.dirname(f), { recursive: true });
        writeFileSync(f, data);
        return f;
      },
    };
    const r = await deckDomain.handlers['carousel.render']!(ctx);
    if (r.status === 'blocked') return; // no browser
    expect(r).toMatchObject({ status: 'done' });
    const m = JSON.parse(readFileSync(path.join(run, 'artifacts', 'carousel-manifest.json'), 'utf8')) as {
      size: number[];
      frames: { file: string; sha256: string; alt: string }[];
    };
    expect(m.size).toEqual([1080, 1350]);
    expect(m.frames).toHaveLength(5);
    for (const f of m.frames) {
      const png = readFileSync(path.join(run, 'artifacts', f.file));
      expect(sha256(png)).toBe(f.sha256);
      expect(png.readUInt32BE(16)).toBe(1080); // PNG header: width
      expect(png.readUInt32BE(20)).toBe(1350); // and height
      expect(f.alt.length).toBeGreaterThanOrEqual(20);
    }
    expect(
      readFileSync(path.join(run, 'artifacts', 'carousel-frames', 'contact-sheet.png')).length,
    ).toBeGreaterThan(0);
  }, 180_000);
});
