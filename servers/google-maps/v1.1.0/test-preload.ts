import { mock } from "bun:test";

mock.module("cloudflare:workers", () => ({
  DurableObject: class DurableObject {},
}));


// Mock @googlemaps/google-maps-services-js so handlers use controllable Client methods
const mockMapsClient: Record<string, (...args: any[]) => Promise<any>> = {
	textSearch: async () => ({ data: { status: "OK", results: [], html_attributions: [] } }),
	placesNearby: async () => ({ data: { status: "OK", results: [], html_attributions: [] } }),
	placeDetails: async () => ({ data: { status: "OK", result: {}, html_attributions: [] } }),
	geocode: async () => ({ data: { status: "OK", results: [] } }),
};

(globalThis as any).__mockMapsClient = mockMapsClient;

mock.module("@googlemaps/google-maps-services-js", () => ({
	Client: class MockClient {
		textSearch(...args: any[]) {
			return mockMapsClient.textSearch(...args);
		}
		placesNearby(...args: any[]) {
			return mockMapsClient.placesNearby(...args);
		}
		placeDetails(...args: any[]) {
			return mockMapsClient.placeDetails(...args);
		}
		geocode(...args: any[]) {
			return mockMapsClient.geocode(...args);
		}
	},
	Status: {
		OK: "OK",
		ZERO_RESULTS: "ZERO_RESULTS",
		NOT_FOUND: "NOT_FOUND",
		INVALID_REQUEST: "INVALID_REQUEST",
		REQUEST_DENIED: "REQUEST_DENIED",
		OVER_QUERY_LIMIT: "OVER_QUERY_LIMIT",
		UNKNOWN_ERROR: "UNKNOWN_ERROR",
	},
}));

Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "Cloudflare-Workers" },
  writable: true,
  configurable: true,
});
