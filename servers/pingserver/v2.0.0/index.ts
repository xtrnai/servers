import { XTRNServer, defineConfig } from "@xtrn/server";
import { z } from "zod";

const server = new XTRNServer({
	name: "pingserver",
	version: "2.0.0",
	config: defineConfig({
		userConfig: [{ key: "apiKey", type: "string" }],
	}),
});

server.registerTool({
	name: "ping",
	description: "Returns pong with a timestamp and your API key",
	schema: z.object({
		label: z.string().optional(),
	}),
	handler: async (ctx) => {
		return ctx.res.json({
			pong: true,
			apiKey: ctx.config.apiKey,
			label: ctx.req.label ?? null,
			timestamp: new Date().toISOString(),
		});
	},
});

export default server;
