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
