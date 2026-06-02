import { useCallback } from 'react'

export default function Header({ connected, clock, authToken, onAdminToggle }) {
  const handleAdminToggle = useCallback(() => {
    onAdminToggle()
  }, [onAdminToggle])

  return (
    <header className="header">
      <div className="header-brand">
        <div>
          <div className="logo">SKYROUTE</div>
          <div className="subtitle">Flight Information Display</div>
        </div>
      </div>
      <div className="header-status">
        <div className="connection-indicator">
          <div className={`connection-dot${connected ? ' connected' : ''}`}></div>
          <span>{connected ? 'Live' : 'Disconnected'}</span>
        </div>
        <div className="clock">{clock}</div>
        <button className="admin-btn" onClick={handleAdminToggle}>
          {authToken ? 'Operations' : 'Admin'}
        </button>
      </div>
    </header>
  )
}
