import { defineConfig, XTRNServer } from "@xtrn/server";
import { z } from "zod";

const server = new XTRNServer({
	name: "weather",
	version: "1.2.1",
	config: defineConfig({
		requiredEnv: ["OPENWEATHER_API_KEY"],
	}),
});

async function fetchOWM(
	path: string,
	params: Record<string, string | number>,
	ctx: any,
) {
	const query = new URLSearchParams({
		appid: ctx.env.OPENWEATHER_API_KEY,
		units: "metric",
		...Object.fromEntries(
			Object.entries(params).map(([k, v]) => [k, String(v)]),
		),
	});
	const url = `https://api.openweathermap.org/data/3.0${path}?${query}`;
	const resp = await fetch(url);
	if (resp.ok) return { ok: true as const, data: await resp.json() };
	if (resp.status === 401)
		return { ok: false as const, error: ctx.res.unauthorized() };
	if (resp.status === 429)
		return { ok: false as const, error: ctx.res.error("Rate limit exceeded") };
	return {
		ok: false as const,
		error: ctx.res.error(`OpenWeather API error: ${resp.status}`),
	};
}

server.registerTool({
	name: "get-current-weather",
	description: "Get current weather conditions for a location",
	schema: z.object({
		lat: z.number().describe("Latitude"),
		lon: z.number().describe("Longitude"),
	}),
	handler: async (ctx) => {
		const result = await fetchOWM(
			"/onecall",
			{
				lat: ctx.req.lat,
				lon: ctx.req.lon,
				exclude: "minutely,hourly,daily,alerts",
			},
			ctx,
		);
		if (!result.ok) return result.error;
		return ctx.res.json(result.data);
	},
});

server.registerTool({
	name: "get-forecast",
	description:
		"Get weather forecast with hourly (48h) and daily (8-day) predictions",
	schema: z.object({
		lat: z.number().describe("Latitude"),
		lon: z.number().describe("Longitude"),
	}),
	handler: async (ctx) => {
		const result = await fetchOWM(
			"/onecall",
			{
				lat: ctx.req.lat,
				lon: ctx.req.lon,
				exclude: "current,minutely,alerts",
			},
			ctx,
		);
		if (!result.ok) return result.error;
		return ctx.res.json(result.data);
	},
});

server.registerTool({
	name: "get-historical-weather",
	description:
		"Get historical weather data for a specific date (back to January 1, 1979)",
	schema: z.object({
		lat: z.number().describe("Latitude"),
		lon: z.number().describe("Longitude"),
		dt: z
			.number()
			.describe(
				"Unix timestamp (UTC) for the historical date — data available from Jan 1, 1979",
			),
	}),
	handler: async (ctx) => {
		const result = await fetchOWM(
			"/onecall/timemachine",
			{ lat: ctx.req.lat, lon: ctx.req.lon, dt: ctx.req.dt },
			ctx,
		);
		if (!result.ok) return result.error;
		return ctx.res.json(result.data);
	},
});

server.registerTool({
	name: "get-daily-summary",
	description:
		"Get aggregated daily weather summary for a specific date (min/max temps, precipitation totals)",
	schema: z.object({
		lat: z.number().describe("Latitude"),
		lon: z.number().describe("Longitude"),
		date: z.string().describe("Date in YYYY-MM-DD format"),
	}),
	handler: async (ctx) => {
		const result = await fetchOWM(
			"/onecall/day_summary",
			{ lat: ctx.req.lat, lon: ctx.req.lon, date: ctx.req.date },
			ctx,
		);
		if (!result.ok) return result.error;
		return ctx.res.json(result.data);
	},
});

server.registerTool({
	name: "get-condition-changes",
	description:
		"Track when weather conditions change — returns transition times for rain, snow, storms, clear skies, and more over the next 48 hours",
	schema: z.object({
		lat: z.number().describe("Latitude"),
		lon: z.number().describe("Longitude"),
	}),
	handler: async (ctx) => {
		const result = await fetchOWM(
			"/onecall",
			{ lat: ctx.req.lat, lon: ctx.req.lon, exclude: "current,daily,alerts" },
			ctx,
		);
		if (!result.ok) return result.error;
		const data = result.data as any;
		const hourly: any[] = data.hourly;
		const current_condition = {
			main: hourly[0].weather[0].main,
			description: hourly[0].weather[0].description,
			dt: hourly[0].dt,
		};
		const transitions: {
			from: string;
			to: string;
			at: number;
			at_human: string;
		}[] = [];
		for (let i = 1; i < hourly.length; i++) {
			const prev = hourly[i - 1];
			const curr = hourly[i];
			if (prev.weather[0].main !== curr.weather[0].main) {
				transitions.push({
					from: prev.weather[0].main,
					to: curr.weather[0].main,
					at: curr.dt,
					at_human: new Date(curr.dt * 1000).toISOString(),
				});
			}
		}
		const minutely_precipitation = data.minutely ?? null;
		return ctx.res.json({
			current_condition,
			transitions,
			minutely_precipitation,
		});
	},
});

export default server;
