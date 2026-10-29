# Nas&Neq — PRD

## Original problem statement
"MASTER WEBSITE DEVELOPMENT PROMPT — NAS&NEQ": build a complete, premium, responsive bakery-café website for Nas&Neq (66 Libyan St., Culiat, Quezon City; 0953 613 5684; 9AM - 12AM; Facebook https://web.facebook.com/profile.php?id=100094607904757). It should use a white and warm beige theme, the client's logo and a scroll-synchronized hero video, and tasteful 3D/parallax scroll effects. Include the full supplied menu with exact prices, 9 made-to-order items with no price (inquiry only), and strict AI image rules: food shot from directly overhead on white plates against white backgrounds, natural angles for drinks, halal-conscious. Also build an owner-only dashboard: menu editing, image upload with preview, inventory, orders with a status workflow, pre-orders, sales analytics with export, and flags for details the owner must confirm. Customers get a cart and checkout, a secure order-tracking page, favorites and a made-to-order inquiry form. Do not invent any business facts. (Full text in the first message of the job.)

User choices: online payments later; email and password login with owner admin = mhmd.alyamani27@gmail.com and every new sign-up as a customer; customer accounts plus guest checkout; one AI image per item; owner email alerts; remove all Emergent branding.

## Architecture
- Backend: FastAPI (`server.py` public, cart, orders and account routes; `admin.py` owner routes; `core.py` database, roles, storage and email; `seed.py` menu, settings and flags; `imagegen.py` Gemini Nano Banana images) with MongoDB.
- Auth: Emergent-managed Clerk (email and password, with password reset). Roles live in `db.users`. The ADMIN_EMAIL account becomes admin on its first verified sign-in.
- Storage: Emergent object storage. WebP main and thumbnail images are served through `/api/images/{path}`.
- Email: Emergent-managed Resend. It sends owner alerts for orders and inquiries and customer status emails when the customer gives an email. It retries on 429.
- Frontend: React, Tailwind and shadcn, framer-motion and recharts. Video files are in `/frontend/public/media` (MP4 and WebM, desktop 16:9 and mobile portrait crop).

## Business rules
- Stock is reserved atomically when an order is created and restored once if the order is rejected or cancelled.
- Pre-orders reserve daily capacity atomically through `preorder_capacity`. They do not reserve stock.
- Status flow: pending → accepted → preparing → ready or out_for_delivery → completed. Pending, accepted, preparing and ready orders can also be rejected or cancelled.
- Payment status is tracked separately: pending, paid, failed, refunded. The owner records it manually.
- Analytics: gross order value counts all orders. Net sales counts completed orders that were not refunded. Payments received counts orders marked paid.

## Implemented (2026-10-29)
- Built every public page: Home with the scroll-scrubbed hero video, Menu, Made to Order with the inquiry form, Our Story, Contact, Checkout, order tracking, Favorites and Account.
- Built the owner dashboard tabs: Orders, Menu, Inventory, Pre-orders, Inquiries, Sales & Analytics with CSV export, Flags, Settings and Users.
- Generated all 49 AI menu images.
- Testing: iteration 1 passed 17/17 backend tests and all tested frontend flows. Afterwards I fixed the image endpoint blocking other requests, made the pre-order capacity check atomic, stopped the Clerk lookup from blocking requests, and added email retries.

## Backlog
- P0 (owner to confirm): the 16 items on the Flags page — made-to-order prices, flavors, delivery settings, payment method, hours.
- P1: connect an online payment provider; add an outbox to retry failed emails later.
- P2: shadcn date and select controls in place of the browser defaults.
