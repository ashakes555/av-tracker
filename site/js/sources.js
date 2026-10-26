(async function () {
  const d = await AV.load();
  const e = AV.esc;
  document.getElementById("datasets").innerHTML = "<ul>" + d.sources.datasets.map(s =>
    `<li><a href="${e(AV.safeUrl(s.url))}">${e(s.name)}</a> — ${e(s.used_for)}. License: ${e(s.license)}${s.attribution ? `. Attribution: <em>${e(s.attribution)}</em>` : ""}${s.snapshot ? ` (snapshot ${e(s.snapshot)})` : ""}</li>`).join("") + "</ul>";
  const seen = new Map();
  d.series.forEach(s => { if (s.method && !seen.has(s.method)) seen.set(s.method, []); if (s.method) seen.get(s.method).push(s.label); });
  document.getElementById("methods").innerHTML =
    `<p>Generated ${e(d.meta.generated_at)}; latest data point ${e(d.meta.data_as_of)}. Full schema: <a href="data/README.md">data/README.md</a>; refresh checklist: <a href="data/UPDATING.md">data/UPDATING.md</a>.</p><ul>` +
    [...seen].map(([m, labels]) => `<li><strong>${e(labels.length > 3 ? labels.slice(0, 3).join(", ") + ` +${labels.length - 3} more` : labels.join(", "))}:</strong> ${e(m)}</li>`).join("") + "</ul>" +
    "<h3>Status definitions</h3><ul>" + Object.entries(d.meta.status_definitions).map(([k, v]) => `<li><strong>${e(k)}</strong>: ${e(v)}</li>`).join("") + "</ul>" +
    "<h3>Confidence</h3><ul>" + Object.entries(d.meta.confidence).map(([k, v]) => `<li><strong>${e(k)}</strong>: ${e(v)}</li>`).join("") + "</ul>";
  const w = [...(d.meta.warnings || []), ...(d.meta.unmapped_avmap_us_rows || []).map(x => "av-map row not mapped to a US/CA market: " + x)];
  const weak = d.events.filter(x => x.flags && x.flags.length);
  document.getElementById("warnings").innerHTML = (w.map(x => `<li>${e(x)}</li>`).join("") || "") +
    `<li>${weak.length} events carry a quality flag (weak-source / no-source-url); they are marked ⚠ in the events list.</li>`;
  const tb = document.getElementById("src-table"), q = document.getElementById("src-q");
  const render = () => {
    const t = q.value.toLowerCase();
    tb.innerHTML = "<thead><tr><th>Type</th><th>Uses</th><th>URL</th></tr></thead><tbody>" +
      d.sources.urls.filter(s => !t || s.url.toLowerCase().includes(t)).map(s =>
        `<tr><td>${e(s.type)}</td><td>${s.used_by}</td><td class="url"><a href="${e(AV.safeUrl(s.url))}">${e(s.url)}</a></td></tr>`).join("") + "</tbody>";
  };
  q.addEventListener("input", render); render();
})().catch(err => { document.body.insertAdjacentHTML("afterbegin", `<p class="error">Failed to load data: ${AV.esc(err.message)}</p>`); console.error(err); });
