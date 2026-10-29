# Helper: prints a Clerk sign-in ticket URL for a test user (does not print the secret key)
import sys
import requests
from conftest import BACK_ENV, BASE_URL, ADMIN_UID, CUSTOMER_UID

uid = ADMIN_UID if (sys.argv[1:] or ["admin"])[0] == "admin" else CUSTOMER_UID
h = {"Authorization": f"Bearer {BACK_ENV['CLERK_SECRET_KEY']}", "User-Agent": "emergent-test"}
r = requests.post("https://api.clerk.com/v1/sign_in_tokens", json={"user_id": uid, "expires_in_seconds": 900}, headers=h, timeout=20)
r.raise_for_status()
print(f"{BASE_URL}/sign-in?__clerk_ticket={r.json()['token']}")
