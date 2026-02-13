import { defineConfig, ToolTag, XTRNServer } from "xtrn/server";
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
	}),
});

server.registerTool({
	name: "echo",
	description: "Echoes back the input with server context and configuration",
	schema: z.object({
		message: z.string().describe("Message to echo"),
		uppercase: z.boolean().optional().describe("Return in uppercase"),
		sleep: z.number().optional().describe("Seconds to sleep before responding"),
	}),
	handler: async (ctx) => {
		if (ctx.req.sleep && ctx.req.sleep > 0) {
			await new Promise((resolve) =>
				setTimeout(resolve, ctx.req.sleep * 1000),
			);
		}

		const msg = ctx.req.uppercase
			? ctx.req.message.toUpperCase()
			: ctx.req.message;

		return ctx.res.json({
			echo: msg,
			locale: ctx.config.locale,
			hasToken: !!ctx.token.refresh_token,
			oauthProvider: ctx.oauth.client_id ? "configured" : "missing",
		});
	},
});

server.registerTool({
	name: "timestamp",
	description: "Returns the current timestamp and request metadata",
	tags: [ToolTag.Mutation],
	schema: z.object({
		timezone: z.string().optional().describe("IANA timezone name"),
		format: z.enum(["iso", "unix"]).default("iso").describe("Output format"),
	}),
	handler: (ctx) => {
		const now = new Date();

		return ctx.res.json({
			timestamp: ctx.req.format === "unix" ? now.getTime() : now.toISOString(),
			timezone: ctx.req.timezone ?? "UTC",
			locale: ctx.config.locale,
		});
	},
});

export default server;
