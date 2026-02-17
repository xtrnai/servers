import { XTRNServer, defineConfig } from "@xtrn/server";
import { z } from "zod";

const server = new XTRNServer({
	name: "pingserver",
	version: "6.0.0",
	config: defineConfig({
		userConfig: [{ key: "apiKey", type: "string" }],
		oauthConfig: {
			provider: "fake-oauth",
			authorization_url: "https://example.com/oauth/authorize",
			token_url: "https://example.com/oauth/token",
			scopes: ["read", "write"],
		},
	}),
});

server.registerTool({
	name: "ping",
	description: "Returns pong with your API key and OAuth access token",
	schema: z.object({
		label: z.string().optional(),
	}),
	handler: async (ctx) => {
		return ctx.res.json({
			pong: true,
			apiKey: ctx.config.apiKey,
			accessToken: ctx.accessToken,
			label: ctx.req.label ?? null,
			timestamp: new Date().toISOString(),
		});
	},
});

export default server;
