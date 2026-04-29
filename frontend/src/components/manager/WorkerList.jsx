import { useState, useEffect } from 'react'
import api from '../../services/api'

function PctBar({ pct, ok = 70 }) {
  if (pct === null || pct === undefined) return <span className="text-gray-300 text-xs">—</span>
  const color = pct >= ok ? 'bg-green-400' : pct >= 40 ? 'bg-yellow-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${pct >= ok ? 'text-green-600' : pct >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
        {pct}%
      </span>
    </div>
  )
}

export default function WorkerList({ workers, onRefresh }) {
  const [stats, setStats]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [sortBy, setSortBy]   = useState('alpha') // 'alpha' | 'reliability'

  useEffect(() => {
    api.get('/users/worker-stats')
      .then((res) => setStats(res.data))
      .catch(() => setError('Could not load worker stats.'))
      .finally(() => setLoading(false))
  }, [workers]) // re-fetch whenever the worker list changes (deactivate/reactivate)

  const handleDeactivate = async (id) => {
    setError('')
    try { await api.delete(`/users/${id}`); onRefresh() }
    catch (err) { setError(err.response?.data?.detail || 'Failed to deactivate worker') }
  }

  const handleReactivate = async (id) => {
    setError('')
    try { await api.patch(`/users/${id}`, { is_active: true }); onRefresh() }
    catch (err) { setError(err.response?.data?.detail || 'Failed to reactivate worker') }
  }

  const sorted = [...stats].sort((a, b) => {
    if (sortBy === 'alpha') return a.name.localeCompare(b.name)
    // reliability: combined score = avg of attendance_pct + answer_pct (nulls = 0)
    const scoreA = ((a.attendance_pct ?? 0) + (a.answer_pct ?? 0)) / 2
    const scoreB = ((b.attendance_pct ?? 0) + (b.answer_pct ?? 0)) / 2
    return scoreB - scoreA // highest first
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Student Workers</h2>
          <span className="bg-gray-100 text-gray-500 text-xs font-bold px-2.5 py-1 rounded-full">
            {workers.length} total
          </span>
        </div>
        {/* Sort toggle */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-xs font-semibold">
          <button
            onClick={() => setSortBy('alpha')}
            className={`px-3 py-1.5 rounded-md transition-colors ${sortBy === 'alpha' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            A – Z
          </button>
          <button
            onClick={() => setSortBy('reliability')}
            className={`px-3 py-1.5 rounded-md transition-colors ${sortBy === 'reliability' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Reliability
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{error}</div>}

      <div className="bg-white border rounded-xl overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_80px_110px_110px_80px] gap-2 px-4 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-400 uppercase tracking-wide">
          <span>Worker</span>
          <span>Status</span>
          <span>Attendance</span>
          <span>Dispatch Rate</span>
          <span></span>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">Loading stats…</div>
        ) : sorted.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">No workers registered.</div>
        ) : (
          sorted.map((w) => (
            <div
              key={w.id}
              className="grid grid-cols-[1fr_80px_110px_110px_80px] gap-2 items-center px-4 py-2.5 border-b last:border-0 hover:bg-gray-50"
            >
              {/* Name + email */}
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{w.name}</p>
                <p className="text-xs text-gray-400 truncate">{w.email}</p>
              </div>

              {/* Active badge */}
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full w-fit ${w.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                {w.is_active ? 'Active' : 'Inactive'}
              </span>

              {/* Attendance bar */}
              <div>
                <PctBar pct={w.attendance_pct} />
                {w.shifts_total > 0 && (
                  <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                    {w.shifts_attended}/{w.shifts_total} shifts
                  </p>
                )}
              </div>

              {/* Dispatch answer bar */}
              <div>
                <PctBar pct={w.answer_pct} ok={60} />
                {w.dispatches_total > 0 && (
                  <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                    {w.dispatches_answered}/{w.dispatches_total} answered
                  </p>
                )}
              </div>

              {/* Action */}
              <div className="flex justify-end">
                {w.is_active ? (
                  <button
                    onClick={() => handleDeactivate(w.id)}
                    className="text-[11px] text-red-500 hover:bg-red-50 px-2.5 py-1 border border-red-200 rounded font-medium"
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    onClick={() => handleReactivate(w.id)}
                    className="text-[11px] text-green-600 hover:bg-green-50 px-2.5 py-1 border border-green-200 rounded font-medium"
                  >
                    Reactivate
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
