# Contexa

Contexa collects activity from selected tools, groups related work into contexts, and helps you resume with notes, resources, checkpoints, and portable prompts.

## Local setup

For the beta hardening changes and deployment/runbook, see [implementation status](docs/STARTUP-IMPLEMENTATION.md) and [deployment](docs/DEPLOYMENT.md).

Requires Node.js 22.12+ and PostgreSQL. Python is optional for the local matcher.

```sh
cp .env.example .env
# Set DATABASE_URL for your own PostgreSQL database.
npm ci
npm run db:generate
npm run db:migrate
npm run server
```

In a second terminal:

```sh
npm run dev
```

Alternatively, `npm run dev:all` checks the existing database and supervises both servers. Optional `LOCAL_PG_CTL` and `LOCAL_PG_DATA` settings can start an existing compatible local PostgreSQL cluster after reboot. It never initializes or migrates data automatically.

Open http://localhost:5173. Vite proxies `/api` to the backend on port 4000. For a single-server deployment, run `npm run build` and `npm start`; Express serves `dist/` and the API together. `VITE_API_BASE` is optional for a separately hosted frontend. It must be set at build time; configure matching CORS and CSP origins for that deployment.

The API binds to `127.0.0.1` by default. Set `HOST=0.0.0.0` explicitly when deploying behind an authenticated HTTPS reverse proxy. Set `NODE_ENV=production` and `CORS_ORIGIN` to the frontend origin. Do not expose the development server publicly.

## Safe disposable preview

```sh
npm run build
npm run preview:demo
```

Visit http://127.0.0.1:4173 and sign in with `preview@example.test` / `preview-password`. This is synthetic sample data in an isolated temporary PostgreSQL cluster. It never uses the database in `.env`. Press Ctrl+C to stop and remove the temporary database. The bundled test PostgreSQL binaries require a supported platform; the preview never creates operating-system users.

## Core workflow

1. Create an account and connect Chrome or VS Code from **Connectors**.
2. Open a research page or save a file; check **Capture diagnostics** for delivery.
3. Review unassigned signals in **Inbox**. Assign, separate, dismiss, create a context, or undo your last change.
4. Save a session note and a next action on **Overview**.
5. Continue the task, inspect its evidence, create checkpoints/branches, prepare a restore plan, or export a prompt/handoff.

A context is created automatically when related unassigned signals support it. Isolated signals stay in the inbox. Strong deterministic evidence can group activities locally. Ambiguous matches can use the local ML service; cloud processing requires a workspace opt-in.

Use **Appearance** in the workspace header to choose Mint, Iris, or Sky accents, switch between comfortable and compact spacing, or turn off motion. Preferences stay in your browser. Animations also respect your device’s reduced-motion setting. Press `/` outside a text field to focus workspace search; Escape clears the query. The presentation layer lives in `src/theme.css`.

## Privacy and credentials

- Cloud AI is **off by default**, including for existing workspaces without an explicit preference. Enable it in Settings to permit captured text to be sent to configured providers.
- Chrome captures titles, domains, search terms, and URL paths; VS Code captures file/workspace metadata. Chat connectors can capture message text. Turn **Chat message content** off to store channel/chat labels instead for new captures.
- Global pause, per-app pause, excluded domains (including subdomains), and excluded projects apply at server ingestion, including GitHub sync and test signals.
- Retention removes expired events and unused resources hourly while the server runs. Notes and context descriptions remain until you delete their contexts or workspace data. Choose **Keep forever** to disable automatic expiry. The first cleanup is one hour after server start.
- New provider credentials are encrypted with AES-256-GCM. Existing plaintext workspace credentials are encrypted on the next authenticated access. Public settings and workspace exports omit provider credentials and account/session secrets.
- Set `CONTEXA_SECRET_KEY` to 64 random hexadecimal characters for deployment. Otherwise Contexa creates `.local/secrets.key` with restrictive file permissions. **Back up that key separately and preserve it across deployments**; encrypted credentials cannot be recovered without it.
- Local `.env`, bot pairing maps, snapshots, scratch data, and old source backups are excluded from Git. Removing them from the current index does not remove historical commits. See [security notes](docs/SECURITY.md) before sharing the repository.

## Connectors

- [Chrome](chrome-extension/README.md): unpacked Manifest V3 extension with a six-character pairing code.
- [VS Code](vscode-extension/README.md): extension-host development install or package as a VSIX; supports pairing and secure token storage.
- [Discord and Telegram](connectors/README.md): run their gateway process separately with bot credentials in the environment.
- GitHub: connect a personal access token with access to the repositories you intend to sync. Explicit sync reads issues and pull requests from up to five recently updated repositories; commits and automatic scheduling are not implemented.

Rebuild ZIP downloads after editing connectors:

```sh
npm run connectors:package
npm run build
```

## Optional local ML

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r ml/requirements.txt
python ml/server.py
```

The matcher listens on `127.0.0.1:5001`. Existing saved model/vectorizer artifacts are included. Retrain with `python ml/train.py` when needed; training fits vocabulary on the training split only. The older training report describes synthetic-data performance and is not a real-world accuracy claim.

## Verification

```sh
npm run check
npm test
npm run build
npm run evaluate
```

`npm test` includes offline policy/matching regressions and HTTP/database integration tests. Integration and smoke tests start temporary PostgreSQL clusters, apply committed migrations, and remove those clusters afterward. They never apply migrations to the database in `.env`.

`npm run evaluate` measures rules on a small hand-labeled regression fixture and reports false merges and missed matches separately. `node scripts/evaluate-matching.js --local` compares local ML when it is running. Explicitly set `ALLOW_CLOUD_EVALUATION=true` and use `--cloud` to evaluate cloud fallback on the fixture. No evaluation calls cloud AI by default.

## Project map

- `src/main.jsx`: app shell, navigation, session and workspace loading.
- `src/pages/`: page-level interfaces; `src/components/`: shared UI, activity review, graph, search.
- `src/lib/`: API client, observed analytics, connector catalog, modal focus handling.
- `backend/routes/`: authenticated APIs; `backend/services/`: privacy, secrets, checkpoints, import/merge, reviews, retention and diagnostics.
- `backend/engine/`: extraction, scoring, local/cloud matching, ingestion and prompt generation.
- `prisma/`: database schema and additive migrations.
- `ml/`: optional model, training and inference service.

Notifications and unsupported catalog integrations are deliberately not presented as working features. See [implementation notes](docs/IMPROVEMENTS.md) for the scope and remaining operational steps.
