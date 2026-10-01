// Deterministic intent scorer over the examples each family declares in the
// registry. The host model is the primary classifier (it reads the top-3 this
// returns); this scorer is what CI and the routing evals measure.
import type { Registry } from '../registry/schema.ts';
import { aulaIntent, type AulaIntent } from './aula/intent.ts';

const STOP = new Set(
  (
    'a al algo ante con de del el en es esta este esto la las lo los me mi mis para por que se sin su sus un una uno unos y o ' +
    'quiero necesito ayudame ayuda hazme haz dame favor porfa puedes podrias crea crear arma armar prepara preparar ' +
    'the an of to for with and or my me please i want need can you'
  ).split(' '),
);

export function tokens(text: string): string[] {
  return (
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOP.has(t))
      // crude stem: plural, gender and infinitive endings, so "slides"/"slide",
      // "animada"/"animado" and "planear"/"planea" meet
      .map((t) => (t.length > 4 ? t.replace(/(ar|er|ir|es|s|a|o|e)$/, '') : t))
  );
}

function cosine(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const t of a) if (b.has(t)) common++;
  return common / Math.sqrt(a.size * b.size);
}

export type Scored = { family: string; score: number };
export type Route =
  | { kind: 'family'; family: string; ranked: Scored[]; capability?: AulaIntent }
  | { kind: 'ambiguous'; ranked: Scored[]; question: string };

// Thresholds are pinned by verify/evals/routing floors; change them only with the evals.
export const MIN_SCORE = 0.3;
export const MIN_MARGIN = 0.04;

export function rank(reg: Registry, text: string): Scored[] {
  const q = new Set(tokens(text));
  return reg.families
    .map((f) => {
      const best = Math.max(...f.intent.examples.map((e) => cosine(q, new Set(tokens(e)))));
      const neg = Math.max(0, ...f.intent.negatives.map((e) => cosine(q, new Set(tokens(e)))));
      return { family: f.id, score: Math.round((best - 0.5 * neg) * 1000) / 1000 };
    })
    .sort((a, b) => b.score - a.score || a.family.localeCompare(b.family));
}

export function route(reg: Registry, text: string): Route {
  const capability = aulaIntent(text);
  if (capability && reg.families.some((f) => f.id === capability.family)) {
    const ranked = [
      { family: capability.family, score: 1 },
      ...rank(reg, text).filter((r) => r.family !== capability.family),
    ].slice(0, 3);
    return { kind: 'family', family: capability.family, ranked, capability };
  }
  // Aula requires a positive educational intent; it must not shrink the margins
  // of existing career, NotebookLM, Trainer or content requests.
  const ranked = rank(reg, text)
    .filter((r) => r.family !== 'aula')
    .slice(0, 3);
  const [top, second] = ranked;
  if (top && top.score >= MIN_SCORE && top.score - (second?.score ?? 0) >= MIN_MARGIN)
    return { kind: 'family', family: top.family, ranked };
  const titles = ranked
    .filter((r) => r.score > 0)
    .map((r) => reg.families.find((f) => f.id === r.family)?.title)
    .filter(Boolean);
  return {
    kind: 'ambiguous',
    ranked,
    question: titles.length
      ? `¿Qué resultado buscas: ${titles.join(', ')} u otro?`
      : '¿Qué quieres lograr? Por ejemplo: crear, mejorar, planear o explorar algo.',
  };
}
