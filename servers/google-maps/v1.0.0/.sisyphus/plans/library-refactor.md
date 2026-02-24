# Google Maps XTRN Server — Library Refactor (Updated)

## TL;DR

> **Quick Summary**: Refactor all 6 Google Maps tools from raw `fetch()` calls to typed `@googlemaps/google-maps-services-js` (Client). Remove incompatible `@googlemaps/places` and `@googlemaps/routing` packages.
> 
> **Deliverables**:
> - Updated `index.ts` — All 6 tools refactored to use `Client` typed methods
> - Updated `index.test.ts` — Tests rewritten to mock `Client` methods
> - Cleaned `package.json` — Removed incompatible packages
> - No changes to tool names, schemas, or external response shapes
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves + final verification
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → F1-F4

---

## Context

### Original Request
Refactor the existing Google Maps XTRN server from raw `fetch()` against Google REST APIs to use official typed TypeScript client libraries.

### Investigation Summary
**Key Finding**: `@googlemaps/places` and `@googlemaps/routing` are **fundamentally incompatible** with Cloudflare Workers. They depend on `google-gax` (gRPC transport) which requires both `__dirname` (via `nodejs_compat_v2`) and `node:fs` (via `nodejs_compat`). These flags are **mutually exclusive** in wrangler — confirmed with both xtrn dev and plain wrangler dev.

**Solution**: `@googlemaps/google-maps-services-js` works perfectly on CF Workers (Axios-based, no gRPC). It covers all 6 tools with fully typed methods:
- `client.textSearch()` — search_places
- `client.placesNearby()` — search_nearby
- `client.placeDetails()` — get_place_details
- `client.geocode()` — maps_geocode
- `client.distancematrix()` — maps_distance_matrix
- `client.directions()` — maps_directions

### API Surface Change
The 3 Places tools switch from **Places API New** (current) to **Legacy Places API**:
- Both APIs are fully functional and supported by Google
- Response field names differ (e.g., `displayName.text` → `name`, `location.latitude` → `geometry.location.lat`)
- Our handlers map library responses to identical output shapes — no breaking changes for consumers

---

## Work Objectives

### Core Objective
Replace raw `fetch()` calls in all 6 tool handlers with typed `Client` methods from `@googlemaps/google-maps-services-js`, preserving identical external response shapes.

### Concrete Deliverables
- `index.ts` — Refactored with `Client` instance and 6 rewritten handlers
- `index.test.ts` — Tests rewritten to mock `Client` methods
- `package.json` — `@googlemaps/places` and `@googlemaps/routing` removed
- Working `xtrn dev` with all 6 tools returning same response shapes

### Definition of Done
- [ ] `bunx tsc --noEmit` exits 0
- [ ] `bun test` exits 0
- [ ] `grep -c 'registerTool' index.ts` returns exactly 6
- [ ] `xtrn dev` starts without error
- [ ] All 6 tools respond with same shapes as current implementation
- [ ] No raw `fetch()` calls for Google APIs remain in index.ts
- [ ] `@googlemaps/places` and `@googlemaps/routing` not in package.json

### Must Have
- `@googlemaps/google-maps-services-js` Client for all 6 tools
- API key passed per-method: `{ params: { key: ctx.env.GOOGLE_MAPS_API_KEY, ... } }`
- Same response shapes as current implementation (map Legacy API fields)
- Same Zod schemas (tool input contracts unchanged)
- Error handling: Axios errors → `ctx.res.error()` (note: Axios throws on non-2xx)
- Same tool names unchanged

### Must NOT Have (Guardrails)
- NO raw `fetch()` for Google APIs (the whole point of the refactor)
- NO changes to tool names or Zod schemas
- NO changes to response shapes (breaking change for consumers)
- NO additional tools beyond the 6
- NO separate service classes or helper files — stay in single `index.ts`
- NO `console.log` / `console.error`
- NO removing existing guardrails (ToolTags, language/region params, etc.)
- NO `@googlemaps/places` or `@googlemaps/routing` imports (they don't work on CF Workers)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (bun test, already set up)
- **Automated tests**: YES (tests-after — rewrite existing tests)
- **Framework**: bun test
- **Approach**: Mock `Client.prototype` methods, verify response shapes match current

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — sequential dependency):
└── Task 1: Remove incompatible packages, verify Client works [quick]

Wave 2 (Implementation — single task):
└── Task 2: Refactor all 6 tool handlers to use Client [unspecified-high]
    (depends: Task 1)

Wave 3 (Verification — parallel):
├── Task 3: Rewrite unit tests for Client-based implementation [unspecified-high]
│   (depends: Task 2)
└── Task 4: Live integration QA against running dev server [unspecified-high]
    (depends: Task 2)

Wave FINAL (Verification — 4 parallel):
├── F1: Plan compliance audit [oracle]
├── F2: Code quality review [unspecified-high]
├── F3: Real manual QA [unspecified-high]
└── F4: Scope fidelity check [deep]

Critical Path: Task 1 → Task 2 → Task 3 → F1-F4
Parallel Speedup: Tasks 3 & 4 run in parallel
Max Concurrent: 4 (Final wave)
```

### Dependency Matrix

| Task | Depends On | Blocks       | Wave  |
|------|-----------|--------------|-------|
| 1    | —         | 2            | 1     |
| 2    | 1         | 3, 4         | 2     |
| 3    | 2         | F1-F4        | 3     |
| 4    | 2         | F1-F4        | 3     |
| F1-4 | 3, 4      | —            | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `quick`
- **Wave 2**: 1 task — T2 → `unspecified-high`
- **Wave 3**: 2 tasks — T3 → `unspecified-high`, T4 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Remove Incompatible Packages and Verify Client

  **What to do**:
  - Run `bun remove @googlemaps/places @googlemaps/routing` to remove incompatible packages
  - Verify `bunx tsc --noEmit` still passes
  - Verify `bun test` still passes (existing 12 tests)
  - Remove the comment about places/routing being incompatible from index.ts (lines 3-5)
  - Ensure only `import { Client } from '@googlemaps/google-maps-services-js'` remains
  - Run `xtrn dev` to verify server starts cleanly

  **Must NOT do**:
  - Do NOT refactor any tool handlers yet
  - Do NOT modify existing tool implementations
  - Do NOT add any new imports

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `index.ts:1-6` — Current imports (lines 3-5 are the commented-out PlacesClient/RoutesClient imports to remove)
  - `package.json:11-14` — Current dependencies including the 3 @googlemaps packages
  - `index.test.ts` — Existing 12 tests that must still pass after package removal

  **Acceptance Criteria**:
  - [ ] `@googlemaps/places` and `@googlemaps/routing` not in `package.json`
  - [ ] No comment about places/routing in `index.ts`
  - [ ] `bunx tsc --noEmit` exits 0
  - [ ] `bun test` exits 0 (12 tests pass)
  - [ ] `xtrn dev` starts without error

  **QA Scenarios**:
  ```
  Scenario: Packages removed cleanly
    Tool: Bash
    Steps:
      1. `grep 'places\|routing' package.json` — expect no matches
      2. `bunx tsc --noEmit` — exits 0
      3. `bun test` — 12 tests pass
    Expected Result: Clean removal, no broken imports
    Evidence: .sisyphus/evidence/task-1-cleanup.txt
  ```

  **Commit**: YES — `chore(deps): remove incompatible google-gax packages`

- [ ] 2. Refactor All 6 Tool Handlers to Use Client Methods

  **What to do**:
  Initialize a `Client` instance and rewrite each handler to use typed methods.

  **Client initialization** (at top level or inside handlers):
  ```typescript
  const mapsClient = new Client({});
  // API key passed per-method in params: { params: { key: ctx.env.GOOGLE_MAPS_API_KEY, ... } }
  ```

  **Tool 1: search_places** — use `mapsClient.textSearch()`
  - Request: `{ params: { query: ctx.req.textQuery, key, ...(locationBias ? { location: `${lat},${lng}`, radius } : {}) } }`
  - Response: `response.data.results[]` → map each to same shape:
    - `result.place_id` → `id`
    - `result.name` → `name`
    - `result.formatted_address` → `address`
    - `result.geometry.location.lat/lng` → `location.lat/lng`
    - `result.types` → `types`
    - `result.rating` → `rating`
    - `result.user_ratings_total` → `userRatingCount`
    - `result.price_level` → `priceLevel`
  - NOTE: Legacy textSearch uses `query` param (not `textQuery`), `location` as `"lat,lng"` string (not structured object), and no `maxResultCount` — results are naturally limited to 20

  **Tool 2: search_nearby** — use `mapsClient.placesNearby()`
  - Request: `{ params: { location: `${lat},${lng}`, radius, type: includedTypes?.[0], key } }`
  - NOTE: Legacy nearby uses `type` (singular string, not array). If `includedTypes` has multiple values, use the first one. If empty, omit `type`.
  - Response mapping same as Tool 1 (same Place object shape)

  **Tool 3: get_place_details** — use `mapsClient.placeDetails()`
  - Request: `{ params: { place_id: ctx.req.placeId, key, fields: 'place_id,name,formatted_address,geometry,types,rating,user_ratings_total,price_level,opening_hours,formatted_phone_number,international_phone_number,website,reviews,editorial_summary,photos' } }`
  - Response: `response.data.result` (single Place) → map to same shape:
    - `result.place_id` → `id`
    - `result.name` → `name`
    - `result.formatted_address` → `address`
    - `result.geometry.location.lat/lng` → `location.lat/lng`
    - `result.types` → `types`
    - `result.rating` → `rating`
    - `result.user_ratings_total` → `userRatingCount`
    - `result.price_level` → `priceLevel`
    - `result.formatted_phone_number || result.international_phone_number` → `phone`
    - `result.website` → `website`
    - `result.opening_hours?.open_now` → `openingHours.openNow`
    - `result.opening_hours?.weekday_text` → `openingHours.weekdayDescriptions`
    - `result.reviews[]` → map: `{ rating, text: r.text, authorName: r.author_name, publishTime: r.time }`
    - `result.editorial_summary?.overview` → `editorialSummary`

  **Tool 4: maps_geocode** — use `mapsClient.geocode()`
  - Request: `{ params: { address: ctx.req.address, key } }`
  - Response: `response.data.results[0]` → map:
    - `result.geometry.location.lat/lng` → `location.lat/lng`
    - `result.formatted_address` → `formattedAddress`
    - `result.place_id` → `placeId`
  - This is the SAME API as current (Legacy Geocoding) — response shape should be identical

  **Tool 5: maps_distance_matrix** — use `mapsClient.distancematrix()`
  - Request: `{ params: { origins: ctx.req.origins, destinations: ctx.req.destinations, mode: ctx.req.mode as TravelMode, key } }`
  - Response: `response.data` → map:
    - `data.origin_addresses` → `originAddresses`
    - `data.destination_addresses` → `destinationAddresses`
    - `data.rows` → `rows`
  - This is the SAME API as current (Legacy Distance Matrix) — response shape should be identical

  **Tool 6: maps_directions** — use `mapsClient.directions()`
  - Request: `{ params: { origin: ctx.req.origin, destination: ctx.req.destination, mode: ctx.req.mode as TravelMode, departure_time, arrival_time, key } }`
  - Handle departure/arrival time logic same as current: `"now"` → `"now"`, ISO string → `new Date(str).getTime() / 1000`
  - Response: `response.data.routes[0].legs[0]` → map:
    - `route.summary` → `summary`
    - `leg.distance` → `distance`
    - `leg.duration` → `duration`
    - `leg.start_address` → `startAddress`
    - `leg.end_address` → `endAddress`
    - `leg.steps[]` → map: `{ instruction: step.html_instructions.replace(/<[^>]*>/g, ''), distance, duration, travelMode: step.travel_mode }`
  - This is the SAME API as current (Legacy Directions) — response shape should be identical

  **Error handling for ALL tools**:
  ```typescript
  try {
    // Axios throws on non-2xx responses
    const response = await mapsClient.methodName({ params: { ... } });
    // Check Google's status field (some APIs return 200 with error status)
    if (response.data.status !== 'OK' && response.data.status !== undefined) {
      return ctx.res.error(response.data.error_message || response.data.status);
    }
    // Map and return
  } catch (e: any) {
    // Axios error: e.response?.data?.error_message or e.message
    return ctx.res.error(e?.response?.data?.error_message || e?.message || 'Unknown error');
  }
  ```

  **Must NOT do**:
  - Do NOT change tool names or Zod schemas
  - Do NOT change response shapes — map library responses to match current exactly
  - Do NOT add helper functions/service classes
  - Do NOT use raw fetch() for any Google API call
  - Do NOT import TravelMode enum if it complicates things — use string literal `ctx.req.mode as any` if needed

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (solo)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: Task 1

  **References**:
  - `index.ts` — Current implementation with all 6 handlers. READ CAREFULLY to understand exact response shapes that MUST be preserved.
  - `node_modules/@googlemaps/google-maps-services-js/dist/client.d.ts` — Client class method signatures
  - `node_modules/@googlemaps/google-maps-services-js/dist/common.d.ts` — Shared types (Place, LatLng, TravelMode, etc.)
  - `node_modules/@googlemaps/google-maps-services-js/dist/places/textsearch.d.ts` — TextSearchRequest type
  - `node_modules/@googlemaps/google-maps-services-js/dist/places/placesnearby.d.ts` — PlacesNearbyRequest type
  - `node_modules/@googlemaps/google-maps-services-js/dist/places/details.d.ts` — PlaceDetailsRequest type
  - `node_modules/@googlemaps/google-maps-services-js/dist/geocode/geocode.d.ts` — GeocodeRequest type
  - `node_modules/@googlemaps/google-maps-services-js/dist/distance.d.ts` — DistanceMatrixRequest type
  - `node_modules/@googlemaps/google-maps-services-js/dist/directions.d.ts` — DirectionsRequest type
  - cablate `toolclass.ts` — Reference implementation using Client: https://github.com/cablate/mcp-google-map/blob/main/src/services/toolclass.ts

  **Acceptance Criteria**:
  - [ ] 6 registerTool calls remain
  - [ ] `bunx tsc --noEmit` exits 0
  - [ ] No raw `fetch()` to Google APIs in index.ts
  - [ ] `Client` from google-maps-services-js used for all 6 tools
  - [ ] Response shapes match current implementation exactly
  - [ ] Zod schemas unchanged

  **QA Scenarios**:
  ```
  Scenario: Refactored code compiles and uses Client
    Tool: Bash
    Steps:
      1. `bunx tsc --noEmit` — exits 0
      2. `grep -c 'registerTool' index.ts` — expect 6
      3. `grep 'googleapis.com\|places.googleapis' index.ts` — expect 0 (no raw API URLs)
      4. `grep -c 'mapsClient\.' index.ts` — expect >= 6 (at least one Client call per tool)
    Expected Result: TypeScript compiles, Client used throughout, no raw URLs
    Evidence: .sisyphus/evidence/task-2-refactor-validation.txt
  ```

  **Commit**: YES — `refactor(tools): replace raw fetch with typed Client methods`

- [ ] 3. Rewrite Unit Tests for Client-Based Implementation

  **What to do**:
  Rewrite `index.test.ts` to mock `Client.prototype` methods instead of `globalThis.fetch`.

  **Mocking approach**:
  ```typescript
  import { Client } from '@googlemaps/google-maps-services-js';
  // Mock each method on Client.prototype:
  // - Client.prototype.textSearch
  // - Client.prototype.placesNearby
  // - Client.prototype.placeDetails
  // - Client.prototype.geocode
  // - Client.prototype.distancematrix
  // - Client.prototype.directions
  ```

  **Tests per tool** (minimum 2 each — 12 total minimum):
  1. Happy path: Mock Client method returning success → verify response shape matches expected
  2. Error path: Mock Client method throwing Axios error → verify error response

  **Mock data should match Legacy API response shapes:**
  - Places: `{ data: { results: [{ place_id, name, formatted_address, geometry: { location: { lat, lng } }, types, rating, user_ratings_total, price_level }], status: 'OK' } }`
  - Geocode: `{ data: { results: [{ geometry: { location: { lat, lng } }, formatted_address, place_id }], status: 'OK' } }`
  - Directions: `{ data: { routes: [{ summary, legs: [{ distance, duration, start_address, end_address, steps: [...] }] }], status: 'OK' } }`
  - Distance Matrix: `{ data: { origin_addresses, destination_addresses, rows, status: 'OK' } }`
  - Place Details: `{ data: { result: { place_id, name, ... }, status: 'OK' } }`

  **Must NOT do**:
  - Do NOT mock globalThis.fetch (library handles its own transport)
  - Do NOT require a real API key
  - Do NOT make real network requests

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Task 2

  **References**:
  - `index.ts` — Refactored implementation (read to understand which methods to mock)
  - `index.test.ts` — Current test file (read structure, then rewrite)
  - `test-preload.ts` and `bunfig.toml` — Existing test infrastructure
  - `node_modules/@googlemaps/google-maps-services-js/dist/common.d.ts` — Response types for mock data

  **Acceptance Criteria**:
  - [ ] `bun test` exits 0
  - [ ] 12+ tests (2 per tool minimum)
  - [ ] No globalThis.fetch mocking
  - [ ] No real API calls
  - [ ] Mock data matches Legacy API response structures

  **QA Scenarios**:
  ```
  Scenario: All tests pass with Client mocks
    Tool: Bash
    Steps:
      1. `bun test` — all pass
      2. `grep -c 'describe' index.test.ts` — expect 6 (one per tool)
      3. `grep 'globalThis.fetch' index.test.ts` — expect 0
    Expected Result: 12+ tests pass, 0 failures, no fetch mocking
    Evidence: .sisyphus/evidence/task-3-tests.txt
  ```

  **Commit**: YES — `test(tools): rewrite tests for Client-based implementations`

- [ ] 4. Live Integration QA Against Running Dev Server

  **What to do**:
  Start `xtrn dev`, then test each of the 6 tools with curl. Verify response shapes match the original implementation.

  **Test commands** (same as original QA):
  1. `GET /details` — verify 6 tools listed
  2. `search_places` — pizza near Times Square
  3. `search_nearby` — restaurants near SF (lat/lng: 37.7749,-122.4194)
  4. `get_place_details` — Joe's Pizza place ID (ChIJifBbyYBZwokRp6m4GR0GYyI or similar)
  5. `maps_geocode` — 1600 Amphitheatre Parkway
  6. `maps_distance_matrix` — NY to Boston, driving
  7. `maps_directions` — SF to LA, driving

  **Response shape comparison**: For each tool, verify the response has the same top-level keys and nested structure as the original. Note: the actual DATA may differ slightly (Legacy vs New API), but STRUCTURE must match.

  **Error cases**: Call with missing params, invalid place ID — should return appropriate error.

  **Must NOT do**:
  - Do NOT modify any source code during QA

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Task 2

  **Acceptance Criteria**:
  - [ ] `xtrn dev` starts
  - [ ] All 6 tools respond (200 or valid Google error)
  - [ ] Response shapes match original (same keys, same nesting)
  - [ ] Error cases return appropriate errors

  **QA Scenarios**:
  ```
  Scenario: All 6 tools respond with correct shapes
    Tool: Bash
    Steps:
      1. Start `xtrn dev &`
      2. `curl localhost:1234/details` — 6 tools listed
      3. Test each tool with curl (see test commands above)
      4. Verify each response has correct top-level keys
    Expected Result: All tools respond, shapes match
    Evidence: .sisyphus/evidence/task-4-live-qa.txt

  Scenario: Error handling works
    Tool: Bash
    Steps:
      1. Call get_place_details with invalid place ID
      2. Call maps_geocode with empty address
    Expected Result: Error responses returned (not crashes)
    Evidence: .sisyphus/evidence/task-4-error-handling.txt
  ```

  **Commit**: NO (no code changes)

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns (especially raw `fetch()` to Google APIs, `@googlemaps/places` imports). Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bunx tsc --noEmit` + `bun test`. Review index.ts for: proper Client initialization, correct method calls, Axios error handling, all Zod `.describe()`, all 6 registerTool calls. Check for AI slop. Verify no raw `fetch()` remains for Google APIs. Verify `@googlemaps/places` and `@googlemaps/routing` not in package.json.
  Output: `TypeCheck [PASS/FAIL] | Tests [N pass/N fail] | Tools [6/6] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start `xtrn dev`, execute curl calls against each of the 6 tools. Compare response shapes to the original implementation. Test error cases (missing params, invalid place ID).
  Output: `Tools [N/6 pass] | Response Shape Match [N/6] | Error Handling [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each of the 6 tools: verify schema unchanged, response shape matches original, handler uses Client method (not fetch). Check no extra tools/files/exports. Flag any unplanned additions or response shape changes.
  Output: `Tools [N/6 compliant] | Schema Changes [CLEAN/N issues] | Response Changes [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **After Task 1**: `chore(deps): remove incompatible google-gax packages`
- **After Task 2**: `refactor(tools): replace raw fetch with typed Client methods`
- **After Task 3**: `test(tools): rewrite tests for Client-based implementations`

---

## Success Criteria

### Verification Commands
```bash
bunx tsc --noEmit           # Expected: exits 0
bun test                    # Expected: all tests pass
grep -c 'registerTool' index.ts  # Expected: 6
grep 'googleapis.com\|places.googleapis' index.ts  # Expected: no raw API URLs
xtrn dev &                  # Expected: server starts
curl http://localhost:1234/details  # Expected: JSON with 6 tools
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] TypeScript compiles
- [ ] All tests pass
- [ ] All 6 tools respond with same shapes as before
- [ ] Error handling works for invalid inputs
- [ ] No raw `fetch()` for Google APIs in index.ts
- [ ] `@googlemaps/places` and `@googlemaps/routing` removed from package.json
