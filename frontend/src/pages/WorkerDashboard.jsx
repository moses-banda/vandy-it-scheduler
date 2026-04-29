import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { createWebSocket } from '../services/websocket'
import api from '../services/api'
import Navbar from '../components/shared/Navbar'
import CheckInButton from '../components/worker/CheckInButton'
import IncomingCall from '../components/worker/IncomingCall'
import { fmtTime, fmtDate, fmtDateTime, todayNashville, nashvilleDate } from '../utils/time'

const SHIFT_STATUS = {
  scheduled:  { label: 'Scheduled',  cls: 'bg-blue-100 text-blue-700' },
  checked_in: { label: 'Checked In', cls: 'bg-green-100 text-green-700' },
  completed:  { label: 'Completed',  cls: 'bg-gray-100 text-gray-500' },
  missed:     { label: 'Missed',     cls: 'bg-red-100 text-red-700' },
  cancelled:  { label: 'Cancelled',  cls: 'bg-gray-100 text-gray-400' },
}

const CALL_STATUS = {
  ringing:   { label: 'Missed',   cls: 'bg-yellow-100 text-yellow-700' },
  connected: { label: 'Answered', cls: 'bg-blue-100 text-blue-700' },
  ended:     { label: 'Ended',    cls: 'bg-gray-100 text-gray-500' },
  failed:    { label: 'Failed',   cls: 'bg-red-100 text-red-700' },
}

function parseUTC(str) {
  if (!str) return null
  if (str instanceof Date) return str
  const s = String(str)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/Z|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s + 'Z')
  return new Date(s)
}

function useCountdown(targetDate) {
  const [diff, setDiff] = useState(null)
  useEffect(() => {
    if (!targetDate) { setDiff(null); return }
    const tick = () => { const ms = parseUTC(targetDate) - Date.now(); setDiff(ms > 0 ? ms : 0) }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetDate])
  if (diff === null || diff < 0) return null
  const totalSec = Math.floor(diff / 1000)
  return { h: Math.floor(totalSec / 3600), m: Math.floor((totalSec % 3600) / 60), s: totalSec % 60, totalSec }
}

// ── Icons ────────────────────────────────────────────────────────────────────

function IconCalendar({ size = 22, active }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}

function IconClock({ size = 22, active }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}

function IconBot({ size = 22, active }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/>
      <path d="M2 14h2"/><path d="M20 14h2"/>
      <path d="M15 13v2"/><path d="M9 13v2"/>
    </svg>
  )
}

const TABS = [
  { id: 'schedule', label: 'Schedule', Icon: IconCalendar },
  { id: 'history',  label: 'History',  Icon: IconClock },
  { id: 'assistant',label: 'Assistant',Icon: IconBot },
]

export default function WorkerDashboard() {
  const { user } = useAuth()
  const [shifts, setShifts] = useState([])
  const [buildings, setBuildings] = useState([])
  const [calls, setCalls] = useState([])
  const [dispatches, setDispatches] = useState([])
  const [incomingCall, setIncomingCall] = useState(null)
  const [ws, setWs] = useState(null)
  const [tab, setTab] = useState('schedule')
  const webRtcHandlerRef = useRef(null)

  const [shiftNotifs, setShiftNotifs] = useState([])
  const [updatedIds, setUpdatedIds] = useState(new Set())
  const dismissNotif = (id) => setShiftNotifs((prev) => prev.filter((n) => n.id !== id))

  const todaySummaries = (() => {
    try {
      const today = todayNashville()
      return JSON.parse(localStorage.getItem(`dispatch_summaries_${today}`) || '[]')
    } catch { return [] }
  })()

  const loadData = useCallback(async () => {
    if (!user) return
    const today = todayNashville()
    try {
      const [shiftsRes, buildingsRes, callsRes, dispRes] = await Promise.all([
        api.get('/shifts'),
        api.get('/buildings'),
        api.get('/calls'),
        api.get(`/dispatches?date=${today}`),
      ])
      setShifts(shiftsRes.data.filter((s) => s.worker_id === user.id))
      setBuildings(buildingsRes.data || [])
      setCalls(callsRes.data || [])
      setDispatches((dispRes.data || []).filter((d) => d.assigned_worker_id === user.id))
    } catch (err) {
      console.error('Failed to load data:', err)
    }
  }, [user])

  useEffect(() => { loadData() }, [loadData])

  const nextUpcomingStart = shifts
    .filter((s) => parseUTC(s.start_time) > Date.now() && s.status === 'scheduled')
    .sort((a, b) => parseUTC(a.start_time) - parseUTC(b.start_time))[0]?.start_time ?? null

  useEffect(() => {
    if (!nextUpcomingStart) return
    const msUntil = parseUTC(nextUpcomingStart) - Date.now()
    if (msUntil <= 0) return
    const t = setTimeout(() => loadData(), msUntil + 500)
    return () => clearTimeout(t)
  }, [nextUpcomingStart, loadData])

  useEffect(() => {
    if (!user) return
    const socket = createWebSocket(user.id, (data) => {
      if (data.event === 'call.incoming') setIncomingCall(data)
      if (data.event === 'call.ended') setIncomingCall(null)
      if (['dispatch.missed', 'dispatch.cancelled', 'dispatch.reassigned'].includes(data.event)) setIncomingCall(null)
      if (data.event === 'shift.ending_soon') alert(data.message)

      if (data.event === 'shift.updated') {
        setUpdatedIds((prev) => new Set([...prev, data.shift_id]))
        setShiftNotifs((prev) => [...prev, {
          id: Date.now(), type: 'update', shiftId: data.shift_id,
          message: `Shift updated — ${data.building_name}, ${fmtTime(data.start_time)} – ${fmtTime(data.end_time)}`,
        }])
      }

      if (data.event === 'shift.cancelled') {
        const detail = data.building_name && data.start_time
          ? ` — ${data.building_name}, ${fmtTime(data.start_time)}` : ''
        setShiftNotifs((prev) => [...prev, {
          id: Date.now(), type: 'cancel', shiftId: data.shift_id,
          message: `Your shift has been cancelled by your manager${detail}.`,
        }])
      }

      if (['shift.scheduled', 'shift.updated', 'shift.cancelled', 'shift.auto_checkout', 'checkin.approved', 'dispatch.status_changed'].includes(data.event)) loadData()
      if (data.event === 'webrtc.answer' || data.event === 'webrtc.ice_candidate') {
        if (webRtcHandlerRef.current) webRtcHandlerRef.current(data)
      }
    })
    setWs(socket)
    return () => socket.close()
  }, [user, loadData])

  const now = new Date()
  const todayStr = todayNashville()
  const getBldName = (id) => buildings.find((b) => b.id === id)?.name

  const activeShift = shifts.find((s) => {
    const start = parseUTC(s.start_time)
    const end   = parseUTC(s.end_time)
    return now >= start && now <= end && !['completed', 'missed', 'cancelled'].includes(s.status)
  })

  const upcomingShifts = shifts
    .filter((s) => parseUTC(s.start_time) > now && s.status === 'scheduled')
    .sort((a, b) => parseUTC(a.start_time) - parseUTC(b.start_time))

  const nextShift = upcomingShifts[0]
  const countdown = useCountdown(nextShift?.start_time)

  const todayOther = shifts.filter(
    (s) => nashvilleDate(s.start_time) === todayStr && s !== activeShift && parseUTC(s.start_time) > now && s.status === 'scheduled'
  )

  const pastShifts = shifts
    .filter((s) => ['completed', 'missed', 'cancelled'].includes(s.status))
    .sort((a, b) => parseUTC(b.start_time) - parseUTC(a.start_time))

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {incomingCall && (
        <IncomingCall
          callData={incomingCall}
          ws={ws}
          webRtcHandlerRef={webRtcHandlerRef}
          onDismiss={() => setIncomingCall(null)}
          onRefresh={loadData}
        />
      )}

      {/* Shift change notification banners */}
      {shiftNotifs.length > 0 && (
        <div className="px-4 pt-3 space-y-2">
          {shiftNotifs.map((n) => (
            <div key={n.id} className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-sm ${
              n.type === 'update'
                ? 'bg-amber-50 border border-amber-200 text-amber-800'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              <span className="text-base shrink-0">{n.type === 'update' ? '📋' : '🚫'}</span>
              <span className="flex-1">{n.message}</span>
              <button onClick={() => dismissNotif(n.id)} className="shrink-0 text-lg leading-none opacity-50 hover:opacity-100">×</button>
            </div>
          ))}
        </div>
      )}

      {/* Scrollable content — padded above bottom tab bar */}
      <div className="px-4 py-4 pb-24 space-y-4">

        {/* ── SCHEDULE TAB ── */}
        {tab === 'schedule' && (
          <>
            {/* Greeting */}
            <div className="pt-1 pb-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <p className="text-xl font-bold text-gray-800 mt-0.5">Hi, {user?.name?.split(' ')[0]} 👋</p>
            </div>

            {/* Countdown to next shift */}
            {!activeShift && nextShift && countdown && (
              <div className="bg-blue-600 text-white rounded-2xl p-5 shadow-md">
                <p className="text-xs font-semibold opacity-70 uppercase tracking-widest mb-3">Next shift starts in</p>
                <div className="flex items-end gap-3">
                  {countdown.h > 0 && (
                    <div className="text-center">
                      <div className="text-4xl font-bold tabular-nums leading-none">{String(countdown.h).padStart(2, '0')}</div>
                      <div className="text-[10px] opacity-60 mt-1 uppercase">hr</div>
                    </div>
                  )}
                  <div className="text-center">
                    <div className="text-4xl font-bold tabular-nums leading-none">{String(countdown.m).padStart(2, '0')}</div>
                    <div className="text-[10px] opacity-60 mt-1 uppercase">min</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold tabular-nums leading-none">{String(countdown.s).padStart(2, '0')}</div>
                    <div className="text-[10px] opacity-60 mt-1 uppercase">sec</div>
                  </div>
                </div>
                <p className="text-sm opacity-75 mt-3">
                  {getBldName(nextShift.building_id)} · {fmtTime(nextShift.start_time)} – {fmtTime(nextShift.end_time)}
                </p>
              </div>
            )}

            {/* Active shift */}
            {activeShift && (
              <div className="bg-white border-2 border-blue-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">Active Shift</p>
                    <p className="font-bold text-gray-800 text-lg leading-tight">
                      {getBldName(activeShift.building_id) || 'Unknown Location'}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">{fmtTime(activeShift.start_time)} – {fmtTime(activeShift.end_time)}</p>
                    {updatedIds.has(activeShift.id) && (
                      <span className="inline-block mt-1.5 text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full uppercase tracking-wide">Updated</span>
                    )}
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${SHIFT_STATUS[activeShift.status]?.cls ?? 'bg-gray-100'}`}>
                    {SHIFT_STATUS[activeShift.status]?.label ?? activeShift.status}
                  </span>
                </div>
                {activeShift.status === 'scheduled' && (
                  <CheckInButton
                    shiftId={activeShift.id}
                    buildingName={getBldName(activeShift.building_id)}
                    startTime={activeShift.start_time}
                    onSuccess={loadData}
                  />
                )}
                {activeShift.status === 'checked_in' && (
                  <div className="bg-green-50 text-green-700 rounded-xl p-4 text-center font-semibold text-sm">
                    ✅ Checked in successfully
                  </div>
                )}
              </div>
            )}

            {/* Later today */}
            {todayOther.length > 0 && (
              <section>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Later Today</p>
                <div className="space-y-2">
                  {todayOther.map((s) => (
                    <ShiftCard key={s.id} shift={s} bldName={getBldName(s.building_id)} updated={updatedIds.has(s.id)} showDate={false} />
                  ))}
                </div>
              </section>
            )}

            {/* Upcoming */}
            {upcomingShifts.filter((s) => nashvilleDate(s.start_time) !== todayStr).length > 0 && (
              <section>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Upcoming</p>
                <div className="space-y-2">
                  {upcomingShifts
                    .filter((s) => nashvilleDate(s.start_time) !== todayStr)
                    .slice(0, 10)
                    .map((s) => (
                      <ShiftCard key={s.id} shift={s} bldName={getBldName(s.building_id)} updated={updatedIds.has(s.id)} showDate />
                    ))}
                </div>
              </section>
            )}

            {/* Today's dispatches */}
            {dispatches.length > 0 && (
              <section>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Today's Dispatches</p>
                <div className="space-y-2">
                  {dispatches.map((d) => (
                    <div key={d.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{d.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{fmtDateTime(d.created_at)}</p>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 capitalize ml-3 shrink-0">
                        {d.status}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Accepted dispatch summaries */}
            {todaySummaries.length > 0 && (
              <section>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Today's Assignments</p>
                <div className="space-y-2">
                  {todaySummaries.map((s) => (
                    <div key={s.dispatch_id} className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
                      <span className="text-xl shrink-0">📍</span>
                      <div>
                        <p className="font-semibold text-blue-800 text-sm">{s.building_name}</p>
                        <p className="text-sm font-medium text-blue-700 mt-0.5">{s.title}</p>
                        <p className="text-sm text-blue-600 mt-1 leading-relaxed">{s.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {!activeShift && upcomingShifts.length === 0 && dispatches.length === 0 && todaySummaries.length === 0 && (
              <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center shadow-sm">
                <div className="text-5xl mb-3">📅</div>
                <p className="font-semibold text-gray-700">No shifts scheduled</p>
                <p className="text-sm text-gray-400 mt-1">Your manager will schedule you soon.</p>
              </div>
            )}
          </>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && (
          <>
            <section>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Shift History</p>
              {pastShifts.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-gray-400 text-sm shadow-sm">No past shifts yet.</div>
              ) : (
                <div className="space-y-2">
                  {pastShifts.slice(0, 30).map((s) => {
                    const cfg = SHIFT_STATUS[s.status] ?? SHIFT_STATUS.completed
                    return (
                      <div key={s.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
                        <div>
                          <p className="text-xs text-gray-400 font-medium">{fmtDate(s.start_time)}</p>
                          <p className="font-semibold text-gray-800 text-sm mt-0.5">{getBldName(s.building_id) || '—'}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</p>
                        </div>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ml-3 ${cfg.cls}`}>{cfg.label}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Call History</p>
              {calls.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-gray-400 text-sm shadow-sm">No calls yet.</div>
              ) : (
                <div className="space-y-2">
                  {calls.slice(0, 30).map((c) => {
                    const cfg = CALL_STATUS[c.status] ?? CALL_STATUS.ended
                    const dur = c.connected_at && c.ended_at
                      ? Math.round((new Date(c.ended_at) - new Date(c.connected_at)) / 1000) : null
                    return (
                      <div key={c.call_id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
                        <div>
                          <p className="text-sm font-semibold text-gray-700">{fmtDateTime(c.started_at)}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{dur != null ? `Duration: ${dur}s` : 'No duration'}</p>
                        </div>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ml-3 ${cfg.cls}`}>{cfg.label}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {/* ── ASSISTANT TAB ── */}
        {tab === 'assistant' && (
          <div style={{ height: 'calc(100vh - 140px)' }} className="flex flex-col">
            {import.meta.env.VITE_NAMOR_URL ? (
              <iframe
                src={import.meta.env.VITE_NAMOR_URL}
                className="w-full flex-1 rounded-xl border border-gray-100 bg-white shadow-sm"
                title="Namor AI Assistant"
                allow="microphone; camera"
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center bg-white border border-dashed border-gray-200 rounded-2xl text-center p-10">
                <div className="text-5xl mb-4">🤖</div>
                <p className="text-lg font-bold text-gray-700 mb-1">Namor AI Assistant</p>
                <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
                  Set <code className="bg-gray-100 px-1 rounded text-xs">VITE_NAMOR_URL</code> in{' '}
                  <code className="bg-gray-100 px-1 rounded text-xs">frontend/.env</code> to enable your AI assistant.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom Tab Bar ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-20 safe-bottom">
        <div className="flex">
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-colors ${
                  active ? 'text-blue-600' : 'text-gray-400'
                }`}
              >
                <Icon size={22} active={active} />
                <span className={`text-[10px] font-semibold mt-0.5 ${active ? 'text-blue-600' : 'text-gray-400'}`}>
                  {label}
                </span>
                {active && (
                  <span className="absolute bottom-0 w-8 h-0.5 bg-blue-600 rounded-full" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Shift Card Component ─────────────────────────────────────────────────────

function ShiftCard({ shift, bldName, updated, showDate }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
      <div>
        {showDate && (
          <p className="text-xs text-gray-400 font-medium mb-0.5">{fmtDate(shift.start_time)}</p>
        )}
        <p className="font-semibold text-gray-800 text-sm">
          {bldName || '—'}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{fmtTime(shift.start_time)} – {fmtTime(shift.end_time)}</p>
      </div>
      {updated && (
        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full uppercase tracking-wide shrink-0 ml-3">
          Updated
        </span>
      )}
    </div>
  )
}
