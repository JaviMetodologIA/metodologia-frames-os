import { describe, expect, it } from 'vitest';
import { route, tokens } from '../../engine/classify.ts';
import { CONTRACT_TOKENS, drift, estimateTokens, outputs } from '../../engine/gen.ts';
import { loadRegistry } from '../../engine/registry.ts';
import { routingReport } from '../evals/routing.ts';

describe('gen', () => {
  const out = outputs(loadRegistry());
  it('generated files are current', () => {
    expect(drift()).toEqual([]);
  });
  it('host skills carry frontmatter at byte 0', () => {
    for (const [rel, body] of Object.entries(out))
      if (rel.endsWith('SKILL.md')) expect(body.startsWith('---\n')).toBe(true);
  });
  it('the always-loaded contract fits its budget and names the gate', () => {
    const agents = out['AGENTS.md'] ?? '';
    expect(estimateTokens(agents)).toBeLessThanOrEqual(CONTRACT_TOKENS);
    expect(agents).toContain('`pnpm verify`');
  });
  it('every family appears in the contract', () => {
    for (const f of loadRegistry().families) expect(out['AGENTS.md']).toContain(`\`${f.id}\``);
  });
});

describe('route', () => {
  const reg = loadRegistry();
  it('normalises accents and simple inflection', () => {
    expect(tokens('Presentación animada')).toEqual(tokens('presentacion animado'));
  });
  it('asks instead of guessing on a greeting', () => {
    expect(route(reg, 'hola').kind).toBe('ambiguous');
  });
  it('sends an immersive deck request to deck.immersive', () => {
    expect(route(reg, 'crea una presentacion html animada para la clase')).toMatchObject({
      kind: 'family',
      family: 'deck.immersive',
    });
  });
  it('meets every routing floor', () => {
    expect(routingReport().below).toEqual([]);
  });
});
