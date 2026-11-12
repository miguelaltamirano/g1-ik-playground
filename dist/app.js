import {JOINTS, START, PRESETS} from './model.js';
import {forward, sub, norm} from './kinematics.js';
import {PythonRunner} from './python-runner.js';
import {toast} from './guide.js';
const $ = selector => document.querySelector(selector);
const editor = $('#code-editor');
const STORAGE = 'g1-python-playground-draft-v1';
let target = [...PRESETS.forward], q = [...START], result = null, frame = 0;
let busy = false, playing = false, viewer = null, runNumber = 0, animation = 0;
let selectedTemplate = 'dls', templateSource = '', draftTimer, runSource = '';
const templates = new Map();
const history = [];
const labels = ['Shoulder pitch','Shoulder roll','Shoulder yaw','Elbow','Wrist roll','Wrist pitch','Wrist yaw'];
$('#joint-angles').innerHTML = JOINTS.map((j,i) => `<div class="joint-item"><div><span>${labels[i]}</span><output id="angle-${i}">0.000</output></div><div class="joint-track"><div class="joint-fill" id="joint-${i}"></div></div></div>`).join('');

function draw() {
  viewer?.update(q, target, 'ready', frame);
  const error = norm(sub(target, forward(q).p)) * 1000;
  $('#error-value').textContent = error < .001 ? '< 0.001' : error.toFixed(error < 10 ? 3 : 1);
  $('#iteration-value').textContent = frame;
  $('#frame-total').textContent = result ? `/ ${result.updates}` : 'recorded';
  $('#frame-label').textContent = `${frame} / ${result?.updates || 0}`;
  $('#playback').value = frame;
  q.forEach((v,i) => {
    $(`#angle-${i}`).textContent = v.toFixed(3);
    $(`#joint-${i}`).style.width = `${100 * (v-JOINTS[i].lower)/(JOINTS[i].upper-JOINTS[i].lower)}%`;
  });
}
function motionButtons() {
  $('#solve-btn').textContent = playing ? 'Pause motion Ⅱ' : 'Replay motion ▶';
  $('#solve-btn').disabled = !result || busy || result.updates === 0;
  $('#step-btn').disabled = !result || busy || playing || frame >= result.updates;
  $('#playback').disabled = !result || busy;
}
function pause() { playing = false; cancelAnimationFrame(animation); motionButtons(); }
function showFrame(index) {
  if (!result) return;
  frame = Math.max(0, Math.min(result.updates, index));
  q = [...result.trajectory[frame]];
  draw(); motionButtons();
  $('#playback-note').textContent = frame === result.updates ? 'Final pose' : 'Recorded pose';
}
function play() {
  if (!result || !result.updates) return;
  if (playing) { pause(); return; }
  if (frame >= result.updates) showFrame(0);
  playing = true; motionButtons();
  // Long trajectories replay in at most about 15 seconds; the slider retains every pose.
  const stride = Math.max(1, Math.ceil(result.updates / 180));
  let previous = 0;
  function tick(t) {
    if (!playing) return;
    if (t-previous > 80) { showFrame(frame+stride); previous=t; }
    if (frame >= result.updates) { pause(); return; }
    animation = requestAnimationFrame(tick);
  }
  animation = requestAnimationFrame(tick);
}
$('#solve-btn').addEventListener('click', play);
$('#step-btn').addEventListener('click', () => showFrame(frame+1));
$('#playback').addEventListener('input', e => {pause(); showFrame(Number(e.target.value));});
function clearResult(note='Target changed. Run your code again.') {
  pause(); result=null; frame=0; q=[...START]; viewer?.setTrajectory(null); draw(); motionButtons();
  $('#solver-status').textContent='No run yet'; $('#solver-status').className='status ready';
  $('#solver-note').textContent=note; $('#run-summary').textContent=note;
  $('#playback').max=0; $('#playback-note').textContent='Run first';
  plot(null);
}
function syncSliders() {
  ['x','y','z'].forEach((axis,i) => {$(`#target-${axis}`).value=target[i];$(`#${axis}-output`).textContent=target[i].toFixed(3);});
}
for (const button of document.querySelectorAll('[data-preset]')) button.addEventListener('click', () => {
  if (busy) return;
  document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('selected',b===button));
  target=[...PRESETS[button.dataset.preset]];syncSliders();clearResult();
});
['x','y','z'].forEach((axis,i) => $(`#target-${axis}`).addEventListener('input', e => {
  target[i]=Number(e.target.value);$(`#${axis}-output`).textContent=target[i].toFixed(3);
  document.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('selected'));clearResult();
}));
$('#reset-btn').addEventListener('click', () => {
  if (busy) return;
  target=[...PRESETS.forward];syncSliders();
  document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('selected',b.dataset.preset==='forward'));
  clearResult('Robot and target reset. Your Python code is unchanged.');
});
function setBusy(value) {
  busy=value;$('#run-code').disabled=value;$('#stop-code').disabled=!value;
  $('#load-example').disabled=value;$('#reset-btn').disabled=value;
  document.querySelectorAll('[data-preset],.slider-row input').forEach(e=>e.disabled=value);
  motionButtons();
}
function appendOutput(text) {
  const out=$('#python-output');
  if (out.textContent.length<20000) out.textContent += String(text).slice(0,20000-out.textContent.length)+'\n';
  out.scrollTop=out.scrollHeight;
}
const runner=new PythonRunner(text=>$('#runtime-status').textContent=text,appendOutput);
$('#stop-code').addEventListener('click',()=>runner.stop());
$('#clear-output').addEventListener('click',()=>$('#python-output').textContent='');
async function runCode() {
  if (busy || editor.disabled) return;
  pause();clearResult('Running your Python solver…');setBusy(true);saveDraft();
  runSource=editor.value;
  $('#python-output').textContent='';$('#python-output').classList.remove('has-error');
  $('#solver-status').textContent='Running Python';$('#solver-status').className='status running';
  const started=performance.now();
  try {
    const next=await runner.run(runSource,target);
    // Validate the worker message before it reaches rendering or the DOM.
    if (!Array.isArray(next.trajectory) || !next.trajectory.length || next.trajectory.length>1001 ||
        next.trajectory.some(p=>!Array.isArray(p)||p.length!==7||p.some(x=>!Number.isFinite(x))) ||
        !Array.isArray(next.errors) || next.errors.length!==next.trajectory.length || next.errors.some(e=>!Number.isFinite(e)||e<0)) throw Error('The solver returned an invalid trajectory.');
    result=next;viewer?.setTrajectory(result.trajectory);runNumber++;$('#playback').max=result.updates;
    const text=result.converged?'Target reached':'Residual remains';
    $('#solver-status').textContent=text;$('#solver-status').className='status '+(result.converged?'converged':'stalled');
    const error=(result.error*1000).toFixed(3);
    $('#run-summary').textContent=`Run ${runNumber}: ${result.updates} recorded updates · ${error} mm final error · ${text.toLowerCase()}.`;
    $('#solver-note').textContent=result.converged?'Final error is below 0.1 mm. Replay or scrub through the accepted poses.':'The final error is above 0.1 mm. Inspect the code, target and error curve; this is not a successful reach.';
    $('#runtime-status').textContent=`Python finished in ${(result.elapsed_ms/1000).toFixed(2)} s. Runtime ready for your next run.`;
    appendOutput(`\nMeasured result: ${result.updates} recorded updates; final error ${error} mm.`);
    if (editor.value!==runSource) appendOutput('The editor changed during this run. Results use the code captured when Run was pressed.');
    history.unshift({number:runNumber,result,source:runSource});history.splice(5);renderHistory();plot(result);
    showFrame(result.updates);
  } catch (error) {
    const message=String(error.message || error);
    appendOutput(message);$('#python-output').classList.add('has-error');
    $('#runtime-status').textContent=message.startsWith('Stopped')?'Run stopped. Edit your code or run again.':'Run failed. Read the Python output, correct your code, and try again.';
    $('#solver-status').textContent=message.startsWith('Stopped')?'Stopped':'Code error';$('#solver-status').className='status stalled';
    $('#solver-note').textContent='No new motion was accepted. Your code is kept in the editor.';
    $('#run-summary').textContent='No completed result from this run.';
  } finally { setBusy(false); }
}
$('#run-code').addEventListener('click',runCode);

// SVG uses a logarithmic error axis so the last millimetre remains visible.
function plot(data) {
  const svg=$('#error-plot');
  while(svg.firstChild)svg.firstChild.remove();
  const node=(tag,attrs,text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));if(text!==undefined)n.textContent=text;svg.append(n);return n;};
  if (!data) {node('text',{x:300,y:105,'text-anchor':'middle',fill:'#82918a','font-size':13},'Run your code to see the error curve.');svg.setAttribute('aria-label','Position error by recorded update; no completed run');return;}
  const errors=data.errors.map(e=>Math.max(e*1000,1e-4));
  const min=Math.floor(Math.log10(Math.min(...errors,.1))),max=Math.ceil(Math.log10(Math.max(...errors,1)));
  const y=v=>165-(Math.log10(v)-min)/(max-min)*145;
  for(let exponent=min;exponent<=max;exponent++){
    const yy=y(10**exponent);node('line',{x1:58,y1:yy,x2:582,y2:yy,stroke:'#e2e8df'});
    node('text',{x:49,y:yy+4,'text-anchor':'end',fill:'#7a877d','font-size':10},`${10**exponent}`);
  }
  node('line',{x1:58,y1:y(.1),x2:582,y2:y(.1),stroke:'#c1844a','stroke-dasharray':'4 4'});
  node('text',{x:580,y:y(.1)-5,'text-anchor':'end',fill:'#ac713e','font-size':10},'0.1 mm goal');
  node('polyline',{points:errors.map((v,i)=>`${58+i/Math.max(1,errors.length-1)*524},${y(v)}`).join(' '),fill:'none',stroke:'#277661','stroke-width':2.2});
  node('text',{x:58,y:188,fill:'#7a877d','font-size':10},'0');
  node('text',{x:582,y:188,'text-anchor':'end',fill:'#7a877d','font-size':10},`${data.updates} updates`);
  svg.setAttribute('aria-label',`Position error over ${data.updates} recorded updates, from ${(data.errors[0]*1000).toFixed(3)} to ${(data.error*1000).toFixed(3)} millimetres.`);
}
function renderHistory(){
  const body=$('#run-history tbody');body.replaceChildren();
  for(const h of history){const row=document.createElement('tr');for(const text of [`#${h.number}`,h.result.target.map(v=>v.toFixed(3)).join(', '),String(h.result.updates),`${(h.result.error*1000).toFixed(3)} mm`,h.result.converged?'Reached':'Residual remains']){const td=document.createElement('td');td.textContent=text;row.append(td);}body.append(row);}
}
function updateLines(){
  $('#line-numbers').textContent=Array.from({length:editor.value.split('\n').length},(_,i)=>i+1).join('\n');
  $('#line-numbers').scrollTop=editor.scrollTop;
}
editor.addEventListener('scroll',()=>$('#line-numbers').scrollTop=editor.scrollTop);
function saveDraft(){
  try{localStorage.setItem(STORAGE,JSON.stringify({source:editor.value,template:selectedTemplate}));$('#draft-status').textContent='Draft saved in this browser';}
  catch{$('#draft-status').textContent='Storage unavailable — download your code to keep it.';}
}
editor.addEventListener('input',()=>{updateLines();$('#draft-status').textContent='Saving draft…';clearTimeout(draftTimer);draftTimer=setTimeout(saveDraft,350);});
editor.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();runCode();return;}
  if(e.key==='Tab'){
    e.preventDefault();editor.setRangeText('    ',editor.selectionStart,editor.selectionEnd,'end');editor.dispatchEvent(new Event('input'));return;
  }
  if(e.key==='Enter'){
    e.preventDefault();const before=editor.value.slice(0,editor.selectionStart);const line=before.split('\n').at(-1);const indent=(line.match(/^\s*/)?.[0]||'')+(line.trimEnd().endsWith(':')?'    ':'');editor.setRangeText('\n'+indent,editor.selectionStart,editor.selectionEnd,'end');editor.dispatchEvent(new Event('input'));
  }
});
window.addEventListener('pagehide',()=>{if(!editor.disabled)saveDraft();});
async function fetchText(path){const response=await fetch(new URL(path,import.meta.url));if(!response.ok)throw Error(`Could not load ${path}. Reload the page to retry.`);return response.text();}
async function loadExample(name,save=true){
  if(!templates.has(name))templates.set(name,await fetchText(`./python/${name}.py`));
  selectedTemplate=name;templateSource=templates.get(name);editor.value=templateSource;$('#example-select').value=name;updateLines();if(save)saveDraft();
}
async function replaceExample(){
  try{await loadExample($('#example-select').value);toast('Example loaded. Edit it, then run.');}
  catch(error){toast(error.message);}
}
$('#load-example').addEventListener('click',()=>{if(editor.value!==templateSource){$('#replace-dialog').showModal();}else replaceExample();});
$('#cancel-replace').addEventListener('click',()=>$('#replace-dialog').close());
$('#confirm-replace').addEventListener('click',()=>{$('#replace-dialog').close();replaceExample();});
$('#download-code').addEventListener('click',async()=>{
  try{
    const kernel=await fetchText('./python/kernel.py');
    const model={joints:JOINTS,start:START};
    const source='# Standalone G1 NumPy solver, exported from the browser playground.\n# Install dependency: python -m pip install numpy\n# This helper is not native Pinocchio.\n\n'+kernel+'\n\nMODEL = json.loads('+JSON.stringify(JSON.stringify(model))+')\nTARGET = '+JSON.stringify(target)+'\nSTUDENT_SOURCE = '+JSON.stringify(editor.value)+'\n\nif __name__ == "__main__":\n    result = run_student(STUDENT_SOURCE, {"target": TARGET}, MODEL)\n    print("Reached:", result["converged"], "updates:", result["updates"], "error (mm):", result["error"] * 1000)\n';
    const blob=new Blob([source],{type:'text/x-python'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='my_g1_solver.py';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Downloaded your code with NumPy helpers.');
  }catch(error){toast(error.message);}
});
async function startEditor(){
  try{
    await loadExample('dls',false);
    try{const saved=JSON.parse(localStorage.getItem(STORAGE)||'null');if(saved&&typeof saved.source==='string'&&saved.source.length<=50000){editor.value=saved.source;selectedTemplate=['dls','transpose','pseudoinverse'].includes(saved.template)?saved.template:'dls';$('#example-select').value=selectedTemplate;$('#draft-status').textContent='Your saved draft was restored';}else $('#draft-status').textContent='Example ready. Your changes will save locally.';}catch{$('#draft-status').textContent='Example ready. Download your code to keep a copy.';}
    editor.disabled=false;$('#run-code').disabled=false;$('#load-example').disabled=false;$('#download-code').disabled=false;updateLines();
  }catch(error){$('#draft-status').textContent=error.message;}
}
const viewerButtons=['focus-btn','camera-reset','zoom-in','zoom-out','show-frames','show-path'];
import('./viewer.js').then(m=>m.createViewer($('#robot-canvas'))).then(v=>{
  viewer=v;viewer.setTrajectory(result?.trajectory || null);draw();$('#viewer-loading').hidden=true;$('#robot-canvas').dataset.ready='true';viewerButtons.forEach(id=>$('#'+id).disabled=false);
}).catch(error=>{$('#viewer-loading').textContent='The 3D view could not load. Enable WebGL and reload; the Python editor and results still work.';$('#robot-canvas').dataset.ready='error';console.error(error);});
$('#focus-btn').addEventListener('click',()=>{const focus=viewer.focus();$('#focus-btn').setAttribute('aria-pressed',String(focus));$('#focus-btn').textContent=focus?'Show body ↙':'Focus arm ↗';});
$('#camera-reset').addEventListener('click',()=>{viewer.reset();$('#focus-btn').setAttribute('aria-pressed','false');$('#focus-btn').textContent='Focus arm ↗';});
$('#zoom-in').addEventListener('click',()=>viewer.zoom(.85));$('#zoom-out').addEventListener('click',()=>viewer.zoom(1.18));
$('#show-frames').addEventListener('change',e=>viewer.setFrames(e.target.checked));$('#show-path').addEventListener('change',e=>viewer.setPath(e.target.checked));
syncSliders();draw();startEditor();
