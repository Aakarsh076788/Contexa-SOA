# Contexa connectors

Browser/editor extensions and bot gateways send normalized activity to `POST /api/connector-activity` with `X-Connector-Token`. The dashboard's manual test endpoint is `POST /api/activity` with `X-Session-Token`. All ingestion paths apply workspace privacy and collection controls.

```json
{
  "source": "chrome",
  "type": "page_opened",
  "title": "JWT expiration documentation",
  "detail": "example.com",
  "entity": "JWT expiration documentation",
  "entityType": "webpage",
  "href": "https://example.com/jwt",
  "project": "optional workspace or repository name",
  "externalId": "optional stable source event ID"
}
```

Stable external IDs deduplicate retries; events without them are deduplicated for a short delivery window. Do not send passwords, source-code contents or private browsing data. Chat content is subject to the workspace's message-content toggle; cloud AI is opt-in.

## Discord

Set `DISCORD_BOT_TOKEN` in `.env`, enable the required message-content intent in the Discord developer console, and run `npm run discord`. Add the bot to the intended server with appropriate permissions. Generate a Discord code in Contexa and send `!link CODE` in that server. `!unlink` removes the local server mapping. Use `DISCORD_TRACKED_CHANNELS` for an optional comma-separated channel-name allowlist.

## Telegram

Set `TELEGRAM_BOT_TOKEN` in `.env` and run `npm run telegram`. Add the bot to the intended chat/group, generate a Telegram code in Contexa, then send `/link CODE`. `/unlink` removes the local chat mapping. Telegram bot privacy and permissions determine which messages the gateway can receive.

Gateways run separately from the API. Saving a bot credential in the dashboard does not start a gateway or replace its environment configuration. Configure the gateway with the same bot before testing real delivery. Each chat/server mapping targets the workspace that supplied its pairing code.

Pairing maps are local ignored files. Updated gateways write encrypted credentials with explicit channel/chat approvals. Historical maps remain on disk but require administrator relinking before capture resumes. Keep the encryption key with the deployment. A global connector token never authorizes capture from an unapproved group.

GitHub uses an explicit token-based API sync for issue/pull-request metadata. Slack, Teams, Notion, Figma and other catalog concepts are not working integrations in this version.

### Capture approval and delivery

New pairings issue one source-scoped device credential; the server stores its
hash. Each installation can be disconnected in Connectors. Existing manual
credentials remain active until the workspace owner revokes the legacy credential.
Re-pair all installations first if you still need them.

Discord requires **Manage Server** permission to link or unlink. Linking approves
only the channel where the command is sent. Telegram requires a group administrator
or creator; private chats can be linked by their participant. Historical bot mapping
files are preserved, but must be linked again to record explicit approval. Bots no
longer capture unapproved groups through a global fallback token.

Chrome and VS Code retain at most 200 metadata events locally for up to 24 hours,
retry transient delivery failures with backoff, and preserve event IDs across retries.
Turning capture off, changing the API address, or changing credentials clears their
pending queue. Authentication rejection clears pending activity and requires pairing.
Bot delivery queues have the same count/time limits and are encrypted with the
server's secret key (local development may use `.local/secrets.key`). Give each bot
persistent writable private storage, preserve the encryption key, and exclude queue
files from backups when activity retention should expire. Unlink removes queued
activity for that credential. Never share bot state/key directories between tenants.
