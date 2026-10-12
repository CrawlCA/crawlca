(() => {
  'use strict';
  const routeButtons = [...document.querySelectorAll('[data-review-route]')];
  const routeCopies = [...document.querySelectorAll('[data-route-copy]')];
  const routeMap = document.querySelector('#jev-routing svg');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const controllers = new Map();
  let expanded = null;
  let frame = null;
  const stepDuration = 2600;
  const travelDuration = 1600;
  const svgNS = 'http://www.w3.org/2000/svg';
  function svgElement(tag, attributes, parent) {
    const element = document.createElementNS(svgNS, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    parent?.append(element);
    return element;
  }
  const step = (nodes, edges, text) => ({ nodes, edges, text });
  const stories = {
    'system-architecture': () => [
      step([0, 1], [0], 'Collect source observations.'),
      step([1, 2], [1], 'Resolve chain and contract address.'),
      step([2, 3], [2], 'Retain a usable snapshot.'),
      step([3, 4, 6], [3, 5], 'Read and review advance independently.'),
      step([4, 5, 6, 7], [4, 6], 'Serve the product while review runs.'),
      step([7, 8], [7], 'Validate the review decision.'),
      step([8, 4], [8], 'Expose retained review context.'),
      step([4, 5], [4], 'Read observations and review context.')
    ],
    'evidence-pipeline': () => [
      step([0, 4], [3], 'Collect with source checkpoints.'),
      step([0, 1, 5], [0, 4], 'Normalize without guessing unknown fields.'),
      step([1, 2, 6], [1, 5], 'Resolve identity with provenance.'),
      step([2, 3, 7], [2, 6], 'Publish with explicit freshness.')
    ],
    'jev-routing': () => {
      const choice = routeMap?.dataset.selectedRoute || 'inspect';
      const branch = ['inspect', 'watch', 'defer'].indexOf(choice);
      return [
        step([0], [], 'Describe the collection evidence.'),
        step([0, 1], [0], 'Define a bounded review question.'),
        step([1, 2], [1], 'Evaluate the typed decision space.'),
        step([2, branch + 3], [branch + 2], `Explore the ${choice.toUpperCase()} review route.`)
      ];
    },
    'review-sequence': () => [
      step([0, 1], [0], 'Commit a completed collection.'),
      step([1, 2], [1], 'Read an eligible snapshot.'),
      step([2, 3], [2], 'Submit the review question.'),
      step([2, 3], [3], 'Receive a typed response.'),
      step([2], [], 'Validate and retain the result.'),
      step([4, 2], [4], 'Independently read retained review status.'),
      step([2, 4], [5], 'Return the latest available context.')
    ]
  };

  // A single clock serves only visible diagrams; the walkthrough never calls an API.
  function active(controller) {
    return controller.playing && !motionPreference.matches && !document.hidden &&
      (expanded ? expanded.controller === controller : controller.visible);
  }
  function schedule() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    for (const controller of controllers.values()) controller.lastTime = null;
    if ([...controllers.values()].some(active)) frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = null;
    for (const controller of controllers.values()) {
      if (!active(controller)) continue;
      if (controller.lastTime !== null) controller.elapsed += now - controller.lastTime;
      controller.lastTime = now;
      if (controller.elapsed >= stepDuration) {
        if (controller.index < controller.steps.length - 1 || controller.loop) {
          controller.index = (controller.index + 1) % controller.steps.length;
          controller.elapsed = 0;
        } else {
          controller.elapsed = stepDuration;
          controller.playing = false;
          controller.complete = true;
        }
        update(controller);
      }
      draw(controller);
    }
    if ([...controllers.values()].some(active)) frame = requestAnimationFrame(tick);
  }
  function draw(controller) {
    const views = expanded?.controller === controller ? [expanded.view] : [controller.view];
    const current = controller.steps[controller.index];
    const phase = Math.min(1, controller.elapsed / stepDuration);
    const progress = Math.min(1, controller.elapsed / travelDuration);
    const energy = Math.sin(Math.PI * phase);
    const motion = !motionPreference.matches;
    for (const view of views) {
      view.progress.style.transform = `scaleX(${phase})`;
      view.particles.forEach((particle, index) => {
        const visible = motion && current.edges.includes(index);
        particle.group.style.display = visible ? '' : 'none';
        if (!visible) return;
        particle.trace.setAttribute('stroke-dashoffset', String(100 * (1 - progress)));
        particle.trace.style.opacity = String(0.2 + 0.5 * energy);
        const distance = view.lengths[index] * progress;
        const tail = Math.min(85, view.lengths[index] * 0.42);
        const fade = progress < 1 ? 1 : Math.max(0, 1 - (controller.elapsed - travelDuration) / 500);
        particle.comet.style.opacity = String(fade);
        // Geometry is sampled once; frames only interpolate cached points and write attributes.
        particle.dots.forEach((dot, trailIndex) => {
          const behind = tail * trailIndex / (particle.dots.length - 1);
          const point = pointAt(view.samples[index], Math.max(0, distance - behind), view.lengths[index]);
          dot.setAttribute('transform', `translate(${point[0]} ${point[1]})`);
          dot.style.opacity = distance < behind ? '0' : String(Math.pow(1 - trailIndex / particle.dots.length, 1.8));
        });
        const head = pointAt(view.samples[index], distance, view.lengths[index]);
        particle.halo.setAttribute('transform', `translate(${head[0]} ${head[1]})`);
        const arrival = Math.max(0, (controller.elapsed - travelDuration) / (stepDuration - travelDuration));
        particle.arrival.setAttribute('transform', `translate(${particle.end[0]} ${particle.end[1]}) scale(${0.4 + arrival * 2.6})`);
        particle.arrival.style.opacity = arrival > 0 ? String(0.75 * Math.sin(Math.PI * arrival)) : '0';
      });
      view.nodeEffects.forEach((effect, index) => {
        const visible = motion && current.nodes.includes(index);
        effect.group.style.display = visible ? '' : 'none';
        if (!visible) return;
        effect.ring.setAttribute('stroke-dashoffset', String(-phase * 100));
        effect.aura.style.opacity = String(0.12 + energy * 0.42);
        effect.pulse.style.opacity = String(energy * 0.4);
        const expansion = 1 + phase * 0.1;
        effect.pulse.setAttribute('transform', `translate(${effect.cx} ${effect.cy}) scale(${expansion}) translate(${-effect.cx} ${-effect.cy})`);
        if (effect.orbit) {
          effect.orbit.setAttribute('transform', `translate(${effect.cx + Math.cos(phase * Math.PI * 2) * effect.rx} ${effect.cy + Math.sin(phase * Math.PI * 2) * effect.ry})`);
          effect.orbitTrack.style.opacity = String(0.2 + energy * 0.35);
        }
      });
    }
  }
  function pointAt(samples, distance, length) {
    const position = length ? Math.min(1, distance / length) * (samples.length / 2 - 1) : 0;
    const index = Math.min(samples.length / 2 - 2, Math.floor(position));
    const fraction = position - index;
    return [samples[index * 2] + (samples[index * 2 + 2] - samples[index * 2]) * fraction,
      samples[index * 2 + 1] + (samples[index * 2 + 3] - samples[index * 2 + 1]) * fraction];
  }
  function update(controller) {
    const current = controller.steps[controller.index];
    const views = [controller.view];
    if (expanded?.controller === controller) views.push(expanded.view);
    for (const view of views) {
      view.nodes.forEach((node, index) => node.classList.toggle('dg-active', current.nodes.includes(index)));
      view.edges.forEach((edge, index) => edge.classList.toggle('dg-active', current.edges.includes(index)));
      view.svg.dataset.flowStep = String(controller.index + 1);
      view.svg.dataset.flowPlaying = String(controller.playing);
      view.svg.querySelector('.dg-note')?.classList.toggle('dg-active', controller.id === 'review-sequence' && controller.index === 4);
      view.play.disabled = motionPreference.matches;
      view.play.textContent = motionPreference.matches ? 'Motion reduced' : controller.playing ? 'Pause' : controller.complete ? 'Replay' : 'Play';
      view.play.setAttribute('aria-label', motionPreference.matches ? 'Motion reduced; use Next step' : controller.playing ? 'Pause animation' : controller.complete ? 'Replay animation' : 'Play animation');
      view.play.setAttribute('aria-pressed', String(controller.playing));
      view.loop.setAttribute('aria-pressed', String(controller.loop));
      view.loop.textContent = controller.loop ? 'Loop on' : 'Loop';
      view.loop.disabled = motionPreference.matches;
      view.segments.forEach((segment, index) => {
        segment.classList.toggle('is-current', index === controller.index);
        segment.classList.toggle('is-complete', index < controller.index);
      });
      view.copy.setAttribute('aria-live', controller.playing ? 'off' : 'polite');
      view.count.textContent = `${String(controller.index + 1).padStart(2, '0')} / ${String(controller.steps.length).padStart(2, '0')}`;
      view.text.textContent = current.text;
      view.bar.dataset.playing = String(controller.playing);
    }
    draw(controller);
  }
  function restart(controller, playing) {
    controller.index = 0;
    controller.elapsed = 0;
    controller.complete = false;
    controller.playing = playing && !motionPreference.matches;
    update(controller);
    schedule();
  }
  function createView(controller, svg, before) {
    for (const effect of svg.querySelectorAll('[data-flow-particles], [data-flow-nodefx]')) effect.remove();
    const edges = [...svg.querySelectorAll('.dg-edge')];
    const nodes = [...svg.querySelectorAll('.dg-node')];
    const lengths = edges.map(edge => edge.getTotalLength());
    const samples = edges.map((edge, index) => {
      const count = Math.max(2, Math.min(320, Math.ceil(lengths[index] / 3)));
      const points = new Float32Array((count + 1) * 2);
      for (let i = 0; i <= count; i++) {
        const point = edge.getPointAtLength(lengths[index] * i / count);
        points[i * 2] = point.x;
        points[i * 2 + 1] = point.y;
      }
      return points;
    });
    const nodeEffects = nodes.map(node => {
      const rect = node.querySelector('rect');
      const x = Number(rect.getAttribute('x')), y = Number(rect.getAttribute('y'));
      const width = Number(rect.getAttribute('width')), height = Number(rect.getAttribute('height'));
      const cx = x + width / 2, cy = y + height / 2;
      const group = svgElement('g', { 'data-flow-nodefx': '', 'aria-hidden': 'true', class: 'dg-node-fx' });
      node.insertBefore(group, node.querySelector('text'));
      const shape = { x: x - 4, y: y - 4, width: width + 8, height: height + 8, rx: 10 };
      const aura = svgElement('rect', { ...shape, class: 'dg-node-aura' }, group);
      const pulse = svgElement('rect', { ...shape, class: 'dg-node-pulse' }, group);
      const ring = svgElement('rect', { ...shape, pathLength: 100, class: 'dg-node-scan' }, group);
      svgElement('path', { d: `M ${x - 6} ${y + 10} V ${y - 6} H ${x + 10} M ${x + width - 10} ${y - 6} H ${x + width + 6} V ${y + 10} M ${x - 6} ${y + height - 10} V ${y + height + 6} H ${x + 10} M ${x + width - 10} ${y + height + 6} H ${x + width + 6} V ${y + height - 10}`, class: 'dg-node-corners' }, group);
      const isJev = node.querySelector('.dg-title')?.textContent.startsWith('Jev');
      const bounds = svg.viewBox.baseVal;
      const rx = Math.min(width / 2 + 17, cx - bounds.x - 12, bounds.x + bounds.width - cx - 12);
      const ry = Math.min(height / 2 + 22, cy - bounds.y - 12, bounds.y + bounds.height - cy - 12);
      const orbitTrack = isJev ? svgElement('ellipse', { cx, cy, rx, ry, class: 'dg-orbit-track' }, group) : null;
      const orbit = isJev ? svgElement('circle', { r: 3.5, class: 'dg-orbit-dot' }, group) : null;
      return { group, aura, pulse, ring, orbit, orbitTrack, cx, cy, rx, ry };
    });
    const layer = svgElement('g', { 'data-flow-particles': '', 'aria-hidden': 'true', class: 'dg-energy-layer' }, svg);
    const particles = edges.map((edge, index) => {
      const group = svgElement('g', { class: edge.classList.contains('dg-async') || controller.id === 'jev-routing' ? 'dg-energy violet' : 'dg-energy' }, layer);
      const trace = svgElement('path', { d: edge.getAttribute('d'), pathLength: 100, class: 'dg-energy-trace', 'stroke-dasharray': '100 100' }, group);
      const comet = svgElement('g', { class: 'dg-comet' }, group);
      const halo = svgElement('circle', { r: 9, class: 'dg-comet-halo' }, comet);
      const dots = Array.from({ length: 14 }, (_, i) => svgElement('circle', { r: i === 0 ? 3.8 : Math.max(0.8, 3.2 - i * 0.17), class: i === 0 ? 'dg-comet-head' : 'dg-comet-tail' }, comet));
      const arrival = svgElement('circle', { r: 7, class: 'dg-arrival-ring' }, group);
      return { group, trace, comet, halo, dots, arrival, end: pointAt(samples[index], lengths[index], lengths[index]) };
    });
    const bar = document.createElement('div');
    bar.className = 'diagram-playback';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', `${svg.querySelector('title').textContent} walkthrough`);
    bar.innerHTML = '<div class="diagram-playback-controls"><button type="button" data-flow-play>Pause</button><button type="button" data-flow-next>Next step <span aria-hidden="true">→</span></button><button type="button" data-flow-restart>Restart</button><button type="button" data-flow-loop aria-label="Loop animation" aria-pressed="false">Loop</button></div><div class="diagram-step-copy" aria-atomic="true"><span class="diagram-step-count"></span><span class="diagram-step-text"></span></div><div class="diagram-flow-rail" aria-hidden="true"></div><span class="diagram-playback-label">PROCESS WALKTHROUGH</span>';
    const rail = bar.querySelector('.diagram-flow-rail');
    const segments = controller.steps.map(() => { const segment = document.createElement('span'); rail.append(segment); return segment; });
    const progress = document.createElement('i');
    progress.className = 'diagram-flow-progress';
    rail.append(progress);
    before.before(bar);
    const view = { svg, edges, particles, nodeEffects, bar, lengths, samples, nodes, segments, progress,
      play: bar.querySelector('[data-flow-play]'), loop: bar.querySelector('[data-flow-loop]'),
      copy: bar.querySelector('.diagram-step-copy'), count: bar.querySelector('.diagram-step-count'), text: bar.querySelector('.diagram-step-text') };
    view.play.addEventListener('click', () => {
      if (controller.complete) return restart(controller, true);
      controller.playing = !controller.playing && !motionPreference.matches;
      update(controller);
      schedule();
    });
    bar.querySelector('[data-flow-next]').addEventListener('click', () => {
      controller.playing = false;
      controller.complete = false;
      controller.index = (controller.index + 1) % controller.steps.length;
      controller.elapsed = travelDuration;
      update(controller);
      schedule();
    });
    bar.querySelector('[data-flow-restart]').addEventListener('click', () => restart(controller, controller.playing));
    view.loop.addEventListener('click', () => {
      controller.loop = !controller.loop;
      update(controller);
    });
    return view;
  }
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) controllers.get(entry.target.id).visible = entry.isIntersecting;
    schedule();
  }, { threshold: 0.15 }) : null;
  for (const [id, story] of Object.entries(stories)) {
    const figure = document.getElementById(id);
    if (!figure) continue;
    const controller = { id, steps: story(), index: 0, elapsed: 0, lastTime: null, complete: false, loop: false,
      playing: !motionPreference.matches, visible: !observer };
    controller.view = createView(controller, figure.querySelector('svg'), figure.querySelector('figcaption'));
    controllers.set(id, controller);
    update(controller);
    observer?.observe(figure);
  }
  motionPreference.addEventListener('change', () => {
    for (const controller of controllers.values()) {
      controller.playing = false;
      update(controller);
    }
    schedule();
  });
  document.addEventListener('visibilitychange', schedule);
  schedule();
  function selectRoute(choice) {
    if (!['inspect', 'watch', 'defer'].includes(choice)) return;
    for (const button of routeButtons) button.setAttribute('aria-pressed', String(button.dataset.reviewRoute === choice));
    for (const copy of routeCopies) copy.hidden = copy.dataset.routeCopy !== choice;
    if (routeMap) routeMap.dataset.selectedRoute = choice;
    const controller = controllers.get('jev-routing');
    if (controller) {
      controller.steps = stories['jev-routing']();
      restart(controller, controller.playing || controller.complete);
    }
  }
  for (const button of routeButtons) button.addEventListener('click', () => selectRoute(button.dataset.reviewRoute));
  document.querySelector('.route-picker').hidden = false;
  selectRoute('inspect');

  const dialog = document.querySelector('.diagram-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const canvas = dialog.querySelector('.diagram-dialog-canvas');
  const viewport = dialog.querySelector('.diagram-dialog-viewport');
  const label = dialog.querySelector('#diagram-zoom-label');
  let opener = null;
  let scale = 1;
  function zoom(next) {
    scale = Math.max(0.5, Math.min(3, next));
    canvas.style.width = `${scale * 100}%`;
    label.textContent = `${Math.round(scale * 100)}%`;
  }
  for (const button of document.querySelectorAll('[data-diagram-open]')) {
    button.hidden = false;
    button.addEventListener('click', () => {
      const figure = document.getElementById(button.dataset.diagramOpen);
      const source = figure?.querySelector('svg');
      if (!source) return;
      const copy = source.cloneNode(true);
      const ids = new Map();
      for (const node of copy.querySelectorAll('[id]')) {
        ids.set(node.id, `expanded-${node.id}`);
        node.id = ids.get(node.id);
      }
      copy.setAttribute('aria-labelledby', (source.getAttribute('aria-labelledby') || '').split(' ').map(id => ids.get(id) || id).join(' '));
      for (const node of copy.querySelectorAll('[marker-end]')) {
        const id = node.getAttribute('marker-end').match(/^url\(#(.+)\)$/)?.[1];
        if (ids.has(id)) node.setAttribute('marker-end', `url(#${ids.get(id)})`);
      }
      canvas.replaceChildren(copy);
      dialog.querySelector('#diagram-dialog-title').textContent = figure.querySelector('h3').textContent;
      opener = button;
      zoom(1);
      viewport.scrollTop = viewport.scrollLeft = 0;
      dialog.showModal();
      const controller = controllers.get(figure.id);
      if (controller) {
        expanded = { controller, view: createView(controller, copy, viewport) };
        update(controller);
        schedule();
      }
    });
  }
  dialog.querySelector('[data-diagram-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (expanded) {
      const controller = expanded.controller;
      expanded.view.bar.remove();
      expanded = null;
      update(controller);
      schedule();
    }
    opener?.focus();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  for (const button of dialog.querySelectorAll('[data-zoom]')) button.addEventListener('click', () => {
    zoom(button.dataset.zoom === 'reset' ? 1 : scale + (button.dataset.zoom === 'in' ? 0.25 : -0.25));
  });
})();
