/* Reports: money and booking figures come from Core.report. Only what it lacks is worked out here:
   the booking-date view, attendance per session, and guest details completeness. */
(function () {
  'use strict';

  const filters = { dateView: 'booking', period: 'last30', from: '', to: '', venueId: '', eventId: '', typeId: '' };
  const PERIODS = [
    { value: 'thisMonth', label: 'This month' },
    { value: 'lastMonth', label: 'Last month' },
    { value: 'last30', label: 'Last 30 days' },
    { value: 'next30', label: 'Next 30 days' },
    { value: 'thisYear', label: 'This year' },
    { value: 'all', label: 'All dates' },
    { value: 'custom', label: 'Choose dates' }
  ];
  const DATE_VIEWS = [
    { value: 'booking', label: 'By booking date' },
    { value: 'event', label: 'By event date' }
  ];
  const VAT_NOTE = 'Prices are as charged. Whether reports should show them with or without VAT is still for finance to confirm.';

  const svg = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
  const ICON = {
    grid: svg('<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>'),
    cal: svg('<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/>'),
    tag: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1"/>'),
    pin: svg('<path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>'),
    user: svg('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>'),
    ticket: svg('<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M14 6v2.5M14 11v2M14 15.5V18"/>'),
    link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    check: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>'),
    list: svg('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
    up: svg('<path d="M4 16l6-6 4 4 6-7M15 7h5v5"/>'),
    down: svg('<path d="M4 8l6 6 4-4 6 7M15 17h5v-5"/>'),
    wallet: svg('<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4zM4 7l12-3v3M16 13h2"/>'),
    print: svg('<path d="M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z"/>')
  };
  const pct = (a, b) => (b ? `${(a / b * 100).toFixed(1)}%` : 'n/a');
  const pennies = (n) => Math.round((Number(n) || 0) * 100);
  const niceDay = (key) => UI.date(`${key}T12:00`);

  /* ---------- What this user may see ---------- */
  const allowedVenues = () => App.state.venues.filter((v) => Core.canSeeVenue(App.user(), v.id) && App.inVenue(v.id));
  /* A draft, or a new event still waiting for approval, is not running yet. */
  const isLive = (e) => !e.draft && !(e.approval && e.approval.status === 'pending');

  function eventChoices() {
    const venueIds = chosenVenueIds();
    return App.visibleEvents()
      .filter((e) => isLive(e) && venueIds.includes(e.venueId) && (!filters.typeId || e.typeId === filters.typeId))
      .sort((a, c) => a.title.localeCompare(c.title));
  }
  function chosenVenueIds() {
    const ids = allowedVenues().map((v) => v.id);
    return filters.venueId && ids.includes(filters.venueId) ? [filters.venueId] : ids;
  }
  /* The signed-in user or the venue in view may have changed, so choices are checked again every time. */
  function checkFilters() {
    if (!allowedVenues().some((v) => v.id === filters.venueId)) filters.venueId = '';
    if (!App.state.eventTypes.some((t) => t.id === filters.typeId)) filters.typeId = '';
    if (!eventChoices().some((e) => e.id === filters.eventId)) filters.eventId = '';
  }

  /* ---------- Period ---------- */
  function periodRange(now) {
    const y = now.getFullYear(), m = now.getMonth();
    const today = Core.dayKey(now);
    switch (filters.period) {
      case 'thisMonth': return { from: Core.dayKey(new Date(y, m, 1)), to: Core.dayKey(new Date(y, m + 1, 0)) };
      case 'lastMonth': return { from: Core.dayKey(new Date(y, m - 1, 1)), to: Core.dayKey(new Date(y, m, 0)) };
      case 'last30': return { from: Core.dayKey(Core.addDays(`${today}T12:00`, -29)), to: today };
      case 'next30': return { from: today, to: Core.dayKey(Core.addDays(`${today}T12:00`, 29)) };
      case 'thisYear': return { from: `${y}-01-01`, to: `${y}-12-31` };
      case 'custom': return { from: filters.from, to: filters.to };
      default: return { from: '', to: '' };
    }
  }
  function rangeLabel(r) {
    if (r.from && r.to) return `${niceDay(r.from)} to ${niceDay(r.to)}`;
    if (r.from) return `From ${niceDay(r.from)}`;
    if (r.to) return `Up to ${niceDay(r.to)}`;
    return 'All dates';
  }
  const dayInRange = (key, r) => (!r.from || key >= r.from) && (!r.to || key <= r.to);

  /* ---------- Figures ---------- */
  function compute(now) {
    const s = App.state;
    const range = periodRange(now);
    const scope = { venueIds: chosenVenueIds() };
    if (filters.eventId) scope.eventId = filters.eventId;
    if (filters.typeId) scope.typeId = filters.typeId;
    const eventDated = Object.assign({}, scope, { from: range.from, to: range.to });
    /* Sessions happen on a date, so spaces and attendance always use the event date. */
    const sessionReport = Core.report(s, eventDated);
    const byBookingDate = filters.dateView === 'booking';
    const bookings = byBookingDate ? s.bookings.filter((b) => dayInRange(Core.dayKey(b.createdAt), range)) : s.bookings;
    const report = byBookingDate ? Core.report(Object.assign({}, s, { bookings }), scope) : sessionReport;

    const ticketInScope = (t) => {
      const found = Core.findSession(s, t.sessionId);
      if (!found) return false;
      const e = found.event;
      if (!scope.venueIds.includes(e.venueId)) return false;
      if (scope.eventId && e.id !== scope.eventId) return false;
      if (scope.typeId && e.typeId !== scope.typeId) return false;
      return byBookingDate || dayInRange(Core.dayKey(found.session.start), range);
    };
    return { range, report, sessionReport, guests: guestData(s, bookings, ticketInScope), attendance: attendance(s, scope, range, now), business: businessData(s, bookings, scope, range, ticketInScope), staff: staffData(s, scope, range), compare: clubComparison(s, range, now) };
  }

  /* Which events an activity log entry for an override is about. Entries start with a booking reference or an event title.
     Two venues can run events with the same title, so a title match is narrowed to the venues of the person who did it. */
  function overrideEvents(s, entry) {
    const text = String(entry.text || '');
    const ref = /^(BK-\d+):/.exec(text);
    if (ref) {
      const b = s.bookings.find((x) => x.ref === ref[1]);
      const e = b ? Core.findEvent(s, b.eventId) : null;
      return e ? [e] : [];
    }
    const hits = s.events.filter((e) => text.startsWith(`${e.title}:`));
    const user = s.users.find((u) => u.name === entry.by);
    const theirs = user ? hits.filter((e) => Core.canSeeVenue(user, e.venueId)) : hits;
    return theirs.length ? theirs : hits;
  }
  /* Free places and overrides by staff member, counted on the day they were given, whichever date view is on. */
  function staffData(s, scope, range) {
    const rows = new Map();
    const row = (name) => {
      if (!rows.has(name)) rows.set(name, { label: name, freePlaces: 0, freeValue: 0, overrides: 0 });
      return rows.get(name);
    };
    const eventOk = (e) => !!e && scope.venueIds.includes(e.venueId) && (!scope.eventId || e.id === scope.eventId) && (!scope.typeId || e.typeId === scope.typeId);
    s.bookings.forEach((b) => {
      const pay = (b.payments || []).find((p) => p.method === 'Free place');
      if (!pay || !dayInRange(Core.dayKey(pay.at), range) || !eventOk(Core.findEvent(s, b.eventId))) return;
      const x = row(pay.by || 'Unknown');
      x.freePlaces += b.people.length;
      x.freeValue = Core.round2(x.freeValue + (Number(b.pricing && b.pricing.compDiscount) || 0));
    });
    /* An entry that names no event has no venue, so only someone seeing every venue, with no filter on, can count it. */
    const seesAll = Core.allVenues(App.user()) && scope.venueIds.length === s.venues.length && !scope.eventId && !scope.typeId;
    (s.audit || []).forEach((a) => {
      if (a.type !== 'Override' || !dayInRange(Core.dayKey(a.at), range)) return;
      const events = overrideEvents(s, a);
      if (events.length ? events.some(eventOk) : seesAll) row(a.by || 'Unknown').overrides++;
    });
    const list = [...rows.values()].sort((a, c) => (c.freePlaces + c.overrides) - (a.freePlaces + a.overrides) || a.label.localeCompare(c.label));
    const total = list.reduce((t, x) => ({ label: 'Total', freePlaces: t.freePlaces + x.freePlaces, freeValue: Core.round2(t.freeValue + x.freeValue), overrides: t.overrides + x.overrides }), { label: 'Total', freePlaces: 0, freeValue: 0, overrides: 0 });
    return { rows: list, total };
  }

  /* ---------- Your club against the average of all clubs (club managers only) ---------- */
  /* With few clubs an average can be worked backwards: from the average and the figures you can see, a single other club's
     figure could be found. So an average needs at least this many clubs with figures outside the manager's own. */
  const MIN_OTHER_CLUBS = 2;
  const rateOf = (a, b) => (b ? a / b : null);
  const meanOf = (list) => (list.length ? list.reduce((n, x) => n + x, 0) / list.length : null);
  /* One club's figures, by event date. The event filter belongs to one venue, so only period and event type apply. */
  function clubFigures(s, venueId, range, now) {
    let sessions = 0, capacity = 0, taken = 0, finishedBooked = 0, noShows = 0;
    s.events.forEach((e) => {
      if (e.venueId !== venueId || !isLive(e) || e.cancelled || (filters.typeId && e.typeId !== filters.typeId)) return;
      e.sessions.forEach((x) => {
        if (x.cancelled || !dayInRange(Core.dayKey(x.start), range)) return;
        const booked = Core.sessionTaken(s, x.id);
        sessions++; capacity += Number(x.capacity) || 0; taken += booked;
        if (new Date(x.start).getTime() + (x.durationMin || 0) * 60000 <= now.getTime()) {
          finishedBooked += booked; noShows += booked - Core.sessionCheckedIn(s, x.id);
        }
      });
    });
    const money = Core.report(s, { venueIds: [venueId], typeId: filters.typeId || undefined, from: range.from, to: range.to }).total;
    return { fill: rateOf(taken, capacity), noShow: rateOf(noShows, finishedBooked), refund: rateOf(money.refunds, money.gross), netPerSession: rateOf(money.net, sessions) };
  }
  /* Returns only the manager's own figure and the average. No other club's figure leaves this function. */
  function clubComparison(s, range, now) {
    if (App.role() !== 'manager') return null;
    const asPct = (v) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
    const asMoney = (v) => (v === null ? 'n/a' : UI.money(Core.round2(v)));
    const measures = [['fill', 'Fill rate', asPct], ['noShow', 'No-show rate', asPct], ['refund', 'Refund rate', asPct], ['netPerSession', 'Net money per session', asMoney]];
    const mine = chosenVenueIds();
    const figures = s.venues.map((v) => ({ id: v.id, own: Core.canSeeVenue(App.user(), v.id), f: clubFigures(s, v.id, range, now) }));
    const rows = measures.map(([key, label, show]) => {
      const having = figures.filter((c) => c.f[key] !== null);
      const enough = having.filter((c) => !c.own).length >= MIN_OTHER_CLUBS;
      return {
        label,
        mine: show(meanOf(figures.filter((c) => mine.includes(c.id) && c.f[key] !== null).map((c) => c.f[key]))),
        average: enough ? show(meanOf(having.map((c) => c.f[key]))) : null
      };
    });
    const v = mine.length === 1 ? Core.findVenue(s, mine[0]) : null;
    return { rows, title: v ? v.name : 'Your clubs (average)', hidden: rows.some((r) => r.average === null) };
  }
  const COMPARE_NOTE = 'By event date, for the period and event type chosen. Each club counts the same in the average.';
  const COMPARE_HIDDEN = 'An average is left out when fewer than 2 clubs outside your own have figures for it, because it could then show another club\'s figure.';

  /* Figures the business asks about: how full each kind of event is, who comes back, and places won back from the waitlist. */
  function businessData(s, bookings, scope, range, ticketInScope) {
    const inScope = (e) => !!e && isLive(e) && scope.venueIds.includes(e.venueId) && (!scope.eventId || e.id === scope.eventId) && (!scope.typeId || e.typeId === scope.typeId);
    const types = new Map();
    s.events.forEach((e) => {
      if (!inScope(e) || e.cancelled) return;
      e.sessions.forEach((x) => {
        if (x.cancelled || !x.start || !dayInRange(Core.dayKey(x.start), range)) return;
        const t = Core.findType(s, e.typeId), key = t ? t.id : 'none';
        if (!types.has(key)) types.set(key, { label: t ? t.name : 'No type', capacity: 0, taken: 0 });
        const row = types.get(key);
        row.capacity += Number(x.capacity) || 0;
        row.taken += Core.sessionTaken(s, x.id);
      });
    });
    const rate = (x) => (x.capacity ? x.taken / x.capacity : 0);
    const fill = [...types.values()].sort((a, c) => rate(c) - rate(a));
    /* A repeat customer is a booker in this view who has booked more than once in total. */
    const who = (b) => String((b.customer && b.customer.email) || '').trim().toLowerCase();
    const everyCount = new Map();
    s.bookings.forEach((b) => { const k = who(b); if (k) everyCount.set(k, (everyCount.get(k) || 0) + 1); });
    const bookers = new Set(bookings.filter((b) => b.tickets.some(ticketInScope)).map(who).filter(Boolean));
    const repeat = [...bookers].filter((k) => (everyCount.get(k) || 0) > 1).length;
    const recovered = (s.waitlist || []).filter((w) => {
      if (w.status !== 'Booked') return false;
      const f = Core.findSession(s, w.sessionId);
      return !!f && inScope(f.event) && (!w.claimedAt || dayInRange(Core.dayKey(w.claimedAt), range));
    }).length;
    return { fill, bookers: bookers.size, repeat, recovered };
  }

  /* Each person on a place in scope counts once per booking. Guests on events that only ask for the lead booker are kept apart. */
  function guestData(s, bookings, ticketInScope) {
    const blank = (label) => ({ label, people: 0, complete: 0, missing: 0 });
    const lead = blank('Lead bookers'), asked = blank('Guests, details asked for');
    let notAsked = 0, activeTickets = 0;
    for (const b of bookings) {
      const event = Core.findEvent(s, b.eventId);
      if (!event) continue;
      for (const person of b.people) {
        const held = b.tickets.filter((t) => t.personId === person.id && t.status === 'active' && ticketInScope(t)).length;
        if (!held) continue;
        activeTickets += held;
        const asksGuest = event.guestDetails === 'name' || event.guestDetails === 'nameEmail';
        if (!person.isLead && !asksGuest) { notAsked++; continue; }
        const row = person.isLead ? lead : asked;
        row.people++;
        if (Core.personMissing(event, person).length) row.missing++; else row.complete++;
      }
    }
    const total = { label: 'All asked for', people: lead.people + asked.people, complete: lead.complete + asked.complete, missing: lead.missing + asked.missing };
    return { rows: [lead, asked], total, notAsked, activeTickets };
  }

  /* Checked in against booked per session. No-shows are only final once a session has finished. */
  function attendance(s, scope, range, now) {
    const rows = [], upcomingRows = [];
    let upcoming = 0, upcomingBooked = 0;
    for (const e of App.visibleEvents()) {
      if (!isLive(e) || !scope.venueIds.includes(e.venueId)) continue;
      if (scope.eventId && e.id !== scope.eventId) continue;
      if (scope.typeId && e.typeId !== scope.typeId) continue;
      for (const x of e.sessions) {
        if (x.cancelled || !dayInRange(Core.dayKey(x.start), range)) continue;
        const booked = Core.sessionTaken(s, x.id);
        if (new Date(x.start) > now) {
          upcoming++; upcomingBooked += booked;
          upcomingRows.push({ event: e, session: x, booked, checkedIn: 0, finished: false, notStarted: true, noShows: null });
          continue;
        }
        const checkedIn = Core.sessionCheckedIn(s, x.id);
        const finished = new Date(x.start).getTime() + (x.durationMin || 0) * 60000 <= now.getTime();
        rows.push({ event: e, session: x, booked, checkedIn, finished, noShows: finished ? booked - checkedIn : null });
      }
    }
    const newestFirst = (a, c) => c.session.start.localeCompare(a.session.start);
    rows.sort(newestFirst);
    const sum = (f) => rows.reduce((n, r) => n + f(r), 0);
    return {
      rows, upcoming, upcomingBooked, sessions: upcomingRows.concat(rows).sort(newestFirst),
      booked: sum((r) => r.booked), checkedIn: sum((r) => r.checkedIn), noShows: sum((r) => r.noShows || 0),
      running: rows.filter((r) => !r.finished).length
    };
  }

  /* What is left after the code rows, so the code and partner tables add up to the total. */
  function noCodeRow(total, byCode) {
    const left = (f) => byCode.reduce((n, r) => n - pennies(r[f]), pennies(total[f])) / 100;
    return {
      label: 'No code used', bookings: byCode.reduce((n, r) => n - r.bookings, total.bookings), tickets: byCode.reduce((n, r) => n - r.tickets, total.tickets),
      gross: left('gross'), discounts: left('discounts'), refunds: left('refunds'), net: left('net'), codeDiscount: left('codeDiscount')
    };
  }

  /* ---------- Do the totals add up? ---------- */
  function checkTotals(d) {
    const t = d.report.total, r = d.report, problems = [];
    if (pennies(t.gross) - pennies(t.discounts) - pennies(t.refunds) !== pennies(t.net)) problems.push('Gross less discounts and refunds does not equal net.');
    const same = (list, field) => {
      const sum = list.reduce((n, x) => n + (field === 'tickets' || field === 'bookings' ? x[field] : pennies(x[field])), 0);
      return sum === (field === 'tickets' || field === 'bookings' ? t[field] : pennies(t[field]));
    };
    const fields = ['tickets', 'gross', 'discounts', 'refunds', 'net'];
    [['event', r.byEvent], ['venue', r.byVenue], ['event type', r.byType], ['member', r.byMember], ['source', r.byChannel]].forEach(([name, list]) => {
      fields.filter((f) => !same(list, f)).forEach((f) => problems.push(`The ${name} table does not add up on ${f}.`));
    });
    [['member', r.byMember], ['source', r.byChannel]].forEach(([name, list]) => { if (!same(list, 'bookings')) problems.push(`The ${name} table does not add up on bookings.`); });
    const sumOf = (list, f) => list.reduce((n, x) => n + pennies(x[f]), 0);
    ['gross', 'net', 'codeDiscount'].forEach((f) => { if (sumOf(r.byCode, f) !== sumOf(r.byPartner, f)) problems.push(`The code and partner tables differ on ${f}.`); });
    if (d.guests.activeTickets !== t.tickets) problems.push('The guest details figures cover a different number of tickets from the total.');
    if (d.attendance.booked + d.attendance.upcomingBooked !== d.sessionReport.taken) problems.push('Attendance and spaces filled differ on booked places.');
    if (filters.dateView === 'event' && t.tickets !== d.sessionReport.taken) problems.push('Tickets and spaces filled differ.');
    return problems;
  }

  /* ---------- Screen ---------- */
  const statBox = (value, label, ic, i) => `<div class="stat">${ic ? UI.statIcon(ic, UI.statTone(i)) : ''}<b>${UI.esc(value)}</b><span>${UI.esc(label)}</span></div>`;

  function moneyTable(firstLabel, rows, total, emptyText) {
    if (!rows.length) return UI.empty(emptyText);
    const all = rows.concat([Object.assign({}, total, { label: 'Total', isTotal: true })]);
    const cell = (r, text) => (r.isTotal ? `<b>${UI.esc(text)}</b>` : UI.esc(text));
    return UI.table({ subtitle: 'Totals and refunds for each row, with a total at the bottom.' }, [
      { label: firstLabel, html: (r) => cell(r, r.label) },
      { label: 'Bookings', html: (r) => cell(r, r.bookings) },
      { label: 'Tickets', html: (r) => cell(r, r.tickets) },
      { label: 'Gross', html: (r) => cell(r, UI.money(r.gross)) },
      { label: 'Discounts', html: (r) => cell(r, UI.money(r.discounts)) },
      { label: 'Refunds', html: (r) => cell(r, UI.money(r.refunds)) },
      { label: 'Net', html: (r) => cell(r, UI.money(r.net)) }
    ], all);
  }

  function discountTable(firstLabel, rows, total) {
    if (!rows.length) return UI.empty('No code was used on these bookings.');
    const all = rows.concat([noCodeRow(total, rows), Object.assign({}, total, { label: 'Total', isTotal: true })]);
    const cell = (r, text) => (r.isTotal ? `<b>${UI.esc(text)}</b>` : UI.esc(text));
    return UI.table({ subtitle: 'Discounts given for each row, with a total at the bottom.' }, [
      { label: firstLabel, html: (r) => cell(r, r.label) },
      { label: 'Uses (bookings)', html: (r) => cell(r, r.bookings) },
      { label: 'Tickets', html: (r) => cell(r, r.tickets) },
      { label: 'Code discount', html: (r) => cell(r, UI.money(r.codeDiscount)) },
      { label: 'Net', html: (r) => cell(r, UI.money(r.net)) }
    ], all);
  }

  const section = (id, title, note, body) => `<section class="rp-section" aria-labelledby="rp-${id}">
    <h2 id="rp-${id}">${UI.esc(title)}</h2>${note ? `<p class="hint">${UI.esc(note)}</p>` : ''}${body}</section>`;

  function basisText(range) {
    const period = rangeLabel(range);
    return filters.dateView === 'booking'
      ? {
        title: `Date view: by booking date. ${period}.`,
        lines: [
          'This shows how much was sold in the period, using the day each booking was made. Refunds stay with the original booking, not the day of the refund.',
          'A block counts in full on the day it was booked. In the event-date view, a block is spread evenly across its sessions instead.'
        ]
      }
      : {
        title: `Date view: by event date. ${period}.`,
        lines: [
          'This shows how much was delivered in the period, using the date of each session.',
          'A block is spread evenly across its sessions, so a £48 block over 4 sessions counts as £12 per session. A block with sessions in the period counts as one booking, with only those sessions\' share of the money.'
        ]
      };
  }

  let tab = 'summary';   /* the report view on show; kept while the filters change */
  let groupBy = 'event';   /* how the Events view groups the money */
  function renderResults(el, now) {
    if (filters.period === 'custom' && filters.from && filters.to && filters.from > filters.to) {
      el.innerHTML = '<p class="form-error" role="alert">The start date is after the end date. Choose dates the right way round.</p>';
      return;
    }
    const d = compute(now);
    const r = d.report, t = r.total, sr = d.sessionReport, a = d.attendance, g = d.guests;
    const basis = basisText(d.range);
    const problems = checkTotals(d);
    const venueCount = chosenVenueIds().length;
    const fillPct = sr.capacity ? Math.min(100, Math.round((sr.taken / sr.capacity) * 100)) : 0;
    const ofGross = (n) => (t.gross ? ` (${(n / t.gross * 100).toFixed(1)}% of gross)` : "");
    const biz = d.business || { fill: [], bookers: 0, repeat: 0, recovered: 0 };
    const fillCard = `<section class="rp-card"><header><span class="rp-ic" aria-hidden="true">${ICON.grid}</span><div><h3>Fill rate by event type</h3><p class="muted">Places taken against places on offer, by event date.</p></div></header>${biz.fill.length ? biz.fill.map((x) => {
      const share = x.capacity ? Math.min(100, x.taken / x.capacity * 100) : 0;
      return `<div class="rp-row"><div class="rp-row-main"><b>${UI.esc(x.label)}</b><span class="muted">${UI.esc(x.taken)} of ${UI.esc(x.capacity)} places</span></div><div class="rp-row-val"><b>${UI.esc(pct(x.taken, x.capacity))}</b></div><div class="rp-share" aria-hidden="true"><i style="width:${share.toFixed(1)}%"></i></div></div>`;
    }).join('') : UI.empty('No sessions in this period.')}</section>`;
    const kpi = (i, label, value, note, ic) => `<div class="stat">${UI.statIcon(ic, UI.statTone(i))}<b>${UI.esc(value)}</b><span>${UI.esc(label)}</span><small>${UI.esc(note)}</small></div>`;
    const listCard = (ic, title, note, rows) => {
      const base = rows.reduce((n, x) => n + Math.max(0, pennies(x.net)), 0);
      const body = rows.length ? rows.map((x) => {
        const share = base ? Math.max(0, pennies(x.net)) / base * 100 : 0;
        return `<div class="rp-row"><div class="rp-row-main"><b>${UI.esc(x.label)}</b><span class="muted">${UI.esc(x.tickets)} ${x.tickets === 1 ? "ticket" : "tickets"} · ${UI.esc(x.bookings)} ${x.bookings === 1 ? "booking" : "bookings"}</span></div><div class="rp-row-val"><b>${UI.esc(UI.money(x.net))}</b><span class="muted">${share.toFixed(0)}% of net</span></div><div class="rp-share" aria-hidden="true"><i style="width:${share.toFixed(1)}%"></i></div></div>`;
      }).join("") : UI.empty("No bookings for these filters.");
      return `<section class="rp-card"><header><span class="rp-ic" aria-hidden="true">${ICON[ic]}</span><div><h3>${UI.esc(title)}</h3><p class="muted">${UI.esc(note)}</p></div></header>${body}</section>`;
    };
    const summary = `
      ${problems.length ? `<div class="rp-check rp-check-bad" role="alert"><b>Totals check: these do not add up.</b><ul>${problems.map((x) => `<li>${UI.esc(x)}</li>`).join("")}</ul></div>` : ""}
      <div class="grid stats" aria-live="polite">
        ${kpi(0, "Gross", UI.money(t.gross), "Before discounts and refunds", "wallet")}
        ${kpi(1, "Discounts", UI.money(t.discounts), t.gross ? `${(t.discounts / t.gross * 100).toFixed(1)}% of gross` : "None given", "ticket")}
        ${kpi(2, "Refunds", UI.money(t.refunds), t.gross ? `${(t.refunds / t.gross * 100).toFixed(1)}% of gross` : "None given", "clock")}
        ${kpi(3, "Net", UI.money(t.net), "Gross less discounts and refunds", "check")}
        ${kpi(4, "Bookings", String(t.bookings), `${t.tickets} ${t.tickets === 1 ? "ticket" : "tickets"} · add-ons ${UI.money(r.addOnNet)} net`, "seat")}
      </div>
      <h2 class="rp-subhead">Business health</h2>
      <div class="grid stats">
        ${kpi(0, "Repeat customers", pct(biz.repeat, biz.bookers), `${biz.repeat} of ${biz.bookers} bookers have booked more than once`, "users")}
        ${kpi(1, "No-show rate", pct(a.noShows, a.booked), `${a.noShows} of ${a.booked} places on sessions that have started`, "alert")}
        ${kpi(2, "Refund rate", pct(t.refunds, t.gross), `${UI.money(t.refunds)} refunded of ${UI.money(t.gross)} gross`, "clock")}
        ${kpi(3, "Places recovered", String(biz.recovered), "Taken up from the waitlist", "seat")}
      </div>
      ${d.compare ? `<h2 class="rp-subhead">Your club vs all clubs average</h2>
      ${UI.table({ subtitle: COMPARE_NOTE }, [
        { label: 'Measure', html: (x) => UI.esc(x.label) },
        { label: d.compare.title, html: (x) => UI.esc(x.mine) },
        { label: 'All clubs average', html: (x) => (x.average === null ? '<span class="muted">Not shown</span>' : UI.esc(x.average)) }
      ], d.compare.rows, { filter: false })}
      ${d.compare.hidden ? `<p class="hint">${UI.esc(COMPARE_HIDDEN)}</p>` : ''}` : ""}
      <div class="rp-cards">
        ${fillCard}
        ${listCard("cal", "By event type", "Net money for each kind of event.", r.byType)}
        ${listCard("user", "Member or guest", "Whether the booker was a member.", r.byMember)}
        ${listCard("link", "Booking source", "Where each booking came from.", r.byChannel)}
      </div>
      <section class="rp-card rp-fill" aria-labelledby="rp-spaces">
        <header><span class="rp-ic" aria-hidden="true">${ICON.grid}</span><div><h3 id="rp-spaces">Spaces filled</h3><p class="muted">Always by event date. Cancelled sessions and drafts are left out.</p></div><b class="rp-fill-n">${UI.esc(sr.taken)} of ${UI.esc(sr.capacity)} · ${UI.esc(sr.fillRate === null ? "n/a" : pct(sr.taken, sr.capacity))}</b></header>
        <div class="rp-meter" aria-hidden="true"><i style="width:${fillPct}%"></i></div>
      </section>
      <details class="rp-notes"><summary>How these figures are counted</summary>
        <p><b>${UI.esc(basis.title)}</b></p>${basis.lines.map((x) => `<p>${UI.esc(x)}</p>`).join("")}<p>${UI.esc(VAT_NOTE)}</p>
        <p>A ticket is one person's place in one session, so one person on a 4-session block is 4 tickets. The ticket count leaves out cancelled places. Gross and discounts keep them, so the money still adds up. Add-ons are not in these figures.</p>
      </details>`;
    const panels = {
      summary,
      events: (() => {
        const g = groupList().find((x) => x[0] === groupBy) || groupList()[0];
        return `<div class="rp-group">${UI.tabs(groupList().map((x) => ({ key: x[0], label: x[1], on: x[0] === g[0] })), { sub: true, attr: 'data-rp-group', label: 'Group the money by' })}</div>` +
          section('events', `Money by ${g[1].toLowerCase()}`, g[3], moneyTable(g[1], r[g[2]], t, 'No bookings for these filters.'));
      })(),
      promotions: section('code', 'By discount code', 'Code discount is part of the Discounts total, which also holds member pricing and free places.', discountTable('Code', r.byCode, t)) +
        section('partner', 'By partner', 'Discounts given through the codes of each partner.', discountTable('Partner', r.byPartner, t)),
      people: section('attendance', 'Attendance', `Always by event date. Sessions that have started: ${a.rows.length}. Sessions still to come in this period: ${a.upcoming}, with ${a.upcomingBooked} booked.`, `
        <div class="grid stats">
          ${statBox(`${a.checkedIn} of ${a.booked}`, 'Checked in against booked', 'check', 0)}
          ${statBox(pct(a.checkedIn, a.booked), 'Attendance rate', 'users', 1)}
          ${statBox(a.noShows, a.running ? `No-shows (${a.running} session still running)` : 'No-shows', 'alert', 2)}
        </div>
        ${UI.table({ subtitle: 'Fill rate, check-ins and no-shows for each session. The totals above count only sessions that have started.' }, [
          { label: 'Session', html: (x) => `${UI.esc(x.event.title)}<span class="hint rp-block">${UI.esc(UI.dateTime(x.session.start))}${chosenVenueIds().length > 1 ? ` · ${UI.esc((Core.findVenue(App.state, x.event.venueId) || {}).name || '')}` : ''}</span>` },
          { label: 'Booked', html: (x) => `${x.booked} of ${x.session.capacity}` },
          { label: 'Fill rate', html: (x) => pct(x.booked, x.session.capacity) },
          { label: 'Checked in', html: (x) => (x.notStarted ? '<span class="muted">Not started</span>' : String(x.checkedIn)) },
          { label: 'No-shows', html: (x) => (x.finished ? String(x.noShows) : `<span class="muted">${x.notStarted ? 'Not started' : 'Still running'}</span>`) }
        ], a.sessions, { emptyText: 'No sessions in this period.' })}`) +
        section('staff', 'Free places and overrides by staff member', 'Counted on the day they were given. An override is going over a limit or outside the policy, with a reason.',
        d.staff.rows.length ? UI.table({ subtitle: 'Who gave free places and who made overrides at the venues in this report.' }, [
          { label: 'Staff member', html: (x) => (x.isTotal ? `<b>${UI.esc(x.label)}</b>` : UI.esc(x.label)) },
          { label: 'Free places', html: (x) => String(x.freePlaces) },
          { label: 'Value given', html: (x) => UI.money(x.freeValue) },
          { label: 'Overrides', html: (x) => String(x.overrides) }
        ], d.staff.rows.concat([Object.assign({}, d.staff.total, { isTotal: true })]), { filter: false }) : UI.empty('No free places or overrides in this period.')) +
        section('guests', 'Guest details', `A person is complete when nothing the event asks for is missing. Guests on events that only ask for the lead booker are not counted here: ${g.notAsked}.`,
        g.total.people ? UI.table({ subtitle: 'How many people on tickets have all their details.' }, [
          { label: 'People', html: (x) => (x.isTotal ? `<b>${UI.esc(x.label)}</b>` : UI.esc(x.label)) },
          { label: 'On tickets', html: (x) => String(x.people) },
          { label: 'Complete', html: (x) => String(x.complete) },
          { label: 'Missing details', html: (x) => String(x.missing) },
          { label: 'Complete %', html: (x) => pct(x.complete, x.people) }
        ], g.rows.concat([Object.assign({}, g.total, { isTotal: true })])) : UI.empty('No one on a ticket for these filters.')),
      source: section('source', 'Booking source', 'Where each booking came from. Make a tracked link for each place you post with Share links on an event page.', moneyTable('Source', r.byChannel, t, 'No bookings for these filters.'))
    };
    if (!tabList().some((x) => x[0] === tab)) tab = "summary";
    el.innerHTML = `<div class="rp-panel">${panels[tab]}</div>`;
  }

  /* ---------- Filters ---------- */
  function eventOptions() {
    const many = allowedVenues().length > 1 && !filters.venueId;
    return UI.options([{ value: '', label: 'All events' }].concat(eventChoices().map((e) => {
      const v = many ? Core.findVenue(App.state, e.venueId) : null;
      return { value: e.id, label: v ? `${e.title} (${v.name})` : e.title };
    })), filters.eventId);
  }

  const DEFAULTS = { dateView: "booking", period: "last30", from: "", to: "", venueId: "", eventId: "", typeId: "" };
  const activeCount = () => ["dateView", "period", "venueId", "typeId", "eventId"].filter((k) => filters[k] !== DEFAULTS[k]).length;

  function filtersHtml() {
    const venues = allowedVenues();
    const venueOpts = (venues.length > 1 ? [{ value: "", label: "All my venues" }] : []).concat(venues.map((v) => ({ value: v.id, label: v.name })));
    const typeOpts = [{ value: "", label: "All event types" }].concat(App.state.eventTypes.map((x) => ({ value: x.id, label: x.name })));
    const custom = filters.period === "custom";
    return `<form class="filters rp-filters" id="rp-filters" aria-label="Report filters">
      <label><span>Date view</span><select id="rp-dateView">${UI.options(DATE_VIEWS, filters.dateView)}</select></label>
      <label><span>Period</span><select id="rp-period">${UI.options(PERIODS, filters.period)}</select></label>
      <label class="rp-custom"${custom ? "" : " hidden"}><span>From</span><input type="date" id="rp-from" value="${UI.esc(filters.from)}"></label>
      <label class="rp-custom"${custom ? "" : " hidden"}><span>To</span><input type="date" id="rp-to" value="${UI.esc(filters.to)}"></label>
      <label><span>Venue</span><select id="rp-venueId">${UI.options(venueOpts, filters.venueId)}</select></label>
      <label><span>Event type</span><select id="rp-typeId">${UI.options(typeOpts, filters.typeId)}</select></label>
      <label><span>Event</span><select id="rp-eventId">${eventOptions()}</select></label>
    </form>`;
  }

  /* Five views. Events holds what used to be four tabs, behind one "Group by" switch. */
  function tabList() {
    return [["summary", "Summary", "grid"], ["events", "Events", "cal"], ["promotions", "Discount codes", "ticket"], ["people", "People", "user"], ["source", "Source", "link"]];
  }
  /* [key, label, report field, note]. Venue only when more than one venue is in view. */
  function groupList() {
    return [["event", "Event", "byEvent", "A booking with places at more than one event, after a transfer, counts under each one."],
      ["type", "Event type", "byType", "Money and tickets for each kind of event."]]
      .concat(chosenVenueIds().length > 1 ? [["venue", "Venue", "byVenue", "Money and tickets for each venue."]] : [],
        [["member", "Member or guest", "byMember", "Whether the booker was a member on the day they booked. People they brought count under the same row."]]);
  }

  App.route("reports", {
    title: "Reports",
    perm: "reports",
    render(main) {
      if (!App.can("reports")) { main.innerHTML = UI.empty("Your role does not have access to this area."); return; }
      checkFilters();
      main.innerHTML = `<div class="rp-view">
        ${UI.pageHead("Reports", "", "Bookings, money, attendance and guest details for the venues you can see.")}
        <div class="rp-bar"><div id="rp-tabs"></div><div class="rp-bar-end"><span class="rp-range" id="rp-range"></span>${UI.filterButton("reports", 0, 'id="rp-filter"')}</div></div>
        <div id="rp-results"></div>
      </div>`;
      const results = main.querySelector("#rp-results");
      const paintBar = () => {
        main.querySelector("#rp-tabs").innerHTML = `<div class="pill-tabs rp-tabs" role="group" aria-label="Report views">${tabList().map((x) => `<button type="button" class="pill-tab" data-rp-tab="${x[0]}" aria-pressed="${x[0] === tab}">${ICON[x[2]]}<span>${UI.esc(x[1])}</span></button>`).join("")}</div>`;
        main.querySelector("#rp-range").textContent = rangeLabel(periodRange(App.now()));
        UI.setFilterCount(main, activeCount());
      };
      const show = () => { paintBar(); renderResults(results, App.now()); };
      main.querySelector("#rp-tabs").addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-rp-tab]");
        if (!b) return;
        tab = b.dataset.rpTab;
        show();
        const again = main.querySelector(`[data-rp-tab="${tab}"]`);
        if (again) again.focus({ preventScroll: true });
      });
      results.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-rp-group]");
        if (!b) return;
        groupBy = b.dataset.rpGroup;
        renderResults(results, App.now());
        const again = results.querySelector(`[data-rp-group="${groupBy}"]`);
        if (again) again.focus({ preventScroll: true });
      });
      main.querySelector("#rp-filter").addEventListener("click", () => {
        UI.dialog({
          title: "Filter the report", wide: true, body: filtersHtml(),
          actions: [{ label: "Reset", kind: "ghost", onClick: () => { Object.assign(filters, DEFAULTS); checkFilters(); show(); } }, { label: "Done", kind: "primary" }],
          onOpen: (d) => {
            const form = d.querySelector("#rp-filters");
            /* The report behind the dialog updates as each choice is made. */
            form.addEventListener("change", (ev) => {
              const key = ev.target.id.replace("rp-", "");
              if (key in filters) filters[key] = ev.target.value;
              checkFilters();
              form.querySelector("#rp-eventId").innerHTML = eventOptions();
              form.querySelectorAll(".rp-custom").forEach((x) => { x.hidden = filters.period !== "custom"; });
              show();
            });
            form.addEventListener("submit", (ev) => ev.preventDefault());
          }
        });
      });
      show();
    }
  });
})();
