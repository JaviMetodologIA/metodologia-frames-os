// Handler and schema registries: the engine's own plus every domain's. A step
// names a handler and each output names a schema; registry:check fails when either
// id has no code here.
import { readFileSync } from 'node:fs';
import { domains } from '../domains/index.ts';
import {
  markdownCheck,
  missingFrom,
  requestFromHost,
  type Handler,
  type SchemaCheck,
} from './handler-kit.ts';

export type { Facts, Handler, HandlerCtx, HandlerResult, SchemaCheck } from './handler-kit.ts';

export const schemas = new Map<string, SchemaCheck>([
  ['markdown', markdownCheck],
  [
    'json',
    (c) => {
      try {
        JSON.parse(c);
        return null;
      } catch (e) {
        return `invalid JSON: ${(e as Error).message}`;
      }
    },
  ],
]);

// Binary media: presence and size are the check; the manifest binds their hashes.
schemas.set('mp4', (c) => (c.slice(4, 8) === 'ftyp' ? null : 'no es un MP4 (falta ftyp)'));
schemas.set('vtt', (c) => (c.startsWith('WEBVTT') ? null : 'no empieza con WEBVTT'));

export const handlers = new Map<string, Handler>();

// `authored`: the host model writes every output. First call leaves a request;
// a later call finds the files and the engine validates them.
handlers.set('authored', async (ctx) => {
  const missing = missingFrom(ctx);
  return missing.length ? requestFromHost(ctx, missing) : { status: 'done', note: 'outputs present' };
});

for (const d of domains) {
  for (const [id, h] of Object.entries(d.handlers)) {
    if (handlers.has(id)) throw new Error(`HANDLER-DUPLICATE: ${id}`);
    handlers.set(id, h);
  }
  for (const [id, s] of Object.entries(d.schemas)) {
    if (schemas.has(id)) throw new Error(`SCHEMA-DUPLICATE: ${id}`);
    schemas.set(id, s);
  }
}

export function checkOutput(schema: string, file: string): string | null {
  const check = schemas.get(schema);
  if (!check) return `unknown schema ${schema}`;
  return check(readFileSync(file, 'utf8'), file);
}
