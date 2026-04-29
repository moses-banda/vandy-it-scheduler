import { useState } from 'react'
import { fmtTime } from '../../utils/time'

const PENDING = {
  orange: { label: 'Not Checked In', cls: 'bg-yellow-100 text-yellow-700' },
  red:    { label: 'Missed',         cls: 'bg-red-100 text-red-700' },
  gray:   { label: 'Upcoming',       cls: 'bg-gray-100 text-gray-500' },
}

const STATE_CFG = {
  green:  { label: 'Checked In',     cls: 'bg-green-100 text-green-700' },
  orange: { label: 'Not Checked In', cls: 'bg-yellow-100 text-yellow-700' },
  red:    { label: 'Missed',         cls: 'bg-red-100 text-red-700' },
  gray:   { label: 'Upcoming',       cls: 'bg-gray-100 text-gray-500' },
}

function delayLabel(startTime, checkinTime) {
  if (!checkinTime) return null
  const mins = Math.round((new Date(checkinTime) - new Date(startTime)) / 60000)
  if (mins > 0)  return { text: `+${mins}m late`, cls: 'text-red-500' }
  if (mins < 0)  return { text: `${Math.abs(mins)}m early`, cls: 'text-gray-400' }
  return { text: 'on time', cls: 'text-green-600' }
}

/** Slide-in panel showing all shifts for a building today */
function BuildingDetail({ building, slots, workers, onClose }) {
  const bSlots = slots
    .filter((s) => s.building_id === building.id)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))

  const workerName = (id) => workers.find((w) => w.id === id)?.name ?? '—'

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white w-full max-w-sm h-full shadow-2xl flex flex-col z-50">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <p className="font-bold text-gray-800 text-base">{building.name}</p>
            {building.address && <p className="text-xs text-gray-400 mt-0.5">{building.address}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Today's Schedule</p>

          {bSlots.length === 0 ? (
            <div className="text-center text-gray-300 py-10 text-sm">No shifts scheduled today</div>
          ) : (
            <div className="space-y-3">
              {bSlots.map((s) => {
                const cfg   = STATE_CFG[s.state] ?? STATE_CFG.gray
                const delay = delayLabel(s.start_time, s.checkin_time)
                return (
                  <div key={s.shift_id} className={`rounded-xl border p-3.5 ${s.state === 'green' ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{workerName(s.worker_id)}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                        </p>
                        {s.checkin_time && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Checked in {fmtTime(s.checkin_time)}
                            {delay && (
                              <span className={`ml-1.5 font-semibold ${delay.cls}`}>{delay.text}</span>
                            )}
                          </p>
                        )}
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CoverageGrid({ slots = [], workers = [], buildings = [], onRefresh }) {
  const [selected, setSelected] = useState(null)

  const workerName = (id) => workers.find((w) => w.id === id)?.name ?? '—'

  // Index slots by building
  const byBuilding = {}
  slots.forEach((s) => {
    if (!byBuilding[s.building_id]) byBuilding[s.building_id] = []
    byBuilding[s.building_id].push(s)
  })

  const occupied   = buildings.filter((b) => byBuilding[b.id]?.some((s) => s.state === 'green'))
  const unoccupied = buildings.filter((b) => !byBuilding[b.id]?.some((s) => s.state === 'green'))

  const totalIn  = slots.filter((s) => s.state === 'green').length
  const totalOut = slots.filter((s) => s.state !== 'green').length

  const selectedBuilding = selected ? buildings.find((b) => b.id === selected) : null

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Live Building Coverage</h2>
          <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full">
            {occupied.length} occupied
          </span>
          <span className="bg-gray-100 text-gray-500 text-xs font-bold px-2.5 py-1 rounded-full">
            {unoccupied.length} empty
          </span>
        </div>
        <button onClick={onRefresh} className="text-sm text-blue-600 hover:underline">Refresh</button>
      </div>

      <div className="grid grid-cols-2 gap-5">

        {/* LEFT — Unoccupied */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-sm border-2 border-gray-400 bg-white" />
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              Unoccupied &nbsp;·&nbsp; {unoccupied.length}
            </p>
          </div>
          <div className="space-y-2">
            {unoccupied.length === 0 && (
              <div className="text-center text-gray-400 py-8 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium">
                All buildings occupied
              </div>
            )}
            {unoccupied.map((b) => {
              const bSlots = byBuilding[b.id] ?? []
              const relevant = bSlots
                .filter((s) => s.state !== 'green')
                .sort((a, z) => new Date(a.start_time) - new Date(z.start_time))[0]

              return (
                <button
                  key={b.id}
                  onClick={() => setSelected(b.id)}
                  className="w-full bg-white border-2 border-gray-200 rounded-xl p-4 text-left hover:border-gray-400 hover:shadow transition-all group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 text-sm truncate">{b.name}</p>
                      {relevant ? (
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          {workerName(relevant.worker_id)} &nbsp;·&nbsp; {fmtTime(relevant.start_time)}–{fmtTime(relevant.end_time)}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-300 mt-1">No shift today</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {relevant && (
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${PENDING[relevant.state]?.cls ?? 'bg-gray-100 text-gray-400'}`}>
                          {PENDING[relevant.state]?.label ?? relevant.state}
                        </span>
                      )}
                      <span className="text-[11px] text-gray-400 group-hover:text-blue-500 transition-colors">schedule →</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* RIGHT — Occupied */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-sm bg-gray-800" />
            <p className="text-xs font-bold text-gray-800 uppercase tracking-widest">
              Occupied &nbsp;·&nbsp; {occupied.length}
            </p>
          </div>
          <div className="space-y-2">
            {occupied.length === 0 && (
              <div className="text-center text-gray-400 py-8 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium">
                No one checked in yet
              </div>
            )}
            {occupied.map((b) => {
              const activeSlots = (byBuilding[b.id] ?? []).filter((s) => s.state === 'green')
              return (
                <button
                  key={b.id}
                  onClick={() => setSelected(b.id)}
                  className="w-full bg-gray-900 text-white border-2 border-gray-900 rounded-xl p-4 text-left hover:bg-gray-800 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse inline-block" />
                    <p className="font-bold text-white text-sm flex-1 truncate">{b.name}</p>
                    <span className="text-[11px] text-gray-400 group-hover:text-gray-200 transition-colors">schedule →</span>
                  </div>
                  <div className="space-y-2">
                    {activeSlots.map((slot) => {
                      const delay = delayLabel(slot.start_time, slot.checkin_time)
                      return (
                        <div key={slot.shift_id} className="flex items-center justify-between bg-white/10 rounded-lg px-3 py-2">
                          <div>
                            <p className="text-sm font-semibold text-white">{workerName(slot.worker_id)}</p>
                            <p className="text-xs text-gray-400">
                              {fmtTime(slot.start_time)}–{fmtTime(slot.end_time)}
                              {slot.checkin_time && <> · in {fmtTime(slot.checkin_time)}</>}
                            </p>
                          </div>
                          {delay && (
                            <span className={`text-xs font-bold ${delay.cls}`}>{delay.text}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

      </div>

      {/* Building detail slide-in */}
      {selectedBuilding && (
        <BuildingDetail
          building={selectedBuilding}
          slots={slots}
          workers={workers}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
