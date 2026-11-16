# PizzaHop authentication security design

## Refresh sessions

Refresh sessions use a separate MongoDB collection rather than an unbounded array on each user. Each row stores the user, a family identifier, a peppered hash of one opaque refresh token, expiry, revocation time, and successor reference. A unique token-hash index enables one-token lookup; a `{ userId, familyId }` index supports family revocation; an `expiresAt` TTL index cleans up expired rows asynchronously.

The eventual refresh service must run rotation in a MongoDB transaction (the configured `rs0` replica set supports transactions): find the presented hash with `expiresAt > now`; conditionally mark that row revoked and set its successor; insert a new hash in the same family; then commit. If the conditional update loses a concurrent race, retry the transaction and treat an unexpired revoked token as reuse: revoke every session in that family and return a generic unauthorized response. A missing or expired token is rejected regardless of TTL cleanup timing. Logout revokes the current token/family using a conditional update. Refresh credentials travel only in the audience-specific HTTP-only cookie; they are never returned in JSON or stored in browser local storage.

This design adds a transaction and an additional collection compared with embedded sessions, but supports independent hash uniqueness, indexed lookups, asynchronous cleanup, and family-wide revocation without growing the user BSON document. TTL is cleanup only; every use checks the expiry explicitly.

## Cookies and CSRF

Customer cookies are scoped to `/api/v1/auth`; admin cookies are scoped to `/api/v1/admin/auth`. Both are HTTP-only, secure in production, and use the configured SameSite mode. Lax is the default for same-site deployments. Cross-site frontend/API deployments require HTTPS and `AUTH_COOKIE_SAME_SITE=none`; every cookie-authenticated mutation must still require an exact allowed `Origin` header. CORS is not itself a CSRF defense. The customer refresh and logout placeholders apply this origin check. Admin logout currently uses a bearer access token; if an admin cookie-authenticated mutation is added, apply the same check. When real handlers are added, preserve it and clear cookies with the same path and attributes used when setting them.

## Rate limits and validation

Auth limiters currently use the built-in in-memory store. This works for one API process; a multi-instance production deployment must configure a shared rate-limit store and set `TRUST_PROXY_HOPS` to the known proxy topology. Registration and login errors must remain generic with respect to account existence. The reusable Zod schemas reject unknown body fields and enforce password byte limits before bcrypt.

Login, refresh, password-reset flows are not implemented by this milestone.

## Customer registration and email verification

Registration accepts only name, normalized email, and a password that meets the shared policy. It always creates a customer with `emailVerifiedAt: null`; the existing unique email index handles duplicate addresses. The password is bcrypt-hashed before persistence. A random opaque token is sent once by email, while only its peppered HMAC hash is stored in `EmailToken` with purpose `email_verification` and an explicit expiry. The existing TTL index is cleanup only; verification checks expiry in its atomic consume query.

Verification consumes the matching-purpose token and updates that token's customer in one MongoDB transaction. A failed user update rolls back consumption. Resend is rate-limited, applies a per-account cooldown, invalidates older unused verification tokens, and responds identically whether an eligible account exists or email delivery succeeds. Provider failures are swallowed at the delivery boundary; registration remains unverified and resend can issue a fresh token. The Resend key and sender stay in server environment configuration. Local setup and Resend's test-sender restriction are documented in the root README.

Login creates a short-lived access JWT and a random opaque refresh token. Only the peppered refresh-token hash is persisted. Customer and admin token cookies have separate names and paths. Refresh rotates sessions in a MongoDB transaction; presentation of a revoked but unexpired token revokes the remaining family. Logout revokes only the presented refresh token. The frontend keeps access tokens in memory and uses the HttpOnly refresh cookie to recover a session after page reload.

Password reset emails use the existing Resend service. Reset tokens are random, pepper-hashed, single-use `EmailToken` rows with explicit expiry. Consuming a reset token, changing the password hash, and revoking the user's refresh sessions happen in one transaction. Forgot-password responses are generic. Admin creation is only available via the idempotent `npm run seed:admin --workspace @pizzahop/server` script, configured with `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD`.
