/* AV Deployment Tracker dashboard. Loads data/*.json; no network calls beyond same-origin files. */
(async function () {
"use strict";
const D = await AV.load();
const e = AV.esc;
const MK = Object.fromEntries(D.markets.map(m => [m.id, m]));
const OP = Object.fromEntries(D.operators.map(o => [o.id, o]));
const METRICS = D.meta.metrics;
const STATUS_ORDER = D.meta.statuses;              // announced … ended
const RANK = Object.fromEntries(STATUS_ORDER.map((s, i) => [s, i]));
const TODAY = AV.today();
const DAY = 864e5;
const t = d => Date.parse(d + "T00:00:00Z");

/* ---------- filters ---------- */
const G = { country: "", state: "", city: "", operator: "", range: "ALL", from: "", to: "" };
const cityKey = m => `${m.city}|${m.state}`;
function marketPasses(m, f) {
  return (!f.country || m.country === f.country) && (!f.state || m.state === f.state) &&
         (!f.city || cityKey(m) === f.city) && (!f.operator || m.operator === f.operator);
}
function seriesPasses(s, f) {
  if (f.operator && s.operator !== f.operator) return false;
  if (s.scope === "market") return !!MK[s.market] && marketPasses(MK[s.market], f);
  if (s.scope === "state") return !f.city && (!f.state || f.state === s.state) && (!f.country || f.country === (s.country || "US"));
  return !f.city && !f.state && (!f.country || f.country === (s.country || "US"));   // company scope
}
function rangeOf(f, dataMin) {
  const max = f.to ? t(f.to) : t(TODAY);
  let min = f.from ? t(f.from) : null;
  if (!f.from) {
    const back = { "3M": 92, "1Y": 366, "3Y": 1096 }[f.range];
    min = back ? max - back * DAY : dataMin;
  }
  return [min, max];
}
function fillSelect(sel, opts, val, extra) {
  sel.innerHTML = (extra || "") + opts.map(([v, l]) => `<option value="${e(v)}"${v === val ? " selected" : ""}>${e(l)}</option>`).join("");
  if (val && !opts.some(o => o[0] === val) && !(extra || "").includes(`value="${val}"`)) sel.value = "";
  else sel.value = val;
}
function filterOptions(f) {
  const ms = D.markets;
  const uniq = (arr) => [...new Map(arr).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  return {
    country: uniq(ms.map(m => [m.country, m.country === "US" ? "United States" : m.country === "CA" ? "Canada" : m.country])),
    state: uniq(ms.filter(m => !f.country || m.country === f.country).map(m => [m.state, m.state])),
    city: uniq(ms.filter(m => (!f.country || m.country === f.country) && (!f.state || m.state === f.state)).map(m => [cityKey(m), `${m.city}, ${m.state}`])),
    operator: uniq(ms.map(m => [m.operator, OP[m.operator]?.name || m.operator])),
  };
}
function renderFilterBar(root, f, withGlobal, optF) {
  const opts = filterOptions(optF || f);
  root.querySelectorAll("select[data-f]").forEach(sel => {
    const k = sel.dataset.f;
    const head = (withGlobal ? `<option value="__g">(global)</option>` : "") + `<option value="">All</option>`;
    fillSelect(sel, opts[k], f[k] ?? "", head);
  });
}

/* ---------- series math ---------- */
const lastAt = (pts, x) => { let v = null; for (const p of pts) { if (p.x <= x) v = p; else break; } return v; };
function endedAt(s) {
  if (s.scope !== "market") return null;
  const h = MK[s.market]?.status_history || [];
  const last = h[h.length - 1];
  return last && last.status === "ended" ? t(last.date) : null;
}
function toPts(s) { return s.points.map(p => ({ x: t(p.date), y: p.value, m: { ...p, series: s.label, unit: s.unit } })); }
function sumSeries(list, kind) {
  const comps = list.map(s => ({ s, pts: toPts(s), end: kind === "level" ? endedAt(s) : null }));
  const xs = [...new Set(comps.flatMap(c => c.pts.map(p => p.x).concat(c.end ? [c.end] : [])))].sort((a, b) => a - b);
  return xs.map(x => {
    let y = 0; const parts = [];
    for (const c of comps) {
      if (c.end && x >= c.end) continue;
      const p = lastAt(c.pts, x);
      if (p) { y += p.y; parts.push({ label: c.s.label, value: p.y, date: p.m.date, url: p.m.source_url, confidence: p.m.confidence }); }
    }
    return { x, y, m: { date: AV.dateStr(x), confidence: "derived", agg: true, parts, unit: list[0].unit,
      note: `Sum of ${parts.length} series, each carried forward from its latest point` } };
  });
}
function perPeriod(pts) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], days = (b.x - a.x) / DAY;
    if (days <= 0) continue;
    out.push({ x: b.x, y: (b.y - a.y) * 7 / days, m: { ...b.m, confidence: "derived", agg: b.m.agg, unit: "per week (avg)",
      note: `Average per week over ${Math.round(days)} days (${a.m.date} → ${b.m.date}), from cumulative values ${AV.fmt(a.y)} → ${AV.fmt(b.y)}` } });
  }
  return out;
}
function withGhost(pts, kind, endX, ended) {
  if (kind !== "level" || !pts.length) return pts;
  const last = pts[pts.length - 1];
  const stop = ended ? Math.min(ended, endX) : endX;
  if (stop > last.x) pts = pts.concat([{ x: stop, y: ended && ended <= endX ? 0 : last.y, m: { ghost: true } }]);
  return pts;
}

/* ---------- chart cards ---------- */
const CARDS = {};
const COMBOS = { "__nodriver": { label: "Miles with no one in the driver seat (Tesla no-monitor + Waymo rider-only)", metrics: ["driverless_miles_cum", "ro_miles_cum"], unit: "miles", kind: "cumulative", family: "usage" } };
const metricList = k => (COMBOS[k] ? COMBOS[k].metrics : [k]);
const metricMeta = k => COMBOS[k] || METRICS[k];
const FAMILY_METRICS = fam => Object.entries(COMBOS).filter(([, v]) => v.family === fam).map(([k, v]) => [k, v.label]).concat(Object.entries(METRICS).filter(([k, v]) => v.family === fam && D.series.some(s => s.metric === k)).map(([k, v]) => [k, v.label]));
function buildCard(el) {
  const kind = el.dataset.chart;
  const st = { kind, f: { country: "__g", state: "__g", city: "__g", operator: "__g", range: "__g" }, group: "operator", view: "cum", metric: null, statusMode: "markets", showEnded: false };
  if (kind !== "status") st.metric = FAMILY_METRICS(kind)[0]?.[0];
  if (kind === "usage") st.metric = "__nodriver";
  const controls = [];
  if (kind !== "status") {
    const ms = FAMILY_METRICS(kind);
    if (ms.length > 1) controls.push(`<label>Metric <select data-c="metric">${ms.map(([k, l]) => `<option value="${k}"${k === st.metric ? " selected" : ""}>${e(l)}</option>`).join("")}</select></label>`);
    controls.push(`<label>Lines <select data-c="group"><option value="operator">By operator (summed)</option><option value="series">Each series</option></select></label>`);
    if (kind === "usage") controls.push(`<label>View <select data-c="view"><option value="cum">As published</option><option value="rate">Per week (derived)</option></select></label>`);
  } else {
    controls.push(`<label>Count <select data-c="statusMode"><option value="markets">Operator × city</option><option value="cities">Unique cities (highest status)</option></select></label>`);
    controls.push(`<label class="chk"><input type="checkbox" data-c="showEnded"> include ended</label>`);
  }
  el.insertAdjacentHTML("beforeend", `
    <div class="frow ctl">${controls.join("")}</div>
    <details class="local"><summary>Chart filters</summary>
      <div class="frow">
        <label>Country <select data-f="country"></select></label><label>State <select data-f="state"></select></label>
        <label>City <select data-f="city"></select></label><label>Operator <select data-f="operator"></select></label>
        <label>Range <select data-lr><option value="__g">(global)</option><option value="3M">3M</option><option value="1Y">1Y</option><option value="3Y">3Y</option><option value="ALL">All</option></select></label>
      </div></details>
    <div class="cwrap"><canvas></canvas></div>
    <p class="cnote"></p>
    <div class="detail" hidden></div>`);
  const chart = new Chart(el.querySelector("canvas"), baseConfig(st));
  st.chart = chart; st.el = el;
  el.querySelectorAll("[data-c]").forEach(c => c.addEventListener("change", () => {
    st[c.dataset.c] = c.type === "checkbox" ? c.checked : c.value; drawCard(st);
  }));
  el.querySelectorAll(".local select[data-f]").forEach(c => c.addEventListener("change", () => { st.f[c.dataset.f] = c.value; drawCard(st); }));
  el.querySelector("[data-lr]").addEventListener("change", ev => { st.f.range = ev.target.value; drawCard(st); });
  CARDS[kind] = st;
  return st;
}
function effFilter(st) {
  const f = {};
  for (const k of ["country", "state", "city", "operator"]) f[k] = st.f[k] === "__g" ? G[k] : st.f[k];
  if (st.f.range === "__g") { f.range = G.range; f.from = G.from; f.to = G.to; } else { f.range = st.f.range; f.from = ""; f.to = G.to; }
  return f;
}
function baseConfig(st) {
  const stacked = st.kind === "status";
  return {
    type: "line",
    data: { datasets: [] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, normalized: true,
      interaction: { mode: stacked ? "index" : "nearest", intersect: false },
      scales: {
        x: { type: "time", time: { tooltipFormat: "yyyy-MM-dd" }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
        y: { beginAtZero: true, stacked, ticks: { callback: v => AV.fmt(v) } },
      },
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, usePointStyle: true } },
        tooltip: {
          filter: it => !it.raw?.m?.ghost,
          callbacks: stacked ? {} : {
            label: it => `${it.dataset.label}: ${AV.fmt(it.raw.y, it.raw.m.unit)} [${it.raw.m.confidence}]`,
            afterLabel: it => {
              const m = it.raw.m;
              if (m.agg) return `${m.parts?.length || "?"} series summed · tap for sources`;
              return `${AV.domain(m.source_url)}${m.note ? " · " + m.note : ""}`.slice(0, 160);
            },
          },
        },
      },
      onClick: (ev, els, chart) => showDetail(st, chart, ev),
    },
  };
}
function styleDataset(ds, color, many) {
  Object.assign(ds, {
    borderColor: color, backgroundColor: color, borderWidth: 2, tension: 0,
    pointRadius: c => (c.raw?.m?.ghost ? 0 : many ? 2 : 3.5), pointHoverRadius: 6, pointHitRadius: 8,
    pointStyle: c => (c.raw?.m?.confidence === "estimate" ? "triangle" : "circle"),
    pointBackgroundColor: c => { const k = c.raw?.m?.confidence; return k === "reported" ? color : k === "estimate" ? color + "55" : "#fff"; },
    pointBorderColor: color, pointBorderWidth: 1.5,
    segment: { borderDash: c => (c.p1?.raw?.m?.confidence === "estimate" ? [5, 4] : undefined) },
  });
  return ds;
}
const shade = (hex, i) => { if (!i) return hex; const n = parseInt(hex.slice(1), 16); const k = [0, 0.35, -0.3, 0.55, -0.5][i % 5];
  const ch = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) + (k > 0 ? (255 - ((n >> s) & 255)) * k : ((n >> s) & 255) * k))));
  return "#" + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, "0")).join(""); };

function drawCard(st) {
  const f = effFilter(st);
  renderFilterBar(st.el.querySelector(".local"), st.f, true, f);
  st.el.querySelector("[data-lr]").value = st.f.range;
  st.el.querySelector(".detail").hidden = true;
  if (st.kind === "status") return drawStatus(st, f);
  const meta = metricMeta(st.metric), mset = metricList(st.metric);
  const list = D.series.filter(s => mset.includes(s.metric) && seriesPasses(s, f));
  const dataMin = Math.min(...list.flatMap(s => s.points.map(p => t(p.date))), t(TODAY));
  const [min, max] = rangeOf(f, dataMin);
  const datasets = [];
  const groups = new Map();
  const scopeName = s => s.scope === "market" ? "sum of cities" : s.scope === "state" ? `${s.state} registry` : "company-reported";
  for (const s of list) {
    const key = st.group === "series" ? s.id : `${s.operator}|${s.metric}|${s.scope}|${s.scope === "state" ? s.state : ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const perOpCount = {};
  for (const [key, ss] of groups) {
    const s0 = ss[0];
    let pts = ss.length === 1 ? toPts(s0) : sumSeries(ss, meta.kind);
    if (st.kind === "usage" && st.view === "rate" && meta.kind === "cumulative") pts = perPeriod(pts);
    const ended = ss.length === 1 ? endedAt(s0) : null;
    pts = withGhost(pts, meta.kind, max, ended);
    const opName = OP[s0.operator]?.name || s0.operator;
    const label = st.group === "series" || (ss.length === 1 && s0.scope === "market") ? `${opName} · ${s0.label}` : ( `${opName} · ${scopeName(s0)}${ss.length > 1 ? ` (${ss.length})` : ""}`);
    const i = perOpCount[s0.operator] = (perOpCount[s0.operator] ?? -1) + 1;
    const ds = styleDataset({ label, data: pts, stepped: meta.kind === "level" ? "after" : false }, shade(AV.OPCOLORS[s0.operator] || "#555", i), pts.length > 40);
    datasets.push(ds);
  }
  st.chart.data.datasets = datasets;
  st.chart.options.scales.x.min = min; st.chart.options.scales.x.max = max;
  st.chart.options.scales.y.stacked = false;
  st.chart.options.scales.y.title = { display: true, text: st.kind === "usage" && st.view === "rate" && meta.kind === "cumulative" ? `${meta.unit} per week (avg)` : meta.unit };
  st.chart.update();
  const descs = [...new Set(list.map(s => s.description).filter(Boolean))].slice(0, 3);
  st.el.querySelector(".cnote").innerHTML = list.length
    ? `${e(meta.label)} · ${list.length} series. ${descs.map(e).join(" ")}${st.group === "operator" ? " Summed lines are derived; lines of different scope (city sum, state registry, company-reported) are never added together." : ""}`
    : `No ${e(meta.label.toLowerCase())} data for this filter.${st.kind === "vehicles" && (f.city) ? " Most fleet counts are company-wide or statewide (Texas registry); clear the city filter to see them." : ""}`;
}
function statusAt(m, x) { let s = null; for (const h of m.status_history) { if (t(h.date) <= x) s = h; else break; } return s; }
function drawStatus(st, f) {
  const ms = D.markets.filter(m => marketPasses(m, f) && m.status_history.length);
  const first = Math.min(...ms.map(m => t(m.status_history[0].date)), t(TODAY));
  const [min, max] = rangeOf(f, first);
  const xs = new Set([t(TODAY), max]);
  ms.forEach(m => m.status_history.forEach(h => xs.add(t(h.date))));
  for (let d = new Date(first); d.getTime() < max; d.setUTCMonth(d.getUTCMonth() + 1)) xs.add(d.getTime());
  const X = [...xs].filter(x => x <= max).sort((a, b) => a - b);
  const statuses = STATUS_ORDER.filter(s => st.showEnded || s !== "ended");
  const counts = Object.fromEntries(statuses.map(s => [s, []]));
  st.byX = new Map();
  for (const x of X) {
    const at = {};
    if (st.statusMode === "cities") {
      const best = new Map();
      for (const m of ms) { const h = statusAt(m, x); if (!h) continue;
        const k = cityKey(m), cur = best.get(k);
        const r = h.status === "ended" ? -1 : RANK[h.status];
        if (!cur || r > cur.r) best.set(k, { r, h, m }); }
      for (const [k, v] of best) (at[v.h.status] ||= []).push(v);
    } else for (const m of ms) { const h = statusAt(m, x); if (h) (at[h.status] ||= []).push({ h, m }); }
    st.byX.set(x, at);
    statuses.forEach(s => counts[s].push({ x, y: (at[s] || []).length, m: { status: s } }));
  }
  st.chart.data.datasets = statuses.slice().reverse().map(s => ({
    label: AV.STATUSLABEL[s], data: counts[s], stepped: "after", fill: true, pointRadius: 0, borderWidth: 1,
    borderColor: AV.STATUSCOLORS[s], backgroundColor: AV.STATUSCOLORS[s] + "cc",
  }));
  st.chart.options.scales.x.min = min; st.chart.options.scales.x.max = max;
  st.chart.options.scales.y.stacked = true;
  st.chart.options.scales.y.title = { display: true, text: st.statusMode === "cities" ? "cities" : "operator × city markets" };
  st.chart.options.plugins.tooltip.callbacks = { footer: items => `Total: ${items.reduce((a, b) => a + b.raw.y, 0)} · tap for list` };
  st.chart.update();
  st.el.querySelector(".cnote").innerHTML = `Status from each market's sourced status history (step chart). ${ms.length} markets in filter.`;
}
function showDetail(st, chart, ev) {
  const box = st.el.querySelector(".detail");
  if (st.kind === "status") {
    const x = chart.scales.x.getValueForPixel(ev.x);
    const X = [...st.byX.keys()].filter(k => k <= x).pop(); if (X == null) return;
    const at = st.byX.get(X);
    box.innerHTML = `<button class="close" aria-label="close">×</button><strong>As of ${AV.dateStr(X)}</strong>` +
      Object.entries(at).sort((a, b) => RANK[b[0]] - RANK[a[0]]).map(([s, arr]) => `<div><em>${e(AV.STATUSLABEL[s])}</em>: ` +
        arr.map(({ m, h }) => `<a href="${e(AV.safeUrl(h.source_url))}" target="_blank" rel="noopener">${e(OP[m.operator]?.name)} ${e(m.city)}, ${e(m.state)}</a>`).join(", ") + "</div>").join("");
  } else {
    const els = chart.getElementsAtEventForMode(ev.native || ev, "nearest", { intersect: false }, false);
    if (!els.length) return;
    const raw = chart.data.datasets[els[0].datasetIndex].data[els[0].index];
    if (!raw || raw.m.ghost) return;
    const m = raw.m, lab = chart.data.datasets[els[0].datasetIndex].label;
    let html = `<button class="close" aria-label="close">×</button><strong>${e(lab)}</strong> — ${e(m.date)}: <strong>${AV.fmt(raw.y, m.unit)}</strong> <span class="conf ${e(m.confidence)}">${e(m.confidence)}</span>`;
    if (m.note) html += `<div>${e(m.note)}</div>`;
    if (m.method) html += `<div class="muted">Method: ${e(m.method)}</div>`;
    if (m.agg) html += "<ul>" + m.parts.map(p => `<li>${e(p.label)}: ${AV.fmt(p.value)} (${e(p.date)}, ${e(p.confidence)}) <a href="${e(AV.safeUrl(p.url))}" target="_blank" rel="noopener">${e(AV.domain(p.url))}</a></li>`).join("") + "</ul>";
    else html += `<div>Source: <a href="${e(AV.safeUrl(m.source_url))}" target="_blank" rel="noopener">${e(m.source_url)}</a> (${e(m.source_type || "")})</div>`;
    if (m.area_file) html += `<div>Polygon: <a href="data/${e(m.area_file)}">${e(m.area_file)}</a></div>`;
    box.innerHTML = html;
  }
  box.hidden = false;
  box.querySelector(".close").onclick = () => (box.hidden = true);
}

/* ---------- city table ---------- */
let sortKey = "status", sortDir = -1;
const latest = (metric, mid) => { const s = D.series.find(x => x.metric === metric && x.market === mid); return s && s.points.length ? s.points[s.points.length - 1] : null; };
function lastChange(m) {
  const c = [];
  const h = m.status_history[m.status_history.length - 1]; if (h) c.push({ date: h.date, what: `status → ${h.status}`, url: h.source_url });
  const a = D.series.find(x => x.metric === "area_sq_mi" && x.market === m.id);
  if (a && a.points.length) { const p = a.points[a.points.length - 1]; c.push({ date: p.date, what: `area ${AV.fmt(p.value)} sq mi`, url: p.source_url }); }
  D.events.filter(ev => ev.markets.includes(m.id)).forEach(ev => c.push({ date: ev.date, what: ev.type, url: ev.source_url }));
  return c.sort((x, y) => y.date.localeCompare(x.date))[0];
}
function drawTable() {
  const rows = D.markets.filter(m => marketPasses(m, G)).map(m => {
    const v = latest("vehicles", m.id) || latest("vehicles_driverless", m.id), a = latest("area_sq_mi", m.id), lc = lastChange(m);
    return { m, op: OP[m.operator]?.name || m.operator, city: m.city, state: m.state, status: m.status, srank: RANK[m.status] ?? -1,
      launch: m.launch_date || "", v, vv: v ? v.value : -1, a, av: a ? a.value : -1, lc, lcd: lc ? lc.date : "" };
  });
  const keyMap = { op: "op", city: "city", state: "state", status: "srank", launch: "launch", v: "vv", a: "av", lc: "lcd" };
  const k = keyMap[sortKey];
  rows.sort((x, y) => (x[k] > y[k] ? 1 : x[k] < y[k] ? -1 : 0) * sortDir || x.city.localeCompare(y.city));
  const th = (key, l) => `<th data-k="${key}" class="${sortKey === key ? (sortDir > 0 ? "asc" : "desc") : ""}">${l}</th>`;
  const link = (p, txt) => `<a href="${e(AV.safeUrl(p.source_url))}" target="_blank" rel="noopener" title="${e(p.confidence)} · ${e(p.date)}">${txt}</a>`;
  document.getElementById("city-table").innerHTML =
    `<thead><tr>${th("op", "Operator")}${th("city", "City")}${th("state", "St.")}${th("status", "Status")}${th("launch", "Public launch")}${th("v", "Vehicles")}${th("a", "Area (sq mi)")}${th("lc", "Last change")}</tr></thead><tbody>` +
    rows.map(r => `<tr><td>${e(r.op)}</td><td>${e(r.city)}${r.m.notes ? ` <span class="i" title="${e(r.m.notes)}">ⓘ</span>` : ""}</td><td>${e(r.state)}</td>
      <td><span class="badge" style="background:${AV.STATUSCOLORS[r.status] || "#ccc"}">${e(AV.STATUSLABEL[r.status] || r.status)}</span></td>
      <td>${e(r.launch || "—")}</td><td class="num">${r.v ? link(r.v, AV.fmt(r.v.value)) + `<small> ${e(r.v.date)}</small>` : "—"}</td>
      <td class="num">${r.a ? link(r.a, AV.fmt(r.a.value)) + `<small> ${e(r.a.date)}</small>` : "—"}</td>
      <td>${r.lc ? `${e(r.lc.date)} <a href="${e(AV.safeUrl(r.lc.url))}" target="_blank" rel="noopener">${e(r.lc.what)}</a>` : "—"}</td></tr>`).join("") + "</tbody>";
  document.querySelectorAll("#city-table th").forEach(h => h.onclick = () => {
    if (sortKey === h.dataset.k) sortDir = -sortDir; else { sortKey = h.dataset.k; sortDir = ["status", "v", "a", "lc", "launch"].includes(sortKey) ? -1 : 1; }
    drawTable();
  });
}

/* ---------- events ---------- */
const evType = document.getElementById("ev-type"), evQ = document.getElementById("ev-q"), evIn = document.getElementById("ev-inrange");
const types = [...new Set(D.events.map(x => x.type))].sort();
evType.innerHTML = `<option value="">All types</option>` + types.map(x => `<option>${e(x)}</option>`).join("");
let evLimit = 60;
const evMore = document.getElementById("ev-more");
evMore.onclick = () => { evLimit += 100; drawEvents(); };
function drawEvents() {
  const [min, max] = rangeOf(G, -Infinity);
  const q = evQ.value.toLowerCase();
  const list = D.events.filter(ev => {
    const ms = ev.markets.map(id => MK[id]).filter(Boolean);
    const geoOk = ms.length ? ms.some(m => marketPasses(m, G)) : (!G.city && !G.state && (!G.operator || ev.operator === G.operator));
    const x = t(ev.date);
    return geoOk && (!evType.value || ev.type === evType.value) && (!q || ev.summary.toLowerCase().includes(q)) && (!evIn.checked || (x >= min && x <= max));
  }).sort((a, b) => b.date.localeCompare(a.date));
  document.getElementById("event-list").innerHTML = list.slice(0, evLimit).map(ev => `<li>
    <time>${e(ev.date)}</time> <span class="op" style="color:${AV.OPCOLORS[ev.operator] || "#555"}">${e(OP[ev.operator]?.name || ev.operator || "")}</span>
    <span class="tag">${e(ev.type)}</span>${(ev.flags || []).length ? ` <span class="warn" title="${e(ev.flags.join(", "))}">⚠ ${e(ev.flags.join(", "))}</span>` : ""}
    <div>${e(ev.summary)} ${ev.source_url ? `<a href="${e(AV.safeUrl(ev.source_url))}" target="_blank" rel="noopener">${e(AV.domain(ev.source_url))}</a>` : ""}</div></li>`).join("") ||
    "<li>No events for this filter.</li>";
  evMore.hidden = list.length <= evLimit; evMore.textContent = `Show more (${list.length - evLimit} more)`;
}
[evType, evQ, evIn].forEach(x => x.addEventListener("input", drawEvents));

/* ---------- global wiring ---------- */
const gf = document.getElementById("global-filters");
function drawAll() {
  renderFilterBar(gf, G, false);
  gf.querySelectorAll("[data-r]").forEach(b => { if (b.tagName === "BUTTON") b.classList.toggle("on", !G.from && b.dataset.r === G.range); });
  Object.values(CARDS).forEach(drawCard);
  drawTable(); drawEvents();
}
gf.querySelectorAll("select[data-f]").forEach(sel => sel.addEventListener("change", () => {
  G[sel.dataset.f] = sel.value;
  if (sel.dataset.f === "country") { G.state = ""; G.city = ""; }
  if (sel.dataset.f === "state") G.city = "";
  drawAll();
}));
gf.querySelectorAll("button[data-r]").forEach(b => b.addEventListener("click", () => {
  G.range = b.dataset.r; G.from = ""; gf.querySelector('input[data-r="from"]').value = ""; drawAll();
}));
gf.querySelectorAll("input[data-r]").forEach(inp => inp.addEventListener("change", () => { G[inp.dataset.r] = inp.value; drawAll(); }));

document.getElementById("updated").innerHTML =
  `Data as of <strong>${e(D.meta.data_as_of)}</strong> (built ${e(D.meta.generated_at.slice(0, 16).replace("T", " "))}) · ${D.markets.length} markets · ${D.series.length} series · ${D.events.length} events. <a href="sources.html">Sources &amp; methods</a>`;
document.querySelectorAll("[data-chart]").forEach(buildCard);
drawAll();
window.__AV_READY = true;
})().catch(err => { console.error(err); document.body.insertAdjacentHTML("afterbegin", `<p class="error">Failed to load: ${AV.esc(err.message)}. Serve this folder over HTTP (python3 -m http.server), not file://.</p>`); });
