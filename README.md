# Mergenote

**Mergenote** is an MCP (Model Context Protocol) server that turns merged GitHub PRs into clean, formatted release notes - directly from your AI assistant.

## What it does

- **`get_merged_prs`** - Fetch merged pull requests from any GitHub repo by tag range, date range, or the last 7 days (free tier)
- **`generate_changelog`** - Group PRs by category (Added, Fixed, Changed, etc.) and render a formatted changelog in markdown
- **`post_changelog`** - Post the changelog back to GitHub as a file commit, pull request, or GitHub Release

Free tier: 7-day PR window. Pro tier: unlimited history, larger repos.

## Architecture

```
mergenote/
  packages/
    mcp-server/     # MCP server (stdio + HTTP transports, 3 tools)
    backend/        # Express licensing backend (license CRUD, PayPal webhooks)
    website/        # Static marketing site
  db/               # PostgreSQL migration runner
```

## Prerequisites

- Node.js 20+
- pnpm 10+ (`npm install -g pnpm@10`)
- PostgreSQL running locally on port 5432

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/your-org/mergenote
cd mergenote
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in your values
```

Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `GITHUB_TOKEN` | GitHub PAT with `repo` scope |
| `PAYPAL_CLIENT_ID` | PayPal app client ID (sandbox) |
| `PAYPAL_CLIENT_SECRET` | PayPal app client secret (sandbox) |
| `PAYPAL_WEBHOOK_ID` | PayPal webhook ID (from developer dashboard) |
| `PAYPAL_ENV` | `sandbox` or `live` |
| `MERGENOTE_LICENSE` | License key for MCP server (unlocks pro features) |
| `LICENSE_API_URL` | Backend URL for license validation (default: `http://localhost:3100`) |
| `LICENSE_API_SECRET` | Shared secret for backend auth |
| `BACKEND_PORT` | Port for licensing backend (default: `3100`) |
| `WEBSITE_PORT` | Port for marketing site (default: `3200`) |
| `MCP_HTTP_PORT` | Port for MCP HTTP transport (default: `3300`) |

### 3. Create database and run migrations

```bash
# Create the database in psql first:
# CREATE DATABASE mergenote;

pnpm db:migrate
```

### 4. Build

```bash
pnpm build
```

## Running locally

### Backend (licensing API)

```bash
pnpm dev:backend
# Starts on http://localhost:3100
```

Endpoints:
- `GET /health` - health check
- `POST /api/license/validate` - validate a license key
- `GET /api/license/status?key=mn_live_...` - get license status
- `POST /api/licenses` - create license (admin)
- `POST /api/webhooks/paypal` - PayPal subscription webhooks

### MCP Server

```bash
# stdio (for Claude Desktop / Cursor)
pnpm dev:mcp

# HTTP transport (for web clients)
pnpm dev:mcp-http
# Starts on http://localhost:3300

# or run the built binary directly
node packages/mcp-server/dist/index.js
```

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mergenote": {
      "command": "node",
      "args": ["C:/path/to/mergenote/packages/mcp-server/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "your_token",
        "MERGENOTE_LICENSE": "mn_live_...",
        "LICENSE_API_URL": "http://localhost:3100"
      }
    }
  }
}
```

### Website

```bash
pnpm dev:website
# Serves on http://localhost:3200
```

## Running tests

```bash
pnpm test
```

All tests run via Vitest. Tests are unit tests with mocked DB and GitHub API - no real network calls required.

## Environment variables reference

See [.env.example](.env.example) for a full list with descriptions.

## PayPal Sandbox webhook simulation

With the backend running, simulate subscription events locally:

```bash
# Simulate SUBSCRIPTION.ACTIVATED (creates license)
curl -X POST http://localhost:3100/api/webhooks/paypal \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt_test",
    "event_type": "BILLING.SUBSCRIPTION.ACTIVATED",
    "resource": {
      "id": "I-TEST123",
      "plan_id": "P-PROPLAN",
      "subscriber": { "email_address": "buyer@example.com" }
    }
  }'

# Simulate SUBSCRIPTION.CANCELLED (revokes license)
curl -X POST http://localhost:3100/api/webhooks/paypal \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt_test2",
    "event_type": "BILLING.SUBSCRIPTION.CANCELLED",
    "resource": { "id": "I-TEST123" }
  }'
```

Note: `PAYPAL_WEBHOOK_ID` must be empty or verification will be skipped automatically in sandbox mode.

## Deployment

> **Local only during development.** Run `deploy` command only when explicitly ready for production.

## License

MIT
