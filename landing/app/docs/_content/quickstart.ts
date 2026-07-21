import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Quickstart",
  description:
    "The fastest path from clone to first desk run — private repo, connect the Robinhood MCP over OAuth, fund a small Agentic budget, set your caps, and drive the desk in plain language.",
  eyebrow: "02 — Quickstart",
  blocks: [
    {
      type: "prose",
      md: "This is the shortest route from an empty folder to your first **desk run**. You'll make the repo private, clone it, connect the [Robinhood Trading MCP](/docs/mcp) server over OAuth, fund an isolated **Agentic** account with a small dedicated budget, write your risk caps, and then talk to the **Portfolio Manager** in plain language. The desk researches, risk-checks, and stops at a **preview card** — you approve; it places.",
    },
    {
      type: "prose",
      md: "Every step below is grounded in the repo's own [`README.md`](/docs/setup) and [`docs/SETUP.md`](/docs/setup). For the full, annotated walkthrough — refining permissions, verifying tool names, tightening guardrails — read [Installation & Setup](/docs/setup) after you finish here.",
    },
    {
      type: "callout",
      tone: "danger",
      title: "Real money · beta · not investment advice",
      md: "Robinhood Agentic Trading is in **beta** (US, equities only). The desk only ever trades inside an isolated Agentic account funded with a dedicated budget — **that budget is the most it can lose**. There is no track record and no performance claim anywhere in this project. Run it at your own risk and monitor it yourself. See [Safety & Disclaimer](/docs/disclaimer).",
    },
    {
      type: "heading",
      text: "Before you start",
    },
    {
      type: "prose",
      md: "You need four things: a Robinhood **individual** account in good standing, a **desktop** device, **Claude Code** installed and logged in, and a **funding amount you've decided in advance**.",
    },
    {
      type: "list",
      items: [
        "**Robinhood individual investing account** — in good standing. The desk connects on top of it and trades only inside a separate Agentic account.",
        "**A desktop device** — you can only open the Agentic account and complete authentication on desktop.",
        "**Claude Code, installed and logged in** — the desk runs entirely inside a Claude Code session.",
        "**A small dedicated budget, decided up front** — this is the most the agent can ever lose. Start small.",
      ],
    },
    {
      type: "note",
      md: "The funding cap limits loss; it does **not** make a strategy sound. You stay responsible for monitoring.",
    },
    {
      type: "heading",
      text: "From clone to first run",
    },
    {
      type: "prose",
      md: "The whole path is seven moves. Each is expanded with the exact commands below.",
    },
    {
      type: "steps",
      steps: [
        {
          label: "Step 1",
          title: "Make the repo private",
          md: "Before pushing anything anywhere, set the repository to **private**. It holds guardrails and strategy notes — never secrets, and never the OAuth token.",
        },
        {
          label: "Step 2",
          title: "Clone it",
          md: "A plain `git clone` is enough — the shipped `.mcp.json` already declares the `robinhood-trading` server at project scope.",
        },
        {
          label: "Step 3",
          title: "Open, trust, authenticate, fund",
          md: "Launch `claude`, trust the project MCP server, run `/mcp` to authenticate over OAuth, then create and fund the Agentic account.",
        },
        {
          label: "Step 4",
          title: "Set your caps",
          md: "Write your risk caps in [`strategies/`](/docs/strategies). If a cap is missing, the **Risk Manager VETOes** every trade.",
        },
        {
          label: "Step 5",
          title: "Start the dashboard",
          md: "Run the read-only [dashboard](/docs/dashboard) so you can watch the desk's state as it runs.",
        },
        {
          label: "Step 6",
          title: "Drive the desk",
          md: "Ask the PM in plain language to screen your watchlist or run the desk on specific tickers.",
        },
        {
          label: "Step 7",
          title: "Approve at the preview",
          md: "The desk stops at a preview card. You approve in-session; only then does it place — still gated by the `ask` rule.",
        },
      ],
    },
    { type: "divider" },
    {
      type: "heading",
      text: "1 · Make the repo private",
    },
    {
      type: "prose",
      md: "This repository holds the **guardrails, strategy notes, agents, dashboard, and setup docs** — never secrets, and never the OAuth token (those live outside the repo). Even so, set it to **private** before you push anything. Do this first.",
    },
    {
      type: "callout",
      tone: "warn",
      title: "Never commit live state or secrets",
      md: "Your real `.env` (Agentic account number) and the live `ui/public/desk-state.json` (real balances and positions) are **gitignored** on purpose. Only the sanitized `desk-state.example.json` is committed. Don't override those ignores.",
    },
    {
      type: "heading",
      text: "2 · Clone the repo",
    },
    {
      type: "prose",
      md: "Clone your private repo. The shipped `.mcp.json` already defines the Robinhood Trading MCP server at **project scope**, so you don't need a separate `claude mcp add` step — the plain clone is enough.",
    },
    {
      type: "code",
      lang: "bash",
      code: "git clone <your-private-repo-url> rh-trading-agent\ncd rh-trading-agent",
    },
    {
      type: "note",
      md: "Prefer to register it by hand? `claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading` adds the same HTTP server.",
    },
    {
      type: "heading",
      text: "3 · Open, trust, authenticate, and fund",
    },
    {
      type: "prose",
      md: "Open the project with `claude`. The first time, Claude Code asks whether to trust the project-scoped MCP server from `.mcp.json` — approve `robinhood-trading` (it's already pre-listed under `enabledMcpjsonServers` in `.claude/settings.json`). Then, inside the session, run `/mcp`, pick `robinhood-trading`, and authenticate: a browser opens Robinhood's OAuth consent screen (**the agent never sees your password**), with a verification step in the Robinhood **mobile app**. Once connected, Robinhood's onboarding auto-opens so you can create your Agentic account and fund it with your dedicated budget.",
    },
    {
      type: "code",
      lang: "bash",
      filename: "one-time setup",
      code: "claude                  # 1. open the project; trust the robinhood-trading server\n#  /mcp                 # 2. in-session: pick robinhood-trading -> OAuth in browser\n#                       #    then complete the verify step in the Robinhood mobile app\n#  (onboarding opens)   # 3. create the Agentic account, fund your dedicated budget\ncp .env.example .env    # 4. record your Agentic account number in .env",
    },
    {
      type: "note",
      md: "To see the real tool names once connected, run `claude mcp get robinhood-trading` (or `/mcp` in-session). By default **every** Robinhood tool call is gated by an `ask` rule on `mcp__robinhood-trading__*` — that's intentional for the first runs. Refining that gate is covered in [Configuration](/docs/configuration).",
    },
    {
      type: "heading",
      text: "4 · Set your strategy caps",
    },
    {
      type: "prose",
      md: "`CLAUDE.md` requires **every proposed trade to map to a written rule** in [`strategies/`](/docs/strategies), and the **Risk Manager reads that folder before clearing any trade**. If a cap is removed, blank, or left as `TODO`, the Risk Manager **VETOes** — so fill these in before you trade. The defaults below are conservative starting values you own and edit; they're **illustrative, not advice**.",
    },
    {
      type: "table",
      caption: "Default risk caps from strategies/README.md — edit to match your budget.",
      headers: ["Cap", "Default", "Purpose"],
      rows: [
        ["**Per-trade cap**", "15% of equity", "Hard ceiling on any one `place_equity_order`."],
        ["**Max concentration**", "25% of equity in one symbol", "Blocks over-concentration; includes all adds."],
        ["**Max open positions**", "6", "Forces diversification in a small account."],
        ["**Max daily orders**", "4", "Throttles churn; counts buys + sells per day."],
        ["**Per-position stop-loss**", "−8% from average entry", "Every entry must define this before it's placed."],
        ["**Daily loss halt**", "−5% account day P&L", "Stop, report, and ask for the rest of the day."],
        ["**Cash buffer**", "≥10% of equity in cash", "Never fully deploy."],
      ],
    },
    {
      type: "callout",
      tone: "info",
      title: "You own these limits",
      md: "The agent will not change your caps — if you want different limits, you edit the files. There's also a strict **no-averaging-into-losers** rule. Read [Strategies](/docs/strategies) for the full ruleset and [Guardrails](/docs/guardrails) for why the desk can't weaken them.",
    },
    {
      type: "heading",
      text: "5 · Start the dashboard",
    },
    {
      type: "prose",
      md: "The [dashboard](/docs/dashboard) is a **read-only mirror**, not a controller — it visualizes the `desk-state.json` snapshot the PM writes after each run and **cannot place orders**. Start it in a separate terminal.",
    },
    {
      type: "code",
      lang: "bash",
      code: "cd ui\nnpm install\nnpm run dev          # opens http://localhost:5180",
    },
    {
      type: "note",
      md: "A demo `public/desk-state.example.json` ships so the UI looks alive on a fresh clone; your first live run replaces it. The app polls the snapshot every ~5s and cache-busts each poll, so writes appear within about five seconds without a reload.",
    },
    {
      type: "heading",
      text: "6 · Drive the desk",
    },
    {
      type: "prose",
      md: "You talk to the **Portfolio Manager** — the main Claude Code session — in plain language. It fans out to the three analysts in parallel, routes their verdicts through the Risk Manager, and comes back with a preview. Try prompts like these.",
    },
    {
      type: "code",
      lang: "text",
      filename: "example PM prompts",
      code: "Screen my watchlist and bring me the top 2 ideas with full team analysis.\n\nRun the desk on AAPL and NVDA — fundamental, technical, macro, then\nrisk-check a small starter position in the better one.\n\nAfter the desk run, write the state to ui/public/desk-state.json.",
    },
    {
      type: "prose",
      md: "The desk **senses** the account, **screens** your watchlist, **researches** the survivors with three analysts, **synthesizes** a candidate tied to a written rule, and **risk-checks** it. Those steps produce **no order**. See [The Desk Run](/docs/workflow) for the full pipeline and [The Desk Team](/docs/team) for who does what.",
    },
    {
      type: "callout",
      tone: "success",
      title: "The desk stops at the preview — you place the order",
      md: "Research and risk checks produce **no order**. The desk's standard output is a **preview card** built from `review_equity_order`, and it **waits** there for your explicit in-session confirmation. Only on your yes does the PM call `place_equity_order` — and that call is **still gated by the `ask` rule**, so you approve one more time at the permission prompt. No order is ever placed on a schedule or on its own.",
    },
    {
      type: "heading",
      text: "Kill switch",
    },
    {
      type: "prose",
      md: "You can cut the desk off from your broker at any time — either disconnect the MCP from the Robinhood app, or remove the server locally.",
    },
    {
      type: "code",
      lang: "bash",
      code: "claude mcp remove robinhood-trading",
    },
    {
      type: "heading",
      text: "Common gotchas",
    },
    {
      type: "deflist",
      items: [
        {
          term: "Restart after editing agents",
          md: "The sub-agents in `.claude/agents/` load when Claude Code **starts**. After adding or editing them, restart the session so roles like `fundamental-analyst` are recognized with their restricted tool sets.",
        },
        {
          term: "Permission order is deny → ask → allow",
          md: "First match wins, and a matching `ask` rule prompts **even when** a more specific `allow` also matches. Keep order-placing tools in `ask` (or `deny` while testing), not overridden by a broad allow. Details in [Configuration](/docs/configuration).",
        },
        {
          term: "Unset caps mean VETO",
          md: "If `strategies/` caps are missing, blank, or `TODO`, the Risk Manager blocks every trade. Fill them in before your first run — see [Strategies](/docs/strategies).",
        },
        {
          term: "The dashboard can't trade",
          md: "The UI at `http://localhost:5180` only mirrors `desk-state.json`. Approval and execution happen **only** in the Claude Code session. More in [Dashboard](/docs/dashboard).",
        },
      ],
    },
    {
      type: "callout",
      tone: "info",
      title: "Next steps",
      md: "Ready for the fully annotated version? Read [Installation & Setup](/docs/setup) for OAuth details and permission tuning, then [The Desk Run](/docs/workflow) to see exactly what happens end to end during a run.",
    },
    {
      type: "pills",
      items: ["Private repo", "Desktop only", "Small budget = max loss", "localhost:5180", "Human-in-the-loop", "Beta"],
    },
  ],
};
