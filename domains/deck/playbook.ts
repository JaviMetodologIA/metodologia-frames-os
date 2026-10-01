// The same deck-v1 as a scroll page: playbook (read) and workbook (read and do).
// Spec: ai-native-sdlc/class/playbook.py (variant B, immersive): sections revealed on
// scroll, scenes paused off screen, parallax sky, scroll-spy by act, progress bar.
// Same copy() as the deck, so the visible text cannot drift between layouts.
import type { DeckV1, Interactive, Slide, TokensV1 } from './schema.ts';
import { copy, layoutOf, lockupOf, present, sceneSvg } from './render.ts';
import { copyCss, rootCss } from './runtime.ts';
import { esc, stars } from '../motion/smil.ts';

// Where each layout draws its scene, so the figure shows the drawing, not the empty
// half the deck keeps for the copy.
const CROP: Record<string, string> = {
  left: '800 0 800 900',
  right: '0 0 800 900',
  top: '0 250 1600 650',
  full: '0 0 1600 900',
};

function widget(s: Slide, w: Interactive): string {
  const id = `w-${s.id}`;
  switch (w.kind) {
    case 'checklist':
      return `<fieldset class="w" data-w="${id}" data-kind="checklist"><legend>${present(w.title)}</legend>${w.items
        .map((t, i) => `<label><input type="checkbox" data-i="${i}"> <span>${present(t)}</span></label>`)
        .join('')}<p class="count" aria-live="polite"></p></fieldset>`;
    case 'rubric':
      return `<fieldset class="w" data-w="${id}" data-kind="rubric" data-max="${w.rows.length * (w.scale.length - 1)}"><legend>${present(w.title)}</legend><table class="rub"><thead><tr><th></th>${w.scale
        .map((c) => `<th>${present(c)}</th>`)
        .join('')}</tr></thead><tbody>${w.rows
        .map(
          (r, i) =>
            `<tr><th>${present(r)}</th>${w.scale
              .map(
                (c, j) =>
                  `<td><input type="radio" name="${id}-${i}" data-i="${i}" value="${j}" aria-label="${present(`${r}: ${c}`)}"></td>`,
              )
              .join('')}</tr>`,
        )
        .join('')}</tbody></table><p class="count" aria-live="polite"></p></fieldset>`;
    case 'quiz':
      return `<fieldset class="w" data-w="${id}" data-kind="quiz" data-answer="${w.answer}"><legend>${present(w.question)}</legend>${w.options
        .map(
          (o, i) =>
            `<label><input type="radio" name="${id}" value="${i}"> <span>${present(o)}</span></label>`,
        )
        .join(
          '',
        )}<button type="button" class="check">Comprobar</button><p class="fb ok" hidden>Correcto.</p><p class="fb ko" hidden>Todavía no: vuelve a intentarlo.</p><p class="explain" hidden>${present(w.explain)}</p></fieldset>`;
    case 'notes':
      return `<div class="w" data-w="${id}" data-kind="notes"><label for="${id}">${present(w.prompt)}</label><textarea id="${id}" rows="4"></textarea></div>`;
  }
}

const CSS = `html{scroll-behavior:smooth;background:var(--ink)}body{margin:0;background:var(--ink);overflow-x:hidden}*{box-sizing:border-box}
#bar{position:sticky;top:0;z-index:5;display:flex;gap:16px;align-items:center;padding:10px clamp(16px,4vw,48px);background:color-mix(in srgb,var(--ink) 88%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
#bar .mark{font-size:13px;letter-spacing:.2em;color:var(--muted);white-space:nowrap}
#acts{display:flex;gap:6px;overflow-x:auto;flex:1;scrollbar-width:none}#acts a{color:var(--muted);text-decoration:none;padding:6px 12px;border-radius:999px;font-size:14px;white-space:nowrap}
#acts a[aria-current=true]{background:var(--brand);color:var(--white)}
#motion{border:1px solid var(--line);background:none;color:var(--muted);border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}#motion[aria-pressed=true]{color:var(--ink);background:var(--c2)}
#progress{position:fixed;top:0;left:0;right:0;height:3px;z-index:6}#progress i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--brand),var(--accent))}
#sky{position:fixed;left:0;top:0;width:100%;height:160vh;z-index:0;pointer-events:none;will-change:transform}#sky svg{width:100%;height:100%}
main{position:relative;z-index:1;max-width:1280px;margin:0 auto;padding:0 clamp(16px,4vw,48px)}
.sec{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(24px,4vw,64px);align-items:center;min-height:78vh;padding:12vh 0;border-top:1px solid var(--line);scroll-margin-top:64px}
.sec:first-child{border-top:0;min-height:88vh}.sec[data-layout=top],.sec[data-layout=full]{grid-template-columns:minmax(0,1fr)}.sec[data-layout=right] .fig{order:-1}
.sec h1{font-size:clamp(30px,4.2vw,54px)}.sec .sub{font-size:clamp(18px,1.8vw,24px)}.sec .list li{font-size:clamp(16px,1.5vw,21px)}
.fig{margin:0;border-radius:24px;overflow:hidden;border:1px solid var(--line);aspect-ratio:8/9;background:radial-gradient(70% 90% at 50% 45%,color-mix(in srgb,var(--brand) 55%,var(--ink)),var(--ink) 72%)}
.sec[data-layout=top] .fig{aspect-ratio:16/6.5}.sec[data-layout=full] .fig{aspect-ratio:16/9}.fig svg{display:block;width:100%;height:100%}
.sec .in,.fig{opacity:0;transform:translateY(22px);transition:opacity .7s cubic-bezier(.2,.8,.2,1),transform .7s cubic-bezier(.2,.8,.2,1)}.sec .in{transition-delay:calc(var(--i)*.1s)}
.sec.on .in,.sec.on .fig{opacity:1;transform:none}
body.reduced .in,body.reduced .fig{opacity:1!important;transform:none!important;transition:none!important}
.w{grid-column:1/-1;margin:8px 0 0;padding:20px 22px;border:1px solid var(--line);border-radius:18px;background:color-mix(in srgb,var(--card) 85%,transparent);font-size:18px;min-width:0}
.w legend{padding:0 8px;font-weight:700;font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:var(--c4)}
.w label{display:flex;gap:12px;align-items:flex-start;padding:8px 0;line-height:1.35;cursor:pointer}.w input{width:20px;height:20px;accent-color:var(--accent);flex:none;margin-top:2px}
.w .count,.w .fb,.w .explain{margin:12px 0 0;color:var(--muted)}.w .fb.ok{color:var(--ok)}.w .fb.ko{color:var(--c3)}
.w button,#export{margin-top:12px;border:0;border-radius:999px;padding:10px 18px;background:var(--accent);color:var(--ink);font:inherit;font-weight:700;cursor:pointer}
.w textarea{width:100%;margin-top:8px;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--ink);color:var(--white);font:inherit;resize:vertical}
.rub{width:100%;border-collapse:collapse;font-size:16px;display:block;overflow-x:auto}.rub th,.rub td{padding:8px 10px;text-align:center;border-bottom:1px solid var(--line)}.rub tbody th{text-align:left;font-weight:400}
footer{position:relative;z-index:1;text-align:center;padding:48px 16px 64px;color:var(--muted);font-size:14px}
@media(max-width:820px){.sec{grid-template-columns:minmax(0,1fr);min-height:0;padding:64px 0}.sec[data-layout=right] .fig{order:0}.fig{aspect-ratio:16/11}#bar .mark{display:none}}
@media print{#bar,#progress,#sky,#export{display:none!important}.sec{break-inside:avoid;min-height:0}.in,.fig{opacity:1!important;transform:none!important}}`;

const JS = `(function(){
var S=[].slice.call(document.querySelectorAll('.sec')),b=document.body,R=matchMedia('(prefers-reduced-motion: reduce)').matches;
function svg(s){return s.querySelector('svg.scene')}
function freeze(s){var g=svg(s);if(g&&g.setCurrentTime){g.pauseAnimations();g.setCurrentTime(+s.dataset.dur*+s.dataset.freeze)}}
function still(){b.classList.add('reduced');S.forEach(function(s){s.classList.add('on');freeze(s)})}
S.forEach(function(s){var g=svg(s);if(g&&g.pauseAnimations)g.pauseAnimations()});
if(R)still();
// Reveal on entry; a scene plays only while on screen and restarts the first time.
var io=new IntersectionObserver(function(es){es.forEach(function(x){var s=x.target,g=svg(s);if(R)return;
 if(x.isIntersecting){if(!s.classList.contains('on')){s.classList.add('on');if(g)g.setCurrentTime(0)}if(g)g.unpauseAnimations()}else if(g)g.pauseAnimations()})},{threshold:.15});
S.forEach(function(s){io.observe(s)});
var links=[].slice.call(document.querySelectorAll('#acts a')),bar=document.querySelector('#progress i'),sky=document.getElementById('sky'),busy=false;
function frame(){busy=false;var h=document.documentElement,y=h.scrollTop,max=h.scrollHeight-h.clientHeight,act='';
 bar.style.width=(max>0?y/max*100:0)+'%';if(!R)sky.style.transform='translate3d(0,'+(-y*.15)+'px,0)';
 for(var i=0;i<S.length;i++)if(S[i].getBoundingClientRect().top<innerHeight*.4)act=S[i].dataset.act;
 links.forEach(function(a){a.setAttribute('aria-current',String(a.dataset.act===act))})}
addEventListener('scroll',function(){if(!busy){busy=true;requestAnimationFrame(frame)}},{passive:true});frame();
var mb=document.getElementById('motion');mb.setAttribute('aria-pressed',String(R));
mb.onclick=function(){R=!R;mb.setAttribute('aria-pressed',String(R));if(R){still();sky.style.transform='none'}else{b.classList.remove('reduced');S.forEach(function(s){var g=svg(s);if(g)g.unpauseAnimations()})}};
// Workbook: state in this browser only; the page works the same when storage throws.
var K=b.dataset.store,st={};if(!K)return;try{st=JSON.parse(localStorage.getItem(K)||'{}')||{}}catch(e){}
function save(){try{localStorage.setItem(K,JSON.stringify(st))}catch(e){}}
[].forEach.call(document.querySelectorAll('[data-w]'),function(w){var id=w.dataset.w,k=w.dataset.kind,out=w.querySelector('.count');
 if(k==='checklist'){var bx=[].slice.call(w.querySelectorAll('input'));
  function paint(){var n=bx.filter(function(x){return x.checked}).length;out.textContent=n+' / '+bx.length}
  bx.forEach(function(x){x.checked=!!st[id+':'+x.dataset.i];x.onchange=function(){st[id+':'+x.dataset.i]=x.checked;save();paint()}});paint()}
 if(k==='rubric'){var rs=[].slice.call(w.querySelectorAll('input'));
  function score(){var sum=0,done=0;rs.forEach(function(x){if(x.checked){sum+=+x.value;done++}});out.textContent=done?sum+' / '+w.dataset.max:''}
  rs.forEach(function(x){if(st[id+':'+x.dataset.i]===+x.value)x.checked=true;x.onchange=function(){st[id+':'+x.dataset.i]=+x.value;save();score()}});score()}
 if(k==='quiz'){var os=[].slice.call(w.querySelectorAll('input'));
  function judge(){var c=os.filter(function(x){return x.checked})[0];if(!c)return;var ok=+c.value===+w.dataset.answer;
   w.querySelector('.fb.ok').hidden=!ok;w.querySelector('.fb.ko').hidden=ok;w.querySelector('.explain').hidden=!ok}
  os.forEach(function(x){if(st[id]===+x.value)x.checked=true;x.onchange=function(){st[id]=+x.value;save()}});
  w.querySelector('.check').onclick=judge;if(st[id]!==undefined)judge()}
 if(k==='notes'){var ta=w.querySelector('textarea');ta.value=st[id]||'';ta.oninput=function(){st[id]=ta.value;save()}}});
var ex=document.getElementById('export');if(ex)ex.onclick=function(){var md='# '+document.title+'\\n';
 [].forEach.call(document.querySelectorAll('[data-w]'),function(w){var k=w.dataset.kind,h=w.querySelector('legend,label');md+='\\n## '+(h?h.textContent:'')+'\\n';
  if(k==='checklist')[].forEach.call(w.querySelectorAll('label'),function(l){md+='- ['+(l.querySelector('input').checked?'x':' ')+'] '+l.textContent.trim()+'\\n'});
  if(k==='rubric'||k==='quiz'){var c=w.querySelector('.count');md+=(c&&c.textContent?c.textContent:[].map.call(w.querySelectorAll('input:checked'),function(x){return x.parentNode.textContent.trim()}).join(', '))+'\\n'}
  if(k==='notes')md+=w.querySelector('textarea').value+'\\n'});
 var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([md],{type:'text/markdown'}));a.download='notas.md';document.body.appendChild(a);a.click();a.remove()};
})();`;

export function renderPlaybook(deck: DeckV1, t: TokensV1, opts: { workbook?: boolean } = {}): string {
  const workbook = !!opts.workbook;
  const acts = deck.acts.map((a) => {
    const first = deck.slides.find((s) => s.act === a.id)!;
    return `<a href="#${first.id}" data-act="${esc(a.id)}">${present(a.title)}</a>`;
  });
  const secs = deck.slides.map((s, k) => {
    const layout = k === 0 ? 'left' : layoutOf(s);
    const { svg, dur, freeze } = sceneSvg(s, t, CROP[layout]);
    const w = workbook && s.interactive ? widget(s, s.interactive) : '';
    return `<section class="sec" id="${s.id}" data-act="${esc(s.act)}" data-layout="${layout}" data-dur="${dur}" data-freeze="${freeze}">${copy(s, layout, k === 0 ? lockupOf(t) : '')}<figure class="fig">${svg}</figure>${w}</section>`;
  });
  const slug = deck.meta.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `<!doctype html>
<html lang="${deck.meta.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<meta name="generator" content="Frames OS deck.immersive · ${workbook ? 'workbook' : 'playbook'}">
<title>${present(deck.meta.title)}</title>
<meta name="description" content="${present(deck.meta.subtitle)}">
<style>${rootCss(t)}
${copyCss(t)}
${CSS}</style>
</head>
<body${workbook ? ` data-store="frames:${slug}:workbook"` : ''}>
<div id="progress"><i></i></div>
<div id="sky" aria-hidden="true"><svg viewBox="0 0 1600 1440" preserveAspectRatio="xMidYMid slice">${stars(deck.meta.title, 60)}</svg></div>
<header id="bar"><b class="mark">${esc(t.wordmark)}</b><nav id="acts" aria-label="Actos">${acts.join('')}</nav><button type="button" id="motion" aria-pressed="false">Menos movimiento</button></header>
<main>
${secs.join('\n')}
</main>
<footer>${workbook ? '<button type="button" id="export">Exportar mis respuestas (.md)</button>' : ''}<p>${esc(t.wordmark)} · ${present(deck.meta.title)}</p></footer>
<script>${JS}</script>
</body>
</html>
`;
}
