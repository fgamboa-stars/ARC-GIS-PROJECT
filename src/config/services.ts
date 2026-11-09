/**
 * ArcGIS Living Atlas service registry.
 *
 * Every remote dependency of the application is declared here so that URLs,
 * field names and query filters live in exactly one place.
 */

const ESRI_LIVE = "https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services";
const ESRI_DEMOGRAPHICS = "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services";
const AIRNOW = "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services";

/** North America analysis extent in WGS84 (xmin, ymin, xmax, ymax). */
export const NORTH_AMERICA_BBOX = [-170, 15, -50, 75] as const;

export const SERVICES = {
  usFires: {
    title: "USA Current Wildfires",
    url: `${ESRI_LIVE}/USA_Wildfires_v1/FeatureServer/0`,
    itemId: "d957997ccee7408287a963600a77f61f",
    where: "IncidentTypeCategory = 'WF'",
    updateFrequency: "Every 15 minutes (IRWIN)",
  },
  usPerimeters: {
    title: "USA Current Fire Perimeters",
    url: `${ESRI_LIVE}/USA_Wildfires_v1/FeatureServer/1`,
    itemId: "d957997ccee7408287a963600a77f61f",
    where: "1=1",
    updateFrequency: "Every 15 minutes (NIFC)",
  },
  caFires: {
    title: "Canada Current Wildfires",
    url: `${ESRI_LIVE}/USA_Wildfires_v1/FeatureServer/2`,
    itemId: "d957997ccee7408287a963600a77f61f",
    where: "stage_of_control_status <> 'OUT'",
    updateFrequency: "Hourly (CIFFC)",
  },
  caPerimeters: {
    title: "Canada Current Fire Perimeters",
    url: `${ESRI_LIVE}/USA_Wildfires_v1/FeatureServer/3`,
    itemId: "d957997ccee7408287a963600a77f61f",
    where: "1=1",
    updateFrequency: "Daily (CWFIS)",
  },
  hotspots: {
    title: "Satellite (VIIRS) Thermal Hotspots and Fire Activity",
    url: `${ESRI_LIVE}/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0`,
    itemId: "dece90af1a0242dcbf0ca36d30276aa3",
    where: "1=1",
    updateFrequency: "Every 15 minutes (NASA FIRMS)",
  },
  smoke: {
    title: "NWS Smoke Forecast (NDGD)",
    url: `${ESRI_LIVE}/NDGD_SmokeForecast_v1/FeatureServer/0`,
    itemId: "a98fd08751a5480c898b7cebe38807f4",
    where: "smoke_classdesc <> '0 - 3'",
    updateFrequency: "Hourly forecasts, refreshed daily (NOAA NDGD / HRRR-Smoke)",
  },
  stations: {
    title: "AirNow Air Quality Monitoring Site Data (Current)",
    url: `${AIRNOW}/Air%20Now%20Current%20Monitor%20Data%20Public/FeatureServer/0`,
    itemId: "2d718d2733a74d1689d72b922c0ac4f4",
    where: "PM25_Measured = 1",
    updateFrequency: "Hourly (EPA AirNow)",
  },
  aqiContours: {
    title: "AirNow Latest AQI Contours",
    url: `${AIRNOW}/AirNowLatestContoursCombined/FeatureServer/0`,
    itemId: "ad7046a2b3854c25aea8945b3baac0a7",
    where: "1=1",
    updateFrequency: "Hourly (EPA AirNow)",
  },
  tracts: {
    title: "ACS Total Population — Census Tracts",
    url: `${ESRI_DEMOGRAPHICS}/ACS_Total_Population_Boundaries/FeatureServer/2`,
    itemId: "f430d25bf03744edbb1579e18c4bf6b8",
    where: "B01001_001E > 0",
    updateFrequency: "Annually (ACS 5-year estimates)",
  },
} as const;

export type ServiceKey = keyof typeof SERVICES;

/** ACS tract fields consumed by the analysis. */
export const TRACT_FIELDS = {
  id: "GEOID",
  name: "NAME",
  state: "State",
  county: "County",
  landArea: "ALAND",
  population: "B01001_001E",
  children: "B01001_calc_numLT18E",
  seniors: "B01001_calc_numGE65E",
  pctChildren: "B01001_calc_pctLT18E",
  pctSeniors: "B01001_calc_pctGE65E",
} as const;

/** Vector-tile basemap style items (public; no API key required). */
export const BASEMAPS = {
  light: { base: "291da5eab3a0412593b66d384379f89f", reference: "1768e8369a214dfab4e2167d5c5f2454" }, // Light Gray Canvas
  dark: { base: "5e9b3685f4c24d8781073dd928ebda50", reference: "747cb7a5329c478cbe6981076cc879c5" }, // Dark Gray Canvas
} as const;
