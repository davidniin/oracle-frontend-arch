# SkyRoute Airlines — Audit Report

---

## C-01 · SQL Injection in flight search
**Severity:** Critical | **Type:** Backend | **File:** `src/server.js:393`

The `field` query param is interpolated directly into the SQL string with no validation.

```js
// VULNERABLE
const query = `SELECT * FROM flights WHERE ${field} LIKE '%${q}%'`;
```

An attacker can dump the entire `users` table or modify any record via `field`.

**Fix:** whitelist allowed columns, keep `q` as a prepared statement param.

```js
const ALLOWED_FIELDS = ['flight_number', 'origin', 'origin_code', 'destination', 'destination_code', 'scheduled_departure', 'scheduled_arrival', 'status', 'gate', 'terminal', 'aircraft', 'notes'];

if (!ALLOWED_FIELDS.includes(field)) {
  return res.status(400).json({ error: 'Invalid search field' });
}

const flights = dbAll(db, `SELECT * FROM flights WHERE ${field} LIKE ?`, [`%${q}%`]);
```
---

## C-02 · Batch route unreachable (route shadowing)
**Severity:** Critical | **Type:** Backend | **File:** `src/server.js:319, 352`

`PUT /:id` is registered before `PUT /batch`. Express matches `"batch"` as an ID — the batch endpoint is dead code.

```js
app.put('/api/admin/flights/:id', ...)     // line 319 — shadows everything
app.put('/api/admin/flights/batch', ...)   // line 352 — never reached
```

Bulk flight updates are completely broken.

**Fix:** register static routes before dynamic ones.

```js
app.put('/api/admin/flights/batch', authenticate, requireAdmin, ...)  // first
app.put('/api/admin/flights/:id',   authenticate, requireAdmin, ...)  // second
```

---

## C-03 · Passwords stored in plaintext
**Severity:** Critical | **Type:** Backend | **File:** `src/server.js:143, 219`

Passwords are inserted and compared as plain strings.

```js
// Seed
dbRun(db, '...VALUES (?, ?, ?, ?)', [uuidv4(), 'admin@skyroute.com', 'admin123', 'admin']);

// Login
dbGet(db, 'SELECT * FROM users WHERE email = ? AND password = ?', [email, password]);
```

Anyone with read access to `skyroute.db` has every password instantly.

**Fix:** hash with `bcrypt` on write, compare on login.

```js
const bcrypt = require('bcrypt');

// Seed
const hash = await bcrypt.hash('admin123', 12);
dbRun(db, '...VALUES (?, ?, ?, ?)', [uuidv4(), 'admin@skyroute.com', hash, 'admin']);

// Login
const user = dbGet(db, 'SELECT * FROM users WHERE email = ?', [email]);
if (!user || !(await bcrypt.compare(password, user.password))) {
  return res.status(401).json({ error: 'Invalid credentials' });
}
```

---

## C-04 · Hardcoded JWT secret
**Severity:** Critical | **Type:** Backend | **File:** `src/server.js:13`

The JWT secret falls back to a hardcoded string if the env var is not set.

```js
const JWT_SECRET = process.env.JWT_SECRET || 'skyroute-development-secret';
```

Since the secret is in the source code, anyone can mint a valid admin token without credentials.

```js
jwt.sign({ id: 'x', email: 'x', role: 'admin' }, 'skyroute-development-secret')
// → valid admin token, no login required
```

**Fix**: Require the env var at startup. If it's not set, the server will crash.

```js
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET env var is not set');
  process.exit(1);
}
```

---

## C-05 · JWT tokens stored in localStorage
**Severity:** Critical | **Type:** Frontend | **File:** `src/App.jsx:12-13, 251-252`

Both the access token and the long-lived refresh token are written directly to localStorage.

```js
const [authToken, setAuthToken] = useState(localStorage.getItem('skyroute_token'))
const [refreshToken, setRefreshToken] = useState(localStorage.getItem('skyroute_refresh'))

// ...on login:
localStorage.setItem('skyroute_token', data.token)
localStorage.setItem('skyroute_refresh', data.refreshToken)
```

localStorage is readable by any JavaScript on the page. A single XSS injection — in a flight note, a gate field, or a third-party script — lets an attacker silently exfiltrate both tokens. The refresh token is valid for 7 days, giving persistent access long after the session ends.

**Fix:** Fix: Store tokens in HttpOnly; Secure; cookies set by the server. The browser sends them automatically and JavaScript cannot read them.

```js
// server.js — set cookie on login, never return the token in the body
res.cookie('token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 2 * 60 * 60 * 1000
})
```

And in frontend delete all the lines that have relation with `localStorage` token storage. In all the calls to `api` the `config` header is set with the token adding : `credentials: include` in the request.


---

## H-01 · Infinite WebSocket reconnection loop - no backoff and no limit.
**Severity:** High | **Type:** Frontend | **File:** `src/App.jsx:90-93, 137-140`

When the WebSocket closes, both the initial effect and the fallback function schedule an immediate retry after exactly 1 second, unconditionally and forever.

```js
ws.onclose = () => {
  setConnected(false)
  setTimeout(connectWebSocketFallback, 1000) //  without llimit, infinite loop.
}
```

If the server goes down, every browser tab opens a new TCP connection every second indefintely. With a typical airport deployment of miniumum of 20 display screens, this will cause a huge number of TCP connections per second to be opened and closed hitting a server that is already struggling.

**Fix**: Use exponential backoff and a limit of 10 retries. Cancel the timer on cleanup.
```js 
useEffect(() => {
  let attempt = 0
  let timeoutId = null

  function connect() {
    const ws = new WebSocket('ws://localhost:3300/ws')
    wsRef.current = ws
    ws.onopen = () => {
      console.log('[WS] Connected')
      setConnected(true)
    }
    
    ws.onmessage = handleMessage // same code as before
    ws.onerror = (err) => console.error('[WS] Error:', err)
    ws.onclose = () => {
      setConnected(false)
      if (attempt >= 10) return          // stop after 10 tries
      const delay = Math.min(1000 * 2 ** attempt, 30000)  // 1s, 2s, 4s … 30s
      attempt++
      timeoutId = setTimeout(connect, delay)
    }
  }
  connect()
  
  return () => {
    timeoutId && clearTimeout(timeoutId)
    wsRef.current?.close()
  }
}, [])
```


---


## H-02 · setInterval clock timer never cleared — guaranteed memory leak
**Severity:** High | **Type:** Frontend | **File:** `src/App.jsx:38-50`

The `useEffect` that drives the clcokc start at setInterval, but returns no cleanup function, so the interval is never cancelled.

```js
useEffect(() => {
  setClock(now.toLocaleTimeString(...))
}, []) // BUG: empty deps, never reconnects
```

The problem is caused by the <Strictmode> in the 'src/main.jsx', because in developemtn intntionally mounts and unmounts every component twice to surface the bug. Without cleanup heree, 2 intervals are created on the first render and both are firing `setClock` every second idefinitely.

**Fix**: store the interval id and cancel it in cleanup function.

```js
useEffect(() => {
  const tick = () => setClock(now.toLocaleTimeString(...))

  tick()
  const id = setInterval(tick, 1000)

  return () => clearInterval(id)
}, [])
```

---


## H-03 · WebSocket never closed on unmount - Zombie connections
**Severity:** High | **Type:** Frontend | **File:** `src/App.jsx:53-101`

The `useEffect` that opens the webSocktnet connection return no cleanup function. When component unmounts, the connection never close correctly. When React unmounts App ( on hot reload during development) the browser does not automatically close the connection. close the WebSocket. the connection is linked as a zombie, holdingh thje slot on the server. 

With the actual code, the `onclose` handler fires on unmount and immediately shedules `connectWebSocketFallback` which open a second connection before the first one is closed.

**Fix**: close the Websocket in the cleanup function and guard the `onclose` handler against intentional closes.

```js
useEffect(() => {
  let cancelled = false

  const ws = new WebSocket('ws://localhost:3300/ws')
  wsRef.current = ws

  ws.onopen = () => setConnected(true)
  ws.onmessage = handleMessage
  ws.onerror = (err) => console.error('[WS] Error:', err)
  ws.onclose = () => {
    setConnected(false)
    if (!cancelled) scheduleReconnect()  // only reconnect if not a deliberate close
  }

  return () => {
    cancelled = true
    ws.close()
  }
}, [])
```

---

## H-04 · Login modal pre-filled with admin credentials
**Severity:** High | **Type:** Frontend | **File:** `src/components/LoginModal.jsx:4-5`

The login modal initialises its email and password fields with the real admin credentials hardcoded as default state values.

```js
const [email, setEmail] = useState('admin@skyroute.com')
const [password, setPassword] = useState('admin123')
```

This causes two separate problems. First, any user who clicks the Admin button sees the credentials already typed in. Second, the credentials are embedded in the JavaScript bundle served publicly, so anyone who opens DevTools has them regardless of whether they ever open the modal.

**Fix**: initialise both fields as empty strings. If convenience during development is needed, use an environment variable that is stripped in production builds.

```js
const [email, setEmail] = useState('')
const [password, setPassword] = useState('')

// For development convenience only — never ships to production
const [email, setEmail] = useState(import.meta.env.DEV ? import.meta.env.VITE_ADMIN_EMAIL : '')
const [password, setPassword] = useState('')
```

---