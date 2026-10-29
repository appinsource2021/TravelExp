# Decisions — Travel Exp

> Why things are the way they are: one entry per decision, what was decided and why, what was rejected. Newest at the bottom.

## 2026-10-29 — Project created
Database: PostgreSQL 17. Reason: Eine Reisekosten-App verwaltet relationale Daten wie Mitarbeiter, Reisen, Belege und Abrechnungen mit Berichten.

## 2026-10-29 — On the platform: one port, no nginx, no compose
The test server runs one command on one port; `scripts/serve.mjs` takes over what docker-compose's nginx did (static
desktop build with SPA fallback, `/api` and `/socket` with WebSocket to the API). Nothing is installed on the server
itself; the public address is the project's preview. docker-compose stays for the old server until the move.
