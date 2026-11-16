# PizzaHop

PizzaHop is a pizza ordering and inventory management application built with React, Vite, Node.js, Express, MongoDB, and Mongoose.

## Prerequisites

- Node.js 20 or newer (includes npm)
- MongoDB 6 or newer, started as a replica set named `rs0`

## Local setup

1. Start MongoDB as a single-node replica set. For a local `mongod` process, add `--replSet rs0` to its startup options and initialize it once with `rs.initiate()` in `mongosh`.
2. Copy `server/.env.example` to `server/.env` and adjust values if needed.
3. Install dependencies from the repository root:

   ```powershell
   npm install
   ```

4. Start the API and Vite development server together:

   ```powershell
   npm run dev
   ```

5. Open <http://localhost:5173>. Check API and database status at <http://localhost:3000/api/v1/health>.

The API exits at startup if required configuration is missing or MongoDB cannot be reached. The health endpoint returns HTTP 503 while the database is disconnected. No mock database connection is used.

## Docker development setup (Windows)

Docker Compose runs the Vite development server, Express API, and MongoDB 7 on one internal network. MongoDB starts with replica set `rs0`; an idempotent one-shot initializer waits for the member to become primary, and the API is not started until that initialization succeeds. MongoDB data lives in the named `mongo_data` volume. The frontend and API source directories are mounted for live development. This setup does not read `server/.env` and the Dockerfiles never copy environment files into their images.

In PowerShell from the repository root, create the Docker-specific environment file:

```powershell
Copy-Item .env.docker.example .env.docker
```

Edit `.env.docker` and replace `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `TOKEN_HASH_PEPPER` with three independent random values. Generate each with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`; also set a strong `ADMIN_SEED_PASSWORD`. Keep `.env.docker` local. `RESEND_API_KEY` can remain blank for basic local testing; emails will not be delivered. The mock payment provider is enabled only for this development setup and remains prohibited when `NODE_ENV=production`.

Start the services and build their images:

```powershell
docker compose up --build
```

Open <http://localhost:5173>. Verify the API and database at <http://localhost:3000/api/v1/health>. Check replica-set readiness with:

```powershell
docker compose exec mongo mongosh --quiet --eval "rs.status().set + ' / ' + rs.status().members[0].stateStr"
```

The expected result is `rs0 / PRIMARY`. `mongo-rs-init` runs on each Compose startup and safely leaves an already initialized `rs0` in place. The API waits for that service to complete before starting; its Compose health check waits for the database-backed health endpoint. The frontend uses `http://localhost:3000/api/v1` from the browser, while the API reaches MongoDB using the internal `mongo` service hostname.

Stop the containers with `Ctrl+C`, or from another PowerShell window run `docker compose down`. This stops/removes containers but keeps `mongo_data` for the next start. To intentionally erase the local database too, run `docker compose down --volumes`.

The Docker frontend runs Vite in development mode, not as a production static server. The existing local workflow (`npm install`, `npm run dev`, and `npm run build`) remains unchanged.

## Other commands

```powershell
npm run dev:server
npm run dev:client
npm run build
npm start
```

The Vite client runs on port 5173 and the API on port 3000 by default. Set `PORT`, `MONGODB_URI`, and `CORS_ORIGIN` in `server/.env` to adjust API configuration. Never commit `.env` files or secrets.

## Milestone scope

The implemented milestones provide the app shell, customer registration and verification, customer/admin login, refresh sessions, password reset, catalogue and customizer, customer cart, admin inventory management, and customer checkout with a development-only simulated payment provider.

## Customer email verification (Milestone 2B)

Set `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_ORIGIN`, `EMAIL_VERIFICATION_TTL`, and `EMAIL_VERIFICATION_RESEND_COOLDOWN` in `server/.env`. The API key stays server-side. For local setup, Resend's `onboarding@resend.dev` sender is suitable for development, but Resend restricts its unverified test sender to the account owner's verified recipient addresses. To email arbitrary customers, verify a sending domain in Resend, configure its DNS records, and set `EMAIL_FROM` to an address on that domain.

Run the app as described above, visit <http://localhost:5173/register>, and create a customer account. Open the verification email and follow its link; the frontend submits the token to `POST /api/v1/auth/verify-email`. If delivery is delayed, the registration confirmation and verification error pages can request another email. The resend API always returns the same generic message. Do not put the Resend key in any `VITE_` variable.

The email expiry and resend cooldown default to 24 hours and 60 seconds. `FRONTEND_ORIGIN` must be an HTTP(S) origin without a path. Automated tests use a mocked email sender and do not contact Resend.

## Authentication and admin setup (Milestone 2C)

Authentication uses `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_TTL`, and `TOKEN_HASH_PEPPER` from `server/.env`. Keep the access JWT lifetime short (15 minutes by default). The refresh token is opaque, stored only as a peppered hash in MongoDB, and sent in an HttpOnly audience-specific cookie. `AUTH_COOKIE_SAME_SITE` defaults to `lax`; cross-site deployment needs HTTPS, `none`, and an exact frontend origin in `CORS_ORIGIN`.

Password reset links use `PASSWORD_RESET_TTL` (default `1h`) and the existing Resend sender configuration. Set `ADMIN_SEED_EMAIL` and a strong `ADMIN_SEED_PASSWORD` in `server/.env`, then run `npm run seed:admin --workspace @pizzahop/server`. The seed is safe to rerun for the same admin account; it does not provide a public admin registration endpoint. Do not commit environment credentials.

Customer pages: `/login`, `/register`, `/forgot-password`, `/reset-password`, and `/account`. Admin sign-in: `/admin/login`; the admin inventory page is `/admin/inventory`. Password reset email delivery requires the same Resend setup described above.

## Catalogue and custom pizza builder (Milestone 3)

Run `npm run seed:catalogue --workspace @pizzahop/server` after MongoDB is available. It idempotently seeds five menu pizzas and 20 selectable ingredients (five bases, five sauces, four cheeses, and six vegetables), and migrates older ingredient rows to stock fields. Existing stock and availability are preserved on subsequent runs. Ingredient records use the `InventoryItem` model and hold backend controlled prices and availability. Pizza art uses the local `/images/pizza-placeholder.svg` illustration.

Catalogue endpoints are `GET /api/v1/catalogue`, `GET /api/v1/catalogue/:id`, `GET /api/v1/customizer/options`, and `POST /api/v1/customizer/price`. The quote body contains `productId`, `baseId`, `sauceId`, `cheeseId`, and `vegetableIds`; price fields are rejected. Customer cart endpoints are `GET /api/v1/cart`, `POST /api/v1/cart/items`, `PATCH /api/v1/cart/items/:itemId`, and `DELETE /api/v1/cart/items/:itemId`, all protected by customer JWT authorization. Cart lines store selected IDs and quantity; displayed prices and subtotals are recalculated from current product and ingredient records.

Open `/catalogue`, choose a pizza, customize it, and add it to the cart. A customer must sign in before adding a pizza; `/cart` supports quantity changes and removal. Cart data is per customer. Checkout validates the saved cart against current MongoDB catalogue and inventory data.

## Admin inventory management (Milestone 4)

Set `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` as described in Milestone 2C, then run `npm run seed:admin --workspace @pizzahop/server`. Seed catalogue inventory with `npm run seed:catalogue --workspace @pizzahop/server`. Sign in at `/admin/login` and open `/admin/inventory`. Use the category filter and **Adjust** action to enter a positive quantity for stock received or a negative quantity for stock removed, together with a reason. Adjustments are rejected if they would make on-hand stock negative or lower than reserved stock, and successful changes are written to `InventoryMovement`.

Configure `INVENTORY_LOW_STOCK_THRESHOLD` (default `10`) for the initial threshold on seeded ingredients and `INVENTORY_ALERT_CHECK_INTERVAL_MS` (default `300000`, five minutes) for the scheduled check interval. Set `INVENTORY_ALERT_EMAIL` to the alert recipient; it falls back to `ADMIN_SEED_EMAIL`. Configure the existing `RESEND_API_KEY` and `EMAIL_FROM` settings to deliver alerts. An alert is sent when available stock (`onHand - reserved`) falls below an ingredient's threshold; the next alert for that ingredient is sent only after it recovers to the threshold or higher and falls below again.

Admin APIs: `GET /api/v1/admin/inventory`, `GET /api/v1/admin/inventory/summary`, and `PATCH /api/v1/admin/inventory/:id`. Every endpoint requires an admin access JWT. The patch body is `{ "delta": 5, "reason": "Delivery received" }`; the delta must be a non-zero whole number.

## Orders and simulated payments (Milestone 5)

The order flow is customer-only. `POST /api/v1/orders` creates an order from the authenticated customer's server-side cart, snapshots product/ingredient prices in paise, reserves inventory in a MongoDB transaction, and clears the cart only when the transaction succeeds. Send a UUID in the `Idempotency-Key` header to make checkout retries safe. Customers can list their own orders with `GET /api/v1/orders` and view one with `GET /api/v1/orders/:id`.

Payment routes are `POST /api/v1/payments/mock/initialize` with `{ "orderId": "..." }` and `POST /api/v1/payments/mock/confirm` with `{ "attemptId": "...", "confirmationToken": "...", "outcome": "success" }` (or `failure`). Both require a customer access JWT; the server-issued one-time confirmation token is bound to that customer's pending attempt. A successful simulation consumes reserved stock, while failure or expiry releases it. Pending reservations expire after 15 minutes; a lightweight in-process scheduler scans every 30 seconds. The simulated checkout is clearly labelled **TEST PAYMENT / SIMULATED PAYMENT** and transfers no money.

Set `MOCK_PAYMENTS_ENABLED=true` in `server/.env` for local development (the example file enables it). The server rejects this setting in production, and the provider factory refuses all simulated payments when `NODE_ENV=production` or the flag is off. The confirmation endpoint is the controlled development mock workflow, not a general order-status update endpoint. Do not enable simulated payments in a deployed production environment.

Payment integration is behind the `PaymentProvider` interface (`initialize` and `simulateOutcome`) and the provider factory. A future Razorpay adapter can implement the same boundary and provide verified provider callbacks/confirmation, while order creation, price snapshots, inventory reservations, and inventory finalization remain in their existing services. Razorpay is not integrated in this milestone.

Customer pages: `/cart` → `/checkout/:orderId` → `/payment-result/:orderId`, with order details at `/orders/:orderId` and history at `/orders`. MongoDB must be a replica set (`rs0`) because checkout and inventory status updates use transactions.

## Admin order management and customer tracking (Milestone 6)

Sign in at `/admin/login`, then use `/admin/orders` to review the latest 100 orders, filter by fulfillment status, inspect customer and item snapshots, and advance paid orders through `PLACED` → `CONFIRMED` → `PREPARING` → `OUT_FOR_DELIVERY` → `DELIVERED`. Status changes are recorded with timestamp and admin actor. Fulfillment updates do not alter inventory. Unpaid orders cannot advance; cancellation is not supported because it would need coordinated payment/refund and reservation handling.

Admin APIs are `GET /api/v1/admin/orders` (optional `?status=PREPARING` filter), `GET /api/v1/admin/orders/:id`, and `PATCH /api/v1/admin/orders/:id/status` with `{ "status": "PREPARING" }`. All require admin authentication; status changes also enforce the trusted-origin check. Customer tracking is `GET /api/v1/orders/:id/tracking`; it is customer-authenticated and only returns the requesting customer's order. The `/orders/:id` page shows the progress timeline and polls every 10 seconds until delivery.

When Resend is configured, a status-change email is sent after each actual transition. Repeating the current status is a no-op and does not send a duplicate notification. Delivery errors are logged without undoing the already-recorded status change. If Resend is not configured, status tracking remains available without email.
