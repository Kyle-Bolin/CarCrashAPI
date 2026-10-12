# ADR-005: Website architecture

- **Status:** Proposed
- **Date:** 2026-10-12
- **Issue:** #63 (epic #62)

## Context

The API so far only lists raw crashes. The next goal is a public website that shows where crashes cluster and who is responsible for those places. The owner wants four things, built in this order on one map:

1. **Map:** hotspots shaded by crash count, with filters, and a panel for each hotspot.
2. **Responsibility:** for a hotspot, who owns and maintains the road, which governments it falls in, and their contacts and elected officials.
3. **Stats:** charts for whatever area the map is showing.
4. **Route:** hotspots near an address or along a commute.

Constraints:

- **Budget.** ADR-002 caps AWS spend at $25 per month in total. Nothing on the site should bill per hour while idle, and no paid map or data service.
- **Scale.** The hosted data is millions of rows. A browser can't draw or download that, so the server must aggregate.
- **Small database.** RDS is a `db.t4g.micro` with 1 GB of RAM (ADR-002), so aggregation has to be index-friendly.
- **Several data sources.** ADR-004 (data source, in progress) adds live city feeds next to US Accidents. Each crash carries a `source`, and severity means different things per source, so the site never blends severity across sources.
- **Same repo, same process.** Typed, tested and deployed by the same pipeline as the API, with no manual verification steps.

## Options considered

### Frontend framework

- **Vite + React SPA (proposed).** A static build that S3 and CloudFront can serve. The largest ecosystem for maps and charts, and familiar to most reviewers.
- **Next.js.** Server rendering adds little to a map-first app, and hosting it on AWS needs Lambda@Edge or a container, which adds cost and moving parts.
- **SvelteKit (static adapter).** Smaller bundles and pleasant to write, but a smaller ecosystem for map and chart components.

### Map library and basemap

- **MapLibre GL JS with OpenStreetMap-based vector tiles (proposed).** Open source and free. Start with a free hosted style such as OpenFreeMap; if that becomes unreliable, self-host a US extract as a Protomaps PMTiles file on the same S3 bucket, which costs cents per month.
- **Mapbox GL or Google Maps.** Polished, but they need API keys and bill per map load past their free tiers. Not worth the risk for a public demo.
- **Leaflet.** Simple, but raster-first, and it struggles with thousands of shaded polygons.

### How hotspots are computed

- **Precomputed H3 cells, counted in Postgres (proposed).** The loader computes H3 cell IDs for each crash at a few fixed resolutions (for example 5, 7 and 9, from roughly county-sized down to block-sized) with `h3-js`, and stores them in indexed columns. The hotspots endpoint is then a `GROUP BY` over one indexed column, filtered by the cells in the map's bounding box. Hexagons tile evenly, so counts are comparable across the map. No database extension is needed.
- **PostGIS clustering on the fly (`ST_SnapToGrid`, `ST_ClusterDBSCAN`).** Flexible, but it computes geometry per request, which is slow on a 1 GB instance at this row count.
- **Pre-rendered vector tiles of crash points.** Fast to display, but every filter change needs a new tile set, and the counts behind a hotspot aren't queryable.

### Repository layout and API client

- **`web/` as a pnpm workspace package, with a client generated from `openapi.json` (proposed).** One pull request can change an endpoint and the page that uses it. CI fails if the generated client is stale, the same way it already checks `openapi.json`.
- **A separate repository.** Cleaner ownership, but contract changes would need two coordinated pull requests.

### Hosting

- **S3 + CloudFront, with `/v1/*` routed to API Gateway through the same distribution (proposed).** Static hosting costs cents per month at this traffic, and CloudFront's free tier likely covers it. One origin means no CORS, and CloudFront can cache hotspot responses, which shields the database.
- **Amplify Hosting.** Less setup, but less control in Terraform and another service to learn for little gain.

### Responsibility data

| Question | Source | Notes |
| --- | --- | --- |
| Who owns the road | FHWA's Highway Performance Monitoring System (HPMS) road segments, with their ownership code | Public domain. Coverage is strongest on federal-aid roads and thinner on local streets. |
| Which governments the point is in | Census TIGER/Line boundaries: state, county, place, state legislative and congressional districts | Public domain, updated yearly. |
| Members of Congress | `unitedstates/congress-legislators` | Public domain, community maintained. |
| State legislators | Open States API | Free with an API key. |
| Local officials and public works contacts | The covered city's own open data, or a small curated file with sources | No free nationwide source exists. |

Alternatives for officials: Google's Civic Information "representatives" API used to cover all levels for free, but Google shut it down in 2025. Paid services (Cicero, BallotReady) cover local officials nationwide but would break the budget.

Matching a crash to a road segment needs a nearest-line lookup, which needs PostGIS. RDS PostgreSQL supports the PostGIS extension, so it can be added by migration. This can stay a one-time step in the loader (store the segment's owner on each crash) rather than a per-request query.

### Route view

- **Amazon Location Service for geocoding and routing, called from the API (proposed).** Pay per request with no idle cost, managed in Terraform, and keys never reach the browser. The API throttles requests and an alarm caps spend.
- **Self-hosted OSRM or Valhalla.** Free per request, but needs an always-on server with several GB of RAM, which breaks the budget.
- **Public Nominatim and OSRM demo servers.** Their usage policies forbid this kind of production use.

## Decision

Proposed:

1. **Frontend:** Vite + React + TypeScript (strict) in `web/`, linted with Biome and tested with Vitest and Playwright, using a typed client generated from `openapi.json`.
2. **Map:** MapLibre GL JS on free OpenStreetMap-based vector tiles, with self-hosted PMTiles as the fallback.
3. **Hotspots:** H3 cells precomputed by the loader at fixed resolutions, counted in Postgres, and served by `GET /v1/hotspots` (#64). Filters (dates, severity, source) and the map position live in the URL so any view can be shared.
4. **Hosting:** S3 + CloudFront in front of both the site and the API (#66), deployed by the existing pipeline.
5. **Responsibility:** HPMS ownership and TIGER boundaries for every hotspot (#67). Elected officials at the federal and state level everywhere, and local officials only for the city covered in depth (#68). Every record shows its source and as-of date. The panel is framed as "who to contact", since a hotspot reflects traffic volume as much as road design.
6. **Stats** (#69) is a tab over the same filters and area. **Route** (#70) uses Amazon Location Service through the API.
7. **Build order:** hotspots endpoint, then map and hosting, then responsibility, then stats and route.

**Recommendation:** accept. This is the cheapest design that serves millions of rows to a map on the smallest RDS instance, and each layer reuses the one before it, so stopping after any layer still leaves a working site.

## Consequences

- **Good:** idle cost stays near zero beyond ADR-002's database. One repository, one pipeline and one generated contract cover both API and site. Hotspot queries are a single indexed `GROUP BY`, and CloudFront caches them.
- **Bad:** hotspot shapes are fixed to the chosen H3 resolutions, so changing them means re-running the loader. Local officials are only available for the covered city. HPMS ownership is incomplete on local streets, so the panel falls back to the jurisdiction the point sits in (the city if incorporated, otherwise the county). The free basemap has no SLA.
- **Follow-ups:**
  - Accept ADR-004 first, since this ADR assumes its `source` column and per-source severity.
  - Measure index sizes for the H3 columns on a `t4g.micro`-sized instance before fixing the resolutions (#64).
  - Decide in #67 whether PostGIS is worth adding, or whether ownership can be precomputed outside the database.
  - Set an Amazon Location Service usage alarm when #70 lands, and record its actual cost in ADR-002.
  - Add a "Phase 5: website" row to the roadmap (#2) once this ADR is accepted.
