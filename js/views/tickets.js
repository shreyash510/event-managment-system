/* Find events and booking: what a normal user sees to choose an event, pick a session, pay and book for themselves.
   #/browse                    the events on sale: search, venue, type tabs, date filter
   #/browse/<eventId>          the event page: details, sessions, tickets, a discount code and the price
   #/browse/<eventId>/pay      checkout: details, payment and the order summary, with the places held for a few minutes
   A paid booking lands on its confirmation page in mybookings.js. Their bookings are on the My bookings page. Staff book for other people from the Bookings page.
   Payment goes through the checkout screen in pay.js. It is a demo: no money moves. */
(function () {
  'use strict';
  const S = () => App.state;
  const esc = (v) => UI.esc(v);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const view = { q: '', type: '', when: '', venue: '' };   /* the listing's search, tabs, date and venue, kept between visits */
  let cart = null;   /* what the person has picked on the event page, and what they typed at checkout */
  let timerId = null;
  const sameEmail = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  const myEmail = () => App.user().email;
  /* Only staff ever see these, even if a customer has a direct link. */
  const HIDDEN = ['Draft', 'Pending approval', 'Cancelled'];
  const statusOf = (e, now) => Core.eventStatus(S(), e, now || App.now());
  const canShow = (e) => !!e && Core.canSeeVenue(App.user(), e.venueId) && !HIDDEN.includes(statusOf(e));

  /* Is the signed-in customer a member? Yes if they hold a subscription that gives the member price. The card, the
     quote, the amount charged and the saved booking all use this one answer. */
  function isMember() {
    if (App.user().guest) return false;   /* a guest pays the standard price; a member signs in */
    return Core.hasMembership(S(), App.user().email, App.now());
  }

  /* ---------- Waitlist: entries use the shape the staff dialog in events.js reads ---------- */
  const entriesOn = (sessionId) => S().waitlist.filter((w) => w.sessionId === sessionId && w.status !== 'Removed' && w.status !== 'Booked');
  const offerLive = (w, now) => w.status === 'Offered' && !!w.offerUntil && new Date(w.offerUntil) > now;
  const myEntry = (sessionId) => entriesOn(sessionId).find((w) => sameEmail(w.email, myEmail())) || null;
  /* A live offer keeps its place away from everyone else, so the person offered it can still book it. */
  const heldForOthers = (sessionId, now) => entriesOn(sessionId).filter((w) => offerLive(w, now) && !sameEmail(w.email, myEmail())).length;
  const placesFor = (session, now) => Math.max(0, Core.placesLeft(S(), session) - heldForOthers(session.id, now));
  const sellLeft = (e, session, now) => Math.min(Core.dropInLeft(S(), e, session), placesFor(session, now));
  /* The ticket an offered place is sold at. Offers can be on a session that is not sold singly, or after a price tier ended. */
  const offerTicket = (e) => Core.currentTicket(S(), e, App.now()) || e.tickets.find((t) => /standard/i.test(t.name)) || e.tickets[e.tickets.length - 1] || null;
  function offerBookable(e, offerId, now) {
    const w = S().waitlist.find((x) => x.id === offerId);
    if (!w || !sameEmail(w.email, myEmail()) || !offerLive(w, now) || !offerTicket(e)) return false;
    const session = e.sessions.find((x) => x.id === w.sessionId);
    if (!session || session.cancelled || new Date(session.start) <= now) return false;
    return ['On sale', 'Sold out'].includes(statusOf(e, now)) && placesFor(session, now) > 0;
  }
  /* The sign-in link a guest sees. Signing in is what gives a member their price. */
  document.addEventListener('click', (ev) => {
    if (ev.target.closest && ev.target.closest('[data-member-signin]')) Entry.signOut('Sign in to see your member price.');
  });
  const validEmail = (x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(x || '').trim());
  /* A guest has no account, so the waitlist asks how to reach them. */
  function askGuestDetails(then) {
    const u = App.user();
    UI.dialog({
      title: 'Join the waitlist', subtitle: 'No account needed. We email you if a place opens.',
      body: `<div class="field"><span><label for="tk-g-name">Your name</label></span><input id="tk-g-name" type="text" autocomplete="name" value="${esc(u.name === 'Guest' ? '' : u.name)}"></div>
        <div class="field"><span><label for="tk-g-email">Email</label></span><input id="tk-g-email" type="email" autocomplete="email" value="${esc(u.email || '')}"></div>`,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Join the waitlist', kind: 'primary', onClick: (d) => {
          const name = d.querySelector('#tk-g-name').value.trim(), email = d.querySelector('#tk-g-email').value.trim();
          if (!name) { UI.dialogError(d, 'Enter your name.'); d.querySelector('#tk-g-name').focus(); return false; }
          if (!validEmail(email)) { UI.dialogError(d, 'Enter a valid email address.'); d.querySelector('#tk-g-email').focus(); return false; }
          Object.assign(u, { name, email });
          setTimeout(then, 0);
          return undefined;
        }
      }]
    });
  }
  const saveWaitlist = (text, tone) => { App.save(); App.render(); UI.toast(text, tone); };
  function joinWaitlist(sessionId) {
    const f = Core.findSession(S(), sessionId), u = App.user(), now = App.now();
    if (!f || !canShow(f.event) || !f.event.waitlistOn || f.session.cancelled || new Date(f.session.start) <= now || !['On sale', 'Sold out'].includes(statusOf(f.event, now))) { UI.toast('This waitlist is not open.', 'bad'); App.render(); return; }
    if (!u.email && u.guest) { askGuestDetails(() => joinWaitlist(sessionId)); return; }
    if (!u.email) { UI.toast('Add your email in My settings first, so the club can reach you.', 'bad'); return; }
    const had = myEntry(sessionId);
    if (had && (had.status === 'Waiting' || offerLive(had, now))) { UI.toast('You are already on this waitlist.'); App.render(); return; }
    /* An offer that ended goes to the back of the queue, as one entry and not two. */
    if (had) S().waitlist.splice(S().waitlist.indexOf(had), 1);
    S().waitlist.push(Object.assign(had || { id: Core.nextId(S(), 'w'), sessionId, name: u.name, email: u.email }, { joinedAt: Core.toLocalISO(now), status: 'Waiting', offerUntil: '' }));
    App.log('Waitlist', `${f.event.title}, ${UI.dateTime(f.session.start)}: ${u.name} joined the waitlist.`);
    saveWaitlist('You are on the waitlist. We will email you if a place opens (demo: no email is sent).', 'good');
  }
  function leaveWaitlist(id) {
    const w = S().waitlist.find((x) => x.id === id), f = w && Core.findSession(S(), w.sessionId);
    if (!w || !sameEmail(w.email, myEmail())) return;
    w.status = 'Removed'; w.offerUntil = '';
    App.log('Waitlist', `${f ? `${f.event.title}, ${UI.dateTime(f.session.start)}: ` : ''}${w.name} left the waitlist.`);
    saveWaitlist('You have left the waitlist.');
  }
  function bookOffer(id) {
    const w = S().waitlist.find((x) => x.id === id), f = w && Core.findSession(S(), w.sessionId), now = App.now();
    if (!f || !offerBookable(f.event, id, now)) { UI.toast('This offer has ended, or the place has gone.', 'bad'); App.render(); return; }
    cart = { eventId: f.event.id, kind: 'dropin', sessionId: w.sessionId, qty: 1, codeText: '', codeNote: '', form: null, heldUntil: null, holdId: null, offerId: w.id };
    App.go(`#/browse/${encodeURIComponent(f.event.id)}/pay`);
  }
  /* Once booked, the entry is marked Booked, so it stops holding a place and the place is counted once. */
  function markWaitlistBooked(sessionIds, b, now) {
    S().waitlist.forEach((w) => {
      if (!sessionIds.includes(w.sessionId) || !sameEmail(w.email, b.customer.email) || w.status === 'Removed' || w.status === 'Booked') return;
      w.status = 'Booked'; w.claimedAt = Core.toLocalISO(now); w.offerUntil = ''; w.bookingRef = b.ref;
      App.log('Waitlist', `${b.ref}: ${w.name} booked from the waitlist.`);
      Core.logBooking(b, now, 'Customer', 'Booked from the waitlist.');
    });
  }
  /* The signed-in customer's waitlist entries, soonest first. */
  function myWaitlist() {
    const now = App.now();
    return S().waitlist.filter((w) => sameEmail(w.email, myEmail()) && w.status !== 'Removed' && w.status !== 'Booked').map((w) => {
      const f = Core.findSession(S(), w.sessionId);
      return f ? { w, event: f.event, session: f.session, state: offerBookable(f.event, w.id, now) ? 'offered' : w.status === 'Offered' ? 'ended' : 'waiting' } : null;
    }).filter((x) => x && canShow(x.event) && !x.session.cancelled && new Date(x.session.start) > now)
      .sort((a, c) => a.session.start.localeCompare(c.session.start));
  }
  const queueSpot = (w) => entriesOn(w.sessionId).filter((x) => x.status === 'Waiting').indexOf(w) + 1;
  function waitlistRow(x) {
    const when = UI.dateTime(x.session.start), v = venueOf(x.event);
    const say = x.state === 'offered' ? `A place is free for you. Book by ${UI.dateTime(x.w.offerUntil)}.` : x.state === 'ended' ? 'Your offer has ended.' : `You're on the waitlist${queueSpot(x.w) ? `, number ${queueSpot(x.w)}` : ''}.`;
    const buttons = x.state === 'offered'
      ? `<button type="button" class="btn btn-primary" data-wl-book="${esc(x.w.id)}" aria-label="Book this place: ${esc(x.event.title)}, ${esc(when)}">Book this place</button><button type="button" class="btn btn-ghost" data-wl-leave="${esc(x.w.id)}" aria-label="No thanks: ${esc(x.event.title)}, ${esc(when)}">No thanks</button>`
      : x.state === 'ended' ? `<button type="button" class="btn" data-wl-join="${esc(x.session.id)}" aria-label="Join the waitlist again: ${esc(x.event.title)}, ${esc(when)}">Join again</button><button type="button" class="btn btn-ghost" data-wl-leave="${esc(x.w.id)}" aria-label="Leave the waitlist: ${esc(x.event.title)}, ${esc(when)}">Leave</button>`
        : `<button type="button" class="btn" data-wl-leave="${esc(x.w.id)}" aria-label="Leave the waitlist: ${esc(x.event.title)}, ${esc(when)}">Leave</button>`;
    return `<li class="tk-wl-row${x.state === 'offered' ? ' is-offer' : ''}"><div><a href="#/browse/${encodeURIComponent(x.event.id)}"><b>${esc(x.event.title)}</b></a><small>${esc(when)}${v ? ` · ${esc(v.name)}` : ''}</small><span>${esc(say)}</span></div><div class="tk-wl-acts">${buttons}</div></li>`;
  }
  function waitlistHtml(onlyOffers) {
    const rows = myWaitlist().filter((x) => !onlyOffers || x.state === 'offered');
    return rows.length ? `<section class="card tk-waitlist"><h2>${onlyOffers ? 'A place is free for you' : 'Your waitlist'}</h2><ul>${rows.map(waitlistRow).join('')}</ul></section>` : '';
  }
  /* The waitlist buttons, wherever they are drawn. Says whether the click was one of them. */
  function waitlistClick(ev) {
    const b = ev.target.closest('[data-wl-book], [data-wl-leave], [data-wl-join]');
    if (!b) return false;
    if (b.dataset.wlBook) bookOffer(b.dataset.wlBook);
    else if (b.dataset.wlLeave) leaveWaitlist(b.dataset.wlLeave);
    else joinWaitlist(b.dataset.wlJoin);
    return true;
  }
  const mapUrl = (v) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.address || [v.name, v.city].filter(Boolean).join(', '))}`;
  const mapLink = (v) => `<a href="${esc(mapUrl(v))}" target="_blank" rel="noopener noreferrer">View on a map<span class="sr-only"> (opens in a new tab)</span></a>`;

  /* ---------- What can be bought ---------- */
  const listed = () => {
    const now = App.now();
    return S().events.filter((e) => Core.canSeeVenue(App.user(), e.venueId)).map((e) => ({ e, status: Core.eventStatus(S(), e, now), rem: Core.remainingSessions(e, now) }))
      .filter((x) => ['On sale', 'Sold out', 'Scheduled'].includes(x.status) && x.rem.length)
      .sort((a, b) => a.rem[0].start.localeCompare(b.rem[0].start));
  };
  /* Single sessions with places left, and a whole block if one is on sale. */
  function options(e) {
    const now = App.now(), s = S();
    const ticket = Core.currentTicket(s, e, now);
    const sessions = e.dropInsEnabled === false || !ticket ? [] : Core.remainingSessions(e, now).map((x) => ({ session: x, left: sellLeft(e, x, now) })).filter((x) => x.left > 0);
    const blockSessions = Core.blockSaleOpen(e, now) ? Core.remainingSessions(e, now) : [];
    const blockLeft = blockSessions.length ? Math.min(...blockSessions.map((x) => placesFor(x, now))) : 0;
    return { ticket, sessions, block: blockLeft > 0 ? { sessions: blockSessions, left: blockLeft } : null };
  }
  const venueOf = (e) => Core.findVenue(S(), e.venueId);
  const typeOf = (e) => Core.findType(S(), e.typeId);
  const fromKind = (o) => (o.sessions.length && o.ticket ? 'dropin' : 'block');
  const fromPrice = (e, o) => (o.sessions.length && o.ticket ? o.ticket.price : (o.block ? e.block.price : null));
  /* What this customer pays for one ticket: the member price if they are a member. */
  const myPrice = (e, base, kind) => (isMember() ? Core.memberUnit(e, base, kind) : base);
  const lowAt = (e) => (e.lowSpaceAt !== undefined && e.lowSpaceAt !== null && e.lowSpaceAt !== '' ? Number(e.lowSpaceAt) : Number(S().settings.lowSpaceThreshold) || 0);
  const inRange = (iso, when) => {
    const d = new Date(iso), now = App.now();
    if (when === 'today') return d.toDateString() === now.toDateString();
    return d >= now && d <= new Date(now.getTime() + (when === 'week' ? 7 : 30) * 86400000);
  };

  /* ---------- Find events ---------- */
  const matches = (x, skip) => {
    const q = view.q.trim().toLowerCase(), v = venueOf(x.e), t = typeOf(x.e);
    return (!q || [x.e.title, v ? v.name : '', t ? t.name : ''].join(' ').toLowerCase().includes(q)) &&
      (skip === 'type' || !view.type || x.e.typeId === view.type) &&
      (!view.venue || x.e.venueId === view.venue) &&
      (!view.when || x.rem.some((s) => inRange(s.start, view.when)));
  };
  function card(x) {
    const e = x.e, v = venueOf(e), t = typeOf(e), o = options(e);
    const soon = x.status === 'Scheduled', sold = x.status === 'Sold out' || (!soon && !o.sessions.length && !o.block);
    const from = sold ? null : fromPrice(e, o), mine = from === null ? null : myPrice(e, from, fromKind(o));
    const open = o.sessions.length ? o.sessions[0] : null;
    const leftNow = open ? open.left : (o.block ? o.block.left : 0);
    const nextStart = open ? open.session.start : (o.block ? o.block.sessions[0].start : x.rem[0].start);
    const offered = myWaitlist().some((w) => w.event.id === e.id && w.state === 'offered');
    const badge = offered ? UI.badge('Place offered to you', 'good') : soon ? UI.badge('Booking soon', 'info') : sold ? UI.badge('Sold out', 'bad') : leftNow > 0 && leftNow <= lowAt(e) ? UI.badge(`${plural(leftNow, 'place')} left`, 'warn') : '';
    return `<a class="card tk-card${sold ? ' is-sold' : ''}" href="#/browse/${encodeURIComponent(e.id)}">
      ${UI.poster(e.title, t ? t.name : e.format, '', e.image)}
      <div class="tk-body">
        <div class="tk-meta">${badge}${UI.badge(e.format, 'quiet')}</div>
        <h2>${esc(e.title)}</h2>
        <p class="muted">${esc(v ? v.name : '')}</p>
        <p class="tk-when">${soon && e.salesOpenAt ? `<span class="muted">Booking opens ${esc(UI.date(e.salesOpenAt))}.</span> ` : ''}<span class="sr-only">Next session: </span>${esc(UI.dateTime(nextStart))}${x.rem.length > 1 ? ` <span class="muted">+ ${plural(x.rem.length - 1, 'more session')}</span>` : ''}</p>
        <div class="tk-foot"><span class="tk-price">${from === null ? '' : `From <b>${esc(UI.money(mine))}</b>${mine < from ? `<small>Member price, usually ${esc(UI.money(from))}</small>` : ''}`}</span><span class="tk-go">${sold || soon ? 'View' : 'Book'}</span></div>
      </div></a>`;
  }
  function renderBrowse(main) {
    const venues = S().venues.filter((v) => listed().some((x) => x.e.venueId === v.id));
    if (!venues.some((v) => v.id === view.venue)) view.venue = '';
    main.innerHTML = `<div class="tk-screen">
      ${UI.pageHead('Find events', '', 'Choose an event, pick a session and book your tickets.', false)}
      ${waitlistHtml(true)}
      <div class="list-bar">
        <div id="tk-types"></div>
        <div class="list-row"><div id="tk-when"></div>
          <div class="list-tools" role="search">
            <label class="tk-venue"><span>Venue</span><select id="tk-venue"><option value="">All venues</option>${UI.options(venues.map((v) => ({ value: v.id, label: v.name })), view.venue)}</select></label>
            ${UI.search({ id: 'tk-q', value: view.q, placeholder: 'Search events, venues or types...' })}</div></div>
      </div>
      <p class="hint" id="tk-count" role="status"></p>
      <div id="tk-results"></div></div>`;
    const paint = () => {
      const all = listed();
      let rows = all.filter((x) => matches(x));
      const types = [];
      all.forEach((x) => { const t = typeOf(x.e); if (t && !types.some((y) => y.id === t.id)) types.push(t); });
      if (view.type && !types.some((t) => t.id === view.type)) { view.type = ''; rows = all.filter((x) => matches(x)); }
      const countFor = (id) => all.filter((x) => matches(x, 'type') && (!id || x.e.typeId === id)).length;
      UI.keepFocus(() => {
        main.querySelector('#tk-types').innerHTML = UI.tabs([{ key: '', label: 'All', icon: 'grid', count: countFor(''), on: !view.type }]
          .concat(types.map((t) => ({ key: t.id, label: t.name, count: countFor(t.id), on: view.type === t.id }))), { label: 'Event type' });
        main.querySelector('#tk-when').innerHTML = UI.tabs([['', 'Any date'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month']].map(([key, label]) => ({ key, label, on: view.when === key })), { sub: true, attr: 'data-when', label: 'When' });
      });
      main.querySelector('#tk-count').textContent = rows.length ? plural(rows.length, 'event') : '';
      main.querySelector('#tk-results').innerHTML = rows.length ? `<div class="tk-grid">${rows.map(card).join('')}</div>`
        : UI.empty(all.length ? 'No events match. Try another type, venue, date or search.' : 'There is nothing on sale at the moment. Please come back soon.');
    };
    main.querySelector('#tk-types').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) { view.type = b.dataset.tab; paint(); } });
    main.querySelector('#tk-when').addEventListener('click', (ev) => { const b = ev.target.closest('[data-when]'); if (b) { view.when = b.dataset.when; paint(); } });
    main.querySelector('#tk-q').addEventListener('input', (ev) => { view.q = ev.target.value; paint(); });
    main.querySelector('#tk-venue').addEventListener('change', (ev) => { view.venue = ev.target.value; paint(); });
    main.querySelector('.tk-screen').addEventListener('click', waitlistClick);
    paint();
  }

  /* ---------- Prices and codes ---------- */
  function codeCheck(e, text) {
    const t = String(text || '').trim();
    if (!t) return { code: null, note: '' };
    /* The use held for this checkout is this customer's own, so it must not count against them. */
    const holds = S().codeHolds, own = cart && cart.holdId;
    if (own) S().codeHolds = (holds || []).filter((h) => h.id !== own);
    try {
      const code = Core.findCodeByName(S(), t), r = Core.validateCode(S(), code, e, App.now());
      if (!r.ok) return { code: null, note: r.reason };
      if (code.usageCap && Core.codeUsesLeft(S(), code, App.now()) <= 0) return { code: null, note: 'This code has been used the most times allowed.' };
      return { code, note: '' };
    } finally { S().codeHolds = holds; }
  }
  const idsFor = (o, c) => (c.kind === 'block' ? (o.block ? o.block.sessions.map((x) => x.id) : []) : [c.sessionId]);
  const maxQty = (e, o, c) => {
    if (c.offerId) return 1;   /* an offer is one place */
    const left = c.kind === 'block' ? (o.block ? o.block.left : 0) : ((o.sessions.find((x) => x.session.id === c.sessionId) || {}).left || 0);
    return Math.max(1, Math.min(e.maxPerBooking || 6, left));
  };
  const ticketIdFor = (e, o, c) => { const t = c.offerId ? offerTicket(e) : o.ticket; return t ? t.id : undefined; };
  /* The member price in words, shown wherever a member sees a price. */
  function memberBanner(e, quote, kind) {
    if (App.user().guest && quote.memberUnit < quote.unit) return `<p class="hint tk-guest-note">Members pay ${esc(UI.money(quote.memberUnit))}. <button type="button" class="btn btn-ghost btn-small" data-member-signin>Member sign in</button></p>`;
    if (!isMember() || !(quote.memberUnit < quote.unit)) return '';
    const guests = quote.qty > 1 ? (e.memberCoversGuests ? ' Your guests get the member price too.' : ' Your guests pay the standard price.') : '';
    return `<p class="tk-member"><b>Member price.</b> As a member, you pay ${esc(UI.money(quote.memberUnit))} instead of ${esc(UI.money(quote.unit))} for ${kind === 'block' ? 'the full series' : 'your ticket'}.${guests}</p>`;
  }
  const quoteFor = (e, o, c) => Core.quote({ event: e, kind: c.kind, ticketTypeId: ticketIdFor(e, o, c), qty: c.qty, isMember: isMember(), code: codeCheck(e, c.codeText).code, settings: S().settings });
  const unitLabel = (quote, kind) => `${kind === 'block' ? `${quote.qty} full series` : plural(quote.qty, 'ticket')} × ${UI.money(quote.unit)}`;
  /* The saving against booking each session on its own. Hidden when drop-ins are off, as there is nothing to compare with. */
  const blockSavingFor = (e, o, qty) => (e.dropInsEnabled === false || !o.ticket || !o.block ? null
    : Core.blockSaving({ event: e, ticketTypeId: o.ticket.id, sessionCount: o.block.sessions.length, qty, isMember: isMember(), settings: S().settings }));
  function savingHtml(e, o, c) {
    if (c.kind !== 'block') return '';
    const s = blockSavingFor(e, o, c.qty);
    if (!s || !(s.saving > 0)) return '';
    return `<p class="tk-saving"><span class="tk-tick" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12.5l4 4 8-9"/></svg></span><span><b>You save ${esc(UI.money(s.saving))}</b> by booking the full series!</span></p>`;
  }
  function priceHtml(quote, note, kind, e) {
    const m = e && e.memberPricing, memberLabel = m && m.mode === 'percent' ? `Member discount (${m.value}%)` : 'Member discount';
    return `${note ? `<p class="hint">${esc(note)}</p>` : ''}<div class="tk-lines">
      <div><span>${esc(unitLabel(quote, kind))}</span><span>${esc(UI.money(quote.subtotal))}</span></div>
      ${quote.memberDiscount > 0 ? `<div><span>${esc(memberLabel)}</span><span>−${esc(UI.money(quote.memberDiscount))}</span></div>` : ''}
      ${quote.codeDiscount > 0 ? `<div class="is-good"><span>Discount code</span><span>−${esc(UI.money(quote.codeDiscount))}</span></div>` : ''}
      <div class="tk-total"><span>Total</span><b>${esc(UI.money(quote.total))}</b></div></div>`;
  }

  /* ---------- The event page ---------- */
  const whereHtml = (v) => (v ? `<section class="card"><h2>Where</h2><p><b>${esc(v.name)}</b></p><p class="muted">${esc(v.address || v.city || '')}</p><p>${mapLink(v)}</p>${v.contact ? `<p><a href="mailto:${esc(v.contact)}">${esc(v.contact)}</a></p>` : ''}</section>` : '');
  /* The rules from Settings, in plain words. */
  function policyHtml(e, v) {
    const p = S().settings.policy, refundFee = Number(p.refundFee) || 0, moveFee = Number(p.transferFee) || 0;
    const email = v && v.contact ? `<a href="mailto:${esc(v.contact)}">email the club</a>` : 'email the club';
    const moves = Core.remainingSessions(e, App.now()).length > 1;
    return `<section class="card tk-policy"><h2>Cancelling or changing</h2><ul>
      <li>To cancel, ${email}. The club handles every cancellation.</li>
      <li>If you ask at least ${esc(plural(p.refundHours, 'hour'))} before the session, you get your money back${refundFee > 0 ? `, less a ${esc(UI.money(refundFee))} fee` : ''}. After that, a refund is up to the club.</li>
      ${moves ? `<li>You can move a place to another session of this event yourself, up to ${esc(plural(p.transferHours, 'hour'))} before it starts${moveFee > 0 ? `, for a ${esc(UI.money(moveFee))} fee` : ', at no charge'}.</li>` : ''}
    </ul></section>`;
  }
  const GUEST_RULE = { lead: 'Only your details are needed.', name: 'A name for each guest.', nameEmail: 'A name and email for each guest.' };
  function renderEvent(main, id) {
    const e = Core.findEvent(S(), id);
    if (!canShow(e)) {
      main.innerHTML = `${UI.pageHead('Event not found', '', 'It may have been removed, or it is not on sale.', '#/browse')}${UI.empty('Go back to Find events to see what is on.')}`;
      return;
    }
    const now = App.now(), status = Core.eventStatus(S(), e, now), o = options(e), v = venueOf(e), t = typeOf(e);
    const bookable = status === 'On sale' && ((o.sessions.length && o.ticket) || o.block);
    const kinds = [];
    const unitText = (base, kind) => { const mine = myPrice(e, base, kind); return mine < base ? `${UI.money(mine)} member price` : UI.money(base); };
    if (o.block) { const save = blockSavingFor(e, o, 1); kinds.push(['block', 'Full series', unitText(e.block.price, 'block'), `All ${plural(o.block.sessions.length, 'session')}`, save && save.saving > 0 ? `Save ${UI.money(save.saving)}` : '']); }
    if (o.sessions.length && o.ticket) kinds.push(['dropin', 'Individual session', unitText(o.ticket.price, 'dropin'), 'Choose one session', '']);
    const startKind = kinds.length ? kinds[0][0] : '';
    if (cart && cart.offerId) cart = null;   /* came back from booking an offered place */
    if (!cart || cart.eventId !== id) cart = { eventId: id, kind: startKind, sessionId: o.sessions.length ? o.sessions[0].session.id : '', qty: 1, codeText: '', codeNote: '', form: null, heldUntil: null, holdId: null };
    if (!kinds.some((k) => k[0] === cart.kind)) cart.kind = startKind;
    if (!o.sessions.some((x) => x.session.id === cart.sessionId)) cart.sessionId = o.sessions.length ? o.sessions[0].session.id : '';
    const sessions = Core.remainingSessions(e, now);
    const about = `<section class="card"><h2>About this event</h2>${e.description ? `<p>${esc(e.description)}</p>` : '<p class="muted">No description yet.</p>'}
        <dl class="bd-dl"><dt>Format</dt><dd>${esc(e.format)}</dd><dt>Sessions</dt><dd>${sessions.length ? `${esc(plural(sessions.length, 'session'))} still to come, from ${esc(UI.dateTime(sessions[0].start))}` : 'No sessions still to come'}</dd>
        <dt>Tickets</dt><dd>Up to ${e.maxPerBooking || 6} in one booking</dd><dt>Guest details</dt><dd>${esc(GUEST_RULE[e.guestDetails] || '')}</dd></dl></section>
      ${whereHtml(v)}${policyHtml(e, v)}`;
    /* A banner like a ticketing site: a portrait poster, then what, when, where and how much. */
    const from = fromPrice(e, o), mineFrom = from === null ? null : myPrice(e, from, fromKind(o)), image = String(e.image || '').trim();
    const bg = /^https?:\/\//i.test(image) ? ` style="--bg:url('${esc(image.replace(/['"()\\\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()))}')"` : '';
    const line = (icon, text, cls) => (text ? `<p class="tk-fact${cls ? ' ' + cls : ''}">${UI.icon(icon)}<span>${esc(text)}</span></p>` : '');
    main.innerHTML = `<div class="tk-screen">
      <p class="tk-crumb"><a href="#/browse">\u2190 Find events</a></p>
      <section class="tk-banner${bg ? ' has-bg' : ''}"${bg}>
        <div class="tk-banner-poster">${UI.poster(e.title, '', 'md', e.image)}</div>
        <div class="tk-banner-info">
          <div class="tk-banner-tags">${t ? `<span class="tk-tag">${esc(t.name)}</span>` : ''}<span class="tk-tag">${esc(e.format)}</span>${status === 'Sold out' ? '<span class="tk-tag is-bad">Sold out</span>' : status === 'Scheduled' ? '<span class="tk-tag">Booking soon</span>' : ''}</div>
          <h1>${esc(e.title)}</h1>
          ${line('cal', sessions.length ? `${UI.dateTime(sessions[0].start)}${sessions.length > 1 ? ` and ${plural(sessions.length - 1, 'more session')}` : ''}` : '')}
          ${line('pin', v ? `${v.name}${v.city ? ', ' + v.city : ''}` : '')}
          ${line('ticket', from === null ? '' : `From ${UI.money(mineFrom)}${mineFrom < from ? ' member price' : ''} · up to ${e.maxPerBooking || 6} tickets in one booking`)}
          ${bookable ? '<button type="button" class="btn btn-primary tk-banner-book" data-scroll>Book tickets</button>' : ''}
        </div>
      </section>
      <ol class="tk-steps" aria-label="Booking steps"><li class="is-on" aria-current="step">1 Choose</li><li>2 Pay</li><li>3 Your booking</li></ol>
      <div class="tk-event">
        <div class="tk-event-cols"><div class="tk-info">${about}</div><div class="tk-side"><section class="card tk-panel" id="tk-panel" aria-label="Book tickets"></section></div></div>
      </div></div>`;
    const panel = main.querySelector('#tk-panel');
    const jump = main.querySelector('[data-scroll]');
    if (jump) jump.addEventListener('click', () => { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); const first = panel.querySelector('input:checked, input, button'); if (first) first.focus({ preventScroll: true }); });
    /* Sessions with no place for this customer, with the waitlist; and any place offered to them on this event. */
    const offersPart = () => { const rows = myWaitlist().filter((x) => x.event.id === e.id && x.state === 'offered'); return rows.length ? `<div class="tk-waitlist tk-wl-inline"><h3>A place is free for you</h3><ul>${rows.map(waitlistRow).join('')}</ul></div>` : ''; };
    const waitPart = () => {
      if (status !== 'On sale' && status !== 'Sold out') return '';
      const when = App.now();
      const rows = sessions.map((x) => ({ x, mine: myEntry(x.id) })).filter(({ x, mine }) => {
        if (mine && offerBookable(e, mine.id, when)) return false;
        return !!mine || placesFor(x, when) <= 0 || (e.dropInsEnabled !== false && !!o.ticket && sellLeft(e, x, when) <= 0);
      });
      if (!rows.length) return '';
      const label = (x) => `${UI.date(x.start)}, ${UI.time(x.start)}`;
      return `<div class="tk-wait"><h3>${e.waitlistOn ? 'Sold out sessions' : 'Sold out'}</h3>${e.waitlistOn ? '<p class="hint">Join the waitlist and we will email you if a place opens.</p>' : ''}<ul>${rows.map(({ x, mine }) => {
        const ended = !!mine && mine.status === 'Offered', name = esc(label(x));
        const say = ended ? 'Your offer has ended' : mine ? 'You\'re on the waitlist' : 'Sold out';
        const act = ended ? `<button type="button" class="btn btn-small" data-wl-join="${esc(x.id)}" aria-label="Join the waitlist again for ${name}">Join again</button>`
          : mine ? `<button type="button" class="btn btn-small" data-wl-leave="${esc(mine.id)}" aria-label="Leave the waitlist for ${name}">Leave</button>`
            : e.waitlistOn ? `<button type="button" class="btn btn-small" data-wl-join="${esc(x.id)}" aria-label="Join the waitlist for ${name}">Join the waitlist</button>` : '';
        return `<li><span><b>${esc(UI.date(x.start))}</b><small>${esc(UI.time(x.start))} · ${esc(say)}</small></span>${act}</li>`;
      }).join('')}</ul></div>`;
    };
    /* The first sentence of the description sits under the title. */
    const tagline = (String(e.description || '').trim().match(/^.*?[.!?](?=\s|$)/) || [String(e.description || '').trim()])[0];
    const panelHead = () => `<h2 class="tk-book-tag">Book tickets</h2><p class="tk-book-title">${esc(e.title)}</p>${tagline ? `<p class="tk-book-line">${esc(tagline)}</p>` : ''}`;
    const dayMonth = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const dayMonthYear = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    /* All the dates when they fit on a line or two, otherwise the first and the last. */
    const seriesDates = (list) => {
      const last = list[list.length - 1];
      if (list.length === 1) return dayMonthYear(last.start);
      return list.length <= 5 ? `${list.slice(0, -1).map((x) => dayMonth(x.start)).join(', ')}, ${dayMonthYear(last.start)}` : `${dayMonth(list[0].start)} to ${dayMonthYear(last.start)}`;
    };
    /* "4-Week" only when the sessions really are one a week. */
    const seriesName = (list) => {
      const weekly = list.length > 1 && list.every((x, i) => !i || Math.round((new Date(x.start) - new Date(list[i - 1].start)) / 86400000) === 7);
      return weekly ? `Full ${list.length}-Week Series` : 'Full series';
    };
    /* One choice as a card. Prices are what this customer pays for one ticket. */
    const optionCard = (k) => {
      const on = cart.kind === k, block = k === 'block';
      const when = (text) => `<small class="tk-opt-when">${UI.icon('cal')}<span>${esc(text)}</span></small>`;
      let main, price;
      if (block) {
        const list = o.block.sessions, mine = myPrice(e, e.block.price, 'block'), save = blockSavingFor(e, o, 1);
        const saves = save && save.saving > 0;
        main = `<b>${esc(seriesName(list))}</b><small>All ${esc(plural(list.length, 'session'))} included</small>${when(seriesDates(list))}`;
        price = `${saves ? `<em class="tk-save">Save ${esc(UI.money(save.saving))}</em>` : ''}<b>${esc(UI.money(mine))}</b>${saves ? `<s><span class="sr-only">Instead of </span>${esc(UI.money(save.singles))}</s>` : ''}${list.length > 1 ? `<small>${esc(UI.money(Core.round2(mine / list.length)))} per session</small>` : ''}`;
      } else {
        const picked = o.sessions.find((x) => x.session.id === cart.sessionId) || o.sessions[0];
        /* An event with one date has nothing to choose, so the card just says what the ticket is for. */
        const oneDate = o.sessions.length === 1 && !o.block;
        main = oneDate
          ? `<b>Ticket</b><small>${esc(UI.time(picked.session.start))}${picked.left <= lowAt(e) ? ` · only ${esc(plural(picked.left, 'place'))} left` : ''}</small>${when(dayMonthYear(picked.session.start))}`
          : `<b>Individual session</b><small>Choose one available date</small>${when(on ? dayMonthYear(picked.session.start) : `Next: ${dayMonthYear(o.sessions[0].session.start)}`)}`;
        price = `<b>${esc(UI.money(myPrice(e, o.ticket.price, 'dropin')))}</b><small>${oneDate ? 'per ticket' : 'per session'}</small>`;
      }
      return `<label class="tk-option"><input type="radio" name="kind" value="${k}"${on ? ' checked' : ''}><span class="tk-opt"><span class="tk-radio" aria-hidden="true"></span><span class="tk-opt-main">${main}</span><span class="tk-opt-price">${price}</span></span></label>`;
    };
    const paint = () => {
      if (!bookable) {
        const say = status === 'Sold out' || (status === 'On sale' && !kinds.length) ? `${UI.badge('Sold out', 'bad')} Every place has gone.`
          : status === 'Scheduled' ? `${UI.badge('Booking soon', 'info')} ${e.salesOpenAt ? `Booking opens on ${esc(UI.dateTime(e.salesOpenAt))}.` : 'Booking opens soon.'}`
            : status === 'Completed' ? 'This event has finished.' : 'Booking has closed for this event.';
        panel.innerHTML = `${panelHead()}${offersPart()}<p>${say}</p>${waitPart()}<a class="btn" href="#/browse">Find other events</a>`;
        return;
      }
      const max = maxQty(e, o, cart);
      cart.qty = Math.min(Math.max(1, cart.qty), max);
      const chk = codeCheck(e, cart.codeText), quote = quoteFor(e, o, cart);
      const kindPart = kinds.length ? `<fieldset class="tk-fieldset"><legend class="sr-only">What do you want to book?</legend><div class="tk-options">${kinds.map(([k]) => optionCard(k)).join('')}</div></fieldset>` : '';
      const sessionPart = cart.kind === 'dropin' && o.sessions.length === 1 && !o.block ? ''
        : cart.kind === 'dropin'
        ? `<fieldset class="tk-fieldset"><legend>Pick a session</legend><div class="tk-sessions">${o.sessions.map((x) => `<label class="tk-session"><input type="radio" name="session" value="${esc(x.session.id)}"${cart.sessionId === x.session.id ? ' checked' : ''}><span><b>${esc(UI.date(x.session.start))}</b><small>${esc(UI.time(x.session.start))} · ${x.left <= lowAt(e) ? `only ${plural(x.left, 'place')} left` : `${plural(x.left, 'place')} left`}</small></span></label>`).join('')}</div></fieldset>`
        : (o.block.left <= lowAt(e) ? `<p class="hint">Only ${esc(plural(o.block.left, 'place'))} left for the full series.</p>` : '');
      const seriesNote = !o.block && e.block && e.block.enabled && o.sessions.length ? `<p class="hint">${Core.blockSaleOpen(e, now) ? 'The full series is sold out because at least one session is full.' : 'The full series is no longer on sale because it has started.'} You can still book an individual session.</p>` : '';
      panel.innerHTML = `${panelHead()}${offersPart()}${kindPart}${seriesNote}${sessionPart}
        <div class="tk-qty"><span id="tk-qty-label">Tickets</span><div class="tk-stepper" role="group" aria-labelledby="tk-qty-label">
          <button type="button" class="btn btn-small" data-qty="-1" aria-label="One fewer ticket"${cart.qty <= 1 ? ' disabled' : ''}>−</button><output aria-live="polite">${cart.qty}</output>
          <button type="button" class="btn btn-small" data-qty="1" aria-label="One more ticket"${cart.qty >= max ? ' disabled' : ''}>+</button></div></div>
        <div class="tk-code"><label for="tk-code-in">Discount code</label><div><input id="tk-code-in" type="text" maxlength="40" autocomplete="off" value="${esc(cart.codeText)}" placeholder="Have a code?"><button type="button" class="btn" data-apply>Apply</button></div>
          <p class="hint" role="status">${cart.codeText && chk.note ? esc(chk.note) : cart.codeText && chk.code ? 'Code applied.' : ''}</p></div>
        <div class="tk-summary" aria-live="polite">${savingHtml(e, o, cart)}${memberBanner(e, quote, cart.kind)}${priceHtml(quote, quote.note, cart.kind, e)}</div>
        <button type="button" class="btn btn-primary tk-pay" data-go>${quote.total > 0 ? `Proceed to pay ${esc(UI.money(quote.total))}` : 'Continue'}</button>${waitPart()}`;
    };
    panel.addEventListener('change', (ev) => {
      if (ev.target.name === 'kind') cart.kind = ev.target.value;
      else if (ev.target.name === 'session') cart.sessionId = ev.target.value;
      else return;
      cart.form = null; UI.keepFocus(paint);
      /* Stay on the choice just made, so the arrow keys keep working. */
      const chosen = panel.querySelector(`input[name="${ev.target.name}"]:checked`);
      if (chosen) chosen.focus();
    });
    panel.addEventListener('click', (ev) => {
      if (waitlistClick(ev)) return;
      const step = ev.target.closest('[data-qty]');
      if (step) { cart.qty += Number(step.dataset.qty); cart.form = null; UI.keepFocus(paint); return; }
      if (ev.target.closest('[data-apply]')) { cart.codeText = panel.querySelector('#tk-code-in').value.trim(); UI.keepFocus(paint); return; }
      if (ev.target.closest('[data-go]')) {
        cart.codeText = panel.querySelector('#tk-code-in').value.trim();
        cart.heldUntil = null; cart.holdId = null;
        App.go(`#/browse/${encodeURIComponent(id)}/pay`);
      }
    });
    panel.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.id === 'tk-code-in') { ev.preventDefault(); panel.querySelector('[data-apply]').click(); } });
    paint();
  }

  /* ---------- Checkout ---------- */
  const isTick = (q) => /tick|check|box/i.test(q.type || '');
  const blankForm = (e, qty) => ({ name: App.user().guest && App.user().name !== 'Guest' ? App.user().name : '', email: App.user().guest ? (App.user().email || '') : '', phone: '', marketing: false, lead: { answers: {} }, guests: Array.from({ length: Math.max(0, qty - 1) }, () => ({ name: '', email: '', answers: {} })) });
  const setPath = (obj, path, value) => { const keys = path.split('.'); let o = obj; keys.slice(0, -1).forEach((k) => { o = o[k]; }); o[keys[keys.length - 1]] = value; };
  /* What the checkout screen lists: the tickets, then any money off. */
  const payLines = (quote, kind) => [{ label: unitLabel(quote, kind), amount: quote.subtotal }]
    .concat(quote.memberDiscount > 0 ? [{ label: 'Member price', amount: -quote.memberDiscount }] : [], quote.codeDiscount > 0 ? [{ label: 'Discount code', amount: -quote.codeDiscount }] : []);
  function leaveCheckout() { clearInterval(timerId); timerId = null; }

  function renderPay(main, id) {
    const e = Core.findEvent(S(), id);
    const back = () => App.go(`#/browse/${encodeURIComponent(id)}`);
    if (!e || !cart || cart.eventId !== id) { back(); return; }
    const o = options(e), now = App.now(), isOffer = !!cart.offerId;
    if (!canShow(e)) { cart = null; back(); return; }
    if (isOffer ? !offerBookable(e, cart.offerId, now) : (Core.eventStatus(S(), e, now) !== 'On sale' || !idsFor(o, cart).length || (cart.kind === 'dropin' && !o.sessions.some((x) => x.session.id === cart.sessionId)))) {
      if (isOffer) cart = null;
      UI.toast('That choice is no longer available. Please pick again.', 'bad'); back(); return;
    }
    cart.qty = Math.min(cart.qty, maxQty(e, o, cart));
    if (!cart.form || cart.form.guests.length !== cart.qty - 1) cart.form = blankForm(e, cart.qty);
    const f = cart.form, user = App.user(), v = venueOf(e);
    const chk = codeCheck(e, cart.codeText);
    /* The places are held for a few minutes, and so is a capped code, so nobody takes them while this is filled in. */
    if (!cart.heldUntil) {
      cart.heldUntil = Date.now() + (S().settings.holdMinutes || 10) * 60000;
      /* An offered place is only held until the offer ends. */
      if (isOffer) cart.heldUntil = Math.min(cart.heldUntil, new Date(S().waitlist.find((w) => w.id === cart.offerId).offerUntil).getTime());
      if (chk.code && chk.code.usageCap) { const h = Core.holdCode(S(), chk.code, { now }); cart.holdId = h.ok ? h.hold.id : null; App.save(); }
    }
    const quote = quoteFor(e, o, cart);
    const byLink = e.collectAt === 'link';
    const guestQs = e.guestDetails === 'lead' ? [] : (e.questions || []).filter((q) => q.scope !== 'booking');
    const qField = (q, path, value, needed) => {
      const id2 = `pf-${path.replace(/\./g, '-')}`;
      const control = q.type === 'choice'
        ? `<select id="${id2}" data-f="${path}"><option value="">Choose</option>${UI.options((q.options || []).map((x) => ({ value: x, label: x })), value || '')}</select>`
        : isTick(q) ? `<input type="checkbox" id="${id2}" data-f="${path}"${value === 'Yes' ? ' checked' : ''}>`
          : `<input type="text" id="${id2}" data-f="${path}" value="${esc(value || '')}">`;
      return isTick(q) ? `<label class="check">${control}<span>${esc(q.label)}${needed ? ' (needed)' : ''}</span></label>` : `<div class="field"><span><label for="${id2}">${esc(q.label)}${needed ? ' (needed)' : ''}</label></span>${control}</div>`;
    };
    const tf = (label, path, value, type, needed, extra) => `<div class="field"><span><label for="pf-${path.replace(/\./g, '-')}">${esc(label)}${needed ? '' : ' (optional)'}</label></span><input id="pf-${path.replace(/\./g, '-')}" type="${type || 'text'}" data-f="${path}" value="${esc(value)}" ${extra || ''}></div>`;
    const sessionsText = cart.kind === 'block' ? `Full series, all ${plural(o.block.sessions.length, 'session')}: ${o.block.sessions.map((x) => UI.date(x.start)).join(', ')}` : UI.dateTime((Core.findSession(S(), cart.sessionId) || { session: { start: '' } }).session.start);

    main.innerHTML = `<div class="tk-screen">
      ${UI.pageHead('Payment', '', `${e.title} · ${v ? v.name : ''}`, `#/browse/${encodeURIComponent(id)}`)}
      <ol class="tk-steps" aria-label="Booking steps"><li class="is-done">1 Choose</li><li class="is-on" aria-current="step">2 Pay</li><li>3 Your booking</li></ol>
      <p class="tk-hold" id="tk-hold" role="timer" aria-live="off"></p>
      <div class="tk-event-cols tk-pay-cols">
        <div class="tk-info">
          <section class="card"><h2>Your details</h2>
            ${user.guest ? `<p class="muted">No account needed. We send your confirmation to this email.</p>${tf('Your name', 'name', f.name, 'text', true, 'autocomplete="name"')}${tf('Email', 'email', f.email, 'email', true, 'autocomplete="email"')}` : `<p class="muted">Booking as <b>${esc(user.name)}</b> (${esc(user.email || 'no email')}).</p>`}
            ${tf('Phone', 'phone', f.phone, 'tel', false, 'autocomplete="tel"')}
            ${(e.questions || []).map((q) => qField(q, `lead.answers.${q.id}`, f.lead.answers[q.id], q.required && !byLink)).join('')}
            <label class="check"><input type="checkbox" data-f="marketing"${f.marketing ? ' checked' : ''}><span>Send me news and offers about events</span></label>
          </section>
          ${cart.qty > 1 && e.guestDetails !== 'lead' ? `<section class="card"><h2>Guests</h2>${byLink ? '<p>You do not need your guests\' details yet. Add them from your booking after you pay. We will also email you a link (demo: no email is sent).</p>' : f.guests.map((g, i) => `<fieldset class="tk-fieldset"><legend>Guest ${i + 1}</legend>
              ${tf('Name', `guests.${i}.name`, g.name, 'text', !byLink)}${e.guestDetails === 'nameEmail' ? tf('Email', `guests.${i}.email`, g.email, 'email', !byLink) : ''}
              ${guestQs.map((q) => qField(q, `guests.${i}.answers.${q.id}`, g.answers[q.id], q.required && !byLink)).join('')}</fieldset>`).join('')}</section>` : ''}
          ${whereHtml(v)}${policyHtml(e, v)}
          ${quote.total > 0 ? '<section class="card"><h2>Payment</h2><p>You pay on a secure checkout screen next: card, Apple Pay or Google Pay.</p><p class="hint">Your card details are only used for this payment. We keep the card type and last 4 digits for your receipt, nothing more.</p></section>' : ''}
        </div>
        <div class="tk-side"><section class="card tk-panel" aria-label="Order summary"><h2>Order summary</h2>
          <p><b>${esc(e.title)}</b></p><p class="muted">${esc(sessionsText)}</p><p class="muted">${esc(plural(cart.qty, 'ticket'))}</p>
          ${isOffer ? '<p class="tk-member"><b>From the waitlist.</b> This place is held for you until your offer ends.</p>' : ''}${savingHtml(e, o, cart)}${memberBanner(e, quote)}${priceHtml(quote, quote.note, cart.kind)}
          <div id="tk-errors" class="form-error" role="alert" hidden></div>
          <button type="button" class="btn btn-primary tk-pay" id="tk-pay">${quote.total > 0 ? `Continue to payment, ${esc(UI.money(quote.total))}` : 'Confirm free booking'}</button>
          ${quote.total > 0 ? UI.demo('payment is a test checkout. No money is taken.') : ''}
          <a class="btn btn-ghost" href="#/browse/${encodeURIComponent(id)}" id="tk-back">Change my choice</a>
        </section></div></div></div>`;

    const root = main.querySelector('.tk-screen');   /* listeners go on this screen, not on #main, which lives on between pages */
    root.addEventListener('input', (ev) => { const p = ev.target.dataset && ev.target.dataset.f; if (p && ev.target.type !== 'checkbox') setPath(f, p, ev.target.value); });
    root.addEventListener('change', (ev) => {
      const t = ev.target;
      const p = t.dataset && t.dataset.f;
      if (!p) return;
      setPath(f, p, t.type === 'checkbox' ? (/answers\./.test(p) ? (t.checked ? 'Yes' : '') : t.checked) : t.value);
    });
    main.querySelector('#tk-back').addEventListener('click', () => { if (cart.holdId) { Core.releaseCodeHold(S(), cart.holdId); App.save(); } cart.heldUntil = null; cart.holdId = null; });

    /* the hold timer */
    const holdEl = main.querySelector('#tk-hold');
    const tick = () => {
      if (!document.body.contains(holdEl)) { leaveCheckout(); return; }
      const left = Math.max(0, cart.heldUntil - Date.now());
      holdEl.textContent = `Your ${cart.qty === 1 ? 'place is' : 'places are'} held for ${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
      holdEl.classList.toggle('is-low', left < 60000);
      if (left <= 0) {
        leaveCheckout();
        if (cart.holdId) { Core.releaseCodeHold(S(), cart.holdId); App.save(); }
        cart.heldUntil = null; cart.holdId = null;
        /* A checkout still open for these places is closed too: they are no longer held. */
        document.querySelectorAll('dialog.pay-dialog').forEach((d) => { if (d.open) d.close(); d.remove(); });
        UI.toast('Your places are no longer held. Please choose again.', 'bad');
        App.go(`#/browse/${encodeURIComponent(id)}`);
      }
    };
    leaveCheckout(); tick(); timerId = setInterval(tick, 1000);

    /* paying */
    const errBox = main.querySelector('#tk-errors'), payBtn = main.querySelector('#tk-pay');
    const showErrors = (list) => {
      errBox.hidden = !list.length;
      errBox.innerHTML = list.length ? `<ul>${list.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul>` : '';
      main.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
      list.forEach((x) => { const el = x.id && main.querySelector('#' + x.id); if (el) el.setAttribute('aria-invalid', 'true'); });
      const first = list.find((x) => x.id && main.querySelector('#' + x.id));
      if (first) main.querySelector('#' + first.id).focus();
    };
    const validate = () => {
      const errs = [], add = (text, idv) => errs.push({ text, id: idv });
      if (user.guest) {
        if (!f.name.trim()) add('Enter your name.', 'pf-name');
        if (!validEmail(f.email)) add('Enter a valid email address.', 'pf-email');
      } else if (!user.email) add('Your account has no email address. Ask an admin to add one.');
      (e.questions || []).forEach((q) => { if (q.required && !byLink && !String(f.lead.answers[q.id] || '').trim()) add(`Answer: ${q.label}`, `pf-lead-answers-${q.id}`); });
      if (e.guestDetails !== 'lead' && !byLink) f.guests.forEach((g, i) => {
        if (!g.name.trim()) add(`Enter a name for guest ${i + 1}.`, `pf-guests-${i}-name`);
        if (e.guestDetails === 'nameEmail') { if (!g.email.trim()) add(`Enter an email for guest ${i + 1}.`, `pf-guests-${i}-email`); else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email.trim())) add(`The email for guest ${i + 1} does not look right.`, `pf-guests-${i}-email`); }
        guestQs.forEach((q) => { if (q.required && !String(g.answers[q.id] || '').trim()) add(`Guest ${i + 1}: answer ${q.label}`, `pf-guests-${i}-answers-${q.id}`); });
      });
      return errs;
    };
    const payLabel = () => (quote.total > 0 ? `Continue to payment, ${UI.money(quote.total)}` : 'Confirm free booking');
    /* Places may have gone while the form was open, so this is checked before taking payment, and again after. */
    const stillBookable = () => {
      const fresh = options(e), when = App.now();
      /* A live offer can be booked even when the session looks full to everyone else. */
      const viaOffer = !!cart.offerId && offerBookable(e, cart.offerId, when);
      if (!canShow(e) || (!viaOffer && Core.eventStatus(S(), e, when) !== 'On sale')) return { error: 'This event is no longer on sale.' };
      const ids = idsFor(fresh, cart);
      if (!ids.length) return { error: cart.kind === 'block' ? 'The full series can no longer be booked, because a session has filled up or started. Choose "Change my choice" to book an individual session.' : 'This can no longer be booked.' };
      const open = viaOffer ? cart.qty : cart.kind === 'block' ? (fresh.block ? fresh.block.left : 0) : ((fresh.sessions.find((x) => x.session.id === cart.sessionId) || {}).left || 0);
      if (Core.capacityShortfall(S(), ids, cart.qty).length || cart.qty > open) return { error: 'There are not enough places left. Try fewer tickets or another session.' };
      const again = codeCheck(e, cart.codeText);
      if (cart.codeText && !again.code) return { error: `${again.note || 'The code can no longer be used.'} Remove the code and try again.` };
      /* What is booked must be what was charged. */
      if (quoteFor(e, fresh, cart).total !== quote.total) return { error: 'The price has changed. Please go back and check it.' };
      return { fresh, ids, code: again.code, when };
    };
    payBtn.addEventListener('click', () => {
      const errs = validate();
      showErrors(errs);
      if (errs.length) return;
      const ok = stillBookable();
      if (ok.error) { showErrors([{ text: `${ok.error} You have not been charged.` }]); return; }
      if (quote.total <= 0) { finish(null); return; }
      payBtn.disabled = true;
      Pay.checkout({
        amount: quote.total, currency: 'GBP', description: `${e.title}${v ? ' · ' + v.name : ''}`, email: (user.guest ? f.email.trim() : user.email) || '', lines: payLines(quote, cart.kind),
        onSuccess: (receipt) => finish(receipt),
        onCancel: () => { payBtn.disabled = false; payBtn.focus(); }
      });
    });
    function finish(receipt) {
      const fail = (text) => { payBtn.disabled = false; payBtn.textContent = payLabel(); showErrors([{ text }]); };
      if (!cart || cart.eventId !== id || !cart.heldUntil) { UI.toast('Your places were no longer held, so nothing was booked and your payment will not be taken.', 'bad'); return; }
      const ok = stillBookable();
      /* Demo only: in a real checkout the payment would be held and released here, not taken. */
      if (ok.error) { fail(`${ok.error}${receipt ? ' Your payment has been cancelled and will not be taken.' : ''}`); return; }
      const { fresh, ids, when } = ok, again = { code: ok.code };
      const guests = f.guests.map((g) => ({ name: e.guestDetails === 'lead' ? '' : g.name.trim(), email: e.guestDetails === 'nameEmail' ? g.email.trim() : '', answers: e.guestDetails === 'lead' ? {} : Object.assign({}, g.answers) }));
      const method = quote.total <= 0 || !receipt ? 'No payment' : (receipt.wallet || 'Card');
      /* A guest keeps these details for this visit only, to see this booking and to fill in the next one. */
      if (user.guest) Object.assign(user, { name: f.name.trim(), email: f.email.trim() });
      const b = Core.createBooking(S(), {
        event: e, kind: cart.kind, sessionIds: ids, ticketTypeId: ticketIdFor(e, fresh, cart),
        customer: { name: user.name, email: user.email, phone: f.phone.trim(), isMember: isMember(), marketingConsent: !!f.marketing, answers: Object.assign({}, f.lead.answers) },
        guests, code: again.code, codeHoldId: cart.holdId || undefined, payment: method, source: 'Online', channel: App.bookingChannel ? App.bookingChannel() : 'Website', by: 'Customer', now: when
      });
      if (user.guest) user.guestBookings = (user.guestBookings || []).concat(b.id);
      markWaitlistBooked(ids, b, when);
      if (receipt) {
        Pay.attach(b.payments.find((x) => x.type === 'Payment'), receipt);
        Core.logBooking(b, when, 'Customer', `Paid ${UI.money(b.pricing.total)} by ${Pay.describe(b.payments.find((x) => x.type === 'Payment'))}, receipt ${receipt.id} (test checkout).`);
      }
      Core.logBooking(b, when, 'Customer', 'Confirmation email sent (demo, not really sent).');
      Core.klaviyo(S(), { at: when, type: 'Booking confirmed', ref: b.ref });
      if (byLink && guests.length && e.guestDetails !== 'lead') Core.logBooking(b, when, 'Customer', 'Guest details link sent to the lead booker (demo, not really sent).');
      App.log('Online booking', `${b.ref}: ${e.title}, ${plural(cart.qty, 'ticket')}, ${UI.money(b.pricing.total)}, ${method}.`);
      App.save();
      leaveCheckout();
      const bookedId = b.id;
      cart = null;
      App.go(`#/mybookings/${encodeURIComponent(bookedId)}/confirmed`);
    }
  }

  /* What My bookings needs from here. */
  window.FindEvents = {
    waitlistHtml, waitlistClick, mapLink, canShow,
    showType(typeId) { Object.assign(view, { q: '', when: '', venue: '', type: typeId || '' }); App.go('#/browse'); }
  };

  App.route('browse', {
    title: 'Find events',
    perm: 'browse',
    render(main, params) {
      leaveCheckout();
      const parts = (params || []).map((p) => String(p).split('?')[0]).filter(Boolean);
      if (!parts.length) renderBrowse(main);
      else if (parts[1] === 'pay') renderPay(main, parts[0]);
      else renderEvent(main, parts[0]);
    }
  });
})();
