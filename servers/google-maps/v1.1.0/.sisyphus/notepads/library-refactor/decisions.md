## Decisions
- @googlemaps/places for tools 1, 2, 3 (searchText, searchNearby, getPlace)
- @googlemaps/routing for tools 5, 6 (computeRoutes, computeRouteMatrix)
- @googlemaps/google-maps-services-js for tool 4 only (geocode) — no @googlemaps/geocoding exists
- Response shapes MUST be preserved (external API unchanged)
- Single index.ts file structure maintained
- Client instantiation inside handlers (ctx.env only available there)
