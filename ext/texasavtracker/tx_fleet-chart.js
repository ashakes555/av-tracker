let chartRange = 0;
const chartVisible = new Set(['total']);
const chartKnownTypes = new Set(['total']);
let chartSource;
let chartResizeTimer;

function positionChartTooltip(tip, clientX, clientY) {
  const margin = 12;
  const bounds = tip.getBoundingClientRect();
  const left = clientX + bounds.width + 24 < innerWidth - margin ? clientX + 24 : clientX - bounds.width - 24;
  tip.style.left = `${Math.max(margin, Math.min(left, innerWidth - bounds.width - margin))}px`;
  tip.style.top = `${Math.max(margin, Math.min(clientY - bounds.height / 2, innerHeight - bounds.height - margin))}px`;
}

function wireChartReveal(host, selector, name = 'fleet-growth') {
  const paths = [...host.querySelectorAll(selector)];
  if (!paths.length) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (hasMotionRevealed(name)) {
    host.classList.add('is-revealed', 'motion-seen');
    paths.forEach(path => { path.style.clipPath = 'inset(0 0 0 0)'; });
    return;
  }
  const reveal = () => {
    if (host.classList.contains('is-revealed')) return;
    markMotionRevealed(name);
    host.classList.add('is-revealed');
    paths.forEach((path, index) => {
      path.style.transition = reduced ? 'none' : `clip-path .78s cubic-bezier(.22,.8,.2,1) ${index * .1}s`;
      path.style.clipPath = 'inset(0 0 0 0)';
    });
  };
  paths.forEach(path => { path.style.clipPath = 'inset(0 100% 0 0)'; });
  if (reduced || !('IntersectionObserver' in window)) return reveal();
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    reveal();
    observer.disconnect();
  }, { threshold: 0.32 });
  observer.observe(host);
}

// Cybercab and Model Y keep the site's type colors no matter which series
// is drawn first. Other types still take the palette by series index.
function keyedFleetTypeColor(type) {
  const name = String(type?.name || '').trim().toLowerCase();
  if (name === 'cybercab') return 'rgb(var(--cybercab-rgb))';
  if (name === 'model y') return 'rgb(var(--modely-rgb))';
  return '';
}

function renderGrowthChart(history, vehicles) {
  chartSource = {history, vehicles};
  return '<section class="chart-block modern-chart" id="modernGrowth" aria-label="Fleet growth"></section>';
}

function wireGrowthChart(history, vehicles) {
  const host = document.getElementById('modernGrowth');
  if (!host) return;
  document.getElementById('fleetTooltip')?.remove();
  const growth = buildGrowthSeries(history);
  if (!growth) {
    host.innerHTML = '<h2 class="chart-title">Fleet Growth</h2><p class="modern-date">History will appear as observations become available.</p>';
    return;
  }
  const typeSeries = buildFleetTypeSeries(history, vehicles, growth);
  const series = [{id:'total', name:'Total fleet', color:'var(--blue)', points:growth.series}];
  const typeColors = ['#ef6476', '#dbb860', '#9b7df2', '#55c5b4', '#f0834d', '#dc65bd'];
  typeSeries.forEach((type, index) => {
    const keyed = keyedFleetTypeColor(type);
    series.push({
      ...type,
      color: keyed || typeColors[index % typeColors.length],
      keyedColor: Boolean(keyed),
      points: type.series,
    });
  });
  series.forEach(item => {
    if (!chartKnownTypes.has(item.id)) {
      chartKnownTypes.add(item.id);
      chartVisible.add(item.id);
    }
  });
  if (!series.some(item => chartVisible.has(item.id))) chartVisible.add('total');
  const start = chartRange ? Math.max(0, growth.series.length - chartRange) : 0;
  const days = growth.series.slice(start).map(point => point.day);
  const width = Math.max(260, host.clientWidth - (innerWidth < 760 ? 32 : 56));
  const height = innerWidth < 760 ? 280 : 330;
  const pad = {left:38, right:12, top:20, bottom:32};
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const maximum = Math.max(1, ...series.flatMap(item => item.points.slice(start).map(point => point.count)));
  const magnitude = Math.pow(10, Math.floor(Math.log10(maximum / 4)));
  const step = Math.max(1, [1,1.25,1.5,2,2.5,5,10].find(value => value * magnitude >= maximum / 4) * magnitude);
  const ceiling = Math.ceil(maximum / step) * step;
  const x = index => pad.left + index / Math.max(1, days.length - 1) * plotWidth;
  const y = count => pad.top + (1 - count / ceiling) * plotHeight;
  const date = day => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric', timeZone:'UTC'});
  const shortDate = day => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', {month:'short', day:'numeric', timeZone:'UTC'});
  const pathFor = item => item.points.slice(start).map((point,index) => index ? `H${x(index)} V${y(point.count)}` : `M${x(index)},${y(point.count)}`).join(' ');
  const latest = growth.series.at(-1).count;
  const change = latest - growth.series[start].count;
  let grid = '';
  for (let count = 0; count <= ceiling; count += step) grid += `<line x1="${pad.left}" x2="${width-pad.right}" y1="${y(count)}" y2="${y(count)}" stroke="rgba(242,237,228,.075)"/><text x="${pad.left-12}" y="${y(count)+4}" text-anchor="end">${count.toLocaleString()}</text>`;
  const ticks = [...new Set([0,.25,.5,.75,1].map(fraction => Math.round((days.length-1)*fraction)))];
  const labels = ticks.map((index,position) => `<text x="${x(index)}" y="${height-5}" text-anchor="${position===0?'start':position===ticks.length-1?'end':'middle'}">${shortDate(days[index])}</text>`).join('');
  host.innerHTML = `<div class="modern-chart-head"><div><h2 class="chart-title">Fleet Growth</h2><p class="chart-sub">Texas registrations · daily history</p></div><div class="modern-pills" aria-label="History range">${[30,90,0].map(range => `<button type="button" data-range="${range}" aria-pressed="${chartRange===range}">${range?range+'D':'ALL'}</button>`).join('')}</div></div>
    <div class="chart-summary"><div><span class="chart-total">${latest.toLocaleString()}</span><span class="chart-total-unit">Registered vehicles</span></div><div class="chart-change"><strong>${change>0?'+':''}${change.toLocaleString()}</strong><span>net change in view</span></div></div>
    <div class="modern-legend" aria-label="Toggle chart lines">${series.map(item => `<button type="button" data-metric="${item.id}" aria-pressed="${chartVisible.has(item.id)}" aria-controls="line-${item.id}" style="--series-color:${item.color}"><i></i><span${item.keyedColor ? ` style="color:${item.color}"` : ''}>${item.name}</span><strong>${item.points.at(-1).count.toLocaleString()}</strong><span class="series-check" aria-hidden="true">✓</span></button>`).join('')}</div>
    <svg class="modern-plot" viewBox="0 0 ${width} ${height}" aria-label="Fleet and vehicle-type history">
      <defs><linearGradient id="fleetWash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--blue)" stop-opacity=".12"/><stop offset="1" stop-color="var(--blue)" stop-opacity="0"/></linearGradient></defs>
      ${grid}<path id="fleetArea" d="${pathFor(series[0])} L${x(days.length-1)},${height-pad.bottom} L${x(0)},${height-pad.bottom} Z" fill="url(#fleetWash)"/>
      ${[...series].reverse().map(item => `<path id="line-${item.id}" class="fleet-series-path" d="${pathFor(item)}" fill="none" stroke="${item.color}" stroke-width="${item.id==='total'?2.5:2}" ${item.id==='total'&&series.length>1?'stroke-dasharray="6 4"':''} stroke-linejoin="round"/>`).join('')}
      ${labels}<line id="modernCrosshair" y1="${pad.top}" y2="${height-pad.bottom}" stroke="rgba(242,237,228,.4)" stroke-dasharray="3 4" visibility="hidden"/>
      ${series.map(item => `<circle data-point="${item.id}" r="4" fill="${item.color}" stroke="#191b1e" stroke-width="2"/>`).join('')}
      <rect id="growthHit" tabindex="0" role="slider" aria-label="History date; use arrow keys" aria-valuemin="0" aria-valuemax="${days.length-1}" x="${pad.left}" y="${pad.top}" width="${plotWidth}" height="${plotHeight}" fill="transparent"/>
    </svg><div class="modern-chart-foot"><span>${shortDate(days[0])} — ${shortDate(days.at(-1))}</span><span>Toggle lines above · Hover for counts</span></div>`;
  const tip = document.createElement('div');
  tip.id = 'fleetTooltip'; tip.className = 'fleet-tooltip'; tip.setAttribute('role','tooltip'); tip.hidden = true;
  document.body.appendChild(tip);
  const hit = host.querySelector('#growthHit');
  const svg = host.querySelector('svg');
  const crosshair = host.querySelector('#modernCrosshair');
  let active = days.length - 1;
  let lastPointer;
  const syncLines = () => {
    series.forEach(item => {
      const visible = chartVisible.has(item.id);
      host.querySelector(`#line-${item.id}`).style.opacity = visible ? 1 : 0;
      host.querySelector(`[data-point="${item.id}"]`).style.display = visible ? '' : 'none';
      host.querySelector(`[data-metric="${item.id}"]`).setAttribute('aria-pressed',visible);
    });
    host.querySelector('#fleetArea').style.opacity = chartVisible.has('total') ? 1 : 0;
  };
  const show = (index, inspect = true) => {
    active = index;
    const selected = series.filter(item => chartVisible.has(item.id));
    series.forEach(item => {
      const dot = host.querySelector(`[data-point="${item.id}"]`);
      dot.setAttribute('cx',x(index)); dot.setAttribute('cy',y(item.points[start+index].count));
    });
    crosshair.setAttribute('x1',x(index)); crosshair.setAttribute('x2',x(index));
    crosshair.setAttribute('visibility',inspect?'visible':'hidden');
    hit.setAttribute('aria-valuenow',index);
    hit.setAttribute('aria-valuetext',`${date(days[index])}; ${selected.map(item=>`${item.name}: ${item.points[start+index].count} vehicles`).join('; ')}`);
    tip.hidden = !inspect;
    if (!inspect) return;
    tip.innerHTML = `<div class="fleet-tip-date">${date(days[index])}<span>VEHICLES</span></div>${selected.map(item => `<div class="fleet-tip-row" style="--series-color:${item.color}"><i></i><span${item.keyedColor ? ` style="color:${item.color}"` : ''}>${item.name}</span><strong>${item.points[start+index].count.toLocaleString()}</strong></div>`).join('')}`;
    const anchor = svg.createSVGPoint(); anchor.x=x(index); anchor.y=pad.top+plotHeight/2;
    const screen = anchor.matrixTransform(svg.getScreenCTM());
    positionChartTooltip(tip, lastPointer?.x ?? screen.x, lastPointer?.y ?? screen.y);
  };
  const move = event => {
    lastPointer = {x:event.clientX,y:event.clientY};
    const pointer = svg.createSVGPoint(); pointer.x=event.clientX; pointer.y=event.clientY;
    const local = pointer.matrixTransform(svg.getScreenCTM().inverse());
    show(Math.max(0,Math.min(days.length-1,Math.round((local.x-pad.left)/plotWidth*(days.length-1)))));
  };
  const dismiss = () => {lastPointer=null; show(days.length-1,false);};
  hit.addEventListener('pointermove',move); hit.addEventListener('pointerdown',move);
  hit.addEventListener('pointerleave',dismiss); hit.addEventListener('pointercancel',dismiss);
  hit.addEventListener('focus',()=>show(active)); hit.addEventListener('blur',dismiss);
  hit.addEventListener('keydown',event=>{
    if(event.key==='Escape') return dismiss();
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault(); lastPointer=null;
    show(event.key==='Home'?0:event.key==='End'?days.length-1:Math.max(0,Math.min(days.length-1,active+(event.key==='ArrowLeft'?-1:1))));
  });
  host.querySelectorAll('[data-range]').forEach(button=>button.addEventListener('click',()=>{
    chartRange=Number(button.dataset.range); wireGrowthChart(history,vehicles); host.querySelector(`[data-range="${chartRange}"]`).focus();
  }));
  host.querySelectorAll('[data-metric]').forEach(button=>button.addEventListener('click',()=>{
    const key=button.dataset.metric;
    if(chartVisible.has(key) && series.filter(item=>chartVisible.has(item.id)).length===1) return;
    chartVisible.has(key)?chartVisible.delete(key):chartVisible.add(key);
    syncLines(); dismiss();
  }));
  wireChartReveal(host, '.fleet-series-path', 'fleet-growth');
  syncLines(); dismiss();
}
window.addEventListener('resize',()=>{
  clearTimeout(chartResizeTimer);
  chartResizeTimer=setTimeout(()=>{if(chartSource) wireGrowthChart(chartSource.history,chartSource.vehicles);},150);
});
window.addEventListener('scroll',()=>{
  document.querySelectorAll('.fleet-tooltip').forEach(tip=>{tip.hidden=true;});
},true);
