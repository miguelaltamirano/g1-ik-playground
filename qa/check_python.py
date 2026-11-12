"""Check the browser's actual Python helpers and solver examples using NumPy."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('kernel', ROOT / 'dist/python/kernel.py')
kernel = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kernel)
model = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import {JOINTS,START,PRESETS} from './dist/model.js'; console.log(JSON.stringify({joints:JOINTS,start:START,targets:PRESETS}));"
], cwd=ROOT))
reference = json.loads((ROOT / 'qa/reference.json').read_text())
kinematics = kernel.make_kinematics(model)
maximum = 0
for sample in reference['samples']:
    p, jac = kinematics(sample['q'])
    maximum = max(maximum, float(np.max(np.abs(p-sample['p']))), float(np.max(np.abs(jac-sample['jacobian']))))
assert maximum < 1e-12, maximum

def run(source, target='forward'):
    with contextlib.redirect_stdout(io.StringIO()):
        return kernel.run_student(source, {'target': model['targets'][target]}, model)

dls = (ROOT / 'dist/python/dls.py').read_text()
result = run(dls)
assert result['converged'] and result['updates'] == 9
assert abs(result['error']*1000 - .0687) < .0001
assert run(dls, 'higher')['converged']
assert not run(dls, 'far')['converged']
assert run(dls.replace('damping = 0.03', 'damping = 0.10'))['updates'] != result['updates']
assert run((ROOT / 'dist/python/pseudoinverse.py').read_text())['converged']
transpose = run((ROOT / 'dist/python/transpose.py').read_text())
assert transpose['error'] < transpose['errors'][0]
for source, error in [
    ('def solve_ik(q, target): return np.full(7, np.nan)', ValueError),
    ('def solve_ik(q, target): return np.ones(6)', ValueError),
    ('def solve_ik(q, target): return np.full(7, 100)', ValueError),
    ('def solve_ik(q, target)\n    return q', SyntaxError),
    ('x = 1', ValueError),
    ('def solve_ik(q, target):\n    for i in range(1002): record(q)\n    return q', ValueError),
]:
    try:
        run(source)
    except error:
        pass
    else:
        raise AssertionError('Invalid student program was accepted')
# A student returning a pose without calling record still gets the final pose scored.
no_updates = run('def solve_ik(q, target): return q')
assert no_updates['updates'] == 0 and not no_updates['converged']
assert run(dls)['converged'], 'A failed run must not corrupt a later run'
print(f'PASS: NumPy FK/Jacobian match native Pinocchio ({maximum:.2g} max error); solver edits, presets, validation and recovery.')
