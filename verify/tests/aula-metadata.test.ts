import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import YAML from 'yaml';
import { loadAulaCatalog } from '../../engine/aula/catalog.ts';
import { handlers } from '../../engine/handlers.ts';
import { repoPath } from '../../engine/paths.ts';
import { loadRegistry } from '../../engine/registry.ts';

it('resolves native metadata for all twenty packages and checks adapted bytes without writes', () => {
  const catalog = loadAulaCatalog();
  const registry = loadRegistry();
  const observed = [repoPath('registry/aula-capabilities.json')];
  for (const skill of catalog.capabilities) {
    const lineageFile = repoPath(skill.source, 'LINEAGE.yml');
    const contextFile = repoPath(skill.source, 'context.md');
    observed.push(lineageFile, contextFile, repoPath(skill.source, 'SKILL.md'));
    const lineage = YAML.parse(readFileSync(lineageFile, 'utf8')) as { authority_refs: string[] };
    const commercial = skill.kind === 'dynamic-commercial-decks';
    const family = registry.families.find((f) => f.id === (commercial ? 'deck.immersive' : 'aula'))!;
    expect(lineage.authority_refs).toContain(`registry/families/${family.id}.yml`);
    for (const ref of lineage.authority_refs) expect(existsSync(repoPath(ref)), ref).toBe(true);
    expect(handlers.has(skill.handler)).toBe(true);
    const context = readFileSync(contextFile, 'utf8');
    expect(skill.files['context.md']).toBeDefined();
    expect(context).not.toMatch(/03_artefactos|frames:aula|P05|P06|P07|EXP_BRIEF_APPROVED/);
    expect(context).toContain(`pnpm frames start ${family.id} --request`);
    expect(context).toContain(`aula_format=${skill.kind}`);
    expect(context).toContain(`edition=${skill.edition}`);
    for (const [, ref] of context.matchAll(/`((?:registry|docs|domains|skills|scripts)\/[^`]+)`/g))
      expect(existsSync(repoPath(ref!)), ref).toBe(true);
    for (const step of family.steps.filter((s) =>
      commercial ? s.id === 'D01' || s.id.startsWith('DC') : true,
    )) {
      expect(context).toContain(`\`${step.id}\``);
      if (step.gate) expect(context).toContain(`\`${step.gate}\``);
    }
  }
  // A native snapshot is a valid import source too: the adaptation is idempotent.
  const mtimes = () => observed.map((f) => statSync(f).mtimeMs);
  const before = mtimes();
  const check = (source: string) =>
    spawnSync(process.execPath, [repoPath('scripts/sync-aula-packages.ts'), '--source', source, '--check'], {
      cwd: repoPath(),
      encoding: 'utf8',
    });
  const result = check(repoPath('skills/aula'));
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('verified without writes');
  expect(mtimes()).toEqual(before);

  const temp = mkdtempSync(path.join(os.tmpdir(), 'frames-aula-metadata-'));
  try {
    cpSync(repoPath('skills/aula'), path.join(temp, 'skills'), { recursive: true });
    for (const skill of catalog.capabilities) rmSync(path.join(temp, 'skills', skill.id, 'context.md'));
    const portable = check(path.join(temp, 'skills'));
    expect(portable.status, portable.stderr).toBe(0);
    for (const skill of catalog.capabilities)
      expect(existsSync(path.join(temp, 'skills', skill.id, 'context.md'))).toBe(false);
    expect(mtimes()).toEqual(before);
    const file = path.join(temp, 'skills', catalog.capabilities[0]!.id, 'examples/input.json');
    writeFileSync(file, readFileSync(file, 'utf8') + '\n');
    const drift = check(path.join(temp, 'skills'));
    expect(drift.status).not.toBe(0);
    expect(drift.stderr).toContain('catalog drift');
    expect(mtimes()).toEqual(before);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
