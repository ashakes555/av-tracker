# Refresh checklist

Run from `av-tracker/`. After any refresh: `.venv/bin/python tools/build_data.py`, then reload the dashboard and check the build summary line and `data/meta.json` → `warnings`.

Cadence suggestion: weekly (Tesla, TX registry, Robotaxi Tracker). Quarterly (Waymo CSV1, earnings decks).

## Bulk sources (scripted)

1. **Robotaxi Tracker polygons:** `git -C ext/robotaxi-service-areas pull`
   - A new market file needs a new slug in `RTT_MAP` in `tools/build_data.py`. Unmapped slugs are printed as warnings.
2. **av-map-data:** `git -C ext/av-map-data pull`. New US/CA cities appear in `meta.unmapped_avmap_us_rows`. Add a market in `data/curated/markets.json` with `avmap_city` aliases.
3. **Tesla Robotaxi Safety Report:** `tools/fetch_tesla_safety.sh`
   - Headless Chrome is needed; curl gets Akamai 403.
   - If the script says "No react-data blobs found", the page was blocked or redesigned. Don't type in values by hand from the chart; inspect `ext/tesla_safety_chrome.html`.
   - New cities appear automatically. Add a matching `tesla-<city>` market (the city `id` → market mapping is in `build_data.py`, `TCITY`).
4. **Texas registry:** `for op in tesla waymo zoox avride; do curl -s "https://texasavtracker.com/api/data?brand=$op" -o ext/texasavtracker/txapi_$op.json; done`
   - This is the same endpoint the site's own charts use. Each file holds `history`, the counts over time; that's the part the build uses. It also has a VIN list, which could later give a model split (e.g. Cybercab vs Model Y).
   - This is a third-party compilation of TxDMV data. Spot-check against TxDMV if numbers jump.
5. **Waymo CSV1 (quarterly):** check https://waymo.com/safety/impact/ for a new "through <month>" vintage.
   - Download `CSV1 - RO Miles per Location 202009-<YYYYMM>-2022benchmark.csv` from `storage.googleapis.com/waymo-uploads/files/documents/safety/safety-impact-data/` to `ext/waymo_hub/csv1_<YYYYMM>.csv`.
   - New location names need a mapping in `DEPOT` (depot-era) or `COUNTY` (county-era).

## Per-operator manual checks (curated JSON)

| Operator | Where to look | Update |
|---|---|---|
| **Waymo** | waymo.com/blog, X @Waymo, Alphabet earnings (fleet, rides/week, miles/week), CPUC quarterly data (CA rides/miles), CA DMV permits | `points.json` (company vehicles / paid_rides_week / miles_week / area), `events.json`, status changes in `markets.json` |
| **Tesla** | tesla.com/robotaxi, Tesla quarterly update deck (miles, cities), @robotaxi on X, Electrek / Teslarati / teslanorth (area & hours changes), robotaxitracker.com | Status changes (watch "unsupervised" per city), Austin/other area figures, Cybercab counts as `vehicles` events |
| **Zoox** | zoox.com/journal, Amazon news, TechCrunch | Public-ride / fare start dates for Austin, Miami, and new cities; rider and mile totals |
| **May Mobility** | maymobility.com/news, Lyft/Uber partner posts | Driverless transitions, end dates |
| **Avride, Motional, Nuro, MOIA** | Company newsrooms; Uber/Lyft partner announcements | Status changes |
| **Cruise** | Ended (Dec 2024). No updates expected. |  |
| **Canada** | Waymo Toronto; Ontario AV pilot program notices; Transport Canada | New markets with `country: "CA"` |

When adding a point or event:
- Use the exact article URL, without tracking or `#:~:text=` fragments.
- Check that it loads. 401/403 from Reuters or tesla.com is usually a bot wall; confirm it in a browser.
- Set `confidence` honestly. If a number is "about"/"nearly", keep the number and put the wording in `note`.

## Validation

- `python3 -c "import json,glob;[json.load(open(f)) for f in glob.glob('data/**/*.json',recursive=True)]"`
- The dashboard console should show no errors: `NODE_PATH=/tmp/pp/node_modules node tools/check_site.js` (needs `npm i puppeteer-core` in /tmp/pp; writes screenshots to /tmp/pp; reads the port from /tmp/avport), or open DevTools.
