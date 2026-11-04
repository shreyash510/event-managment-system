/* Events: the list, the event page, and the actions on them (duplicate, publish, close sales,
   cancel, edit a session, waitlist). The create and edit form is in event-form.js. */
(function () {
  'use strict';
  const filters = { venue: '', status: '', format: '', q: '', type: '' };
  const S = () => App.state;
  const who = () => App.user().name;
  const esc = (v) => UI.esc(v);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
  const isFuture = (x, now) => !!x.start && new Date(x.start) > now;

  /* Checked again just before an action runs, even though the button is hidden for other roles. */
  function allowed(perm, e) {
    if (App.can(perm) && (!e || Core.canSeeVenue(App.user(), e.venueId))) return true;
    UI.toast('Your role cannot do this.', 'bad');
    return false;
  }
  const venueName = (id) => { const v = Core.findVenue(S(), id); return v ? v.name : 'Unknown venue'; };
  const typeName = (id) => { const t = Core.findType(S(), id); return t ? t.name : 'No type'; };
  const sessionLabel = (x) => (x.start ? UI.dateTime(x.start) : 'No date yet');
  const peopleIn = (rows) => rows.reduce((n, r) => n + new Set(r.tickets.map((t) => t.personId)).size, 0);
  const waitlistFor = (sessionId) => S().waitlist.filter((w) => w.sessionId === sessionId && w.status !== 'Removed' && w.status !== 'Booked');
  const isAdmin = () => App.role() === 'admin';
  const statusBadge = (st) => UI.badge(st, st === 'Pending approval' ? 'warn' : undefined);
  const approvalOf = (e) => (e.approval && e.approval.status) || '';
  /* A rejected event goes back to marketing, even when it is a copy of a live event. */
  const needsApproval = (e) => Core.needsEventApproval(S(), App.role(), e) || (App.role() === 'manager' && approvalOf(e) === 'rejected');

  /* ---------- List ---------- */
  function spacesText(e, now) {
    const s = S();
    if (e.cancelled) return '<span class="muted">None</span>';
    const rem = Core.remainingSessions(e, now);
    if (!rem.length) {
      const noDate = e.sessions.filter((x) => !x.start).length;
      return `<span class="muted">${noDate ? esc(plural(noDate, 'session')) + ', no dates yet' : 'None'}</span>`;
    }
    const x = rem[0], left = Core.placesLeft(s, x);
    const first = `${rem.length > 1 ? 'Next session: ' : ''}${left} of ${x.capacity} left`;
    const block = e.block && e.block.enabled ? `<br><span class="hint">Blocks left: ${Core.blockPlacesLeft(s, e, now)}</span>` : '';
    return esc(first) + block;
  }
  function sortEvents(list, now) {
    const key = (e) => {
      const rem = e.cancelled ? [] : Core.remainingSessions(e, now);
      if (rem.length) return { group: 0, at: rem[0].start };
      const dated = e.sessions.filter((x) => x.start).map((x) => x.start).sort();
      return { group: e.draft ? 1 : 2, at: dated.length ? dated[dated.length - 1] : '' };
    };
    return list.map((e) => ({ e, k: key(e) })).sort((a, b) => {
      if (a.k.group !== b.k.group) return a.k.group - b.k.group;
      return a.k.group === 0 ? a.k.at.localeCompare(b.k.at) : b.k.at.localeCompare(a.k.at);
    }).map((x) => x.e);
  }
  /* The admin, and staff who work at more than one club, can narrow the list to one venue. */
  const filterVenues = () => S().venues.filter((v) => Core.canSeeVenue(App.user(), v.id));
  const showVenueFilter = () => filterVenues().length > 1 && !App.venueId();
  /* skip: leave one tab row out, so each tab can show how many events it would give. */
  function filtered(now, skip) {
    const s = S(), q = filters.q.trim().toLowerCase();
    return App.visibleEvents().filter((e) => {
      if (showVenueFilter() && filters.venue && e.venueId !== filters.venue) return false;
      if (filters.type && e.typeId !== filters.type) return false;
      if (skip !== 'status' && filters.status && Core.eventStatus(s, e, now) !== filters.status) return false;
      if (skip !== 'format' && filters.format && e.format !== filters.format) return false;
      if (q && ![e.title, venueName(e.venueId), typeName(e.typeId)].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }
  function renderResults(box) {
    const now = App.now(), s = S();
    const rows = sortEvents(filtered(now), now);
    const nextDate = (e) => {
      const rem = e.cancelled ? [] : Core.remainingSessions(e, now);
      if (rem.length) return esc(UI.dateTime(rem[0].start)) + (rem.length > 1 ? `<br><span class="hint">${esc(plural(rem.length, 'session'))} to go</span>` : '');
      return '<span class="muted">None to come</span>';
    };
    box.innerHTML = `<p class="hint" role="status">${esc(plural(rows.length, 'event'))}</p>` + UI.table({ title: 'All events', subtitle: 'Every event with its status, next session and bookings.' }, [
      { label: 'Event', html: (e) => `<a href="#/events/${encodeURIComponent(e.id)}"><b>${esc(e.title)}</b></a><br><span class="hint">${esc(typeName(e.typeId))}</span>` },
      { label: 'Venue', html: (e) => esc(venueName(e.venueId)) },
      { label: 'Format', html: (e) => esc(e.format) },
      { label: 'Next session', html: nextDate },
      { label: 'Spaces', html: (e) => spacesText(e, now) },
      { label: 'Status', html: (e) => statusBadge(Core.eventStatus(s, e, now)) + (e.draft && approvalOf(e) === 'rejected' ? '<br><span class="hint">Not approved</span>' : '') }
    ], rows, { emptyText: 'No events match these filters.', tools: UI.search({ attrs: 'data-f="q"', value: filters.q, placeholder: 'Search event, venue or type...' }) + UI.filterButton('events', dialogCount()) });
  }
  const dialogCount = () => [showVenueFilter() && filters.venue, filters.type].filter(Boolean).length;
  const formatTabs = (now) => UI.tabs([{ icon: 'grid', key: '', label: 'All', count: filtered(now, 'format').length, on: !filters.format }]
    .concat(Core.FORMATS.map((f) => ({ icon: { 'One-off': 'ticket', 'Seasonal series': 'cal', 'Regular series': 'repeat', Coaching: 'user' }[f] || 'cal', key: f, label: f, count: filtered(now, 'format').filter((e) => e.format === f).length, on: filters.format === f }))), { attr: 'data-format', label: 'Format' });
  const statusTabs = (now) => {
    const base = filtered(now, 'status').filter((e) => !filters.format || e.format === filters.format);
    return UI.tabs([{ key: '', label: 'All', count: base.length, on: !filters.status }]
      .concat(Core.STATUSES.map((st) => ({ key: st, label: st, count: base.filter((e) => Core.eventStatus(S(), e, now) === st).length, on: filters.status === st }))), { sub: true, attr: 'data-status', label: 'Status' });
  };
  /* The marketing admin's way in to new events from club managers. */
  const approvalChip = () => {
    if (!isAdmin()) return '';
    const n = App.visibleEvents().filter((e) => !e.cancelled && approvalOf(e) === 'pending').length;
    if (!n) return '';
    return `<button type="button" class="ev-chip" data-approval aria-pressed="${filters.status === 'Pending approval'}">Waiting for approval <b>${n}</b></button>`;
  };
  const crumbs = () => UI.crumbs([{ label: 'Events Admin', href: App.home() }, { label: 'Events', href: '#/events' }]
    .concat(filters.format ? [{ label: filters.format }] : []).concat(filters.status ? [{ label: filters.status }] : []));
  function renderList(main) {
    const now = App.now(), visible = App.visibleEvents();
    const stats = UI.statPill([{ n: visible.filter((e) => Core.eventStatus(S(), e, now) === 'On sale').length, label: 'On sale' }, { n: visible.filter((e) => Core.eventStatus(S(), e, now) === 'Draft').length, label: 'Draft' }]);
    const head = UI.pageHead('Events', stats + (App.can('events.edit') ? '<a class="btn btn-primary" href="#/events/new">New event</a>' : ''), 'Create and manage events, sessions, prices, spaces and waitlists.');
    main.innerHTML = `<div class="ev-page"><div id="ev-crumbs"></div>${head}
      <div class="list-bar">
        <div id="ev-approval"></div>
        <div id="ev-formats"></div>
        <div class="list-row">
          <div id="ev-statuses"></div>
        </div>
      </div>
      <div id="ev-results"></div></div>`;
    const box = main.querySelector('#ev-results');
    const paintBar = () => {
      const t = App.now();
      main.querySelector('#ev-crumbs').innerHTML = crumbs();
      UI.keepFocus(() => { main.querySelector('#ev-approval').innerHTML = approvalChip(); main.querySelector('#ev-formats').innerHTML = formatTabs(t); main.querySelector('#ev-statuses').innerHTML = statusTabs(t); });
      UI.setFilterCount(main, dialogCount());
    };
    const change = () => { paintBar(); UI.keepFocus(() => renderResults(box)); };
    box.addEventListener('input', (ev) => { if (ev.target.matches('[data-f="q"]')) { filters.q = ev.target.value; change(); } });
    main.querySelector('#ev-approval').addEventListener('click', (ev) => {
      if (!ev.target.closest('[data-approval]')) return;
      const on = filters.status === 'Pending approval';
      filters.status = on ? '' : 'Pending approval';
      if (!on) filters.format = '';
      change();
    });
    main.querySelector('#ev-formats').addEventListener('click', (ev) => { const b = ev.target.closest('[data-format]'); if (b) { filters.format = b.dataset.format; change(); } });
    main.querySelector('#ev-statuses').addEventListener('click', (ev) => { const b = ev.target.closest('[data-status]'); if (b) { filters.status = b.dataset.status; change(); } });
    UI.onFilter('events', () => UI.filterDialog({
      title: 'Filter events',
      fields: [].concat(showVenueFilter() ? [{ key: 'venue', label: 'Venue', any: 'All venues', options: filterVenues().map((v) => ({ value: v.id, label: v.name })) }] : [])
        .concat([{ key: 'type', label: 'Event type', any: 'All types', options: (S().eventTypes || []).map((x) => ({ value: x.id, label: x.name })) }]),
      values: filters,
      onApply: (v) => { filters.venue = v.venue || ''; filters.type = v.type || ''; change(); }
    }));
    change();
  }

  /* ---------- Event page ---------- */
  function actionButtons(e, status, rem) {
    const out = [];
    if (App.can('events.edit')) {
      const pending = approvalOf(e) === 'pending';
      if (pending && isAdmin()) out.push('<button type="button" class="btn btn-primary" data-act="approve">Approve</button>', '<button type="button" class="btn btn-danger" data-act="reject">Reject</button>');
      else if (e.draft && !pending) out.push(`<button type="button" class="btn btn-primary" data-act="publish">${needsApproval(e) ? 'Send for approval' : 'Publish'}</button>`);
      if (!e.cancelled) out.push(`<a class="btn" href="#/events/${encodeURIComponent(e.id)}/edit">Edit</a>`);
      out.push('<button type="button" class="btn" data-act="duplicate">Duplicate</button>');
      if (!e.draft && !e.cancelled) out.push('<button type="button" class="btn" data-act="share">Share links</button>');
      if (status === 'On sale' || status === 'Sold out') out.push('<button type="button" class="btn" data-act="close-sales">Close sales</button>');
      if (status === 'Sales closed' && rem.length) out.push('<button type="button" class="btn" data-act="open-sales">Open sales again</button>');
    }
    if (App.can('events.cancel') && !e.draft && !e.cancelled && rem.length) out.push('<button type="button" class="btn btn-danger" data-act="cancel-event">Cancel event</button>');
    return out.join('');
  }
  function approvalNote(e) {
    const a = e.approval;
    if (!a || e.cancelled) return '';
    const stamp = `${esc(a.by || 'Staff')}, ${esc(a.at ? UI.dateTime(a.at) : '')}`;
    if (a.status === 'pending') return `<div class="ev-note"><b>Waiting for marketing approval.</b> Sent by ${stamp}. Customers cannot book this event until it is approved.</div>`;
    if (a.status === 'rejected' && e.draft) return `<div class="ev-warn"><b>Marketing did not approve this event.</b> Reason: ${esc(a.reason)} <span class="hint">(${stamp})</span>${isAdmin() ? '' : '<br>Change what is needed, then send it for approval again.'}</div>`;
    return '';
  }
  function detailsCard(e) {
    const guest = { lead: 'Lead booker only', name: 'A name for each guest', nameEmail: 'A name and email for each guest' }[e.guestDetails] || e.guestDetails;
    const collect = e.collectAt === 'link' ? 'By a link after booking' : 'At checkout';
    const rows = [
      ['Venue', venueName(e.venueId)], ['Format', e.format], ['Event type', typeName(e.typeId)],
      ['Sales open', e.salesOpenAt ? UI.dateTime(e.salesOpenAt) : 'When published'],
      ['Sales close', e.salesClosed ? 'Closed by staff' : (e.salesCloseAt ? UI.dateTime(e.salesCloseAt) : 'When the session starts')],
      ['Guest details', `${guest}. ${collect}.`], ['Most tickets per booking', e.maxPerBooking], ['Waitlist', e.waitlistOn ? 'On' : 'Off']
    ];
    const questions = (e.questions || []).length
      ? `<h3>Questions for customers</h3><ul class="ev-list">${e.questions.map((q) => `<li>${esc(q.label)}${q.required ? ' <span class="hint">(required)</span>' : ''}</li>`).join('')}</ul>` : '';
    return `<section class="card"><h2>Details</h2>
      ${e.description ? `<p>${esc(e.description)}</p>` : '<p class="muted">No description yet.</p>'}
      <dl class="ev-dl">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${questions}</section>`;
  }
  function priceCard(e) {
    if (!App.can('pricing.view')) return '';
    const m = e.memberPricing;
    const memberText = !m || m.mode === 'none' ? 'No member price'
      : m.mode === 'percent' ? `${m.value}% off for members` : 'Fixed member price';
    const rows = e.tickets.map((t) => ({ name: e.dropInsEnabled ? t.name : `${t.name} (drop-ins are off)`, price: t.price, member: Core.memberUnit(e, t.price, 'dropin'), note: t.salesEnd ? `Sales end ${UI.dateTime(t.salesEnd)}` : '' }));
    const count = e.sessions.filter((x) => !x.cancelled).length;
    if (e.block && e.block.enabled) rows.push({ name: `Block (${plural(count, 'session')})`, price: e.block.price, member: Core.memberUnit(e, e.block.price, 'block'), note: count ? `${UI.money(Core.split(e.block.price, count)[0])} per session` : '' });
    const warnings = Core.pricingWarnings(e);
    return `<section class="card"><h2>Price summary</h2>
      <p class="hint">${esc(memberText)}. ${e.memberCoversGuests ? 'The member price also covers guests.' : 'The member price covers the member\'s own ticket only.'}</p>
      ${UI.table([
        { label: 'Ticket', html: (r) => esc(r.name) },
        { label: 'Price', html: (r) => esc(UI.money(r.price)) },
        { label: 'Member price', html: (r) => esc(UI.money(r.member)) },
        { label: 'Note', html: (r) => esc(r.note) || '<span class="muted">None</span>' }
      ], rows, { emptyText: 'No prices set yet.' })}
      ${warnings.length ? `<div class="ev-warn"><b>Check these prices</b><ul class="ev-list">${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}</section>`;
  }
  function blockNote(e, rem, now) {
    if (!(e.block && e.block.enabled) || e.cancelled || !rem.length) return '';
    const s = S(), left = Core.blockPlacesLeft(s, e, now);
    const fullest = rem.filter((x) => Core.placesLeft(s, x) === left);
    const started = Core.sortedSessions(e).some((x) => !x.cancelled && x.start && new Date(x.start) <= now);
    return `<div class="ev-note"><b>Blocks left: ${left}.</b> A block takes one place in every remaining session, so the fullest session sets the limit.
      ${rem.length > 1 ? esc(`${UI.date(fullest[0].start)} has ${plural(left, 'space')} left.`) : ''}
      ${started ? ' The first session has started, so blocks are no longer sold online. Staff can add one by hand.' : ''}</div>`;
  }
  function sessionStatus(x, left, now) {
    if (x.cancelled) return UI.badge('Cancelled');
    if (!x.start) return UI.badge('No date', 'quiet');
    if (!isFuture(x, now)) return UI.badge('Past', 'quiet');
    if (left === 0) return UI.badge('Sold out');
    if (left <= S().settings.lowSpaceThreshold) return UI.badge('Few spaces left', 'warn');
    return UI.badge('Open', 'good');
  }
  function sessionsCard(e, rem, now) {
    const s = S(), hasBlock = e.block && e.block.enabled;
    const blocksLeft = hasBlock ? Core.blockPlacesLeft(s, e, now) : 0;
    const spread = rem.some((x) => Core.placesLeft(s, x) !== blocksLeft);
    const list = Core.sortedSessions(e);
    const cols = [
      { label: 'Session', html: (x) => esc(sessionLabel(x)) },
      { label: 'Limit', html: (x) => esc(x.capacity) },
      { label: 'Booked', html: (x) => esc(Core.sessionTaken(s, x.id)) },
      { label: 'Spaces left', html: (x) => (x.cancelled ? '<span class="muted">None</span>' : esc(Core.placesLeft(s, x))) }
    ];
    if (hasBlock) {
      cols.push({ label: 'Block places left', html: (x) => {
        if (x.cancelled || !isFuture(x, now)) return '<span class="muted">None</span>';
        const setsLimit = spread && Core.placesLeft(s, x) === blocksLeft;
        return setsLimit ? `<b>${blocksLeft}</b> <span class="hint">(this session sets it)</span>` : esc(blocksLeft);
      } });
    }
    cols.push({ label: 'Status', html: (x) => sessionStatus(x, Core.placesLeft(s, x), now) });
    cols.push({ label: 'Actions', html: (x) => {
      const label = sessionLabel(x), bits = [];
      if (!x.cancelled && !e.draft && App.can('checkin')) bits.push(`<a class="btn btn-small" href="#/checkin/${encodeURIComponent(x.id)}" aria-label="Check-in for ${esc(label)}">Check-in</a>`);
      if (!x.cancelled && !e.draft && !e.cancelled && (e.waitlistOn || waitlistFor(x.id).length)) bits.push(`<button type="button" class="btn btn-small" data-act="waitlist" data-sid="${esc(x.id)}" aria-label="Waitlist for ${esc(label)}">Waitlist (${waitlistFor(x.id).length})</button>`);
      if (App.can('events.edit') && !x.cancelled && !e.cancelled && (!x.start || isFuture(x, now))) bits.push(`<button type="button" class="btn btn-small" data-act="edit-session" data-sid="${esc(x.id)}" aria-label="Edit ${esc(label)}">Edit</button>`);
      if (App.can('events.edit') && !e.draft && !x.cancelled && !e.cancelled && isFuture(x, now)) bits.push(`<button type="button" class="btn btn-small" data-act="message" data-sid="${esc(x.id)}" aria-label="Message attendees of ${esc(label)}">Message</button>`);
      if (App.can('events.cancel') && !e.draft && !x.cancelled && !e.cancelled && isFuture(x, now)) bits.push(`<button type="button" class="btn btn-small" data-act="cancel-session" data-sid="${esc(x.id)}" aria-label="Cancel ${esc(label)}">Cancel</button>`);
      return `<div class="ev-actions">${bits.join('') || '<span class="muted">None</span>'}</div>`;
    } });
    return `<section class="card ev-sessions"><h2>Sessions</h2>${blockNote(e, rem, now)}${UI.table({ subtitle: 'Each session with its date, places and bookings.' }, cols, list, { emptyText: 'No sessions yet.' })}</section>`;
  }
  function renderDetail(main, id) {
    const s = S(), e = Core.findEvent(s, id), now = App.now();
    if (!e || !App.inVenue(e.venueId)) {
      main.innerHTML = `<div class="ev-page"><p><a href="#/events">Back to Events</a></p>${UI.empty(e ? 'This event is not at the venue you are viewing.' : 'We could not find this event.')}</div>`;
      return;
    }
    if (App.can('events.edit') && Core.canSeeVenue(App.user(), e.venueId)) {
      const offered = runAutoOffers(e);
      if (offered) UI.toast(`${plural(offered, 'waitlist offer')} sent automatically (demo).`);
    }
    const status = Core.eventStatus(s, e, now), rem = e.cancelled ? [] : Core.remainingSessions(e, now);
    main.innerHTML = `<div class="ev-page" id="ev-detail">
      <p class="ev-back"><a href="#/events">Back to Events</a></p>
      ${UI.pageHead(e.title, actionButtons(e, status, rem), `${venueName(e.venueId)} · ${e.format}. See this event's sessions and spaces, and manage or cancel them.`, '#/events')}
      <p>${statusBadge(status)}</p>
      ${approvalNote(e)}
      ${e.cancelled ? '<div class="ev-warn">This event is cancelled.</div>' : ''}
      ${sessionsCard(e, rem, now)}
      <div class="ev-columns">${detailsCard(e)}${priceCard(e)}</div></div>`;
    main.querySelector('#ev-detail').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-act]');
      if (!b) return;
      const sid = b.dataset.sid, act = b.dataset.act;
      if (act === 'publish') publish(e);
      else if (act === 'approve') approve(e);
      else if (act === 'reject') reject(e);
      else if (act === 'message') messageAttendees(e, sid);
      else if (act === 'duplicate') duplicate(e);
      else if (act === 'share') shareLinks(e);
      else if (act === 'close-sales') closeSales(e);
      else if (act === 'open-sales') openSales(e);
      else if (act === 'cancel-event') startCancel(e, Core.remainingSessions(e, App.now()).map((x) => x.id), true);
      else if (act === 'cancel-session') startCancel(e, [sid], false);
      else if (act === 'edit-session') editSession(e, sid);
      else if (act === 'waitlist') openWaitlist(e, sid);
    });
  }

  /* ---------- Share links: booking links tagged with where they are posted, so Reports can show the source ---------- */
  const SHARE_SOURCES = [
    { key: 'instagram', label: 'Instagram', medium: 'social' },
    { key: 'email', label: 'Email newsletter', medium: 'email' },
    { key: 'facebook', label: 'Facebook', medium: 'social' }
  ];
  const slug = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event';
  const shareUrl = (e, source, medium) => `${location.origin}${location.pathname}#/browse?event=${encodeURIComponent(e.id)}&utm_source=${encodeURIComponent(source)}&utm_medium=${encodeURIComponent(medium)}&utm_campaign=${encodeURIComponent(slug(e.title))}`;
  function shareLinks(e) {
    const row = (label, url, id) => `<div class="ev-share-row"><label class="field"><span>${esc(label)}</span><input type="text" readonly id="${id}" value="${esc(url)}"></label><button type="button" class="btn btn-small" data-copy="${id}" aria-label="Copy the ${esc(label)} link">Copy</button></div>`;
    UI.dialog({
      title: 'Share links', subtitle: 'Use a different link in each place you post, so Reports can show which one brought the bookings.', wide: true,
      body: `<div class="ev-share">${SHARE_SOURCES.map((x) => row(x.label, shareUrl(e, x.key, x.medium), `ev-share-${x.key}`)).join('')}
        <div class="ev-share-row"><label class="field"><span>Partner or other place</span><input type="text" id="ev-share-name" maxlength="40" placeholder="Such as a partner name" autocomplete="off"></label></div>
        ${row('Link for that place', shareUrl(e, 'partner', 'referral'), 'ev-share-custom')}
        <p class="hint">Bookings made from these links show under Reports, Source.</p></div>`,
      actions: [{ label: 'Done', kind: 'primary' }],
      onOpen: (d) => {
        d.querySelector('#ev-share-name').addEventListener('input', (ev) => { d.querySelector('#ev-share-custom').value = shareUrl(e, slug(ev.target.value) || 'partner', 'referral'); });
        d.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-copy]');
          if (!b) return;
          const box = d.querySelector(`#${b.dataset.copy}`);
          const done = () => UI.toast('Link copied.');
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(box.value).then(done, () => { box.select(); UI.toast('Press Ctrl+C to copy.'); });
          else { box.select(); UI.toast('Press Ctrl+C to copy.'); }
        });
      }
    });
  }

  /* ---------- Duplicate, publish, sales ---------- */
  function duplicate(e) {
    if (!allowed('events.edit', e)) return;
    const s = S(), c = JSON.parse(JSON.stringify(e));
    c.id = Core.nextId(s, 'e');
    c.title = `Copy of ${e.title}`;
    c.draft = true; c.cancelled = false; c.salesClosed = false; c.salesOpenAt = ''; c.salesCloseAt = '';
    /* The copy has its own approval. Core.needsEventApproval lets it publish directly only if this event is live. */
    c.copyOf = e.id;
    delete c.approval;
    c.tickets.forEach((t) => { t.id = Core.nextId(s, 'tt'); t.salesEnd = ''; });
    /* Keeps how many sessions there are and their limits. The dates are left empty for staff to set. */
    c.sessions = Core.sortedSessions(e).filter((x) => !x.cancelled).map((x) => ({ id: Core.nextId(s, 's'), start: '', durationMin: x.durationMin, capacity: x.capacity, cancelled: false }));
    s.events.push(c);
    App.log('Event', `${e.title}: duplicated as a draft (${c.title}).`);
    App.save();
    UI.toast('Copied as a Draft. Add the dates before you publish.');
    App.go(`#/events/${encodeURIComponent(c.id)}${window.EventForm ? '/edit' : ''}`);
  }
  function publishBlockers(e, now) {
    const live = e.sessions.filter((x) => !x.cancelled), blockers = [];
    if (!String(e.title || '').trim()) blockers.push('Add a title.');
    if (!e.tickets.length) blockers.push('Add at least one ticket price.');
    if (!live.length) blockers.push('Add at least one session.');
    const noDate = live.filter((x) => !x.start).length;
    if (noDate) blockers.push(`${plural(noDate, 'session has', 'sessions have')} no date yet.`);
    if (live.length && noDate < live.length && !live.some((x) => isFuture(x, now))) blockers.push('Every session has already passed.');
    return blockers;
  }
  const blockersHtml = (blockers) => `<p>This event cannot go on sale yet:</p><ul class="ev-list">${blockers.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;
  const onSaleText = (e, now) => (e.salesOpenAt && new Date(e.salesOpenAt) > now ? `This event will be Scheduled. Sales open on ${UI.dateTime(e.salesOpenAt)}.` : 'This event will go On sale now.');
  const priceWarningsHtml = (warnings) => (warnings.length ? `<div class="ev-warn"><b>Check these prices first</b><ul class="ev-list">${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '');
  function publish(e) {
    if (!allowed('events.edit', e)) return;
    const now = App.now(), blockers = publishBlockers(e, now), asks = needsApproval(e);
    if (!isAdmin() && window.EventForm && window.EventForm.floorIssues) blockers.push(...window.EventForm.floorIssues(e));
    const warnings = Core.pricingWarnings(e);
    const lead = asks ? '<p>Marketing checks new events from club managers. It will show as Pending approval, and customers cannot book it until marketing approves it.</p>' : `<p>${esc(onSaleText(e, now))}</p>`;
    const body = blockers.length ? blockersHtml(blockers) : `${lead}${priceWarningsHtml(warnings)}`;
    const actions = blockers.length ? [{ label: 'Close', kind: 'ghost' }] : [{ label: 'Not yet', kind: 'ghost' }, { label: asks ? 'Send for approval' : warnings.length ? 'Publish anyway' : 'Publish', kind: 'primary', onClick: () => {
      if (!allowed('events.edit', e)) return;
      const at = App.now();
      if (asks) {
        /* It stays a draft underneath while it waits, so every booking screen and report leaves it out. */
        e.draft = true;
        e.approval = { status: 'pending', by: who(), at: Core.toLocalISO(at) };
        Core.notice(S(), { at, by: who(), kind: 'event', text: `${e.title} at ${venueName(e.venueId)} is waiting for approval.` });
        App.log('Event', `${e.title}: sent to marketing for approval.`);
        App.save(); App.render();
        UI.toast('Sent to marketing for approval.');
        return;
      }
      e.draft = false;
      /* The marketing admin publishing an event that was rejected earlier also settles its approval. */
      if (approvalOf(e) === 'rejected') e.approval = { status: 'approved', by: who(), at: Core.toLocalISO(at) };
      const status = Core.eventStatus(S(), e, App.now());
      App.log('Event', `${e.title}: published, now ${status}.${warnings.length ? ` Published with ${plural(warnings.length, 'price warning')}.` : ''}`);
      App.save(); App.render();
      UI.toast(`Published. This event is now ${status}.`);
    } }];
    UI.dialog({ title: asks ? `Send ${e.title} for approval?` : `Publish ${e.title}?`, body, actions });
  }
  /* ---------- Approval of new events from club managers ---------- */
  function canDecide(e) {
    if (!allowed('events.edit', e)) return false;
    if (!isAdmin() || approvalOf(e) !== 'pending') { UI.toast('Only the marketing admin can decide this, and only while it is waiting.', 'bad'); return false; }
    return true;
  }
  function approve(e) {
    if (!canDecide(e)) return;
    const now = App.now(), blockers = publishBlockers(e, now), warnings = Core.pricingWarnings(e), from = e.approval.by || 'A club manager';
    const body = blockers.length
      ? `${blockersHtml(blockers)}<p class="hint">Reject it with this reason so ${esc(from)} can fix it, or edit it yourself.</p>`
      : `<p>${esc(from)} sent this event for approval. ${esc(onSaleText(e, now))}</p>${priceWarningsHtml(warnings)}`;
    UI.dialog({
      title: `Approve ${e.title}?`, body,
      actions: blockers.length ? [{ label: 'Close', kind: 'ghost' }] : [{ label: 'Not yet', kind: 'ghost' }, { label: warnings.length ? 'Approve anyway' : 'Approve', kind: 'primary', onClick: () => {
        if (!canDecide(e)) return;
        const at = App.now();
        e.approval = { status: 'approved', by: who(), at: Core.toLocalISO(at), requestedBy: e.approval.by };
        e.draft = false;
        const status = Core.eventStatus(S(), e, at);
        App.log('Event', `${e.title}: approved, now ${status}. Sent by ${from}.`);
        App.save(); App.render();
        UI.toast(`Approved. This event is now ${status}.`);
      } }]
    });
  }
  function reject(e) {
    if (!canDecide(e)) return;
    UI.dialog({
      title: `Reject ${e.title}?`, subtitle: 'It goes back to draft, and the club manager sees your reason.',
      body: '<label class="field"><span>Reason (required)</span><textarea id="ev-reject-reason" rows="3" maxlength="300"></textarea></label>',
      actions: [{ label: 'Keep waiting', kind: 'ghost' }, { label: 'Reject', kind: 'danger', onClick: (d) => {
        const reason = d.querySelector('#ev-reject-reason').value.trim();
        if (!reason) { UI.dialogError(d, 'Add a reason, so the club manager knows what to change.'); return false; }
        if (!canDecide(e)) return undefined;
        e.approval = { status: 'rejected', by: who(), at: Core.toLocalISO(App.now()), reason };
        e.draft = true;
        App.log('Event', `${e.title}: rejected, back to draft. Reason: ${reason}`);
        App.save(); App.render();
        UI.toast('Rejected. The event is back to draft.');
        return undefined;
      } }]
    });
  }
  function closeSales(e) {
    if (!allowed('events.edit', e)) return;
    UI.dialog({
      title: 'Close sales?',
      body: '<p>Customers can no longer book this event. Bookings already made stay as they are, and you can open sales again later.</p>',
      actions: [{ label: 'Keep on sale', kind: 'ghost' }, { label: 'Close sales', kind: 'primary', onClick: () => {
        if (!allowed('events.edit', e)) return;
        e.salesClosed = true;
        App.log('Event', `${e.title}: sales closed.`);
        App.save(); App.render();
        UI.toast('Sales closed.');
      } }]
    });
  }
  function openSales(e) {
    if (!allowed('events.edit', e)) return;
    e.salesClosed = false;
    if (e.salesCloseAt && new Date(e.salesCloseAt) <= App.now()) e.salesCloseAt = '';
    App.log('Event', `${e.title}: sales opened again.`);
    App.save(); App.render();
    UI.toast('Sales are open again.');
  }

  /* ---------- Cancel a session or a whole event ---------- */
  function startCancel(e, sessionIds, whole) {
    if (!allowed('events.cancel', e)) return;
    const s = S();
    const rows = Core.affected(s, sessionIds).map((r) => Object.assign(r, { people: new Set(r.tickets.map((t) => t.personId)).size }));
    const flow = { e, ids: sessionIds, whole, rows, choice: 'refund', target: '', decisions: {}, reason: '', extra: '' };
    flow.label = whole ? 'the whole event'
      : `the session on ${sessionLabel(Core.findSession(s, sessionIds[0]).session)}`;
    cancelStep1(flow);
  }
  /* Sessions this booking's places could all move to. Each person needs one place, and only once. */
  function targetsForRow(flow, r) {
    const s = S(), now = App.now();
    const personIds = r.tickets.map((t) => t.personId);
    if (new Set(personIds).size !== personIds.length) return [];
    let common = null;
    r.tickets.forEach((t) => {
      const list = Core.transferTargets(s, r.booking, t, now).filter((x) => !flow.ids.includes(x.session.id) && x.left >= r.tickets.length);
      common = common === null ? list : common.filter((a) => list.some((b) => b.session.id === a.session.id));
    });
    return common || [];
  }
  function allTargets(flow) {
    const seen = new Map();
    flow.rows.forEach((r) => targetsForRow(flow, r).forEach((x) => { if (!seen.has(x.session.id)) seen.set(x.session.id, x); }));
    return [...seen.values()].sort((a, b) => a.session.start.localeCompare(b.session.start));
  }
  const targetText = (x, flow) => `${x.event.id === flow.e.id ? '' : x.event.title + ', '}${UI.dateTime(x.session.start)} (${plural(x.left, 'space')} left)`;
  /* What happens to each booking. Places are counted as they are used up, so a session is never overfilled. */
  function buildPlan(flow) {
    const s = S(), room = {}, errors = [];
    const free = (id) => { if (room[id] === undefined) room[id] = Core.placesLeft(s, Core.findSession(s, id).session); return room[id]; };
    const items = flow.rows.map((r) => {
      let action = 'refund', target = '';
      const options = targetsForRow(flow, r);
      if (flow.choice === 'transfer' && flow.target && options.some((x) => x.session.id === flow.target) && free(flow.target) >= r.tickets.length) {
        action = 'transfer'; target = flow.target;
      } else if (flow.choice === 'decide') {
        const d = flow.decisions[r.booking.id] || 'refund';
        if (d === 'none') action = 'none';
        else if (d.startsWith('transfer:')) {
          action = 'transfer'; target = d.slice(9);
          if (free(target) < r.tickets.length) errors.push(`${r.booking.ref}: not enough spaces left on the session you chose.`);
        }
      }
      if (action === 'transfer') room[target] = free(target) - r.tickets.length;
      return { row: r, action, target };
    });
    return { items, errors };
  }
  const moneyOf = (item) => (item.action === 'refund' ? Core.round2(item.row.amount) : 0);
  function transferPreview(flow) {
    if (!flow.target) return '';
    const items = buildPlan(flow).items, moved = items.filter((i) => i.action === 'transfer').length, rest = items.length - moved;
    return `${plural(moved, 'booking')} will move and be told they can ask for a refund instead.${rest ? ` ${plural(rest, 'booking')} cannot move (no room, or already booked on that session), so they get a refund.` : ''}`;
  }
  function affectedTable(rows, block) {
    return UI.table({ title: 'Affected bookings', subtitle: 'The bookings this change touches.' }, [
      { label: 'Booking', html: (r) => esc(r.booking.ref) },
      { label: 'Customer', html: (r) => esc(r.booking.customer.name) },
      { label: 'People', html: (r) => esc(r.people) },
      { label: block ? 'Places affected' : 'Places', html: (r) => esc(block ? `${r.tickets.length} of ${r.booking.tickets.filter((t) => t.status === 'active').length}` : r.tickets.length) },
      { label: 'Money involved', html: (r) => esc(UI.money(r.amount)) }
    ], rows);
  }
  function cancelStep1(flow) {
    const { rows } = flow;
    const singles = rows.filter((r) => r.booking.kind !== 'block'), blocks = rows.filter((r) => r.booking.kind === 'block');
    const money = Core.round2(rows.reduce((n, r) => n + r.amount, 0));
    const waiting = flow.ids.reduce((n, id) => n + waitlistFor(id).length, 0);
    const targets = allTargets(flow);
    const blockText = flow.whole
      ? 'Places on sessions that have already happened are not touched.'
      : 'Only this session of their block is affected. Their other sessions stay booked.';
    const body = rows.length ? `
      <p class="hint">Step 1. Cancelling ${esc(flow.label)}.</p>
      <div class="grid stats ev-stats">
        <div class="stat">${UI.statIcon('ticket', UI.statTone(0))}<b>${rows.length}</b><span>Bookings</span></div>
        <div class="stat">${UI.statIcon('users', UI.statTone(1))}<b>${peopleIn(rows)}</b><span>People</span></div>
        <div class="stat">${UI.statIcon('wallet', UI.statTone(2))}<b>${esc(UI.money(money))}</b><span>Money involved</span></div>
      </div>
      ${waiting ? `<p>${esc(plural(waiting, 'person', 'people'))} on the waitlist will be taken off it.</p>` : ''}
      <h3>Single bookings (${singles.length})</h3>${singles.length ? affectedTable(singles, false) : '<p class="muted">None.</p>'}
      <h3 class="ev-gap">Blocks (${blocks.length})</h3>
      ${blocks.length ? `<p class="hint">${blockText}</p>${affectedTable(blocks, true)}` : '<p class="muted">None.</p>'}
      <fieldset class="ev-choice"><legend>What should happen?</legend>
        <label class="check"><input type="radio" name="ev-choice" value="refund"${flow.choice === 'refund' ? ' checked' : ''}><span>Refund everyone</span></label>
        <label class="check"><input type="radio" name="ev-choice" value="transfer"${flow.choice === 'transfer' ? ' checked' : ''}${targets.length ? '' : ' disabled'}><span>Offer a transfer to another session${targets.length ? '' : ' <span class="hint">(no other session can take these bookings)</span>'}</span></label>
        ${targets.length ? `<label class="field ev-target" id="ev-target-wrap"><span>Move them to</span><select id="ev-target">${UI.options(targets.map((x) => ({ value: x.session.id, label: targetText(x, flow) })), flow.target)}</select></label><p class="hint" id="ev-target-note"></p>` : ''}
        <label class="check"><input type="radio" name="ev-choice" value="decide"${flow.choice === 'decide' ? ' checked' : ''}><span>Decide for each booking</span></label>
      </fieldset>`
      : `<p class="hint">Cancelling ${esc(flow.label)}.</p><p>Nobody is booked, so there is nothing to refund and nobody to tell.</p>${waiting ? `<p>${esc(plural(waiting, 'person', 'people'))} on the waitlist will be taken off it.</p>` : ''}`;
    const onOpen = (d) => {
      const select = d.querySelector('#ev-target'), wrap = d.querySelector('#ev-target-wrap'), note = d.querySelector('#ev-target-note');
      const sync = () => {
        const checked = d.querySelector('input[name="ev-choice"]:checked');
        flow.choice = checked ? checked.value : 'refund';
        if (select) {
          flow.target = select.value;
          wrap.hidden = note.hidden = flow.choice !== 'transfer';
          note.textContent = flow.choice === 'transfer' ? transferPreview(flow) : '';
        }
      };
      d.querySelectorAll('input[name="ev-choice"]').forEach((c) => c.addEventListener('change', sync));
      if (select) select.addEventListener('change', sync);
      sync();
    };
    UI.dialog({
      title: flow.whole ? `Cancel ${flow.e.title}` : 'Cancel this session', wide: true, body: `<div class="ev-form">${body}</div>`, onOpen,
      actions: [{ label: 'Keep it', kind: 'ghost' }, { label: 'Next', kind: 'primary', onClick: (d, close) => {
        close();
        if (flow.choice === 'decide' && rows.length) cancelStep2(flow); else cancelStep3(flow);
        return false;
      } }]
    });
  }
  function cancelStep2(flow) {
    const select = (r) => {
      const opts = [{ value: 'refund', label: `Refund ${UI.money(r.amount)}` }]
        .concat(targetsForRow(flow, r).map((x) => ({ value: `transfer:${x.session.id}`, label: `Move to ${targetText(x, flow)}` })))
        .concat([{ value: 'none', label: 'Cancel with no refund' }]);
      return `<label class="ev-decision"><span class="hint">What happens to ${esc(r.booking.ref)}</span><select data-b="${esc(r.booking.id)}">${UI.options(opts, flow.decisions[r.booking.id] || 'refund')}</select></label>`;
    };
    const read = (d) => d.querySelectorAll('select[data-b]').forEach((c) => { flow.decisions[c.dataset.b] = c.value; });
    UI.dialog({
      title: 'Decide for each booking', wide: true,
      body: `<p class="hint">Step 2.</p>${UI.table({ title: 'Decide for each booking', subtitle: 'Choose what happens to every affected booking.' }, [
        { label: 'Booking', html: (r) => `${esc(r.booking.ref)}${r.booking.kind === 'block' ? ' <span class="hint">(block)</span>' : ''}` },
        { label: 'Customer', html: (r) => esc(r.booking.customer.name) },
        { label: 'Places', html: (r) => esc(r.tickets.length) },
        { label: 'Decision', html: select }
      ], flow.rows)}`,
      actions: [
        { label: 'Back', kind: 'ghost', onClick: (d, close) => { read(d); close(); cancelStep1(flow); return false; } },
        { label: 'Next', kind: 'primary', onClick: (d, close) => {
          read(d);
          const { errors } = buildPlan(flow);
          if (errors.length) { UI.dialogError(d, errors.join(' ')); return false; }
          close(); cancelStep3(flow);
          return false;
        } }
      ]
    });
  }
  function fillMessage(flow, item) {
    const s = S(), r = item.row, b = r.booking;
    const tpl = s.emailTemplates.find((t) => t.id === (item.action === 'transfer' ? 'tpl3' : 'tpl4')) || { subject: '', body: '' };
    const when = Core.findSession(s, item.action === 'transfer' ? item.target : r.tickets[0].sessionId);
    const vars = {
      first_name: b.customer.name.split(' ')[0], event: flow.e.title, ref: b.ref, venue: venueName(flow.e.venueId),
      date: when ? UI.dateTime(when.session.start) : '', amount: UI.money(moneyOf(item))
    };
    const fill = (text) => String(text).replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] === undefined ? m : vars[k]));
    const lines = [fill(tpl.body)];
    if (b.kind === 'block' && b.tickets.some((t) => t.status === 'active' && !flow.ids.includes(t.sessionId))) lines.push('This only affects some of your block. Your other sessions stay booked.');
    if (item.action === 'transfer') lines.push('If the new time does not suit you, reply to this email and we will refund you instead.');
    if (flow.extra.trim()) lines.push(flow.extra.trim());
    return { subject: fill(tpl.subject), body: lines.join('\n\n') };
  }
  function previewHtml(flow, items) {
    const seen = new Set(), out = [];
    const names = { refund: 'Refund', transfer: 'Transfer', none: 'No refund' };
    items.forEach((i) => {
      const key = `${i.action}-${i.row.booking.kind === 'block' ? 'block' : 'single'}`;
      if (seen.has(key)) return;
      seen.add(key);
      const m = fillMessage(flow, i);
      out.push(`<div class="ev-message"><p class="hint">${esc(names[i.action])}, ${i.row.booking.kind === 'block' ? 'block' : 'single booking'}. Example for ${esc(i.row.booking.ref)}:</p><p><b>${esc(m.subject)}</b></p><p class="ev-message-body">${esc(m.body)}</p></div>`);
    });
    return out.join('');
  }
  function cancelStep3(flow) {
    const { items } = buildPlan(flow);
    const count = (a) => items.filter((i) => i.action === a).length;
    const total = Core.round2(items.reduce((n, i) => n + moneyOf(i), 0));
    const summary = items.length ? `<ul class="ev-list">
      ${count('refund') ? `<li>${esc(plural(count('refund'), 'booking'))} refunded, ${esc(UI.money(total))} in total</li>` : ''}
      ${count('transfer') ? `<li>${esc(plural(count('transfer'), 'booking'))} moved to another session</li>` : ''}
      ${count('none') ? `<li>${esc(plural(count('none'), 'booking'))} cancelled with no refund</li>` : ''}</ul>` : '';
    const body = `<div class="ev-form"><p class="hint">Step ${flow.choice === "decide" ? 3 : 2}. Cancelling ${esc(flow.label)}.</p>${summary}
      <label class="field"><span>Reason (required, kept in the activity log and on each booking)</span><input type="text" id="ev-reason" value="${esc(flow.reason)}" maxlength="200"></label>
      ${flow.whole && App.role() === 'manager' ? '<p class="hint">Marketing gets a notice with this reason.</p>' : ''}
      ${items.length ? `<label class="field"><span>Extra words for the customer message (optional)</span><textarea id="ev-extra" rows="2">${esc(flow.extra)}</textarea></label>
      <h3>Customer message</h3><div id="ev-previews"></div>
      ${UI.demo('No real money moves and no real emails are sent. A live system would call the payment provider and send these messages.')}` : ''}</div>`;
    const read = (d) => { flow.reason = d.querySelector('#ev-reason').value; const x = d.querySelector('#ev-extra'); flow.extra = x ? x.value : ''; };
    UI.dialog({
      title: 'Check and confirm', wide: true, body,
      onOpen: (d) => {
        const box = d.querySelector('#ev-previews'), extra = d.querySelector('#ev-extra');
        if (!box) return;
        const draw = () => { flow.extra = extra.value; box.innerHTML = previewHtml(flow, items); };
        extra.addEventListener('input', draw);
        draw();
      },
      actions: [
        { label: 'Back', kind: 'ghost', onClick: (d, close) => {
          read(d); close();
          if (flow.choice === 'decide' && flow.rows.length) cancelStep2(flow); else cancelStep1(flow);
          return false;
        } },
        { label: flow.whole ? 'Cancel the event' : 'Cancel the session', kind: 'danger', onClick: (d, close) => {
          read(d);
          if (!flow.reason.trim()) { UI.dialogError(d, 'Add a reason.'); return false; }
          const check = buildPlan(flow);
          if (check.errors.length) { UI.dialogError(d, check.errors.join(' ')); return false; }
          close();
          commitCancel(flow, check.items);
          return false;
        } }
      ]
    });
  }
  function commitCancel(flow, items) {
    if (!allowed('events.cancel', flow.e)) return;
    const s = S(), e = flow.e, now = App.now(), by = who(), reason = flow.reason.trim();
    const steps = [];
    /* Order matters: moved places and no-refund places must leave these sessions first,
       because Core.cancelSessions refunds every place still active in them. */
    items.filter((i) => i.action === 'transfer').forEach((i) => {
      const results = i.row.tickets.map((t) => Core.transferTicket(s, i.row.booking, t.id, i.target, { by, now, describe: UI.dateTime }));
      if (results.some((x) => !x.ok)) { i.action = 'refund'; i.failed = true; }
    });
    items.filter((i) => i.action === 'none').forEach((i) => {
      Core.cancelTickets(s, i.row.booking, { ticketIds: i.row.tickets.map((t) => t.id), reason, by, now });
    });
    const waitlisted = flow.ids.reduce((n, id) => n + waitlistFor(id).length, 0);
    const result = Core.cancelSessions(s, e, flow.ids, { refund: true, reason, by, now });
    if (flow.whole || e.sessions.every((x) => x.cancelled)) e.cancelled = true;
    items.forEach((i) => {
      const b = i.row.booking;
      Core.klaviyo(s, { at: now, type: i.action === 'transfer' ? 'Booking changed' : 'Booking cancelled', ref: b.ref });
      Core.logBooking(b, now, by, i.action === 'transfer' ? 'Customer told about the move, with an updated calendar invite (demo).' : 'Customer told about the cancellation (demo).');
      const text = { refund: `refund of ${UI.money(moneyOf(i))}`, transfer: 'moved to another session', none: 'cancelled with no refund' }[i.action];
      steps.push(`${b.ref}, ${b.customer.name}: ${text}${i.failed ? ' (could not be moved)' : ''}. Message sent.`);
    });
    const count = (a) => items.filter((i) => i.action === a).length;
    App.log('Cancel', `${e.title}: cancelled ${flow.label}. ${plural(items.length, 'booking')} affected: ${count('refund')} refunded (${UI.money(result.refunded)}), ${count('transfer')} moved, ${count('none')} with no refund. Reason: ${reason}`);
    if (e.cancelled && App.role() === 'manager') Core.notice(s, { at: now, by, kind: 'cancel', text: `${e.title} at ${venueName(e.venueId)}: whole event cancelled, ${plural(items.length, 'booking')} affected. Reason: ${reason}` });
    App.save();
    App.render();
    showProgress(flow, steps, waitlisted);
  }
  function showProgress(flow, steps, waitlisted) {
    const lines = [`Closed ${flow.label} to sales.`].concat(steps);
    if (waitlisted) lines.push(`Took ${plural(waitlisted, 'person', 'people')} off the waitlist.`);
    UI.dialog({
      title: 'Cancelling', wide: true,
      body: `${UI.demo('Refunds and messages are simulated. In a live system this runs in the background, and anything that fails stays on the Today screen until it is sorted.')}
        <ol class="ev-progress" aria-live="polite">${lines.map((l) => `<li><span class="ev-progress-state">Waiting</span> ${esc(l)}</li>`).join('')}</ol>`,
      actions: [{ label: 'Done', kind: 'primary', onClick: () => {} }],
      onOpen: (d) => {
        const items = [...d.querySelectorAll('.ev-progress li')], done = d.querySelector('.dialog-actions button');
        done.disabled = true;
        let i = 0;
        const tick = () => {
          if (!d.isConnected) return;
          items[i].classList.add('is-done');
          items[i].querySelector('.ev-progress-state').textContent = 'Done';
          i++;
          if (i < items.length) setTimeout(tick, 180);
          else { done.disabled = false; done.focus(); UI.toast('Finished.'); }
        };
        setTimeout(tick, 180);
      }
    });
  }

  /* ---------- Edit a session ---------- */
  /* Past and cancelled sessions never change, even with "all sessions". */
  function editTargets(e, sessionId, scope) {
    const list = Core.sortedSessions(e), now = App.now(), i = list.findIndex((x) => x.id === sessionId);
    const chosen = scope === 'one' ? [list[i]] : scope === 'following' ? list.slice(i) : list;
    return chosen.filter((x) => !x.cancelled && (x.id === sessionId || isFuture(x, now)));
  }
  function editSession(e, sessionId) {
    if (!allowed('events.edit', e)) return;
    const found = e.sessions.find((x) => x.id === sessionId);
    if (!found) return;
    const canOverride = App.can('override');
    const hasScope = !!found.start && e.sessions.filter((x) => !x.cancelled).length > 1;
    const scopes = [['one', 'This session only'], ['following', 'This and following'], ['all', 'All sessions']];
    const body = `<div class="ev-form">
      <label class="field"><span>Date and time</span><input type="datetime-local" id="ev-start" value="${esc(found.start)}"></label>
      <label class="field"><span>Limit (places in this session)</span><input type="number" id="ev-cap" min="1" step="1" value="${esc(found.capacity)}"></label>
      ${hasScope ? `<fieldset class="ev-choice"><legend>Apply this to</legend>${scopes.map(([v, t], i) => `<label class="check"><input type="radio" name="ev-scope" value="${v}"${i === 0 ? ' checked' : ''}><span>${t}</span></label>`).join('')}
        <p class="hint">Only what you change is applied. A new time moves the other sessions by the same amount. Past and cancelled sessions do not change.</p></fieldset>` : ''}
      <div id="ev-edit-summary" class="ev-note" role="status"></div>
      <label class="field" id="ev-override-wrap" hidden><span>Reason for going below the number booked (kept in the activity log)</span><input type="text" id="ev-override" maxlength="200"></label>
      <div id="ev-tell-wrap" hidden>
        <label class="check"><input type="checkbox" id="ev-tell" checked><span>Tell them about the new time and send an updated calendar invite</span></label>
        ${UI.demo('No real emails or calendar invites are sent.')}
      </div></div>`;
    const read = (d) => {
      const scopeEl = d.querySelector('input[name="ev-scope"]:checked');
      const scope = scopeEl ? scopeEl.value : 'one';
      const startText = d.querySelector('#ev-start').value;
      const capText = d.querySelector('#ev-cap').value.trim();
      const cap = Number(capText);
      const targets = editTargets(e, sessionId, scope);
      const newTime = !!startText && startText !== found.start;
      const newCap = capText !== '' && Number.isInteger(cap) && cap !== found.capacity;
      const below = newCap ? targets.filter((x) => cap < Core.sessionTaken(S(), x.id)) : [];
      const rows = Core.affected(S(), targets.map((x) => x.id));
      return { scope, startText, capText, cap, targets, newTime, newCap, below, rows };
    };
    const sync = (d) => {
      const r = read(d), box = d.querySelector('#ev-edit-summary');
      const people = peopleIn(r.rows);
      let html = `Applies to ${esc(plural(r.targets.length, 'session'))}. `;
      html += people ? `<b>${esc(plural(people, 'person', 'people'))}</b> in ${esc(plural(r.rows.length, 'booking'))} ${people === 1 ? 'is' : 'are'} booked on ${r.targets.length === 1 ? 'it' : 'them'}.` : 'Nobody is booked yet.';
      if (r.below.length) {
        html += canOverride
          ? `<br><b>${esc(plural(r.below.length, 'session'))} already ${r.below.length === 1 ? 'has' : 'have'} more booked than this limit.</b> Nobody loses their place, but no more can be sold.`
          : `<br><b>The limit cannot go below the number already booked.</b>`;
      }
      box.innerHTML = html;
      d.querySelector('#ev-override-wrap').hidden = !(r.below.length && canOverride);
      d.querySelector('#ev-tell-wrap').hidden = !(r.newTime && r.rows.length);
    };
    const save = (d) => {
      if (!allowed('events.edit', e)) return false;
      const r = read(d), s = S(), now = App.now();
      if (r.capText === '' || !Number.isInteger(r.cap) || r.cap < 1) { UI.dialogError(d, 'The limit must be a whole number of 1 or more.'); return false; }
      if (!r.startText && found.start) { UI.dialogError(d, 'Choose a date and time.'); return false; }
      if (!r.newTime && !r.newCap) { UI.dialogError(d, 'Nothing has changed.'); return false; }
      const delta = r.newTime && found.start ? new Date(r.startText).getTime() - new Date(found.start).getTime() : 0;
      if (r.newTime) {
        const moved = found.start ? r.targets.filter((x) => x.start).map((x) => new Date(new Date(x.start).getTime() + delta)) : [new Date(r.startText)];
        if (moved.some((m) => m <= now)) { UI.dialogError(d, 'A session cannot be moved into the past.'); return false; }
      }
      const overrideReason = d.querySelector('#ev-override').value.trim();
      if (r.below.length) {
        if (!canOverride) { UI.dialogError(d, 'The limit cannot go below the number already booked. Ask a club manager.'); return false; }
        if (!overrideReason) { UI.dialogError(d, 'Going below the number booked needs a reason.'); return false; }
      }
      const tell = r.newTime && r.rows.length && d.querySelector('#ev-tell').checked;
      const oldText = sessionLabel(found);
      /* One session at a time, so past sessions stay as they are and an override can go below the number booked. */
      for (const x of r.targets) {
        const change = {};
        if (delta && x.start) change.deltaMs = delta;
        if (r.newCap && !r.below.includes(x)) change.capacity = r.cap;
        if (Object.keys(change).length) {
          const res = Core.applySessionEdit(s, e, x.id, change, 'one');
          if (!res.ok) { UI.dialogError(d, res.errors.join(' ')); return false; }
        }
        if (r.newCap && r.below.includes(x)) x.capacity = r.cap;
      }
      if (r.newTime && !found.start) found.start = r.startText;
      const parts = [];
      if (r.newTime) parts.push(`time changed from ${oldText} to ${sessionLabel(found)}`);
      if (r.newCap) parts.push(`limit set to ${r.cap}`);
      const scopeText = { one: 'this session only', following: 'this and following', all: 'all sessions' }[r.scope];
      App.log('Event', `${e.title}: ${parts.join(', ')} (${scopeText}, ${plural(r.targets.length, 'session')}).`);
      if (r.below.length) App.log('Override', `${e.title}: limit set to ${r.cap}, below the number booked on ${plural(r.below.length, 'session')}. Reason: ${overrideReason}`);
      if (tell) {
        r.rows.forEach((row) => {
          Core.klaviyo(s, { at: now, type: 'Booking changed', ref: row.booking.ref });
          Core.logBooking(row.booking, now, who(), `Told about the new time, ${sessionLabel(found)}, with an updated calendar invite (demo).`);
        });
        App.log('Event', `${e.title}: ${plural(r.rows.length, 'booking')} told about the new time, with an updated calendar invite (demo).`);
      } else if (r.newTime && r.rows.length) {
        r.rows.forEach((row) => Core.logBooking(row.booking, now, who(), `Session moved to ${sessionLabel(found)}. Customer not told.`));
      }
      App.save(); App.render();
      UI.toast(tell ? `Saved. ${plural(r.rows.length, 'booking')} told (demo).` : 'Saved.');
      return undefined;
    };
    UI.dialog({
      title: `Edit session: ${sessionLabel(found)}`, body,
      onOpen: (d) => {
        d.querySelectorAll('input').forEach((c) => { c.addEventListener('input', () => sync(d)); c.addEventListener('change', () => sync(d)); });
        sync(d);
      },
      actions: [{ label: 'Keep as it is', kind: 'ghost' }, { label: 'Save', kind: 'primary', onClick: (d) => save(d) }]
    });
  }

  /* ---------- Message attendees of one session (simulated) ---------- */
  /* Text in [square brackets] must be replaced before sending. */
  const MESSAGE_TEMPLATES = [
    { key: 'moved', label: 'Session moved', subject: 'New time for {event}',
      body: 'Hello,\n\nThe {event} session on {date} at {venue} has moved to [new date and time].\n\nYour place is safe. If the new time does not suit you, reply to this email and we will help.',
      note: 'This only sends a message. To change the time itself, use Edit on the session.' },
    { key: 'cancelled', label: 'Session cancelled', subject: '{event} on {date} is cancelled',
      body: 'Hello,\n\nWe are sorry, but the {event} session on {date} at {venue} is cancelled.\n\n[What happens next, such as a refund or another date.]',
      note: 'This only sends a message. It does not cancel the session or refund anyone. To do that, use Cancel on the session.' },
    { key: 'coach', label: 'Coach unavailable', subject: 'Coach update for {event} on {date}',
      body: 'Hello,\n\nThe coach for the {event} session on {date} at {venue} cannot be there.\n\n[What happens instead, such as a new coach.]',
      note: '' },
    { key: 'custom', label: 'Custom', subject: '', body: '', note: 'Use this for changes to the session only, not for offers. These go to everyone booked, whatever they chose about marketing.' }
  ];
  /* The lead booker of each booking, and any guest on this session with an email saved. */
  function messageRecipients(rows) {
    const emails = new Set();
    const add = (v) => { const t = String(v || '').trim().toLowerCase(); if (t) emails.add(t); };
    rows.forEach((r) => {
      add(r.booking.customer && r.booking.customer.email);
      r.tickets.forEach((t) => { const p = (r.booking.people || []).find((x) => x.id === t.personId); if (p) add(p.email); });
    });
    return emails.size;
  }
  function messageAttendees(e, sessionId) {
    if (!allowed('events.edit', e)) return;
    const x = e.sessions.find((y) => y.id === sessionId);
    if (!x) return;
    const rows = Core.affected(S(), [sessionId]), people = messageRecipients(rows), label = sessionLabel(x);
    const fill = (t) => t.replace(/\{event\}/g, () => e.title).replace(/\{date\}/g, () => label).replace(/\{venue\}/g, () => venueName(e.venueId));
    const count = rows.length
      ? `<b>${esc(plural(people, 'person', 'people'))}</b> in ${esc(plural(rows.length, 'booking'))} will get this message.`
      : 'Nobody is booked on this session, so there is nobody to message.';
    const body = `<div class="ev-form">
      <div class="ev-note" role="status">${count}</div>
      ${rows.length ? `<label class="field"><span>Template</span><select id="ev-msg-tpl">${UI.options(MESSAGE_TEMPLATES.map((t) => ({ value: t.key, label: t.label })), MESSAGE_TEMPLATES[0].key)}</select></label>
      <p class="hint" id="ev-msg-note"></p>
      <label class="field"><span>Subject</span><input type="text" id="ev-msg-subject" maxlength="150" autocomplete="off"></label>
      <label class="field"><span>Message</span><textarea id="ev-msg-body" rows="8"></textarea></label>
      ${UI.demo('No real emails are sent. A live system would send this to each person through Klaviyo.')}` : ''}</div>`;
    const send = (d) => {
      if (!allowed('events.edit', e)) return undefined;
      const subject = d.querySelector('#ev-msg-subject').value.trim(), text = d.querySelector('#ev-msg-body').value.trim();
      if (!subject || !text) { UI.dialogError(d, 'Add a subject and a message.'); return false; }
      if (/\[[^\]]*\]/.test(`${subject} ${text}`)) { UI.dialogError(d, 'Replace the words in [square brackets] first.'); return false; }
      const s = S(), now = App.now(), by = who();
      /* Read again, in case bookings changed while the dialog was open. */
      const current = Core.affected(s, [sessionId]), sent = messageRecipients(current);
      if (!current.length) { UI.dialogError(d, 'Nobody is booked on this session now.'); return false; }
      current.forEach((r) => {
        Core.klaviyo(s, { at: now, type: 'Attendee message', ref: r.booking.ref });
        Core.logBooking(r.booking, now, by, `Message to attendees of ${label}: "${subject}" (demo, not really sent).`);
      });
      App.log('Message', `${e.title}, ${label}: "${subject}" sent to ${plural(sent, 'person', 'people')} in ${plural(current.length, 'booking')} (demo).`);
      App.save(); App.render();
      UI.toast(`Message sent to ${plural(sent, 'person', 'people')} (demo).`);
      return undefined;
    };
    UI.dialog({
      title: 'Message attendees', subtitle: `${e.title}, ${label}`, wide: true, body,
      actions: rows.length ? [{ label: 'Cancel', kind: 'ghost' }, { label: `Send to ${plural(people, 'person', 'people')}`, kind: 'primary', onClick: (d) => send(d) }] : [{ label: 'Close', kind: 'ghost' }],
      onOpen: (d) => {
        const pick = d.querySelector('#ev-msg-tpl');
        if (!pick) return;
        const draw = () => {
          const t = MESSAGE_TEMPLATES.find((y) => y.key === pick.value);
          d.querySelector('#ev-msg-subject').value = fill(t.subject);
          d.querySelector('#ev-msg-body').value = fill(t.body);
          d.querySelector('#ev-msg-note').textContent = t.note;
          d.querySelector('#ev-msg-note').hidden = !t.note;
          UI.dialogError(d, '');
        };
        pick.addEventListener('change', draw);
        draw();
      }
    });
  }

  /* ---------- Waitlist ---------- */
  function offerState(w, now) {
    if (w.status !== 'Offered') return 'Waiting';
    return w.offerUntil && new Date(w.offerUntil) > now ? 'Offered' : 'Offer ended';
  }
  /* Sessions set to offer freed places on their own: the next people get offers while places are free. */
  function runAutoOffers(e) {
    const s = S(), now = App.now();
    let made = 0;
    e.sessions.forEach((x) => {
      if (!x.autoOffer || x.cancelled || e.cancelled || !isFuture(x, now)) return;
      const list = waitlistFor(x.id);
      let free = Core.placesLeft(s, x) - list.filter((w) => offerState(w, now) === 'Offered').length;
      list.filter((w) => offerState(w, now) === 'Waiting').forEach((w) => {
        if (free < 1) return;
        w.status = 'Offered';
        w.offerUntil = Core.toLocalISO(new Date(now.getTime() + s.settings.waitlistClaimHours * 3600000));
        w.autoOffered = true;
        free--; made++;
        App.log('Waitlist', `${e.title}, ${sessionLabel(x)}: ${w.name} offered a place automatically until ${UI.dateTime(w.offerUntil)} (demo).`);
      });
    });
    if (made) App.save();
    return made;
  }
  function openWaitlist(e, sessionId) {
    const found = e.sessions.find((x) => x.id === sessionId);
    if (!found) return;
    const canManage = () => App.can('events.edit') && Core.canSeeVenue(App.user(), e.venueId);
    let box = null;
    const draw = (focusSel) => {
      const s = S(), now = App.now(), list = waitlistFor(sessionId), hours = s.settings.waitlistClaimHours;
      const left = Core.placesLeft(s, found);
      const held = list.filter((w) => offerState(w, now) === 'Offered').length;
      const free = Math.max(0, left - held);
      const waiting = list.filter((w) => offerState(w, now) === 'Waiting');
      const started = !isFuture(found, now);
      let why = '';
      if (started) why = 'This session has started, so no more offers can be made.';
      else if (!waiting.length) why = 'Nobody is waiting.';
      else if (!free) why = held ? 'The free places are held by offers already made.' : 'No place is free yet. Offers can go out when a place opens.';
      const position = (w) => waiting.indexOf(w) + 1;
      const cols = [
        { label: 'Place', html: (w) => (position(w) ? esc(position(w)) : '<span class="muted">None</span>') },
        { label: 'Name', html: (w) => `${esc(w.name)}<br><span class="hint">${esc(w.email)}</span>` },
        { label: 'Joined', html: (w) => esc(UI.dateTime(w.joinedAt)) },
        { label: 'Status', html: (w) => {
          const st = offerState(w, now);
          if (st === 'Offered') return `${UI.badge('Offered', 'info')}<br><span class="hint">Until ${esc(UI.dateTime(w.offerUntil))}</span>`;
          return st === 'Offer ended' ? UI.badge('Offer ended', 'warn') : UI.badge('Waiting', 'quiet');
        } }
      ];
      if (canManage()) {
        cols.push({ label: 'Actions', html: (w) => {
          const st = offerState(w, now), name = esc(w.name), p = position(w), bits = [];
          if (st === 'Waiting') {
            bits.push(`<button type="button" class="btn btn-small" data-w="up" data-id="${esc(w.id)}" aria-label="Move ${name} up"${p === 1 ? ' disabled' : ''}>Up</button>`);
            bits.push(`<button type="button" class="btn btn-small" data-w="down" data-id="${esc(w.id)}" aria-label="Move ${name} down"${p === waiting.length ? ' disabled' : ''}>Down</button>`);
          } else {
            if (st === 'Offered') bits.push(`<button type="button" class="btn btn-small" data-w="claimed" data-id="${esc(w.id)}" aria-label="${name} took the place">Mark as booked</button>`);
            bits.push(`<button type="button" class="btn btn-small" data-w="requeue" data-id="${esc(w.id)}" aria-label="Put ${name} back in the queue">${st === 'Offered' ? 'Take back offer' : 'Back in queue'}</button>`);
          }
          bits.push(`<button type="button" class="btn btn-small" data-w="remove" data-id="${esc(w.id)}" aria-label="Remove ${name}">Remove</button>`);
          return `<div class="ev-actions">${bits.join('')}</div>`;
        } });
      }
      box.innerHTML = `<p>${esc(plural(left, 'space'))} left. ${held ? `${esc(plural(held, 'place'))} held by offers. ` : ''}${esc(plural(free, 'place'))} free to offer. An offer lasts ${esc(hours)} hours.</p>
        ${UI.table({ title: 'Waitlist', subtitle: 'People waiting for a place on this session, in order.' }, cols, list, { emptyText: 'Nobody is on the waitlist for this session.' })}
        ${canManage() ? `<label class="check ev-auto"><input type="checkbox" data-w-auto${found.autoOffer ? ' checked' : ''}> <span>Offer freed places automatically<span class="hint">When a place opens, the next person gets an offer without anyone pressing Notify.</span></span></label>` : ''}
        ${canManage() ? `<div class="ev-notify"><button type="button" class="btn btn-primary" data-w="notify"${why ? ' disabled' : ''}>Notify next person</button>${why ? `<p class="hint">${esc(why)}</p>` : ''}</div>
        ${UI.demo('No real email is sent. A live system would send the offer with a time-limited link. The place is held from other online buyers, but staff can still book it.')}` : ''}`;
      if (focusSel) { const first = focusSel.map((q) => box.querySelector(q)).find((b) => b && !b.disabled); (first || box).focus(); }
    };
    const act = (b) => {
      if (!allowed('events.edit', e)) return;
      const s = S(), now = App.now(), kind = b.dataset.w, list = waitlistFor(sessionId);
      const w = list.find((x) => x.id === b.dataset.id);
      let focus = ['[data-w="notify"]'];
      if (kind === 'up' || kind === 'down') {
        const queue = list.filter((x) => offerState(x, now) === 'Waiting');
        const other = queue[queue.indexOf(w) + (kind === 'up' ? -1 : 1)];
        if (!other) return;
        const a = s.waitlist.indexOf(w), c = s.waitlist.indexOf(other);
        s.waitlist[a] = other; s.waitlist[c] = w;
        App.log('Waitlist', `${e.title}, ${sessionLabel(found)}: ${w.name} moved ${kind}.`);
        focus = [`[data-w="${kind}"][data-id="${w.id}"]`, `[data-w="${kind === 'up' ? 'down' : 'up'}"][data-id="${w.id}"]`];
      } else if (kind === 'notify') {
        const left = Core.placesLeft(s, found), held = list.filter((x) => offerState(x, now) === 'Offered').length;
        const next = list.find((x) => offerState(x, now) === 'Waiting');
        if (!next || left - held < 1 || !isFuture(found, now)) { UI.toast('No place to offer.', 'bad'); return; }
        next.status = 'Offered';
        next.offerUntil = Core.toLocalISO(new Date(now.getTime() + s.settings.waitlistClaimHours * 3600000));
        App.log('Waitlist', `${e.title}, ${sessionLabel(found)}: ${next.name} offered a place until ${UI.dateTime(next.offerUntil)} (demo).`);
        UI.toast(`Offer sent to ${next.name} (demo).`);
      } else if (kind === 'claimed') {
        /* Counted in Reports as a place recovered from the waitlist. */
        w.status = 'Booked'; w.claimedAt = Core.toLocalISO(now);
        App.log('Waitlist', `${e.title}, ${sessionLabel(found)}: ${w.name} took the offered place.`);
        UI.toast(`${w.name} marked as booked. Add their booking from Bookings.`);
      } else if (kind === 'requeue') {
        w.status = 'Waiting'; w.offerUntil = '';
        App.log('Waitlist', `${e.title}, ${sessionLabel(found)}: ${w.name} put back in the queue.`);
      } else if (kind === 'remove') {
        w.status = 'Removed'; w.offerUntil = '';
        App.log('Waitlist', `${e.title}, ${sessionLabel(found)}: ${w.name} removed.`);
      }
      App.save(); App.render(); draw(focus);
    };
    UI.dialog({
      title: `Waitlist: ${sessionLabel(found)}`, wide: true, body: '<div class="ev-waitlist"></div>',
      actions: [{ label: 'Close', kind: 'ghost', onClick: () => {} }],
      onOpen: (d) => {
        box = d.querySelector('.ev-waitlist');
        box.tabIndex = -1;
        box.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-w]'); if (b) act(b); });
        box.addEventListener('change', (ev) => {
          if (!ev.target.matches('[data-w-auto]') || !allowed('events.edit', e)) return;
          found.autoOffer = ev.target.checked;
          App.log('Waitlist', `${e.title}, ${sessionLabel(found)}: automatic offers turned ${found.autoOffer ? 'on' : 'off'}.`);
          const made = found.autoOffer ? runAutoOffers(e) : 0;
          if (made) UI.toast(`${plural(made, 'offer')} sent (demo).`);
          App.save(); App.render(); draw(['[data-w-auto]']);
        });
        draw();
      }
    });
  }

  /* ---------- Route ---------- */
  function renderForm(main, id) {
    const e = id ? Core.findEvent(S(), id) : null;
    if (!App.can('events.edit') || (id && e && !Core.canSeeVenue(App.user(), e.venueId))) { main.innerHTML = UI.empty('Your role cannot do this.'); return; }
    if (id && !e) { main.innerHTML = UI.empty('We could not find this event.'); return; }
    if (e && e.cancelled) { main.innerHTML = UI.empty('This event is cancelled, so it cannot be edited.'); return; }
    if (!(window.EventForm && window.EventForm.render)) { main.innerHTML = UI.empty('The event form is not available yet.'); return; }
    /* The form opens in a modal over the list. */
    renderList(main);
    window.EventForm.render(App.modal({ title: e ? `Edit: ${e.title}` : 'New event', subtitle: !e && window.EventForm.isQuick && window.EventForm.isQuick(null) ? 'Fill in the basics to get it on sale. You can add more detail any time.' : 'Set up an event in six steps. You can save a draft at any point.', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/></svg>', back: '#/events' }), id);
  }
  App.route('events', {
    title: 'Events', perm: 'events.view',
    render(main, params) {
      const [first, second] = params;
      if (!first) renderList(main);
      else if (first === 'new') renderForm(main, null);
      else if (second === 'edit') renderForm(main, first);
      else renderDetail(main, first);
    }
  });
})();
