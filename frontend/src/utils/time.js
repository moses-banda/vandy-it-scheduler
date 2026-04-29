const TZ = 'America/Chicago' // Nashville — Central Time

/**
 * Parse a datetime value safely, always treating bare strings (no Z / offset)
 * as UTC — because the backend always stores UTC but FastAPI/asyncpg may omit
 * the timezone suffix in JSON serialization.
 */
function parseDate(dt) {
  if (!dt) return new Date(NaN)
  if (dt instanceof Date) return dt
  const s = String(dt)
  // If no timezone indicator present, assume UTC by appending Z
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/Z|[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(s + 'Z')
  }
  return new Date(s)
}

/** Today's date string in Nashville time, e.g. "2026-04-06" */
export function todayNashville() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

/** Format a datetime string/Date as HH:MM am/pm in Nashville time */
export function fmtTime(dt) {
  return parseDate(dt).toLocaleTimeString('en-US', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Format a datetime as "Mon, Apr 6" in Nashville time */
export function fmtDate(dt) {
  return parseDate(dt).toLocaleDateString('en-US', {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** Format a datetime as "Apr 6, 3:45 PM" in Nashville time */
export function fmtDateTime(dt) {
  return parseDate(dt).toLocaleString('en-US', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Format a date as full weekday + month + day, e.g. "Sunday, April 6" */
export function fmtDateLong(dt) {
  return parseDate(dt).toLocaleDateString('en-US', {
    timeZone: TZ,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

/** Return the Nashville date string (YYYY-MM-DD) for any datetime */
export function nashvilleDate(dt) {
  return parseDate(dt).toLocaleDateString('en-CA', { timeZone: TZ })
}

/**
 * Convert a Nashville local date + time string to a UTC ISO string.
 * e.g. nashvilleTimeToISO("2026-04-06", "08:00") → "2026-04-06T13:00:00.000Z" (CDT = UTC-5)
 */
export function nashvilleTimeToISO(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)

  // Probe: treat the naive input as UTC to compute Nashville's offset at that instant
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(probe).map((p) => [p.type, p.value]))
  const nashvilleAsUTC = Date.UTC(
    +parts.year, +parts.month - 1, +parts.day,
    +parts.hour === 24 ? 0 : +parts.hour, +parts.minute
  )

  // offsetMs is positive for UTC-N timezones (e.g. +18000000 for CDT/UTC-5)
  const offsetMs = probe.getTime() - nashvilleAsUTC
  return new Date(Date.UTC(year, month - 1, day, hour, minute) + offsetMs).toISOString()
}
