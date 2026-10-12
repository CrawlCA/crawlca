// Live crawl telemetry for the Room: crawl-cycle ring, per-source request lanes,
// SQLite-backed 2h history (latency heat strips, card sparklines, new-CA flow)
// and the first-seen contract feed. Every mark comes from a server event,
// /api/crawl/status or /api/history; nothing here is simulated.
(() => {
  'use strict';
  const API = window.CRAWLCA_API_BASE || '/api';
  const SOURCES = window.crawlcaRoomSources || [];
  const LOGO = window.crawlcaLogo || { token: () => '', platform: () => '' };
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HISTORY_MINUTES = 120, FEED_MAX = 12;
  const CHAIN_COLOR = { SOL: '#c79bff', BNB: '#f5c96a', RH: '#f2a7ff', BASE: '#4a8dff', ETH: '#b9b8ff' };
  const chainColor = c => CHAIN_COLOR[c] || '#67d9ff';
  const STATUS_COLOR = { online: '#69f0b2', crawling: '#67d9ff', degraded: '#f5c96a', stale: '#f5c96a', error: '#ff6e83', unavailable: '#ff6e83', 'key required': '#76839c' };
  const statusColor = s => STATUS_COLOR[s] || '#76839c';
  const short = a => { a = String(a || ''); return a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a; };
  const ago = s => { s = Math.max(0, Math.round(s)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
  // A contract first seen by crawlca may be an older one rotating into a trending feed.
  const LAUNCH_FRESH_SECONDS = 900;
  const clock = at => new Date(at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const L = {
    skew: 0, // server clock minus browser clock, seconds
    status: null, // last /api/crawl/status
    running: false, base: 0, // base = performance.now() when the live cycle started
    lanes: new Map(), // source -> {start, end, status, count} in ms from cycle start
    history: null,
    feed: [], // {chain, address, source, at, token?, fresh}
  };
  const serverNow = () => Date.now() / 1000 + L.skew;

  async function getJson(path) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try { const r = await fetch(`${API}${path}`, { cache: 'no-store', signal: controller.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
    finally { clearTimeout(timer); }
  }

  // ---------- crawl cycle (status + live events) ----------
  function lanesFromStatus(status) {
    const lanes = new Map(), start = status.startedAt || 0;
    Object.entries(status.sourceActivity || {}).forEach(([name, a]) => {
      if (!a || !a.startedAt || a.startedAt < start) return;
      const s = (a.startedAt - start) * 1000, done = a.completedAt >= a.startedAt && a.status !== 'crawling';
      lanes.set(name, { start: s, end: done ? s + (a.elapsedMs || 0) : null, status: a.status, count: a.cached ? 0 : a.count });
    });
    return lanes;
  }
  async function loadStatus() {
    try {
      const status = await getJson('/crawl/status');
      L.status = status;
      // Keep live lanes for a cycle that is streaming in; otherwise show the last saved cycle.
      if (!L.running) { L.lanes = lanesFromStatus(status); L.running = !!status.inProgress; if (L.running) L.base = performance.now() - (serverNow() - status.startedAt) * 1000; }
    } catch { /* the ring stays in its loading state and retries */ }
  }
  async function loadHistory() {
    try { L.history = await getJson(`/history?minutes=${HISTORY_MINUTES}`); mergeRecent(); }
    catch { /* keep the previous history */ }
    renderHistory();
  }

  function onEvent(ev) {
    if (!ev) return;
    if (Number.isFinite(ev.at)) L.skew = ev.at - Date.now() / 1000;
    const t = performance.now() - L.base;
    if (ev.kind === 'crawl_started') { L.running = true; L.base = performance.now(); L.lanes = new Map(); if (L.status) L.status.startedAt = ev.at; }
    else if (ev.kind === 'source_started' && ev.source) { if (!L.running) { L.running = true; L.base = performance.now(); L.lanes = new Map(); } L.lanes.set(ev.source, { start: Math.max(0, t), end: null, status: 'crawling', count: null }); }
    else if (ev.kind === 'source_completed' && ev.source) {
      const lane = L.lanes.get(ev.source), ms = ev.elapsedMs ?? 0;
      const start = lane ? lane.start : Math.max(0, t - ms);
      L.lanes.set(ev.source, { start, end: start + ms, status: ev.status || 'online', count: ev.cached ? 0 : ev.count });
    } else if (ev.kind === 'crawl_completed') {
      L.running = false;
      if (L.status) { L.status.completedAt = ev.at; L.status.inProgress = false; }
      loadStatus(); loadHistory();
    } else if (ev.kind === 'cas_discovered') discovered(ev);
  }

  // ---------- ring + lanes ----------
  const RING = 2 * Math.PI * 11;
  function renderCycle() {
    const el = $('#cycleRing'); if (!el) return;
    const st = L.status, total = SOURCES.length || 12;
    if (!st) { el.classList.add('pending'); return; }
    el.classList.remove('pending');
    let progress, color, text;
    if (L.running) {
      const done = [...L.lanes.values()].filter(l => l.end != null).length;
      progress = done / total; color = '#67d9ff';
      text = `CRAWLING ${done}/${total} · ${((performance.now() - L.base) / 1000).toFixed(1)}s`;
    } else {
      const every = st.refreshSeconds || 60, left = st.completedAt ? st.completedAt + every - serverNow() : 0;
      progress = Math.min(1, Math.max(0, 1 - left / every)); color = '#69f0b2';
      // The server checks its schedule every 5s, so the start is approximate.
      text = left > 0 ? `NEXT CRAWL ≈ ${Math.ceil(left)}s` : 'NEXT CRAWL · STARTING';
    }
    el.style.color = color;
    el.querySelector('.cyc-p').style.strokeDashoffset = (RING * (1 - progress)).toFixed(2);
    el.querySelector('.cyc-t').textContent = text;
    el.classList.toggle('run', L.running);
  }

  function laneWindow() {
    let longest = 0;
    L.lanes.forEach(l => { longest = Math.max(longest, (l.end ?? (performance.now() - L.base))); });
    return Math.max(15, Math.ceil((longest / 1000 + 1) / 5) * 5) * 1000;
  }
  function buildLanes() {
    const host = $('#lanes'); if (!host || host.dataset.built) return;
    host.dataset.built = '1';
    host.innerHTML = `<div class="lane-h"><span>source</span><span>this crawl cycle <em id="laneScale"></em></span><span><b id="heatTitle">last 2h · request latency</b> <em id="heatScale"></em></span></div>` +
      SOURCES.map(s => `<div class="lane" data-s="${esc(s.name)}"><span class="ln-name">${LOGO.platform(s.name)}${esc(s.name)}</span><span class="ln-track"><i class="ln-bar"></i><b class="ln-v"></b></span><span class="ln-heat"></span></div>`).join('');
  }
  function renderLanes() {
    buildLanes();
    const W = laneWindow(), nowMs = performance.now() - L.base;
    const scale = $('#laneScale'); if (scale) scale.textContent = `0–${W / 1000}s${L.running ? ' · live' : L.status?.startedAt ? ` · ${clock(L.status.startedAt)}` : ''}`;
    document.querySelectorAll('#lanes .lane').forEach(row => {
      const lane = L.lanes.get(row.dataset.s), bar = row.querySelector('.ln-bar'), v = row.querySelector('.ln-v');
      if (!lane) { bar.style.width = '0'; v.textContent = L.running ? 'queued' : '—'; row.classList.remove('live'); return; }
      const end = lane.end ?? (L.running ? nowMs : lane.start), live = lane.end == null && L.running;
      bar.style.left = `${(lane.start / W) * 100}%`;
      bar.style.width = `${Math.max(0.6, ((end - lane.start) / W) * 100)}%`;
      bar.style.background = statusColor(live ? 'crawling' : lane.status);
      row.classList.toggle('live', live);
      v.textContent = live ? `${((end - lane.start) / 1000).toFixed(1)}s…` : `${((end - lane.start) / 1000).toFixed(1)}s${lane.count != null ? ` · ${lane.count}` : ''}${lane.status !== 'online' ? ` · ${lane.status}` : ''}`;
    });
  }

  // ---------- history: heat strips, sparklines, new-CA flow ----------
  // Charts start at the first recorded bucket (at least 15 minutes, at most the
  // requested 2h) so a fresh deploy does not draw an almost empty timeline.
  function viewWindow(h) {
    const first = h.cycles.length ? h.cycles[0].at - h.bucketSeconds : h.from;
    const from = Math.max(h.from, Math.min(h.to - 900, first));
    return { from, span: Math.max(1, h.to - from), label: `−${ago(h.to - from)}` };
  }
  function heatColor(ms, ok) {
    if (ok < 0.5) return '#ff2e4d';
    // 100ms → green, ~2s → yellow, 20s+ → red, on a log scale.
    const t = Math.min(1, Math.max(0, Math.log10(Math.max(ms, 100) / 100) / Math.log10(200)));
    const mix = (a, b, k) => a.map((x, i) => Math.round(x + (b[i] - x) * k));
    const g = [105, 240, 178], y = [245, 201, 106], r = [255, 110, 131];
    const c = t < 0.5 ? mix(g, y, t * 2) : mix(y, r, (t - 0.5) * 2);
    return `rgb(${c.join(',')})`;
  }
  function renderHeat(h) {
    const { from, span, label } = viewWindow(h), scale = $('#heatScale'), title = $('#heatTitle');
    if (title) title.textContent = `last ${label.slice(1)} · request latency`;
    if (scale) scale.textContent = h.cycles.length ? `${h.cycles.length} buckets · ${h.bucketSeconds}s each` : '';
    document.querySelectorAll('#lanes .lane').forEach(row => {
      const pts = h.sources[row.dataset.s] || [], cell = row.querySelector('.ln-heat');
      if (!pts.length) { cell.innerHTML = `<small>${h.cycles.length ? 'no runs' : 'recording…'}</small>`; return; }
      const w = Math.max(1, (h.bucketSeconds / span) * 300);
      cell.innerHTML = `<svg viewBox="0 0 300 12" preserveAspectRatio="none">${pts.map(p => `<rect x="${(((p.at - from) / span) * 300 - w).toFixed(1)}" y="0" width="${w.toFixed(1)}" height="12" fill="${heatColor(p.elapsedMs, p.okRatio)}"${p.okRatio < 1 && p.okRatio >= 0.5 ? ' stroke="#ff6e83" stroke-width=".8"' : ''}><title>${clock(p.at)} · ${Math.round(p.elapsedMs)}ms · ${p.count} rows · ${Math.round(p.okRatio * 100)}% ok</title></rect>`).join('')}</svg>`;
    });
  }

  const LAUNCH = new Set(SOURCES.filter(s => s.kind === 'launchpad').map(s => s.name));
  const DEX = new Set(SOURCES.filter(s => s.kind === 'dex').map(s => s.name));
  function sumSources(h, names) {
    const by = new Map();
    Object.entries(h.sources).forEach(([name, pts]) => { if (names.has(name)) pts.forEach(p => by.set(p.at, (by.get(p.at) || 0) + p.count)); });
    return h.cycles.map(c => by.get(c.at) ?? 0);
  }
  // One series per agent card, in card order. QUEEN has no history series.
  function cardSeries(h) {
    const online = new Map();
    Object.values(h.sources).forEach(pts => pts.forEach(p => online.set(p.at, (online.get(p.at) || 0) + p.okRatio)));
    return [
      ['launchpad rows received', sumSources(h, LAUNCH)],
      ['contracts indexed', h.cycles.map(c => c.indexed)],
      ['DEX rows received', sumSources(h, DEX)],
      ['seen under 15 minutes', h.cycles.map(c => c.fresh)],
      ['tracked liquidity', h.cycles.map(c => c.liquidity ?? 0)],
      ['review queue', h.cycles.map(c => c.review)],
      ['adapters online', h.cycles.map(c => online.get(c.at) || 0)],
      null,
    ];
  }
  function sparkline(values) {
    const min = Math.min(...values), max = Math.max(...values), range = max - min || 1, n = values.length;
    const pts = values.map((v, i) => `${((i / (n - 1)) * 100).toFixed(2)},${(26 - ((v - min) / range) * 22).toFixed(2)}`);
    return `<polygon points="0,28 ${pts.join(' ')} 100,28" fill="currentColor" opacity=".18"/><polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;
  }
  const fmtV = v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}m` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v * 10) / 10}`;
  function renderSparks(h) {
    cardSeries(h).forEach((series, i) => {
      const card = document.querySelector(`#cards .card[data-i="${i}"]`); if (!card) return;
      let svg = card.querySelector('.spark');
      if (!series || h.cycles.length < 2) { if (svg) svg.remove(); return; }
      if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'spark'); svg.setAttribute('viewBox', '0 0 100 28'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true'); card.appendChild(svg); }
      const [label, values] = series;
      svg.innerHTML = `<title>${esc(label)} · last ${viewWindow(h).label.slice(1)} · ${fmtV(Math.min(...values))}–${fmtV(Math.max(...values))}</title>${sparkline(values)}`;
    });
  }

  function renderFlow(h) {
    const svg = $('#flowSvg'), legend = $('#flowLegend'), sum = $('#newSummary'); if (!svg) return;
    const { from, span, label } = viewWindow(h), total = h.cycles.reduce((a, c) => a + c.newCas, 0);
    if (sum) sum.textContent = `${total} first seen · last ${label.slice(1)}`;
    if (!h.cycles.length) { svg.innerHTML = `<text x="300" y="80" fill="#5d6b85" font-size="11" text-anchor="middle">Recording crawl history · the first cycle after deploy sets the baseline</text>`; legend.innerHTML = ''; return; }
    const buckets = new Map();
    Object.entries(h.chains).forEach(([chain, pts]) => pts.forEach(p => { if (!p.newCas) return; const b = buckets.get(p.at) || {}; b[chain] = p.newCas; buckets.set(p.at, b); }));
    const max = Math.max(1, ...[...buckets.values()].map(b => Object.values(b).reduce((a, v) => a + v, 0)));
    const w = Math.max(2, (h.bucketSeconds / span) * 580 - 1), chains = Object.keys(h.chains).sort();
    let bars = '';
    buckets.forEach((b, at) => {
      let y = 130; const x = 10 + ((at - from) / span) * 580 - w;
      chains.forEach(c => { if (!b[c]) return; const hh = (b[c] / max) * 110; y -= hh; bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${hh.toFixed(1)}" fill="${chainColor(c)}"><title>${clock(at)} · ${c} ${b[c]} new</title></rect>`; });
    });
    const axis = `<line x1="10" y1="130.5" x2="590" y2="130.5" stroke="#16223a"/><text x="10" y="146" fill="#5d6b85" font-size="9">${label}</text><text x="590" y="146" fill="#5d6b85" font-size="9" text-anchor="end">now</text><text x="10" y="14" fill="#5d6b85" font-size="9">${max} max / bucket</text>`;
    svg.innerHTML = axis + (bars || `<text x="300" y="76" fill="#5d6b85" font-size="11" text-anchor="middle">No first-seen contracts in the last ${label.slice(1)} · watching ${SOURCES.length} sources</text>`);
    const per = {}; Object.entries(h.chains).forEach(([c, pts]) => { per[c] = pts.reduce((a, p) => a + p.newCas, 0); });
    legend.innerHTML = chains.filter(c => per[c]).map(c => `<span><b style="background:${chainColor(c)}"></b>${esc(c)} ${per[c]}</span>`).join('') + '<span class="flow-note">first seen by crawlca · trending feeds can surface older contracts</span>';
  }

  function renderHistory() {
    const h = L.history; if (!h) return;
    const panel = $('#newca');
    if (!h.enabled) { if (panel) panel.classList.add('off'); return; }
    if (panel) panel.classList.remove('off');
    buildLanes(); renderHeat(h); renderSparks(h); renderFlow(h); renderFeed();
  }

  // ---------- first-seen feed ----------
  const lookup = (chain, address) => (window.crawlcaRoomLookup && window.crawlcaRoomLookup(chain, address)) || null;
  function mergeRecent() {
    const known = new Set(L.feed.map(f => `${f.chain}:${f.address}`));
    (L.history?.recent || []).forEach(d => { const k = `${d.chain}:${d.address}`; if (!known.has(k)) { known.add(k); L.feed.push({ chain: d.chain, address: d.address, source: d.source, symbol: d.symbol, launchedAt: d.launchedAt, at: d.firstSeenAt }); } });
    L.feed.sort((a, b) => b.at - a.at); L.feed.length = Math.min(L.feed.length, FEED_MAX);
  }
  function discovered(ev) {
    const rows = Array.isArray(ev.rows) ? ev.rows : [];
    const known = new Set(L.feed.map(f => `${f.chain}:${f.address}`));
    rows.slice().reverse().forEach(t => { const k = `${t.chain}:${t.full}`; if (known.has(k)) return; L.feed.unshift({ chain: t.chain, address: t.full, source: t.source, at: ev.at, token: t, fresh: true }); });
    L.feed.length = Math.min(L.feed.length, FEED_MAX);
    renderFeed(); burst(Math.min(rows.length, 12));
    [0, 3].forEach(i => { const card = document.querySelector(`#cards .card[data-i="${i}"]`); if (card) { card.classList.remove('hit'); void card.offsetWidth; card.classList.add('hit'); } });
    const sum = $('#newSummary'); if (sum) { sum.classList.remove('flash'); void sum.offsetWidth; sum.classList.add('flash'); }
  }
  // Keyed update: existing rows are never re-created or moved, so a row's
  // entrance animation survives the history reload that follows each crawl.
  function feedItem(f, at) {
    const t = f.token || lookup(f.chain, f.address) || { symbol: f.symbol || short(f.address), chain: f.chain, full: f.address, seenAt: f.launchedAt };
    const launched = Number(t.seenAt), old = launched > 0 && f.at - launched > LAUNCH_FRESH_SECONDS;
    const li = document.createElement('li');
    li.className = `fe${f.fresh ? ' new' : ''}${old ? ' old' : ''}`;
    li.dataset.k = `${f.chain}:${f.address}`;
    li.innerHTML = `<button type="button" data-ca="${esc(f.address)}" data-chain="${esc(f.chain)}" data-base="${esc(f.address)}${launched > 0 ? ` · launched ${ago(at - launched)} ago` : ''}">${LOGO.token(t, chainColor(f.chain))}<b>${esc(t.symbol)}</b><span class="fe-chain" style="color:${chainColor(f.chain)}">${esc(f.chain)}</span><em>${LOGO.platform(f.source)}${esc(f.source)}${old ? ` · launched ${ago(at - launched)}` : launched > 0 ? ' · new launch' : ''}</em><time></time></button>`;
    return li;
  }
  function renderFeed() {
    const list = $('#newFeed'); if (!list) return;
    if (!L.feed.length) { list.innerHTML = `<li class="fe-empty">${L.history?.enabled ? 'Waiting for the next first-seen contract' : ''}</li>`; return; }
    const at = serverNow(), want = new Set(L.feed.map(f => `${f.chain}:${f.address}`)), have = new Map();
    [...list.children].forEach(li => { if (li.dataset.k && want.has(li.dataset.k)) have.set(li.dataset.k, li); else li.remove(); });
    let cursor = list.firstElementChild;
    L.feed.forEach(f => {
      const k = `${f.chain}:${f.address}`, li = have.get(k) || feedItem(f, at);
      if (li === cursor) cursor = cursor.nextElementSibling; else list.insertBefore(li, cursor);
      li.querySelector('time').textContent = ago(at - f.at);
      const button = li.querySelector('button'); button.title = `${button.dataset.base} · first seen by crawlca ${ago(at - f.at)} ago`;
      f.fresh = false;
    });
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('#newFeed [data-ca]'); if (!b) return;
    window.crawlcaRoomSelect && window.crawlcaRoomSelect(b.dataset.chain, b.dataset.ca);
    window.crawlcaSwarmInspect && window.crawlcaSwarmInspect(b.dataset.ca, b.dataset.chain);
  });

  // New contracts travel the DISCOVER edge of the data-flow graph into the index.
  function burst(n) {
    const eng = $('#eng'), path = $('#ep0'); if (reduce || !eng || !path || !n) return;
    const NS = 'http://www.w3.org/2000/svg';
    for (let i = 0; i < n; i++) {
      const dot = document.createElementNS(NS, 'circle'), motion = document.createElementNS(NS, 'animateMotion'), mpath = document.createElementNS(NS, 'mpath');
      dot.setAttribute('r', '4.5'); dot.setAttribute('fill', '#ff4da6'); dot.setAttribute('filter', 'drop-shadow(0 0 4px #ff4da6)');
      motion.setAttribute('dur', '1.4s'); motion.setAttribute('begin', 'indefinite'); motion.setAttribute('fill', 'freeze');
      mpath.setAttribute('href', '#ep0'); motion.appendChild(mpath); dot.appendChild(motion); eng.appendChild(dot);
      setTimeout(() => { try { motion.beginElement(); } catch { /* SMIL unsupported */ } }, i * 140);
      setTimeout(() => dot.remove(), i * 140 + 1600);
    }
  }

  // ---------- wiring ----------
  window.addEventListener('crawlcaRoomEvent', e => onEvent(e.detail));
  setInterval(() => { if (!document.hidden) { renderCycle(); renderLanes(); } }, 200);
  // Feed ages refresh slowly; history reloads after each crawl and as a fallback.
  setInterval(() => { if (!document.hidden) renderFeed(); }, 15000);
  setInterval(() => { if (!document.hidden) { loadStatus(); loadHistory(); } }, 60000);
  buildLanes(); loadStatus(); loadHistory();
})();
