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

