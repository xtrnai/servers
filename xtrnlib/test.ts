import * as z from "zod";
import { XTRNServer, defineConfig, type OAuthConfig, ToolTag } from "./index";

const oauthConfig: OAuthConfig = {
	provider: "google",
	client_id: "test-client-id",
	client_secret: "test-client-secret",
	authorization_url: "https://accounts.google.com/o/oauth2/v2/auth",
	token_url: "https://oauth2.googleapis.com/token",
	scopes: ["email", "profile"],
	callback_url: "http://localhost:8080/callback",
};

const toolSchema = z.object({
	query: z.string(),
	limit: z.number().optional(),
});

const server1_NoOAuth_NoConfig = new XTRNServer({
	name: "open-server",
	version: "1.0.0",
	config: defineConfig({}),
});

server1_NoOAuth_NoConfig.registerTool({
	name: "search",
	description: "Search tool",
	schema: toolSchema,
	handler: (ctx) => {
		const query: string = ctx.req.query;
		const limit: number | undefined = ctx.req.limit;

		const config: Record<string, never> = ctx.config;

		// @ts-expect-error - token should NOT exist on OPEN server
		const _token = ctx.token;
		// @ts-expect-error - oauth should NOT exist on OPEN server
		const _oauth = ctx.oauth;

		return ctx.res.json({ query, limit, config });
	},
});

const server2_ConfigOnly_1Field = new XTRNServer({
	name: "config-1-field",
	version: "1.0.0",
	config: defineConfig({
		userConfig: [{ key: "timezone", type: "string" }],
	}),
});

server2_ConfigOnly_1Field.registerTool({
	name: "search",
	description: "Search tool",
	schema: toolSchema,
	handler: (ctx) => {
		const query: string = ctx.req.query;

		const timezone: string = ctx.config.timezone;

		// @ts-expect-error - token should NOT exist without OAuth
		const _token = ctx.token;
		// @ts-expect-error - oauth should NOT exist without OAuth
		const _oauth = ctx.oauth;

		return ctx.res.json({ query, timezone });
	},
});

const server3_ConfigOnly_3Fields = new XTRNServer({
	name: "config-3-fields",
	version: "1.0.0",
	config: defineConfig({
		userConfig: [
			{ key: "timezone", type: "string" },
			{ key: "maxResults", type: "number" },
			{ key: "debugMode", type: "boolean" },
		],
	}),
});

server3_ConfigOnly_3Fields.registerTool({
	name: "search",
	description: "Search tool",
	schema: toolSchema,
	handler: (ctx) => {
		const query: string = ctx.req.query;

		const timezone: string = ctx.config.timezone;
		const maxResults: number = ctx.config.maxResults;
		const debugMode: boolean = ctx.config.debugMode;

		// @ts-expect-error - token should NOT exist without OAuth
		const _token = ctx.token;
		// @ts-expect-error - oauth should NOT exist without OAuth
		const _oauth = ctx.oauth;

		return ctx.res.json({ query, timezone, maxResults, debugMode });
	},
});

const server4_OAuthOnly = new XTRNServer({
	name: "oauth-only",
	version: "1.0.0",
	config: defineConfig({
		oauthConfig,
	}),
});

server4_OAuthOnly.registerTool({
	name: "search",
	description: "Search tool",
	schema: toolSchema,
	handler: (ctx) => {
		const query: string = ctx.req.query;

		const config: Record<string, never> = ctx.config;

		const refreshToken: string = ctx.token.refresh_token;
		const clientId: string = ctx.oauth.client_id;
		const clientSecret: string = ctx.oauth.client_secret;
		const tokenUrl: string = ctx.oauth.token_url;
		const callbackUrl: string = ctx.oauth.callback_url;

		return ctx.res.json({
			query,
			config,
			refreshToken,
			clientId,
			clientSecret,
			tokenUrl,
			callbackUrl,
		});
	},
});

const server5_OAuthAndConfig_1Field = new XTRNServer({
	name: "oauth-config-1-field",
	version: "1.0.0",
	config: defineConfig({
		userConfig: [{ key: "timezone", type: "string" }],
		oauthConfig,
	}),
});

server5_OAuthAndConfig_1Field.registerTool({
	name: "search",
	description: "Search tool",
	schema: toolSchema,
	handler: (ctx) => {
		const query: string = ctx.req.query;

		const timezone: string = ctx.config.timezone;

		const refreshToken: string = ctx.token.refresh_token;
		const clientId: string = ctx.oauth.client_id;

		return ctx.res.json({ query, timezone, refreshToken, clientId });
	},
});

const server6_OAuthAndConfig_3Fields = new XTRNServer({
	name: "oauth-config-3-fields",
	version: "1.0.0",
	config: defineConfig({
		userConfig: [
			{ key: "timezone", type: "string" },
			{ key: "maxResults", type: "number" },
			{ key: "debugMode", type: "boolean" },
		],
		oauthConfig,
	}),
});

server6_OAuthAndConfig_3Fields.registerTool({
	name: "search",
	description: "Search tool",
	schema: toolSchema,
	handler: (ctx) => {
		const query: string = ctx.req.query;
		const limit: number | undefined = ctx.req.limit;

		const timezone: string = ctx.config.timezone;
		const maxResults: number = ctx.config.maxResults;
		const debugMode: boolean = ctx.config.debugMode;

		const refreshToken: string = ctx.token.refresh_token;
		const clientId: string = ctx.oauth.client_id;
		const clientSecret: string = ctx.oauth.client_secret;
		const tokenUrl: string = ctx.oauth.token_url;
		const callbackUrl: string = ctx.oauth.callback_url;

		return ctx.res.json({
			query,
			limit,
			timezone,
			maxResults,
			debugMode,
			refreshToken,
			clientId,
			clientSecret,
			tokenUrl,
			callbackUrl,
		});
	},
});

const server7_WithTags = new XTRNServer({
	name: "tags-test",
	version: "1.0.0",
	config: defineConfig({}),
});

server7_WithTags.registerTool({
	name: "read-data",
	description: "Read-only operation",
	schema: toolSchema,
	handler: (ctx) => ctx.res.json({ query: ctx.req.query }),
});

server7_WithTags.registerTool({
	name: "update-data",
	description: "Updates data",
	schema: toolSchema,
	tags: [ToolTag.Mutation],
	handler: (ctx) => ctx.res.json({ query: ctx.req.query }),
});

server7_WithTags.registerTool({
	name: "delete-data",
	description: "Deletes data permanently",
	schema: toolSchema,
	tags: [ToolTag.Mutation, ToolTag.Destructive],
	handler: (ctx) => ctx.res.json({ query: ctx.req.query }),
});

// @ts-expect-error - invalid tag should cause type error
const _invalidTagTest: typeof ToolTag[keyof typeof ToolTag] = "InvalidTag";

const servers = {
	"1": server1_NoOAuth_NoConfig,
	"2": server2_ConfigOnly_1Field,
	"3": server3_ConfigOnly_3Fields,
	"4": server4_OAuthOnly,
	"5": server5_OAuthAndConfig_1Field,
	"6": server6_OAuthAndConfig_3Fields,
	"7": server7_WithTags,
};

const args = process.argv.slice(2);
const serverArg = args.find((a) => a.startsWith("--server="));
const serverKey = (serverArg?.split("=")[1] || "6") as keyof typeof servers;

const server = servers[serverKey];
if (!server) {
	console.error(`Unknown server: ${serverKey}`);
	console.error("Available: 1, 2, 3, 4, 5, 6, 7");
	console.error("  1: No OAuth, No Config");
	console.error("  2: Config only (1 field)");
	console.error("  3: Config only (3 fields)");
	console.error("  4: OAuth only");
	console.error("  5: OAuth + Config (1 field)");
	console.error("  6: OAuth + Config (3 fields)");
	console.error("  7: Tool Tags test");
	process.exit(1);
}

server.run();
