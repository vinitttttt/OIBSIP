# PizzaHop authentication security design

## Refresh sessions

Refresh sessions use a separate MongoDB collection rather than an unbounded array on each user. Each row stores the user, a family identifier, a peppered hash of one opaque refresh token, expiry, revocation time, and successor reference. A unique token-hash index enables one-token lookup; a `{ userId, familyId }` index supports family revocation; an `expiresAt` TTL index cleans up expired rows asynchronously.

The eventual refresh service must run rotation in a MongoDB transaction (the configured `rs0` replica set supports transactions): find the presented hash with `expiresAt > now`; conditionally mark that row revoked and set its successor; insert a new hash in the same family; then commit. If the conditional update loses a concurrent race, retry the transaction and treat an unexpired revoked token as reuse: revoke every session in that family and return a generic unauthorized response. A missing or expired token is rejected regardless of TTL cleanup timing. Logout revokes the current token/family using a conditional update. Refresh credentials travel only in the audience-specific HTTP-only cookie; they are never returned in JSON or stored in browser local storage.

This design adds a transaction and an additional collection compared with embedded sessions, but supports independent hash uniqueness, indexed lookups, asynchronous cleanup, and family-wide revocation without growing the user BSON document. TTL is cleanup only; every use checks the expiry explicitly.

## Cookies and CSRF

Customer cookies are scoped to `/api/v1/auth`; admin cookies are scoped to `/api/v1/admin/auth`. Both are HTTP-only, secure in production, and use the configured SameSite mode. Lax is the default for same-site deployments. Cross-site frontend/API deployments require HTTPS and `AUTH_COOKIE_SAME_SITE=none`; every cookie-authenticated mutation must still require an exact allowed `Origin` header. CORS is not itself a CSRF defense. The customer refresh and logout placeholders apply this origin check. Admin logout currently uses a bearer access token; if an admin cookie-authenticated mutation is added, apply the same check. When real handlers are added, preserve it and clear cookies with the same path and attributes used when setting them.

## Rate limits and validation

Auth limiters currently use the built-in in-memory store. This works for one API process; a multi-instance production deployment must configure a shared rate-limit store and set `TRUST_PROXY_HOPS` to the known proxy topology. Registration and login errors must remain generic with respect to account existence. The reusable Zod schemas reject unknown body fields and enforce password byte limits before bcrypt.

No registration, login, refresh, email delivery, or password-reset flow is implemented by this milestone.
