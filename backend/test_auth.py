"""
Full async auth integration test.
Tests: register, login, JWT-protected routes, role enforcement (RBAC).

Bootstrap: uses seeded manager@vuit.edu to generate invite codes before registering test users.
"""
import json
import urllib.request
import urllib.error
import ssl
from datetime import datetime, timedelta, timezone

BASE_URL = "http://127.0.0.1:8000"
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# Seeded credentials (created by seed.py)
SEED_MANAGER_EMAIL = "manager@vuit.edu"
SEED_MANAGER_PASSWORD = "admin123!"

PASS_COUNT = 0
FAIL_COUNT = 0


def fetch(method, path, data=None, token=None):
    url = f"{BASE_URL}{path}"
    req_body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=req_body, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, context=ctx) as response:
            body = response.read().decode("utf-8")
            try:
                return response.status, json.loads(body) if body else {}
            except json.JSONDecodeError:
                return response.status, {"raw": body}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body) if body else {}
        except json.JSONDecodeError:
            return e.code, {"raw": body}
    except Exception as e:
        print(f"  [WARN] Request failed: {e}")
        return 0, {}


def check(label, condition, actual=None):
    global PASS_COUNT, FAIL_COUNT
    if condition:
        print(f"  [PASS] {label}")
        PASS_COUNT += 1
    else:
        print(f"  [FAIL] {label}" + (f" -- got: {actual}" if actual else ""))
        FAIL_COUNT += 1


def run_tests():
    global PASS_COUNT, FAIL_COUNT

    print("=" * 55)
    print("  VUIT SCHEDULER -- AUTH INTEGRATION TESTS")
    print("=" * 55)

    # ── 0. BOOTSTRAP: login as seeded manager to get invite codes ─
    print("\n[0] Bootstrap: login as seeded manager")
    status, body = fetch("POST", "/auth/login", {
        "email": SEED_MANAGER_EMAIL,
        "password": SEED_MANAGER_PASSWORD,
    })
    check("Seed manager login returns 200", status == 200, status)
    seed_token = body.get("access_token", "")
    check("Seed manager token returned", bool(seed_token))

    # Create two invite codes (one for manager test, one for worker test)
    status, inv1 = fetch("POST", "/invites", token=seed_token)
    check("Create invite code 1 (200)", status == 200, status)
    invite_for_manager = inv1.get("code", "")
    check("Invite code 1 received", bool(invite_for_manager))

    status, inv2 = fetch("POST", "/invites", token=seed_token)
    check("Create invite code 2 (200)", status == 200, status)
    invite_for_worker = inv2.get("code", "")
    check("Invite code 2 received", bool(invite_for_worker))

    # ── 1. REGISTER MANAGER ─────────────────────────────
    print("\n[1] Register manager account")
    ts = datetime.now(timezone.utc).timestamp()
    manager_email = f"manager_{ts:.0f}@vuit.edu"
    status, body = fetch("POST", "/auth/register", {
        "name": "Test Manager",
        "email": manager_email,
        "password": "SecurePass123!",
        "role": "manager",
        "invite_code": invite_for_manager,
    })
    check("Register returns 200", status == 200, status)
    check("Role is manager", body.get("role") == "manager", body.get("role"))
    check("is_active is True", body.get("is_active") is True)

    # ── 2. REGISTER WORKER ──────────────────────────────
    print("\n[2] Register worker account")
    worker_email = f"worker_{ts:.0f}@vuit.edu"
    status, body = fetch("POST", "/auth/register", {
        "name": "Test Worker",
        "email": worker_email,
        "password": "WorkerPass456!",
        "role": "worker",
        "invite_code": invite_for_worker,
    })
    check("Register worker returns 200", status == 200, status)
    check("Role is worker", body.get("role") == "worker", body.get("role"))

    # ── 3. PREVENT DUPLICATE REGISTRATION ───────────────
    print("\n[3] Duplicate email rejected")
    # worker_email is already used, so this should fail even without a valid invite
    status, inv3 = fetch("POST", "/invites", token=seed_token)
    duplicate_invite = inv3.get("code", "")
    status, body = fetch("POST", "/auth/register", {
        "name": "Duplicate",
        "email": worker_email,
        "password": "AnotherPass!",
        "role": "worker",
        "invite_code": duplicate_invite,
    })
    check("Duplicate email blocked (400)", status == 400, status)

    # ── 4. LOGIN AS MANAGER ──────────────────────────────
    print("\n[4] Login as manager")
    status, body = fetch("POST", "/auth/login", {
        "email": manager_email,
        "password": "SecurePass123!"
    })
    check("Login returns 200", status == 200, status)
    check("Token returned", "access_token" in body)
    manager_token = body.get("access_token", "")

    # ── 5. LOGIN AS WORKER ───────────────────────────────
    print("\n[5] Login as worker")
    status, body = fetch("POST", "/auth/login", {
        "email": worker_email,
        "password": "WorkerPass456!"
    })
    check("Login returns 200", status == 200, status)
    worker_token = body.get("access_token", "")
    worker_id = body.get("user", {}).get("id", "")

    # ── 6. BAD LOGIN ─────────────────────────────────────
    print("\n[6] Wrong password rejected")
    status, body = fetch("POST", "/auth/login", {
        "email": worker_email,
        "password": "wrongpassword"
    })
    check("Wrong password returns 401", status == 401, status)

    # ── 7. GET /auth/me ──────────────────────────────────
    print("\n[7] GET /auth/me with valid token")
    status, body = fetch("GET", "/auth/me", token=manager_token)
    check("GET /auth/me returns 200", status == 200, status)
    check("Returns manager email", body.get("email") == manager_email)

    print("\n[7b] GET /auth/me with no token")
    status, body = fetch("GET", "/auth/me")  # no token
    # FastAPI 0.100+ returns 401 (not 403) for missing Bearer token
    check("No token returns 401", status == 401, status)

    # ── 8. RBAC -- WORKER CANNOT CREATE SHIFT ─────────────
    print("\n[8] Role enforcement -- worker cannot create shifts")
    # Need a building first
    status, body = fetch("GET", "/buildings")
    b_id = body[0]["id"] if status == 200 and body else None

    if not b_id:
        # Create one as manager
        status, body = fetch("POST", "/buildings", {
            "name": "Auth Test Building",
            "address": "Test Campus",
            "lat": 36.1420,
            "lng": -86.7979,
            "radius_meters": 75
        }, token=manager_token)
        b_id = body.get("id")

    now = datetime.now(timezone.utc)
    open_t = (now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    close_t = (now + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")

    status, body = fetch("POST", "/shifts", {
        "worker_id": worker_id,
        "building_id": b_id,
        "start_time": open_t,
        "end_time": close_t,
        "checkin_open_time": open_t,
        "checkin_close_time": close_t
    }, token=worker_token)
    check("Worker cannot create shift (403)", status == 403, status)

    # ── 9. MANAGER CAN CREATE SHIFT ──────────────────────
    print("\n[9] Manager creates a shift")
    status, body = fetch("POST", "/shifts", {
        "worker_id": worker_id,
        "building_id": b_id,
        "start_time": open_t,
        "end_time": close_t,
        "checkin_open_time": open_t,
        "checkin_close_time": close_t
    }, token=manager_token)
    check("Manager can create shift (200)", status == 200, status)
    shift_id = body.get("id", "")

    # ── 10. WORKER CHECKS IN (identity from JWT) ─────────
    print("\n[10] Worker checks in using JWT identity")
    status, body = fetch("POST", "/checkin", {
        "worker_id": "should_be_ignored",   # will be overridden
        "shift_id": shift_id,
        "lat": 36.1420,
        "lng": -86.7979
    }, token=worker_token)
    check("Check-in returns 200", status == 200, status)
    check("Check-in approved", body.get("status") == "approved", body.get("status"))

    # ── 11. WORKER CANNOT ACCESS DASHBOARD ───────────────
    print("\n[11] Role enforcement -- worker cannot access dashboard")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    status, body = fetch("GET", f"/dashboard/coverage?date={today}", token=worker_token)
    check("Worker denied dashboard (403)", status == 403, status)

    # ── 12. MANAGER CAN ACCESS DASHBOARD ─────────────────
    print("\n[12] Manager accesses dashboard coverage")
    status, body = fetch("GET", f"/dashboard/coverage?date={today}", token=manager_token)
    check("Manager gets dashboard (200)", status == 200, status)
    check("Coverage has slots", "slots" in body)

    # ── 13. MANAGER CREATES DISPATCH ─────────────────────
    print("\n[13] Manager creates and rings a dispatch")
    status, body = fetch("POST", "/dispatches", {
        "created_by": "manager",
        "assigned_worker_id": worker_id,
        "building_id": b_id,
        "title": "Auth Test Dispatch",
        "issue_text": "Testing auth on dispatches",
        "priority": 1
    }, token=manager_token)
    check("Manager creates dispatch (200)", status == 200, status)

    # ── 14. WORKER CANNOT CREATE DISPATCH ────────────────
    print("\n[14] Worker cannot create dispatch")
    status, body = fetch("POST", "/dispatches", {
        "created_by": "worker",
        "assigned_worker_id": worker_id,
        "building_id": b_id,
        "title": "Unauthorized",
        "issue_text": "This should fail",
        "priority": 1
    }, token=worker_token)
    check("Worker blocked from creating dispatch (403)", status == 403, status)

    # ── 15. MANAGER LISTS USERS ───────────────────────────
    print("\n[15] Manager lists users")
    status, body = fetch("GET", "/users", token=manager_token)
    check("Manager can list users (200)", status == 200, status)
    check("At least 2 users exist", len(body) >= 2)

    # ── 16. WORKER CANNOT LIST USERS ─────────────────────
    print("\n[16] Worker cannot list users")
    status, body = fetch("GET", "/users", token=worker_token)
    check("Worker blocked from /users (403)", status == 403, status)

    # ── 17. INVALID TOKEN REJECTED ───────────────────────
    print("\n[17] Invalid/tampered token rejected")
    status, body = fetch("GET", "/auth/me", token="invalid.token.here")
    check("Invalid token returns 401", status == 401, status)

    # ── 18. USED INVITE CODE CANNOT BE REUSED ────────────
    print("\n[18] Used invite code cannot be reused")
    status, body = fetch("POST", "/auth/register", {
        "name": "Another Worker",
        "email": f"another_{ts:.0f}@vuit.edu",
        "password": "AnotherPass456!",
        "role": "worker",
        "invite_code": invite_for_worker,   # already used in test [2]
    })
    check("Used invite code blocked (400)", status == 400, status)

    # ─────────────────────────────────────────────────────
    print("\n" + "=" * 55)
    print(f"  RESULTS: {PASS_COUNT} passed, {FAIL_COUNT} failed")
    print("=" * 55)


if __name__ == "__main__":
    run_tests()
