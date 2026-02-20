# XTRN Server Library

A TypeScript library for building XTRN servers with type-safe configuration, OAuth support, and Zod v4 schema validation.

## Features

- **Type-safe configuration** with runtime validation
- **OAuth 2.0 support** with automatic token management
- **Zod v4 schema validation** for tool parameters
- **Built-in server lifecycle management** (winddown, active request tracking)
- **Automatic JSON Schema generation** from Zod schemas
- **Powered by Hono** for fast HTTP handling

## Installation

```bash
bun add zod hono
```

## Basic Usage

### 1. Create a Simple Server (No OAuth)

```typescript
import { XTRNServer, defineConfig } from "./index";
import { z } from "zod";

const server = new XTRNServer({
  name: "my-server",
  version: "1.0.0",
  config: defineConfig({
    userConfig: [
      { key: "apiKey", type: "string" },
      { key: "timeout", type: "number" },
    ],
  }),
});

server.registerTool({
  name: "get-data",
  description: "Fetches data from an API",
  schema: z.object({
    query: z.string(),
    limit: z.number().optional(),
  }),
  handler: async (ctx) => {
    const { query, limit } = ctx.req;
    const { apiKey, timeout } = ctx.req;
    
    // Your logic here
    return ctx.res.json({ 
      message: "Success", 
      query, 
      limit 
    });
  },
});

server.run();
```

### 2. Create a Server with OAuth

```typescript
import { XTRNServer, defineConfig } from "./index";
import { z } from "zod";

const server = new XTRNServer({
  name: "google-calendar-server",
  version: "1.0.0",
  config: defineConfig({
    userConfig: [
      { key: "timezone", type: "string" },
    ],
    oauthConfig: {
      provider: "google-calendar",
      client_id: "your-client-id",
      client_secret: "your-client-secret",
      auth_url: "https://accounts.google.com/o/oauth2/v2/auth",
      token_url: "https://oauth2.googleapis.com/token",
      scopes: ["https://www.googleapis.com/auth/calendar"],
      callback_url: "http://localhost:8080/auth/callback",
    },
  }),
});

server.registerTool({
  name: "list-events",
  description: "Lists calendar events",
  schema: z.object({
    maxResults: z.number().default(10),
  }),
  handler: async (ctx) => {
    const { refresh_token, timezone } = ctx.req;
    const { oauth } = ctx;
    
    // Use refresh_token to get access token
    const tokenResponse = await fetch(oauth.token_url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: oauth.client_id,
        client_secret: oauth.client_secret,
        refresh_token,
        grant_type: "refresh_token",
      }),
    });
    
    const { access_token } = await tokenResponse.json();
    
    // Call Google Calendar API
    const events = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );
    
    return ctx.res.json(await events.json());
  },
});

server.run();
```

## Configuration

### User Configuration

Define custom configuration fields that users must provide when calling tools:

```typescript
config: defineConfig({
  userConfig: [
    { key: "apiKey", type: "string" },
    { key: "maxRetries", type: "number" },
    { key: "enableDebug", type: "boolean" },
  ],
})
```

These fields are automatically validated and available in `ctx.req`.

### OAuth Configuration

Enable OAuth 2.0 authentication for your server:

```typescript
config: defineConfig({
  oauthConfig: {
    provider: "your-provider",
    client_id: "your-client-id",
    client_secret: "your-client-secret",
    auth_url: "https://provider.com/oauth/authorize",
    token_url: "https://provider.com/oauth/token",
    scopes: ["scope1", "scope2"],
    callback_url: "http://localhost:8080/callback",
  },
})
```

When OAuth is configured:
- `refresh_token` is required in tool requests
- `ctx.oauth` provides OAuth credentials
- `ctx.req.refresh_token` contains the user's refresh token

## Tool Registration

### Schema Definition

Tools use Zod v4 schemas for parameter validation:

```typescript
server.registerTool({
  name: "send-email",
  description: "Sends an email",
  schema: z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
    attachments: z.array(z.string()).optional(),
  }),
  handler: async (ctx) => {
    const { to, subject, body, attachments } = ctx.req;
    // Send email logic
    return ctx.res.json({ sent: true });
  },
});
```

### Handler Context

The handler receives a fully-typed context object:

```typescript
handler: async (ctx) => {
  // ctx.req contains:
  // - User config fields (apiKey, timeout, etc.)
  // - Tool parameters (validated against schema)
  // - refresh_token (if OAuth is configured)
  
  // ctx.res provides response methods
  // ctx.oauth contains OAuth config (if configured)
}
```

## Response Types

### Success Responses

```typescript
// Plain text
return ctx.res.text("Success");

// JSON data
return ctx.res.json({ status: "ok", data: [...] });
```

### Error Responses

```typescript
// Bad request (invalid parameters)
return ctx.res.badRequestArgs("Invalid email format");

// Server error
return ctx.res.error("Failed to connect to database");

// Unauthorized
return ctx.res.unauthorized();
```

## Built-in Routes

### GET /details

Returns server metadata and tool definitions:

```json
{
  "name": "my-server",
  "version": "1.0.0",
  "oauth": { ... },
  "config": [...],
  "tools": [
    {
      "name": "tool-name",
      "description": "Tool description",
      "schema": { /* JSON Schema */ }
    }
  ]
}
```

### POST /wind-down

Initiates graceful shutdown (refuses new requests):

```json
{
  "message": "Server is now refusing new requests",
  "activeRequests": 3
}
```

### GET /active-requests

Returns current server state:

```json
{
  "activeRequests": 5,
  "refusingRequests": false
}
```

## Calling Tools

Tools are called via POST requests to `/tools/{toolName}`:

```bash
# Without OAuth
curl -X POST http://localhost:3000/tools/get-data \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "my-api-key",
    "timeout": 5000,
    "query": "search term",
    "limit": 10
  }'

# With OAuth
curl -X POST http://localhost:3000/tools/list-events \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "user-refresh-token",
    "timezone": "America/New_York",
    "maxResults": 20
  }'
```

## Running the Server

### Development

```typescript
server.run();
```

This will:
1. Bind to a random available port
2. Print the server URL to stdout (e.g., `http://localhost:54321`)
3. Start accepting requests

### Custom Server Setup

For advanced use cases, you can access the underlying Hono app:

```typescript
import { serve } from "bun";

const app = server.getApp();

serve({
  port: 3000,
  fetch: app.fetch.bind(app),
});
```

## TypeScript Types

The library provides full TypeScript support with type inference:

```typescript
// Config type is inferred
const config = defineConfig({
  userConfig: [{ key: "apiKey", type: "string" }],
});

// Context is fully typed
server.registerTool({
  schema: z.object({ query: z.string() }),
  handler: async (ctx) => {
    ctx.req.apiKey;  // string
    ctx.req.query;   // string
    ctx.req.refresh_token;  // string (if OAuth configured)
    ctx.oauth;  // OAuthContextConfig (if OAuth configured)
  },
});
```

## Example: Complete Weather Server

```typescript
import { XTRNServer, defineConfig } from "./index";
import { z } from "zod";

const server = new XTRNServer({
  name: "weather-server",
  version: "1.0.0",
  config: defineConfig({
    userConfig: [
      { key: "apiKey", type: "string" },
      { key: "units", type: "string" },
    ],
  }),
});

server.registerTool({
  name: "get-weather",
  description: "Gets current weather for a location",
  schema: z.object({
    city: z.string(),
    country: z.string().optional(),
  }),
  handler: async (ctx) => {
    const { apiKey, units } = ctx.req;
    const { city, country } = ctx.req;
    
    const url = new URL("https://api.weather.com/v1/weather");
    url.searchParams.set("city", city);
    if (country) url.searchParams.set("country", country);
    url.searchParams.set("units", units);
    
    const response = await fetch(url, {
      headers: { "X-API-Key": apiKey },
    });
    
    if (!response.ok) {
      return ctx.res.error("Failed to fetch weather");
    }
    
    return ctx.res.json(await response.json());
  },
});

server.registerTool({
  name: "get-forecast",
  description: "Gets weather forecast",
  schema: z.object({
    city: z.string(),
    days: z.number().min(1).max(7).default(3),
  }),
  handler: async (ctx) => {
    const { apiKey } = ctx.req;
    const { city, days } = ctx.req;
    
    // Forecast logic
    return ctx.res.json({ forecast: [] });
  },
});

server.run();
```

## License

MIT
