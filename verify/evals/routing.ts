// Routing evals: top-1 and top-3 on train and held-out, rejection on negatives,
// each against a floor that only goes up.
import { readFileSync } from 'node:fs';
import { route } from '../../engine/classify.ts';
import { loadRegistry } from '../../engine/registry.ts';
import { repoPath } from '../../engine/paths.ts';

type Case = { text: string; expect?: string };
const load = (name: string): Case[] =>
  (JSON.parse(readFileSync(repoPath('verify/evals/routing', `${name}.json`), 'utf8')) as { cases: Case[] })
    .cases;

export type RoutingReport = {
  metrics: Record<
    | 'train_top1'
    | 'heldout_top1'
    | 'heldout_top3'
    | 'heldout_v2_top1'
    | 'heldout_v3_top1'
    | 'heldout_v3_top3'
    | 'negative_reject',
    number
  >;
  floors: Record<string, number>;
  misses: { set: string; text: string; expect: string; got: string }[];
  below: string[];
};

export function routingReport(): RoutingReport {
  const reg = loadRegistry();
  const misses: RoutingReport['misses'] = [];
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  const score = (set: string) => {
    const cases = load(set);
    let top1 = 0;
    let top3 = 0;
    for (const c of cases) {
      const r = route(reg, c.text);
      const got = r.kind === 'family' ? r.family : 'R0';
      if (got === c.expect) top1++;
      else misses.push({ set, text: c.text, expect: c.expect ?? '', got });
      if (r.ranked.some((x) => x.family === c.expect)) top3++;
    }
    return { top1: pct(top1, cases.length), top3: pct(top3, cases.length) };
  };
  const train = score('train');
  const held = score('heldout');
  const held2 = score('heldout-v2');
  const held3 = score('heldout-v3');
  const neg = load('negative');
  const rejected = neg.filter((c) => {
    const r = route(reg, c.text);
    if (r.kind !== 'ambiguous') misses.push({ set: 'negative', text: c.text, expect: 'R0', got: r.family });
    return r.kind === 'ambiguous';
  }).length;
  const metrics = {
    train_top1: train.top1,
    heldout_top1: held.top1,
    heldout_top3: held.top3,
    heldout_v2_top1: held2.top1,
    heldout_v3_top1: held3.top1,
    heldout_v3_top3: held3.top3,
    negative_reject: pct(rejected, neg.length),
  };
  const floors = JSON.parse(readFileSync(repoPath('verify/evals/routing/floors.json'), 'utf8')) as Record<
    string,
    number
  >;
  const below = Object.entries(metrics)
    .filter(([k, v]) => v < (floors[k] ?? 0))
    .map(([k, v]) => `${k} ${v} < piso ${floors[k]}`);
  return { metrics, floors, misses, below };
}

export function runRoutingEvals({ json }: { json: boolean }): number {
  const r = routingReport();
  if (json) console.log(JSON.stringify(r, null, 2));
  else {
    for (const [k, v] of Object.entries(r.metrics))
      console.log(`${k.padEnd(16)} ${String(v).padStart(5)}%  piso ${r.floors[k] ?? 0}`);
    for (const m of r.misses) console.log(`  miss [${m.set}] "${m.text}" → ${m.got} (esperado ${m.expect})`);
    for (const b of r.below) console.log(`BAJO PISO: ${b}`);
  }
  return r.below.length ? 1 : 0;
}
