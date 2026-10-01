import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { launch } from '../../engine/browser.ts';
import { captureFrames, captureMp4, capturePngs } from '../../engine/capture.ts';
import { loadTokens, parseDeck } from '../../domains/deck/index.ts';
import { renderDeck } from '../../domains/deck/render.ts';
import { repoPath } from '../../engine/paths.ts';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'frames-capture-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const html = path.join(tmp, 'deck.html');
writeFileSync(
  html,
  renderDeck(
    parseDeck(readFileSync(repoPath('verify/parity/cases/deck.immersive/frames-os/deck.yml'), 'utf8')),
    loadTokens(),
  ),
);
const hasBrowser = async () => {
  const b = await launch();
  await b?.close();
  return !!b;
};

describe('capture', () => {
  it('the same HTML gives the same stills, twice', async () => {
    if (!(await hasBrowser())) return; // verify reports visual as a gap without a browser
    const slides = ['escena-datos', 'capas'];
    const a = await capturePngs({ html, slides, outDir: path.join(tmp, 'a') });
    const b = await capturePngs({ html, slides, outDir: path.join(tmp, 'b') });
    expect(a.map((f) => f.sha256)).toEqual(b.map((f) => f.sha256));
    expect(a).toHaveLength(2);
  }, 60_000);

  it('frames advance with time and repeat exactly on a second run', async () => {
    if (!(await hasBrowser())) return;
    const o = { html, slides: ['escena-datos'], fps: 4, seconds: 2 };
    const a = await captureFrames({ ...o, framesDir: path.join(tmp, 'fa') });
    const b = await captureFrames({ ...o, framesDir: path.join(tmp, 'fb') });
    expect(a).toHaveLength(8);
    expect(a.map((f) => f.sha256)).toEqual(b.map((f) => f.sha256));
    expect(new Set(a.map((f) => f.sha256)).size).toBeGreaterThan(4); // the scene moves
  }, 60_000);

  it('encodes an mp4 whose bytes repeat', async () => {
    if (!(await hasBrowser())) return;
    const o = { html, slides: ['lanzamiento'], fps: 5, seconds: 1 };
    const a = await captureMp4({ ...o, out: path.join(tmp, 'a.mp4') });
    const b = await captureMp4({ ...o, out: path.join(tmp, 'b.mp4') });
    expect(a.frames).toBe(5);
    expect(a.sha256).toBe(b.sha256);
  }, 60_000);
});
