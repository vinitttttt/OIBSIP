# PizzaHop architecture

PizzaHop uses a React/Vite client, a modular Express API, and MongoDB with Mongoose. The API connects to MongoDB before listening. MongoDB should run as replica set `rs0` for the auth and future order transactions.

## Catalogue and customization

`Product` records contain the menu name, description, base price, local image path, and availability. `InventoryItem` records are the selectable ingredient catalogue, with a SKU, category, server controlled price, and availability. Categories include `base`, `sauce`, `cheese`, and `vegetable`.

The catalogue and options endpoints expose only available records. The customizer quote service validates each submitted id against the expected ingredient category and current availability, then computes the price from MongoDB values. Client submitted prices are not accepted. The idempotent catalogue seed script upserts the five menu products and twenty initial ingredients.

The `Cart` collection has one document per customer. A cart line stores product and ingredient references plus quantity; it does not persist a client provided price. Cart reads and updates resolve current prices again. Cart routes require an authenticated customer JWT. Checkout, stock reservation/deduction, payments, and order handling are not part of this milestone.

## Authentication and operations

Authentication uses short lived access JWTs and opaque, hashed refresh sessions. Customer and admin refresh cookies have separate names and paths. Public customer catalogue and quote routes do not require authentication; cart routes use the existing `authenticate` and `authorize('customer')` middleware.

The API health endpoint reports database connectivity. Seed the catalogue with `npm run seed:catalogue --workspace @pizzahop/server`; the script can be safely rerun.
