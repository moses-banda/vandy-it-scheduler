import { useState, useEffect } from 'react'
import { useWebRTC } from '../../hooks/useWebRTC'
import api from '../../services/api'

function PhoneOffIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M1.41 1.73L.0 3.14l3.94 3.94C3.35 8.16 3 9.54 3 11c0 1.86.5 3.6 1.38 5.08L2.2 18.26C.84 16.38 0 14.03 0 11.5 0 5.15 5.15 0 11.5 0c2.53 0 4.88.84 6.76 2.2L16.08 3.38C14.6 2.5 12.86 2 11 2c-1.46 0-2.84.35-4.07.94L1.41 1.73zM20.5 11c0 1.46-.35 2.84-.94 4.07l1.41 1.41C22.16 14.88 23 12.53 23 10c0-4.95-3.2-9.17-7.65-10.67l-1.41 1.41C18.13 2.03 20.5 6.2 20.5 11zM6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
    </svg>
  )
}

export default function ActiveCall({ offerData, ws, webRtcHandlerRef, onClose }) {
  const [callState, setCallState] = useState('connecting')
  const [elapsed, setElapsed] = useState(0)
  const { answerCall, addIceCandidate, hangup, remoteAudioRef } = useWebRTC()

  // Answer the incoming WebRTC offer from the worker
  useEffect(() => {
    if (!offerData || !ws) return
    answerCall({
      fromUserId: offerData.from_user_id,
      callId: offerData.call_id,
      sdp: offerData.sdp,
      wsSend: ws.send,
      onStateChange: setCallState,
    })
  }, [offerData, ws, answerCall])

  // Register handler for subsequent ICE candidates from worker
  useEffect(() => {
    if (!webRtcHandlerRef) return
    webRtcHandlerRef.current = async (data) => {
      if (data.event === 'webrtc.ice_candidate') await addIceCandidate(data.candidate)
    }
    return () => { if (webRtcHandlerRef) webRtcHandlerRef.current = null }
  }, [addIceCandidate, webRtcHandlerRef])

  // Elapsed timer — starts once connected
  useEffect(() => {
    if (callState !== 'connected') return
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [callState])

  const handleHangup = async () => {
    hangup()
    if (offerData?.call_id) {
      try { await api.post(`/calls/${offerData.call_id}/end`) } catch (_) {}
    }
    onClose()
  }

  const isConnected = callState === 'connected'
  const isFailed    = callState === 'failed' || callState === 'disconnected'

  const elapsedLabel = (() => {
    const m = Math.floor(elapsed / 60)
    const s = elapsed % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  })()

  return (
    <div className="fixed bottom-6 right-6 z-50 w-76 rounded-2xl overflow-hidden shadow-2xl" style={{ width: 304 }}>
      <audio ref={remoteAudioRef} autoPlay />

      {/* Header */}
      <div
        className="px-5 pt-5 pb-4 text-center"
        style={{ background: 'linear-gradient(135deg, #0d1b2a 0%, #1b2838 100%)' }}
      >
        {/* Avatar */}
        <div className="relative mx-auto mb-3" style={{ width: 64, height: 64 }}>
          {isConnected && (
            <div className="absolute inset-0 rounded-full bg-green-500/25 animate-ping" />
          )}
          <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg ${
            isConnected ? 'bg-gradient-to-br from-green-500 to-green-700' :
            isFailed    ? 'bg-gradient-to-br from-red-600 to-red-800' :
                          'bg-gradient-to-br from-blue-600 to-blue-800'
          }`}>
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
            </svg>
          </div>
        </div>

        <p className="text-white font-semibold text-base leading-tight">Worker Connected</p>

        {/* Status line */}
        <div className="flex items-center justify-center gap-1.5 mt-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${
            isConnected ? 'bg-green-400 animate-pulse' :
            isFailed    ? 'bg-red-400' :
                          'bg-yellow-400 animate-pulse'
          }`} />
          <span className={`text-xs font-medium ${
            isConnected ? 'text-green-400' :
            isFailed    ? 'text-red-400' :
                          'text-yellow-300'
          }`}>
            {isConnected ? `Live · ${elapsedLabel}` :
             isFailed    ? 'Connection lost' :
                           'Connecting…'}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="bg-gray-900 px-5 pb-5 pt-4">
        {offerData?.building_name && (
          <p className="text-gray-400 text-xs text-center mb-4 truncate">{offerData.building_name}</p>
        )}

        <button
          onClick={handleHangup}
          className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 active:scale-95 text-white py-3 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-red-900/40"
        >
          <PhoneOffIcon className="w-4 h-4" />
          End Call
        </button>
      </div>
    </div>
  )
}
