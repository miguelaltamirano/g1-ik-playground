"""Classroom NumPy kinematics and result validation, also used by exported files.

These helpers are not Pinocchio. Their positions and Jacobians are checked against
the native Pinocchio reference for the same seven-joint G1 arm.
"""
import json
import time
import numpy as np


def make_kinematics(model):
    joints = model["joints"]

    def kinematics(q):
        q = np.asarray(q, dtype=float)
        if q.shape != (7,) or not np.isfinite(q).all():
            raise ValueError("kinematics(q) needs seven finite joint angles.")
        rotation = np.eye(3)
        position = np.zeros(3)
        origins, axes = [], []
        for joint, angle in zip(joints, q):
            position = position + rotation @ np.asarray(joint["xyz"])
            rotation = rotation @ np.asarray(joint["rotation"])
            axis = np.asarray(joint["axis"])
            origins.append(position.copy())
            axes.append(rotation @ axis)
            x, y, z = axis
            skew = np.array([[0, -z, y], [z, 0, -x], [-y, x, 0]])
            rotation = rotation @ (np.eye(3) + np.sin(angle) * skew + (1 - np.cos(angle)) * (skew @ skew))
        position = position + rotation @ np.array([0.08, 0, 0])
        jacobian = np.column_stack([np.cross(axis, position - origin) for axis, origin in zip(axes, origins)])
        return position, jacobian

    return kinematics


def run_student(source, config, model):
    """Run student_solver.py; independently validate and score every saved pose."""
    if len(source) > 50000:
        raise ValueError("Keep this exercise below 50,000 characters.")
    lower = np.array([j["lower"] for j in model["joints"]])
    upper = np.array([j["upper"] for j in model["joints"]])
    target = np.asarray(config["target"], dtype=float)
    if target.shape != (3,) or not np.isfinite(target).all():
        raise ValueError("The target must contain three finite coordinates.")
    kinematics = make_kinematics(model)
    trajectory = []

    def validate(q):
        q = np.asarray(q, dtype=float)
        if q.shape != (7,) or not np.isfinite(q).all():
            raise ValueError("Return and record seven finite joint angles (shape (7,)).")
        if np.any(q < lower - 1e-9) or np.any(q > upper + 1e-9):
            raise ValueError("A joint exceeded its limit. Apply np.clip(q, lower, upper) before record(q).")
        return q.copy()

    def record(q):
        q = validate(q)
        if len(trajectory) >= 1001:
            raise ValueError("At most 1,000 updates can be recorded per run. Reduce the loop length.")
        # Store copies: later in-place changes must not rewrite the earlier path.
        trajectory.append(q)

    q0 = validate(model["start"])
    record(q0)
    namespace = {"np": np, "kinematics": kinematics, "record": record,
                 "lower": lower.copy(), "upper": upper.copy(), "__name__": "student_solver"}
    started = time.perf_counter()
    exec(compile(source, "student_solver.py", "exec"), namespace)
    if not callable(namespace.get("solve_ik")):
        raise ValueError("Define a function named solve_ik(q, target) and return the final q.")
    final_q = validate(namespace["solve_ik"](q0.copy(), target.copy()))
    if not np.array_equal(final_q, trajectory[-1]):
        record(final_q)
    elapsed_ms = (time.perf_counter() - started) * 1000
    positions = [kinematics(q)[0] for q in trajectory]
    errors = [float(np.linalg.norm(target - p)) for p in positions]
    return {"trajectory": [q.tolist() for q in trajectory], "errors": errors,
            "target": target.tolist(), "updates": len(trajectory) - 1,
            "error": errors[-1], "converged": errors[-1] < 1e-4,
            "elapsed_ms": elapsed_ms}
