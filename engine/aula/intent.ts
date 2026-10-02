// Extract only material Aula intent; slides keep their existing deck-v1 route.
import { AulaKind, Edition, type AulaKind as Kind, type Edition as Brand } from './catalog.ts';
import type { Facts } from '../handler-kit.ts';

export type AulaIntent = {
  family: 'aula' | 'deck.immersive';
  kind: Kind;
  edition: Brand;
  renderer: 'frames-aula';
};
export function aulaIntent(request: string): AulaIntent | null {
  const text = request
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  const edition = /marca blanca|white[ -]label/.test(text) ? 'white-label' : 'metodologia';
  if (/\b(notebooklm|notebook|nlm)\b/.test(text)) return null;
  if (/\btrainer\b/.test(text)) return null;
  if (
    /\b(comercial|commercial|prospeccion)\b/.test(text) &&
    /\b(deck|presentacion|presentation|propuesta)\b/.test(text)
  )
    return { family: 'deck.immersive', kind: 'dynamic-commercial-decks', edition, renderer: 'frames-aula' };
  if (/clase inmersiva|sesion presentada/.test(text))
    return { family: 'aula', kind: 'immersive-class', edition, renderer: 'frames-aula' };
  // A full Trainer course and the historical slide/masterclass routes remain distinct.
  if (
    /\b(trainer|curso|programa|capacitacion)\b/.test(text) ||
    /masterclass.*workbook.*playbook/.test(text) ||
    /\b(slides?|diapositivas|presentacion|deck)\b/.test(text)
  )
    return null;
  let kind: Kind | undefined;
  if (/lean[ -]?coffee/.test(text)) kind = 'lean-coffee';
  else if (/\b(modulo|module|kit completo)\b/.test(text)) kind = 'module';
  else if (/\b(indice|index)\b/.test(text)) kind = 'index';
  else if (/playbook.*inmersiv|immersive.*playbook/.test(text)) kind = 'playbook-immersive';
  else if (/\bplaybook\b/.test(text) && !/\bscroll\b/.test(text)) kind = 'playbook';
  else if (
    /\b(workbook|cuaderno)\b|campos editables|practica guiada/.test(text) ||
    (/\b(practica|practicar|laboratorio)\b/.test(text) &&
      /aprend|ejercicio|material|dinamic|educat|concept|aula|metodo/.test(text))
  )
    kind = 'workbook';
  else if (/clase inmersiva|sesion presentada/.test(text)) kind = 'immersive-class';
  else if (/\bmasterclass\b|(explica|ensenar).*conceptos|conceptos.*(aula|dinamic)/.test(text))
    kind = 'masterclass';
  else if (/\baula\b/.test(text)) kind = 'masterclass';
  return kind ? { family: 'aula', kind, edition, renderer: 'frames-aula' } : null;
}

export function aulaFacts(family: string, facts: Facts): Facts {
  const picked = typeof facts.request === 'string' ? aulaIntent(facts.request) : null;
  if (
    family !== 'aula' &&
    !(family === 'deck.immersive' && (picked?.family === family || facts.renderer === 'frames-aula'))
  )
    return facts;
  const kind = AulaKind.parse(
    facts.aula_format ?? picked?.kind ?? (family === 'aula' ? 'masterclass' : 'dynamic-commercial-decks'),
  );
  if ((family === 'aula') === (kind === 'dynamic-commercial-decks'))
    throw new Error('AULA-FAMILY-FORMAT-MISMATCH');
  return {
    ...facts,
    renderer: 'frames-aula',
    aula_format: kind,
    edition: Edition.parse(facts.edition ?? picked?.edition ?? 'metodologia'),
  };
}
