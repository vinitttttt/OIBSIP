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

The current milestones provide the app shell, landing page, health endpoint, customer registration, and email verification. Login, refresh sessions, password reset, payments, and ordering/inventory business features are not included yet.

## Customer email verification (Milestone 2B)

Set `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_ORIGIN`, `EMAIL_VERIFICATION_TTL`, and `EMAIL_VERIFICATION_RESEND_COOLDOWN` in `server/.env`. The API key stays server-side. For local setup, Resend's `onboarding@resend.dev` sender is suitable for development, but Resend restricts its unverified test sender to the account owner's verified recipient addresses. To email arbitrary customers, verify a sending domain in Resend, configure its DNS records, and set `EMAIL_FROM` to an address on that domain.

Run the app as described above, visit <http://localhost:5173/register>, and create a customer account. Open the verification email and follow its link; the frontend submits the token to `POST /api/v1/auth/verify-email`. If delivery is delayed, the registration confirmation and verification error pages can request another email. The resend API always returns the same generic message. Do not put the Resend key in any `VITE_` variable.

The email expiry and resend cooldown default to 24 hours and 60 seconds. `FRONTEND_ORIGIN` must be an HTTP(S) origin without a path. Automated tests use a mocked email sender and do not contact Resend.
