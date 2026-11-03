/* My bookings: what a normal user sees. Their own bookings, past and coming up, like an order history.
   #/mybookings        the list, with tabs and search
   #/mybookings/<id>   one booking: tickets, what was paid, the venue, and how to reach the club
   A customer never sees anyone else's booking: every booking is checked against the signed-in email.
   There is no cancel button. As in the design, customers email the club and staff process the request. */
(function () {
  'use strict';
  const S = () => App.state;
  const esc = (v) => UI.esc(v);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const sameEmail = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  const TABS = [['all', 'All'], ['upcoming', 'Upcoming'], ['past', 'Past'], ['cancelled', 'Cancelled']];
  const PAGE = 10;
  let tab = 'all', query = '', limit = PAGE;

  /* ---------- Facts about a booking ---------- */
  const mine = () => S().bookings.filter((b) => sameEmail(b.customer.email, App.user().email)).sort((a, c) => c.createdAt.localeCompare(a.createdAt));
  const startOf = (t) => { const f = Core.findSession(S(), t.sessionId); return f ? f.session.start : ''; };
  const liveStarts = (b) => b.tickets.filter((t) => t.status === 'active').map(startOf).filter(Boolean).sort();
  const kind = (b) => {
    if (Core.bookingStatus(b) === 'Cancelled') return 'cancelled';
    return liveStarts(b).some((x) => new Date(x) > App.now()) ? 'upcoming' : 'past';
  };
  const eventOf = (b) => Core.findEvent(S(), b.eventId);
  const venueOf = (b) => { const e = eventOf(b); return e ? Core.findVenue(S(), e.venueId) : null; };
  const peopleCount = (b) => new Set(b.tickets.filter((t) => t.status === 'active').map((t) => t.personId)).size;
  const when = (b) => {
    const k = kind(b), starts = liveStarts(b);
    if (k === 'cancelled') return 'Cancelled';
    if (k === 'upcoming') { const next = starts.find((x) => new Date(x) > App.now()); return `Next session: ${UI.dateTime(next)}`; }
    return starts.length ? `Last session: ${UI.dateTime(starts[starts.length - 1])}` : 'Finished';
  };
  const matches = (b, q) => {
    if (!q) return true;
    const e = eventOf(b), v = venueOf(b);
    return [b.ref, e ? e.title : '', v ? v.name : ''].join(' ').toLowerCase().includes(q);
  };
  const filtered = () => { const q = query.trim().toLowerCase(); return mine().filter((b) => (tab === 'all' || kind(b) === tab) && matches(b, q)); };

  /* ---------- List ---------- */
  function card(b) {
    const e = eventOf(b), v = venueOf(b), k = kind(b);
    const st = Core.bookingStatus(b), pay = Core.paymentStatus(b), refunded = Core.refundedTotal(b);
    return `<article class="card mb-card">
      <div class="mb-main">
        <h2><a href="#/mybookings/${encodeURIComponent(b.id)}">${esc(e ? e.title : 'Event')}</a></h2>
        <p class="muted">${esc(v ? v.name : '')} · Booking ${esc(b.ref)} · booked ${esc(UI.date(b.createdAt))}</p>
        <p class="mb-when">${esc(when(b))}</p>
        <p class="mb-badges">${UI.badge(st, st === 'Cancelled' ? 'bad' : 'good')}${k === 'upcoming' ? UI.badge('Coming up', 'info') : ''}${pay === 'Refunded' || pay === 'Part refunded' ? UI.badge(pay, 'warn') : ''}</p>
      </div>
      <div class="mb-side">
        <b class="mb-money">${esc(UI.money(Core.paidTotal(b)))}</b>
        <span class="hint">${esc(plural(peopleCount(b) || b.people.length, 'person'))}${refunded > 0 ? `, ${esc(UI.money(refunded))} refunded` : ''}</span>
        <a class="btn btn-small" href="#/mybookings/${encodeURIComponent(b.id)}">View details</a>
      </div></article>`;
  }
  function renderList(main) {
    const all = mine();
    const counts = { all: all.length, upcoming: all.filter((b) => kind(b) === 'upcoming').length, past: all.filter((b) => kind(b) === 'past').length, cancelled: all.filter((b) => kind(b) === 'cancelled').length };
    main.innerHTML = `<div class="mb-screen">
      ${UI.pageHead('My bookings', '', `Everything you have booked, past and coming up. Signed in as ${App.user().email || App.user().name}.`, false)}
      <div class="list-bar"><div class="list-row">
        <div id="mb-tabs"></div>
        <div class="list-tools" role="search">${UI.search({ id: 'mb-q', value: query, placeholder: 'Search event, venue or reference...' })}</div>
      </div></div>
      <p class="hint" id="mb-count" role="status"></p>
      <div id="mb-list"></div></div>`;
    const paint = () => {
      const rows = filtered(), shown = rows.slice(0, limit);
      UI.keepFocus(() => { main.querySelector('#mb-tabs').innerHTML = UI.tabs(TABS.map(([key, label]) => ({ key, label, count: counts[key], on: key === tab })), { label: 'Show bookings' }); });
      main.querySelector('#mb-count').textContent = rows.length ? `${plural(rows.length, 'booking')}` : '';
      main.querySelector('#mb-list').innerHTML = shown.length
        ? shown.map(card).join('') + (rows.length > shown.length ? `<p class="mb-more"><button type="button" class="btn" id="mb-more">Show ${Math.min(PAGE, rows.length - shown.length)} more</button></p>` : '')
        : UI.empty(all.length ? 'No bookings match this search.' : 'There are no bookings for this email yet. If you booked with a different email, ask the club.');
    };
    main.querySelector('#mb-tabs').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; limit = PAGE; paint(); } });
    main.querySelector('#mb-q').addEventListener('input', (ev) => { query = ev.target.value; limit = PAGE; paint(); });
    main.querySelector('#mb-list').addEventListener('click', (ev) => { if (ev.target.id === 'mb-more') { limit += PAGE; paint(); } });
    paint();
  }

  /* ---------- One booking ---------- */
  const sect = (title, inner) => `<section class="card"><h2>${esc(title)}</h2>${inner}</section>`;
  const dl = (rows) => `<dl class="bd-dl">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  function renderOne(main, id) {
    const b = S().bookings.find((x) => x.id === id);
    /* Someone else's booking looks exactly like one that does not exist. */
    if (!b || !sameEmail(b.customer.email, App.user().email)) {
      main.innerHTML = `${UI.pageHead('Booking not found', '', 'We could not find that booking under your email.', '#/mybookings')}${UI.empty('Check the reference, or go back to your bookings.')}`;
      return;
    }
    const e = eventOf(b), v = venueOf(b), k = kind(b), st = Core.bookingStatus(b), pay = Core.paymentStatus(b);
    const refunded = Core.refundedTotal(b), paid = Core.paidTotal(b);
    const first = (b.payments || []).find((x) => x.type === 'Payment');
    const code = b.codeId ? Core.findCode(S(), b.codeId) : null;
    const openRequest = (b.requests || []).some((r) => r.status === 'Open');
    const rows = b.tickets.slice().sort((a, c) => startOf(a).localeCompare(startOf(c)));
    const tickets = UI.table({ title: 'Your tickets', subtitle: 'One ticket for each person and session.' }, [
      { label: 'Person', html: (t) => { const p = b.people.find((x) => x.id === t.personId); return esc(p ? Core.personName(b, p) : 'Guest') + (p && p.isLead ? ' <span class="muted">(you)</span>' : ''); } },
      { label: 'Session', html: (t) => esc(UI.dateTime(startOf(t))) },
      { label: 'Status', html: (t) => (t.status !== 'active' ? UI.badge('Cancelled', 'bad') : t.checkedInAt ? UI.badge('Attended', 'good') : new Date(startOf(t)) > App.now() ? UI.badge('Booked', 'info') : UI.badge('Past', 'quiet')) },
      { label: 'Paid', html: (t) => `${esc(UI.money(t.paid))}${t.refunded > 0 ? `<div class="hint">${esc(UI.money(t.refunded))} refunded</div>` : ''}` }
    ], rows, { filter: false });
    const subject = encodeURIComponent(`Booking ${b.ref}`), body = encodeURIComponent(`Hello,\n\nI would like to ask about booking ${b.ref} (${e ? e.title : ''}).\n\nThank you`);
    const contact = v && v.contact ? v.contact : '';
    main.innerHTML = `<div class="mb-screen mb-detail">
      ${UI.pageHead(`Booking ${b.ref}`, '', `${e ? e.title : ''} · ${v ? v.name : ''}`, '#/mybookings')}
      <p class="row">${UI.badge(st, st === 'Cancelled' ? 'bad' : 'good')} ${k === 'upcoming' ? UI.badge('Coming up', 'info') : ''} ${UI.badge(pay, 'quiet')}<span class="muted">${esc(when(b))}</span></p>
      <div class="bd-cols"><div class="bd-col">${sect('Tickets', tickets)}
        ${sect('What you paid', dl([['Paid', `<b>${esc(UI.money(paid))}</b>`], ['Refunded', esc(UI.money(refunded))], ['Paid by', esc(first ? first.method : 'No payment')], ['Code used', code ? esc(code.code) : '<span class="muted">None</span>'], ['Booked on', esc(UI.dateTime(b.createdAt))]]))}</div>
      <div class="bd-col">${sect('Where', v ? dl([['Venue', esc(v.name)], ['Address', esc(v.address || v.city || '')], ['Contact', contact ? `<a href="mailto:${esc(contact)}">${esc(contact)}</a>` : '<span class="muted">Not given</span>']]) : '<p class="muted">Venue not available.</p>')}
        ${sect('Need to change or cancel?', `<p>${st === 'Cancelled' ? 'This booking is cancelled.' : 'Changes and cancellations are handled by the club team. Email them with your booking reference and they will take it from there.'}</p>
          ${openRequest ? `<p>${UI.badge('Request received', 'info')} The club has your request and will be in touch.</p>` : ''}
          ${contact && st !== 'Cancelled' ? `<a class="btn btn-primary" href="mailto:${esc(contact)}?subject=${subject}&body=${body}">Email the club</a>` : ''}`)}</div></div></div>`;
  }

  App.route('mybookings', {
    title: 'My bookings',
    perm: 'mybookings',
    render(main, params) {
      const id = (params || []).map((p) => String(p).split('?')[0]).filter(Boolean)[0];
      if (id) renderOne(main, id); else renderList(main);
    }
  });
})();
