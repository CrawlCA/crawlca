/* CrawlCA Mission Room: a local Blender GLB rendered with Three.js.
 * The canvas is deliberately separate from mission-scene.js so the existing
 * telemetry overlay and fallback scene stay intact when WebGL is unavailable. */
(() => {
  'use strict';
  const viewport = document.getElementById('missionViewport');
  const overlay = document.getElementById('missionScene');
  if (!viewport || !window.THREE || !window.THREE.GLTFLoader) return;

  const THREE = window.THREE;
  const glCanvas = document.createElement('canvas');
  glCanvas.id = 'missionWebGL';
  glCanvas.setAttribute('aria-label', 'Interactive Blender rendered CrawlCA command room');
  Object.assign(glCanvas.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    display: 'block', zIndex: '0', touchAction: 'none'
  });
  viewport.insertBefore(glCanvas, viewport.firstChild);
  // The old canvas remains a valuable data-flow layer. Screen blending makes
  // its dark clear color transparent over the Blender model.
  if (overlay) {
    overlay.style.position = 'relative';
    overlay.style.zIndex = '1';
    overlay.style.mixBlendMode = 'screen';
    overlay.style.pointerEvents = 'none';
  }
  viewport.classList.add('mission-glb-active');
  window.crawlcaThreeActive = true;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (error) {
    window.crawlcaThreeActive = false;
    glCanvas.remove();
    if (overlay) { overlay.style.mixBlendMode = ''; overlay.style.pointerEvents = ''; }
    return;
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x030711, 1);
  if ('outputEncoding' in renderer && THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
  if ('toneMapping' in renderer && THREE.ACESFilmicToneMapping) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030711);
  scene.fog = new THREE.FogExp2(0x030711, 0.008);
  const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 100);
  camera.position.set(15.8, -18.6, 13.8);
  const controls = THREE.OrbitControls ? new THREE.OrbitControls(camera, glCanvas) : null;
  if (controls) {
    controls.target.set(0, 2.4, 2.2);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 10;
    controls.maxDistance = 34;
    controls.minPolarAngle = 0.62;
    controls.maxPolarAngle = 1.46;
    controls.update();
  } else camera.lookAt(0, 2.4, 2.2);

  // Deep key/fill/rim lights keep the imported materials readable in browsers.
  scene.add(new THREE.HemisphereLight(0x2c66a8, 0x040812, 1.55));
  const key = new THREE.DirectionalLight(0x5ab9ff, 3.2); key.position.set(-5, -8, 18); scene.add(key);
  const magenta = new THREE.PointLight(0xff238d, 8, 24); magenta.position.set(-8, -1, 7); scene.add(magenta);
  const green = new THREE.PointLight(0x39ffc5, 6, 19); green.position.set(6, 1, 7); scene.add(green);

  const signals = new THREE.Group(); signals.name = 'live source signals'; scene.add(signals);
  const packetGroup = new THREE.Group(); packetGroup.name = 'crawl packets'; scene.add(packetGroup);
  const sourceDots = [];
  const packets = [];
  const sourceNames = ['Pump.fun','Moonshot','Raydium','Meteora','Aerodrome','Uniswap','GMGN partner','GMGN official','Four.meme','Flap.sh','Robinhood launchpad','Robinhood Uniswap'];
  const sourceColors = [0xff4da6,0xff4da6,0x67d9ff,0x67d9ff,0x67d9ff,0x67d9ff,0xf5c96a,0xf5c96a,0xff4da6,0xff4da6,0xff4da6,0x67d9ff];
  const routePoints = [];
  const nodeMaterial = (color, opacity=1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });
  const routeMaterial = (color) => new THREE.LineBasicMaterial({ color, transparent: true, opacity: .44, blending: THREE.AdditiveBlending, depthWrite: false });
  const packetGeo = new THREE.SphereGeometry(.10, 8, 8);
  const nodeGeo = new THREE.IcosahedronGeometry(.20, 1);
  const ringGeo = new THREE.TorusGeometry(0.48, .012, 6, 32);

  // Holographic radial routes sit around the physical room and carry live API
  // packets, making the data stream legible while the operator desks remain GLB geometry.
  for (let i = 0; i < sourceNames.length; i += 1) {
    const angle = i / sourceNames.length * Math.PI * 2 - Math.PI / 2;
    const p = new THREE.Vector3(Math.cos(angle) * 7.0, 0.55 + (i % 3) * .65, Math.sin(angle) * 5.2 + 1.7);
    routePoints.push(p);
    const color = sourceColors[i];
    const route = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 2.15, 1.5), p]), routeMaterial(color));
    route.userData.source = sourceNames[i];
    signals.add(route);
    const dot = new THREE.Mesh(nodeGeo, nodeMaterial(color, .92)); dot.position.copy(p); dot.userData.source = sourceNames[i]; dot.userData.base = .86; signals.add(dot); sourceDots.push(dot);
    const ring = new THREE.Mesh(ringGeo, nodeMaterial(color, .5)); ring.rotation.x = Math.PI / 2; ring.position.copy(p); ring.userData.phase = i * .62; signals.add(ring);
    const packet = new THREE.Mesh(packetGeo, nodeMaterial(0x69f0b2, .95)); packet.userData.sourceIndex = i; packetGroup.add(packet); packets.push(packet);
  }
  // Queen orb and orbiting nodes anchor the 3D data topology.
  const queen = new THREE.Mesh(new THREE.IcosahedronGeometry(.65, 2), new THREE.MeshStandardMaterial({ color: 0x102c39, emissive: 0x05617a, emissiveIntensity: 2.2, metalness: .8, roughness: .22 }));
  queen.position.set(0, 2.15, 1.5); signals.add(queen);
  const queenRing = new THREE.Mesh(new THREE.TorusGeometry(1.0, .025, 8, 64), new THREE.MeshBasicMaterial({ color: 0x67d9ff, transparent: true, opacity: .8, blending: THREE.AdditiveBlending }));
  queenRing.rotation.x = Math.PI / 2; queenRing.position.copy(queen.position); signals.add(queenRing);

  let root = null;
  let mixer = null;
  const clock = new THREE.Clock();
  const loader = new THREE.GLTFLoader();
  loader.load('assets/mission-room.glb', gltf => {
    root = gltf.scene;
    root.traverse(object => {
      if (object.isMesh) {
        object.castShadow = false;
        object.receiveShadow = true;
        if (object.material && object.material.emissive) object.material.emissiveIntensity = Math.min(6, object.material.emissiveIntensity || 1);
      }
    });
    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(center);
    root.position.y -= .2;
    scene.add(root);
    if (gltf.animations && gltf.animations.length) {
      mixer = new THREE.AnimationMixer(root);
      gltf.animations.forEach(clip => mixer.clipAction(clip).play());
    }
    const loading = document.getElementById('missionRotation');
    if (loading && loading.textContent === 'interactive') loading.textContent = 'GLB · interactive';
  }, undefined, error => {
    console.warn('[crawlca] Blender GLB unavailable, retaining data overlay', error);
    window.crawlcaThreeActive = false;
    glCanvas.remove();
    if (overlay) { overlay.style.mixBlendMode = ''; overlay.style.pointerEvents = ''; }
  });

  let liveState = window.crawlcaState || { sources: [], tokens: [] };
  window.addEventListener('crawlcaState', event => { if (event.detail && typeof event.detail === 'object') liveState = { ...liveState, ...event.detail }; });
  const stateFor = name => (Array.isArray(liveState.sources) ? liveState.sources.find(source => source && source.name === name) : null) || {};

  function resize() {
    const rect = viewport.getBoundingClientRect();
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // Raycasting the imported room and signal nodes gives the scene a proper 3D
  // interaction target; source clicks feed the existing preview drawer.
  const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
  glCanvas.addEventListener('click', event => {
    const rect = glCanvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(sourceDots, false);
    if (hits.length && hits[0].object.userData.source) {
      const source = stateFor(hits[0].object.userData.source);
      window.dispatchEvent(new CustomEvent('crawlcaPlatformSelect', { detail: { name: hits[0].object.userData.source, ...source } }));
    }
  });
  const reset = document.getElementById('missionReset');
  if (reset) reset.addEventListener('click', () => {
    if (!controls) return;
    controls.target.set(0, 2.4, 2.2); camera.position.set(15.8, -18.6, 13.8); controls.update();
  });

  function frame() {
    const elapsed = clock.getElapsedTime();
    if (mixer) mixer.update(clock.getDelta());
    // Slow orbit keeps the rendered command room alive even when untouched.
    queen.rotation.y = elapsed * .35; queenRing.rotation.z = elapsed * .28;
    sourceDots.forEach((dot, index) => {
      const source = stateFor(sourceNames[index]);
      const active = source.status === 'online' || source.status === 'crawling';
      const pulse = 0.82 + Math.sin(elapsed * 3.2 + index) * .16;
      dot.scale.setScalar(active ? 1.0 + pulse * .26 : .72);
      dot.material.opacity = active ? .9 : .28;
      const ring = signals.children[index * 3 + 2];
      if (ring) { ring.rotation.z = elapsed * .45 + ring.userData.phase; ring.material.opacity = active ? .5 + pulse * .18 : .12; }
      const packet = packets[index];
      const t = (elapsed * (.09 + index * .002) + index * .137) % 1;
      packet.position.lerpVectors(queen.position, routePoints[index], t);
      packet.visible = active || !Array.isArray(liveState.sources) || !liveState.sources.length;
      packet.scale.setScalar(active ? 1 + pulse * .32 : .55);
    });
    if (controls) controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
  window.crawlcaMissionThree = { scene, camera, controls, renderer, root };
})();
