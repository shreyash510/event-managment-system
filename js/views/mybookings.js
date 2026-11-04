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
  let justId = null;   /* the booking just paid for at checkout, so its page can say so once */

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
  const nextStart = (b) => liveStarts(b).find((x) => new Date(x) > App.now()) || '';
  const filtered = () => {
    const q = query.trim().toLowerCase();
    return mine().filter((b) => (tab === 'all' || kind(b) === tab) && matches(b, q)).sort((a, c) => {
      const ka = kind(a), kc = kind(c);
      if (ka === 'upcoming' && kc === 'upcoming') return nextStart(a).localeCompare(nextStart(c));
      return ka === 'upcoming' ? -1 : kc === 'upcoming' ? 1 : 0;   /* the sort is stable, so the rest stay newest first */
    });
  };

  /* ---------- List ---------- */
  function card(b) {
    const e = eventOf(b), v = venueOf(b), k = kind(b), type = Core.findType(S(), e && e.typeId);
    const pay = Core.paymentStatus(b), refunded = Core.refundedTotal(b), href = `#/mybookings/${encodeURIComponent(b.id)}`;
    const state = k === 'cancelled' ? UI.badge('Cancelled', 'bad') : k === 'upcoming' ? UI.badge('Upcoming', 'info') : UI.badge('Completed', 'quiet');
    return `<article class="card mb-card${k === 'past' || k === 'cancelled' ? ' is-done' : ''}">
      ${UI.poster(e ? e.title : 'Event', type ? type.name : (e ? e.format : ''), 'sm', e && e.image)}
      <div class="mb-main">
        <div class="mb-badges">${state}${pay === 'Refunded' || pay === 'Part refunded' ? UI.badge(pay, 'warn') : ''}</div>
        <h2><a href="${href}">${esc(e ? e.title : 'Event')}</a></h2>
        <p class="mb-line">${UI.icon('pin')}<span>${esc(v ? v.name : '')}</span></p>
        <p class="mb-line mb-when">${UI.icon('cal')}<span>${esc(when(b))}</span></p>
        <p class="mb-ref">Booking ${esc(b.ref)} · booked ${esc(UI.date(b.createdAt))}</p>
      </div>
      <div class="mb-side">
        <div class="mb-price"><b>${esc(UI.money(Core.paidTotal(b)))}</b><span>${esc(plural(peopleCount(b) || b.people.length, 'person'))}${refunded > 0 ? `<br>${esc(UI.money(refunded))} refunded` : ''}</span></div>
        <a class="btn" href="${href}">View details</a>
      </div></article>`;
  }
  function renderList(main) {
    const all = mine();
    const counts = { all: all.length, upcoming: all.filter((b) => kind(b) === 'upcoming').length, past: all.filter((b) => kind(b) === 'past').length, cancelled: all.filter((b) => kind(b) === 'cancelled').length };
    const spent = all.reduce((n, x) => n + Core.paidTotal(x) - Core.refundedTotal(x), 0);
    const stats = UI.statPill([{ n: counts.upcoming, label: 'Upcoming' }, { n: all.length, label: 'Bookings' }, { n: UI.money(spent), label: 'Spent' }]);
    main.innerHTML = `<div class="mb-screen">
      ${UI.pageHead('My bookings', stats, 'Your tickets and everything you have booked before.', false)}
      <div class="list-bar"><div class="list-row">
        <div id="mb-tabs"></div>
        <div class="list-tools" role="search">${UI.search({ id: 'mb-q', value: query, placeholder: 'Search bookings...' })}</div>
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
    const ticketCard = (t) => {
      const p = b.people.find((x) => x.id === t.personId), live = t.status === 'active', over = live && new Date(startOf(t)) <= App.now();
      const badge = !live ? UI.badge('Cancelled', 'bad') : t.checkedInAt ? UI.badge('Attended', 'good') : over ? UI.badge('Past', 'quiet') : UI.badge('Booked', 'info');
      return `<article class="ticket${!live ? ' is-void' : over ? ' is-past' : ''}">
        <div class="ticket-main"><p class="ticket-event">${esc(e ? e.title : 'Event')}</p><p class="ticket-when">${esc(UI.dateTime(startOf(t)))}</p><p class="muted">${esc(v ? v.name : '')}</p>
          <p class="ticket-who">${esc(p ? Core.personName(b, p) : 'Guest')}${p && p.isLead ? ' <span class="muted">(you)</span>' : ''}</p></div>
        <div class="ticket-stub">${glyph(t.id)}<b>${esc(b.ref)}</b>${badge}${t.refunded > 0 ? `<small>${esc(UI.money(t.refunded))} refunded</small>` : ''}</div></article>`;
    };
    const upcomingLive = rows.filter((t) => t.status === 'active' && new Date(startOf(t)) > App.now());
    const tickets = `<div class="tickets">${rows.map(ticketCard).join('')}</div>${upcomingLive.length ? '<p><button type="button" class="btn" id="mb-ics">Add to calendar</button></p>' : ''}<p class="hint">Show your booking reference at the door.</p>`;
    
    const subject = encodeURIComponent(`Booking ${b.ref}`), body = encodeURIComponent(`Hello,\n\nI would like to ask about booking ${b.ref} (${e ? e.title : ''}).\n\nThank you`);
    const contact = v && v.contact ? v.contact : '';
    const fresh = justId === b.id;
    justId = null;
    main.innerHTML = `<div class="mb-screen mb-detail">
      ${fresh ? `<div class="tk-success" role="status"><b>Payment successful</b><span>Your booking is confirmed. We have sent a confirmation to ${esc(b.customer.email)} (demo: no email is really sent).</span></div>` : ''}
      ${UI.pageHead(`Booking ${b.ref}`, '', `${e ? e.title : ''} · ${v ? v.name : ''}`, '#/mybookings')}
      <p class="row">${UI.badge(st, st === 'Cancelled' ? 'bad' : 'good')} ${k === 'upcoming' ? UI.badge('Coming up', 'info') : ''} ${UI.badge(pay, 'quiet')}<span class="muted">${esc(when(b))}</span></p>
      <div class="bd-cols"><div class="bd-col">${sect('Your tickets', tickets)}
        ${sect('What you paid', dl([['Paid', `<b>${esc(UI.money(paid))}</b>`], ['Refunded', esc(UI.money(refunded))], ['Paid by', esc(window.Pay ? Pay.describe(first) : (first ? first.method : 'No payment'))], ['Code used', code ? esc(code.code) : '<span class="muted">None</span>'], ['Booked on', esc(UI.dateTime(b.createdAt))]]) + '<p><button type="button" class="btn btn-small" id="mb-receipt">View receipt</button></p>')}</div>
      <div class="bd-col">${sect('Where', v ? dl([['Venue', esc(v.name)], ['Address', esc(v.address || v.city || '')], ['Contact', contact ? `<a href="mailto:${esc(contact)}">${esc(contact)}</a>` : '<span class="muted">Not given</span>']]) : '<p class="muted">Venue not available.</p>')}
        ${sect('Need a change?', st === 'Cancelled' ? '<p>This booking is cancelled.</p>' : `
          <p>${movable(b).length ? 'You can move a place to another session of this event yourself, up to the cut-off before it starts.' : 'Nothing on this booking can be moved by you right now.'} To cancel or change anything else, send the club a request and they will take it from there.</p>
          ${openRequest ? `<p>${UI.badge('Request received', 'info')} The club has your request and will be in touch.</p>` : ''}
          <div class="mb-actions">
            ${movable(b).length ? '<button type="button" class="btn btn-primary" id="mb-move">Move a place</button>' : ''}
            <button type="button" class="btn" id="mb-request">Request a change</button>
            ${contact ? `<a class="btn btn-ghost" href="mailto:${esc(contact)}?subject=${subject}&body=${body}">Email the club</a>` : ''}
          </div>`)}</div></div></div>`;
    const ics = main.querySelector('#mb-ics');
    if (ics) ics.addEventListener('click', () => downloadCalendar(b));
    const on = (sel, fn) => { const el = main.querySelector(sel); if (el) el.addEventListener('click', fn); };
    on('#mb-receipt', () => receiptDialog(b));
    on('#mb-request', () => requestDialog(b));
    on('#mb-move', () => moveDialog(b));
  }

  /* A small pattern made from the ticket id, so each ticket looks like its own. Not a real QR code. */
  function glyph(seed) {
    let h = 7;
    for (let i = 0; i < String(seed).length; i++) h = (h * 33 + String(seed).charCodeAt(i)) >>> 0;
    let cells = '';
    for (let y = 0; y < 7; y++) for (let x = 0; x < 4; x++) {
      h = (h * 1103515245 + 12345) >>> 0;
      if (h & 0x10000) { cells += `<rect x="${x}" y="${y}" width="1" height="1"/><rect x="${6 - x}" y="${y}" width="1" height="1"/>`; }
    }
    return `<svg class="ticket-glyph" viewBox="0 0 7 7" width="64" height="64" fill="currentColor" aria-hidden="true" focusable="false">${cells}</svg>`;
  }
  /* A calendar file for the sessions still to come, made in the browser. */
  function downloadCalendar(b) {
    const e = eventOf(b), v = venueOf(b), stamp = (d) => { const x = new Date(d), p = (n) => String(n).padStart(2, '0'); return `${x.getFullYear()}${p(x.getMonth() + 1)}${p(x.getDate())}T${p(x.getHours())}${p(x.getMinutes())}00`; };
    const text = (x) => String(x || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    const starts = Array.from(new Set(b.tickets.filter((t) => t.status === 'active').map(startOf).filter((x) => x && new Date(x) > App.now()))).sort();
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Events Admin//Demo//EN'];
    starts.forEach((s0, i) => {
      const f = Core.findSession(S(), (b.tickets.find((t) => startOf(t) === s0) || {}).sessionId), mins = (f && f.session.durationMin) || 60;
      lines.push('BEGIN:VEVENT', `UID:${b.ref}-${i}@events-admin-demo`, `DTSTAMP:${stamp(App.now())}`, `DTSTART:${stamp(s0)}`, `DTEND:${stamp(new Date(new Date(s0).getTime() + mins * 60000))}`,
        `SUMMARY:${text(e ? e.title : 'Event')}`, `LOCATION:${text(v ? [v.name, v.address].filter(Boolean).join(', ') : '')}`, `DESCRIPTION:${text('Booking ' + b.ref)}`, 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }));
    a.download = `${b.ref}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  /* ---------- Receipt, change request and moving a place ---------- */
  const describePay = (p) => (window.Pay ? Pay.describe(p) : p.method);
  function receiptDialog(b) {
    const e = eventOf(b), v = venueOf(b);
    const rows = (b.payments || []).map((p) => `<div class="mb-rc-row"><div><b>${esc(p.type)}</b><span class="muted">${esc(UI.dateTime(p.at))} · ${esc(describePay(p))}${p.receiptId ? ` · ${esc(p.receiptId)}` : ''}</span></div><span>${p.type === 'Refund' ? '−' : ''}${esc(UI.money(p.amount))}</span></div>`).join('');
    UI.dialog({
      title: `Receipt for ${b.ref}`, subtitle: `${e ? e.title : ''}${v ? ' · ' + v.name : ''}`,
      body: `<div class="mb-receipt">${rows || '<p class="muted">No payments on this booking.</p>'}
        <div class="mb-rc-row mb-rc-total"><b>Paid, less refunds</b><b>${esc(UI.money(Core.round2(Core.paidTotal(b) - Core.refundedTotal(b))))}</b></div>
        <p class="hint">Card payments show the card type and last 4 digits only. Test checkout: no real money was taken.</p></div>`,
      actions: [{ label: 'Close', kind: 'primary' }]
    });
  }
  function requestDialog(b) {
    UI.dialog({
      title: 'Request a change', subtitle: `Booking ${b.ref}. The club team will reply by email.`,
      body: `<div class="field"><span><label for="mb-req-note">What would you like to change or cancel?</label></span><textarea id="mb-req-note" rows="4" maxlength="600" placeholder="For example: please cancel guest 2, or move me to the 18:30 session."></textarea></div>
        <p class="hint">Cancellations are handled by the club team, who will tell you about any refund under the club's policy.</p>`,
      actions: [{ label: 'Keep as it is', kind: 'ghost' }, {
        label: 'Send request', kind: 'primary', onClick: (d) => {
          const note = d.querySelector('#mb-req-note').value.trim();
          if (!note) { UI.dialogError(d, 'Say what you would like to change.'); d.querySelector('#mb-req-note').focus(); return false; }
          const now = App.now();
          b.requests = b.requests || [];
          b.requests.push({ id: Core.nextId(S(), 'rq'), at: Core.toLocalISO(now), by: 'Customer', source: 'Customer', note, status: 'Open' });
          Core.logBooking(b, now, 'Customer', `Change request sent by the customer: ${note}`);
          App.log('Request', `${b.ref}: change request from the customer.`);
          App.save(); App.render();
          UI.toast('Request sent. The club team will be in touch.', 'good');
          return undefined;
        }
      }]
    });
  }
  /* Places the customer can move themselves: still to come, not checked in, inside the transfer cut-off. */
  function movable(b) {
    const now = App.now(), s = S();
    return b.tickets.filter((t) => {
      if (t.status !== 'active' || t.checkedInAt) return false;
      const f = Core.findSession(s, t.sessionId);
      if (!f || new Date(f.session.start) <= now) return false;
      return Core.policyFor(s.settings, [f.session], now).transferInside && targetsFor(b, t).length > 0;
    });
  }
  /* Same event only, at the same price or lower, with a place free. */
  const targetsFor = (b, t) => Core.transferTargets(S(), b, t, App.now()).filter((x) => x.event.id === b.eventId && x.left > 0 && x.difference <= 0);
  function moveDialog(b) {
    const list = movable(b);
    if (!list.length) { UI.toast('Nothing on this booking can be moved right now.', 'bad'); return; }
    const fee = Core.round2(Number(S().settings.policy.transferFee) || 0);
    const placeLabel = (t) => { const p = b.people.find((x) => x.id === t.personId); return `${p ? Core.personName(b, p) : 'Guest'} · ${UI.dateTime(startOf(t))}`; };
    const targetOpts = (t) => UI.options(targetsFor(b, t).map((x) => ({ value: x.session.id, label: `${UI.dateTime(x.session.start)} · ${plural(x.left, 'place')} left` })));
    UI.dialog({
      title: 'Move a place', subtitle: `${eventOf(b) ? eventOf(b).title : ''}. Moves are to another session of the same event.`,
      body: `<div class="field"><span><label for="mb-mv-from">Which place?</label></span><select id="mb-mv-from">${UI.options(list.map((t) => ({ value: t.id, label: placeLabel(t) })))}</select></div>
        <div class="field"><span><label for="mb-mv-to">Move to</label></span><select id="mb-mv-to">${targetOpts(list[0])}</select></div>
        <p class="hint">${fee > 0 ? `The club charges a ${esc(UI.money(fee))} fee to move a place. You pay it on the next screen.` : 'There is no fee to move a place.'} Moves are possible up to ${esc(S().settings.policy.transferHours)} hours before the session.</p>`,
      onOpen: (d) => {
        d.querySelector('#mb-mv-from').addEventListener('change', (ev) => {
          const t = list.find((x) => x.id === ev.target.value);
          d.querySelector('#mb-mv-to').innerHTML = t ? targetOpts(t) : '';
        });
      },
      actions: [{ label: 'Keep as it is', kind: 'ghost' }, {
        label: fee > 0 ? `Continue, ${UI.money(fee)} fee` : 'Move my place', kind: 'primary', onClick: (d) => {
          const ticketId = d.querySelector('#mb-mv-from').value, targetId = d.querySelector('#mb-mv-to').value;
          if (!ticketId || !targetId) { UI.dialogError(d, 'Choose a place and a session to move to.'); return false; }
          if (fee > 0 && window.Pay) {
            /* The fee is taken first; the move only happens once it is paid. */
            setTimeout(() => Pay.checkout({
              amount: fee, currency: 'GBP', description: `Move a place · ${b.ref}`, email: b.customer.email, lines: [{ label: 'Fee to move a place', amount: fee }],
              onSuccess: (receipt) => doMove(b, ticketId, targetId, fee, receipt)
            }), 0);
            return undefined;
          }
          return doMove(b, ticketId, targetId, 0, null) ? undefined : false;
        }
      }]
    });
  }
  function doMove(b, ticketId, targetId, fee, receipt) {
    const t = b.tickets.find((x) => x.id === ticketId), now = App.now();
    /* Checked again: the session may have filled, or the cut-off passed, while the screens were open. */
    if (!t || !movable(b).some((x) => x.id === ticketId) || !targetsFor(b, t).some((x) => x.session.id === targetId)) {
      UI.toast(`That move is no longer possible.${receipt ? ' Your fee will not be taken.' : ''} Please try again.`, 'bad');
      App.render();
      return false;
    }
    const res = Core.transferTicket(S(), b, ticketId, targetId, { by: 'Customer', now, describe: (x) => UI.dateTime(x), fee });
    if (!res.ok) { UI.toast(res.reason, 'bad'); return false; }
    if (receipt && window.Pay) {
      const feePay = (b.payments || []).filter((x) => x.type === 'Transfer fee').pop();
      Pay.attach(feePay, receipt);
    }
    Core.logBooking(b, now, 'Customer', 'Place moved by the customer (self-serve).');
    Core.klaviyo(S(), { at: now, type: 'Booking changed', ref: b.ref });
    App.log('Self-serve transfer', `${b.ref}: the customer moved a place${fee > 0 ? `, ${UI.money(fee)} fee` : ''}.`);
    App.save(); App.render();
    UI.toast('Your place has been moved. A new confirmation is on its way (demo: no email is sent).', 'good');
    return true;
  }
  window.MyBookings = { justBooked: (id) => { justId = id; } };

  App.route('mybookings', {
    title: 'My bookings',
    perm: 'mybookings',
    render(main, params) {
      const id = (params || []).map((p) => String(p).split('?')[0]).filter(Boolean)[0];
      if (id) renderOne(main, id); else renderList(main);
    }
  });
})();
