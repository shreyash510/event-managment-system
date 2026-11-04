/* Find events and booking: what a normal user sees to choose an event, pick a session, pay and book for themselves.
   #/browse                    the events on sale: search, type tabs, date filter
   #/browse/<eventId>          the event page: details, sessions, tickets, a discount code and the price
   #/browse/<eventId>/pay      checkout: details, payment and the order summary, with the places held for a few minutes
   Their bookings are on the My bookings page (mybookings.js). Staff book for other people from the Bookings page.
   Payment goes through the checkout screen in pay.js. It is a demo: no money moves. */
(function () {
  'use strict';
  const S = () => App.state;
  const esc = (v) => UI.esc(v);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const view = { q: '', type: '', when: '' };   /* the listing's search, tab and date filter, kept between visits */
  let cart = null;   /* what the person has picked on the event page, and what they typed at checkout */
  let timerId = null;

  /* ---------- What can be bought ---------- */
  const listed = () => {
    const now = App.now();
    return App.visibleEvents().map((e) => ({ e, status: Core.eventStatus(S(), e, now), rem: Core.remainingSessions(e, now) }))
      .filter((x) => (x.status === 'On sale' || x.status === 'Sold out') && x.rem.length)
      .sort((a, b) => a.rem[0].start.localeCompare(b.rem[0].start));
  };
  /* Single sessions with places left, and a whole block if one is on sale. */
  function options(e) {
    const now = App.now(), s = S();
    const ticket = Core.currentTicket(s, e, now);
    const sessions = e.dropInsEnabled === false || !ticket ? [] : Core.remainingSessions(e, now).map((x) => ({ session: x, left: Core.dropInLeft(s, e, x) })).filter((x) => x.left > 0);
    const blockSessions = Core.blockSaleOpen(e, now) ? Core.remainingSessions(e, now) : [];
    const blockLeft = blockSessions.length ? Core.blockPlacesLeft(s, e, now) : 0;
    return { ticket, sessions, block: blockLeft > 0 ? { sessions: blockSessions, left: blockLeft } : null };
  }
  const venueOf = (e) => Core.findVenue(S(), e.venueId);
  const typeOf = (e) => Core.findType(S(), e.typeId);
  const fromPrice = (e, o) => (o.sessions.length && o.ticket ? o.ticket.price : (o.block ? e.block.price : null));
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
      (!view.when || x.rem.some((s) => inRange(s.start, view.when)));
  };
  function card(x) {
    const e = x.e, v = venueOf(e), t = typeOf(e), o = options(e);
    const from = fromPrice(e, o), sold = x.status === 'Sold out' || (!o.sessions.length && !o.block);
    const low = o.sessions.some((s) => Core.isLowSpace(S(), e, s.session));
    return `<a class="card tk-card${sold ? ' is-sold' : ''}" href="#/browse/${encodeURIComponent(e.id)}">
      ${UI.poster(e.title, t ? t.name : e.format, '', e.image)}
      <div class="tk-body">
        <div class="tk-meta">${sold ? UI.badge('Sold out', 'bad') : low ? UI.badge('Few spaces left', 'warn') : ''}${UI.badge(e.format, 'quiet')}</div>
        <h2>${esc(e.title)}</h2>
        <p class="muted">${esc(v ? v.name : '')}</p>
        <p class="tk-when">${esc(UI.dateTime(x.rem[0].start))}${x.rem.length > 1 ? ` <span class="muted">+ ${plural(x.rem.length - 1, 'more session')}</span>` : ''}</p>
        <div class="tk-foot"><span class="tk-price">${from === null ? '' : `From <b>${UI.money(from)}</b>`}</span><span class="tk-go">${sold ? 'View' : 'Book'}</span></div>
      </div></a>`;
  }
  function renderBrowse(main) {
    main.innerHTML = `<div class="tk-screen">
      ${UI.pageHead('Find events', '', 'Choose an event, pick a session and book your tickets.', false)}
      <div class="list-bar">
        <div id="tk-types"></div>
        <div class="list-row"><div id="tk-when"></div>
          <div class="list-tools" role="search">${UI.search({ id: 'tk-q', value: view.q, placeholder: 'Search events, venues or types...' })}</div></div>
      </div>
      <p class="hint" id="tk-count" role="status"></p>
      <div id="tk-results"></div></div>`;
    const paint = () => {
      const all = listed(), rows = all.filter((x) => matches(x));
      const types = [];
      all.forEach((x) => { const t = typeOf(x.e); if (t && !types.some((y) => y.id === t.id)) types.push(t); });
      const countFor = (id) => all.filter((x) => matches(x, 'type') && (!id || x.e.typeId === id)).length;
      UI.keepFocus(() => {
        main.querySelector('#tk-types').innerHTML = UI.tabs([{ key: '', label: 'All', icon: 'grid', count: countFor(''), on: !view.type }]
          .concat(types.map((t) => ({ key: t.id, label: t.name, count: countFor(t.id), on: view.type === t.id }))), { label: 'Event type' });
        main.querySelector('#tk-when').innerHTML = UI.tabs([['', 'Any date'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month']].map(([key, label]) => ({ key, label, on: view.when === key })), { sub: true, attr: 'data-when', label: 'When' });
      });
      main.querySelector('#tk-count').textContent = rows.length ? plural(rows.length, 'event') : '';
      main.querySelector('#tk-results').innerHTML = rows.length ? `<div class="tk-grid">${rows.map(card).join('')}</div>`
        : UI.empty(all.length ? 'No events match. Try another type, date or search.' : 'There is nothing on sale at the moment. Try another venue, or come back soon.');
    };
    main.querySelector('#tk-types').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) { view.type = b.dataset.tab; paint(); } });
    main.querySelector('#tk-when').addEventListener('click', (ev) => { const b = ev.target.closest('[data-when]'); if (b) { view.when = b.dataset.when; paint(); } });
    main.querySelector('#tk-q').addEventListener('input', (ev) => { view.q = ev.target.value; paint(); });
    paint();
  }

  /* ---------- Prices and codes ---------- */
  function codeCheck(e, text) {
    const t = String(text || '').trim();
    if (!t) return { code: null, note: '' };
    const code = Core.findCodeByName(S(), t), r = Core.validateCode(S(), code, e, App.now(), App.user().email);
    if (!r.ok) return { code: null, note: r.reason };
    if (code.usageCap && Core.codeUsesLeft(S(), code, App.now()) <= 0) return { code: null, note: 'This code has been used the most times allowed.' };
    return { code, note: '' };
  }
  const idsFor = (o, c) => (c.kind === 'block' ? (o.block ? o.block.sessions.map((x) => x.id) : []) : [c.sessionId]);
  const maxQty = (e, o, c) => {
    const left = c.kind === 'block' ? (o.block ? o.block.left : 0) : ((o.sessions.find((x) => x.session.id === c.sessionId) || {}).left || 0);
    return Math.max(1, Math.min(e.maxPerBooking || 6, left));
  };
  const quoteFor = (e, o, c) => Core.quote({ event: e, kind: c.kind, ticketTypeId: o.ticket ? o.ticket.id : undefined, qty: c.qty, isMember: false, code: codeCheck(e, c.codeText).code, settings: S().settings });
  function priceHtml(quote, note) {
    return `${note ? `<p class="hint">${esc(note)}</p>` : ''}<div class="tk-lines">
      <div><span>${quote.qty} × ${esc(UI.money(quote.unit))}</span><span>${esc(UI.money(quote.subtotal))}</span></div>
      ${quote.memberDiscount > 0 ? `<div><span>Member price</span><span>−${esc(UI.money(quote.memberDiscount))}</span></div>` : ''}
      ${quote.codeDiscount > 0 ? `<div class="is-good"><span>Discount code</span><span>−${esc(UI.money(quote.codeDiscount))}</span></div>` : ''}
      <div class="tk-total"><span>Total</span><b>${esc(UI.money(quote.total))}</b></div></div>`;
  }

  /* ---------- The event page ---------- */
  const GUEST_RULE = { lead: 'Only the lead booker’s details are needed.', name: 'A name for each guest.', nameEmail: 'A name and email for each guest.' };
  function renderEvent(main, id) {
    const e = Core.findEvent(S(), id);
    if (!e || !App.inVenue(e.venueId)) {
      main.innerHTML = `${UI.pageHead('Event not found', '', 'It may have been removed, or it is at a venue you are not viewing.', '#/browse')}${UI.empty('Go back to Find events to see what is on.')}`;
      return;
    }
    const now = App.now(), status = Core.eventStatus(S(), e, now), o = options(e), v = venueOf(e), t = typeOf(e);
    const bookable = status === 'On sale' && ((o.sessions.length && o.ticket) || o.block);
    const kinds = [];
    if (o.sessions.length && o.ticket) kinds.push(['dropin', 'One session', UI.money(o.ticket.price)]);
    if (o.block) kinds.push(['block', `All ${plural(o.block.sessions.length, 'session')}`, `${UI.money(e.block.price)} each`]);
    if (!cart || cart.eventId !== id) cart = { eventId: id, kind: kinds.length ? kinds[0][0] : '', sessionId: o.sessions.length ? o.sessions[0].session.id : '', qty: 1, codeText: '', codeNote: '', form: null, heldUntil: null, holdId: null };
    if (!kinds.some((k) => k[0] === cart.kind)) cart.kind = kinds.length ? kinds[0][0] : '';
    if (!o.sessions.some((x) => x.session.id === cart.sessionId)) cart.sessionId = o.sessions.length ? o.sessions[0].session.id : '';
    const sessions = Core.remainingSessions(e, now);
    const about = `<section class="card"><h2>About this event</h2>${e.description ? `<p>${esc(e.description)}</p>` : '<p class="muted">No description yet.</p>'}
        <dl class="bd-dl"><dt>Format</dt><dd>${esc(e.format)}</dd><dt>Sessions</dt><dd>${esc(plural(sessions.length, 'session'))} still to come, from ${esc(UI.dateTime(sessions[0].start))}</dd>
        <dt>Tickets</dt><dd>Up to ${e.maxPerBooking || 6} in one booking</dd><dt>Guest details</dt><dd>${esc(GUEST_RULE[e.guestDetails] || '')}</dd></dl></section>
      <section class="card"><h2>Where</h2><p><b>${esc(v ? v.name : '')}</b></p><p class="muted">${esc(v ? (v.address || v.city || '') : '')}</p>${v && v.contact ? `<p><a href="mailto:${esc(v.contact)}">${esc(v.contact)}</a></p>` : ''}</section>`;
    /* A banner like a ticketing site: a portrait poster, then what, when, where and how much. */
    const from = fromPrice(e, o), image = String(e.image || '').trim();
    const bg = /^https?:\/\//i.test(image) ? ` style="--bg:url('${esc(image.replace(/['"()\\\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()))}')"` : '';
    const line = (icon, text, cls) => (text ? `<p class="tk-fact${cls ? ' ' + cls : ''}">${UI.icon(icon)}<span>${esc(text)}</span></p>` : '');
    main.innerHTML = `<div class="tk-screen">
      <p class="tk-crumb"><a href="#/browse">\u2190 Find events</a></p>
      <section class="tk-banner${bg ? ' has-bg' : ''}"${bg}>
        <div class="tk-banner-poster">${UI.poster(e.title, '', 'md', e.image)}</div>
        <div class="tk-banner-info">
          <div class="tk-banner-tags">${t ? `<span class="tk-tag">${esc(t.name)}</span>` : ''}<span class="tk-tag">${esc(e.format)}</span>${status === 'Sold out' ? '<span class="tk-tag is-bad">Sold out</span>' : ''}</div>
          <h1>${esc(e.title)}</h1>
          ${line('cal', sessions.length ? `${UI.dateTime(sessions[0].start)}${sessions.length > 1 ? ` and ${plural(sessions.length - 1, 'more session')}` : ''}` : '')}
          ${line('pin', v ? `${v.name}${v.city ? ', ' + v.city : ''}` : '')}
          ${line('ticket', from === null ? '' : `From ${UI.money(from)} · up to ${e.maxPerBooking || 6} tickets in one booking`)}
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
    const paint = () => {
      if (!bookable) {
        panel.innerHTML = `<h2>Book tickets</h2><p>${status === 'Sold out' || (status === 'On sale' && !kinds.length) ? UI.badge('Sold out', 'bad') + ' Every place has gone.' : `This event is not on sale right now (${esc(status)}).`}</p><a class="btn" href="#/browse">Find other events</a>`;
        return;
      }
      const max = maxQty(e, o, cart);
      cart.qty = Math.min(Math.max(1, cart.qty), max);
      const chk = codeCheck(e, cart.codeText), quote = quoteFor(e, o, cart);
      const kindPart = kinds.length > 1 ? `<fieldset class="tk-fieldset"><legend>What do you want to book?</legend><div class="tk-choices">${kinds.map(([k, label, price]) => `<label class="tk-choice"><input type="radio" name="kind" value="${k}"${cart.kind === k ? ' checked' : ''}><span><b>${esc(label)}</b><small>${esc(price)}</small></span></label>`).join('')}</div></fieldset>` : '';
      const sessionPart = cart.kind === 'dropin'
        ? `<fieldset class="tk-fieldset"><legend>Pick a session</legend><div class="tk-sessions">${o.sessions.map((x) => `<label class="tk-session"><input type="radio" name="session" value="${esc(x.session.id)}"${cart.sessionId === x.session.id ? ' checked' : ''}><span><b>${esc(UI.date(x.session.start))}</b><small>${esc(UI.time(x.session.start))} · ${Core.isLowSpace(S(), e, x.session) ? `only ${plural(x.left, 'place')} left` : `${plural(x.left, 'place')} left`}</small></span></label>`).join('')}</div></fieldset>`
        : `<p class="hint">You get a place in every session: ${esc(o.block.sessions.map((x) => UI.date(x.start)).join(', '))}.</p>`;
      panel.innerHTML = `<h2>Book tickets</h2>${kindPart}${sessionPart}
        <div class="tk-qty"><span id="tk-qty-label">Tickets</span><div class="tk-stepper" role="group" aria-labelledby="tk-qty-label">
          <button type="button" class="btn btn-small" data-qty="-1" aria-label="One fewer ticket"${cart.qty <= 1 ? ' disabled' : ''}>−</button><output aria-live="polite">${cart.qty}</output>
          <button type="button" class="btn btn-small" data-qty="1" aria-label="One more ticket"${cart.qty >= max ? ' disabled' : ''}>+</button></div></div>
        <div class="tk-code"><label for="tk-code-in">Discount code</label><div><input id="tk-code-in" type="text" maxlength="40" autocomplete="off" value="${esc(cart.codeText)}" placeholder="Have a code?"><button type="button" class="btn" data-apply>Apply</button></div>
          <p class="hint" role="status">${cart.codeText && chk.note ? esc(chk.note) : cart.codeText && chk.code ? 'Code applied.' : ''}</p></div>
        <div class="tk-summary" aria-live="polite">${priceHtml(quote, quote.note)}</div>
        <button type="button" class="btn btn-primary tk-pay" data-go>Proceed to pay ${esc(UI.money(quote.total))}</button>`;
    };
    panel.addEventListener('change', (ev) => {
      if (ev.target.name === 'kind') cart.kind = ev.target.value;
      else if (ev.target.name === 'session') cart.sessionId = ev.target.value;
      else return;
      cart.form = null; UI.keepFocus(paint);
    });
    panel.addEventListener('click', (ev) => {
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
  const blankForm = (e, qty) => ({ phone: '', marketing: false, lead: { answers: {} }, guests: Array.from({ length: Math.max(0, qty - 1) }, () => ({ name: '', email: '', answers: {} })) });
  const setPath = (obj, path, value) => { const keys = path.split('.'); let o = obj; keys.slice(0, -1).forEach((k) => { o = o[k]; }); o[keys[keys.length - 1]] = value; };
  /* What the checkout screen lists: the tickets, then any money off. */
  const payLines = (quote) => [{ label: `${plural(quote.qty, 'ticket')} × ${UI.money(quote.unit)}`, amount: quote.subtotal }]
    .concat(quote.memberDiscount > 0 ? [{ label: 'Member price', amount: -quote.memberDiscount }] : [], quote.codeDiscount > 0 ? [{ label: 'Discount code', amount: -quote.codeDiscount }] : []);
  function leaveCheckout() { clearInterval(timerId); timerId = null; }

  function renderPay(main, id) {
    const e = Core.findEvent(S(), id);
    const back = () => App.go(`#/browse/${encodeURIComponent(id)}`);
    if (!e || !cart || cart.eventId !== id) { back(); return; }
    const o = options(e), now = App.now();
    if (Core.eventStatus(S(), e, now) !== 'On sale' || !idsFor(o, cart).length || (cart.kind === 'dropin' && !o.sessions.some((x) => x.session.id === cart.sessionId))) {
      UI.toast('That choice is no longer available. Please pick again.', 'bad'); back(); return;
    }
    cart.qty = Math.min(cart.qty, maxQty(e, o, cart));
    if (!cart.form || cart.form.guests.length !== cart.qty - 1) cart.form = blankForm(e, cart.qty);
    const f = cart.form, user = App.user(), v = venueOf(e);
    const chk = codeCheck(e, cart.codeText);
    /* The places are held for a few minutes, and so is a capped code, so nobody takes them while this is filled in. */
    if (!cart.heldUntil) {
      cart.heldUntil = Date.now() + (S().settings.holdMinutes || 10) * 60000;
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
    const sessionsText = cart.kind === 'block' ? `All ${plural(o.block.sessions.length, 'session')}: ${o.block.sessions.map((x) => UI.date(x.start)).join(', ')}` : UI.dateTime((o.sessions.find((x) => x.session.id === cart.sessionId) || { session: { start: '' } }).session.start);

    main.innerHTML = `<div class="tk-screen">
      ${UI.pageHead('Payment', '', `${e.title} · ${v ? v.name : ''}`, `#/browse/${encodeURIComponent(id)}`)}
      <ol class="tk-steps" aria-label="Booking steps"><li class="is-done">1 Choose</li><li class="is-on" aria-current="step">2 Pay</li><li>3 Your booking</li></ol>
      <p class="tk-hold" id="tk-hold" role="timer" aria-live="off"></p>
      <div class="tk-event-cols tk-pay-cols">
        <div class="tk-info">
          <section class="card"><h2>Your details</h2>
            <p class="muted">Booking as <b>${esc(user.name)}</b> (${esc(user.email || 'no email')}).</p>
            ${tf('Phone', 'phone', f.phone, 'tel', false, 'autocomplete="tel"')}
            ${(e.questions || []).map((q) => qField(q, `lead.answers.${q.id}`, f.lead.answers[q.id], q.required && !byLink)).join('')}
            <label class="check"><input type="checkbox" data-f="marketing"${f.marketing ? ' checked' : ''}><span>Send me news and offers about events</span></label>
          </section>
          ${cart.qty > 1 && e.guestDetails !== 'lead' ? `<section class="card"><h2>Guests</h2>${byLink ? '<p class="hint">We will email you a link after payment to add guest details.</p>' : ''}${f.guests.map((g, i) => `<fieldset class="tk-fieldset"><legend>Guest ${i + 1}</legend>
              ${tf('Name', `guests.${i}.name`, g.name, 'text', !byLink)}${e.guestDetails === 'nameEmail' ? tf('Email', `guests.${i}.email`, g.email, 'email', !byLink) : ''}
              ${guestQs.map((q) => qField(q, `guests.${i}.answers.${q.id}`, g.answers[q.id], q.required && !byLink)).join('')}</fieldset>`).join('')}</section>` : ''}
          ${quote.total > 0 ? '<section class="card"><h2>Payment</h2><p>You pay on a secure checkout screen next: card, Apple Pay or Google Pay.</p><p class="hint">Your card details are only used for this payment. We keep the card type and last 4 digits for your receipt, nothing more.</p></section>' : ''}
        </div>
        <div class="tk-side"><section class="card tk-panel" aria-label="Order summary"><h2>Order summary</h2>
          <p><b>${esc(e.title)}</b></p><p class="muted">${esc(sessionsText)}</p><p class="muted">${esc(plural(cart.qty, 'ticket'))}</p>
          ${priceHtml(quote, quote.note)}
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
      holdEl.textContent = `Your places are held for ${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
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
      if (!user.email) add('Your account has no email address. Ask an admin to add one.');
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
      if (Core.eventStatus(S(), e, when) !== 'On sale') return { error: 'This event is no longer on sale.' };
      const ids = idsFor(fresh, cart);
      if (!ids.length || (!fresh.ticket && cart.kind === 'dropin')) return { error: 'This can no longer be booked.' };
      const short = Core.capacityShortfall(S(), ids, cart.qty);
      if (short.length || (cart.kind === 'dropin' && cart.qty > Core.dropInLeft(S(), e, Core.findSession(S(), ids[0]).session))) return { error: 'There are not enough places left. Try fewer tickets or another session.' };
      const again = codeCheck(e, cart.codeText);
      if (cart.codeText && !again.code) return { error: `${again.note || 'The code can no longer be used.'} Remove the code and try again.` };
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
        amount: quote.total, currency: 'GBP', description: `${e.title}${v ? ' · ' + v.name : ''}`, email: user.email || '', lines: payLines(quote),
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
      const b = Core.createBooking(S(), {
        event: e, kind: cart.kind, sessionIds: ids, ticketTypeId: fresh.ticket ? fresh.ticket.id : undefined,
        customer: { name: user.name, email: user.email, phone: f.phone.trim(), isMember: false, marketingConsent: !!f.marketing, answers: Object.assign({}, f.lead.answers) },
        guests, code: again.code, codeHoldId: cart.holdId || undefined, payment: method, source: 'Online', channel: 'Website', by: 'Customer', now: when
      });
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
      if (window.MyBookings) window.MyBookings.justBooked(bookedId);
      App.go(`#/mybookings/${encodeURIComponent(bookedId)}`);
    }
  }

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
