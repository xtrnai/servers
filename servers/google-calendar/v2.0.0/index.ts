import { GaxiosError } from "gaxios";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import {
	defineConfig,
	type OAuthConfig,
	ToolTag,
	XTRNServer,
} from "xtrn-server";
import { z } from "zod";
import oauthJson from "./oauth.json";

const oauthConfig = oauthJson as OAuthConfig;

type AccessToken = {
	access_token: string;
	expiresAt: number;
};

const access_token_map: Map<string, AccessToken> = new Map();

// Create your XTRN server
const server = new XTRNServer({
	name: "google-calendar",
	version: "2.0.0",
	config: defineConfig({
		userConfig: [
			{
				key: "unauth_test",
				type: "boolean",
			},
		],
		oauthConfig: oauthConfig,
	}),
});

async function getCalendarClient(ctx: {
	config: { unauth_test: boolean };
	token: { refresh_token: string };
	oauth: { client_id: string; client_secret: string };
}) {
	if (ctx.config.unauth_test) {
		throw new Error("Unauthorized");
	}

	const client = new OAuth2Client(
		ctx.oauth.client_id,
		ctx.oauth.client_secret,
		"http://localhost",
	);

	const now = Date.now();
	const cachedToken = access_token_map.get(ctx.token.refresh_token);

	if (cachedToken && now < cachedToken.expiresAt) {
		client.setCredentials({ access_token: cachedToken.access_token });
	} else {
		try {
			client.setCredentials({ refresh_token: ctx.token.refresh_token });
			const { credentials } = await client.refreshAccessToken();

			if (!credentials.access_token || !credentials.expiry_date) {
				throw new Error(
					"Missing access token fields in credentials object. Try again.",
				);
			}

			client.setCredentials({ access_token: credentials.access_token });

			access_token_map.set(ctx.token.refresh_token, {
				access_token: credentials.access_token,
				expiresAt: credentials.expiry_date,
			});
		} catch (error) {
			if (error instanceof GaxiosError && error.message === "invalid_grant") {
				throw new Error("Unauthorized");
			}
			throw error;
		}
	}

	return google.calendar({ version: "v3", auth: client });
}

// Register create-event tool
server.registerTool({
	name: "create-event",
	description: "Creates a new event",
	tags: [ToolTag.Mutation],
	schema: z.object({
		summary: z.string().describe("Event title"),
		start: z.object({
			dateTime: z.string().describe("Start time (ISO format)"),
			timeZone: z.string().describe("Time zone"),
		}),
		end: z.object({
			dateTime: z.string().describe("End time (ISO format)"),
			timeZone: z.string().describe("Time zone"),
		}),
		description: z.string().optional().describe("Event description"),
		location: z.string().optional().describe("Event location"),
		reminders: z
			.object({
				useDefault: z
					.boolean()
					.optional()
					.describe("Use default reminders (true) or custom reminders (false)"),
				overrides: z
					.array(
						z.object({
							method: z.enum(["email", "popup"]).describe("Reminder method"),
							minutes: z
								.number()
								.describe("Minutes before event to send reminder"),
						}),
					)
					.optional()
					.describe(
						"Custom reminder overrides - only used when useDefault is false",
					),
			})
			.optional()
			.describe("Event reminders/notifications configuration"),
	}),
	handler: async (ctx) => {
		try {
			const calendar = await getCalendarClient(ctx);

			// Build the event object from the request
			const event = {
				summary: ctx.req.summary,
				start: {
					dateTime: ctx.req.start.dateTime,
					timeZone: ctx.req.start.timeZone,
				},
				end: {
					dateTime: ctx.req.end.dateTime,
					timeZone: ctx.req.end.timeZone,
				},
				...(ctx.req.description && { description: ctx.req.description }),
				...(ctx.req.location && { location: ctx.req.location }),
				...(ctx.req.reminders && {
					reminders: {
						useDefault: ctx.req.reminders.useDefault ?? true,
						...(ctx.req.reminders.overrides && {
							overrides: ctx.req.reminders.overrides,
						}),
					},
				}),
			};

			// Insert the event into the primary calendar
			const createdEvent = await calendar.events.insert({
				calendarId: "primary",
				requestBody: event,
			});

			// Send success response
			return ctx.res.json({
				success: true,
				event: {
					id: createdEvent.data.id,
					summary: createdEvent.data.summary,
					start: createdEvent.data.start,
					end: createdEvent.data.end,
					description: createdEvent.data.description,
					location: createdEvent.data.location,
					htmlLink: createdEvent.data.htmlLink,
					status: createdEvent.data.status,
				},
			});
		} catch (error) {
			console.error("Error creating calendar event:", error);
			return ctx.res.json({
				success: false,
				error:
					error instanceof Error ? error.message : "Unknown error occurred",
			});
		}
	},
});

// Register list-events tool
server.registerTool({
	name: "list-events",
	description: "Lists events from Google Calendar",
	schema: z.object({
		calendarId: z
			.string()
			.default("primary")
			.describe("Calendar ID to list events from"),
		timeMin: z
			.string()
			.optional()
			.describe("Lower bound for event's end time (RFC3339 format)"),
		timeMax: z
			.string()
			.optional()
			.describe("Upper bound for event's start time (RFC3339 format)"),
		maxResults: z
			.number()
			.default(25)
			.describe("Maximum number of events to return"),
		timeZone: z.string().optional().describe("Time zone used in the response"),
		showDeleted: z
			.boolean()
			.default(false)
			.describe("Whether to include deleted events"),
		singleEvents: z
			.boolean()
			.default(true)
			.describe("Whether to expand recurring events"),
	}),
	handler: async (ctx) => {
		try {
			const calendar = await getCalendarClient(ctx);
			const {
				calendarId,
				timeMin,
				timeMax,
				maxResults,
				timeZone,
				showDeleted,
				singleEvents,
			} = ctx.req;

			const response = await calendar.events.list({
				calendarId: calendarId,
				timeMin: timeMin,
				timeMax: timeMax,
				maxResults: maxResults,
				timeZone: timeZone,
				showDeleted: showDeleted,
				singleEvents: singleEvents,
			});

			return ctx.res.json({
				success: true,
				events: response.data.items || [],
				nextPageToken: response.data.nextPageToken,
				timeZone: response.data.timeZone,
			});
		} catch (error) {
			console.error("Error listing calendar events:", error);
			return ctx.res.json({
				success: false,
				error:
					error instanceof Error ? error.message : "Unknown error occurred",
			});
		}
	},
});

// Register update-event tool
server.registerTool({
	name: "update-event",
	description: "Updates an existing event in Google Calendar",
	schema: z.object({
		calendarId: z
			.string()
			.default("primary")
			.describe("Calendar ID containing the event"),
		eventId: z.string().describe("ID of the event to update"),
		summary: z.string().optional().describe("Event title"),
		description: z.string().optional().describe("Event description"),
		location: z.string().optional().describe("Event location"),
		start: z
			.object({
				dateTime: z.string().describe("Start date-time in RFC3339 format"),
				timeZone: z
					.string()
					.default("UTC")
					.describe("Time zone for the start time"),
			})
			.optional()
			.describe("Event start time"),
		end: z
			.object({
				dateTime: z.string().describe("End date-time in RFC3339 format"),
				timeZone: z
					.string()
					.default("UTC")
					.describe("Time zone for the end time"),
			})
			.optional()
			.describe("Event end time"),
	}),
	handler: async (ctx) => {
		try {
			const calendar = await getCalendarClient(ctx);
			const {
				calendarId,
				eventId,
				summary,
				description,
				location,
				start,
				end,
			} = ctx.req;

			// First get the existing event
			const existingEventResponse = await calendar.events.get({
				calendarId: calendarId,
				eventId: eventId,
			});

			const existingEvent = existingEventResponse.data;

			// Build the updated event object with only specified fields
			const updatedEvent: any = {};
			if (summary !== undefined) updatedEvent.summary = summary;
			if (description !== undefined) updatedEvent.description = description;
			if (location !== undefined) updatedEvent.location = location;
			if (start) updatedEvent.start = start;
			if (end) updatedEvent.end = end;

			// Update the event
			const updatedEventResponse = await calendar.events.update({
				calendarId: calendarId,
				eventId: eventId,
				requestBody: updatedEvent,
			});

			return ctx.res.json({
				success: true,
				event: updatedEventResponse.data,
				message: "Event updated successfully",
			});
		} catch (error) {
			console.error("Error updating calendar event:", error);
			return ctx.res.json({
				success: false,
				error:
					error instanceof Error ? error.message : "Unknown error occurred",
			});
		}
	},
});

// Register delete-event tool
server.registerTool({
	name: "delete-event",
	description: "Deletes an event from Google Calendar",
	schema: z.object({
		calendarId: z
			.string()
			.default("primary")
			.describe("Calendar ID containing the event"),
		eventId: z.string().describe("ID of the event to delete"),
		sendUpdates: z
			.enum(["all", "externalOnly", "none"])
			.optional()
			.describe("Whether to send updates about the deletion"),
	}),
	handler: async (ctx) => {
		try {
			const calendar = await getCalendarClient(ctx);
			const { calendarId, eventId, sendUpdates } = ctx.req;

			await calendar.events.delete({
				calendarId: calendarId,
				eventId: eventId,
				sendUpdates: sendUpdates,
			});

			return ctx.res.json({
				success: true,
				message: "Event deleted successfully",
				eventId: eventId,
			});
		} catch (error) {
			console.error("Error deleting calendar event:", error);
			return ctx.res.json({
				success: false,
				error:
					error instanceof Error ? error.message : "Unknown error occurred",
			});
		}
	},
});

// Start the server
server.run();
