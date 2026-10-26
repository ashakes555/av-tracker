(() => {
  const TEXAS_BOUNDS = [[-106.65, 25.82], [-93.48, 36.52]];
  const OVERVIEW_PADDING = { top: 74, right: 54, bottom: 54, left: 54 };
  const MOBILE_OVERVIEW_PADDING = { top: 48, right: 30, bottom: 32, left: 16 };
  const DETAIL_PADDING = { top: 92, right: 54, bottom: 94, left: 54 };
  const isCompactViewport = () => window.matchMedia('(max-width: 759px)').matches;
  const canHoverPins = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const overviewPadding = () => isCompactViewport() ? MOBILE_OVERVIEW_PADDING : OVERVIEW_PADDING;
  const CITY_CENTERS = Object.freeze({
    austin: [-97.7431, 30.2672],
    dallas: [-96.7970, 32.7767],
    houston: [-95.3698, 29.7604],
    'san-antonio': [-98.4936, 29.4241],
  });

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
    ));
  }

  function rings(geometry) {
    return geometry?.type === 'Polygon' ? geometry.coordinates
      : geometry?.type === 'MultiPolygon' ? geometry.coordinates.flat() : [];
  }

  function ringSquareMeters(ring) {
    if (!Array.isArray(ring) || ring.length < 4) return 0;
    const radians = Math.PI / 180;
    let sum = 0;
    for (let index = 0; index < ring.length - 1; index += 1) {
      const [longitudeA, latitudeA] = ring[index];
      const [longitudeB, latitudeB] = ring[index + 1];
      sum += (longitudeB - longitudeA) * radians
        * (2 + Math.sin(latitudeA * radians) + Math.sin(latitudeB * radians));
    }
    return Math.abs(sum) * 6371008.8 ** 2 / 2;
  }

  function squareMiles(feature) {
    const geometry = feature?.geometry || feature;
    const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates]
      : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
    const squareMeters = polygons.reduce((total, polygon) => {
      const [outer, ...holes] = polygon;
      return total + Math.max(0, ringSquareMeters(outer) - holes.reduce((holeTotal, hole) =>
        holeTotal + ringSquareMeters(hole), 0));
    }, 0);
    return squareMeters / 2589988.110336;
  }

  class RecenterControl {
    constructor(onRecenter) { this.onRecenter = onRecenter; }
    onAdd() {
      this.container = document.createElement('div');
      this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'geofence-ctrl-recenter';
      button.title = 'Recenter map';
      button.setAttribute('aria-label', 'Recenter map');
      button.innerHTML = '<span class="maplibregl-ctrl-icon" aria-hidden="true"></span>';
      button.addEventListener('click', this.onRecenter);
      this.container.appendChild(button);
      return this.container;
    }
    onRemove() { this.container?.remove(); }
  }

  window.TexasServiceAreaMap = {
    cityCenter(citySlug, fallback) {
      return CITY_CENTERS[citySlug] || fallback;
    },
    squareMiles,
    formatSquareMiles(feature) {
      const miles = squareMiles(feature);
      return `${miles >= 100 ? Math.round(miles) : miles.toFixed(1)} sq mi`;
    },
    mountCityPicker({ stage, cities, onSelect }) {
      const picker = document.createElement('aside');
      picker.className = 'geofence-city-picker is-visible';
      picker.setAttribute('aria-label', 'Select a city');
      const compact = window.matchMedia('(max-width: 759px)');
      picker.innerHTML = `<button type="button" class="geofence-city-picker-toggle" aria-expanded="false">
        <small>Texas service areas</small><strong>Select a City</strong>
      </button><div class="geofence-city-picker-list">${cities.map(city =>
        `<button type="button" data-city-picker="${city.id}"><i></i><span>${city.city}</span><b>›</b></button>`
      ).join('')}</div>`;
      const toggle = picker.querySelector('.geofence-city-picker-toggle');
      function setOpen(open) {
        picker.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
      }
      function syncMode() {
        setOpen(!compact.matches);
      }
      syncMode();
      compact.addEventListener('change', syncMode);
      picker.addEventListener('click', event => {
        if (event.target.closest('.geofence-city-picker-toggle')) {
          if (compact.matches) setOpen(!picker.classList.contains('is-open'));
          return;
        }
        const button = event.target.closest('[data-city-picker]');
        if (button) onSelect(button.dataset.cityPicker);
      });
      stage.appendChild(picker);
      return {
        show() { picker.classList.add('is-visible'); if (compact.matches) setOpen(false); },
        hide() { picker.classList.remove('is-visible'); },
        destroy() { compact.removeEventListener('change', syncMode); picker.remove(); },
      };
    },
    mount({ container, areas, markerItems, providerMeta, layerPrefix, onSelect, onReady }) {
      let map;
      let loaded = false;
      let pending = null;
      let selectedId = null;
      let lastSelection = null;
      let resizeObserver;
      const visualViewport = window.visualViewport;
      const handleViewportResize = () => map.resize();

      function clearLayers() {
        if (!map?.isStyleLoaded()) return;
        Object.keys(providerMeta).forEach(provider => {
          ['line', 'fill'].forEach(kind => {
            const id = `${layerPrefix}-${kind}-${provider}`;
            if (map.getLayer(id)) map.removeLayer(id);
          });
          const sourceId = `${layerPrefix}-boundary-${provider}`;
          if (map.getSource(sourceId)) map.removeSource(sourceId);
        });
      }

      function setMarkerState() {
        container.classList.toggle('is-city-view', Boolean(selectedId));
        container.querySelectorAll('.texas-map-city').forEach(marker =>
          marker.classList.toggle('is-active', marker.dataset.cityKey === selectedId));
      }

      function showOverview(duration = 750) {
        const apply = () => {
          selectedId = null;
          lastSelection = null;
          clearLayers();
          setMarkerState();
          map.fitBounds(TEXAS_BOUNDS, { padding: overviewPadding(), duration });
        };
        if (!loaded) pending = apply; else apply();
      }

      function showSelection({ id, visibleAreas, duration = 1000 }) {
        const apply = () => {
          const displayAreas = visibleAreas.filter(area => area.boundary?.geometry);
          if (!displayAreas.length) return;
          selectedId = id;
          lastSelection = { id, visibleAreas };
          clearLayers();
          setMarkerState();
          displayAreas.forEach(area => {
            const color = providerMeta[area.provider]?.color;
            if (!color) return;
            const sourceId = `${layerPrefix}-boundary-${area.provider}`;
            map.addSource(sourceId, { type: 'geojson', data: area.boundary });
            map.addLayer({ id: `${layerPrefix}-fill-${area.provider}`, type: 'fill', source: sourceId,
              paint: { 'fill-color': color, 'fill-opacity': .18 } });
            map.addLayer({ id: `${layerPrefix}-line-${area.provider}`, type: 'line', source: sourceId,
              paint: { 'line-color': color, 'line-width': 3, 'line-opacity': .98 } });
          });
          const points = displayAreas.flatMap(area => rings(area.boundary.geometry).flat());
          if (!points.length) return;
          const bounds = points.reduce((box, point) => box.extend(point), new maplibregl.LngLatBounds(points[0], points[0]));
          map.fitBounds(bounds, { padding: DETAIL_PADDING, duration, maxZoom: 12.8 });
        };
        if (!loaded) pending = apply; else apply();
      }

      map = new maplibregl.Map({
        container,
        style: 'https://tiles.openfreemap.org/styles/dark',
        center: [-99.3, 31.25],
        zoom: 5.2,
        attributionControl: false,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new RecenterControl(() => lastSelection
        ? showSelection({ ...lastSelection, duration: 700 })
        : showOverview(700)), 'top-right');
      map.addControl(new maplibregl.FullscreenControl(), 'top-right');
      map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

      resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(container);
      visualViewport?.addEventListener('resize', handleViewportResize);

      map.once('load', () => {
        loaded = true;
        markerItems.forEach(item => {
          const marker = document.createElement('button');
          marker.type = 'button';
          marker.className = 'texas-map-city';
          marker.dataset.cityKey = item.id;
          marker.setAttribute('aria-label', `Explore ${item.city} service areas`);
          const providers = [...new Set(item.providers || [])]
            .filter(provider => providerMeta[provider]);
          marker.innerHTML = `<span class="texas-map-city-dot" aria-hidden="true"><i></i></span><span class="texas-map-city-card"><strong>${escapeHtml(item.city)}, Texas</strong><em>${
            providers.map(provider => `<b style="--provider-color:${providerMeta[provider].color}">${escapeHtml(providerMeta[provider].label)}</b>`).join('')
          }</em></span>`;
          marker.addEventListener('click', event => {
            event.stopPropagation();
            if ((!canHoverPins() || isCompactViewport()) && !marker.classList.contains('is-preview')) {
              container.querySelectorAll('.texas-map-city.is-preview').forEach(pin =>
                pin.classList.remove('is-preview'));
              marker.classList.add('is-preview');
              return;
            }
            marker.classList.remove('is-preview');
            onSelect(item);
          });
          new maplibregl.Marker({ element: marker, anchor: 'center' }).setLngLat(item.center).addTo(map);
        });
        requestAnimationFrame(() => container.querySelectorAll('.texas-map-city').forEach(pin =>
          pin.classList.add('is-pulsing')));
        const dismissPinCard = event => {
          const origin = event.originalEvent?.target || event.target;
          if (origin?.closest?.('.texas-map-city')) return;
          container.querySelectorAll('.texas-map-city.is-preview').forEach(pin =>
            pin.classList.remove('is-preview'));
        };
        map.on('click', dismissPinCard);
        const initialView = pending || (() => showOverview(0));
        pending = null;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          map.resize();
          initialView();
          map.once('idle', () => onReady?.());
        }));
      });

      return {
        showOverview,
        showSelection,
        destroy() {
          resizeObserver?.disconnect();
          visualViewport?.removeEventListener('resize', handleViewportResize);
          map?.remove();
        },
      };
    },
  };
})();
