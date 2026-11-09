#!/usr/bin/env python3
"""Build Replay-mode snapshots of historical wildfire smoke events.

Each snapshot is written to public/replay/<event-id>.json and lists every
layer in the *same field schema* as the live ArcGIS Living Atlas layer it
replaces, so the application renders and analyzes replay data with exactly
the same code path it uses for live data.

Sources (all public, no key required):
  * NOAA HMS smoke polygons (analyst-drawn, observed)  -> smoke layer
  * NOAA HMS fire detections (VIIRS/MODIS/GOES)        -> hotspots layer
  * NIFC WFIGS incident locations (ArcGIS)             -> US incidents
  * Hotspot clusters north of the border               -> Canada incidents (derived)
  * AirNow daily PM2.5 (24-hr average)                 -> air-quality stations

Usage:
  pip install pyshp
  python3 scripts/build_replay_snapshot.py            # all events
  python3 scripts/build_replay_snapshot.py 2023-06-07-northeast
"""
from __future__ import annotations

import hashlib
import io
import json
import math
import sys
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import shapefile  # pyshp

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "replay"
CACHE = Path(__file__).resolve().parent / ".cache"

# North America analysis extent (lon/lat).
BBOX = (-170.0, 15.0, -50.0, 75.0)

HMS_SMOKE = "https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/Smoke_Polygons/Shapefile/{y}/{m}/hms_smoke{ymd}.zip"
HMS_FIRE = "https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/Fire_Points/Text/{y}/{m}/hms_fire{ymd}.txt"
AIRNOW_DAILY = "https://files.airnowtech.org/airnow/{y}/{ymd}/daily_data_v2.dat"
AIRNOW_SITES = "https://files.airnowtech.org/airnow/{y}/{ymd}/Monitoring_Site_Locations_V2.dat"
WFIGS = "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations/FeatureServer/0/query"

# HMS density -> NWS smoke-forecast class string (µg/m³ band) used by the live layer.
# HMS "Light" plumes are frequently aloft, so they are kept as Trace (drawn, not
# counted as exposure); Medium and Heavy map to the Moderate and Heavy surface bands.
HMS_TO_CLASS = {"Light": "0 - 3", "Medium": "25 - 63", "Heavy": "63 - 158"}

EVENTS = [
    {
        "id": "2023-06-07-northeast",
        "date": "2023-06-07",
        "title": "Canadian smoke over the Northeast",
        "subtitle": "June 7, 2023",
        "description": (
            "Smoke from Quebec wildfires settled over New York City, Philadelphia and "
            "Washington, D.C., producing some of the worst air quality ever recorded in the Northeast."
        ),
        "center": [-75.0, 41.5],
        "zoom": 5,
    },
    {
        "id": "2023-06-28-midwest",
        "date": "2023-06-28",
        "title": "Canadian smoke over the Upper Midwest",
        "subtitle": "June 28, 2023",
        "description": (
            "A second wave of Canadian smoke pushed into Minnesota, Wisconsin, Illinois and "
            "Michigan; Chicago briefly reported the worst air quality of any major world city."
        ),
        "center": [-88.0, 43.0],
        "zoom": 5,
    },
    {
        "id": "2020-09-12-west-coast",
        "date": "2020-09-12",
        "title": "West Coast Labor Day fires",
        "subtitle": "September 12, 2020",
        "description": (
            "Wind-driven fires in Oregon, California and Washington blanketed the West Coast "
            "in dense smoke; Portland, Seattle and San Francisco recorded hazardous PM2.5."
        ),
        "center": [-121.0, 42.0],
        "zoom": 5,
    },
]


def fetch(url: str, binary: bool = False) -> bytes | str:
    CACHE.mkdir(exist_ok=True)
    key = CACHE / hashlib.sha1(url.encode()).hexdigest()
    if key.exists():
        data = key.read_bytes()
    else:
        req = urllib.request.Request(url, headers={"User-Agent": "replay-snapshot-builder"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = resp.read()
        key.write_bytes(data)
    return data if binary else data.decode("utf-8", errors="replace")


def in_bbox(lon: float, lat: float) -> bool:
    return BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]


def r(v: float, nd: int = 3) -> float:
    return round(v, nd)


def epoch_ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def build_smoke(ymd: str, y: str, m: str, valid_ms: int) -> list[dict]:
    raw = fetch(HMS_SMOKE.format(y=y, m=m, ymd=ymd), binary=True)
    zf = zipfile.ZipFile(io.BytesIO(raw))
    names = {Path(n).suffix: n for n in zf.namelist()}
    reader = shapefile.Reader(
        shp=io.BytesIO(zf.read(names[".shp"])),
        shx=io.BytesIO(zf.read(names[".shx"])),
        dbf=io.BytesIO(zf.read(names[".dbf"])),
    )
    feats = []
    for i, sr in enumerate(reader.iterShapeRecords()):
        density = str(sr.record["Density"]).strip()
        cls = HMS_TO_CLASS.get(density)
        if not cls:
            continue
        pts = sr.shape.points
        parts = list(sr.shape.parts) + [len(pts)]
        rings = []
        for a, b in zip(parts[:-1], parts[1:]):
            ring = [[r(x), r(yv)] for x, yv in pts[a:b]]
            if len(ring) >= 4:
                rings.append(ring)
        if not rings or not any(in_bbox(x, yv) for ring in rings for x, yv in ring):
            continue
        feats.append(
            {
                "attributes": {
                    "OBJECTID": i + 1,
                    "smoke_classdesc": cls,
                    "todate": valid_ms,
                    "referencedate": valid_ms,
                    "hms_density": density,
                },
                "geometry": {"rings": rings},
            }
        )
    return feats


def build_hotspots(ymd: str, y: str, m: str, valid: datetime) -> list[dict]:
    text = fetch(HMS_FIRE.format(y=y, m=m, ymd=ymd))
    cells: dict[tuple[int, int], dict] = {}
    for line in text.splitlines()[1:]:
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 8:
            continue
        try:
            lon, lat = float(parts[0]), float(parts[1])
            frp = float(parts[7])
        except ValueError:
            continue
        if not in_bbox(lon, lat):
            continue
        hhmm = parts[3].zfill(4)
        t = datetime.strptime(f"{ymd}{hhmm}", "%Y%m%d%H%M").replace(tzinfo=timezone.utc)
        # Thin duplicate multi-satellite detections to a ~2 km grid, keeping the strongest.
        key = (round(lon / 0.02), round(lat / 0.02))
        cur = cells.get(key)
        frp_val = frp if frp > 0 else None
        if cur is None or (frp_val or 0) > (cur["frp"] or 0):
            cells[key] = {"lon": lon, "lat": lat, "frp": frp_val, "t": t, "sat": parts[4]}
    feats = []
    for i, c in enumerate(cells.values()):
        hours_old = max(0, int((valid - c["t"]).total_seconds() // 3600))
        feats.append(
            {
                "attributes": {
                    "OBJECTID": i + 1,
                    "latitude": r(c["lat"], 4),
                    "longitude": r(c["lon"], 4),
                    "frp": c["frp"],
                    "acq_time": epoch_ms(c["t"]),
                    "satellite": c["sat"],
                    "hours_old": hours_old,
                },
                "geometry": {"x": r(c["lon"], 4), "y": r(c["lat"], 4)},
            }
        )
    return feats


def build_stations(ymd: str, y: str, valid_ms: int) -> list[dict]:
    try:
        sites = fetch(AIRNOW_SITES.format(y=y, ymd=ymd))
    except OSError:
        # Older archive days lack a site file; site metadata is stable, so use a later one.
        sites = fetch(AIRNOW_SITES.format(y="2023", ymd="20230607"))
    state_by_aqsid: dict[str, str] = {}
    for line in sites.splitlines()[1:]:
        p = line.split("|")
        if len(p) > 19 and p[3] == "PM2.5":
            state_by_aqsid[p[1]] = p[19]
    daily = fetch(AIRNOW_DAILY.format(y=y, ymd=ymd))
    feats = []
    for line in daily.splitlines():
        p = line.split("|")
        if len(p) < 12 or p[3] != "PM2.5-24hr":
            continue
        try:
            pm25 = float(p[5])
            aqi = float(p[8])
            lat, lon = float(p[10]), float(p[11])
        except ValueError:
            continue
        if not in_bbox(lon, lat) or pm25 < 0:
            continue
        feats.append(
            {
                "attributes": {
                    "ObjectId": len(feats) + 1,
                    "AQSID": p[1],
                    "SiteName": p[2],
                    "DataSource": p[7],
                    "StateName": state_by_aqsid.get(p[1]) or None,
                    "PM25": pm25,
                    "PM25_AQI": aqi,
                    "PM25_Measured": 1,
                    "Latitude": lat,
                    "Longitude": lon,
                    "ValidTime": valid_ms,
                },
                "geometry": {"x": r(lon, 4), "y": r(lat, 4)},
            }
        )
    return feats


def build_us_fires(date: str) -> list[dict]:
    d = datetime.strptime(date, "%Y-%m-%d")
    start = (d - timedelta(days=120)).strftime("%Y-%m-%d")
    where = (
        "IncidentTypeCategory='WF' AND IncidentSize >= 1000 "
        f"AND FireDiscoveryDateTime <= timestamp '{date} 23:59:59' "
        f"AND FireDiscoveryDateTime >= timestamp '{start} 00:00:00' "
        f"AND (FireOutDateTime IS NULL OR FireOutDateTime > timestamp '{date} 00:00:00') "
        f"AND (ContainmentDateTime IS NULL OR ContainmentDateTime > timestamp '{date} 00:00:00')"
    )
    q = urllib.parse.urlencode(
        {
            "where": where,
            "outFields": "IncidentName,IncidentSize,PercentContained,POOState,FireDiscoveryDateTime,FireCause,UniqueFireIdentifier",
            "outSR": 4326,
            "f": "json",
            "resultRecordCount": 2000,
        }
    )
    data = json.loads(fetch(f"{WFIGS}?{q}"))
    feats = []
    for i, f in enumerate(data.get("features", [])):
        a, g = f["attributes"], f.get("geometry")
        if not g:
            continue
        state = (a.get("POOState") or "").replace("US-", "")
        feats.append(
            {
                "attributes": {
                    "OBJECTID": i + 1,
                    "IncidentName": (a.get("IncidentName") or "Unnamed").title(),
                    "IncidentTypeCategory": "WF",
                    "UniqueFireIdentifier": a.get("UniqueFireIdentifier"),
                    "DailyAcres": a.get("IncidentSize"),
                    "PercentContained": a.get("PercentContained"),
                    "POOState": f"US-{state}" if state else None,
                    "FireDiscoveryDateTime": a.get("FireDiscoveryDateTime"),
                    "FireCause": a.get("FireCause"),
                },
                "geometry": {"x": r(g["x"], 4), "y": r(g["y"], 4)},
            }
        )
    return feats


def probably_canada(lon: float, lat: float) -> bool:
    """Coarse border test; adequate for labelling satellite fire clusters."""
    if lat >= 49.0:
        return lon > -141.0
    if lon > -95.2 and lat >= 45.0:
        # Ontario/Quebec/Maritimes south of 49N (excludes most of Minnesota, Michigan, Maine).
        if lon < -89.5:
            return lat > 48.0
        if lon < -82.5:
            return lat > 46.5
        if lon < -74.7:
            return lat > 45.0
        return lat > 47.3 or lon > -67.8
    return False


def build_canada_clusters(hotspots: list[dict]) -> list[dict]:
    """Aggregate Canadian hotspots into ~0.5° clusters standing in for incidents."""
    cells: dict[tuple[int, int], list[dict]] = {}
    for h in hotspots:
        a = h["attributes"]
        lon, lat = a["longitude"], a["latitude"]
        if lat > 70 or not probably_canada(lon, lat):
            continue
        cells.setdefault((math.floor(lon / 0.5), math.floor(lat / 0.5)), []).append(a)
    feats = []
    for (cx, cy), pts in cells.items():
        if len(pts) < 10:
            continue
        lon = sum(p["longitude"] for p in pts) / len(pts)
        lat = sum(p["latitude"] for p in pts) / len(pts)
        feats.append(
            {
                "attributes": {
                    "OBJECTID": len(feats) + 1,
                    "national_fire_id": f"HMS-{cx}-{cy}",
                    "agency_fire_id": f"Satellite fire cluster ({len(pts)} detections)",
                    "fire_type_ics": "Satellite-derived",
                    "fire_size": None,
                    "percent_contained": None,
                    "stage_of_control_status": "OC",
                },
                "geometry": {"x": r(lon, 4), "y": r(lat, 4)},
            }
        )
    return feats


def build_event(ev: dict) -> dict:
    date = ev["date"]
    y, m, dd = date.split("-")
    ymd = f"{y}{m}{dd}"
    valid = datetime(int(y), int(m), int(dd), 20, 0, tzinfo=timezone.utc)  # mid-afternoon Eastern
    valid_ms = epoch_ms(valid)
    print(f"[{ev['id']}] smoke…", flush=True)
    smoke = build_smoke(ymd, y, m, valid_ms)
    print(f"[{ev['id']}] hotspots…", flush=True)
    hotspots = build_hotspots(ymd, y, m, valid + timedelta(hours=4))
    print(f"[{ev['id']}] stations…", flush=True)
    stations = build_stations(ymd, y, valid_ms)
    print(f"[{ev['id']}] incidents…", flush=True)
    us_fires = build_us_fires(date)
    ca_fires = build_canada_clusters(hotspots)
    snap = {
        "schemaVersion": 1,
        "id": ev["id"],
        "title": ev["title"],
        "subtitle": ev["subtitle"],
        "description": ev["description"],
        "validTime": valid_ms,
        "createdAt": epoch_ms(datetime.now(timezone.utc)),
        "smokeKind": "observed",
        "view": {"center": ev["center"], "zoom": ev["zoom"]},
        "sources": [
            "NOAA Hazard Mapping System (HMS) smoke polygons",
            "NOAA HMS satellite fire detections",
            "NIFC WFIGS incident locations",
            "EPA AirNow daily PM2.5 (24-hour average)",
        ],
        "layers": {
            "smoke": smoke,
            "usFires": us_fires,
            "caFires": ca_fires,
            "perimeters": [],
            "hotspots": hotspots,
            "stations": stations,
        },
    }
    print(
        f"[{ev['id']}] smoke={len(smoke)} hotspots={len(hotspots)} stations={len(stations)} "
        f"usFires={len(us_fires)} caClusters={len(ca_fires)}"
    )
    return snap


def main() -> None:
    wanted = set(sys.argv[1:])
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    index = []
    for ev in EVENTS:
        path = OUT_DIR / f"{ev['id']}.json"
        if not wanted or ev["id"] in wanted:
            snap = build_event(ev)
            path.write_text(json.dumps(snap, separators=(",", ":")))
        index.append({k: ev[k] for k in ("id", "title", "subtitle", "description")} | {"file": f"{ev['id']}.json"})
    (OUT_DIR / "index.json").write_text(json.dumps(index, indent=2))
    print("done")


if __name__ == "__main__":
    main()
