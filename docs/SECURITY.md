# Security and deployment notes

## Existing repository history

This checkout previously tracked `.env`, bot pairing tokens, legacy workspace data, a database snapshot, and backup/scratch files. The improvements remove these from the current Git index while leaving local copies intact. This does not purge them from historical commits or any remote copies.

Before publishing or granting repository access, rotate the exposed provider API keys and bot tokens in their provider dashboards, reconfigure the running gateways, and rotate connector credentials as appropriate. Coordinate any history rewrite with repository collaborators. No provider credentials were revoked or rotated automatically because doing so would disconnect existing integrations. No history rewrite or push was performed.

## Credential encryption

Provider tokens saved through the API use AES-256-GCM with a random nonce and an authentication tag. A 32-byte key comes from `CONTEXA_SECRET_KEY`, or from `.local/secrets.key` for local use. Back up that key securely; restoring the database alone is insufficient. Old plaintext provider settings remain readable and migrate on authenticated access.

Bot pairing maps remain local and ignored. Updated gateways write encrypted mapping values and accept existing plaintext values during migration. Account session tokens and connector tokens remain opaque bearer credentials; protect the database and local browser profile. The existing frontend uses localStorage for its session token, so use HTTPS, restrict script origins, and do not add unsafe HTML rendering.

## Access boundaries

Session authentication supplies the workspace identifier. Context deletes/merges, activity reassignment, search, handoffs, restore plans, and branch operations validate ownership before mutation. Bulk operations use transactions. Pair codes are generated cryptographically, bound to a connector source and owner, expire after ten minutes, and can only be verified once. Pair verification has a separate rate limit.

Google ID tokens are verified with `google-auth-library` against the configured audience, including cryptographic signature, issuer and expiration checks. Verified email is required. Google setup instructions: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token

## Operational behavior

Retained events/resources can be deleted by the hourly retention task after the configured period. Checkpoint references to deleted records are pruned. Notes and descriptions are not automatically expired. Workspace data deletion is explicit in Settings and leaves account/connector configuration intact; pause tracking first if you do not want new activity to appear afterward.

No live provider calls, actual-account credential rotation, or production database migration is part of the automated test suite. The preview and integration databases are temporary and contain only synthetic data.

## Sessions and installed devices

Browser sessions use HttpOnly, SameSite=Lax cookies (Secure in production), with
server-side SHA-256 session storage. Existing header sessions upgrade on use; the
browser bootstrap exchanges its previous localStorage credential for a cookie and
removes the old bearer credential. Browser mutations enforce approved origins and
Fetch Metadata. Public connector delivery/pairing routes use explicit device tokens
or one-time pairing codes and do not derive authority from cookies.

Production must configure an exact HTTPS PUBLIC_ORIGIN and stable encryption key.
Cookie sessions require a same-site frontend/API deployment; the recommended Node
service serves both. Password changes revoke other sessions. Account settings can
explicitly sign out other devices. Session-list responses contain dates and current
status, never token material or storage identifiers.

Pairing codes are database-persisted, expire in ten minutes and are atomically
single-use across server processes. New installations receive individually revocable,
source-scoped credentials whose hashes are stored in DeviceCredential. Old shared
credentials remain usable for a deliberate transition; the owner can revoke them
once installations have paired again. No credentials are silently rotated or deleted.
