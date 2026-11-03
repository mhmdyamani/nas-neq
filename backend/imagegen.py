"""AI illustration generation is switched off (it needed Emergent credits).
Upload photos from the admin dashboard instead."""


async def generate_image_bytes(p: dict) -> bytes:
    raise RuntimeError("AI illustration is not available. Please upload a photo instead.")
