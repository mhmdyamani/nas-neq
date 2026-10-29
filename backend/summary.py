import hmac
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pymongo.errors import DuplicateKeyError

from core import db, now_iso, get_settings, send_email, email_template, product_status, MANILA, require_admin
from admin import analytics, STATUS_LABEL
from fastapi import Depends

summary_router = APIRouter(prefix="/api")


def _peso(n):
    return f"₱{n:,.2f}"


async def send_daily_summary(day: str, trigger: str) -> dict:
    s = await get_settings()
    to = s.get("notify_email")
    if not to:
        return {"status": "skipped", "reason": "No alert email set"}
    a = await analytics(frm=day, to=day, _=None)
    start = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=MANILA)
    orders = await db.orders.find({"created_at": {
        "$gte": start.astimezone(timezone.utc).isoformat(),
        "$lt": (start + timedelta(days=1)).astimezone(timezone.utc).isoformat()}},
        {"_id": 0}).sort("created_at", 1).to_list(500)
    prods = await db.products.find({"track_stock": True}, {"_id": 0}).to_list(500)
    low = [p for p in prods if product_status(p) in ("low_stock", "sold_out")]
    open_pending = await db.orders.count_documents({"status": "pending"})
    c = a["counts"]
    lines = [
        f"Orders received: {c['received']}  (completed {c['completed']}, in progress "
        f"{c['accepted'] + c['preparing'] + c['ready'] + c['out_for_delivery']}, pending review {c['pending']}, "
        f"cancelled {c['cancelled']}, rejected {c['rejected']})",
        f"Gross order value (all orders placed): {_peso(a['gross_order_value'])}",
        f"Net sales (completed, not refunded): {_peso(a['net_sales'])}",
        f"Payments recorded as paid: {_peso(a['payments_received'])}",
        f"Outstanding (open orders not yet paid): {_peso(a['outstanding'])}",
    ]
    if a["preorders"]["requests"]:
        lines.append(f"Pre-order requests: {a['preorders']['requests']} ({a['preorders']['accepted']} accepted)")
    top = [p for p in a["top_products"] if p["qty"]][:5]
    lines.append("Top items (completed orders): " + ("; ".join(f"{p['name']} × {p['qty']}" for p in top) if top else "none"))
    lines.append("— Orders —" if orders else "No orders were placed on this day.")
    for o in orders[:40]:
        t = datetime.fromisoformat(o["created_at"]).astimezone(MANILA).strftime("%I:%M %p")
        lines.append(f"{t} · {o['ref']} · {o['customer']['name']} · {_peso(o['total'])} · {STATUS_LABEL[o['status']]} · payment {o['payment_status']}")
    if len(orders) > 40:
        lines.append(f"…and {len(orders) - 40} more in the dashboard.")
    lines.append("— Stock —")
    lines += [f"{p['name']}: {'SOLD OUT' if product_status(p) == 'sold_out' else str(p['stock']) + ' left'}" for p in low] or \
        ["No low-stock or sold-out items (only items with stock tracking are checked)."]
    if open_pending:
        lines.append(f"Orders still waiting for your review (all days): {open_pending}")
    res = await send_email(to=to, subject=f"Nas&Neq daily summary — {day}", html=email_template(
        f"Daily summary for {day}", lines, "/admin/orders", "Open dashboard"))
    await db.summary_log.insert_one({"day": day, "trigger": trigger, "to": to, **res})
    return res


def _manila_report_day() -> str:
    now = datetime.now(MANILA)
    # Runs shortly after midnight: report the day that just ended.
    return (now - timedelta(days=1) if now.hour < 12 else now).date().isoformat()


@summary_router.post("/cron/daily-summary")
async def cron_daily_summary(request: Request, bg: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not secret or not token or not hmac.compare_digest(token.encode(), secret.encode()):
        raise HTTPException(401, "Unauthorized")
    try:
        body = await request.json() if (await request.body()) else {}
    except Exception:
        raise HTTPException(400, "Invalid body")
    run_id = request.headers.get("x-webhook-id") or (body or {}).get("run_id") or ""
    day = _manila_report_day()
    s = await get_settings()
    if not s.get("daily_summary", True):
        return {"accepted": False, "reason": "disabled"}
    try:
        await db.cron_runs.insert_one({"key": f"daily-summary|{day}", "run_id": run_id, "at": now_iso()})
    except DuplicateKeyError:
        return {"accepted": True, "duplicate": True}
    bg.add_task(send_daily_summary, day, "schedule")
    return {"accepted": True, "day": day}


@summary_router.post("/admin/daily-summary/send")
async def send_now(day: Optional[str] = None, _=Depends(require_admin)):
    day = day or datetime.now(MANILA).date().isoformat()
    try:
        datetime.strptime(day, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Invalid date")
    res = await send_daily_summary(day, "manual")
    if res.get("status") != "sent":
        raise HTTPException(502, f"Summary not sent: {res.get('reason') or res.get('error') or 'email failed'}")
    return {"sent": True, "day": day}
