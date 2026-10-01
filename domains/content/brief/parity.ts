// Portado tal cual de Frames c6d0ba61 _runner/brief-parity.ts (Port-Unit P03-brief, Class asis).
// Cambios: imports locales.
import type { FramesBriefV1 } from './schema.ts';
import { parseFramesBriefMarkdown, stableStringify } from './model.ts';
import { renderFramesBriefHtml } from './renderer.ts';

export type BriefParityResult = {
  status: 'PASS' | 'FAIL';
  content_sha256: string;
  issues: string[];
};

const embeddedBrief = (html: string): FramesBriefV1 | undefined => {
  const match = /<script id="frames-brief-data" type="application\/json">([\s\S]*?)<\/script>/u.exec(html);
  if (!match?.[1]) return undefined;
  return JSON.parse(match[1]) as FramesBriefV1;
};

export const verifyBriefParity = (markdown: string, html: string): BriefParityResult => {
  const brief = parseFramesBriefMarkdown(markdown);
  const issues: string[] = [];
  let embedded: FramesBriefV1 | undefined;
  try {
    embedded = embeddedBrief(html);
  } catch {
    issues.push('HTML_CANONICAL_JSON_INVALID');
  }
  if (!embedded) issues.push('HTML_CANONICAL_JSON_MISSING');
  else if (stableStringify(embedded) !== stableStringify(brief)) {
    issues.push('HTML_CANONICAL_MODEL_MISMATCH');
  }
  if (!html.includes(`data-content-sha256="${brief.frontmatter.content_sha256}"`)) {
    issues.push('HTML_CONTENT_HASH_MISMATCH');
  }
  if (html !== renderFramesBriefHtml(markdown)) issues.push('HTML_PROJECTION_NOT_DETERMINISTIC');
  return {
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    content_sha256: brief.frontmatter.content_sha256,
    issues,
  };
};
