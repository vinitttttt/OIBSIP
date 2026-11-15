# Milestone 1 architecture

PizzaHop is a React/Vite client and a modular Express API backed by Mongoose and MongoDB. The API connects to MongoDB before listening, and the health endpoint reports both API and database status. MongoDB should run as a replica set (`rs0`) so later order and inventory transactions are supported.

## Current scope

This milestone includes project setup, environment validation, common middleware, health checks, and the responsive landing page. Authentication, payments, catalogue and ordering behavior, and inventory business logic are intentionally out of scope until later milestones.
