// Guard policy: one pure decision function for every host. The hook adapters only
// normalise the host payload into a ToolCall and print the host's reply format.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { repoPath, ROOT, workDir } from '../paths.ts';

export type ToolCall =
  | { kind: 'bash'; command: string }
  | { kind: 'write'; file: string; content: string }
  | { kind: 'mcp'; tool: string }
  | { kind: 'other'; tool: string };

export type Decision = { decision: 'allow' | 'deny'; reason: string };

// Each rule names what it stops; the reason is shown to the agent verbatim.
const BASH_DENY: [RegExp, string][] = [
  [
    /\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rR][a-zA-Z]*\s+(-[a-zA-Z]+\s+)*(\/|~|\.|\*|\$HOME)(\/?\s|\/?$)/,
    'borrado recursivo de la raiz, home o el repo',
  ],
  [/\bRemove-Item\b[^|;&]*-Recurse\b/i, 'borrado recursivo en PowerShell'],
  [/\bgit\s+push\b/, 'push: lo decide la persona'],
  [/--no-verify\b/, 'saltarse los hooks de git'],
  [/\bgit\s+reset\s+--hard\b/, 'reset --hard destruye trabajo sin commit'],
  [/\bgit\s+clean\s+-[a-zA-Z]*[fdx][a-zA-Z]*/, 'git clean borra archivos sin versionar'],
  [/\bgit\s+config\b[^|;&]*core\.hooksPath/, 'desactivar o cambiar los hooks de git'],
  [/\b(frames|cli\.ts)\s+approve\b/, 'aprobar un gate lo hace la persona en su terminal'],
  [/(^|[\s'"=/<])\.env(\.(?!example\b)[\w-]+)?(?=$|[\s'"|;&>])/, 'leer o tocar secretos de .env'],
];

const SECRET = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}/,
  /\bsk-(ant-|proj-)?[A-Za-z0-9_-]{24,}/,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/,
];

export type Scope = { fair_game: string[]; hands_off: string[]; mcp_allow: string[] };

// Same structured-line form the harness auditor reads: `- key: \`glob\`, \`glob\``.
export function parseScope(text: string): Scope {
  const scope: Scope = { fair_game: [], hands_off: [], mcp_allow: [] };
  for (const line of text.split('\n')) {
    const m = /^-\s*(fair_game|hands_off|mcp_allow)\s*:\s*(.*)$/.exec(line.trim());
    if (m)
      scope[m[1] as keyof Scope].push(...[...(m[2] ?? '').matchAll(/`([^`]+)`/g)].map((x) => x[1] as string));
  }
  return scope;
}

export function loadScope(): Scope {
  return parseScope(readFileSync(repoPath('docs/scope.md'), 'utf8'));
}

export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string;
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
      if (glob[i + 1] === '/') i++;
    } else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const matches = (rel: string, globs: string[]) => globs.some((g) => globToRegExp(g).test(rel));

// MCP tools an external-effect step opened after its gate was consumed: each run's
// effects/open.json lists them until the step writes its receipt and closes it.
export function openEffectTools(work = workDir()): string[] {
  const runs = path.join(work, 'runs');
  if (!existsSync(runs)) return [];
  return readdirSync(runs).flatMap((id) => {
    const f = path.join(runs, id, 'effects', 'open.json');
    if (!existsSync(f)) return [];
    try {
      const w = JSON.parse(readFileSync(f, 'utf8')) as { tools?: string[]; closed?: boolean };
      return w.closed ? [] : (w.tools ?? []);
    } catch {
      return [];
    }
  });
}

export function decide(
  call: ToolCall,
  scope: Scope = loadScope(),
  root = ROOT,
  effects: string[] = call.kind === 'mcp' ? openEffectTools() : [],
): Decision {
  const allow = (reason: string): Decision => ({ decision: 'allow', reason });
  const deny = (reason: string): Decision => ({ decision: 'deny', reason });
  switch (call.kind) {
    case 'bash': {
      const hit = BASH_DENY.find(([re]) => re.test(call.command));
      return hit ? deny(hit[1]) : allow('comando fuera de las reglas de bloqueo');
    }
    case 'write': {
      if (SECRET.some((re) => re.test(call.content))) return deny('el contenido tiene forma de secreto');
      const rel = path.relative(root, path.resolve(root, call.file)).split(path.sep).join('/');
      if (rel.startsWith('..') || path.isAbsolute(rel))
        return allow('fuera del repo: no lo gobierna este alcance');
      if (matches(rel, scope.hands_off))
        return deny(`${rel} es hands_off (generado o protegido): edita su fuente y corre pnpm gen`);
      if (!matches(rel, scope.fair_game)) return deny(`${rel} esta fuera de fair_game (docs/scope.md)`);
      return allow('dentro de fair_game');
    }
    case 'mcp':
      if (matches(call.tool, scope.mcp_allow)) return allow('MCP en mcp_allow');
      if (matches(call.tool, effects))
        return allow('MCP dentro de una ventana de efecto abierta tras su gate');
      return deny(
        `MCP ${call.tool} no esta en mcp_allow ni en una ventana de efecto: un efecto externo espera su gate (external-effect) consumido`,
      );
    default:
      return allow('herramienta sin regla');
  }
}

// Normalise a Claude Code / Copilot-style PreToolUse payload.
// Tool calls from any host, normalized: Claude Code (tool_name/tool_input), Gemini CLI
// (run_shell_command, write_file, replace, mcp_<server>_<tool>) and Copilot (toolName/
// toolArgs, camelCase, toolArgs possibly a JSON string; or the Claude-compatible form).
export function toolCall(payload: {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  toolName?: string;
  toolArgs?: Record<string, unknown> | string;
}): ToolCall {
  const tool = payload.tool_name ?? payload.toolName ?? '';
  const rawArgs = payload.tool_input ?? payload.toolArgs ?? {};
  let input: Record<string, unknown> = {};
  try {
    input = typeof rawArgs === 'string' ? (JSON.parse(rawArgs) as Record<string, unknown>) : rawArgs;
  } catch {
    input = { command: rawArgs };
  }
  const pick = (...keys: string[]) =>
    keys.map((k) => input[k]).find((v) => typeof v === 'string') as string | undefined;
  if (['run_shell_command', 'bash', 'shell_command'].includes(tool))
    return { kind: 'bash', command: pick('command', 'cmd') ?? '' };
  if (['write_file', 'replace', 'edit', 'create', 'str_replace_editor'].includes(tool))
    return {
      kind: 'write',
      file: pick('file_path', 'path', 'filePath', 'absolute_path') ?? '',
      content: ['content', 'new_string', 'new_str', 'file_text', 'text']
        .map((k) => (typeof input[k] === 'string' ? input[k] : ''))
        .join('\n'),
    };
  if (/^mcp_[a-z0-9-]+_/i.test(tool))
    return { kind: 'mcp', tool: `mcp__${tool.slice(4).replace('_', '__')}` };
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '');
  if (tool === 'Bash' || tool === 'PowerShell' || tool === 'shell')
    return { kind: 'bash', command: str('command') };
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const edits = Array.isArray(input.edits) ? (input.edits as { new_string?: string }[]) : [];
    const content = [
      str('content'),
      str('new_string'),
      str('new_source'),
      ...edits.map((e) => e.new_string ?? ''),
    ].join('\n');
    return { kind: 'write', file: str('file_path') || str('notebook_path'), content };
  }
  if (tool.startsWith('mcp__')) return { kind: 'mcp', tool };
  return { kind: 'other', tool };
}
