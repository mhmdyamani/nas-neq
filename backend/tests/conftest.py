# Shared fixtures: base URL, Clerk JWTs for admin/customer test users, mongo cleanup handle
import os
import pytest
import requests
from dotenv import dotenv_values

FRONT_ENV = dotenv_values("/app/frontend/.env")
BACK_ENV = dotenv_values("/app/backend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or FRONT_ENV["REACT_APP_BACKEND_URL"]).rstrip("/")
API = BASE_URL + "/api"
ADMIN_UID = "user_3LMz3U0kDSsF2646IJtcDbL5e6I"
CUSTOMER_UID = "user_3LMz3YEhvagTOmDHFZplVoz17yN"


def clerk_jwt(user_id):
    key = BACK_ENV.get("CLERK_SECRET_KEY")
    h = {"Authorization": f"Bearer {key}", "User-Agent": "emergent-test", "Content-Type": "application/json"}
    s = requests.post("https://api.clerk.com/v1/sessions", json={"user_id": user_id}, headers=h, timeout=20)
    s.raise_for_status()
    t = requests.post(f"https://api.clerk.com/v1/sessions/{s.json()['id']}/tokens",
                      json={"expires_in_seconds": 3600}, headers=h, timeout=20)
    t.raise_for_status()
    return t.json()["jwt"]


@pytest.fixture(scope="session")
def admin_h():
    return {"Authorization": f"Bearer {clerk_jwt(ADMIN_UID)}"}


@pytest.fixture(scope="session")
def cust_h():
    return {"Authorization": f"Bearer {clerk_jwt(CUSTOMER_UID)}"}


@pytest.fixture(scope="session")
def mdb():
    from pymongo import MongoClient
    c = MongoClient(BACK_ENV["MONGO_URL"])
    yield c[BACK_ENV["DB_NAME"]]
    c.close()


@pytest.fixture(scope="session")
def menu():
    return requests.get(f"{API}/menu", timeout=20).json()
