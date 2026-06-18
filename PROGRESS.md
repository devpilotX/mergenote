# Mergenote Progress

## Core Concept — DONE

- [x] MCP server with 3 tools: get_merged_prs, generate_changelog, post_changelog
- [x] All tools work against real GitHub API (proven E2E against devpilotX/mergenote)
- [x] No license/payment required to use (core is fully open)
- [x] npm package ready: name=mergenote, bin=mergenote, shebang correct, README with config snippets
- [x] Smart changelog mode: noise filtering, meaningful grouping, host-AI rewrite prompt
- [x] style parameter: "smart" (default) filters noise + groups + prompts host AI; "raw" preserves old behavior
- [x] Tested on vercel/next.js (182 PRs, 14-day range): smart mode filters 8 noise PRs, groups correctly
- [x] Dead code removed (lib/db.ts, lib/github.ts, lib/license.ts, mergenote.html)
- [x] Build passes, 46 unit tests pass

## Still Present (working, not core, for later)

- packages/backend/ — licensing API, PayPal webhooks, auth routes
- packages/website/ — marketing site + dashboard
- db/ — migration runner + schema

## Not Yet Done (future phases)

- [ ] Publish to npm (`npm publish` from packages/mcp-server)
- [ ] GitHub OAuth login flow (needs OAuth App credentials)
- [ ] PayPal checkout integration (needs sandbox plan IDs)
- [ ] License gating (re-add as premium tier once payment works)
- [ ] Deploy backend + website to production
- [ ] Email delivery (license keys, welcome, cancellation)
