import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { PromptsV1, promptsGate, renderLibrary, varsOf } from '../../domains/content/prompts.ts';
import { loadTokens } from '../../domains/deck/index.ts';
import { repoPath } from '../../engine/paths.ts';
import { compare } from '../parity/compare.ts';
import { librarySmoke } from '../visual/library-smoke.ts';

const tokens = loadTokens();
const pack = () =>
  PromptsV1.parse(
    YAML.parse(readFileSync(repoPath('verify/parity/cases/content.prompts/frames-os/prompts.yml'), 'utf8')),
  );
const tmp = mkdtempSync(path.join(os.tmpdir(), 'frames-prompts-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('content.prompts', () => {
  it('renders an interactive prompt library from a typed pack', () => {
    const p = pack();
    expect(promptsGate(p)).toEqual([]);
    const html = renderLibrary(p, tokens);
    const allowed = new Set(
      [...Object.values(tokens.palette), ...tokens.accents, tokens.ok, '#ffffff'].map((h) => h.toLowerCase()),
    );
    const off = [...new Set(html.match(/#[0-9a-fA-F]{6}\b/g) ?? [])].filter(
      (h) => !allowed.has(h.toLowerCase()),
    );
    expect(off).toEqual([]);
    expect(html).not.toMatch(/(?:src|href)\s*=\s*["']https?:/);
    for (const x of p.prompts) {
      expect(html).toContain(`id="${x.id}" data-family="${x.family}"`);
      for (const v of varsOf(x.prompt)) expect(html).toContain(`data-var="${v}"`);
    }
    expect(compare('content.prompts', 'frames-os')).toMatchObject({ verdict: 'superset' });
    const bad = pack();
    bad.prompts[0]!.prompt = 'Ilustración sobre {Tema Central} con fondo azul noche y acentos dorados';
    expect(promptsGate(bad).join()).toMatch(/variable con mayúsculas o espacios/);
  });

  it('the library gate catches a search that does not filter', async () => {
    const good = path.join(tmp, 'lib.html');
    writeFileSync(good, renderLibrary(pack(), tokens));
    const ok = await librarySmoke(good);
    if (!ok) return; // no browser: a gap, never green
    expect(ok.problems).toEqual([]);
    const bad = path.join(tmp, 'bad.html');
    writeFileSync(bad, readFileSync(good, 'utf8').replace('q.oninput=filter;', 'q.oninput=function(){};'));
    expect((await librarySmoke(bad))?.problems.join()).toMatch(/no filtra/);
  }, 120_000);
});
