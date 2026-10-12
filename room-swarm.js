/* CrawlCA visual tours: source events report real requests; spiders illustrate returned rows.
 * Walking, desk pauses and panel highlights are display animations only.
 * Counters count actual source completion events, never snapshot tours. */
(() => {
  'use strict';
  const DESKS = window.CRAWLCA_DESKS || [];
  const deskFor = window.crawlcaDeskFor || (() => 5);
  const canvas = document.getElementById('swarm');
  const grid = document.getElementById('siteGrid');
  const hero = document.getElementById('hero');
  if (!canvas || !grid || !hero || DESKS.length !== 6) return;
  const ctx = canvas.getContext('2d');
  const ROWS = 7;
  const L = window.crawlcaLogo || { desk: () => '', token: () => '', platform: () => '' };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => n == null || !Number.isFinite(Number(n)) ? '—' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'm' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'k' : '$' + Math.round(n);
  const shortCa = a => { a = String(a || ''); return a.length > 12 ? `${a.slice(0, 5)}…${a.slice(-4)}` : a; };
  const shortUrl = u => { try { const x = new URL(u); return (x.host + x.pathname + (x.search ? '?' + x.search.slice(1, 24) : '')).slice(0, 72); } catch { return String(u || '').slice(0, 72); } };
  // Contract address formats we index: Solana base58 mints and EVM 0x addresses.
  const SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, EVM = /^0x[0-9a-fA-F]{40}$/;
  const validCa = a => SOL.test(a) || EVM.test(a);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const now = () => performance.now();
  let state = window.crawlcaRoomState || { tokens: [], sources: [], mode: 'loading' };

  // ---------- source tiles: a CA list page per source ----------
  const tiles = DESKS.map((d, i) => {
    const el = document.createElement('article');
    el.className = 'site'; el.style.setProperty('--sc', d.color);
    el.innerHTML = `<div class="site-bar"><span class="dots"><i></i><i></i><i></i></span><span class="name">${L.desk(d)}${esc(d.title)}</span>
      <span class="url" data-req>${esc(new URL(d.site).host)}</span><span class="pill" data-pill>idle</span></div>
      <div class="ca-head"><span>SYMBOL</span><span>CONTRACT ADDRESS</span><span>MCAP</span><span></span></div>
      <div class="ca-list" data-list><div class="ca-empty">waiting for the first response…</div></div>
      <div class="raw"><div class="raw-h"><span data-rawlabel>raw response</span><span data-bag>bag 0 CAs</span></div><pre data-raw>—</pre></div>
      <div class="site-foot"><span data-note>${esc(d.src.join(' · '))}</span><a href="${esc(d.site)}" target="_blank" rel="noopener noreferrer">open site ↗</a></div>`;
    grid.appendChild(el);
    const q = s => el.querySelector(s);
    return { d, i, el, host: new URL(d.site).host, list: q('[data-list]'), req: q('[data-req]'), pill: q('[data-pill]'), raw: q('[data-raw]'),
      rawLabel: q('[data-rawlabel]'), bag: q('[data-bag]'), note: q('[data-note]'), rows: [] };
  });
  function pill(tile, text, color) { tile.pill.textContent = text; tile.pill.style.color = color || '#76839c'; }
  function showBatch(tile, b) {
    tile.req.textContent = `${b.method} ${shortUrl(b.url)}`;
    tile.list.innerHTML = b.rows.map(t => `<div class="ca-row"><b>${L.token(t, tile.d.color)}<em>${esc(String(t.symbol).slice(0, 9))}</em></b><span>${esc(shortCa(t.full))}</span><span>${t.mcap != null ? fmt(t.mcap) : t.fdv != null ? `<small class="fdv">FDV</small>${fmt(t.fdv)}` : '—'}</span><i></i></div>`).join('')
      + (b.total > b.rows.length ? `<div class="ca-more">+${b.total - b.rows.length} more rows in this snapshot / response</div>` : '')
      || `<div class="ca-empty">${b.total ? `Event reports ${b.total} rows; response rows unavailable` : state.mode==='unavailable'?'Data unavailable; connect the server':'No contract addresses in this snapshot'}</div>`;
    tile.rows = [...tile.list.querySelectorAll('.ca-row')];
    tile.bag.textContent = `bag 0 / ${b.rows.length} CAs`;
    tile.raw.textContent = b.err || b.notice || '—';
  }
  // Show the response text around the CA being read, preferring the real response body.
  function showRaw(tile, b, t) {
    let src = null, label = '';
    if (t.raw && t.raw.includes(t.full)) { src = t.raw; label = `raw response · ${tile.host}`; }
    else if (b.preview && b.preview.includes(t.full)) { src = b.preview; label = b.previewKind || 'normalized snapshot · /api/source-preview'; }
    if (!src) { src = JSON.stringify({ dataStatus:t.dataStatus,dataUpdatedAt:t.dataUpdatedAt,symbol: t.symbol, address: t.full, source: t.source, chain: t.chain, mcap: t.mcap, fdv: t.fdv, liquidity: t.liq, seen: t.seen });
      label = 'normalized row · /api/tokens'; }
    tile.rawLabel.textContent = label;
    const k = src.indexOf(t.full);
    if (k < 0) { tile.raw.textContent = src.slice(0, 260); return; }
    const a = Math.max(0, k - 80), z = Math.min(src.length, k + t.full.length + 120);
    tile.raw.innerHTML = (a ? '…' : '') + esc(src.slice(a, k)) + `<mark>${esc(t.full)}</mark>` + esc(src.slice(k + t.full.length, z)) + (z < src.length ? '…' : '');
  }
  // ---------- page geometry (document coordinates: spiders cross the whole page) ----------
  const docRect = el => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; };
  const centerOf = (el, fx = 0.5, fy = 0.5) => { const r = docRect(el); return { x: r.x + r.w * fx, y: r.y + r.h * fy }; };
  function deskPoint(i) {
    const r = docRect(hero), p = window.crawlcaRoomDeskScreen && window.crawlcaRoomDeskScreen(i);
    if (p) return { x: r.x + p.x - 34, y: r.y + p.y + 26 };
    return { x: r.x + r.w * (0.25 + (i % 3) * 0.25), y: r.y + r.h * (i < 3 ? 0.42 : 0.68) };
  }

  // ---------- batches (one per real request, or a labelled cache replay) ----------
  const batches = []; let seq = 0;
  const counts = { requests: 0, extracted: 0, failed: 0, delivered: 0 };
  function newBatch(desk, kind, extra) {
    const b = { id: ++seq, desk, kind, at: Date.now(), stage: 'request', method: 'GET', url: '', status: 'pending', elapsed: null,
      total: 0, rows: [], bag: [], bad: 0, target: '', ready: false, err: '', preview: '', ...extra };
    batches.push(b);
    while (batches.length > 40) { const k = batches.findIndex(x => x.stage === 'done' || x.stage === 'error'); if (k < 0) break; batches.splice(k, 1); }
    queuePipe(); return b;
  }
  const deskRows = i => (state.tokens || []).filter(t => deskFor(t.source, t.type) === i);
  const replayOffset = DESKS.map(() => 0);
  function replayRows(i) {
    const all = deskRows(i); if (!all.length) return [];
    const k = replayOffset[i] % all.length; replayOffset[i] += ROWS;
    return all.slice(k, k + ROWS).concat(all.slice(0, Math.max(0, k + ROWS - all.length))).slice(0, ROWS);
  }

  // ---------- spiders: one per tile, never despawned ----------
  const spiders = tiles.map(tile => ({ tile, i: tile.i, color: tile.d.color, x: 0, y: 0, a: Math.PI / 2, gait: Math.random() * 6,
    phase: 'idle', vx: 0, vy: 0, mvx: 0, mvy: 0, legs: null, batch: null, next: null, row: 0, t0: now(), wanderAt: 0, wander: null, idleSince: now() + tile.i * 900, trail: [], cargo: null, placed: false }));
  const particles = [];
  // Move toward a point at constant speed with a smoothed heading; returns true on arrival.
  function walk(s, p, speed, dt) {
    const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy);
    if (d < 2 || reduce) { s.x = p.x; s.y = p.y; return true; }
    const px = s.x, py = s.y;
    const want = Math.atan2(dy, dx); let diff = want - s.a; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    s.a += diff * Math.min(1, dt * 9);
    const step = Math.min(d, speed * dt);
    s.x += dx / d * step; s.y += dy / d * step;     // move straight at the target; heading drives the legs
    s.mvx += (s.x - px); s.mvy += (s.y - py);
    return false;
  }
  function setPhase(s, ph) { s.phase = ph; s.t0 = now(); if (s.batch) { s.batch.stage = ph === 'idle' ? s.batch.stage : ph; queuePipe(); } }
  function begin(s, b) {
    s.batch = b; s.row = 0; s.cargo = null;
    pill(s.tile, b.kind === 'replay' ? 'snapshot tour' : b.ready ? 'response received' : 'requesting…', '#67d9ff');
    s.tile.req.textContent = `${b.method} ${shortUrl(b.url) || s.tile.host}`;
    s.tile.el.classList.add('busy');
    setPhase(s, 'request');
  }
  // A desk holds at most one queued batch; a newer real request supersedes an older queued one.
  function assign(b) {
    const s = spiders[b.desk];
    if (s.phase === 'idle' && !s.batch) { begin(s, b); return; }
    if (s.phase === 'home' && !s.batch && !s.pending) { s.pending = b; return; }
    if (s.next && s.next !== b) { s.next.stage = 'skipped'; b.prev = s.next; }
    s.next = b;
  }
  function finish(s) {
    s.tile.el.classList.remove('busy');
    s.batch = null; s.cargo = null; s.idleSince = now();
    if (s.next) { s.pending = s.next; s.next = null; }
    s.phase = 'home';
  }
  function targetFor(b) {
    const card = n => document.querySelector(`#cards .card[data-i="${n}"]`);
    const lp = b.bag.some(t => t.type === 'launchpad');
    const opts = [[lp ? 'SCOUT card' : 'PAIRS card', card(lp ? 0 : 2)], ['INDEX card', card(1)], ['CA LAB', document.getElementById('topList')],
      ['THROUGHPUT', document.getElementById(lp ? 'trkL' : 'trkD')]];
    if (b.bag.some(t => t.risk && t.risk !== 'low')) opts.push(['RISK card', card(5)]);
    if (b.bag.some(t => t.liq != null)) opts.push(['LIQUIDITY card', card(4)]);
    if (b.bag.some(t => t.seen === 'now' || (/^\d+m$/.test(t.seen || '') && parseInt(t.seen, 10) < 15))) opts.push(['FRESH card', card(3)]);
    opts.push(['SWARM ENGINE', document.querySelector('.engine')]);
    const valid = opts.filter(o => o[1]); return valid[b.id % valid.length];
  }
  function flash(el) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 900); }
  function endExtract(s) {
    const b = s.batch;
    s.tile.rows.forEach(r => r.classList.remove('reading'));
    if (!b.bag.length) { pill(s.tile, 'no valid CAs', '#f5c96a'); b.stage = 'done'; queuePipe(); finish(s); return; }
    s.cargo = { n: b.bag.length, label: `${b.bag.length} CAs` };
    pill(s.tile, `visual tour · ${b.bag.length} CAs → ${s.tile.d.short}`, '#c79bff');
    setPhase(s, 'carry-in');
  }
  function syncPill(s) {
    if (s.phase !== 'idle') return;
    const by = new Map((state.sources || []).map(x => [x.name, x])), entries=s.tile.d.src.map(n=>by.get(n)).filter(Boolean),st=entries.map(x=>x.status);
    s.tile.note.textContent=entries.map(x=>`${x.name}: ${x.status}${x.reason?' · '+x.reason:''}`).join(' / ');
    s.tile.note.title=s.tile.note.textContent;
    const status=['crawling','error','unavailable','degraded','stale','key required','online','waiting'].find(x=>st.includes(x))||'waiting';
    pill(s.tile,status,status==='online'?'#69f0b2':status==='crawling'?'#67d9ff':status==='error'?'#ff6e83':['degraded','stale','key required'].includes(status)?'#f5c96a':'#76839c');
  }

  // Per-frame state machine for one spider.
  function update(s, dt) {
    const tile = s.tile, b = s.batch, t = now();
    if (!s.placed) { const p = centerOf(tile.el, 0.9, 0.08); s.x = p.x; s.y = p.y; s.placed = true; }
    switch (s.phase) {
      case 'home':
        if (walk(s, centerOf(tile.el, 0.9, 0.08), 320, dt)) {
          if (s.pending) { const nb = s.pending; s.pending = null; begin(s, nb); } else { s.phase = 'idle'; syncPill(s); }
        }
        break;
      case 'idle':
        if (!s.wander || t > s.wanderAt) { s.wander = centerOf(tile.list, 0.08 + Math.random() * 0.84, 0.1 + Math.random() * 0.8); s.wanderAt = t + 2200 + Math.random() * 3000; }
        walk(s, s.wander, 42, dt);
        // Keep the original room animation alive using explicitly labelled existing rows.
        // These tours never increase real request or received-row counts.
        if(!document.hidden&&t-s.idleSince>5500&&deskRows(s.i).length){
          begin(s,newBatch(s.i,'replay',{source:tile.d.title,method:'SNAPSHOT',url:'visual tour · current snapshot',status:'existing data',elapsed:null,rows:replayRows(s.i),total:deskRows(s.i).length,ready:true}));
        }
        break;
      case 'request': {
        walk(s, centerOf(tile.req, 0.94, 0.5), 220, dt); 
        const waited = t - s.t0;
        if (!b.ready) { pill(tile, waited>70000 ? 'awaiting server outcome' : `requesting… ${(waited / 1000).toFixed(1)}s`, '#67d9ff'); if(waited>90000){b.err='Request outcome unavailable; see source health';b.ready=true;} break; }
        if (waited < 600) break;
        if (b.err || !b.rows.length) {
          if (!s.shown) { s.shown = true; showBatch(tile, b); pill(tile, b.err ? b.err.slice(0, 30) : b.total ? `${b.total} rows · payload unavailable` : 'empty response', b.err ? '#ff6e83' : '#f5c96a'); }
          if (waited > 2000) { s.shown = false; b.stage = b.err ? 'error' : 'done'; queuePipe(); finish(s); }
          break;
        }
        showBatch(tile, b);
        pill(tile, ['replay','snapshot'].includes(b.kind) ? `${b.kind} · ${b.rows.length} rows` : `${b.status} · ${b.elapsed != null ? Math.round(b.elapsed) + 'ms' : '—'} · ${b.total} rows`, '#69f0b2');
        s.row = 0; s.rowState = 'walk'; setPhase(s, 'extract');
        break;
      }
      case 'extract': {
        const rowEl = tile.rows[s.row], tok = b.rows[s.row];
        if (!rowEl || !tok) { endExtract(s); break; }
        const cell = rowEl.children[1];
        if (s.rowState === 'walk') {
          if (walk(s, centerOf(cell, 0.04, 0.5), 170, dt)) { s.rowState = 'read'; s.rt = t; rowEl.classList.add('reading'); showRaw(tile, b, tok); }
        } else if (s.rowState === 'read') {
          { let df = 0 - s.a; df = Math.atan2(Math.sin(df), Math.cos(df)); s.a += df * Math.min(1, dt * 8); }
          if (t - s.rt > 650) {
            const ok = validCa(tok.full);
            rowEl.classList.add(ok ? 'ok' : 'bad'); rowEl.lastElementChild.textContent = ok ? '✓' : '✗';
            if (ok) { b.bag.push(tok); const c = centerOf(cell, 0.45, 0.5); particles.push({ x: c.x, y: c.y, s, t: 0, text: shortCa(tok.full), color: s.color }); }
            else b.bad++;
            tile.bag.textContent = `bag ${b.bag.length} / ${b.rows.length} CAs${b.bad ? ` · ${b.bad} invalid` : ''}`;
            queuePipe(); s.rowState = 'next'; s.rt = t;
          }
        } else if (t - s.rt > 170) { rowEl.classList.remove('reading'); s.row++; s.rowState = 'walk'; }
        break;
      }
      case 'carry-in':
        if (walk(s, deskPoint(s.i), 340, dt)) {
          const ok = window.crawlcaRoomDeliver && window.crawlcaRoomDeliver(s.i, { id: b.id, sym: `${b.bag.length} CAs`,
            cas: b.bag.map(x => x.symbol), line: `${b.kind} · ${tile.host}`, dur: Math.min(3600, 1300 + b.bag.length * 280) });
          if (!ok) b.tourFinished=true;
          s.cargo = null; pill(tile, `displaying ${b.bag.length} existing rows`, '#f4a24c'); setPhase(s, 'process');
        }
        break;
      case 'process': {
        const p = deskPoint(s.i);
        walk(s, { x: p.x + Math.cos(t / 420) * 12, y: p.y + Math.sin(t / 420) * 7 }, 90, dt); 
        if (b.tourFinished || t - s.t0 > 15000) {
          const [name, el] = targetFor(b); b.target = name; b.dest = el; b.fx = 0.25 + Math.random() * 0.5;
          s.cargo = { n: b.bag.length, label: `${b.bag.length} rows viewed`, done: true };
          pill(tile, `visual tour → ${name}`, '#69f0b2'); setPhase(s, 'carry-out');
        }
        break;
      }
      case 'carry-out':
        if (walk(s, centerOf(b.dest, b.fx, 0.55), 340, dt)) {
          flash(b.dest); counts.delivered++; b.stage = 'done'; s.cargo = null; queuePipe();
          pill(tile, `viewed → ${b.target}`, '#69f0b2'); finish(s);
        }
        break;
    }
  }
  // ---------- real crawl events -> batches ----------
  // Real source request events arrive from the Rust SSE stream; snapshots do not create request events.
  const API = window.CRAWLCA_API_BASE || '';
  const previewCache = new Map();
  async function attachPreview(b) {
    if (!API || !['live','snapshot'].includes(b.kind)) return;
    const hit = previewCache.get(b.source);
    if (hit && Date.now() - hit.at < 90000) { b.preview = hit.text; b.previewKind=hit.kind; return; }
    try {
      const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),12000);
      try {
        const r=await fetch(`${API}/source-preview?source=${encodeURIComponent(b.source)}`,{cache:'no-store',signal:controller.signal});
        if(!r.ok)return;const j=await r.json();
        if(j&&j.text){const kind=`${j.previewKind||'normalized snapshot'} · /api/source-preview`;previewCache.set(b.source,{at:Date.now(),text:j.text,kind});b.preview=j.text;b.previewKind=kind;}
      } finally {clearTimeout(timer);}
    } catch {}
  }
  const open = new Map();
  window.addEventListener('crawlcaRoomEvent', e => {
    const ev = e.detail || {}; if (!ev.source) return;
    const desk = deskFor(ev.source), via = ev.via || 'live';
    if (ev.kind === 'source_started') {
      if (open.has(ev.source)) return;
      const b = newBatch(desk, via, { source: ev.source, url: ev.requestUrl || '', method: /four\.meme/.test(ev.requestUrl || '') ? 'POST' : 'GET' });
      open.set(ev.source, b); assign(b);
    } else if (ev.kind === 'source_completed') {
      let b = open.get(ev.source); open.delete(ev.source);
      const quiet = (ev.status === 'key required' || ev.status === 'waiting') && !ev.count;
      if(!quiet){counts.requests++;if(ev.error||ev.cached||['error','degraded','stale'].includes(ev.status))counts.failed++;else counts.extracted+=Math.max(0,Number(ev.count)||0);}
      if (!b) { if (quiet) return; b = newBatch(desk, via, { source: ev.source, url: ev.requestUrl || '' }); assign(b); }
      b.err='';b.elapsed = ev.elapsedMs ?? null; b.status = ev.status || 'online'; b.url = ev.requestUrl || b.url;
      if (ev.error || ['error','degraded','stale'].includes(ev.status) || quiet) {
        b.err = ev.error ? `${ev.status}: ${ev.error}` : ev.status;
        // An idle sibling adapter (no key) must not displace a real batch already queued for this desk.
        const s = spiders[desk]; if (s.next === b && b.prev && b.prev.stage === 'skipped') { b.prev.stage = 'request'; s.next = b.prev; b.stage = 'skipped'; }
      } else {
        // Only this event's rows belong to this request. A snapshot from another
        // crawl (or sibling adapter) must never stand in for a LIVE response.
        const rows = Array.isArray(ev.rows) ? ev.rows : [];
        b.rows = rows.slice(0, ROWS); b.total = ev.count ?? rows.length;
        if(!Array.isArray(ev.rows)&&b.total)b.notice='Response row payload unavailable; inspect the normalized source snapshot separately';
        if(ev.cached)b.kind='snapshot';
        attachPreview(b);
      }
      b.ready = true; queuePipe();
    }
  });
  window.addEventListener('crawlcaRoomTourCompleted', e => {
    const id = e.detail?.job?.id, b = batches.find(x => x.id === id);
    if (b && !b.tourFinished) { b.tourFinished = true; queuePipe(); }
  });
  window.addEventListener('crawlcaRoomState', e => { if (e.detail) {
    state = e.detail;
    spiders.forEach(s=>{
      syncPill(s);
      if(s.phase==='idle'&&!s.batch){const rows=deskRows(s.i);showBatch(s.tile,{rows:rows.slice(0,ROWS),total:rows.length,method:'SNAPSHOT',url:'current server data'});s.tile.bag.textContent=`${rows.length} snapshot rows`;s.tile.rawLabel.textContent='normalized snapshot · /api/tokens';}
    });
  } });
  // The lab list and robot clicks ask a spider to re-read specific rows from the snapshot.
  function inspect(desk, first) {
    const rows = replayRows(desk); if (first) rows.unshift(first);
    assign(newBatch(desk, 'replay', { source: DESKS[desk].title, method: 'SNAPSHOT', url: 'operator inspect', status: 'existing data', elapsed: null,
      rows: [...new Map(rows.map(t => [`${t.chain}:${t.full}`, t])).values()].slice(0, ROWS), total: deskRows(desk).length, ready: true }));
  }
  window.crawlcaSwarmInspect = (ca,chain) => { const t = (state.tokens || []).find(x => x.full === ca&&(!chain||x.chain===chain)); if (t) inspect(deskFor(t.source, t.type), t); };
  window.addEventListener('crawlcaRoomPick', e => { const d = e.detail?.desk; if (Number.isInteger(d) && tiles[d]) { flash(tiles[d].el); inspect(d); } });

  // ---------- pipeline panel ----------
  const pipe = document.getElementById('pipeStages'), log = document.getElementById('pipeLog'), pc = document.getElementById('pipeCounts');
  const STAGES = [['request', 'SOURCE EVENT'], ['extract', 'VIEW ROWS'], ['carry-in', 'DESK ANIMATION'], ['process', 'SNAPSHOT DISPLAY'], ['carry-out', 'PANEL ANIMATION'], ['done', 'TOUR FINISHED']];
  const KIND = { live: ['LIVE', '#69f0b2'], replay: ['SNAPSHOT TOUR', '#76839c'], snapshot:['CACHED SNAPSHOT','#f5c96a'] };
  let pipeRaf = 0;
  function queuePipe() { if (!pipeRaf) pipeRaf = requestAnimationFrame(() => { pipeRaf = 0; renderPipe(); }); }
  function chip(b) {
    const d = DESKS[b.desk], [k, kc] = KIND[b.kind] || KIND.replay;
    return `<div class="job" style="--jc:${d.color}"><b>${L.desk(d)}${esc(d.title)}</b><span style="color:${kc}">${k}</span><small>${b.bag.length}/${b.rows.length || b.total} CAs${b.target ? ' → ' + esc(b.target) : ''}</small></div>`;
  }
  function renderPipe() {
    if (pc) pc.textContent = `${counts.requests} completed source checks · ${counts.failed} failed / cached · ${counts.extracted} rows received · ${counts.delivered} visual tours finished`;
    if (pipe) pipe.innerHTML = STAGES.map(([id, label]) => {
      let list = batches.filter(b => b.stage === id); if (id === 'done') list = list.slice(-3).reverse();
      return `<div class="stage"><div class="st-h"><span>${label}</span><b>${id === 'done' ? counts.delivered : list.length}</b></div>${list.slice(0, 3).map(chip).join('') || '<div class="empty">—</div>'}</div>`;
    }).join('');
    if (log) log.innerHTML = batches.filter(b => b.stage !== 'skipped').slice(-8).reverse().map(b => {
      const [k, kc] = KIND[b.kind] || KIND.replay;
      const st = b.stage === 'error' ? `<span style="color:#ff6e83">${esc(b.err || 'error')}</span>` : `view: ${esc(b.stage)}`;
      return `<div class="lr"><span>${new Date(b.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span><span style="color:${kc}">${k}</span><span style="color:${DESKS[b.desk].color}">${L.desk(DESKS[b.desk])}${esc(b.source)}</span><span class="u">${esc(b.method)} ${esc(shortUrl(b.url) || '—')}</span><span>${b.elapsed != null ? Math.round(b.elapsed) + 'ms' : '—'}</span><span>${b.ready ? `${b.total} source rows` : '…'}</span><span>${st}</span></div>`;
    }).join('') || '<div class="lr"><span>waiting for the first response…</span></div>';
  }
  // ---------- drawing: procedural spider with planted feet ----------
  // Each of the 8 feet stays planted on the page (world space) until its hip moves too far away,
  // then it lifts and steps ahead. Legs step in two alternating groups (L1 R2 L3 R4 / R1 L2 R3 L4),
  // each leg is a two-segment limb solved with IK, and every foot ends in a suction pad that
  // glows while planted and pulses while the spider is reading a contract address.
  const SCALE = 1.25;
  const LEG = [ // rest angle from heading, hip offset along body, reach
    { ang: 0.55, hip: 4.2, reach: 17 }, { ang: 1.15, hip: 2.0, reach: 18.5 }, { ang: 1.95, hip: -0.4, reach: 18.5 }, { ang: 2.55, hip: -2.6, reach: 17 },
  ];
  function initLegs(s) {
    s.legs = [];
    [-1, 1].forEach(side => LEG.forEach((L, k) => {
      const leg = { side, k, ...L, group: (k + (side > 0 ? 1 : 0)) % 2, fx: 0, fy: 0, sx: 0, sy: 0, tx: 0, ty: 0, t: 1, pad: 0 };
      const p = legTarget(s, leg, 0, 0); leg.fx = leg.tx = p.x; leg.fy = leg.ty = p.y; s.legs.push(leg);
    }));
  }
  function hipOf(s, leg) {
    const c = Math.cos(s.a), n = Math.sin(s.a), h = leg.hip * SCALE;
    return { x: s.x + c * h - n * leg.side * 2.6 * SCALE, y: s.y + n * h + c * leg.side * 2.6 * SCALE };
  }
  function legTarget(s, leg, vx, vy) {
    const a = s.a + leg.side * leg.ang, h = hipOf(s, leg), r = leg.reach * SCALE;
    return { x: h.x + Math.cos(a) * r + vx * 0.16, y: h.y + Math.sin(a) * r + vy * 0.16 };
  }
  function updateLegs(s, dt) {
    if (!s.legs) initLegs(s);
    const speed = Math.hypot(s.vx, s.vy), stepDur = speed > 200 ? 0.09 : speed > 60 ? 0.13 : 0.18;
    const moving = s.legs.filter(l => l.t < 1);
    const busyGroup = moving.length ? moving[0].group : -1;
    s.legs.forEach(l => {
      if (l.t < 1) {
        l.t = Math.min(1, l.t + dt / stepDur);
        const e = l.t * l.t * (3 - 2 * l.t);
        l.fx = l.sx + (l.tx - l.sx) * e; l.fy = l.sy + (l.ty - l.sy) * e;
        if (l.t >= 1) l.pad = 1; // just planted: pad squash
        return;
      }
      l.pad = Math.max(0, l.pad - dt * 5);
      const want = legTarget(s, l, s.vx, s.vy), h = hipOf(s, l);
      const drift = Math.hypot(want.x - l.fx, want.y - l.fy), stretch = Math.hypot(l.fx - h.x, l.fy - h.y);
      if (stretch > l.reach * SCALE * 2.4) { l.fx = want.x; l.fy = want.y; return; }       // fell far behind: re-plant
      const trigger = speed > 5 ? 6 * SCALE : 11 * SCALE;
      if (drift > trigger && (busyGroup < 0 || busyGroup === l.group)) {
        l.sx = l.fx; l.sy = l.fy; l.tx = want.x; l.ty = want.y; l.t = 0;
      }
    });
  }
  function drawSpider(s, sx, sy) {
    const vx = s.x - sx, vy = s.y - sy, reading = s.phase === 'extract' && s.rowState === 'read';
    const pulse = reading ? 0.5 + 0.5 * Math.sin(now() / 70) : 0;
    // legs: two-segment IK, knee bent outward
    s.legs.forEach(l => {
      const h = hipOf(s, l), hx = h.x - sx, hy = h.y - sy, fx = l.fx - sx, fy = l.fy - sy;
      const lift = l.t < 1 ? Math.sin(l.t * Math.PI) * 5 * SCALE : 0;
      const dx = fx - hx, dy = fy - hy, d = Math.max(0.01, Math.hypot(dx, dy));
      const A = 10.5 * SCALE, B = 12 * SCALE, dd = Math.min(d, A + B - 0.5);
      const ca = Math.max(-1, Math.min(1, (A * A + dd * dd - B * B) / (2 * A * dd)));
      const base = Math.atan2(dy, dx), knee = base - l.side * Math.acos(ca);
      const kx = hx + Math.cos(knee) * A, ky = hy + Math.sin(knee) * A - lift;
      ctx.strokeStyle = s.color; ctx.lineCap = 'round';
      ctx.lineWidth = 2.1; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.stroke();
      ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(fx, fy - lift * 0.4); ctx.stroke();
      ctx.fillStyle = '#060b14'; ctx.beginPath(); ctx.arc(kx, ky, 1.5, 0, 7); ctx.fill();
      // suction pad
      const planted = l.t >= 1, front = l.k < 2, suck = reading && front ? pulse : 0;
      const r = (planted ? 2.3 : 1.6) + l.pad * 1.2 + suck * 1.6;
      ctx.globalAlpha = planted ? 0.35 + suck * 0.4 : 0.15;
      ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(fx, fy - lift * 0.4, r + 2.2, 0, 7); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = planted ? s.color : '#0b1622';
      ctx.beginPath(); ctx.arc(fx, fy - lift * 0.4, r, 0, 7); ctx.fill();
      ctx.strokeStyle = '#e9eef8'; ctx.lineWidth = 0.8; ctx.globalAlpha = planted ? 0.8 : 0.4; ctx.stroke(); ctx.globalAlpha = 1;
    });
    // body
    ctx.save(); ctx.translate(vx, vy); ctx.rotate(s.a); ctx.scale(SCALE, SCALE);
    const bag = s.cargo ? Math.min(3.5, s.cargo.n * 0.35) : 0, breathe = Math.sin(now() / 380 + s.i) * 0.25;
    ctx.fillStyle = '#0b1622'; ctx.strokeStyle = s.color; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.ellipse(-6 - bag * 0.4, 0, 7.5 + bag + breathe, 5.8 + bag * 0.7 + breathe, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = s.color; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.ellipse(-6 - bag * 0.4, 0, 3.8 + bag * 0.6, 1.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.ellipse(3.6, 0, 4.6, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#060b14'; ctx.fillRect(4.4, -2.4, 2.8, 4.8);
    ctx.fillStyle = reading ? '#69f0b2' : '#fff'; ctx.beginPath(); ctx.arc(5.9, -1.3, 0.8, 0, 7); ctx.arc(5.9, 1.3, 0.8, 0, 7); ctx.fill();
    // pedipalps reach forward while reading
    ctx.strokeStyle = s.color; ctx.lineWidth = 1; ctx.beginPath();
    const pr = reading ? 4 + pulse * 1.5 : 2.5; ctx.moveTo(7.5, -1.6); ctx.lineTo(7.5 + pr, -2.6); ctx.moveTo(7.5, 1.6); ctx.lineTo(7.5 + pr, 2.6); ctx.stroke();
    ctx.restore();
    if (s.cargo) {
      const col = s.cargo.done ? '#69f0b2' : s.color;
      ctx.font = '700 9px "IBM Plex Mono",monospace'; const w = ctx.measureText(s.cargo.label).width + 10;
      ctx.fillStyle = 'rgba(4,8,16,.88)'; ctx.fillRect(vx - w / 2, vy - 40, w, 13);
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(vx - w / 2 + .5, vy - 39.5, w - 1, 12);
      ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(s.cargo.label, vx, vy - 30.5);
    }
  }
  let W = 0, H = 0;
  function resize() { const d = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; canvas.width = W * d; canvas.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
  addEventListener('resize', resize); resize();
  let last = now();
  function frame(tNow) {
    const dt = Math.min(0.1, (tNow - last) / 1000); last = tNow;
    ctx.clearRect(0, 0, W, H);
    const sx = scrollX, sy = scrollY;
    spiders.forEach(s => {
      s.mvx = 0; s.mvy = 0; update(s, dt);
      const k = Math.min(1, dt * 10); s.vx += (s.mvx / Math.max(dt, 1e-3) - s.vx) * k; s.vy += (s.mvy / Math.max(dt, 1e-3) - s.vy) * k;
      updateLegs(s, dt);
      const carrying = s.phase === 'carry-in' || s.phase === 'carry-out';
      if (carrying) { s.trail.push(s.x, s.y); if (s.trail.length > 80) s.trail.splice(0, 2); } else if (s.trail.length) s.trail.splice(0, 6);
      if (s.trail.length > 4) {
        ctx.strokeStyle = s.color; ctx.globalAlpha = 0.3; ctx.setLineDash([2, 5]); ctx.lineWidth = 1; ctx.beginPath();
        for (let k = 0; k < s.trail.length; k += 2) { const x = s.trail[k] - sx, y = s.trail[k + 1] - sy; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
    });
    // extracted CA text flying from the row into the spider's bag
    for (let k = particles.length - 1; k >= 0; k--) {
      const p = particles[k]; p.t += dt * 2.6;
      if (p.t >= 1) { particles.splice(k, 1); continue; }
      const e = 1 - Math.pow(1 - p.t, 3), x = p.x + (p.s.x - p.x) * e - sx, y = p.y + (p.s.y - p.y) * e - sy - Math.sin(p.t * Math.PI) * 18;
      ctx.globalAlpha = 1 - p.t * 0.6; ctx.fillStyle = p.color; ctx.font = '700 9px "IBM Plex Mono",monospace'; ctx.textAlign = 'center';
      ctx.fillText(p.text, x, y); ctx.globalAlpha = 1;
    }
    spiders.forEach(s => { const vx = s.x - sx, vy = s.y - sy; if (vx > -60 && vx < W + 60 && vy > -60 && vy < H + 60) drawSpider(s, sx, sy); });
    requestAnimationFrame(frame);
  }
  spiders.forEach(s=>{syncPill(s);const rows=deskRows(s.i);showBatch(s.tile,{rows:rows.slice(0,ROWS),total:rows.length,method:'SNAPSHOT',url:'current server data'});s.tile.bag.textContent=`${rows.length} snapshot rows`;s.tile.rawLabel.textContent='normalized snapshot · /api/tokens';}); renderPipe();
  requestAnimationFrame(frame);
  window.crawlcaSwarm = { spiders, batches, counts };
})();
