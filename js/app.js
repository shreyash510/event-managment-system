/* App shell: state, roles, venue filter, routing. Views plug in with App.route(). */
(function () {
  'use strict';
  const KEY = 'events-admin-demo-v1';
  const VENUE_KEY = KEY + '-venue';
  const routes = Object.create(null);   /* no inherited keys, so #/constructor is just an unknown page */
  const NAV = [
    { key: 'today', label: 'Today', perm: 'today' },
    { key: 'events', label: 'Events', perm: 'events.view' },
    { key: 'bookings', label: 'Bookings', perm: 'bookings.view' },
    { key: 'checkin', label: 'Check-in', perm: 'checkin' },
    { key: 'codes', label: 'Discount codes', perm: 'codes.view' },
    { key: 'partners', label: 'Partners', perm: 'partners.view' },
    { key: 'reports', label: 'Reports', perm: 'reports' },
    { key: 'settings', label: 'Settings', perm: 'settings' }
  ];
  const PHONE_BAR = ['today', 'checkin'];   /* always one tap away on a phone; the rest sit under More */
  const ICONS = {
    today: '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/>',
    checkin: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    more: '<path d="M4 7h16M4 12h16M4 17h16"/>'
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

  const readStore = () => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      /* Anything that does not look like our data is thrown away rather than crashing the page. */
      return s && Array.isArray(s.users) && s.users.length && Array.isArray(s.venues) && Array.isArray(s.events) && Array.isArray(s.bookings) ? s : null;
    } catch (e) { return null; }
  };
  const readVenue = () => { try { return localStorage.getItem(VENUE_KEY) || ''; } catch (e) { return ''; } };
  const writeVenue = (id) => { try { if (id) localStorage.setItem(VENUE_KEY, id); else localStorage.removeItem(VENUE_KEY); } catch (e) { /* keeps working in memory */ } };

  const App = { state: null, venueChoice: '' };
  App.save = () => { try { localStorage.setItem(KEY, JSON.stringify(App.state)); } catch (e) { /* keeps working in memory */ } };
  App.now = () => new Date();
  /* Falls back to the first user, so removing the signed-in user in Settings cannot break the page. */
  App.user = () => App.state.users.find((u) => u.id === App.state.currentUserId) || App.state.users[0];
  App.role = () => App.user().role;
  App.can = (perm) => Core.can(App.role(), perm);
  /* Venue in view: a marketing user can pick one or all (''), everyone else is fixed to their own. */
  App.venueId = () => (Core.allVenues(App.user()) ? App.venueChoice : App.user().venueId);
  App.inVenue = (venueId) => !App.venueId() || App.venueId() === venueId;
  App.visibleEvents = () => App.state.events.filter((e) => App.inVenue(e.venueId));
  App.visibleBookings = () => App.state.bookings.filter((b) => { const e = Core.findEvent(App.state, b.eventId); return e && App.inVenue(e.venueId); });
  App.log = (type, text) => Core.audit(App.state, { at: App.now(), by: App.user().name, type, text });
  App.route = (key, def) => { routes[key] = def; };   /* def: { title, perm, render(mainEl, params) } */
  App.go = (hash) => { if (location.hash === hash) App.render(); else location.hash = hash; };

  const homeKey = () => { const n = NAV.find((x) => App.can(x.perm)); return n ? n.key : 'today'; };
  const labelOf = (key) => { const n = NAV.find((x) => x.key === key); return n ? n.label : key; };
  const parseHash = () => {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch (e) { return p; } });
    return { key: parts[0] || homeKey(), params: parts.slice(1) };
  };
  const allowed = (key) => {
    const nav = NAV.find((n) => n.key === key), route = routes[key];
    return (!nav || App.can(nav.perm)) && (!route || !route.perm || App.can(route.perm));
  };
  /* The first page this role can open. */
  App.home = () => '#/' + homeKey();

  /* Choosing a venue: stays between screens and after a reload. */
  App.setVenue = (id) => {
    App.venueChoice = App.state.venues.some((v) => v.id === id) ? id : '';
    writeVenue(App.venueChoice);
    /* A record open on screen may not belong to the new venue, so go back to that area's list. */
    const { key, params } = parseHash();
    if (params.length) App.go('#/' + key); else App.render();
  };
  /* Switching role: stay in the same area if this role may use it, otherwise go to a page it can open. */
  function switchUser(id) {
    App.state.currentUserId = id;
    App.save();
    const { key } = parseHash();
    const known = NAV.some((n) => n.key === key) || routes[key];
    App.go(known && allowed(key) ? '#/' + key : App.home());
    UI.toast(`Now signed in as ${userLabel(App.user())}`);
  }
  App.reset = () => { App.state = Seed.build(new Date()); App.venueChoice = ''; writeVenue(''); App.save(); App.go(App.home()); };
  function confirmReset() {
    UI.dialog({
      title: 'Reset demo data?', body: '<p>This removes every change you made and puts the made-up data back.</p>',
      actions: [{ label: 'Keep my changes', kind: 'ghost' }, { label: 'Reset', kind: 'danger', onClick: () => App.reset() }]
    });
  }
  function userLabel(x) {
    const v = x.venueId ? Core.findVenue(App.state, x.venueId) : null;
    return `${Core.ROLE_NAMES[x.role] || x.role}${v ? ' · ' + v.name : ''}`;
  }
  const userOptions = () => UI.options(App.state.users.map((x) => ({ value: x.id, label: userLabel(x) })), App.user().id);

  /* Only touch the shell's HTML when it changed, so focus stays put on a re-render. */
  const painted = {};
  function paintOnce(id, html) {
    if (painted[id] === html) return;
    painted[id] = html;
    document.getElementById(id).innerHTML = html;
  }
  function renderNav(active) {
    const items = NAV.filter((n) => App.can(n.perm));
    paintOnce('nav', items.map((n) =>
      `<a href="#/${n.key}" data-key="${n.key}"${n.key === active ? ' aria-current="page"' : ''}>${UI.esc(n.label)}</a>`).join(''));
    /* Phone: Today and Check-in, then More for the rest. */
    const bar = items.filter((n) => PHONE_BAR.includes(n.key));
    const rest = items.filter((n) => !PHONE_BAR.includes(n.key));
    const restActive = rest.find((n) => n.key === active);
    paintOnce('bottombar', bar.map((n) =>
      `<a href="#/${n.key}" data-key="${n.key}"${n.key === active ? ' aria-current="page"' : ''}>${icon(n.key)}<span>${UI.esc(n.label)}</span></a>`).join('') +
      `<button type="button" id="more-button" class="${restActive ? 'is-active' : ''}" aria-haspopup="dialog">${icon('more')}<span>More</span>${restActive ? `<span class="sr-only">, now on ${UI.esc(restActive.label)}</span>` : ''}</button>`);
  }
  function renderTopbar() {
    const u = App.user(), all = Core.allVenues(u);
    const venueOpts = [{ value: '', label: 'All venues' }].concat(App.state.venues.map((v) => ({ value: v.id, label: v.name })));
    const own = Core.findVenue(App.state, u.venueId);
    paintOnce('topbar', `
      <div class="topbar-venue">${all
        ? `<label><span class="topbar-label">Venue</span> <select id="venue-switch">${UI.options(venueOpts, App.venueChoice)}</select></label>`
        : `<span class="venue-fixed">${UI.esc(own ? own.name : '')}</span>`}</div>
      <div class="topbar-phone-role"><span class="muted">${UI.esc(Core.ROLE_NAMES[u.role] || '')}</span><span class="brand-tag">Demo</span></div>
      <div class="topbar-user"><label><span class="topbar-label">Signed in as</span> <select id="user-switch">${userOptions()}</select></label>
      <button type="button" class="btn btn-ghost btn-small" id="reset-demo">Reset demo data</button></div>`);
  }

  /* The More menu on a phone: the other pages, plus the role switcher and reset. */
  let moreSheet = null;
  function closeMore() { if (moreSheet) { const d = moreSheet; moreSheet = null; if (d.open) d.close(); d.remove(); } }
  function openMore() {
    const { key } = parseHash();
    const d = document.createElement('dialog');
    d.className = 'more-sheet';
    d.setAttribute('aria-labelledby', 'more-title');
    d.innerHTML = `<div class="more-inner">
      <div class="more-head"><h2 id="more-title">More</h2><button type="button" class="btn btn-ghost btn-small" data-more="close">Close</button></div>
      <nav class="more-links" aria-label="More pages">${NAV.filter((n) => App.can(n.perm) && !PHONE_BAR.includes(n.key)).map((n) =>
        `<a href="#/${n.key}"${n.key === key ? ' aria-current="page"' : ''}>${UI.esc(n.label)}</a>`).join('')}</nav>
      <div class="more-foot">
        <label class="field"><span>Signed in as</span><select id="user-switch-more">${userOptions()}</select></label>
        <button type="button" class="btn btn-ghost" data-more="reset">Reset demo data</button>
      </div></div>`;
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.closest('[data-more="close"]') || e.target.closest('a')) closeMore();
      else if (e.target.closest('[data-more="reset"]')) { closeMore(); confirmReset(); }
    });
    d.addEventListener('change', (e) => { if (e.target.id === 'user-switch-more') { closeMore(); switchUser(e.target.value); } });
    d.addEventListener('cancel', (e) => { e.preventDefault(); closeMore(); });
    document.body.appendChild(d);
    moreSheet = d;
    d.showModal();
    d.querySelector('[data-more="close"]').focus();
  }

  function message(main, text) {
    const home = homeKey();
    main.innerHTML = `<div class="empty"><p>${UI.esc(text)}</p><a class="btn btn-primary" href="#/${home}">Go to ${UI.esc(labelOf(home))}</a></div>`;
  }
  /* Draws the screen and returns the title for the browser tab. */
  function paintMain(main, key, params) {
    const nav = NAV.find((n) => n.key === key), route = routes[key];
    if ((nav || route) && !allowed(key)) { message(main, 'Your role does not have access to this area.'); return 'No access'; }
    if (!route) { message(main, nav ? 'This page is not available yet.' : 'We could not find that page.'); return 'Page not found'; }
    try { main.innerHTML = ''; route.render(main, params); }
    catch (err) { console.error(err); main.innerHTML = `<div class="empty">Something went wrong on this page: ${UI.esc(err.message)}</div>`; }
    return route.title || 'Events';
  }
  let lastHash = null;
  App.render = () => {
    closeMore();
    const main = document.getElementById('main');
    const hash = location.hash, firstPaint = lastHash === null, sameScreen = hash === lastHash;
    lastHash = hash;
    /* A view re-rendering itself (say, after a check-in tap) must not jump the page or lose the keyboard's place. */
    const y = window.scrollY, active = document.activeElement;
    const focusWasInMain = sameScreen && active && active !== main && main.contains(active);
    const focusKey = focusWasInMain ? UI.focusKey(active) : null;
    const { key, params } = parseHash();
    renderNav(key); renderTopbar();
    document.title = `${paintMain(main, key, params)} · Events Admin`;
    if (sameScreen) {
      window.scrollTo(0, y);
      if (focusWasInMain && !main.contains(document.activeElement)) UI.refocus(focusKey);
    } else {
      window.scrollTo(0, 0);
      /* New screen: move the keyboard and screen readers to it, unless the view already chose a field. */
      if (!firstPaint && !main.contains(document.activeElement)) main.focus({ preventScroll: true });
    }
  };
  App.start = () => {
    App.state = readStore() || Seed.build(new Date());
    App.venueChoice = readVenue();
    if (!App.state.venues.some((v) => v.id === App.venueChoice)) App.venueChoice = '';
    App.save();
    /* Shell controls are handled once here, because their HTML is redrawn. */
    const topbar = document.getElementById('topbar');
    topbar.addEventListener('change', (e) => {
      if (e.target.id === 'venue-switch') App.setVenue(e.target.value);
      else if (e.target.id === 'user-switch') switchUser(e.target.value);
    });
    topbar.addEventListener('click', (e) => { if (e.target.closest('#reset-demo')) confirmReset(); });
    document.getElementById('bottombar').addEventListener('click', (e) => { if (e.target.closest('#more-button')) openMore(); });
    /* The skip link must not change the hash, or the router would read "#main" as a page. */
    document.querySelector('.skip-link').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('main').focus(); });
    if (window.matchMedia) window.matchMedia('(min-width:761px)').addEventListener('change', (e) => { if (e.matches) closeMore(); });
    window.addEventListener('hashchange', App.render);
    App.render();
  };
  window.App = App;
})();
