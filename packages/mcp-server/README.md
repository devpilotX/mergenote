# mergenote

Turn merged pull requests into release notes, inside your AI assistant.

No conventional commits required. No API key for the tool. Works on any messy repo. Just point it at a GitHub repo and get a changelog.

## Why

Every release notes tool demands you restructure your workflow first: squash commits, enforce prefixes, configure YAML. Mergenote skips all of that. It reads your PRs as they are, filters the noise, and your AI assistant rewrites the rest into clean, user-facing notes.

## Install

```bash
npm install -g mergenote
```

## Setup

Add to your MCP client config:

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "mergenote": {
      "command": "mergenote",
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "mergenote": {
      "command": "mergenote",
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

**Kiro CLI**:
```bash
kiro-cli mcp add --name mergenote --command mergenote --env "GITHUB_TOKEN=ghp_your_token_here"
```

Or use npx (no install):
```json
{
  "mcpServers": {
    "mergenote": {
      "command": "npx",
      "args": ["-y", "mergenote"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

`GITHUB_TOKEN` needs `repo` scope to read PRs and create releases.

## Tools

| Tool | What it does |
|------|-------------|
| **get_merged_prs** | Fetch merged PRs from any repo by tag range, date range, or last N days |
| **generate_changelog** | Group PRs and produce a formatted changelog (smart mode filters noise and prompts rewrite; raw mode lists titles mechanically) |
| **post_changelog** | Publish the changelog as a GitHub Release, a file commit, or a pull request |

## Example: before and after

182 merged PRs from `vercel/next.js` over 14 days.

**Raw PR titles (what you get from GitHub):**
```
- [turbopack] Remove worker helpers from the default runtime (#94372)
- make `TaskInput::is_resolved` inlinable everywhere (#94213)
- Upgrade React from `f0dfee38-20260529` to `43bcbf80-20260603` (#94440)
- Revert "[ci] Increase TEST_CONCURRENCY from 8 to 12 (#94138)" (#94517)
- [turbopack] Enable Effects to be evicted (#94173)
- Extract App Shell from static prefetches (#94095)
```

**After mergenote (smart mode + AI rewrite):**
```
## v15.4.0 - 2026-06-18

### Improvements

- Turbopack ships less runtime code, reducing bundle size for all apps (#94372)
- Turbopack now evicts unused effects from memory, lowering dev server memory usage (#94173)
- Static prefetches extract App Shells automatically for faster page loads (#94095)

### Maintenance

8 changes: dependency updates, CI fixes, and reverts.
```

Bot PRs, CI noise, and reverts are collapsed or removed automatically. The AI assistant rewrites the remaining titles into plain English focused on what changed for the user.

## How it works

1. `get_merged_prs` fetches PR metadata from the GitHub API (titles, labels, authors, dates).
2. `generate_changelog` deterministically filters noise (bot authors, dep bumps, CI changes, reverts-of-reverts), groups by meaning (features, fixes, improvements), and returns structured data with a rewrite prompt.
3. Your AI assistant rewrites the grouped notes into user-facing language.
4. `post_changelog` publishes the result wherever you want.

No LLM API key is needed by the tool. The intelligence comes from the AI client you already have.

## Requirements

- Node.js 20+
- A GitHub personal access token with `repo` scope

## Links

- GitHub: https://github.com/devpilotX/mergenote
- Issues: https://github.com/devpilotX/mergenote/issues

## License

MIT
