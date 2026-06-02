import { useState, useCallback } from 'react'

const STATUSES = ['scheduled', 'boarding', 'departed', 'in-flight', 'landed', 'delayed', 'cancelled']

function formatStatus(status) {
  return status.replace('-', ' ')
}

function AdminFlightCard({ flight, onSave }) {
  const [status, setStatus] = useState(flight.status)
  const [gate, setGate] = useState(flight.gate || '')
  const [terminal, setTerminal] = useState(flight.terminal || '')
  const [notes, setNotes] = useState(flight.notes || '')

  const handleSave = useCallback(() => {
    onSave(flight.id, { status, gate, terminal, notes })
  }, [flight.id, status, gate, terminal, notes, onSave])

  return (
    <div className="admin-flight-card" id={`admin-${flight.id}`}>
      <div className="admin-flight-header">
        <span className="fn">{flight.flight_number}</span>
        <span className="route">{flight.origin_code} → {flight.destination_code}</span>
        <span className={`status-badge status-${flight.status}`} style={{ fontSize: '0.65rem' }}>
          {formatStatus(flight.status)}
        </span>
      </div>
      <div className="admin-controls">
        <select value={status} onChange={e => setStatus(e.target.value)}>
          {STATUSES.map(s => (
            <option key={s} value={s}>{s.replace('-', ' ')}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Gate"
          value={gate}
          onChange={e => setGate(e.target.value)}
          style={{ width: '60px' }}
        />
        <input
          type="text"
          placeholder="Terminal"
          value={terminal}
          onChange={e => setTerminal(e.target.value)}
          style={{ width: '70px' }}
        />
        <button className="save-btn" onClick={handleSave}>Update</button>
      </div>
      <div className="admin-notes">
        <textarea
          placeholder="Add operations note..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
        {flight.notes ? <div className="notes-display">{flight.notes}</div> : null}
      </div>
    </div>
  )
}

export default function AdminPanel({ open, flights, onClose, onSaveFlight }) {
  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  return (
    <div className={`admin-panel${open ? ' open' : ''}`} id="adminPanel">
      <h3>
        Operations Panel
        <button className="close-btn" onClick={handleClose}>&times;</button>
      </h3>
      <div id="adminFlightList">
        {flights.map(f => (
          <AdminFlightCard key={f.id} flight={f} onSave={onSaveFlight} />
        ))}
      </div>
    </div>
  )
}
