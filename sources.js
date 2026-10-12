/* Source diagnostics only: read backend snapshots and observe collection events. */
(() => {
  'use strict';
  const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const timestamp = value => number(value) > 0 ? new Date(value * 1000) : null;
  const timeLabel = value => timestamp(value)?.toLocaleTimeString() || '—';
  const dateLabel = value => timestamp(value)?.toLocaleString() || '—';
  const amount = value => number(value) === null ? '—' : value.toLocaleString();
  const safeUrl = value => {
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
    catch { return ''; }
  };
  const statusClass = value => ['online', 'crawling', 'degraded', 'stale', 'error', 'unavailable', 'waiting', 'key required'].includes(value) ? value.replace(' ', '-') : 'waiting';
  function sourceView(source, connected) {
    const activity = source.activity || {};
    const status = connected ? source.status || 'unknown' : 'stale';
    return {
      status, css: statusClass(status),
      cached: !!(source.cached || activity.cached),
      count: number(activity.count),
      elapsed: number(source.lagMs) ?? (number(activity.completedAt) > 0 ? number(activity.elapsedMs) : null),
      success: number(activity.lastSuccessAt),
      error: activity.error || '',
    };
  }
  function validateSources(value) {
    if (!Array.isArray(value) || !value.length || value.some(source => !source || typeof source.name !== 'string' || !source.name || typeof source.status !== 'string')) throw new Error('Invalid source health response');
    if (new Set(value.map(source => source.name)).size !== value.length) throw new Error('Duplicate source names in response');
    return value;
  }
  // The pure helpers are also used by the offline regression checks.
  if (typeof module !== 'undefined' && module.exports) module.exports = {number, escapeHtml, safeUrl, sourceView, validateSources, timestamp};
  if (typeof document === 'undefined') return;

  const $ = selector => document.querySelector(selector);
  const params = new URLSearchParams(location.search);
  const local = ['127.0.0.1', 'localhost'].includes(location.hostname);
  const requestedPort = Number(params.get('api'));
  const port = Number.isInteger(requestedPort) && requestedPort >= 1 && requestedPort <= 65535 ? requestedPort : 8788;
  const api = window.CRAWLCA_API || (local ? `http://127.0.0.1:${port}/api` : '/api');
  const state = {sources: [], connected: false, attempted: false, error: '', lastRead: null, stats: null, statsCurrent: false, selected: '', wanted: params.get('source') || '', events: []};
  let refreshInFlight = null, refreshAgain = false, refreshTimer = null, pollTimer = null, stream = null, disposed = false;
  let previewController = null, previewRevision = 0, previewState = {name: '', mode: 'empty', value: null, error: ''};
  let renderedSource = '';

  async function getJson(path, signal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(abort, 10000);
    try {
      const response = await fetch(`${api}${path}`, {headers: {Accept: 'application/json'}, cache: 'no-store', signal: controller.signal});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  function explorerUrl(name) {
    const search = new URLSearchParams({source: name});
    if (local && params.has('api')) search.set('api', String(port));
    return `console.html?${search}`;
  }
  function renderHealth() {
    const views = state.sources.map(source => sourceView(source, state.connected));
    $('#connection').dataset.state = state.connected ? 'live' : state.attempted ? 'stale' : 'loading';
    $('#connection-label').textContent = state.connected ? 'API connected · reported source health' : state.attempted ? `${state.sources.length ? 'Stale source health ·' : 'Source health unavailable ·'} ${state.error}` : 'Connecting · waiting for source health';
    $('#last-sync').textContent = `Last read ${state.lastRead?.toLocaleTimeString() || '—'}`;
    $('#online-count').textContent = state.sources.length ? `${state.connected ? views.filter(view => view.status === 'online').length : '—'}/${views.length}` : '—';
    $('#cached-count').textContent = state.connected ? amount(views.filter(view => view.cached).length) : '—';
    $('#active-count').textContent = state.connected ? amount(views.filter(view => view.status === 'crawling').length) : '—';
    $('#snapshot-time').textContent = timeLabel(state.stats?.updatedAt);
    $('#snapshot-meta').textContent = state.statsCurrent && timestamp(state.stats?.updatedAt) ? `server snapshot · ${timestamp(state.stats.updatedAt).toLocaleDateString()}` : state.stats ? 'last known time · stats unavailable' : 'collection time unavailable';
    if (!state.sources.length) {
      $('#source-grid').innerHTML = `<div class="empty">${state.attempted ? 'Source health could not be loaded. Refresh to retry; no online status has been assumed.' : 'Waiting for source health. No online status has been assumed.'}</div>`;
      return;
    }
    // Keep buttons stable across polls so keyboard focus is not lost.
    const existing = new Map([...$('#source-grid').querySelectorAll('button[data-source]')].map(button => [button.dataset.source, button]));
    if (!existing.size) $('#source-grid').textContent = '';
    for (const source of state.sources) {
      const view = sourceView(source, state.connected);
      let button = existing.get(source.name);
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.className = 'source-card'; button.dataset.source = source.name;
        button.addEventListener('click', () => selectSource(source.name)); $('#source-grid').append(button);
      }
      existing.delete(source.name);
      button.setAttribute('aria-pressed', String(source.name === state.selected));
      button.innerHTML = `<span class="source-top"><strong>${escapeHtml(source.name)}</strong><span class="status ${view.css}">${escapeHtml(view.status)}</span></span>
        <span class="source-meta" style="display:block">${escapeHtml(source.chain || '—')} · ${escapeHtml(source.transport || 'transport unknown')}${view.cached ? ' · cached rows' : ''}</span>
        <span class="source-numbers"><span>${amount(view.count)} rows</span><span>${view.elapsed === null ? '—' : `${Math.round(view.elapsed)} ms`}</span></span>
        <span class="source-meta" style="display:block">Last success ${timeLabel(view.success)}</span>
        ${view.error ? `<span class="source-error" style="display:block">${escapeHtml(view.error)}</span>` : ''}`;
    }
    for (const button of existing.values()) button.remove();
  }
  function renderDetail() {
    const source = state.sources.find(item => item.name === state.selected);
    if (!source) { renderedSource = ''; $('#detail-status').textContent = 'awaiting source'; $('#source-detail').innerHTML = '<div class="empty">Select a source to view timestamps, request details and normalized records.</div>'; return; }
    const sameSource = renderedSource === source.name;
    const previewScroll = sameSource ? $('#preview-text')?.scrollTop || 0 : 0;
    const focusedControl = sameSource ? ['source-explorer', 'source-website', 'preview-text'].find(id => document.activeElement === $(`#${id}`)) : null;
    const activity = source.activity || {}, view = sourceView(source, state.connected);
    const preview = previewState.name === source.name ? previewState : {mode:'empty', value:null, error:''};
    const value = preview.value;
    const website = safeUrl(activity.website || value?.website);
    const row = (label, content, wide = false) => `<div${wide ? ' class="wide"' : ''}><dt>${label}</dt><dd>${escapeHtml(content)}</dd></div>`;
    $('#detail-status').textContent = `${view.status}${view.cached ? ' · cached rows' : ''}`;
    $('#source-detail').innerHTML = `<h3 class="selected-name">${escapeHtml(source.name)}</h3>
      <div class="detail-summary">${escapeHtml(source.chain || '—')} · ${escapeHtml(source.kind || '—')} · ${escapeHtml(source.transport || 'transport unknown')}${!state.connected ? '<br>Source health is stale because the API read failed.' : ''}</div>
      <dl class="detail-grid">${row('Last successful collection', dateLabel(view.success))}${row('Snapshot rows', amount(view.count))}${row('Last request started', dateLabel(activity.startedAt))}${row('Last request completed', dateLabel(activity.completedAt))}${row('Last completed request', view.elapsed === null ? '—' : `${Math.round(view.elapsed)} ms`)}${row('Required server credential', source.requiredKey === null ? 'None' : source.requiredKey || '—')}${row('Snapshot request URL', activity.requestUrl || value?.url || '—', true)}${row('Latest attempted URL', activity.attemptUrl || '—', true)}</dl>
      <div class="detail-error">${escapeHtml(view.error)}</div>
      <div class="detail-actions"><a class="primary" id="source-explorer" href="${escapeHtml(explorerUrl(source.name))}">Explore source contracts ↗</a>${website ? `<a class="ghost" id="source-website" href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">Source website ↗</a>` : ''}</div>
      <p class="preview-label" id="preview-label"></p><pre class="preview" id="preview-text" tabindex="0" aria-label="Normalized source snapshot"></pre>`;
    const label = $('#preview-label'), text = $('#preview-text');
    if (preview.mode === 'loading' && !value) { label.textContent = 'Reading saved adapter snapshot…'; text.textContent = 'Loading…'; }
    else if (value) {
      label.textContent = `Saved normalized snapshot · up to 3 records · ${amount(value.count)} source rows · collected ${dateLabel(value.lastSuccessAt || value.fetchedAt)}. This is not the raw upstream response.${preview.mode === 'loading' ? ' Refreshing; showing the previous snapshot.' : ''}${!state.connected ? ' API unavailable; this preview is retained locally.' : ''}${preview.mode === 'stale' ? ` Preview read failed; showing the previous snapshot (${preview.error}).` : ''}`;
      text.textContent = typeof value.text === 'string' && value.text ? value.text : 'No normalized records are available for this source.';
    } else { label.textContent = preview.mode === 'error' ? `Preview unavailable · ${preview.error}` : 'Saved normalized snapshot'; text.textContent = preview.mode === 'error' ? 'The preview could not be loaded. Refresh the snapshot to retry.' : 'No snapshot received.'; }
    // Polling must not move a keyboard user's place or reset a scrolled preview.
    // A different source starts at the top and does not inherit the old focus.
    if (focusedControl) $(`#${focusedControl}`)?.focus({preventScroll: true});
    text.scrollTop = previewScroll;
    renderedSource = source.name;
  }
  async function loadPreview(name) {
    const revision = ++previewRevision;
    previewController?.abort(); previewController = new AbortController();
    const previous = previewState.name === name ? previewState.value : null;
    previewState = {name, mode:'loading', value:previous, error:''}; renderDetail();
    try {
      const value = await getJson(`/source-preview?source=${encodeURIComponent(name)}`, previewController.signal);
      if (revision !== previewRevision || state.selected !== name || disposed) return;
      if (!value || value.source !== name || typeof value.text !== 'string') throw new Error('Invalid source preview response');
      previewState = {name, mode:'ready', value, error:''};
    } catch (error) {
      if (revision !== previewRevision || state.selected !== name || disposed) return;
      previewState = {name, mode:previous ? 'stale' : 'error', value:previous, error:error.message || 'Request failed'};
    }
    renderDetail();
  }
  function selectSource(name, updateUrl = true) {
    if (!state.sources.some(source => source.name === name)) return;
    state.selected = name;
    if (updateUrl) {
      const url = new URL(location.href); url.searchParams.set('source', name); history.replaceState(null, '', url);
      $('#selection-notice').textContent = '';
    }
    renderHealth(); loadPreview(name);
  }
  async function refreshSnapshot(preview = false) {
    if (disposed) return;
    if (refreshInFlight) { refreshAgain = refreshAgain || preview; return refreshInFlight; }
    $('#refresh').disabled = true;
    refreshInFlight = (async () => {
      const [sourcesResult, statsResult] = await Promise.allSettled([getJson('/sources').then(validateSources), getJson('/stats')]);
      if (disposed) return;
      state.attempted = true;
      if (sourcesResult.status === 'fulfilled') { state.sources = sourcesResult.value; state.connected = true; state.error = ''; state.lastRead = new Date(); }
      else { state.connected = false; state.error = sourcesResult.reason?.message || 'Request failed'; }
      state.statsCurrent = statsResult.status === 'fulfilled' && number(statsResult.value?.updatedAt) !== null;
      if (state.statsCurrent) state.stats = statsResult.value;
      if (state.sources.length && !state.sources.some(source => source.name === state.selected)) {
        if (state.wanted && !state.sources.some(source => source.name === state.wanted)) $('#selection-notice').textContent = 'The requested source was not found. Showing the first available source.';
        state.selected = state.sources.some(source => source.name === state.wanted) ? state.wanted : state.sources[0].name;
        state.wanted = ''; preview = true;
      }
      renderHealth(); renderDetail();
      if (preview && state.selected) await loadPreview(state.selected);
    })();
    try { await refreshInFlight; }
    finally {
      refreshInFlight = null; $('#refresh').disabled = false;
      if (refreshAgain && !disposed) { refreshAgain = false; queueMicrotask(() => refreshSnapshot(true)); }
    }
  }
  function renderEvents() {
    if (!state.events.length) return;
    $('#events').innerHTML = state.events.map(event => `<li class="event"><div class="event-head"><time>${escapeHtml(timeLabel(event.at))}</time><span>${escapeHtml(event.kind.replaceAll('_', ' '))}</span></div><strong>${escapeHtml(event.source || 'Collection cycle')}</strong> · ${escapeHtml(event.status || '—')}${number(event.count) === null ? '' : ` · ${amount(event.count)} ${event.kind === 'source_completed' ? 'fresh rows' : 'rows'}`}${number(event.elapsedMs) === null ? '' : ` · ${Math.round(event.elapsedMs)} ms`}${event.error ? `<div class="event-error">${escapeHtml(event.error)}</div>` : ''}</li>`).join('');
  }
  function scheduleRefresh(preview = false) {
    clearTimeout(refreshTimer);
    refreshAgain = refreshAgain || preview;
    refreshTimer = setTimeout(() => { const includePreview = refreshAgain; refreshAgain = false; refreshSnapshot(includePreview); }, 300);
  }
  function connectEvents() {
    if (!window.EventSource) { $('#event-connection').textContent = 'SSE unavailable · polling health'; return; }
    stream = new EventSource(`${api}/events`);
    stream.onopen = () => { $('#event-connection').textContent = 'connected · this session'; };
    stream.onerror = () => { $('#event-connection').textContent = 'reconnecting · health polling continues'; $('#event-heartbeat').textContent = 'Event stream interrupted'; };
    const consume = message => {
      try {
        const event = JSON.parse(message.data);
        if (!event || typeof event !== 'object') return;
        $('#event-heartbeat').textContent = `Last event ${timeLabel(event.at)}`;
        if (message.type === 'heartbeat') return;
        if (message.type === 'resync') { scheduleRefresh(true); return; }
        if (number(event.seq) !== null && state.events.some(previous => previous.seq === event.seq)) return;
        state.events.unshift({...event, kind:message.type}); state.events.length = Math.min(state.events.length, 60); renderEvents();
        scheduleRefresh(message.type === 'crawl_completed' || (message.type === 'source_completed' && event.source === state.selected));
      } catch { /* A malformed event must not replace the last valid health snapshot. */ }
    };
    ['crawl_started', 'source_started', 'source_completed', 'tokens_indexed', 'crawl_completed', 'heartbeat', 'resync'].forEach(type => stream.addEventListener(type, consume));
  }
  $('#refresh').addEventListener('click', () => refreshSnapshot(true));
  window.addEventListener('pagehide', () => { disposed = true; stream?.close(); previewController?.abort(); clearInterval(pollTimer); clearTimeout(refreshTimer); });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  connectEvents(); refreshSnapshot(true); pollTimer = setInterval(() => refreshSnapshot(), 15000);
})();
