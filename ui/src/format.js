// Small formatting helpers shared across the dashboard.

export const usd = (n, dp = 2) =>
  n == null || Number.isNaN(n)
    ? '—'
    : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: dp, maximumFractionDigits: dp })

export const pct = (n, dp = 2) =>
  n == null || Number.isNaN(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(dp)}%`

export const num = (n) => (n == null || Number.isNaN(n) ? '—' : n.toLocaleString('en-US'))

export const signClass = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'flat')

// Relative "time ago" label (e.g. "just now", "3m ago", "2h ago", "5d ago").
// Falls back to an absolute date only for timestamps older than ~30 days.
export const timeAgo = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const secs = Math.round((Date.now() - d.getTime()) / 1000)
  const abs = Math.abs(secs)
  if (abs < 45) return 'just now'
  const suffix = secs >= 0 ? ' ago' : ' from now'
  const mins = Math.round(abs / 60)
  if (mins < 60) return `${mins}m${suffix}`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h${suffix}`
  const days = Math.round(hrs / 24)
  if (days <= 30) return `${days}d${suffix}`
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
