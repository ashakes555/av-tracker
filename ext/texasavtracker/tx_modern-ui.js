let registryPage=0;
let registryOrder='newest';
let registryQuery='';
const registryPageSize=25;
const trackerMotion = window.__trackerMotion ?? { revealed: new Set() };
window.__trackerMotion = trackerMotion;

function motionKey(name) {
  return `${location.pathname}:${name}`;
}

function hasMotionRevealed(name) {
  return trackerMotion.revealed.has(motionKey(name));
}

function markMotionRevealed(name) {
  trackerMotion.revealed.add(motionKey(name));
}

function registryRows() {
  const query=registryQuery.trim().toUpperCase();
  return allVehicles.filter(vehicle => !query || [vehicle.vin,vehicle.model,fmtDate(vinDates[vehicle.vin])].some(value => String(value).toUpperCase().includes(query))).sort((left,right) => {
    if(registryOrder==='vin') return left.vin.localeCompare(right.vin);
    const difference = (Date.parse(vinDates[right.vin])||0)-(Date.parse(vinDates[left.vin])||0);
    return (registryOrder==='oldest'?-difference:difference)||left.vin.localeCompare(right.vin);
  });
}
function updateRegistry() {
  const rows=registryRows();
  registryPage=Math.min(registryPage,Math.max(0,Math.ceil(rows.length/registryPageSize)-1));
  document.getElementById('tbody').innerHTML=renderTable(rows);
  document.getElementById('tcount').textContent=`${rows.length.toLocaleString()} vehicles`;
}
function filterVehicles(query) {registryQuery=query;registryPage=0;updateRegistry();}
function changeRegistryPage(direction) {registryPage+=direction;updateRegistry();}
function changeRegistryOrder(order) {registryOrder=order;registryPage=0;updateRegistry();}

function buildFleetBars(entries) {
  if(entries.length<2) return '';
  const rows=[...entries].sort((left,right)=>right.total-left.total);
  const maximum=rows[0].total;
  return `<section class="chart-block"><div class="chart-header"><span class="chart-title">Fleet comparison</span><span class="chart-sub">Registered vehicles · select an operator to explore</span></div><div class="fleet-ranking">${rows.map((row,index)=>`<a class="fleet-rank" href="/${row.brand}" style="--rank-color:${BAR_COLORS[row.brand]};--rank-index:${index}"><span>${BRANDS[row.brand].short}</span><span class="fleet-track"><span style="width:${row.total/maximum*100}%"></span></span><strong>${row.total.toLocaleString()}</strong><span aria-hidden="true">↗</span></a>`).join('')}</div></section>`;
}

function wireFleetRanking(host) {
  const ranking = host.querySelector('.fleet-ranking');
  if (!ranking) return;
  if (hasMotionRevealed('fleet-ranking')) {
    ranking.classList.add('is-revealed', 'motion-seen');
    return;
  }
  const reveal = () => {
    markMotionRevealed('fleet-ranking');
    ranking.classList.add('is-revealed');
  };
  if (!('IntersectionObserver' in window)) return reveal();
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    reveal();
    observer.disconnect();
  }, { threshold: 0.35 });
  observer.observe(ranking);
}

function wireCompositionMeters(host) {
  const blocks = [...host.querySelectorAll('.composition-block')];
  if (!blocks.length) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (hasMotionRevealed('composition')) {
    blocks.forEach(block => block.classList.add('is-revealed', 'motion-seen'));
    return;
  }
  const reveal = block => {
    markMotionRevealed('composition');
    block.classList.add('is-revealed');
  };
  if (reduced || !('IntersectionObserver' in window)) return blocks.forEach(reveal);
  const observer = new IntersectionObserver(entries => {
    entries.filter(entry => entry.isIntersecting).forEach(entry => {
      reveal(entry.target);
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.38 });
  blocks.forEach(block => observer.observe(block));
}
