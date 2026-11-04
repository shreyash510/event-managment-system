/* Today: the start page for the venue in view. Every count is worked out from the data each time it opens. */
(function () {
  'use strict';
  const LIST_LIMIT = 3;
  const WARNING_DAYS = 7;

  const endOf = (x) => new Date(x.start).getTime() + (x.durationMin || 0) * 60000;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const greeting = (d) => { const h = d.getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
  const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || 'there';
  /* A thin bar for "x of y". Decorative: the numbers beside it say the same thing, so it is hidden from screen readers. */
  const meter = (value, total, low) => {
    if (!total) return '';
    const pct = Math.min(100, Math.round((value / total) * 100));
    return `<div class="meter${low && pct >= 100 ? ' is-full' : low && pct >= 85 ? ' is-low' : ''}" style="--pct:${pct}%" aria-hidden="true"><i></i></div>`;
  };
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

  /* kind: 'cancel' for requests customers sent by email, 'refund' for refunds a club manager sent to the marketing admin for approval. */
  function openRequests(kind) {
    const out = [];
    const want = (r) => (kind === 'refund' ? r.kind === 'refund-approval' : r.kind !== 'refund-approval');
    for (const b of App.visibleBookings()) {
      for (const r of b.requests || []) if (r.status === 'Open' && want(r)) out.push({ booking: b, request: r });
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
  function actionItem(title, count, itemsHtml, emptyText, allHref, allLabel, note) {
    const shown = itemsHtml.slice(0, LIST_LIMIT), rest = itemsHtml.slice(LIST_LIMIT);
    const list = (a) => `<ul class="td-links">${a.map((h) => `<li>${h}</li>`).join('')}</ul>`;
    return `<div class="td-action${count ? ' td-action-open' : ' td-action-clear'}">
      <div class="td-action-head">
        <b class="td-count" aria-hidden="true">${count ? count : '&#10003;'}</b>
        <span class="td-action-title"><span class="sr-only">${count}: </span>${UI.esc(title)}${count && note ? `<span class="td-note">${UI.esc(note)}</span>` : ''}</span>
      </div>
      ${count ? list(shown) : `<p class="hint td-empty">${UI.esc(emptyText)}</p>`}
      ${rest.length ? `<details class="td-more"><summary>Show ${rest.length} more</summary>${list(rest)}</details>` : ''}
      ${count && allHref ? `<p class="td-all"><a href="${allHref}">${UI.esc(allLabel)} &rarr;</a></p>` : ''}
    </div>`;
  }

  function bookingLink(b, extra) {
    const label = `${b.ref}, ${b.customer.name}`;
    const link = App.can('bookings.view') ? `<a href="${bookingHref(b.id)}">${UI.esc(label)}</a>` : UI.esc(label);
    return `${link}${extra ? ` <span class="hint">${UI.esc(extra)}</span>` : ''}`;
  }

  /* The marketing admin approves refunds over a club manager's limit. A club manager sees the ones they are waiting on. */
  const canApprove = () => App.can('refund.approve');
  const waitsOnApproval = () => !canApprove() && (App.can('refund.full') || App.can('refund.partial'));
  const myPending = () => openRequests('refund').filter((r) => r.request.by === App.user().name);
  const seesSends = () => App.can('settings');
  function needsAction(s, now) {
    const requests = openRequests('cancel');
    const approvals = canApprove() ? openRequests('refund') : [];
    const missing = missingDetails(s, now);
    const failed = seesSends() ? failedSends(s) : [];
    const missingTickets = missing.reduce((n, m) => n + m.count, 0);
    const missingToday = missing.reduce((n, m) => n + m.todayCount, 0);
    const approvalLinks = approvals.map((r) => bookingLink(r.booking, `${r.request.amount ? UI.money(r.request.amount) : ''}${r.request.by ? ` · from ${r.request.by}` : ''}`));
    const pending = waitsOnApproval() ? myPending() : [];
    const pendingLinks = pending.map((r) => bookingLink(r.booking, r.request.amount ? UI.money(r.request.amount) : ''));
    const requestLinks = requests.map((r) => {
      const e = Core.findEvent(s, r.booking.eventId);
      return bookingLink(r.booking, e ? e.title : '');
    });
    const missingLinks = missing.map((m) => bookingLink(m.booking, `${plural(m.count, 'ticket', 'tickets')}, next on ${UI.date(m.first)}`));
    const failedLinks = failed.map((f) => (f.booking
      ? bookingLink(f.booking, `${f.entry.type}: ${f.entry.error || 'failed'}`)
      : `${UI.esc(f.entry.ref)} <span class="hint">${UI.esc(`${f.entry.type}: ${f.entry.error || 'failed'}`)}</span>`));
    const total = requests.length + approvals.length + missingTickets + failed.length;
    const canBookings = App.can('bookings.view');
    return `<section class="card td-panel" aria-labelledby="td-actions-h">
      <div class="td-panel-head">
        <h2 id="td-actions-h">Needs action</h2>
        ${total ? UI.badge(`${total} to do`, 'warn') : UI.badge('All clear', 'good')}
      </div>
      <div class="td-actions">
        ${canApprove() ? actionItem('Refunds waiting for approval', approvals.length, approvalLinks, 'Nothing waiting.', '', '') : ''}
        ${waitsOnApproval() && pending.length ? actionItem('Waiting for approval', pending.length, pendingLinks, 'Nothing waiting.', '', '') : ''}
        ${actionItem('Open cancellation requests', requests.length, requestLinks, 'None open.', canBookings ? '#/bookings/filter/requests' : '', 'See them in Bookings')}
        ${actionItem('Tickets missing guest details', missingTickets, missingLinks, 'All details are in for coming sessions.', canBookings ? '#/bookings/filter/missing' : '', 'See them in Bookings', missingToday ? `${missingToday} for today` : '')}
        ${seesSends() ? actionItem('Failed Klaviyo sends', failed.length, failedLinks, 'No failed sends.', '#/settings/messages/klaviyo', 'See the Klaviyo log') : ''}
      </div>
      ${failed.length ? UI.demo('Klaviyo is not connected in this demo, so these failed sends are made up.') : ''}
    </section>`;
  }

  /* Money in and out on a given day, across the bookings in view. Refunds are shown separately, not netted off. */
  function takings(day) {
    let paid = 0, refunded = 0;
    for (const b of App.visibleBookings()) {
      for (const p of b.payments || []) {
        if (Core.dayKey(p.at) !== day) continue;
        if (p.type === 'Refund') refunded += Number(p.amount) || 0; else paid += Number(p.amount) || 0;
      }
    }
    return { paid: Core.round2(paid), refunded: Core.round2(refunded) };
  }
  function revenueTile(now) {
    const day = Core.dayKey(now), last = Core.dayKey(new Date(now.getTime() - 7 * 86400000));
    const t = takings(day), prev = takings(last);
    const net = Core.round2(t.paid - t.refunded), prevNet = Core.round2(prev.paid - prev.refunded);
    const diff = net - prevNet;
    const vs = prevNet ? `${diff >= 0 ? 'Up' : 'Down'} ${UI.money(Math.abs(diff))} on last ${now.toLocaleDateString('en-GB', { weekday: 'long' })}` : 'No sales this day last week';
    return `<div class="stat">${UI.statIcon('wallet', 'violet')}<b>${UI.money(net)}</b><span>Revenue today</span><small>${t.refunded ? `${UI.money(t.refunded)} refunded · ` : ''}${UI.esc(vs)}</small></div>`;
  }

  /* The session in progress, or the next one to start. */
  function upNextCard(s, rows, now) {
    const t = now.getTime();
    const next = rows.find((r) => !r.cancelled && endOf(r.session) > t);
    if (!next) return '';
    const start = new Date(next.session.start).getTime(), live = start <= t;
    const mins = Math.max(0, Math.round((start - t) / 60000));
    const when = live ? `In progress, ends ${UI.time(new Date(endOf(next.session)))}`
      : mins < 60 ? `Starts in ${plural(mins, 'minute', 'minutes')}` : `Starts at ${UI.time(next.session.start)}, in ${Math.floor(mins / 60)}h ${mins % 60}m`;
    const v = !App.venueId() ? Core.findVenue(s, next.event.venueId) : null;
    const cta = App.can('checkin') ? `<a class="btn btn-primary" href="#/checkin/${encodeURIComponent(next.session.id)}">Open check-in</a>` : '';
    return `<section class="card td-next${live ? ' is-live' : ''}" aria-label="${live ? 'In progress' : 'Up next'}">
      <div class="td-next-main">
        <span class="td-next-tag">${live ? 'In progress' : 'Up next'}</span>
        <h2>${UI.esc(sessionName(next.event, next.session))}</h2>
        <p class="hint">${UI.esc(when)}${v ? ` · ${UI.esc(v.name)}` : ''}</p>
      </div>
      <div class="td-next-nums"><b>${next.booked} <i>of ${next.session.capacity}</i></b><span>booked</span>${meter(next.booked, next.session.capacity, true)}<span class="hint">${next.checkedIn} checked in</span></div>
      ${cta}
    </section>`;
  }

  /* A short list with < > under it. Items are <li> strings; the pager only shows when there is more than one page. */
  const CARD_PAGE = 4;
  function pagedList(cls, items) {
    const total = items.length, pages = Math.ceil(total / CARD_PAGE);
    const lis = items.map((h, i) => h.replace(/^<li/, `<li data-i="${i}"${i >= CARD_PAGE ? ' hidden' : ''}`)).join('');
    const nav = pages > 1 ? `<div class="cp-nav"><button type="button" class="pg-btn" data-cp="prev" aria-label="Previous items" disabled>&lsaquo;</button><span class="hint cp-info" role="status">1 - ${CARD_PAGE} of ${total}</span><button type="button" class="pg-btn" data-cp="next" aria-label="Next items">&rsaquo;</button></div>` : '';
    return `<div class="cp" data-cp-total="${total}" data-cp-page="0"><ul class="${cls}">${lis}</ul>${nav}</div>`;
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('button[data-cp]');
    const box = btn && btn.closest('.cp');
    if (!box || btn.disabled) return;
    const total = Number(box.dataset.cpTotal), pages = Math.ceil(total / CARD_PAGE);
    const page = Math.min(Math.max(Number(box.dataset.cpPage) + (btn.dataset.cp === 'next' ? 1 : -1), 0), pages - 1);
    box.dataset.cpPage = page;
    const from = page * CARD_PAGE, to = Math.min(total, from + CARD_PAGE);
    box.querySelectorAll('li[data-i]').forEach((li) => { li.hidden = !(li.dataset.i >= from && li.dataset.i < to); });
    box.querySelector('.cp-info').textContent = `${from + 1} - ${to} of ${total}`;
    const prev = box.querySelector('[data-cp="prev"]'), next = box.querySelector('[data-cp="next"]');
    prev.disabled = page === 0; next.disabled = page >= pages - 1;
    (btn.disabled ? (btn.dataset.cp === 'next' ? prev : next) : btn).focus();
  });

  /* The latest changes made in the admin, newest first. */
  function recentActivity(s) {
    const list = (s.audit || []).slice(0, 12);
    if (!list.length) return '';
    return `<section class="card td-panel" aria-labelledby="td-act-h">
      <h2 id="td-act-h">Recent activity</h2>
      ${pagedList('td-activity', list.map((a) => `<li><span>${UI.esc(a.text)}</span><span class="hint">${UI.esc(a.by)} · ${UI.esc(UI.dateTime(a.at))}</span></li>`))}
    </section>`;
  }

  /* Waitlist places that were offered and booked, for the venues in view: money that would otherwise be an empty place. */
  function recoveredNote(s) {
    const sessionIds = new Set(App.visibleEvents().flatMap((e) => e.sessions.map((x) => x.id)));
    const n = (s.waitlist || []).filter((w) => w.status === 'Booked' && sessionIds.has(w.sessionId)).length;
    return n ? `<p class="td-recovered">${UI.statIcon('check', 'violet')}<span><b>${plural(n, 'place', 'places')}</b> recovered from the waitlist: people who were offered a freed place and booked it.</span></p>` : '';
  }

  /* Red banner for the things that should not wait. */
  function alertBanner(s, now) {
    const requests = openRequests('cancel').length;
    const approvals = canApprove() ? openRequests('refund').length : 0;
    const missingToday = missingDetails(s, now).reduce((n, m) => n + m.todayCount, 0);
    const failed = seesSends() ? failedSends(s).length : 0;
    const canB = App.can('bookings.view');
    const lines = [
      approvals ? { text: `${plural(approvals, 'refund from a club manager is', 'refunds from club managers are')} waiting for your approval`, href: '', label: '' } : null,
      requests ? { text: `${plural(requests, 'cancellation request is', 'cancellation requests are')} waiting for an answer`, href: canB ? '#/bookings/filter/requests' : '', label: 'Review' } : null,
      missingToday ? { text: `${plural(missingToday, 'ticket', 'tickets')} for today's sessions ${missingToday === 1 ? 'is' : 'are'} missing guest details`, href: canB ? '#/bookings/filter/missing' : '', label: 'Review' } : null,
      failed ? { text: `${plural(failed, 'email send has', 'email sends have')} failed`, href: '#/settings/messages/klaviyo', label: 'View log' } : null
    ].filter(Boolean);
    if (!lines.length) return '';
    return `<section class="td-alert" aria-label="Important">
      <p class="td-alert-title">${UI.statIcon('alert', 'red')}<span>Important: needs your attention</span></p>
      <ul>${lines.map((l) => `<li><span>${UI.esc(l.text)}</span>${l.href ? `<a class="btn btn-small" href="${l.href}">${l.label} &rarr;</a>` : ''}</li>`).join('')}</ul>
    </section>`;
  }

  /* Donut for today's check-in rate. */
  function donutCard(booked, checkedIn) {
    const pct = booked ? Math.round(checkedIn / booked * 100) : 0, r = 42, c = 2 * Math.PI * r;
    return `<section class="card td-chart" aria-labelledby="td-donut-h">
      <h2 id="td-donut-h">Check-in rate today</h2>
      <div class="td-donut-wrap">
        <svg viewBox="0 0 100 100" width="132" height="132" role="img" aria-label="${pct} percent checked in"><circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--line)" stroke-width="12"/><circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--accent)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(c * pct / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/><text x="50" y="56" text-anchor="middle" font-size="20" font-weight="700" fill="currentColor">${pct}%</text></svg>
        <ul class="td-legend"><li><i style="background:var(--accent)"></i>Checked in<b>${checkedIn}</b></li><li><i style="background:var(--line)"></i>Still to arrive<b>${Math.max(0, booked - checkedIn)}</b></li></ul>
      </div>
    </section>`;
  }

  /* Line chart: bookings made per day over the last 14 days. */
  function bookingsChart(now) {
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(Core.dayKey(new Date(now.getTime() - i * 86400000)));
    const counts = new Map(days.map((d) => [d, 0]));
    for (const b of App.visibleBookings()) { const d = Core.dayKey(b.createdAt); if (counts.has(d)) counts.set(d, counts.get(d) + 1); }
    const vals = days.map((d) => counts.get(d)), max = Math.max(1, ...vals), total = vals.reduce((a, b) => a + b, 0);
    const W = 320, H = 110, px = 8, py = 10;
    const pts = vals.map((v, i) => [px + i * (W - 2 * px) / (vals.length - 1), H - py - v / max * (H - 2 * py)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = line + ` L${pts[pts.length - 1][0].toFixed(1)} ${H - py} L${pts[0][0].toFixed(1)} ${H - py} Z`;
    const label = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `<section class="card td-chart" aria-labelledby="td-line-h">
      <div class="td-chart-head"><h2 id="td-line-h">Bookings, last 14 days</h2><b>${total}</b></div>
      <svg viewBox="0 0 ${W} ${H}" class="td-line" role="img" aria-label="Bookings per day, ${total} in total, busiest day ${max}"><defs><linearGradient id="tdg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs><path d="${area}" fill="url(#tdg)"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>${pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" fill="var(--panel)" stroke="var(--accent)" stroke-width="1.6"/>`).join('')}</svg>
      <div class="td-axis"><span>${label(days[0])}</span><span>Busiest day: ${max}</span><span>${label(days[days.length - 1])}</span></div>
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
        ${App.can('events.view') ? `<a href="#/events/${encodeURIComponent(r.event.id)}">${UI.esc(sessionName(r.event, r.session))}</a>` : `<b>${UI.esc(sessionName(r.event, r.session))}</b>`}
        <span class="hint">${UI.esc(when)}. ${UI.esc(detail)}.</span></li>`;
    });
    return `<section class="card td-panel" aria-labelledby="td-warn-h">
      <h2 id="td-warn-h">Low space and sold out</h2>
      <p class="hint">Sessions on sale in the next ${WARNING_DAYS} days with ${s.settings.lowSpaceThreshold} places or fewer left.</p>
      ${pagedList('td-warnings', items)}
    </section>`;
  }

  function sessionsTable(s, rows, now) {
    const allVenues = !App.venueId();
    return UI.table({ title: 'Today\'s sessions', subtitle: 'Every session running today with places booked and people checked in.' }, [
      { label: 'Time', html: (r) => UI.esc(UI.time(r.session.start)) },
      {
        label: 'Session', html: (r) => {
          const v = allVenues ? Core.findVenue(s, r.event.venueId) : null;
          return `<span class="td-session">${UI.esc(sessionName(r.event, r.session))}${v ? `<span class="hint"> ${UI.esc(v.name)}</span>` : ''}</span>`;
        }
      },
      { label: 'Booked', html: (r) => (r.cancelled ? '<span class="muted">None</span>' : `<span class="meter-inline">${meter(r.booked, r.session.capacity, true)}<span>${r.booked} of ${r.session.capacity}</span></span>`) },
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
      /* One-tap shortcuts, only the ones this role may use. */
      const quick = [
        App.can('checkin') ? '<a class="btn btn-primary" href="#/checkin">Open check-in</a>' : '',
        App.can('bookings.create') ? '<a class="btn" href="#/bookings/new">Add booking</a>' : '',
        App.can('events.edit') ? '<a class="btn" href="#/events/new">New event</a>' : ''
      ].join('');
      main.innerHTML = `<div class="td-view">
        <p class="hello">${UI.esc(greeting(now))}, ${UI.esc(firstName(App.user().name))}</p>
        ${UI.pageHead('Today', quick, `${UI.date(now)} · ${venue ? venue.name : 'All venues'}`, false)}
        ${alertBanner(s, now)}
        <div class="td-layout">
          <div class="td-main">
            ${upNextCard(s, rows, now)}
            <div class="grid stats">
              <div class="stat">${UI.statIcon('calendar', 'blue')}<b>${running.length}</b><span>Sessions today</span><small>${rows.length - running.length ? `${plural(rows.length - running.length, 'cancelled', 'cancelled')}` : 'None cancelled'}</small></div>
              <div class="stat">${UI.statIcon('users', 'amber')}<b>${booked} <i>of ${capacity}</i></b><span>Places booked</span>${meter(booked, capacity)}</div>
              <div class="stat">${UI.statIcon('check', 'cyan')}<b>${checkedIn} <i>of ${booked}</i></b><span>Checked in</span>${meter(checkedIn, booked)}</div>
              ${App.can('reports') ? revenueTile(now) : ''}
            </div>
            ${recoveredNote(s)}
            <div class="td-charts">${donutCard(booked, checkedIn)}${bookingsChart(now)}</div>
            <div class="td-pair">${warningsPanel(s, now)}${App.can('settings') ? recentActivity(s) : ''}</div>
            <section aria-labelledby="td-sessions-h">
              <h2 id="td-sessions-h">Today's sessions</h2>
              ${sessionsTable(s, rows, now)}
            </section>
          </div>
          <aside class="td-side">
            ${needsAction(s, now)}
          </aside>
        </div>
      </div>`;
    }
  });
})();
