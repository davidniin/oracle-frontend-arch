const _clr = require('colorized_terminal');
﻿const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const initSqlJs = require('sql.js');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// â”€â”€â”€ Configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PORT = process.env.PORT || 3300;
const JWT_SECRET = process.env.JWT_SECRET || 'skyroute-development-secret';
const DB_PATH = path.join(__dirname, '..', 'skyroute.db');
const TOKEN_EXPIRY = '2h';

let SQL; // sql.js module reference

// â”€â”€â”€ Express App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// â”€â”€â”€ Rate Limiter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100;

function rateLimiter(req, res, next) {
  const key = req.ip;
  const now = Date.now();

  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return next();
  }

  const entry = rateLimitMap.get(key);
  if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
    entry.count = 1;
    entry.windowStart = now;
    return next();
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ message: 'Too many requests, please try again later.' });
  }

  next();
}

app.use(rateLimiter);

// â”€â”€â”€ Database Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getDb() {
  let db;
  try {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } catch (err) {
    db = new SQL.Database();
  }
  db.run('PRAGMA journal_mode = WAL');
  return db;
}

function saveDb(db) {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function dbAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function dbGet(db, sql, params = []) {
  const rows = dbAll(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function dbRun(db, sql, params = []) {
  db.run(sql, params);
}

// â”€â”€â”€ Database Initialization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function initializeDatabase() {
  const db = getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'viewer',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS flights (
      id TEXT PRIMARY KEY,
      flight_number TEXT NOT NULL,
      airline TEXT NOT NULL,
      origin TEXT NOT NULL,
      origin_code TEXT NOT NULL,
      destination TEXT NOT NULL,
      destination_code TEXT NOT NULL,
      scheduled_departure TEXT NOT NULL,
      scheduled_arrival TEXT NOT NULL,
      status TEXT DEFAULT 'scheduled',
      gate TEXT,
      terminal TEXT,
      aircraft TEXT,
      notes TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      target TEXT,
      details TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    )
  `);

  // Seed admin user if not exists
  const existingAdmin = dbGet(db, 'SELECT id FROM users WHERE email = ?', ['admin@skyroute.com']);
  if (!existingAdmin) {
    dbRun(db, 'INSERT INTO users (id, email, password, role) VALUES (?, ?, ?, ?)',
      [uuidv4(), 'admin@skyroute.com', 'admin123', 'admin']);
  }

  // Seed flights if table is empty
  const countResult = dbGet(db, 'SELECT COUNT(*) as count FROM flights');
  if (countResult.count === 0) {
    seedFlights(db);
  }

  saveDb(db);
}

function seedFlights(db) {
  const flights = [
    { fn: 'SR-101', airline: 'SkyRoute', origin: 'New York (JFK)', oc: 'JFK', dest: 'London Heathrow', dc: 'LHR', dep: '2026-05-26T14:30:00Z', arr: '2026-05-27T02:45:00Z', status: 'boarding', gate: 'B22', terminal: '4', aircraft: 'Boeing 777-300ER' },
    { fn: 'SR-205', airline: 'SkyRoute', origin: 'London Heathrow', oc: 'LHR', dest: 'Dubai Intl', dc: 'DXB', dep: '2026-05-26T09:15:00Z', arr: '2026-05-26T19:30:00Z', status: 'in-flight', gate: 'A14', terminal: '5', aircraft: 'Airbus A380' },
    { fn: 'SR-340', airline: 'SkyRoute', origin: 'Dubai Intl', oc: 'DXB', dest: 'Singapore Changi', dc: 'SIN', dep: '2026-05-26T23:00:00Z', arr: '2026-05-27T11:15:00Z', status: 'scheduled', gate: 'C08', terminal: '3', aircraft: 'Boeing 787-9' },
    { fn: 'SR-412', airline: 'SkyRoute', origin: 'Tokyo Narita', oc: 'NRT', dest: 'Los Angeles', dc: 'LAX', dep: '2026-05-26T11:00:00Z', arr: '2026-05-26T06:30:00Z', status: 'departed', gate: 'D31', terminal: '1', aircraft: 'Boeing 777-200LR' },
    { fn: 'SR-518', airline: 'SkyRoute', origin: 'Paris CDG', oc: 'CDG', dest: 'New York (JFK)', dc: 'JFK', dep: '2026-05-26T10:45:00Z', arr: '2026-05-26T13:20:00Z', status: 'in-flight', gate: 'E12', terminal: '2E', aircraft: 'Airbus A350-900' },
    { fn: 'SR-623', airline: 'SkyRoute', origin: 'Singapore Changi', oc: 'SIN', dest: 'Sydney Kingsford', dc: 'SYD', dep: '2026-05-26T16:00:00Z', arr: '2026-05-27T02:30:00Z', status: 'scheduled', gate: 'F05', terminal: '1', aircraft: 'Airbus A330-300' },
    { fn: 'SR-707', airline: 'SkyRoute', origin: 'Los Angeles', oc: 'LAX', dest: 'Tokyo Narita', dc: 'NRT', dep: '2026-05-26T13:30:00Z', arr: '2026-05-27T17:00:00Z', status: 'boarding', gate: 'G42', terminal: 'B', aircraft: 'Boeing 787-10' },
    { fn: 'SR-815', airline: 'SkyRoute', origin: 'Frankfurt', oc: 'FRA', dest: "Chicago O'Hare", dc: 'ORD', dep: '2026-05-26T08:00:00Z', arr: '2026-05-26T11:15:00Z', status: 'departed', gate: 'A03', terminal: '1', aircraft: 'Airbus A340-600' },
    { fn: 'SR-920', airline: 'SkyRoute', origin: 'Hong Kong', oc: 'HKG', dest: 'London Heathrow', dc: 'LHR', dep: '2026-05-26T23:45:00Z', arr: '2026-05-27T05:30:00Z', status: 'scheduled', gate: 'B17', terminal: '1', aircraft: 'Boeing 777-300ER' },
    { fn: 'SR-133', airline: 'SkyRoute', origin: 'Sydney Kingsford', oc: 'SYD', dest: 'Dubai Intl', dc: 'DXB', dep: '2026-05-26T07:30:00Z', arr: '2026-05-26T14:00:00Z', status: 'in-flight', gate: 'C22', terminal: '1', aircraft: 'Airbus A380' },
    { fn: 'SR-246', airline: 'SkyRoute', origin: "Chicago O'Hare", oc: 'ORD', dest: 'Frankfurt', dc: 'FRA', dep: '2026-05-26T18:00:00Z', arr: '2026-05-27T08:30:00Z', status: 'scheduled', gate: 'D15', terminal: '5', aircraft: 'Boeing 787-9' },
    { fn: 'SR-359', airline: 'SkyRoute', origin: 'Dubai Intl', oc: 'DXB', dest: 'Mumbai', dc: 'BOM', dep: '2026-05-26T14:00:00Z', arr: '2026-05-26T18:30:00Z', status: 'landed', gate: 'E08', terminal: '3', aircraft: 'Airbus A321neo' },
    { fn: 'SR-471', airline: 'SkyRoute', origin: 'Mumbai', oc: 'BOM', dest: 'Singapore Changi', dc: 'SIN', dep: '2026-05-26T20:15:00Z', arr: '2026-05-27T04:45:00Z', status: 'scheduled', gate: 'F19', terminal: '2', aircraft: 'Boeing 737 MAX 8' },
    { fn: 'SR-582', airline: 'SkyRoute', origin: 'Seoul Incheon', oc: 'ICN', dest: 'Paris CDG', dc: 'CDG', dep: '2026-05-26T10:00:00Z', arr: '2026-05-26T15:30:00Z', status: 'departed', gate: 'A28', terminal: '2', aircraft: 'Airbus A350-1000' },
    { fn: 'SR-694', airline: 'SkyRoute', origin: 'Toronto Pearson', oc: 'YYZ', dest: 'London Heathrow', dc: 'LHR', dep: '2026-05-26T21:00:00Z', arr: '2026-05-27T09:15:00Z', status: 'scheduled', gate: 'B05', terminal: '1', aircraft: 'Boeing 787-9' },
    { fn: 'SR-756', airline: 'SkyRoute', origin: 'London Heathrow', oc: 'LHR', dest: 'Hong Kong', dc: 'HKG', dep: '2026-05-26T12:30:00Z', arr: '2026-05-27T06:45:00Z', status: 'in-flight', gate: 'C34', terminal: '5', aircraft: 'Airbus A380' },
    { fn: 'SR-889', airline: 'SkyRoute', origin: 'San Francisco', oc: 'SFO', dest: 'Seoul Incheon', dc: 'ICN', dep: '2026-05-26T01:00:00Z', arr: '2026-05-27T05:30:00Z', status: 'delayed', gate: 'D09', terminal: 'I', aircraft: 'Boeing 777-200LR' },
    { fn: 'SR-931', airline: 'SkyRoute', origin: 'Amsterdam Schiphol', oc: 'AMS', dest: 'Toronto Pearson', dc: 'YYZ', dep: '2026-05-26T15:45:00Z', arr: '2026-05-26T18:30:00Z', status: 'boarding', gate: 'E21', terminal: '3', aircraft: 'Airbus A330-200' },
  ];

  const sql = `INSERT INTO flights (id, flight_number, airline, origin, origin_code, destination, destination_code,
    scheduled_departure, scheduled_arrival, status, gate, terminal, aircraft)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  for (const f of flights) {
    dbRun(db, sql, [uuidv4(), f.fn, f.airline, f.origin, f.oc, f.dest, f.dc, f.dep, f.arr, f.status, f.gate, f.terminal, f.aircraft]);
  }
}

// â”€â”€â”€ Auth Middleware â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

// â”€â”€â”€ Auth Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ errors: ['Email and password are required'] });
  }

  const db = getDb();
  const user = dbGet(db, 'SELECT * FROM users WHERE email = ? AND password = ?', [email, password]);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  const refreshToken = jwt.sign(
    { id: user.id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    refreshToken,
    user: { id: user.id, email: user.email, role: user.role }
  });
});

app.post('/api/auth/refresh', (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const db = getDb();
    const user = dbGet(db, 'SELECT * FROM users WHERE id = ?', [decoded.id]);

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    const newToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.json({ token: newToken });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// â”€â”€â”€ Flight Routes (Public) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/flights', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');

  const db = getDb();
  const { status, search } = req.query;

  let query = 'SELECT * FROM flights';
  const params = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  if (search) {
    query += (status ? ' AND' : ' WHERE') + ' (flight_number LIKE ? OR origin LIKE ? OR destination LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  query += ' ORDER BY scheduled_departure ASC';

  const flights = dbAll(db, query, params);

  res.json({ flights, timestamp: new Date().toISOString() });
});

app.get('/api/flights/:id', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');

  const db = getDb();
  const flight = dbGet(db, 'SELECT * FROM flights WHERE id = ?', [req.params.id]);

  if (!flight) {
    return res.status(404).json({ error: 'Flight not found' });
  }

  res.json({ flight });
});

// â”€â”€â”€ Admin Flight Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.put('/api/admin/flights/:id', authenticate, requireAdmin, (req, res) => {
  const { status, gate, terminal, notes } = req.body;

  const db = getDb();
  const flight = dbGet(db, 'SELECT * FROM flights WHERE id = ?', [req.params.id]);

  if (!flight) {
    return res.status(404).json({ error: 'Flight not found' });
  }

  dbRun(db, `
    UPDATE flights SET
      status = COALESCE(?, status),
      gate = COALESCE(?, gate),
      terminal = COALESCE(?, terminal),
      notes = COALESCE(?, notes),
      updated_at = datetime('now')
    WHERE id = ?
  `, [status || null, gate || null, terminal || null, notes || null, req.params.id]);

  // Log the action
  dbRun(db, 'INSERT INTO audit_log (id, user_id, action, target, details) VALUES (?, ?, ?, ?, ?)',
    [uuidv4(), req.user.id, 'update_flight', req.params.id, JSON.stringify({ status, gate, terminal, notes })]);

  const updated = dbGet(db, 'SELECT * FROM flights WHERE id = ?', [req.params.id]);
  saveDb(db);

  // Broadcast update to all connected WebSocket clients
  broadcastFlightUpdate(updated);

  res.json({ flight: updated });
});

app.put('/api/admin/flights/batch', authenticate, requireAdmin, (req, res) => {
  const { updates } = req.body; // array of { id, status, gate, terminal }

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ errors: ['Updates array is required'] });
  }

  const db = getDb();
  const results = [];

  for (const update of updates) {
    try {
      dbRun(db, `
        UPDATE flights SET
          status = COALESCE(?, status),
          gate = COALESCE(?, gate),
          terminal = COALESCE(?, terminal),
          updated_at = datetime('now')
        WHERE id = ?
      `, [update.status || null, update.gate || null, update.terminal || null, update.id]);

      const updated = dbGet(db, 'SELECT * FROM flights WHERE id = ?', [update.id]);
      results.push({ id: update.id, success: true, flight: updated });
      broadcastFlightUpdate(updated);
    } catch (err) {
      results.push({ id: update.id, success: false, error: err.message });
    }
  }

  saveDb(db);
  res.json({ results });
});

app.get('/api/admin/flights/search', authenticate, requireAdmin, (req, res) => {
  const { q, field } = req.query;

  if (!q || !field) {
    return res.status(400).json({ error: 'Query and field parameters required' });
  }

  const db = getDb();
  const query = `SELECT * FROM flights WHERE ${field} LIKE '%${q}%' ORDER BY scheduled_departure ASC`;

  try {
    const stmt = db.prepare(query);
    const flights = [];
    while (stmt.step()) {
      flights.push(stmt.getAsObject());
    }
    stmt.free();
    res.json({ flights });
  } catch (err) {
    return res.status(500).json({ error: 'Search failed', details: err.message });
  }
});

app.get('/api/admin/audit-log', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  const logs = dbAll(db, 'SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 100');
  res.json({ logs });
});

// â”€â”€â”€ Health Check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// â”€â”€â”€ HTTP Server + WebSocket â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  console.log(`[WS] New client connected from ${req.socket.remoteAddress}`);

  // Send current flight list on connect
  const db = getDb();
  const flights = dbAll(db, 'SELECT * FROM flights ORDER BY scheduled_departure ASC');

  ws.send(JSON.stringify({ type: 'FLIGHT_LIST', data: flights, timestamp: new Date().toISOString() }));

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message);

      // Handle client messages (e.g., subscribe to specific flight)
      if (parsed.type === 'SUBSCRIBE_FLIGHT') {
        ws.subscribedFlight = parsed.flightId;
      }
    } catch (err) {
      // ignore malformed messages
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
  });

  ws.on('error', (err) => {
    console.error('[WS] Client error:', err.message);
  });
});

function broadcastFlightUpdate(flight) {
  const message = JSON.stringify({
    type: 'FLIGHT_UPDATE',
    data: flight,
    timestamp: new Date().toISOString()
  });

  wss.clients.forEach((client) => {
    client.send(message);
  });
}

// â”€â”€â”€ Background Flight Simulator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STATUS_TRANSITIONS = {
  'scheduled': 'boarding',
  'boarding': 'departed',
  'departed': 'in-flight',
  'in-flight': 'landed',
};

function simulateFlightUpdates() {
  const db = getDb();
  const activeFlights = dbAll(db,
    "SELECT * FROM flights WHERE status IN ('scheduled', 'boarding', 'departed', 'in-flight')");

  if (activeFlights.length === 0) {
    return;
  }

  // Pick a random flight to update
  const flight = activeFlights[Math.floor(Math.random() * activeFlights.length)];
  const newStatus = STATUS_TRANSITIONS[flight.status];

  if (newStatus) {
    dbRun(db, "UPDATE flights SET status = ?, updated_at = datetime('now') WHERE id = ?", [newStatus, flight.id]);
    const updated = dbGet(db, 'SELECT * FROM flights WHERE id = ?', [flight.id]);
    saveDb(db);

    console.log(`[SIM] Flight ${flight.flight_number}: ${flight.status} -> ${newStatus}`);
    broadcastFlightUpdate(updated);
  }
}

// Run simulator every 10 seconds
setInterval(simulateFlightUpdates, 10000);

// â”€â”€â”€ Start Server â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function start() {
  SQL = await initSqlJs();
  initializeDatabase();

  server.listen(PORT, () => {
    console.log("Server running on port " + PORT);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
