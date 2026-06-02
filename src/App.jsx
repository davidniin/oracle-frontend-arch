import { useState, useEffect, useRef, useCallback } from 'react'
import Header from './components/Header.jsx'
import Toolbar from './components/Toolbar.jsx'
import FlightBoard from './components/FlightBoard.jsx'
import LoginModal from './components/LoginModal.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import Toast from './components/Toast.jsx'

export default function App() {
  // ─── State ────────────────────────────────────────────────────────────────
  const [flights, setFlights] = useState([])
  const [authToken, setAuthToken] = useState(localStorage.getItem('skyroute_token'))
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem('skyroute_refresh'))
  const [currentUser, setCurrentUser] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [connected, setConnected] = useState(false)
  const [clock, setClock] = useState('--:--:--')
  const [loginModalVisible, setLoginModalVisible] = useState(false)
  const [adminPanelOpen, setAdminPanelOpen] = useState(false)
  const [toast, setToast] = useState({ message: '', visible: false, isError: false })
  const [updatedId, setUpdatedId] = useState(null)

  const wsRef = useRef(null)
  const authTokenRef = useRef(authToken)
  const refreshTokenRef = useRef(refreshToken)
  const isRefreshingRef = useRef(isRefreshing)
  const flightsRef = useRef(flights)

  // Keep refs in sync with state
  authTokenRef.current = authToken
  refreshTokenRef.current = refreshToken
  isRefreshingRef.current = isRefreshing
  flightsRef.current = flights

  // ─── Clock ──────────────────────────────────────────────────────────────
  useEffect(() => {
    // BUG: no cleanup returned — intentional memory leak
    setInterval(() => {
      const now = new Date()
      setClock(now.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }))
    }, 1000)
    const now = new Date()
    setClock(now.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }))
  }, []) // BUG: empty deps, interval never cleaned up

  // ─── WebSocket ──────────────────────────────────────────────────────────
  useEffect(() => {
    // Connect directly to Express WS server (not through Vite proxy)
    const ws = new WebSocket('ws://localhost:3300')
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[WS] Connected')
      setConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.type === 'FLIGHT_LIST') {
          setFlights(msg.data)
        }

        if (msg.type === 'FLIGHT_UPDATE') {
          setFlights(prev => {
            const idx = prev.findIndex(f => f.id === msg.data.id)
            if (idx !== -1) {
              const next = [...prev]
              next[idx] = msg.data
              return next
            } else {
              return [...prev, msg.data]
            }
          })
          setUpdatedId(msg.data.id)
          setTimeout(() => setUpdatedId(null), 1600)
        }
      } catch (err) {
        console.error('[WS] Parse error:', err)
      }
    }

    ws.onclose = () => {
      console.log('[WS] Disconnected')
      setConnected(false)
      setTimeout(connectWebSocketFallback, 1000)
    }

    ws.onerror = (err) => {
      console.error('[WS] Error:', err)
    }

    // BUG: no cleanup returned — this is an intentional bug to preserve
  }, []) // BUG: empty deps, never reconnects

  function connectWebSocketFallback() {
    const ws = new WebSocket('ws://localhost:3300')
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[WS] Reconnected')
      setConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'FLIGHT_LIST') {
          setFlights(msg.data)
        }
        if (msg.type === 'FLIGHT_UPDATE') {
          setFlights(prev => {
            const idx = prev.findIndex(f => f.id === msg.data.id)
            if (idx !== -1) {
              const next = [...prev]
              next[idx] = msg.data
              return next
            } else {
              return [...prev, msg.data]
            }
          })
          setUpdatedId(msg.data.id)
          setTimeout(() => setUpdatedId(null), 1600)
        }
      } catch (err) {
        console.error('[WS] Parse error:', err)
      }
    }

    ws.onclose = () => {
      setConnected(false)
      setTimeout(connectWebSocketFallback, 1000)
    }

    ws.onerror = (err) => {
      console.error('[WS] Error:', err)
    }
  }

  // ─── Computed flight count ───────────────────────────────────────────────
  function getFilteredFlights() {
    let filtered = flights
    if (activeFilter !== 'all') {
      filtered = filtered.filter(f => f.status === activeFilter)
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(f =>
        f.flight_number.toLowerCase().includes(term) ||
        f.origin.toLowerCase().includes(term) ||
        f.destination.toLowerCase().includes(term) ||
        f.origin_code.toLowerCase().includes(term) ||
        f.destination_code.toLowerCase().includes(term)
      )
    }
    return filtered
  }

  const filtered = getFilteredFlights()
  const flightCount = `${filtered.length} flight${filtered.length !== 1 ? 's' : ''}`

  // ─── Auth helpers ────────────────────────────────────────────────────────
  async function refreshAuthToken() {
    try {
      setIsRefreshing(true)
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refreshTokenRef.current })
      })

      if (!res.ok) {
        setIsRefreshing(false)
        return false
      }

      const data = await res.json()
      setAuthToken(data.token)
      authTokenRef.current = data.token
      localStorage.setItem('skyroute_token', data.token)
      setIsRefreshing(false)
      return true
    } catch (err) {
      setIsRefreshing(false)
      return false
    }
  }

  async function apiCall(url, options = {}) {
    if (!options.headers) options.headers = {}
    if (authTokenRef.current) options.headers['Authorization'] = `Bearer ${authTokenRef.current}`

    let res = await fetch(url, options)

    if (res.status === 401 && refreshTokenRef.current) {
      const refreshed = await refreshAuthToken()
      if (refreshed) {
        options.headers['Authorization'] = `Bearer ${authTokenRef.current}`
        res = await fetch(url, options)
      } else {
        logout()
        return null
      }
    }

    return res
  }

  function logout() {
    setAuthToken(null)
    setRefreshToken(null)
    setCurrentUser(null)
    authTokenRef.current = null
    refreshTokenRef.current = null
    localStorage.removeItem('skyroute_token')
    localStorage.removeItem('skyroute_refresh')
    setAdminPanelOpen(false)
    showToast('Session expired. Please login again.', true)
  }

  // ─── Toast ──────────────────────────────────────────────────────────────
  function showToast(message, isError = false) {
    setToast({ message, visible: true, isError })
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }))
    }, 3000)
  }

  // ─── Admin toggle ────────────────────────────────────────────────────────
  const handleAdminToggle = useCallback(() => {
    if (authTokenRef.current) {
      setAdminPanelOpen(true)
    } else {
      setLoginModalVisible(true)
    }
  }, [])

  // ─── Login ───────────────────────────────────────────────────────────────
  const handleLogin = useCallback((data) => {
    setAuthToken(data.token)
    setRefreshToken(data.refreshToken)
    authTokenRef.current = data.token
    refreshTokenRef.current = data.refreshToken
    localStorage.setItem('skyroute_token', data.token)
    localStorage.setItem('skyroute_refresh', data.refreshToken)
    setCurrentUser(data.user)
    setLoginModalVisible(false)
    setAdminPanelOpen(true)
  }, [])

  // ─── Save flight ─────────────────────────────────────────────────────────
  const handleSaveFlight = useCallback(async (flightId, { status, gate, terminal, notes }) => {
    const flightIdx = flightsRef.current.findIndex(f => f.id === flightId)

    // Optimistically update UI
    setFlights(prev => {
      const next = [...prev]
      next[flightIdx] = { ...next[flightIdx], status, gate, terminal, notes }
      return next
    })

    try {
      const res = await apiCall(`/api/admin/flights/${flightId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, gate, terminal, notes })
      })

      if (!res || !res.ok) {
        showToast('Failed to update flight', true)
        return
      }

      const data = await res.json()
      showToast(`${data.flight.flight_number} updated successfully`)
    } catch (err) {
      showToast('Network error updating flight', true)
    }
  }, [])

  return (
    <>
      <Header
        connected={connected}
        clock={clock}
        authToken={authToken}
        onAdminToggle={handleAdminToggle}
      />
      <Toolbar
        searchTerm={searchTerm}
        activeFilter={activeFilter}
        flightCount={flightCount}
        onSearch={setSearchTerm}
        onFilter={setActiveFilter}
      />
      <FlightBoard
        flights={flights}
        activeFilter={activeFilter}
        searchTerm={searchTerm}
        updatedId={updatedId}
      />
      <LoginModal
        visible={loginModalVisible}
        onClose={() => setLoginModalVisible(false)}
        onLogin={handleLogin}
      />
      <AdminPanel
        open={adminPanelOpen}
        flights={flights}
        onClose={() => setAdminPanelOpen(false)}
        onSaveFlight={handleSaveFlight}
      />
      <Toast
        message={toast.message}
        visible={toast.visible}
        isError={toast.isError}
      />
    </>
  )
}
