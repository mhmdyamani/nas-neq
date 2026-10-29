import os
import uuid
import base64
import asyncio
from emergentintegrations.llm.chat import LlmChat, UserMessage

MODEL = "gemini-3.1-flash-image-preview"

VESSEL = {
    "chicken-wings": "on a clean round white ceramic plate",
    "chicken-poppers": "in a clean white ceramic bowl",
    "chicken-skin": "in a clean white ceramic bowl",
    "halo-halo": "in a clean white dessert bowl",
    "waffle": "on a clean round white dessert plate",
    "made-to-order": "on a clean round white cake or dessert plate",
}

FOOD_RULES = ("Create a photorealistic, premium restaurant menu photograph of the exact specified food item. Use a true "
              "90-degree overhead camera angle looking straight down. Compose the complete dish in a square 1:1 image. "
              "Preserve a clean white plate, white bowl, or other appropriate white serving vessel. Use a pure white or very "
              "clean, light-colored background. Include only the actual menu item and components explicitly included in its "
              "description. Do not add unrelated spoons, forks, knives, napkins, drinking glasses, flowers, props, decorative "
              "ingredients, extra dishes, sauces, sides, or other objects. Do not use a wooden table, dark surface, patterned "
              "background, side angle, 45-degree angle, eye-level perspective, or cropped dish. Use natural colors, soft lighting, "
              "realistic textures, and a clean, professional catalog style. Do not include pork, pork products, alcohol, or "
              "prohibited food items. No text, no logos, no watermark. The final image must look like a real product photograph "
              "taken directly from above, with a white serving vessel and a clean white background.")

DRINK_RULES = ("Create a photorealistic, premium cafe menu product photograph of the exact specified beverage. Use a natural, "
               "professional beverage product-photography angle (straight-on or slightly elevated), not overhead. Show the entire "
               "drink and its appropriate clear glass or cup clearly, centered, complete and uncropped, in a square 1:1 image against "
               "a pure white background. Realistic liquid color and texture, natural condensation where appropriate. Do not add "
               "unrelated props, straws in odd colors, utensils, snacks, fruit garnishes floating, splashes, decorative objects, "
               "text, logos, watermark or any alcoholic element.")

PACK_RULES = ("Create a photorealistic product photograph of a single plain, unbranded, empty white takeout packaging item, "
              "true 90-degree overhead view, square 1:1, complete item visible, pure white background, soft natural shadow, no food, "
              "no text, no logos, no props.")


def prompt_for(p: dict) -> str:
    if p.get("is_packaging"):
        return f"{PACK_RULES} Item: {p['name']} (Filipino cafe takeout packaging)."
    cat = p["category"].replace("-", " ")
    if p.get("is_drink"):
        return f"{DRINK_RULES} Beverage: '{p['name']}' from the '{cat}' section of a Filipino bakery-cafe menu, iced, in a tall clear plastic or glass cup."
    vessel = VESSEL.get(p["category"], "on a clean white plate")
    extra = ""
    if p["category"] == "chicken-wings" and "with rice" in p["name"]:
        extra = " Show exactly 3 fried chicken wings and one portion of plain white rice on the same plate."
    elif p["category"] == "chicken-wings" and "Bilao" in p["name"]:
        extra = " Show only fried chicken wings arranged on a large round white serving platter lined with white paper."
    elif p["category"] == "chicken-wings":
        extra = " Show only fried chicken wings; match the piece count in the name."
    elif p["category"] == "chicken-poppers" and "with rice" in p["name"]:
        extra = " Show bite-size fried chicken poppers and one portion of plain white rice."
    elif p["category"] == "chicken-poppers":
        extra = " Show only bite-size fried chicken poppers."
    elif p["category"] == "halo-halo":
        extra = " Filipino halo-halo shaved ice dessert, served in a white dessert cup/bowl."
    elif p["category"] == "waffle":
        extra = " A plain round or square waffle; for 'Chocolate' a chocolate waffle; 'Cloudy' a waffle with a light fluffy white cream topping."
    return f"{FOOD_RULES} Food item: '{p['name']}' from the '{cat}' section of a Filipino bakery-cafe menu, {vessel}.{extra}"


async def generate_image_bytes(p: dict) -> bytes:
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"img-{uuid.uuid4()}",
                   system_message="You generate clean catalog food photography.")
    chat.with_model("gemini", MODEL).with_params(modalities=["image", "text"])
    _, images = await chat.send_message_multimodal_response(UserMessage(text=prompt_for(p)))
    if not images:
        raise RuntimeError("No image returned")
    return base64.b64decode(images[0]["data"])


async def _main():
    from core import db, store_image, now_iso
    sem = asyncio.Semaphore(4)
    prods = await db.products.find({"image_path": None}, {"_id": 0}).to_list(500)
    failed = []

    async def one(p):
        async with sem:
            for attempt in range(2):
                try:
                    raw = await generate_image_bytes(p)
                    paths = await asyncio.to_thread(store_image, raw, "menu")
                    await db.products.update_one({"id": p["id"], "image_path": None},
                                                 {"$set": {**paths, "image_source": "ai_illustrative", "updated_at": now_iso()}})
                    print("OK", p["name"], flush=True)
                    return
                except Exception as e:
                    print("ERR", p["name"], str(e)[:120], flush=True)
            failed.append(p["name"])

    await asyncio.gather(*(one(p) for p in prods))
    print("FAILED:", failed, flush=True)


if __name__ == "__main__":
    asyncio.run(_main())
