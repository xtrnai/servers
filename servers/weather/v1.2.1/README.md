# weather

An XTRN server. Built with [@xtrn/server](https://www.npmjs.com/package/@xtrn/server) on Hono + Cloudflare Workers with Zod v4 validation, OAuth 2.0 integration, and lifecycle management via Durable Objects.

## Getting Started

```bash
# Install dependencies
bun install

# Start dev server (port 1234)
xtrn dev

# Custom port
xtrn dev --port=3000
```

Then open `http://localhost:1234/details`.

## Server API

Import everything from `@xtrn/server`:

```typescript
import { XTRNServer, defineConfig, ToolTag } from "@xtrn/server";
import { z } from "zod";
```

### OPEN Server

No configuration or authentication required.

```typescript
import { XTRNServer, defineConfig } from "@xtrn/server";
import { z } from "zod";

const server = new XTRNServer({
  name: "hello-world",
  version: "1.0.0",
  config: defineConfig({}),
});

server.registerTool({
  name: "greet",
  description: "Returns a friendly greeting",
  schema: z.object({
    name: z.string().describe("Name of the person to greet"),
  }),
  handler: (ctx) => {
    return ctx.res.text(`Hello, ${ctx.req.name}!`);
  },
});

export default server;
```

### Config-Only Server

Requires users to provide configuration values (API keys, preferences).

```typescript
import { XTRNServer, defineConfig } from "@xtrn/server";
import { z } from "zod";

const server = new XTRNServer({
  name: "config-server",
  version: "1.0.0",
  config: defineConfig({
    userConfig: [
      { key: "apiKey", type: "string" },
      { key: "maxRetries", type: "number" },
      { key: "debugMode", type: "boolean" },
    ],
  }),
});

server.registerTool({
  name: "fetch-data",
  description: "Fetch data using API key",
  schema: z.object({ id: z.string() }),
  handler: (ctx) => {
    // ctx.config.apiKey — string
    // ctx.config.maxRetries — number
    // ctx.config.debugMode — boolean
    return ctx.res.json({ id: ctx.req.id, key: ctx.config.apiKey });
  },
});

export default server;
```

### OAuth-Only Server

Requires users to complete an OAuth flow. The platform provides a fresh access token directly.

```typescript
import { XTRNServer, defineConfig } from "@xtrn/server";
import { z } from "zod";

const server = new XTRNServer({
  name: "github-server",
  version: "1.0.0",
  config: defineConfig({
    oauthConfig: {
      provider: "github",
      authorization_url: "https://github.com/login/oauth/authorize",
      token_url: "https://github.com/login/oauth/access_token",
      scopes: ["repo", "user"],
    },
  }),
});

server.registerTool({
  name: "get-repos",
  description: "List user repositories",
  schema: z.object({
    sort: z.enum(["created", "updated", "pushed"]).default("updated"),
  }),
  handler: async (ctx) => {
    // ctx.accessToken — ready-to-use access token string
    const resp = await fetch("https://api.github.com/user/repos?sort=" + ctx.req.sort, {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
    });
    return ctx.res.json(await resp.json());
  },
});

export default server;
```

### Config + OAuth Server

Combines both user configuration and OAuth authentication.

```typescript
import { XTRNServer, defineConfig, ToolTag } from "@xtrn/server";
import { z } from "zod";

const server = new XTRNServer({
  name: "calendar-server",
  version: "1.0.0",
  config: defineConfig({
    userConfig: [
      { key: "timezone", type: "string" },
    ],
    oauthConfig: {
      provider: "google-calendar",
      authorization_url: "https://accounts.google.com/o/oauth2/v2/auth",
      token_url: "https://oauth2.googleapis.com/token",
      scopes: ["https://www.googleapis.com/auth/calendar"],
    },
  }),
});

server.registerTool({
  name: "list-events",
  description: "List calendar events",
  tags: [ToolTag.Mutation],
  schema: z.object({
    maxResults: z.number().default(10),
  }),
  handler: async (ctx) => {
    // ctx.config.timezone — string (from X-XTRN-Config header)
    // ctx.accessToken — string (from X-XTRN-Access-Token header)
    const resp = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      { headers: { Authorization: `Bearer ${ctx.accessToken}` } },
    );
    return ctx.res.json(await resp.json());
  },
});

export default server;
```

### Env-Only Server

Requires specific environment variables to be set by the deployer (e.g., internal API keys, base URLs).

```typescript
import { XTRNServer, defineConfig } from "@xtrn/server";
import { z } from "zod";

const server = new XTRNServer({
  name: "env-server",
  version: "1.0.0",
  config: defineConfig({
    requiredEnv: ["API_KEY", "BASE_URL"],
  }),
});

server.registerTool({
  name: "fetch",
  description: "Fetch data from internal API",
  schema: z.object({ endpoint: z.string() }),
  handler: async (ctx) => {
    // ctx.env.API_KEY — string (typed from requiredEnv)
    // ctx.env.BASE_URL — string (typed from requiredEnv)
    const response = await fetch(`${ctx.env.BASE_URL}/${ctx.req.endpoint}`, {
      headers: { Authorization: `Bearer ${ctx.env.API_KEY}` },
    });
    return ctx.res.json(await response.json());
  },
});

export default server;
```

## OAuth Configuration

```typescript
type OAuthConfig = {
  provider: string;
  authorization_url: string;
  token_url: string;
  scopes: string[];
};
```

OAuth secrets are managed via environment variables (not in code):

| Variable | Description |
|----------|-------------|
| `OAUTH_CLIENT_ID` | OAuth application client ID |
| `OAUTH_CLIENT_SECRET` | OAuth application client secret |
| `OAUTH_CALLBACK_URL` | OAuth redirect/callback URL |

Set these in a `.dev.vars` file for local development:

```env
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
OAUTH_CALLBACK_URL=http://localhost:1234/auth/callback
```

## Required Environment Variables

Server developers can declare environment variables that must be set by the deployer. Useful for internal API keys, base URLs, or other secrets that shouldn't be managed by end users.

### Declaration

```typescript
config: defineConfig({
  requiredEnv: ["API_KEY", "BASE_URL"],
})
```

### Access in Handlers

Environment variables are fully typed from the `requiredEnv` array:

```typescript
handler: async (ctx) => {
  ctx.env.API_KEY   // string
  ctx.env.BASE_URL  // string
}
```

### Local Development

Add to `.dev.vars` in your server directory:

```env
API_KEY=your-api-key
BASE_URL=https://api.example.com
```

### Validation

- `/details` returns `requiredEnv` array (no validation on this route)
- Tool calls validate all required env vars are present
- Missing vars return HTTP 500 listing which vars are missing
- Names starting with `OAUTH_` or `XTRN_` are reserved and rejected at construction

## Context Object

| Property | Type | Availability | Description |
|----------|------|--------------|-------------|
| `ctx.req` | `T` (inferred from schema) | Always | Validated tool parameters |
| `ctx.config` | `Object` (inferred from userConfig) | Always (`{}` if no userConfig) | Validated user configuration |
| `ctx.accessToken` | `string` | OAuth servers only | Access token from platform |
| `ctx.env` | `Object` (inferred from requiredEnv) | Always (`{}` if no requiredEnv) | Required environment variables |
| `ctx.res` | `XTRNResponse` | Always | Response helper methods |

## Tool Tags

```typescript
import { ToolTag } from "@xtrn/server";

server.registerTool({
  name: "delete-item",
  description: "Permanently delete an item",
  tags: [ToolTag.Mutation, ToolTag.Destructive],
  schema: z.object({ id: z.string() }),
  handler: (ctx) => {
    return ctx.res.json({ deleted: true });
  },
});
```

| Tag | Meaning |
|-----|---------|
| `ToolTag.Mutation` | Tool modifies data |
| `ToolTag.Destructive` | Tool performs an irreversible action |

## Response Helpers

```typescript
ctx.res.json({ data: "value" })        // 200 JSON
ctx.res.text("plain text")             // 200 text
ctx.res.badRequestArgs("invalid x")    // 400 Bad Request
ctx.res.unauthorized()                 // 401 Unauthorized
ctx.res.error("something failed")      // 500 Internal Server Error
```

## Built-in Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/details` | GET | Server metadata, tool definitions, JSON schemas |
| `/tools/{name}` | POST | Execute a tool |
| `/wind-down` | POST | Stop accepting new requests (graceful shutdown) |
| `/active-requests` | GET | Current in-flight request count and state |
| `/reset` | POST | Reset server state (dev only) |

## Calling Tools

Tools are called via POST to `/tools/{name}`. Configuration and tokens go in headers; tool parameters go in the body.

| Header | Format | When Required |
|--------|--------|---------------|
| `X-XTRN-Config` | `base64(JSON.stringify({...}))` | Server has `userConfig` |
| `X-XTRN-Access-Token` | `base64(access_token)` | Server has `oauthConfig` |

```bash
# OPEN server
curl -X POST http://localhost:1234/tools/greet \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice"}'

# With user config
curl -X POST http://localhost:1234/tools/fetch-data \
  -H "Content-Type: application/json" \
  -H "X-XTRN-Config: $(echo '{"apiKey":"secret-123"}' | base64)" \
  -d '{"id": "abc-123"}'

# With OAuth
curl -X POST http://localhost:1234/tools/get-repos \
  -H "Content-Type: application/json" \
  -H "X-XTRN-Access-Token: $(echo 'gho_xxxxxxxxxxxx' | base64)" \
  -d '{"sort": "updated"}'
```

## Submitting Your Server

When your server is ready, submit it to the registry:

```bash
xtrn submit
```

This forks the [xtrn-servers](https://github.com/AbhinavPalacharla/xtrn-servers) repo and opens a PR with your server code. Requires [GitHub CLI](https://cli.github.com/) (`gh`).
