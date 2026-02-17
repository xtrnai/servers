import { XTRNServer, defineConfig } from "@xtrn/server";
import { z } from "zod";

const server = new XTRNServer({
	name: "pingserver",
	version: "1.0.0",
	config: defineConfig({}),
});

server.registerTool({
	name: "ping",
	description: "Returns pong with a timestamp",
	schema: z.object({
		label: z.string().optional(),
	}),
	handler: async (ctx) => {
		return ctx.res.json({
			pong: true,
			label: ctx.req.label ?? null,
			timestamp: new Date().toISOString(),
		});
	},
});

export default server;
