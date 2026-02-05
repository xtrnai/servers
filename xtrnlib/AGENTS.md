# XTRN Server Library (xtrnlib)

TypeScript framework for building XTRN tool servers. Hono-based HTTP server with Zod v4 validation.

## Architecture

### Header-Based Auth (Current)

User config and OAuth tokens are passed via HTTP headers, NOT in the request body.

```
X-XTRN-Config: base64(JSON.stringify({ timezone: "PST", maxResults: 100 }))
X-XTRN-Token: base64("refresh-token-string")
```

Request body contains ONLY tool parameters.

### Context Structure

```typescript
ctx.req      // Pure tool params (validated against tool schema)
ctx.config   // User config from X-XTRN-Config header
ctx.token    // { refresh_token: string } from X-XTRN-Token header (OAuth servers only)
ctx.oauth    // OAuth config: client_id, client_secret, token_url, callback_url (OAuth servers only)
ctx.res      // Response helpers: json(), text(), error(), unauthorized(), badRequestArgs()
```

## Server Types

| Type | Config | OAuth | `ctx.config` | `ctx.token` | `ctx.oauth` |
|------|--------|-------|--------------|-------------|-------------|
| OPEN | - | - | `{}` | N/A | N/A |
| Config only | ✓ | - | typed object | N/A | N/A |
| OAuth only | - | ✓ | `{}` | available | available |
| Config + OAuth | ✓ | ✓ | typed object | available | available |

## Usage

### 1. OPEN Server (No Config, No OAuth)

```typescript
import { XTRNServer, defineConfig } from "xtrn-server";
import { z } from "zod";

const server = new XTRNServer({
  name: "my-server",
  version: "1.0.0",
  config: defineConfig({}),
});

server.registerTool({
  name: "search",
  description: "Search for items",
  schema: z.object({
    query: z.string(),
    limit: z.number().optional(),
  }),
  handler: (ctx) => {
    // ctx.req.query - string
    // ctx.req.limit - number | undefined
    // ctx.config - {} (empty)
    // ctx.token - DOES NOT EXIST (TypeScript error if accessed)
    // ctx.oauth - DOES NOT EXIST (TypeScript error if accessed)
    return ctx.res.json({ results: [] });
  },
});

server.run();
```

### 2. Config-Only Server

```typescript
const server = new XTRNServer({
  name: "config-server",
  version: "1.0.0",
  config: defineConfig({
    userConfig: [
      { key: "timezone", type: "string" },
      { key: "maxResults", type: "number" },
      { key: "debugMode", type: "boolean" },
    ],
  }),
});

server.registerTool({
  name: "fetch",
  description: "Fetch data",
  schema: z.object({ id: z.string() }),
  handler: (ctx) => {
    // ctx.config.timezone - string
    // ctx.config.maxResults - number
    // ctx.config.debugMode - boolean
    // ctx.token - DOES NOT EXIST
    return ctx.res.json({ id: ctx.req.id, tz: ctx.config.timezone });
  },
});
```

### 3. OAuth-Only Server

```typescript
import { type OAuthConfig } from "xtrn-server";
import oauthJson from "./oauth.json";

const oauthConfig = oauthJson as OAuthConfig;

const server = new XTRNServer({
  name: "oauth-server",
  version: "1.0.0",
  config: defineConfig({
    oauthConfig,
  }),
});

server.registerTool({
  name: "get-data",
  description: "Get user data",
  schema: z.object({ resourceId: z.string() }),
  handler: async (ctx) => {
    // ctx.token.refresh_token - string
    // ctx.oauth.client_id - string
    // ctx.oauth.client_secret - string
    // ctx.oauth.token_url - string
    // ctx.oauth.callback_url - string
    
    const accessToken = await refreshAccessToken(
      ctx.token.refresh_token,
      ctx.oauth.client_id,
      ctx.oauth.client_secret,
      ctx.oauth.token_url
    );
    
    return ctx.res.json({ data: "..." });
  },
});
```

### 4. Config + OAuth Server

```typescript
const server = new XTRNServer({
  name: "full-server",
  version: "1.0.0",
  config: defineConfig({
    userConfig: [
      { key: "timezone", type: "string" },
    ],
    oauthConfig,
  }),
});

server.registerTool({
  name: "calendar-event",
  description: "Create calendar event",
  schema: z.object({
    title: z.string(),
    date: z.string(),
  }),
  handler: (ctx) => {
    // ctx.req.title - string (tool param)
    // ctx.req.date - string (tool param)
    // ctx.config.timezone - string (from header)
    // ctx.token.refresh_token - string (from header)
    // ctx.oauth.client_id - string
    return ctx.res.json({ created: true });
  },
});
```

## OAuthConfig Type

```typescript
type OAuthConfig = {
  provider: string;
  client_id: string;
  client_secret: string;
  authorization_url: string;
  token_url: string;
  scopes: string[];
  callback_url: string;
};
```

When importing from JSON, cast to `OAuthConfig`:

```typescript
import { type OAuthConfig } from "xtrn-server";
import oauthJson from "./oauth.json";

const oauthConfig = oauthJson as OAuthConfig;
```

## Response Helpers

```typescript
ctx.res.json({ data: "value" })        // 200 JSON response
ctx.res.text("plain text")             // 200 text response
ctx.res.error("something failed")      // 500 error
ctx.res.unauthorized()                 // 401 unauthorized
ctx.res.badRequestArgs("invalid x")    // 400 bad request
```

## CLI Flags

### Development Mode

```bash
bun run index.ts --development
bun run index.ts -d
bun run index.ts -d --port=3000
```

Development mode:
- Uses port 1234 by default (or specified port)
- Prints server info, example curl commands, registered tools

### Production Mode (Default)

```bash
bun run index.ts
```

Production mode:
- Binds to random available port
- Prints only `http://localhost:<port>`

## Built-in Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/details` | GET | Server metadata, tools, schemas |
| `/tools/{name}` | POST | Execute a tool |
| `/wind-down` | POST | Stop accepting new requests |
| `/active-requests` | GET | Current request count |

## Validation

Validation happens in order:

1. **X-XTRN-Config header** (if server has userConfig)
   - Must be valid base64
   - Must be valid JSON
   - Must match userConfig schema

2. **X-XTRN-Token header** (if server has oauthConfig)
   - Must be valid base64
   - Must not be empty

3. **Request body**
   - Must be valid JSON
   - Must match tool schema

## Directory Structure

```
xtrnlib/
├── index.ts          # Main library source
├── test.ts           # Type validation tests (6 server variants)
├── dist/             # Built output (generated)
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

## Build & Link

```bash
# From backend/
make xtrnlib-build                                    # Build library
make xtrnlib-link SERVER=name VERSION=v1.0.0         # Link to specific server
make xtrnlib-link-all SERVER=name                    # Link to all versions
make xtrnlib-run SERVER=name VERSION=v1.0.0          # Run server
```

## Creating a New XTRN Server

1. Create directory: `xtrnservers/{name}/{version}/`
2. Create `package.json`:
   ```json
   {
     "name": "server-name",
     "scripts": { "start": "bun run index.ts" },
     "dependencies": {
       "xtrn-server": "link:../../../xtrnlib",
       "zod": "^3.25.67"
     }
   }
   ```
3. Create `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "strict": true,
       "moduleResolution": "bundler",
       "resolveJsonModule": true
     }
   }
   ```
4. Create `index.ts` with server code
5. If OAuth: create `oauth.json` with credentials
6. Run `make xtrnlib-link SERVER=name VERSION=version`
7. Run `make xtrnlib-run SERVER=name VERSION=version`
