/* Check-in: choose a session, then a phone-first list of people with one tap to check in or undo.
   A tap updates only that row and the count, so the page does not jump and the search text stays. */
(function () {
  'use strict';
  const STORE_KEY = 'events-admin-demo-v1'; /* Same key as app.js, used only to hear changes from another tab. */
  const UPCOMING_LIMIT = 15;
  /* What this screen remembers between renders. */
  const view = { sessionId: null, q: '', sort: 'open', order: [], revealed: new Set(), showAllUpcoming: false, screen: null };

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
    return `<li><a class="ci-session" href="#/checkin/${encodeURIComponent(x.id)}">
      <span class="ci-session-main"><b>${UI.esc(when)} ${UI.esc(e.title)}</b>${meta ? `<span class="muted">${UI.esc(meta)}</span>` : ''}</span>
      <span class="ci-session-count">${inCount} of ${taken} in<span class="ci-chevron" aria-hidden="true">›</span></span></a></li>`;
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
    const shown = view.showAllUpcoming ? upcoming : upcoming.slice(0, UPCOMING_LIMIT);
    main.innerHTML = `<div class="ci-screen" data-screen="chooser">
      ${UI.pageHead('Check-in', '', 'Mark people as arrived and download attendee lists. Choose a session to start.')}
      <h2>Today</h2>
      ${todays.length ? `<ul class="ci-sessions">${todays.map((r) => sessionLink(s, r.e, r.x, false)).join('')}</ul>` : UI.empty('No sessions today.')}
      <h2 class="ci-gap">Upcoming</h2>
      ${shown.length ? `<ul class="ci-sessions">${shown.map((r) => sessionLink(s, r.e, r.x, true)).join('')}</ul>` : UI.empty('No upcoming sessions.')}
      ${shown.length < upcoming.length ? `<button type="button" class="btn ci-more" id="ci-more">Show all ${upcoming.length} upcoming sessions</button>` : ''}
    </div>`;
    const more = main.querySelector('#ci-more');
    if (more) more.addEventListener('click', () => { view.showAllUpcoming = true; renderChooser(main); });
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
    return `<li class="ci-row${t.checkedInAt ? ' is-in' : ''}" data-ticket="${UI.esc(t.id)}">
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
    const rows = q ? ordered.filter((r) => matches(r, q)) : ordered;
    const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.toggle : null;
    const list = root.querySelector('#ci-list');
    list.innerHTML = rows.length ? `<ul class="ci-rows">${rows.map((r) => rowHtml(r, ctx)).join('')}</ul>`
      : UI.empty(ctx.rows.length ? 'No one matches this search.' : 'No one is booked on this session yet.');
    root.querySelector('#ci-showing').textContent = q ? `Showing ${rows.length} of ${ctx.rows.length}` : '';
    root.querySelector('#ci-clear').hidden = !view.q;
    if (focused) { const b = list.querySelector(`[data-toggle="${CSS.escape(focused)}"]`); if (b) b.focus({ preventScroll: true }); }
    updateHead(ctx);
  }
  function updateHead(ctx) {
    const root = view.screen, s = ctx.s, x = ctx.session;
    const taken = Core.sessionTaken(s, x.id), inCount = Core.sessionCheckedIn(s, x.id), left = Core.placesLeft(s, x);
    root.querySelector('#ci-count').textContent = `${inCount} of ${taken} checked in`;
    root.querySelector('#ci-bar').style.width = taken ? `${Math.round(inCount / taken * 100)}%` : '0%';
    root.querySelector('#ci-places').textContent = `${left} ${left === 1 ? 'space' : 'spaces'} left of ${x.capacity}`;
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
    const subtitle = [UI.dateTime(session.start), sessionPosition(event, session), venue ? venue.name : ''].filter(Boolean).join(' · ') + '. Tap a name to mark them as arrived.';
    let walkIn = '';
    if (!session.cancelled && !event.cancelled && App.can('bookings.create')) {
      if (sessionEnd(session) < App.now()) walkIn = '<p class="hint ci-walkin-note">This session has ended, so walk-ins cannot be added.</p>';
      else if (!event.dropInsEnabled || !event.tickets.length) walkIn = '<p class="hint ci-walkin-note">This event has no single-session ticket. Add this person from Bookings.</p>';
      else walkIn = '<button type="button" class="btn" id="ci-walkin">+ Add walk-in</button>';
    }
    const download = App.can('lists.export') ? '<button type="button" class="btn" id="ci-download">Download list</button>' : '';
    main.innerHTML = `<div class="ci-screen" data-screen="list">
      ${back}
      ${UI.pageHead(event.title, '', subtitle)}
      ${session.cancelled ? `<p class="ci-warning">This session is cancelled.</p>` : ''}
      <div class="ci-sticky">
        <div class="ci-count-line"><b id="ci-count" role="status" aria-live="polite"></b><span class="muted" id="ci-places"></span></div>
        <div class="ci-track" aria-hidden="true"><div class="ci-bar" id="ci-bar"></div></div>
        <div class="ci-search-line">
          <label class="ci-hidden-label" for="ci-search">Search name or booking</label>
          <input id="ci-search" type="search" placeholder="Search name or booking..." autocomplete="off" value="${UI.esc(view.q)}">
          <button type="button" class="btn" id="ci-clear" hidden>Clear</button>
        </div>
      </div>
      <div class="ci-tools">
        <div class="ci-sort" role="group" aria-label="Sort the list">
          <button type="button" class="btn" data-sort="open" aria-pressed="${view.sort === 'open'}">Not checked in first</button>
          <button type="button" class="btn" data-sort="alpha" aria-pressed="${view.sort === 'alpha'}">A to Z</button>
        </div>
        <div class="ci-actions">${walkIn}${download}</div>
      </div>
      <p class="hint" id="ci-walkin-hint" hidden>No spaces left. Ask a club manager to add a walk-in.</p>
      <p class="hint ci-showing" id="ci-showing"></p>
      <div id="ci-list"></div>
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
      if (t.dataset.sort) {
        view.sort = t.dataset.sort;
        root.querySelectorAll('[data-sort]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === view.sort)));
        drawList(false);
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
    root.querySelector('#ci-search').addEventListener('input', (ev) => { view.q = ev.target.value; drawList(false); });
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
