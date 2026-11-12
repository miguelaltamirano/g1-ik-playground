import {LESSONS} from './lessons.js';
const $=s=>document.querySelector(s);
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function highlight(s){const pattern=/(#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(from|import|as|for|in|if|else|return|def|while|break|continue|True|False|None|raise|with)\b|\b(\d+(?:\.\d+)?(?:e-?\d+)?)\b/g;let out='',last=0;for(const match of s.matchAll(pattern)){out+=esc(s.slice(last,match.index));const type=match[1]?'comment':match[2]?'string':match[3]?'keyword':'number';out+=`<span class="tok-${type}">${esc(match[0])}</span>`;last=match.index+match[0].length;}return out+esc(s.slice(last));}
let toastTimer;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2400);}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('Copied to clipboard');}catch{const t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.opacity='0';document.body.append(t);t.select();const ok=document.execCommand('copy');t.remove();toast(ok?'Copied to clipboard':'Select the code and copy it manually');}}
// Implementation guide.
let lessonIndex=0;
$('#lesson-nav').innerHTML=LESSONS.map((s,i)=>`<button data-lesson="${i}" ${i===0?'aria-current="step"':''}><span class="step-number">${String(i+1).padStart(2,'0')}</span><span><span class="step-title">${s.title}</span><span class="step-description">${s.label}</span></span></button>`).join('');
function setLesson(i){lessonIndex=i;const s=LESSONS[i];document.querySelectorAll('[data-lesson]').forEach((b,n)=>n===i?b.setAttribute('aria-current','step'):b.removeAttribute('aria-current'));$('#lesson-counter').textContent=`STEP ${String(i+1).padStart(2,'0')} / 06`;$('#function-name').textContent=s.function;$('#lesson-title').textContent=s.heading;$('#lesson-description').textContent=s.description;$('#lesson-code').innerHTML=highlight(s.code);$('#lesson-notes').innerHTML=s.notes.map(([h,p])=>`<div><h4>${esc(h)}</h4><p>${esc(p)}</p></div>`).join('');$('#lesson-check').textContent=s.check;$('#prev-step').disabled=i===0;$('#next-step').textContent=i===5?'Run it locally ↗':'Next step →';}
document.querySelectorAll('[data-lesson]').forEach(b=>b.addEventListener('click',()=>setLesson(Number(b.dataset.lesson))));
$('#prev-step').addEventListener('click',()=>{if(lessonIndex>0)setLesson(lessonIndex-1);});
$('#next-step').addEventListener('click',()=>{if(lessonIndex<5)setLesson(lessonIndex+1);else $('#setup').scrollIntoView({behavior:'smooth'});});
$('#copy-step').addEventListener('click',()=>copy(LESSONS[lessonIndex].code));
const setupCommands='conda env create -f environment.yml\nconda activate g1-left-arm\npython left_arm_ik.py';
$('#copy-setup').addEventListener('click',()=>copy(setupCommands));
for(const b of document.querySelectorAll('[data-os]'))b.addEventListener('click',()=>{document.querySelectorAll('[data-os]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));$('#os-note').textContent=b.dataset.os==='windows'?'Open Miniforge Prompt in the extracted g1-left-arm folder.':b.dataset.os==='mac'?'Open a Conda-enabled Terminal in the extracted folder. This script computes IK; it does not open the MuJoCo viewer.':'Open a Conda-enabled terminal in the extracted g1-left-arm folder.';});
let fullCode='';
$('#open-code').addEventListener('click',async()=>{try{if(!fullCode){const r=await fetch('downloads/left_arm_ik.py');if(!r.ok)throw Error('File unavailable');fullCode=await r.text();}$('#full-code').innerHTML=highlight(fullCode);$('#code-dialog').showModal();}catch{toast('Could not load the code. Download the example ZIP instead.');}});
$('#close-code').addEventListener('click',()=>$('#code-dialog').close());$('#copy-full').addEventListener('click',()=>copy(fullCode));$('#code-dialog').addEventListener('click',e=>{if(e.target===$('#code-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
setLesson(0);
export {toast};
