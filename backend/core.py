import io
import asyncio
import os
import re
import uuid
import logging
import ipaddress
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta

import httpx
import requests
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
from PIL import Image

load_dotenv(Path(__file__).parent / ".env")

try:
    from backend.clerk_auth import require_user, verify_session_token
except ModuleNotFoundError:
    from clerk_auth import require_user, verify_session_token

logger = logging.getLogger("nasneq")
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
MANILA = timezone(timedelta(hours=8))
APP_NAME = "nasneq"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ---------------- Roles ----------------
ROLES = ["admin", "customer"]
DEFAULT_ROLE = "customer"
RETIRED_ROLES = {}
RANK = {r: len(ROLES) - i for i, r in enumerate(ROLES)}
ENV = "live" if os.environ.get("CLERK_PUBLISHABLE_KEY", "").startswith("pk_live_") else "preview"
IN_ENV = {"env": {"$in": [ENV, None]}}


def effective_role(role) -> str:
    role = RETIRED_ROLES.get(role, role)
    return role if role in ROLES else DEFAULT_ROLE


def _clerk_user(user_id: str) -> dict:
    r = requests.get(f"https://api.clerk.com/v1/users/{user_id}", timeout=10,
                     headers={"Authorization": f"Bearer {os.environ['CLERK_SECRET_KEY']}", "User-Agent": "emergent-app"})
    r.raise_for_status()
    return r.json()


def _verified_emails(cu: dict) -> list:
    return [e["email_address"].lower() for e in cu.get("email_addresses", [])
            if (e.get("verification") or {}).get("status") == "verified"]


async def current_member(user: dict = Depends(require_user)) -> dict:
    uid = user["user_id"]
    member = await db.users.find_one({"user_id": uid}, {"_id": 0})
    if member is None or not member.get("role"):
        cu = await asyncio.to_thread(_clerk_user, uid)
        admins = {e.strip().lower() for e in os.environ.get("ADMIN_EMAIL", "").split(",") if e.strip()}
        emails = _verified_emails(cu)
        role = "admin" if any(e in admins for e in emails) else DEFAULT_ROLE
        name = " ".join(x for x in [cu.get("first_name"), cu.get("last_name")] if x) or ""
        await db.users.update_one({"user_id": uid, "role": {"$in": [None, ""]}}, {"$set": {"role": role}})
        member = await db.users.find_one_and_update(
            {"user_id": uid},
            {"$setOnInsert": {"user_id": uid, "role": role, "email": emails[0] if emails else "",
                              "name": name, "phone": "", "favorites": [], "created_at": now_iso()}},
            upsert=True, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if member.get("env") != ENV:
        await db.users.update_one({"user_id": uid}, {"$set": {"env": ENV}})
    return {**member, "env": ENV, "role": effective_role(member["role"])}


def require_role(*roles: str):
    async def check(member: dict = Depends(current_member)) -> dict:
        if member["role"] not in roles:
            raise HTTPException(status_code=403, detail="Not allowed")
        return member
    return check


require_admin = require_role("admin")


async def optional_member(request: Request):
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer ") or len(auth) < 20:
        return None
    claims = verify_session_token(auth[7:])
    return await current_member({"user_id": claims["sub"]})


# ---------------- Object storage ----------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
_storage_key = None


def init_storage(force: bool = False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ["EMERGENT_LLM_KEY"]}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": init_storage(), "Content-Type": content_type}, data=data, timeout=120)
    if resp.status_code == 404:
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": init_storage(True), "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage()}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def store_image(raw: bytes, folder: str) -> dict:
    """Square-safe WebP main (1000px) + thumb (480px), never cropped."""
    img = Image.open(io.BytesIO(raw))
    img.load()
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    base = f"{APP_NAME}/{folder}/{uuid.uuid4()}"
    out = {}
    for label, size in (("main", 1000), ("thumb", 480)):
        im = img.copy()
        im.thumbnail((size, size), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=84, method=5)
        res = put_object(f"{base}-{label}.webp", buf.getvalue(), "image/webp")
        out[label] = res["path"]
    return {"image_path": out["main"], "thumb_path": out["thumb"]}


# ---------------- Email (Emergent managed Resend) ----------------
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
APP_PUBLIC_URL = os.environ["APP_PUBLIC_URL"].rstrip("/")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> dict:
    """Returns {"status": "sent"|"failed", ...}. Never raises: callers record the outcome."""
    try:
        _assert_safe_email(subject, html)
        for attempt in range(4):
            async with httpx.AsyncClient(timeout=30) as c:
                resp = await c.post(f"{EMAIL_BASE_URL}/api/v1/email/send", headers={"X-Email-Key": EMAIL_KEY},
                                    json={"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME})
            if resp.status_code != 429 or attempt == 3:
                break
            await asyncio.sleep(5 * (attempt + 1) ** 2)
        resp.raise_for_status()
        return {"status": "sent", "id": resp.json().get("id"), "at": now_iso()}
    except httpx.HTTPStatusError as e:
        logger.warning(f"Email failed {e.response.status_code}: {e.response.text[:200]}")
        return {"status": "failed", "error": f"HTTP {e.response.status_code}", "at": now_iso()}
    except Exception as e:
        logger.error(f"Email error: {e}")
        return {"status": "failed", "error": str(e)[:120], "at": now_iso()}


def email_template(title: str, lines: list, link_path: str = "", link_label: str = "") -> str:
    body = "".join(f'<p style="margin:0 0 10px">{escape(str(x))}</p>' for x in lines)
    link = (f'<p style="margin:18px 0"><a href="{APP_PUBLIC_URL}{link_path}" style="background:#4A3528;color:#fff;'
            f'padding:10px 18px;border-radius:999px;text-decoration:none">{escape(link_label)}</a></p>') if link_path else ""
    return (f'<table role="presentation" width="100%" style="background:#F7F2EA"><tr><td style="padding:28px;'
            f'font-family:Arial,sans-serif;color:#4A3528"><h2 style="margin:0 0 14px">{escape(title)}</h2>{body}{link}'
            f'<p style="font-size:12px;color:#8a7766;margin-top:24px">Sent by {escape(EMAIL_FROM_NAME)}, '
            f'66 Libyan St., Culiat, Quezon City. We never ask for your password or card details by email.</p>'
            f'</td></tr></table>')


# ---------------- Product helpers ----------------
def product_status(p: dict) -> str:
    if not p.get("available", True):
        return "unavailable"
    if p.get("kind") == "inquiry":
        return "inquiry"
    if p.get("track_stock"):
        if p.get("stock", 0) <= 0:
            return "sold_out"
        if p.get("stock", 0) <= p.get("low_threshold", 0):
            return "low_stock"
    return "available"


def public_product(p: dict) -> dict:
    keys = ["id", "name", "category", "price", "description", "notes", "options", "kind", "is_packaging",
            "is_drink", "sort", "image_path", "thumb_path", "image_source", "preorder"]
    out = {k: p.get(k) for k in keys}
    out["status"] = product_status(p)
    out["stock_left"] = p.get("stock") if p.get("track_stock") and out["status"] == "low_stock" else None
    pre = p.get("preorder") or {}
    out["preorder"] = {k: pre.get(k) for k in ("enabled", "lead_days", "max_qty")} if pre.get("enabled") else None
    return out


async def get_settings() -> dict:
    s = await db.settings.find_one({"id": "main"}, {"_id": 0})
    return s or {}
