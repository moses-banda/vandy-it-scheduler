import { useRef, useCallback } from 'react'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export function useWebRTC() {
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteAudioRef = useRef(null)

  function buildPC(targetUserId, callId, wsSend, onStateChange) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        wsSend({
          event: 'webrtc.ice_candidate',
          target_user_id: targetUserId,
          call_id: callId,
          candidate,
        })
      }
    }

    pc.ontrack = ({ streams }) => {
      if (remoteAudioRef.current && streams[0]) {
        remoteAudioRef.current.srcObject = streams[0]
      }
    }

    if (onStateChange) {
      pc.onconnectionstatechange = () => onStateChange(pc.connectionState)
    }

    pcRef.current = pc
    return pc
  }

  // Worker side: create offer and send to manager
  const startCall = useCallback(async ({ targetUserId, callId, wsSend, onStateChange }) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream

      const pc = buildPC(targetUserId, callId, wsSend, onStateChange)
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      wsSend({ event: 'webrtc.offer', target_user_id: targetUserId, call_id: callId, sdp: offer })
    } catch (err) {
      console.error('startCall failed:', err)
    }
  }, [])

  // Manager side: receive offer and send answer
  const answerCall = useCallback(async ({ fromUserId, callId, sdp, wsSend, onStateChange }) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream

      const pc = buildPC(fromUserId, callId, wsSend, onStateChange)
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      wsSend({ event: 'webrtc.answer', target_user_id: fromUserId, call_id: callId, sdp: answer })
    } catch (err) {
      console.error('answerCall failed:', err)
    }
  }, [])

  // Worker side: receive manager's answer
  const handleAnswer = useCallback(async (sdp) => {
    try {
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp))
      }
    } catch (err) {
      console.error('handleAnswer failed:', err)
    }
  }, [])

  const addIceCandidate = useCallback(async (candidate) => {
    try {
      if (pcRef.current) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate))
      }
    } catch (err) {
      console.error('ICE candidate error:', err)
    }
  }, [])

  const hangup = useCallback(() => {
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
  }, [])

  return { startCall, answerCall, handleAnswer, addIceCandidate, hangup, remoteAudioRef }
}
