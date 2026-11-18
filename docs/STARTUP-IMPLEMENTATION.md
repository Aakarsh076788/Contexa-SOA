# Private beta implementation

Implemented from the 20 October project review with separate frontend, backend and security/connector owners plus independent integration review. Existing data and feature paths are preserved; advanced controls remain available inside existing screens rather than adding more navigation.

- Browser sessions use HttpOnly cookies and hashed storage; explicit origin protection, persistent source-bound pairing and individually revocable device credentials are available. Old bearer sessions migrate on use. Owners can explicitly revoke legacy shared connector credentials.
- Group linking requires administrator permission and explicit channel/chat approval. Chrome/VS Code and gateways use bounded durable retries. Gateway queues are encrypted. Captures are acknowledged as queued, not reported as already matched.
- Capture processing uses durable database jobs, retries, leases, idempotency, capacity limits, privacy rechecks and deletion cancellation. Delayed processing preserves acceptance time. Retention is batched and only touches affected checkpoint references.
- Workspace reads contain at most 100 recent activities, exact counts and no embedding payloads. Timeline/Inbox page independently with stable cursors, date/source/search filters and load more. Insights aggregate full history in the selected time zone. Context list counts avoid per-context event reads.
- Real context URLs, Back/Forward, cookie reload/bootstrap, error boundaries, offline/stale status, resource search, improved Google loading and optional email recovery are integrated. Batch review appears only when records are selected. Connector diagnostics, paired devices and browser sessions use disclosures.
- Production startup checks, bounded database/schema readiness, redacted request/error telemetry, graceful workers, a local development supervisor, Docker/Compose/Render templates and CI are included. Dependencies were updated together and the audit cleared at implementation time.
- Recovery email is explicitly configuration-gated. Hashed, expiring, single-use tokens revoke existing sessions on reset. No email is claimed as delivered merely because a request was accepted.
- Optional Python ML is configurable and documented with pinned dependencies, import-time artifact loading and readiness; actual inference remains unvalidated here.

Validation evidence and remaining external setup are recorded in `DEPLOYMENT.md`. The earlier review is a dated baseline; its audit counts and source limitations describe the state before these changes.

## Verified release checks

- Combined automated suite: 67 tests passing, including temporary real-PostgreSQL integration, durable job/crash/pause/deletion regressions, cookie/device permissions, concurrent privacy settings, recovery and route tests.
- Syntax checks: 74 JavaScript files, zero failures. Production frontend build passed. Dependency audit reports zero vulnerabilities at this check.
- Desktop synthetic preview: cookie login/reload, context links and Back/Forward, inbox filters/batch actions/undo, insights, resource search, device/session disclosures and appearance controls verified.
- Existing local cluster: fresh stopped-cluster backup saved before additive migrations; core user/workspace/context/event counts were identical afterward. Prisma schema comparison reports no drift. Updated API readiness and frontend HTTP checks pass; both servers run under `npm run dev:all`.
- Connector ZIP downloads rebuilt as version 0.3.0. YAML configuration parses. No Docker daemon/cloud account was available for container or paid-hosting execution.

## Scope boundaries

This is a stronger private beta foundation, not a claim of proven public-scale operation. Email ownership verification, externally verified provider/Google/bot flows, a representative ML dataset, mobile/browser accessibility auditing, a measured load benchmark and a cloud restore drill still require validation or follow-up. Historical secrets must be rotated by their owners. No live provider accounts, paid hosting, public publication or destructive Git-history rewriting were performed automatically.

During implementation, two integration fixtures initially imported the database before their disposable configuration. Only newly created synthetic accounts/empty workspaces were affected and precisely removed; existing user records were not targeted. The imports were corrected, and test startup now forces an unusable database URL before any module loads plus a database-name guard. These safeguards make that failure mode fail closed.
