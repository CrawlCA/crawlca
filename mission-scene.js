(() => {
  'use strict';

  const canvas = document.getElementById('missionScene');
  const viewport = document.getElementById('missionViewport');
  if (!canvas || !viewport) return;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  const palette = {
    cyan: '#67d9ff',
    pink: '#ff4da6',
    green: '#69f0b2',
    yellow: '#f5c96a',
    muted: '#51616e',
    text: '#e8edf2'
  };
  const sourceDefaults = [
    ['Pump.fun', 'launchpad', 'SOL'], ['Moonshot', 'launchpad', 'SOL'],
    ['Raydium', 'dex', 'SOL'], ['Meteora', 'dex', 'SOL'],
    ['Aerodrome', 'dex', 'BASE'], ['Uniswap', 'dex', 'ETH'],
    ['GMGN partner', 'discovery', 'RH'], ['GMGN official', 'discovery', 'MULTI'],
    ['Four.meme', 'launchpad', 'BNB'], ['Flap.sh', 'launchpad', 'BNB'],
    ['Robinhood launchpad', 'launchpad', 'RH'], ['Robinhood Uniswap', 'dex', 'RH']
  ];

  let state = window.crawlcaState || { sources: [], tokens: [], events: [], runtimeMode: 'demo' };
  let width = 0, height = 0, dpr = 1;
  let yaw = -0.32, pitch = -0.18, zoom = 1;
  let dragging = false, lastX = 0, lastY = 0;
  let selectedChain = 'all';
  let resetButtonBound = false;
  let sourceClickTargets = [];
  let raf = 0;

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const finite = n => Number.isFinite(Number(n)) ? Number(n) : 0;
  const colorForSource = source => source?.kind === 'dex' ? palette.cyan : source?.status === 'key required' ? palette.yellow : palette.pink;
  const sourceRows = () => {
    const incoming = Array.isArray(state.sources) ? state.sources : [];
    return sourceDefaults.map(([name, kind, chain], index) => {
      const found = incoming.find(item => item && item.name === name) || {};
      return { name, kind, chain, status: 'waiting', count: 0, elapsedMs: null, website: '', ...found, index };
    });
  };

  function resize() {
    const rect = viewport.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function rotate(p) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x1 = p.x * cy - p.z * sy;
    const z1 = p.x * sy + p.z * cy;
    return { x: x1, y: p.y * cp - z1 * sp, z: p.y * sp + z1 * cp };
  }

  function project(p) {
    const r = rotate(p);
    const camera = 680;
    const scale = camera / (camera + r.z);
    return { x: width / 2 + r.x * scale * zoom, y: height / 2 + r.y * scale * zoom, scale, z: r.z };
  }

  function pointOnRing(index, total, radius, depth = 0) {
    const angle = (index / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * .56, z: depth + Math.sin(angle * 2.7) * 35 };
  }

  function line(a, b, color, alpha = 1, widthPx = 1) {
    const p1 = project(a), p2 = project(b);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = widthPx;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    ctx.restore();
  }

  function dot(p, radius, color, alpha = 1, glow = 0) {
    const q = project(p);
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
    if (glow) { ctx.shadowBlur = glow * q.scale; ctx.shadowColor = color; }
    ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(.6, radius * q.scale), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawEllipsoid(center, rx, ry, color, alpha = 1, stroke = color) {
    const p = project(center);
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.strokeStyle = stroke;
    ctx.shadowColor = color; ctx.shadowBlur = 18 * p.scale;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, rx * p.scale, ry * p.scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
  }

  function drawSpider(center, source, progress, time, color) {
    const c = project(center);
    const phase = time * .006 + source.index * 1.7;
    const body = 9 * c.scale;
    ctx.save();
    // Legs are drawn in the same 3D coordinate system as the body, giving the
    // crawler a readable model silhouette while it travels the source route.
    for (let side = -1; side <= 1; side += 2) {
      for (let leg = 0; leg < 4; leg += 1) {
        const along = (leg - 1.5) * 5.2;
        const lift = Math.sin(phase + leg * 1.2) * 2.5;
        const knee = { x: center.x + along + side * 8, y: center.y + side * (7 + Math.abs(leg - 1.5) * 1.8) + lift, z: center.z + (leg - 1.5) * 4 };
        const tip = { x: center.x + along + side * (15 + Math.abs(leg - 1.5) * 3), y: center.y + side * (17 + Math.abs(leg - 1.5) * 2) + lift, z: center.z + (leg - 1.5) * 10 };
        const p1 = project(center), p2 = project(knee), p3 = project(tip);
        ctx.globalAlpha = .94; ctx.strokeStyle = color; ctx.lineWidth = Math.max(.7, 1.25 * c.scale); ctx.lineCap = 'round';
        ctx.shadowColor = color; ctx.shadowBlur = 6 * c.scale;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.stroke();
      }
    }
    ctx.restore();
    drawEllipsoid({ x: center.x - 4, y: center.y, z: center.z - 2 }, 8, 5.6, '#0e2732', .98, color);
    drawEllipsoid({ x: center.x + 5, y: center.y, z: center.z + 3 }, 4.8, 4.1, color, .96, color);
    dot({ x: center.x + 7, y: center.y - 2, z: center.z + 5 }, 1.1, palette.text, 1, 4);
    dot({ x: center.x + 7, y: center.y + 2, z: center.z + 5 }, 1.1, palette.text, 1, 4);
    // packet glow represents the actual CA payload moving with the spider.
    const packet = { x: center.x, y: center.y - 15, z: center.z };
    dot(packet, 2.5, palette.green, .85, 10);
    if (progress > .72) dot({ x: center.x, y: center.y - 19, z: center.z }, 1.2, palette.green, .9, 5);
  }

  function drawText(text, p, color, size = 9, alpha = 1) {
    const q = project(p); ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
    ctx.font = `${size}px "IBM Plex Mono", monospace`; ctx.textAlign = 'center'; ctx.fillText(text, q.x, q.y); ctx.restore();
  }

  function polygon(points, fill, stroke = null, alpha = 1) {
    const projected = points.map(project);
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = fill;
    ctx.beginPath(); projected.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.closePath(); ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.restore();
  }

  function box(center, size, color, alpha = 1) {
    const hw = size.w / 2, hd = size.d / 2, y0 = center.y, y1 = center.y - size.h;
    const front = [{x:center.x-hw,y:y1,z:center.z-hd},{x:center.x+hw,y:y1,z:center.z-hd},{x:center.x+hw,y:y0,z:center.z-hd},{x:center.x-hw,y:y0,z:center.z-hd}];
    const right = [{x:center.x+hw,y:y1,z:center.z-hd},{x:center.x+hw,y:y1,z:center.z+hd},{x:center.x+hw,y:y0,z:center.z+hd},{x:center.x+hw,y:y0,z:center.z-hd}];
    const top = [{x:center.x-hw,y:y1,z:center.z-hd},{x:center.x-hw,y:y1,z:center.z+hd},{x:center.x+hw,y:y1,z:center.z+hd},{x:center.x+hw,y:y1,z:center.z-hd}];
    polygon(front, color, '#67d9ff45', alpha); polygon(right, '#0b2734', '#67d9ff35', alpha); polygon(top, '#173b49', '#67d9ff65', alpha);
  }

  function drawStation(point, source, time) {
    const active = source.status === 'online' || source.status === 'crawling';
    const color = colorForSource(source);
    const center = { x: point.x, y: point.y + 27, z: point.z };
    box(center, { w: 40, h: 20, d: 28 }, '#0a1721', active ? .9 : .45);
    const screen = { x: point.x, y: point.y + 7, z: point.z - 3 };
    polygon([
      {x:screen.x-14,y:screen.y-14,z:screen.z-10}, {x:screen.x+14,y:screen.y-14,z:screen.z-10},
      {x:screen.x+14,y:screen.y+1,z:screen.z-10}, {x:screen.x-14,y:screen.y+1,z:screen.z-10}
    ], '#07131d', color, active ? .95 : .42);
    const bars = 5, phase = Math.floor(time / 700) % 3;
    for (let i = 0; i < bars; i += 1) {
      const barH = 3 + ((i * 7 + source.index + phase) % 10);
      polygon([
        {x:screen.x-11+i*5.4,y:screen.y-2,z:screen.z-11}, {x:screen.x-7+i*5.4,y:screen.y-2,z:screen.z-11},
        {x:screen.x-7+i*5.4,y:screen.y-2-barH,z:screen.z-11}, {x:screen.x-11+i*5.4,y:screen.y-2-barH,z:screen.z-11}
      ], active ? (i % 2 ? palette.cyan : palette.green) : '#31404a', active ? .8 : .4);
    }
    dot({x:point.x-15,y:point.y+22,z:point.z-15}, 1.8, active ? palette.green : palette.muted, .9, active ? 6 : 0);
    dot({x:point.x+15,y:point.y+22,z:point.z-15}, 1.8, color, .9, active ? 6 : 0);
  }

  function drawFloor(time) {
    const floorY = 132;
    polygon([{x:-300,y:floorY,z:-260},{x:300,y:floorY,z:-260},{x:300,y:floorY,z:260},{x:-300,y:floorY,z:260}], '#07121b', '#67d9ff18', .28);
    for (let i = -5; i <= 5; i += 1) {
      line({x:i*60,y:floorY,z:-260},{x:i*60,y:floorY,z:260},'#67d9ff12',.85,.7);
      line({x:-300,y:floorY,z:i*52},{x:300,y:floorY,z:i*52},'#67d9ff12',.85,.7);
    }
    const sweep = (time * .00014) % 1;
    line({x:-250 + sweep * 500,y:floorY-1,z:-240},{x:-250 + sweep * 500,y:floorY-1,z:240}, palette.cyan, .25, 1.2);
  }

  function drawCommandRoom(time, sources) {
    // Back wall and the central command display reproduce the isometric game
    // room in the reference: the live feed is literally the room's screen.
    polygon([{x:-310,y:-190,z:-210},{x:310,y:-190,z:-210},{x:310,y:125,z:-210},{x:-310,y:125,z:-210}], '#080e18', '#1c4fea45', .82);
    polygon([{x:-174,y:-150,z:-224},{x:174,y:-150,z:-224},{x:174,y:-64,z:-224},{x:-174,y:-64,z:-224}], '#07131f', '#67d9ff88', .95);
    polygon([{x:-166,y:-142,z:-227},{x:166,y:-142,z:-227},{x:166,y:-70,z:-227},{x:-166,y:-70,z:-227}], '#0b1e2e', '#ff4da665', .85);
    const online = sources.filter(source => source.status === 'online').length;
    drawText('LIVE SOURCE ROOM', {x:-104,y:-132,z:-232}, palette.cyan, 9, .9);
    drawText(`${online}/${sources.length} routes · ${Array.isArray(state.tokens) ? state.tokens.length : 0} CAs`, {x:80,y:-132,z:-232}, palette.green, 8, .9);
    const bars = [38, 62, 28, 71, 49, 82, 57, 68, 40];
    bars.forEach((value, index) => {
      const x = -145 + index * 34;
      polygon([{x,y:-82,z:-230},{x:x+22,y:-82,z:-230},{x:x+22,y:-82-value*.53,z:-230},{x,y:-82-value*.53,z:-230}], index % 2 ? '#9c7bff' : '#67d9ff', null, .72);
    });
    drawText('DISCOVER → NORMALIZE → SCORE → INDEX', {x:0,y:-57,z:-232}, palette.text, 8, .65);

    // Six operator desks are intentionally simple geometry, so the scene keeps
    // its game-room feel without loading a remote 3D asset.
    for (let row = 0; row < 2; row += 1) {
      for (let col = -1; col <= 1; col += 1) {
        const x = col * 88, z = 40 + row * 68, y = 120;
        const source = sources[(row * 3 + col + 1 + sources.length) % Math.max(1, sources.length)] || { index:row * 3 + col + 1, kind:'dex', status:'waiting' };
        const color = colorForSource(source);
        box({x,y,z}, {w:54,h:25,d:34}, '#0a1721', .92);
        polygon([{x:x-20,y:y-23,z:z-18},{x:x+20,y:y-23,z:z-18},{x:x+20,y:y-6,z:z-18},{x:x-20,y:y-6,z:z-18}], '#06101a', color, .7);
        for (let bar = 0; bar < 5; bar += 1) {
          const barHeight = 3 + ((bar * 7 + row * 11 + col * 3 + Math.floor(time / 500)) % 10);
          polygon([{x:x-16+bar*7,y:y-7,z:z-19},{x:x-11+bar*7,y:y-7,z:z-19},{x:x-11+bar*7,y:y-7-barHeight,z:z-19},{x:x-16+bar*7,y:y-7-barHeight,z:z-19}], bar % 2 ? palette.pink : palette.cyan, null, .75);
        }
        if (source.status === 'online') drawSpider({x,y:y-30,z:z-14}, source, .5, time + row * 300 + col * 100, color);
        dot({x:x+20,y:y-28,z:z-17}, 1.5, source.status === 'online' ? palette.green : palette.muted, .9, 4);
      }
    }
    box({x:-270,y:115,z:20}, {w:28,h:72,d:28}, '#0a1721', .86);
    box({x:270,y:115,z:20}, {w:28,h:72,d:28}, '#0a1721', .86);
    for (let i = 0; i < 5; i += 1) { dot({x:-270,y:63+i*11,z:3}, 1.4, i % 2 ? palette.green : palette.cyan, .9, 4); dot({x:270,y:63+i*11,z:3}, 1.4, i % 2 ? palette.pink : palette.green, .9, 4); }
  }

  function draw(time) {
    ctx.fillStyle = '#071019'; ctx.fillRect(0, 0, width, height);
    sourceClickTargets = [];
    const sources = sourceRows();
    const filtered = sources.filter(s => selectedChain === 'all' || s.chain === selectedChain || s.chain === 'MULTI');
    const center = { x: 0, y: 0, z: 0 };
    // When the Blender GLB renderer is available, it owns the room shell and
    // physical operators. Keep this canvas as a transparent signal layer so
    // live routes and packets still sit above the imported 3D geometry. The
    // original procedural room remains the offline fallback for no-WebGL.
    const glbActive = window.crawlcaThreeActive === true;
    if (!glbActive) {
      drawFloor(time);
      drawCommandRoom(time, sources);
    }
    // Depth grid and orbital bands make rotation legible before any data has arrived.
    ctx.save(); ctx.globalAlpha = .4; ctx.strokeStyle = '#67d9ff16'; ctx.lineWidth = 1;
    for (let ring = 1; ring <= 5; ring += 1) {
      const radius = ring * 55;
      ctx.beginPath();
      for (let i = 0; i <= 72; i += 1) {
        const p = project({ x: Math.cos(i / 72 * Math.PI * 2) * radius, y: Math.sin(i / 72 * Math.PI * 2) * radius * .55, z: Math.sin(i / 72 * Math.PI * 2) * 2 });
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < 70; i += 1) {
      const p = { x: ((i * 73) % 420) - 210, y: ((i * 47) % 280) - 140, z: ((i * 131) % 280) - 140 };
      dot(p, i % 7 === 0 ? 1.5 : .7, i % 9 === 0 ? palette.pink : palette.cyan, .12 + (i % 4) * .04);
    }

    const sourcePoints = filtered.map((source, index) => ({ source, point: pointOnRing(index, Math.max(1, filtered.length), 215, (index % 3 - 1) * 42) }));
    sourcePoints.forEach(({ source, point }) => {
      const active = source.status === 'online' || source.status === 'crawling';
      drawStation(point, source, time);
      line(center, point, colorForSource(source), active ? .56 : .16, active ? 1.4 : .8);
      if (active) {
        const progress = (time * .00006 + source.index * .137) % 1;
        const spiderPoint = { x: point.x * progress, y: point.y * progress, z: point.z * progress };
        drawSpider(spiderPoint, source, progress, time, colorForSource(source));
        // request packets travel in the reverse direction on every second route.
        const packetProgress = (time * .00004 + source.index * .27) % 1;
        dot({ x: point.x * packetProgress, y: point.y * packetProgress, z: point.z * packetProgress }, 2.2, palette.green, .9, 9);
      }
      const alpha = active ? .96 : .42;
      dot(point, active ? 8 : 6, colorForSource(source), alpha, active ? 17 : 3);
      drawText(source.name, { x: point.x, y: point.y + 18, z: point.z }, active ? palette.text : palette.muted, 9, alpha);
      drawText(source.status === 'online' ? `${source.count || 0} CA · ${source.elapsedMs ? `${Math.round(source.elapsedMs)}ms` : 'live'}` : source.status, { x: point.x, y: point.y + 31, z: point.z }, active ? palette.green : palette.yellow, 8, alpha);
      sourceClickTargets.push({ source, point: project(point) });
    });

    // Queen node: layered body and ring give a dimensional focal point.
    drawEllipsoid({ x: 0, y: 0, z: 0 }, 28, 20, '#102c39', .98, palette.cyan);
    drawEllipsoid({ x: 0, y: -3, z: 4 }, 15, 11, '#0a1720', 1, palette.pink);
    drawText('CRAWLCA', { x: 0, y: 3, z: 14 }, palette.text, 9, 1);
    for (let i = 0; i < 8; i += 1) {
      const a = time * .0004 + i * Math.PI / 4;
      dot({ x: Math.cos(a) * 34, y: Math.sin(a) * 19, z: Math.sin(a) * 20 }, 2.2, palette.cyan, .8, 7);
    }
    const angle = ((yaw * 180 / Math.PI) % 360 + 360) % 360;
    const rotation = document.getElementById('missionRotation'); if (rotation) rotation.textContent = `${angle.toFixed(1)}°`;
    const nodes = document.getElementById('missionNodes'); if (nodes) nodes.textContent = `${filtered.length} platforms · ${Array.isArray(state.tokens) ? Math.min(48, state.tokens.length) : 0} CAs`;
    raf = requestAnimationFrame(draw);
  }

  function setState(next) {
    if (!next || typeof next !== 'object') return;
    state = { ...state, ...next };
  }

  function hitTest(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    let match = null, distance = 28;
    sourceClickTargets.forEach(item => {
      const d = Math.hypot(item.point.x - x, item.point.y - y);
      if (d < distance) { match = item.source; distance = d; }
    });
    return match;
  }

  window.addEventListener('crawlcaState', event => setState(event.detail));
  window.addEventListener('resize', resize);
  canvas.addEventListener('pointerdown', event => { dragging = true; lastX = event.clientX; lastY = event.clientY; canvas.setPointerCapture?.(event.pointerId); });
  canvas.addEventListener('pointermove', event => {
    if (!dragging) return;
    yaw += (event.clientX - lastX) * .008; pitch = clamp(pitch + (event.clientY - lastY) * .006, -1.15, 1.15); lastX = event.clientX; lastY = event.clientY;
  });
  canvas.addEventListener('pointerup', event => { dragging = false; canvas.releasePointerCapture?.(event.pointerId); });
  canvas.addEventListener('pointercancel', () => { dragging = false; });
  canvas.addEventListener('wheel', event => { event.preventDefault(); zoom = clamp(zoom * (event.deltaY > 0 ? .93 : 1.07), .65, 1.65); }, { passive: false });
  canvas.addEventListener('click', event => {
    const source = hitTest(event);
    if (source) window.dispatchEvent(new CustomEvent('crawlcaPlatformSelect', { detail: source }));
  });
  document.querySelectorAll('[data-mission-chain]').forEach(button => button.addEventListener('click', () => {
    selectedChain = button.dataset.missionChain || 'all';
    document.querySelectorAll('[data-mission-chain]').forEach(item => item.classList.toggle('active', item === button));
  }));
  const reset = document.getElementById('missionReset');
  if (reset && !resetButtonBound) { resetButtonBound = true; reset.addEventListener('click', () => { yaw = -.32; pitch = -.18; zoom = 1; }); }
  resize();
  raf = requestAnimationFrame(draw);
  window.crawlcaMissionScene = { setState, stop: () => cancelAnimationFrame(raf) };
})();
