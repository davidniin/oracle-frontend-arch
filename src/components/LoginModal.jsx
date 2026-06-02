import { useState, useCallback } from 'react'

export default function LoginModal({ visible, onClose, onLogin }) {
  const [email, setEmail] = useState('admin@skyroute.com')
  const [password, setPassword] = useState('admin123')
  const [errorMsg, setErrorMsg] = useState('')

  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  const handleLogin = useCallback(async () => {
    setErrorMsg('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || data.message || 'Login failed')
        return
      }

      onLogin(data)
    } catch (err) {
      setErrorMsg('Network error. Please try again.')
    }
  }, [email, password, onLogin])

  return (
    <div className={`modal-overlay${visible ? ' visible' : ''}`} onClick={handleOverlayClick}>
      <div className="modal">
        <h2>Admin Login</h2>
        <div className="error-msg" style={{ display: errorMsg ? 'block' : 'none' }}>{errorMsg}</div>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button onClick={handleLogin}>Sign In</button>
      </div>
    </div>
  )
}
