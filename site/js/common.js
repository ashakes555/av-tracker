/* Shared helpers: data loading, formatting, escaping. No external requests. */
const AV = {};
AV.load = async function () {
  const names = ["meta", "operators", "markets", "series", "events", "sources"];
  const out = {};
  await Promise.all(names.map(async n => {
    const r = await fetch(`data/${n}.json`, { cache: "no-cache" });
    if (!r.ok) throw new Error(`data/${n}.json: HTTP ${r.status}`);
    out[n] = await r.json();
  }));
  return out;
};
AV.esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
AV.safeUrl = u => (/^https?:\/\//i.test(u || "") ? u : "#");
AV.domain = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
AV.fmt = (v, unit) => {
  if (v == null || isNaN(v)) return "—";
  const a = Math.abs(v);
  let s = a >= 1e6 ? (v / 1e6).toFixed(a >= 1e8 ? 0 : 2).replace(/\.?0+$/, "") + "M"
        : a >= 1e4 ? Math.round(v).toLocaleString("en-US")
        : (Math.round(v * 100) / 100).toLocaleString("en-US");
  return unit ? `${s} ${unit}` : s;
};
AV.dateStr = d => (typeof d === "string" ? d : new Date(d).toISOString().slice(0, 10));
AV.today = () => new Date().toISOString().slice(0, 10);
AV.OPCOLORS = { waymo: "#2b7bb9", tesla: "#c0392b", zoox: "#16a085", cruise: "#e67e22", "may-mobility": "#8e44ad",
  avride: "#7f8c8d", motional: "#d35400", nuro: "#27ae60", moia: "#34495e" };
AV.STATUSCOLORS = { announced: "#d5d8dc", testing: "#aab7c4", "safety-driver": "#f5b041", "driverless-employees": "#85c1e9",
  "public-driverless": "#5dade2", "paid-public": "#1e8449", ended: "#7b7d7d" };
AV.STATUSLABEL = { announced: "Announced", testing: "Testing", "safety-driver": "Riders w/ safety driver/monitor",
  "driverless-employees": "Driverless (employees)", "public-driverless": "Driverless public (free)", "paid-public": "Driverless public (paid)", ended: "Ended" };
