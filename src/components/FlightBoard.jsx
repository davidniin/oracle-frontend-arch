import { useCallback } from 'react'

function formatTime(isoString) {
  if (!isoString) return '—'
  const d = new Date(isoString)
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return { time, date }
}

function formatStatus(status) {
  return status.replace('-', ' ')
}

function FlightRow({ flight, updatedId }) {
  const dep = formatTime(flight.scheduled_departure)
  const arr = formatTime(flight.scheduled_arrival)
  const isUpdated = updatedId === flight.id

  return (
    <div className={`flight-row${isUpdated ? ' updated' : ''}`} id={`row-${flight.id}`}>
      <div className="flight-number">{flight.flight_number}</div>
      <div>
        {flight.origin} <span className="airport-code">{flight.origin_code}</span>
      </div>
      <div className="gate-info">{flight.gate || '—'}</div>
      <div>
        {flight.destination} <span className="airport-code">{flight.destination_code}</span>
      </div>
      <div>{flight.terminal || '—'}</div>
      <div>
        {dep === '—' ? '—' : (
          <>{dep.time} <span style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>{dep.date}</span></>
        )}
      </div>
      <div>
        {arr === '—' ? '—' : (
          <>{arr.time} <span style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>{arr.date}</span></>
        )}
      </div>
      <div>
        <span className={`status-badge status-${flight.status}`}>{formatStatus(flight.status)}</span>
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
        {flight.aircraft ? flight.aircraft.split(' ').slice(-1)[0] : '—'}
      </div>
    </div>
  )
}

export default function FlightBoard({ flights, activeFilter, searchTerm, updatedId }) {
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

  return (
    <div className="board-container">
      <div className="board-header">
        <div>Flight</div>
        <div>Origin</div>
        <div>Gate</div>
        <div>Destination</div>
        <div>Terminal</div>
        <div>Departure</div>
        <div>Arrival</div>
        <div>Status</div>
        <div>Aircraft</div>
      </div>
      <div className="board-body" id="flightBoard">
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray)' }}>
            {flights.length === 0 ? 'Connecting to flight data...' : 'No flights match your criteria'}
          </div>
        ) : (
          filtered.map(f => (
            <FlightRow key={f.id} flight={f} updatedId={updatedId} />
          ))
        )}
      </div>
    </div>
  )
}
