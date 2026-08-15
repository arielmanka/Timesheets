// Shared chart color helpers — the validated 8-slot categorical palette from
// the dataviz skill, plus a rank-based assignment so a given entity gets the
// same color across an hours/cost (or count/amount) pair of charts.

export const TREND_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7']
export const OTHER_COLOR = '#a3a29c'
export const OTHER_ID = '__other__'

/** Reads the app's own design tokens for chart chrome, rather than hardcoding colors that could drift from style.css. */
export function cssToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

/** Assigns palette slots in descending-total order; `OTHER_ID` (the folded tail past a series cap) always gets the neutral gray, never one of the 8 hues. */
export function rankColors(totalsById: Map<string, number>): Map<string, string> {
  const ranked = [...totalsById.entries()]
    .filter(([id]) => id !== OTHER_ID)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
  const colors = new Map<string, string>()
  ranked.forEach((id, i) => colors.set(id, TREND_PALETTE[i % TREND_PALETTE.length]!))
  colors.set(OTHER_ID, OTHER_COLOR)
  return colors
}
