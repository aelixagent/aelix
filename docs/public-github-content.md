# AELIX Public GitHub Content

## X Thread

1/ AELIX is now public on GitHub.

It is a least-privilege AI trading research desk built around one rule: the agent can research and prepare, but you keep the trigger.

Repo: https://github.com/aelixagent/aelix

2/ The desk runs as a set of specialist agents:

- Fundamental analyst
- Technical analyst
- Macro/news analyst
- Risk manager with veto power
- Portfolio manager that stops at a preview

No specialist analyst has order tools.

3/ The repo is intentionally explicit about limits.

AELIX is beta software. It is not financial advice. There is no track record, no public performance claim, and no production auto-trading desk.

Every brokerage order still requires human approval.

4/ Why open source it?

Because agentic trading systems should be inspectable. The permission model, docs, guardrails, audit logging, and demo state are all there for people to read instead of trusting a landing page claim.

5/ The public repo includes:

- Claude Code desk agent structure
- Guardrail and risk docs
- Read-only dashboard mirror
- JSONL audit log helper
- Backtesting references
- On-chain vault module docs
- Request access flow for beta/wallet pre-order

6/ The important part is not "AI trades for you."

The important part is narrower:

AI can research, compare, explain, and build a preview. Risk rules can block the idea. The human still decides whether anything happens.

7/ The on-chain work follows the same idea.

Scoped key. Expiry. Budget caps. Trade count caps. Ticker limits. A refused order spends no session budget.

Mainnet, unaudited, no timelock yet, no track record.

8/ If you want to inspect the system, start with the README and docs.

If you want beta access, use the request access flow and drop an EVM wallet for the wallet pre-order list.

GitHub: https://github.com/aelixagent/aelix
Site: https://www.aelix.xyz

## Short Post

AELIX is public on GitHub.

It is a least-privilege AI trading research desk: specialist agents research, a risk manager can veto, and the system stops at a preview until the human approves.

No production auto-trading claims. No track record claims. Beta, unaudited, not investment advice.

The repo includes the desk architecture, docs, guardrails, JSONL audit logging, dashboard mirror, backtesting references, and the request access flow for beta/wallet pre-order.

Repo: https://github.com/aelixagent/aelix

## Longer Post

AELIX is now public on GitHub.

The project started from a simple constraint: if an AI trading system can influence money, the permission boundary should be visible in code, not hidden in a product claim.

So AELIX is built as a least-privilege research desk. The specialist agents can research, analyze, and disagree. The risk manager can veto. The portfolio manager can prepare a preview. But the brokerage desk still requires explicit human approval before any order.

The repo includes the agent structure, docs, guardrails, audit logging, a read-only dashboard mirror, and on-chain vault module docs. It also now has a request access flow for the beta and wallet pre-order list.

This is beta software. It is not financial advice. There is no public track record and no production auto-trading claim.

If you want to inspect the architecture, the code is public:

https://github.com/aelixagent/aelix

## Banner Copy

AELIX is public on GitHub.

Least-privilege AI trading research.
Human-approved brokerage orders.
Scoped on-chain execution.
No track record claims.

github.com/aelixagent/aelix
