import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import server from "./index";

const mockXtrnState = {
  idFromName: (_name: string) => ({ toString: () => _name }),
  get: (_id: unknown) => ({
    tryAcquire: async () => ({ allowed: true, activeRequests: 1 }),
    release: async () => 0,
    windDown: async () => ({ activeRequests: 0 }),
    getState: async () => ({}),
    reset: async () => {},
  }),
};

const callTool = (name: string, body: object) =>
  server.fetch(
    new Request(`http://localhost/tools/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { GOOGLE_MAPS_API_KEY: "test-api-key", XTRN_STATE: mockXtrnState }
  );

const mockMapsClient = (globalThis as any).__mockMapsClient as Record<
  string,
  (...args: any[]) => Promise<any>
>;

const mockPlace = {
  place_id: "test-id",
  name: "Test Place",
  formatted_address: "123 Test St",
  geometry: { location: { lat: 40.7, lng: -74.0 } },
  types: ["restaurant"],
  rating: 4.5,
  user_ratings_total: 100,
  price_level: 2,
};

const mockPlaceDetail = {
  ...mockPlace,
  formatted_phone_number: "+1-555-0123",
  international_phone_number: "+15550123",
  website: "https://example.com",
  opening_hours: {
    open_now: true,
    weekday_text: ["Monday: 9 AM – 5 PM"],
  },
  reviews: [
    {
      rating: 5,
      text: "Great!",
      author_name: "John",
      time: 1704067200,
    },
  ],
  editorial_summary: { overview: "A great place" },
};

let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
  originalFetch = globalThis.fetch;
  mockMapsClient.textSearch = async () => ({
    data: { status: "OK", results: [], html_attributions: [] },
  });
  mockMapsClient.placesNearby = async () => ({
    data: { status: "OK", results: [], html_attributions: [] },
  });
  mockMapsClient.placeDetails = async () => ({
    data: { status: "OK", result: {}, html_attributions: [] },
  });
  mockMapsClient.geocode = async () => ({
    data: { status: "OK", results: [] },
  });
  });

    afterEach(() => {
  globalThis.fetch = originalFetch;
});


describe("search_places", () => {
  test("happy path: returns mapped places array", async () => {
    let capturedParams: any;
    mockMapsClient.textSearch = async (req: any) => {
      capturedParams = req.params;
      return {
        data: { status: "OK", results: [mockPlace], html_attributions: [] },
      };
    };

    const res = await callTool("search_places", {
      textQuery: "pizza in New York",
      maxResultCount: 5,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("test-id");
    expect(body[0].name).toBe("Test Place");
    expect(body[0].address).toBe("123 Test St");
    expect(body[0].location).toEqual({ lat: 40.7, lng: -74.0 });
    expect(body[0].rating).toBe(4.5);

    expect(capturedParams.query).toBe("pizza in New York");
    expect(capturedParams.key).toBe("test-api-key");
  });

  test("with locationBias: passes location and radius to library", async () => {
    let capturedParams: any;
    mockMapsClient.textSearch = async (req: any) => {
      capturedParams = req.params;
      return {
        data: { status: "OK", results: [mockPlace], html_attributions: [] },
      };
    };

    await callTool("search_places", {
      textQuery: "coffee",
      locationBias: { latitude: 40.7, longitude: -74.0, radius: 3000 },
    });

    expect(capturedParams.location).toBe("40.7,-74");
    expect(capturedParams.radius).toBe(3000);
  });

  test("error: API returns non-OK status → tool returns error", async () => {
    mockMapsClient.textSearch = async () => ({
      data: {
        status: "REQUEST_DENIED",
        error_message: "API key invalid",
        results: [],
        html_attributions: [],
      },
    });

    const res = await callTool("search_places", { textQuery: "anything" });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("error: library throws → tool returns error", async () => {
    mockMapsClient.textSearch = async () => {
      throw new Error("Network error");
    };

    const res = await callTool("search_places", { textQuery: "anything" });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});


describe("search_nearby", () => {
  test("happy path: returns mapped nearby places", async () => {
    let capturedParams: any;
    mockMapsClient.placesNearby = async (req: any) => {
      capturedParams = req.params;
      return {
        data: { status: "OK", results: [mockPlace], html_attributions: [] },
      };
    };

    const res = await callTool("search_nearby", {
      latitude: 40.7128,
      longitude: -74.006,
      radius: 500,
      includedTypes: ["restaurant"],
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].id).toBe("test-id");
    expect(body[0].name).toBe("Test Place");
    expect(body[0].location).toEqual({ lat: 40.7, lng: -74.0 });

    expect(capturedParams.location).toBe("40.7128,-74.006");
    expect(capturedParams.radius).toBe(500);
    expect(capturedParams.type).toBe("restaurant");
    expect(capturedParams.key).toBe("test-api-key");
  });

  test("error: API returns non-OK status → tool returns error", async () => {
    mockMapsClient.placesNearby = async () => ({
      data: {
        status: "REQUEST_DENIED",
        error_message: "Request denied",
        results: [],
        html_attributions: [],
      },
    });

    const res = await callTool("search_nearby", {
      latitude: 40.7128,
      longitude: -74.006,
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});


describe("get_place_details", () => {
  test("happy path: returns full place detail object", async () => {
    let capturedParams: any;
    mockMapsClient.placeDetails = async (req: any) => {
      capturedParams = req.params;
      return {
        data: { status: "OK", result: mockPlaceDetail, html_attributions: [] },
      };
    };

    const res = await callTool("get_place_details", {
      placeId: "ChIJ-test-id",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.id).toBe("test-id");
    expect(body.name).toBe("Test Place");
    expect(body.address).toBe("123 Test St");
    expect(body.location).toEqual({ lat: 40.7, lng: -74.0 });
    expect(body.phone).toBe("+1-555-0123");
    expect(body.website).toBe("https://example.com");
    expect(body.openingHours.openNow).toBe(true);
    expect(body.openingHours.weekdayDescriptions).toEqual(["Monday: 9 AM – 5 PM"]);
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0].rating).toBe(5);
    expect(body.reviews[0].text).toBe("Great!");
    expect(body.reviews[0].authorName).toBe("John");
    expect(body.editorialSummary).toBe("A great place");

    expect(capturedParams.place_id).toBe("ChIJ-test-id");
    expect(capturedParams.key).toBe("test-api-key");
    expect(capturedParams.fields).toContain("name");
    expect(capturedParams.fields).toContain("reviews");
  });

  test("error: API returns non-OK status → tool returns error", async () => {
    mockMapsClient.placeDetails = async () => ({
      data: {
        status: "NOT_FOUND",
        error_message: "Place not found",
        result: {},
        html_attributions: [],
      },
    });

    const res = await callTool("get_place_details", {
      placeId: "non-existent-id",
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});


describe("maps_geocode", () => {
  test("happy path: returns location, formattedAddress, placeId", async () => {
    let capturedParams: any;
    mockMapsClient.geocode = async (req: any) => {
      capturedParams = req.params;
      return {
        data: {
          status: "OK",
          results: [
            {
              geometry: { location: { lat: 37.42, lng: -122.08 } },
              formatted_address: "1600 Amphitheatre Pkwy",
              place_id: "ChIJ2eUgeAK6j4ARbn5u_wAGqWA",
            },
          ],
        },
      };
    };

    const res = await callTool("maps_geocode", {
      address: "1600 Amphitheatre Parkway, Mountain View, CA",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.location).toEqual({ lat: 37.42, lng: -122.08 });
    expect(body.formattedAddress).toBe("1600 Amphitheatre Pkwy");
    expect(body.placeId).toBe("ChIJ2eUgeAK6j4ARbn5u_wAGqWA");

    expect(capturedParams.address).toBe(
      "1600 Amphitheatre Parkway, Mountain View, CA"
    );
    expect(capturedParams.key).toBe("test-api-key");
  });

  test("error: API returns ZERO_RESULTS → tool returns error", async () => {
    mockMapsClient.geocode = async () => ({
      data: { status: "ZERO_RESULTS", results: [] },
    });

    const res = await callTool("maps_geocode", {
      address: "xyzzy nonexistent address 99999",
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});


describe("maps_distance_matrix", () => {
  test("happy path: returns originAddresses, destinationAddresses, rows", async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = (async (input: any, init?: any) => {
      capturedUrl = typeof input === "string" ? input : input.url;
      capturedInit = init;
      return new Response(
        JSON.stringify([
          {
            originIndex: 0,
            destinationIndex: 0,
            condition: "ROUTE_EXISTS",
            distanceMeters: 346000,
            duration: "13500s",
            localizedValues: {
              distance: { text: "215 mi" },
              duration: { text: "3 hours 45 mins" },
            },
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const res = await callTool("maps_distance_matrix", {
      origins: ["New York, NY"],
      destinations: ["Boston, MA"],
      mode: "driving",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.originAddresses).toEqual(["New York, NY"]);
    expect(body.destinationAddresses).toEqual(["Boston, MA"]);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].elements[0].status).toBe("OK");
    expect(body.rows[0].elements[0].distance.text).toBe("215 mi");
    expect(body.rows[0].elements[0].distance.value).toBe(346000);
    expect(body.rows[0].elements[0].duration.text).toBe("3 hours 45 mins");
    expect(body.rows[0].elements[0].duration.value).toBe(13500);

    expect(capturedUrl).toBe(
      "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
    );
    const sentBody = JSON.parse(capturedInit?.body as string);
    expect(sentBody.origins[0].waypoint.address).toBe("New York, NY");
    expect(sentBody.destinations[0].waypoint.address).toBe("Boston, MA");
    expect(sentBody.travelMode).toBe("DRIVE");
    expect((capturedInit?.headers as any)["X-Goog-Api-Key"]).toBe("test-api-key");
  });

  test("restructures multi-origin multi-destination matrix", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify([
          { originIndex: 0, destinationIndex: 0, condition: "ROUTE_EXISTS", distanceMeters: 100, duration: "60s", localizedValues: { distance: { text: "100 m" }, duration: { text: "1 min" } } },
          { originIndex: 0, destinationIndex: 1, condition: "ROUTE_EXISTS", distanceMeters: 200, duration: "120s", localizedValues: { distance: { text: "200 m" }, duration: { text: "2 mins" } } },
          { originIndex: 1, destinationIndex: 0, condition: "ROUTE_EXISTS", distanceMeters: 300, duration: "180s", localizedValues: { distance: { text: "300 m" }, duration: { text: "3 mins" } } },
          { originIndex: 1, destinationIndex: 1, condition: "ROUTE_NOT_FOUND", distanceMeters: 0, duration: "0s", localizedValues: {} },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const res = await callTool("maps_distance_matrix", {
      origins: ["A", "B"],
      destinations: ["X", "Y"],
      mode: "walking",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0].elements).toHaveLength(2);
    expect(body.rows[0].elements[0].status).toBe("OK");
    expect(body.rows[0].elements[0].distance.value).toBe(100);
    expect(body.rows[0].elements[1].distance.value).toBe(200);
    expect(body.rows[1].elements[0].distance.value).toBe(300);
    expect(body.rows[1].elements[1].status).toBe("ROUTE_NOT_FOUND");
  });

  test("error: API returns non-OK HTTP → tool returns error", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({ error: { message: "API key missing" } }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const res = await callTool("maps_distance_matrix", {
      origins: ["New York, NY"],
      destinations: ["Boston, MA"],
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});


describe("maps_directions", () => {
  test("happy path: returns route summary, distance, steps", async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = (async (input: any, init?: any) => {
      capturedUrl = typeof input === "string" ? input : input.url;
      capturedInit = init;
      return new Response(
        JSON.stringify({
          routes: [
            {
              description: "I-95 N",
              distanceMeters: 346000,
              duration: "13500s",
              legs: [
                {
                  distanceMeters: 346000,
                  duration: "13500s",
                  steps: [
                    {
                      navigationInstruction: {
                        maneuver: "DEPART",
                        instructions: "Head north on Broadway",
                      },
                      distanceMeters: 160,
                      staticDuration: "60s",
                      travelMode: "DRIVE",
                    },
                  ],
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const res = await callTool("maps_directions", {
      origin: "New York, NY",
      destination: "Boston, MA",
      mode: "driving",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.summary).toBe("I-95 N");
    expect(body.distance).toEqual({ text: "215.0 mi", value: 346000 });
    expect(body.duration).toEqual({ text: "3 hours 45 mins", value: 13500 });
    expect(body.startAddress).toBe("New York, NY");
    expect(body.endAddress).toBe("Boston, MA");
    expect(body.steps).toHaveLength(1);
    expect(body.steps[0].instruction).toBe("Head north on Broadway");
    expect(body.steps[0].travelMode).toBe("DRIVE");
    expect(body.steps[0].distance.value).toBe(160);
    expect(body.steps[0].duration.value).toBe(60);

    expect(capturedUrl).toBe(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
    );
    const sentBody = JSON.parse(capturedInit?.body as string);
    expect(sentBody.origin.address).toBe("New York, NY");
    expect(sentBody.destination.address).toBe("Boston, MA");
    expect(sentBody.travelMode).toBe("DRIVE");
    expect((capturedInit?.headers as any)["X-Goog-Api-Key"]).toBe("test-api-key");
  });

  test("transit mode: returns transitDetails with stop and line info", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          routes: [
            {
              description: "Transit via Caltrain",
              distanceMeters: 50000,
              duration: "3600s",
              legs: [
                {
                  distanceMeters: 50000,
                  duration: "3600s",
                  steps: [
                    {
                      navigationInstruction: { instructions: "Walk to station" },
                      distanceMeters: 200,
                      staticDuration: "180s",
                      travelMode: "WALK",
                    },
                    {
                      navigationInstruction: { instructions: "" },
                      distanceMeters: 49000,
                      staticDuration: "3000s",
                      travelMode: "TRANSIT",
                      transitDetails: {
                        stopDetails: {
                          departureStop: { name: "Mountain View Station" },
                          arrivalStop: { name: "San Francisco 4th & King" },
                          departureTime: "2026-03-01T08:00:00Z",
                          arrivalTime: "2026-03-01T08:50:00Z",
                        },
                        headsign: "San Francisco",
                        transitLine: {
                          name: "Caltrain Local",
                          nameShort: "Local",
                          agencies: [{ name: "Caltrain" }],
                          vehicle: { type: "RAIL" },
                        },
                        localizedValues: {
                          departureTime: { time: { text: "8:00 AM" }, timeZone: "America/Los_Angeles" },
                          arrivalTime: { time: { text: "8:50 AM" }, timeZone: "America/Los_Angeles" },
                        },
                        stopCount: 3,
                      },
                    },
                  ],
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const res = await callTool("maps_directions", {
      origin: "Mountain View, CA",
      destination: "San Francisco, CA",
      mode: "transit",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.steps).toHaveLength(2);

    // Walking step has no transitDetails
    expect(body.steps[0].travelMode).toBe("WALK");
    expect(body.steps[0].transitDetails).toBeUndefined();

    // Transit step has full transitDetails
    const transit = body.steps[1];
    expect(transit.travelMode).toBe("TRANSIT");
    expect(transit.transitDetails).toBeDefined();
    expect(transit.transitDetails.stopDetails.departureStop).toBe("Mountain View Station");
    expect(transit.transitDetails.stopDetails.arrivalStop).toBe("San Francisco 4th & King");
    expect(transit.transitDetails.departureTime).toBe("8:00 AM");
    expect(transit.transitDetails.arrivalTime).toBe("8:50 AM");
    expect(transit.transitDetails.headsign).toBe("San Francisco");
    expect(transit.transitDetails.line.name).toBe("Caltrain Local");
    expect(transit.transitDetails.line.agency).toBe("Caltrain");
    expect(transit.transitDetails.line.vehicleType).toBe("RAIL");
    expect(transit.transitDetails.numStops).toBe(3);
  });

  test("error: API returns non-OK HTTP → tool returns error", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({ error: { message: "Route not found" } }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const res = await callTool("maps_directions", {
      origin: "nowhere",
      destination: "nowhere",
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("error: no routes in response → tool returns error", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({ routes: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const res = await callTool("maps_directions", {
      origin: "nowhere",
      destination: "nowhere",
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
