import { useCallback } from 'react'

const FILTERS = ['all', 'scheduled', 'boarding', 'departed', 'in-flight', 'landed', 'delayed']

export default function Toolbar({ searchTerm, activeFilter, flightCount, onSearch, onFilter }) {
  const handleSearch = useCallback((e) => {
    onSearch(e.target.value)
  }, [onSearch])

  const handleFilter = useCallback((filter) => {
    onFilter(filter)
  }, [onFilter])

  return (
    <div className="toolbar">
      <input
        type="text"
        className="search-box"
        placeholder="Search flights, routes, airports..."
        value={searchTerm}
        onChange={handleSearch}
      />
      {FILTERS.map(filter => (
        <button
          key={filter}
          className={`filter-btn${activeFilter === filter ? ' active' : ''}`}
          data-filter={filter}
          onClick={() => handleFilter(filter)}
        >
          {filter}
        </button>
      ))}
      <span className="flight-count">{flightCount}</span>
    </div>
  )
}
