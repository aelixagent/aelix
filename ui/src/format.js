// Small formatting helpers shared across the dashboard.

export const usd = (n, dp = 2) =>
  n == null || Number.isNaN(n)
    ? '—'
    : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: dp, maximumFractionDigits: dp })

export const pct = (n, dp = 2) =>
  n == null || Number.isNaN(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(dp)}%`

export const num = (n) => (n == null || Number.isNaN(n) ? '—' : n.toLocaleString('en-US'))

export const signClass = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'flat')

export const timeAgo = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
