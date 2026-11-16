# PizzaHop architecture

PizzaHop uses a React/Vite client, a modular Express API, and MongoDB with Mongoose. The API connects to MongoDB before listening. MongoDB should run as replica set `rs0` for the auth and future order transactions.

## Catalogue and customization

`Product` records contain the menu name, description, base price, local image path, and availability. `InventoryItem` records are the selectable ingredient catalogue, with a SKU, category, server controlled price, and availability. Categories include `base`, `sauce`, `cheese`, and `vegetable`.

The catalogue and options endpoints expose only available records. The customizer quote service validates each submitted id against the expected ingredient category and current availability, then computes the price from MongoDB values. Client submitted prices are not accepted. The idempotent catalogue seed script upserts the five menu products and twenty initial ingredients.

The `Cart` collection has one document per customer. A cart line stores product and ingredient references plus quantity; it does not persist a client provided price. Cart reads and updates resolve current prices again. Cart routes require an authenticated customer JWT. Checkout, stock reservation/deduction, payments, and order handling are not part of this milestone.

## Inventory administration and reservation foundation

`InventoryItem` keeps `onHand`, `reserved`, `lowStockThreshold`, and an ingredient `isAvailable` flag. The API's numeric `available` value is computed as `onHand - reserved`. Stock adjustments use a MongoDB transaction to update the item and append an immutable `InventoryMovement`; the update predicate prevents on-hand quantity from dropping below reserved quantity. Inventory routes require an admin JWT and role.

Low-stock notifications use a per-item `AlertState` with an atomic pending claim. A successful alert moves the state to `low`; it returns to `normal` only after the available quantity recovers to the threshold. This prevents repeated emails while the same low-stock condition remains. The server runs an interval check after connecting to MongoDB; successful manual adjustments also check the item immediately. Configure the recipient with `INVENTORY_ALERT_EMAIL` (defaults to the admin seed email), threshold with `INVENTORY_LOW_STOCK_THRESHOLD`, and interval with `INVENTORY_ALERT_CHECK_INTERVAL_MS`.

`inventoryService.js` exports transactional `checkIngredientAvailability`, `reserveIngredients`, `releaseReservations`, and `deductReservedStock` functions for the future order/payment flows. These functions do not run from cart operations. Order creation should reserve ingredient quantities in its transaction, and payment success/failure or expiry should call the corresponding finalization/release function.

## Authentication and operations

Authentication uses short lived access JWTs and opaque, hashed refresh sessions. Customer and admin refresh cookies have separate names and paths. Public customer catalogue and quote routes do not require authentication; cart routes use the existing `authenticate` and `authorize('customer')` middleware.

The API health endpoint reports database connectivity. Seed the catalogue with `npm run seed:catalogue --workspace @pizzahop/server`; the script can be safely rerun.
