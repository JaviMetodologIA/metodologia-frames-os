// Markdown → offline HTML document in the MetodologIA shell. Markdown is canonical:
// the HTML embeds it and its sha, so parity is checkable after the fact.
// CSS ported from Frames c6d0ba61 02_proceso/workflows/experience/html-shell.ts.
import { createHash } from 'node:crypto';
import { markdownToHtml } from './brief/markup.ts';

const esc = (v: string) =>
  v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export const sha256 = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');

export const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const css = `:root{color-scheme:light dark;--navy:#122562;--gold:#FFD700;--blue:#137DC5;--ink:#101a38;--muted:#526079;--canvas:#f3f7ff;--surface:#fff;--line:#ccd7ec;font-family:"Montserrat",system-ui,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);line-height:1.65}
.skip{position:fixed;top:.5rem;left:.5rem;translate:0 -160%;padding:.7rem 1rem;background:#fff;color:var(--navy);border:2px solid var(--blue);border-radius:8px}.skip:focus{translate:0}
.wrap{width:min(860px,calc(100% - 2rem));margin:auto;padding:3rem 0}
.hero{padding:clamp(1.6rem,5vw,3.2rem);border-radius:24px;background:var(--navy);color:#fff}
.brand{color:var(--gold);font:700 .85rem "Poppins",system-ui;letter-spacing:.09em;text-transform:uppercase}
.hero h1{margin:.6rem 0;font:700 clamp(2rem,6vw,3.6rem)/1.02 "Poppins",system-ui}
.status{display:inline-block;margin-top:.6rem;padding:.3rem .7rem;border:1px solid #7ca9e8;border-radius:999px;font-weight:700;font-size:.85rem}
article{margin-top:1.4rem;padding:clamp(1.2rem,3vw,2rem);border:1px solid var(--line);border-radius:20px;background:var(--surface)}
h2,h3{font-family:"Poppins",system-ui;color:var(--ink)}code{padding:.1rem .35rem;border-radius:5px;background:color-mix(in srgb,var(--blue) 12%,transparent)}
svg.brief-diagram{width:100%;height:auto}svg.brief-diagram rect{fill:var(--surface);stroke:var(--blue)}svg.brief-diagram line{stroke:var(--blue)}svg.brief-diagram text{fill:var(--ink);font-size:14px}
footer{padding:2rem 0;color:var(--muted);font-size:.86rem}
@media(prefers-color-scheme:dark){:root{--ink:#f7f9ff;--muted:#b8c5df;--canvas:#09142f;--surface:#102149;--line:#2d4473}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@media print{.skip{display:none}.wrap{width:100%;padding:0}article{break-inside:avoid}}`;

export function renderDocument(opts: {
  title: string;
  kicker: string;
  state: string;
  markdown: string;
}): string {
  const body = opts.markdown.replace(/^---\n[\s\S]*?\n---\n/, '');
  const heading = /^#\s+(.+)$/m.exec(body)?.[1] ?? opts.title;
  const content = markdownToHtml(body.replace(/^#\s+.+$/m, '').replace(/^##\s+(.+)$/gm, '### $1'));
  const json = JSON.stringify(opts.markdown).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="${CSP}" />
<meta name="generator" content="Frames OS" /><meta name="robots" content="noindex,nofollow" />
<title>${esc(heading)} · MetodologIA</title><style>${css}</style></head>
<body><a class="skip" href="#contenido">Saltar al contenido</a>
<main class="wrap" id="contenido" data-content-sha256="${sha256(opts.markdown)}">
<header class="hero"><div class="brand">${esc(opts.kicker)}</div><h1>${esc(heading)}</h1><span class="status">${esc(opts.state)}</span></header>
<article>${content}</article>
<footer>MetodologIA · Offline · Sin telemetría</footer></main>
<script id="canonical-markdown" type="application/json">${json}</script></body></html>
`;
}

// MD↔HTML parity: the HTML carries exactly this markdown and its sha.
export function documentParity(markdown: string, html: string): string[] {
  const issues: string[] = [];
  const m = /<script id="canonical-markdown" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m?.[1]) issues.push('HTML_CANONICAL_MARKDOWN_MISSING');
  else if (JSON.parse(m[1]) !== markdown) issues.push('HTML_CANONICAL_MARKDOWN_MISMATCH');
  if (!html.includes(`data-content-sha256="${sha256(markdown)}"`)) issues.push('HTML_CONTENT_HASH_MISMATCH');
  return issues;
}

// Offline document: CSP with no network, no remote src/href.
export function htmlCheck(c: string): string | null {
  if (!/^<!doctype html>/i.test(c)) return 'missing <!doctype html>';
  // The CSP meta may span lines and list attributes in any order (Frames' template does both).
  const meta = [...c.matchAll(/<meta\b[^>]*>/gis)]
    .map((m) => m[0])
    .find((t) => /http-equiv="Content-Security-Policy"/i.test(t));
  const policy = meta && /\bcontent="([^"]*)"/i.exec(meta)?.[1];
  if (!policy || !/(^|;)\s*default-src 'none'/.test(policy)) return "CSP default-src 'none' missing";
  const remote = /\s(src|href)="(https?:)?\/\//i.exec(c);
  return remote ? `remote reference: ${remote[0].trim()}` : null;
}
