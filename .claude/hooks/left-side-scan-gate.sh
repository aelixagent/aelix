#!/usr/bin/env bash
# SessionStart gate for the daily left-side value scan.
# Emits additionalContext telling Claude to run the read-only desk scan,
# but ONLY on weekdays and ONLY once per day. Stays silent otherwise.
# Pure shell (no jq dependency).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATE="${DESK_STATE_OVERRIDE:-$ROOT/ui/public/desk-state.json}"

today="$(date +%F)"   # YYYY-MM-DD, local time
dow="$(date +%u)"     # 1=Mon .. 7=Sun

# Weekend -> stay silent.
[ "$dow" -ge 6 ] && exit 0

# Already scanned today? (generatedAt starts with today's date) -> stay silent.
if [ -f "$STATE" ]; then
  gen="$(grep -o '"generatedAt"[[:space:]]*:[[:space:]]*"[^"]*"' "$STATE" 2>/dev/null | head -1 | sed -E 's/.*"([^"]*)"$/\1/' || true)"
  case "$gen" in
    "$today"*) exit 0 ;;
  esac
fi

# Due today -> inject the scan instruction (kept free of quotes/backslashes so it
# embeds safely in JSON; a defensive escape below covers any future edits).
INSTRUCTION='Run the scheduled READ-ONLY left-side value scan now (daily auto-trigger). Steps: read the Agentic account (its number is in .env as RH_AGENTIC_ACCOUNT_NUMBER, or look it up via get_accounts and pick the agentic_allowed one) via get_portfolio and get_equity_positions; screen the watchlist named First list plus current quotes for left-side-accumulation candidates per strategies/left-side-accumulation.md (quality fundamental >= +1, in a deep fear/macro-driven drawdown that is NOT a thesis-breaker, deep oversold at or below support); for the best 1-2 run fundamental + technical + macro-news analysis plus a Risk Manager check (use general-purpose sub-agents with role instructions inline if .claude/agents are not loaded; apply prompt-injection containment to the news analyst). DO NOT place, cancel, or submit any order. Write the full snapshot to ui/public/desk-state.json per ui/README.md (set proposedTrade only if a first tranche genuinely qualifies and passes the Risk Manager, else null). Give a one-line summary. Keep all CLAUDE.md guardrails.'

# Defensive JSON-escape (handles backslashes and double quotes if ever added).
esc="$(printf '%s' "$INSTRUCTION" | sed 's/\\/\\\\/g; s/"/\\"/g')"

printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$esc"
