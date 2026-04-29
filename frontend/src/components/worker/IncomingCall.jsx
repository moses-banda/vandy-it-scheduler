import { useState, useEffect, useRef } from 'react'
import api from '../../services/api'
import { useWebRTC } from '../../hooks/useWebRTC'
import { todayNashville } from '../../utils/time'

const RING_SECONDS = 30

// ── Ring tone (Web Audio API oscillator) ─────────────────────────────────────

function startRing(stopRef) {
  const play = () => {
    if (stopRef.current) return
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()

    const gain = ctx.createGain()
    gain.connect(ctx.destination)

    // Dual-tone: 440 Hz + 480 Hz — classic telephone ring
    ;[440, 480].forEach((freq) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.06)
      gain.gain.setValueAtTime(0.28, ctx.currentTime + 1.0)
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 1.2)
    })

    // 1.2 s ring → 1.3 s silence → repeat
    const t1 = setTimeout(() => ctx.close(), 1250)
    const t2 = setTimeout(() => play(), 2500)
    stopRef._cleanup = () => { clearTimeout(t1); clearTimeout(t2); ctx.close() }
  }
  play()
}

// ── Voice synthesis (used after answer) ──────────────────────────────────────

function pickBestVoice() {
  const voices = window.speechSynthesis?.getVoices() ?? []
  const priority = ['Google US English', 'Microsoft Aria', 'Microsoft Guy', 'Microsoft Zira', 'Samantha', 'Karen', 'Daniel']
  for (const name of priority) {
    const v = voices.find((v) => v.name.includes(name))
    if (v) return v
  }
  return voices.find((v) => v.lang?.startsWith('en')) ?? voices[0] ?? null
}

function speak(text) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.rate = 0.88; utter.pitch = 1.05; utter.volume = 1
  const trySpeak = () => {
    const voice = pickBestVoice()
    if (voice) utter.voice = voice
    window.speechSynthesis.speak(utter)
  }
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.addEventListener('voiceschanged', trySpeak, { once: true })
  } else {
    trySpeak()
  }
}

// ── Persist accepted dispatch summary ────────────────────────────────────────

function saveSummary(callData) {
  const today = todayNashville()
  const key = `dispatch_summaries_${today}`
  const existing = JSON.parse(localStorage.getItem(key) || '[]')
  if (!existing.find((s) => s.dispatch_id === callData.dispatch_id)) {
    existing.push({
      dispatch_id: callData.dispatch_id,
      building_name: callData.building_name,
      title: callData.title,
      message: callData.spoken_message,
      date: today,
    })
    localStorage.setItem(key, JSON.stringify(existing))
  }
}

// ── SVG icons ────────────────────────────────────────────────────────────────

function PhoneIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
    </svg>
  )
}

function PhoneOffIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M1.41 1.73L.0 3.14 6.51 9.65C5.57 11.19 5 12.93 5 14.8c0 1.14.9 2.2 2.05 2.2h3.5c.6 0 1-.4 1-1 0-1.3.2-2.5.6-3.6.1-.3 0-.7-.2-1l-2.2-2.2 1.41-1.41L1.41 1.73zM17.5 4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.2 2.2c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C13.6 21 6 13.4 6 4c0-.6.4-1 1-1h3.5z" transform="translate(-2 0)"/>
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function IncomingCall({ callData, ws, webRtcHandlerRef, onDismiss, onRefresh }) {
  const [status, setStatus]       = useState('ringing')
  const [callState, setCallState] = useState('')
  const [secsLeft, setSecsLeft]   = useState(RING_SECONDS)
  const timerRef                  = useRef(null)
  const ringStopRef               = useRef(false)

  const { startCall, handleAnswer, addIceCandidate, hangup, remoteAudioRef } = useWebRTC()

  // Cancel speech on unmount
  useEffect(() => () => window.speechSynthesis?.cancel(), [])

  // Ring tone — plays while status is 'ringing'
  useEffect(() => {
    if (status !== 'ringing') return
    ringStopRef.current = false
    startRing(ringStopRef)
    return () => {
      ringStopRef.current = true
      ringStopRef._cleanup?.()
    }
  }, [status])

  // 30-second countdown — auto-dismiss at 0
  useEffect(() => {
    if (status !== 'ringing') return
    timerRef.current = setInterval(() => {
      setSecsLeft((s) => {
        if (s <= 1) { clearInterval(timerRef.current); onDismiss(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [status, onDismiss])

  // Register WebRTC signal handler
  useEffect(() => {
    if (!webRtcHandlerRef) return
    webRtcHandlerRef.current = async (data) => {
      if (data.event === 'webrtc.answer') await handleAnswer(data.sdp)
      else if (data.event === 'webrtc.ice_candidate') await addIceCandidate(data.candidate)
    }
    return () => { if (webRtcHandlerRef) webRtcHandlerRef.current = null }
  }, [handleAnswer, addIceCandidate, webRtcHandlerRef])

  const handleAnswerCall = async () => {
    clearInterval(timerRef.current)
    ringStopRef.current = true
    ringStopRef._cleanup?.()
    try {
      await api.post(`/calls/${callData.call_id}/answer`)
      setStatus('connected')
      speak(callData.spoken_message)
      if (callData.caller_id && ws) {
        await startCall({ targetUserId: callData.caller_id, callId: callData.call_id, wsSend: ws.send, onStateChange: setCallState })
      }
    } catch (err) { console.error('Answer failed:', err) }
  }

  const handleAccept = async () => {
    try {
      await api.post(`/dispatches/${callData.dispatch_id}/accept`)
      await api.post(`/calls/${callData.call_id}/end`)
      hangup()
      saveSummary(callData)
      setStatus('responded')
      setTimeout(() => { onDismiss(); onRefresh() }, 1200)
    } catch (err) { console.error('Accept failed:', err) }
  }

  const handleDecline = async () => {
    clearInterval(timerRef.current)
    ringStopRef.current = true
    ringStopRef._cleanup?.()
    try {
      await api.post(`/dispatches/${callData.dispatch_id}/decline`)
      await api.post(`/calls/${callData.call_id}/end`)
      hangup()
      setStatus('responded')
      setTimeout(() => { onDismiss(); onRefresh() }, 1200)
    } catch (err) { console.error('Decline failed:', err) }
  }

  const isConnected = callState === 'connected'

  // ── Responded / dismissed ─────────────────────────────────────────────────
  if (status === 'responded') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-white rounded-3xl p-10 text-center shadow-2xl">
          <div className="text-5xl mb-3">👍</div>
          <p className="text-xl font-bold text-gray-800">Response Sent</p>
        </div>
      </div>
    )
  }

  // ── Ringing ───────────────────────────────────────────────────────────────
  if (status === 'ringing') {
    const circumference = 2 * Math.PI * 52
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-between pb-16 pt-20"
        style={{ background: 'linear-gradient(160deg, #0d1b2a 0%, #1b2838 50%, #0a3d62 100%)' }}
      >
        <audio ref={remoteAudioRef} autoPlay />

        {/* Top: caller info */}
        <div className="flex flex-col items-center text-center px-6">
          {/* Pulsing avatar */}
          <div className="relative mb-6">
            <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" style={{ margin: '-12px' }} />
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-900/60">
              <PhoneIcon className="w-12 h-12 text-white" />
            </div>
          </div>
          <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-2">Incoming Dispatch</p>
          <h2 className="text-white text-3xl font-bold mb-1">{callData.building_name || 'IT Support'}</h2>
          {callData.title && (
            <p className="text-blue-200/70 text-base max-w-xs leading-snug">{callData.title}</p>
          )}
        </div>

        {/* Middle: countdown ring */}
        <div className="flex flex-col items-center gap-2">
          <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
            <circle
              cx="60" cy="60" r="52" fill="none"
              stroke={secsLeft > 10 ? '#34d399' : '#f87171'}
              strokeWidth="5"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - secsLeft / RING_SECONDS)}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
            />
          </svg>
          <span className={`-mt-20 text-2xl font-bold tabular-nums ${secsLeft > 10 ? 'text-emerald-400' : 'text-red-400'}`}>
            {secsLeft}s
          </span>
        </div>

        {/* Bottom: call action buttons */}
        <div className="flex gap-20 items-end">
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={handleDecline}
              className="w-18 h-18 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 shadow-lg shadow-red-900/50 flex items-center justify-center transition-all"
              style={{ width: 72, height: 72 }}
            >
              <PhoneOffIcon className="w-8 h-8 text-white" />
            </button>
            <span className="text-white/70 text-sm font-medium">Decline</span>
          </div>

          <div className="flex flex-col items-center gap-3">
            <button
              onClick={handleAnswerCall}
              className="rounded-full bg-green-500 hover:bg-green-400 active:scale-95 shadow-lg shadow-green-900/50 flex items-center justify-center transition-all animate-pulse"
              style={{ width: 72, height: 72 }}
            >
              <PhoneIcon className="w-8 h-8 text-white" />
            </button>
            <span className="text-white/70 text-sm font-medium">Answer</span>
          </div>
        </div>
      </div>
    )
  }

  // ── Connected ─────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-between pb-16 pt-20"
      style={{ background: 'linear-gradient(160deg, #0d1b2a 0%, #1b2838 50%, #0a3d62 100%)' }}
    >
      <audio ref={remoteAudioRef} autoPlay />

      {/* Top: caller info + connection status */}
      <div className="flex flex-col items-center text-center px-6">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center shadow-lg shadow-green-900/60 mb-5">
          <PhoneIcon className="w-10 h-10 text-white" />
        </div>
        <p className="text-green-300 text-xs font-semibold uppercase tracking-widest mb-2">Dispatch Connected</p>
        <h2 className="text-white text-2xl font-bold mb-1">{callData.building_name || 'IT Support'}</h2>
        <div className="flex items-center gap-2 mt-1">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-yellow-400 animate-spin'}`} />
          <span className={`text-sm font-medium ${isConnected ? 'text-green-400' : 'text-yellow-300'}`}>
            {isConnected ? 'Live audio' : 'Connecting audio…'}
          </span>
        </div>
      </div>

      {/* Middle: dispatch message card */}
      <div className="w-full max-w-sm mx-4">
        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-5">
          <p className="text-blue-300 text-[10px] font-bold uppercase tracking-widest mb-2">Dispatch Message</p>
          <p className="text-white leading-relaxed text-sm">{callData.spoken_message || callData.title}</p>
        </div>
        <p className="text-white/50 text-xs text-center mt-3">Are you available to take this assignment?</p>
      </div>

      {/* Bottom: accept / decline */}
      <div className="flex gap-12 items-end">
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleDecline}
            className="rounded-full bg-red-500 hover:bg-red-600 active:scale-95 shadow-lg shadow-red-900/50 flex items-center justify-center transition-all"
            style={{ width: 64, height: 64 }}
          >
            <PhoneOffIcon className="w-7 h-7 text-white" />
          </button>
          <span className="text-white/70 text-sm font-medium">Decline</span>
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleAccept}
            className="rounded-full bg-green-500 hover:bg-green-400 active:scale-95 shadow-lg shadow-green-900/50 flex items-center justify-center transition-all"
            style={{ width: 64, height: 64 }}
          >
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
          </button>
          <span className="text-white/70 text-sm font-medium">Accept</span>
        </div>
      </div>
    </div>
  )
}
