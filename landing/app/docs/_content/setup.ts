import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Installation & Setup",
  description:
    "Connect Aelix to your Robinhood Agentic account the safe way: clone the repo, trust the project MCP server, authenticate over OAuth, tighten the permission gate, and write a strategy before your first order.",
  eyebrow: "03 — INSTALLATION & SETUP",
  blocks: [
    {
      type: "prose",
      md: "This page is the full walkthrough from an empty desktop to a desk that can propose — but never silently place — a trade. It follows [`docs/SETUP.md`](/docs/setup) step for step: get the repo, trust the project-scoped MCP server, authenticate to Robinhood over OAuth, verify the real tool names, tighten the permission gate, and write a strategy before anything trades.",
    },
    {
      type: "prose",
      md: "Setup is deliberately conservative. The default posture is **everything gated** — every Robinhood tool call asks for your approval — and you loosen it deliberately, one read-only tool at a time. Nothing here weakens the guardrails in [`CLAUDE.md`](/docs/guardrails); it only wires the broker in behind them.",
    },
    {
      type: "callout",
      tone: "danger",
      title: "Real money · beta · decide your funding cap first",
      md: "You are connecting a live brokerage account. **Robinhood Agentic Trading is in beta (US, equities only)** — expect bugs. Before you authenticate, decide the amount you will fund the Agentic account with: **that budget is the most the agent can ever lose.** Start small. None of this is investment advice and there is no track record anywhere in the project. See [Safety & Disclaimer](/docs/disclaimer).",
    },
    {
      type: "heading",
      text: "Prerequisites",
    },
    {
      type: "list",
      items: [
        "A **Robinhood individual investing account** in good standing.",
        "A **desktop** device — you can only open the Agentic account and authenticate there.",
        "A **funding amount decided in advance.** This is the most the agent can ever lose. Start small.",
        "**Claude Code** installed and logged in.",
      ],
    },
    {
      type: "note",
      md: "The Agentic account opens and authenticates on desktop only. Have the Robinhood **mobile app** on hand too — OAuth includes a verification step there.",
    },
    {
      type: "diagram",
      title: "Setup, end to end",
      ascii: `1. CLONE      git clone … ─▶ cd rh-trading-agent   (.mcp.json ships the server)
2. TRUST      claude        ─▶ approve robinhood-trading (project-scoped MCP)
3. AUTH       /mcp          ─▶ OAuth in browser ─▶ verify in RH mobile app
                            ─▶ onboarding auto-opens ─▶ create + FUND Agentic acct
4. TIGHTEN    claude mcp get robinhood-trading ─▶ split tools deny / ask / allow
5. STRATEGY   write strategies/*.md            ─▶ caps + entry/exit rules
   ────────────────────────────────────────────────────────────────────────
   READY      first desk run stops at a preview card — you approve or pass`,
    },
    {
      type: "heading",
      text: "1. Get the repo locally",
    },
    {
      type: "code",
      lang: "bash",
      code: `git clone <your-private-repo-url> rh-trading-agent
cd rh-trading-agent`,
    },
    {
      type: "prose",
      md: "The repo's `.mcp.json` already defines the Robinhood Trading MCP server at **project scope**, so you do **not** need to run `claude mcp add` separately. The definition is a single HTTP endpoint:",
    },
    {
      type: "code",
      lang: "json",
      filename: ".mcp.json",
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
      type: "prose",
      md: "If you prefer to register it explicitly instead of relying on the project file, the equivalent command is:",
    },
    {
      type: "code",
      lang: "bash",
      code: `claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading`,
    },
    {
      type: "heading",
      text: "2. Launch and trust the project server",
    },
    {
      type: "code",
      lang: "bash",
      code: `claude`,
    },
    {
      type: "prose",
      md: "The first time you open this project, Claude Code asks whether to trust the project-scoped MCP server from `.mcp.json`. Approve **`robinhood-trading`**. The repo's `.claude/settings.json` pre-lists it under `enabledMcpjsonServers`, so the trust prompt is a one-time confirmation:",
    },
    {
      type: "code",
      lang: "json",
      filename: ".claude/settings.json",
      code: `"enabledMcpjsonServers": [
  "robinhood-trading"
]`,
    },
    {
      type: "callout",
      tone: "info",
      title: "Project scope, not global",
      md: "Because the server is defined in the repo, it only exists for this project. That keeps the broker connection scoped to the desk. For more on how MCP wires in and how tool names are namespaced as `mcp__robinhood-trading__*`, see [Connecting the Broker (MCP)](/docs/mcp).",
    },
    {
      type: "heading",
      text: "3. Authenticate (OAuth)",
    },
    {
      type: "prose",
      md: "Authentication happens inside the session. Open the MCP panel:",
    },
    {
      type: "code",
      code: `/mcp`,
    },
    {
      type: "steps",
      steps: [
        {
          label: "Pick the server",
          title: "Select robinhood-trading and authenticate",
          md: "From the `/mcp` panel, choose **`robinhood-trading`** and start the auth flow.",
        },
        {
          label: "Consent in browser",
          title: "Approve on Robinhood's OAuth screen",
          md: "A browser opens Robinhood's OAuth consent screen. **The agent never sees your password** — the OAuth handshake happens between you and Robinhood.",
        },
        {
          label: "Verify on mobile",
          title: "Complete the check in the Robinhood mobile app",
          md: "There is a verification step in the Robinhood **mobile app**. Approve it there to finish connecting.",
        },
        {
          label: "Create + fund",
          title: "Onboarding auto-opens for the Agentic account",
          md: "After connecting, Robinhood's onboarding auto-opens. **Create your Agentic account and fund it with your dedicated budget** — the amount you decided in advance. This isolated account is the only one the desk can trade.",
        },
      ],
    },
    {
      type: "callout",
      tone: "success",
      title: "The agent never handles your credentials",
      md: "OAuth means Claude Code holds a scoped token, not your Robinhood login. You can revoke the connection at any time from the Robinhood app or with the [kill switch](/docs/setup) below.",
    },
    {
      type: "heading",
      text: "4. Verify the tools and tighten permissions",
    },
    {
      type: "prose",
      md: "By default, **every** Robinhood tool call requires manual approval — the `ask` rule applied to `mcp__robinhood-trading__*`. That is intentional for the first runs: you watch every call before it happens. To refine it, you first need the real tool names.",
    },
    {
      type: "code",
      lang: "bash",
      code: `claude mcp get robinhood-trading`,
    },
    {
      type: "prose",
      md: "You can also run `/mcp` in-session to list them. Once you know the names, edit `.claude/settings.json`: move **read-only** tools (positions, buying power, quotes) into `allow` so routine reads stop prompting, and keep **order-placing** tools in `ask` — or in `deny` while you are still testing a strategy and want zero live orders.",
    },
    {
      type: "heading",
      level: 3,
      text: "How the three tiers are evaluated",
    },
    {
      type: "deflist",
      items: [
        {
          term: "deny",
          md: "Hard block. The tool cannot run, no prompt. Use it to physically wall off tools you never want touched — this repo denies the options order tools (`place_option_order`, `cancel_option_order`) because the desk is **equities only**.",
        },
        {
          term: "ask",
          md: "Gated. Every call pauses for your explicit in-session approval. This is where order tools live — `place_equity_order` stays in `ask` so a human always confirms.",
        },
        {
          term: "allow",
          md: "Runs without a prompt. Reserve it for **read-only** tools whose worst case is a wasted API call — quotes, positions, fundamentals, order history.",
        },
      ],
    },
    {
      type: "callout",
      tone: "warn",
      title: "Evaluation order: deny → ask → allow, first match wins",
      md: "Rules are checked **deny → ask → allow**, and the first match wins. Critically, a matching `ask` rule prompts **even when a broader `allow` also matches**. So a tool you want gated must be in `ask` or `deny` — never left to be overridden by a wide allow. When in doubt, gate it.",
    },
    {
      type: "prose",
      md: "Here is the illustrative example from `docs/SETUP.md`. The tool names are placeholders — **replace them with the actual names** from `claude mcp get`:",
    },
    {
      type: "code",
      lang: "json",
      filename: ".claude/settings.json (illustrative)",
      code: `{
  "permissions": {
    "deny": ["mcp__robinhood-trading__cancel_all"],
    "ask": ["mcp__robinhood-trading__place_order"],
    "allow": [
      "mcp__robinhood-trading__get_positions",
      "mcp__robinhood-trading__get_buying_power"
    ]
  }
}`,
    },
    {
      type: "prose",
      md: "For reference, the `.claude/settings.json` checked into this repo already ships a worked split you can start from and tighten. A representative slice of the real tool names:",
    },
    {
      type: "table",
      caption: "Representative tools from the repo's checked-in permission gate.",
      headers: ["Tier", "Behavior", "Example tools (real names)"],
      rows: [
        [
          "`allow`",
          "Runs, no prompt (read-only)",
          "`get_accounts`, `get_portfolio`, `get_equity_positions`, `get_equity_quotes`, `get_equity_fundamentals`, `get_equity_orders`, `run_scan`, `review_equity_order`",
        ],
        [
          "`ask`",
          "Pauses for approval",
          "`place_equity_order`, `cancel_equity_order`, `create_scan`, `create_watchlist`, `add_to_watchlist`",
        ],
        [
          "`deny`",
          "Hard block (not equities)",
          "`place_option_order`, `cancel_option_order`",
        ],
      ],
    },
    {
      type: "note",
      md: "Note that `review_equity_order` sits in `allow` — it only **builds a preview**, it does not place anything. The tool that actually submits an order, `place_equity_order`, stays in `ask`. For the full breakdown of every list, see [Configuration & Permissions](/docs/configuration).",
    },
    {
      type: "heading",
      text: "5. Define a strategy before trading",
    },
    {
      type: "prose",
      md: "Do not trade against an empty rulebook. Write your rules in `strategies/` — per-trade cap, max positions, entry/exit logic, stop conditions. `CLAUDE.md` requires **every proposed trade to map to a written rule there**, and the Risk Manager reads that folder before clearing any trade. If a cap is removed or left unset, the Risk Manager **VETOes**.",
    },
    {
      type: "callout",
      tone: "warn",
      title: "Review the caps before you fund",
      md: "The numbers shipped in `strategies/README.md` are conservative starting defaults, **not advice** — for example a per-trade cap and a max-position concentration expressed as a percent of account value (NAV). Edit them to match your budget and risk tolerance, then commit. You own these limits; the agent will not change them. Full details in [Strategies](/docs/strategies).",
    },
    {
      type: "heading",
      text: "Kill switch",
    },
    {
      type: "prose",
      md: "You can cut the broker connection at any time. Disconnect the MCP from the Robinhood app, or remove it locally:",
    },
    {
      type: "code",
      lang: "bash",
      code: `claude mcp remove robinhood-trading`,
    },
    {
      type: "compare",
      left: {
        title: "Removes",
        tone: "bad",
        rows: [
          "The desk's access to the broker over MCP",
          "Its ability to read positions or place orders",
        ],
      },
      right: {
        title: "Does not touch",
        tone: "good",
        rows: [
          "Your Robinhood account or its funds",
          "Existing positions or open orders",
          "The repo, strategies, or guardrails",
        ],
      },
    },
    {
      type: "heading",
      text: "Reminders & responsibilities",
    },
    {
      type: "callout",
      tone: "warn",
      title: "You stay responsible",
      md: "**Beta, equities only — expect bugs.** The funding cap limits how much you can lose; it does **not** make a strategy sound. You stay responsible for monitoring the desk. This is **not investment advice.**",
    },
    {
      type: "list",
      items: [
        "The **funding amount** is the hard ceiling on loss — nothing the agent does can exceed it, but a small cap does not validate the strategy behind a trade.",
        "Keep order tools in **`ask`** (or **`deny`** while testing). A gated order is the whole point — see [Guardrails](/docs/guardrails).",
        "Every trade must cite a written rule in `strategies/`, or the Risk Manager vetoes it — see [Strategies](/docs/strategies).",
        "When you are ready for a first run, follow the [Quickstart](/docs/quickstart) and watch it stop at a preview card.",
      ],
    },
    {
      type: "heading",
      text: "Where to go next",
    },
    {
      type: "cards",
      columns: 3,
      cards: [
        {
          title: "Connecting the Broker",
          badge: "MCP",
          md: "How the `robinhood-trading` server wires in, tool namespacing, and the HTTP transport. See [MCP](/docs/mcp).",
        },
        {
          title: "Configuration & Permissions",
          badge: "GATE",
          md: "The full `deny → ask → allow` breakdown and every tool's tier. See [Configuration](/docs/configuration).",
        },
        {
          title: "First desk run",
          badge: "QUICKSTART",
          md: "The fastest path from a connected broker to a preview card. See [Quickstart](/docs/quickstart).",
        },
      ],
    },
    {
      type: "pills",
      items: ["Desktop only", "OAuth", "Project-scoped MCP", "deny → ask → allow", "Fund small", "Equities only", "Beta"],
    },
  ],
};
