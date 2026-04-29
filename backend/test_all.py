import urllib.request
import json
import ssl
from datetime import datetime

BASE_URL = "http://127.0.0.1:8000"
# Disabling SSL checks just in case since test environment
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

def test_full_flow():
    print("1. Fetching building...")
    buildings = fetch("GET", "/buildings")
    if not buildings:
        print("No buildings exist, creating one.")
        building = fetch("POST", "/buildings", {
            "name": "Hill Center",
            "address": "Peabody College",
            "lat": 36.1420,
            "lng": -86.7979,
            "radius_meters": 75
        })
        building_id = building["id"]
    else:
        building_id = buildings[0]["id"]
        print(f"Using building ID: {building_id}")

    print("\n2. Creating dispatch...")
    dispatch1 = fetch("POST", "/dispatches", {
        "created_by": "manager_001",
        "assigned_worker_id": "worker_123",
        "building_id": building_id,
        "title": "Projector down",
        "issue_text": "The projector screen is not powering on in room 104.",
        "priority": 1
    })
    dispatch_id = dispatch1["id"]
    print(f"Created dispatch: {dispatch_id} | Status: {dispatch1['status']}")

    print("\n3. Triggering Ringing...")
    ring_resp = fetch("POST", f"/dispatches/{dispatch_id}/ring")
    print(f"Status after ring: {ring_resp['status']}")

    print("\n4. Accepting the dispatch...")
    accept_resp = fetch("POST", f"/dispatches/{dispatch_id}/accept")
    print(f"Status after accept: {accept_resp['status']}")

    print("\n5. Creating another dispatch...")
    dispatch2 = fetch("POST", "/dispatches", {
        "created_by": "manager_001",
        "assigned_worker_id": "worker_123",
        "building_id": building_id,
        "title": "WiFi Down",
        "issue_text": "No AP coverage in lobby.",
        "priority": 2
    })
    dispatch2_id = dispatch2["id"]

    print("Testing reassigning...")
    reassign_resp = fetch("POST", f"/dispatches/{dispatch2_id}/reassign", {
        "assigned_worker_id": "worker_456"
    })
    print(f"Status after reassign: {reassign_resp['status']}")
    print(f"New Worker: {reassign_resp['assigned_worker_id']}")

    print("Ringing again and declining...")
    fetch("POST", f"/dispatches/{dispatch2_id}/ring")
    decline_resp = fetch("POST", f"/dispatches/{dispatch2_id}/decline")
    print(f"Status after decline: {decline_resp['status']}")

    today_date = datetime.utcnow().strftime("%Y-%m-%d")
    print(f"\n6. Fetching Dispatch Summary for {today_date}...")
    summary = fetch("GET", f"/dispatches/summary/{today_date}")
    dispatches = summary.get("dispatches", [])
    print(f"Found {len(dispatches)} dispatches in summary.")
    for d in dispatches:
        print(f"- {d['title']}: {d['status']} (Color: {d['color']})")

    print("\n7. Fetching Dashboard Coverage...")
    coverage = fetch("GET", f"/dashboard/coverage?date={today_date}")
    slots = coverage.get("slots", [])
    print(f"Found {len(slots)} coverage slots.")
    for s in slots:
         print(f"- Shift for {s['worker_id']}: state {s['state']}, check={s['checked_in']}")

if __name__ == "__main__":
    test_full_flow()
