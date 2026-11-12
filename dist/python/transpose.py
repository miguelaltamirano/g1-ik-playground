# Try changing gain. Compare the error curve with DLS.
def solve_ik(q, target):
    gain = 4.0
    max_step = 0.12

    for iteration in range(400):
        position, J = kinematics(q)
        error = target - position
        if np.linalg.norm(error) < 1e-4:
            break

        dq = gain * J.T @ error
        dq *= min(1.0, max_step / max(np.linalg.norm(dq), 1e-15))

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
