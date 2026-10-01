// improve: take an existing page, audit it with the checks Frames OS holds its own pages
// to, and accept the improved version only if it removes findings and adds none.
// Frames' "editar/corregir" route recorded the existing piece as a string and read
// nothing (route-content.mjs:111-149).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { relTo, type Handler, type HandlerCtx, type SchemaCheck } from '../../engine/handler-kit.ts';
import { auditHtml, type Finding } from '../../verify/visual/audit.ts';

const byId = (ctx: HandlerCtx, id: string) => ctx.outputs.find((o) => o.id === id);
const report = (title: string, f: Finding[]) =>
  [
    `# ${title}`,
    '',
    f.length ? '| Severidad | Hallazgo | Dónde | Arreglo |' : 'Sin hallazgos.',
    ...(f.length ? ['| --- | --- | --- | --- |'] : []),
    ...f.map((x) => `| ${x.severity} | ${x.id} | ${x.where.replace(/\|/g, '/')} | ${x.fix} |`),
  ].join('\n') + '\n';

const input = (ctx: HandlerCtx, id: string, file: string) =>
  ctx.inputs[id] ?? path.join(ctx.runDir, 'artifacts', file);

const audit: Handler = async (ctx) => {
  const existing = input(ctx, 'existing', 'existing.html');
  if (!existsSync(existing)) return { status: 'blocked', note: 'no hay página existente que auditar (I00)' };
  const { findings, browser } = await auditHtml(existing);
  if (!browser)
    return { status: 'blocked', note: 'auditoría sin navegador: faltan los hallazgos de pantalla' };
  const out = byId(ctx, 'audit');
  if (out)
    ctx.write(relTo(ctx, out.file), JSON.stringify({ schema: 'improve-audit-v1', findings }, null, 2) + '\n');
  const md = byId(ctx, 'audit-report');
  if (md) ctx.write(relTo(ctx, md.file), report('Auditoría de la página existente', findings));
  return {
    status: 'done',
    note: `${findings.length} hallazgo(s), ${findings.filter((f) => f.severity === 'high').length} altos`,
  };
};

const verify: Handler = async (ctx) => {
  const improved = input(ctx, 'improved', 'improved.html');
  if (!existsSync(improved)) return { status: 'blocked', note: 'no hay versión mejorada (I02)' };
  const before = (
    JSON.parse(readFileSync(input(ctx, 'audit', 'audit.json'), 'utf8')) as { findings: Finding[] }
  ).findings;
  const { findings: after, browser } = await auditHtml(improved);
  if (!browser) return { status: 'blocked', note: 'auditoría sin navegador' };
  const was = new Set(before.map((f) => f.id));
  const fixed = before.filter((f) => !after.some((a) => a.id === f.id));
  const added = after.filter((a) => !was.has(a.id));
  const high = after.filter((a) => a.severity === 'high');
  const verdict = {
    schema: 'improve-verdict-v1',
    before: before.length,
    after: after.length,
    fixed: fixed.map((f) => f.id),
    added: added.map((f) => f.id),
    high_left: high.map((f) => f.id),
  };
  const out = byId(ctx, 'improve-verdict');
  if (out) ctx.write(relTo(ctx, out.file), JSON.stringify(verdict, null, 2) + '\n');
  const md = byId(ctx, 'verify-report');
  if (md)
    ctx.write(
      relTo(ctx, md.file),
      report(`Versión mejorada: ${fixed.length} de ${before.length} hallazgos corregidos`, after),
    );
  if (added.length)
    return {
      status: 'needs_input',
      note: `la versión mejorada agrega hallazgos: ${added.map((f) => f.id).join(', ')}`,
    };
  if (high.length)
    return { status: 'needs_input', note: `quedan hallazgos altos: ${high.map((f) => f.id).join(', ')}` };
  if (after.length >= before.length && before.length)
    return { status: 'needs_input', note: 'la versión mejorada no corrige nada' };
  return {
    status: 'done',
    note: `${fixed.length} de ${before.length} hallazgos corregidos, ninguno nuevo, ningún alto pendiente`,
  };
};

export const improve: { handlers: Record<string, Handler>; schemas: Record<string, SchemaCheck> } = {
  handlers: { 'improve.audit': audit, 'improve.verify': verify },
  schemas: {},
};
