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

  const pct = (a, b) => (b ? `${(a / b * 100).toFixed(1)}%` : 'n/a');
  const pennies = (n) => Math.round((Number(n) || 0) * 100);
  const niceDay = (key) => UI.date(`${key}T12:00`);

  /* ---------- What this user may see ---------- */
  const allowedVenues = () => App.state.venues.filter((v) => Core.canSeeVenue(App.user(), v.id) && App.inVenue(v.id));

  function eventChoices() {
    const venueIds = chosenVenueIds();
    return App.visibleEvents()
      .filter((e) => !e.draft && venueIds.includes(e.venueId) && (!filters.typeId || e.typeId === filters.typeId))
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
    return { range, report, sessionReport, guests: guestData(s, bookings, ticketInScope), attendance: attendance(s, scope, range, now) };
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
    const rows = [];
    let upcoming = 0, upcomingBooked = 0;
    for (const e of App.visibleEvents()) {
      if (e.draft || !scope.venueIds.includes(e.venueId)) continue;
      if (scope.eventId && e.id !== scope.eventId) continue;
      if (scope.typeId && e.typeId !== scope.typeId) continue;
      for (const x of e.sessions) {
        if (x.cancelled || !dayInRange(Core.dayKey(x.start), range)) continue;
        const booked = Core.sessionTaken(s, x.id);
        if (new Date(x.start) > now) { upcoming++; upcomingBooked += booked; continue; }
        const checkedIn = Core.sessionCheckedIn(s, x.id);
        const finished = new Date(x.start).getTime() + (x.durationMin || 0) * 60000 <= now.getTime();
        rows.push({ event: e, session: x, booked, checkedIn, finished, noShows: finished ? booked - checkedIn : null });
      }
    }
    rows.sort((a, c) => c.session.start.localeCompare(a.session.start));
    const sum = (f) => rows.reduce((n, r) => n + f(r), 0);
    return {
      rows, upcoming, upcomingBooked,
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
  const statBox = (value, label) => `<div class="stat"><b>${UI.esc(value)}</b><span>${UI.esc(label)}</span></div>`;

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
    const summary = `
      <div class="rp-basis" aria-live="polite"><p><b>${UI.esc(basis.title)}</b></p>${basis.lines.map((x) => `<p>${UI.esc(x)}</p>`).join('')}<p>${UI.esc(VAT_NOTE)}</p></div>
      <div class="grid">
        ${statBox(t.bookings, 'Bookings')}
        ${statBox(t.tickets, 'Tickets')}
        ${statBox(UI.money(t.gross), 'Gross')}
        ${statBox(UI.money(t.discounts), 'Discounts')}
        ${statBox(UI.money(t.refunds), 'Refunds')}
        ${statBox(UI.money(t.net), 'Net')}
      </div>
      <p class="rp-sum">${UI.esc(UI.money(t.gross))} gross − ${UI.esc(UI.money(t.discounts))} discounts − ${UI.esc(UI.money(t.refunds))} refunds = <b>${UI.esc(UI.money(t.net))} net</b></p>
      <p class="hint">A ticket is one person's place in one session, so one person on a 4-session block is 4 tickets. The ticket count leaves out cancelled places. Gross and discounts keep them, so the money still adds up. Add-ons are not in these figures: they brought in ${UI.esc(UI.money(r.addOnNet))} net in this view.</p>
      ${problems.length
        ? `<div class="rp-check rp-check-bad" role="alert"><b>Totals check: these do not add up.</b><ul>${problems.map((x) => `<li>${UI.esc(x)}</li>`).join('')}</ul></div>`
        : '<p class="rp-check rp-check-good"><b>Totals check passed.</b> The figures below add up to the totals above.</p>'}

      ${section('spaces', 'Spaces filled against capacity', 'Always by event date, because a session happens on a date. Cancelled sessions and drafts are left out.', `
        <div class="grid">
          ${statBox(`${sr.taken} of ${sr.capacity}`, 'Spaces filled')}
          ${statBox(sr.fillRate === null ? 'n/a' : pct(sr.taken, sr.capacity), 'Fill rate')}
        </div>`)}`;
    const panels = {
      summary,
      event: section('event', 'By event', 'A booking with places at more than one event, after a transfer, counts under each one.', moneyTable('Event', r.byEvent, t, 'No bookings for these filters.')),
      type: section('type', 'By event type', 'Money and tickets for each kind of event.', moneyTable('Event type', r.byType, t, 'No bookings for these filters.')),
      venue: section('venue', 'By venue', 'Money and tickets for each venue.', moneyTable('Venue', r.byVenue, t, 'No bookings for these filters.')),
      member: section('member', 'Member against guest', 'Based on whether the lead booker was a member on the day they booked. People they brought count under the same row.', moneyTable('Who booked', r.byMember, t, 'No bookings for these filters.')),
      code: section('code', 'By discount code', 'Code discount is part of the Discounts total, which also holds member pricing and free places.', discountTable('Code', r.byCode, t)),
      partner: section('partner', 'By partner', 'Discounts given through the codes of each partner.', discountTable('Partner', r.byPartner, t)),
      attendance: section('attendance', 'Attendance', `Always by event date. Sessions that have started: ${a.rows.length}. Sessions still to come in this period: ${a.upcoming}, with ${a.upcomingBooked} booked.`, `
        <div class="grid">
          ${statBox(`${a.checkedIn} of ${a.booked}`, 'Checked in against booked')}
          ${statBox(pct(a.checkedIn, a.booked), 'Attendance rate')}
          ${statBox(a.noShows, a.running ? `No-shows (${a.running} session still running)` : 'No-shows')}
        </div>
        ${UI.table({ subtitle: 'Booked places and check-ins for each session that has started.' }, [
          { label: 'Session', html: (x) => `${UI.esc(x.event.title)}<span class="hint rp-block">${UI.esc(UI.dateTime(x.session.start))}</span>` },
          { label: 'Booked', html: (x) => String(x.booked) },
          { label: 'Checked in', html: (x) => String(x.checkedIn) },
          { label: 'No-shows', html: (x) => (x.finished ? String(x.noShows) : '<span class="muted">Still running</span>') }
        ], a.rows, { emptyText: 'No sessions have started in this period.' })}`),
      guests: section('guests', 'Guest details', `A person is complete when nothing the event asks for is missing. Guests on events that only ask for the lead booker are not counted here: ${g.notAsked}.`,
        g.total.people ? UI.table({ subtitle: 'How many people on tickets have all their details.' }, [
          { label: 'People', html: (x) => (x.isTotal ? `<b>${UI.esc(x.label)}</b>` : UI.esc(x.label)) },
          { label: 'On tickets', html: (x) => String(x.people) },
          { label: 'Complete', html: (x) => String(x.complete) },
          { label: 'Missing details', html: (x) => String(x.missing) },
          { label: 'Complete %', html: (x) => pct(x.complete, x.people) }
        ], g.rows.concat([Object.assign({}, g.total, { isTotal: true })])) : UI.empty('No one on a ticket for these filters.')),
      source: section('source', 'Booking source', 'Where each booking came from, using tracked links.', moneyTable('Source', r.byChannel, t, 'No bookings for these filters.'))
    };
    const tabs = [['summary', 'Summary'], ['event', 'By event'], ['type', 'By event type']]
      .concat(venueCount > 1 ? [['venue', 'By venue']] : [], [['member', 'Member or guest'], ['code', 'By code'], ['partner', 'By partner'], ['attendance', 'Attendance'], ['guests', 'Guest details'], ['source', 'Source']]);
    if (!tabs.some((x) => x[0] === tab)) tab = 'summary';
    el.innerHTML = UI.tabs(tabs.map((x) => ({ key: x[0], label: x[1], on: x[0] === tab })), { attr: 'data-rp-tab', label: 'Report views' }) +
      `<div class="rp-panel">${panels[tab]}</div>`;
  }

  /* ---------- CSV ---------- */
  function exportCSV(now) {
    if (!App.can('reports')) { UI.toast('Your role cannot export reports.', 'bad'); return; }
    if (filters.period === 'custom' && filters.from && filters.to && filters.from > filters.to) { UI.toast('Fix the dates first.', 'bad'); return; }
    checkFilters();
    const s = App.state, d = compute(now), r = d.report, t = r.total, a = d.attendance, g = d.guests;
    const basis = basisText(d.range);
    const venue = filters.venueId ? Core.findVenue(s, filters.venueId) : null;
    const event = filters.eventId ? Core.findEvent(s, filters.eventId) : null;
    const type = filters.typeId ? Core.findType(s, filters.typeId) : null;
    const venueText = venue ? venue.name : allowedVenues().map((v) => v.name).join(' and ');
    const dateViewText = filters.dateView === 'booking' ? 'By booking date' : 'By event date';
    const n = (x) => Core.round2(x);
    const moneyHead = ['Bookings', 'Tickets', 'Gross', 'Discounts', 'Refunds', 'Net'];
    const moneyRow = (x) => [x.label, x.bookings, x.tickets, n(x.gross), n(x.discounts), n(x.refunds), n(x.net)];
    const block = (title, list) => [[title], ['Name'].concat(moneyHead)].concat(list.map(moneyRow), [moneyRow(Object.assign({}, t, { label: 'Total' }))], [[]]);
    const codeBlock = (title, list) => {
      const rows = list.length ? list.concat([noCodeRow(t, list)]) : [];
      return [[title], ['Name', 'Uses (bookings)', 'Tickets', 'Code discount', 'Net']]
        .concat(rows.map((x) => [x.label, x.bookings, x.tickets, n(x.codeDiscount), n(x.net)]), [['Total', t.bookings, t.tickets, n(t.codeDiscount), n(t.net)]], [[]]);
    };
    const rows = [
      ['Events report'], ['Date view', dateViewText], ['Period', rangeLabel(d.range)], ['Venue', venueText],
      ['Event', event ? event.title : 'All events'], ['Event type', type ? type.name : 'All event types'], ['Made on', UI.dateTime(now)],
      ['Note', basis.lines.join(' ')], ['Note', VAT_NOTE],
      ['Note', 'Spaces filled and attendance always use the event date. Add-ons are not in the ticket figures.'], [],
      ['Totals'], moneyHead, [t.bookings, t.tickets, n(t.gross), n(t.discounts), n(t.refunds), n(t.net)], ['Add-ons net', n(r.addOnNet)], [],
      ['Spaces filled against capacity (event date)'], ['Spaces filled', 'Capacity', 'Fill rate'],
      [d.sessionReport.taken, d.sessionReport.capacity, pct(d.sessionReport.taken, d.sessionReport.capacity)], []
    ].concat(
      block('By event', r.byEvent), block('By venue', r.byVenue), block('By event type', r.byType),
      block('Member against guest', r.byMember), codeBlock('By discount code', r.byCode), codeBlock('By partner', r.byPartner),
      [['Attendance (event date)'], ['Session', 'Date', 'Booked', 'Checked in', 'No-shows']],
      a.rows.map((x) => [x.event.title, UI.dateTime(x.session.start), x.booked, x.checkedIn, x.finished ? x.noShows : 'Still running']),
      [['Total', '', a.booked, a.checkedIn, a.noShows], []],
      [['Guest details'], ['People', 'On tickets', 'Complete', 'Missing details', 'Complete %']],
      g.rows.concat([g.total]).map((x) => [x.label, x.people, x.complete, x.missing, pct(x.complete, x.people)]),
      [['Guests on events that only ask for the lead booker (not counted above)', g.notAsked], []],
      block('Booking source', r.byChannel)
    );
    UI.downloadCSV(`report-${filters.dateView}-date-${Core.dayKey(now)}.csv`, rows);
    App.log('Export', `Report downloaded: ${dateViewText.toLowerCase()}, ${rangeLabel(d.range)}, ${venueText}, ${event ? event.title : 'all events'}, ${type ? type.name : 'all event types'}.`);
    App.save();
    UI.toast('Report downloaded.');
  }

  /* ---------- Filters ---------- */
  function eventOptions() {
    const many = allowedVenues().length > 1 && !filters.venueId;
    return UI.options([{ value: '', label: 'All events' }].concat(eventChoices().map((e) => {
      const v = many ? Core.findVenue(App.state, e.venueId) : null;
      return { value: e.id, label: v ? `${e.title} (${v.name})` : e.title };
    })), filters.eventId);
  }

  function filtersHtml() {
    const venues = allowedVenues();
    const venueOpts = (venues.length > 1 ? [{ value: '', label: 'All my venues' }] : []).concat(venues.map((v) => ({ value: v.id, label: v.name })));
    const typeOpts = [{ value: '', label: 'All event types' }].concat(App.state.eventTypes.map((x) => ({ value: x.id, label: x.name })));
    const custom = filters.period === 'custom';
    return `<form class="filters rp-filters" id="rp-filters" aria-label="Report filters">
      <label><span>Date view</span><select id="rp-dateView">${UI.options(DATE_VIEWS, filters.dateView)}</select></label>
      <label><span>Period</span><select id="rp-period">${UI.options(PERIODS, filters.period)}</select></label>
      <label class="rp-custom"${custom ? '' : ' hidden'}><span>From</span><input type="date" id="rp-from" value="${UI.esc(filters.from)}"></label>
      <label class="rp-custom"${custom ? '' : ' hidden'}><span>To</span><input type="date" id="rp-to" value="${UI.esc(filters.to)}"></label>
      <label><span>Venue</span><select id="rp-venueId">${UI.options(venueOpts, filters.venueId)}</select></label>
      <label><span>Event type</span><select id="rp-typeId">${UI.options(typeOpts, filters.typeId)}</select></label>
      <label><span>Event</span><select id="rp-eventId">${eventOptions()}</select></label>
    </form>`;
  }

  App.route('reports', {
    title: 'Reports',
    perm: 'reports',
    render(main) {
      if (!App.can('reports')) { main.innerHTML = UI.empty('Your role does not have access to this area.'); return; }
      checkFilters();
      main.innerHTML = `<div class="rp-view">
        ${UI.pageHead('Reports', '<button type="button" class="btn btn-primary" id="rp-export">Export CSV</button>', 'Bookings, money, attendance and guest details for the venues you can see.')}
        ${filtersHtml()}
        <div id="rp-results"></div>
      </div>`;
      const results = main.querySelector('#rp-results');
      const form = main.querySelector('#rp-filters');
      const show = () => renderResults(results, App.now());
      /* Only the results redraw, so keyboard focus stays on the filter that was changed. */
      form.addEventListener('change', (ev) => {
        const key = ev.target.id.replace('rp-', '');
        if (key in filters) filters[key] = ev.target.value;
        checkFilters();
        form.querySelector('#rp-eventId').innerHTML = eventOptions();
        form.querySelectorAll('.rp-custom').forEach((x) => { x.hidden = filters.period !== 'custom'; });
        show();
      });
      form.addEventListener('submit', (ev) => ev.preventDefault());
      main.querySelector('#rp-export').addEventListener('click', () => exportCSV(App.now()));
      results.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-rp-tab]');
        if (!b) return;
        tab = b.dataset.rpTab;
        show();
        const again = results.querySelector(`[data-rp-tab="${tab}"]`);
        if (again) again.focus({ preventScroll: true });
      });
      show();
    }
  });
})();
