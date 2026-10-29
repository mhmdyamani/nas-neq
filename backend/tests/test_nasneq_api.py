# Nas&Neq backend regression: menu, cart validation, orders (idempotency/stock/workflow), auth, analytics, preorder, inquiries, favorites, settings
import uuid
import threading
from datetime import datetime, timedelta, timezone
import pytest
import requests
from conftest import API

MANILA = timezone(timedelta(hours=8))
CUST = {"name": "TEST Buyer", "phone": "0917 000 0000", "email": "delivered@resend.dev"}
CREATED_REFS = []


def by_name(menu, name, cat=None):
    return next(p for p in menu["products"] if p["name"] == name and (cat is None or p["category"] == cat))


def order(items, ful="pickup", key=None, **kw):
    body = {"idempotency_key": key or f"TEST-{uuid.uuid4()}", "items": items, "fulfillment": ful, "customer": CUST, **kw}
    r = requests.post(f"{API}/orders", json=body, timeout=30)
    if r.status_code == 200:
        CREATED_REFS.append(r.json()["ref"])
    return r


@pytest.fixture(scope="module", autouse=True)
def redirect_emails_and_cleanup(admin_h, mdb):
    s = requests.get(f"{API}/admin/settings", headers=admin_h).json()
    orig_email = s.get("notify_email")
    requests.put(f"{API}/admin/settings", headers=admin_h, json={"notify_email": "delivered@resend.dev"})
    snapshot = {p["id"]: p for p in mdb.products.find({}, {"_id": 0})}
    yield
    requests.put(f"{API}/admin/settings", headers=admin_h, json={
        "notify_email": orig_email,
        "services": {"delivery": {"enabled": False, "fee": None, "coverage": "", "min_order": None},
                     "contactless": {"enabled": False}}})
    for pid, p in snapshot.items():
        mdb.products.replace_one({"id": pid}, p)
    mdb.stock_moves.delete_many({"order_ref": {"$in": CREATED_REFS}})
    mdb.stock_moves.delete_many({"reason": {"$regex": "^TEST"}})
    mdb.orders.delete_many({"ref": {"$in": CREATED_REFS}})
    mdb.orders.delete_many({"customer.name": "TEST Buyer"})
    mdb.inquiries.delete_many({"name": {"$regex": "^TEST"}})


# ---- Public menu
class TestMenu:
    def test_menu_categories_and_prices(self, menu):
        assert len(menu["categories"]) == 9
        assert len(menu["products"]) == 49
        assert by_name(menu, "Bundle B Bilao 44 pcs")["price"] == 1650
        assert by_name(menu, "Matcha Frappe")["price"] == 140
        assert by_name(menu, "Moka Frappe")["price"] == 120
        assert by_name(menu, "Regular (12 oz)", "halo-halo")["price"] == 65
        mto = [p for p in menu["products"] if p["category"] == "made-to-order"]
        assert len(mto) == 9 and all(p["price"] is None and p["kind"] == "inquiry" for p in mto)
        pk = [p for p in menu["products"] if p["is_packaging"]]
        assert len(pk) == 3 and all(p["price"] == 10 for p in pk)

    def test_public_settings_defaults(self):
        s = requests.get(f"{API}/settings/public").json()
        assert s["services"]["pickup"]["enabled"] and s["services"]["dine_in"]["enabled"] and s["services"]["takeout"]["enabled"]
        assert not s["services"]["delivery"]["enabled"] and not s["services"]["contactless"]["enabled"]
        assert s["payments"] == {}


# ---- Cart validation
class TestCart:
    def test_rejects_inquiry_item(self, menu):
        p = by_name(menu, "Lemon Crinkles")
        r = requests.post(f"{API}/cart/validate", json={"items": [{"product_id": p["id"], "qty": 1}]}).json()
        assert r["problems"] and "inquiry" in r["problems"][0]["message"]

    def test_rejects_packaging_only(self, menu):
        p = by_name(menu, "Extra Meal Box for Take Out")
        r = requests.post(f"{API}/cart/validate", json={"items": [{"product_id": p["id"], "qty": 2}]}).json()
        assert any("Packaging" in x["message"] for x in r["problems"])

    def test_valid_cart_subtotal(self, menu):
        a, b = by_name(menu, "Matcha Frappe"), by_name(menu, "Extra Meal Box for Take Out")
        r = requests.post(f"{API}/cart/validate", json={"items": [{"product_id": a["id"], "qty": 2}, {"product_id": b["id"], "qty": 1}]}).json()
        assert r["problems"] == [] and r["subtotal"] == 290

    def test_disabled_service_rejected(self, menu):
        r = order([{"product_id": by_name(menu, "Classic")["id"], "qty": 1}], ful="delivery", address="66 Libyan St Culiat")
        assert r.status_code == 400


# ---- Admin auth
class TestAdminAuth:
    @pytest.mark.parametrize("path", ["/admin/products", "/admin/orders", "/admin/settings", "/users"])
    def test_roles(self, path, admin_h, cust_h):
        assert requests.get(API + path).status_code == 401
        assert requests.get(API + path, headers=cust_h).status_code == 403
        assert requests.get(API + path, headers=admin_h).status_code == 200


# ---- Orders: idempotency + status workflow + payment + analytics
class TestOrderFlow:
    def test_idempotency_and_workflow(self, menu, admin_h, mdb):
        key = f"TEST-{uuid.uuid4()}"
        items = [{"product_id": by_name(menu, "Matcha Frappe")["id"], "qty": 1}]
        r1 = order(items, key=key)
        assert r1.status_code == 200, r1.text
        r2 = order(items, key=key)
        assert r2.json()["ref"] == r1.json()["ref"] and r2.json()["duplicate"] is True
        assert mdb.orders.count_documents({"idempotency_key": key}) == 1
        tok = r1.json()["track_token"]
        oid = mdb.orders.find_one({"idempotency_key": key})["id"]
        before = requests.get(f"{API}/admin/analytics", headers=admin_h).json()
        # invalid transition
        assert requests.post(f"{API}/admin/orders/{oid}/status", headers=admin_h, json={"status": "completed"}).status_code == 409
        for st in ["accepted", "preparing", "ready", "completed"]:
            r = requests.post(f"{API}/admin/orders/{oid}/status", headers=admin_h, json={"status": st})
            assert r.status_code == 200, (st, r.text)
            assert requests.get(f"{API}/orders/track/{tok}").json()["status"] == st
        o = requests.get(f"{API}/admin/orders/{oid}", headers=admin_h).json()
        assert [h["to"] for h in o["history"] if h["kind"] == "status"] == ["pending", "accepted", "preparing", "ready", "completed"]
        assert o["allowed_next"] == []
        assert requests.post(f"{API}/admin/orders/{oid}/status", headers=admin_h, json={"status": "cancelled"}).status_code == 409
        p = requests.post(f"{API}/admin/orders/{oid}/payment", headers=admin_h, json={"payment_status": "paid", "method": "cash"})
        assert p.status_code == 200 and p.json()["payment_status"] == "paid"
        assert requests.post(f"{API}/admin/orders/{oid}/payment", headers=admin_h, json={"payment_status": "pending"}).status_code == 409
        after = requests.get(f"{API}/admin/analytics", headers=admin_h).json()
        assert round(after["net_sales"] - before["net_sales"], 2) == 140
        assert round(after["payments_received"] - before["payments_received"], 2) == 140
        assert after["gross_order_value"] >= after["net_sales"]
        today = datetime.now(MANILA).date().isoformat()
        csv = requests.get(f"{API}/admin/analytics/export.csv", params={"from": today, "to": today}, headers=admin_h)
        assert csv.status_code == 200 and "text/csv" in csv.headers["content-type"]
        assert o["ref"] in csv.text and csv.text.startswith("ref,")


# ---- Stock concurrency + restore once
class TestStock:
    def test_concurrent_last_unit(self, menu, admin_h, mdb):
        pid = by_name(menu, "Iced Americano")["id"]
        r = requests.post(f"{API}/admin/products/{pid}/stock", headers=admin_h, json={"mode": "set", "value": 1, "reason": "TEST set"})
        assert r.status_code == 200 and r.json()["stock"] == 1
        results = []
        def go():
            results.append(order([{"product_id": pid, "qty": 1}]))
        ts = [threading.Thread(target=go) for _ in range(2)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        codes = sorted(x.status_code for x in results)
        assert codes == [200, 409], [x.text for x in results]
        prods = requests.get(f"{API}/admin/products", headers=admin_h).json()
        assert next(p for p in prods if p["id"] == pid)["status"] == "sold_out"
        ok = next(x for x in results if x.status_code == 200).json()
        oid = mdb.orders.find_one({"ref": ok["ref"]})["id"]
        assert requests.post(f"{API}/admin/orders/{oid}/status", headers=admin_h, json={"status": "rejected"}).status_code == 200
        assert requests.post(f"{API}/admin/orders/{oid}/status", headers=admin_h, json={"status": "rejected"}).status_code == 409
        assert mdb.products.find_one({"id": pid})["stock"] == 1

    def test_validate_flags_over_stock(self, menu):
        pid = by_name(menu, "Iced Americano")["id"]
        r = requests.post(f"{API}/cart/validate", json={"items": [{"product_id": pid, "qty": 3}]}).json()
        assert r["problems"] and r["problems"][0].get("max_qty") == 1


# ---- Pre-order
class TestPreorder:
    def test_preorder_rules(self, menu, admin_h, mdb):
        p = mdb.products.find_one({"name": "Blueberry Cheesecake"}, {"_id": 0})
        base = {k: p.get(k) for k in ("name", "category", "price", "description", "notes", "options", "kind", "is_packaging",
                                       "is_drink", "available", "hidden", "image_path", "thumb_path", "image_source",
                                       "track_stock", "low_threshold")}
        base["options"] = base["options"] or []
        r = requests.put(f"{API}/admin/products/{p['id']}", headers=admin_h, json={**base, "preorder": {"enabled": True, "lead_days": 2}})
        assert r.status_code == 400
        r = requests.put(f"{API}/admin/products/{p['id']}", headers=admin_h, json={**base, "price": 900, "preorder": {"enabled": True}})
        assert r.status_code == 400
        r = requests.put(f"{API}/admin/products/{p['id']}", headers=admin_h,
                         json={**base, "price": 900, "preorder": {"enabled": True, "lead_days": 2, "daily_capacity": 1}})
        assert r.status_code == 200, r.text
        items = [{"product_id": p["id"], "qty": 1}]
        today = datetime.now(MANILA).date()
        early = order(items, preorder_date=(today + timedelta(days=1)).isoformat())
        assert early.status_code == 400
        d = (today + timedelta(days=3)).isoformat()
        ok = order(items, preorder_date=d)
        assert ok.status_code == 200, ok.text
        full = order(items, preorder_date=d)
        assert full.status_code == 409
        cal = requests.get(f"{API}/admin/preorders", headers=admin_h).json()
        assert any(c["date"] == d and c["product_id"] == p["id"] for c in cal)


# ---- Inquiries
class TestInquiry:
    def test_inquiry(self, admin_h):
        bad = requests.post(f"{API}/inquiries", json={"name": "TEST Inq", "phone": "0917 000 0000", "products": []})
        assert bad.status_code == 422
        r = requests.post(f"{API}/inquiries", json={"name": "TEST Inq", "phone": "0917 000 0000", "email": "delivered@resend.dev",
                                                   "products": ["Lemon Crinkles"], "quantity": "2 dozen"})
        assert r.status_code == 200 and r.json()["ref"].startswith("INQ-")
        lst = requests.get(f"{API}/admin/inquiries", headers=admin_h).json()
        assert any(i["ref"] == r.json()["ref"] for i in lst)


# ---- Favorites (signed-in)
class TestFavorites:
    def test_favorites_persist(self, cust_h, menu):
        orig = requests.get(f"{API}/me", headers=cust_h).json().get("favorites") or []
        ids = [menu["products"][0]["id"], menu["products"][5]["id"], "bogus-id"]
        r = requests.put(f"{API}/me/favorites", headers=cust_h, json={"product_ids": ids})
        assert r.status_code == 200 and r.json()["favorites"] == ids[:2]
        assert requests.get(f"{API}/me", headers=cust_h).json()["favorites"] == ids[:2]
        requests.put(f"{API}/me/favorites", headers=cust_h, json={"product_ids": orig})
        assert requests.get(f"{API}/me").status_code == 401


# ---- Settings delivery validation
class TestSettings:
    def test_delivery_requires_fee_coverage(self, admin_h):
        r = requests.put(f"{API}/admin/settings", headers=admin_h, json={"services": {"delivery": {"enabled": True, "fee": None, "coverage": ""}}})
        assert r.status_code == 400 and "fee" in r.json()["detail"]
        r = requests.put(f"{API}/admin/settings", headers=admin_h, json={"services": {"delivery": {"enabled": True, "fee": 50, "coverage": "Culiat QC"}}})
        assert r.status_code == 200
        s = requests.get(f"{API}/settings/public").json()
        assert s["services"]["delivery"]["enabled"] and s["services"]["delivery"]["fee"] == 50
        r = requests.put(f"{API}/admin/settings", headers=admin_h, json={"services": {"delivery": {"enabled": False, "fee": None, "coverage": ""}}})
        assert r.status_code == 200
