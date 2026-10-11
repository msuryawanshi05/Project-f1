/**
 * teamColours.js — the single source of truth for team and driver colour.
 *
 * Why a table instead of the livery hex
 * -------------------------------------
 * Colour was previously the raw livery everywhere, passed through
 * `getSafeTeamColour`, which darkened "bright" colours at runtime when it
 * detected light mode using a luminance > 0.35 rule of thumb. That is not a
 * contrast guarantee: it fired on colours that did not need it, missed ones
 * that did, and produced a different result depending on which element asked.
 * Several 2026 liveries were unreadable on a light background.
 *
 * Two roles per team, per mode
 * ----------------------------
 *   accent — bars, dots, chart strokes, borders. Non-text, so WCAG's 3:1
 *            threshold for UI components applies.
 *   text   — driver codes and any coloured label. Driver TLAs render at 14px,
 *            which is NOT "large text" under WCAG (that needs 24px, or 18.66px
 *            bold), so these must clear 4.5:1 — 3:1 is not enough.
 *
 * Values are derived, not guessed: each is the closest colour to the real
 * livery that still clears its threshold against the worst-case surface in
 * that mode (see WORST_SURFACE), found by bisection toward
 * white or black, stepping in INTEGER RGB and verifying after rounding —
 * bisecting in float and rounding afterwards lands just under the threshold
 * (Williams dark text came out at 4.48:1 that way).
 * utils/teamColours.test.mjs re-derives them and fails if any
 * drifts below its threshold, so the table cannot rot.
 *
 * Where a livery already clears the bar, accent and text are the livery itself
 * — Mercedes keeps its exact teal in dark mode at 9.97:1.
 */

/** Canonical 2026 liveries, from OpenF1's team_colour for the current grid. */
export const TEAM_LIVERY = {
  'McLaren':         '#F47600',
  'Ferrari':         '#ED1131',
  'Red Bull Racing': '#4781D7',
  'Mercedes':        '#00D7B6',
  'Aston Martin':    '#229971',
  'Alpine':          '#00A1E8',
  'Williams':        '#1868DB',
  'Racing Bulls':    '#6C98FF',
  'Haas F1 Team':    '#9C9FA2',
  'Audi':            '#F50537',
  'Cadillac':        '#909090',
}

/** Derived per-mode, per-role variants. See the header for how. */
export const TEAM_COLOURS = {
  dark: {
    'McLaren':          { accent: '#F47600', text: '#F47600' },
    'Ferrari':          { accent: '#ED1131', text: '#EF2D4A' },
    'Red Bull Racing':  { accent: '#4781D7', text: '#4781D7' },
    'Mercedes':         { accent: '#00D7B6', text: '#00D7B6' },
    'Aston Martin':     { accent: '#229971', text: '#229971' },
    'Alpine':           { accent: '#00A1E8', text: '#00A1E8' },
    'Williams':         { accent: '#1868DB', text: '#377DE0' },
    'Racing Bulls':     { accent: '#6C98FF', text: '#6C98FF' },
    'Haas F1 Team':     { accent: '#9C9FA2', text: '#9C9FA2' },
    'Audi':             { accent: '#F50537', text: '#F61947' },
    'Cadillac':         { accent: '#909090', text: '#909090' },
  },
  light: {
    'McLaren':          { accent: '#E06C00', text: '#B15600' },
    'Ferrari':          { accent: '#ED1131', text: '#DD102E' },
    'Red Bull Racing':  { accent: '#4781D7', text: '#3D6FBA' },
    'Mercedes':         { accent: '#009F87', text: '#007E6B' },
    'Aston Martin':     { accent: '#229971', text: '#1C7E5D' },
    'Alpine':           { accent: '#0095D7', text: '#0076AB' },
    'Williams':         { accent: '#1868DB', text: '#1868DB' },
    'Racing Bulls':     { accent: '#628AE8', text: '#4E6DB8' },
    'Haas F1 Team':     { accent: '#8B8D90', text: '#6D6F72' },
    'Audi':             { accent: '#F50537', text: '#DF0532' },
    'Cadillac':         { accent: '#8C8C8C', text: '#6F6F6F' },
  },
}

/** Alternative spellings the live feed or historical data may use. */
const ALIASES = {
  'Red Bull': 'Red Bull Racing',
  'RB': 'Racing Bulls',
  'RB F1 Team': 'Racing Bulls',
  'Racing Bulls F1 Team': 'Racing Bulls',
  'AlphaTauri': 'Racing Bulls',
  'Haas': 'Haas F1 Team',
  'Alpine F1 Team': 'Alpine',
  'Cadillac F1 Team': 'Cadillac',
  'Kick Sauber': 'Audi',
  'Sauber': 'Audi',
  'Audi F1 Team': 'Audi',
  'Mercedes-AMG': 'Mercedes',
}

const NEUTRAL = {
  dark:  { accent: '#8F8F9E', text: '#9C9FA2' },
  light: { accent: '#6E6E7D', text: '#5A5A66' },
}

export function canonicalTeam(name) {
  if (!name) return null
  const n = String(name).trim()
  if (TEAM_LIVERY[n]) return n
  if (ALIASES[n]) return ALIASES[n]
  const lower = n.toLowerCase()
  const hit = Object.keys(TEAM_LIVERY).find(
    (t) => t.toLowerCase() === lower || lower.includes(t.toLowerCase()) || t.toLowerCase().includes(lower)
  )
  if (hit) return hit
  const alias = Object.keys(ALIASES).find((a) => a.toLowerCase() === lower)
  return alias ? ALIASES[alias] : null
}

/** True when the document is currently in dark mode. */
export function isDarkMode() {
  if (typeof document === 'undefined') return true
  return document.documentElement.classList.contains('dark')
}

/**
 * Colour for a team.
 * @param {string} teamName
 * @param {{role?: 'accent'|'text', dark?: boolean}} opts
 */
export function teamColour(teamName, { role = 'accent', dark } = {}) {
  const mode = (dark ?? isDarkMode()) ? 'dark' : 'light'
  const team = canonicalTeam(teamName)
  const entry = team ? TEAM_COLOURS[mode][team] : null
  return (entry ?? NEUTRAL[mode])[role]
}

/**
 * Colour for an unknown/non-roster team, derived from a raw hex the feed gave
 * us. Keeps an unrecognised team visible without pretending it is on the table.
 */
export function rawColour(hex, { role = 'accent', dark } = {}) {
  const mode = (dark ?? isDarkMode()) ? 'dark' : 'light'
  if (!hex || typeof hex !== 'string') return NEUTRAL[mode][role]
  const clean = hex.startsWith('#') ? hex : `#${hex}`
  if (!/^#[0-9a-f]{6}$/i.test(clean)) return NEUTRAL[mode][role]
  // A feed colour has no derived variant; nudge it toward the mode's text
  // colour until it is legible rather than rendering it as given.
  return ensureContrast(clean, WORST_SURFACE[mode], role === 'text' ? 4.5 : 3.0,
                        mode === 'dark' ? '#FFFFFF' : '#000000')
}

// ── contrast helpers (shared with the test) ─────────────────────────────────
export function toRgb(hex) {
  const h = String(hex).replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
export function relativeLuminance(rgb) {
  const f = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])
}
export function contrastRatio(a, b) {
  const la = relativeLuminance(typeof a === 'string' ? toRgb(a) : a)
  const lb = relativeLuminance(typeof b === 'string' ? toRgb(b) : b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
function ensureContrast(colour, bg, min, target) {
  const c = toRgb(colour)
  const t = toRgb(target)
  const b = toRgb(bg)
  if (contrastRatio(c, b) >= min) return colour
  // Step in INTEGER RGB and test the rounded value. Bisecting in float and
  // rounding at the end lands just under the threshold (4.48 instead of 4.50),
  // which is exactly the kind of near-miss this module exists to prevent.
  for (let step = 1; step <= 256; step++) {
    const f = step / 256
    const mixed = c.map((v, i) => Math.round(v + (t[i] - v) * f))
    if (contrastRatio(mixed, b) >= min) {
      return '#' + mixed.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')
    }
  }
  return target
}

/** Worst-case surfaces a coloured foreground is drawn on, per mode. */
/**
 * The surface each mode's foreground has the LEAST contrast against.
 *
 * Dark mode draws light text, so its worst case is the lightest surface
 * (--pw-surface-2). Light mode draws dark text, so its worst case is the
 * DARKEST surface (--pw-bg) — not white. Deriving the light variants against
 * #FFFFFF left them at ~4.1:1 on the page background, which is where most of
 * the driver codes on the Home page actually sit.
 */
export const WORST_SURFACE = { dark: '#141418', light: '#F3F3F6' }
