# Setup

## Prerequisites

- A Robinhood individual investing account in good standing.
- A **desktop** device — you can only open the Agentic account and authenticate there.
- A funding amount decided in advance. **This is the most the agent can ever lose.**
  Start small.
- Claude Code installed and logged in.

## 1. Get the repo locally

```bash
git clone <your-private-repo-url> rh-trading-agent
cd rh-trading-agent
```

The `.mcp.json` in this repo already defines the Robinhood Trading MCP server
(project scope), so you don't need to run `claude mcp add` separately — but you can:

```bash
claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading
```

## 2. Launch and trust the project server

```bash
claude
```

The first time you open this project, Claude Code asks whether to trust the
project-scoped MCP server from `.mcp.json`. Approve `robinhood-trading`
(`enabledMcpjsonServers` in `.claude/settings.json` pre-lists it).

## 3. Authenticate (OAuth)

Inside the session:

```
/mcp
```

Pick `robinhood-trading` and authenticate. A browser opens Robinhood's OAuth consent
screen; the agent never sees your password. There's a verification step in the
Robinhood **mobile app**. After connecting, Robinhood's onboarding auto-opens — create
your Agentic account and fund it with your dedicated budget.

## 4. Verify the tools and tighten permissions

By default, **every** Robinhood tool call requires manual approval (the `ask` rule on
`mcp__robinhood-trading__*`). That's intentional for the first runs. To see the real
tool names:

```bash
claude mcp get robinhood-trading
```

or run `/mcp` in-session. Once you know the names, refine `.claude/settings.json`:

- Move **read-only** tools (positions, buying power, quotes) into `allow` so routine
  reads don't prompt.
- Keep **order-placing** tools in `ask` — or in `deny` while you're still testing a
  strategy and don't want any live orders.

Remember the evaluation order: **deny → ask → allow**, first match wins, and a matching
`ask` rule prompts even when a more specific `allow` also matches. So a tool you want
gated should be in `ask`/`deny`, not left to be overridden by a broad allow.

Example after you know the names (illustrative — replace with the actual tools):

```json
{
  "permissions": {
    "deny": ["mcp__robinhood-trading__cancel_all"],
    "ask": ["mcp__robinhood-trading__place_order"],
    "allow": [
      "mcp__robinhood-trading__get_positions",
      "mcp__robinhood-trading__get_buying_power"
    ]
  }
}
```

## 5. Define a strategy before trading

Write your rules in `strategies/` (per-trade cap, max positions, entry/exit logic).
`CLAUDE.md` requires every proposed trade to map to a written rule there.

## Kill switch

Disconnect the MCP anytime from the Robinhood app, or remove it locally:

```bash
claude mcp remove robinhood-trading
```

## Reminders

- Beta, equities only; expect bugs.
- The funding cap limits loss; it does not make a strategy sound.
- You stay responsible for monitoring. Not investment advice.
