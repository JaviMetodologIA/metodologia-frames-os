import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { decide, globToRegExp, loadScope, type ToolCall } from '../../engine/guard/policy.ts';
import { repoPath } from '../../engine/paths.ts';

const bash = (command: string): ToolCall => ({ kind: 'bash', command });
const write = (file: string, content = 'x'): ToolCall => ({ kind: 'write', file, content });

// Probes built at run time: a guard with zero probes proves nothing.
const DENY: ToolCall[] = [
  bash('rm -rf .'),
  bash('rm -rf /'),
  bash('rm -fr ~'),
  bash('Remove-Item -Recurse -Force .'),
  bash('git push origin main'),
  bash('git commit -m x --no-verify'),
  bash('git reset --hard HEAD~1'),
  bash('git clean -fdx'),
  bash('git config core.hooksPath /dev/null'),
  bash('pnpm frames approve run-1 direction'),
  bash('node engine/cli.ts approve run-1 direction'),
  bash('cat .env'),
  bash('source .env.local'),
  write('AGENTS.md'),
  write('.claude/settings.json'),
  write('verify/evals/routing/heldout.json'),
  write('verify/evals/routing/heldout-v2.json'),
  write('work/runs/deck-1/approvals/direction.json'),
  write('random-root-file.txt'),
  write('engine/x.ts', ['AKIA', 'ABCDEFGHIJKLMNOP'].join('')),
  { kind: 'mcp', tool: 'mcp__notebooklm__source_add' },
];
const ALLOW: ToolCall[] = [
  bash('git status'),
  bash('pnpm test'),
  bash('rm -rf work/runs/tmp-1'),
  bash('cp .env.example .env.example.bak'),
  bash('cat README.md'),
  write('engine/x.ts', 'export const x = 1;\n'),
  write('registry/families/content.piece.yml'),
  write('/tmp/scratch.txt'),
  { kind: 'mcp', tool: 'mcp__plugin_context7_context7__query-docs' },
];

describe('guard policy', () => {
  it('has probes on both sides', () => {
    expect(DENY.length).toBeGreaterThan(0);
    expect(ALLOW.length).toBeGreaterThan(0);
  });
  it.each(DENY.map((c) => [JSON.stringify(c), c] as const))('denies %s', (_n, c) => {
    expect(decide(c).decision).toBe('deny');
  });
  it.each(ALLOW.map((c) => [JSON.stringify(c), c] as const))('allows %s', (_n, c) => {
    expect(decide(c).decision).toBe('allow');
  });
  it('reads its scope from docs/scope.md', () => {
    const s = loadScope();
    expect(s.fair_game).toContain('engine/**');
    expect(s.hands_off).toContain('AGENTS.md');
  });
  it('globs match path segments', () => {
    expect(globToRegExp('work/runs/*/approvals/**').test('work/runs/a/approvals/x.json')).toBe(true);
    expect(globToRegExp('work/runs/*/approvals/**').test('work/runs/a/b/approvals/x.json')).toBe(false);
  });
});

describe('hook process (stdin JSON, fail closed)', () => {
  const hook = (input: string) =>
    spawnSync(process.execPath, [repoPath('engine/guard/hook.ts')], { input, encoding: 'utf8' }).stdout;
  it('denies a push through the real hook', () => {
    const out = hook(
      JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'git push' },
      }),
    );
    expect(JSON.parse(out).hookSpecificOutput.permissionDecision).toBe('deny');
  });
  it('stays silent on an allowed call', () => {
    expect(
      hook(
        JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }),
      ),
    ).toBe('');
  });
  it('denies when the payload is garbage', () => {
    expect(JSON.parse(hook('not json')).hookSpecificOutput.permissionDecision).toBe('deny');
  });
});

describe('other hosts, each in its documented contract', () => {
  const run = (host: string, payload: object) =>
    spawnSync(process.execPath, [repoPath('engine/guard/hook.ts'), '--host', host], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
    });
  it('Gemini CLI: a push through run_shell_command is denied with exit 2 and a reason', () => {
    const r = run('gemini', {
      hook_event_name: 'BeforeTool',
      tool_name: 'run_shell_command',
      tool_input: { command: 'git push origin main' },
    });
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stdout)).toMatchObject({ decision: 'deny' });
    expect(r.stderr).toMatch(/push/);
    const w = run('gemini', {
      hook_event_name: 'BeforeTool',
      tool_name: 'write_file',
      tool_input: { file_path: 'AGENTS.md', content: 'x' },
    });
    expect(w.status).toBe(2);
    const ok = run('gemini', {
      hook_event_name: 'BeforeTool',
      tool_name: 'run_shell_command',
      tool_input: { command: 'ls' },
    });
    expect([ok.status, ok.stdout]).toEqual([0, '']);
  });
  it('Copilot: camelCase payload with toolArgs as a JSON string is denied with permissionDecision', () => {
    const r = run('copilot', {
      toolName: 'bash',
      toolArgs: JSON.stringify({ command: 'git push origin main' }),
    });
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stdout)).toMatchObject({ permissionDecision: 'deny' });
    expect(run('copilot', { toolName: 'edit', toolArgs: { path: '.env', new_str: 'x' } }).status).toBe(2);
    expect(run('copilot', { toolName: 'bash', toolArgs: { command: 'ls' } }).status).toBe(0);
  });
  it('fails closed on garbage in every host', () => {
    for (const host of ['gemini', 'copilot']) {
      const r = spawnSync(process.execPath, [repoPath('engine/guard/hook.ts'), '--host', host], {
        input: 'not json',
        encoding: 'utf8',
      });
      expect(r.status, host).toBe(2);
    }
  });
});

describe('approve needs a human terminal', () => {
  it('refuses without a TTY', () => {
    const r = spawnSync(process.execPath, [repoPath('engine/cli.ts'), 'approve', 'x', 'direction'], {
      encoding: 'utf8',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/APPROVE-REQUIRES-TTY/);
  });
});
