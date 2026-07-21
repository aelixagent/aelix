import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Configuration",
  description:
    "Every config file and knob in the Aelix repo — the MCP connection, the permission gate, the desk sub-agents, and where secrets must never live.",
  eyebrow: "10 — Configuration",
  blocks: [
    {
      type: "prose",
      md: "Aelix has **no settings UI and no database** — its entire configuration is a handful of plain files you can read, diff, and edit. The operating contract, the broker connection, the permission gate, the desk roles, and the risk caps are all text on disk. That is the point: every safeguard is something you can audit, not a setting hidden behind a toggle.",
    },
    {
      type: "prose",
      md: "This page is the reference for each file and every knob inside it. The rules themselves are covered in [Guardrails](/docs/guardrails); how the broker connection is wired is covered in [MCP](/docs/mcp); and the first-time OAuth walkthrough lives in [Installation & Setup](/docs/setup). Here we focus on the files: what each one is for, what a faithful copy looks like, and what you should and should not change.",
    },
    {
      type: "callout",
      tone: "info",
      title: "Configuration is code review",
      md: "Because the whole config is files, changing the desk's behavior is a **commit** you can review. If you want to change the rules, you edit the files — the agent is told in [`CLAUDE.md`](/docs/guardrails) that it may **not** weaken its own guardrails.",
    },
    {
      type: "heading",
      text: "Repo config map",
    },
    {
      type: "prose",
      md: "Seven files (or file groups) hold the whole configuration surface. Everything else in the repo is application code — the [dashboard](/docs/dashboard), the [backtester](/docs/backtesting), and helper tools.",
    },
    {
      type: "table",
      headers: ["File", "Purpose"],
      rows: [
        ["`CLAUDE.md`", "The Portfolio Manager's operating contract — scope, hard guardrails, prompt-injection defense, and process. See [Guardrails](/docs/guardrails)."],
        ["`.mcp.json`", "The project-scoped Robinhood Trading MCP server (host + transport). See [MCP](/docs/mcp)."],
        ["`.claude/settings.json`", "Permissions (`allow` / `ask` / `deny`), enabled MCP servers, and the session-start hook."],
        ["`.claude/agents/*.md`", "The desk sub-agents — one file per role, each with a least-privilege tool list. See [The Desk Team](/docs/team)."],
        ["`strategies/*.md`", "Risk caps and entry/exit rules the Risk Manager enforces. See [Strategies](/docs/strategies)."],
        ["`ui/public/desk-state.json`", "The live snapshot the PM writes after each run. **Gitignored**; a sanitized `desk-state.example.json` ships instead. See [Dashboard](/docs/dashboard)."],
        ["`logs/*.jsonl`", "Append-only audit trail of desk decisions. See [Logging](/docs/logging)."],
      ],
    },
    {
      type: "note",
      md: "Personal \"allow always\" choices are written to `.claude/settings.local.json`, which is gitignored — your local approvals never leak into the shared repo.",
    },
    {
      type: "heading",
      text: "The broker connection — .mcp.json",
    },
    {
      type: "prose",
      md: "`.mcp.json` declares the one MCP server the desk talks to. It is a **project-scoped** file: the connection lives with the repo, not in your global Claude Code config, so anyone who opens this folder gets the same broker wiring.",
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
      type: "deflist",
      items: [
        { term: "robinhood-trading", md: "The server name the permission rules and sub-agent tool lists reference (tools appear as `mcp__robinhood-trading__<tool>`)." },
        { term: "type: http", md: "A remote HTTP MCP transport — Claude Code connects out to Robinhood's hosted endpoint; nothing runs locally." },
        { term: "url", md: "`https://agent.robinhood.com/mcp/trading` — the Robinhood Agentic Trading endpoint (US, equities, beta)." },
      ],
    },
    {
      type: "callout",
      tone: "info",
      title: "Trust on first open",
      md: "Because the server is project-scoped, Claude Code asks you to **trust** the `.mcp.json` server the first time you open the folder. Nothing authenticates until you run the OAuth flow — see [MCP](/docs/mcp) and [Setup](/docs/setup). This file holds **no** tokens or secrets.",
    },
    {
      type: "heading",
      text: "Permissions & hooks — .claude/settings.json",
    },
    {
      type: "prose",
      md: "`.claude/settings.json` is the permission gate. It sorts every tool call into one of three buckets — `allow`, `ask`, or `deny` — and it also enables the MCP server and registers a session-start hook. This is the file that makes \"human approval for every order\" **structural** rather than a hope.",
    },
    {
      type: "prose",
      md: "The `permissions` object holds three arrays. Below is a **trimmed but faithful** excerpt — the real file lists every read tool the desk uses; these are representative entries from each bucket.",
    },
    {
      type: "code",
      lang: "json",
      filename: ".claude/settings.json (excerpt)",
      code: `{
  "permissions": {
    "allow": [
      "mcp__robinhood-trading__get_portfolio",
      "mcp__robinhood-trading__get_equity_positions",
      "mcp__robinhood-trading__get_equity_quotes",
      "mcp__robinhood-trading__run_scan",
      "mcp__robinhood-trading__review_equity_order"
    ],
    "ask": [
      "mcp__robinhood-trading__place_equity_order",
      "mcp__robinhood-trading__cancel_equity_order",
      "mcp__robinhood-trading__create_watchlist"
    ],
    "deny": [
      "mcp__robinhood-trading__place_option_order",
      "mcp__robinhood-trading__cancel_option_order"
    ]
  },
  "enabledMcpjsonServers": ["robinhood-trading"],
  "defaultMode": "default"
}`,
    },
    {
      type: "prose",
      md: "Rules are evaluated **`deny` → `ask` → `allow`, first match wins**. A tool named in `deny` is blocked outright and cannot be re-enabled by an `allow` entry; a tool in `ask` pauses for your confirmation even if it would otherwise be allowed; only tools matched by `allow` run silently. Anything not matched by any list falls back to the default mode.",
    },
    {
      type: "deflist",
      items: [
        { term: "allow", md: "Runs with **no prompt**. Reserved for read-only market and account reads (`get_portfolio`, `get_equity_quotes`, …), scans (`run_scan`), the preview-only `review_equity_order`, plus `WebSearch`, a few whitelisted `WebFetch` news domains, and a handful of `git` and `Skill` commands." },
        { term: "ask", md: "Claude Code **pauses and asks you** in-session before the call. This is where every order lives: `place_equity_order` and `cancel_equity_order`, alongside scan- and watchlist-mutating tools." },
        { term: "deny", md: "**Blocked outright**, no prompt, no override. Holds `place_option_order` and `cancel_option_order` — options aren't supported in this equities-only beta, so they are hard-denied." },
      ],
    },
    {
      type: "callout",
      tone: "warn",
      title: "review is not place",
      md: "`review_equity_order` sits in `allow` because it only **builds a preview** — it never sends an order. The tool that actually places, `place_equity_order`, sits in `ask` and stays there. Read the two names carefully before you move anything between buckets.",
    },
    {
      type: "heading",
      level: 3,
      text: "enabledMcpjsonServers",
    },
    {
      type: "prose",
      md: "`enabledMcpjsonServers` pre-lists `robinhood-trading`, so the project's `.mcp.json` server is enabled for the desk rather than prompting to enable it on every session. Trust is still established the first time you open the folder.",
    },
    {
      type: "heading",
      level: 3,
      text: "The SessionStart hook",
    },
    {
      type: "prose",
      md: "A `hooks.SessionStart` entry runs a shell script when a session **starts or resumes** — the desk uses it to check whether today's left-side (pre-market) scan has run.",
    },
    {
      type: "code",
      lang: "json",
      filename: ".claude/settings.json — hooks",
      code: `"hooks": {
  "SessionStart": [
    {
      "matcher": "startup|resume",
      "hooks": [
        {
          "type": "command",
          "command": "bash .claude/hooks/left-side-scan-gate.sh",
          "timeout": 15,
          "statusMessage": "Checking daily left-side scan…"
        }
      ]
    }
  ]
}`,
    },
    {
      type: "deflist",
      items: [
        { term: "matcher: startup|resume", md: "Fires both when a fresh session starts and when an existing one resumes." },
        { term: "type: command", md: "Runs a shell command; here `bash .claude/hooks/left-side-scan-gate.sh`." },
        { term: "timeout: 15", md: "The hook is given 15 seconds before it is cut off." },
        { term: "statusMessage", md: "The line shown while the hook runs — `Checking daily left-side scan…`." },
      ],
    },
    {
      type: "note",
      md: "`defaultMode` is `default`: tools follow the rules above and Claude Code prompts for anything not pre-allowed — no auto-accept or bypass mode.",
    },
    {
      type: "heading",
      text: "Sub-agent definitions — .claude/agents/*.md",
    },
    {
      type: "prose",
      md: "Each desk role is one Markdown file in `.claude/agents/`. A YAML frontmatter block at the top defines the role's identity and, critically, its **tool allowlist** — the sub-agent can call nothing outside that list. The body is the role's system prompt. The full roster is on [The Desk Team](/docs/team).",
    },
    {
      type: "table",
      headers: ["Field", "What it does"],
      rows: [
        ["`name`", "The handle the PM dispatches (e.g. `fundamental-analyst`)."],
        ["`description`", "Tells the PM **when** to call this role — and states plainly that it does **not** decide trades or place orders."],
        ["`tools`", "A comma-separated, **least-privilege** allowlist. The sub-agent physically cannot call anything not listed — analysts have **no** order tools at all."],
        ["`model`", "Which model backs the role: `sonnet` for the three analysts, `opus` for the Risk Manager."],
      ],
    },
    {
      type: "prose",
      md: "Here is the actual frontmatter for the Fundamental Analyst — note the tool list is read-only market and earnings data plus `Read`, with no order or mutation tools anywhere in it.",
    },
    {
      type: "code",
      lang: "yaml",
      filename: ".claude/agents/fundamental-analyst.md",
      code: `---
name: fundamental-analyst
description: Equity fundamental analyst on the trading desk. Use to assess valuation, earnings quality, growth, and balance-sheet health for one or more tickers before a trade decision. Returns a structured fundamental verdict — it does NOT decide trades or place orders.
tools: Read, mcp__robinhood-trading__get_equity_fundamentals, mcp__robinhood-trading__get_earnings_calendar, mcp__robinhood-trading__get_earnings_results, mcp__robinhood-trading__get_equity_quotes, mcp__robinhood-trading__search
model: sonnet
---`,
    },
    {
      type: "prose",
      md: "The **Risk Manager** follows the same shape but is deliberately different: `model: opus` (the last gate before a human sees a trade deserves the stronger model) and a tool list of `Read`, `Grep`, and read-only account/portfolio/order tools — enough to check a proposal against `strategies/`, and nothing that could place, cancel, or preview an order.",
    },
    {
      type: "callout",
      tone: "warn",
      title: "Sub-agents load at startup — restart after editing",
      md: "The files in `.claude/agents/` are read when Claude Code **starts**. After you add or edit a role, **restart the session** so the role is recognized with its restricted tool set. An edit you don't restart into simply isn't live.",
    },
    {
      type: "heading",
      text: "Account number & secrets",
    },
    {
      type: "prose",
      md: "Your Agentic **account number** is recorded outside version control: copy `.env.example` to `.env` and put the number there. `.env` is gitignored. **No secret, token, or credential belongs in this repo** — the OAuth token that authorizes trading is issued and held by the broker connection, never written to a tracked file.",
    },
    {
      type: "prose",
      md: "The `.gitignore` encodes those boundaries so a stray secret can't be committed by accident:",
    },
    {
      type: "code",
      lang: "text",
      filename: ".gitignore (protections)",
      code: `# Claude Code local/personal overrides (where "allow always" writes rules)
.claude/settings.local.json

# OAuth tokens and credentials — must never be committed
.claude.json
*.token
*.key
*.pem
.env
.env.*

# Secrets
secrets/
credentials/

# Live desk snapshot written by the PM (contains real account state)
ui/public/desk-state.json

# Runtime control file: the dashboard "Run desk" button writes it; the PM's /loop reads it.
desk-request.json`,
    },
    {
      type: "compare",
      left: {
        title: "Lives in the repo",
        tone: "good",
        rows: [
          "CLAUDE.md — the operating contract",
          ".mcp.json — the broker host + transport (no token)",
          ".claude/settings.json — the permission gate",
          ".claude/agents/*.md — the desk roles",
          "strategies/*.md — risk caps + rules",
          "ui/public/desk-state.example.json — sanitized demo data",
        ],
      },
      right: {
        title: "Never in the repo",
        tone: "bad",
        rows: [
          "The Robinhood OAuth token / credentials",
          ".env — your Agentic account number",
          ".claude/settings.local.json — personal approvals",
          "ui/public/desk-state.json — real live account state",
          "Anything under secrets/ or credentials/",
          "*.token, *.key, *.pem files",
        ],
      },
    },
    {
      type: "callout",
      tone: "danger",
      title: "Never commit secrets or the OAuth token",
      md: "Make the repo **private** before pushing anything, and never remove a protection from `.gitignore` to force a file in. If you ever suspect a token was committed, treat it as compromised: rotate it at the broker and disconnect the MCP. Your kill switch is disconnecting `robinhood-trading` from the Robinhood app or removing it locally.",
    },
    {
      type: "heading",
      text: "Tightening permissions",
    },
    {
      type: "prose",
      md: "The tool names shipped in `.claude/settings.json` are the desk's best guess at the server's surface. Once you've connected and authenticated, you can see the **real** tool names the `robinhood-trading` server exposes and refine the rules to match — narrowing `allow` and confirming every order path stays gated.",
    },
    {
      type: "steps",
      steps: [
        {
          label: "01",
          title: "See the real tool names",
          md: "After OAuth, run `/mcp` in-session to list what the server actually exposes. Names may differ from the placeholders shipped here. Full walkthrough in [Setup](/docs/setup) and [MCP](/docs/mcp).",
        },
        {
          label: "02",
          title: "Keep every order behind a gate",
          md: "Leave `place_equity_order` and `cancel_equity_order` in `ask` (or `deny`). **Never** move an order tool into `allow` — that would remove the human approval step the whole desk is built around.",
        },
        {
          label: "03",
          title: "Allow only read tools",
          md: "Add read-only tools (quotes, fundamentals, positions, scans, `review_equity_order`) to `allow` to cut prompt noise. When you're unsure what a tool does, leave it out so it prompts by default.",
        },
        {
          label: "04",
          title: "Deny what you'll never use",
          md: "Keep `place_option_order` and `cancel_option_order` in `deny`. Options aren't supported in this beta, so hard-denying them means a mistaken call fails closed instead of prompting.",
        },
      ],
    },
    {
      type: "callout",
      tone: "info",
      title: "Related",
      md: "[Guardrails](/docs/guardrails) explains **why** these rules exist · [MCP](/docs/mcp) covers the connection and tool surface · [Installation & Setup](/docs/setup) is the first-run OAuth walkthrough · [Strategies](/docs/strategies) is where the risk caps the Risk Manager enforces are written.",
    },
    {
      type: "pills",
      items: ["deny → ask → allow", "Project-scoped MCP", "Least-privilege sub-agents", "Secrets stay out of git", "Restart to reload agents", "Beta · equities only"],
    },
    {
      type: "note",
      md: "Illustrative reference only — not investment advice, no track record, and any numbers shown elsewhere in these docs are demo data. See [Safety & Disclaimer](/docs/disclaimer).",
    },
  ],
};
