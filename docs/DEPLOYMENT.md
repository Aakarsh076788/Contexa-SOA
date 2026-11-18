# Run and deploy Contexa

## Local development

Use the Node version in `.nvmrc` for the repeatable build. `npm ci`, `npm run db:generate`, and `npm run db:migrate` prepare the application against the intended PostgreSQL database. Back up existing data before migrations.

`npm run dev:all` checks PostgreSQL and supervises both Express and Vite. It stops both child processes when one fails or when you press Ctrl+C. The database stays running. It does not initialize or migrate data automatically.

If your existing local PostgreSQL cluster needs manual startup, configure these optional values in your private `.env`:

```dotenv
LOCAL_PG_CTL=/absolute/path/to/compatible/pg_ctl
LOCAL_PG_DATA=/absolute/path/to/existing/data/directory
```

Only loopback database hosts can use this automatic startup. The recovered cluster on this Mac is described in `.local/POSTGRES.md`. Do not point a new major PostgreSQL version at an old data directory.

For a fresh disposable development database, `docker compose up -d database` uses PostgreSQL on port **5433** and a named volume. Set `DATABASE_URL=postgresql://contexa:contexa@localhost:5433/contexa` in `.env`, then generate/migrate. This does not use or replace the existing port-5432 cluster. Removing the volume deletes that separate development database, so preserve any data you need first.

## Single-origin paid beta deployment

`render.yaml` defines one Docker web service and managed PostgreSQL in Singapore, private database ingress, a release migration and readiness check. Review the region, current compute plans/cost and recovery retention before provisioning. This file has not been deployed to a hosting account.

1. Push reviewed source to a private repository after resolving historical credential exposure.
2. Create a staging Blueprint from `render.yaml`. Configure exact `PUBLIC_ORIGIN` (HTTPS, no trailing slash), stable `CONTEXA_SECRET_KEY`, and optional Google/email/provider credentials in the platform's secret store. Keep `VITE_API_BASE` blank for this single-origin deployment.
3. For existing encrypted credentials, securely preserve the existing encryption key. Generating a different key requires deliberately re-entering those credentials; do not silently replace it. Never put provider secrets into `VITE_*` variables.
4. Build the container. Release command `npm run db:migrate` applies additive migrations. Start is `npm start`, with `HOST=0.0.0.0` and the platform-provided `PORT`. `/api/ready` must return HTTP 200 before routing traffic.
5. `TRUST_PROXY_HOPS=1` assumes exactly one trusted proxy path. Confirm the actual deployed topology, prevent direct bypass paths, and verify rate limiting identifies independent clients. Do not broadly trust arbitrary forwarded headers.
6. Add the exact production Google JavaScript origin and configure both server and build-time client IDs. Docker builds require passing `VITE_GOOGLE_CLIENT_ID` as a build argument if enabling Google; ordinary runtime environment values cannot change an already-built Vite bundle.
7. Configure extensions/gateways to the new HTTPS API and pair each installation. Reload/reinstall connector ZIPs after source updates. Test one approved capture, a review, a saved next action and a resume on each enabled source.
8. Keep API/database together. Start with one web instance. Pairing and ingestion jobs are durable, but rate limits remain process-local; configure shared rate limiting and one retention scheduler before scaling replicas.

The Dockerfile excludes private runtime files and unused ML artifacts, uses a non-root runtime user, pins Node, and includes the migration CLI. Docker is not installed on the development Mac used for this change; the image needs its first build/run verification in CI or staging. YAML syntax and native Node build/tests were checked locally.

## Email recovery

Set `RESEND_API_KEY`, `RECOVERY_FROM_EMAIL` (verified sender address) and `PUBLIC_ORIGIN` to enable recovery. The frontend exposes the request form only when configured. Requests use a generic response before account lookup/email delivery; failures are redacted in logs. Tokens are random, stored only as hashes, expire after 20 minutes and work once. Successful reset revokes all browser sessions. Ordinary password changes revoke other sessions and invalidate pending recovery links.

The email contains `/reset-password#token=...`; the browser removes the fragment immediately after loading it. Delivery is deferred in-process: a process crash can interrupt a send, so the user may need to request another link. No real emails were sent in automated tests. Verify delivery and domain authentication in staging before enabling public registration. Email ownership verification during signup is not yet enforced; use an invite-only private beta until the account policy is finalized.

## Optional workers and ML

The API process currently runs a bounded ingestion worker and hourly retention sweep, with graceful drain on shutdown. Accepted activity survives restart in PostgreSQL; pending payloads expire after 24 hours, processing retries are bounded, terminal payloads are removed and job statuses expire after seven days. Collection settings are rechecked before persistence.

Discord/Telegram are separately supervised processes. Their bot tokens belong in environment secrets. Pair only as a group administrator; explicitly select approved channels/chats. Legacy bot mappings require relinking. Their encrypted retry queue and approved mappings currently require persistent filesystem storage; mount the connector directories on durable storage or move those records into PostgreSQL before running multiple gateway replicas. Never put these local files in a public bucket.

ML is optional and excluded from the app image. See `ml/README.md` for pinned dependencies, trusted artifacts and a production WSGI command. `CONTEXA_ML_URL` configures the endpoint; remote inference requires cloud-processing consent. Actual Python model inference and real provider credentials were not exercised by the Node test suite.

## Monitoring and recovery

- Probe `/api/health` for process liveness and `/api/ready` for database/schema readiness. Alert on readiness failures, sustained 5xx, failed/old ingestion jobs, delivery failures and database storage pressure. Request logs include request IDs, route patterns and elapsed time; captured content and credentials are not logged by the request middleware.
- Enable managed PostgreSQL recovery/PITR and keep encrypted logical backups outside the service account. Maintain the encryption key separately. An infrastructure snapshot is not a substitute for a tested restore.
- For an independent logical backup, use a compatible `pg_dump` with custom format and restricted output permissions. Pass credentials through a protected environment or `.pgpass`, never command-line arguments/logs. Restore with `pg_restore` into a **new isolated database**, run migrations, verify record counts/relationships, then test decrypting credentials and resuming a sample context before switching traffic.
- Initial planning targets: no more than 24 hours of data loss and restoration within four hours. These are targets, not measured guarantees. Conduct and record a staging restore drill.
- For rollback, retain the previous application image and database backup. Current migrations add tables/indexes without dropping existing data. Coordinate capture so old and new deployments do not collect independently into divergent databases. Do not run destructive reset commands on user data.
- Resolve historically tracked secret exposure in coordination with providers/collaborators. No history rewrite, provider revocation, cloud provisioning, paid deployment or public data transfer was performed by these code changes.

## Verification

```sh
npm run check
npm test
npm run build
npm run evaluate
npm audit --audit-level=high
npm run check:repository
```

The test wrapper overrides database/provider configuration before any test import; integration helpers replace it only with a temporary `contexa_test` PostgreSQL database and assert the database name. Use this wrapper rather than direct `node --test` commands. All fixture credentials and mail deliveries are synthetic. CI runs the same core checks. Load, real-device mobile accessibility, live Google/provider/bot permissions and cloud restore drills remain staging acceptance work.
