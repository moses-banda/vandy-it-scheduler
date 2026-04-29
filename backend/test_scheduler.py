import urllib.request
import json
import ssl
import time
from datetime import datetime, timedelta

BASE_URL = "http://127.0.0.1:8000"
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def fetch(method, path, data=None):
    url = f"{BASE_URL}{path}"
    req_body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=req_body, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, context=ctx) as response:
            body = response.read().decode("utf-8")
            if body:
                return json.loads(body)
            return {}
    except urllib.error.HTTPError as e:
        print(f"HTTP ERROR {e.code} on {method} {path}: {e.read().decode('utf-8')}")
        raise e

def test_scheduler_jobs():
    print("--- STARTING SCHEDULER TESTS ---\n")
    
    # Needs a building
    buildings = fetch("GET", "/buildings")
    b_id = buildings[0]["id"]

    # 1. Dispatch Timeout Test
    print("Test 1: Dispatch Timeout")
    d1 = fetch("POST", "/dispatches", {
        "created_by": "test", "assigned_worker_id": "test",
        "building_id": b_id, "title": "Timeout Test",
        "issue_text": "-", "priority": 1
    })
    d_id = d1["id"]
    fetch("POST", f"/dispatches/{d_id}/ring")
    
    status_ring = fetch("GET", f"/dispatches/{d_id}")["status"]
    print(f"  Dispatch {d_id} status instantly after ring: {status_ring}")
    
    print("  Waiting 35 seconds for APScheduler to mark it missed...")
    time.sleep(35)
    status_missed = fetch("GET", f"/dispatches/{d_id}")["status"]
    print(f"  Dispatch {d_id} status after 35s: {status_missed}")
    if status_missed == "missed":
        print("  ✅ Dispatch timeout job PASSED\n")
    else:
        print("  ❌ Dispatch timeout job FAILED\n")


    # 2. Shift Missed Checkin Test
    print("Test 2: Missed Checkin Detection")
    # Shift schedule that already passed
    past_open = (datetime.utcnow() - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    past_close = (datetime.utcnow() - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    s1 = fetch("POST", "/shifts", {
        "worker_id": "test", "building_id": b_id,
        "start_time": past_open, "end_time": past_close,
        "checkin_open_time": past_open, "checkin_close_time": past_close
    })
    s_id_1 = s1["id"]
    
    print("  Waiting 65 seconds for APScheduler to mark shift missed...")
    time.sleep(65)
    
    # We don't have a GET /shifts/id but we can check dashboard or GET /shifts (all)
    shifts = fetch("GET", "/shifts")
    s_missed = next((x for x in shifts if x["id"] == s_id_1), None)
    print(f"  Shift {s_id_1} status after 65s: {s_missed['status']}")
    if s_missed["status"] == "missed":
        print("  ✅ Missed checkin job PASSED\n")
    else:
        print("  ❌ Missed checkin job FAILED\n")

    print("--- TESTS COMPLETED ---")

if __name__ == "__main__":
    test_scheduler_jobs()
