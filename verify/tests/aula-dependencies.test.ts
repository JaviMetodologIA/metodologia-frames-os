import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { digest } from '../../engine/aula/catalog.ts';
import {
  Metadata,
  BuildBindings,
  bankRootForRun,
  verifyBuildDependencies,
  assertSameBuildBinding,
} from '../../engine/aula/dependencies.ts';

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'aula-host-deps-fixture-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
const put = (ref: string, text: string) => {
  const file = path.join(root, ref);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return digest(text);
};
function binding(bank = false) {
  const deps = [
    {
      role: 'profile',
      ref: 'assets/core/profiles/metodologia.json',
      sha256: put('engine/assets/core/profiles/metodologia.json', 'profile'),
    },
    {
      role: 'font',
      ref: 'assets/core/fonts/font.ttf',
      sha256: put('engine/assets/core/fonts/font.ttf', 'font'),
    },
    {
      role: 'core-catalog',
      ref: 'assets/core/catalog.json',
      sha256: put('engine/assets/core/catalog.json', 'catalog'),
    },
    { role: 'linked-piece', ref: 'input/practice.html', sha256: put('source/practice.html', 'practice') },
    ...(bank
      ? [
          { role: 'bank-manifest', ref: 'bank/manifest.json', sha256: put('bank/manifest.json', 'manifest') },
          {
            role: 'bank-catalog',
            ref: 'bank/catalog.json',
            sha256: put('bank/catalog.json', 'bank catalog'),
          },
          { role: 'asset', ref: 'bank/scenes/scene.json', sha256: put('bank/scenes/scene.json', 'scene') },
        ]
      : []),
  ];
  return Metadata.parse({
    engineVersion: '1.1.0',
    profile: { id: 'metodologia', sha256: deps[0]!.sha256 },
    buildDependencies: deps,
    assetEvidence: bank
      ? [
          {
            id: 'scene',
            kind: 'scene',
            sha256: digest('scene'),
            source: 'bank',
            catalogSha256: digest('bank catalog'),
          },
        ]
      : [],
    ...(bank ? { bankRef: 'bank' } : {}),
  });
}
describe('native approved Aula build dependencies', () => {
  it('accepts white-label system-ui without font assets and keeps its profile hash required', () => {
    const current = binding();
    const neutral = {
      ...current,
      profile: { ...current.profile!, id: 'white-label' as const },
      buildDependencies: current.buildDependencies!.filter((dep) => dep.role !== 'font'),
    };
    expect(Metadata.parse(neutral).profile?.id).toBe('white-label');
    expect(
      Metadata.safeParse({
        ...neutral,
        buildDependencies: neutral.buildDependencies.filter((dep) => dep.role !== 'profile'),
      }).success,
    ).toBe(false);
  });
  it('preserves legacy metadata and rejects partial or unbound successor claims', () => {
    expect(Metadata.parse({})).toEqual({});
    for (const engineVersion of ['1.1.0', '1.2.0'])
      expect(Metadata.parse({ ...binding(), engineVersion }).engineVersion).toBe(engineVersion);
    const b = binding();
    for (const changed of [
      { ...b, profile: undefined },
      { ...b, profile: { id: 'metodologia', sha256: digest('wrong') } },
      { ...b, unexpected: true },
      { ...b, buildDependencies: [...b.buildDependencies!, b.buildDependencies![0]!] },
      {
        ...b,
        assetEvidence: [
          {
            id: 'absent',
            kind: 'icon',
            sha256: digest('absent'),
            source: 'core',
            catalogSha256: digest('catalog'),
          },
        ],
      },
    ])
      expect(Metadata.safeParse(changed).success).toBe(false);
    expect(() =>
      BuildBindings.parse({
        schema: 'aula-build-bindings-v1',
        engineFiles: {
          'runtime.py': digest('runtime'),
          'app.js': digest('app'),
          'style.css': digest('style'),
        },
        skillSha256: digest('skill'),
        sourceSha256: digest('source'),
        kind: 'workbook',
        edition: 'white-label',
        ...b,
      }),
    ).toThrow(/PROFILE-EDITION/);
  });
  it('rechecks core, linked HTML and selected bank hashes against real bounded roots', () => {
    const b = binding(true);
    const bank = bankRootForRun(root, b.bankRef);
    expect(() =>
      verifyBuildDependencies(path.join(root, 'engine'), path.join(root, 'source'), bank, b),
    ).not.toThrow();
    writeFileSync(path.join(root, 'source/practice.html'), 'changed');
    expect(() =>
      verifyBuildDependencies(path.join(root, 'engine'), path.join(root, 'source'), bank, b),
    ).toThrow(/DEPENDENCY-STALE/);
  });
  it('rejects bank traversal, symlinks, absent authorization and incomplete bank closure', () => {
    const b = binding(true);
    const engine = path.join(root, 'engine'),
      source = path.join(root, 'source');
    expect(() => bankRootForRun(root, '../bank')).toThrow();
    expect(() => verifyBuildDependencies(engine, source, undefined, b)).toThrow(/BANK-REQUIRED/);
    expect(() =>
      verifyBuildDependencies(engine, source, path.join(root, 'bank'), {
        ...b,
        buildDependencies: b.buildDependencies!.filter((d) => d.role !== 'bank-manifest'),
      }),
    ).toThrow(/BANK-BINDING-INCOMPLETE/);
    symlinkSync(path.join(root, 'bank'), path.join(root, 'bank-link'));
    expect(() => bankRootForRun(root, 'bank-link')).toThrow(/SYMLINK/);
  });
  it('blocks stale approved asset evidence, profile and bank roots without a new human decision', () => {
    const b = binding(true);
    expect(() => assertSameBuildBinding(b, b)).not.toThrow();
    for (const changed of [
      { ...b, bankRef: 'other' },
      { ...b, assetEvidence: [] },
      { ...b, profile: { ...b.profile!, sha256: digest('changed') } },
    ])
      expect(() => assertSameBuildBinding(b, changed)).toThrow();
    expect(() => assertSameBuildBinding({}, {})).not.toThrow();
  });
});
