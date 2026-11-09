# Who's Breathing Wildfire Smoke Right Now?

A live geospatial intelligence dashboard that answers one question: **where is wildfire smoke today, how severe is it, and which communities (especially children and adults 65+) are breathing it?** The app pulls current wildfire, smoke forecast, satellite and air-quality layers from ArcGIS Living Atlas, overlays the NWS smoke forecast on U.S. Census tracts in the browser, and turns the result into exposure totals, a tract-level Smoke Risk Score, community rankings and plain-language findings. A Replay mode runs the same analysis on archived major smoke events, so the dashboard stays useful outside fire season.

## Features

- **Live map**: active U.S. and Canadian wildfires, fire perimeters, VIIRS hotspots, hourly NWS smoke forecast, AirNow PM2.5 monitors, AQI surface, census tracts
- **Layer controls**: toggles, opacity, fire-size and containment filters, hotspot age, tract shading
- **Time filtering**: 48-hour forecast slider with *selected hour*, *24 h peak* and *48 h peak* analysis windows
- **Exposure analysis**: residents, children (<18) and adults 65+ inside smoke, by severity band, updated as filters change
- **Smoke Risk Score** (0–100, Low / Moderate / High / Extreme) from fire, air and vulnerability factors
- **Community detail**: location, smoke category, PM2.5, nearby fires, vulnerability metrics and score breakdown for any tract
- **Top communities**: rankings by exposure, senior exposure, child exposure, worst air and risk, at county or tract level
- **Automated findings**: generated from the live analysis, including observed PM2.5 compared with the forecast by region
- **Replay mode**: three bundled historical events, plus saving live snapshots and loading them back
- Light and dark themes, responsive and mobile layouts, keyboard-accessible controls

## Data Sources (ArcGIS Living Atlas)

| Layer | Use |
| --- | --- |
| USA Current Wildfires (incidents, perimeters) | Fire locations, size, containment |
| Canada Current Wildfires (incidents, perimeters) | Cross-border fire activity |
| Satellite (VIIRS) Thermal Hotspots and Fire Activity | Recent detections, hotspot density |
| NWS / NDGD Smoke Forecast | Hourly near-surface smoke, 48 hours |
| AirNow Air Quality Monitoring Site Data (Current) | Observed PM2.5 and AQI |
| AirNow Latest AQI Contours | Interpolated AQI surface |
| ACS Total Population — Census Tracts | Population, children, adults 65+, land area |

Replay snapshots come from NOAA HMS smoke and fire archives, EPA AirNow daily files and NIFC WFIGS. See [docs/data-sources.md](docs/data-sources.md).

## Technology Stack

- React 19, TypeScript (strict), Vite
- ArcGIS Maps SDK for JavaScript 5.2 (MapView, FeatureLayer, geometry operators)
- Vitest, ESLint (typescript-eslint strict, React Hooks), Prettier

## Local Development

Requires Node.js 20.19 or newer.

```bash
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

```bash
npm run build        # type-check and production build to dist/
npm run preview      # serve the production build
npm test             # unit tests (analysis engine, normalization, replay snapshots)
npm run lint         # ESLint
npm run replay:build # rebuild replay snapshots (Python 3 + `pip install pyshp`)
```

No API key is needed: every layer is public. To use your own key (higher rate limits), copy `.env.example` to `.env` and set `VITE_ARCGIS_API_KEY`.

## Documentation

- [Architecture](docs/architecture.md)
- [Data sources](docs/data-sources.md)
- [Analysis methodology](docs/analysis-methodology.md)

## Future Enhancements

- Canadian population exposure using Statistics Canada dissemination areas
- Area-weighted apportionment for large rural tracts, in a Web Worker
- Additional vulnerability inputs: asthma prevalence, outdoor workers, housing quality (CDC PLACES, SVI)
- Exposure trends across successive forecast runs, plus alert subscriptions
- Bundled replay events for Canada and Alaska; scheduled snapshot capture
