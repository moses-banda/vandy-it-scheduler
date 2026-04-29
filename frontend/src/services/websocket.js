const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'

export function createWebSocket(userId, onMessage, onStatusChange) {
  let ws = null
  let heartbeat = null
  let reconnectTimer = null
  let manuallyClosed = false

  function connect() {
    ws = new WebSocket(`${WS_BASE}/ws/${userId}`)

    ws.onopen = () => {
      console.log('WebSocket connected')
      if (onStatusChange) onStatusChange('connected')
      
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'heartbeat' }))
        }
      }, 25000)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessage(data)
      } catch (e) {
        console.error('WS parse error:', e)
      }
    }

    ws.onclose = () => {
      console.log('WebSocket disconnected')
      if (onStatusChange) onStatusChange('disconnected')
      clearInterval(heartbeat)
      
      if (!manuallyClosed) {
        console.log('Attempting reconnect in 3s...')
        reconnectTimer = setTimeout(connect, 3000)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
    
    return ws
  }

  const socket = connect()

  return {
    close: () => {
      manuallyClosed = true
      clearTimeout(reconnectTimer)
      clearInterval(heartbeat)
      if (ws) ws.close()
    },
    send: (data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data))
      }
    }
  }
}
