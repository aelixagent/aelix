import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Public Architecture",
  description:
    "How Aelix becomes a public, multi-tenant, 24/7 product on the Robinhood network — pivoted to the safe Rule-Keeper + Portfolio X-Ray concept, with a real backend.",
  eyebrow: "18 — Going Public",
  blocks: [
    {
      type: "prose",
      md: "The desk in this repo is **single-user and local**: the Portfolio Manager *is* your Claude Code session, tied to one account and your approval. To serve **many people, 24/7**, that has to move server-side — you can't hold per-user OAuth tokens or run background scans in a browser. This page describes the public architecture that ships in [`backend/`](/docs/backend-api).",
    },
    {
      type: "callout",
      tone: "warn",
      title: "The concept is pivoted on purpose",
      md: "A public service that **auto-trades** other people's money is a regulated activity (adviser / broker-dealer) and is explicitly out of scope. The public product is reframed as **Rule-Keeper + Portfolio X-Ray**: it **analyzes**, **guards each user's own written rules**, and **alerts** — it never recommends a trade or auto-executes one. That anti-advice posture is what keeps it publishable. Get legal review before any real-money launch; see [Safety & Disclaimer](/docs/disclaimer).",
    },
    {
      type: "heading",
      text: "The core shift",
    },
    {
      type: "deflist",
      items: [
        { term: "Local desk (this repo)", md: "PM = your Claude Code session. One account, one user, your machine, your approval. See [Architecture](/docs/architecture)." },
        { term: "Public backend", md: "The orchestration runs as a **server-side service** (in `backend/`) that many users hit through a web app. Each user connects their **own** Robinhood account; the server holds their encrypted token and scans for them around the clock." },
      ],
    },
    {
      type: "heading",
      text: "System diagram",
    },
    {
      type: "diagram",
      title: "Multi-tenant, 24/7",
      ascii: `  User (browser / app)
        │  HTTPS + JWT
        ▼
  ┌──────────────────────── AELIX BACKEND (Node, zero-dep) ───────────────────────┐
  │  auth (JWT · scrypt)      rules (per-user caps)      alerts (per-user)          │
  │  token vault (AES-256-GCM) ── per-user Robinhood OAuth token, encrypted at rest │
  │  Rule-Keeper (deterministic)   Portfolio X-Ray (analytics)                      │
  │  scheduler ── scans every connected user on a cadence, even while they're offline│
  │  broker client ──────────────┐                       store: JSON (dev)/Postgres │
  └──────────────────────────────┼───────────────────────  coach: Anthropic (opt.) ─┘
                                  ▼
                    Robinhood Agentic MCP (per user, read-only tools)`,
    },
    {
      type: "heading",
      text: "What the backend contains",
    },
    {
      type: "table",
      headers: ["Layer", "Job", "Prod note"],
      rows: [
        ["Auth", "Signup/login, JWT sessions, scrypt password hashing", "Set a strong `JWT_SECRET`."],
        ["Token vault", "Encrypts each user's Robinhood OAuth token (AES-256-GCM) before storage", "Back `VAULT_KEY` with a **KMS**."],
        ["Rule-Keeper", "Deterministic verdict on a trade **the user wants to make** vs their caps", "The product core — no LLM needed."],
        ["Portfolio X-Ray", "Concentration, sector, cash, and rule-vs-reality flags on holdings", "Pure analytics, no advice."],
        ["Scheduler", "Runs read-only scans for every connected user 24/7, emits alerts", "Swap to a Redis/BullMQ worker to scale."],
        ["Broker client", "Per-user connection to the Robinhood Agentic MCP", "`mock` for dev; `mcp` for real accounts."],
        ["Store", "Users, tokens, rules, state, alerts", "JSON file ships; swap for Postgres."],
        ["Coach (optional)", "Plain-language explanations via the Anthropic Messages API", "Off unless an API key is set."],
      ],
    },
    {
      type: "callout",
      tone: "success",
      title: "Zero runtime dependencies",
      md: "The backend is pure Node ESM + built-ins — it runs with plain `node`, no `npm install`, matching this repo's backtester/logger philosophy. That keeps the attack surface small and deploys trivial.",
    },
    {
      type: "heading",
      text: "Human-in-the-loop, preserved",
    },
    {
      type: "prose",
      md: "Going 24/7 does **not** mean going autonomous. The scheduler only runs **read-only** research and produces **alerts + verdicts**. Any actual order still belongs to the user, on their own account, with their own approval — the same guardrail as the local desk, just async (notify → the user approves when they can).",
    },
    {
      type: "heading",
      text: "Going to production",
    },
    {
      type: "steps",
      steps: [
        { label: "01", title: "Real secrets", md: "Set `JWT_SECRET` and a 32-byte base64 `VAULT_KEY`. The server **refuses to boot** in production without them. Back the vault key with a KMS." },
        { label: "02", title: "Real database", md: "Implement the store interface against **Postgres** and set `STORE_DRIVER=postgres`. The JSON driver is for dev/single-node only." },
        { label: "03", title: "Real broker", md: "Set `BROKER_MODE=mcp` and verify the live Robinhood MCP tool names/response shapes. Confirm the Agentic beta ToS permits a third-party multi-user app storing user tokens." },
        { label: "04", title: "Scale the scheduler", md: "Move the in-process loop to a Redis/BullMQ worker pool so scans fan out across processes." },
        { label: "05", title: "Legal", md: "Keep the anti-advice posture (analyze / guard / alert). Start with a **paper-trading** tier to sidestep most regulation while you validate, and get counsel before real-money launch." },
      ],
    },
    {
      type: "callout",
      tone: "danger",
      title: "Three gates before real money, public",
      md: "**1) Regulation** — securities analytics for the public can implicate adviser/broker rules; get legal counsel. **2) Robinhood ToS** — confirm the Agentic beta allows a third-party multi-tenant app + token storage. **3) Security** — you become custodian of many users' brokerage tokens; encrypt, use a KMS, and pen-test.",
    },
    {
      type: "note",
      md: "The concrete endpoints, request/response shapes, and how to run it are in the [Backend API](/docs/backend-api) reference.",
    },
    {
      type: "pills",
      items: ["Multi-tenant", "24/7 scheduler", "Anti-advice", "Encrypted token vault", "Zero-dep Node", "Postgres-ready"],
    },
  ],
};
