import { useState } from 'react'
import api from '../../services/api'

export default function BuildingManager({ buildings, onRefresh }) {
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', lat: '', lng: '', address: '', radius_meters: '' })
  const [error, setError] = useState('')

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await api.post('/buildings', {
        name: form.name,
        address: form.address,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        ...(form.radius_meters !== '' && { radius_meters: parseInt(form.radius_meters, 10) }),
      })
      setForm({ name: '', lat: '', lng: '', address: '', radius_meters: '' })
      setCreating(false)
      onRefresh()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add building')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this location?")) return
    try {
      await api.delete(`/buildings/${id}`)
      onRefresh()
    } catch (err) {
      alert("Cannot delete building that has associated shifts/dispatches.")
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Location Operations</h2>
        <button
          onClick={() => setCreating(!creating)}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          {creating ? 'Cancel' : 'Add New Location'}
        </button>
      </div>

      {creating && (
        <div className="bg-white border rounded-xl p-6 mb-4">
          <h3 className="text-sm font-semibold mb-3">Register New GPS Parameter Location</h3>
          {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{error}</div>}
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Building/Room Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" required placeholder="e.g. Featheringill Hall" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Building Address / Description</label>
              <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full border rounded-lg px-3 py-2" required placeholder="e.g. 1st Floor Lobby" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Latitude</label>
                <input type="number" step="any" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} className="w-full border rounded-lg px-3 py-2" required placeholder="36.1438" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Longitude</label>
                <input type="number" step="any" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} className="w-full border rounded-lg px-3 py-2" required placeholder="-86.8027" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Geofence Radius (meters) <span className="text-gray-400 font-normal">— optional, default 75</span>
              </label>
              <input type="number" min="1" value={form.radius_meters} onChange={(e) => setForm({ ...form, radius_meters: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="60" />
            </div>
            <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
              Save Location Network Parameter
            </button>
          </form>
        </div>
      )}

      <div className="bg-white border rounded-xl divide-y overflow-hidden">
        {buildings.length === 0 ? (
          <div className="p-6 text-center text-gray-400">No active locations in network.</div>
        ) : (
          buildings.map((b) => (
            <div key={b.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">{b.name}</div>
                {b.address && <div className="text-sm text-gray-500 mt-0.5">{b.address}</div>}
                <div className="text-xs font-mono text-gray-400 tracking-widest uppercase mt-1">
                  GPS: {b.lat}, {b.lng} &middot; {b.radius_meters ?? 75}m
                </div>
              </div>
              <button onClick={() => handleDelete(b.id)} className="text-xs text-red-600 hover:bg-red-50 font-bold tracking-widest uppercase px-3 py-2 border border-red-200 rounded-lg">
                Deactivate
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
