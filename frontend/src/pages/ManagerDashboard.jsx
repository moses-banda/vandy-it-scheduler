import { useState, useEffect, useCallback, useRef } from 'react'
import { todayNashville } from '../utils/time'
import { useAuth } from '../context/AuthContext'
import { createWebSocket } from '../services/websocket'
import api from '../services/api'
import Navbar from '../components/shared/Navbar'
import CoverageGrid from '../components/manager/CoverageGrid'
import DispatchPanel from '../components/manager/DispatchPanel'
import WorkerList from '../components/manager/WorkerList'
import ShiftCreator from '../components/manager/ShiftCreator'
import InviteCodesPanel from '../components/manager/InviteCodesPanel'
import BuildingManager from '../components/manager/BuildingManager'
import ActiveCall from '../components/manager/ActiveCall'

export default function ManagerDashboard() {
  const { user } = useAuth()
  const [coverage, setCoverage] = useState([])
  const [dispatches, setDispatches] = useState([])
  const [workers, setWorkers] = useState([])
  const [buildings, setBuildings] = useState([])
  const [activeTab, setActiveTab] = useState('coverage')
  const [ws, setWs] = useState(null)
  const [activeCallOffer, setActiveCallOffer] = useState(null)
  const webRtcHandlerRef = useRef(null)

  const today = todayNashville()

  const loadBuildings = useCallback(async () => {
    try {
      const res = await api.get('/buildings')
      setBuildings(res.data || [])
    } catch (err) {
      console.error('Failed to load buildings:', err)
    }
  }, [])

  const loadData = useCallback(async () => {
    try {
      const [covRes, dispRes, userRes, bldRes] = await Promise.all([
        api.get(`/dashboard/coverage?date=${today}`),
        api.get(`/dispatches?date=${today}`),
        api.get('/users'),
        api.get('/buildings'),
      ])

      setCoverage(covRes.data.slots || [])
      setDispatches(dispRes.data || [])
      setWorkers(userRes.data.filter((u) => u.role === 'worker') || [])
      setBuildings(bldRes.data || [])
    } catch (err) {
      console.error('Failed to load data:', err)
    }
  }, [today])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!user) return

    const socket = createWebSocket(user.id, (data) => {
      // Instant optimistic update — patch the affected dispatch in local state
      // immediately so the badge changes without waiting for a full reload
      if (data.event === 'dispatch.status_changed' && data.dispatch_id) {
        setDispatches((prev) =>
          prev.map((d) => d.id === data.dispatch_id ? { ...d, status: data.status } : d)
        )
      }

      // Dismiss active call UI when call ends (worker hung up)
      if (data.event === 'call.ended') {
        setActiveCallOffer(null)
      }

      // Full refresh for events that affect coverage, calls, or multiple records
      if (
        data.event === 'checkin.approved' ||
        data.event === 'checkin.missed' ||
        data.event === 'shift.auto_checkout' ||
        data.event === 'dispatch.status_changed' ||
        data.event === 'call.connected' ||
        data.event === 'call.ended'
      ) {
        loadData()
      }

      // Worker answered — show live call UI and begin WebRTC handshake
      if (data.event === 'webrtc.offer') {
        setActiveCallOffer(data)
      }

      // Forward ICE candidates to ActiveCall component
      if (data.event === 'webrtc.ice_candidate') {
        if (webRtcHandlerRef.current) webRtcHandlerRef.current(data)
      }
    })

    setWs(socket)
    return () => socket.close()
  }, [user, loadData])

  const tabs = [
    { id: 'coverage', label: 'Coverage' },
    { id: 'dispatches', label: 'Dispatches' },
    { id: 'shifts', label: 'Schedule' },
    { id: 'workers', label: 'Workers' },
    { id: 'invites', label: 'Invites' },
    { id: 'locations', label: 'Locations' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-6 flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 text-sm font-medium border-b-2 ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      {activeCallOffer && (
        <ActiveCall
          offerData={activeCallOffer}
          ws={ws}
          webRtcHandlerRef={webRtcHandlerRef}
          onClose={() => setActiveCallOffer(null)}
        />
      )}

      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'coverage' && <CoverageGrid slots={coverage} workers={workers} buildings={buildings} onRefresh={loadData} />}
        {activeTab === 'dispatches' && <DispatchPanel dispatches={dispatches} workers={workers} buildings={buildings} onRefresh={loadData} />}
        {activeTab === 'shifts' && <ShiftCreator workers={workers} buildings={buildings} onRefresh={loadData} />}
        {activeTab === 'workers' && <WorkerList workers={workers} onRefresh={loadData} />}
        {activeTab === 'invites' && <InviteCodesPanel workers={workers} />}
        {activeTab === 'locations' && <BuildingManager buildings={buildings} onRefresh={loadBuildings} />}
      </div>
    </div>
  )
}
