/* Shared navigation and data help; no provider requests or collection jobs. */
(() => {
  'use strict';
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const apiPort = Number(new URLSearchParams(location.search).get('api'));
  for (const link of document.querySelectorAll('[data-nav]')) {
    const href = local && link.dataset.nav === 'home' ? 'room.html' : link.getAttribute('href');
    const url = new URL(href, location.href);
    if (local && Number.isInteger(apiPort) && apiPort >= 1 && apiPort <= 65535) url.searchParams.set('api', String(apiPort));
    link.href = url.href;
  }

  // Native details keeps Resources operable with mouse, touch, or keyboard,
  // including when this enhancement script has not loaded.
  const resources = [...document.querySelectorAll('.nav-resources')];
  const closeResources = () => { for (const menu of resources) menu.open = false; };
  for (const menu of resources) {
    menu.dataset.current = String(!!menu.querySelector('[aria-current="page"]'));
    menu.addEventListener('toggle', () => {
      if (menu.open) for (const other of resources) if (other !== menu) other.open = false;
    });
    menu.addEventListener('focusout', event => {
      if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false;
    });
    menu.addEventListener('click', event => {
      if (event.target.closest('a')) menu.open = false;
    });
  }
  document.addEventListener('click', event => {
    for (const menu of resources) if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const focused = resources.find(menu => menu.open && menu.contains(document.activeElement));
    if (resources.some(menu => menu.open)) {
      closeResources();
      if (focused) { event.preventDefault(); focused.querySelector('summary').focus(); }
    }
  });

  const dialog = document.createElement('dialog');
  dialog.className = 'site-help';
  dialog.setAttribute('aria-labelledby', 'site-help-title');
  dialog.innerHTML = `<div class="site-help-heading"><h2 id="site-help-title">Using CRAWLCA</h2><button type="button" data-help-close autofocus>Close ×</button></div>
    <h3>Room · Explorer · Sources</h3><p>Room shows the swarm and the current snapshot. Explorer lets you search, filter and inspect contracts. Sources shows collection health, events and the evidence behind each feed.</p>
    <h3>Source snapshots</h3><p>Explorer loads up to 500 records from sampled source feeds, not a complete blockchain index. Refresh snapshot reloads saved server data. Collection runs automatically on the server.</p>
    <h3>Live, cached and unknown</h3><p>Cached records retain an older source response. A connected API does not mean every source is current. Missing metrics remain —, and source timestamps help you judge freshness.</p>
    <h3>Activity and risk</h3><p>Activity scores use market rules, not AI analysis or a contract audit. Flagged means a provider supplied a warning. Unassessed means no verified assessment is available; it does not mean safe.</p>
    <h3>Your watchlist</h3><p>Watchlist entries and their last known snapshots are saved in this browser. They do not sync across devices and are removed if browser storage is cleared.</p>
    <h3>Resources</h3><p>Technology explains the collection, evidence and decision workflow behind CrawlCA. Open Resources to find it from any page.</p>
    <h3>Keyboard</h3><p>Use Enter or Space to open Resources, then Tab through its links. Escape closes the menu and returns focus to Resources. In Explorer, press / to focus search. Escape also closes a contract inspector or this help dialog.</p>`;
  document.body.appendChild(dialog);
  let helpReturnFocus = null;
  dialog.addEventListener('close', () => { helpReturnFocus?.focus(); helpReturnFocus = null; });
  dialog.querySelector('[data-help-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  for (const button of document.querySelectorAll('[data-help]')) {
    button.addEventListener('click', () => {
      if (dialog.open) return;
      helpReturnFocus = button.closest('.nav-resources')?.querySelector('summary') || button;
      closeResources(); dialog.showModal();
    });
  }
})();
