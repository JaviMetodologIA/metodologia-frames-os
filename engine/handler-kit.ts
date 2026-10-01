// What a handler is and the helpers every domain shares. No domain imports here:
// domains depend on this kit, and engine/handlers.ts assembles both.
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Step } from '../registry/schema.ts';
import { repoPath, ROOT } from './paths.ts';

export type Facts = Record<string, string | number | boolean>;

export type OutputRef = { id: string; schema: string; required: boolean; file: string };

export type HandlerCtx = {
  runDir: string;
  step: Step;
  facts: Facts;
  // Declared outputs of this step whose `when` holds, with the path each must fill.
  outputs: OutputRef[];
  inputs: Record<string, string>;
  write: (rel: string, data: string | Buffer) => string;
};

export type HandlerResult = {
  status: 'done' | 'needs_input' | 'blocked';
  note: string;
  questions?: string[];
  facts?: Facts;
};

export type Handler = (ctx: HandlerCtx) => Promise<HandlerResult>;

// Validator: returns an error message, or null when the content is valid.
export type SchemaCheck = (content: string, file?: string) => string | null;

// Unfilled markers in both Frames template styles: {{EXPECTED_OUTCOME}} in the brief,
// ⟦UNKNOWN:field⟧ in every frames-deliverable-v1 template.
export const PLACEHOLDER = /\b(TODO|TBD|REEMPLAZAR)\b|\{\{[A-Za-z0-9_]+\}\}|⟦UNKNOWN:[^⟧]*⟧/;

export const markdownCheck: SchemaCheck = (c) =>
  c.trim().length === 0
    ? 'empty'
    : PLACEHOLDER.test(c)
      ? `placeholder left: ${PLACEHOLDER.exec(c)?.[0]}`
      : null;

const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join('/');

export function templateFor(step: Step, outputId: string): string | null {
  if (!step.template) return null;
  const file = repoPath(step.template, `${outputId}.template.md`);
  return existsSync(file) ? rel(file) : null;
}

// Leave a request for the host model: what to write, where, from which template.
export function requestFromHost(ctx: HandlerCtx, missing: OutputRef[], extra: string[] = []): HandlerResult {
  const lines = [
    `# Paso ${ctx.step.id}: ${ctx.step.title}`,
    '',
    `Agente: ${ctx.step.agent}`,
    ...(ctx.step.skills.length ? [`Skills: ${ctx.step.skills.join(', ')}`] : []),
    '',
    '## Escribir',
    ...missing.map((o) => {
      const tpl = templateFor(ctx.step, o.id);
      return `- ${o.file} (schema ${o.schema})${tpl ? ` · plantilla ${tpl}` : ''}`;
    }),
    ...(Object.keys(ctx.inputs).length
      ? ['', '## Insumos', ...Object.entries(ctx.inputs).map(([id, f]) => `- ${id}: ${f}`)]
      : []),
    ...(extra.length ? ['', ...extra] : []),
  ];
  const req = ctx.write(`requests/${ctx.step.id}.md`, lines.join('\n') + '\n');
  return { status: 'needs_input', note: `escribe lo pedido en ${req} y vuelve a correr next` };
}

export const missingFrom = (ctx: HandlerCtx, ids?: string[]) =>
  ctx.outputs.filter((o) => o.required && !existsSync(o.file) && (!ids || ids.includes(o.id)));

export const relTo = (ctx: HandlerCtx, file: string) => path.relative(ctx.runDir, file);
