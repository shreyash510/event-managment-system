/* My club: what a club manager looks after at their own venues, without asking marketing.
   Team (reception staff), Venue details (address, contact, on-the-day notes) and Add-on stock.
   The marketing admin opens the same page and sees every venue. Everything here is logged. */
(function () {
  'use strict';
  const S = () => App.state;
  const esc = (v) => UI.esc(v);
  const clean = (v) => String(v === null || v === undefined ? '' : v).trim();
  const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();
  const TABS = [['team', 'Team'], ['venue', 'Venue details'], ['stock', 'Add-on stock']];
  let tab = 'team';

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

  /* ---------- Team ---------- */
  const team = () => S().users.filter((u) => u.role === 'reception' && Core.userVenueIds(u).some((id) => myVenueIds().includes(id)));
  function renderTeam(box) {
    const rows = team();
    box.innerHTML = head('Reception team', 'The people who work the desk and the door at your clubs. They see Today, Check-in and Bookings, and can give small refunds. Each person has their own sign-in, so the activity log shows who did what.',
      '<button type="button" class="btn btn-primary" data-act="staff-add">Add reception staff</button>') +
      UI.table({ subtitle: 'Reception staff and the clubs they work at.' }, [
        { label: 'Name', html: (u) => `<b>${esc(u.name)}</b>` },
        { label: 'Email', html: (u) => (u.email ? `<span>${esc(u.email)}</span>` : '<span class="muted">None</span>') },
        { label: 'Clubs', html: (u) => `<span>${esc(Core.userVenueIds(u).map(venueName).join(', ') || 'None')}</span>` },
        { label: 'Actions', html: (u) => `<div class="club-actions"><button type="button" class="btn btn-small" data-act="staff-edit" data-id="${esc(u.id)}" aria-label="Edit ${esc(u.name)}">Edit</button><button type="button" class="btn btn-small btn-ghost" data-act="staff-remove" data-id="${esc(u.id)}" aria-label="Remove ${esc(u.name)}">Remove</button></div>` }
      ], rows, { emptyText: 'No reception staff yet. Add the people who work your desk, so they do not share a login.' });
  }
  function staffDialog(user) {
    const s = S(), mine = myVenues();
    const startIds = user ? Core.userVenueIds(user).filter((id) => myVenueIds().includes(id)) : [App.venueId() && myVenueIds().includes(App.venueId()) ? App.venueId() : (mine[0] ? mine[0].id : '')];
    UI.dialog({
      title: user ? `Edit ${user.name}` : 'Add reception staff',
      subtitle: 'Reception works the desk and the door at the clubs you tick.',
      body: `<div class="club-dialog">${textField('club-u-name', 'Name', user ? user.name : '')}
        ${textField('club-u-email', 'Work email (optional)', user && user.email ? user.email : '')}
        <fieldset class="club-picks"><legend>Clubs</legend>${mine.map((v) => `<label class="check"><input type="checkbox" name="club-u-venue" value="${esc(v.id)}"${startIds.includes(v.id) ? ' checked' : ''}> <span>${esc(v.name)}</span></label>`).join('')}</fieldset>
        ${user ? '' : UI.demo('no sign-in invite is really sent.')}</div>`,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save', kind: 'primary', onClick: (d, close) => {
          if (!allowed()) return undefined;
          const name = clean(d.querySelector('#club-u-name').value), email = clean(d.querySelector('#club-u-email').value).toLowerCase();
          const ticked = [...d.querySelectorAll('input[name="club-u-venue"]:checked')].map((x) => x.value).filter((id) => myVenueIds().includes(id));
          if (!name) { UI.dialogError(d, 'Enter a name.'); return false; }
          if (s.users.some((u) => u !== user && same(u.name, name))) { UI.dialogError(d, 'There is already a user with this name. The activity log needs names to be different.'); return false; }
          if (!ticked.length) { UI.dialogError(d, 'Tick at least one club.'); return false; }
          if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { UI.dialogError(d, 'This email does not look right.'); return false; }
          /* Clubs this person works at that are not yours stay as they are. */
          const others = user ? Core.userVenueIds(user).filter((id) => !myVenueIds().includes(id)) : [];
          const venueIds = others.concat(ticked);
          const names = ticked.map(venueName).join(', ');
          if (user) {
            const oldName = user.name;
            Object.assign(user, { name, venueId: venueIds[0] || null, venueIds });
            if (email) user.email = email; else delete user.email;
            App.log('Access', `Reception staff edited: ${oldName === name ? name : `${oldName} is now ${name}`} (${names}).`);
          } else {
            s.users.push(Object.assign({ id: Core.nextId(s, 'u'), name, role: 'reception', venueId: venueIds[0] || null, venueIds }, email ? { email } : {}));
            App.log('Access', `Reception staff added: ${name} (${names}).`);
          }
          commit(close, 'Saved.');
          return undefined;
        }
      }]
    });
  }
  function staffRemove(user) {
    UI.dialog({
      title: `Remove ${user.name}?`,
      body: '<p>They will not be able to sign in to your clubs from now on. Their past actions stay in the activity log.</p>',
      actions: [{ label: 'Keep access', kind: 'ghost' }, {
        label: 'Remove access', kind: 'danger', onClick: (d, close) => {
          if (!allowed()) return undefined;
          if (user.id === S().currentUserId) { UI.dialogError(d, 'You are signed in as this user, so you cannot remove them.'); return false; }
          const others = Core.userVenueIds(user).filter((id) => !myVenueIds().includes(id));
          if (others.length) {
            /* They also work at a club that is not yours: only take your clubs away. */
            Object.assign(user, { venueId: others[0], venueIds: others });
            App.log('Access', `Reception staff moved off your clubs: ${user.name}.`);
          } else {
            S().users.splice(S().users.indexOf(user), 1);
            App.log('Access', `Reception staff removed: ${user.name}.`);
          }
          commit(close, 'Access removed.');
          return undefined;
        }
      }]
    });
  }

  /* ---------- Venue details ---------- */
  function renderVenue(box) {
    box.innerHTML = head('Venue details', 'The address and contact details shown on event pages and emails, and notes for staff on the day, such as where to park or how to open up.') +
      `<div class="club-venues">${myVenues().map((v) => `<section class="card club-venue">
        <div class="club-venue-top"><h3>${esc(v.name)}</h3><button type="button" class="btn btn-small" data-act="venue-edit" data-id="${esc(v.id)}" aria-label="Edit ${esc(v.name)}">Edit</button></div>
        <dl class="club-dl"><dt>Address</dt><dd>${esc(v.address || v.city || 'Not set')}</dd><dt>Contact</dt><dd>${esc(v.contact || 'Not set')}</dd><dt>Notes for staff</dt><dd>${v.notes ? esc(v.notes) : '<span class="muted">None</span>'}</dd></dl>
      </section>`).join('') || UI.empty('No clubs to show.')}</div>`;
  }
  function venueDialog(venue) {
    UI.dialog({
      title: `Edit ${venue.name}`,
      subtitle: 'The name is changed by marketing in Settings.',
      body: `<div class="club-dialog">${textField('club-v-address', 'Address', venue.address || venue.city || '')}${textField('club-v-contact', 'Contact details', venue.contact || '')}
        ${field('club-v-notes', 'Notes for staff', `<textarea id="club-v-notes" rows="4" aria-describedby="club-v-notes-hint">${esc(venue.notes || '')}</textarea>`, 'Only staff see these. Customers do not.')}</div>`,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save', kind: 'primary', onClick: (d, close) => {
          if (!allowed()) return undefined;
          if (!myVenueIds().includes(venue.id)) { UI.dialogError(d, 'This is not one of your clubs.'); return false; }
          const address = clean(d.querySelector('#club-v-address').value), contact = clean(d.querySelector('#club-v-contact').value), notes = clean(d.querySelector('#club-v-notes').value);
          if (!address) { UI.dialogError(d, 'Enter an address.'); return false; }
          Object.assign(venue, { address, contact, notes });
          App.log('Settings', `Venue details edited: ${venue.name}.`);
          commit(close, 'Venue saved.');
          return undefined;
        }
      }]
    });
  }

  /* ---------- Add-on stock ---------- */
  const addOns = () => S().addOns.filter((a) => myVenueIds().includes(a.venueId));
  function renderStock(box) {
    const s = S(), rows = addOns();
    box.innerHTML = head('Add-on stock', 'How many of each extra you have at your clubs, such as racket hire. Prices and new add-ons are set by marketing.') +
      UI.table({ subtitle: 'Each add-on with its stock, how many have sold and how many are left.' }, [
        { label: 'Add-on', html: (a) => `<b>${esc(a.name)}</b>` },
        { label: 'Club', html: (a) => `<span>${esc(venueName(a.venueId))}</span>` },
        { label: 'Price', html: (a) => `<span>${UI.money(a.price)}</span>` },
        { label: 'Stock', html: (a) => `<span>${a.stock === null || a.stock === undefined || a.stock === '' ? 'No limit' : esc(a.stock)}</span>` },
        { label: 'Sold', html: (a) => `<span>${Core.addOnSold(s, a.id)}</span>` },
        { label: 'Left', html: (a) => { const left = Core.addOnLeft(s, a); return left === null ? '<span>No limit</span>' : (left === 0 ? UI.badge('None left', 'bad') : `<span>${left}</span>`); } },
        { label: 'Actions', html: (a) => `<button type="button" class="btn btn-small" data-act="stock-edit" data-id="${esc(a.id)}" aria-label="Change stock of ${esc(a.name)}">Change stock</button>` }
      ], rows, { emptyText: 'No add-ons at your clubs yet. Marketing sets these up in Settings.' });
  }
  function stockDialog(addOn) {
    const s = S(), taken = Core.addOnSold(s, addOn.id);
    UI.dialog({
      title: `Stock of ${addOn.name}`,
      subtitle: `${venueName(addOn.venueId)}. ${taken} sold so far.`,
      body: `<div class="club-dialog">${field('club-s-stock', 'Stock (optional)', `<input id="club-s-stock" type="number" min="0" step="1" inputmode="numeric" value="${esc(addOn.stock === null || addOn.stock === undefined ? '' : addOn.stock)}" aria-describedby="club-s-stock-hint">`, 'Leave empty if there is no limit.')}</div>`,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save', kind: 'primary', onClick: (d, close) => {
          if (!allowed()) return undefined;
          if (!myVenueIds().includes(addOn.venueId)) { UI.dialogError(d, 'This add-on is not at one of your clubs.'); return false; }
          const text = clean(d.querySelector('#club-s-stock').value);
          let stock = null;
          if (text !== '') {
            stock = Number(text);
            if (!Number.isInteger(stock) || stock < 0) { UI.dialogError(d, 'Stock must be a whole number, or empty for no limit.'); return false; }
            if (stock < taken) { UI.dialogError(d, `${taken} have already been sold, so stock cannot be below ${taken}.`); return false; }
          }
          const before = addOn.stock === null || addOn.stock === undefined ? 'no limit' : addOn.stock;
          addOn.stock = stock;
          App.log('Settings', `Add-on stock changed: ${addOn.name} at ${venueName(addOn.venueId)} from ${before} to ${stock === null ? 'no limit' : stock}.`);
          commit(close, 'Stock saved.');
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
      if (!TABS.some((t) => t[0] === tab)) tab = 'team';
      const names = myVenues().map((v) => v.name).join(', ');
      main.innerHTML = `<div class="club-screen">${UI.pageHead('My club', '', names ? `Look after ${names}: your team, venue details and add-on stock.` : 'Your team, venue details and add-on stock.', false)}
        <div id="club-tabs"></div><div id="club-panel"></div></div>`;
      const panel = main.querySelector('#club-panel');
      const draw = () => {
        main.querySelector('#club-tabs').innerHTML = UI.tabs(TABS.map(([key, label]) => ({ key, label, on: key === tab })), { attr: 'data-club-tab', label: 'My club sections' });
        if (tab === 'team') renderTeam(panel); else if (tab === 'venue') renderVenue(panel); else renderStock(panel);
      };
      draw();
      main.querySelector('.club-screen').addEventListener('click', (ev) => {
        const t = ev.target.closest('[data-club-tab]');
        if (t) { tab = t.dataset.clubTab; draw(); const again = main.querySelector(`[data-club-tab="${tab}"]`); if (again) again.focus({ preventScroll: true }); return; }
        const btn = ev.target.closest('button[data-act]');
        if (!btn) return;
        const id = btn.dataset.id;
        switch (btn.dataset.act) {
          case 'staff-add': staffDialog(null); break;
          case 'staff-edit': { const u = team().find((x) => x.id === id); if (u) staffDialog(u); break; }
          case 'staff-remove': { const u = team().find((x) => x.id === id); if (u) staffRemove(u); break; }
          case 'venue-edit': { const v = myVenues().find((x) => x.id === id); if (v) venueDialog(v); break; }
          case 'stock-edit': { const a = addOns().find((x) => x.id === id); if (a) stockDialog(a); break; }
          default: break;
        }
      });
    }
  });
})();
