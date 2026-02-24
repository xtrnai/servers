## Session Init
- XTRN framework runs on Cloudflare Workers — NO Node.js SDKs, only raw fetch()
- requiredEnv pattern: `defineConfig({ requiredEnv: ["GOOGLE_MAPS_API_KEY"] as const })` → `ctx.env.GOOGLE_MAPS_API_KEY`
- Places API (New v1) requires X-Goog-Api-Key header + X-Goog-FieldMask header on EVERY request
- Legacy APIs (Geocoding, Distance Matrix, Directions) use key= query parameter
- search_nearby uses `includedTypes` array, NOT `keyword` string (New API)
- search_nearby center must be lat/lng coordinates, NOT addresses
- Field mask for search endpoints uses `places.` prefix; Details endpoint does NOT
- `server.fetch(request, env)` is the testing hook — env passed as 2nd arg
- Two error formats: New API `{ error: { code, status, message } }`, Legacy `{ status: "REQUEST_DENIED" }`
- Server setup: `defineConfig({ requiredEnv: ["GOOGLE_MAPS_API_KEY"] as const })` — `as const` required for TypeScript to type `ctx.env` correctly
- `.dev.vars` is the local dev env file (Cloudflare Workers convention) — not committed to git
- Commented-out scaffold code removed; `import { z } from "zod"` kept for future tool registrations

## Task 2: Tool Implementation

- All 6 `server.registerTool()` calls added directly in `index.ts`, no helpers or separate files
- Places API (New v1) tools use `POST` with `X-Goog-Api-Key` + `X-Goog-FieldMask` headers
- `search_places` and `search_nearby` share same field mask with `places.` prefix
- `get_place_details` uses `GET` on `/v1/places/{placeId}` — field mask has NO `places.` prefix
- Legacy REST (geocode, distance matrix, directions) use `GET` with `key=` query param and check `data.status !== "OK"`
- `maps_directions` builds URL incrementally for time params (arrivalTime wins, then departureTime, default departure_time=now)
- `search_nearby` conditionally includes `includedTypes` only when provided
- `search_places` conditionally includes `locationBias` only when provided
- TypeScript compiles clean with `as any` on fetch response bodies (no type imports needed)
- `bunx tsc --noEmit` exits 0, `grep -c 'registerTool' index.ts` returns 6


## Task 3: Unit Testing with bun test

### Runtime Detection Shim
`@xtrn/server` uses a `k1(ctx)` helper to get env bindings based on runtime:
- Bun runtime → reads `process.env` (ignores `server.fetch(req, env)` second arg)
- Workerd runtime → reads `c.env` (the Hono context env, which IS our second arg)

Fix: Override `navigator.userAgent` to `"Cloudflare-Workers"` in preload so the runtime detector picks workerd mode, making `c.env` be used.

### XTRN_STATE Stub Interface
The server requires `env.XTRN_STATE` (Cloudflare Durable Object namespace). Required interface:
```ts
{
  idFromName: (name: string) => id,
  get: (id: any) => {
    tryAcquire: async () => ({ allowed: true, activeRequests: 1 }),
    release: async () => 0,
    windDown: async () => ({ activeRequests: 0 }),
    getState: async () => ({}),
    reset: async () => {},
  }
}
```

### cloudflare:workers Module
Must be mocked via bunfig.toml preload (mock.module in preload file, not in test file itself — mock.module does NOT reliably hoist for transitive deps at the preload level was needed).

### Files Created
- `index.test.ts` — 12 tests (2 per tool × 6 tools), 72 expect() calls
- `test-preload.ts` — stubs `cloudflare:workers` + sets navigator.userAgent
- `bunfig.toml` — `[test] preload = ["./test-preload.ts"]`
