# SkyRoute Airlines — Fullstack Challenge

## Scenario

SkyRoute Airlines needs a real-time flight status board for airport displays and internal operations. The system was built by an outsourced team and handed off to your company for production hardening.

The board shows live flight statuses via WebSocket, and the admin panel allows operations staff to update flight information. The system works in demo, but needs a thorough audit before going live.

Your job: **audit both the backend and frontend, identify every bug, security issue, and architectural problem.**

## Setup

```bash
npm install
npm start    # Starts server + WebSocket on port 3000
```

Open `http://localhost:3000` for the flight board.

Admin login: `admin@skyroute.com` / `admin123`

## Architecture

- **Backend**: Express.js + WebSocket (ws library) + SQLite
- **Frontend**: Vanilla JS + CSS (served statically)
- **Real-time**: WebSocket pushes flight status updates every ~10s
- **Auth**: JWT-based for admin operations

## What We Evaluate

- Full-stack security awareness
- Real-time system design (WebSocket lifecycle)
- Database transaction and connection management
- Frontend state management and error recovery
- API design consistency
- Production readiness (logging, graceful shutdown, health checks)
- Performance under failure conditions

## Deliverable

Submit a report (markdown or PDF) with:
1. Bug description (specify if backend, frontend, or integration)
2. Where it is (file + line range)
3. Why it's a problem (real-world impact)
4. Your fix (code snippet or description)
5. Severity: Critical / High / Medium / Low

**Time limit: 6 hours**
