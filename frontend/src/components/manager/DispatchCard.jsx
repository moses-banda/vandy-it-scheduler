import { useState } from 'react'
import api from '../../services/api'

const STATUS = {
  pending:   { label: 'Pending',   cls: 'bg-gray-100 text-gray-600' },
  ringing:   { label: 'Ringing',   cls: 'bg-yellow-100 text-yellow-700' },
  answered:  { label: 'Answered',  cls: 'bg-blue-100 text-blue-700' },
  accepted:  { label: 'Accepted',  cls: 'bg-green-100 text-green-700' },
  declined:  { label: 'Declined',  cls: 'bg-red-100 text-red-700' },
  missed:    { label: 'Missed',    cls: 'bg-red-100 text-red-700' },
  expired:   { label: 'Expired',   cls: 'bg-gray-100 text-gray-500' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-400' },
}

export default function DispatchCard({ dispatch, workers = [], buildings = [], onRefresh }) {
  const [expanded, setExpanded] = useState(false)
  const [reassigning, setReassigning] = useState(false)
  const [reassignForm, setReassignForm] = useState({ assigned_worker_id: '', reason: '' })
  const [error, setError] = useState('')

  const workerName   = workers.find((w) => w.id === dispatch.assigned_worker_id)?.name   ?? '—'
  const buildingName = buildings.find((b) => b.id === dispatch.building_id)?.name ?? '—'
  const cfg          = STATUS[dispatch.status] ?? STATUS.pending
  const canAct       = !['accepted', 'expired', 'cancelled'].includes(dispatch.status)
  const canRetry     = ['missed', 'declined'].includes(dispatch.status)

  const handleRetry = async () => {
    setError('')
    try { await api.post(`/dispatches/${dispatch.id}/ring`); onRefresh() }
    catch (err) { setError(err.response?.data?.detail || 'Retry failed') }
  }

  const handleCancel = async () => {
    setError('')
    try { await api.post(`/dispatches/${dispatch.id}/cancel`); onRefresh() }
    catch (err) { setError(err.response?.data?.detail || 'Cancel failed') }
  }

  const handleReassign = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await api.post(`/dispatches/${dispatch.id}/reassign`, reassignForm)
      setReassigning(false)
      setReassignForm({ assigned_worker_id: '', reason: '' })
      onRefresh()
    } catch (err) { setError(err.response?.data?.detail || 'Reassign failed') }
  }

  return (
    <div>
      {/* Compact summary row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full grid grid-cols-[90px_128px_112px_1fr_16px] gap-3 items-center px-4 py-3 hover:bg-gray-50 text-left transition-colors"
      >
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap text-center ${cfg.cls}`}>
          {cfg.label}
        </span>
        <span className="text-sm font-semibold text-gray-800 truncate">{workerName}</span>
        <span className="text-xs text-gray-400 truncate">{buildingName}</span>
        <span className="text-sm text-gray-600 truncate">{dispatch.title}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded detail + actions */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 bg-gray-50 border-t text-sm space-y-3">
          {dispatch.issue_text && (
            <p className="text-gray-600 leading-relaxed">{dispatch.issue_text}</p>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex flex-wrap gap-2">
            {canRetry && (
              <button onClick={handleRetry} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-100">
                Retry Call
              </button>
            )}
            {canAct && (
              <>
                <button onClick={handleCancel} className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-medium hover:bg-red-100">
                  Cancel
                </button>
                <button onClick={() => setReassigning((v) => !v)} className="text-xs bg-yellow-50 text-yellow-700 px-3 py-1.5 rounded-lg font-medium hover:bg-yellow-100">
                  {reassigning ? 'Close' : 'Reassign'}
                </button>
              </>
            )}
          </div>

          {reassigning && (
            <form onSubmit={handleReassign} className="space-y-2 pt-2 border-t">
              <select
                value={reassignForm.assigned_worker_id}
                onChange={(e) => setReassignForm({ ...reassignForm, assigned_worker_id: e.target.value })}
                className="w-full border rounded-lg px-2 py-1.5 text-sm"
                required
              >
                <option value="">Select new worker</option>
                {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <input
                type="text"
                value={reassignForm.reason}
                onChange={(e) => setReassignForm({ ...reassignForm, reason: e.target.value })}
                placeholder="Reason (optional)"
                className="w-full border rounded-lg px-2 py-1.5 text-sm"
              />
              <button type="submit" className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
                Confirm Reassign
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
