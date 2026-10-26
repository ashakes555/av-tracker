# AV Tracker dataset (v1)

Built by `tools/build_data.py` from curated files in `data/curated/` and snapshots of external sources in `ext/`.
**Do not hand-edit the generated files** (`data/*.json`, `data/areas/`). Edit `data/curated/*.json` and rebuild:

```
cd av-tracker && .venv/bin/python tools/build_data.py
```

Rule: **no invented numbers.** Every value has a `source_url`. Anything computed is labeled `derived` and records a `method`. Anything not published is listed as a gap, not filled in.

## Files

| File | Contents |
|---|---|
| `operators.json` | `[{id, name, parent, website}]` |
| `markets.json` | One row per operator × city (see below) |
| `series.json` | Time series (vehicles, area, usage) at market, state, or company scope |
| `events.json` | Dated events: launches, expansions, supervision changes, fares… |
| `areas/<market>/<date>_<dataset>.geojson` | Service-area polygons behind each area point; `areas/index.json` lists them |
| `sources.json` | `datasets` (license/attribution of bulk sources) + `urls` (every cited URL, count of uses, type) |
| `meta.json` | `generated_at`, `data_as_of`, status ladder & definitions, metric definitions, confidence definitions, warnings |
| `curated/markets.json` | Hand-maintained market list + status history (the source of truth for statuses) |
| `curated/points.json` | Hand-entered numeric points from press/official posts |
| `curated/events.json` | Hand-entered events (mostly May 2026 onward, after the av-map snapshot) |

## markets.json

```jsonc
{
  "id": "tesla-austin", "operator": "tesla",
  "city": "Austin", "metro": "Austin", "state": "TX", "country": "US",
  "status": "paid-public",                // current = last status_history entry
  "status_history": [{"date": "2025-06-22", "status": "safety-driver", "source_url": "…", "note": "…"}],
  "key_dates": {"announced", "testing", "public_with_safety_driver", "driverless_employees",
                "public_driverless", "paid_driverless", "ended"},   // first date reaching each stage, or null
  "launch_date": "…",                     // first date the public could ride (any supervision level)
  "series": ["tesla-austin-area", …], "area_files": ["areas/tesla-austin/…geojson", …],
  "notes": "…", "avmap_city": ["Austin"]  // aliases used to match av-map-data rows
}
```

### Status ladder (`meta.statuses`)

| status | meaning |
|---|---|
| `announced` | **Added beyond the brief:** a city was publicly named, but there's no evidence of on-road testing yet |
| `testing` | AVs on public roads with safety drivers, no public riders |
| `safety-driver` | Public riders, but a safety driver or in-car safety monitor is present |
| `driverless-employees` | No one in the driver's seat; riders are employees or invitees only |
| `public-driverless` | Public riders with no one in the driver's seat, free or not yet charging |
| `paid-public` | Public riders paying fares, driverless (at least part of the fleet) |
| `ended` | Service shut down |

Tesla: in-car "safety monitor" in the passenger seat counts as `safety-driver`. Austin moved to `paid-public` on 2026-01-22, when unsupervised rides began, but the fleet is **mixed**: most rides still had a monitor for months afterward.

## series.json

```jsonc
{
  "id": "tesla-austin-miles", "operator": "tesla", "metric": "driverless_miles_cum",
  "scope": "market|state|company", "market": "tesla-austin", "state": "TX", "country": "US",
  "unit": "miles", "kind": "level|cumulative|rate", "family": "vehicles|area|usage",
  "label": "…", "description": "…", "method": "…", "first_date": "…", "last_date": "…",
  "points": [{
    "date": "2026-10-18", "value": 2118015,
    "source_url": "https://www.tesla.com/robotaxi/safety",
    "confidence": "reported|derived|estimate",
    "source_type": "official|regulator|third-party-tracker|press",
    // optional: note, method, dataset (avmap|rtt), area_file, week_start, vintage, curated
  }]
}
```

### Confidence

- **reported**: the value is printed by the source exactly, or read from the source's embedded data.
- **derived**: computed from reported inputs with a recorded method, such as polygon area or a sum across cities.
- **estimate**: a judgment-based estimate. v1 has none.

### Metrics

| metric | meaning | who |
|---|---|---|
| `vehicles` | Fleet size (registered or company-stated) | Waymo company; TX registry (Waymo, Tesla, Zoox, Avride), **statewide** |
| `vehicles_driverless` | Vehicles running with no safety monitor | Tesla Austin/Dallas/Houston, one point (Electrek, 2026-04-30) |
| `area_sq_mi` | Service-area size | Most public markets, plus Waymo's company total |
| `driverless_miles_cum` | Cumulative miles **with no safety monitor in the car** (remote assistance may be involved), since 2026-01-22 | Tesla, per city, weekly |
| `ro_miles_cum` | Cumulative rider-only (no driver) miles since launch | Waymo, per location, quarterly |
| `autonomous_miles_cum` | Cumulative autonomous miles, including testing | Zoox company (one point) |
| `paid_rides_week` | Paid rides per week (company statements) | Waymo |
| `miles_week` | Autonomous miles per week (company statements) | Waymo |
| `riders_cum` | Cumulative unique riders | Zoox (one point) |

Scope rule: company figures stay at company scope, and state registry counts stay at state scope. Nothing is split down to cities. **No per-city ride counts in v1.** No operator publishes them. A per-city split would need to allocate company rides by miles, which is an assumption, so it's left out.

### Area method

Area is geodesic, computed with `pyproj.Geod(ellps="WGS84").geometry_area_perimeter`. The polygon is first passed through `shapely.make_valid` and unioned. Units are sq mi (m² / 2,589,988.11).

A market's polygon is the union of the latest polygon of every alias. For example, Waymo "San Francisco Bay Area" = SF ∪ Silicon Valley ∪ peninsula/freeway pieces.

Polygon sources:
- **av-map-data** (MIT, snapshot 2026-05-14): one polygon per dated av-map event.
- **Robotaxi Tracker `robotaxi-service-areas`** (CC BY 4.0): git history. Each day's last commit touching a market = one observation, dated by commit date. The 2026-04-20 commit is the **initial import**: its date means "as of", not "changed on".

A new point is written only if area changed by more than 0.5% from the previous kept point, across both datasets. Areas that are published as a figure (e.g. Waymo "1,400 sq mi", Tesla Austin "272 sq mi") are `reported` points from that source.

Areas include all supervision levels shown on the source map. Tesla's Bay Area area (~1,100 sq mi) is a safety-driver service, so it is not comparable to driverless areas.

### Usage-series specifics

**Tesla** (`tesla-<city>-miles`):
- Read from the `react-data-tesla_robotaxi_graph_1` JSON embedded in https://www.tesla.com/robotaxi/safety.
- Each week's `date` there is a Monday week-start. It is stored as `week_start`, and `date` = week start + 6 days (the end of the week).
- The 2026-01-01 zero anchor is dropped.
- `tesla-company-driverless-miles` is the derived sum of the cities, plus the Q3-2026 deck point ("nearly 2M"). That point is `reported` and not summed.
- The live odometer on the page (3,709,751 when fetched) is Tesla's running projection. It is kept in notes, not as a point.

**Waymo** (`waymo-<city>-ro-miles`):
- From Waymo Safety Impact hub "CSV1 – RO Miles per Location", quarterly vintages 202409–202606. Each point is dated at the end of the vintage month.
- Vintages ≤ 202509 list depots: PHOENIX, SAN_FRANCISCO + MOUNTAIN_VIEW (summed → derived), LOS_ANGELES, AUSTIN, ATLANTA.
- Vintages ≥ 202512 list counties or metro areas.
- The company total is the "All Locations" row where present, otherwise a derived sum.
- Atlanta is missing in some vintages (gap, not zero).

**TX registry** (`<op>-tx-vehicles`): statewide registered AV counts per operator from texasavtracker.com's API, which compiles TxDMV data, starting 2026-05-28.

## events.json

```jsonc
{"id": "…", "date": "2026-10-22", "type": "area-expansion", "operator": "tesla",
 "markets": ["tesla-austin"], "summary": "one line", "source_url": "…",
 "origin": "av-map-data|curated", "flags": ["weak-source"|"no-source-url"]}
```

Types: `launch, announcement, testing, area-expansion, supervision-change, access-change, fares, hours, vehicles, platform, partnership, milestone, regulatory, ended`.

`weak-source` marks social-media or blog sources (x.com, reddit, facebook, linkedin, small blogs). These rows were kept but flagged; verify them before citing.

## Licenses & attribution

- **Robotaxi Tracker polygons:** CC BY 4.0. Any shared copy must show **"Service areas: Robotaxi Tracker (robotaxitracker.com)"**. The dashboard footer does.
- **av-map-data:** MIT.
- **texasavtracker.com:** license unknown. Fine for personal use; ask before republishing.
- **Waymo / Tesla data:** company publications. Cite them, and don't redistribute the raw files.

## Known gaps (v1)

- Per-city fleet counts for Waymo and Zoox. Only company totals and TX statewide registry counts exist.
- Tesla paid-ride counts, Tesla fleet size per city (beyond a single Electrek point), and Q1 2026 paid miles.
- Zoox Austin/Miami public-ride dates. They're held at `testing`. TechCrunch 2026-08-05 says free rides in SF and Austin, but there's no precise date.
- Cruise Austin/Phoenix/Houston 2022–23 aren't modeled. Only Cruise SF is.
- Motional Las Vegas history before 2026 is thin. The Lyft/Uber robotaxi rides of 2018–2024 are not modeled.
- May Mobility end dates for Arlington and Ann Arbor are unknown.
- Waymo's 2024 "175k rides/week" milestone is not included. Only rides/week points with a verified URL are.
- No Robotaxi Tracker polygons yet for Waymo Las Vegas, Waymo Toronto, or the Tesla Austin F1/COTA addition. Those use reported sq-mi figures instead.
- Canada: only Waymo Toronto (testing).
- Polygon history before 2026-04 relies on av-map events, which are sparse (1–3 per market per year).
