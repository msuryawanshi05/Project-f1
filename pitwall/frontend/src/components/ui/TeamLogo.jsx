import { memo, useState } from 'react'
import useF1Store from '../../store/useF1Store'
import { canonicalTeam } from '../../utils/teamColours'

/**
 * TeamLogo — the official constructor logo.
 *
 * The repo previously shipped hand-drawn stand-ins in public/team-logos: each
 * one a ~200 byte SVG with a single path, nothing like the real marks. They
 * are kept only as an offline fallback.
 *
 * Source is Formula 1's own media CDN, the same origin the driver headshots
 * already come from (OpenF1's headshot_url points at it). Verified 2026-10-11:
 * all eleven 2026 constructors serve both a white and a black variant.
 *
 *   https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_{W}
 *     /common/f1/2026/{slug}/2026{slug}logo{white|black}.webp
 *
 * Two variants matter here: these are single-colour marks, so the white one is
 * invisible on a light background and the black one on a dark one. Picking by
 * theme is what makes them legible in both — the same problem the colour
 * system solves for text. The old SVGs were forced to work via `dark:invert`,
 * which is a blunt instrument that also inverts any colour in the mark.
 *
 * `f_auto` lets the CDN negotiate the format, so browsers without WebP get a
 * PNG, and `w_` is set from the rendered size for a sharp result on HiDPI
 * without pulling a full-resolution asset.
 */

/** Team name -> the slug F1's CDN uses. */
const CDN_SLUG = {
  'McLaren':         'mclaren',
  'Ferrari':         'ferrari',
  'Red Bull Racing': 'redbullracing',
  'Mercedes':        'mercedes',
  'Aston Martin':    'astonmartin',
  'Alpine':          'alpine',
  'Williams':        'williams',
  'Racing Bulls':    'racingbulls',
  'Haas F1 Team':    'haas',
  'Audi':            'audi',
  'Cadillac':        'cadillac',
}

/** Local fallback file, used only when the CDN cannot be reached. */
const LOCAL_SLUG = {
  'McLaren': 'mclaren',
  'Ferrari': 'ferrari',
  'Red Bull Racing': 'red-bull',
  'Mercedes': 'mercedes',
  'Aston Martin': 'aston-martin',
  'Alpine': 'alpine',
  'Williams': 'williams',
  'Racing Bulls': 'rb',
  'Haas F1 Team': 'haas',
  'Audi': 'audi',
  'Cadillac': 'cadillac',
}

const LOGO_SEASON = 2026

export function teamLogoUrl(teamName, { dark = true, width = 96 } = {}) {
  const team = canonicalTeam(teamName)
  const slug = team ? CDN_SLUG[team] : null
  if (!slug) return null
  const variant = dark ? 'white' : 'black'
  return `https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_${width}`
    + `/common/f1/${LOGO_SEASON}/${slug}/${LOGO_SEASON}${slug}logo${variant}.webp`
}

const TeamLogo = memo(function TeamLogo({ name, size = 28, className = '' }) {
  // Subscribed, not read from the DOM, so switching theme swaps the variant
  // immediately instead of on the next unrelated render.
  const dark = useF1Store((s) => s.settings.darkMode)
  const [failed, setFailed] = useState(false)

  const team = canonicalTeam(name)
  // Ask the CDN for 2x the rendered size so the mark stays sharp on HiDPI.
  const remote = teamLogoUrl(name, { dark, width: Math.max(48, Math.round(size * 2)) })
  const local = `/team-logos/${(team && LOCAL_SLUG[team]) || '_fallback'}.svg`

  const src = !failed && remote ? remote : local
  // The local stand-ins are solid black paths, so they still need inverting in
  // dark mode. The official marks must NOT be inverted — the variant already
  // matches the theme.
  const invert = src === local && dark

  return (
    <img
      src={src}
      alt={name ? `${name} logo` : ''}
      title={name ?? undefined}
      width={size}
      height={size}
      loading="lazy"
      className={`object-contain flex-shrink-0 ${invert ? 'invert' : ''} ${className}`}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  )
})

export default TeamLogo
