#!/usr/bin/env python3
"""Build data/*.json for the AV tracker from curated inputs + external snapshots in ext/.
Run: .venv/bin/python tools/build_data.py
Inputs: data/curated/{markets,points,events}.json, ext/av-map-data, ext/robotaxi-service-areas (git),
        ext/waymo_hub/csv1_*.csv, ext/tesla_safety_weeks.json (+ react-data json), txapi_*.json
"""
import json, csv, os, re, subprocess, datetime as dt, shutil, collections, hashlib
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from shapely.validation import make_valid
from pyproj import Geod

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, *p)
GEOD = Geod(ellps="WGS84")
SQM_PER_SQMI = 2589988.110336
STATUS_ORDER = ["announced", "testing", "safety-driver", "driverless-employees", "public-driverless", "paid-public", "ended"]
AVMAP_REPO = "https://github.com/path-avmap/av-map-data"
RTT_REPO = "https://github.com/ethanmckanna/robotaxi-service-areas"

def load(p): return json.load(open(p, encoding="utf-8"))
def dump(obj, p):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f: json.dump(obj, f, ensure_ascii=False, indent=1)

warnings = []

# ------------------------------------------------------------------ operators
OPERATORS = [
 {"id":"waymo","name":"Waymo","parent":"Alphabet","website":"https://waymo.com"},
 {"id":"tesla","name":"Tesla Robotaxi","parent":"Tesla","website":"https://www.tesla.com/robotaxi"},
 {"id":"zoox","name":"Zoox","parent":"Amazon","website":"https://zoox.com"},
 {"id":"cruise","name":"Cruise","parent":"GM","website":"https://getcruise.com","notes":"Robotaxi program ended (permits suspended Oct 2023; GM exit Dec 2024)."},
 {"id":"may-mobility","name":"May Mobility","parent":None,"website":"https://maymobility.com"},
 {"id":"avride","name":"Avride","parent":"Nebius","website":"https://avride.ai"},
 {"id":"motional","name":"Motional","parent":"Hyundai","website":"https://motional.com"},
 {"id":"nuro","name":"Nuro (Uber/Lucid)","parent":None,"website":"https://nuro.ai"},
 {"id":"moia","name":"MOIA America / VW ADMT","parent":"Volkswagen","website":"https://www.moia.io"},
]
AVMAP_COMPANY = {"Waymo":"waymo","Tesla":"tesla","Zoox":"zoox","Cruise":"cruise","May Mobility":"may-mobility",
                 "Avride":"avride","Motional":"motional","Nuro":"nuro","VW ADMT":"moia","MOIA America":"moia"}

# ------------------------------------------------------------------ markets
markets = load(D("data/curated/markets.json"))
mk = {m["id"]: m for m in markets}
alias_index = {}  # (operator, avmap city) -> market id
for m in markets:
    for a in m.get("avmap_city", [m["city"]]):
        alias_index[(m["operator"], a)] = m["id"]

# ------------------------------------------------------------------ sources registry
sources = {}
def src(url, **kw):
    if not url: return
    s = sources.setdefault(url, {"url": url, "used_by": 0})
    s["used_by"] += 1
    for k, v in kw.items(): s.setdefault(k, v)

def source_type_for(url):
    u = url.lower()
    if any(x in u for x in ["waymo.com", "tesla.com", "zoox.com", "maymobility.com", "x.com/waymo", "storage.googleapis.com/waymo", "uber.com", "lucidmotors", "moia.io"]): return "official"
    if any(x in u for x in [".gov", "cpuc", "dmv"]): return "regulator"
    if any(x in u for x in ["robotaxitracker", "texasavtracker", "avmap", "robotaxiatlas"]): return "third-party-tracker"
    return "press"

# ------------------------------------------------------------------ series container
series = {}
def S(sid, **meta):
    if sid not in series:
        series[sid] = {"id": sid, "points": [], **meta}
    return series[sid]
def P(sid, date, value, url, confidence, source_type=None, **extra):
    s = series[sid]
    pt = {"date": date, "value": value, "source_url": url, "confidence": confidence,
          "source_type": source_type or source_type_for(url)}
    pt.update({k: v for k, v in extra.items() if v not in (None, "")})
    s["points"].append(pt); src(url)

METRICS = {
 "vehicles": {"label":"Vehicles","unit":"vehicles","kind":"level","family":"vehicles"},
 "vehicles_driverless": {"label":"Driverless (no-monitor) vehicles","unit":"vehicles","kind":"level","family":"vehicles"},
 "area_sq_mi": {"label":"Service area","unit":"sq mi","kind":"level","family":"area"},
 "driverless_miles_cum": {"label":"Cumulative driverless miles (no safety monitor)","unit":"miles","kind":"cumulative","family":"usage"},
 "ro_miles_cum": {"label":"Cumulative rider-only miles","unit":"miles","kind":"cumulative","family":"usage"},
 "autonomous_miles_cum": {"label":"Cumulative autonomous miles (incl. testing)","unit":"miles","kind":"cumulative","family":"usage"},
 "paid_rides_week": {"label":"Paid rides per week","unit":"rides/week","kind":"rate","family":"usage"},
 "miles_week": {"label":"Autonomous miles per week","unit":"miles/week","kind":"rate","family":"usage"},
 "riders_cum": {"label":"Cumulative riders","unit":"riders","kind":"cumulative","family":"usage"},
}
def mseries(sid, op, metric, scope, market=None, state=None, country="US", label=None, description="", method=""):
    m = mk.get(market) if market else None
    return S(sid, operator=op, metric=metric, scope=scope, market=market,
             state=(m["state"] if m else state), country=(m["country"] if m else country),
             unit=METRICS[metric]["unit"], kind=METRICS[metric]["kind"], label=label, description=description, method=method)

# ------------------------------------------------------------------ 1. av-map-data events (+ geometries)
AVMAP = D("ext/av-map-data")
avmap_rows = list(csv.DictReader(open(os.path.join(AVMAP, "events.csv"), encoding="utf-8")))
avmap_commit = subprocess.run(["git","-C",AVMAP,"log","-1","--format=%h %cs"],capture_output=True,text=True).stdout.strip()
EVTYPE = {"service_created":"launch","service_announced":"announcement","service_testing":"testing","geometry_updated":"area-expansion",
          "supervision_updated":"supervision-change","access_policy_changed":"access-change","fares_policy_changed":"fares",
          "service_ended":"ended","vehicle_types_updated":"vehicles","platform_updated":"platform","fleet_partner_changed":"partnership",
          "service_model_updated":"service-model"}
WEAK = ["basenor.com", "techbuzz", "reddit.com", "facebook.com", "linkedin.com/posts", "x.com/nearcyan", "teslaoracle", "notateslaapp"]
events = []
unmapped = collections.Counter()
avmap_geoms = collections.defaultdict(list)  # market -> [(date, alias, geomfile, url)]
for r in avmap_rows:
    op = AVMAP_COMPANY.get(r["company"])
    mid = alias_index.get((op, r["city"])) if op else None
    if not mid:
        if op: unmapped[(r["company"], r["city"])] += 1
        continue
    url = (r["source_url"] or "").split(";")[0].split("#:~:")[0].strip()
    t = EVTYPE.get(r["event_type"], r["event_type"])
    bits = []
    if r["event_type"] == "supervision_updated" and r["supervision"]: bits.append(f"supervision → {r['supervision']}")
    if r["event_type"] == "access_policy_changed" and r["access"]: bits.append(f"access → {r['access']}")
    if r["event_type"] == "fares_policy_changed" and r["fares"]: bits.append(f"fares → {r['fares']}")
    if r["event_type"] == "platform_updated" and r["platform"]: bits.append(f"platform → {r['platform']}")
    if r["event_type"] == "vehicle_types_updated" and r["vehicles"]: bits.append(f"vehicles → {r['vehicles']}")
    if r["event_type"] in ("service_created","service_testing","service_announced"):
        bits.append(", ".join(x for x in [r["supervision"], r["access"], ("via "+r["platform"]) if r["platform"] else ""] if x))
    summary = f"{mk[mid]['city']}: {t.replace('-',' ')}" + (f" ({'; '.join(b for b in bits if b)})" if any(bits) else "")
    if r["notes"]: summary += f" — {r['notes']}"
    ev = {"date": r["date"], "type": t, "operator": op, "markets": [mid], "summary": summary[:300],
          "source_url": url, "origin": "av-map-data"}
    if not url: ev["flags"] = ["no-source-url"]
    elif any(w in url for w in WEAK): ev["flags"] = ["weak-source"]
    events.append(ev); src(url)
    gf = r["geometry_file"]
    if gf.endswith(".geojson") and os.path.exists(os.path.join(AVMAP, "geometries", gf)):
        avmap_geoms[mid].append((r["date"], r["city"], gf, url))

for e in load(D("data/curated/events.json")):
    e = dict(e, origin="curated"); events.append(e); src(e["source_url"])
for e in events:
    e["id"] = hashlib.sha1(f"{e['date']}|{e['type']}|{','.join(e['markets'])}|{e['summary']}".encode()).hexdigest()[:10]
events.sort(key=lambda e: (e["date"], e["operator"]))

# ------------------------------------------------------------------ 2. areas
def geom_of(gj):
    if gj.get("type") == "FeatureCollection": geoms = [shape(f["geometry"]) for f in gj["features"] if f.get("geometry")]
    elif gj.get("type") == "Feature": geoms = [shape(gj["geometry"])]
    else: geoms = [shape(gj)]
    return unary_union([make_valid(g) for g in geoms])
def sqmi(g):
    a, _ = GEOD.geometry_area_perimeter(g)
    return abs(a) / SQM_PER_SQMI

area_index = []
area_points = collections.defaultdict(list)  # market -> [(date, sqmi, dataset, file, url, note)]
if os.path.isdir(D("data/areas")): shutil.rmtree(D("data/areas"))
def save_area(mid, date, dataset, g, url, note, extra=None):
    fn = f"areas/{mid}/{date}_{dataset}.geojson"
    a = round(sqmi(g), 2)
    fc = {"type":"FeatureCollection","features":[{"type":"Feature","geometry":mapping(g),
          "properties":{"market":mid,"date":date,"dataset":dataset,"sq_mi":a,"source_url":url,**(extra or {})}}]}
    dump(fc, D("data", fn))
    area_index.append({"market": mid, "date": date, "dataset": dataset, "file": fn, "sq_mi": a, "source_url": url, "note": note, **(extra or {})})
    area_points[mid].append((date, a, dataset, fn, url, note))

# 2a av-map geometries: market area = union of latest polygon for each alias (sub-service) of the market
for mid, lst in avmap_geoms.items():
    lst.sort()
    latest = {}
    by_date = collections.OrderedDict()
    for date, alias, gf, url in lst: by_date.setdefault(date, []).append((alias, gf, url))
    for date, items in by_date.items():
        for alias, gf, url in items: latest[alias] = (gf, url)
        g = unary_union([geom_of(load(os.path.join(AVMAP, "geometries", f))) for f, _ in latest.values()])
        note = "av-map-data polygon" + (f" (union of {', '.join(sorted(latest))})" if len(latest) > 1 else "")
        save_area(mid, date, "avmap", g, items[-1][2], note, {"files": [f for f, _ in latest.values()]})

# 2b Robotaxi Tracker (RTT) git history; commit date = date first observed in the public repo
RTT = D("ext/robotaxi-service-areas")
RTT_MAP = {"tesla/austin":"tesla-austin","tesla/bay_area":"tesla-bay-area","tesla/dallas":"tesla-dallas","tesla/houston":"tesla-houston",
 "tesla/miami":"tesla-miami","tesla/orlando":"tesla-orlando","tesla/tampa":"tesla-tampa",
 "waymo/atlanta":"waymo-atlanta","waymo/austin-waymo":"waymo-austin","waymo/bay-area-waymo":"waymo-sf-bay-area","waymo/dallas":"waymo-dallas",
 "waymo/denver":"waymo-denver","waymo/houston":"waymo-houston","waymo/los-angeles":"waymo-los-angeles","waymo/miami":"waymo-miami",
 "waymo/nashville":"waymo-nashville","waymo/orlando":"waymo-orlando","waymo/phoenix":"waymo-phoenix","waymo/san-antonio":"waymo-san-antonio",
 "waymo/san-diego":"waymo-san-diego","waymo/tampa":"waymo-tampa","zoox/bay-area-zoox":"zoox-san-francisco","zoox/las-vegas-zoox":"zoox-las-vegas"}
def git(*a): return subprocess.run(["git","-C",RTT,*a],capture_output=True,text=True,check=True).stdout
rtt_head = git("log","-1","--format=%h %cs").strip()
for key, mid in RTT_MAP.items():
    path = f"areas/{key}/boundary.geojson"
    try: meta = json.loads(git("show", f"HEAD:areas/{key}/meta.json"))
    except Exception: meta = {}
    if meta.get("isTestRegion"): warnings.append(f"RTT {key} is a test region; skipped"); continue
    commits = [l.split() for l in git("log","--reverse","--format=%h %cs","--",path).splitlines() if l.strip()]
    per_day = collections.OrderedDict()
    for h, day in commits: per_day[day] = h   # keep last commit of each day
    prev = None
    for day, h in per_day.items():
        try: g = geom_of(json.loads(git("show", f"{h}:{path}")))
        except Exception as ex: warnings.append(f"RTT {key}@{h}: {ex}"); continue
        a = sqmi(g)
        if prev is not None and abs(a - prev) / prev < 0.005: continue  # unchanged (formatting-only commit)
        prev = a
        first = (day == "2026-04-20")
        note = ("RTT initial import — polygon as of import date, not an expansion date" if first
                else "RTT git commit date = date change first observed (actual expansion may be earlier)")
        save_area(mid, day, "rtt", g, f"{RTT_REPO}/commit/{h}", note, {"commit": h, "rtt_slug": key})

dump(sorted(area_index, key=lambda x: (x["market"], x["date"])), D("data/areas/index.json"))

for mid, pts in area_points.items():
    m = mk[mid]
    mseries(f"{mid}-area", m["operator"], "area_sq_mi", "market", market=mid,
            label=f"{m['city']} service area",
            method="Geodesic area (pyproj Geod WGS84, geometry_area_perimeter) of the market polygon; polygons from av-map-data (dated events) and Robotaxi Tracker git history (observation dates). Reported figures from companies/press are included as 'reported' points.")
    prev = None
    for date, a, ds, fn, url, note in sorted(pts):
        if prev is not None and abs(a - prev) / prev < 0.005: continue  # same polygon re-published (e.g. av-map vs RTT copy)
        prev = a
        P(f"{mid}-area", date, a, url, "derived", "third-party-tracker", method=f"geodesic area of {fn}", dataset=ds, area_file=fn, note=note)

# ------------------------------------------------------------------ 3. Texas DMV registry (via texasavtracker.com)
TX_SRC = "https://texasavtracker.com/"
for op in ["tesla", "waymo", "zoox", "avride"]:
    d = load(D(f"ext/texasavtracker/txapi_{op}.json"))
    sid = f"{op}-tx-vehicles"
    mseries(sid, op, "vehicles", "state", state="TX", label=f"{op.title()} vehicles on Texas AV registry",
            description="Count of VINs listed under the operator's authorization in the Texas DMV AV registry (Senate Bill 2807 framework, effective 2026), as compiled daily by texasavtracker.com. Statewide; not split by city.",
            method=f"Imported from texasavtracker.com /api/data history (lastChecked {d.get('lastChecked','')[:10]}); one point per recorded change.")
    for h in d["history"]:
        P(sid, h["timestamp"][:10], h["count"], TX_SRC, "reported", "regulator", note="TxDMV registry count via texasavtracker.com")
    series[sid]["authorized_at"] = d["operatorInfo"].get("grantedAt","")[:10]

# ------------------------------------------------------------------ 4. Waymo CSV1: cumulative rider-only miles by location
WURL = "https://storage.googleapis.com/waymo-uploads/files/documents/safety/safety-impact-data/CSV1%20-%20RO%20Miles%20per%20Location%20202009-{v}-2022benchmark.csv"
DEPOT = {"PHOENIX":"waymo-phoenix","SAN_FRANCISCO":"waymo-sf-bay-area","MOUNTAIN_VIEW":"waymo-sf-bay-area","LOS_ANGELES":"waymo-los-angeles","AUSTIN":"waymo-austin","ATLANTA":"waymo-atlanta"}
COUNTY = {"Maricopa":"waymo-phoenix","San Francisco Bay Area":"waymo-sf-bay-area","Los Angeles":"waymo-los-angeles","Travis":"waymo-austin","Atlanta Area":"waymo-atlanta"}
def month_end(v):
    y, m = int(v[:4]), int(v[4:]); n = dt.date(y + (m == 12), m % 12 + 1, 1)
    return (n - dt.timedelta(days=1)).isoformat()
for f in sorted(os.listdir(D("ext/waymo_hub"))):
    v = re.search(r"(\d{6})", f).group(1); url = WURL.format(v=v); date = month_end(v)
    rows = list(csv.reader(open(D("ext/waymo_hub", f))))
    hdr, rows = rows[0], rows[1:]
    by_depot = hdr[0].startswith("Ops Depot")
    acc = collections.defaultdict(list)
    total = None
    for name, val in rows:
        miles = round(float(val) * 1e6)
        if by_depot:
            if name in DEPOT: acc[DEPOT[name]].append((name, miles))
            else: warnings.append(f"Waymo CSV1 {v}: unmapped depot {name}")
        else:
            if name in COUNTY: acc[COUNTY[name]].append((name, miles))
            elif name.startswith("All Locations"): total = miles
    for mid, parts in acc.items():
        sid = f"{mid}-ro-miles"
        mseries(sid, "waymo", "ro_miles_cum", "market", market=mid, label=f"{mk[mid]['city']} cumulative rider-only miles",
                description="Cumulative rider-only (no human driver) miles since Sep 2020 from Waymo Safety Impact hub CSV1, by location. Includes all RO miles (with or without passengers).",
                method="Waymo publishes a new CSV1 vintage quarterly; value is cumulative through end of the vintage month. Vintages ≤2025-09 are by 'Ops Depot'; ≥2025-12 by county with Waymo's own metro aggregate (e.g. 'San Francisco Bay Area'), so a small definitional break exists.")
        conf = "reported" if len(parts) == 1 else "derived"
        P(sid, date, sum(p[1] for p in parts), url, conf, "official", vintage=v,
          note=f"{'Ops depot' if by_depot else 'County/metro'}: {' + '.join(p[0] for p in parts)}")
    sid = "waymo-company-ro-miles"
    mseries(sid, "waymo", "ro_miles_cum", "company", label="Waymo cumulative rider-only miles (all locations)",
            description="All-locations cumulative rider-only miles from Waymo Safety Impact hub CSV1.",
            method="'All Locations' row when published (≥2025-12); earlier vintages = sum of depot rows (derived).")
    if total is not None: P(sid, date, total, url, "reported", "official", vintage=v)
    else: P(sid, date, sum(p[1] for ps in acc.values() for p in ps), url, "derived", "official", vintage=v, note="Sum of depot rows")

# ------------------------------------------------------------------ 5. Tesla Robotaxi Safety Report: cumulative driverless miles per city
TS = load(D("ext/tesla_safety_weeks.json"))
TSURL = "https://www.tesla.com/robotaxi/safety"
cities = TS["cities"] if isinstance(TS, dict) and "cities" in TS else TS
TCITY = {"austin":"tesla-austin","dallas":"tesla-dallas","houston":"tesla-houston","miami":"tesla-miami","orlando":"tesla-orlando","tampa":"tesla-tampa"}
weekly_by_date = collections.defaultdict(int)
for c in cities:
    name = c["id"].lower()
    mid = TCITY.get(name.split(",")[0].strip())
    if not mid: warnings.append(f"Tesla safety: unmapped city {name}"); continue
    sid = f"{mid}-driverless-miles"
    mseries(sid, "tesla", "driverless_miles_cum", "market", market=mid, label=f"{mk[mid]['city']} cumulative driverless miles",
            description="Tesla Robotaxi Safety Report: cumulative miles driven autonomously with NO safety monitor in the vehicle (includes miles with remote-operator assistance/takeover). Window starts 22 Jan 2026. Supervised (safety-monitor) miles are excluded.",
            method="Extracted from JSON embedded in tesla.com/robotaxi/safety (react-data 'tesla_robotaxi_graph'), fetched via headless Chrome (plain HTTP gets Akamai 403). Tesla dates are Monday week-starts; stored date = week end (Sunday), value = cumulative through that week.")
    for p in c["weeks"]:
        ws, val = p.get("date"), p.get("totalMiles")
        if ws is None or val is None: continue
        if val == 0 and ws.startswith("2026-01-01"):
            continue  # chart anchor (0 at 2026-01-01), not an observation
        we = (dt.date.fromisoformat(ws[:10]) + dt.timedelta(days=6)).isoformat()
        P(sid, we, val, TSURL, "reported", "official", week_start=ws[:10])
        weekly_by_date[we] += val
sid = "tesla-company-driverless-miles"
mseries(sid, "tesla", "driverless_miles_cum", "company", label="Tesla cumulative driverless miles (all cities)",
        description="Sum of the per-city Tesla Robotaxi Safety Report series plus Tesla quarterly-report statements.",
        method="Weekly points = sum of per-city cumulative values for weeks where all reporting cities have a value (derived from reported).")

# ------------------------------------------------------------------ 6. Curated points
CURATED_SERIES = {
 "waymo-company-vehicles": ("waymo","vehicles","company",None,"Waymo fleet size (company-reported)"),
 "waymo-company-paid-rides-week": ("waymo","paid_rides_week","company",None,"Waymo paid rides per week"),
 "waymo-company-miles-week": ("waymo","miles_week","company",None,"Waymo autonomous miles per week"),
 "waymo-company-area": ("waymo","area_sq_mi","company",None,"Waymo total service area (company-reported)"),
 "waymo-las-vegas-area": ("waymo","area_sq_mi","market","waymo-las-vegas",None),
 "waymo-nashville-area": ("waymo","area_sq_mi","market","waymo-nashville",None),
 "tesla-austin-area": ("tesla","area_sq_mi","market","tesla-austin",None),
 "tesla-austin-vehicles-driverless": ("tesla","vehicles_driverless","market","tesla-austin","Austin unsupervised vehicles"),
 "tesla-dallas-vehicles-driverless": ("tesla","vehicles_driverless","market","tesla-dallas","Dallas unsupervised vehicles"),
 "tesla-houston-vehicles-driverless": ("tesla","vehicles_driverless","market","tesla-houston","Houston unsupervised vehicles"),
 "tesla-company-driverless-miles": ("tesla","driverless_miles_cum","company",None,None),
 "zoox-company-autonomous-miles": ("zoox","autonomous_miles_cum","company",None,"Zoox cumulative autonomous miles"),
 "zoox-company-riders": ("zoox","riders_cum","company",None,"Zoox cumulative riders"),
}
for p in load(D("data/curated/points.json")):
    op, metric, scope, market, label = CURATED_SERIES[p["series"]]
    if p["series"] not in series:
        mseries(p["series"], op, metric, scope, market=market, label=label or (mk[market]["city"] + " " + METRICS[metric]["label"].lower()),
                method="Hand-curated from cited company statements / press reports.")
    P(p["series"], p["date"], p["value"], p["source_url"], p["confidence"], p.get("source_type"), note=p.get("note"), curated=True)

# Tesla company weekly sum (only weeks where every city that has started reporting has a value)
city_series = [s for s in series.values() if s["metric"] == "driverless_miles_cum" and s["scope"] == "market" and s["operator"] == "tesla"]
all_weeks = sorted({p["date"] for s in city_series for p in s["points"]})
for w in all_weeks:
    vals = []
    for s in city_series:
        prior = [p for p in s["points"] if p["date"] <= w]
        if prior and prior[-1]["date"] != w: vals = None; break
        if prior: vals.append(prior[-1]["value"])
    if vals: P("tesla-company-driverless-miles", w, sum(vals), TSURL, "derived", "official", note="Sum of per-city weekly values")

# ------------------------------------------------------------------ finalize series
for s in series.values():
    s["points"].sort(key=lambda p: p["date"])
    if not s.get("label"): s["label"] = s["id"]
    s["family"] = METRICS[s["metric"]]["family"]
    s["first_date"] = s["points"][0]["date"] if s["points"] else None
    s["last_date"] = s["points"][-1]["date"] if s["points"] else None

# ------------------------------------------------------------------ market derived fields
def first(m, statuses):
    for h in sorted(m["status_history"], key=lambda h: h["date"]):
        if h["status"] in statuses: return h["date"]
for m in markets:
    m["status_history"].sort(key=lambda h: h["date"])
    for h in m["status_history"]:
        if h["status"] not in STATUS_ORDER: raise SystemExit(f"bad status {h} in {m['id']}")
        src(h["source_url"])
    m["status"] = m["status_history"][-1]["status"]
    m["key_dates"] = {"announced": first(m, ["announced"]), "testing": first(m, ["testing"]),
        "public_with_safety_driver": first(m, ["safety-driver"]), "driverless_employees": first(m, ["driverless-employees"]),
        "public_driverless": first(m, ["public-driverless","paid-public"]), "paid_driverless": first(m, ["paid-public"]),
        "ended": first(m, ["ended"])}
    m["launch_date"] = m["key_dates"]["public_driverless"] or m["key_dates"]["public_with_safety_driver"]
    m["series"] = sorted(s["id"] for s in series.values() if s.get("market") == m["id"])
    m["area_files"] = [a["file"] for a in area_index if a["market"] == m["id"]]
    m.pop("avmap_city", None)

# ------------------------------------------------------------------ write
now = dt.datetime.now().astimezone()
dump(OPERATORS, D("data/operators.json"))
dump(markets, D("data/markets.json"))
dump(sorted(series.values(), key=lambda s: s["id"]), D("data/series.json"))
dump(events, D("data/events.json"))
for u, s in sources.items(): s["type"] = source_type_for(u)
DATASETS = [
 {"id":"av-map-data","name":"av-map-data (avmap.io)","url":AVMAP_REPO,"license":"MIT","snapshot":avmap_commit,"used_for":"Market events, historical service-area polygons"},
 {"id":"rtt","name":"robotaxi-service-areas (Robotaxi Tracker)","url":RTT_REPO,"license":"CC BY 4.0","attribution":"Service areas: Robotaxi Tracker (robotaxitracker.com)","snapshot":rtt_head,"used_for":"Service-area polygons since 2026-04-20 (git history)"},
 {"id":"texasavtracker","name":"Texas AV Tracker (TxDMV registry compilation)","url":"https://texasavtracker.com/","license":"unknown — used for personal research; confirm before republishing","used_for":"Texas registered vehicle counts per operator since 2026-05-28"},
 {"id":"waymo-safety-hub","name":"Waymo Safety Impact hub CSV1","url":"https://waymo.com/safety/impact/","license":"Waymo terms","used_for":"Cumulative rider-only miles by location, quarterly vintages 2024-09 → 2026-06"},
 {"id":"tesla-safety","name":"Tesla Robotaxi Safety Report","url":TSURL,"license":"Tesla terms","used_for":"Weekly cumulative driverless miles per city since Jan 2026"},
]
dump({"datasets": DATASETS, "urls": sorted(sources.values(), key=lambda s: (-s["used_by"], s["url"]))}, D("data/sources.json"))
dump({"generated_at": now.isoformat(timespec="seconds"), "data_as_of": max(p["date"] for s in series.values() for p in s["points"]),
      "statuses": STATUS_ORDER,
      "status_definitions": {
        "announced":"Publicly announced / mapping only, no AV testing reported yet",
        "testing":"AV testing on public roads (safety driver, no public riders)",
        "safety-driver":"Public (or invited) riders with a safety driver or monitor on board (may be paid)",
        "driverless-employees":"Rider-only (no human on board) rides for employees/guests only",
        "public-driverless":"Rider-only rides for public riders (waitlist or open), free",
        "paid-public":"Rider-only rides for public riders with fares",
        "ended":"Service ended"},
      "metrics": METRICS,
      "confidence": {"reported":"Number published by company, regulator, or a tracker's own measurement, as-is",
                     "derived":"Computed from reported data (polygon area, sums, differences)",
                     "estimate":"Modelled estimate with stated method (none in v1)"},
      "warnings": warnings,
      "unmapped_avmap_us_rows": [f"{c} / {city} ({n})" for (c, city), n in sorted(unmapped.items())]},
     D("data/meta.json"))
print(f"markets={len(markets)} series={len(series)} points={sum(len(s['points']) for s in series.values())} events={len(events)} areas={len(area_index)} sources={len(sources)}")
for w in warnings: print("WARN", w)
print("unmapped av-map rows for known operators:", dict(unmapped))
