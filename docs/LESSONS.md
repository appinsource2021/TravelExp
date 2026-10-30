# Lessons — Travel Exp

> Problems met in this project and how they were solved. Written by whoever solved them (person or agent), right after
> solving. Before fixing an error, search here first. One entry per problem, newest at the bottom. Format:

    ## <short title> (YYYY-MM-DD, <name>)
    **Problem:** what went wrong and how it showed.
    **Cause:** why.
    **Fix / workaround:** what solved it; if it is only a workaround, say so.

## A process cannot signal another in the workspace (2026-10-29, Claude)
**Problem:** `kill` of the API from a wrapper script (trap … kill) failed with "Permission denied", even for its own child.
**Cause:** the platform's workspaces run under an AppArmor profile that does not let one process signal another.
**Fix / workaround:** no signals: `scripts/serve.mjs` starts the API as its child with a pipe on stdin, the child exits
when the pipe closes (serve ended), serve exits when the child ends; the test server's watch starts it again. Stopping
is done by the platform (the test server's Stop), not from inside.

## The test server said "running", the preview said nothing runs (2026-10-30, Claude)
**Problem:** Run the test server on the project page: the card showed "running" for a few seconds, the preview said
"Nothing is running here yet"; the watch started it again, it died again.
**Cause:** the project's `.env` holds the PostgreSQL address the import made (DATABASE_URL); `start-platform.sh` took it
as MONGO_URI because the check only asked "is it empty". `serve.mjs` came up on the port (so: running), the API died at
once on "Invalid scheme, expected mongodb://", and serve ended with it.
**Fix / workaround:** the script accepts only `mongodb://` / `mongodb+srv://` and otherwise does not start, saying what
the database is (the scheme only) and what to do: make the project's database MongoDB (`project_add_database mongodb`,
`replace=true` while the current one is empty). The real move (the data from the old server) is the open work.
