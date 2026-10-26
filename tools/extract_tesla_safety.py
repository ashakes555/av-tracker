"""Extract the weekly per-city cumulative driverless-miles series from a saved tesla.com/robotaxi/safety DOM.
The chart is backed by <script type="application/json" data-info="react-data-tesla_robotaxi_graph_N">.
Writes ext/tesla_safety_weeks.json (list of {id, t_name, weeks:[{date,totalMiles}]}) and the raw blob."""
import json, re, sys, os
src = sys.argv[1] if len(sys.argv) > 1 else "ext/tesla_safety_chrome.html"
if not os.path.isfile(src):
    sys.exit(f"{src} is not present. ext/ is not in the repo; save the Tesla safety page there first (tools/fetch_tesla_safety.sh), or pass a path.")
html = open(src, encoding="utf-8").read()
os.makedirs("ext", exist_ok=True)
blobs = re.findall(r'<script type="application/json" data-info="(react-data-[^"]+)">(.*?)</script>', html, re.S)
if not blobs:
    sys.exit("No react-data blobs found: page blocked or layout changed. Do NOT guess values; inspect the HTML.")
graph = None
for name, body in blobs:
    d = json.loads(body)
    with open(os.path.join("ext", f"tesla_{name}.json"), "w") as f: json.dump(d, f, indent=1)
    if "robotaxi_graph" in name: graph = d
if not graph:
    sys.exit("robotaxi_graph blob missing; saw: " + ", ".join(n for n, _ in blobs))
cities = graph["data"]["cities"]
json.dump(cities, open("ext/tesla_safety_weeks.json", "w"), indent=1)
for c in cities:
    w = c["weeks"]; print(f'{c["id"]:10s} {len(w):3d} weeks  {w[0]["date"]} → {w[-1]["date"]}  last={w[-1]["totalMiles"]:,}')
