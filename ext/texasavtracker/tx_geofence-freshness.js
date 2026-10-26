// Map-badge copy for the home page and the brand dashboards.
// updatedAt is the last time the shapes changed. checkedAt is the last
// successful source read. A failed attempt or 45 minutes without a success
// switches the badge to a warning. Polygon styling is not decided here.
(function () {
  const STALE_MS = 45 * 60 * 1000;

  function valid(iso) {
    const ms = Date.parse(iso || '');
    return Number.isFinite(ms) ? ms : null;
  }

  function centralDate(ms) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric',
    }).format(new Date(ms));
  }

  function centralClock(ms) {
    const clock = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(new Date(ms));
    return `${clock} CT`;
  }

  function badge(payload, now = Date.now()) {
    if (!payload || typeof payload !== 'object') {
      return { warning: true, text: 'Boundary check failed' };
    }
    const updatedMs = valid(payload.updatedAt);
    const checkedMs = valid(payload.checkedAt);
    const failed = Boolean(payload.lastError);
    const stale = payload.stale === true || checkedMs == null || (now - checkedMs) >= STALE_MS;
    const warning = failed || stale;
    const parts = [`Boundaries as of ${updatedMs == null ? 'unknown' : centralDate(updatedMs)}`];
    if (checkedMs != null) parts.push(`Last check ${centralClock(checkedMs)}`);
    if (failed) parts.push('Check failed');
    else if (stale) parts.push('No successful check for 45+ minutes');
    return { warning, text: parts.join(' · ') };
  }

  function apply(el, payload, now) {
    if (!el) return;
    const state = badge(payload, now);
    el.classList.toggle('is-warning', state.warning);
    const dot = document.createElement('span');
    dot.className = 'live-dot';
    el.replaceChildren(dot, document.createTextNode(state.text));
  }

  window.GeofenceFreshness = { STALE_MS, badge, apply };
})();
