// Every commit carries `Port-Unit: <unit> Class: asis|rewrite|new` so porting pace
// is measured from git history, not estimated.
import { readFileSync } from 'node:fs';

export const TRAILER = /^Port-Unit: [A-Za-z0-9._/-]+ Class: (asis|rewrite|new)$/m;

const file = process.argv[2];
if (file) {
  const msg = readFileSync(file, 'utf8');
  if (!TRAILER.test(msg)) {
    console.error('commit-msg: falta el trailer "Port-Unit: <unidad> Class: asis|rewrite|new"');
    process.exit(1);
  }
}
