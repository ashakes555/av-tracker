# AV Deployment Tracker (personal, v1)

Robotaxi deployment tracker: operators × cities, status history since 2017, vehicles, service area, and usage, with every point sourced.

- Dashboard: `index.html` (+ `site/`), sources page `sources.html`. Runs fully offline; Chart.js 4.6.1 + date-fns adapter are vendored in `site/vendor/`.
- Data + schema: `data/` and `data/README.md`. Refresh: `data/UPDATING.md`.
- Build: `.venv/bin/python tools/build_data.py`. The venv needs `shapely` and `pyproj`.
- Serve locally: `python3 -m http.server 8000 --bind 127.0.0.1`, then open http://127.0.0.1:8000/. It needs HTTP; `file://` blocks fetch.

Not deployed anywhere. If shared later, keep the Robotaxi Tracker attribution (CC BY 4.0) and settle the texasavtracker licensing first.
