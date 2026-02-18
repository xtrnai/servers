import { defineConfig, ToolTag, XTRNServer } from "@xtrn/server";
import { z } from "zod";

const server = new XTRNServer({
	name: "testserver",
	version: "1.0.0",
	config: defineConfig({
		userConfig: [{ key: "locale", type: "string" }],
		oauthConfig: {
			provider: "test-provider",
			authorization_url: "https://example.com/auth",
			token_url: "https://example.com/token",
			scopes: ["read", "write"],
		},
		requiredEnv: ["TEST_API_KEY", "TEST_BASE_URL"],
	}),
});

server.registerTool({
	name: "echo",
	description: "Echoes back the input with server context",
	schema: z.object({
		message: z.string().describe("Message to echo"),
		uppercase: z.boolean().optional().describe("Return in uppercase"),
	}),
	handler: async (ctx) => {
		const msg = ctx.req.uppercase
			? ctx.req.message.toUpperCase()
			: ctx.req.message;

		return ctx.res.json({
			echo: msg,
			locale: ctx.config.locale,
			hasToken: !!ctx.accessToken,
			apiKey: ctx.env.TEST_API_KEY ? "set" : "missing",
			baseUrl: ctx.env.TEST_BASE_URL ? "set" : "missing",
		});
	},
});

server.registerTool({
	name: "env-check",
	description: "Returns info about the required environment variables",
	schema: z.object({}),
	handler: (ctx) => {
		return ctx.res.json({
			envVarsPresent: {
				TEST_API_KEY: !!ctx.env.TEST_API_KEY,
				TEST_BASE_URL: !!ctx.env.TEST_BASE_URL,
			},
		});
	},
});

export default server;
