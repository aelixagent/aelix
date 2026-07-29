/**
 * All landing copy lives here so components stay presentational.
 * Edit these arrays to change the site content, add/remove items freely.
 */

export const NAV = [
  { n: "01", label: "Request Access", href: "#access" },
  { n: "02", label: "How It Works", href: "#flow" },
  { n: "03", label: "The Team", href: "#team" },
  { n: "04", label: "Guardrails", href: "#safety" },
] as const;

export const MARQUEE = [
  "LEAST-PRIVILEGE AI TRADING",
  "NO BROKERAGE ORDER WITHOUT YOUR YES",
  "ON-CHAIN: A SCOPED, REVOCABLE, EXPIRING KEY",
  "A REFUSED ORDER SPENDS NO BUDGET",
  "RISK VETO ARMED",
  "GUARDRAILS AS CODE",
  "REFUSALS GO ON THE RECORD · APPEND-ONLY",
  "MAINNET · CHAIN 4663",
  "UNAUDITED · DEPOSITS CAPPED",
  "REQUEST ACCESS · NOT INVESTMENT ADVICE",
] as const;

export const STATS = [
  { value: 4, suffix: "", label: "Specialist AI agents" },
  { value: 100, suffix: "%", label: "Brokerage orders you approve first" },
  { value: 1, suffix: "", label: "Risk manager with veto" },
] as const;

export const STEPS = [
  { num: "01 / SENSE", title: "Read the account", body: "Reads positions & buying power in the Agentic account only. Read-only." },
  { num: "02 / SCREEN", title: "Scan watchlist", body: "The Technical agent runs saved scans → a shortlist of candidates." },
  { num: "03 / RESEARCH", title: "3 analysts, parallel", body: "Fundamental, Technical and Macro/News agents dig into each candidate at once." },
  { num: "04 / SYNTHESIZE", title: "Propose a trade", body: "The PM combines the verdicts into a trade tied to a written rule in strategies/." },
  { num: "05 / RISK", title: "Risk veto check", body: "The Risk Manager checks it vs the rules → APPROVE / CHANGES / VETO." },
  { num: "06 / PREVIEW", title: "Build a preview card", body: "Cost estimate, sizing, stop. The desk stops here, no order yet." },
  { num: "07 / YOU", title: "You hold the trigger", body: "You approve or reject in-session. Only on your “yes” does it place the order.", you: true },
] as const;

export const TEAM = [
  { key: "fundamental", name: "Fundamental", role: "// ANALYST", body: "Valuation, earnings quality, growth and balance-sheet health. Returns a fundamental verdict, never a trade.", note: "NO ORDER TOOLS" },
  { key: "technical", name: "Technical", role: "// ANALYST", body: "Trend, momentum, support/resistance and volatility. Surfaces candidates and suggests entry/stop reference levels.", note: "NO ORDER TOOLS" },
  { key: "macro", name: "Macro / News", role: "// INJECTION-ISOLATED", body: "Market backdrop and headlines. Treats all fetched content as untrusted data, quotes suspicious “instructions” instead of acting.", note: "NO ORDER TOOLS" },
  { key: "risk", name: "Risk Manager", role: "// VETO POWER", body: "Checks every proposed trade against the written caps. Can block a trade the analysts liked. Read-only account access.", note: "NO ORDER TOOLS · CAN VETO" },
] as const;

export const GUARDS = [
  { title: "Human-in-the-loop", body: "Only the PM can order, and only after your explicit in-session approval. No brokerage order is ever placed on a schedule or on its own — unchanged, and not changing." },
  { title: "Prompt-injection defense", body: "The news agent treats fetched web content as untrusted data. Instruction-like text (“buy X now”) is quoted and flagged, never obeyed." },
  { title: "Independent risk veto", body: "The Risk Manager evaluates against written rules and can block a trade the analysts liked. If caps are unset, it vetoes." },
  { title: "Equities · Agentic account only", body: "The desk can only trade the isolated Agentic account, never your main balance. Disconnect the MCP anytime, that’s the kill switch." },
  { title: "Guardrails-as-code · attested record", body: "The written caps are compiled into an on-chain GuardrailConfig, and the vault reverts any order that breaches them — previewTrade() names the exact rule before anyone signs, and a refused order spends none of the session budget. Refusals and vetoes are attestable append-only, so a record accrues instead of being claimed. Enforced at the custody layer on every order, changeable only by a 2-of-3 Safe — with no timelock yet. Mainnet, unaudited, deposits capped, nothing attested yet; approval on the desk still applies." },
] as const;

export const ROADMAP = [
  { phase: "FASE 0 · SETUP", title: "Guardrails & contract", body: "Private repo, OAuth to the Agentic account, operating contract, and the permission gate that puts every order behind a manual prompt.", status: "done" },
  { phase: "FASE 1 · CORE", title: "The four agents + logging", body: "Fundamental, Technical, Macro/News, Risk Manager as isolated sub-agents. JSONL reasoning logs for audit.", status: "done" },
  { phase: "FASE 2 · DASHBOARD", title: "Desk mirror + paper trading", body: "Read-only dashboard mirrors desk-state live. Robinhood integration starts in paper mode.", status: "done" },
  { phase: "FASE 3 · ON-CHAIN", title: "Guardrails, vault & proof", body: "The desk's written caps compiled into an on-chain GuardrailConfig, an RWA Vault (ERC-4626, share token vAELIX) wired to it, and append-only attestation contracts so decisions and outcomes can be recorded rather than claimed. Deployed on Robinhood Chain mainnet (chainId 4663) against real periphery, USDG, Chainlink feeds and Uniswap V2, no mocks in that path. Unaudited, deposits capped, no depositors and nothing attested yet, not an investment product.", status: "done", onchain: true },
  { phase: "FASE 4 · EXECUTOR", title: "Scoped session-key executor", body: "A session-key executor that grants the agent a scoped, revocable, expiring key — bounded by expiry, size, budget, trade count and a ticker allowlist, where a refused order spends none of the budget — the ERC-4337 session-key design intent implemented at the contract layer rather than through the EntryPoint, plus recurring buys (DCA) on top of the vault via the AelixAutosave contract. Deployed on mainnet, desk approval unchanged, still unaudited; not an investment product.", status: "done", onchain: true },
  { phase: "FASE 5 · CUSTODY", title: "Ownership handover to the Safe", body: "The Ownable2Step handover is complete. The 2-of-3 Safe called acceptOwnership() on the vault, the oracle adapter and the session-key executor in one batch, and pendingOwner() now reads zero on all three; GuardrailConfig and the swap adapter were Safe-owned from construction and never passed through the deploy key. Every owner-controlled contract in the stack is owned by the 2-of-3 Safe, so widening a risk cap, swapping a feed, raising the deposit cap or granting a session key takes two of three signatures, and the deploy key now reverts on all of them. There is no timelock yet: once two of three sign, the Safe can make those changes in a single transaction. That settles who holds the keys, not whether the code is audited, it still is not.", status: "done", onchain: true },
  { phase: "FASE 6 · AUDIT", title: "Audit, verification & legal review", body: "Open, and the reason nothing here should be treated as safe yet: no third-party security audit has been performed (internal passes are not an audit) and the contracts are not verified on the block explorer. A timelock on owner powers is also outstanding. Securities and legal review, including the US-person question, remain open as well.", status: "pending" },
  { phase: "FASE 7 · SCALE", title: "Backtesting & optimization", body: "Strategy backtests, prompt-cost optimization, and broader coverage.", status: "pending" },
] as const;

export const MARQUEE2 = [
  "get_portfolio()",
  "run_scan()",
  "review_equity_order()",
  "risk.veto()",
  "desk-state.json",
  "JSONL audit log",
  "OAuth 2.0",
  "MCP · robinhood-trading",
] as const;

export const COMPARE = {
  bad: {
    head: "A bot that YOLOs",
    rows: [
      "Auto-executes on a hunch",
      "One black-box prompt",
      "No independent risk check",
      "Acts on hype it reads online",
      "Can reach your whole balance",
      "Limits live in a config it can edit",
      "“Trust me” performance screenshots",
    ],
  },
  good: {
    head: "The Aelix desk",
    rows: [
      "Stops at a preview, you place the order",
      "A team of four specialist analysts",
      "Independent risk manager with veto",
      "Quotes suspicious “instructions”, ignores them",
      "Isolated Agentic budget only",
      "Guardrails enforced on-chain (mainnet, unaudited)",
      "First metric it will publish: how often the vault said no",
    ],
  },
} as const;

/** Interactive Risk Lab defaults, mirrors the per-trade cap in strategies/. */
export const RISK = { capPct: 15, minEquity: 1000, maxEquity: 100000, maxWeight: 30 } as const;

export const FAQ = [
  {
    q: "Can Aelix place trades on its own?",
    a: "On the brokerage desk, no — and that isn't changing. Every order requires your explicit in-session approval; the analysts have no order tools at all; only the Portfolio Manager can place, and only after you say yes to a preview. On-chain is a separate, clearly labeled surface: there the agent holds a scoped, revocable, expiring session key over an operator-funded vault (no depositors), and the vault reverts any order that breaches the compiled caps.",
  },
  {
    q: "Which markets can it trade?",
    a: "US equities only, inside an isolated Robinhood Agentic account. Options, futures and crypto are out of scope of the current desk access surface.",
  },
  {
    q: "What about the on-chain vault and verifiable track record?",
    a: "The vault is deployed on Robinhood Chain mainnet (chainId 4663): an RWA Vault (ERC-4626, share token vAELIX) wired to a GuardrailConfig that compiles the desk's written caps on-chain, plus append-only attestation contracts so decisions and outcomes can be recorded rather than claimed. Every owner-controlled contract is owned by a 2-of-3 Safe multisig, so no single hot key can weaken a cap or swap a feed, but there is no timelock yet, so once two of three sign, the Safe can change caps, feeds or the deposit cap in a single transaction. Read the caveats: multisig custody is not an audit, and there is none, it is unaudited (internal review passes are not an audit), the contracts are not yet verified on the block explorer, deposits are capped at 10,000 USDG (an owner-changeable setting, not a structural limit), the vault is operator-funded with no depositors, and nothing has been attested, so there is no track record. The vault trades Robinhood Stock Tokens, price-tracking tokens, not shares, and not available to US persons, while the desk trades US equities through gated access; two doors, kept deliberately separate. Not an investment product and not investment advice.",
  },
  {
    q: "Who executes on-chain, does the agent trade by itself?",
    a: "On-chain, the agent holds a session key granted by the 2-of-3 Safe and scoped by expiry, order size, spend budget, trade count and a ticker allowlist — the ERC-4337 session-key design intent implemented at the contract layer rather than through the EntryPoint. Within that scope it can submit orders against the operator-funded vault; the vault re-checks every one against the compiled caps and reverts any breach, and a refused order spends none of the session budget. The agent’s limits are published on-chain before it trades — read them, and watch every order against them. The key is revocable at any time, and none of this touches the brokerage desk, where every order still requires your explicit yes. Mainnet, unaudited.",
  },
  {
    q: "Where’s the performance? Why lead with refusals?",
    a: "There is no performance: TVL is 0, there are no depositors, no trades and no track record, and we won’t pretend otherwise. The first number we publish will be how often the vault said no. previewTrade() returns the exact rule an order would break before anyone signs, a refused order spends none of the session budget, and refusals and vetoes land in an append-only registry that cannot be pruned. Refusals are the only metric that can be accumulated honestly at zero TVL.",
  },
  {
    q: "How does it defend against prompt injection?",
    a: "The Macro/News analyst treats every fetched web page as untrusted data. Instruction-like text (“buy X now”, “ignore your rules”) is quoted and flagged, never obeyed.",
  },
  {
    q: "Is any of this financial advice?",
    a: "No. Aelix is a research tool and reference architecture. There is no track record and no performance claim. All decisions, and all risk, are yours. Use only risk capital.",
  },
] as const;

/** The scripted desk run typed out by the interactive terminal. */
export type TermTag = "cmd" | "lime" | "mint" | "warn" | "red";
export const DESK_RUN: { tag: string; cls: TermTag; text: string; pause?: number }[] = [
  { tag: "$", cls: "cmd", text: "aelix run --watchlist", pause: 380 },
  { tag: "SENSE", cls: "lime", text: "agentic account, equity $10,000 · cash $3,200", pause: 460 },
  { tag: "SCREEN", cls: "lime", text: "technical scan → AAPL · NVDA · MSFT", pause: 460 },
  { tag: "FUND", cls: "mint", text: "NVDA  valuation stretched · growth strong   score +1", pause: 520 },
  { tag: "TECH", cls: "mint", text: "NVDA  uptrend · pullback to EMA20            signal +2", pause: 520 },
  { tag: "MACRO", cls: "warn", text: "NVDA  risk-on · 1 injection quoted + ignored", pause: 520 },
  { tag: "SYNTH", cls: "lime", text: "propose BUY NVDA ×3  (mean-reversion)", pause: 560 },
  { tag: "RISK", cls: "warn", text: "sizing 4.2% ≤ cap 15% … APPROVE-WITH-CHANGES · stop 8%", pause: 620 },
  { tag: "PREVIEW", cls: "red", text: "est cost $1,410 · weight 4.2% · ⏸ awaiting your approval", pause: 200 },
];
