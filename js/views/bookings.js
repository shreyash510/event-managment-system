/* Bookings: the list (search, filters, chips, paging, CSV) and the staff booking form.
   #/bookings                      the list
   #/bookings/filter/requests      the list, open cancellation requests only
   #/bookings/filter/missing       the list, details missing only
   #/bookings/?q=text&event=e1     the list with filters set from the link (#/bookings?q=text also works)
   #/bookings/new                  staff booking, #/bookings/new/<eventId> starts on that event
   #/bookings/<id>                 handed to window.BookingDetail */
(function () {
  'use strict';
  const PAGE_SIZE = 25;
  const NEEDS = { requests: 'Cancellation requests', missing: 'Details missing' };
  const STATUSES = ['Confirmed', 'Cancelled'];
  const PAYMENTS = ['Paid', 'Part refunded', 'Refunded', 'Free'];
  const blankFilters = () => ({ q: '', event: '', status: '', payment: '', who: '', needs: '' });
  let filters = blankFilters(), page = 0, lastLink = null, lastUser = null;

  /* App.render reads "#/bookings?q=x" as an unknown area, so move the query behind a slash. */
  const fixHash = () => {
    const m = location.hash.match(/^#\/?bookings\?(.*)$/);
    if (m) location.replace(`#/bookings/?${m[1]}`);
  };
  fixHash();
  window.addEventListener('hashchange', fixHash);

  const linkQuery = () => { const i = location.hash.indexOf('?'); return i < 0 ? '' : location.hash.slice(i + 1); };

  /* ---------- Facts about a booking ---------- */
  const wasMember = (b) => (b.atBooking ? b.atBooking.isMember : b.customer.isMember);
  const hasOpenRequest = (b) => (b.requests || []).some((r) => r.status === 'Open');
  /* Details only need chasing while that person's session is not over, the same test as Today. */
  const needsDetails = (b) => {
    const ids = Core.bookingMissing(App.state, b).map((m) => m.person.id);
    if (!ids.length) return false;
    const now = App.now().getTime();
    return b.tickets.some((t) => {
      if (t.status !== 'active' || !ids.includes(t.personId)) return false;
      const f = Core.findSession(App.state, t.sessionId);
      return f && !f.session.cancelled && new Date(f.session.start).getTime() + (f.session.durationMin || 0) * 60000 > now;
    });
  };
  const activePeople = (b) => b.people.filter((p) => b.tickets.some((t) => t.personId === p.id && t.status === 'active')).length;
  const codeText = (b) => { const c = b.codeId ? Core.findCode(App.state, b.codeId) : null; return c ? c.code : ''; };
  const kindText = (b) => (b.kind === 'block' ? 'Block' : 'Single session');

  const matches = (b, q) => {
    if (!q) return true;
    const hay = [b.ref, b.customer.name, b.customer.email, codeText(b)];
    b.people.forEach((p) => hay.push(p.name, p.email));
    return hay.some((x) => String(x || '').toLowerCase().includes(q));
  };
  function filtered() {
    const q = filters.q.trim().toLowerCase();
    return App.visibleBookings().filter((b) =>
      matches(b, q) &&
      (!filters.event || b.eventId === filters.event) &&
      (!filters.status || Core.bookingStatus(b) === filters.status) &&
      (!filters.payment || Core.paymentStatus(b) === filters.payment) &&
      (!filters.who || (filters.who === 'member') === !!wasMember(b)) &&
      (filters.needs !== 'requests' || hasOpenRequest(b)) &&
      (filters.needs !== 'missing' || needsDetails(b))
    ).sort((a, c) => c.createdAt.localeCompare(a.createdAt) || c.ref.localeCompare(a.ref, 'en', { numeric: true }));
  }
  const anyFilter = () => Object.keys(filters).some((k) => filters[k]);

  /* ---------- List ---------- */
  function readLink(params) {
    const user = App.user().id;
    if (user !== lastUser) { filters = blankFilters(); lastUser = user; lastLink = null; page = 0; }
    const query = linkQuery();
    if (query) {
      /* Apply a link once, so a later re-render does not undo what the user changed. */
      if (query !== lastLink) {
        const u = new URLSearchParams(query);
        filters = blankFilters();
        Object.keys(filters).forEach((k) => { if (u.get(k)) filters[k] = u.get(k); });
        if (!NEEDS[filters.needs]) filters.needs = '';
        lastLink = query; page = 0;
      }
    } else {
      lastLink = null;
      const needs = params[0] === 'filter' && NEEDS[params[1]] ? params[1] : '';
      if (needs !== filters.needs) page = 0;
      filters.needs = needs;
    }
    if (filters.event && !App.visibleEvents().some((e) => e.id === filters.event)) filters.event = '';
  }

  function chipsHtml() {
    const all = App.visibleBookings();
    const counts = { requests: all.filter(hasOpenRequest).length, missing: all.filter(needsDetails).length };
    return Object.keys(NEEDS).map((k) => {
      const on = filters.needs === k;
      return `<a class="bk-chip" href="${on ? '#/bookings' : `#/bookings/filter/${k}`}"${on ? ' aria-current="true"' : ''}>${UI.esc(NEEDS[k])} <b>${counts[k]}</b>${on ? '<span class="bk-chip-x">(on, select to clear)</span>' : ''}</a>`;
    }).join('');
  }

  const columns = [
    { label: 'Reference', html: (b) => `<div class="bk-cell"><a href="#/bookings/${encodeURIComponent(b.id)}"><b>${UI.esc(b.ref)}</b></a><div class="hint">${UI.esc(UI.date(b.createdAt))}</div><div class="hint">${UI.esc(b.source || 'Online')}</div></div>` },
    { label: 'Lead booker', html: (b) => `<div class="bk-cell">${UI.esc(b.customer.name)}<div class="hint">${UI.esc(b.customer.email)}</div>${wasMember(b) ? UI.badge('Member', 'info') : UI.badge('Guest', 'quiet')}</div>` },
    { label: 'Event', html: (b) => { const e = Core.findEvent(App.state, b.eventId), v = Core.findVenue(App.state, e.venueId); return `<div class="bk-cell">${UI.esc(e.title)}<div class="hint">${UI.esc(v ? v.name : '')}</div></div>`; } },
    { label: 'Places', html: (b) => { const code = codeText(b); return `<div class="bk-cell">${activePeople(b)} of ${b.people.length}<div class="hint">${kindText(b)}</div>${code ? `<div class="hint">Code: ${UI.esc(code)}</div>` : ''}</div>`; } },
    { label: 'Status', html: (b) => {
      const st = Core.bookingStatus(b), pay = Core.paymentStatus(b);
      return `<div class="bk-cell bk-badges">${UI.badge(st, st === 'Cancelled' ? 'bad' : 'good')}${UI.badge(pay, pay === 'Refunded' ? 'bad' : pay === 'Part refunded' ? 'warn' : 'quiet')}${hasOpenRequest(b) ? UI.badge('Request open', 'warn') : ''}${needsDetails(b) ? UI.badge('Details missing', 'warn') : ''}</div>`;
    } },
    { label: 'Paid', html: (b) => { const r = Core.refundedTotal(b); return `<div class="bk-cell"><span class="bk-money">${UI.esc(UI.money(Core.paidTotal(b)))}</span>${r > 0 ? `<div class="hint">${UI.esc(UI.money(r))} refunded</div>` : ''}</div>`; } }
  ];

  function renderList(main, params) {
    readLink(params);
    const canAdd = App.can('bookings.create'), canExport = App.can('lists.export');
    const events = App.visibleEvents().slice().sort((a, c) => a.title.localeCompare(c.title));
    const actions = `${canExport ? '<button type="button" class="btn" id="bk-export">Export CSV</button>' : ''}${canAdd ? '<a class="btn btn-primary" href="#/bookings/new">Add booking</a>' : ''}`;
    main.innerHTML = `<div class="bk-screen">
      ${UI.pageHead('Bookings', actions, 'Find any booking, then change, transfer, cancel or refund it.')}
      <div class="bk-chips" role="group" aria-label="Needs action">${chipsHtml()}</div>
      <form class="filters bk-filters" id="bk-filters" role="search">
        <label class="bk-search"><span>Search</span><input type="search" id="bk-q" placeholder="Name, email, reference or code" value="${UI.esc(filters.q)}" autocomplete="off"></label>
        <label><span>Event</span><select id="bk-f-event"><option value="">All events</option>${UI.options(events.map((e) => ({ value: e.id, label: e.title })), filters.event)}</select></label>
        <label><span>Status</span><select id="bk-f-status"><option value="">All</option>${UI.options(STATUSES.map((x) => ({ value: x, label: x })), filters.status)}</select></label>
        <label><span>Payment</span><select id="bk-f-payment"><option value="">All</option>${UI.options(PAYMENTS.map((x) => ({ value: x, label: x })), filters.payment)}</select></label>
        <label><span>Member or guest</span><select id="bk-f-who"><option value="">All</option>${UI.options([{ value: 'member', label: 'Member' }, { value: 'guest', label: 'Guest' }], filters.who)}</select></label>
        <button type="button" class="btn btn-ghost" id="bk-clear">Clear filters</button>
      </form>
      <p class="bk-summary" id="bk-summary" tabindex="-1" aria-live="polite"></p>
      <div id="bk-results"></div>
      <div class="bk-pager row" id="bk-pager"></div>
    </div>`;

    const paint = () => {
      const rows = filtered();
      const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      page = Math.min(page, pages - 1);
      const start = page * PAGE_SIZE, shown = rows.slice(start, start + PAGE_SIZE);
      const word = rows.length === 1 ? 'booking' : 'bookings';
      main.querySelector('#bk-summary').textContent = rows.length
        ? `Showing ${start + 1} to ${start + shown.length} of ${rows.length} ${word}`
        : 'No bookings to show';
      main.querySelector('#bk-results').innerHTML = `<div class="bk-list">${UI.table(columns, shown, { emptyText: 'No bookings match these filters.' })}</div>`;
      main.querySelector('#bk-pager').innerHTML = pages > 1
        ? `<button type="button" class="btn btn-small" id="bk-prev"${page === 0 ? ' disabled' : ''}>Previous</button><span class="muted">Page ${page + 1} of ${pages}</span><button type="button" class="btn btn-small" id="bk-next"${page >= pages - 1 ? ' disabled' : ''}>Next</button>`
        : '';
      main.querySelector('#bk-clear').hidden = !anyFilter();
      const ex = main.querySelector('#bk-export');
      if (ex) ex.disabled = !rows.length;
    };
    const change = () => { page = 0; paint(); };

    main.querySelector('#bk-filters').addEventListener('submit', (ev) => ev.preventDefault());
    main.querySelector('#bk-q').addEventListener('input', (ev) => { filters.q = ev.target.value; change(); });
    [['#bk-f-event', 'event'], ['#bk-f-status', 'status'], ['#bk-f-payment', 'payment'], ['#bk-f-who', 'who']].forEach(([sel, key]) => {
      main.querySelector(sel).addEventListener('change', (ev) => { filters[key] = ev.target.value; change(); });
    });
    main.querySelector('#bk-clear').addEventListener('click', () => {
      filters = blankFilters(); page = 0; lastLink = null;
      App.go('#/bookings');
    });
    main.querySelector('#bk-pager').addEventListener('click', (ev) => {
      const id = ev.target.id;
      if (id !== 'bk-prev' && id !== 'bk-next') return;
      page += id === 'bk-next' ? 1 : -1;
      paint();
      main.querySelector('#bk-summary').focus();
    });
    const ex = main.querySelector('#bk-export');
    if (ex) ex.addEventListener('click', exportCSV);
    paint();
  }

  function exportCSV() {
    if (!App.can('lists.export')) { UI.toast('Your role cannot export lists.', 'bad'); return; }
    const rows = filtered();
    if (!rows.length) return;
    /* Answers to custom questions stay out, because they can be sensitive. */
    const head = ['Reference', 'Booked on', 'Event', 'Venue', 'Lead booker', 'Email', 'Phone', 'Member or guest', 'People', 'People still active', 'Booking type', 'Code', 'Source', 'Channel', 'Status', 'Payment', 'Paid', 'Refunded', 'Details missing', 'Open request'];
    const body = rows.map((b) => {
      const e = Core.findEvent(App.state, b.eventId), v = Core.findVenue(App.state, e.venueId);
      return [b.ref, b.createdAt.replace('T', ' '), e.title, v ? v.name : '', b.customer.name, b.customer.email, b.customer.phone, wasMember(b) ? 'Member' : 'Guest',
        b.people.length, activePeople(b), kindText(b), codeText(b), b.source || 'Online', b.channel || 'Website', Core.bookingStatus(b), Core.paymentStatus(b),
        Core.paidTotal(b), Core.refundedTotal(b), needsDetails(b) ? 'Yes' : 'No', hasOpenRequest(b) ? 'Yes' : 'No'];
    });
    UI.downloadCSV(`bookings-${Core.dayKey(App.now())}.csv`, [head].concat(body));
    App.log('Export', `Bookings list exported: ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}${anyFilter() ? ' (filtered)' : ''}.`);
    App.save();
    UI.toast(`Exported ${rows.length} ${rows.length === 1 ? 'booking' : 'bookings'}. This is recorded in the activity log.`);
  }

  /* ---------- Staff booking form ---------- */
  const ticketsOpen = (e, now) => e.tickets.filter((t) => !t.salesEnd || new Date(t.salesEnd) >= now);
  const kindsFor = (e, now) => {
    const out = [];
    if (e.dropInsEnabled !== false && ticketsOpen(e, now).length) out.push('dropin');
    if (e.block && e.block.enabled) out.push('block');
    return out;
  };
  const bookableEvents = (now) => App.visibleEvents()
    .filter((e) => !e.draft && !e.cancelled && Core.remainingSessions(e, now).length && kindsFor(e, now).length)
    .sort((a, c) => a.title.localeCompare(c.title));
  const blankPerson = () => ({ name: '', email: '', answers: {} });
  const validEmail = (x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);

  function renderNew(main, startEventId) {
    if (!App.can('bookings.create')) { main.innerHTML = UI.empty('Your role cannot add bookings.'); return; }
    if (!bookableEvents(App.now()).length) {
      main.innerHTML = `<div class="bk-screen">${UI.pageHead('Add booking', '<a class="btn" href="#/bookings">Back to Bookings</a>', 'For a phone call or a walk-in. Staff bookings are marked with their source.')}${UI.empty('No events at this venue can take a booking right now.')}</div>`;
      return;
    }
    const f = {
      eventId: startEventId || '', lastEventId: '', kind: '', ticketTypeId: '', sessionId: '', qty: 1, who: 'guest', code: '', source: 'Phone', method: 'Card',
      comp: false, compReason: '', overrideReason: '',
      lead: { name: '', email: '', phone: '', consent: false, answers: {} }, guests: []
    };

    /* Keep every choice valid for the event in view. */
    const settle = () => {
      const now = App.now(), list = bookableEvents(now);
      if (!list.some((e) => e.id === f.eventId)) f.eventId = list[0].id;
      const e = Core.findEvent(App.state, f.eventId);
      if (f.eventId !== f.lastEventId) {
        f.lastEventId = f.eventId; f.sessionId = ''; f.ticketTypeId = ''; f.lead.answers = {};
        f.guests.forEach((g) => { g.answers = {}; });
      }
      const kinds = kindsFor(e, now);
      if (!kinds.includes(f.kind)) f.kind = kinds[0];
      const open = ticketsOpen(e, now);
      if (!open.some((t) => t.id === f.ticketTypeId)) f.ticketTypeId = open.length ? open[0].id : '';
      const rem = Core.remainingSessions(e, now);
      if (!rem.some((x) => x.id === f.sessionId)) {
        const withRoom = rem.find((x) => Core.placesLeft(App.state, x) > 0);
        f.sessionId = (withRoom || rem[0]).id;
      }
      const max = Math.max(1, e.maxPerBooking || 6);
      f.qty = Math.min(Math.max(1, Number(f.qty) || 1), max);
      while (f.guests.length < f.qty - 1) f.guests.push(blankPerson());
      f.guests.length = f.qty - 1;
      if (f.source === 'Phone') f.method = 'Card';
      if (!App.can('bookings.comp')) f.comp = false;
      return { e, now, rem, max };
    };
    const sessionIds = (e, now) => (f.kind === 'block' ? Core.remainingSessions(e, now).map((x) => x.id) : [f.sessionId]);
    const codeCheck = (e, now) => {
      if (!f.code.trim()) return null;
      const code = Core.findCodeByName(App.state, f.code);
      const v = Core.validateCode(App.state, code, e, now, f.lead.email);
      return v.ok ? { ok: true, code } : { ok: false, reason: v.reason };
    };
    /* Decision 7: a block that has already started is priced by staff, per person. */
    const lateBlock = (e, now) => {
      if (f.kind !== 'block' || f.comp) return null;
      const all = e.sessions.filter((x) => !x.cancelled).length, left = Core.remainingSessions(e, now).length;
      if (!all || left >= all) return null;
      return { all, left, suggested: Core.round2(((e.block && e.block.price) || 0) * left / all) };
    };
    const setPriceValue = () => { const n = Number(f.latePrice); return f.latePrice !== '' && f.latePrice !== undefined && Number.isFinite(n) && n >= 0 ? n : null; };
    const quoteNow = (e, now) => {
      const q = quoteBase(e, now);
      const value = setPriceValue();
      return lateBlock(e, now) && value !== null ? Core.applySetPrice(q, value) : q;
    };
    const quoteBase = (e, now) => {
      const c = codeCheck(e, now);
      return Core.quote({
        event: e, kind: f.kind, ticketTypeId: f.ticketTypeId, qty: f.qty, isMember: !f.comp && f.who === 'member',
        code: !f.comp && c && c.ok ? c.code : null, settings: App.state.settings
      });
    };

    const questionField = (q, idStart, bindStart, value, needed) => {
      const id = `${idStart}-q-${q.id}`, bind = `${bindStart}.answers.${q.id}`;
      const label = `<span>${UI.esc(q.label)}${needed ? ' (needed)' : ''}</span>`;
      const control = q.type === 'choice'
        ? `<select id="${UI.esc(id)}" data-bind="${UI.esc(bind)}"><option value="">Choose</option>${UI.options((q.options || []).map((o) => ({ value: o, label: o })), value || '')}</select>`
        : `<input type="text" id="${UI.esc(id)}" data-bind="${UI.esc(bind)}" value="${UI.esc(value || '')}">`;
      return `<label class="field">${label}${control}</label>`;
    };
    const textField = (label, id, bind, value, type, needed, extra) =>
      `<label class="field"><span>${UI.esc(label)}${needed ? ' (needed)' : ''}</span><input type="${type || 'text'}" id="${id}" data-bind="${bind}" value="${UI.esc(value)}" ${extra || ''}></label>`;
    const leadQuestions = (e) => (e.questions || []);
    const guestQuestions = (e) => (e.guestDetails === 'lead' ? [] : (e.questions || []).filter((q) => q.scope !== 'booking'));
    const radio = (name, id, value, label, on) => `<label class="check"><input type="radio" name="${name}" id="${id}" value="${value}" data-bind="${name}" data-repaint${on ? ' checked' : ''}> <span>${UI.esc(label)}</span></label>`;

    function leftHtml(ctx) {
      const { e, now, rem, max } = ctx;
      const s = App.state, kinds = kindsFor(e, now), status = Core.eventStatus(s, e, now);
      const byLink = e.collectAt === 'link';
      const opts = bookableEvents(now).map((x) => {
        const v = Core.findVenue(s, x.venueId);
        return { value: x.id, label: `${x.title} · ${v ? v.name : ''} · ${Core.eventStatus(s, x, now)}` };
      });
      const short = Core.capacityShortfall(s, sessionIds(e, now), f.qty);
      const left = f.kind === 'block' ? Core.blockPlacesLeft(s, e, now) : Core.placesLeft(s, rem.find((x) => x.id === f.sessionId));
      const statusHint = status === 'On sale' ? '' : `<p class="hint">Online status: ${UI.esc(status)}. Staff can still add a booking here.</p>`;
      const blockText = `Block, all ${rem.length} remaining ${rem.length === 1 ? 'session' : 'sessions'}`;
      const kindPart = kinds.length > 1
        ? `<fieldset class="bk-fieldset"><legend>Booking type</legend>${radio('kind', 'bk-kind-dropin', 'dropin', 'Single session', f.kind === 'dropin')}${radio('kind', 'bk-kind-block', 'block', blockText, f.kind === 'block')}</fieldset>`
        : `<p class="hint">Booking type: ${f.kind === 'block' ? UI.esc(blockText) : 'Single session'}.</p>`;
      const ticketsPart = f.kind === 'dropin'
        ? `<label class="field"><span>Ticket type</span><select id="bk-ticket" data-bind="ticketTypeId" data-repaint>${UI.options(ticketsOpen(e, now).map((t) => ({ value: t.id, label: `${t.name}, ${UI.money(t.price)}` })), f.ticketTypeId)}</select></label>
           <label class="field"><span>Session</span><select id="bk-session" data-bind="sessionId" data-repaint>${UI.options(rem.map((x) => { const n = Core.placesLeft(s, x); return { value: x.id, label: `${UI.date(x.start)}, ${UI.time(x.start)} · ${n ? `${n} ${n === 1 ? 'place' : 'places'} left` : 'Full'}` }; }), f.sessionId)}</select></label>`
        : `<div class="field"><span class="bk-label">Sessions in this block</span><ul class="bk-sessions">${rem.map((x) => { const n = Core.placesLeft(s, x); return `<li>${UI.esc(UI.date(x.start))}, ${UI.esc(UI.time(x.start))} · ${n ? `${n} left` : 'Full'}</li>`; }).join('')}</ul></div>`;
      const qtyOpts = Array.from({ length: max }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
      const shortPart = short.length
        ? `<div class="bk-warn" role="status"><b>Not enough spaces for ${f.qty} ${f.qty === 1 ? 'ticket' : 'tickets'}.</b><ul>${short.map((x) => `<li>${UI.esc(UI.date(x.session.start))}, ${UI.esc(UI.time(x.session.start))}: ${x.left} left</li>`).join('')}</ul>${App.can('override')
          ? `<label class="field"><span>Reason for going over the limit (needed)</span><input type="text" id="bk-override" data-bind="overrideReason" value="${UI.esc(f.overrideReason)}"></label><p class="hint">Going over the limit is recorded in the activity log.</p>`
          : '<p>Your role cannot go over the limit. Ask a club manager.</p>'}</div>`
        : `<p class="hint">${left} ${left === 1 ? 'place' : 'places'} left${f.kind === 'block' ? ' across the block' : ' on this session'}.</p>`;

      const guestHelp = e.guestDetails === 'lead'
        ? `<p class="hint">This event only collects the lead booker's details, so the other ${f.qty === 2 ? 'place is' : 'places are'} added without names.</p>`
        : byLink ? '<p class="hint">This event collects guest details by a link sent after payment. Fill in what you have now. Anything left blank shows as details missing.</p>' : '';
      const guestsPart = f.qty > 1
        ? `<section class="card"><h2>Guests</h2>${guestHelp}${e.guestDetails === 'lead' ? '' : f.guests.map((g, i) => `
            <fieldset class="bk-fieldset"><legend>Guest ${i + 1}</legend>
              ${textField('Name', `bk-g${i}-name`, `guests.${i}.name`, g.name, 'text', !byLink)}
              ${e.guestDetails === 'nameEmail' ? textField('Email', `bk-g${i}-email`, `guests.${i}.email`, g.email, 'email', !byLink) : ''}
              ${guestQuestions(e).map((q) => questionField(q, `bk-g${i}`, `guests.${i}`, g.answers[q.id], q.required && !byLink)).join('')}
            </fieldset>`).join('')}</section>`
        : '';
      return `
        <section class="card"><h2>What they are booking</h2>
          <label class="field"><span>Event</span><select id="bk-event" data-bind="eventId" data-repaint>${UI.options(opts, f.eventId)}</select></label>
          ${statusHint}${kindPart}${ticketsPart}
          <label class="field bk-qty"><span>Tickets</span><select id="bk-qty" data-bind="qty" data-repaint>${UI.options(qtyOpts, f.qty)}</select></label>
          <div id="bk-capacity">${shortPart}</div>
        </section>
        <section class="card"><h2>Lead booker</h2>
          <fieldset class="bk-fieldset bk-plain"><legend>Member or guest</legend>${radio('who', 'bk-who-guest', 'guest', 'Guest', f.who === 'guest')}${radio('who', 'bk-who-member', 'member', 'Member', f.who === 'member')}</fieldset>
          ${UI.demo('Membership is not checked against a member system here. Staff choose it.')}
          ${textField('Name', 'bk-lead-name', 'lead.name', f.lead.name, 'text', true, 'autocomplete="off"')}
          ${textField('Email', 'bk-lead-email', 'lead.email', f.lead.email, 'email', true, 'autocomplete="off"')}
          ${textField('Phone', 'bk-lead-phone', 'lead.phone', f.lead.phone, 'tel', false, 'autocomplete="off"')}
          ${leadQuestions(e).map((q) => questionField(q, 'bk-lead', 'lead', f.lead.answers[q.id], q.required && !byLink)).join('')}
          <label class="check"><input type="checkbox" id="bk-consent" data-bind="lead.consent"${f.lead.consent ? ' checked' : ''}> <span>Said yes to marketing messages</span></label>
        </section>
        ${guestsPart}`;
    }

    function rightHtml(ctx) {
      const { e, now } = ctx;
      const short = Core.capacityShortfall(App.state, sessionIds(e, now), f.qty);
      const blocked = short.length && !App.can('override');
      const compPart = App.can('bookings.comp')
        ? `<label class="check"><input type="checkbox" id="bk-comp" data-bind="comp" data-repaint${f.comp ? ' checked' : ''}> <span>Give a free place</span></label>
           ${f.comp ? `<label class="field"><span>Reason for the free place (needed)</span><input type="text" id="bk-comp-reason" data-bind="compReason" value="${UI.esc(f.compReason)}"></label>` : ''}`
        : '';
      return `<section class="card bk-summary-card"><h2>Price and payment</h2>
          <fieldset class="bk-fieldset bk-plain"><legend>Source</legend>${radio('source', 'bk-src-phone', 'Phone', 'Phone', f.source === 'Phone')}${radio('source', 'bk-src-walkin', 'Walk-in', 'Walk-in', f.source === 'Walk-in')}</fieldset>
          <label class="field"><span>Discount code</span><input type="text" id="bk-code" data-bind="code" value="${UI.esc(f.code)}" autocomplete="off"${f.comp ? ' disabled' : ''}></label>
          <p class="hint" id="bk-code-msg" aria-live="polite"></p>
          ${compPart}
          ${f.comp ? '' : `<label class="field"><span>Payment method</span><select id="bk-method" data-bind="method">${UI.options(f.source === 'Phone' ? [{ value: 'Card', label: 'Card' }] : [{ value: 'Card', label: 'Card' }, { value: 'Cash', label: 'Cash' }], f.method)}</select></label>`}
          ${(() => { const late = lateBlock(e, now); return late ? `<label class="field"><span>Price per person for the ${late.left} sessions left (needed)</span><input type="number" min="0" step="0.01" id="bk-late-price" data-bind="latePrice" value="${UI.esc(f.latePrice === undefined ? '' : f.latePrice)}"></label><p class="hint">This block has started. ${late.left} of ${late.all} sessions are left, so staff set the price. Suggested: ${UI.esc(UI.money(late.suggested))}. Member prices and codes do not apply.</p>` : ''; })()}
          <div id="bk-price" aria-live="polite"></div>
          ${UI.demo('Payment is simulated. No card is charged, and no email or Klaviyo message is really sent.')}
          <div id="bk-error" class="form-error" role="alert" hidden></div>
          <button type="button" class="btn btn-primary bk-submit" id="bk-submit"${blocked ? ' disabled' : ''}></button>
          ${blocked ? '<p class="hint">There are not enough spaces, so your role cannot book this.</p>' : ''}
          <a class="btn btn-ghost bk-submit" href="#/bookings">Cancel</a>
        </section>`;
    }

    function paintPrice() {
      const { e, now } = settle();
      const q = quoteNow(e, now), c = codeCheck(e, now);
      const total = f.comp ? 0 : q.total;
      const line = (label, value, cls) => `<div class="bk-line ${cls || ''}"><span>${UI.esc(label)}</span><span>${UI.esc(value)}</span></div>`;
      const off = (n) => `−${UI.money(n)}`;
      let html = line(`${q.qty} × ${UI.money(q.unit)}`, UI.money(q.subtotal));
      if (f.comp) html += line('Free place', off(q.subtotal));
      else {
        if (q.memberDiscount > 0) html += line('Member price', off(q.memberDiscount));
        if (q.codeDiscount > 0) html += line('Discount code', off(q.codeDiscount));
      }
      html += line('Total', UI.money(total), 'bk-total');
      main.querySelector('#bk-price').innerHTML = html;
      const msg = main.querySelector('#bk-code-msg');
      if (f.comp) msg.textContent = f.code.trim() ? 'A free place does not use a code.' : '';
      else if (!c) msg.textContent = '';
      else if (!c.ok) msg.textContent = c.reason;
      else msg.textContent = q.note || 'Code applied.';
      main.querySelector('#bk-submit').textContent = f.comp ? 'Add free place' : (total > 0 ? `Take ${UI.money(total)} and book` : 'Add booking');
      if (lateBlock(e, now) && setPriceValue() === null) {
        main.querySelector('#bk-price').innerHTML = '<p class="hint">Enter the price per person to see the total.</p>';
        main.querySelector('#bk-submit').textContent = 'Add booking';
      }
    }

    function paint() {
      const focusId = document.activeElement && document.activeElement.id;
      const ctx = settle();
      main.querySelector('#bk-left').innerHTML = leftHtml(ctx);
      main.querySelector('#bk-right').innerHTML = rightHtml(ctx);
      paintPrice();
      const again = focusId ? document.getElementById(focusId) : null;
      if (again && !again.disabled) again.focus();
    }

    function setPath(path, value) {
      const keys = path.split('.');
      let o = f;
      keys.slice(0, -1).forEach((k) => { o = o[k]; });
      o[keys[keys.length - 1]] = value;
    }

    function check(e) {
      const errors = [], add = (text, id) => errors.push({ text, id });
      const byLink = e.collectAt === 'link';
      if (!f.lead.name.trim()) add('Enter the lead booker\'s name.', 'bk-lead-name');
      if (!f.lead.email.trim()) add('Enter the lead booker\'s email.', 'bk-lead-email');
      else if (!validEmail(f.lead.email.trim())) add('The lead booker\'s email does not look right.', 'bk-lead-email');
      if (!byLink) leadQuestions(e).forEach((q) => { if (q.required && !String(f.lead.answers[q.id] || '').trim()) add(`Answer: ${q.label}`, `bk-lead-q-${q.id}`); });
      if (e.guestDetails !== 'lead') {
        f.guests.forEach((g, i) => {
          if (!byLink && !g.name.trim()) add(`Enter a name for guest ${i + 1}.`, `bk-g${i}-name`);
          if (e.guestDetails === 'nameEmail') {
            if (!byLink && !g.email.trim()) add(`Enter an email for guest ${i + 1}.`, `bk-g${i}-email`);
            else if (g.email.trim() && !validEmail(g.email.trim())) add(`The email for guest ${i + 1} does not look right.`, `bk-g${i}-email`);
          }
          if (!byLink) guestQuestions(e).forEach((q) => { if (q.required && !String(g.answers[q.id] || '').trim()) add(`Guest ${i + 1}: answer ${q.label}`, `bk-g${i}-q-${q.id}`); });
        });
      }
      return errors;
    }

    function showErrors(errors) {
      const box = main.querySelector('#bk-error');
      main.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
      box.hidden = !errors.length;
      box.innerHTML = errors.length ? `<ul>${errors.map((x) => `<li>${UI.esc(x.text)}</li>`).join('')}</ul>` : '';
      errors.forEach((x) => { const el = x.id && document.getElementById(x.id); if (el) el.setAttribute('aria-invalid', 'true'); });
      const first = errors.find((x) => x.id && document.getElementById(x.id));
      if (first) document.getElementById(first.id).focus();
    }

    function submit() {
      /* Everything is checked again here, from the current data, not from what the screen showed. */
      if (!App.can('bookings.create')) { showErrors([{ text: 'Your role cannot add bookings.' }]); return; }
      const { e, now } = settle();
      if (!App.inVenue(e.venueId) || !Core.canSeeVenue(App.user(), e.venueId)) { showErrors([{ text: 'This event is not at a venue you can book for.' }]); return; }
      const ids = sessionIds(e, now);
      const short = Core.capacityShortfall(App.state, ids, f.qty);
      const comp = !!f.comp, compReason = f.compReason.trim(), overrideReason = f.overrideReason.trim();
      const errors = check(e);
      const allowed = Core.manualBookingAllowed(App.role(), { comp, compReason, short: short.length > 0, overrideReason });
      if (!allowed.ok) errors.push({ text: allowed.reason, id: comp && !compReason ? 'bk-comp-reason' : (short.length ? 'bk-override' : '') });
      const late = lateBlock(e, now);
      if (late && setPriceValue() === null) errors.push({ text: 'This block has started. Enter the price per person.', id: 'bk-late-price' });
      const c = comp ? null : codeCheck(e, now);
      if (c && !c.ok) errors.push({ text: `Discount code: ${c.reason} Fix it or clear the box.`, id: 'bk-code' });
      if (errors.length) { showErrors(errors); return; }

      const by = App.user().name, s = App.state;
      const code = c && c.ok ? c.code : null;
      const q = quoteNow(e, now);
      const payment = comp ? 'Free place' : (q.total > 0 ? f.method : 'No payment');
      const customer = {
        name: f.lead.name.trim(), email: f.lead.email.trim(), phone: f.lead.phone.trim(), isMember: f.who === 'member',
        marketingConsent: !!f.lead.consent, answers: Object.assign({}, f.lead.answers)
      };
      const guests = f.guests.map((g) => ({
        name: e.guestDetails === 'lead' ? '' : g.name.trim(),
        email: e.guestDetails === 'nameEmail' ? g.email.trim() : '',
        answers: e.guestDetails === 'lead' ? {} : Object.assign({}, g.answers)
      }));
      const b = Core.createBooking(s, {
        event: e, kind: f.kind, sessionIds: ids, ticketTypeId: f.ticketTypeId, customer, guests, code, payment,
        source: f.source, channel: f.source, by, now, comp, compReason, setPrice: late ? setPriceValue() : null
      });
      const money = UI.money(b.pricing.total);
      App.log('Staff booking', `${b.ref}: ${e.title}, ${f.qty} ${f.qty === 1 ? 'ticket' : 'tickets'}, ${money}, source ${f.source}, ${payment}.`);
      if (comp) {
        Core.logBooking(b, now, by, `Free place given. Reason: ${compReason}.`);
        App.log('Free place', `${b.ref}: ${e.title}. Reason: ${compReason}`);
      }
      if (short.length) {
        const where = short.map((x) => `${UI.date(x.session.start)} (${x.left} left)`).join(', ');
        Core.logBooking(b, now, by, `Went over the limit by staff override: ${where}. Reason: ${overrideReason}.`);
        App.log('Override', `${b.ref}: ${e.title}, ${f.qty} ${f.qty === 1 ? 'ticket' : 'tickets'} over the limit on ${where}. Reason: ${overrideReason}`);
      }
      Core.logBooking(b, now, by, 'Confirmation email sent (demo, not really sent).');
      Core.klaviyo(s, { at: now, type: 'Booking confirmed', ref: b.ref });
      if (e.collectAt === 'link' && guests.length && e.guestDetails !== 'lead') Core.logBooking(b, now, by, 'Guest details link sent to the lead booker (demo, not really sent).');
      App.save();
      UI.toast(`Booking ${b.ref} added. Payment and email are simulated in this demo.`);
      App.go(`#/bookings/${encodeURIComponent(b.id)}`);
    }

    main.innerHTML = `<div class="bk-screen">
      ${UI.pageHead('Add booking', '<a class="btn" href="#/bookings">Back to Bookings</a>', 'For a phone call or a walk-in. Staff bookings are marked with their source.')}
      <form class="bk-new" id="bk-new" novalidate><div id="bk-left"></div><div id="bk-right"></div></form>
    </div>`;
    const form = main.querySelector('#bk-new');
    form.addEventListener('submit', (ev) => { ev.preventDefault(); submit(); });
    form.addEventListener('input', (ev) => {
      const el = ev.target;
      if (!el.dataset || !el.dataset.bind) return;
      if (el.type === 'radio' && !el.checked) return;
      setPath(el.dataset.bind, el.type === 'checkbox' ? el.checked : el.value);
      if (el.id === 'bk-code' || el.id === 'bk-late-price') paintPrice();
    });
    form.addEventListener('change', (ev) => {
      const el = ev.target;
      if (!el.dataset || el.dataset.repaint === undefined) return;
      if (el.dataset.bind) setPath(el.dataset.bind, el.type === 'checkbox' ? el.checked : el.value);
      paint();
    });
    form.addEventListener('click', (ev) => { if (ev.target.id === 'bk-submit') submit(); });
    paint();
  }

  /* ---------- Route ---------- */
  App.route('bookings', {
    title: 'Bookings',
    perm: 'bookings.view',
    render(main, params) {
      const clean = params.map((p) => String(p).split('?')[0]).filter(Boolean);
      const first = clean[0];
      if (first === 'new') {
        const fromLink = new URLSearchParams(linkQuery()).get('event');
        renderNew(main, clean[1] || fromLink || '');
        return;
      }
      if (first && first !== 'filter') {
        if (window.BookingDetail && typeof window.BookingDetail.render === 'function') window.BookingDetail.render(main, first);
        else main.innerHTML = `${UI.empty('The booking page is not available right now.')}<p><a href="#/bookings">Back to Bookings</a></p>`;
        return;
      }
      renderList(main, clean);
    }
  });
})();
