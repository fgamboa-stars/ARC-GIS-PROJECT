import PopupTemplate from "@arcgis/core/PopupTemplate";

/** Popup templates written against Living Atlas field names (shared by live and replay layers). */

const num = (fieldName: string, label: string, places = 0) => ({
  fieldName,
  label,
  format: { digitSeparator: true, places },
});
const date = (fieldName: string, label: string) => ({
  fieldName,
  label,
  format: { dateFormat: "short-date-short-time" as const },
});

export const POPUPS = {
  usFire: new PopupTemplate({
    title: "{IncidentName}",
    content: [
      {
        type: "fields",
        fieldInfos: [
          num("DailyAcres", "Size (acres)"),
          num("PercentContained", "Contained (%)"),
          { fieldName: "POOState", label: "State" },
          date("FireDiscoveryDateTime", "Discovered"),
          { fieldName: "FireCause", label: "Cause" },
        ],
      },
    ],
  }),
  caFire: new PopupTemplate({
    title: "{agency_code} {agency_fire_id}",
    content: [
      {
        type: "fields",
        fieldInfos: [
          num("fire_size", "Size (hectares)"),
          {
            fieldName: "stage_of_control_status",
            label: "Stage of control (OC out of control · BH being held · UC under control)",
          },
          date("situation_report_date", "Last report"),
        ],
      },
    ],
  }),
  perimeter: new PopupTemplate({
    title: "{IncidentName}",
    content: [
      { type: "fields", fieldInfos: [num("GISAcres", "Mapped area (acres)"), date("PolygonDateTime", "Mapped")] },
    ],
  }),
  hotspot: new PopupTemplate({
    title: "Satellite fire detection",
    content: [
      {
        type: "fields",
        fieldInfos: [
          num("frp", "Fire radiative power (MW)", 1),
          num("hours_old", "Hours since detection"),
          date("acq_time", "Detected"),
        ],
      },
    ],
  }),
  station: new PopupTemplate({
    title: "{SiteName}",
    content: [
      {
        type: "fields",
        fieldInfos: [
          num("PM25", "PM2.5 (µg/m³)", 1),
          num("PM25_AQI", "PM2.5 AQI"),
          { fieldName: "StateName", label: "State" },
          date("ValidTime", "Observed"),
        ],
      },
    ],
  }),
  smoke: new PopupTemplate({
    title: "Smoke: {smoke_classdesc} µg/m³",
    content: [
      {
        type: "fields",
        fieldInfos: [date("todate", "Valid time"), { fieldName: "hms_density", label: "HMS density" }],
      },
    ],
  }),
};
