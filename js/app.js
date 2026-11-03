/* App shell: state, roles, venue filter, routing. Views plug in with App.route(). */
(function () {
  'use strict';
  const KEY = 'events-admin-demo-v1';
  const VENUE_KEY = KEY + '-venue';
  const routes = Object.create(null);   /* no inherited keys, so #/constructor is just an unknown page */
  const NAV = [
    { key: 'browse', label: 'Find events', perm: 'browse' },
    { key: 'mytickets', label: 'My tickets', perm: 'mytickets' },
    { key: 'today', label: 'Today', perm: 'today' },
    { key: 'events', label: 'Events', perm: 'events.view' },
    { key: 'bookings', label: 'Bookings', perm: 'bookings.view' },
    { key: 'checkin', label: 'Check-in', perm: 'checkin' },
    { key: 'codes', label: 'Discount codes', perm: 'codes.view' },
    { key: 'partners', label: 'Partners', perm: 'partners.view' },
    { key: 'reports', label: 'Reports', perm: 'reports' },
    { key: 'settings', label: 'Settings', perm: 'settings' }
  ];
  const PHONE_BAR = ['browse', 'mytickets', 'today', 'checkin'];   /* always one tap away on a phone; the rest sit under More */
  const ICONS = {
    browse: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    mytickets: '<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M14 6v2.5M14 11v2M14 15.5V18"/>',
    today: '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/>',
    checkin: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    events: '<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M14 6v2.5M14 11v2M14 15.5V18"/>',
    bookings: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9 12h6M9 16h4"/>',
    codes: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1"/>',
    partners: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14c2 .7 3.5 2.7 3.5 6"/>',
    reports: '<path d="M4 4v16h16M8 16v-5M12 16V8M16 16v-3"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    more: '<path d="M4 7h16M4 12h16M4 17h16"/>'
  };
  const icon = (name, size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

  const readStore = () => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      /* Anything that does not look like our data is thrown away rather than crashing the page. */
      /* Data saved before the three roles (admin, club manager, customer) used other role names, so it is replaced. */
      return s && Array.isArray(s.users) && s.users.length && s.users.every((u) => Core.ROLES.includes(u.role)) && s.users.some((u) => u.role === 'admin') && Array.isArray(s.venues) && Array.isArray(s.events) && Array.isArray(s.bookings) ? s : null;
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
  /* Venue in view: an admin or customer can pick one or all (''), a club manager is fixed to their own. */
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
  /* Theme: follows the system until the person picks one. */
  const THEME_KEY = 'events-admin-theme';
  const isDark = () => {
    const t = document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  };
  function toggleTheme() {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* keeps working for this visit */ }
    renderTopbar();
    UI.toast(`${next === 'dark' ? 'Dark' : 'Light'} theme on`);
  }
  const themeButton = (cls) => `<button type="button" class="${cls}" id="theme-toggle" aria-label="Switch to ${isDark() ? 'light' : 'dark'} theme" title="Switch to ${isDark() ? 'light' : 'dark'} theme">${icon(isDark() ? 'sun' : 'moon', 18)}</button>`;
  const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
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
      `<a href="#/${n.key}" data-key="${n.key}"${n.key === active ? ' aria-current="page"' : ''} title="${UI.esc(n.label)}">${icon(n.key, 20)}<span class="nav-label">${UI.esc(n.label)}</span></a>`).join(''));
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
      <div class="topbar-user"><span class="avatar" aria-hidden="true">${UI.esc(initials(u.name))}</span><label><span class="topbar-label">Signed in as</span> <select id="user-switch">${userOptions()}</select></label>
      <button type="button" class="btn btn-ghost btn-small" id="reset-demo">Reset demo data</button>${themeButton('icon-btn')}</div>`);
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
        `<a href="#/${n.key}"${n.key === key ? ' aria-current="page"' : ''}>${icon(n.key, 20)}<span>${UI.esc(n.label)}</span></a>`).join('')}</nav>
      <div class="more-foot">
        <label class="field"><span>Signed in as</span><select id="user-switch-more">${userOptions()}</select></label>
        <button type="button" class="btn" data-more="theme">${icon(isDark() ? 'sun' : 'moon', 18)}&nbsp;${isDark() ? 'Light' : 'Dark'} theme</button>
        <button type="button" class="btn btn-ghost" data-more="reset">Reset demo data</button>
      </div></div>`;
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.closest('[data-more="close"]') || e.target.closest('a')) closeMore();
      else if (e.target.closest('[data-more="reset"]')) { closeMore(); confirmReset(); }
      else if (e.target.closest('[data-more="theme"]')) { closeMore(); toggleTheme(); }
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
  /* Forms open in a modal over the list they came from. A view draws that list into #main, then calls
     App.modal({ title, back }) and draws its form into the element it returns. Close and Esc go to `back`.
     The modal belongs to the current hash: every render closes it, and the route opens it again if still needed. */
  let routeModal = null, openerKey = null;
  function closeRouteModal() { if (routeModal) { const m = routeModal; routeModal = null; m.close(); } }
  App.modal = ({ title, back }) => {
    closeRouteModal();
    routeModal = UI.modal({ title, onCancel: () => App.go(back) });
    routeModal.back = back;
    return routeModal.body;
  };

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
    const wasModal = routeModal, backHash = wasModal ? wasModal.back : null;
    if (!wasModal && active && main.contains(active)) openerKey = UI.focusKey(active);   /* what to focus when the modal closes */
    closeRouteModal();
    const focusWasInMain = sameScreen && active && active !== main && main.contains(active);
    const focusKey = focusWasInMain ? UI.focusKey(active) : null;
    const { key, params } = parseHash();
    renderNav(key); renderTopbar();
    document.title = `${paintMain(main, key, params)} · Events Admin`;
    if (routeModal) {
      window.scrollTo(0, firstPaint ? 0 : y);   /* the list behind a modal stays where it was */
    } else if (wasModal && backHash === hash) {
      window.scrollTo(0, y);
      UI.refocus(openerKey);
    } else if (sameScreen) {
      window.scrollTo(0, y);
      if (focusWasInMain && !main.contains(document.activeElement)) UI.refocus(focusKey);
    } else {
      window.scrollTo(0, 0);
      /* Only a new screen fades in; a view redrawing itself must not flicker. */
      main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter');
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
    topbar.addEventListener('click', (e) => {
      if (e.target.closest('#reset-demo')) confirmReset();
      else if (e.target.closest('#theme-toggle')) toggleTheme();
    });
    /* Following the system: redraw the toggle when the system theme flips. */
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderTopbar);
    document.getElementById('bottombar').addEventListener('click', (e) => { if (e.target.closest('#more-button')) openMore(); });
    /* Sidebar open/close: remembered between visits. */
    const toggle = document.getElementById('sidebar-toggle');
    const setCollapsed = (on, save) => {
      document.getElementById('shell').classList.toggle('sidebar-collapsed', on);
      toggle.setAttribute('aria-expanded', String(!on));
      toggle.setAttribute('aria-label', on ? 'Open menu' : 'Close menu');
      toggle.title = on ? 'Open menu' : 'Close menu';
      if (save) { try { localStorage.setItem(KEY + '-sidebar', on ? '1' : '0'); } catch (e) { /* keeps working in memory */ } }
    };
    let startCollapsed = false;
    try { startCollapsed = localStorage.getItem(KEY + '-sidebar') === '1'; } catch (e) { /* default open */ }
    setCollapsed(startCollapsed, false);
    toggle.addEventListener('click', () => setCollapsed(!document.getElementById('shell').classList.contains('sidebar-collapsed'), true));
    /* The skip link must not change the hash, or the router would read "#main" as a page. */
    document.querySelector('.skip-link').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('main').focus(); });
    if (window.matchMedia) window.matchMedia('(min-width:761px)').addEventListener('change', (e) => { if (e.matches) closeMore(); });
    window.addEventListener('hashchange', App.render);
    App.render();
  };
  window.App = App;
})();
