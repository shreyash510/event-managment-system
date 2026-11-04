/* My club: what a club manager looks after at their own venues, without asking marketing.
   Venue details: address, contact and on-the-day notes.
   The marketing admin opens the same page and sees every venue. Everything here is logged. */
(function () {
  'use strict';
  const S = () => App.state;
  const esc = (v) => UI.esc(v);
  const clean = (v) => String(v === null || v === undefined ? '' : v).trim();

  /* The venues this person can look after: all of them for marketing, their own for a club manager. */
  const myVenues = () => S().venues.filter((v) => Core.canSeeVenue(App.user(), v.id));
  const myVenueIds = () => myVenues().map((v) => v.id);
  const venueName = (id) => { const v = Core.findVenue(S(), id); return v ? v.name : 'Unknown venue'; };
  const allowed = () => {
    if (App.can('club.manage')) return true;
    UI.toast('Your role cannot change club details.', 'bad');
    return false;
  };
  /* Close first so the browser does not try to return focus to a button that is about to be redrawn. */
  const commit = (close, message) => {
    if (close) close();
    App.save();
    App.render();
    const main = document.getElementById('main');
    if (main) main.focus({ preventScroll: true });
    if (message) UI.toast(message);
  };
  const field = (id, label, control, hint) => `<div class="field"><span><label for="${id}">${esc(label)}</label></span>${control}${hint ? `<p class="hint" id="${id}-hint">${esc(hint)}</p>` : ''}</div>`;
  const textField = (id, label, value, hint) => field(id, label, `<input id="${id}" type="text" value="${esc(value)}"${hint ? ` aria-describedby="${id}-hint"` : ''}>`, hint);
  const orNone = (text, word) => (text ? esc(text) : `<span class="muted">${esc(word)}</span>`);
  const addressOf = (v) => v.address || v.city || '';
  const detailLink = (v) => `#/club/${encodeURIComponent(v.id)}`;
  const STATUS_TONE = { 'On sale': 'good', 'Sold out': 'warn', 'Sales closed': 'warn', 'Pending approval': 'warn', Scheduled: 'info', Draft: 'quiet', Completed: 'quiet', Cancelled: 'bad' };

  /* The numbers for one club, worked out once for the table and the details page. */
  function clubFacts(v) {
    const s = S(), now = App.now();
    const events = s.events.filter((e) => e.venueId === v.id).map((e) => {
      const upcoming = Core.remainingSessions(e, now);
      return { e, status: Core.eventStatus(s, e, now), upcoming, next: upcoming[0] || null, booked: upcoming.reduce((n, x) => n + Core.sessionTaken(s, x.id), 0) };
    });
    return {
      events,
      onSale: events.filter((x) => x.status === 'On sale').length,
      sessions: events.reduce((n, x) => n + (x.status === 'Cancelled' ? 0 : x.upcoming.length), 0),
      booked: events.reduce((n, x) => n + (x.status === 'Cancelled' ? 0 : x.booked), 0),
      managers: s.users.filter((u) => u.role === 'manager' && Core.userVenueIds(u).includes(v.id))
    };
  }

  /* ---------- All clubs ---------- */
  function renderList(main) {
    /* The venue picker narrows this list, like every other list. */
    const inView = App.venueId();
    const rows = myVenues().filter((v) => !inView || v.id === inView).map((v) => ({ v, f: clubFacts(v) }));
    const names = rows.map((r) => r.v.name).join(', ');
    const add = App.can('venues.manage') ? '<button type="button" class="btn btn-primary" data-act="venue-add">Add a venue</button>' : '';
    main.innerHTML = `<div class="club-screen">${UI.pageHead('My club', add, names ? `Look after the details of ${names}.` : 'Your venue details.', false)}
      ${UI.table({ title: 'Clubs', subtitle: 'Select a club to see its details and events.' }, [
        { label: 'Club', html: (r) => `<a href="${detailLink(r.v)}"><b>${esc(r.v.name)}</b></a>` },
        { label: 'Address', html: (r) => orNone(addressOf(r.v), 'Not set') },
        { label: 'Contact', html: (r) => orNone(r.v.contact, 'Not set') },
        { label: 'Club managers', html: (r) => (r.f.managers.length ? esc(r.f.managers.map((u) => u.name).join(', ')) : '<span class="muted">None</span>') },
        { label: 'Events on sale', html: (r) => String(r.f.onSale) },
        { label: 'Upcoming sessions', html: (r) => String(r.f.sessions) },
        { label: 'Actions', html: (r) => `<a class="btn" href="${detailLink(r.v)}">View details</a><button type="button" class="btn" data-act="venue-edit" data-id="${esc(r.v.id)}">Edit</button>` }
      ], rows, { emptyText: 'No clubs to show.' })}</div>`;
  }

  /* ---------- One club ---------- */
  function renderDetail(main, id) {
    const v = myVenues().find((x) => x.id === id);
    if (!v) { main.innerHTML = `<div class="club-screen">${UI.empty('This club is not available to you.')}<p><a href="#/club">Back to My club</a></p></div>`; return; }
    const f = clubFacts(v);
    const stat = (i, icon, value, label, note) => `<div class="stat">${UI.statIcon(icon, UI.statTone(i))}<b>${esc(value)}</b><span>${esc(label)}</span><small>${esc(note)}</small></div>`;
    /* Events still to come first, soonest at the top. */
    const events = f.events.slice().sort((a, b) => (a.next ? 0 : 1) - (b.next ? 0 : 1) || (a.next && b.next ? a.next.start.localeCompare(b.next.start) : a.e.title.localeCompare(b.e.title)));
    main.innerHTML = `<div class="club-screen">${UI.pageHead(v.name, `<button type="button" class="btn btn-primary" data-act="venue-edit" data-id="${esc(v.id)}">Edit</button>`, 'This club\'s details, the people who look after it and its events.', '#/club')}
      <div class="grid stats">
        ${stat(0, 'ticket', f.events.length, 'Events', 'All events at this club')}
        ${stat(1, 'check', f.onSale, 'Events on sale', 'Customers can book now')}
        ${stat(2, 'calendar', f.sessions, 'Upcoming sessions', 'Not yet started')}
        ${stat(3, 'users', f.booked, 'Places booked', 'On upcoming sessions')}
      </div>
      <div class="card"><h2>Details</h2><dl class="club-dl">
        <dt>Address</dt><dd>${orNone(addressOf(v), 'Not set')}</dd>
        <dt>Contact</dt><dd>${orNone(v.contact, 'Not set')}</dd>
        <dt>Club managers</dt><dd>${f.managers.length ? esc(f.managers.map((u) => u.name).join(', ')) : '<span class="muted">None</span>'}</dd>
        <dt>Notes for staff</dt><dd>${orNone(v.notes, 'None')}</dd>
      </dl></div>
      ${UI.table({ title: 'Events at this club', subtitle: 'Select an event to open it.' }, [
        { label: 'Event', html: (r) => `<a href="#/events/${encodeURIComponent(r.e.id)}"><b>${esc(r.e.title)}</b></a>` },
        { label: 'Status', html: (r) => UI.badge(r.status, STATUS_TONE[r.status] || 'quiet') },
        { label: 'Next session', html: (r) => (r.next ? esc(UI.dateTime(r.next.start)) : '<span class="muted">None</span>') },
        { label: 'Upcoming sessions', html: (r) => String(r.upcoming.length) },
        { label: 'Places booked', html: (r) => String(r.booked) }
      ], events, { emptyText: 'No events at this club yet.' })}</div>`;
  }
  /* The marketing admin adds venues and changes names. A club manager edits the details of their own venues. */
  function venueDialog(venue) {
    const canName = App.can('venues.manage');
    if (!venue && !canName) { UI.toast('Only the marketing admin can add a venue.', 'bad'); return; }
    UI.dialog({
      title: venue ? `Edit ${venue.name}` : 'Add a venue',
      subtitle: canName ? 'The name, address and contact details show on event pages and emails.' : 'The marketing admin can change the name.',
      body: `<div class="club-dialog">${canName ? textField('club-v-name', 'Name', venue ? venue.name : '') : ''}${textField('club-v-address', 'Address', venue ? (venue.address || venue.city || '') : '')}${textField('club-v-contact', 'Contact details', venue ? (venue.contact || '') : '', 'For example, a phone number or email.')}
        ${field('club-v-notes', 'Notes for staff', `<textarea id="club-v-notes" rows="4" aria-describedby="club-v-notes-hint">${esc(venue ? (venue.notes || '') : '')}</textarea>`, 'Only staff see these. Customers do not.')}${venue ? '' : '<p class="hint">Club managers do not get a new venue on their own. Tick it for them on the Users page.</p>'}</div>`,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save', kind: 'primary', onClick: (d, close) => {
          if (!allowed()) return undefined;
          if (venue && !myVenueIds().includes(venue.id)) { UI.dialogError(d, 'This is not one of your clubs.'); return false; }
          const name = canName ? clean(d.querySelector('#club-v-name').value) : venue.name;
          const address = clean(d.querySelector('#club-v-address').value), contact = clean(d.querySelector('#club-v-contact').value), notes = clean(d.querySelector('#club-v-notes').value);
          if (!name) { UI.dialogError(d, 'Enter a name.'); return false; }
          if (!address) { UI.dialogError(d, 'Enter an address.'); return false; }
          if (S().venues.some((v) => v !== venue && v.name.toLowerCase() === name.toLowerCase())) { UI.dialogError(d, 'There is already a venue with this name.'); return false; }
          if (venue && name === venue.name && address === clean(venue.address || venue.city) && contact === clean(venue.contact) && notes === clean(venue.notes)) { UI.toast('Nothing has changed.'); return undefined; }
          if (venue) {
            const oldName = venue.name;
            Object.assign(venue, { name, address, contact, notes });
            App.log('Settings', oldName === name ? `Venue edited: ${name}.` : `Venue edited: ${oldName} is now ${name}.`);
          } else {
            S().venues.push({ id: Core.nextId(S(), 'v'), name, city: '', address, contact, notes });
            App.log('Settings', `Venue added: ${name}.`);
          }
          commit(close, 'Venue saved.');
          return undefined;
        }
      }]
    });
  }

  /* ---------- Route ---------- */
  App.route('club', {
    title: 'My club',
    perm: 'club.manage',
    render(main, params) {
      if (!App.can('club.manage')) { main.innerHTML = UI.empty('Your role does not have access to this area.'); return; }
      if (params && params[0]) renderDetail(main, params[0]); else renderList(main);
      main.querySelector('.club-screen').addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-act]');
        if (!btn) return;
        const id = btn.dataset.id;
        switch (btn.dataset.act) {
          case 'venue-add': venueDialog(null); break;
          case 'venue-edit': { const v = myVenues().find((x) => x.id === id); if (v) venueDialog(v); break; }
          default: break;
        }
      });
    }
  });
})();
