/* Customer pages: find an event and book tickets for yourself, and see the tickets you have booked.
   Only the Customer role sees these. Staff book for other people from the Bookings page. */
(function () {
  'use strict';
  const S = () => App.state;
  const esc = (v) => UI.esc(v);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const emailKey = (v) => String(v || '').trim().toLowerCase();

  /* ---------- Find events ---------- */
  const eventsOnSale = () => App.visibleEvents()
    .filter((e) => Core.eventStatus(S(), e, App.now()) === 'On sale')
    .map((e) => ({ e, next: Core.remainingSessions(e, App.now())[0] }))
    .sort((a, b) => a.next.start.localeCompare(b.next.start));

  /* What can be bought on this event right now: single sessions, a whole block, or both. */
  function options(e) {
    const now = App.now(), s = S();
    const ticket = Core.currentTicket(s, e, now);
    const sessions = e.dropInsEnabled === false ? [] : Core.remainingSessions(e, now).map((x) => ({ session: x, left: Core.dropInLeft(s, e, x) })).filter((x) => x.left > 0);
    const blockSessions = Core.blockSaleOpen(e, now) ? Core.remainingSessions(e, now) : [];
    const blockLeft = blockSessions.length ? Core.blockPlacesLeft(s, e, now) : 0;
    return { ticket, sessions, block: blockLeft > 0 ? { sessions: blockSessions, left: blockLeft } : null };
  }

  function card({ e, next }) {
    const v = Core.findVenue(S(), e.venueId), type = Core.findType(S(), e.typeId), o = options(e);
    const from = o.sessions.length && o.ticket ? o.ticket.price : (o.block ? e.block.price : null);
    const low = o.sessions.some((x) => Core.isLowSpace(S(), e, x.session));
    const bookable = !!(o.ticket && o.sessions.length) || !!o.block;
    return `<article class="card tk-card">
      <div class="tk-meta">${type ? UI.badge(type.name, 'info') : ''}${low ? UI.badge('Few spaces left', 'warn') : ''}</div>
      <h2>${esc(e.title)}</h2>
      <p class="muted">${esc(v ? v.name : '')} · Next: ${esc(UI.dateTime(next.start))}</p>
      ${e.description ? `<p>${esc(e.description)}</p>` : ''}
      <div class="tk-foot"><span class="tk-price">${from === null ? '' : `From <b>${UI.money(from)}</b>`}</span>
        <button type="button" class="btn btn-primary" data-book="${esc(e.id)}"${bookable ? '' : ' disabled'}>Book tickets</button></div>
    </article>`;
  }

  function renderBrowse(main) {
    const rows = eventsOnSale();
    main.innerHTML = UI.pageHead('Find events', '', 'Choose an event, pick a session and book your tickets.') +
      (rows.length ? `<div class="tk-grid">${rows.map(card).join('')}</div>` : UI.empty('There is nothing on sale at the moment. Try another venue, or come back soon.'));
    main.querySelectorAll('[data-book]').forEach((b) => b.addEventListener('click', () => bookDialog(b.dataset.book)));
  }

  /* ---------- Book ---------- */
  function bookDialog(eventId) {
    const user = App.user(), e = Core.findEvent(S(), eventId);
    if (!App.can('browse')) { UI.toast('Only customers can book here.', 'bad'); return; }
    if (!e || Core.eventStatus(S(), e, App.now()) !== 'On sale') { UI.toast('This event is no longer on sale.', 'bad'); App.render(); return; }
    const o = options(e), v = Core.findVenue(S(), e.venueId);
    const kinds = [];
    if (o.ticket && o.sessions.length) kinds.push({ value: 'dropin', label: 'One session' });
    if (o.block) kinds.push({ value: 'block', label: `All ${plural(o.block.sessions.length, 'session')} (${UI.money(e.block.price)} each person)` });
    if (!kinds.length) { UI.toast('There are no places left to book.', 'bad'); return; }
    const sessionOpts = o.sessions.map((x) => ({ value: x.session.id, label: `${UI.dateTime(x.session.start)} · ${plural(x.left, 'place')} left` }));

    UI.dialog({
      title: `Book ${e.title}`,
      body: `<p class="muted">${esc(v ? v.name : '')}. Booking as ${esc(user.name.replace(' (demo customer)', ''))} (${esc(user.email || 'no email')}).</p>
        ${kinds.length > 1 ? `<label class="field"><span>What do you want to book?</span><select id="tk-kind">${UI.options(kinds, kinds[0].value)}</select></label>` : `<input type="hidden" id="tk-kind" value="${esc(kinds[0].value)}">`}
        <label class="field" id="tk-session-wrap"><span>Session</span><select id="tk-session">${UI.options(sessionOpts, sessionOpts.length ? sessionOpts[0].value : '')}</select></label>
        <label class="field"><span>Number of tickets</span><select id="tk-qty"></select></label>
        <label class="field"><span>Discount code (optional)</span><input id="tk-code" type="text" maxlength="40" autocomplete="off"></label>
        <div id="tk-summary" class="tk-summary" role="status" aria-live="polite"></div>
        ${UI.demo('no payment is taken. The booking is confirmed straight away.')}`,
      onOpen: (d) => {
        const q = (sel) => d.querySelector(sel);
        const state = () => {
          const kind = q('#tk-kind').value;
          const sessionIds = kind === 'block' ? o.block.sessions.map((x) => x.id) : [q('#tk-session').value];
          const left = kind === 'block' ? o.block.left : ((o.sessions.find((x) => x.session.id === sessionIds[0]) || {}).left || 0);
          return { kind, sessionIds, max: Math.max(1, Math.min(e.maxPerBooking || 6, left)) };
        };
        const codeState = () => {
          const text = q('#tk-code').value.trim();
          if (!text) return { code: null, note: '' };
          const code = Core.findCodeByName(S(), text), r = Core.validateCode(S(), code, e, App.now(), user.email);
          if (!r.ok) return { code: null, note: r.reason };
          if (code.usageCap && Core.codeUsesLeft(S(), code, App.now()) <= 0) return { code: null, note: 'This code has been used the most times allowed.' };
          return { code, note: '' };
        };
        const refreshQty = () => {
          const { max } = state(), keep = Number(q('#tk-qty').value) || 1;
          q('#tk-qty').innerHTML = UI.options(Array.from({ length: max }, (_, i) => ({ value: i + 1, label: String(i + 1) })), Math.min(keep, max));
        };
        const refreshSummary = () => {
          const { kind } = state(), { code, note } = codeState();
          const quote = Core.quote({ event: e, kind, ticketTypeId: o.ticket ? o.ticket.id : undefined, qty: Number(q('#tk-qty').value) || 1, isMember: false, code, settings: S().settings });
          q('#tk-summary').innerHTML = `${note ? `<p class="hint">${esc(note)}</p>` : ''}${quote.codeDiscount > 0 ? `<p class="hint">Code saves ${UI.money(quote.codeDiscount)}.</p>` : ''}<p class="tk-total">Total <b>${UI.money(quote.total)}</b> for ${plural(quote.qty, 'ticket')}</p>`;
        };
        const sync = () => { q('#tk-session-wrap').hidden = state().kind === 'block'; refreshQty(); refreshSummary(); };
        ['#tk-kind', '#tk-session'].forEach((sel) => q(sel).addEventListener('change', sync));
        q('#tk-qty').addEventListener('change', refreshSummary);
        q('#tk-code').addEventListener('input', refreshSummary);
        sync();
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Confirm booking', kind: 'primary', onClick: (d, close) => {
          const q = (sel) => d.querySelector(sel);
          if (!App.can('browse')) { UI.dialogError(d, 'Only customers can book here.'); return false; }
          if (!user.email) { UI.dialogError(d, 'Your account has no email address. Ask an admin to add one.'); return false; }
          /* Checked again now, because someone else may have booked while this was open. */
          if (Core.eventStatus(S(), e, App.now()) !== 'On sale') { UI.dialogError(d, 'This event is no longer on sale.'); return false; }
          const fresh = options(e), kind = q('#tk-kind').value, qty = Number(q('#tk-qty').value) || 1;
          const sessionIds = kind === 'block' ? (fresh.block ? fresh.block.sessions.map((x) => x.id) : []) : [q('#tk-session').value];
          if (!sessionIds.length || !fresh.ticket) { UI.dialogError(d, 'This can no longer be booked.'); return false; }
          if (qty > (e.maxPerBooking || 6)) { UI.dialogError(d, `You can book up to ${e.maxPerBooking || 6} tickets at once.`); return false; }
          const short = Core.capacityShortfall(S(), sessionIds, qty);
          if (short.length || (kind === 'dropin' && qty > Core.dropInLeft(S(), e, Core.findSession(S(), sessionIds[0]).session))) { UI.dialogError(d, 'There are not enough places left. Try fewer tickets or another session.'); return false; }
          const text = q('#tk-code').value.trim();
          const code = text ? Core.findCodeByName(S(), text) : null;
          if (text) {
            const r = Core.validateCode(S(), code, e, App.now(), user.email);
            if (!r.ok) { UI.dialogError(d, r.reason); return false; }
          }
          const now = App.now();
          const b = Core.createBooking(S(), {
            event: e, kind, sessionIds, ticketTypeId: fresh.ticket.id,
            customer: { name: user.name.replace(' (demo customer)', ''), email: user.email, phone: '', isMember: false },
            guests: Array.from({ length: qty - 1 }, () => ({})), code, payment: 'Card', source: 'Online', channel: 'Website', by: 'Customer', now
          });
          Core.klaviyo(S(), { at: now, type: 'Booking confirmed', ref: b.ref });
          App.save();
          close();
          UI.toast(`Booked. Your reference is ${b.ref}.`);
          App.go('#/mytickets');
          return false;
        }
      }]
    });
  }

  /* ---------- My tickets ---------- */
  function mine() {
    const key = emailKey(App.user().email);
    return key ? S().bookings.filter((b) => emailKey(b.customer.email) === key).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) : [];
  }
  function whenOf(b) {
    const starts = b.tickets.filter((t) => t.status === 'active').map((t) => (Core.findSession(S(), t.sessionId) || { session: { start: '' } }).session.start).filter(Boolean);
    const all = Array.from(new Set(starts)).sort();
    if (!all.length) return '<span class="muted">No places left</span>';
    return all.length === 1 ? esc(UI.dateTime(all[0])) : `${esc(UI.dateTime(all[0]))}<br><span class="muted">and ${plural(all.length - 1, 'more session')}</span>`;
  }
  function renderMine(main) {
    const user = App.user(), list = mine();
    main.innerHTML = UI.pageHead('My tickets', '<a class="btn btn-primary" href="#/browse">Find events</a>', 'Everything you have booked, newest first.') +
      (!user.email ? UI.empty('Your account has no email address, so your tickets cannot be found. Ask an admin to add one.')
        : !list.length ? UI.empty('You have not booked anything yet.')
          : UI.table([
            { label: 'Reference', html: (b) => `<b>${esc(b.ref)}</b>` },
            { label: 'Event', html: (b) => { const e = Core.findEvent(S(), b.eventId), v = e ? Core.findVenue(S(), e.venueId) : null; return `${esc(e ? e.title : 'Event removed')}<br><span class="muted">${esc(v ? v.name : '')}</span>`; } },
            { label: 'When', html: whenOf },
            { label: 'People', html: (b) => String(b.people.length) },
            { label: 'Paid', html: (b) => UI.money(Core.paidTotal(b) - Core.refundedTotal(b)) },
            { label: 'Status', html: (b) => { const st = Core.bookingStatus(b); return UI.badge(st, st === 'Cancelled' ? 'bad' : 'good'); } }
          ], list, { emptyText: 'You have not booked anything yet.' }));
  }

  App.route('browse', { title: 'Find events', perm: 'browse', render: renderBrowse });
  App.route('mytickets', { title: 'My tickets', perm: 'mytickets', render: renderMine });
})();
