import csv
import io
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
import asyncio

from core import (db, now_iso, new_id, require_admin, store_image, product_status, get_settings, send_email,
                  email_template, MANILA, ROLES, RANK, IN_ENV, effective_role)
from seed import CATEGORY_SLUGS, CATEGORIES

admin_router = APIRouter(prefix="/api")
A = Depends(require_admin)

TRANSITIONS = {
    "pending": ["accepted", "rejected", "cancelled"],
    "accepted": ["preparing", "ready", "out_for_delivery", "cancelled"],
    "preparing": ["ready", "out_for_delivery", "cancelled"],
    "ready": ["completed", "out_for_delivery", "cancelled"],
    "out_for_delivery": ["completed", "cancelled"],
    "completed": [], "rejected": [], "cancelled": [],
}
PAY_TRANSITIONS = {"pending": ["paid", "failed"], "failed": ["paid", "pending"], "paid": ["refunded"], "refunded": []}
STATUS_LABEL = {"pending": "Pending review", "accepted": "Accepted", "preparing": "Preparing", "ready": "Ready",
                "out_for_delivery": "Out for delivery", "completed": "Completed", "rejected": "Rejected", "cancelled": "Cancelled"}


# ---------------- Products ----------------
class PreorderCfg(BaseModel):
    enabled: bool = False
    lead_days: Optional[int] = Field(default=None, ge=0, le=60)
    max_qty: Optional[int] = Field(default=None, ge=1, le=1000)
    daily_capacity: Optional[int] = Field(default=None, ge=1, le=10000)


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str
    price: Optional[float] = Field(default=None, ge=0, le=100000)
    description: str = Field(default="", max_length=600)
    notes: str = Field(default="", max_length=300)
    options: List[str] = Field(default_factory=list, max_length=30)
    kind: str = "regular"
    is_packaging: bool = False
    is_drink: bool = False
    available: bool = True
    hidden: bool = False
    image_path: Optional[str] = None
    thumb_path: Optional[str] = None
    image_source: Optional[str] = None
    track_stock: bool = False
    low_threshold: int = Field(default=0, ge=0, le=100000)
    preorder: PreorderCfg = Field(default_factory=PreorderCfg)


async def _validate_product(body: ProductIn):
    if body.category not in CATEGORY_SLUGS:
        raise HTTPException(400, "Unknown category")
    if body.kind not in ("regular", "inquiry"):
        raise HTTPException(400, "Invalid product type")
    if body.kind == "regular" and body.price is None:
        raise HTTPException(400, "Regular menu items need a price")
    if body.preorder.enabled:
        if body.price is None:
            raise HTTPException(400, "Set a confirmed price before enabling pre-orders")
        if body.preorder.lead_days is None:
            raise HTTPException(400, "Set the minimum lead time (days) for pre-orders")
    if body.image_path:
        ok = await db.image_drafts.find_one({"image_path": body.image_path}) or \
            await db.products.find_one({"image_path": body.image_path})
        if not ok:
            raise HTTPException(400, "Unknown image")


@admin_router.get("/admin/products")
async def list_products(_=A):
    prods = await db.products.find({}, {"_id": 0}).sort("sort", 1).to_list(1000)
    return [{**p, "status": product_status(p)} for p in prods]


@admin_router.post("/admin/products")
async def create_product(body: ProductIn, admin=A):
    await _validate_product(body)
    last = await db.products.find_one({}, sort=[("sort", -1)])
    doc = {"id": new_id(), **body.model_dump(), "options": [o.strip() for o in body.options if o.strip()],
           "stock": 0, "sort": (last["sort"] + 1) if last else 1, "created_at": now_iso(), "updated_at": now_iso()}
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    return doc


@admin_router.put("/admin/products/{pid}")
async def update_product(pid: str, body: ProductIn, admin=A):
    await _validate_product(body)
    data = {**body.model_dump(), "options": [o.strip() for o in body.options if o.strip()], "updated_at": now_iso()}
    doc = await db.products.find_one_and_update({"id": pid}, {"$set": data}, projection={"_id": 0},
                                                return_document=ReturnDocument.AFTER)
    if not doc:
        raise HTTPException(404, "Not found")
    return doc


@admin_router.delete("/admin/products/{pid}")
async def delete_product(pid: str, _=A):
    if (await db.products.delete_one({"id": pid})).deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


class ReorderIn(BaseModel):
    ids: List[str]


@admin_router.post("/admin/products/reorder")
async def reorder(body: ReorderIn, _=A):
    for i, pid in enumerate(body.ids):
        await db.products.update_one({"id": pid}, {"$set": {"sort": i + 1}})
    return {"ok": True}


ALLOWED = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


@admin_router.post("/admin/upload")
async def upload(file: UploadFile = File(...), admin=A):
    if file.content_type not in ALLOWED:
        raise HTTPException(400, "Please upload a JPG, PNG or WebP image")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Image is larger than 10 MB")
    try:
        paths = await asyncio.to_thread(store_image, data, "uploads")
    except Exception:
        raise HTTPException(400, "This file could not be read as an image")
    await db.image_drafts.insert_one({**paths, "source": "owner_upload", "by": admin["user_id"], "at": now_iso()})
    return {**paths, "image_source": "owner_upload"}


@admin_router.post("/admin/products/{pid}/generate-image")
async def gen_image(pid: str, admin=A):
    from imagegen import generate_image_bytes
    p = await db.products.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    try:
        raw = await generate_image_bytes(p)
        paths = await asyncio.to_thread(store_image, raw, "generated")
    except Exception:
        raise HTTPException(502, "Image generation failed — please try again")
    await db.image_drafts.insert_one({**paths, "source": "ai_illustrative", "by": admin["user_id"], "at": now_iso()})
    return {**paths, "image_source": "ai_illustrative"}


# ---------------- Inventory ----------------
class StockIn(BaseModel):
    mode: str
    value: int = Field(ge=-100000, le=100000)
    reason: str = Field(min_length=2, max_length=200)


async def _apply_stock(pid, mode, value, reason, admin):
    p = await db.products.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    if mode == "set":
        if value < 0:
            raise HTTPException(400, "Stock cannot be negative")
        doc = await db.products.find_one_and_update({"id": pid}, {"$set": {"stock": value, "track_stock": True}},
                                                    return_document=ReturnDocument.BEFORE, projection={"_id": 0})
        delta = value - (doc.get("stock") or 0)
    elif mode == "adjust":
        doc = await db.products.find_one_and_update({"id": pid, "stock": {"$gte": -value}},
                                                    {"$inc": {"stock": value}, "$set": {"track_stock": True}},
                                                    projection={"_id": 0})
        if not doc:
            raise HTTPException(400, "That adjustment would make stock negative")
        delta = value
    else:
        raise HTTPException(400, "Invalid mode")
    await db.stock_moves.insert_one({"id": new_id(), "product_id": pid, "product_name": p["name"], "delta": delta,
                                     "reason": reason, "by": admin.get("email") or admin["user_id"], "at": now_iso()})


@admin_router.post("/admin/products/{pid}/stock")
async def stock(pid: str, body: StockIn, admin=A):
    await _apply_stock(pid, body.mode, body.value, body.reason, admin)
    return await db.products.find_one({"id": pid}, {"_id": 0})


class BulkItem(BaseModel):
    id: str
    stock: int = Field(ge=0, le=100000)


class BulkIn(BaseModel):
    items: List[BulkItem] = Field(max_length=200)
    reason: str = Field(min_length=2, max_length=200)


@admin_router.post("/admin/stock/bulk")
async def bulk_stock(body: BulkIn, admin=A):
    for it in body.items:
        await _apply_stock(it.id, "set", it.stock, body.reason, admin)
    return {"ok": True, "count": len(body.items)}


@admin_router.get("/admin/stock-moves")
async def stock_moves(product_id: Optional[str] = None, _=A):
    q = {"product_id": product_id} if product_id else {}
    return await db.stock_moves.find(q, {"_id": 0}).sort("at", -1).to_list(300)


# ---------------- Orders ----------------
def _range(frm: Optional[str], to: Optional[str]):
    q = {}
    if frm:
        q["$gte"] = datetime.strptime(frm, "%Y-%m-%d").replace(tzinfo=MANILA).astimezone(timezone.utc).isoformat()
    if to:
        q["$lt"] = (datetime.strptime(to, "%Y-%m-%d").replace(tzinfo=MANILA) + timedelta(days=1)).astimezone(timezone.utc).isoformat()
    return q


@admin_router.get("/admin/orders")
async def list_orders(q: Optional[str] = None, status: Optional[str] = None, fulfillment: Optional[str] = None,
                      payment: Optional[str] = None, type: Optional[str] = None, frm: Optional[str] = Query(None, alias="from"),
                      to: Optional[str] = None, product_id: Optional[str] = None, category: Optional[str] = None, _=A):
    f = {}
    if q:
        f["$or"] = [{"ref": {"$regex": q.strip(), "$options": "i"}}, {"customer.name": {"$regex": q.strip(), "$options": "i"}},
                    {"customer.phone": {"$regex": q.strip(), "$options": "i"}}]
    if status:
        f["status"] = {"$in": status.split(",")}
    if fulfillment:
        f["fulfillment"] = fulfillment
    if payment:
        f["payment_status"] = {"$in": payment.split(",")}
    if type:
        f["type"] = type
    if product_id:
        f["items.product_id"] = product_id
    if category:
        f["items.category"] = category
    r = _range(frm, to)
    if r:
        f["created_at"] = r
    return await db.orders.find(f, {"_id": 0, "track_token": 0, "idempotency_key": 0}).sort("created_at", -1).to_list(500)


@admin_router.get("/admin/orders/{oid}")
async def get_order(oid: str, _=A):
    o = await db.orders.find_one({"id": oid}, {"_id": 0, "idempotency_key": 0})
    if not o:
        raise HTTPException(404, "Not found")
    o["allowed_next"] = _allowed(o)
    o["allowed_payment"] = PAY_TRANSITIONS[o["payment_status"]]
    return o


def _allowed(o):
    nxt = TRANSITIONS[o["status"]]
    if o["fulfillment"] not in ("delivery", "contactless"):
        nxt = [s for s in nxt if s != "out_for_delivery"]
    return nxt


class StatusIn(BaseModel):
    status: str
    note: str = Field(default="", max_length=300)
    public_note: str = Field(default="", max_length=300)


async def _notify_customer(oid: str):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    s = await get_settings()
    email = o["customer"].get("email")
    if not email or not s.get("notify_customers", True):
        return
    res = await send_email(to=email, subject=f"Nas&Neq order {o['ref']}: {STATUS_LABEL[o['status']]}", html=email_template(
        f"Your order is now: {STATUS_LABEL[o['status']]}",
        [f"Hi {o['customer']['name']},", f"Order {o['ref']} was updated to '{STATUS_LABEL[o['status']]}'.",
         f"Total: ₱{o['total']:,.2f} · Payment: {o['payment_status']}"],
        f"/track/{o['track_token']}", "Track your order"))
    await db.orders.update_one({"id": oid}, {"$push": {"notifications": {"to": "customer", "status": o["status"], **res}}})


@admin_router.post("/admin/orders/{oid}/status")
async def set_status(oid: str, body: StatusIn, bg: BackgroundTasks, admin=A):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Not found")
    if body.status not in _allowed(o):
        raise HTTPException(409, f"Cannot move from {STATUS_LABEL[o['status']]} to {STATUS_LABEL.get(body.status, body.status)}")
    ts = now_iso()
    h = {"kind": "status", "from": o["status"], "to": body.status, "at": ts, "by": admin.get("email") or admin["user_id"],
         "note": body.note, "public_note": body.public_note}
    upd = await db.orders.find_one_and_update({"id": oid, "status": o["status"]},
                                              {"$set": {"status": body.status, "updated_at": ts}, "$push": {"history": h}})
    if not upd:
        raise HTTPException(409, "This order was changed by someone else — refresh and try again")
    if body.status in ("rejected", "cancelled"):
        cap = await db.orders.find_one_and_update({"id": oid, "capacity_reserved.0": {"$exists": True}},
                                                  {"$set": {"capacity_reserved": []}})
        if cap:
            for key, qty in cap["capacity_reserved"]:
                await db.preorder_capacity.update_one({"key": key}, {"$inc": {"used": -qty}})
        rel = await db.orders.find_one_and_update({"id": oid, "stock_reserved": True}, {"$set": {"stock_reserved": False}})
        if rel:
            for it in rel["items"]:
                if it.get("track_stock"):
                    await db.products.update_one({"id": it["product_id"]}, {"$inc": {"stock": it["qty"]}})
                    await db.stock_moves.insert_one({"id": new_id(), "product_id": it["product_id"], "product_name": it["name"],
                                                     "delta": it["qty"], "reason": f"Restored — order {o['ref']} {body.status}",
                                                     "order_ref": o["ref"], "by": h["by"], "at": ts})
    bg.add_task(_notify_customer, oid)
    return await get_order(oid)


class PayIn(BaseModel):
    payment_status: str
    method: str = Field(default="", max_length=60)
    note: str = Field(default="", max_length=300)


@admin_router.post("/admin/orders/{oid}/payment")
async def set_payment(oid: str, body: PayIn, admin=A):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Not found")
    if body.payment_status not in PAY_TRANSITIONS[o["payment_status"]]:
        raise HTTPException(409, f"Cannot change payment from {o['payment_status']} to {body.payment_status}")
    ts = now_iso()
    h = {"kind": "payment", "from": o["payment_status"], "to": body.payment_status, "at": ts,
         "by": admin.get("email") or admin["user_id"], "note": body.note}
    sets = {"payment_status": body.payment_status, "updated_at": ts}
    if body.payment_status == "paid":
        sets["paid_at"] = ts
        sets["payment_method"] = body.method or o.get("payment_method") or "recorded by owner"
    upd = await db.orders.find_one_and_update({"id": oid, "payment_status": o["payment_status"]}, {"$set": sets, "$push": {"history": h}})
    if not upd:
        raise HTTPException(409, "Payment was changed by someone else — refresh and try again")
    return await get_order(oid)


class RescheduleIn(BaseModel):
    date: str
    note: str = Field(default="", max_length=300)


@admin_router.post("/admin/orders/{oid}/reschedule")
async def reschedule(oid: str, body: RescheduleIn, admin=A):
    try:
        datetime.strptime(body.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Invalid date")
    o = await db.orders.find_one({"id": oid, "type": "preorder"}, {"_id": 0})
    if not o or o["status"] in ("completed", "rejected", "cancelled"):
        raise HTTPException(409, "Only open pre-orders can be rescheduled")
    h = {"kind": "reschedule", "from": o["preorder_date"], "to": body.date, "at": now_iso(),
         "by": admin.get("email") or admin["user_id"], "note": body.note, "public_note": f"Rescheduled to {body.date}"}
    moved = []
    for key, qty in o.get("capacity_reserved") or []:
        new_key = f"{key.split('|')[0]}|{body.date}"
        await db.preorder_capacity.update_one({"key": key}, {"$inc": {"used": -qty}})
        await db.preorder_capacity.update_one({"key": new_key}, {"$inc": {"used": qty}}, upsert=True)
        moved.append([new_key, qty])
    await db.orders.update_one({"id": oid}, {"$set": {"preorder_date": body.date, "capacity_reserved": moved, "updated_at": now_iso()},
                                             "$push": {"history": h}})
    return await get_order(oid)


@admin_router.get("/admin/preorders")
async def preorder_calendar(frm: Optional[str] = Query(None, alias="from"), to: Optional[str] = None, _=A):
    m = {"type": "preorder", "status": {"$nin": ["rejected", "cancelled"]}}
    if frm or to:
        m["preorder_date"] = {k: v for k, v in (("$gte", frm), ("$lte", to)) if v}
    rows = await db.orders.aggregate([{"$match": m}, {"$unwind": "$items"}, {"$match": {"items.is_packaging": False}},
                                      {"$group": {"_id": {"d": "$preorder_date", "p": "$items.product_id", "n": "$items.name"},
                                                  "qty": {"$sum": "$items.qty"}, "orders": {"$addToSet": "$ref"}}},
                                      {"$sort": {"_id.d": 1}}]).to_list(1000)
    caps = {p["id"]: (p.get("preorder") or {}).get("daily_capacity") for p in await db.products.find({}, {"id": 1, "preorder": 1}).to_list(1000)}
    return [{"date": r["_id"]["d"], "product_id": r["_id"]["p"], "name": r["_id"]["n"], "qty": r["qty"],
             "capacity": caps.get(r["_id"]["p"]), "orders": r["orders"]} for r in rows]


# ---------------- Inquiries, flags, settings ----------------
@admin_router.get("/admin/inquiries")
async def inquiries(_=A):
    return await db.inquiries.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


class InqStatus(BaseModel):
    status: str


@admin_router.post("/admin/inquiries/{iid}/status")
async def inquiry_status(iid: str, body: InqStatus, _=A):
    if body.status not in ("new", "contacted", "closed"):
        raise HTTPException(400, "Invalid status")
    if (await db.inquiries.update_one({"id": iid}, {"$set": {"status": body.status}})).matched_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


@admin_router.get("/admin/flags")
async def flags(_=A):
    return await db.flags.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)


class FlagIn(BaseModel):
    resolved: bool
    resolution: str = Field(default="", max_length=500)


@admin_router.post("/admin/flags/{fid}")
async def resolve_flag(fid: str, body: FlagIn, admin=A):
    r = await db.flags.update_one({"id": fid}, {"$set": {"resolved": body.resolved, "resolution": body.resolution,
                                                         "resolved_by": admin.get("email"), "resolved_at": now_iso()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


@admin_router.get("/admin/settings")
async def get_admin_settings(_=A):
    return await get_settings()


@admin_router.put("/admin/settings")
async def put_settings(body: dict, _=A):
    cur = await get_settings()
    sv = body.get("services", {})
    for k in cur["services"]:
        if k in sv and isinstance(sv[k], dict):
            for f in ("enabled", "fee", "min_order", "coverage", "hours", "instructions"):
                if f in sv[k] and f in cur["services"][k]:
                    cur["services"][k][f] = sv[k][f]
    d = cur["services"]["delivery"]
    for f in ("fee", "min_order"):
        if d[f] in ("", None):
            d[f] = None
        else:
            try:
                d[f] = float(d[f])
                assert d[f] >= 0
            except Exception:
                raise HTTPException(400, f"Delivery {f.replace('_', ' ')} must be a positive number")
    if d["enabled"] and (d["fee"] is None or not (d.get("coverage") or "").strip()):
        raise HTTPException(400, "To enable delivery, enter the delivery fee and coverage area first")
    c = cur["services"]["contactless"]
    if c["enabled"] and (not d["enabled"] or not (c.get("instructions") or "").strip()):
        raise HTTPException(400, "Contactless delivery needs delivery enabled and instructions entered")
    if "payments" in body:
        cur["payments"]["cash"]["enabled"] = bool(body["payments"].get("cash", {}).get("enabled"))
    for f in ("accepting_orders", "notify_customers", "daily_summary"):
        if f in body:
            cur[f] = bool(body[f])
    if "notify_email" in body:
        cur["notify_email"] = str(body["notify_email"] or "").strip()[:120]
    if "hours_text" in body:
        cur["hours_text"] = str(body["hours_text"] or "").strip()[:80]
    await db.settings.replace_one({"id": "main"}, cur)
    return cur


# ---------------- Analytics ----------------
CLOSED = ("rejected", "cancelled")


def _recognized(o):
    return o["status"] == "completed" and o["payment_status"] != "refunded"


@admin_router.get("/admin/analytics")
async def analytics(frm: Optional[str] = Query(None, alias="from"), to: Optional[str] = None, _=A):
    f = {}
    r = _range(frm, to)
    if r:
        f["created_at"] = r
    orders = await db.orders.find(f, {"_id": 0}).to_list(20000)
    counts = {s: 0 for s in STATUS_LABEL}
    for o in orders:
        counts[o["status"]] += 1
    open_orders = [o for o in orders if o["status"] not in CLOSED]
    rec = [o for o in orders if _recognized(o)]
    recognized = round(sum(o["total"] for o in rec), 2)
    refunds = round(sum(o["total"] for o in orders if o["payment_status"] == "refunded"), 2)
    paid = round(sum(o["total"] for o in orders if o["payment_status"] == "paid"), 2)
    outstanding = round(sum(o["total"] for o in open_orders if o["payment_status"] in ("pending", "failed")), 2)
    by_day = {}
    for o in orders:
        d = datetime.fromisoformat(o["created_at"]).astimezone(MANILA).date().isoformat()
        x = by_day.setdefault(d, {"date": d, "orders": 0, "gross": 0.0, "recognized": 0.0})
        x["orders"] += 1
        x["gross"] = round(x["gross"] + o["total"], 2)
        if _recognized(o):
            x["recognized"] = round(x["recognized"] + o["total"], 2)
    prods = await db.products.find({}, {"_id": 0}).to_list(1000)
    top = {p["id"]: {"product_id": p["id"], "name": p["name"], "category": p["category"], "qty": 0, "revenue": 0.0}
           for p in prods if not p.get("is_packaging")}
    cats = {c["slug"]: {"category": c["slug"], "name": c["name"], "qty": 0, "revenue": 0.0} for c in CATEGORIES}
    for o in rec:
        for it in o["items"]:
            t = top.setdefault(it["product_id"], {"product_id": it["product_id"], "name": it["name"],
                                                  "category": it["category"], "qty": 0, "revenue": 0.0})
            t["qty"] += it["qty"]
            t["revenue"] = round(t["revenue"] + it["line_total"], 2)
            if it["category"] in cats:
                cats[it["category"]]["qty"] += it["qty"]
                cats[it["category"]]["revenue"] = round(cats[it["category"]]["revenue"] + it["line_total"], 2)
    by_ful, by_pay = {}, {}
    for o in orders:
        by_ful[o["fulfillment"]] = by_ful.get(o["fulfillment"], 0) + 1
        by_pay[o["payment_status"]] = by_pay.get(o["payment_status"], 0) + 1
    pre = [o for o in orders if o["type"] == "preorder"]
    return {
        "period": {"from": frm, "to": to, "timezone": "Asia/Manila (UTC+8)"},
        "generated_at": now_iso(),
        "gross_order_value": round(sum(o["total"] for o in orders), 2),
        "open_order_value": round(sum(o["total"] for o in open_orders), 2),
        "net_sales": recognized, "refunds": refunds, "payments_received": paid, "outstanding": outstanding,
        "counts": {**counts, "received": len(orders)},
        "aov": round(recognized / len(rec), 2) if rec else 0,
        "preorders": {"requests": len(pre), "accepted": len([o for o in pre if o["status"] not in ("pending", *CLOSED)]),
                      "payments": round(sum(o["total"] for o in pre if o["payment_status"] == "paid"), 2)},
        "inventory": {"low_stock": len([p for p in prods if product_status(p) == "low_stock"]),
                      "sold_out": len([p for p in prods if product_status(p) == "sold_out"])},
        "by_day": sorted(by_day.values(), key=lambda x: x["date"]),
        "top_products": sorted(top.values(), key=lambda x: (-x["revenue"], -x["qty"], x["name"])),
        "categories": list(cats.values()),
        "by_fulfillment": by_ful, "by_payment": by_pay,
        "definitions": {
            "gross_order_value": "Sum of totals of ALL orders placed in the period, any status (not money received).",
            "net_sales": "Sum of totals of Completed orders, excluding refunded orders.",
            "payments_received": "Sum of totals of orders whose payment the owner recorded as Paid (refunded excluded).",
            "outstanding": "Totals of open (not rejected/cancelled) orders with payment Pending or Failed.",
            "refunds": "Totals of orders whose payment was recorded as Refunded.",
            "aov": "Net sales ÷ number of completed, non-refunded orders.",
            "top_products": "Ranked by revenue from completed, non-refunded orders only.",
        },
    }


@admin_router.get("/admin/analytics/export.csv")
async def export_csv(frm: Optional[str] = Query(None, alias="from"), to: Optional[str] = None, _=A):
    f = {}
    r = _range(frm, to)
    if r:
        f["created_at"] = r
    orders = await db.orders.find(f, {"_id": 0}).sort("created_at", 1).to_list(20000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["ref", "created_at_manila", "type", "status", "payment_status", "fulfillment", "customer", "item",
                "qty", "unit_price", "line_total", "order_total", "counts_in_net_sales"])
    for o in orders:
        ts = datetime.fromisoformat(o["created_at"]).astimezone(MANILA).strftime("%Y-%m-%d %H:%M")
        for it in o["items"]:
            w.writerow([o["ref"], ts, o["type"], o["status"], o["payment_status"], o["fulfillment"], o["customer"]["name"],
                        it["name"], it["qty"], f"{it['unit_price']:.2f}", f"{it['line_total']:.2f}", f"{o['total']:.2f}",
                        "yes" if _recognized(o) else "no"])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename=nasneq-orders-{frm or 'all'}-{to or 'all'}.csv"})


# ---------------- Users ----------------
@admin_router.get("/users")
async def list_users(admin=A):
    people = await db.users.find(IN_ENV, {"_id": 0, "favorites": 0}).to_list(1000)
    return {"roles": [r for r in ROLES if RANK[r] <= RANK[admin["role"]]],
            "users": [{**p, "role": effective_role(p.get("role"))} for p in people]}


class RoleIn(BaseModel):
    role: str


@admin_router.patch("/users/{user_id}/role")
async def set_role(user_id: str, body: RoleIn, admin=A):
    if body.role not in ROLES or RANK[body.role] > RANK[admin["role"]]:
        raise HTTPException(403, "Not allowed")
    target = await db.users.find_one({"user_id": user_id, **IN_ENV}, {"_id": 0})
    if target is None:
        raise HTTPException(404, "Not found")
    if (effective_role(target.get("role")) == "admin" and body.role != "admin"
            and await db.users.count_documents({"role": "admin", **IN_ENV}) <= 1):
        raise HTTPException(409, "Keep at least one admin")
    await db.users.update_one({"user_id": user_id}, {"$set": {"role": body.role}})
    return {"user_id": user_id, "role": body.role}
