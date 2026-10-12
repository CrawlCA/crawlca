/* CrawlCA Swarm Room: a procedural Three.js (r128) control room.
 * Spider crawlers, desks, wall screen and props are built from primitives here,
 * and every screen is a canvas texture fed by the `crawlcaRoomState` event from room.html. */
(function () {
  'use strict';
  const host = document.getElementById('room3d');
  const hero = document.getElementById('hero');
  if (!host) return;
  if (!window.THREE) { if (hero) hero.classList.add('fallback'); return; }
  const T = THREE;

  // ---------- live dashboard state ----------
  let room = window.crawlcaRoomState || { tokens: [], sources: [], mode: 'loading', syncing: false, chain: 'all' };
  const MODE_LABEL = { live: ['RUST API', '#69f0b2'], stale: ['STALE REAL CACHE', '#f5c96a'], loading:['LOADING…','#5d6b85'],cached:['SAVED SNAPSHOT','#f5c96a'],unavailable:['DATA UNAVAILABLE','#f5c96a'] };
  // Desk i == source-site tile i == robot i (shared map defined in room.html).
  const DESKS = window.CRAWLCA_DESKS || [];
  if (DESKS.length !== 6) { if (hero) hero.classList.add('fallback'); return; }
  const DESK = Object.fromEntries(DESKS.map(d => [d.title, d]));
  const deskIndex = Object.fromEntries(DESKS.map((d, i) => [d.title, i]));
  const deskFor = window.crawlcaDeskFor || (() => 5);
  const deskCount = title => (room.tokens || []).filter(t => deskFor(t.source, t.type) === deskIndex[title]).length;
  const deskDimmed = title => room.chain && room.chain !== 'all' && !DESK[title].chains.includes(room.chain);
  // Current job per desk, drawn on that desk's monitor while the robot processes it.
  const deskJob = DESKS.map(() => null);
  const deskLogo = DESKS.map(d => { const im = new Image(); im.src = d.logo; return im; });
  const drawLogo = (g, i, x, y, s) => { const im = deskLogo[i]; if (im && im.complete && im.naturalWidth) g.drawImage(im, x, y, s, s); };

  // ---------- renderer / camera ----------
  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias: true }); }
  catch (err) { if (hero) hero.classList.add('fallback'); console.warn('[crawlca] WebGL unavailable', err); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  host.appendChild(renderer.domElement);

  const scene = new T.Scene();
  scene.background = new T.Color(0x04070d);
  scene.fog = new T.Fog(0x04070d, 38, 70);

  const camera = new T.PerspectiveCamera(32, 16 / 9, 0.1, 200);
  const CAM_BASE = new T.Vector3(0, 21, 25);
  const LOOK = new T.Vector3(0, 1.2, -1.5);
  camera.position.copy(CAM_BASE);
  camera.lookAt(LOOK);

  // ---------- shared materials ----------
  const M = {
    floor: new T.MeshStandardMaterial({ color: 0x0b0f17, roughness: 0.32, metalness: 0.6 }),
    wall: new T.MeshStandardMaterial({ color: 0x0d121b, roughness: 0.75, metalness: 0.3 }),
    panel: new T.MeshStandardMaterial({ color: 0x141a25, roughness: 0.6, metalness: 0.4 }),
    desk: new T.MeshStandardMaterial({ color: 0x1a1f29, roughness: 0.45, metalness: 0.55 }),
    deskTop: new T.MeshStandardMaterial({ color: 0x252b36, roughness: 0.35, metalness: 0.5 }),
    black: new T.MeshStandardMaterial({ color: 0x07090d, roughness: 0.5, metalness: 0.3 }),
    chair: new T.MeshStandardMaterial({ color: 0x111318, roughness: 0.7, metalness: 0.2 }),
    metal: new T.MeshStandardMaterial({ color: 0x9aa3b2, roughness: 0.2, metalness: 1 }),
    chrome: new T.MeshStandardMaterial({ color: 0xd8dde6, roughness: 0.08, metalness: 1 }),
    leaf: new T.MeshStandardMaterial({ color: 0x2f6b2a, roughness: 0.8, side: T.DoubleSide }),
    pot: new T.MeshStandardMaterial({ color: 0x1c1f25, roughness: 0.5, metalness: 0.4 }),
    red: new T.MeshBasicMaterial({ color: 0xff2a3d }),
    warm: new T.MeshBasicMaterial({ color: 0xffd9a0 }),
    cyan: new T.MeshBasicMaterial({ color: 0x3fc3ff }),
  };

  const box = (w, h, d, m) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.castShadow = o.receiveShadow = true; return o; };
  const cyl = (rt, rb, h, m, s = 20) => { const o = new T.Mesh(new T.CylinderGeometry(rt, rb, h, s), m); o.castShadow = o.receiveShadow = true; return o; };
  const at = (o, x, y, z, parent = scene) => { o.position.set(x, y, z); parent.add(o); return o; };
  // ---------- canvas texture helper ----------
  function canvasTex(w, h, drawFn) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); const tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding; tex.anisotropy = 4;
    const api = { c, g, tex, draw(t) { drawFn(g, w, h, t); tex.needsUpdate = true; } };
    api.draw(0); return api;
  }

  // ---------- room shell ----------
  const RW = 30, RD = 20, RH = 9;
  const floor = new T.Mesh(new T.PlaneGeometry(RW, RD), M.floor);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // floor tile seams
  const seams = new T.GridHelper(30, 15, 0x1a2230, 0x121824);
  seams.position.y = 0.005; seams.material.transparent = true; seams.material.opacity = 0.55; scene.add(seams);

  at(box(RW, RH, 0.4, M.wall), 0, RH / 2, -RD / 2 - 0.2);
  at(box(0.4, RH, RD, M.wall), -RW / 2 - 0.2, RH / 2, 0);
  at(box(0.4, RH, RD, M.wall), RW / 2 + 0.2, RH / 2, 0);

  // wall panels + red neon pinstripes
  for (let i = -6; i <= 6; i++) {
    const x = i * 2.3;
    if (Math.abs(x) < 7.6) continue; // big screen gap
    at(box(2.1, 7.2, 0.12, M.panel), x, 4.2, -RD / 2 + 0.05);
    at(box(0.05, 6.4, 0.05, M.red), x + 1.08, 4.2, -RD / 2 + 0.14);
  }
  for (let i = 0; i < 8; i++) {
    const z = -RD / 2 + 1.4 + i * 2.4;
    at(box(0.12, 7, 2.1, M.panel), -RW / 2 + 0.06, 4.2, z);
    at(box(0.05, 6.2, 0.05, M.red), -RW / 2 + 0.15, 4.2, z + 1.07);
    at(box(0.12, 7, 2.1, M.panel), RW / 2 - 0.06, 4.2, z);
    at(box(0.05, 6.2, 0.05, M.red), RW / 2 - 0.15, 4.2, z + 1.07);
  }
  // skirting light strips
  at(box(RW, 0.04, 0.06, M.warm), 0, 0.05, -RD / 2 + 0.1);
  at(box(0.06, 0.04, RD, M.warm), -RW / 2 + 0.1, 0.05, 0);
  at(box(0.06, 0.04, RD, M.warm), RW / 2 - 0.1, 0.05, 0);
  // ceiling beam with red lights
  at(box(RW, 0.5, 0.8, M.black), 0, RH - 0.2, -RD / 2 + 0.4);
  for (let i = -5; i <= 5; i++) at(box(0.6, 0.06, 0.06, M.red), i * 2.6, RH - 0.48, -RD / 2 + 0.85);

  // ---------- lighting ----------
  scene.add(new T.AmbientLight(0x6b7da0, 0.35));
  scene.add(new T.HemisphereLight(0x8fb3ff, 0x0a0c10, 0.35));
  const key = new T.DirectionalLight(0xbfd4ff, 0.55);
  key.position.set(-8, 18, 10); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -18, right: 18, top: 14, bottom: -14, near: 1, far: 50 });
  key.shadow.bias = -0.0005; scene.add(key);
  const screenGlow = new T.PointLight(0x3fc3ff, 1.6, 18, 2); screenGlow.position.set(0, 5, -6); scene.add(screenGlow);
  const violetGlow = new T.PointLight(0xb68cff, 0.9, 14, 2); violetGlow.position.set(-3, 3, -6); scene.add(violetGlow);
  const redL = new T.PointLight(0xff2a3d, 0.9, 12, 2); redL.position.set(-13, 4, -6); scene.add(redL);
  const redR = new T.PointLight(0xff2a3d, 0.9, 12, 2); redR.position.set(13, 4, -6); scene.add(redR);
  // ---------- big wall screen: live CA feed ----------
  const fmtLiq = v => v == null ? '—' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'm' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'k' : '$' + Math.round(v);
  const bigScr = canvasTex(1536, 640, (g, w, h, t) => {
    g.fillStyle = '#03060c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(103,217,255,.06)'; g.lineWidth = 1;
    for (let x = 0; x < w; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    const toks = (room.tokens || []).slice().sort((a, b) => b.signal - a.signal);
    let [ml, mc] = MODE_LABEL[room.mode] || MODE_LABEL.unavailable;
    if(room.mode==='live'&&room.tokens.some(row=>row.dataStatus!=='live')){ml='INCLUDES CACHED / UNVERIFIED ROWS';mc='#f5c96a';}
    g.textAlign = 'left'; g.font = '700 30px "IBM Plex Mono",monospace'; g.fillStyle = '#e9eef8';
    g.fillText('JEV / SCENE SNAPSHOT', 60, 64);
    g.textAlign = 'right'; g.fillStyle = mc; g.fillText(room.crawling ? 'SERVER CRAWLING…' : room.syncing ? 'REFRESHING VIEW…' : ml, w - 60, 64); g.textAlign = 'left';
    g.font = '700 18px "IBM Plex Mono",monospace'; g.fillStyle = '#5d6b85';
    ['SYMBOL', 'CONTRACT', 'SOURCE', 'HEURISTIC', 'LIQUIDITY'].forEach((l, i) => g.fillText(l, [60, 330, 640, 930, 1290][i], 112));
    const n = toks.length, off = n ? Math.floor(t / 2.2) % n : 0;
    for (let i = 0; i < 6 && n; i++) {
      const tk = toks[(off + i) % n], y = 160 + i * 64, hot = i === 0;
      if (hot) { g.fillStyle = 'rgba(103,217,255,.12)'; g.fillRect(40, y - 40, w - 80, 56); }
      const c = tk.type === 'launchpad' ? '#ff4da6' : '#67d9ff';
      g.font = '700 30px "IBM Plex Mono",monospace'; g.fillStyle = hot ? '#fff' : c; g.fillText(String(tk.symbol).slice(0, 10), 60, y);
      g.font = '26px "IBM Plex Mono",monospace'; g.fillStyle = '#a9b6cc'; g.fillText(tk.ca || '', 330, y);
      drawLogo(g, deskFor(tk.source, tk.type), 640, y - 24, 28);
      g.fillText(String(tk.source).slice(0, 14), 678, y);
      g.fillStyle = '#16223a'; g.fillRect(930, y - 22, 300, 20);
      g.fillStyle = tk.signal >= 80 ? '#69f0b2' : tk.signal >= 60 ? '#67d9ff' : '#f5c96a';
      g.fillRect(930, y - 22, 300 * Math.min(1, tk.signal / 100), 20);
      g.fillStyle = '#e9eef8'; g.textAlign = 'right'; g.fillText(fmtLiq(tk.liq), w - 60, y); g.textAlign = 'left';
    }
    if (!n) { g.font = '700 30px "IBM Plex Mono",monospace'; g.fillStyle = '#5d6b85'; g.fillText('waiting for swarm telemetry…', 60, 260); }
    const launch = toks.filter(x => x.type === 'launchpad').length, dex=toks.filter(x=>x.type==='dex').length;
    g.font = '700 26px "IBM Plex Mono",monospace'; g.fillStyle = room.jev?.color || '#8f9db5'; g.fillText(room.jev?.label || 'JEV DECISION LAYER', 60, 548);
    g.font = '700 26px "IBM Plex Mono",monospace'; g.fillStyle = '#e9eef8'; g.fillText(`${n} CAs IN SCENE VIEW`, 60, 600);
    g.fillStyle = '#ff4da6'; g.fillText(`LAUNCH ${launch}`, 640, 600);
    g.fillStyle = '#67d9ff'; g.fillText(`DEX ${dex}`, 930, 600);
    if ((t * 2 | 0) % 3 === 0) { g.fillStyle = 'rgba(224,53,74,.7)'; g.fillRect(380 + (t * 37 % 300), 84, 160, 12); }
    g.fillStyle = 'rgba(103,217,255,.07)'; g.fillRect(0, (t * 120) % h, w, 26);
  });
  const SCR_W = 14, SCR_H = 5.8;
  const frame = at(box(SCR_W + 0.6, SCR_H + 0.6, 0.35, M.black), 0, 5.1, -RD / 2 + 0.3);
  at(box(SCR_W + 0.7, 0.06, 0.06, M.red), 0, 5.1 - SCR_H / 2 - 0.3, -RD / 2 + 0.5);
  const screen = new T.Mesh(new T.PlaneGeometry(SCR_W, SCR_H), new T.MeshBasicMaterial({ map: bigScr.tex, toneMapped: false }));
  at(screen, 0, 5.1, -RD / 2 + 0.49);

  // ---------- banners + logo boards ----------
  const crawlcaMark = new Image();
  const brandTextures = [];
  crawlcaMark.onload = () => brandTextures.forEach(tx => tx.draw(0));
  const drawCrawlcaMark = (g, x, y, size) => {
    if (crawlcaMark.complete && crawlcaMark.naturalWidth) g.drawImage(crawlcaMark, x, y, size, size);
  };
  function logoTex(kind) {
    const tx = canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#0a0d13'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ff2a3d'; g.lineWidth = 4; g.strokeRect(10, 10, w - 20, h - 80);
      g.fillStyle = '#e9eef8'; g.textAlign = 'center';
      if (kind === 'crawlca') {
        g.lineWidth = 8; drawCrawlcaMark(g, w / 2 - 80, 50, 160);
        g.fillStyle = '#e9eef8'; g.font = '800 46px Inter,sans-serif'; g.fillText('CRAWLCA', w / 2, 280);
        g.fillStyle = '#4a5670'; g.font = '700 20px "IBM Plex Mono"'; g.fillText('SWARM ROOM', w / 2, 316);
      } else {
        g.fillStyle = '#f5c96a'; g.font = '800 46px Inter,sans-serif'; g.fillText('JEV', w / 2, 90);
        g.fillStyle = '#e9eef8'; g.font = '700 20px "IBM Plex Mono"'; g.fillText('SYSTEM ONE', w / 2, 124);
        // A static decision-schema symbol, not model output or an active choice.
        g.strokeStyle = '#f5c96a'; g.lineWidth = 4; g.lineJoin = 'round';
        g.strokeRect(44, 202, 30, 30);
        g.beginPath(); g.moveTo(74, 217); g.lineTo(112, 217); g.moveTo(112, 169); g.lineTo(112, 265);
        [169, 217, 265].forEach(y => { g.moveTo(112, y); g.lineTo(152, y); }); g.stroke();
        [169, 217, 265].forEach(y => g.strokeRect(152, y - 12, 50, 24));
        g.fillStyle = '#a9b6cc'; g.font = '700 16px "IBM Plex Mono"'; g.fillText('TYPED DECISIONS', w / 2, 315);
        g.fillStyle = '#f5c96a'; g.font = '700 20px "IBM Plex Mono"'; g.fillText('SOURCE REVIEW', w / 2, 360);
        g.fillStyle = '#a9b6cc'; g.font = '700 13px "IBM Plex Mono"'; g.fillText('INSPECT / WATCH / DEFER', w / 2, 393);
      }
      // pennant tail
      g.fillStyle = '#0a0d13'; g.beginPath(); g.moveTo(0, h - 70); g.lineTo(w / 2, h); g.lineTo(w, h - 70); g.fill();
      g.strokeStyle = '#ff2a3d'; g.beginPath(); g.moveTo(10, h - 70); g.lineTo(w / 2, h - 10); g.lineTo(w - 10, h - 70); g.stroke();
    });
    if (kind === 'crawlca') brandTextures.push(tx);
    return tx;
  }
  [[-10.2, 'crawlca'], [10.2, 'queen']].forEach(([x, k]) => {
    const tx = logoTex(k);
    const b = new T.Mesh(new T.PlaneGeometry(2, 4), new T.MeshStandardMaterial({ map: tx.tex, emissive: 0xffffff, emissiveMap: tx.tex, emissiveIntensity: 0.55, roughness: 0.6 }));
    at(b, x, 5.6, -RD / 2 + 0.25);
    at(cyl(0.02, 0.02, 1.4, M.metal), x, 8.2, -RD / 2 + 0.25);
  });
  // glowing logo mark on far-left wall
  const markTex = canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = '#ffffff'; g.lineWidth = 12;
    drawCrawlcaMark(g, 30, 14, 196);
    g.fillStyle = '#fff'; g.font = '800 26px Inter'; g.textAlign = 'center'; g.fillText('CA INTEL', w / 2, 246);
  });
  brandTextures.push(markTex);
  crawlcaMark.src = 'assets/brand/crawlca-mark-v3.svg';
  const mark = new T.Mesh(new T.PlaneGeometry(2.2, 2.2), new T.MeshBasicMaterial({ map: markTex.tex, transparent: true, toneMapped: false }));
  at(mark, -13.2, 6, -RD / 2 + 0.3);
  // ---------- monitor textures ----------
  const monitors = [];
  function monTex(title, color, kind) {
    const m = canvasTex(512, 300, (g, w, h, t) => {
      g.fillStyle = '#04080f'; g.fillRect(0, 0, w, h);
      drawLogo(g, deskIndex[title], 16, 14, 26);
      g.textAlign = 'left'; g.fillStyle = '#e9eef8'; g.font = '700 22px "IBM Plex Mono"'; g.fillText(title, 50, 34);
      g.textAlign = 'right'; g.fillStyle = color; g.fillText(`${deskCount(title)} CAs`, w - 18, 34); g.textAlign = 'left';
      g.strokeStyle = 'rgba(255,255,255,.06)';
      for (let y = 60; y < h; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 4;
      const rows=(room.tokens||[]).filter(token=>deskFor(token.source,token.type)===deskIndex[title]);
      g.font='13px monospace';g.fillStyle='#76839c';
      g.fillText(kind==='wave'?'SNAPSHOT LIQUIDITY / ONE POINT PER TOKEN':kind==='bars'?'SNAPSHOT LIQUIDITY / ONE BAR PER TOKEN':'SNAPSHOT HEURISTIC / NOT AI ANALYSIS',20,56);
      g.fillStyle=color;
      if(kind==='wave'){
        const known=rows.filter(token=>token.liq!=null).slice(0,40), max=Math.max(1,...known.map(token=>token.liq));
        g.beginPath();
        known.forEach((token,i)=>{const x=20+i/Math.max(1,known.length-1)*(w-40),y=h-24-token.liq/max*190;i?g.lineTo(x,y):g.moveTo(x,y);});
        g.stroke();
        known.forEach((token,i)=>{g.beginPath();g.arc(20+i/Math.max(1,known.length-1)*(w-40),h-24-token.liq/max*190,3,0,Math.PI*2);g.fill();});
        if(!known.length){g.fillStyle='#76839c';g.font='18px monospace';g.fillText('Waiting for reported liquidity',24,170);}
      }else if(kind==='bars'){
        const shown=rows.slice(0,22),max=Math.max(1,...shown.map(token=>token.liq??0));
        for(let i=0;i<22;i++){
          const token=shown[i],known=token&&token.liq!=null,height=known?token.liq/max*190:4;
          g.fillStyle=known?color:'#16223a';g.fillRect(20+i*22,h-20-height,14,height);
        }
        if(!shown.some(token=>token.liq!=null)){g.fillStyle='#76839c';g.font='18px monospace';g.fillText('Waiting for reported liquidity',24,170);}
      }else{
        for(let i=0;i<6;i++){
          const token=rows[i],known=token&&token.signal!=null,width=known?Math.max(0,Math.min(100,token.signal))/100*380:380;
          g.globalAlpha=known?0.8:0.2;g.fillStyle=known?color:'#5d6b85';g.fillRect(24,76+i*36,width,14);g.globalAlpha=1;
          g.fillStyle='#a9b6cc';g.font='12px monospace';g.fillText(token?String(token.symbol).slice(0,9):'—',26,72+i*36);
          g.fillText(known?String(token.signal):'—',420,88+i*36);
        }
      }
      g.globalAlpha=1;
      const job = deskJob[deskIndex[title]];
      if (job) {
        g.fillStyle = 'rgba(3,6,12,.86)'; g.fillRect(0, 50, w, h - 50);
        g.fillStyle = color; g.font = '700 20px "IBM Plex Mono"'; g.fillText('SNAPSHOT TOUR', 18, 92);
        g.fillStyle = '#ffffff'; g.font = '700 40px "IBM Plex Mono"'; g.fillText(String(job.sym).slice(0, 12), 18, 148);
        g.fillStyle = '#a9b6cc'; g.font = '18px "IBM Plex Mono"';
        g.fillText((job.cas && job.cas.length ? job.cas.slice(0, 5).join(' · ') : String(job.line)).slice(0, 42), 18, 184);
        const STEPS=['show source','view rows','desk animation','panel animation'];
        g.font='700 16px monospace';
        STEPS.forEach((step,k)=>{const on=job.p>=k/4;g.fillStyle=on?color:'#2a3446';g.fillText((job.p>=(k+1)/4?'✓ ':on?'› ':'  ')+step,18+(k%2)*240,222+(k/2|0)*24);});
        g.fillStyle='#76839c';g.font='12px monospace';g.fillText('VISUAL TOUR PROGRESS · EXISTING SNAPSHOT',18,266);
        g.fillStyle='#16223a';g.fillRect(18,276,w-36,10);g.fillStyle=color;g.fillRect(18,276,(w-36)*job.p,10);
      }
      if (deskDimmed(title)) { g.fillStyle = 'rgba(3,6,12,.78)'; g.fillRect(0, 0, w, h); g.fillStyle = '#5d6b85'; g.font = '700 22px "IBM Plex Mono"'; g.fillText('CHAIN FILTERED', 18, 160); }
    });
    monitors.push(m); return m.tex;
  }

  // ---------- desk station ----------
  const deskRed = new T.MeshBasicMaterial({ color: 0xff2a3d });
  function station(x, z, title, color, kind) {
    const g = new T.Group(); g.position.set(x, 0, z); scene.add(g);
    at(box(4.4, 0.12, 1.9, M.deskTop), 0, 1.45, 0, g);
    at(box(0.12, 1.45, 1.9, M.desk), -2.14, 0.72, 0, g);
    at(box(0.12, 1.45, 1.9, M.desk), 2.14, 0.72, 0, g);
    at(box(4.3, 0.9, 0.08, M.desk), 0, 0.9, -0.9, g);
    at(box(1.0, 1.1, 1.6, M.black), -1.5, 0.6, 0, g); // drawer
    at(box(4.42, 0.03, 0.03, deskRed), 0, 1.38, 0.96, g);
    at(box(0.03, 1.3, 0.03, deskRed), -2.2, 0.7, 0.96, g);
    at(box(0.03, 1.3, 0.03, deskRed), 2.2, 0.7, 0.96, g);
    // warm under-glow on floor
    const glow = new T.Mesh(new T.PlaneGeometry(4.6, 0.5), new T.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.12 }));
    glow.rotation.x = -Math.PI / 2; at(glow, 0, 0.01, 1.2, g);
    // main monitor
    const mon = new T.Group(); at(mon, 0.2, 1.51, -0.55, g);
    at(box(2.7, 1.55, 0.08, M.black), 0, 1.0, 0, mon);
    const scr = new T.Mesh(new T.PlaneGeometry(2.56, 1.42), new T.MeshBasicMaterial({ map: monTex(title, color, kind), toneMapped: false }));
    at(scr, 0, 1.0, 0.045, mon);
    at(box(0.12, 0.3, 0.12, M.metal), 0, 0.15, -0.05, mon);
    at(box(0.8, 0.03, 0.4, M.metal), 0, 0.01, -0.05, mon);
    // side small monitor
    const side = at(box(0.9, 0.6, 0.05, M.black), -1.75, 2.1, -0.5, g); side.rotation.y = 0.35;
    const sideS = new T.Mesh(new T.PlaneGeometry(0.82, 0.52), new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(0.25) }));
    at(sideS, 0, 0, 0.03, side);
    // keyboard, mug, speaker
    at(box(1.2, 0.04, 0.38, M.black), 0.2, 1.53, 0.3, g);
    at(cyl(0.09, 0.08, 0.2, M.chrome), 1.4, 1.61, 0.2, g);
    at(box(0.22, 0.45, 0.22, M.black), 1.85, 1.73, -0.45, g);
    // chair (in front)
    const ch = new T.Group(); at(ch, 0.2, 0, 1.75, g); ch.rotation.y = Math.PI + (Math.random() - 0.5) * 0.5;
    at(box(0.9, 0.14, 0.85, M.chair), 0, 0.85, 0, ch);
    at(box(0.9, 1.1, 0.12, M.chair), 0, 1.45, -0.42, ch);
    at(cyl(0.05, 0.05, 0.7, M.metal), 0, 0.45, 0, ch);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const l = at(box(0.5, 0.05, 0.06, M.metal), Math.cos(a) * 0.25, 0.1, Math.sin(a) * 0.25, ch); l.rotation.y = -a; }
    at(box(0.08, 0.3, 0.6, M.chair), -0.48, 1.05, 0, ch);
    at(box(0.08, 0.3, 0.6, M.chair), 0.48, 1.05, 0, ch);
    return { g, seat: new T.Vector3(x + 0.2, 0, z + 2.9) };
  }
  // Desks laid out in two rows of three; order matches window.CRAWLCA_DESKS.
  const KINDS = ['list', 'wave', 'bars'];
  const STN = DESKS.map((d, i) => station([-7, 0, 7][i % 3], i < 3 ? -3.6 : 2.2, d.title, d.color, KINDS[i % 3]));

  // ---------- plants ----------
  function plant(x, z, s = 1) {
    const g = new T.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
    at(cyl(0.38, 0.3, 0.7, M.pot), 0, 0.35, 0, g);
    at(box(0.62, 0.03, 0.62, M.warm), 0, 0.02, 0, g).scale.set(0.01, 1, 0.01);
    const leafG = new T.SphereGeometry(0.5, 10, 6);
    for (let i = 0; i < 14; i++) {
      const l = new T.Mesh(leafG, M.leaf); l.castShadow = true;
      const a = i / 14 * Math.PI * 2 + Math.random() * 0.3, tilt = 0.5 + Math.random() * 0.7;
      l.scale.set(0.22, 0.05, 0.9);
      l.position.set(Math.cos(a) * 0.45, 0.95 + Math.random() * 0.6, Math.sin(a) * 0.45);
      l.rotation.set(0, -a + Math.PI / 2, 0); l.rotateX(-tilt);
      g.add(l);
    }
    g.userData.sway = Math.random() * 6; plants.push(g); return g;
  }
  const plants = [];
  plant(-11.5, -7.5, 1.3); plant(12.5, -6, 1.1); plant(-4.5, 6.6, 1.2); plant(4.5, 6.6, 1.2);
  plant(-12.2, 0.6, 0.6); plant(-2.4, -2.8, 0.45); plant(4.6, 2.8, 0.45); plant(0, 8.2, 0.5);

  // ---------- sofa + table ----------
  const sofa = new T.Group(); sofa.position.set(0, 0, 6.6); scene.add(sofa);
  at(box(4.6, 0.6, 1.5, M.chair), 0, 0.4, 0, sofa);
  at(box(4.6, 0.9, 0.35, M.chair), 0, 1.0, -0.6, sofa);
  at(box(0.4, 0.8, 1.5, M.chair), -2.3, 0.6, 0, sofa);
  at(box(0.4, 0.8, 1.5, M.chair), 2.3, 0.6, 0, sofa);
  for (let i = -1; i <= 1; i++) at(box(1.4, 0.18, 1.2, M.chair), i * 1.45, 0.78, 0.1, sofa);
  at(box(2.6, 0.35, 1.0, M.black), 0, 0.2, 8.4);
  // ---------- right side props ----------
  // lounge counter + lamp + chrome globe
  at(box(5.2, 1.3, 1.6, M.desk), 10.6, 0.65, -7.2);
  at(box(5.3, 0.08, 1.7, M.deskTop), 10.6, 1.34, -7.2);
  at(box(5.3, 0.03, 0.03, M.red), 10.6, 1.25, -6.35);
  at(cyl(0.05, 0.05, 1.1, M.metal), 8.8, 1.9, -7.4);
  at(cyl(0.05, 0.3, 0.3, M.black), 8.8, 2.5, -7.4);
  const lampBulb = at(new T.Mesh(new T.SphereGeometry(0.1, 12, 8), M.warm), 8.8, 2.35, -7.4);
  const lampL = new T.PointLight(0xffc98a, 0.9, 6, 2); lampL.position.set(8.8, 2.2, -7.4); scene.add(lampL);
  const globe = at(new T.Mesh(new T.SphereGeometry(0.55, 32, 24), M.chrome), 11.6, 2.1, -7.4);
  at(cyl(0.08, 0.25, 0.25, M.black), 11.6, 1.5, -7.4);
  at(box(0.9, 0.6, 0.7, M.black), 13.1, 1.68, -7.3);
  // picture frames on right wall area
  [[11.5, 6, 2.6, 1.6], [13.6, 5.2, 1.6, 2.4], [11.5, 4.1, 2.2, 1]].forEach(([x, y, w, h]) => {
    at(box(w, h, 0.08, M.black), x, y, -RD / 2 + 0.2);
    at(box(w + 0.08, h + 0.08, 0.04, new T.MeshStandardMaterial({ color: 0x2a313d, metalness: 0.8, roughness: 0.3 })), x, y, -RD / 2 + 0.15);
  });

  // rocket on pedestal
  const rocket = new T.Group(); rocket.position.set(10.5, 0, 0.5); scene.add(rocket);
  at(box(1.8, 1.4, 1.8, M.black), 0, 0.7, 0, rocket);
  at(box(1.82, 0.03, 0.03, M.red), 0, 1.3, 0.91, rocket);
  const body = at(cyl(0.32, 0.38, 2.0, M.chrome, 24), 0, 2.6, 0, rocket);
  at(new T.Mesh(new T.ConeGeometry(0.32, 0.9, 24), M.chrome), 0, 4.05, 0, rocket);
  for (let i = 0; i < 3; i++) {
    const f = at(box(0.06, 0.7, 0.55, M.chrome), 0, 1.9, 0, rocket);
    f.rotation.y = i / 3 * Math.PI * 2; f.translateZ(0.42);
  }
  at(cyl(0.12, 0.12, 0.05, M.black), 0, 2.9, 0.34, rocket).rotation.x = Math.PI / 2;
  const flame = at(new T.Mesh(new T.ConeGeometry(0.22, 0.6, 16), new T.MeshBasicMaterial({ color: 0x5fd4ff, transparent: true, opacity: 0.7 })), 0, 1.35, 0, rocket);
  flame.rotation.x = Math.PI;

  // satellite dish
  const dish = new T.Group(); dish.position.set(10.2, 0, 5.4); scene.add(dish);
  at(box(2.2, 1.0, 2.2, M.black), 0, 0.5, 0, dish);
  at(box(2.22, 0.03, 0.03, M.red), 0, 0.9, 1.11, dish);
  at(cyl(0.2, 0.35, 0.9, M.black), 0, 1.45, 0, dish);
  const dishHead = new T.Group(); at(dishHead, 0, 2.1, 0, dish);
  const bowl = new T.Mesh(new T.SphereGeometry(1.2, 32, 12, 0, Math.PI * 2, 0, Math.PI / 3.2),
    new T.MeshStandardMaterial({ color: 0x2b313b, metalness: 0.7, roughness: 0.4, side: T.DoubleSide, wireframe: false }));
  bowl.rotation.x = Math.PI / 2 + 0.5; bowl.castShadow = true; dishHead.add(bowl);
  const ribs = new T.Mesh(bowl.geometry, new T.MeshBasicMaterial({ color: 0x5a6372, wireframe: true, transparent: true, opacity: 0.35 }));
  ribs.rotation.copy(bowl.rotation); dishHead.add(ribs);
  const feed = at(cyl(0.02, 0.02, 1.0, M.metal), 0, 0.15, 0.55, dishHead); feed.rotation.x = Math.PI / 2 - 0.5;
  at(new T.Mesh(new T.SphereGeometry(0.07, 8, 6), M.red), 0, 0.4, 1.0, dishHead);

  // server rack with blinking LEDs
  const rack = new T.Group(); rack.position.set(13.6, 0, 2.8); scene.add(rack);
  at(box(1.5, 4.6, 1.4, M.black), 0, 2.3, 0, rack);
  const leds = [];
  for (let r = 0; r < 12; r++) {
    at(box(1.3, 0.02, 0.02, new T.MeshBasicMaterial({ color: 0x1a2232 })), 0, 0.5 + r * 0.33, 0.71, rack);
    for (let c = 0; c < 4; c++) {
      const l = at(box(0.08, 0.05, 0.02, new T.MeshBasicMaterial({ color: 0x3fc3ff })), -0.45 + c * 0.12, 0.6 + r * 0.33, 0.72, rack);
      l.userData.p = Math.random() * 10; leds.push(l);
    }
  }
  at(box(1.52, 0.04, 1.42, M.warm), 0, 4.62, 0, rack);

  // ---------- left side props ----------
  at(box(2.6, 2.4, 1.4, M.desk), -12.6, 1.2, -1.8);
  at(box(2.62, 0.03, 0.03, M.red), -12.6, 2.3, -1.1);
  for (let i = 0; i < 5; i++) at(box(0.18, 0.9, 0.7, i % 2 ? M.black : M.panel), -13.4 + i * 0.22, 2.85, -1.8);
  at(cyl(0.15, 0.15, 0.6, M.chrome), -11.6, 2.7, -1.8);
  const pcBox = at(box(2.0, 1.8, 1.8, M.black), -12.8, 0.9, 4.6);
  for (let i = 0; i < 10; i++) at(box(0.04, 1.2, 0.02, new T.MeshBasicMaterial({ color: 0x2a3140 })), -13.6 + i * 0.17, 1.0, 5.51);
  at(box(1.4, 0.3, 0.02, new T.MeshBasicMaterial({ color: 0xc9d1de })), -12.8, 1.95, 5.51);
  at(box(2.02, 0.04, 1.82, M.warm), -12.8, 0.02, 4.6);
  // ---------- animated display robots (original design: capsule body, visor, antenna, hover ring) ----------
  // One robot per desk. Robots roam the aisles freely, walk back when a spider drops a packet,
  // display it at their monitor, then animate a courier spider.
  const visorM = new T.MeshStandardMaterial({ color: 0x0a0f1a, roughness: 0.15, metalness: 0.6 });
  const eyeM = new T.MeshBasicMaterial({ color: 0xffffff });
  const labelsEl = document.getElementById('labels3d');
  const pickables = [];
  const cubeGeo = new T.BoxGeometry(0.26, 0.26, 0.26);
  const robots = DESKS.map((d, i) => {
    const c = new T.Color(d.color).getHex();
    const g = new T.Group(); scene.add(g);
    const shell = new T.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.15, emissive: c, emissiveIntensity: 0.12 });
    const rig = new T.Group(); g.add(rig);
    const head = new T.Mesh(new T.SphereGeometry(0.5, 28, 20), shell); head.scale.set(1.15, 0.9, 1); head.castShadow = true;
    at(head, 0, 1.5, 0, rig);
    const visor = new T.Mesh(new T.SphereGeometry(0.46, 24, 16, -0.9, 1.8, 1.0, 1.15), visorM); visor.scale.set(1.17, 0.93, 1.03);
    at(visor, 0, 1.5, 0.02, rig);
    const eyes = [];
    [-0.16, 0.16].forEach(x => { const e = at(new T.Mesh(new T.SphereGeometry(0.065, 10, 8), eyeM), x, 1.51, 0.46, rig); e.scale.set(1, 1.4, 0.5); eyes.push(e); });
    [-0.6, 0.6].forEach(x => at(cyl(0.09, 0.09, 0.12, shell, 14), x, 1.5, 0, rig).rotation.z = Math.PI / 2);
    at(cyl(0.02, 0.02, 0.28, M.metal), 0, 2.06, 0, rig);
    const tip = at(new T.Mesh(new T.SphereGeometry(0.07, 12, 8), new T.MeshBasicMaterial({ color: c })), 0, 2.22, 0, rig);
    const torso = new T.Mesh(new T.SphereGeometry(0.36, 20, 14), shell); torso.scale.set(1, 0.86, 0.9); torso.castShadow = true;
    at(torso, 0, 0.8, 0, rig);
    at(new T.Mesh(new T.SphereGeometry(0.08, 10, 8), new T.MeshBasicMaterial({ color: c })), 0, 0.82, 0.31, rig);
    [head, visor, torso].forEach(m => { m.userData.desk = i; pickables.push(m); });
    const ring = new T.Mesh(new T.TorusGeometry(0.45, 0.04, 8, 40), new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6 }));
    ring.rotation.x = Math.PI / 2; at(ring, 0, 0.3, 0, g);
    const disc = new T.Mesh(new T.CircleGeometry(0.55, 24), new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.18 }));
    disc.rotation.x = -Math.PI / 2; at(disc, 0, 0.02, 0, g);
    const lab = document.createElement('span'); lab.style.color = d.color;
    lab.innerHTML = `<img src="${d.logo}" alt=""><em></em>`; labelsEl.appendChild(lab);
    const labTxt = lab.querySelector('em');
    const home = STN[i].seat.clone();
    g.position.copy(home); g.rotation.y = Math.PI;
    return { i, d, g, rig, ring, tip, eyes, lab, labTxt, shell, home, color: c, name: `${d.short}·VIEW`,
      state: 'roam', path: [], wait: 1 + Math.random() * 4, phase: Math.random() * 6, focus: 0,
      queue: [], job: null, cubes: [], labText: '', idleFace: Math.PI };
  });

  // Aisle graph: rows behind / between / in front of the desks, columns in the gaps.
  // Robots only travel along these lines, so they never walk through furniture.
  const ROWS = [-5.6, -0.6, 5.0], COLS = [-10.4, -3.5, 3.5];
  const NODES = [];
  ROWS.forEach(z => COLS.forEach(x => NODES.push(new T.Vector3(x, 0, z))));
  // Extra stops along the rows (x=9 avoids the rocket pedestal; the front row stops short of the dish).
  [[-7, -5.6], [0, -5.6], [7, -5.6], [9, -5.6], [-7, -0.6], [0, -0.6], [7, -0.6], [9, -0.6], [-7, 5.0], [0, 5.0], [7, 5.0]]
    .forEach(([x, z]) => NODES.push(new T.Vector3(x, 0, z)));
  NODES.push(new T.Vector3(-3.5, 0, 7.6), new T.Vector3(3.5, 0, 7.6));      // lounge, beside the sofa
  const on = (v, list) => list.some(k => Math.abs(k - v) < 0.01);
  const linked = (a, b) => (Math.abs(a.z - b.z) < 0.01 && on(a.z, ROWS)) || (Math.abs(a.x - b.x) < 0.01 && on(a.x, COLS));
  const nearest = p => NODES.reduce((b, n) => (n.distanceTo(p) < b.distanceTo(p) ? n : b), NODES[0]);
  // BFS over aisle nodes; only neighbours on the same line with nothing in between.
  function route(from, to) {
    const s = nearest(from), e = nearest(to);
    const nb = n => NODES.filter(m => m !== n && linked(n, m)).filter(m => !NODES.some(k => k !== n && k !== m && linked(n, k) && linked(k, m)
      && k.distanceTo(n) < m.distanceTo(n) && k.distanceTo(m) < m.distanceTo(n)));
    const prev = new Map([[s, null]]), q = [s];
    while (q.length) { const n = q.shift(); if (n === e) break; nb(n).forEach(m => { if (!prev.has(m)) { prev.set(m, n); q.push(m); } }); }
    const path = []; for (let n = e; n; n = prev.get(n)) path.unshift(n.clone());
    if (!prev.has(e)) path.splice(0, path.length, e.clone());
    path.push(to.clone());
    return path;
  }
  // Pick a roaming goal that no other robot is heading to or standing on, so they spread out.
  function roamTarget(r) {
    let best = null;
    for (let k = 0; k < 8; k++) {
      const c = Math.random() < 0.18 ? robots[(Math.random() * robots.length) | 0].home.clone().add(new T.Vector3((Math.random() - 0.5) * 1.2, 0, 0.35))
        : NODES[(Math.random() * NODES.length) | 0].clone().add(new T.Vector3((Math.random() - 0.5) * 0.6, 0, 0));
      const clear = robots.every(o => o === r || ((!o.goal || o.goal.distanceTo(c) > 2.2) && o.g.position.distanceTo(c) > 1.8));
      best = c; if (clear) break;
    }
    r.goal = best; return best;
  }

  // ---------- crawler hub + data network ----------
  const hub = new T.Group(); hub.position.set(0, 4.2, -2); scene.add(hub);
  const hubCore = new T.Mesh(new T.OctahedronGeometry(0.45, 0), new T.MeshBasicMaterial({ color: 0x5fd4ff, wireframe: true }));
  hub.add(hubCore);
  const hubInner = new T.Mesh(new T.OctahedronGeometry(0.22, 0), new T.MeshBasicMaterial({ color: 0x3fc3ff, transparent: true, opacity: 0.6 }));
  hub.add(hubInner);
  const hubLight = new T.PointLight(0x3fc3ff, 1.2, 6, 2); hub.add(hubLight);
  const NN = 9, netNodes = [];
  const nodeGeo = new T.SphereGeometry(0.08, 10, 8);
  for (let i = 0; i < NN; i++) {
    const m = new T.Mesh(nodeGeo, new T.MeshBasicMaterial({ color: i % 3 === 0 ? 0xff4d6a : 0x3fc3ff }));
    scene.add(m); netNodes.push({ m, a: Math.random() * 6.28, e: Math.random() * 6.28, r: 1.2 + Math.random() * 2.2, s: (Math.random() - 0.5) * 0.8 });
  }
  const netGeo = new T.BufferGeometry();
  const netPos = new Float32Array(NN * 4 * 3);
  netGeo.setAttribute('position', new T.BufferAttribute(netPos, 3));
  const netLines = new T.LineSegments(netGeo, new T.LineBasicMaterial({ color: 0x3fc3ff, transparent: true, opacity: 0.7 }));
  netLines.frustumCulled = false; scene.add(netLines);
  const hubTarget = new T.Vector3(0, 4.2, -2);

  // ambient dust particles
  const DUST = 260, dPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) { dPos[i * 3] = (Math.random() - 0.5) * RW; dPos[i * 3 + 1] = Math.random() * RH; dPos[i * 3 + 2] = (Math.random() - 0.5) * RD; }
  const dustGeo = new T.BufferGeometry(); dustGeo.setAttribute('position', new T.BufferAttribute(dPos, 3));
  const dust = new T.Points(dustGeo, new T.PointsMaterial({ color: 0x7fc8ff, size: 0.05, transparent: true, opacity: 0.5 }));
  scene.add(dust);
  // ---------- post-processing ----------
  let composer = null, bloom = null;
  if (T.EffectComposer && T.UnrealBloomPass) {
    composer = new T.EffectComposer(renderer);
    composer.addPass(new T.RenderPass(scene, camera));
    bloom = new T.UnrealBloomPass(new T.Vector2(1, 1), 0.85, 0.55, 0.62);
    composer.addPass(bloom);
    if (T.GammaCorrectionShader) composer.addPass(new T.ShaderPass(T.GammaCorrectionShader));
  }

  function resize() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w / h < 1.3 ? 42 : 32; camera.updateProjectionMatrix();
    if (composer) { composer.setSize(w, h); bloom.setSize(w, h); }
  }
  new ResizeObserver(resize).observe(host); resize();

  // ---------- interaction: drag to orbit, idle sway ----------
  let yaw = 0, pitch = 0, tYaw = 0, tPitch = 0, drag = null, lastInput = -1e9;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY }; drag = { x: e.clientX, y: e.clientY, yaw: tYaw, pitch: tPitch }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (!drag) return; lastInput = performance.now();
    tYaw = Math.max(-0.7, Math.min(0.7, drag.yaw - (e.clientX - drag.x) * 0.004));
    tPitch = Math.max(-0.25, Math.min(0.3, drag.pitch + (e.clientY - drag.y) * 0.003));
  });
  el.addEventListener('pointerup', () => { drag = null; });

  // ---------- dashboard hooks (room.html / room-swarm.js <-> scene) ----------
  let downAt = null, focusedDesk = -1, focusUntil = 0;
  const SCREEN_POS = new T.Vector3(0, 5.1, -RD / 2 + 0.8);
  let screenFlash = 0;
  window.addEventListener('crawlcaRoomState', e => { if (e.detail) room = e.detail; });
  window.crawlcaRoomFocus = cardIdx => {
    if (cardIdx === 6) hubTarget.set(0, 5.2, -6.5);        // CRAWLER card -> live wall screen
    else if (cardIdx === 7) hubTarget.set(10.2, 5.2, -8.5); // QUEEN card -> queen banner
  };
  window.crawlcaRoomResetCam = () => { tYaw = 0; tPitch = 0; lastInput = -1e9; };
  // A spider dropped a packet on desk i: queue a display animation; this does not start backend work.
  window.crawlcaRoomDeliver = (i, job) => {
    const r = robots[i]; if (!r) return false;
    r.queue.push(job);
    const cube = new T.Mesh(cubeGeo, new T.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.9 }));
    scene.add(cube); r.cubes.push(cube);
    return true;
  };
  // Screen position (relative to the hero box) of desk i's monitor, so spiders land on it.
  const projV = new T.Vector3();
  window.crawlcaRoomDeskScreen = i => {
    const st = STN[i]; if (!st) return null;
    projV.set(st.g.position.x + 0.2, 2.5, st.g.position.z - 0.5).project(camera);
    if (projV.z > 1) return null;
    return { x: (projV.x + 1) / 2 * host.clientWidth, y: (1 - projV.y) / 2 * host.clientHeight };
  };
  // Click (not drag) a robot: highlight it and ask the swarm to fetch for its desk.
  const ray = new T.Raycaster(), ptr = new T.Vector2();
  el.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
    const rect = el.getBoundingClientRect();
    ptr.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (!hit) return;
    focusedDesk = hit.object.userData.desk; focusUntil = performance.now() + 4000;
    window.dispatchEvent(new CustomEvent('crawlcaRoomPick', { detail: { desk: focusedDesk } }));
  });

  // ---------- loop ----------
  let frameCount = 0, texPass = 0, heroVisible = true;
  // Skip GPU work while the room is scrolled out of view; robots and jobs keep updating.
  new IntersectionObserver(es => { heroVisible = es[0].isIntersecting; }).observe(host);
  const clock = new T.Clock(); const tmp = new T.Vector3(); let monTick = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime; frameCount++;
    // camera
    if (performance.now() - lastInput > 4000 && !drag) { tYaw *= 0.98; tPitch *= 0.98; }
    const sway = reduce ? 0 : Math.sin(t * 0.12) * 0.08;
    yaw += (tYaw + sway - yaw) * 0.06; pitch += (tPitch - pitch) * 0.06;
    const off = CAM_BASE.clone().sub(LOOK);
    const rad = off.length(), base = Math.atan2(off.y, Math.hypot(off.x, off.z));
    const el2 = base + pitch;
    camera.position.set(LOOK.x + Math.sin(yaw) * Math.cos(el2) * rad, LOOK.y + Math.sin(el2) * rad, LOOK.z + Math.cos(yaw) * Math.cos(el2) * rad);
    camera.lookAt(LOOK);

    // screens (throttled canvas redraw)
    monTick += dt;
    if (monTick > 1 / 12) {
      monTick = 0; texPass++;
      if (texPass % 2 === 0) bigScr.draw(t);
      monitors.forEach((m, k) => { if (deskJob[k] || k === texPass % monitors.length) m.draw(t); });
    }

    // desk robots: roam -> return (packet waiting) -> work at monitor -> hand result to a courier
    const w = host.clientWidth, h = host.clientHeight;
    const startWork = r => {
      if (!r.queue.length) { r.state = 'roam'; r.wait = 1 + Math.random() * 2; return; }
      r.state = 'work'; r.job = { ...r.queue.shift(), p: 0 }; deskJob[r.i] = r.job;
    };
    robots.forEach(r => {
      const p = r.g.position;
      if (r.state === 'roam' && r.queue.length) { r.path = route(p, r.home); r.goal = r.home; r.state = 'return'; }
      if (r.state === 'work') {
        r.job.p = Math.min(1, r.job.p + dt / (r.job.dur / 1000));
        let diff = Math.PI - r.g.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); r.g.rotation.y += diff * Math.min(1, dt * 5);
        if (r.cubes[0]) r.cubes[0].scale.setScalar(Math.max(0.05, 1 - r.job.p));
        if (r.job.p >= 1) {
          const done = r.job; r.job = null; deskJob[r.i] = null;
          const c = r.cubes.shift(); if (c) { scene.remove(c); c.material.dispose(); }
          screenFlash = 1;
          window.dispatchEvent(new CustomEvent('crawlcaRoomTourCompleted', { detail: { desk: r.i, job: done } }));
          startWork(r); if (r.state === 'roam') r.path = [];
        }
      } else if (r.path.length) {
        tmp.copy(r.path[0]).sub(p); tmp.y = 0; const d = tmp.length();
        if (d < 0.08) r.path.shift();
        else {
          tmp.normalize(); p.addScaledVector(tmp, Math.min(d, dt * (r.state === 'return' ? 2.6 : 1.5)));
          let diff = Math.atan2(tmp.x, tmp.z) - r.g.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); r.g.rotation.y += diff * Math.min(1, dt * 7);
        }
        if (!r.path.length && r.state === 'return') startWork(r);
      } else if (r.state === 'return') startWork(r);
      else {
        let diff = r.idleFace - r.g.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); r.g.rotation.y += diff * dt * 2;
        r.wait -= dt;
        if (r.wait <= 0) { r.path = route(p, roamTarget(r)); r.wait = 2 + Math.random() * 4; r.idleFace = Math.random() < 0.5 ? Math.PI : Math.random() * 6.28; }
      }
      // soft separation so robots sidestep each other in the aisles
      if (r.state !== 'work') robots.forEach(o => {
        if (o === r) return; const dx = p.x - o.g.position.x, dz = p.z - o.g.position.z, dd = Math.hypot(dx, dz);
        if (dd > 0.001 && dd < 1.4) { p.x += dx / dd * (1.4 - dd) * dt * 4; p.z += dz / dd * (1.4 - dd) * dt * 4; }
      });
      const working = r.state === 'work';
      r.rig.position.y = 0.15 + Math.sin(t * (working ? 6 : 2.4) + r.phase) * (working ? 0.04 : 0.08);
      r.rig.rotation.x = r.path.length ? 0.12 : r.rig.rotation.x * 0.9;
      r.rig.rotation.z = Math.sin(t * 1.3 + r.phase) * 0.05;
      const hot = working || (focusedDesk === r.i && performance.now() < focusUntil) ? 1 : 0;
      r.focus += (hot - r.focus) * 0.08;
      r.ring.scale.setScalar(1 + r.focus * 0.5 + Math.sin(t * 4 + r.phase) * 0.05);
      r.ring.material.opacity = 0.45 + r.focus * 0.5;
      r.shell.emissiveIntensity = 0.12 + r.focus * 0.35;
      r.tip.scale.setScalar(1 + (Math.sin(t * (hot ? 12 : 6) + r.phase) > 0.6 ? 0.6 : 0));
      const blink = Math.sin(t * 0.9 + r.phase * 3) > 0.985 ? 0.15 : 1;
      r.eyes.forEach(e => (e.scale.y = 1.4 * blink));
      // packet cubes waiting on the desk; the first one shrinks as it is processed
      const sp = STN[r.i].g.position;
      r.cubes.forEach((c, k) => { c.position.set(sp.x - 0.9 + Math.min(k, 4) * 0.32, 1.78 + Math.sin(t * 3 + k) * 0.05, sp.z + 0.25); c.rotation.y += dt * (k === 0 && working ? 5 : 1.2); });
      const txt = r.job ? `${r.name} · ${r.job.sym}` : r.queue.length ? `${r.name} · ${r.queue.length} queued` : r.name;
      if (txt !== r.labText) { r.labText = txt; r.labTxt.textContent = txt; }
      tmp.set(p.x, 2.75 + r.rig.position.y, p.z).project(camera);
      r.lab.style.left = ((tmp.x + 1) / 2 * w) + 'px';
      r.lab.style.top = ((1 - tmp.y) / 2 * h) + 'px';
      r.lab.classList.toggle('hot', hot === 1);
    });

    // hub follows the clicked robot, else whichever robot is working
    const busy = focusedDesk >= 0 && performance.now() < focusUntil ? robots[focusedDesk] : robots.find(r => r.state === 'work');
    if (busy) hubTarget.set(busy.g.position.x, 3.6, busy.g.position.z);
    hub.position.lerp(hubTarget, 0.035);
    hub.position.y += Math.sin(t * 2) * 0.004;
    hubCore.rotation.y += dt * 1.4; hubCore.rotation.x = Math.sin(t) * 0.4;
    hubInner.rotation.y -= dt * 2.2;
    netNodes.forEach((n, i) => {
      n.a += n.s * dt;
      n.m.position.set(hub.position.x + Math.cos(n.a) * n.r, hub.position.y + Math.sin(n.e + t * 0.5) * 0.9, hub.position.z + Math.sin(n.a) * n.r * 0.8);
      const k = i * 12, hp = hub.position, np = n.m.position;
      const mx = (hp.x + np.x) / 2 + 0.25, my = (hp.y + np.y) / 2 + 0.3, mz = (hp.z + np.z) / 2;
      netPos.set([hp.x, hp.y, hp.z, mx, my, mz, mx, my, mz, np.x, np.y, np.z], k);
    });
    netGeo.attributes.position.needsUpdate = true;
    netLines.material.opacity = 0.45 + Math.sin(t * 3) * 0.2;

    screenFlash *= 0.92;

    // props
    leds.forEach(l => { l.visible = Math.sin(t * 3 + l.userData.p * 7) > -0.3; });
    dishHead.rotation.y = Math.sin(t * 0.3) * 0.6;
    globe.rotation.y += dt * 0.4;
    flame.scale.y = 0.8 + Math.random() * 0.4; flame.material.opacity = 0.4 + Math.random() * 0.3;
    body.position.y = 2.6 + Math.sin(t) * 0.02;
    plants.forEach(p => { p.rotation.z = Math.sin(t * 0.8 + p.userData.sway) * 0.02; });
    lampL.intensity = 0.85 + Math.sin(t * 13) * 0.03;
    const dp = dustGeo.attributes.position.array;
    for (let i = 1; i < dp.length; i += 3) { dp[i] += dt * 0.12; if (dp[i] > RH) dp[i] = 0; }
    dustGeo.attributes.position.needsUpdate = true;
    screenGlow.intensity = 1.4 + Math.sin(t * 2) * 0.2 + screenFlash * 2.2;

    if (heroVisible) composer ? composer.render() : renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  // Read-only handle for debugging the room from the console.
  window.crawlcaRoom = { robots, scene, camera, frames: () => frameCount };
  requestAnimationFrame(tick);
})();
