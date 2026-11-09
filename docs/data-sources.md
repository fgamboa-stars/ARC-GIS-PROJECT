# Data Sources

All live layers are public ArcGIS Living Atlas feature services and need no API key. URLs and field names are defined once, in `src/config/services.ts`.

## Live layers

| Layer | Service (item ID) | Update frequency | Purpose in the application |
| --- | --- | --- | --- |
| **USA Current Wildfires: incidents** | `USA_Wildfires_v1/FeatureServer/0` (d957997ccee7408287a963600a77f61f) | ~15 min (IRWIN) | Active U.S. wildfires (`IncidentTypeCategory = 'WF'`). Name, acres, containment and state for popups. Drives the fire proximity and fire-count factors. |
| **USA Current Wildfires: perimeters** | `…/FeatureServer/1` | ~15 min (NIFC) | Map display of mapped fire extents. |
| **Canada Current Wildfires: incidents** | `…/FeatureServer/2` | Hourly (CIFFC) | Active Canadian fires (`stage_of_control_status <> 'OUT'`). Sizes are in hectares and converted to acres. Feeds the same fire factors, so border communities see Canadian fires. |
| **Canada Current Wildfires: perimeters** | `…/FeatureServer/3` | Daily (CWFIS) | Map display. |
| **Satellite (VIIRS) Thermal Hotspots and Fire Activity** | `Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0` (dece90af1a0242dcbf0ca36d30276aa3) | ~15 min (NASA FIRMS) | Recent detections over North America, up to 7 days old (`hours_old`). Drives the hotspot-density factor and the hotspot-age filter. |
| **NWS Smoke Forecast (NDGD)** | `NDGD_SmokeForecast_v1/FeatureServer/0` (a98fd08751a5480c898b7cebe38807f4) | Hourly time steps, ~48 h horizon, refreshed with each model run | Near-surface smoke polygons by concentration class (`smoke_classdesc`: 0–3, 3–25, 25–63, 63–158, 158–1000 µg/m³) and valid time (`todate`). The core exposure input; also powers the time slider. Covers the contiguous United States. |
| **AirNow Air Quality Monitoring Site Data (Current)** | `Air Now Current Monitor Data Public/FeatureServer/0` (2d718d2733a74d1689d72b922c0ac4f4) | Hourly (EPA AirNow) | Observed PM2.5 (`PM25`) and AQI at about 2,000 North American monitors. Used for tract PM2.5 interpolation, the observed-vs-forecast comparison and the worst-reading finding. |
| **AirNow Latest AQI Contours** | `AirNowLatestContoursCombined/FeatureServer/0` (ad7046a2b3854c25aea8945b3baac0a7) | Hourly | Optional interpolated AQI surface (`gridcode` 1–6). Display only. |
| **ACS Total Population: Census Tracts** | `ACS_Total_Population_Boundaries/FeatureServer/2` (f430d25bf03744edbb1579e18c4bf6b8) | Annually (ACS 5-year) | Tract polygons and `B01001_001E` (population), `B01001_calc_numLT18E` (children), `B01001_calc_numGE65E` (65+), `ALAND` (density). The demographic base for all exposure numbers. |
| **Light / Dark Gray Canvas** | Vector tile styles 291da5eab3a0412593b66d384379f89f, 5e9b3685f4c24d8781073dd928ebda50 (+ reference layers) | — | Basemaps for light and dark themes. |

## Replay sources

Replay snapshots (`public/replay/*.json`) are built by `scripts/build_replay_snapshot.py` from public archives and written in the live layers' field schemas.

| Source | Mapped to | Notes |
| --- | --- | --- |
| NOAA Hazard Mapping System (HMS) smoke polygons | Smoke layer | Satellite-analyst plumes with Light, Medium or Heavy density. HMS describes the whole atmospheric column, so **Light → Trace** (drawn, not counted as exposure), **Medium → Moderate (25–63)** and **Heavy → Heavy (63–158)**. |
| NOAA HMS fire detections | Hotspots | VIIRS, MODIS and GOES detections, thinned to a ~2 km grid keeping the highest FRP. |
| NIFC WFIGS Incident Locations | U.S. incidents | Wildfires ≥ 1,000 acres discovered in the previous 120 days and not yet out or contained on the event date. |
| HMS hotspot clusters | Canadian incidents | Derived: 0.5° cells north of the border with ≥ 10 detections, labelled "Satellite fire cluster". |
| EPA AirNow daily files (`daily_data_v2.dat`) | PM2.5 monitors | 24-hour average PM2.5 and AQI with site coordinates; state from the site-location file. |

Bundled events:

| Event | Date | Why it matters |
| --- | --- | --- |
| Canadian smoke over the Northeast | 2023-06-07 | Record PM2.5 in New York City, Philadelphia and Washington, D.C. |
| Canadian smoke over the Upper Midwest | 2023-06-28 | Chicago and Minneapolis among the world's worst air quality |
| West Coast Labor Day fires | 2020-09-12 | Hazardous smoke across Oregon, Washington and California |

## Saved snapshots

In Live mode, **Save snapshot** downloads the selected forecast hour, current fires, perimeters, hotspots and monitors as a snapshot file. **Load snapshot** in Replay mode reads it back. Snapshots are validated (`src/types/snapshot.ts`) before use.

## Coverage limits

- The smoke forecast and ACS demographics cover the **United States only**. Canadian fires and monitors still shape the risk factors of U.S. tracts near the border, but Canadian residents are not counted.
- AirNow monitor density varies: rural tracts often have no monitor within 50 km and fall back to the smoke band's midpoint.
