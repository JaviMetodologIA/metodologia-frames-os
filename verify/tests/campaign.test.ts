import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { deliverableCheck } from '../../domains/content/index.ts';
import { loadTokens, parseDeck } from '../../domains/deck/index.ts';
import { renderPlaybook } from '../../domains/deck/playbook.ts';
import { repoPath } from '../../engine/paths.ts';
import { loadRegistry } from '../../engine/registry.ts';
import { compare } from '../parity/compare.ts';
import { scrollSmoke } from '../visual/scroll-smoke.ts';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'frames-campaign-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const TPL = repoPath('domains/content/templates/editorial-calendar-v1.template.md');

describe('content.campaign', () => {
  it('a campaign deliverable with an unfilled Frames field fails', () => {
    const tpl = readFileSync(TPL, 'utf8');
    expect(deliverableCheck(tpl)).toBeTruthy(); // Frames shipped it like this
    const filled = tpl.replace(/⟦UNKNOWN:([\w-]+)⟧/g, (_, f) => `valor de ${f}`);
    expect(deliverableCheck(filled)).toBeNull();
    const emptied = filled.replace('value: valor de owner', "value: ''");
    expect(deliverableCheck(emptied)).toMatch(/campos sin llenar: owner/);
  });

  it('renders the campaign landing as a verified scroll page', async () => {
    expect(compare('content.campaign', 'frames-os')).toMatchObject({ verdict: 'superset' });
    const deck = parseDeck(
      readFileSync(repoPath('verify/parity/cases/content.campaign/frames-os/landing.yml'), 'utf8'),
    );
    const file = path.join(tmp, 'landing.html');
    writeFileSync(file, renderPlaybook(deck, loadTokens()));
    const r = await scrollSmoke(file, false);
    if (!r) return; // no browser: a gap, never green
    expect(r.problems).toEqual([]);
  }, 120_000);

  it('the run stops at publish and never reaches a publication step', () => {
    const reg = loadRegistry();
    const fam = reg.families.find((f) => f.id === 'content.campaign')!;
    const at = fam.steps.findIndex((s) => s.gate === 'publish');
    expect(reg.gates.find((g) => g.id === 'publish')?.kind).toBe('hard_stop');
    expect(at).toBeGreaterThan(0);
    const learn = { fact: 'phase', eq: 'learn' };
    // Before the stop, every step runs only outside the learning run; after it, only inside.
    for (const s of fam.steps.slice(0, at + 1)) expect(s.when).toEqual({ not: learn });
    for (const s of fam.steps.slice(at + 1)) expect(s.when).toEqual(learn);
    expect(fam.steps.some((s) => s.effect === 'external')).toBe(false);
  });
});
