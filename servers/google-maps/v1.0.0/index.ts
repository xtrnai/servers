import { Client, Status } from "@googlemaps/google-maps-services-js";
import { defineConfig, XTRNServer } from "@xtrn/server";
import { z } from "zod";

const mapsClient = new Client({ config: { adapter: "fetch" } });

const server = new XTRNServer({
	name: "google-maps",
	version: "1.0.0",
	config: defineConfig({
		requiredEnv: ["GOOGLE_MAPS_API_KEY"] as const,
	}),
});

server.registerTool({
	name: "search_places",
	description:
		"Search for places using a text query with optional location bias",
	schema: z.object({
		textQuery: z.string().describe("Search query, e.g. 'pizza in New York'"),
		maxResultCount: z
			.number()
			.min(1)
			.max(20)
			.default(10)
			.describe("Maximum number of results to return"),
		locationBias: z
			.object({
				latitude: z
					.number()
					.min(-90)
					.max(90)
					.describe("Latitude of center point"),
				longitude: z
					.number()
					.min(-180)
					.max(180)
					.describe("Longitude of center point"),
				radius: z
					.number()
					.min(0)
					.max(50000)
					.default(5000)
					.describe("Bias radius in meters"),
			})
			.optional()
			.describe("Optional location to bias results toward"),
	}),
	handler: async (ctx) => {
		try {
			const response = await mapsClient.textSearch({
				params: {
					query: ctx.req.textQuery,
					key: ctx.env.GOOGLE_MAPS_API_KEY,
					...(ctx.req.locationBias
						? {
								location: `${ctx.req.locationBias.latitude},${ctx.req.locationBias.longitude}`,
								radius: ctx.req.locationBias.radius,
							}
						: {}),
				},
			});
			if (response.data.status !== Status.OK) {
				return ctx.res.error(
					response.data.error_message || String(response.data.status),
				);
			}
			const places = (response.data.results || [])
				.slice(0, ctx.req.maxResultCount)
				.map((result) => ({
					id: result.place_id,
					name: result.name,
					address: result.formatted_address,
					location: {
						lat: result.geometry?.location?.lat,
						lng: result.geometry?.location?.lng,
					},
					types: result.types,
					rating: result.rating,
					userRatingCount: result.user_ratings_total,
					priceLevel: result.price_level,
				}));
			return ctx.res.json(places);
		} catch (e: any) {
			return ctx.res.error(
				e?.response?.data?.error_message || e?.message || "Unknown error",
			);
		}
	},
});

server.registerTool({
	name: "search_nearby",
	description:
		"Search for places near a specific location with optional type filtering",
	schema: z.object({
		latitude: z.number().min(-90).max(90).describe("Latitude of search center"),
		longitude: z
			.number()
			.min(-180)
			.max(180)
			.describe("Longitude of search center"),
		radius: z
			.number()
			.min(0)
			.max(50000)
			.default(1000)
			.describe("Search radius in meters"),
		includedTypes: z
			.array(z.string())
			.optional()
			.describe("Place types to include, e.g. ['restaurant', 'cafe']"),
		maxResultCount: z
			.number()
			.min(1)
			.max(20)
			.default(10)
			.describe("Maximum number of results"),
	}),
	handler: async (ctx) => {
		try {
			const response = await mapsClient.placesNearby({
				params: {
					location: `${ctx.req.latitude},${ctx.req.longitude}`,
					radius: ctx.req.radius,
					...(ctx.req.includedTypes?.[0]
						? { type: ctx.req.includedTypes[0] }
						: {}),
					key: ctx.env.GOOGLE_MAPS_API_KEY,
				},
			});
			if (response.data.status !== Status.OK) {
				return ctx.res.error(
					response.data.error_message || String(response.data.status),
				);
			}
			const places = (response.data.results || [])
				.slice(0, ctx.req.maxResultCount)
				.map((result) => ({
					id: result.place_id,
					name: result.name,
					address: result.formatted_address,
					location: {
						lat: result.geometry?.location?.lat,
						lng: result.geometry?.location?.lng,
					},
					types: result.types,
					rating: result.rating,
					userRatingCount: result.user_ratings_total,
					priceLevel: result.price_level,
				}));
			return ctx.res.json(places);
		} catch (e: any) {
			return ctx.res.error(
				e?.response?.data?.error_message || e?.message || "Unknown error",
			);
		}
	},
});

server.registerTool({
	name: "get_place_details",
	description:
		"Get detailed information about a place including ratings, reviews, hours, and contact details",
	schema: z.object({
		placeId: z
			.string()
			.describe("Google Maps place ID, e.g. 'ChIJN1t_tDeuEmsRUsoyG83frY4'"),
	}),
	handler: async (ctx) => {
		try {
			const response = await mapsClient.placeDetails({
				params: {
					place_id: ctx.req.placeId,
					key: ctx.env.GOOGLE_MAPS_API_KEY,
					fields: [
						"place_id",
						"name",
						"formatted_address",
						"geometry",
						"types",
						"rating",
						"user_ratings_total",
						"price_level",
						"opening_hours",
						"formatted_phone_number",
						"international_phone_number",
						"website",
						"reviews",
						"editorial_summary",
						"photos",
					],
				},
			});
			if (response.data.status !== Status.OK) {
				return ctx.res.error(
					response.data.error_message || String(response.data.status),
				);
			}
			const data = response.data.result;
			return ctx.res.json({
				id: data.place_id,
				name: data.name,
				address: data.formatted_address,
				location: {
					lat: data.geometry?.location?.lat,
					lng: data.geometry?.location?.lng,
				},
				types: data.types,
				rating: data.rating,
				userRatingCount: data.user_ratings_total,
				priceLevel: data.price_level,
				phone: data.formatted_phone_number || data.international_phone_number,
				website: data.website,
				openingHours: {
					openNow: data.opening_hours?.open_now,
					weekdayDescriptions: data.opening_hours?.weekday_text,
				},
				reviews: data.reviews?.map((r) => ({
					rating: r.rating,
					text: r.text,
					authorName: r.author_name,
					publishTime: r.time,
				})),
				editorialSummary: (data as any).editorial_summary?.overview,
			});
		} catch (e: any) {
			return ctx.res.error(
				e?.response?.data?.error_message || e?.message || "Unknown error",
			);
		}
	},
});

server.registerTool({
	name: "maps_geocode",
	description: "Convert an address or place name to geographic coordinates",
	schema: z.object({
		address: z
			.string()
			.describe("Address or place name to convert to coordinates"),
	}),
	handler: async (ctx) => {
		try {
			const response = await mapsClient.geocode({
				params: {
					address: ctx.req.address,
					key: ctx.env.GOOGLE_MAPS_API_KEY,
				},
			});
			if (response.data.status !== Status.OK) {
				return ctx.res.error(
					response.data.error_message || String(response.data.status),
				);
			}
			if (response.data.results.length === 0) {
				return ctx.res.error("No results found");
			}
			const result = response.data.results[0]!;
			return ctx.res.json({
				location: {
					lat: result.geometry.location.lat,
					lng: result.geometry.location.lng,
				},
				formattedAddress: result.formatted_address,
				placeId: result.place_id,
			});
		} catch (e: any) {
			return ctx.res.error(
				e?.response?.data?.error_message || e?.message || "Unknown error",
			);
		}
	},
});

const TRAVEL_MODE_MAP: Record<string, string> = {
	driving: "DRIVE",
	walking: "WALK",
	bicycling: "BICYCLE",
	transit: "TRANSIT",
};

function parseDuration(duration: string): number {
	return parseInt(duration.replace("s", ""), 10);
}

function formatDuration(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	if (hours > 0 && mins > 0) return `${hours} hour${hours > 1 ? "s" : ""} ${mins} min${mins > 1 ? "s" : ""}`;
	if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
	return `${mins} min${mins > 1 ? "s" : ""}`;
}

function formatDistance(meters: number): string {
	if (meters >= 1609) {
		const miles = (meters / 1609.344).toFixed(1);
		return `${miles} mi`;
	}
	return `${meters} m`;
}

server.registerTool({
	name: "maps_distance_matrix",
	description:
		"Calculate travel distances and durations between multiple origins and destinations",
	schema: z.object({
		origins: z
			.array(z.string())
			.describe("List of origin addresses or coordinates"),
		destinations: z
			.array(z.string())
			.describe("List of destination addresses or coordinates"),
		mode: z
			.enum(["driving", "walking", "bicycling", "transit"])
			.default("driving")
			.describe("Travel mode"),
	}),
	handler: async (ctx) => {
		try {
			const travelMode = TRAVEL_MODE_MAP[ctx.req.mode] || "DRIVE";
			const response = await fetch(
				"https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Goog-Api-Key": ctx.env.GOOGLE_MAPS_API_KEY,
						"X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,duration,condition,localizedValues",
					},
					body: JSON.stringify({
						origins: ctx.req.origins.map((addr) => ({
							waypoint: { address: addr },
						})),
						destinations: ctx.req.destinations.map((addr) => ({
							waypoint: { address: addr },
						})),
						travelMode,
						...(travelMode === "DRIVE" || travelMode === "BICYCLE"
							? { routingPreference: "TRAFFIC_AWARE" }
							: {}),
					}),
				},
			);

			if (!response.ok) {
				const err = await response.json().catch(() => ({}));
				return ctx.res.error(
					(err as any)?.error?.message || `Routes API error: ${response.status}`,
				);
			}

			const elements = (await response.json()) as any[];

			// Restructure flat array into rows/elements matrix
			const numOrigins = ctx.req.origins.length;
			const numDestinations = ctx.req.destinations.length;
			const rows = Array.from({ length: numOrigins }, () => ({
				elements: Array.from({ length: numDestinations }, () => ({
					status: "ZERO_RESULTS" as string,
					distance: { text: "", value: 0 },
					duration: { text: "", value: 0 },
				})),
			}));

			for (const el of elements) {
				const oi = el.originIndex ?? 0;
				const di = el.destinationIndex ?? 0;
				if (oi < numOrigins && di < numDestinations) {
					const durationSec = el.duration ? parseDuration(el.duration) : 0;
					const distanceMeters = el.distanceMeters ?? 0;
					rows[oi]!.elements[di] = {
						status: el.condition === "ROUTE_EXISTS" ? "OK" : el.condition || "UNKNOWN",
						distance: {
							text: el.localizedValues?.distance?.text || formatDistance(distanceMeters),
							value: distanceMeters,
						},
						duration: {
							text: el.localizedValues?.duration?.text || formatDuration(durationSec),
							value: durationSec,
						},
					};
				}
			}

			return ctx.res.json({
				originAddresses: ctx.req.origins,
				destinationAddresses: ctx.req.destinations,
				rows,
			});
		} catch (e: any) {
			return ctx.res.error(e?.message || "Unknown error");
		}
	},
});

server.registerTool({
	name: "maps_directions",
	description: "Get turn-by-turn navigation directions between two locations",
	schema: z.object({
		origin: z.string().describe("Starting point address or coordinates"),
		destination: z.string().describe("Destination address or coordinates"),
		mode: z
			.enum(["driving", "walking", "bicycling", "transit"])
			.default("driving")
			.describe("Travel mode"),
		departureTime: z
			.string()
			.optional()
			.describe("Departure time as ISO 8601 string or 'now'"),
		arrivalTime: z
			.string()
			.optional()
			.describe("Arrival time as ISO 8601 string (transit mode only)"),
	}),
	handler: async (ctx) => {
		try {
			const { origin, destination, mode, departureTime, arrivalTime } = ctx.req;
			const travelMode = TRAVEL_MODE_MAP[mode] || "DRIVE";

			let departureTimeISO: string | undefined;
			let arrivalTimeISO: string | undefined;
			if (arrivalTime && arrivalTime !== "now") {
				arrivalTimeISO = new Date(arrivalTime).toISOString();
			} else if (departureTime === "now") {
				departureTimeISO = new Date().toISOString();
			} else if (departureTime) {
				departureTimeISO = new Date(departureTime).toISOString();
			}

			const fieldMask = [
				"routes.distanceMeters",
				"routes.duration",
				"routes.description",
				"routes.legs.distanceMeters",
				"routes.legs.duration",
				"routes.legs.steps.navigationInstruction",
				"routes.legs.steps.distanceMeters",
				"routes.legs.steps.staticDuration",
				"routes.legs.steps.travelMode",
				"routes.legs.steps.transitDetails",
			].join(",");

			const body: Record<string, any> = {
				origin: { address: origin },
				destination: { address: destination },
				travelMode,
				...(travelMode === "DRIVE" || travelMode === "BICYCLE"
					? { routingPreference: "TRAFFIC_AWARE" }
					: {}),
				...(departureTimeISO ? { departureTime: departureTimeISO } : {}),
				...(arrivalTimeISO ? { arrivalTime: arrivalTimeISO } : {}),
			};

			const response = await fetch(
				"https://routes.googleapis.com/directions/v2:computeRoutes",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Goog-Api-Key": ctx.env.GOOGLE_MAPS_API_KEY,
						"X-Goog-FieldMask": fieldMask,
					},
					body: JSON.stringify(body),
				},
			);

			if (!response.ok) {
				const err = await response.json().catch(() => ({}));
				return ctx.res.error(
					(err as any)?.error?.message || `Routes API error: ${response.status}`,
				);
			}

			const data = (await response.json()) as any;
			const routes = data.routes;
			if (!routes || routes.length === 0) {
				return ctx.res.error("No routes found");
			}

			const route = routes[0];
			const leg = route.legs?.[0];
			const legDurationSec = leg?.duration ? parseDuration(leg.duration) : 0;
			const legDistanceMeters = leg?.distanceMeters ?? 0;

			const steps = (leg?.steps || []).map((step: any) => {
				const stepDurationSec = step.staticDuration
					? parseDuration(step.staticDuration)
					: 0;
				const stepDistanceMeters = step.distanceMeters ?? 0;
				const mapped: Record<string, any> = {
					instruction:
						step.navigationInstruction?.instructions || "",
					distance: {
						text: formatDistance(stepDistanceMeters),
						value: stepDistanceMeters,
					},
					duration: {
						text: formatDuration(stepDurationSec),
						value: stepDurationSec,
					},
					travelMode: step.travelMode || travelMode,
				};
				if (step.transitDetails) {
					mapped.transitDetails = {
						stopDetails: {
							departureStop: step.transitDetails.stopDetails?.departureStop?.name,
							arrivalStop: step.transitDetails.stopDetails?.arrivalStop?.name,
						},
						departureTime: step.transitDetails.localizedValues?.departureTime?.time?.text || step.transitDetails.stopDetails?.departureTime,
						arrivalTime: step.transitDetails.localizedValues?.arrivalTime?.time?.text || step.transitDetails.stopDetails?.arrivalTime,
						headsign: step.transitDetails.headsign,
						line: {
							name: step.transitDetails.transitLine?.name,
							shortName: step.transitDetails.transitLine?.nameShort,
							agency: step.transitDetails.transitLine?.agencies?.[0]?.name,
							vehicleType: step.transitDetails.transitLine?.vehicle?.type,
						},
						numStops: step.transitDetails.stopCount,
					};
				}
				return mapped;
			});

			return ctx.res.json({
				summary: route.description || "",
				distance: {
					text: formatDistance(legDistanceMeters),
					value: legDistanceMeters,
				},
				duration: {
					text: formatDuration(legDurationSec),
					value: legDurationSec,
				},
				startAddress: origin,
				endAddress: destination,
				steps,
			});
		} catch (e: any) {
			return ctx.res.error(e?.message || "Unknown error");
		}
	},
});

export default server;
