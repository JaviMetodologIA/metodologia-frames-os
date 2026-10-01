// Inline runtime of the deck: CSS generated from the brand tokens, and the player
// JS (keys, swipe, hash, progress, notes, auto-advance, pause, reduced motion,
// fullscreen). Rewritten from ai-native-sdlc/class/immersive.py; print mode is new.
import type { TokensV1 } from './schema.ts';

// Token variables every layout shares.
export function rootCss(t: TokensV1): string {
  const [c1, c2, c3, c4, c5] = t.accents;
  return `:root{--brand:${t.palette.brand};--accent:${t.palette.accent};--ink:${t.palette.ink};--surface:${t.palette.surface};--white:#ffffff;--ok:${t.ok};
--c1:${c1};--c2:${c2};--c3:${c3};--c4:${c4};--c5:${c5};
--muted:color-mix(in srgb,var(--c2) 75%,var(--white));--line:color-mix(in srgb,var(--c2) 38%,transparent);--card:color-mix(in srgb,var(--c1) 22%,var(--ink));--dim:color-mix(in srgb,var(--c2) 22%,var(--ink))}`;
}

// Typography of the copy (eyebrow, title, lists, columns, table, callouts): the same
// in the deck, the playbook and the workbook.
export function copyCss(t: TokensV1): string {
  return `body{font-family:${t.fonts.body};color:var(--white)}h1,h2,.eyebrow,.lockup b{font-family:${t.fonts.heading}}
.eyebrow{margin:0 0 18px;font-size:17px;letter-spacing:.2em;font-weight:700;color:var(--c2);text-transform:uppercase}
h1{margin:0 0 20px;font-size:60px;line-height:1.04;letter-spacing:-.02em;font-weight:700;max-width:1100px}
.copy[data-layout=left] h1{font-size:54px}.sub{margin:0 0 22px;font-size:25px;line-height:1.32;color:var(--muted);max-width:920px}
.list{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:12px}.list li{position:relative;padding:14px 18px 14px 44px;font-size:22px;line-height:1.3;background:color-mix(in srgb,var(--card) 80%,transparent);border:1px solid var(--line);border-radius:14px}
.list li::before{content:"";position:absolute;left:18px;top:22px;width:11px;height:11px;border-radius:50%;background:var(--c4)}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:6px}.col{padding:14px 18px;border-radius:14px;background:color-mix(in srgb,var(--card) 80%,transparent);border:1px solid var(--line)}
.col b{display:block;font-size:14px;letter-spacing:.14em;color:var(--c4);margin-bottom:6px;text-transform:uppercase}.col span{display:block;font-size:19px;line-height:1.35}
.tbl{width:100%;border-collapse:separate;border-spacing:0;margin-top:10px;font-size:20px;border-radius:14px;overflow:hidden}
.tbl th,.tbl td{padding:12px 18px;text-align:left;border-bottom:1px solid var(--line)}.tbl thead th{background:var(--brand);font-size:14px;letter-spacing:.16em;text-transform:uppercase}
.tbl tbody th{color:var(--c2);white-space:nowrap}.tbl tbody tr{background:color-mix(in srgb,var(--card) 75%,transparent)}
.lesson{margin:22px 0 0;padding:14px 18px;border-radius:14px;background:color-mix(in srgb,var(--accent) 16%,transparent);border:1px solid var(--accent);font-size:21px;font-weight:700}
.disclaimer{margin:22px 0 0;max-width:640px;font-size:17px;line-height:1.4;color:var(--muted)}
.takeaway{margin:24px 0 0;padding:4px 0 4px 18px;border-left:4px solid var(--accent);font-size:23px;font-style:italic}
.copy[data-layout=full] .takeaway{border-left:0;border-top:3px solid var(--accent);padding:14px 0 0}
.links{display:flex;gap:12px;margin-top:18px}.links a{padding:10px 16px;border-radius:999px;border:1px solid var(--line);color:var(--white);text-decoration:none;font-size:18px}
.slide.active .in{animation:rise .8s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i)*.32s)}
@keyframes rise{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
.lockup{display:flex;align-items:center;gap:18px;margin-bottom:34px}.lockup b{font-size:30px;letter-spacing:.04em;color:var(--accent)}.lockup img{height:84px}
:focus-visible{outline:3px solid var(--c4);outline-offset:3px}`;
}

// W×H is the stage: 1600×900 for a deck, 1080×1350 or 1080×1920 for social frames.
export function css(t: TokensV1, W = 1600, H = 900): string {
  return `${rootCss(t)}
${copyCss(t)}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--ink);overflow:hidden}
#shell{position:fixed;inset:0;display:grid;place-items:center}
#stage{position:relative;width:${W}px;height:${H}px;transform-origin:center;overflow:hidden;background:radial-gradient(70% 90% at 72% 45%,color-mix(in srgb,var(--brand) 55%,var(--ink)),var(--ink) 72%)}
.slide{position:absolute;inset:0;display:none}.slide.active{display:block}
.scene{position:absolute;inset:0;width:${W}px;height:${H}px}
.copy{position:absolute;z-index:2}.copy[data-layout=left]{left:96px;top:0;bottom:0;width:680px;display:flex;flex-direction:column;justify-content:center}
.copy[data-layout=right]{left:824px;top:0;bottom:0;width:680px;display:flex;flex-direction:column;justify-content:center}
.copy[data-layout=top]{left:96px;right:96px;top:84px}.copy[data-layout=full]{left:160px;right:160px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
#brand{position:absolute;z-index:5;left:96px;bottom:34px;font-size:13px;letter-spacing:.22em;color:var(--muted);opacity:.8}body.cover #brand{opacity:0}#brand .mark{display:block;height:22px;width:auto}
#num{position:absolute;z-index:5;right:96px;bottom:34px;font-size:15px;letter-spacing:.18em;color:var(--muted)}#num b{color:var(--white)}
#prog{position:absolute;z-index:5;left:0;right:0;bottom:0;height:5px;background:color-mix(in srgb,var(--c2) 18%,transparent)}#progfill{height:100%;width:0;background:linear-gradient(90deg,var(--brand),var(--accent));transition:width .5s}
#help{position:fixed;z-index:9;left:50%;bottom:18px;transform:translateX(-50%);padding:9px 16px;border-radius:999px;background:color-mix(in srgb,var(--ink) 85%,transparent);border:1px solid var(--line);font-size:13px;color:var(--muted);opacity:0;transition:opacity .6s;pointer-events:none}
body.hint #help{opacity:1}#auto{position:fixed;z-index:9;top:16px;right:18px;padding:6px 12px;border-radius:999px;background:var(--accent);color:var(--ink);font-size:12px;letter-spacing:.14em;display:none}body.auto #auto{display:block}
#overlay{position:fixed;z-index:10;inset:auto 24px 24px 24px;max-height:40vh;overflow:auto;padding:18px 22px;border-radius:16px;background:color-mix(in srgb,var(--ink) 94%,transparent);border:1px solid var(--line);font-size:17px;line-height:1.45;display:none}body.notes #overlay{display:block}
body.paused .in{animation-play-state:paused}body.reduced .in{animation:none!important}body.reduced *{transition:none!important}
::view-transition-old(root),::view-transition-new(root){animation-duration:.6s;animation-timing-function:cubic-bezier(.2,.8,.2,1);animation-fill-mode:both}
html[data-tr=fade]::view-transition-old(root){animation-name:vt-out}html[data-tr=fade]::view-transition-new(root){animation-name:vt-in}
html[data-tr=push][data-dir=f]::view-transition-old(root){animation-name:vt-push-out}html[data-tr=push][data-dir=f]::view-transition-new(root){animation-name:vt-push-in}
html[data-tr=push][data-dir=b]::view-transition-old(root){animation-name:vt-push-in;animation-direction:reverse}html[data-tr=push][data-dir=b]::view-transition-new(root){animation-name:vt-push-out;animation-direction:reverse}
html[data-tr=zoom]::view-transition-old(root){animation-name:vt-zoom-out}html[data-tr=zoom]::view-transition-new(root){animation-name:vt-zoom-in}
html[data-tr=morph] .slide.active h1{view-transition-name:vt-title}html[data-tr=morph] .slide.active svg.scene{view-transition-name:vt-scene}
html[data-tr=morph]::view-transition-group(vt-title){animation-duration:.7s}
@keyframes vt-out{to{opacity:0}}@keyframes vt-in{from{opacity:0}}
@keyframes vt-push-out{to{transform:translateX(-12%);opacity:0}}@keyframes vt-push-in{from{transform:translateX(12%);opacity:0}}
@keyframes vt-zoom-out{to{transform:scale(1.08);opacity:0}}@keyframes vt-zoom-in{from{transform:scale(.92);opacity:0}}
@media print{html,body{height:auto;overflow:visible;background:var(--ink)}#shell{position:static;display:block}#stage{transform:none!important;width:${W}px;height:auto;overflow:visible;background:none}
.slide{display:block!important;position:relative;width:${W}px;height:${H}px;break-after:page;background:radial-gradient(70% 90% at 72% 45%,color-mix(in srgb,var(--brand) 55%,var(--ink)),var(--ink) 72%)}
.in{animation:none!important;opacity:1!important}#help,#auto,#overlay,#prog,#num,#brand{display:none!important}@page{size:${W}px ${H}px;margin:0}}`;
}

export const js = (W = 1600, H = 900) => `(function(){
var S=[].slice.call(document.querySelectorAll('.slide')),n=S.length,cur=0,timer=null,b=document.body,AUTO=false;
function fit(){var s=Math.min(innerWidth/${W},innerHeight/${H});document.getElementById('stage').style.transform='scale('+s+')'}
addEventListener('resize',fit);fit();
function svgOf(i){return S[i].querySelector('svg.scene')}
function run(i){var g=svgOf(i);if(!g||!g.setCurrentTime)return;g.setCurrentTime(0);
 if(b.classList.contains('reduced')){g.setCurrentTime(+S[i].dataset.dur*+S[i].dataset.freeze);g.pauseAnimations()}
 else if(b.classList.contains('paused'))g.pauseAnimations();else g.unpauseAnimations()}
// Slide change through the View Transitions API: the entering slide's data-tr picks
// the effect; no API, reduced motion, the first paint or 'none' change instantly.
var painted=false;
// cur moves at once, so keys pressed during a transition count from the target slide.
function go(i){var k=Math.max(0,Math.min(n-1,i)),tr=S[k].dataset.tr||'none',h=document.documentElement,from=cur;cur=k;
 if(painted&&k!==from&&tr!=='none'&&document.startViewTransition&&!b.classList.contains('reduced')){h.dataset.tr=tr;h.dataset.dir=k>from?'f':'b';
  document.startViewTransition(function(){show(k)}).finished.then(function(){delete h.dataset.tr},function(){})}
 else show(k);painted=true}
function show(i){S.forEach(function(s,k){s.classList.toggle('active',k===i);s.setAttribute('aria-hidden',k===i?'false':'true');var g=svgOf(k);if(g&&k!==i&&g.pauseAnimations)g.pauseAnimations()});
 run(i);b.classList.toggle('cover',i===0);
 document.getElementById('num').innerHTML=(S[i].dataset.act||'')+' · <b>'+String(i+1).padStart(2,'0')+'</b> / '+n;
 document.getElementById('progfill').style.width=((i+1)/n*100)+'%';
 document.getElementById('overlay').textContent=S[i].dataset.notes||'Sin notas.';
 try{history.replaceState(null,'','#'+S[i].id)}catch(e){}
 schedule()}
function schedule(){clearTimeout(timer);if(AUTO&&!b.classList.contains('paused'))timer=setTimeout(function(){go(cur+1<n?cur+1:0)},(+S[cur].dataset.hold||14)*1000)}
function next(){go(cur+1)}function prev(){go(cur-1)}
function byHash(){var h=decodeURIComponent(location.hash.slice(1));for(var k=0;k<n;k++)if(S[k].id===h)return k;var m=/^\\d+$/.exec(h);return m?+h-1:0}
addEventListener('keydown',function(e){var k=e.key;
 if(k==='ArrowRight'||k==='PageDown'||k===' '){e.preventDefault();next()}else if(k==='ArrowLeft'||k==='PageUp')prev();
 else if(k==='Home')go(0);else if(k==='End')go(n-1);
 else if(k==='p'||k==='P'){b.classList.toggle('paused');run(cur);schedule()}
 else if(k==='m'||k==='M'){b.classList.toggle('reduced');run(cur)}
 else if(k==='a'||k==='A'){AUTO=!AUTO;b.classList.toggle('auto',AUTO);schedule()}
 else if(k==='n'||k==='N')b.classList.toggle('notes');
 else if(k==='f'||k==='F'){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen()}
 else if(k==='Escape')b.classList.remove('notes')});
var x0=null;addEventListener('touchstart',function(e){x0=e.changedTouches[0].clientX},{passive:true});
addEventListener('touchend',function(e){if(x0===null)return;var dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>50)(dx<0?next:prev)();x0=null},{passive:true});
addEventListener('click',function(e){if(e.target.closest('#overlay,a,.langs'))return;(e.clientX>innerWidth/2?next:prev)()});
addEventListener('hashchange',function(){go(byHash())});
// A language change rewrites data-notes and data-act: repaint the HUD and the notes.
document.addEventListener('langchange',function(){show(cur)});
if(matchMedia('(prefers-reduced-motion: reduce)').matches)b.classList.add('reduced');
go(byHash());
b.classList.add('hint');setTimeout(function(){b.classList.remove('hint')},5000);
})();`;
