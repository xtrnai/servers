import { XTRNServer, defineConfig } from "xtrn-server";
import { z } from "zod";

// Test server for validating CF Workers deployment pipeline
const server = new XTRNServer({
	name: "testserver",
	version: "1.0.0",
	config: defineConfig({
		userConfig: [
			{ key: "apiKey", type: "string" },
		],
	}),
});

server.registerTool({
	name: "echo",
	description: "Echo back the input message",
	schema: z.object({
		message: z.string(),
	}),
	handler: async (ctx) => {
		const { message } = ctx.req;
		return ctx.res.json({ echo: message });
	},
});

server.run();
