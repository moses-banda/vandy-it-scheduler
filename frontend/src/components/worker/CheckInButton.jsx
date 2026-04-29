import { useState, useEffect, useRef } from 'react'
import api from '../../services/api'

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseUTC(str) {
  if (!str) return null
  if (str instanceof Date) return str
  const s = String(str)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/Z|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s + 'Z')
  return new Date(s)
}

function useTimeUntil(target) {
  const [ms, setMs] = useState(() => (target ? parseUTC(target) - Date.now() : 0))
  useEffect(() => {
    if (!target) return
    const tick = () => setMs(parseUTC(target) - Date.now())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [target])
  return ms
}

/**
 * Acquire the best GPS position available within GPS_TIMEOUT_MS.
 *
 * Strategy:
 *   1. watchPosition fires continuously (high-accuracy mode, no cache).
 *   2. Track the reading with the smallest accuracy circle (best so far).
 *   3. Resolve immediately if accuracy ≤ GREAT_ACCURACY_M (great fix).
 *   4. After SETTLE_MS with ≥ MIN_READINGS, submit whatever best we have.
 *   5. Hard cap at GPS_TIMEOUT_MS — submit best or reject if nothing received.
 *
 * Note: we do NOT block submission on poor accuracy. Indoors, GPS often
 * plateaus at 50–150m; the server haversine check is the authoritative gate.
 *
 * `onAccuracyUpdate(meters)` is called on every new reading for live UI.
 */
const GREAT_ACCURACY_M = 20   // resolve immediately if this good
const MIN_READINGS     = 2    // wait for at least this many readings
const SETTLE_MS        = 4000 // wait this long before submitting best available
const GPS_TIMEOUT_MS   = 12000

function getAccuratePosition(onAccuracyUpdate) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported by this browser.'))
      return
    }

    let watchId      = null
    let settleTimer  = null
    let hardTimer    = null
    let best         = null
    let readingCount = 0
    let done         = false

    const cleanup = () => {
      clearTimeout(settleTimer)
      clearTimeout(hardTimer)
      navigator.geolocation.clearWatch(watchId)
    }

    const submit = (pos) => {
      if (done) return
      done = true
      cleanup()
      resolve(pos)
    }

    const fail = (err) => {
      if (done) return
      done = true
      cleanup()
      // Prefer returning the best reading over a hard reject
      if (best) resolve(best)
      else reject(err)
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        readingCount++
        if (!best || pos.coords.accuracy < best.coords.accuracy) {
          best = pos
          onAccuracyUpdate(Math.round(pos.coords.accuracy))
        }

        // If we get a great fix, submit immediately
        if (pos.coords.accuracy <= GREAT_ACCURACY_M) {
          submit(pos)
          return
        }

        // After MIN_READINGS, start a settle timer so we use the best
        // reading collected so far after a short stabilisation window
        if (readingCount === MIN_READINGS && !settleTimer) {
          settleTimer = setTimeout(() => submit(best), SETTLE_MS)
        }
      },
      (err) => fail(err),
      { enableHighAccuracy: true, maximumAge: 0 }
    )

    // Absolute hard cap
    hardTimer = setTimeout(() => fail(new Error('GPS timeout')), GPS_TIMEOUT_MS)
  })
}

// ── Accuracy label helper ────────────────────────────────────────────────────

function accuracyLabel(m) {
  if (m === null) return null
  if (m <= 15)  return { text: `GPS locked (±${m}m)`,    cls: 'text-green-600' }
  if (m <= 40)  return { text: `Good signal (±${m}m)`,   cls: 'text-green-500' }
  if (m <= 100) return { text: `Weak signal (±${m}m)`,   cls: 'text-yellow-600' }
  return          { text: `Poor signal (±${m}m) — stay still`, cls: 'text-red-500' }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CheckInButton({ shiftId, buildingName, startTime, onSuccess }) {
  const [loading, setLoading]       = useState(false)
  const [gpsAccuracy, setGpsAccuracy] = useState(null)   // live accuracy in meters
  const [result, setResult]         = useState(null)
  const msUntilStart = useTimeUntil(startTime)
  const notYet = msUntilStart > 0

  const handleCheckIn = async () => {
    if (notYet) return
    setLoading(true)
    setResult(null)
    setGpsAccuracy(null)

    let position
    try {
      position = await getAccuratePosition(setGpsAccuracy)
    } catch (err) {
      const msg = err.code === 1
        ? 'Location access denied — please allow location in your browser settings.'
        : 'Could not get your location. Make sure GPS is enabled and try again.'
      setResult({ status: 'denied', reason: msg })
      setLoading(false)
      return
    }

    try {
      const res = await api.post('/checkin', {
        shift_id:  shiftId,
        worker_id: '',
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      })
      setResult(res.data)
      if (res.data.status === 'approved') onSuccess()
    } catch (err) {
      const detail = err.response?.data?.detail
      setResult({ status: 'denied', reason: typeof detail === 'string' ? detail : 'Check-in failed.' })
    } finally {
      setLoading(false)
    }
  }

  // ── Approved ───────────────────────────────────────────────────────────────
  if (result?.status === 'approved') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
        <div className="text-3xl mb-2">✅</div>
        <p className="font-semibold text-green-700 text-lg">Checked in successfully</p>
        {buildingName && <p className="text-sm text-green-600 mt-1">{buildingName}</p>}
      </div>
    )
  }

  // ── Countdown (shift not started yet) ─────────────────────────────────────
  if (notYet) {
    const totalSec = Math.floor(msUntilStart / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    const startLabel = startTime
      ? parseUTC(startTime).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit' })
      : ''

    return (
      <div className="space-y-3">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Check-in opens at {startLabel}
          </p>
          <div className="flex items-end justify-center gap-2">
            {h > 0 && (
              <div className="text-center">
                <div className="text-3xl font-bold tabular-nums text-gray-700">{String(h).padStart(2, '0')}</div>
                <div className="text-[10px] text-gray-400 uppercase">hr</div>
              </div>
            )}
            <div className="text-center">
              <div className="text-3xl font-bold tabular-nums text-gray-700">{String(m).padStart(2, '0')}</div>
              <div className="text-[10px] text-gray-400 uppercase">min</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold tabular-nums text-gray-700">{String(s).padStart(2, '0')}</div>
              <div className="text-[10px] text-gray-400 uppercase">sec</div>
            </div>
          </div>
        </div>
        <button disabled className="w-full bg-gray-200 text-gray-400 text-base font-semibold py-3.5 rounded-xl cursor-not-allowed">
          Check In — Not yet time
        </button>
      </div>
    )
  }

  // ── Ready to check in ──────────────────────────────────────────────────────
  const accInfo = accuracyLabel(gpsAccuracy)

  return (
    <div className="space-y-3">
      <button
        onClick={handleCheckIn}
        disabled={loading}
        className="w-full bg-blue-600 text-white text-lg font-semibold py-4 rounded-xl hover:bg-blue-700 disabled:opacity-60 transition-colors"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2 text-base">
            <svg className="animate-spin h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            {gpsAccuracy === null
              ? 'Getting GPS signal…'
              : gpsAccuracy <= 40
                ? `Verifying location… ±${gpsAccuracy}m`
                : `Waiting for better signal… ±${gpsAccuracy}m`
            }
          </span>
        ) : (
          'Check In'
        )}
      </button>

      {/* Live accuracy indicator while loading */}
      {loading && accInfo && (
        <p className={`text-xs text-center font-medium ${accInfo.cls}`}>{accInfo.text}</p>
      )}

      {!loading && (
        <p className="text-xs text-center text-gray-400">
          Must be physically inside {buildingName || 'the building'} to check in
        </p>
      )}

      {result?.status === 'denied' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <div className="text-2xl mb-1">❌</div>
          <p className="font-semibold text-red-700">Check-in failed</p>
          <p className="text-sm text-red-600 mt-1">{result.reason}</p>
          <button
            onClick={() => setResult(null)}
            className="mt-3 text-xs text-red-500 hover:underline"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
