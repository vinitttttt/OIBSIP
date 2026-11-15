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

The current foundation milestone provides the app shell, landing page, Express middleware, MongoDB connection, and health endpoint. Authentication, payments, and ordering/inventory business features are not included yet.
