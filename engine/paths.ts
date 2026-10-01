// One path resolver for the whole repo (Frames decision D1): no symlinks, no
// cwd-relative guesses. Every path is rooted at the package and must stay inside it.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync, lstatSync } from 'node:fs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function repoPath(...segments: string[]): string {
  return within(ROOT, ...segments);
}

// Resolve segments under base and refuse anything that escapes it.
export function within(base: string, ...segments: string[]): string {
  const resolved = path.resolve(base, ...segments);
  const rel = path.relative(base, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`PATH-ESCAPE: ${segments.join('/')}`);
  for (let at = resolved; at !== path.resolve(base); at = path.dirname(at))
    if (existsSync(at) && lstatSync(at).isSymbolicLink())
      throw new Error(`PATH-SYMLINK: ${segments.join('/')}`);
  return resolved;
}

// Run state lives under work/runs; tests point FRAMES_WORK elsewhere.
export function workDir(): string {
  return process.env.FRAMES_WORK ? path.resolve(process.env.FRAMES_WORK) : repoPath('work');
}
