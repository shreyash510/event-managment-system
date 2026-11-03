/* Today: the start page for the venue in view. Every count is worked out from the data each time it opens. */
(function () {
  'use strict';
  const LIST_LIMIT = 3;
  const WARNING_DAYS = 7;

  const endOf = (x) => new Date(x.start).getTime() + (x.durationMin || 0) * 60000;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const bookingHref = (id) => `#/bookings/${encodeURIComponent(id)}`;

  /* Today's sessions for the venue in view, soonest first. Drafts are not running, so they are left out. */
  function todaySessions(s, now) {
    const day = Core.dayKey(now);
    const rows = [];
    for (const e of App.visibleEvents()) {
      if (e.draft) continue;
      for (const x of e.sessions) {
        if (Core.dayKey(x.start) !== day) continue;
        rows.push({
          event: e, session: x, cancelled: !!(e.cancelled || x.cancelled),
          booked: Core.sessionTaken(s, x.id), checkedIn: Core.sessionCheckedIn(s, x.id)
        });
      }
    }
    return rows.sort((a, c) => a.session.start.localeCompare(c.session.start));
  }

  /* The status of one session, using the same words as event status. */
  function sessionStatus(s, row, now) {
    if (row.cancelled) return 'Cancelled';
    if (endOf(row.session) <= now.getTime()) return 'Completed';
    if (new Date(row.session.start) <= now) return 'Sales closed';
    if (Core.placesLeft(s, row.session) === 0) return 'Sold out';
    return Core.eventStatus(s, row.event, now);
  }

  function sessionName(e, x) {
    const list = Core.sortedSessions(e).filter((y) => !y.cancelled);
    const i = list.findIndex((y) => y.id === x.id);
    return list.length > 1 && i >= 0 ? `${e.title}, session ${i + 1} of ${list.length}` : e.title;
  }

  function openRequests() {
    const out = [];
    for (const b of App.visibleBookings()) {
      for (const r of b.requests || []) if (r.status === 'Open') out.push({ booking: b, request: r });
    }
    return out.sort((a, c) => String(a.request.at).localeCompare(String(c.request.at)));
  }

  /* Tickets for sessions not yet finished, where the person holding the ticket has details missing. */
  function missingDetails(s, now) {
    const day = Core.dayKey(now);
    const rows = [];
    for (const b of App.visibleBookings()) {
      const people = Core.bookingMissing(s, b);
      if (!people.length) continue;
      const missingIds = people.map((m) => m.person.id);
      const tickets = b.tickets.filter((t) => {
        if (t.status !== 'active' || !missingIds.includes(t.personId)) return false;
        const found = Core.findSession(s, t.sessionId);
        return found && !found.session.cancelled && endOf(found.session) > now.getTime();
      });
      if (!tickets.length) continue;
      const starts = tickets.map((t) => Core.findSession(s, t.sessionId).session.start).sort();
      rows.push({
        booking: b, count: tickets.length, first: starts[0],
        todayCount: starts.filter((x) => Core.dayKey(x) === day).length
      });
    }
    return rows.sort((a, c) => a.first.localeCompare(c.first));
  }

  /* A failed send stays here until a later send of the same message goes through. The log is newest first. */
  function failedSends(s) {
    const visible = new Map(App.visibleBookings().map((b) => [b.ref, b]));
    const log = s.klaviyoLog || [];
    const out = [];
    log.forEach((entry, i) => {
      if (entry.status !== 'Failed') return;
      if (log.slice(0, i).some((x) => x.status === 'Sent' && x.ref === entry.ref && x.type === entry.type)) return;
      const booking = visible.get(entry.ref);
      if (booking || !App.venueId()) out.push({ entry, booking: booking || null });
    });
    return out;
  }

  /* Sessions still to start in the next few days that are nearly full or full, while sales are running. */
  function spaceWarnings(s, now) {
    const limit = now.getTime() + WARNING_DAYS * 86400000;
    const threshold = s.settings.lowSpaceThreshold;
    const rows = [];
    for (const e of App.visibleEvents()) {
      if (e.draft || e.cancelled) continue;
      const status = Core.eventStatus(s, e, now);
      if (status !== 'On sale' && status !== 'Sold out') continue;
      for (const x of Core.remainingSessions(e, now)) {
        if (new Date(x.start).getTime() > limit) continue;
        const left = Core.placesLeft(s, x);
        if (left > threshold) continue;
        rows.push({
          event: e, session: x, left,
          waiting: (s.waitlist || []).filter((w) => w.sessionId === x.id && w.status === 'Waiting').length
        });
      }
    }
    return rows.sort((a, c) => a.session.start.localeCompare(c.session.start));
  }

  /* One item in the panel: a count, a label and links. Extra links stay inside a "show more" so nothing is lost. */
  function actionItem(title, count, itemsHtml, emptyText, allHref, allLabel) {
    const shown = itemsHtml.slice(0, LIST_LIMIT), rest = itemsHtml.slice(LIST_LIMIT);
    const list = (a) => `<ul class="td-links">${a.map((h) => `<li>${h}</li>`).join('')}</ul>`;
    return `<div class="td-action${count ? ' td-action-open' : ''}">
      <p class="td-action-head"><b class="td-count">${count}</b> <span>${UI.esc(title)}</span></p>
      ${count ? list(shown) : `<p class="hint">${UI.esc(emptyText)}</p>`}
      ${rest.length ? `<details class="td-more"><summary>Show ${rest.length} more</summary>${list(rest)}</details>` : ''}
      ${count && allHref ? `<p class="td-all"><a href="${allHref}">${UI.esc(allLabel)}</a></p>` : ''}
    </div>`;
  }

  function bookingLink(b, extra) {
    const label = `${b.ref}, ${b.customer.name}`;
    const link = App.can('bookings.view') ? `<a href="${bookingHref(b.id)}">${UI.esc(label)}</a>` : UI.esc(label);
    return `${link}${extra ? ` <span class="hint">${UI.esc(extra)}</span>` : ''}`;
  }

  function needsAction(s, now) {
    const requests = openRequests();
    const missing = missingDetails(s, now);
    const failed = failedSends(s);
    const missingTickets = missing.reduce((n, m) => n + m.count, 0);
    const missingToday = missing.reduce((n, m) => n + m.todayCount, 0);
    const requestLinks = requests.map((r) => {
      const e = Core.findEvent(s, r.booking.eventId);
      return bookingLink(r.booking, e ? e.title : '');
    });
    const missingLinks = missing.map((m) => bookingLink(m.booking, `${plural(m.count, 'ticket', 'tickets')}, next on ${UI.date(m.first)}`));
    const failedLinks = failed.map((f) => (f.booking
      ? bookingLink(f.booking, `${f.entry.type}: ${f.entry.error || 'failed'}`)
      : `${UI.esc(f.entry.ref)} <span class="hint">${UI.esc(`${f.entry.type}: ${f.entry.error || 'failed'}`)}</span>`));
    const total = requests.length + missingTickets + failed.length;
    const canBookings = App.can('bookings.view');
    return `<section class="card td-panel" aria-labelledby="td-actions-h">
      <h2 id="td-actions-h">Needs action</h2>
      ${total ? '' : '<p class="muted">Nothing needs action right now.</p>'}
      <div class="td-actions">
        ${actionItem('open cancellation requests', requests.length, requestLinks, 'None open.', canBookings ? '#/bookings/filter/requests' : '', 'See them in Bookings')}
        ${actionItem(missingToday ? `tickets missing guest details (${missingToday} for today)` : 'tickets missing guest details', missingTickets, missingLinks, 'All details are in for coming sessions.', canBookings ? '#/bookings/filter/missing' : '', 'See them in Bookings')}
        ${actionItem('failed Klaviyo sends', failed.length, failedLinks, 'No failed sends.', App.can('settings') ? '#/settings/klaviyo' : '', 'See the Klaviyo log')}
      </div>
      ${failed.length ? UI.demo('Klaviyo is not connected in this demo, so these failed sends are made up.') : ''}
    </section>`;
  }

  function warningsPanel(s, now) {
    const rows = spaceWarnings(s, now);
    if (!rows.length) return '';
    const items = rows.map((r) => {
      const sold = r.left === 0;
      const when = Core.dayKey(r.session.start) === Core.dayKey(now) ? `Today, ${UI.time(r.session.start)}` : UI.dateTime(r.session.start);
      const detail = sold
        ? `Full at ${r.session.capacity}${r.waiting ? `, ${r.waiting} on the waitlist` : ''}`
        : `${plural(r.left, 'place', 'places')} left of ${r.session.capacity}`;
      return `<li>${UI.badge(sold ? 'Sold out' : 'Low space', sold ? 'bad' : 'warn')}
        <a href="#/events/${encodeURIComponent(r.event.id)}">${UI.esc(sessionName(r.event, r.session))}</a>
        <span class="hint">${UI.esc(when)}. ${UI.esc(detail)}.</span></li>`;
    }).join('');
    return `<section class="card td-panel" aria-labelledby="td-warn-h">
      <h2 id="td-warn-h">Low space and sold out</h2>
      <p class="hint">Sessions on sale in the next ${WARNING_DAYS} days with ${s.settings.lowSpaceThreshold} places or fewer left.</p>
      <ul class="td-warnings">${items}</ul>
    </section>`;
  }

  function sessionsTable(s, rows, now) {
    const allVenues = !App.venueId();
    return UI.table([
      { label: 'Time', html: (r) => UI.esc(UI.time(r.session.start)) },
      {
        label: 'Session', html: (r) => {
          const v = allVenues ? Core.findVenue(s, r.event.venueId) : null;
          return `<span class="td-session">${UI.esc(sessionName(r.event, r.session))}${v ? `<span class="hint"> ${UI.esc(v.name)}</span>` : ''}</span>`;
        }
      },
      { label: 'Booked', html: (r) => (r.cancelled ? '<span class="muted">None</span>' : `${r.booked} of ${r.session.capacity}`) },
      { label: 'Checked in', html: (r) => (r.cancelled ? '<span class="muted">None</span>' : String(r.checkedIn)) },
      { label: 'Status', html: (r) => UI.badge(sessionStatus(s, r, now)) },
      {
        label: 'Check-in', html: (r) => (r.cancelled || !App.can('checkin')
          ? '<span class="muted">Not open</span>'
          : `<a class="btn btn-small" href="#/checkin/${encodeURIComponent(r.session.id)}" aria-label="${UI.esc(`Open check-in for ${r.event.title} at ${UI.time(r.session.start)}`)}">Open check-in</a>`)
      }
    ], rows, { emptyText: 'No sessions today at this venue.' });
  }

  App.route('today', {
    title: 'Today',
    perm: 'today',
    render(main) {
      if (!App.can('today')) { main.innerHTML = UI.empty('Your role does not have access to this area.'); return; }
      const s = App.state, now = App.now();
      const venue = App.venueId() ? Core.findVenue(s, App.venueId()) : null;
      const rows = todaySessions(s, now);
      const running = rows.filter((r) => !r.cancelled);
      const booked = running.reduce((n, r) => n + r.booked, 0);
      const capacity = running.reduce((n, r) => n + r.session.capacity, 0);
      const checkedIn = running.reduce((n, r) => n + r.checkedIn, 0);
      main.innerHTML = `<div class="td-view">
        ${UI.pageHead('Today', '', `Today\'s sessions and anything that needs action. ${UI.date(now)} · ${venue ? venue.name : 'All venues'}`)}
        <div class="grid">
          <div class="stat"><b>${running.length}</b><span>Sessions today</span></div>
          <div class="stat"><b>${booked} of ${capacity}</b><span>Booked</span></div>
          <div class="stat"><b>${checkedIn}</b><span>Checked in</span></div>
        </div>
        ${needsAction(s, now)}
        ${warningsPanel(s, now)}
        <h2>Today's sessions</h2>
        ${sessionsTable(s, rows, now)}
      </div>`;
    }
  });
})();
