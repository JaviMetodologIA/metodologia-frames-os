import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { repoPath } from '../../engine/paths.ts';
import { digest } from '../../engine/aula/catalog.ts';
import { validateAulaParitySuccession } from '../parity/compare.ts';

const base = readFileSync(repoPath('verify/parity/cases/aula/frames-os/cases.json'), 'utf8');
const successorBody = readFileSync(repoPath('verify/parity/cases/aula/frames-os/cases-1.1.0.json'), 'utf8');
const catalog = readFileSync(repoPath('registry/aula-capabilities.json'), 'utf8');
const successor = () =>
  JSON.parse(successorBody) as {
    capabilities: {
      id: string;
      kind: string;
      edition: string;
      inputSha256: string;
      version: string;
      companions: Record<string, string>;
    }[];
  };
const check = (next = successor()) => validateAulaParitySuccession(base, JSON.stringify(next), catalog);
const hash = '0'.repeat(64);

describe('versioned Aula parity successor', () => {
  it('preserves the historical case and binds eighteen current inputs and four companion HTML files', () => {
    expect(digest(base)).toBe('6c691379b76842ed4ee9d23141a7b722ab9f078553521664954a47ce6228c84d');
    const current = check();
    expect(current.capabilities).toHaveLength(18);
    expect(current.capabilities.flatMap((skill) => Object.keys(skill.companions))).toHaveLength(4);
  });
  it('rejects altered historical bytes and a stale catalog even when the JSON remains valid', () => {
    expect(() => validateAulaParitySuccession(base + '\n', successorBody, catalog)).toThrow(/HISTORICAL/);
    expect(() => validateAulaParitySuccession(base, successorBody, catalog + '\n')).toThrow(/CATALOG-STALE/);
  });
  it('rejects changed input hashes, capability identities, editions and versions', () => {
    for (const patch of [
      { inputSha256: hash },
      { id: 'unknown' },
      { edition: 'metodologia' },
      { version: '9.0.0' },
    ]) {
      const next = successor();
      Object.assign(
        next.capabilities.find((skill) => skill.id === 'edu-workbook')!,
        patch,
      );
      expect(() => check(next)).toThrow();
    }
  });
  it('rejects missing, extra and duplicate capability sets', () => {
    for (const change of ['missing', 'extra', 'duplicate']) {
      const next = successor();
      if (change === 'missing') next.capabilities.pop();
      if (change === 'extra') next.capabilities.push(next.capabilities[0]!);
      if (change === 'duplicate') next.capabilities[1] = next.capabilities[0]!;
      expect(() => check(next)).toThrow();
    }
  });
  it('rejects companion hashes, missing/extra companions and unsafe attachment names', () => {
    for (const change of [
      'altered',
      'missing',
      'extra',
      '../outside.html',
      '/outside.html',
      'masterclass.html?x',
    ]) {
      const next = successor();
      const companions = next.capabilities.find((skill) => skill.id === 'edu-index')!.companions;
      if (change === 'altered') companions['masterclass.html'] = hash;
      else if (change === 'missing') delete companions['masterclass.html'];
      else companions[change === 'extra' ? 'extra.html' : change] = hash;
      expect(() => check(next)).toThrow();
    }
  });
});
