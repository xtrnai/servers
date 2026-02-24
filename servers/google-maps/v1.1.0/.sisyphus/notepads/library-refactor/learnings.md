## Session Init
- Refactoring from raw fetch() to typed libraries: @googlemaps/places, @googlemaps/routing, @googlemaps/google-maps-services-js
- CF Workers polyfills available — gRPC/google-gax expected to work
- PlacesClient({ apiKey }) confirmed from cablate reference
- RoutesClient apiKey auth uncertain — spike will validate
- Client({}) for google-maps-services-js uses key per-method in params
- google-gax archived Nov 2025 — user accepts maintenance risk
- computeRouteMatrix returns a STREAM — must collect into array
- Routes API uses DRIVE/WALK/BICYCLE/TRANSIT enums (not driving/walking/bicycling/transit)
- Existing XTRN_STATE stub and test-preload.ts infrastructure from previous plan


## Library Install Spike — Results (2026-02-23)

### Packages Installed
- `@googlemaps/places@2.3.0`
- `@googlemaps/routing@2.1.1`
- `@googlemaps/google-maps-services-js@3.4.2`

### TypeScript — `bunx tsc --noEmit`
- Passes clean before and after all 3 installs
- All 3 packages ship `.d.ts` files — no @types needed

### Import Paths (confirmed from d.ts)
```typescript
import { PlacesClient } from "@googlemaps/places";      // ✅ types ok
import { RoutesClient } from "@googlemaps/routing";     // ✅ types ok
import { Client } from "@googlemaps/google-maps-services-js"; // ✅ types ok
```

### Constructor Signatures
| Client | Constructor | Auth |
| --- | --- | --- |
| `PlacesClient` | `new PlacesClient(opts?: ClientOptions, gaxInstance?)` | `opts.apiKey?: string` (via `GoogleAuthOptions`) |
| `RoutesClient` | `new RoutesClient(opts?: ClientOptions, gaxInstance?)` | `opts.apiKey?: string` (via `GoogleAuthOptions`) |
| `Client` | `new Client({ axiosInstance?, config?, experienceId? }?)` | `key: apiKey` per-method call in params |

### CF Workers Runtime — CRITICAL BLOCKER
**`@googlemaps/places` and `@googlemaps/routing` FAIL at module load time in CF Workers.**

Error:
```
ReferenceError: __dirname is not defined
  at node_modules/google-gax/build/src/grpc.js:66
```

Root cause: `places_client.js` line 22 has a top-level `require("google-gax")` which unconditionally
loads `grpc.js` at module initialization time. The `grpc.js` uses `__dirname` which doesn't exist in
the Cloudflare Workers runtime. This happens even before the constructor is called.

The fallback approach (`new PlacesClient({fallback: true}, gaxFallback)`) won't work because the
top-level `require("google-gax")` still runs at import time — it's not lazy.

**Verdict: `@googlemaps/places` and `@googlemaps/routing` are unusable via ES module import in CF Workers.**

### CF Workers Runtime — WORKS
`@googlemaps/google-maps-services-js` works fine:
- Uses Axios (HTTP, not gRPC) — no `__dirname` dependency
- Server starts cleanly with all 6 tools visible at `http://localhost:1234`
- `bunx tsc --noEmit` exits 0

### Current state of index.ts imports
Lines 3-5 after spike:
```typescript
// @googlemaps/places and @googlemaps/routing: google-gax gRPC uses __dirname (not available in CF Workers)
// import { PlacesClient } from "@googlemaps/places";
// import { RoutesClient } from "@googlemaps/routing";
import { Client } from "@googlemaps/google-maps-services-js";
```

### Recommended Path Forward for Places API (New) + Routes API
Options:
1. **Keep using raw `fetch()` calls** — current tools already use REST endpoints with `X-Goog-Api-Key` header; this works and doesn't require gRPC libraries
2. **Dynamic import with fallback** — `const gax = await import('google-gax/build/src/fallback')` inside a handler body (not at module level); might avoid startup failure but untested
3. **Accept raw REST** — `@googlemaps/places` and `@googlemaps/routing` offer no value in CF Workers since gRPC is blocked; raw fetch is cleaner

### xtrn dev verification
- With only `Client` import active: server starts, shows 6 tools, listens on port 1234 ✅
- With `PlacesClient` + `RoutesClient` imports active: immediate crash at module load ❌

## Task 1: Remove incompatible google-gax packages (2026-02-23)

### What was done
- Removed `@googlemaps/places` and `@googlemaps/routing` from package.json via `bun remove`
- Removed 3 comment lines from index.ts (lines 3-5: the warning comment + two commented-out imports)
- `@googlemaps/google-maps-services-js` (Client) kept — Axios-based, CF Workers compatible

### Verification
- `bunx tsc --noEmit` → exit 0 ✓
- `bun test` → 12/12 pass, 0 fail ✓
- Commit: `chore(deps): remove incompatible google-gax packages`

### Key learnings
- `bun remove` updates both package.json and bun.lock atomically in one command
- The blank line left after removing lines 3-5 is fine (line 3 becomes empty, line 4 is the Client import)
- `@googlemaps/places` and `@googlemaps/routing` both pull in `google-gax` which uses `__dirname` at module load time — this crashes CF Workers before any handler runs
- `@googlemaps/google-maps-services-js` uses Axios/fetch under the hood — fully compatible with CF Workers
- The unused `Client` import does NOT cause a TypeScript error (no `noUnusedLocals` in tsconfig)
