# Google Maps XTRN Server

## TL;DR

> **Quick Summary**: Build a Google Maps XTRN server with 6 tools (search_places, search_nearby, get_place_details, maps_geocode, maps_distance_matrix, maps_directions) using raw `fetch()` against Google Maps REST APIs on Cloudflare Workers.
> 
> **Deliverables**:
> - `index.ts` — Env-only XTRN server with 6 registered tools
> - `index.test.ts` — Tests with mocked fetch for all 6 tools
> - `.dev.vars` — Local dev environment variables
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves + final verification
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → F1-F4

---

## Context

### Original Request
Build a Google Maps XTRN server supporting place search, nearby search, place details (including ratings), navigation with different travel modes (walking, transit, driving, bicycling), and distance/direction details. Inspired by the MCP Google Maps server (cablate/mcp-google-map).

### Interview Summary
**Key Discussions**:
- **Tool scope**: 6 tools confirmed — search_places (text search) was added to the original 5
- **API key strategy**: Env-only server using `requiredEnv: ["GOOGLE_MAPS_API_KEY"]` with `ctx.env.GOOGLE_MAPS_API_KEY`
- **File structure**: Single `index.ts` for all tools (user preference)
- **Runtime constraint**: Cloudflare Workers — must use `fetch()`, no Node.js SDKs
- **Tests**: bun test with mocked fetch (user requested)

**Research Findings**:
- MCP reference uses `@googlemaps/google-maps-services-js` + `@googlemaps/places` — incompatible with CF Workers
- Places API (New v1) requires `X-Goog-Api-Key` + `X-Goog-FieldMask` headers on EVERY request (BLOCKER if omitted → 400)
- Legacy APIs (Geocoding, Distance Matrix, Directions) use `key=` query parameter
- `search_nearby` on New API uses `includedTypes` array, NOT `keyword` string
- `search_nearby` center MUST be lat/lng coordinates, NOT addresses
- Two different error response formats: New API (`{ error: { code, status, message } }`) vs Legacy (`{ status: "REQUEST_DENIED" }`)

### Metis Review
**Identified Gaps** (addressed):
- `X-Goog-FieldMask` required on all Places API requests — hardcoded per tool
- `search_nearby` uses `includedTypes` not `keyword` — corrected in schema
- `search_nearby` center must be lat/lng only — corrected in schema
- Version string "v1.0.0" → "1.0.0" — corrected
- `as const` needed on `requiredEnv` for proper typing
- Field masks control billing tiers — hardcoded to Pro+Enterprise for details, Pro for search
- `server.fetch(req, env)` is the testing hook for unit tests

---

## Work Objectives

### Core Objective
Implement a production-ready Google Maps XTRN server with 6 tools that provide place search, place details, geocoding, distance calculation, and navigation directions via Google Maps APIs.

### Concrete Deliverables
- `index.ts` — Complete XTRN server with 6 tools, proper Zod v4 schemas, and error handling
- `index.test.ts` — Unit tests with mocked `globalThis.fetch` covering success/failure for each tool
- `.dev.vars` — Local development environment variable template

### Definition of Done
- [ ] `bunx tsc --noEmit` exits 0 (TypeScript compiles)
- [ ] `bun test` exits 0 (all tests pass)
- [ ] `grep -c 'registerTool' index.ts` returns exactly 6
- [ ] `xtrn dev` starts without error
- [ ] `GET /details` returns all 6 tools with correct schemas

### Must Have
- All 6 tools registered and functional
- `X-Goog-FieldMask` on all Places API (New) requests
- `X-Goog-Api-Key` header for Places API, `key=` param for Legacy APIs
- Travel modes: driving, walking, bicycling, transit
- Place details with: rating, reviews, opening hours, phone, website, price level
- Proper error handling for Google API failures
- `.describe()` on every Zod schema field

### Must NOT Have (Guardrails)
- NO Google Maps SDK imports (`@googlemaps/*`) — raw `fetch()` only
- NO multiple files — everything in `index.ts`, tests in `index.test.ts`
- NO `ToolTag.Mutation` or `ToolTag.Destructive` — all tools are read-only
- NO caching, retry logic, rate limiting, or AbortController
- NO tools beyond the 6 specified (no elevation, reverse geocode, place photos)
- NO user-provided field masks (hardcoded per tool to prevent billing surprises)
- NO waypoints in directions
- NO `console.log` / `console.error` — let the framework handle logging
- NO JSDoc comments on handlers
- NO separate type/constant/config files
- NO language/region/units parameters (English defaults only)
- NO helper functions like `buildUrl()`, `makeRequest()`, `formatResponse()` — handlers are self-contained

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (setting up)
- **Automated tests**: YES (tests-after)
- **Framework**: bun test (built-in, zero config)
- **Approach**: Mock `globalThis.fetch`, call tools via `server.fetch(req, env)`, verify response + mock call args

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) against running `xtrn dev` server
- **Unit Tests**: Use Bash (`bun test`) to run test suite
- **Type Check**: Use Bash (`bunx tsc --noEmit`) to verify TypeScript

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Setup — foundation):
└── Task 1: Server config + env setup [quick]

Wave 2 (Implementation — all tools):
└── Task 2: Implement all 6 tools in index.ts [deep]
    (depends: Task 1)

Wave 3 (Testing):
├── Task 3: Write tests in index.test.ts [unspecified-high]
│   (depends: Task 2)
└── Task 4: Live QA against running dev server [unspecified-high]
    (depends: Task 2)

Wave FINAL (Verification — 4 parallel):
├── F1: Plan compliance audit [oracle]
├── F2: Code quality review [unspecified-high]
├── F3: Real manual QA [unspecified-high]
└── F4: Scope fidelity check [deep]

Critical Path: Task 1 → Task 2 → Task 3 → F1-F4
Parallel Speedup: Tasks 3 & 4 run in parallel in Wave 3
Max Concurrent: 4 (Final wave)
```

### Dependency Matrix

| Task | Depends On | Blocks       | Wave |
|------|-----------|--------------|------|
| 1    | —         | 2            | 1    |
| 2    | 1         | 3, 4, F1-F4 | 2    |
| 3    | 2         | F1-F4        | 3    |
| 4    | 2         | F1-F4        | 3    |
| F1-4 | 3, 4      | —            | FINAL|

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `quick`
- **Wave 2**: 1 task — T2 → `deep`
- **Wave 3**: 2 tasks — T3 → `unspecified-high`, T4 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Server Setup and Configuration

  **What to do**:
  - Update `index.ts` server config: change `defineConfig({})` to `defineConfig({ requiredEnv: ["GOOGLE_MAPS_API_KEY"] as const })`
  - Fix version string from `"v1.0.0"` to `"1.0.0"`
  - Remove the commented-out example tool registration
  - Create `.dev.vars` file with `GOOGLE_MAPS_API_KEY=YOUR_API_KEY_HERE`
  - Run `bunx tsc --noEmit` to verify TypeScript compiles with the new config
  - Verify `xtrn dev` starts without errors

  **Must NOT do**:
  - Do NOT add any tools yet
  - Do NOT install new dependencies
  - Do NOT create additional files beyond `.dev.vars`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `index.ts:1-22` — Current scaffold to modify
  - `README.md:176-207` — Env-Only Server example showing exact `requiredEnv` pattern and `ctx.env` access

  **Acceptance Criteria**:
  - [ ] `index.ts` has `requiredEnv: ["GOOGLE_MAPS_API_KEY"] as const` in defineConfig
  - [ ] `index.ts` has version `"1.0.0"` (no `v` prefix)
  - [ ] `.dev.vars` exists with `GOOGLE_MAPS_API_KEY=YOUR_API_KEY_HERE`
  - [ ] No commented-out code in `index.ts`
  - [ ] `bunx tsc --noEmit` exits 0

  **Commit**: YES — `chore(setup): configure env-only server with Google Maps API key`

- [x] 2. Implement All 6 Google Maps Tools

  **What to do**:
  Register 6 tools in `index.ts` via `server.registerTool()`. Each tool uses `ctx.env.GOOGLE_MAPS_API_KEY` and raw `fetch()`. Three tools use the **Places API (New v1)** (POST + headers), three use **Legacy REST APIs** (GET + query params).

  **Tool 1: `search_places`** — Text-based place search
  - Endpoint: `POST https://places.googleapis.com/v1/places:searchText`
  - Headers: `Content-Type: application/json`, `X-Goog-Api-Key: {apiKey}`, `X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount,places.priceLevel`
  - Schema:
    ```
    textQuery: z.string().describe("Search query, e.g. 'pizza in New York'")
    maxResultCount: z.number().min(1).max(20).default(10).describe("Maximum number of results to return")
    locationBias (optional): z.object({
      latitude: z.number().min(-90).max(90).describe("Latitude of center point"),
      longitude: z.number().min(-180).max(180).describe("Longitude of center point"),
      radius: z.number().min(0).max(50000).default(5000).describe("Bias radius in meters")
    }).optional().describe("Optional location to bias results toward")
    ```
  - Request body: `{ textQuery, maxResultCount, locationBias: { circle: { center: { latitude, longitude }, radius } } }` (only include locationBias if provided)
  - Response: Extract from `response.places[]` → map to `{ id, name, address, location: {lat, lng}, types, rating, userRatingCount, priceLevel }`
  - Error: If response not ok, parse `error.message` and return `ctx.res.error(message)`

  **Tool 2: `search_nearby`** — Location-based nearby search
  - Endpoint: `POST https://places.googleapis.com/v1/places:searchNearby`
  - Headers: same as search_places, same field mask
  - Schema:
    ```
    latitude: z.number().min(-90).max(90).describe("Latitude of search center")
    longitude: z.number().min(-180).max(180).describe("Longitude of search center")
    radius: z.number().min(0).max(50000).default(1000).describe("Search radius in meters")
    includedTypes: z.array(z.string()).optional().describe("Place types to include, e.g. ['restaurant', 'cafe']")
    maxResultCount: z.number().min(1).max(20).default(10).describe("Maximum number of results")
    ```
  - Request body: `{ locationRestriction: { circle: { center: { latitude, longitude }, radius } }, includedTypes, maxResultCount }`
  - Response: Same mapping as search_places
  - Note: NO keyword param, NO address-as-center — lat/lng only

  **Tool 3: `get_place_details`** — Detailed place information
  - Endpoint: `GET https://places.googleapis.com/v1/places/{placeId}`
  - Headers: `X-Goog-Api-Key: {apiKey}`, `X-Goog-FieldMask: id,displayName,formattedAddress,location,types,rating,userRatingCount,priceLevel,currentOpeningHours,regularOpeningHours,nationalPhoneNumber,internationalPhoneNumber,websiteUri,reviews,editorialSummary,photos`
  - Schema:
    ```
    placeId: z.string().describe("Google Maps place ID, e.g. 'ChIJN1t_tDeuEmsRUsoyG83frY4'")
    ```
  - Note: Field mask does NOT use `places.` prefix (unlike search endpoints)
  - Response: Map to `{ id, name, address, location, types, rating, userRatingCount, priceLevel, phone, website, openingHours: { openNow, weekdayDescriptions }, reviews: [{ rating, text, authorName, publishTime }], editorialSummary }`

  **Tool 4: `maps_geocode`** — Address to coordinates
  - Endpoint: `GET https://maps.googleapis.com/maps/api/geocode/json?address={encoded}&key={apiKey}`
  - Schema:
    ```
    address: z.string().describe("Address or place name to convert to coordinates")
    ```
  - Response: Extract from `results[0]` → `{ location: { lat, lng }, formattedAddress, placeId }`
  - Error: Check `status !== "OK"` → return error with status message

  **Tool 5: `maps_distance_matrix`** — Distance and duration calculations
  - Endpoint: `GET https://maps.googleapis.com/maps/api/distancematrix/json?origins={}&destinations={}&mode={}&key={apiKey}`
  - Schema:
    ```
    origins: z.array(z.string()).describe("List of origin addresses or coordinates (e.g. ['New York, NY', '40.7128,-74.0060'])")
    destinations: z.array(z.string()).describe("List of destination addresses or coordinates")
    mode: z.enum(["driving", "walking", "bicycling", "transit"]).default("driving").describe("Travel mode")
    ```
  - Origins/destinations joined with `|` in query params
  - Response: Map to `{ originAddresses, destinationAddresses, rows: [{ elements: [{ status, distance: { text, value }, duration: { text, value } }] }] }`
  - Error: Check `status !== "OK"`

  **Tool 6: `maps_directions`** — Turn-by-turn directions
  - Endpoint: `GET https://maps.googleapis.com/maps/api/directions/json?origin={}&destination={}&mode={}&departure_time={}&key={apiKey}`
  - Schema:
    ```
    origin: z.string().describe("Starting point address or coordinates")
    destination: z.string().describe("Destination address or coordinates")
    mode: z.enum(["driving", "walking", "bicycling", "transit"]).default("driving").describe("Travel mode")
    departureTime: z.string().optional().describe("Departure time as ISO 8601 string or 'now'")
    arrivalTime: z.string().optional().describe("Arrival time as ISO 8601 string (transit mode only)")
    ```
  - Time handling: Convert ISO strings to Unix timestamps (seconds). If arrivalTime provided, use it (transit only). Otherwise use departureTime or default to "now".
  - Response: Map first route → `{ summary, distance: { text, value }, duration: { text, value }, steps: [{ instruction, distance, duration, travelMode }], departureTime, arrivalTime }`
  - Strip HTML tags from `html_instructions` in steps

  **Error handling pattern for ALL tools**:
  ```typescript
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const error = await response.json();
      return ctx.res.error(error?.error?.message || `Google API error: ${response.status}`);
    }
    const data = await response.json();
    // For legacy APIs, also check data.status !== "OK"
    return ctx.res.json(mappedResult);
  } catch (e) {
    return ctx.res.error(e instanceof Error ? e.message : "Unknown error");
  }
  ```

  **Must NOT do**:
  - Do NOT create helper functions — each handler is self-contained
  - Do NOT add type aliases for Google responses — use inline types or `any`
  - Do NOT add `console.log` or `console.error`
  - Do NOT add language/region/units parameters
  - Do NOT add ToolTag annotations (all tools are read-only)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (solo)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: Task 1

  **References**:
  - `README.md:176-207` — Env-Only Server pattern showing `ctx.env.GOOGLE_MAPS_API_KEY` access
  - `README.md:43-52` — `registerTool` pattern: name, description, schema, handler
  - `README.md:308-314` — Response helpers: `ctx.res.json()`, `ctx.res.error()`, `ctx.res.badRequestArgs()`

  **API References**:
  - Places Text Search: `POST https://places.googleapis.com/v1/places:searchText` with `X-Goog-Api-Key` + `X-Goog-FieldMask` headers
  - Places Nearby: `POST https://places.googleapis.com/v1/places:searchNearby` with same headers
  - Place Details: `GET https://places.googleapis.com/v1/places/{id}` with same headers (field mask WITHOUT `places.` prefix)
  - Geocoding: `GET https://maps.googleapis.com/maps/api/geocode/json?address=...&key=...`
  - Distance Matrix: `GET https://maps.googleapis.com/maps/api/distancematrix/json?origins=...&destinations=...&mode=...&key=...`
  - Directions: `GET https://maps.googleapis.com/maps/api/directions/json?origin=...&destination=...&mode=...&key=...`

  **Acceptance Criteria**:
  - [ ] `grep -c 'registerTool' index.ts` returns exactly 6
  - [ ] `bunx tsc --noEmit` exits 0
  - [ ] All 6 tools have `.describe()` on every Zod field
  - [ ] Places API tools send `X-Goog-Api-Key` and `X-Goog-FieldMask` headers
  - [ ] Legacy API tools send API key as `key=` query parameter
  - [ ] No `@googlemaps` imports anywhere
  - [ ] No helper/utility functions — each handler is self-contained

  **Commit**: YES — `feat(tools): implement 6 Google Maps tools`

- [x] 3. Write Unit Tests for All 6 Tools

  **What to do**:
  Create `index.test.ts` with mocked `globalThis.fetch` to test all 6 tools. Use the `server.fetch(request, env)` pattern to invoke tools programmatically.

  **Test Setup Pattern**:
  ```typescript
  import server from "./index";
  
  // Helper to call a tool
  const callTool = (name: string, body: object) =>
    server.fetch(
      new Request(`http://localhost/tools/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { GOOGLE_MAPS_API_KEY: "test-api-key" }
    );
  
  // Mock fetch before each test, restore after
  const originalFetch = globalThis.fetch;
  // In each test: globalThis.fetch = async (url, init) => new Response(JSON.stringify(mockData));
  // After each test: globalThis.fetch = originalFetch;
  ```

  **Tests per tool** (minimum 2 each):
  1. **Happy path**: Mock Google API success response → verify tool returns 200 with correct shape
  2. **Google API error**: Mock 4xx/5xx response → verify tool returns error response

  **Specific test cases**:
  - `search_places`: mock Places searchText response, verify `X-Goog-FieldMask` header sent
  - `search_nearby`: mock Places searchNearby response, verify `locationRestriction` in body
  - `get_place_details`: mock Places getPlace response, verify field mask WITHOUT `places.` prefix
  - `maps_geocode`: mock Geocoding response, verify `key=test-api-key` in URL
  - `maps_distance_matrix`: mock Distance Matrix response, verify origins joined with `|`
  - `maps_directions`: mock Directions response, verify mode param in URL

  **Must NOT do**:
  - Do NOT require a real Google Maps API key
  - Do NOT make real network requests
  - Do NOT create test utilities in separate files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Task 2

  **References**:
  - `index.ts` — The complete server with all 6 tools (read to understand schemas and response shapes)
  - `node_modules/@xtrn/server/dist/index.d.ts:109` — `fetch(request: Request, env?: Record<string, unknown>)` method signature

  **Acceptance Criteria**:
  - [ ] `index.test.ts` exists with tests for all 6 tools
  - [ ] `bun test` exits 0
  - [ ] No real API calls made (all fetch mocked)
  - [ ] Each tool has at least 2 tests (success + error)

  **Commit**: YES — `test(tools): add unit tests for all 6 Google Maps tools`

- [x] 4. Live Integration QA Against Running Dev Server

  **What to do**:
  Start `xtrn dev` with a REAL Google Maps API key in `.dev.vars`, then test each of the 6 tools with real curl requests.

  **NOTE**: If the API key is a placeholder, skip actual API calls and verify only that the server starts and tools return proper error messages for the invalid key.

  **Test each tool**:

  1. **GET /details** — verify all 6 tools listed
  2. **search_places**: `curl -s -X POST http://localhost:1234/tools/search_places -H "Content-Type: application/json" -d '{"textQuery": "pizza near Times Square", "maxResultCount": 3}'`
  3. **search_nearby**: `curl -s -X POST http://localhost:1234/tools/search_nearby -H "Content-Type: application/json" -d '{"latitude": 40.758, "longitude": -73.9855, "radius": 500, "includedTypes": ["restaurant"]}'`
  4. **get_place_details**: `curl -s -X POST http://localhost:1234/tools/get_place_details -H "Content-Type: application/json" -d '{"placeId": "ChIJN1t_tDeuEmsRUsoyG83frY4"}'`
  5. **maps_geocode**: `curl -s -X POST http://localhost:1234/tools/maps_geocode -H "Content-Type: application/json" -d '{"address": "1600 Amphitheatre Parkway, Mountain View, CA"}'`
  6. **maps_distance_matrix**: `curl -s -X POST http://localhost:1234/tools/maps_distance_matrix -H "Content-Type: application/json" -d '{"origins": ["New York, NY"], "destinations": ["Boston, MA"], "mode": "driving"}'`
  7. **maps_directions**: `curl -s -X POST http://localhost:1234/tools/maps_directions -H "Content-Type: application/json" -d '{"origin": "New York, NY", "destination": "Boston, MA", "mode": "driving"}'`

  **Error case tests**:
  - Call search_nearby without required latitude → verify 400 response
  - Call with empty body → verify 400 response

  **Must NOT do**:
  - Do NOT modify any source code

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Task 2

  **Acceptance Criteria**:
  - [ ] `xtrn dev` starts without errors
  - [ ] `GET /details` returns all 6 tools
  - [ ] All 6 tools respond to curl requests (200 or valid Google API error)
  - [ ] Error cases return appropriate error responses

  **Commit**: NO (no code changes)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bunx tsc --noEmit` + `bun test`. Review index.ts for: proper error handling, correct API endpoints/headers, all Zod fields have `.describe()`, all 6 registerTool calls. Check for AI slop.
  Output: `TypeCheck [PASS/FAIL] | Tests [N pass/N fail] | Tools [6/6] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start `xtrn dev`, execute curl calls against each of the 6 tools. Verify responses. Test error cases.
  Output: `Tools [N/6 pass] | Error Handling [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each of the 6 tools: verify schema, handler, API endpoint match plan spec. Check no extra tools/files/exports. Flag any unplanned additions.
  Output: `Tools [N/6 compliant] | Extra Code [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **After Task 1**: `chore(setup): configure env-only server with Google Maps API key`
- **After Task 2**: `feat(tools): implement 6 Google Maps tools`
- **After Task 3**: `test(tools): add unit tests for all 6 tools`

---

## Success Criteria

### Verification Commands
```bash
bunx tsc --noEmit           # Expected: exits 0, no errors
bun test                    # Expected: all tests pass
grep -c 'registerTool' index.ts  # Expected: 6
xtrn dev &                  # Expected: server starts on port 1234
curl http://localhost:1234/details  # Expected: JSON with 6 tools
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] TypeScript compiles
- [ ] All tests pass
- [ ] All 6 tools respond to curl calls
- [ ] Error handling works for invalid inputs
