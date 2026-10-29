import re
import asyncio
import secrets
import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, Depends, HTTPException, BackgroundTasks, Response
from pydantic import BaseModel, Field, field_validator
from pymongo.errors import DuplicateKeyError
from starlette.middleware.cors import CORSMiddleware
import os

from core import (db, client, now_iso, new_id, current_member, optional_member, init_storage, get_object,
                  public_product, product_status, get_settings, send_email, email_template, MANILA, logger)
from seed import seed, CATEGORIES

try:
    from backend.clerk_auth import clerk_router
except ModuleNotFoundError:
    from clerk_auth import clerk_router

app = FastAPI(title="Nas&Neq API")
api = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO)

STATUS_LABEL = {"pending": "Pending review", "accepted": "Accepted", "preparing": "Preparing", "ready": "Ready",
                "out_for_delivery": "Out for delivery", "completed": "Completed", "rejected": "Rejected",
                "cancelled": "Cancelled"}
FULFILLMENT_KEYS = ["pickup", "dine_in", "takeout", "delivery", "contactless"]
PHONE_RE = re.compile(r"^[0-9+()\-\s]{7,20}$")


@api.get("/")
async def root():
    return {"message": "Nas&Neq API"}


# ---------------- Public catalog ----------------
@api.get("/menu")
async def menu():
    prods = await db.products.find({"hidden": {"$ne": True}}, {"_id": 0}).sort("sort", 1).to_list(1000)
    return {"categories": CATEGORIES, "products": [public_product(p) for p in prods]}


@api.get("/settings/public")
async def public_settings():
    s = await get_settings()
    services = {k: {"enabled": v.get("enabled", False), "label": v.get("label")} for k, v in s["services"].items()}
    d = s["services"]["delivery"]
    if d.get("enabled"):
        services["delivery"].update({"fee": d.get("fee"), "min_order": d.get("min_order"),
                                     "coverage": d.get("coverage"), "hours": d.get("hours")})
    c = s["services"]["contactless"]
    if c.get("enabled"):
        services["contactless"]["instructions"] = c.get("instructions")
    return {"services": services, "payments": {k: v for k, v in s["payments"].items() if v.get("enabled")},
            "accepting_orders": s.get("accepting_orders", True), "hours_text": s.get("hours_text")}


@api.get("/images/{path:path}")
async def image(path: str):
    if not path.startswith("nasneq/") or ".." in path:
        raise HTTPException(404)
    if not await db.products.find_one({"$or": [{"image_path": path}, {"thumb_path": path}]}) and \
            not await db.image_drafts.find_one({"$or": [{"image_path": path}, {"thumb_path": path}]}):
        raise HTTPException(404)
    try:
        data, ctype = await asyncio.to_thread(get_object, path)
    except Exception:
        raise HTTPException(404)
    return Response(content=data, media_type=ctype, headers={"Cache-Control": "public, max-age=31536000, immutable"})


# ---------------- Cart validation & order creation ----------------
class CartItem(BaseModel):
    product_id: str
    qty: int = Field(ge=1, le=500)


class CartIn(BaseModel):
    items: List[CartItem] = Field(max_length=60)


def manila_today():
    return datetime.now(MANILA).date()


async def _price_cart(items: List[CartItem]):
    """Returns (lines, problems, order_type). Uses current server prices only."""
    merged = {}
    for it in items:
        merged[it.product_id] = merged.get(it.product_id, 0) + it.qty
    prods = {p["id"]: p for p in await db.products.find({"id": {"$in": list(merged)}}, {"_id": 0}).to_list(100)}
    lines, problems, types = [], [], set()
    for pid, qty in merged.items():
        p = prods.get(pid)
        if not p or p.get("hidden"):
            problems.append({"product_id": pid, "message": "This item is no longer on the menu."})
            continue
        st = product_status(p)
        pre = (p.get("preorder") or {})
        if p.get("kind") == "inquiry" and not (pre.get("enabled") and p.get("price") is not None):
            problems.append({"product_id": pid, "message": f"{p['name']} is made to order — please send an inquiry instead."})
            continue
        if st == "unavailable":
            problems.append({"product_id": pid, "message": f"{p['name']} is currently unavailable."})
            continue
        is_pre = p.get("kind") == "inquiry"
        if not is_pre:
            if st == "sold_out":
                problems.append({"product_id": pid, "message": f"{p['name']} is sold out."})
                continue
            if p.get("track_stock") and qty > p.get("stock", 0):
                problems.append({"product_id": pid, "message": f"Only {p['stock']} of {p['name']} left — please reduce the quantity.",
                                 "max_qty": p["stock"]})
                continue
        elif pre.get("max_qty") and qty > pre["max_qty"]:
            problems.append({"product_id": pid, "message": f"Maximum {pre['max_qty']} per pre-order for {p['name']}.",
                             "max_qty": pre["max_qty"]})
            continue
        if p.get("price") is None:
            problems.append({"product_id": pid, "message": f"{p['name']} has no confirmed price yet."})
            continue
        if not p.get("is_packaging"):
            types.add("preorder" if is_pre else "regular")
        lines.append({"product_id": pid, "name": p["name"], "category": p["category"], "unit_price": float(p["price"]),
                      "qty": qty, "line_total": round(float(p["price"]) * qty, 2), "is_packaging": bool(p.get("is_packaging")),
                      "preorder": is_pre, "track_stock": bool(p.get("track_stock")) and not is_pre, "_p": p})
    if len(types) > 1:
        problems.append({"product_id": None, "message": "Pre-order items and regular menu items must be ordered separately."})
    if lines and not types:
        problems.append({"product_id": None, "message": "Packaging add-ons can only be ordered with menu items."})
    return lines, problems, (types.pop() if len(types) == 1 else "regular")


def _clean(lines):
    return [{k: v for k, v in ln.items() if k != "_p"} for ln in lines]


@api.post("/cart/validate")
async def validate_cart(body: CartIn):
    lines, problems, otype = await _price_cart(body.items)
    return {"lines": _clean(lines), "problems": problems, "order_type": otype,
            "subtotal": round(sum(ln["line_total"] for ln in lines), 2)}


class Customer(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str
    email: Optional[str] = Field(default=None, max_length=120)

    @field_validator("phone")
    @classmethod
    def phone_ok(cls, v):
        if not PHONE_RE.match(v.strip()):
            raise ValueError("Enter a valid phone number")
        return v.strip()

    @field_validator("email")
    @classmethod
    def email_ok(cls, v):
        if v and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v.strip()):
            raise ValueError("Enter a valid email")
        return v.strip() if v else None


class OrderIn(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=80)
    items: List[CartItem] = Field(min_length=1, max_length=60)
    fulfillment: str
    customer: Customer
    address: Optional[str] = Field(default=None, max_length=400)
    note: Optional[str] = Field(default=None, max_length=500)
    preorder_date: Optional[str] = None
    payment_method: Optional[str] = None


async def _release(reserved):
    for pid, qty, name in reserved:
        await db.products.update_one({"id": pid}, {"$inc": {"stock": qty}})


async def release_capacity(items):
    for key, qty in items:
        await db.preorder_capacity.update_one({"key": key}, {"$inc": {"used": -qty}})


def _order_ref():
    return "NN-" + datetime.now(MANILA).strftime("%y%m%d") + "-" + secrets.token_hex(2).upper()


@api.post("/orders")
async def create_order(body: OrderIn, bg: BackgroundTasks, member=Depends(optional_member)):
    existing = await db.orders.find_one({"idempotency_key": body.idempotency_key}, {"_id": 0})
    if existing:
        return {"ref": existing["ref"], "track_token": existing["track_token"], "status": existing["status"], "duplicate": True}
    s = await get_settings()
    if not s.get("accepting_orders", True):
        raise HTTPException(409, "Online orders are paused right now. Please contact Nas&Neq directly.")
    if body.fulfillment not in FULFILLMENT_KEYS or not s["services"][body.fulfillment].get("enabled"):
        raise HTTPException(400, "This service method is not available for online orders yet.")
    lines, problems, otype = await _price_cart(body.items)
    if problems:
        raise HTTPException(409, {"message": problems[0]["message"], "problems": problems})
    subtotal = round(sum(ln["line_total"] for ln in lines), 2)
    delivery_fee = 0.0
    if body.fulfillment in ("delivery", "contactless"):
        d = s["services"]["delivery"]
        if not (body.address and len(body.address.strip()) >= 8):
            raise HTTPException(400, "Please enter a complete delivery address.")
        if d.get("min_order") and subtotal < float(d["min_order"]):
            raise HTTPException(400, f"Delivery requires a minimum order of ₱{float(d['min_order']):,.2f}.")
        delivery_fee = float(d.get("fee") or 0)
    if body.payment_method and not s["payments"].get(body.payment_method, {}).get("enabled"):
        raise HTTPException(400, "That payment method is not available.")
    pdate = None
    cap_reserved = []
    if otype == "preorder":
        if not body.preorder_date:
            raise HTTPException(400, "Please choose a pre-order date.")
        try:
            pdate = datetime.strptime(body.preorder_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(400, "Invalid pre-order date.")
        for ln in lines:
            if ln["is_packaging"]:
                continue
            pre = ln["_p"]["preorder"]
            earliest = manila_today() + timedelta(days=int(pre.get("lead_days") or 0))
            if pdate < earliest:
                raise HTTPException(400, f"{ln['name']} needs at least {pre.get('lead_days') or 0} day(s) notice — earliest date is {earliest.isoformat()}.")
        for ln in lines:
            pre = ln["_p"].get("preorder") or {}
            if ln["is_packaging"] or not pre.get("daily_capacity"):
                continue
            key, cap = f"{ln['product_id']}|{pdate.isoformat()}", int(pre["daily_capacity"])
            await db.preorder_capacity.update_one({"key": key}, {"$setOnInsert": {"key": key, "used": 0}}, upsert=True)
            ok = await db.preorder_capacity.find_one_and_update({"key": key, "used": {"$lte": cap - ln["qty"]}},
                                                                {"$inc": {"used": ln["qty"]}})
            if not ok:
                await release_capacity(cap_reserved)
                cur = await db.preorder_capacity.find_one({"key": key}) or {}
                left = max(0, cap - cur.get("used", 0))
                raise HTTPException(409, f"Only {left} {ln['name']} can still be pre-ordered for {pdate.isoformat()}.")
            cap_reserved.append([key, ln["qty"]])
    # Reserve stock atomically (regular orders only)
    reserved = []
    for ln in lines:
        if not ln["track_stock"]:
            continue
        res = await db.products.find_one_and_update(
            {"id": ln["product_id"], "track_stock": True, "stock": {"$gte": ln["qty"]}}, {"$inc": {"stock": -ln["qty"]}})
        if not res:
            await _release(reserved)
            raise HTTPException(409, {"message": f"Sorry, {ln['name']} just sold out or has fewer left than requested.",
                                      "problems": [{"product_id": ln["product_id"], "message": "Not enough stock"}]})
        reserved.append((ln["product_id"], ln["qty"], ln["name"]))
    ts = now_iso()
    order = {
        "id": new_id(), "ref": _order_ref(), "track_token": secrets.token_urlsafe(24),
        "idempotency_key": body.idempotency_key, "user_id": member["user_id"] if member else None,
        "type": otype, "customer": body.customer.model_dump(), "fulfillment": body.fulfillment,
        "address": body.address.strip() if body.address and body.fulfillment in ("delivery", "contactless") else None,
        "note": (body.note or "").strip(), "preorder_date": pdate.isoformat() if pdate else None,
        "items": _clean(lines), "subtotal": subtotal, "delivery_fee": delivery_fee,
        "total": round(subtotal + delivery_fee, 2), "currency": "PHP",
        "payment_method": body.payment_method, "payment_status": "pending",
        "status": "pending", "stock_reserved": bool(reserved), "capacity_reserved": cap_reserved,
        "history": [{"kind": "status", "to": "pending", "at": ts, "by": "customer", "note": "Order request received"}],
        "notifications": [], "created_at": ts, "updated_at": ts,
    }
    try:
        await db.orders.insert_one(order)
    except DuplicateKeyError:
        await _release(reserved)
        await release_capacity(cap_reserved)
        ex = await db.orders.find_one({"idempotency_key": body.idempotency_key}, {"_id": 0})
        if not ex:
            raise HTTPException(500, "Could not create the order. Please try again.")
        return {"ref": ex["ref"], "track_token": ex["track_token"], "status": ex["status"], "duplicate": True}
    for pid, qty, name in reserved:
        await db.stock_moves.insert_one({"id": new_id(), "product_id": pid, "product_name": name, "delta": -qty,
                                         "reason": f"Reserved by order {order['ref']}", "order_ref": order["ref"],
                                         "by": "system", "at": ts})
    bg.add_task(notify_owner_order, order["id"])
    return {"ref": order["ref"], "track_token": order["track_token"], "status": "pending", "duplicate": False}


async def notify_owner_order(order_id: str):
    o = await db.orders.find_one({"id": order_id}, {"_id": 0})
    s = await get_settings()
    to = s.get("notify_email")
    if not to:
        return
    kind = "pre-order" if o["type"] == "preorder" else "order"
    lines = [f"Reference: {o['ref']}", f"Customer: {o['customer']['name']} · {o['customer']['phone']}",
             f"Service: {o['fulfillment'].replace('_', ' ')}" + (f" · date {o['preorder_date']}" if o.get("preorder_date") else ""),
             *[f"{i['qty']} × {i['name']} — ₱{i['line_total']:,.2f}" for i in o["items"]], f"Total: ₱{o['total']:,.2f}"]
    res = await send_email(to=to, subject=f"New {kind} request {o['ref']}", html=email_template(
        f"New {kind} request", lines, "/admin", "Open dashboard"))
    await db.orders.update_one({"id": order_id}, {"$push": {"notifications": {"to": "owner", **res}}})


def customer_view(o: dict) -> dict:
    return {"ref": o["ref"], "type": o["type"], "status": o["status"], "status_label": STATUS_LABEL[o["status"]],
            "payment_status": o["payment_status"], "fulfillment": o["fulfillment"], "preorder_date": o.get("preorder_date"),
            "items": [{k: i[k] for k in ("name", "qty", "unit_price", "line_total", "is_packaging")} for i in o["items"]],
            "subtotal": o["subtotal"], "delivery_fee": o["delivery_fee"], "total": o["total"],
            "customer_name": o["customer"]["name"], "created_at": o["created_at"], "updated_at": o["updated_at"],
            "track_token": o["track_token"],
            "history": [{"to": h["to"], "kind": h["kind"], "at": h["at"], "note": h.get("public_note", "")}
                        for h in o["history"]]}


@api.get("/orders/track/{token}")
async def track(token: str):
    if len(token) < 20:
        raise HTTPException(404, "Order not found")
    o = await db.orders.find_one({"track_token": token}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    return customer_view(o)


# ---------------- Made-to-order inquiries ----------------
class InquiryIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str
    email: Optional[str] = Field(default=None, max_length=120)
    products: List[str] = Field(min_length=1, max_length=9)
    quantity: Optional[str] = Field(default=None, max_length=60)
    preferred_date: Optional[str] = Field(default=None, max_length=20)
    service: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("phone")
    @classmethod
    def phone_ok(cls, v):
        if not PHONE_RE.match(v.strip()):
            raise ValueError("Enter a valid phone number")
        return v.strip()

    @field_validator("email")
    @classmethod
    def email_ok(cls, v):
        if v and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v.strip()):
            raise ValueError("Enter a valid email")
        return v.strip() if v else None


@api.post("/inquiries")
async def create_inquiry(body: InquiryIn, bg: BackgroundTasks, member=Depends(optional_member)):
    names = {p["name"] for p in await db.products.find({"category": "made-to-order"}, {"name": 1}).to_list(100)}
    if any(x not in names for x in body.products):
        raise HTTPException(400, "Please choose products from the made-to-order list.")
    if body.service and body.service not in ("pickup", "takeout", "delivery"):
        raise HTTPException(400, "Invalid service preference")
    doc = {"id": new_id(), "ref": "INQ-" + secrets.token_hex(3).upper(), **body.model_dump(),
           "user_id": member["user_id"] if member else None, "status": "new", "created_at": now_iso(), "notifications": []}
    await db.inquiries.insert_one(doc)
    bg.add_task(notify_owner_inquiry, doc["id"])
    return {"ref": doc["ref"], "status": "new"}


async def notify_owner_inquiry(iid: str):
    q = await db.inquiries.find_one({"id": iid}, {"_id": 0})
    to = (await get_settings()).get("notify_email")
    if not to:
        return
    res = await send_email(to=to, subject=f"New made-to-order inquiry {q['ref']}", html=email_template(
        "New made-to-order inquiry", [f"From: {q['name']} · {q['phone']}", f"Products: {', '.join(q['products'])}",
                                     f"Quantity: {q.get('quantity') or '—'}", f"Preferred date: {q.get('preferred_date') or '—'}",
                                     f"Service: {q.get('service') or '—'}", f"Notes: {q.get('notes') or '—'}"],
        "/admin", "Open dashboard"))
    await db.inquiries.update_one({"id": iid}, {"$push": {"notifications": res}})


# ---------------- Customer account ----------------
class ProfileIn(BaseModel):
    name: str = Field(default="", max_length=80)
    phone: str = Field(default="", max_length=20)


@api.get("/me")
async def me(member=Depends(current_member)):
    return {k: member.get(k) for k in ("user_id", "role", "email", "name", "phone", "favorites")}


@api.put("/me")
async def update_me(body: ProfileIn, member=Depends(current_member)):
    if body.phone and not PHONE_RE.match(body.phone):
        raise HTTPException(400, "Enter a valid phone number")
    await db.users.update_one({"user_id": member["user_id"]}, {"$set": {"name": body.name.strip(), "phone": body.phone.strip()}})
    return {"ok": True}


@api.get("/me/orders")
async def my_orders(member=Depends(current_member)):
    orders = await db.orders.find({"user_id": member["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [customer_view(o) for o in orders]


class FavIn(BaseModel):
    product_ids: List[str] = Field(max_length=200)


@api.put("/me/favorites")
async def set_favorites(body: FavIn, member=Depends(current_member)):
    valid = {p["id"] for p in await db.products.find({"id": {"$in": body.product_ids}}, {"id": 1}).to_list(200)}
    favs = [x for x in dict.fromkeys(body.product_ids) if x in valid]
    await db.users.update_one({"user_id": member["user_id"]}, {"$set": {"favorites": favs}})
    return {"favorites": favs}


app.include_router(api)
app.include_router(clerk_router)
from admin import admin_router  # noqa: E402
app.include_router(admin_router)
from summary import summary_router  # noqa: E402
app.include_router(summary_router)

app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    await seed()
    try:
        init_storage()
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
