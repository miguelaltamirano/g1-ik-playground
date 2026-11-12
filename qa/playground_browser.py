"""Local browser QA through Chrome DevTools, using an isolated Chrome profile."""
import base64,json,time,urllib.request
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]
BASE='http://127.0.0.1:8770'
targets=json.load(urllib.request.urlopen('http://127.0.0.1:9339/json'))
target=next(x for x in targets if x['type']=='page')
ws=websocket.create_connection(target['webSocketDebuggerUrl'],origin='http://localhost:9339',timeout=60)
next_id=0; errors=[]
def call(method,params=None):
 global next_id
 next_id+=1;ident=next_id;ws.send(json.dumps({'id':ident,'method':method,'params':params or {}}))
 while True:
  msg=json.loads(ws.recv())
  if msg.get('method')=='Runtime.exceptionThrown':errors.append(msg['params'])
  if msg.get('id')==ident:
   if 'error' in msg:raise RuntimeError(msg['error'])
   return msg.get('result',{})
def js(expression):
 r=call('Runtime.evaluate',{'expression':expression,'returnByValue':True,'awaitPromise':True,'userGesture':True})
 if 'exceptionDetails' in r:raise RuntimeError(r['exceptionDetails'])
 return r.get('result',{}).get('value')
def wait(expression,timeout=90):
 until=time.monotonic()+timeout
 while time.monotonic()<until:
  if js(expression):return
  time.sleep(.1)
 raise AssertionError('Timed out: '+expression)
def shot(name):
 data=call('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False})['data']
 (ROOT/'qa'/name).write_bytes(base64.b64decode(data))
call('Page.enable');call('Runtime.enable')
call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1100,'deviceScaleFactor':1,'mobile':False})
call('Page.navigate',{'url':BASE})
wait("document.querySelector('#code-editor') && !document.querySelector('#code-editor').disabled")
wait("document.querySelector('#robot-canvas').dataset.ready==='true'")
assert js('document.documentElement.scrollWidth<=innerWidth')
def set_code(code):
 js('document.querySelector("#code-editor").value='+json.dumps(code)+';document.querySelector("#code-editor").dispatchEvent(new Event("input"))')
def run():
 js("document.querySelector('#run-code').click()")
 wait("!document.querySelector('#run-code').disabled",120)
def reached():
 return js("document.querySelector('#solver-status').textContent")=='Target reached'
def check_example(name):
 js(f"document.querySelector('#example-select').value='{name}';document.querySelector('#load-example').click()")
 if js("document.querySelector('#replace-dialog').open"):js("document.querySelector('#confirm-replace').click()")
 wait(f"document.querySelector('#code-editor').value.includes({json.dumps({'dls':'damping = 0.03','pseudoinverse':'np.linalg.pinv','transpose':'gain = 4.0'}[name])})")
check_example('dls')
default=js("document.querySelector('#code-editor').value")
shot('playground-desktop.png')
run()
assert reached(),js("document.querySelector('#python-output').textContent")
assert js("document.querySelector('#iteration-value').textContent")=='9'
assert abs(float(js("document.querySelector('#error-value').textContent"))-.069)<.002
assert js("document.querySelectorAll('#error-plot polyline').length")==1
print('PASS: real browser Python DLS, nine updates and 0.069 mm.',flush=True)
js("document.querySelector('#solve-btn').click()")
wait("document.querySelector('#iteration-value').textContent==='9' && document.querySelector('#solve-btn').textContent.includes('Replay')")
js("document.querySelector('#playback').value=0;document.querySelector('#playback').dispatchEvent(new Event('input'));document.querySelector('#step-btn').click()")
assert js("document.querySelector('#iteration-value').textContent")=='1'
set_code(default.replace('damping = 0.03','damping = 0.10'))
run();assert reached()
assert js("document.querySelector('#iteration-value').textContent")!='9'
assert js("document.querySelectorAll('#run-history tbody tr').length")==2
print('PASS: editing Python changes the measured result; replay, scrub and history.',flush=True)
set_code('def solve_ik(q, target)\n    return q')
run();assert 'SyntaxError' in js("document.querySelector('#python-output').textContent")
set_code('def solve_ik(q, target):\n    return np.full(7, np.nan)')
run();assert 'finite' in js("document.querySelector('#python-output').textContent")
set_code('def solve_ik(q, target):\n    return np.full(7, 100.0)')
run();assert 'limit' in js("document.querySelector('#python-output').textContent")
set_code('def solve_ik(q, target):\n    while True:\n        pass')
js("document.querySelector('#run-code').click()")
wait("document.querySelector('#runtime-status').textContent==='Running your Python solver…'")
js("document.querySelector('#stop-code').click()")
wait("!document.querySelector('#run-code').disabled")
assert js("document.querySelector('#solver-status').textContent")=='Stopped'
set_code(default);run();assert reached()
print('PASS: syntax, NaN and joint-bound errors; infinite-loop Stop; runtime recovery.',flush=True)
check_example('pseudoinverse');run();assert reached()
check_example('transpose');run()
assert js("document.querySelector('#solver-status').textContent") in ['Target reached','Residual remains']
check_example('dls')
js("document.querySelector('[data-preset=far]').click()")
assert js("document.querySelector('#solve-btn').disabled")
run();assert js("document.querySelector('#solver-status').textContent")=='Residual remains'
js("document.querySelector('#reset-btn').click()")
assert 'damping = 0.03' in js("document.querySelector('#code-editor').value")
set_code(default+'\n# My classroom draft\n')
time.sleep(.5)
call('Page.reload')
wait("document.querySelector('#code-editor') && !document.querySelector('#code-editor').disabled")
assert 'My classroom draft' in js("document.querySelector('#code-editor').value")
print('PASS: other solver examples, unreachable target, reset and saved-draft restoration.',flush=True)
call('Browser.setDownloadBehavior',{'behavior':'deny'})
js("window.__createURL=URL.createObjectURL;URL.createObjectURL=function(blob){window.__downloadBlob=blob;return window.__createURL(blob)};document.querySelector('#download-code').click()")
wait('!!window.__downloadBlob')
export=js('window.__downloadBlob.text()')
assert 'def run_student' in export and 'My classroom draft' in export
compile(export,'exported_student_solver.py','exec')
exec(export,{'__name__':'__main__'})
call('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
js("document.querySelector('#editor-title').scrollIntoView()")
time.sleep(.3)
assert js('document.documentElement.scrollWidth<=innerWidth')
shot('playground-mobile-editor.png')
js("document.querySelector('#playground').scrollIntoView()")
time.sleep(.3);shot('playground-mobile-robot.png')
assert not errors,errors
print('PASS: self-contained Python export executes; mobile layout; no unhandled JS exceptions.',flush=True)
ws.close()
