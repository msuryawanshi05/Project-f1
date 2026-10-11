import { useEffect, useState } from 'react'

/**
 * useDriverProfile.js — career + season data for the /drivers pages.
 *
 * Sources (both free, no key):
 *   Jolpica (Ergast mirror)  career totals, per-season standings, teammate H2H
 *   OpenF1  /v1/drivers      headshot_url and live team colour
 *
 * Career totals are read from the Ergast `total` envelope field with limit=1,
 * so a count costs one tiny response instead of paginating every result.
 *
 * Per-season standings need one call per season (Jolpica rejects
 * /drivers/{id}/driverstandings without a season in the path, and caps every
 * page at 100 rows). They are issued in parallel and the whole profile is
 * cached in localStorage, so a 20-season career is one slow load and then
 * instant.
 */

const JOLPICA = 'https://api.jolpi.ca/ergast/f1'
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const OPENF1_PROXY = `${API_BASE}/api/openf1`
const CACHE_TTL = 6 * 60 * 60 * 1000 // 6h — career stats change at most weekly
const SEASON = new Date().getFullYear()

function readCache(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) return null
    return data
  } catch {
    return null
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch {
    /* storage full — a cache miss is not an error */
  }
}

// ── Request throttle ────────────────────────────────────────────────────────
// Jolpica rate-limits bursts: measured on 2026-10-11, ~12 concurrent requests
// succeed and the rest return 429 (no Retry-After or X-RateLimit headers to go
// on). Career aggregation — by far the heaviest caller, ~28 requests — now
// happens on the backend behind a cache, so what remains here is the teammate
// head-to-head at roughly seven requests, comfortably inside the limit.
//
// The pool stays because the limit still exists and because the failure mode it
// guards against is the dangerous one: the first version of the career hook
// fanned out with Promise.all and swallowed failures into `null`, turning a 429
// into *plausible but wrong* stats — Lewis Hamilton as 2 titles over 7 seasons
// instead of 7 over 20, with nothing to indicate it. A visible gap beats a
// wrong number.
const MAX_CONCURRENT = 4
const RETRY_DELAYS_MS = [600, 1500, 3200]

let active = 0
const waiting = []

function acquire() {
  if (active < MAX_CONCURRENT) {
    active++
    return Promise.resolve()
  }
  return new Promise((resolve) => waiting.push(resolve))
}

function release() {
  const next = waiting.shift()
  if (next) next()
  else active--
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function jget(path, signal) {
  await acquire()
  try {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const res = await fetch(`${JOLPICA}${path}`, { signal })
      if (res.ok) return res.json()

      // 429 and 5xx are transient; anything else will not improve on retry.
      const transient = res.status === 429 || res.status >= 500
      if (!transient || attempt >= RETRY_DELAYS_MS.length) {
        throw new Error(`Jolpica ${path} -> HTTP ${res.status}`)
      }
      const retryAfter = Number(res.headers.get('retry-after'))
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : RETRY_DELAYS_MS[attempt])
    }
  } finally {
    release()
  }
}

/**
 * Count-only query: reads MRData.total instead of paginating the rows.
 * Returns { value, ok } so the caller can tell "genuinely zero" from
 * "could not be fetched" — they must not render the same.
 */
async function jcount(path, signal) {
  try {
    const json = await jget(path, signal)
    const n = Number(json?.MRData?.total)
    return { value: Number.isFinite(n) ? n : null, ok: Number.isFinite(n) }
  } catch (e) {
    if (e.name === 'AbortError') throw e
    return { value: null, ok: false }
  }
}

/** Resolve promises with a bounded pool, preserving input order. */
async function mapPool(items, fn) {
  const out = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}

// ── Headshots + live team colours for the current grid ──────────────────────
// Keyed by driver number AND by TLA, because Jolpica identifies drivers by
// driverId while OpenF1 uses driver_number/name_acronym.
export function useGridMeta(sessionKey) {
  const [meta, setMeta] = useState({ byNumber: {}, byCode: {}, loading: true })

  useEffect(() => {
    if (!sessionKey) {
      setMeta({ byNumber: {}, byCode: {}, loading: false })
      return
    }
    const cacheKey = `pitwall_gridmeta_${sessionKey}`
    const cached = readCache(cacheKey)
    if (cached) {
      setMeta({ ...cached, loading: false })
      return
    }

    const ctrl = new AbortController()
    fetch(`${OPENF1_PROXY}/v1/drivers?session_key=${sessionKey}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        const byNumber = {}
        const byCode = {}
        for (const d of Array.isArray(rows) ? rows : []) {
          const entry = {
            number: d.driver_number,
            code: d.name_acronym,
            fullName: d.full_name,
            team: d.team_name,
            colour: d.team_colour ? `#${String(d.team_colour).replace('#', '')}` : null,
            headshot: d.headshot_url || null,
            countryCode: d.country_code || null,
          }
          if (d.driver_number != null) byNumber[d.driver_number] = entry
          if (d.name_acronym) byCode[d.name_acronym] = entry
        }
        const next = { byNumber, byCode }
        writeCache(cacheKey, next)
        setMeta({ ...next, loading: false })
      })
      .catch(() => setMeta({ byNumber: {}, byCode: {}, loading: false }))

    return () => ctrl.abort()
  }, [sessionKey])

  return meta
}

// ── The current season's driver list ────────────────────────────────────────
export function useSeasonDrivers(year = SEASON) {
  const [state, setState] = useState({ drivers: [], loading: true, error: null })

  useEffect(() => {
    const cacheKey = `pitwall_seasondrivers_${year}`
    const cached = readCache(cacheKey)
    if (cached) setState({ drivers: cached, loading: false, error: null })

    const ctrl = new AbortController()
    jget(`/${year}/drivers.json?limit=100`, ctrl.signal)
      .then((json) => {
        const rows = json?.MRData?.DriverTable?.Drivers ?? []
        writeCache(cacheKey, rows)
        setState({ drivers: rows, loading: false, error: null })
      })
      .catch((e) => {
        if (e.name === 'AbortError') return
        setState((prev) => ({
          drivers: prev.drivers,
          loading: false,
          error: prev.drivers.length ? null : e.message,
        }))
      })

    return () => ctrl.abort()
  }, [year])

  return state
}

// ── One driver's full profile ───────────────────────────────────────────────
/**
 * Career totals + per-season record, from the backend.
 *
 * This used to aggregate in the browser: ~28 Jolpica requests per profile (six
 * count queries plus one standings call per season, because Jolpica rejects
 * /drivers/{id}/driverstandings without a season in the path). Jolpica limits
 * by rate, so a 20-season driver tripped 429s on nearly every view and the
 * "could not fetch" notice fired in normal use.
 *
 * The backend now does that fan-out once, paced inside the rate limit, and
 * caches per driver — 24h for a driver with no current-season entry, 30 min
 * for an active one. The browser makes one request.
 *
 * The honesty contract is unchanged and still enforced server-side: partial
 * data yields null totals rather than a wrong number, and `missing` names what
 * could not be fetched.
 */
export function useDriverProfile(driverId) {
  const [state, setState] = useState({ data: null, loading: true, error: null })

  useEffect(() => {
    if (!driverId) {
      setState({ data: null, loading: false, error: null })
      return
    }

    // A short client-side cache as well, so tabbing between drivers and back
    // is instant and does not re-hit the backend.
    const cacheKey = `pitwall_career_${driverId}_${SEASON}`
    const cached = readCache(cacheKey)
    if (cached) setState({ data: cached, loading: false, error: null })

    const ctrl = new AbortController()
    let cancelled = false

    fetch(`${API_BASE}/api/driver/${encodeURIComponent(driverId)}/career`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((json) => {
        if (cancelled) return
        if (json?.error) throw new Error(json.error)
        // Only cache a complete answer — a partial one should be retried.
        if (!json.partial) writeCache(cacheKey, json)
        setState({ data: json, loading: false, error: null })
      })
      .catch((e) => {
        if (cancelled || e.name === 'AbortError') return
        setState((prev) => ({
          data: prev.data,
          loading: false,
          error: prev.data ? null : e.message,
        }))
      })

    return () => { cancelled = true; ctrl.abort() }
  }, [driverId])

  return state
}

// ── Teammate head-to-head for the current season ────────────────────────────
/**
 * Compares a driver against whoever shares their car this season: who finished
 * ahead when both were classified, the qualifying record, and the average
 * qualifying gap. Races where either car retired are excluded from the
 * finishing record — a DNF says nothing about relative pace.
 */
export function useTeammateH2H(driverId, teamId, year = SEASON) {
  const [state, setState] = useState({ data: null, loading: true, error: null })

  useEffect(() => {
    if (!driverId || !teamId) {
      setState({ data: null, loading: false, error: null })
      return
    }

    const cacheKey = `pitwall_h2h_${driverId}_${teamId}_${year}`
    const cached = readCache(cacheKey)
    if (cached) setState({ data: cached, loading: false, error: null })

    const ctrl = new AbortController()
    const { signal } = ctrl

    async function load() {
      try {
        const rosterJson = await jget(`/${year}/constructors/${teamId}/drivers.json?limit=20`, signal)
        const roster = rosterJson?.MRData?.DriverTable?.Drivers ?? []
        const candidates = roster.filter((d) => d.driverId !== driverId)

        // A constructor's roster includes reserve and practice drivers — the
        // 2026 Mercedes roster returns three, one of whom never started a race.
        // The real teammate is whoever has actually started the most races, so
        // resolve it by race count rather than taking the first entry.
        let mate = null
        if (candidates.length === 1) {
          mate = candidates[0]
        } else if (candidates.length > 1) {
          const counts = await mapPool(candidates, (d) =>
            jcount(`/${year}/drivers/${d.driverId}/results.json?limit=1`, signal)
          )
          let bestIdx = -1
          let bestCount = 0
          counts.forEach((c, i) => {
            const n = c?.value ?? 0
            if (n > bestCount) { bestCount = n; bestIdx = i }
          })
          mate = bestIdx >= 0 ? candidates[bestIdx] : null
        }

        if (!mate) {
          setState({ data: { mate: null }, loading: false, error: null })
          return
        }

        const [aRes, bRes, aQual, bQual] = await mapPool([
          `/${year}/drivers/${driverId}/results.json?limit=100`,
          `/${year}/drivers/${mate.driverId}/results.json?limit=100`,
          `/${year}/drivers/${driverId}/qualifying.json?limit=100`,
          `/${year}/drivers/${mate.driverId}/qualifying.json?limit=100`,
        ], (path) => jget(path, signal))

        const index = (json, pick) => {
          const out = {}
          for (const race of json?.MRData?.RaceTable?.Races ?? []) {
            const row = pick(race)
            if (row) out[race.round] = row
          }
          return out
        }

        const aFin = index(aRes, (r) => r.Results?.[0])
        const bFin = index(bRes, (r) => r.Results?.[0])
        const aQ = index(aQual, (r) => r.QualifyingResults?.[0])
        const bQ = index(bQual, (r) => r.QualifyingResults?.[0])

        const finished = (row) => row && /^\d+$/.test(String(row.positionText))

        let raceWins = 0, raceLosses = 0, qualWins = 0, qualLosses = 0
        const gaps = []

        for (const round of Object.keys(aFin)) {
          const a = aFin[round], b = bFin[round]
          if (!finished(a) || !finished(b)) continue
          if (Number(a.position) < Number(b.position)) raceWins++
          else raceLosses++
        }

        const qualSeconds = (t) => {
          if (!t) return null
          const m = /^(\d+):(\d+\.\d+)$/.exec(t)
          if (m) return Number(m[1]) * 60 + Number(m[2])
          const n = Number.parseFloat(t)
          return Number.isNaN(n) ? null : n
        }
        const bestQual = (row) =>
          row ? [row.Q3, row.Q2, row.Q1].map(qualSeconds).find((v) => v != null) ?? null : null

        for (const round of Object.keys(aQ)) {
          const a = bestQual(aQ[round]), b = bestQual(bQ[round])
          if (a == null || b == null) continue
          if (a < b) qualWins++
          else qualLosses++
          gaps.push(a - b)
        }

        const data = {
          mate,
          race: { wins: raceWins, losses: raceLosses },
          qualifying: { wins: qualWins, losses: qualLosses },
          avgQualGap: gaps.length
            ? gaps.reduce((sum, g) => sum + g, 0) / gaps.length
            : null,
          comparedRaces: raceWins + raceLosses,
          comparedQuals: qualWins + qualLosses,
        }

        writeCache(cacheKey, data)
        setState({ data, loading: false, error: null })
      } catch (e) {
        if (e.name === 'AbortError') return
        setState((prev) => ({
          data: prev.data,
          loading: false,
          error: prev.data ? null : e.message,
        }))
      }
    }

    load()
    return () => ctrl.abort()
  }, [driverId, teamId, year])

  return state
}

// ── Constructors ────────────────────────────────────────────────────────────
/** The current season's constructors, from Jolpica. */
export function useSeasonConstructors(year = SEASON) {
  const [state, setState] = useState({ constructors: [], loading: true, error: null })

  useEffect(() => {
    const cacheKey = `pitwall_seasonctors_${year}`
    const cached = readCache(cacheKey)
    if (cached) setState({ constructors: cached, loading: false, error: null })

    const ctrl = new AbortController()
    jget(`/${year}/constructors.json?limit=100`, ctrl.signal)
      .then((json) => {
        const rows = json?.MRData?.ConstructorTable?.Constructors ?? []
        writeCache(cacheKey, rows)
        setState({ constructors: rows, loading: false, error: null })
      })
      .catch((e) => {
        if (e.name === 'AbortError') return
        setState((prev) => ({
          constructors: prev.constructors,
          loading: false,
          error: prev.constructors.length ? null : e.message,
        }))
      })
    return () => ctrl.abort()
  }, [year])

  return state
}

/**
 * One constructor's career, from the backend.
 *
 * Same shape and same honesty contract as useDriverProfile — see
 * /api/constructor/{id}/career. A 77-season team is ~87 upstream requests, so
 * this is firmly a backend job; the browser makes one call.
 */
export function useConstructorProfile(constructorId) {
  const [state, setState] = useState({ data: null, loading: true, error: null })

  useEffect(() => {
    if (!constructorId) {
      setState({ data: null, loading: false, error: null })
      return
    }
    const cacheKey = `pitwall_ctor_${constructorId}_${SEASON}`
    const cached = readCache(cacheKey)
    if (cached) setState({ data: cached, loading: false, error: null })

    const ctrl = new AbortController()
    let cancelled = false
    fetch(`${API_BASE}/api/constructor/${encodeURIComponent(constructorId)}/career`, { signal: ctrl.signal })
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then((json) => {
        if (cancelled) return
        if (json?.error) throw new Error(json.error)
        if (!json.partial) writeCache(cacheKey, json)
        setState({ data: json, loading: false, error: null })
      })
      .catch((e) => {
        if (cancelled || e.name === 'AbortError') return
        setState((prev) => ({
          data: prev.data, loading: false, error: prev.data ? null : e.message,
        }))
      })
    return () => { cancelled = true; ctrl.abort() }
  }, [constructorId])

  return state
}
