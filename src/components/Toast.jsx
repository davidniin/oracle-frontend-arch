export default function Toast({ message, visible, isError }) {
  return (
    <div className={`toast${visible ? ' visible' : ''}${isError ? ' error' : ''}`}>
      {message}
    </div>
  )
}
