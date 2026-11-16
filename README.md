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

## Other commands

```powershell
npm run dev:server
npm run dev:client
npm run build
npm start
```

The Vite client runs on port 5173 and the API on port 3000 by default. Set `PORT`, `MONGODB_URI`, and `CORS_ORIGIN` in `server/.env` to adjust API configuration. Never commit `.env` files or secrets.

## Milestone scope

The current milestones provide the app shell, customer registration and verification, customer/admin login, refresh sessions, logout, password reset, a pizza catalogue and customizer, and a customer cart. Checkout, payments, order management, and inventory management are not included yet.

## Customer email verification (Milestone 2B)

Set `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_ORIGIN`, `EMAIL_VERIFICATION_TTL`, and `EMAIL_VERIFICATION_RESEND_COOLDOWN` in `server/.env`. The API key stays server-side. For local setup, Resend's `onboarding@resend.dev` sender is suitable for development, but Resend restricts its unverified test sender to the account owner's verified recipient addresses. To email arbitrary customers, verify a sending domain in Resend, configure its DNS records, and set `EMAIL_FROM` to an address on that domain.

Run the app as described above, visit <http://localhost:5173/register>, and create a customer account. Open the verification email and follow its link; the frontend submits the token to `POST /api/v1/auth/verify-email`. If delivery is delayed, the registration confirmation and verification error pages can request another email. The resend API always returns the same generic message. Do not put the Resend key in any `VITE_` variable.

The email expiry and resend cooldown default to 24 hours and 60 seconds. `FRONTEND_ORIGIN` must be an HTTP(S) origin without a path. Automated tests use a mocked email sender and do not contact Resend.

## Authentication and admin setup (Milestone 2C)

Authentication uses `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_TTL`, and `TOKEN_HASH_PEPPER` from `server/.env`. Keep the access JWT lifetime short (15 minutes by default). The refresh token is opaque, stored only as a peppered hash in MongoDB, and sent in an HttpOnly audience-specific cookie. `AUTH_COOKIE_SAME_SITE` defaults to `lax`; cross-site deployment needs HTTPS, `none`, and an exact frontend origin in `CORS_ORIGIN`.

Password reset links use `PASSWORD_RESET_TTL` (default `1h`) and the existing Resend sender configuration. Set `ADMIN_SEED_EMAIL` and a strong `ADMIN_SEED_PASSWORD` in `server/.env`, then run `npm run seed:admin --workspace @pizzahop/server`. The seed is safe to rerun for the same admin account; it does not provide a public admin registration endpoint. Do not commit environment credentials.

Customer pages: `/login`, `/register`, `/forgot-password`, `/reset-password`, and `/account`. Admin sign-in: `/admin/login`; the protected admin placeholder is `/admin`. Password reset email delivery requires the same Resend setup described above.

## Catalogue and custom pizza builder (Milestone 3)

Run `npm run seed:catalogue --workspace @pizzahop/server` after MongoDB is available. It idempotently seeds five menu pizzas and 20 selectable ingredients (five bases, five sauces, four cheeses, and six vegetables). Ingredient records use the `InventoryItem` model and hold backend controlled prices and availability. Pizza art uses the local `/images/pizza-placeholder.svg` illustration.

Catalogue endpoints are `GET /api/v1/catalogue`, `GET /api/v1/catalogue/:id`, `GET /api/v1/customizer/options`, and `POST /api/v1/customizer/price`. The quote body contains `productId`, `baseId`, `sauceId`, `cheeseId`, and `vegetableIds`; price fields are rejected. Customer cart endpoints are `GET /api/v1/cart`, `POST /api/v1/cart/items`, `PATCH /api/v1/cart/items/:itemId`, and `DELETE /api/v1/cart/items/:itemId`, all protected by customer JWT authorization. Cart lines store selected IDs and quantity; displayed prices and subtotals are recalculated from current product and ingredient records.

Open `/catalogue`, choose a pizza, customize it, and add it to the cart. A customer must sign in before adding a pizza; `/cart` supports quantity changes and removal. Cart data is per customer. There is no checkout or stock deduction in this milestone.
