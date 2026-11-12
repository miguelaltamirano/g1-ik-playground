# Edit this solver, then press Run code (Ctrl / Cmd + Enter).
# Provided: np, kinematics(q), lower, upper, record(q).
def solve_ik(q, target):
    damping = 0.03
    max_step = 0.12

    for iteration in range(400):
        position, J = kinematics(q)
        error = target - position
        if np.linalg.norm(error) < 1e-4:
            break

        # Change this update rule to experiment with the solver.
        A = J @ J.T + damping**2 * np.eye(3)
        dq = J.T @ np.linalg.solve(A, error)
        dq *= min(1.0, max_step / max(np.linalg.norm(dq), 1e-15))

        # Backtracking accepts an update only if the error decreases.
        for trial in range(15):
            candidate = np.clip(q + 0.5**trial * dq, lower, upper)
            new_position, _ = kinematics(candidate)
            if np.linalg.norm(target - new_position) < np.linalg.norm(error) - 1e-13:
                q = candidate
                record(q)
                break
        else:
            print("Stopped: no improving step was found.")
            break

    print("Final joint angles:", np.round(q, 3))
    return q
