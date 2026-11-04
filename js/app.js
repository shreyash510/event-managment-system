/* App shell: state, roles, venue filter, routing. Views plug in with App.route(). */
(function () {
  'use strict';
  const KEY = 'events-admin-demo-v1';
  const VENUE_KEY = KEY + '-venue';
  const routes = Object.create(null);   /* no inherited keys, so #/constructor is just an unknown page */
  const NAV = [
    { key: 'browse', label: 'Find events', perm: 'browse', group: 'Main' },
    { key: 'mybookings', label: 'My bookings', perm: 'mybookings', group: 'Main' },
    { key: 'today', label: 'Today', perm: 'today', group: 'Main' },
    { key: 'events', label: 'Events', perm: 'events.view', group: 'Main' },
    { key: 'bookings', label: 'Bookings', perm: 'bookings.view', group: 'Main' },
    { key: 'checkin', label: 'Check-in', perm: 'checkin', group: 'Main' },
    { key: 'members', label: 'Users', perm: 'membership.manage', group: 'Users and membership' },
    { key: 'subscriptions', label: 'Subscriptions', perm: 'membership.manage', group: 'Users and membership' },
    { key: 'plans', label: 'Plans and offers', perm: 'membership.manage', group: 'Users and membership' },
    { key: 'codes', label: 'Discount codes', perm: 'codes.view', group: 'Manage' },
    { key: 'club', label: 'My club', perm: 'club.manage', group: 'Manage' },
    { key: 'reports', label: 'Reports', perm: 'reports', group: 'Manage' },
    { key: 'messages', label: 'Messages', perm: 'settings', group: 'Manage' },
    { key: 'activity', label: 'Activity', perm: 'settings', group: 'Manage' },
    { key: 'settings', label: 'Settings', perm: 'settings', group: 'Manage' },
    { key: 'account', label: 'My profile', perm: 'account', group: 'Account' }
  ];
  /* A customer sees these three pages and none of the staff shell. */
  const CUST_NAV = [{ key: 'browse', label: 'Find events' }, { key: 'mybookings', label: 'My bookings' }, { key: 'account', label: 'Profile' }];
  /* A guest has no account: My bookings appears once they have booked, and Profile offers them an account. */
  const custNav = () => { const u = App.user(); return !u.guest ? CUST_NAV : CUST_NAV.filter((n) => n.key !== 'mybookings' || (u.guestBookings || []).length).map((n) => (n.key === 'account' ? { key: n.key, label: 'Create account' } : n)); };
  const PHONE_BAR = ['browse', 'mybookings', 'today', 'checkin', 'bookings'];   /* always one tap away on a phone; the rest sit under More */
  /* Pages that live inside another menu item: Partners is part of Discount codes. */
  const NAV_PARENT = { partners: 'codes' };
  const navKey = (key) => NAV_PARENT[key] || key;
  const ICONS = {
    today: '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/>',
    checkin: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    events: '<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M14 6v2.5M14 11v2M14 15.5V18"/>',
    bookings: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9 12h6M9 16h4"/>',
    codes: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1"/>',
    partners: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14c2 .7 3.5 2.7 3.5 6"/>',
    club: '<path d="M4 21V9l8-5 8 5v12"/><path d="M10 21v-6h4v6M3 21h18"/>',
    members: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14c2 .7 3.5 2.7 3.5 6"/>',
    subscriptions: '<path d="M20 11a8 8 0 0 0-14-4.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4.5l2-2.5M20 20v-5h-5"/>',
    plans: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10.5h18M7 15h4"/>',
    reports: '<path d="M4 4v16h16M8 16v-5M12 16V8M16 16v-3"/>',
    messages: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    browse: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    mybookings: '<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M14 6v2.5M14 11v2M14 15.5V18"/>',
    account: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    more: '<path d="M4 7h16M4 12h16M4 17h16"/>'
  };
  const icon = (name, size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

  const readStore = () => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      /* The Reception role was removed. Take those users out here, so the check below does not throw away the saved data. */
      if (s && Array.isArray(s.users) && s.users.some((u) => u.role === 'reception')) {
        s.users = s.users.filter((u) => u.role !== 'reception');
        if (!s.users.some((u) => u.id === s.currentUserId)) { const admin = s.users.find((u) => u.role === 'admin'); if (admin) s.currentUserId = admin.id; }
      }
      /* Anything that does not look like our data is thrown away rather than crashing the page. */
      /* Data saved with role names that no longer exist is replaced. */
      return s && Array.isArray(s.users) && s.users.length && s.users.every((u) => Core.ROLES.includes(u.role)) && s.users.some((u) => u.role === 'admin') && s.users.some((u) => u.role === 'user') && Array.isArray(s.venues) && Array.isArray(s.events) && Array.isArray(s.bookings) ? s : null;
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
  const isCustomer = () => App.role() === 'user';
  /* What a customer sees as the name of the business. There is no club name setting yet, so this is a stand-in. */
  App.brandName = () => (App.state.settings && App.state.settings.clubName) || 'Club Events';
  App.can = (perm) => Core.can(App.role(), perm);
  /* Venue in view: the marketing admin picks one or all (''). Staff at one club are fixed to it. Staff at several clubs
     pick one of theirs, or '' for all of their own. Never a venue the person is not linked to. */
  App.venueId = () => {
    const u = App.user();
    if (Core.allVenues(u)) return App.venueChoice;
    const own = Core.userVenueIds(u);
    if (own.length === 1) return own[0];
    return own.includes(App.venueChoice) ? App.venueChoice : '';
  };
  App.inVenue = (venueId) => Core.canSeeVenue(App.user(), venueId) && (!App.venueId() || App.venueId() === venueId);
  App.visibleEvents = () => App.state.events.filter((e) => App.inVenue(e.venueId));
  App.visibleBookings = () => App.state.bookings.filter((b) => { const e = Core.findEvent(App.state, b.eventId); return e && App.inVenue(e.venueId); });
  App.log = (type, text) => Core.audit(App.state, { at: App.now(), by: App.user().name, type, text });
  App.route = (key, def) => { routes[key] = def; };   /* def: { title, perm, render(mainEl, params) } */
  App.go = (hash) => { if (location.hash === hash) App.render(); else location.hash = hash; };

  const homeKey = () => { const n = NAV.find((x) => App.can(x.perm)); return n ? n.key : 'today'; };
  const labelOf = (key) => { const n = NAV.find((x) => x.key === key); return n ? n.label : key; };
  const parseHash = () => {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch (e) { return p; } });
    /* "#/browse?x=1" is the browse page with a query, read the same way as "#/browse/?x=1". */
    const q = (parts[0] || '').indexOf('?');
    const params = parts.slice(1);
    if (q >= 0) params.unshift(parts[0].slice(q));
    return { key: (q >= 0 ? parts[0].slice(0, q) : parts[0]) || homeKey(), params };
  };
  const allowed = (key) => {
    const nav = NAV.find((n) => n.key === key), route = routes[key];
    return (!nav || App.can(nav.perm)) && (!route || !route.perm || App.can(route.perm));
  };
  /* Can the signed-in role open this area? Used for links that arrive from the website. */
  App.canOpen = (key) => allowed(key);
  /* The first page this role can open. */
  App.home = () => '#/' + homeKey();

  /* ---------- Booking links: where a booking came from ---------- */
  /* Share links look like #/browse?event=<id>&utm_source=instagram&utm_medium=social&utm_campaign=<slug>.
     The source is kept for this visit (last link wins) and saved on the booking as its channel. */
  const SOURCE_KEY = 'events-admin-source';
  const CHANNELS = new Map([['instagram', 'Instagram'], ['email', 'Email newsletter'], ['newsletter', 'Email newsletter'], ['facebook', 'Facebook']]);
  let sourceInMemory = null;   /* for browsers that block sessionStorage */
  const readSource = () => { try { return JSON.parse(sessionStorage.getItem(SOURCE_KEY)) || sourceInMemory; } catch (e) { return sourceInMemory; } };
  const writeSource = (s) => {
    sourceInMemory = s;
    try { if (s) sessionStorage.setItem(SOURCE_KEY, JSON.stringify(s)); else sessionStorage.removeItem(SOURCE_KEY); } catch (e) { /* kept in memory */ }
  };
  App.clearBookingSource = () => writeSource(null);
  /* 'Instagram', 'Email newsletter', 'Facebook', a custom source with capital letters ('acme-gym' is 'Acme Gym'), or 'Website'. */
  App.bookingChannel = () => {
    const s = readSource();
    const raw = String((s && s.source) || '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 40);
    if (!raw) return 'Website';
    return CHANNELS.get(raw.toLowerCase()) || raw.replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
  };
  /* Takes a booking link out of the address: saves its source, then rewrites it to the event's own page.
     Returns true if the address was a booking link. */
  function takeBookingLink() {
    const m = location.hash.match(/^#\/?browse(?:\/([^?]*))?\?(.*)$/);
    if (!m) return false;
    const q = new URLSearchParams(m[2]);
    const hasSource = ['utm_source', 'utm_medium', 'utm_campaign'].some((k) => q.has(k));
    if (!q.has('event') && !hasSource) return false;
    if (q.get('utm_source')) writeSource({ source: q.get('utm_source').slice(0, 80), medium: (q.get('utm_medium') || '').slice(0, 80), campaign: (q.get('utm_campaign') || '').slice(0, 80) });
    let id = q.get('event') || (m[1] || '').split('/')[0];
    if (!q.has('event')) { try { id = decodeURIComponent(id); } catch (e) { /* use it as typed */ } }
    const e = id ? Core.findEvent(App.state, id) : null;
    const open = e && !['Draft', 'Pending approval'].includes(Core.eventStatus(App.state, e, App.now()));
    if (id && !open) setTimeout(() => UI.toast('We could not find that event, so here is everything that is on.'), 300);
    const target = open ? `#/browse/${encodeURIComponent(e.id)}` : '#/browse';
    /* replaceState fires no hashchange, and Back does not land on the long link again. */
    try { history.replaceState(null, '', target); } catch (err) { location.replace(target); }
    return true;
  }
  /* A booking link is for customers. Someone in the demo as staff becomes the demo customer, unless they came by their own link. */
  function arriveByBookingLink(announce) {
    if (document.getElementById('entry')) return;
    if (!App.can('browse')) {
      if (window.Entry && !Entry.isDemo()) return;
      const c = App.state.users.find((u) => u.guest) || App.state.users.find((u) => u.role === 'user');
      if (!c) return;
      App.state.currentUserId = c.id;
      App.save();
      if (announce) UI.toast('Booking links are for customers, so you are now viewing as a customer.');
    }
    App.venueChoice = '';   /* the event may be at any venue */
  }

  /* Choosing a venue: stays between screens and after a reload. */
  App.setVenue = (id) => {
    App.venueChoice = App.state.venues.some((v) => v.id === id) && Core.canSeeVenue(App.user(), id) ? id : '';
    writeVenue(App.venueChoice);
    /* A record open on screen may not belong to the new venue, so go back to that area's list. */
    const { key, params } = parseHash();
    if (params.length) App.go('#/' + key); else App.render();
  };
  /* The venue a person starts on. A customer has no venue switcher, so a venue left over from staff use must not narrow their list. */
  App.syncVenue = () => {
    const id = isCustomer() ? '' : readVenue();
    App.venueChoice = App.state.venues.some((v) => v.id === id) ? id : '';
  };
  /* Switching role: stay in the same area if this role may use it, otherwise go to a page it can open. */
  function switchUser(id) {
    App.state.currentUserId = id;
    App.syncVenue();
    App.save();
    const { key } = parseHash();
    const known = NAV.some((n) => n.key === key) || routes[key];
    App.go(known && allowed(key) ? '#/' + key : App.home());
    UI.toast(`Now signed in as ${userLabel(App.user())}`);
  }
  App.reset = () => {
    const wasCustomer = isCustomer();
    App.state = Seed.build(new Date());
    /* A customer who resets stays a customer rather than landing in the staff shell. */
    if (wasCustomer) { const c = App.state.users.find((u) => u.role === 'user'); if (c) App.state.currentUserId = c.id; }
    App.venueChoice = ''; writeVenue(''); App.save(); App.go(App.home());
  };
  function confirmReset() {
    UI.dialog({
      title: 'Reset demo data?', body: '<p>This removes every change you made and puts the made-up data back.</p>',
      actions: [{ label: 'Keep my changes', kind: 'ghost' }, { label: 'Reset', kind: 'danger', onClick: () => App.reset() }]
    });
  }
  function userLabel(x) {
    const names = Core.allVenues(x) ? [] : Core.userVenueIds(x).map((id) => Core.findVenue(App.state, id)).filter(Boolean).map((v) => v.name);
    return `${Core.ROLE_NAMES[x.role] || x.role}${names.length ? ' · ' + names.join(', ') : ''}`;
  }
  /* Theme: follows the system until the person picks one. */
  const THEME_KEY = 'events-admin-theme';
  const isDark = () => {
    const t = document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  };
  /* mode: 'light', 'dark', or 'system' to go back to following the device. */
  App.setTheme = (mode) => {
    if (mode === 'light' || mode === 'dark') document.documentElement.setAttribute('data-theme', mode);
    else document.documentElement.removeAttribute('data-theme');
    try { if (mode === 'light' || mode === 'dark') localStorage.setItem(THEME_KEY, mode); else localStorage.removeItem(THEME_KEY); } catch (e) { /* keeps working for this visit */ }
    renderTopbar();
  };
  App.theme = () => document.documentElement.getAttribute('data-theme') || 'system';
  function toggleTheme() {
    const next = isDark() ? 'light' : 'dark';
    App.setTheme(next);
    UI.toast(`${next === 'dark' ? 'Dark' : 'Light'} theme on`);
  }
  const themeButton = (cls) => `<button type="button" class="${cls}" id="theme-toggle" aria-label="Switch to ${isDark() ? 'light' : 'dark'} theme" title="Switch to ${isDark() ? 'light' : 'dark'} theme">${icon(isDark() ? 'sun' : 'moon', 18)}</button>`;
  const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  const userOptions = () => UI.options(App.state.users.filter((x) => !x.guest).map((x) => ({ value: x.id, label: userLabel(x) })), App.user().id);

  /* Only touch the shell's HTML when it changed, so focus stays put on a re-render. */
  const painted = {};
  function paintOnce(id, html) {
    if (painted[id] === html) return;
    painted[id] = html;
    document.getElementById(id).innerHTML = html;
  }
  function renderNav(page) {
    const active = navKey(page);
    if (isCustomer()) {
      paintOnce('nav', '');
      paintOnce('bottombar', custNav().map((n) => `<a href="#/${n.key}" data-key="${n.key}"${n.key === active ? ' aria-current="page"' : ''}>${icon(n.key)}<span>${UI.esc(n.label)}</span></a>`).join(''));
      return;
    }
    const items = NAV.filter((n) => App.can(n.perm));
    let lastGroup = null;
    paintOnce('nav', items.map((n) => {
      const head = n.group !== lastGroup ? `<p class="nav-group">${UI.esc(n.group || '')}</p>` : '';
      lastGroup = n.group;
      return head + `<a href="#/${n.key}" data-key="${n.key}"${n.key === active ? ' aria-current="page"' : ''} title="${UI.esc(n.label)}">${icon(n.key, 20)}<span class="nav-label">${UI.esc(n.label)}</span></a>`;
    }).join(''));
    /* Phone: Today and Check-in, then More for the rest. */
    const bar = items.filter((n) => PHONE_BAR.includes(n.key));
    const rest = items.filter((n) => !PHONE_BAR.includes(n.key));
    const restActive = rest.find((n) => n.key === active);
    paintOnce('bottombar', bar.map((n) =>
      `<a href="#/${n.key}" data-key="${n.key}"${n.key === active ? ' aria-current="page"' : ''}>${icon(n.key)}<span>${UI.esc(n.label)}</span></a>`).join('') +
      `<button type="button" id="more-button" class="${restActive ? 'is-active' : ''}" aria-haspopup="dialog">${icon('more')}<span>More</span>${restActive ? `<span class="sr-only">, now on ${UI.esc(restActive.label)}</span>` : ''}</button>`);
  }
  /* The customer's top bar and footer. Empty for staff, and the staff controls are empty for a customer. */
  function renderCustomerShell(page) {
    if (!isCustomer()) {
      paintOnce('cust-bar', ''); paintOnce('cust-foot', '');
      paintOnce('staff-foot', `<span>Events Admin</span><span class="cust-foot-links"><a class="cust-foot-link" href="#/help"${page === 'help' ? ' aria-current="page"' : ''}>Help and guide</a></span>`);
      return;
    }
    paintOnce('staff-foot', '');
    const active = navKey(page);
    const back = window.Entry ? Entry.returnLink() : '';
    paintOnce('cust-bar', `<a class="cust-brand" href="#/browse">${UI.esc(App.brandName())}</a>
      <nav class="cust-nav" aria-label="Main menu">${custNav().map((n) => `<a href="#/${n.key}"${n.key === active ? ' aria-current="page"' : ''}>${UI.esc(n.label)}</a>`).join('')}</nav>
      ${back ? `<a class="btn btn-ghost btn-small cust-back" href="${UI.esc(back)}" rel="noopener">Back to website</a>` : ''}`);
    paintOnce('cust-foot', `<span>${UI.esc(App.brandName())}</span>
      <span class="cust-foot-links"><a class="cust-foot-link" href="#/help">Help and guide</a>${window.Entry ? `<button type="button" class="cust-foot-link" id="cust-sign-out">${App.user().guest ? 'Member sign in' : 'Sign out'}</button>` : ''}${!window.Entry || Entry.isDemo() ? '<button type="button" class="cust-foot-link" id="cust-demo" aria-haspopup="dialog">Demo controls</button>' : ''}</span>`);
  }
  function openCustomerDemo() {
    UI.dialog({
      title: 'Demo controls', subtitle: 'For trying out this demo. A real customer would not see these.',
      body: `<label class="field"><span>Signed in as</span><select id="cust-user-switch">${userOptions()}</select></label>`,
      actions: [
        { label: 'Reset demo data', kind: 'ghost', onClick: (d, close) => { close(); confirmReset(); return false; } },
        { label: 'Switch user', kind: 'primary', onClick: (d, close) => { const id = d.querySelector('#cust-user-switch').value; close(); if (id !== App.user().id) switchUser(id); return false; } }
      ]
    });
  }
  function renderTopbar() {
    if (isCustomer()) { paintOnce('sidebar-user', ''); paintOnce('topbar', ''); return; }
    const u = App.user(), all = Core.allVenues(u);
    const ownVenues = all ? App.state.venues : Core.userVenueIds(u).map((id) => Core.findVenue(App.state, id)).filter(Boolean);
    const many = all || ownVenues.length > 1;
    const venueOpts = [{ value: '', label: all ? 'All venues' : 'All my venues' }].concat(ownVenues.map((v) => ({ value: v.id, label: v.name })));
    const own = ownVenues[0];
    const closed = document.getElementById('shell').classList.contains('sidebar-collapsed');
    paintOnce('sidebar-user', `<a class="su-link" href="#/account" title="My profile"><span class="avatar" aria-hidden="true">${UI.esc(initials(u.name))}</span><span class="su-text"><b>${UI.esc(u.name)}</b><span>${UI.esc(Core.ROLE_NAMES[u.role] || '')}</span></span></a>`);
    paintOnce('topbar', `
      <button type="button" id="sidebar-toggle" class="sidebar-toggle" aria-controls="nav" aria-expanded="${!closed}" aria-label="${closed ? 'Open menu' : 'Close menu'}" title="${closed ? 'Open menu' : 'Close menu'}">${icon('more', 18)}</button>
      <div class="topbar-venue">${many
        ? `<label><span class="topbar-label">Venue</span> <select id="venue-switch">${UI.options(venueOpts, App.venueId())}</select></label>`
        : (Core.isStaff(u.role) ? `<span class="venue-fixed">${UI.esc(own ? own.name : '')}</span>` : '')}</div>
      <div class="topbar-phone-role"><span class="muted">${UI.esc(Core.ROLE_NAMES[u.role] || '')}</span><span class="brand-tag">Demo</span></div>
      <div class="topbar-user"><span class="avatar" aria-hidden="true">${UI.esc(initials(u.name))}</span><label><span class="topbar-label">Signed in as</span> <select id="user-switch">${userOptions()}</select></label>
      ${window.Entry ? Entry.topbarHtml() : ''}<button type="button" class="btn btn-ghost btn-small" id="reset-demo">Reset demo data</button>${themeButton('icon-btn')}</div>`);
  }

  /* The More menu on a phone: the other pages, plus the role switcher and reset. */
  let moreSheet = null;
  function closeMore() { if (moreSheet) { const d = moreSheet; moreSheet = null; if (d.open) d.close(); d.remove(); } }
  function openMore() {
    const key = navKey(parseHash().key);
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
  App.modal = ({ title, subtitle, icon, back }) => {
    closeRouteModal();
    routeModal = UI.modal({ title, subtitle, icon, onCancel: () => App.go(back) });
    routeModal.back = back;
    return routeModal.body;
  };

  /* Draws the screen and returns the title for the browser tab. */
  function paintMain(main, key, params) {
    const nav = NAV.find((n) => n.key === key), route = routes[key];
    if ((nav || route) && !allowed(key)) {
      /* A customer does not need to know that staff pages exist. */
      if (isCustomer()) { message(main, 'We could not find that page.'); return 'Page not found'; }
      message(main, 'Your role does not have access to this area.');
      return 'No access';
    }
    if (!route) { message(main, nav ? 'This page is not available yet.' : 'We could not find that page.'); return 'Page not found'; }
    try { main.innerHTML = ''; route.render(main, params); }
    catch (err) { console.error(err); main.innerHTML = `<div class="empty">Something went wrong on this page: ${UI.esc(err.message)}</div>`; }
    return route.title || 'Events';
  }
  let lastHash = null;
  App.render = () => {
    closeMore();
    if (takeBookingLink()) arriveByBookingLink(true);
    if (Core.runAutoOffers(App.state, App.now())) App.save();
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
    const customer = isCustomer();
    document.body.classList.toggle('is-customer', customer);
    document.getElementById('cust-bar').hidden = !customer;
    document.getElementById('cust-foot').hidden = !customer;
    document.getElementById('staff-foot').hidden = customer;
    renderNav(key); renderTopbar(); renderCustomerShell(key);
    const drawn = paintMain(main, key, params);
    const custPage = customer && CUST_NAV.find((n) => n.key === key);
    /* A screen reader announces this when the focus moves to the new screen below. */
    main.setAttribute('aria-label', custPage ? custPage.label : drawn);
    /* The sign-in screen may be up over the shell, and it is for anyone. */
    document.title = customer || document.getElementById('entry') ? `${custPage ? custPage.label : drawn} · ${App.brandName()}` : `${drawn} · Events Admin`;
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
    Core.migrate(App.state);   /* fills in settings added since the data was saved */
    App.syncVenue();
    App.save();
    /* Shell controls are handled once here, because their HTML is redrawn. */
    const topbar = document.getElementById('topbar');
    topbar.addEventListener('change', (e) => {
      if (e.target.id === 'venue-switch') App.setVenue(e.target.value);
      else if (e.target.id === 'user-switch') switchUser(e.target.value);
    });
    topbar.addEventListener('click', (e) => {
      if (e.target.closest('#sign-out')) Entry.signOut();
      else if (e.target.closest('#reset-demo')) confirmReset();
      else if (e.target.closest('#theme-toggle')) toggleTheme();
    });
    /* Following the system: redraw the toggle when the system theme flips. */
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderTopbar);
    document.getElementById('bottombar').addEventListener('click', (e) => { if (e.target.closest('#more-button')) openMore(); });
    document.getElementById('cust-foot').addEventListener('click', (e) => {
      if (e.target.closest('#cust-sign-out')) Entry.signOut();
      else if (e.target.closest('#cust-demo')) openCustomerDemo();
    });
    /* Sidebar open/close: remembered between visits. */
    const setCollapsed = (on, save) => {
      document.getElementById('shell').classList.toggle('sidebar-collapsed', on);
      const toggle = document.getElementById('sidebar-toggle');
      if (toggle) {
        toggle.setAttribute('aria-expanded', String(!on));
        toggle.setAttribute('aria-label', on ? 'Open menu' : 'Close menu');
        toggle.title = on ? 'Open menu' : 'Close menu';
      }
      if (save) { try { localStorage.setItem(KEY + '-sidebar', on ? '1' : '0'); } catch (e) { /* keeps working in memory */ } }
    };
    let startCollapsed = false;
    try { startCollapsed = localStorage.getItem(KEY + '-sidebar') === '1'; } catch (e) { /* default open */ }
    setCollapsed(startCollapsed, false);
    document.getElementById('topbar').addEventListener('click', (e) => { if (e.target.closest('#sidebar-toggle')) setCollapsed(!document.getElementById('shell').classList.contains('sidebar-collapsed'), true); });
    /* The skip link must not change the hash, or the router would read "#main" as a page. */
    document.querySelector('.skip-link').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('main').focus(); });
    if (window.matchMedia) window.matchMedia('(min-width:761px)').addEventListener('change', (e) => { if (e.matches) closeMore(); });
    /* Arriving from the website: sign the person in and choose the first page, or ask them to come from the website. */
    const bookingLink = takeBookingLink();
    if (window.Entry) Entry.run(bookingLink);
    if (bookingLink) arriveByBookingLink(false);
    window.addEventListener('hashchange', App.render);
    App.render();
  };
  window.App = App;
})();
