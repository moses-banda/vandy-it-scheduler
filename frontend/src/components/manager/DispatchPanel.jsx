import { useState } from 'react'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import DispatchCard from './DispatchCard'

const GROUPS = [
  {
    key:      'active',
    label:    'Active',
    statuses: ['pending', 'ringing', 'answered'],
    badge:    'bg-yellow-100 text-yellow-700',
    dot:      'bg-yellow-400',
  },
  {
    key:      'resolved',
    label:    'Resolved',
    statuses: ['accepted'],
    badge:    'bg-green-100 text-green-700',
    dot:      'bg-green-400',
  },
  {
    key:      'missed',
    label:    'Missed / Declined',
    statuses: ['missed', 'declined', 'expired'],
    badge:    'bg-red-100 text-red-700',
    dot:      'bg-red-400',
  },
  {
    key:      'cancelled',
    label:    'Cancelled',
    statuses: ['cancelled'],
    badge:    'bg-gray-100 text-gray-500',
    dot:      'bg-gray-300',
  },
]

function GroupSection({ group, dispatches, workers, buildings, onRefresh }) {
  const [open, setOpen] = useState(group.key === 'active' || group.key === 'missed')
  if (dispatches.length === 0) return null

  return (
    <div>
      {/* Group header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-2 px-1 mb-1"
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${group.dot}`} />
          <span className="text-xs font-bold uppercase tracking-widest text-gray-500">{group.label}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${group.badge}`}>{dispatches.length}</span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="bg-white border rounded-xl overflow-hidden divide-y divide-gray-100 mb-4">
          {/* Column labels */}
          <div className="grid grid-cols-[90px_128px_112px_1fr_16px] gap-3 px-4 py-1.5 bg-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            <span>Status</span>
            <span>Worker</span>
            <span>Location</span>
            <span>Issue</span>
            <span />
          </div>
          {dispatches.map((d) => (
            <DispatchCard key={d.id} dispatch={d} workers={workers} buildings={buildings} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function DispatchPanel({ dispatches, workers, buildings, onRefresh }) {
  const { user } = useAuth()
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ assigned_worker_id: '', building_id: '', title: '', issue_text: '', priority: 1 })
  const [error, setError] = useState('')

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    let dispatchId
    try {
      const res = await api.post('/dispatches', { ...form, created_by: user.id })
      dispatchId = res.data.id
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create dispatch')
      return
    }
    setCreating(false)
    setForm({ assigned_worker_id: '', building_id: '', title: '', issue_text: '', priority: 1 })
    onRefresh()
    try { await api.post(`/dispatches/${dispatchId}/ring`); onRefresh() }
    catch (err) { console.error('Ring failed:', err) }
  }

  const total = dispatches.length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Dispatches</h2>
          {total > 0 && (
            <span className="bg-gray-100 text-gray-500 text-xs font-bold px-2.5 py-1 rounded-full">{total} today</span>
          )}
        </div>
        <button
          onClick={() => setCreating(!creating)}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          {creating ? 'Cancel' : 'New Dispatch'}
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="bg-white border rounded-xl p-5 mb-5">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{error}</div>}
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Worker</label>
                <select value={form.assigned_worker_id} onChange={(e) => setForm({ ...form, assigned_worker_id: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" required>
                  <option value="">Select worker</option>
                  {workers?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Location</label>
                <select value={form.building_id} onChange={(e) => setForm({ ...form, building_id: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" required>
                  <option value="">Select building</option>
                  {buildings?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Projector down" className="w-full border rounded-lg px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Issue Description</label>
              <textarea value={form.issue_text} onChange={(e) => setForm({ ...form, issue_text: e.target.value })} placeholder="Describe the issue..." className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} required />
            </div>
            <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium">
              Create &amp; Ring Worker
            </button>
          </form>
        </div>
      )}

      {/* Grouped sections */}
      {total === 0 ? (
        <div className="text-center text-gray-400 py-12 text-sm">No dispatches today.</div>
      ) : (
        <div className="space-y-1">
          {GROUPS.map((group) => (
            <GroupSection
              key={group.key}
              group={group}
              dispatches={dispatches.filter((d) => group.statuses.includes(d.status))}
              workers={workers}
              buildings={buildings}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  )
}
