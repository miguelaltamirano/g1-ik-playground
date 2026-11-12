# G1 Python Playground

Edit a Python inverse-kinematics solver in the browser, run it, and inspect the Unitree G1 left arm in 3D. Each student works independently without installing Python or signing in.

**Playground:** https://miguelaltamirano.github.io/g1-ik-playground/

**Preserved classroom website:** https://miguelaltamirano.github.io/g1-pinocchio-lab/

The original is saved at [v1-mesh-classroom](https://github.com/miguelaltamirano/g1-pinocchio-lab/tree/v1-mesh-classroom). This repository is a separate copy; publishing it does not update the original website.

## Student workflow

1. Choose a target: Forward, Higher, Too far, or the coordinate sliders.
2. Edit `solve_ik(q, target)` in the Python editor. Start by changing the damping value or step cap.
3. Press **Run code** (or Ctrl/Cmd + Enter). The first run downloads a pinned Python runtime and NumPy; an internet connection is needed.
4. Inspect the independently measured final error, convergence curve and Python output.
5. Use **Replay motion**, **1 frame**, or the update slider to inspect the saved poses. Turn on joint frames or focus on the arm.
6. Load a DLS, pseudoinverse or Jacobian-transpose example and compare the last five completed runs.
7. Use **Download .py** to keep a standalone NumPy script containing your edited solver, model data and helpers.

Drafts are automatically saved in this browser's local storage. They are not uploaded or shared between students or devices. Private browsing or disabled storage can prevent draft persistence; downloading the script provides a separate copy. Loading an example asks before replacing edited code. Resetting the robot keeps the code.

## What runs where

- **Editable code:** real Python + NumPy inside a Pyodide Web Worker, on the student's computer.
- **Kinematics:** the supplied NumPy `kinematics(q)` helper returns the 3D tool position and a 3×7 Jacobian in torso coordinates. Its results are checked against native Pinocchio reference outputs.
- **3D view:** Three.js and the official Unitree G1 visual meshes, with fixed base and inactive joints.
- **Pinocchio and MuJoCo:** actual native libraries in the downloadable minimal example and full teaching lab. They do not run in the browser exercise.

This is position-only kinematic IK. It does not model collision avoidance, balance or physics. A residual above 0.1 mm is reported as “Residual remains,” regardless of what the student prints or how the loop terminates.

Pyodide is pinned to `https://cdn.jsdelivr.net/pyodide/v0.29.3/full/`; NumPy is loaded from that same distribution. The 3D renderer and robot assets are served from this repository. There is no Python backend, account system, student-code upload, or API key. Python packages are downloaded only when Run is first pressed.

## Solver contract

The editor receives these names:

| Name | Meaning |
| --- | --- |
| `np` | NumPy |
| `kinematics(q)` | Returns `(position, J)` in torso coordinates |
| `lower`, `upper` | Seven joint limits in radians |
| `record(q)` | Copies a pose into the playback trajectory |

Define `solve_ik(q, target)` and return the final seven-element joint vector. Call `record(q)` after each accepted update. Every run starts from the same arm posture. The harness checks recorded and returned vectors for shape, finite values and joint limits, and measures the error itself. Returning a pose without calling `record` still scores the final pose, but cannot reconstruct intermediate motion.

The teaching runner limits code to 50,000 characters, output to roughly 16 KB, and recordings to 1,000 updates. **Stop** terminates the worker; a subsequent run starts a fresh runtime. Execution also stops after 10 seconds. Initial package loading has a separate 90-second timeout. These limits keep the exercise responsive. There are no special cross-origin-isolation headers or SharedArrayBuffer requirements.

## Teaching prompts

- Change damping from `0.03` to `0.10`. Compare update count and the final error.
- Change the maximum step, then inspect the hand path and error curve.
- Load the pseudoinverse and transpose examples. Keep the same target and initial posture for comparison.
- Try “Too far.” Explain why returning joint angles is not evidence of a successful reach.
- Deliberately introduce a shape or syntax error, read the output, and correct it.
- Download the standalone experiment. Then use the Pinocchio implementation guide to replace the NumPy helper with the corresponding native calls.

## Development and checks

No JavaScript build or dependency installation is needed to serve the committed site:

```bash
python3 -m http.server 8770 --directory dist
```

Open http://localhost:8770. Use an HTTP server; opening `index.html` directly as a file does not support the worker/module workflow.

Numerical checks (Node.js and Python with NumPy):

```bash
node qa/check.mjs
node qa/check-viewer.mjs
python3 qa/check_python.py
```

`qa/playground_browser.py` is an instructor QA script using Chrome DevTools on port 9339, a local server on 8770 and Python's `websocket-client`. It checks actual browser Python execution, code edits, playback, errors, Stop/recovery, solver examples, draft persistence, the exported script and mobile layout. Students do not need these tools. Screenshots are ignored by Git.

The default Python DLS example converges in nine updates to approximately 0.0687 mm error. NumPy FK/Jacobians match the native reference to numerical precision; the rendered tool and joint frames match the solver at 54 sampled poses. These checks describe this model and test set, not a general guarantee that every target is reachable.

Future pushes to `main` run the numerical checks and publish `dist/` through GitHub Actions. The repository's Pages source must be set to **GitHub Actions**.

## Files and attribution

- `dist/app.js`, `playground.css`: student workspace, local drafts, plotting and playback.
- `dist/python-runner.js`, `python-worker.js`: runtime lifecycle, worker isolation, Stop and timeouts.
- `dist/python/`: the actual editable examples and shared NumPy helper/harness.
- `dist/viewer.js`, `robot-model.js`: 3D rendering and joint hierarchy.
- `dist/assets/g1/`: packed original G1 visual meshes and transforms.
- `dist/guide.js`, `lessons.js`: native Pinocchio implementation walkthrough.
- `dist/downloads/`, `example/`: the preserved native Pinocchio/MuJoCo teaching material.

The G1 comes from [Unitree's pinned official model](https://github.com/unitreerobotics/unitree_ros/blob/9926cc2f179ae3b86f4f74087bd32ef0c8b6fd90/robots/g1_description/g1_29dof.urdf). Unitree's BSD 3-Clause license is retained in `dist/assets/UNITREE_LICENSE.txt` and the model/download folders. The 8 cm tool offset is a classroom choice, not a calibrated fingertip. Three.js 0.180.0 retains its MIT license in `dist/vendor/THREE_LICENSE.txt`. Pyodide is provided by its official versioned distribution under its applicable upstream licenses.
