(() => {
  const host = document.getElementById('homeServiceAreas');
  if (!host || !window.maplibregl || !window.TexasServiceAreaMap) return;

  const providers = ['tesla', 'waymo', 'zoox', 'avride'];
  const providerMeta = {
    tesla: { label: 'Tesla', color: '#4da8ff' },
    waymo: { label: 'Waymo', color: '#2dd4bf' },
    zoox: { label: 'Zoox', color: '#ff9900' },
    avride: { label: 'AVRide', color: '#a78bfa' },
  };
  let allAreas = [];
  let selectedCity = null;
  let activeProviders = new Set();
  let mapView;
  let cityPicker;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
  const cityAreas = citySlug => allAreas.filter(area => area.citySlug === citySlug);

  function updateChrome() {
    const context = document.getElementById('homeMapContext');
    const dock = document.getElementById('homeCompareDock');
    const back = document.getElementById('homeMapBack');
    const areaSummary = document.getElementById('homeAreaSummary');
    if (!selectedCity) {
      context.classList.remove('is-visible'); context.innerHTML = '';
      dock.classList.remove('is-visible'); dock.innerHTML = '';
      back.classList.remove('is-visible');
      areaSummary.classList.remove('is-visible'); areaSummary.innerHTML = '';
      return;
    }
    const areas = cityAreas(selectedCity);
    const city = areas[0].city;
    context.innerHTML = `<small>Texas service areas</small><strong>${escapeHtml(city)}</strong>`;
    context.classList.add('is-visible');
    areaSummary.innerHTML = `<small>Service area size</small>${areas.map(area => {
      const item = providerMeta[area.provider];
      return `<span class="geofence-area-stat" style="--provider-color:${item.color}"><i></i><b>${item.label}</b><strong>${TexasServiceAreaMap.formatSquareMiles(area.boundary)}</strong></span>`;
    }).join('')}`;
    areaSummary.classList.add('is-visible');
    dock.innerHTML = `<div>${areas.map(area => {
      const item = providerMeta[area.provider];
      const on = activeProviders.has(area.provider);
      return `<button type="button" class="geofence-provider-toggle ${on ? 'is-on' : ''}" data-home-provider="${area.provider}" aria-pressed="${on}" style="--provider-color:${item.color}"><span></span>${item.label}</button>`;
    }).join('')}</div>`;
    dock.classList.add('is-visible'); back.classList.add('is-visible');
  }

  function draw() {
    if (!selectedCity) return;
    mapView.showSelection({ id: selectedCity, visibleAreas: cityAreas(selectedCity).filter(area => activeProviders.has(area.provider)) });
  }

  function selectCity(citySlug) {
    selectedCity = citySlug;
    activeProviders = new Set(cityAreas(citySlug).map(area => area.provider));
    cityPicker.hide();
    updateChrome(); draw();
  }

  function overview() {
    selectedCity = null;
    activeProviders.clear();
    cityPicker.show();
    updateChrome(); mapView.showOverview(900);
  }

  async function start() {
    let cities = [];
    try {
      const responses = await Promise.all(providers.map(provider => fetch('/api/geofences?brand=' + provider)));
      if (responses.some(response => !response.ok)) throw new Error('Boundary feed unavailable');
      const payloads = await Promise.all(responses.map(response => response.json()));
      const badgePayload = payloads.find(payload => payload.lastError) || payloads.find(payload => payload.stale) || payloads[0];
      window.GeofenceFreshness?.apply(document.getElementById('homeMapFreshness'), badgePayload);
      allAreas = payloads.flatMap(payload => payload.areas || []);
      cities = [...new Map(allAreas.map(area => [area.citySlug, area])).values()];
    } catch (error) {
      window.GeofenceFreshness?.apply(document.getElementById('homeMapFreshness'), null);
      host.innerHTML = '<div class="map-loading">Service-area map temporarily unavailable</div>';
      return;
    }
    try {
      host.innerHTML = `
        <div class="geofence-stage geofence-canvas-stage">
          <div class="geofence-live-map" id="homeGeofenceMap" role="application" aria-label="Interactive Texas AV service-area map"></div>
          <div class="geofence-map-loading" id="homeMapLoading"><span></span><small>Preparing Texas map</small></div>
          <button class="geofence-map-back" id="homeMapBack" type="button" aria-label="Return to Texas overview">‹ <span>Texas</span></button>
          <div class="geofence-map-context" id="homeMapContext"></div>
          <aside class="geofence-area-summary" id="homeAreaSummary" aria-live="polite"></aside>
          <div class="geofence-compare-dock" id="homeCompareDock" aria-live="polite"></div>
        </div>`;
      mapView = TexasServiceAreaMap.mount({
        container: document.getElementById('homeGeofenceMap'),
        areas: allAreas,
        markerItems: cities.map(area => ({
          id: area.citySlug,
          city: area.city,
          center: TexasServiceAreaMap.cityCenter(area.citySlug, area.center),
          providers: cityAreas(area.citySlug).map(item => item.provider),
        })),
        providerMeta, layerPrefix: 'home-service',
        onSelect: area => selectCity(area.id),
        onReady: () => document.getElementById('homeMapLoading')?.classList.add('is-hidden'),
      });
      cityPicker = TexasServiceAreaMap.mountCityPicker({
        stage: host.querySelector('.geofence-canvas-stage'),
        cities: cities.map(area => ({ id: area.citySlug, city: area.city })),
        onSelect: selectCity,
      });
      document.getElementById('homeMapBack').addEventListener('click', overview);
      host.addEventListener('click', event => {
        const button = event.target.closest('[data-home-provider]');
        if (!button) return;
        const provider = button.dataset.homeProvider;
        if (activeProviders.has(provider)) activeProviders.delete(provider); else activeProviders.add(provider);
        if (!activeProviders.size) activeProviders.add(provider);
        updateChrome(); draw();
      });
    } catch (error) {
      host.innerHTML = '<div class="map-loading">Service-area map temporarily unavailable</div>';
    }
  }
  start();
})();
