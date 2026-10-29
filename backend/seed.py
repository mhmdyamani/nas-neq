import os
from core import db, now_iso, new_id

CATEGORIES = [
    {"slug": "chicken-wings", "name": "Chicken Wings", "drink": False},
    {"slug": "chicken-poppers", "name": "Chicken Poppers", "drink": False},
    {"slug": "chicken-skin", "name": "Chicken Skin", "drink": False},
    {"slug": "blended-drinks", "name": "Blended Drinks", "drink": True},
    {"slug": "fruit-soda", "name": "Fruit Soda Drinks", "drink": True},
    {"slug": "iced-coffee", "name": "Iced Coffee / Non-Coffee Drinks", "drink": True},
    {"slug": "halo-halo", "name": "Halo Halo", "drink": False},
    {"slug": "waffle", "name": "Waffle", "drink": False, "note": "No Price Increase"},
    {"slug": "made-to-order", "name": "Made-to-Order Products", "drink": False},
]
CATEGORY_SLUGS = [c["slug"] for c in CATEGORIES]

P = "packaging"
MENU = {
    "chicken-wings": [("3 pcs with rice (Non-Flavored)", 110), ("3 pcs with rice (Flavored)", 120), ("6 pcs", 190),
                      ("12 pcs", 375), ("24 pcs", 745), ("Bundle A Bilao 32 pcs", 1250), ("Bundle B Bilao 44 pcs", 1650),
                      ("Extra Meal Box for Take Out", 10, P)],
    "chicken-poppers": [("Poppers with rice (Non-Flavored)", 110), ("Poppers with rice (Flavored)", 120),
                        ("Regular Poppers (Non-Flavored)", 135), ("Regular Poppers (Flavored)", 145),
                        ("Extra Paper Bowl for Takeout", 10, P)],
    "chicken-skin": [("Chicken Skin (No Sauce)", 100), ("Chicken Skin (Flavored)", 110)],
    "blended-drinks": [("Belgian Frappe", 110), ("Doppio Chocolate Frappe", 120), ("Caramel Macchiato Frappe", 120),
                       ("Moka Frappe", 120), ("Double Dutch Frappe", 120), ("Milo Oreo Frappe", 135),
                       ("Java Chips Frappe", 135), ("Matcha Frappe", 140), ("Strawberry Yogurt", 120), ("Blueberry Yogurt", 120)],
    "fruit-soda": [("Strawberry Fizz", 70), ("Blueberry Fizz", 70)],
    "iced-coffee": [("Iced Americano", 100), ("Iced Cafe Latte", 105), ("Iced Spanish Latte", 115),
                    ("Iced Hazelnut Mocha", 120), ("Iced Matcha Latte (No Coffee)", 125), ("Iced Tiramisu Latte", 125),
                    ("Iced Caramel Macchiato", 125)],
    "halo-halo": [("Regular (12 oz)", 65), ("Overload (16 oz)", 100)],
    "waffle": [("Classic", 50), ("Chocolate", 55), ("Cloudy", 60), ("Extra Waffle Box for Takeout/Delivery", 10, P)],
    "made-to-order": [(n, None, "inquiry") for n in [
        "Chocolate Chip Banana Cake", "Blueberry Cheesecake", "Lemon Crinkles", "Banana Oatmeal Cookies",
        "Chocolate Chip Cookies", "Oreo Cream Cheese Cookies", "Choco Revel Bars", "Blueberry Cheese Bars",
        "Campfire Smore Brownies"]],
}

FLAGS = [
    ("Brand", "Confirm the logo file supplied is final and whether an official brand guide / colours exist. Website palette (white, warm beige, espresso brown) is provisional."),
    ("Hours", "Confirm whether '9AM - 12AM' applies every day and that 12AM means midnight closing."),
    ("Prices", "Prices for all nine Made-to-Order products were not provided. They show 'Price to be confirmed' and are inquiry-only."),
    ("Ordering", "Confirm how customers should place orders and how made-to-order inquiries are received."),
    ("Made to Order", "Confirm advance notice, deposits, minimum quantities and lead times for made-to-order products (pre-orders stay disabled until set)."),
    ("Delivery", "Delivery and contactless delivery are switched off in Settings until coverage, fee, minimum order, hours and contactless instructions are entered."),
    ("Payments", "No payment method is enabled. Orders are placed with payment 'to be arranged'. Enable cash on pickup/delivery in Settings or connect an online provider later."),
    ("Flavors", "Provide the available flavors for 'Flavored' chicken wings, chicken poppers and chicken skin."),
    ("Chicken Wings", "Confirm whether 6/12/24 pcs and bilao bundles include rice, sauces, flavor choice or sides."),
    ("Waffle", "Clarify the meaning of 'Waffle (No Price Increase)' before it is used as a promotional claim."),
    ("Spelling", "Confirm the spelling 'Moka Frappe' (kept as supplied)."),
    ("Content", "Provide verified product descriptions, ingredients, allergens, portion sizes and availability."),
    ("Story", "Provide any official history, founder story, other social accounts, or existing website."),
    ("Images", "All menu photos are AI-generated illustrations, not photos of Nas&Neq's actual food. Replace with real photos when available."),
    ("Beverages", "The photography brief mentions Bottled Water, Iced Tea, Pitcher Iced Tea, Calamansi Juice, Canned Soda, shakes, Cafe Americano, Cafe Latte, Caramel Latte and Cafe Mocha, but these have no prices in the supplied menu, so they were NOT added. Add them in Menu if they are sold."),
    ("Halal", "No halal certification is claimed anywhere on the site. Confirm before any such claim is added."),
]


def default_settings():
    return {
        "id": "main",
        "services": {
            "pickup": {"enabled": True, "label": "In-store pickup"},
            "dine_in": {"enabled": True, "label": "Dine-in"},
            "takeout": {"enabled": True, "label": "Takeout"},
            "delivery": {"enabled": False, "label": "Delivery", "fee": None, "min_order": None, "coverage": "", "hours": ""},
            "contactless": {"enabled": False, "label": "Contactless delivery", "instructions": ""},
        },
        "payments": {"cash": {"enabled": False, "label": "Cash on pickup / delivery"}},
        "accepting_orders": True,
        "hours_text": "9AM–12AM",
        "notify_email": os.environ.get("ADMIN_EMAIL", "").split(",")[0].strip(),
        "notify_customers": True,
    }


async def seed():
    await db.products.create_index("id", unique=True)
    await db.orders.create_index("id", unique=True)
    await db.orders.create_index("ref", unique=True)
    await db.orders.create_index("track_token", unique=True)
    await db.orders.create_index("idempotency_key", unique=True)
    await db.users.create_index("user_id", unique=True)
    if not await db.settings.find_one({"id": "main"}):
        await db.settings.insert_one(default_settings())
    if await db.products.count_documents({}) == 0:
        docs, sort = [], 0
        cats = {c["slug"]: c for c in CATEGORIES}
        for slug, items in MENU.items():
            for it in items:
                sort += 1
                name, price = it[0], it[1]
                tag = it[2] if len(it) > 2 else "regular"
                docs.append({
                    "id": new_id(), "name": name, "category": slug, "price": price, "description": "",
                    "notes": "Packaging add-on" if tag == P else "", "options": [],
                    "kind": "inquiry" if tag == "inquiry" else "regular", "is_packaging": tag == P,
                    "is_drink": cats[slug]["drink"], "available": True, "hidden": False, "sort": sort,
                    "image_path": None, "thumb_path": None, "image_source": None,
                    "track_stock": False, "stock": 0, "low_threshold": 0,
                    "preorder": {"enabled": False, "lead_days": None, "max_qty": None, "daily_capacity": None},
                    "created_at": now_iso(), "updated_at": now_iso(),
                })
        await db.products.insert_many(docs)
    if await db.flags.count_documents({}) == 0:
        await db.flags.insert_many([{"id": new_id(), "topic": t, "detail": d, "resolved": False,
                                     "resolution": "", "created_at": now_iso()} for t, d in FLAGS])
