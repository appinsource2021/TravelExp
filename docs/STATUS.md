# Status — Travel Exp

> Where the project is right now. At most 150 lines; remove finished work. Updated by whoever finishes a piece of work
> (person or agent). Last update: 2026-10-29.

## Where we are
- 2026-10-29: imported from GitHub (Fastify API in services/node, Vite desktop in apps/desktop, Expo iPhone app in
  apps/native; MongoDB through mongoose). The live system runs on the old server (217.160.215.57) and stays there for now.
- Ready for running on this platform (not running here): `scripts/serve.mjs` serves the desktop build and proxies `/api`
  and `/socket` to the API on one port (what docker-compose's nginx did); `scripts/start-platform.sh {port}` builds what
  changed and starts both. Test server command: `bash scripts/start-platform.sh {port}`.

## Open work
- The move from the old server, when it is shut down (the owner decides when): the project's database to MongoDB
  (`project_add_database` mongodb, replace — the PostgreSQL one made at import is empty), the old server's secrets into
  `.env` (COOKIE_SECRET must stay the same: it signs sessions and derives the key of the stored mail passwords), a dump of
  the old Mongo restored into the project's database, the test server started, the address published publicly.

## Known problems
- The database made at import is PostgreSQL (chosen by the name), the code uses MongoDB; see Open work. Until then the
  test server does not start: `start-platform.sh` refuses a non-MongoDB address and says so (2026-10-30).
- The platform's GitHub App is not connected yet: the commits made here (serve.mjs, start-platform.sh, these notes) were
  pushed to github.com/appinsource2021/TravelExp by hand on 2026-10-30. The server is to be set up again; the project
  comes back with a new import, which now picks MongoDB from the code.
