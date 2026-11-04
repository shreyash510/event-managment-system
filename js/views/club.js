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
  const head = (title, subtitle, actionHtml) => `<div class="club-head"><div><h2>${esc(title)}</h2>${subtitle ? `<p class="muted">${esc(subtitle)}</p>` : ''}</div>${actionHtml || ''}</div>`;

  /* ---------- Venue details ---------- */
  function renderVenue(box) {
    box.innerHTML = head('Venue details', 'The address and contact details shown on event pages and emails, and notes for staff on the day, such as where to park or how to open up.', App.can('venues.manage') ? '<button type="button" class="btn btn-primary" data-act="venue-add">Add a venue</button>' : '') +
      `<div class="club-venues">${myVenues().map((v) => `<section class="card club-venue">
        <div class="club-venue-top"><h3>${esc(v.name)}</h3><button type="button" class="btn btn-small" data-act="venue-edit" data-id="${esc(v.id)}" aria-label="Edit ${esc(v.name)}">Edit</button></div>
        <dl class="club-dl"><dt>Address</dt><dd>${esc(v.address || v.city || 'Not set')}</dd><dt>Contact</dt><dd>${esc(v.contact || 'Not set')}</dd><dt>Notes for staff</dt><dd>${v.notes ? esc(v.notes) : '<span class="muted">None</span>'}</dd></dl>
      </section>`).join('') || UI.empty('No clubs to show.')}</div>`;
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
    render(main) {
      if (!App.can('club.manage')) { main.innerHTML = UI.empty('Your role does not have access to this area.'); return; }
      const names = myVenues().map((v) => v.name).join(', ');
      main.innerHTML = `<div class="club-screen">${UI.pageHead('My club', '', names ? `Look after the details of ${names}.` : 'Your venue details.', false)}
        <div id="club-panel"></div></div>`;
      renderVenue(main.querySelector('#club-panel'));
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
