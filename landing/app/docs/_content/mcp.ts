import type { DocContent } from "./types";

export const content: DocContent = {
  title: "MCP & Tools",
  description:
    "The robinhood-trading MCP server is the single connector between Claude Code and the Robinhood Agentic broker — how it connects, and every tool grouped by permission tier.",
  eyebrow: "11 — MCP & Tools",
  blocks: [
    {
      type: "prose",
      md: "Aelix reaches the broker through exactly one **Model Context Protocol (MCP)** server, named `robinhood-trading`. It is the only path to your account — there is no other API client, no scraper, and no second connection. Everything the desk reads or does at Robinhood goes through this server, and every call is subject to the permission tiers in [`.claude/settings.json`](/docs/configuration).",
    },
    {
      type: "prose",
      md: "The server is declared project-scoped in [`.mcp.json`](/docs/configuration), so opening the project in Claude Code prompts you to trust it. Authentication is **OAuth 2.0**, performed in-session — the agent never sees your password.",
    },
    {
      type: "heading",
      text: "The server definition",
    },
    {
      type: "prose",
      md: "The connection lives in `.mcp.json` at the repo root. It uses the HTTP transport pointed at Robinhood's agent endpoint:",
    },
    {
      type: "code",
      filename: ".mcp.json",
      lang: "json",
      code: `{
  "mcpServers": {
    "robinhood-trading": {
      "type": "http",
      "url": "https://agent.robinhood.com/mcp/trading"
    }
  }
}`,
    },
    {
      type: "note",
      md: "Because the server is project-scoped, `.claude/settings.json` pre-lists it under `enabledMcpjsonServers` so Claude Code knows it is expected.",
    },
    {
      type: "heading",
      text: "Connecting & authenticating",
    },
    {
      type: "prose",
      md: "You only need to do this once. Open the project, trust the server, then authenticate over OAuth from inside the session:",
    },
    {
      type: "code",
      lang: "bash",
      code: `# The .mcp.json above is enough, but you can also add it explicitly:
claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading

# In-session, authenticate (opens Robinhood's OAuth consent in a browser;
# a verification step happens in the Robinhood mobile app):
/mcp

# Inspect the server + its real tool names any time:
claude mcp get robinhood-trading`,
    },
    {
      type: "callout",
      tone: "warn",
      title: "Verify tool names before you rely on them",
      md: "Robinhood Agentic Trading is in beta and tool names can change. Confirm the **real** tool names with `/mcp` or `claude mcp get robinhood-trading` before hardening your permissions — then tighten `.claude/settings.json` to match. The names below reflect the entries currently in this repo's settings; treat them as a starting point, not gospel. See [Setup](/docs/setup).",
    },
    {
      type: "heading",
      text: "Tool inventory by permission tier",
    },
    {
      type: "prose",
      md: "Permissions are evaluated `deny → ask → allow`, first match wins — and a matching `ask` rule prompts even when a broader `allow` also matches. The desk's tools fall into three tiers:",
    },
    {
      type: "table",
      headers: ["Group", "Representative tools", "Tier"],
      rows: [
        ["Account & portfolio (read)", "`get_accounts`, `get_portfolio`, `get_equity_positions`, `get_equity_orders`", "**allow**"],
        ["Market data (read)", "`get_equity_quotes`, `get_equity_historicals`, `get_equity_fundamentals`, `get_equity_tradability`, `get_index_quotes`, `get_indexes`, `get_earnings_calendar`, `get_earnings_results`, `search`", "**allow**"],
        ["Scans & watchlists (read)", "`get_scans`, `run_scan`, `get_watchlists`, `get_watchlist_items`, `get_popular_watchlists`", "**allow**"],
        ["Order preview (read)", "`review_equity_order`", "**allow**"],
        ["Scan & watchlist mutations", "`create_scan`, `update_scan_config`, `update_scan_filters`, `create_watchlist`, `add_to_watchlist`, `remove_from_watchlist`, `follow_watchlist`", "**ask**"],
        ["Equity orders", "`place_equity_order`, `cancel_equity_order`", "**ask**"],
        ["Option orders", "`place_option_order`, `cancel_option_order`", "**deny**"],
      ],
      caption: "Exact lists live in `.claude/settings.json`. Option order tools are denied because the underlying beta is equities-only.",
    },
    {
      type: "callout",
      tone: "info",
      title: "Why review is allowed but place is gated",
      md: "`review_equity_order` only *builds a preview* — it never submits anything — so it is safe to `allow`. `place_equity_order` actually transacts, so it stays behind an `ask` prompt. That split is what lets the desk assemble a preview card automatically while still requiring your explicit approval to trade.",
    },
    {
      type: "heading",
      text: "Least privilege: who holds what",
    },
    {
      type: "prose",
      md: "Tool access is scoped per role in each agent's frontmatter. Only the **Portfolio Manager** holds the order tools (`review_equity_order`, `place_equity_order`). The three analysts and the Risk Manager have **no order tools at all** — they physically cannot place a trade. Each role gets only the read tools its job needs:",
    },
    {
      type: "list",
      items: [
        "**Fundamental Analyst** — `get_equity_fundamentals`, `get_earnings_calendar`, `get_earnings_results`, `get_equity_quotes`, `search`.",
        "**Technical Analyst** — `get_equity_historicals`, `get_equity_quotes`, `get_index_quotes`, `run_scan`, `get_scans`, `get_watchlist_items`.",
        "**Macro / News Analyst** — `WebSearch`, `WebFetch`, `get_index_quotes`, `get_indexes`, `get_earnings_calendar`.",
        "**Risk Manager** — `get_portfolio`, `get_equity_positions`, `get_accounts`, `get_equity_orders`, `get_equity_quotes` (read-only).",
      ],
    },
    {
      type: "note",
      md: "See [The Desk Team](/docs/team) for each role's full definition and [Configuration](/docs/configuration) for how frontmatter and settings fit together.",
    },
    {
      type: "heading",
      text: "Kill switch",
    },
    {
      type: "prose",
      md: "You can sever the connection at any time — this is your hard stop. Disconnect the MCP from the Robinhood app, or remove it locally:",
    },
    {
      type: "code",
      lang: "bash",
      code: `claude mcp remove robinhood-trading`,
    },
    {
      type: "callout",
      tone: "danger",
      title: "The account is isolated",
      md: "The desk may only ever trade the **Agentic** account; every other Robinhood account is read-only for context. This is enforced in [`CLAUDE.md`](/docs/guardrails) and checked by the Risk Manager, which VETOes anything that appears to touch a non-Agentic account.",
    },
    {
      type: "pills",
      items: ["HTTP transport", "OAuth 2.0", "Project-scoped", "deny → ask → allow", "Equities only"],
    },
  ],
};
