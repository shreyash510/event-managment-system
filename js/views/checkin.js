/* Check-in: choose a session, then a phone-first list of people with one tap to check in or undo.
   A tap updates only that row and the count, so the page does not jump and the search text stays. */
(function () {
  'use strict';
  const STORE_KEY = 'events-admin-demo-v1'; /* Same key as app.js, used only to hear changes from another tab. */
  const MODE_KEY = STORE_KEY + '-checkin-mode';
  const readMode = () => { try { return localStorage.getItem(MODE_KEY) === 'list' ? 'list' : 'grid'; } catch (e) { return 'grid'; } };
  /* What this screen remembers between renders. */
  const view = { sessionId: null, q: '', sort: 'open', order: [], revealed: new Set(), filter: 'all', rpage: 0, rsize: 12, tab: 'all', page: 0, halfPage: { today: 0, upcoming: 0 }, size: 9, mode: readMode(), screen: null };

  /* Questions have no "sensitive" setting in the data yet, so a flag is honoured and the wording is checked too. */
  const SENSITIVE_WORDS = /injur|health|medical|medication|diet|allerg|religio|disab|pregnan|condition/i;
  const isSensitive = (q) => q.sensitive === true || SENSITIVE_WORDS.test(q.label || '');

  const isMember = (row) => !!(row.person.isMember || (row.person.isLead && row.booking.customer.isMember));
  const kindLabel = (b) => (b.kind === 'block' ? 'block' : 'drop-in');
  const sessionEnd = (x) => new Date(new Date(x.start).getTime() + (x.durationMin || 60) * 60000);

  /* The session for this screen, or null if it is not one this user can see. */
  function lookup(sessionId) {
    const found = Core.findSession(App.state, sessionId);
    if (!found || found.event.draft || !App.inVenue(found.event.venueId)) return null;
    return found;
  }
  function sessionPosition(event, session) {
    const list = Core.sortedSessions(event).filter((x) => !x.cancelled);
    return list.length > 1 ? `session ${list.findIndex((x) => x.id === session.id) + 1} of ${list.length}` : '';
  }

  /* First visit: the person has an email, and no check-in at this club before this session.
     This only knows about bookings in this system. Someone without an email cannot be worked out, so gets no flag. */
  function earlierVisitors(s, event, session) {
    const starts = new Map();
    s.events.forEach((e) => { if (e.venueId === event.venueId) e.sessions.forEach((x) => starts.set(x.id, x.start)); });
    const seen = new Set();
    for (const b of s.bookings) for (const t of b.tickets) {
      if (!t.checkedInAt || t.status !== 'active' || !starts.has(t.sessionId) || starts.get(t.sessionId) >= session.start) continue;
      const p = b.people.find((x) => x.id === t.personId);
      if (p && p.email) seen.add(p.email.toLowerCase());
    }
    return seen;
  }
  const isFirstVisit = (row, seen) => !!row.person.email && !seen.has(row.person.email.toLowerCase());

  /* ---------- Session chooser ---------- */
  function sessionLink(s, e, x, showDate) {
    const taken = Core.sessionTaken(s, x.id), inCount = Core.sessionCheckedIn(s, x.id);
    const venue = !App.venueId() ? Core.findVenue(s, e.venueId) : null;
    const when = showDate ? UI.dateTime(x.start) : UI.time(x.start);
    const meta = [sessionPosition(e, x), venue ? venue.name : ''].filter(Boolean).join(' · ');
    const t = App.now().getTime(), start = new Date(x.start).getTime();
    const status = sessionEnd(x).getTime() <= t ? UI.badge('Ended', 'quiet')
      : start <= t ? UI.badge('In progress', 'good')
        : start - t <= 3600000 ? UI.badge('Starting soon', 'warn') : '';
    const pct = taken ? Math.round(inCount / taken * 100) : 0;
    return `<li><a class="ci-session" href="#/checkin/${encodeURIComponent(x.id)}">
      <span class="ci-session-top"><span class="ci-when">${UI.esc(when)}</span>${status}</span>
      <span class="ci-session-main"><b>${UI.esc(e.title)}</b>${meta ? `<span class="muted">${UI.esc(meta)}</span>` : ''}</span>
      <span class="ci-session-foot">
        <span class="ci-mini" aria-hidden="true"><i style="width:${pct}%"></i></span>
        <span class="ci-session-count">${inCount} of ${taken} checked in</span>
        <span class="ci-chevron" aria-hidden="true">&rsaquo;</span>
      </span></a></li>`;
  }
  function renderChooser(main) {
    const s = App.state, now = App.now(), today = Core.dayKey(now);
    const all = [];
    App.visibleEvents().forEach((e) => {
      if (e.draft || e.cancelled) return;
      e.sessions.forEach((x) => { if (!x.cancelled) all.push({ e, x }); });
    });
    all.sort((a, c) => a.x.start.localeCompare(c.x.start));
    const todays = all.filter((r) => Core.dayKey(r.x.start) === today);
    const upcoming = all.filter((r) => Core.dayKey(r.x.start) > today);
    /* The list for this tab, one page at a time. Today's sessions come first, then upcoming ones. */
    const list = (view.tab === 'today' ? todays : view.tab === 'upcoming' ? upcoming : todays.concat(upcoming));
    const pages = Math.max(1, Math.ceil(list.length / view.size));
    view.page = Math.min(Math.max(view.page, 0), pages - 1);
    const from = view.page * view.size, slice = list.slice(from, from + view.size);
    const cards = (rows, upcomingFlag, extra) => `<ul class="ci-sessions${view.mode === 'list' ? ' is-list' : ''}${extra || ''}">${rows.map((r) => sessionLink(s, r.e, r.x, upcomingFlag)).join('')}</ul>`;
    /* All: Today and Upcoming side by side, each in its own card with its own < > */
    const HALF = 6;
    const half = (key, title, rows, upcomingFlag, emptyText) => {
      const np = Math.max(1, Math.ceil(rows.length / HALF));
      const pg = view.halfPage[key] = Math.min(Math.max(view.halfPage[key], 0), np - 1);
      const sl = rows.slice(pg * HALF, pg * HALF + HALF);
      const nav = np > 1 ? `<div class="cp-nav"><button type="button" class="pg-btn" data-half="${key}" data-dir="-1" aria-label="Previous ${title.toLowerCase()} sessions"${pg === 0 ? ' disabled' : ''}>&lsaquo;</button><span class="hint cp-info" role="status">${pg * HALF + 1} - ${pg * HALF + sl.length} of ${rows.length}</span><button type="button" class="pg-btn" data-half="${key}" data-dir="1" aria-label="Next ${title.toLowerCase()} sessions"${pg >= np - 1 ? ' disabled' : ''}>&rsaquo;</button></div>` : '';
      return `<section class="card ci-half" aria-label="${title}"><div class="ci-half-head"><h2>${title}</h2><span class="ci-tab-n">${rows.length}</span></div>${sl.length ? cards(sl, upcomingFlag, ' is-compact') : UI.empty(emptyText)}${nav}</section>`;
    };
    const body = view.tab === 'all'
      ? `<div class="ci-halves">${half('today', 'Today', todays, false, 'No sessions today.')}${half('upcoming', 'Upcoming', upcoming, true, 'No upcoming sessions.')}</div>`
      : list.length ? cards(slice, view.tab === 'upcoming')
        : UI.empty(view.tab === 'today' ? 'No sessions today.' : 'No upcoming sessions.');
    const sizes = [6, 9, 12, 24].concat([6, 9, 12, 24].includes(view.size) ? [] : [view.size]).sort((a, b) => a - b);
    const ctl = (k, label, off, d) => `<button type="button" class="pg-btn" data-cip="${k}" aria-label="${label}"${off ? ' disabled' : ''}>${d}</button>`;
    const ic = (d) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const pFrom = Math.max(0, Math.min(view.page - 2, pages - 5)), pTo = Math.min(pages, pFrom + 5);
    let nums = '';
    for (let i = pFrom; i < pTo; i++) nums += `<button type="button" class="pg-btn pg-num" data-cip="page" data-n="${i}" aria-label="Page ${i + 1}"${i === view.page ? ' aria-current="page"' : ''}>${i + 1}</button>`;
    const pager = `<nav class="pager ci-pager" aria-label="Session pages"><div class="pg-group">${ctl('first', 'First page', view.page === 0, ic('<path d="M11 6l-6 6 6 6M19 6l-6 6 6 6"/>'))}${ctl('prev', 'Previous page', view.page === 0, ic('<path d="M15 6l-6 6 6 6"/>'))}${nums}${ctl('next', 'Next page', view.page >= pages - 1, ic('<path d="M9 6l6 6-6 6"/>'))}${ctl('last', 'Last page', view.page >= pages - 1, ic('<path d="M13 6l6 6-6 6M5 6l6 6-6 6"/>'))}</div>` +
      `<label class="pg-size"><span class="sr-only">Sessions per page</span><select data-cisize>${sizes.map((n) => `<option value="${n}"${n === view.size ? ' selected' : ''}>${n}</option>`).join('')}</select><span>per page</span></label>` +
      `<span class="muted pager-info" tabindex="-1" role="status">${list.length ? `${from + 1} - ${from + slice.length}` : '0'} of ${list.length}</span></nav>`;
    main.innerHTML = `<div class="ci-screen" data-screen="chooser">
      ${UI.pageHead('Check-in', '', 'Mark people as arrived and download attendee lists. Choose a session to start.')}
      <div class="grid stats ci-summary">
        <div class="stat">${UI.statIcon('calendar', UI.statTone(0))}<b>${todays.length}</b><span>Sessions today</span><small>${todays.filter((r) => sessionEnd(r.x) <= now).length} finished</small></div>
        <div class="stat">${UI.statIcon('check', UI.statTone(1))}<b>${todays.reduce((n, r) => n + Core.sessionCheckedIn(s, r.x.id), 0)} <i>of ${todays.reduce((n, r) => n + Core.sessionTaken(s, r.x.id), 0)}</i></b><span>Checked in today</span><small>Across all of today's sessions</small></div>
        <div class="stat">${UI.statIcon('users', UI.statTone(2))}<b>${todays.reduce((n, r) => n + (sessionEnd(r.x) > now ? Core.sessionTaken(s, r.x.id) - Core.sessionCheckedIn(s, r.x.id) : 0), 0)}</b><span>Still to arrive</span><small>On sessions not yet finished</small></div>
        <div class="stat">${UI.statIcon('clock', UI.statTone(3))}<b>${upcoming.length}</b><span>Upcoming sessions</span><small>After today</small></div>
      </div>
      <div class="ci-controls">
        <div class="ci-tabs" role="group" aria-label="Show sessions">${[['all', 'All', todays.length + upcoming.length], ['today', 'Today', todays.length], ['upcoming', 'Upcoming', upcoming.length]].map(([k, label, n]) =>
          `<button type="button" class="ci-tab" data-tab="${k}" aria-pressed="${view.tab === k}">${label}<span class="ci-tab-n">${n}</span></button>`).join('')}</div>
        <div class="ci-mode" role="group" aria-label="Layout">
          <button type="button" data-mode="grid" aria-pressed="${view.mode === 'grid'}" aria-label="Grid view" title="Grid view"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg></button>
          <button type="button" data-mode="list" aria-pressed="${view.mode === 'list'}" aria-label="List view" title="List view"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg></button>
        </div>
      </div>
      ${body}
      ${view.tab !== 'all' && list.length ? pager : ''}
    </div>`;
    const root = main.querySelector('.ci-screen');
    root.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        if (tab.dataset.tab === view.tab) return;
        view.tab = tab.dataset.tab; view.page = 0;
        renderChooser(main);
        const again = main.querySelector(`[data-tab="${view.tab}"]`);
        if (again) again.focus({ preventScroll: true });
        return;
      }
      const hb = e.target.closest('button[data-half]');
      if (hb) {
        if (hb.disabled) return;
        view.halfPage[hb.dataset.half] += Number(hb.dataset.dir);
        renderChooser(main);
        const again = main.querySelector(`button[data-half="${hb.dataset.half}"][data-dir="${hb.dataset.dir}"]:not([disabled])`) || main.querySelector(`button[data-half="${hb.dataset.half}"]:not([disabled])`);
        if (again) again.focus({ preventScroll: true });
        return;
      }
      const mode = e.target.closest('[data-mode]');
      if (mode) {
        if (mode.dataset.mode === view.mode) return;
        view.mode = mode.dataset.mode;
        try { localStorage.setItem(MODE_KEY, view.mode); } catch (err) { /* keeps working in memory */ }
        renderChooser(main);
        main.querySelector(`[data-mode="${view.mode}"]`).focus({ preventScroll: true });
        return;
      }
      const b = e.target.closest('button[data-cip]');
      if (!b || b.disabled) return;
      const k = b.dataset.cip;
      view.page = k === 'first' ? 0 : k === 'last' ? pages - 1 : k === 'next' ? view.page + 1 : k === 'prev' ? view.page - 1 : Number(b.dataset.n);
      renderChooser(main);
      const again = k === 'page' ? main.querySelector('.ci-pager .pg-num[aria-current]') : main.querySelector(`.ci-pager [data-cip="${k}"]:not([disabled])`);
      (again || main.querySelector('.ci-pager .pager-info')).focus({ preventScroll: true });
    });
    root.addEventListener('change', (e) => {
      if (!e.target.matches('select[data-cisize]')) return;
      view.size = Number(e.target.value) || 9; view.page = 0;
      renderChooser(main);
      main.querySelector('select[data-cisize]').focus({ preventScroll: true });
    });
  }

  /* ---------- One row ---------- */
  function rowHtml(row, ctx) {
    const { booking: b, person, ticket: t } = row;
    const name = Core.personName(b, person);
    const flags = [];
    if (isMember(row)) flags.push(UI.badge('Member', 'info'));
    if (isFirstVisit(row, ctx.seen)) flags.push(UI.badge('First visit', 'good'));
    const missing = Core.personMissing(ctx.event, person);
    if (missing.length) flags.push(UI.badge('Details missing', 'warn'));
    const answers = person.answers || {};
    const given = (ctx.event.questions || []).filter((q) => String(answers[q.id] || '').trim());
    const open = given.filter((q) => !isSensitive(q));
    const privateOnes = given.filter(isSensitive);
    const revealed = view.revealed.has(person.id);
    const sub = [kindLabel(b)];
    if (!person.isLead && person.name) sub.push(`guest of ${b.customer.name}`);
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
    return `<li class="ci-row${t.checkedInAt ? ' is-in' : ''}" data-ticket="${UI.esc(t.id)}">
      <span class="avatar ci-avatar" aria-hidden="true">${t.checkedInAt ? '&#10003;' : UI.esc(initials)}</span>
      <div class="ci-main">
        <div class="ci-name">${UI.esc(name)}</div>
        <div class="ci-sub"><span class="muted">${UI.esc(sub.join(' · '))}</span>${App.can('bookings.view')
          ? `<a class="ci-ref" href="#/bookings/${encodeURIComponent(b.id)}" aria-label="Open booking ${UI.esc(b.ref)} for ${UI.esc(name)}">${UI.esc(b.ref)}</a>`
          : `<span class="muted">${UI.esc(b.ref)}</span>`}</div>
        ${flags.length ? `<div class="ci-flags">${flags.join(' ')}</div>` : ''}
        ${missing.length ? `<div class="ci-note">Missing: ${UI.esc(missing.join(', '))}</div>` : ''}
        ${open.map((q) => `<div class="ci-note"><b>${UI.esc(q.label)}:</b> ${UI.esc(answers[q.id])}</div>`).join('')}
        ${privateOnes.length ? `<button type="button" class="btn ci-reveal" data-reveal="${UI.esc(person.id)}" aria-expanded="${revealed}">${revealed ? 'Hide private answer' : 'Show private answer'}</button>` : ''}
        ${revealed ? privateOnes.map((q) => `<div class="ci-note ci-private"><b>${UI.esc(q.label)}:</b> ${UI.esc(answers[q.id])}</div>`).join('') : ''}
      </div>
      <div class="ci-action">
        ${t.checkedInAt
          ? `<span class="ci-state">✓ In ${UI.esc(UI.time(t.checkedInAt))}</span><button type="button" class="btn ci-toggle" data-toggle="${UI.esc(t.id)}" aria-label="Undo check-in for ${UI.esc(name)}">Undo</button>`
          : `<button type="button" class="btn btn-primary ci-toggle" data-toggle="${UI.esc(t.id)}" aria-label="Check in ${UI.esc(name)}">Check in</button>`}
      </div>
    </li>`;
  }

  /* ---------- List drawing ---------- */
  function context() {
    const found = lookup(view.sessionId);
    if (!found) return null;
    return Object.assign({ s: App.state, rows: Core.attendees(App.state, found.session.id), seen: earlierVisitors(App.state, found.event, found.session) }, found);
  }
  function matches(row, q) {
    const text = [Core.personName(row.booking, row.person), row.booking.ref, row.booking.customer.name].join(' ').toLowerCase();
    return q.split(/\s+/).every((word) => text.includes(word));
  }
  const FILTERS = [['all', 'All', 'ci-n-all'], ['open', 'Not checked in', 'ci-n-open'], ['in', 'Checked in', 'ci-n-in']];
  function setFilterMenu(root, open) {
    const menu = root.querySelector('#ci-filter-menu'), btn = root.querySelector('#ci-filter-btn');
    if (!menu || !btn) return;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }
  /* Say which filter is on, so a hidden menu does not hide why the list is short. */
  function paintFilterTag(root) {
    const tag = root.querySelector('#ci-filter-on'), on = FILTERS.find((f) => f[0] === view.filter);
    tag.hidden = view.filter === 'all';
    tag.textContent = on && view.filter !== 'all' ? on[1] : '';
  }
  function sortRows(rows) {
    if (view.sort !== 'open') return rows.slice();
    return rows.slice().sort((a, c) => (a.ticket.checkedInAt ? 1 : 0) - (c.ticket.checkedInAt ? 1 : 0)); /* Stable, so names stay A to Z in each group. */
  }
  /* keepOrder leaves people where they are, so rows do not move under a finger when someone else checks a person in. */
  function drawList(keepOrder) {
    const root = view.screen, ctx = context();
    if (!root) return;
    if (!ctx) { App.render(); return; }
    const q = view.q.trim().toLowerCase();
    let ordered;
    if (keepOrder) {
      const pos = new Map(view.order.map((id, i) => [id, i]));
      const place = (r) => (pos.has(r.ticket.id) ? pos.get(r.ticket.id) : Infinity);
      ordered = ctx.rows.slice().sort((a, c) => place(a) - place(c));
    } else {
      ordered = sortRows(ctx.rows);
    }
    view.order = ordered.map((r) => r.ticket.id);
    const rows = ordered.filter((r) => (!q || matches(r, q)) && (view.filter === 'all' || (view.filter === 'in') === !!r.ticket.checkedInAt));
    const pages = Math.max(1, Math.ceil(rows.length / view.rsize));
    view.rpage = Math.min(Math.max(view.rpage, 0), pages - 1);
    const from = view.rpage * view.rsize, shown = rows.slice(from, from + view.rsize);
    const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.toggle : null;
    const list = root.querySelector('#ci-list');
    list.innerHTML = shown.length ? `<ul class="ci-rows">${shown.map((r) => rowHtml(r, ctx)).join('')}</ul>`
      : UI.empty(ctx.rows.length ? (q ? 'No one matches this search.' : view.filter === 'in' ? 'No one has been checked in yet.' : 'Everyone is checked in.') : 'No one is booked on this session yet.');
    root.querySelector('#ci-pager').innerHTML = rows.length > 0 ? rowPager(pages, rows.length, from, shown.length) : '';
    const one = rows.length === 1 && !rows[0].ticket.checkedInAt;
    root.querySelector('#ci-showing').textContent = q ? `Showing ${rows.length} of ${ctx.rows.length}${one ? '. Press Enter to check them in.' : ''}` : '';
    root.querySelector('#ci-clear').hidden = !view.q;
    if (focused) { const b = list.querySelector(`[data-toggle="${CSS.escape(focused)}"]`); if (b) b.focus({ preventScroll: true }); }
    updateHead(ctx);
  }
  /* Pager under the attendee list. */
  function rowPager(pages, total, from, count) {
    const page = view.rpage;
    const ic = (d) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const ctl = (k, label, off, d) => `<button type="button" class="pg-btn" data-rp="${k}" aria-label="${label}"${off ? ' disabled' : ''}>${ic(d)}</button>`;
    const pFrom = Math.max(0, Math.min(page - 2, pages - 5)), pTo = Math.min(pages, pFrom + 5);
    let nums = '';
    for (let i = pFrom; i < pTo; i++) nums += `<button type="button" class="pg-btn pg-num" data-rp="page" data-n="${i}" aria-label="Page ${i + 1}"${i === page ? ' aria-current="page"' : ''}>${i + 1}</button>`;
    const sizes = [12, 24, 48].concat([12, 24, 48].includes(view.rsize) ? [] : [view.rsize]).sort((a, b) => a - b);
    return `<nav class="pager ci-pager" aria-label="Attendee pages"><div class="pg-group">${ctl('first', 'First page', page === 0, '<path d="M11 6l-6 6 6 6M19 6l-6 6 6 6"/>')}${ctl('prev', 'Previous page', page === 0, '<path d="M15 6l-6 6 6 6"/>')}${nums}${ctl('next', 'Next page', page >= pages - 1, '<path d="M9 6l6 6-6 6"/>')}${ctl('last', 'Last page', page >= pages - 1, '<path d="M13 6l6 6-6 6M5 6l6 6-6 6"/>')}</div>` +
      `<label class="pg-size"><span class="sr-only">People per page</span><select data-rpsize>${sizes.map((n) => `<option value="${n}"${n === view.rsize ? ' selected' : ''}>${n}</option>`).join('')}</select><span>per page</span></label>` +
      `<span class="muted pager-info" tabindex="-1" role="status">${from + 1} - ${from + count} of ${total}</span></nav>`;
  }
  function updateHead(ctx) {
    const root = view.screen, s = ctx.s, x = ctx.session;
    const nIn = ctx.rows.filter((r) => r.ticket.checkedInAt).length;
    root.querySelector('#ci-n-all').textContent = ctx.rows.length;
    root.querySelector('#ci-n-open').textContent = ctx.rows.length - nIn;
    root.querySelector('#ci-n-in').textContent = nIn;
    const taken = Core.sessionTaken(s, x.id), inCount = Core.sessionCheckedIn(s, x.id), left = Core.placesLeft(s, x);
    root.querySelector('#ci-count').innerHTML = `${inCount} <i>of ${taken}</i><span class="sr-only"> checked in</span>`;
    root.querySelector('#ci-bar').style.width = taken ? `${Math.round(inCount / taken * 100)}%` : '0%';
    root.querySelector('#ci-st-open').textContent = Math.max(0, taken - inCount);
    root.querySelector('#ci-st-left').textContent = left;
    root.querySelector('#ci-st-cap').textContent = x.capacity;
    root.querySelector('#ci-places').textContent =`${left} ${left === 1 ? 'space' : 'spaces'} left of ${x.capacity}`;
    const walk = root.querySelector('#ci-walkin');
    if (walk) {
      const blocked = left < 1 && !App.can('override');
      walk.disabled = blocked;
      root.querySelector('#ci-walkin-hint').hidden = !blocked;
    }
  }

  /* ---------- Check in and undo ---------- */
  function toggle(ticketId) {
    if (!App.can('checkin')) { UI.toast('Your role cannot check people in.', 'bad'); return; }
    const ctx = context();
    const row = ctx && ctx.rows.find((r) => r.ticket.id === ticketId);
    if (!row) { UI.toast('This place is no longer on the list.', 'bad'); drawList(true); return; }
    const now = App.now(), by = App.user().name, name = Core.personName(row.booking, row.person);
    const when = UI.dateTime(ctx.session.start);
    if (row.ticket.checkedInAt) {
      row.ticket.checkedInAt = null;
      Core.logBooking(row.booking, now, by, `Check-in undone: ${name}, ${when}.`);
    } else {
      row.ticket.checkedInAt = Core.toLocalISO(now);
      Core.logBooking(row.booking, now, by, `Checked in: ${name}, ${when}.`);
    }
    App.save();
    const old = view.screen.querySelector(`.ci-row[data-ticket="${CSS.escape(ticketId)}"]`);
    if (old) {
      old.insertAdjacentHTML('afterend', rowHtml(row, ctx));
      const fresh = old.nextElementSibling;
      old.remove();
      fresh.querySelector('[data-toggle]').focus({ preventScroll: true });
    }
    updateHead(ctx);
  }

  /* ---------- Add walk-in ---------- */
  function openWalkIn() {
    if (!App.can('bookings.create')) { UI.toast('Your role cannot add bookings.', 'bad'); return; }
    const ctx = context();
    if (!ctx) return;
    const { s, event, session } = ctx;
    const canOver = App.can('override');
    const left = Core.placesLeft(s, session);
    if (left < 1 && !canOver) { UI.toast('There are no spaces left. Ask a club manager.', 'bad'); return; }
    const most = Math.max(1, Math.min(event.maxPerBooking || 6, canOver ? (event.maxPerBooking || 6) : left));
    const tickets = event.tickets.map((t) => ({ value: t.id, label: `${t.name}, ${UI.money(t.price)}` }));
    const body = `<div class="ci-form">
      <label class="field"><span>Name</span><input id="ci-w-name" type="text" autocomplete="off" required></label>
      <label class="field"><span>Email (leave empty if they will not give one)</span><input id="ci-w-email" type="email" autocomplete="off"></label>
      <label class="field"><span>Phone (optional)</span><input id="ci-w-phone" type="tel" autocomplete="off"></label>
      ${tickets.length > 1 ? `<label class="field"><span>Ticket</span><select id="ci-w-ticket">${UI.options(tickets, tickets[0].value)}</select></label>` : ''}
      <label class="field"><span>How many people</span><select id="ci-w-qty">${UI.options(Array.from({ length: most }, (_, i) => ({ value: i + 1, label: String(i + 1) })), 1)}</select></label>
      <label class="check ci-check"><input id="ci-w-member" type="checkbox"><span>Lead person is a member</span></label>
      <label class="check ci-check"><input id="ci-w-now" type="checkbox" checked><span>Check them in now</span></label>
      <label class="field" id="ci-w-reason-wrap" hidden><span>Reason for going over the limit</span><input id="ci-w-reason" type="text" autocomplete="off"></label>
      <p class="hint" id="ci-w-spaces">${left} ${left === 1 ? 'space' : 'spaces'} left.</p>
      <label class="field"><span>Payment</span><select id="ci-w-pay">${UI.options([{ value: 'Card', label: 'Card' }, { value: 'Cash', label: 'Cash' }], 'Card')}</select></label>
      <p class="ci-total" id="ci-w-total" aria-live="polite"></p>
      ${UI.demo('no card is charged. The payment, the confirmation email and the Klaviyo update are simulated.')}
    </div>`;
    const readQty = (d) => Number(d.querySelector('#ci-w-qty').value) || 1;
    const readTicket = (d) => { const el = d.querySelector('#ci-w-ticket'); return el ? el.value : (event.tickets[0] && event.tickets[0].id); };
    const refresh = (d) => {
      const qty = readQty(d);
      const q = Core.quote({ event, kind: 'dropin', ticketTypeId: readTicket(d), qty, isMember: d.querySelector('#ci-w-member').checked, code: null, settings: App.state.settings });
      d.querySelector('#ci-w-total').textContent = `To pay: ${UI.money(q.total)}${q.memberDiscount > 0 ? ` (member saving ${UI.money(q.memberDiscount)})` : ''}`;
      d.querySelector('#ci-w-reason-wrap').hidden = !(canOver && qty > Core.placesLeft(App.state, session));
    };
    UI.dialog({
      title: `Add walk-in: ${event.title}`, body,
      onOpen: (d) => {
        d.classList.add('ci-dialog');
        ['#ci-w-qty', '#ci-w-member', '#ci-w-ticket'].forEach((sel) => { const el = d.querySelector(sel); if (el) el.addEventListener('change', () => refresh(d)); });
        refresh(d);
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Take payment and add', kind: 'primary',
        onClick: (d) => {
          if (!App.can('bookings.create')) { UI.dialogError(d, 'Your role cannot add bookings.'); return false; }
          const name = d.querySelector('#ci-w-name').value.trim();
          const email = d.querySelector('#ci-w-email').value.trim();
          const reason = d.querySelector('#ci-w-reason').value.trim();
          const qty = readQty(d);
          if (!name) { UI.dialogError(d, 'Enter a name.'); return false; }
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { UI.dialogError(d, 'Check the email address.'); return false; }
          const state = App.state, found = lookup(session.id);
          if (!found) { UI.dialogError(d, 'This session is not available.'); return false; }
          const short = Core.capacityShortfall(state, [session.id], qty).length > 0;
          const allowed = Core.manualBookingAllowed(App.role(), { comp: false, compReason: '', short, overrideReason: reason });
          if (!allowed.ok) { UI.dialogError(d, allowed.reason); return false; }
          const now = App.now(), by = App.user().name;
          const b = Core.createBooking(state, {
            event: found.event, kind: 'dropin', sessionIds: [session.id], ticketTypeId: readTicket(d),
            customer: { name, email, phone: d.querySelector('#ci-w-phone').value.trim(), isMember: d.querySelector('#ci-w-member').checked, marketingConsent: false },
            guests: Array.from({ length: qty - 1 }, () => ({})), code: null,
            payment: d.querySelector('#ci-w-pay').value, source: 'Walk-in', channel: 'Walk-in', by, now
          });
          if (d.querySelector('#ci-w-now').checked) {
            b.tickets.forEach((t) => { t.checkedInAt = Core.toLocalISO(now); });
            Core.logBooking(b, now, by, `Checked in at the door: ${qty} ${qty === 1 ? 'person' : 'people'}.`);
          }
          App.log('Walk-in booking', `${b.ref}: ${found.event.title}, ${UI.dateTime(session.start)}, ${qty} ${qty === 1 ? 'person' : 'people'}, ${UI.money(b.pricing.total)}.`);
          if (short) App.log('Override', `${b.ref}: went over the limit on ${found.event.title}, ${UI.dateTime(session.start)}. Reason: ${reason}`);
          if (email) Core.klaviyo(state, { at: now, type: 'Booking confirmed', ref: b.ref });
          App.save();
          view.q = '';
          const search = view.screen.querySelector('#ci-search');
          if (search) search.value = '';
          drawList(false);
          UI.toast(`${b.ref} added. Demo: no real payment or email.`);
          const first = b.tickets[0] && view.screen.querySelector(`.ci-row[data-ticket="${CSS.escape(b.tickets[0].id)}"]`);
          if (first) first.scrollIntoView({ block: 'center' });
          return undefined;
        }
      }]
    });
  }

  /* ---------- CSV export ---------- */
  const COLUMNS = [
    { key: 'name', label: 'Name', value: (r) => Core.personName(r.booking, r.person) },
    { key: 'ref', label: 'Booking', value: (r) => r.booking.ref },
    { key: 'ticket', label: 'Ticket', value: (r) => kindLabel(r.booking) },
    { key: 'guestOf', label: 'Guest of', value: (r) => (r.person.isLead ? '' : r.booking.customer.name) },
    { key: 'member', label: 'Member', value: (r) => (isMember(r) ? 'Yes' : 'No') },
    { key: 'firstVisit', label: 'First visit', value: (r, ctx) => (isFirstVisit(r, ctx.seen) ? 'Yes' : 'No') },
    { key: 'checkedIn', label: 'Checked in', value: (r) => (r.ticket.checkedInAt ? 'Yes' : 'No') },
    { key: 'checkedInAt', label: 'Check-in time', value: (r) => UI.time(r.ticket.checkedInAt) },
    { key: 'missing', label: 'Details missing', value: (r, ctx) => Core.personMissing(ctx.event, r.person).join('; ') },
    { key: 'email', label: 'Email', value: (r) => r.person.email || '' },
    { key: 'phone', label: 'Phone', value: (r) => (r.person.isLead ? r.booking.customer.phone : '') },
    { key: 'source', label: 'Booked through', value: (r) => r.booking.source || '' }
  ];
  const BUILT_IN_SETS = [
    { id: 'door', name: 'Door list', keys: ['name', 'ref', 'ticket', 'member', 'checkedIn'] },
    { id: 'contact', name: 'Contact list', keys: ['name', 'ref', 'email', 'phone'] }
  ];
  const savedSets = () => App.state.checkinExportSets || [];

  function openExport() {
    if (!App.can('lists.export')) { UI.toast('Your role cannot download lists.', 'bad'); return; }
    const ctx = context();
    if (!ctx) return;
    const questions = ctx.event.questions || [];
    const openQs = questions.filter((q) => !isSensitive(q));
    const privateQs = questions.filter(isSensitive);
    const tick = (key, label) => `<label class="check ci-check"><input type="checkbox" data-col="${UI.esc(key)}"><span>${UI.esc(label)}</span></label>`;
    /* A saved set stores question wording, not ids, so it also works on other events that ask the same thing. */
    const toStored = (key) => { if (!key.startsWith('q:')) return key; const q = questions.find((x) => x.id === key.slice(2)); return q ? `label:${q.label}` : null; };
    const fromStored = (key) => { if (!key.startsWith('label:')) return key; const q = openQs.find((x) => x.label === key.slice(6)); return q ? `q:${q.id}` : null; };
    const setOptions = (selected) => UI.options([{ value: '', label: 'Choose columns myself' }]
      .concat(BUILT_IN_SETS.map((x) => ({ value: x.id, label: x.name })), savedSets().map((x) => ({ value: x.id, label: x.name }))), selected);
    const body = `<div class="ci-form">
      <p>All ${ctx.rows.length} ${ctx.rows.length === 1 ? 'person' : 'people'} on this list go in the file, whatever the search says. This file holds personal data, so each download is recorded.</p>
      <label class="field"><span>Saved set</span><select id="ci-x-set">${setOptions('door')}</select></label>
      <fieldset class="ci-fieldset"><legend>Columns</legend>
        ${COLUMNS.map((c) => tick(c.key, c.label)).join('')}
        ${openQs.map((q) => tick(`q:${q.id}`, q.label)).join('')}
      </fieldset>
      <div class="ci-save-set">
        <label class="field"><span>Save these columns as a set</span><input id="ci-x-name" type="text" autocomplete="off"></label>
        <button type="button" class="btn" id="ci-x-save">Save set</button>
        <button type="button" class="btn" id="ci-x-delete" hidden>Delete this set</button>
      </div>
      ${privateQs.length ? `<fieldset class="ci-fieldset"><legend>Sensitive answers</legend>
        <label class="check ci-check"><input type="checkbox" id="ci-x-sensitive"><span>Include: ${UI.esc(privateQs.map((q) => q.label).join(', '))}</span></label>
        <p class="ci-warning" id="ci-x-warning" role="alert" hidden>Warning: these answers can show health or religious details. Only download them if you need them on the day, keep the file safe and delete it after. This choice is recorded and is never kept in a saved set.</p>
      </fieldset>` : ''}
    </div>`;
    const applySet = (d, id) => {
      const set = BUILT_IN_SETS.concat(savedSets()).find((x) => x.id === id);
      d.querySelector('#ci-x-delete').hidden = !savedSets().some((x) => x.id === id);
      if (!set) return;
      const keys = new Set(set.keys.map(fromStored));
      d.querySelectorAll('[data-col]').forEach((c) => { c.checked = keys.has(c.dataset.col); });
    };
    const chosen = (d) => [...d.querySelectorAll('[data-col]:checked')].map((c) => c.dataset.col);
    UI.dialog({
      title: 'Download list', body,
      onOpen: (d) => {
        d.classList.add('ci-dialog');
        applySet(d, 'door');
        const setSelect = d.querySelector('#ci-x-set');
        setSelect.addEventListener('change', () => applySet(d, setSelect.value));
        d.querySelectorAll('[data-col]').forEach((c) => c.addEventListener('change', () => { setSelect.value = ''; d.querySelector('#ci-x-delete').hidden = true; }));
        const sens = d.querySelector('#ci-x-sensitive');
        if (sens) sens.addEventListener('change', () => { d.querySelector('#ci-x-warning').hidden = !sens.checked; });
        d.querySelector('#ci-x-save').addEventListener('click', () => {
          const name = d.querySelector('#ci-x-name').value.trim();
          const keys = chosen(d).map(toStored).filter(Boolean);
          if (!name) { UI.dialogError(d, 'Enter a name for the set.'); return; }
          if (!keys.length) { UI.dialogError(d, 'Choose at least one column.'); return; }
          if (BUILT_IN_SETS.concat(savedSets()).some((x) => x.name.toLowerCase() === name.toLowerCase())) { UI.dialogError(d, 'There is already a set with that name.'); return; }
          const set = { id: Core.nextId(App.state, 'cs'), name, keys };
          App.state.checkinExportSets = savedSets().concat(set);
          App.save();
          setSelect.innerHTML = setOptions(set.id);
          d.querySelector('#ci-x-name').value = '';
          d.querySelector('#ci-x-delete').hidden = false;
          UI.dialogError(d, '');
          UI.toast(`Set "${name}" saved.`);
        });
        d.querySelector('#ci-x-delete').addEventListener('click', () => {
          App.state.checkinExportSets = savedSets().filter((x) => x.id !== setSelect.value);
          App.save();
          setSelect.innerHTML = setOptions('');
          d.querySelector('#ci-x-delete').hidden = true;
        });
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Download CSV', kind: 'primary',
        onClick: (d) => {
          if (!App.can('lists.export')) { UI.dialogError(d, 'Your role cannot download lists.'); return false; }
          const fresh = context();
          if (!fresh) { UI.dialogError(d, 'This session is not available.'); return false; }
          const keys = chosen(d);
          const sensEl = d.querySelector('#ci-x-sensitive');
          const withSensitive = !!(sensEl && sensEl.checked);
          if (!keys.length && !withSensitive) { UI.dialogError(d, 'Choose at least one column.'); return false; }
          const answer = (q) => (r) => (r.person.answers && r.person.answers[q.id]) || '';
          const cols = keys.map((key) => {
            if (!key.startsWith('q:')) return COLUMNS.find((c) => c.key === key);
            const q = openQs.find((x) => x.id === key.slice(2));
            return { label: q.label, value: answer(q) };
          });
          if (withSensitive) privateQs.forEach((q) => cols.push({ label: q.label, value: answer(q) }));
          const rows = [cols.map((c) => c.label)].concat(fresh.rows.map((r) => cols.map((c) => c.value(r, fresh))));
          const slug = fresh.event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session';
          UI.downloadCSV(`attendees-${slug}-${Core.dayKey(fresh.session.start)}.csv`, rows);
          App.log('Export', `Attendee list downloaded: ${fresh.event.title}, ${UI.dateTime(fresh.session.start)}. ${fresh.rows.length} people. Columns: ${cols.map((c) => c.label).join(', ')}. Sensitive answers: ${withSensitive ? 'included' : 'left out'}.`);
          App.save();
          UI.toast('List downloaded. This download is recorded.');
          return undefined;
        }
      }]
    });
  }

  /* ---------- Session list screen ---------- */
  function renderList(main, sessionId) {
    if (view.sessionId !== sessionId) {
      view.sessionId = sessionId; view.q = ''; view.order = []; view.revealed = new Set();
    }
    const back = '<a class="btn ci-back" href="#/checkin">‹ All sessions</a>';
    const found = lookup(sessionId);
    if (!found) {
      view.screen = null;
      main.innerHTML = `<div class="ci-screen">${back}${UI.empty('This session is not available for the venue in view.')}</div>`;
      return;
    }
    const { event, session } = found;
    const venue = Core.findVenue(App.state, event.venueId);
    const subtitle = 'Tap Check in next to a name as each person arrives.';
    const nowT = App.now().getTime(), startT = new Date(session.start).getTime();
    const status = (session.cancelled || event.cancelled) ? UI.badge('Cancelled', 'bad')
      : sessionEnd(session).getTime() <= nowT ? UI.badge('Ended', 'quiet')
        : startT <= nowT ? UI.badge('In progress', 'good')
          : startT - nowT <= 3600000 ? UI.badge('Starting soon', 'warn') : UI.badge('Upcoming', 'info');
    const chip = (path, text) => `<span class="ci-chip"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>${UI.esc(text)}</span>`;
    const chips = `<div class="ci-chips">${status}${chip('<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/>', UI.dateTime(session.start))}${sessionPosition(event, session) ? chip('<path d="M4 7h16M4 12h16M4 17h10"/>', sessionPosition(event, session)) : ''}${venue ? chip('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>', venue.name) : ''}</div>`;
    let walkIn = '';
    if (!session.cancelled && !event.cancelled && App.can('bookings.create')) {
      if (sessionEnd(session) < App.now()) walkIn = '<p class="hint ci-walkin-note">This session has ended, so walk-ins cannot be added.</p>';
      else if (!event.dropInsEnabled || !event.tickets.length) walkIn = '<p class="hint ci-walkin-note">This event has no single-session ticket. Add this person from Bookings.</p>';
      else walkIn = '<button type="button" class="btn" id="ci-walkin">+ Add walk-in</button>';
    }
    const download = App.can('lists.export') ? '<button type="button" class="btn" id="ci-download">Download list</button>' : '';
    main.innerHTML = `<div class="ci-screen" data-screen="list">
      ${UI.pageHead(event.title, (walkIn.startsWith('<button') ? walkIn : '') + download + back, subtitle, '#/checkin')}
      ${chips}
      ${walkIn && !walkIn.startsWith('<button') ? walkIn : ''}
      ${session.cancelled ? `<p class="ci-warning">This session is cancelled.</p>` : ''}
      <div class="grid stats ci-stats">
        <div class="stat">${UI.statIcon('check', UI.statTone(0))}<b id="ci-count" role="status" aria-live="polite"></b><span>Checked in</span><div class="ci-track" aria-hidden="true"><div class="ci-bar" id="ci-bar"></div></div></div>
        <div class="stat">${UI.statIcon('users', UI.statTone(1))}<b id="ci-st-open">0</b><span>Still to arrive</span><small>Booked, not yet in</small></div>
        <div class="stat">${UI.statIcon('seat', UI.statTone(2))}<b id="ci-st-left">0</b><span>Places left</span><small>Open for walk-ins</small></div>
        <div class="stat">${UI.statIcon('ticket', UI.statTone(3))}<b id="ci-st-cap">0</b><span>Capacity</span><small>Total places</small></div>
      </div>
      <div class="ci-sticky">
        <span class="sr-only" id="ci-places"></span>
        <div class="ci-search-line">
          <label class="ci-hidden-label" for="ci-search">Search name or booking</label>
          <div class="ci-search-box">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            <input id="ci-search" type="search" placeholder="Search name or booking..." autocomplete="off" value="${UI.esc(view.q)}">
          </div>
          <button type="button" class="btn" id="ci-clear" hidden>Clear</button>
          <div class="ci-filter">
            <button type="button" class="ci-filter-btn" id="ci-filter-btn" aria-expanded="false" aria-controls="ci-filter-menu">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg>
              <span>Filter</span><span class="ci-filter-on" id="ci-filter-on" hidden></span>
            </button>
            <div class="ci-filter-menu" id="ci-filter-menu" role="group" aria-label="Filter people" hidden>${FILTERS.map(([k, label, id]) =>
              `<button type="button" class="ci-tab" data-filter="${k}" aria-pressed="${view.filter === k}">${label}<span class="ci-tab-n" id="${id}">0</span></button>`).join('')}</div>
          </div>
        </div>
      </div>
      <p class="hint" id="ci-walkin-hint" hidden>No spaces left. Ask a club manager to add a walk-in.</p>
      <p class="hint ci-showing" id="ci-showing" role="status"></p>
      <div id="ci-list"></div>
      <div id="ci-pager"></div>
      ${UI.demo('check-ins are saved in this browser only. Other tabs on this device update straight away. The real system would share them across phones and keep working on weak Wi-Fi.')}
    </div>`;
    const root = main.querySelector('.ci-screen');
    view.screen = root;
    root.addEventListener('click', (ev) => {
      const t = ev.target.closest('button');
      if (!t) return;
      if (t.dataset.toggle) { toggle(t.dataset.toggle); return; }
      if (t.dataset.reveal) {
        const id = t.dataset.reveal;
        if (view.revealed.has(id)) view.revealed.delete(id); else view.revealed.add(id);
        drawList(true);
        const again = root.querySelector(`[data-reveal="${CSS.escape(id)}"]`);
        if (again) again.focus({ preventScroll: true });
        return;
      }
      if (t.id === 'ci-filter-btn') { setFilterMenu(root, t.getAttribute('aria-expanded') !== 'true'); return; }
      if (t.dataset.filter) {
        view.filter = t.dataset.filter; view.rpage = 0;
        root.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === view.filter)));
        paintFilterTag(root);
        setFilterMenu(root, false);
        root.querySelector('#ci-filter-btn').focus({ preventScroll: true });
        drawList(false);
        return;
      }
      if (t.dataset.rp) {
        const k = t.dataset.rp, p = view.rpage;
        view.rpage = k === 'first' ? 0 : k === 'last' ? 1e9 : k === 'next' ? p + 1 : k === 'prev' ? p - 1 : Number(t.dataset.n);
        drawList(true);
        const again = k === 'page' ? root.querySelector('.ci-pager .pg-num[aria-current]') : root.querySelector(`.ci-pager [data-rp="${k}"]:not([disabled])`);
        (again || root.querySelector('.ci-pager .pager-info') || root).focus({ preventScroll: true });
        return;
      }
      if (t.id === 'ci-clear') {
        view.q = '';
        const search = root.querySelector('#ci-search');
        search.value = '';
        drawList(false);
        search.focus();
        return;
      }
      if (t.id === 'ci-walkin') openWalkIn();
      if (t.id === 'ci-download') openExport();
    });
    paintFilterTag(root);
    root.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !root.querySelector('#ci-filter-menu').hidden) { setFilterMenu(root, false); root.querySelector('#ci-filter-btn').focus(); }
    });
    if (!view.outsideBound) {
      view.outsideBound = true;
      document.addEventListener('click', (ev) => { if (view.screen && view.screen.isConnected && !ev.target.closest('.ci-filter')) setFilterMenu(view.screen, false); });
    }
    root.querySelector('#ci-search').addEventListener('input', (ev) => { view.q = ev.target.value; view.rpage = 0; drawList(false); });
    /* One match left: Enter checks them in, so the door can run from the keyboard. */
    root.querySelector('#ci-search').addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      const ctx = context(), q = view.q.trim().toLowerCase();
      if (!ctx || !q) return;
      const hits = ctx.rows.filter((r) => matches(r, q));
      if (hits.length === 1 && !hits[0].ticket.checkedInAt) { ev.preventDefault(); toggle(hits[0].ticket.id); }
    });
    root.addEventListener('change', (ev) => {
      if (!ev.target.matches('select[data-rpsize]')) return;
      view.rsize = Number(ev.target.value) || 12; view.rpage = 0;
      drawList(true);
      const sel = root.querySelector('select[data-rpsize]');
      if (sel) sel.focus({ preventScroll: true });
    });
    drawList(false);
  }

  /* Another tab saved: take its data so the count stays right, and do not save over its check-ins later. */
  window.addEventListener('storage', (ev) => {
    if (ev.key !== STORE_KEY || !ev.newValue || !/^#\/checkin/.test(location.hash) || !window.App || !App.state) return;
    let incoming;
    try { incoming = JSON.parse(ev.newValue); } catch (e) { return; }
    incoming.currentUserId = App.state.currentUserId; /* Each tab keeps its own signed-in user. */
    App.state = incoming;
    if (view.screen && document.body.contains(view.screen)) drawList(true);
    else if (!document.querySelector('dialog[open]')) App.render();
  });

  App.route('checkin', {
    title: 'Check-in',
    perm: 'checkin',
    render(main, params) {
      if (params && params[0]) renderList(main, params[0]);
      else { view.screen = null; renderChooser(main); }
    }
  });
})();
