# Aelix Backend — public, 24/7 agentic desk service

A multi-tenant backend that runs the Aelix desk **server-side** so it can be used
by many people at once, around the clock — pivoted to the safe, public-friendly
concept: **Rule-Keeper + Portfolio X-Ray on the Robinhood Agentic network.**

It is **not** a discretionary auto-trader. It **analyzes**, **guards the user's own
rules**, and **alerts** — it never places or auto-executes an order on anyone's
behalf. That "anti-advice" posture is what makes it publishable to the public
without becoming a robo-adviser (still: get legal review before real-money launch).

- **Zero runtime dependencies.** Pure Node ESM + built-ins — runs with plain
  `node`, no `npm install`. (Same philosophy as the desk's backtester/logger.)
- **Multi-tenant.** Per-user accounts, per-user encrypted Robinhood tokens,
  per-user rules, state, and alerts.
- **24/7.** A scheduler scans every connected user on a cadence, even offline.

## Quick start

```bash
cd backend
cp .env.example .env          # optional in dev — ephemeral secrets are auto-generated
npm start                     # → http://localhost:8787  (broker=mock by default)
npm test                      # deterministic Rule-Keeper + crypto tests
```

In `mock` mode a demo Agentic account is used, so the whole API works with **no
credentials** — perfect for local dev, CI, and the frontend.

### Try it (mock mode)

```bash
BASE=http://localhost:8787
# 1) sign up → get a JWT
TOKEN=$(curl -s $BASE/v1/auth/signup -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"supersecret"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# 2) ask the Rule-Keeper about a trade YOU want to make
curl -s $BASE/v1/rulekeeper/check -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"trade":{"symbol":"AAPL","side":"buy","qty":40,"price":208,"stop":195}}'

# 3) x-ray the portfolio
curl -s $BASE/v1/xray -H "authorization: Bearer $TOKEN"
```

## Architecture

```
Frontend (Next.js app)  ──HTTPS/JWT──▶  THIS BACKEND
                                         ├─ auth (JWT, scrypt)
                                         ├─ token vault (AES-256-GCM)   ← per-user RH OAuth token
                                         ├─ Rule-Keeper (deterministic) ← the core product
                                         ├─ Portfolio X-Ray (analytics)
                                         ├─ scheduler (24/7 scans)      ← alerts even when offline
                                         └─ broker client ──▶ Robinhood Agentic MCP (per user)
                                              store: JSON file (dev) / Postgres (prod)
                                              coach: Anthropic Messages API (optional)
```

| Layer | File | Notes |
|---|---|---|
| Config + `.env` loader | `src/config.mjs` | Fatal if secrets missing in prod. |
| Crypto | `src/lib/crypto.mjs` | scrypt password, HS256 JWT, AES-256-GCM vault. |
| Store | `src/lib/store.mjs` | JSON driver ships; implement the same interface for Postgres. |
| HTTP router | `src/lib/http.mjs` | CORS, rate limit, auth, JSON — no framework. |
| Broker | `src/lib/broker.mjs` | `mock` + real `mcp` (HTTP) client, per user. |
| Coach (optional) | `src/lib/llm.mjs` | Anthropic Messages API; off unless a key is set. |
| Rule-Keeper | `src/desk/rulekeeper.mjs` | Deterministic verdict engine (the product core). |
| X-Ray | `src/desk/xray.mjs` | Concentration, sector, cash, rule-vs-reality flags. |
| Scheduler | `src/desk/scheduler.mjs` | The 24/7 engine. |
| Routes | `src/routes.mjs` | All endpoints. |

## API

| Method | Path | Auth | Purpose |
|---|---|:---:|---|
| GET | `/health` | – | Liveness. |
| GET | `/v1/meta` | – | Broker mode, feature flags, default caps. |
| POST | `/v1/auth/signup` | – | Create account → `{ token, user }`. |
| POST | `/v1/auth/login` | – | → `{ token, user }`. |
| GET | `/v1/me` | ✓ | Current user. |
| PUT | `/v1/me/settings` | ✓ | `autoScan`, `scanIntervalSec`. |
| POST | `/v1/broker/connect` | ✓ | Store the user's Robinhood OAuth token (encrypted). |
| GET | `/v1/broker/status` | ✓ | Connection + account snapshot. |
| DELETE | `/v1/broker` | ✓ | Disconnect (delete token). |
| GET/PUT | `/v1/rules` | ✓ | Read / update the user's risk caps. |
| POST | `/v1/rulekeeper/check` | ✓ | Check a trade the user wants to make → verdict. `?explain=1` adds coach text. |
| GET | `/v1/desk` | ✓ | Latest persisted desk snapshot. |
| POST | `/v1/desk/run` | ✓ | Run a fresh read-only desk pass now. |
| GET | `/v1/xray` | ✓ | Fresh portfolio x-ray. `?explain=1` adds coach text. |
| GET | `/v1/alerts` | ✓ | Recent alerts. |
| POST | `/v1/alerts/read` | ✓ | Mark alerts read. |

## Going to production

1. **Set real secrets** — `JWT_SECRET`, `VAULT_KEY` (32 bytes base64). The server
   **refuses to boot** in `NODE_ENV=production` without them. Back `VAULT_KEY` with
   a KMS.
2. **Swap the store** — implement the `JsonStore` interface in `src/lib/store.mjs`
   against Postgres, and set `STORE_DRIVER=postgres`.
3. **Broker** — set `BROKER_MODE=mcp`. Confirm Robinhood's Agentic beta ToS permits
   a third-party multi-user app storing user tokens, and verify the real MCP tool
   names/response shapes in `src/lib/broker.mjs` (marked `TODO`).
4. **Scale the scheduler** — move the in-process loop to a Redis/BullMQ worker.
5. **Legal** — offering securities analytics to the public can implicate
   adviser/broker rules. Keep the anti-advice posture (analyze/guard/alert, never
   recommend or auto-trade) and get counsel before real-money launch. A
   **paper-trading** tier sidesteps most of this while you validate.

## Why this is not a robo-adviser
The Rule-Keeper never says "buy X." It takes a trade **the user already decided to
make** and checks it against **the user's own written caps**, returning APPROVE /
APPROVE-WITH-CHANGES / VETO with explicit math. X-Ray only describes what the user
already owns. That keeps the product on the safe side of the line — and is honestly
more useful than another stock-picker.
