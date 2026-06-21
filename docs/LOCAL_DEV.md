# Local development notes

## Routes 404 in the browser while build, typecheck, and eval pass

Symptom: a page like `/player/5503` renders the Next "This page could not be
found" page, or an API route like `/api/replay` or `/api/evidence` returns 404,
even though `npm run build`, `npm run typecheck`, and `npm run eval` all pass and
the data is present in the database.

Root cause: a stale or corrupted `.next` cache on a long running dev server. The
dev server (`next dev`) and the production build (`next build`) share the same
`.next` directory. Running `npm run build` while a `npm run dev` server is still
live clobbers the running server's route manifests, and the dev server then 404s
the newest or recently changed routes until it is restarted with a clean cache.
A dev server that has been running across several route additions can drift into
the same state on its own.

This is not a code bug and not missing data. On a clean dev server every route
serves correctly:

```
GET  /player/5503                          200
GET  /team/779                             200
GET  /api/replay?clip=cv:football_tennis   200
POST /api/evidence                         200
POST /api/ask                              200
```

### Fix

Stop the dev server, clear the cache, and restart:

```
# stop any running dev server first, then
Remove-Item -Recurse -Force .next   # PowerShell  (or: rm -rf .next)
npm run dev
```

### Avoid it

- Do not run `npm run build` against this checkout while a `npm run dev` server
  is live on it. Stop the dev server first, or build a separate copy.
- Verify new routes by loading them over HTTP (curl or the browser) and reading
  the dev server log, not only by building and running the eval. The eval calls
  the grounded pipeline directly, not over HTTP, so it cannot catch a routing or
  dev cache problem.
