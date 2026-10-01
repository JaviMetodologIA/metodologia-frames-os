// Only the engine stages renderer files. Domains receive bytes and use ctx.write.
import { spawnSync } from 'node:child_process';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { repoPath } from '../paths.ts';
import { digest, selectAula, type AulaKind, type Edition } from './catalog.ts';

const Name = z.string().regex(/^[a-z][a-z0-9-]*\.(html|md|json)$/);
const Plan = z.object({ outputs: z.array(Name).min(2).max(10) }).strict();
const Receipt = z
  .object({
    state: z.literal('RENDERED_DRAFT'),
    kind: z.string(),
    edition: z.string(),
    inputSha256: z.string(),
    engineSha256: z.string(),
    outputs: z.record(Name, z.string()),
    advisories: z.array(z.unknown()),
  })
  .strict();

const CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

export function aulaBuild(
  source: string,
  kind: AulaKind,
  edition: Edition,
  build = true,
  assets: Record<string, Buffer> = {},
) {
  const selected = selectAula(kind, edition);
  const stage = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'frames-aula-'));
  try {
    const input = path.join(stage, 'source.json');
    const out = path.join(stage, 'rendered');
    writeFileSync(input, source);
    const attachments = Object.keys(assets);
    if (attachments.length > 20) throw new Error('AULA-ASSET-LIMIT');
    if (attachments.length) mkdirSync(out);
    for (const [name, data] of Object.entries(assets)) {
      Name.parse(name);
      if (data.length > 2 * 1024 * 1024 || !name.endsWith('.html')) throw new Error('AULA-ASSET-LIMIT');
      writeFileSync(path.join(stage, name), data);
      writeFileSync(path.join(out, name), data);
    }
    const invoke = (command: string) => {
      const result = spawnSync(
        process.env.FRAMES_PYTHON ?? 'python3',
        [
          repoPath(selected.catalog.engine.source, 'runtime.py'),
          command,
          '--kind',
          kind,
          '--edition',
          edition,
          '--input',
          input,
          '--out',
          out,
        ],
        {
          encoding: 'utf8',
          timeout: 30_000,
          maxBuffer: 8 * 1024 * 1024,
          env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
        },
      );
      if (result.error) throw new Error(`AULA-SENSOR-GAP: ${result.error.message}`);
      if (result.status !== 0)
        throw new Error(`AULA-${command.toUpperCase()}-BLOCKED: ${result.stdout || result.stderr}`);
      return result.stdout;
    };
    invoke('check');
    const original = Plan.parse(JSON.parse(invoke('plan')) as unknown);
    if (attachments.some((name) => original.outputs.includes(name)))
      throw new Error('AULA-ASSET-OUTPUT-COLLISION');
    const plan = { outputs: [...original.outputs, ...attachments] };
    if (new Set(plan.outputs).size !== plan.outputs.length) throw new Error('AULA-PLAN-DUPLICATE');
    if (!build) return { ...selected, plan, files: new Map<string, Buffer>() };
    const receipt = Receipt.parse(JSON.parse(invoke('build')) as unknown);
    if (readdirSync(out).sort().join() !== [...plan.outputs].sort().join())
      throw new Error('AULA-OUTPUT-SET-MISMATCH');
    const files = new Map<string, Buffer>();
    for (const name of plan.outputs) {
      const file = path.join(out, name);
      if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink())
        throw new Error(`AULA-OUTPUT-UNSAFE: ${name}`);
      files.set(name, readFileSync(file));
    }
    const engine = repoPath(selected.catalog.engine.source);
    const hash = digest(
      Buffer.concat(['runtime.py', 'app.js', 'style.css'].map((f) => readFileSync(path.join(engine, f)))),
    );
    if (
      receipt.inputSha256 !== digest(source) ||
      receipt.engineSha256 !== hash ||
      receipt.kind !== kind ||
      receipt.edition !== edition
    )
      throw new Error('AULA-RECEIPT-MISMATCH');
    for (const [name, bytes] of files)
      if (name !== 'receipt.json' && !attachments.includes(name) && receipt.outputs[name] !== digest(bytes))
        throw new Error(`AULA-OUTPUT-HASH: ${name}`);
    if (Object.keys(receipt.outputs).length !== files.size - 1 - attachments.length)
      throw new Error('AULA-RECEIPT-OUTPUTS-MISMATCH');
    // Native HTML gates require a no-network CSP. This adapter layer preserves the
    // frozen source engine and binds the resulting bytes, including module siblings.
    for (const [name, bytes] of files)
      if (name.endsWith('.html')) {
        let html = bytes.toString();
        if (!/^<!doctype html>/i.test(html) || /\s(?:src|href)="(?:https?:)?\/\//i.test(html))
          throw new Error(`AULA-HTML-OFFLINE: ${name}`);
        html = html.replace(/<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*>/gi, '');
        const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
        html = /<head>/i.test(html)
          ? html.replace(/<head>/i, `<head>${meta}`)
          : html.replace(/<html\b[^>]*>/i, (tag) => `${tag}${meta}`);
        files.set(name, Buffer.from(html));
      }
    files.set(
      'receipt.json',
      Buffer.from(
        JSON.stringify(
          {
            ...receipt,
            outputs: Object.fromEntries(
              [...files]
                .filter(([name]) => name !== 'receipt.json')
                .map(([name, bytes]) => [name, digest(bytes)]),
            ),
          },
          null,
          2,
        ) + '\n',
      ),
    );
    return { ...selected, plan, files };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
