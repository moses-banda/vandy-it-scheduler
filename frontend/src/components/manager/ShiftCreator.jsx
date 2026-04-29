import { useState, useEffect, useCallback } from 'react'
import api from '../../services/api'
import { todayNashville, fmtTime, fmtDate, nashvilleTimeToISO, nashvilleDate } from '../../utils/time'

/** Treat bare datetime strings (no Z/offset) as UTC — same as parseDate in time.js */
function parseUTC(str) {
  if (!str) return new Date(NaN)
  const s = String(str)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/Z|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s + 'Z')
  return new Date(s)
}

const emptyRow = () => ({ id: Date.now() + Math.random(), worker_id: '', building_id: '', start: '', end: '' })

// Format an ISO datetime back to HH:MM in Nashville time for the time input
function toTimeInput(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export default function ShiftCreator({ workers, buildings, onRefresh }) {
  const [date, setDate]         = useState(todayNashville())
  const [rows, setRows]         = useState([emptyRow()])
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Existing shifts for the selected date
  const [existing, setExisting] = useState([])
  const [editing, setEditing]   = useState(null) // { shiftId, building_id, start, end }
  const [editErr, setEditErr]   = useState('')

  const loadExisting = useCallback(async () => {
    try {
      const res = await api.get('/shifts')
      setExisting((res.data || []).filter((s) => nashvilleDate(s.start_time) === date))
    } catch { /* non-fatal */ }
  }, [date])

  useEffect(() => { loadExisting() }, [loadExisting])

  const updateRow = (id, field, val) =>
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: val } : r))

  const addRow = () => setRows((prev) => [...prev, emptyRow()])
  const removeRow = (id) => setRows((prev) => prev.filter((r) => r.id !== id))

  // ── Create ──────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess(''); setSubmitting(true)
    const valid = rows.filter((r) => r.worker_id && r.building_id && r.start && r.end)
    if (!valid.length) { setError('Fill in at least one complete row.'); setSubmitting(false); return }

    let created = 0, failed = 0
    for (const row of valid) {
      try {
        const start_time = nashvilleTimeToISO(date, row.start)
        const end_time   = nashvilleTimeToISO(date, row.end)
        const [h, m]     = row.start.split(':').map(Number)
        const totalMin   = h * 60 + m + 30
        const closeHH    = String(Math.floor(totalMin / 60)).padStart(2, '0')
        const closeMM    = String(totalMin % 60).padStart(2, '0')
        await api.post('/shifts', {
          worker_id: row.worker_id,
          building_id: row.building_id,
          start_time,
          end_time,
          checkin_open_time:  start_time,
          checkin_close_time: nashvilleTimeToISO(date, `${closeHH}:${closeMM}`),
        })
        created++
      } catch { failed++ }
    }

    setSubmitting(false)
    if (created) {
      setSuccess(`${created} shift${created > 1 ? 's' : ''} created.${failed ? ` ${failed} failed.` : ''}`)
      setRows([emptyRow()])
      loadExisting()
      onRefresh()
    } else {
      setError('All shifts failed to create.')
    }
  }

  // ── Edit ────────────────────────────────────────────────────────────────
  const startEdit = (s) => {
    setEditing({
      shiftId:     s.id,
      building_id: s.building_id,
      start:       toTimeInput(s.start_time),
      end:         toTimeInput(s.end_time),
    })
    setEditErr('')
  }

  const saveEdit = async () => {
    setEditErr('')
    try {
      const start_time = nashvilleTimeToISO(date, editing.start)
      const end_time   = nashvilleTimeToISO(date, editing.end)
      const [h, m]     = editing.start.split(':').map(Number)
      const totalMin   = h * 60 + m + 30
      const closeHH    = String(Math.floor(totalMin / 60)).padStart(2, '0')
      const closeMM    = String(totalMin % 60).padStart(2, '0')
      await api.patch(`/shifts/${editing.shiftId}`, {
        building_id:        editing.building_id,
        start_time,
        end_time,
        checkin_open_time:  start_time,
        checkin_close_time: nashvilleTimeToISO(date, `${closeHH}:${closeMM}`),
      })
      setEditing(null)
      loadExisting()
      onRefresh()
    } catch (err) {
      setEditErr(err.response?.data?.detail || 'Update failed')
    }
  }

  const cancelShift = async (id) => {
    if (!window.confirm('Cancel this shift? The worker will be notified.')) return
    try {
      await api.delete(`/shifts/${id}`)
      loadExisting()
      onRefresh()
    } catch { alert('Failed to cancel shift.') }
  }

  const workerName   = (id) => workers?.find((w) => w.id === id)?.name  ?? '—'
  const buildingName = (id) => buildings?.find((b) => b.id === id)?.name ?? '—'
  const validCount   = rows.filter((r) => r.worker_id && r.building_id && r.start && r.end).length

  return (
    <div className="space-y-6">

      {/* ── New Shifts ──────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-4 mb-3">
          <h2 className="text-lg font-semibold">Schedule Shifts</h2>
          <input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setRows([emptyRow()]) }}
            className="border rounded-lg px-3 py-1.5 text-sm"
          />
        </div>

        {error   && <div className="bg-red-50 text-red-600 p-3 rounded mb-3 text-sm">{error}</div>}
        {success && <div className="bg-green-50 text-green-700 p-3 rounded mb-3 text-sm">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="bg-white border rounded-xl overflow-hidden mb-3">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500">Worker</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500">Location</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500">Start</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500">End</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-2 py-1.5">
                      <select
                        value={row.worker_id}
                        onChange={(e) => updateRow(row.id, 'worker_id', e.target.value)}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white"
                      >
                        <option value="">Worker</option>
                        {workers?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={row.building_id}
                        onChange={(e) => updateRow(row.id, 'building_id', e.target.value)}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white"
                      >
                        <option value="">Location</option>
                        {buildings?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="time"
                        value={row.start}
                        onChange={(e) => updateRow(row.id, 'start', e.target.value)}
                        className="border rounded-lg px-2 py-1.5 text-sm w-28"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="time"
                        value={row.end}
                        onChange={(e) => updateRow(row.id, 'end', e.target.value)}
                        className="border rounded-lg px-2 py-1.5 text-sm w-28"
                      />
                    </td>
                    <td className="px-2 text-center">
                      {rows.length > 1 && (
                        <button type="button" onClick={() => removeRow(row.id)}
                          className="text-gray-300 hover:text-red-400 text-xl leading-none">×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={addRow} className="text-sm text-blue-600 hover:underline">
              + Add row
            </button>
            <button
              type="submit"
              disabled={submitting || validCount === 0}
              className="ml-auto bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 text-sm font-medium"
            >
              {submitting ? 'Saving…' : `Create ${validCount || ''} Shift${validCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>

      {/* ── Existing Shifts ─────────────────────────────────────────── */}
      {existing.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Scheduled — {fmtDate(date + 'T12:00:00')}
          </h3>
          <div className="bg-white border rounded-xl overflow-hidden divide-y">
            {existing
              .sort((a, b) => parseUTC(a.start_time) - parseUTC(b.start_time))
              .map((s) => (
                <div key={s.id} className="px-4 py-3">
                  {editing?.shiftId === s.id ? (
                    /* Inline edit row */
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2 items-end">
                        <select
                          value={editing.building_id}
                          onChange={(e) => setEditing({ ...editing, building_id: e.target.value })}
                          className="border rounded-lg px-2 py-1.5 text-sm"
                        >
                          {buildings?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                        <input type="time" value={editing.start}
                          onChange={(e) => setEditing({ ...editing, start: e.target.value })}
                          className="border rounded-lg px-2 py-1.5 text-sm w-28" />
                        <input type="time" value={editing.end}
                          onChange={(e) => setEditing({ ...editing, end: e.target.value })}
                          className="border rounded-lg px-2 py-1.5 text-sm w-28" />
                        <button onClick={saveEdit}
                          className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700">
                          Save
                        </button>
                        <button onClick={() => setEditing(null)}
                          className="text-gray-400 hover:text-gray-600 text-sm px-2 py-1.5">
                          Cancel
                        </button>
                      </div>
                      {editErr && <p className="text-xs text-red-600">{editErr}</p>}
                    </div>
                  ) : (
                    /* Display row */
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <span className="font-medium text-sm text-gray-800">{workerName(s.worker_id)}</span>
                        <span className="text-gray-300 mx-2">·</span>
                        <span className="text-sm text-gray-600">{buildingName(s.building_id)}</span>
                        <span className="text-gray-300 mx-2">·</span>
                        <span className="text-sm text-gray-500">{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          s.status === 'checked_in' ? 'bg-green-100 text-green-700' :
                          s.status === 'missed'     ? 'bg-red-100 text-red-700' :
                          s.status === 'completed'  ? 'bg-gray-100 text-gray-500' :
                                                      'bg-blue-50 text-blue-600'
                        }`}>{s.status}</span>
                        {['scheduled', 'missed'].includes(s.status) && (
                          <>
                            <button onClick={() => startEdit(s)}
                              className="text-xs text-blue-600 hover:underline font-medium">Edit</button>
                            <button onClick={() => cancelShift(s.id)}
                              className="text-xs text-red-500 hover:underline font-medium">Cancel</button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {existing.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">No shifts scheduled for this date yet.</p>
      )}
    </div>
  )
}
