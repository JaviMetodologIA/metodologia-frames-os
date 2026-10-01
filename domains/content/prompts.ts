// content.prompts: a typed prompt pack (prompts-v1) → an offline, interactive library.
// Filter by text or piece family, fill each prompt's {variables}, copy the result.
// Frames' P05 declared universal-prompts-v1 and had no code that produced a prompt.
import { z } from 'zod';
import type { TokensV1 } from '../deck/schema.ts';
import { copyCss, rootCss } from '../deck/runtime.ts';
import { renderMotion } from '../motion/custom.ts';
import { DEFS, esc } from '../motion/smil.ts';
import { spanishAccentSlips } from '../deck/gates.ts';
import { EVIDENCE_TAG } from '../deck/render.ts';

export const FAMILIES = ['image', 'miniclip', 'graphic', 'carousel', 'story', 'text'] as const;
const LABEL: Record<(typeof FAMILIES)[number], string> = {
  image: 'Imagen',
  miniclip: 'Miniclip',
  graphic: 'Gráfica',
  carousel: 'Carrusel',
  story: 'Historia',
  text: 'Texto',
};
const VAR = /\{([a-z][a-z0-9_]*)\}/g;

const Prompt = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    family: z.enum(FAMILIES),
    title: z.string().min(3).max(90),
    objective: z.string().min(10).max(300),
    prompt: z.string().min(20).max(4000),
    negative: z.string().max(1000).optional(),
    params: z.record(z.string(), z.string()).optional(),
    inputs: z.array(z.string()).max(10).optional(),
    expected: z.string().min(10).max(500),
    acceptance: z.string().min(10).max(500),
    tags: z.array(z.string().max(30)).max(8).optional(),
    // trainer: the playbook step this prompt serves ("<slide-id>#<n>") and its four levels.
    step: z
      .string()
      .regex(/^[a-z0-9-]+#\d+$/)
      .optional(),
    levels: z.array(z.string().min(10).max(1000)).length(4).optional(),
  })
  .strict();

export const PromptsV1 = z
  .object({
    schema: z.literal('prompts-v1'),
    meta: z
      .object({
        title: z.string().min(3),
        subtitle: z.string().default(''),
        lang: z.enum(['es', 'en', 'pt', 'fr']).default('es'),
      })
      .strict(),
    prompts: z.array(Prompt).min(1).max(60),
  })
  .strict()
  .superRefine((p, ctx) => {
    const ids = p.prompts.map((x) => x.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'prompt ids must be unique' });
  });
export type PromptsV1 = z.infer<typeof PromptsV1>;

export const varsOf = (s: string) => [...new Set([...s.matchAll(VAR)].map((m) => m[1]!))];

export function promptsGate(p: PromptsV1): string[] {
  const errs: string[] = [];
  const text = p.prompts
    .flatMap((x) => [x.title, x.objective, x.expected, x.acceptance, x.negative ?? ''])
    .join('\n');
  if (p.meta.lang === 'es') {
    const slips = spanishAccentSlips(`${p.meta.title}\n${p.meta.subtitle}\n${text}`);
    if (slips.length) errs.push(`tildes faltantes: ${slips.join(', ')}`);
  }
  for (const x of p.prompts) {
    if (/\{[^}]*[A-Z\s][^}]*\}/.test(x.prompt))
      errs.push(`${x.id}: variable con mayúsculas o espacios (usa {nombre_en_minúsculas})`);
    if (EVIDENCE_TAG.test(x.prompt)) errs.push(`${x.id}: etiqueta editorial dentro del prompt`);
    EVIDENCE_TAG.lastIndex = 0;
    if (/\/Users\/|[A-Z]:\\Users\\/.test(x.prompt)) errs.push(`${x.id}: ruta local en el prompt`);
  }
  return errs;
}

// A small hero: a prompt that becomes an image, a clip and a chart.
const HERO = renderMotion({
  dur: 10,
  freeze: 0.9,
  elements: [
    { type: 'glow', cx: 300, cy: 150, r: 220, fill: 'brand', opacity: 0.6 },
    { type: 'icon', name: 'message-square', x: 110, y: 150, size: 110, stroke: 'c2', draw: [0.02, 0.2] },
    { type: 'path', d: 'M180 150 H250', stroke: 'accent', width: 4, draw: [0.2, 0.3], arrow: true },
    { type: 'icon', name: 'image', x: 330, y: 80, size: 70, stroke: 'accent', draw: [0.3, 0.45] },
    { type: 'icon', name: 'clapperboard', x: 330, y: 160, size: 70, stroke: 'c4', draw: [0.38, 0.53] },
    { type: 'icon', name: 'chart-column', x: 330, y: 240, size: 70, stroke: 'c2', draw: [0.46, 0.61] },
    {
      type: 'icon',
      name: 'sparkles',
      x: 470,
      y: 90,
      size: 60,
      stroke: 'accent',
      origin: [470, 90],
      rotate: [
        [0, 0],
        [0.5, 12],
        [1, 0],
      ],
    },
  ],
});

const CSS = `html{background:var(--ink)}body{margin:0;background:var(--ink)}*{box-sizing:border-box}
.wrap{max-width:1100px;margin:0 auto;padding:clamp(20px,4vw,48px) clamp(16px,4vw,40px) 64px}
.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,420px);gap:24px;align-items:center;margin-bottom:28px}
.hero h1{font-size:clamp(30px,5vw,54px)}.hero svg{width:100%;height:auto;display:block}
.tools{position:sticky;top:0;z-index:3;display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px 0;background:color-mix(in srgb,var(--ink) 92%,transparent);backdrop-filter:blur(6px)}
#q{flex:1 1 260px;min-width:0;padding:12px 16px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--white);font:inherit;font-size:17px}
.chip{border:1px solid var(--line);background:none;color:var(--muted);border-radius:999px;padding:8px 14px;font:inherit;font-size:15px;cursor:pointer}.chip[aria-pressed=true]{background:var(--c2);color:var(--ink)}
#count{color:var(--muted);font-size:15px;margin-left:auto}
.card{margin:18px 0;padding:22px 24px;border:1px solid var(--line);border-radius:20px;background:color-mix(in srgb,var(--card) 85%,transparent);animation:rise .5s cubic-bezier(.2,.8,.2,1) both}
.card[hidden]{display:none}.card h2{margin:0 0 6px;font-size:24px}.fam{display:inline-block;margin-bottom:10px;padding:3px 10px;border-radius:999px;background:var(--brand);font-size:13px;letter-spacing:.08em;text-transform:uppercase}
.obj{color:var(--muted);margin:0 0 14px}.vars{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:0 0 12px}
.vars label{display:grid;gap:4px;font-size:14px;color:var(--c2)}.vars input{padding:9px 12px;border-radius:10px;border:1px solid var(--line);background:var(--ink);color:var(--white);font:inherit}
pre{white-space:pre-wrap;word-break:break-word;margin:0;padding:16px;border-radius:14px;background:var(--ink);border:1px solid var(--line);font:15px/1.5 ui-monospace,Menlo,monospace;color:var(--white)}
pre mark{background:color-mix(in srgb,var(--accent) 30%,transparent);color:var(--white);border-radius:4px;padding:0 2px}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px}.copy-btn{border:0;border-radius:999px;padding:10px 18px;background:var(--accent);color:var(--ink);font:inherit;font-weight:700;cursor:pointer}
.done{color:var(--ok);font-size:15px}details{margin-top:12px;color:var(--muted)}details summary{cursor:pointer;color:var(--c2)}dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 14px;margin:10px 0 0}dt{color:var(--c2)}dd{margin:0}
@keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@media(max-width:760px){.hero{grid-template-columns:minmax(0,1fr)}}
@media(prefers-reduced-motion:reduce){.card{animation:none}}
@media print{.tools,.vars,.copy-btn{display:none}.card{break-inside:avoid;animation:none}}`;

const JS = `(function(){var cards=[].slice.call(document.querySelectorAll('.card')),q=document.getElementById('q'),count=document.getElementById('count'),chips=[].slice.call(document.querySelectorAll('.chip')),fam='';
var K='frames:prompts:'+document.body.dataset.pack,st={};try{st=JSON.parse(localStorage.getItem(K)||'{}')||{}}catch(e){}
function save(){try{localStorage.setItem(K,JSON.stringify(st))}catch(e){}}
function filter(){var t=q.value.toLowerCase().trim(),n=0;cards.forEach(function(c){var ok=(!fam||c.dataset.family===fam)&&(!t||c.textContent.toLowerCase().indexOf(t)>=0);c.hidden=!ok;if(ok)n++});count.textContent=n+' / '+cards.length}
q.oninput=filter;chips.forEach(function(b){b.onclick=function(){fam=b.dataset.family===fam?'':b.dataset.family;chips.forEach(function(x){x.setAttribute('aria-pressed',String(x.dataset.family===fam))});filter()}});
if(matchMedia('(prefers-reduced-motion: reduce)').matches){var h=document.querySelector('.hero svg');if(h&&h.pauseAnimations){h.pauseAnimations();h.setCurrentTime(9)}}
cards.forEach(function(c){var tpl=c.dataset.tpl,pre=c.querySelector('pre'),ins=[].slice.call(c.querySelectorAll('.vars input'));
 function val(v){var i=c.querySelector('input[data-var="'+v+'"]');return i&&i.value.trim()}
 function fill(){return tpl.replace(/\\{([a-z][a-z0-9_]*)\\}/g,function(m,v){return val(v)||m})}
 function paint(){pre.textContent='';var re=/\\{([a-z][a-z0-9_]*)\\}/g,last=0,m;while((m=re.exec(tpl))){pre.appendChild(document.createTextNode(tpl.slice(last,m.index)));var mk=document.createElement('mark');mk.textContent=val(m[1])||m[0];pre.appendChild(mk);last=re.lastIndex}pre.appendChild(document.createTextNode(tpl.slice(last)))}
 ins.forEach(function(i){var k=c.id+':'+i.dataset.var;if(st[k])i.value=st[k];i.oninput=function(){st[k]=i.value;save();paint()}});paint();
 c.querySelector('.copy-btn').onclick=function(){var out=fill(),msg=c.querySelector('.done');
  function ok(){msg.textContent='Copiado.'}function fb(){var ta=document.createElement('textarea');ta.value=out;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');ok()}catch(e){msg.textContent='Selecciona y copia a mano.'}ta.remove()}
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(out).then(ok,fb);else fb()}});
filter()})();`;

export function renderLibrary(p: PromptsV1, t: TokensV1): string {
  const present = (s: string) => esc(s.replace(EVIDENCE_TAG, ''));
  const used = FAMILIES.filter((f) => p.prompts.some((x) => x.family === f));
  const cards = p.prompts.map((x) => {
    const vars = varsOf(x.prompt);
    const params = Object.entries(x.params ?? {});
    return `<section class="card" id="${x.id}" data-family="${x.family}" data-tpl="${esc(x.prompt)}"><span class="fam">${LABEL[x.family]}</span><h2>${present(x.title)}</h2><p class="obj">${present(x.objective)}</p>${
      vars.length
        ? `<div class="vars">${vars.map((v) => `<label>${esc(v.replace(/_/g, ' '))}<input data-var="${v}" autocomplete="off"></label>`).join('')}</div>`
        : ''
    }<pre aria-label="Prompt">${esc(x.prompt)}</pre><div class="row"><button type="button" class="copy-btn">Copiar prompt</button><span class="done" aria-live="polite"></span></div><details><summary>Criterios y parámetros</summary><dl>${
      x.negative ? `<dt>Evitar</dt><dd>${present(x.negative)}</dd>` : ''
    }${params.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}${
      x.inputs?.length ? `<dt>Insumos</dt><dd>${x.inputs.map(esc).join(', ')}</dd>` : ''
    }<dt>Salida esperada</dt><dd>${present(x.expected)}</dd><dt>Aceptación</dt><dd>${present(x.acceptance)}</dd></dl></details></section>`;
  });
  const slug = p.meta.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `<!doctype html>
<html lang="${p.meta.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<meta name="generator" content="Frames OS content.prompts">
<title>${present(p.meta.title)}</title>
<style>${rootCss(t)}
${copyCss(t)}
${CSS}</style>
</head>
<body data-pack="${slug}">
<main class="wrap">
<header class="hero"><div><p class="eyebrow">${esc(t.wordmark)} · Biblioteca de prompts</p><h1>${present(p.meta.title)}</h1><p class="sub">${present(p.meta.subtitle)}</p></div><svg class="scene" viewBox="0 0 560 300" role="img" aria-label="Un mensaje que se convierte en imagen, video y gráfica">${DEFS}${HERO}</svg></header>
<div class="tools" role="search"><input id="q" type="search" placeholder="Buscar en los prompts" aria-label="Buscar en los prompts">${used
    .map(
      (f) =>
        `<button type="button" class="chip" data-family="${f}" aria-pressed="false">${LABEL[f]}</button>`,
    )
    .join('')}<span id="count" aria-live="polite"></span></div>
${cards.join('\n')}
</main>
<script>${JS}</script>
</body>
</html>
`;
}
