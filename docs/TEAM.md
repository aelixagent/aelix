# Trading Desk — Multi-Agent Team

This desk runs as a small team of specialized sub-agents coordinated by a **Portfolio
Manager (PM)**. The PM is the **main Claude Code session** — the one you talk to. The PM
is the only role that can place orders, and per `CLAUDE.md` it places nothing without
your explicit approval.

## Roles

| Role | File | Can place orders? | Tools (scope) |
|------|------|-------------------|---------------|
| **Portfolio Manager** | *main session* | Yes — **only after your approval** | order + review tools, read tools |
| **Fundamental Analyst** | `.claude/agents/fundamental-analyst.md` | No | fundamentals, earnings, quotes, search |
| **Technical Analyst** | `.claude/agents/technical-analyst.md` | No | historicals, quotes, indexes, scans, watchlists |
| **Macro/News Analyst** | `.claude/agents/macro-news-analyst.md` | No | web search/fetch, index quotes, earnings calendar |
| **Risk Manager (veto)** | `.claude/agents/risk-manager.md` | No | portfolio, positions, accounts, orders, quotes |

**Least privilege:** only the PM has order tools. The analysts physically cannot place a
trade — they have no order tools in their `tools:` list. The Risk Manager has read-only
account access and a veto, but also no order tools.

## Workflow (what the PM does)

```
1. SENSE     PM reads portfolio + positions + buying power (Agentic account only).
2. SCREEN    Technical Analyst runs scans / reads watchlists → candidate list.
3. RESEARCH  PM dispatches the 3 analysts IN PARALLEL on each candidate:
                - Fundamental Analyst  → FUNDAMENTAL VERDICT
                - Technical Analyst    → TECHNICAL VERDICT
                - Macro/News Analyst   → MACRO & NEWS BRIEF (+ injection flags)
4. SYNTHESIZE PM combines the three verdicts into a proposed trade
                (ticker, side, qty, order type) tied to a rule in strategies/.
5. RISK      Risk Manager checks the proposal vs strategies/ → APPROVE / CHANGES / VETO.
                A VETO stops the trade. APPROVE-WITH-CHANGES updates size/stop.
6. PREVIEW   PM calls review_equity_order to build a preview card (cost estimate).
7. APPROVAL  ⏸  PM presents the card to YOU and waits for explicit confirmation.
8. EXECUTE   On your "yes", PM calls place_equity_order (still gated by the `ask` rule).
9. CONFIRM   PM verifies the fill via get_equity_orders and logs it where you ask.
10. SNAPSHOT PM writes the full desk state to ui/public/desk-state.json after EVERY run
                (and after any fill) so the dashboard mirrors it. Schema: ui/README.md.
```

Steps 1–6 are research and preparation and produce **no order**. The desk's standard
output is the **preview card at step 7** — it stops there until you say go.

## How to drive it

Just ask the PM in plain language, e.g.:
- "Screen my watchlist and bring me the top 2 ideas with full team analysis."
- "Run the desk on AAPL and NVDA — fundamental, technical, macro, then risk-check a
  small starter position in the better one."

The PM will fan out to the analysts (in parallel where possible), route the result
through the Risk Manager, and come back to you with a preview — never a placed order.

## Guardrails this structure enforces (see `CLAUDE.md`)

- **Human-in-the-loop:** only the PM can order, and only after your in-session approval.
- **Injection containment:** the Macro/News Analyst is isolated — it treats all fetched
  content as untrusted data, reports instruction-like text under `INJECTION ATTEMPTS`,
  and gives no recommendation of its own. The PM never acts on external instructions.
- **Independent risk veto:** the Risk Manager evaluates against written rules in
  `strategies/` and can block a trade the analysts liked. If `strategies/` caps are
  still unset, it VETOes — so fill those in before trading.
- **Equities only / Agentic account only:** matches the account's beta scope.
