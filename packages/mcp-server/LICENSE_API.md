# License Validation API Contract

This documents the API that **devpilotx.com** must expose for the Mergenote MCP server to validate license keys.

## Endpoint

```
POST https://devpilotx.com/api/license/validate
```

Override via env var `LICENSE_API_URL` (the server appends nothing if the URL already ends in `/validate`).

## Request

```json
{
  "key": "mn_live_abc123..."
}
```

| Field | Type   | Required | Description                          |
|-------|--------|----------|--------------------------------------|
| `key` | string | yes      | The user's `MERGENOTE_LICENSE_KEY`   |

Headers: `Content-Type: application/json`

## Response

```json
{
  "valid": true,
  "tier": "pro",
  "email": "user@example.com",
  "expires_at": "2027-01-15T00:00:00Z"
}
```

| Field        | Type                           | Required | Description                                              |
|--------------|--------------------------------|----------|----------------------------------------------------------|
| `valid`      | boolean                        | yes      | Whether the key is active and recognized                 |
| `tier`       | `"free"` \| `"pro"` \| `"team"` | yes      | The feature tier granted by this key                     |
| `email`      | string \| null                 | no       | Account email (informational only)                       |
| `expires_at` | ISO 8601 string \| null        | no       | When the license expires; null = no expiry               |

## Response codes

| Status | Meaning                        | MCP server behavior        |
|--------|--------------------------------|----------------------------|
| 200    | Valid JSON response            | Use `valid` + `tier` fields |
| 401    | Invalid key                    | Treat as free              |
| 4xx    | Any client error               | Treat as free              |
| 5xx    | Server error                   | Treat as free              |
| Timeout (>5s) | Unreachable              | Treat as free              |

## Behavior in the MCP server

- **No key set** (`MERGENOTE_LICENSE_KEY` empty/missing): skip call, treat as free.
- **`valid: false`**: treat as free regardless of tier value.
- **Network error / timeout / non-200**: treat as free, log warning, never crash.
- **`valid: true` + `tier: "pro"` or `"team"`**: unlock Pro features (unlimited date range).
- Validation runs once on server startup; result cached for the session lifetime.

## Env vars consumed by MCP server

| Variable               | Default                                              | Description                    |
|------------------------|------------------------------------------------------|--------------------------------|
| `MERGENOTE_LICENSE_KEY`| (none)                                               | License key to validate        |
| `LICENSE_API_URL`      | `https://devpilotx.com/api/license/validate`         | Full URL of the validation endpoint |
