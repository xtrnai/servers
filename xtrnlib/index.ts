import { DurableObject } from "cloudflare:workers";
import type { Context as HonoContext } from "hono";
import { Hono } from "hono";
import { env } from "hono/adapter";
import * as z from "zod";
// Import Zod v4 types and runtime
import type * as z4 from "zod/v4/core";

/** @internal */
interface XTRNEnv extends Record<string, unknown> {
	XTRN_STATE: DurableObjectNamespace<XTRNState>;
}

/** @internal */
export class XTRNState extends DurableObject<XTRNEnv> {
	private activeRequests = 0;
	private refuseRequests = false;

	constructor(ctx: DurableObjectState, env: XTRNEnv) {
		super(ctx, env);
		this.ctx.blockConcurrencyWhile(async () => {
			this.refuseRequests =
				(await this.ctx.storage.get<boolean>("refuseRequests")) || false;
		});
	}

	async tryAcquire(): Promise<{ allowed: boolean; activeRequests: number }> {
		if (this.refuseRequests) {
			return { allowed: false, activeRequests: this.activeRequests };
		}
		this.activeRequests++;
		return { allowed: true, activeRequests: this.activeRequests };
	}

	async release(): Promise<number> {
		this.activeRequests = Math.max(0, this.activeRequests - 1);
		return this.activeRequests;
	}

	async windDown(): Promise<{ activeRequests: number }> {
		this.refuseRequests = true;
		await this.ctx.storage.put("refuseRequests", true);
		return { activeRequests: this.activeRequests };
	}

	async getState(): Promise<{
		activeRequests: number;
		refusingRequests: boolean;
	}> {
		return {
			activeRequests: this.activeRequests,
			refusingRequests: this.refuseRequests,
		};
	}

	async reset(): Promise<void> {
		this.activeRequests = 0;
		this.refuseRequests = false;
		await this.ctx.storage.delete("refuseRequests");
	}
}

// OAuth config type — inline developer-specified fields only.
// client_id, client_secret, callback_url come from environment variables.
export type OAuthConfig = {
	provider: string;
	authorization_url: string;
	token_url: string;
	scopes: string[];
};

// Environment variable bindings for OAuth secrets
type OAuthEnvBindings = {
	OAUTH_CLIENT_ID: string;
	OAUTH_CLIENT_SECRET: string;
	OAUTH_CALLBACK_URL: string;
};

export const ToolTag = {
	Mutation: "MUTATION",
	Destructive: "DESTRUCTIVE",
} as const;

export type ToolTag = (typeof ToolTag)[keyof typeof ToolTag];

/* ---------- Config ---------- */
export type ConfigType = {
	userConfig?: Array<{
		key: string;
		type: "string" | "number" | "boolean";
	}>;
	oauthConfig?: OAuthConfig;
};

type TypeMap = {
	string: string;
	number: number;
	boolean: boolean;
};

export function defineConfig<const T extends ConfigType>(config: T): T {
	return config;
}

/* ---------- Helpers ---------- */
// Extract array element type (handles both mutable and readonly arrays)
type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

// Extract user config as a proper object type using distributive mapped types
type UserConf<T extends ConfigType> = T["userConfig"] extends readonly unknown[]
	? {
			[Item in ArrayElement<T["userConfig"]> as Item extends {
				key: infer K extends string;
			}
				? K
				: never]: Item extends {
				key: string;
				type: infer Type extends keyof TypeMap;
			}
				? TypeMap[Type]
				: never;
		}
	: Record<string, never>;

// OAuth config for context (subset of full config, excludes provider, auth_url, and scopes)
type OAuthContextConfig = {
	client_id: string;
	client_secret: string;
	token_url: string;
	callback_url: string;
};

// Helper to infer output type from Zod v4 schema
type InferZodOutput<S extends z4.$ZodType> = z4.infer<S>;

// Response object
export class XTRNResponse {
	constructor(private honoCtx: HonoContext) {}

	text(text: string): Response {
		return this.honoCtx.text(text, 200);
	}

	json(data: unknown): Response {
		return this.honoCtx.json(data, 200);
	}

	badRequestArgs(reason?: string): Response {
		return this.honoCtx.text(reason || "", 400);
	}

	error(error: string): Response {
		return this.honoCtx.text(error, 500);
	}

	unauthorized(): Response {
		return this.honoCtx.text("", 401);
	}
}

// Context type for handlers (internal, type-erased for storage)
export type XTRNContext<T extends ConfigType> = {
	req: unknown;
	res: XTRNResponse;
	config: UserConf<T>;
} & (T["oauthConfig"] extends OAuthConfig
	? { token: { refresh_token: string }; oauth: OAuthContextConfig }
	: object);

// Context type for handlers with schema parameters
export type XTRNContextWithSchema<
	T extends ConfigType,
	S extends z4.$ZodType,
> = {
	req: InferZodOutput<S>;
	res: XTRNResponse;
	config: UserConf<T>;
} & (T["oauthConfig"] extends OAuthConfig
	? { token: { refresh_token: string }; oauth: OAuthContextConfig }
	: object);

type Tool<T extends ConfigType> = {
	name: string;
	description: string;
	schema: z4.$ZodType;
	tags: ToolTag[];
	handler: (ctx: XTRNContext<T>) => Promise<Response> | Response;
};

type FullOAuthDetails = {
	provider: string;
	client_id: string;
	client_secret: string;
	authorization_url: string;
	token_url: string;
	scopes: string[];
	callback_url: string;
};

type ServerDetails = {
	name: string;
	version: string;
	oauth: FullOAuthDetails | null;
	config: Array<{ key: string; type: "string" | "number" | "boolean" }>;
	tools: Array<{
		name: string;
		description: string;
		schema: unknown;
		tags: ToolTag[];
	}>;
};

// Check if schema is Zod v4
function isZod4(schema: unknown): schema is z4.$ZodType {
	return typeof schema === "object" && schema !== null && "_zod" in schema;
}

// Generate Zod v4 schema from userConfig
function generateUserConfigSchema(
	userConfig:
		| Array<{ key: string; type: "string" | "number" | "boolean" }>
		| undefined,
): z4.$ZodObject | null {
	if (!userConfig || userConfig.length === 0) {
		return null;
	}

	// Build the schema shape
	const shape: Record<string, z4.$ZodType> = {};
	for (const field of userConfig) {
		if (field.type === "string") {
			shape[field.key] = z.string();
		} else if (field.type === "number") {
			shape[field.key] = z.number();
		} else if (field.type === "boolean") {
			shape[field.key] = z.boolean();
		}
	}

	return z.object(shape) as z4.$ZodObject;
}

// Convert Zod v4 schema to JSON Schema
async function toJSONSchema(schema: z4.$ZodType): Promise<unknown> {
	return z.toJSONSchema(schema);
}

// XTRN Server class
export class XTRNServer<T extends ConfigType> {
	private app: Hono;
	private name: string;
	private version: string;
	private config: T;
	private tools: Tool<T>[] = [];
	private userConfigSchema: z4.$ZodObject | null = null;
	constructor(options: {
		name: string;
		version: string;
		config: T;
	}) {
		this.app = new Hono();
		this.name = options.name;
		this.version = options.version;
		this.config = options.config;

		// Generate userConfig schema
		this.initializeUserConfigSchema();

		// Setup middleware for tool routes
		this.setupToolMiddleware();

		// Setup /details route
		this.setupDetailsRoute();

		// Setup /winddown route
		this.setupWinddownRoute();

		// Setup /active-requests route
		this.setupActiveRequestsRoute();

		// Setup /reset route
		this.setupResetRoute();
	}

	// Initialize userConfig schema
	private initializeUserConfigSchema(): void {
		this.userConfigSchema = generateUserConfigSchema(this.config.userConfig);
	}

	private getStateStub(c: HonoContext): DurableObjectStub<XTRNState> {
		const { XTRN_STATE } = env<XTRNEnv>(c);
		return XTRN_STATE.get(XTRN_STATE.idFromName("state"));
	}

	private setupToolMiddleware(): void {
		this.app.use("/tools/*", async (c, next) => {
			const stub = this.getStateStub(c);
			const { allowed } = await stub.tryAcquire();
			if (!allowed) {
				return c.text("Server is winding down", 503);
			}

			try {
				await next();
			} finally {
				await stub.release();
			}
		});
	}

	private setupWinddownRoute(): void {
		this.app.post("/wind-down", async (c) => {
			const stub = this.getStateStub(c);
			const { activeRequests } = await stub.windDown();
			return c.json({
				message: "Server is now refusing new requests",
				activeRequests,
			});
		});
	}

	private setupActiveRequestsRoute(): void {
		this.app.get("/active-requests", async (c) => {
			const stub = this.getStateStub(c);
			return c.json(await stub.getState());
		});
	}

	private setupResetRoute(): void {
		this.app.post("/reset", async (c) => {
			const stub = this.getStateStub(c);
			await stub.reset();
			return c.json({ message: "State reset" });
		});
	}

	registerTool<S extends z4.$ZodType>(options: {
		name: string;
		description: string;
		schema: S;
		tags?: ToolTag[];
		handler: (ctx: XTRNContextWithSchema<T, S>) => Promise<Response> | Response;
	}): void {
		// Validate that only Zod v4 schemas are provided
		if (!isZod4(options.schema)) {
			throw new Error(
				`Tool "${options.name}" must use a Zod v4 schema. Zod v3 schemas are not supported.`,
			);
		}

		this.tools.push({
			name: options.name,
			description: options.description,
			schema: options.schema,
			tags: options.tags ?? [],
			handler: options.handler as (
				ctx: XTRNContext<T>,
			) => Promise<Response> | Response,
		});

		// Setup route for this tool
		this.setupToolRoute(options.name, options.schema, options.handler);
	}

	// Setup tool route
	private setupToolRoute<S extends z4.$ZodType>(
		toolName: string,
		schema: S,
		handler: (ctx: XTRNContextWithSchema<T, S>) => Promise<Response> | Response,
	): void {
		this.app.post(`/tools/${toolName}`, async (honoCtx) => {
			// Wrap entire route in try-catch to catch any unexpected errors
			try {
				// Create XTRN context - use type assertion since we'll add oauth/token conditionally
				const xtrnCtx = {
					req: {} as InferZodOutput<S>,
					res: new XTRNResponse(honoCtx),
					config: {} as UserConf<T>,
				} as XTRNContextWithSchema<T, S>;

				// Extract headers
				const configHeader = honoCtx.req.header("X-XTRN-Config");
				const tokenHeader = honoCtx.req.header("X-XTRN-Token");

				// Decode and parse config from header
				let userConfig: Record<string, unknown> = {};
				if (configHeader) {
					try {
						userConfig = JSON.parse(atob(configHeader));
					} catch {
						return xtrnCtx.res.badRequestArgs(
							"Invalid X-XTRN-Config header: must be base64-encoded JSON",
						);
					}
				}

				// Validate userConfig using the userConfig schema (Zod v4)
				if (this.userConfigSchema) {
					const userConfigResult = z.safeParse(
						this.userConfigSchema,
						userConfig,
					);
					if (!userConfigResult.success) {
						return xtrnCtx.res.badRequestArgs(
							`Config validation failed: ${JSON.stringify(userConfigResult.error)}`,
						);
					}
					// Use validated data
					userConfig = userConfigResult.data as Record<string, unknown>;
				}

				// Decode token from header
				let refreshToken: string | null = null;
				if (tokenHeader) {
					try {
						refreshToken = atob(tokenHeader);
					} catch {
						return xtrnCtx.res.badRequestArgs(
							"Invalid X-XTRN-Token header: must be base64-encoded",
						);
					}
				}

				// Validate token presence if OAuth required
				if (this.config.oauthConfig && !refreshToken) {
					return xtrnCtx.res.badRequestArgs(
						"X-XTRN-Token header is required for OAuth-enabled servers",
					);
				}

				// Parse request body - now pure tool params only
				let body: unknown;
				try {
					body = await honoCtx.req.json();
				} catch {
					return xtrnCtx.res.badRequestArgs("Invalid JSON body");
				}

				// Validate tool parameters against schema (Zod v4)
				const result = z.safeParse(schema, body);
				if (!result.success) {
					return xtrnCtx.res.badRequestArgs(
						`Tool params validation failed: ${JSON.stringify(result.error)}`,
					);
				}

				// Build context
				xtrnCtx.req = result.data as InferZodOutput<S>;
				xtrnCtx.config = userConfig as UserConf<T>;

			if (this.config.oauthConfig && refreshToken) {
				const {
					OAUTH_CLIENT_ID,
					OAUTH_CLIENT_SECRET,
					OAUTH_CALLBACK_URL,
				} = env<OAuthEnvBindings>(honoCtx);

				(
					xtrnCtx as XTRNContextWithSchema<T, S> & {
						token: { refresh_token: string };
						oauth: OAuthContextConfig;
					}
				).token = { refresh_token: refreshToken };

				(
					xtrnCtx as XTRNContextWithSchema<T, S> & {
						oauth: OAuthContextConfig;
					}
				).oauth = {
					client_id: OAUTH_CLIENT_ID,
					client_secret: OAUTH_CLIENT_SECRET,
					token_url: this.config.oauthConfig.token_url,
					callback_url: OAUTH_CALLBACK_URL,
				};
			}

				// Execute handler
				return await handler(xtrnCtx);
			} catch (error) {
				// Catch any error from the entire route and return as error response
				const errorResponse = new XTRNResponse(honoCtx);
				return errorResponse.error(
					error instanceof Error ? error.message : String(error),
				);
			}
		});
	}

	private async buildDetails(
		honoCtx?: HonoContext,
	): Promise<ServerDetails> {
		let oauth: FullOAuthDetails | null = null;
		if (this.config.oauthConfig) {
			const oauthEnv = honoCtx
				? env<Partial<OAuthEnvBindings>>(honoCtx)
				: ({} as Partial<OAuthEnvBindings>);
			oauth = {
				...this.config.oauthConfig,
				client_id: oauthEnv.OAUTH_CLIENT_ID ?? "",
				client_secret: oauthEnv.OAUTH_CLIENT_SECRET ?? "",
				callback_url: oauthEnv.OAUTH_CALLBACK_URL ?? "",
			};
		}

		return {
			name: this.name,
			version: this.version,
			oauth,
			config: this.config.userConfig || [],
			tools: await Promise.all(
				this.tools.map(async (tool) => ({
					name: tool.name,
					description: tool.description,
					schema: await toJSONSchema(tool.schema),
					tags: tool.tags,
				})),
			),
		};
	}

	private setupDetailsRoute(): void {
		this.app.get("/details", async (honoCtx) => {
			return honoCtx.json(await this.buildDetails(honoCtx));
		});
	}

	getApp(): Hono {
		return this.app;
	}

	fetch(request: Request, env?: Record<string, unknown>): Promise<Response> {
		return Promise.resolve(this.app.fetch(request, env));
	}

}
