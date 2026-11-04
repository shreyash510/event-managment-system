/* Settings in four groups: Setup (venues, users, event types, add-ons), Rules (policies), Messages (emails, Klaviyo), Activity. Marketing admin only. */
(function () {
  'use strict';
  const TAB_ICONS = {"setup":"<path d=\"M4 7h10M18 7h2M4 17h2M10 17h10\"/><circle cx=\"16\" cy=\"7\" r=\"2\"/><circle cx=\"8\" cy=\"17\" r=\"2\"/>","rules":"<path d=\"M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z\"/><path d=\"M9 12l2 2 4-4\"/>","messages":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M3 7l9 6 9-6\"/>","venues":"<path d=\"M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z\"/><circle cx=\"12\" cy=\"10\" r=\"2.5\"/>","event-types":"<path d=\"M3 12V4h8l10 10-8 8z\"/><circle cx=\"7.5\" cy=\"8.5\" r=\"1\"/>","users":"<circle cx=\"9\" cy=\"8\" r=\"3.2\"/><path d=\"M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14c2 .7 3.5 2.7 3.5 6\"/>","add-ons":"<path d=\"M12 5v14M5 12h14\"/>","policies":"<path d=\"M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z\"/><path d=\"M9 12l2 2 4-4\"/>","emails":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M3 7l9 6 9-6\"/>","klaviyo":"<path d=\"M13 3L5 14h6l-1 7 8-11h-6z\"/>","activity":"<path d=\"M3 12h4l3-8 4 16 3-8h4\"/>"};
  const TABS = [
    { key: 'venues', label: 'Venues', render: renderVenues },
    { key: 'event-types', label: 'Event types', render: renderTypes },
    { key: 'users', label: 'Users and roles', render: renderUsers },
    { key: 'add-ons', label: 'Add-ons', render: renderAddOns },
    { key: 'policies', label: 'Default policies', render: renderPolicies },
    { key: 'emails', label: 'Email templates', render: renderEmails },
    { key: 'klaviyo', label: 'Klaviyo', render: renderKlaviyo },
    { key: 'activity', label: 'Activity log', render: renderActivity }
  ];
  /* Four groups on the page. Each section keeps its own key, so old links such as #/settings/venues still open it. */
  const GROUPS = [
    { key: 'setup', label: 'Setup', sections: ['venues', 'users', 'event-types', 'add-ons'] },
    { key: 'rules', label: 'Rules', sections: ['policies'] },
    { key: 'messages', label: 'Messages', sections: ['emails', 'klaviyo'] },
    { key: 'activity', label: 'Activity', sections: ['activity'] }
  ];
  const sectionHref = (g, key) => (g.sections.length > 1 ? `#/settings/${g.key}/${key}` : `#/settings/${g.key}`);
  /* params: [group, section], or the old [section]. */
  function pickSection(params) {
    const first = params[0] || GROUPS[0].key;
    let group = GROUPS.find((g) => g.key === first) || GROUPS.find((g) => g.sections.includes(first));
    if (!group) return null;
    const want = group.key === first ? params[1] : first;
    const key = group.sections.includes(want) ? want : group.sections[0];
    return { group, tab: TABS.find((t) => t.key === key) };
  }
  /* The document gives 10 minutes as the example. Used until the setting has been saved once. */
  const HOLD_DEFAULT = 10;
  const PLACEHOLDERS = [
    { key: 'first_name', means: 'The first name of the person', sample: () => 'Alex' },
    { key: 'event', means: 'The event title', sample: () => 'Sample Pilates Class' },
    { key: 'venue', means: 'The venue name', sample: () => 'Sample Club' },
    { key: 'date', means: 'The session date and time', sample: () => UI.dateTime(Core.addDays(Core.toLocalISO(App.now()), 7)) },
    { key: 'ref', means: 'The booking reference', sample: () => 'BK-0000' },
    { key: 'link', means: 'A link for the person to use', sample: () => 'https://example.com/sample-link' },
    { key: 'amount', means: 'The refund amount', sample: () => UI.money(12) },
    { key: 'hours', means: 'How long a waitlist place is held', sample: () => String(App.state.settings.waitlistClaimHours) }
  ];
  const TRIGGERS = [
    ['Booking confirmed', 'Person, event, venue, session dates, ticket type, member or guest, amount.', 'Segments and reminders'],
    ['Guest details added', 'Guest profile and session, with their own consent status.', 'Booking messages, and marketing if opted in'],
    ['Session coming up', 'Person, session, venue, time.', 'Optional reminder'],
    ['Checked in', 'Person and session.', 'Post-event follow-up, and leaving out no-shows'],
    ['Booking changed or cancelled', 'Person, what changed.', 'Stopping out-of-date reminders']
  ];
  const logFilter = { type: '', q: '' };

  const state = () => App.state;
  const clean = (v) => String(v === null || v === undefined ? '' : v).trim();
  const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();
  const val = (root, sel) => clean(root.querySelector(sel).value);
  /* Roles are checked again before every change, not only when drawing the page. */
  function allowed() {
    if (App.can('settings')) return true;
    UI.toast('Your role cannot change settings.', 'bad');
    return false;
  }
  /* Close first so the browser does not try to return focus to a button that is about to be redrawn. */
  function commit(close, message) {
    if (close) close();
    App.save();
    App.render();
    const main = document.getElementById('main');
    if (main) main.focus({ preventScroll: true });
    if (message) UI.toast(message);
  }
  const head = (title, subtitle, actionHtml) => `<div class="set-head"><div><h2>${UI.esc(title)}</h2>${subtitle ? `<p class="muted">${UI.esc(subtitle)}</p>` : ''}</div>${actionHtml || ''}</div>`;
  const field = (id, label, control, hint) => `<div class="field"><span><label for="${id}">${UI.esc(label)}</label></span>${control}${hint ? `<p class="hint" id="${id}-hint">${UI.esc(hint)}</p>` : ''}</div>`;
  const textField = (id, label, value, hint) => field(id, label, `<input id="${id}" type="text" value="${UI.esc(value)}"${hint ? ` aria-describedby="${id}-hint"` : ''}>`, hint);
  const numberField = (id, label, value, hint, step) => field(id, label, `<input id="${id}" type="number" inputmode="decimal" min="0" step="${step || 1}" value="${UI.esc(value)}"${hint ? ` aria-describedby="${id}-hint"` : ''}>`, hint);
  const viewNote = () => {
    const v = App.venueId() ? Core.findVenue(state(), App.venueId()) : null;
    return v ? `Showing ${v.name}, the venue chosen at the top of the page.` : 'Showing all venues.';
  };

  /* ---------- Venues ---------- */
  function renderVenues(box) {
    const s = state();
    box.innerHTML = head('Venues', 'Name, address and contact details used on event pages and emails.', '<button type="button" class="btn btn-primary" data-act="venue-add">Add a venue</button>') +
      UI.table({ subtitle: 'Each venue with its address and contact details.' }, [
        { label: 'Name', html: (v) => `<b>${UI.esc(v.name)}</b>` },
        { label: 'Address', html: (v) => `<span>${UI.esc(v.address || v.city || 'Not set')}</span>` },
        { label: 'Contact details', html: (v) => `<span>${UI.esc(v.contact || 'Not set')}</span>` },
        { label: 'Actions', html: (v) => `<button type="button" class="btn btn-small" data-act="venue-edit" data-id="${UI.esc(v.id)}" aria-label="Edit ${UI.esc(v.name)}">Edit</button>` }
      ], s.venues, { emptyText: 'No venues yet.' });
  }
  function venueDialog(venue) {
    const s = state();
    UI.dialog({
      title: venue ? `Edit ${venue.name}` : 'Add a venue',
      body: `<div class="set-dialog">${textField('set-v-name', 'Name', venue ? venue.name : '')}${textField('set-v-address', 'Address', venue ? (venue.address || venue.city || '') : '')}${textField('set-v-contact', 'Contact details', venue ? (venue.contact || '') : '', 'For example, a phone number or an email address. Optional.')}</div>`,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save', kind: 'primary', onClick: (d, close) => {
          if (!allowed()) return undefined;
          const name = val(d, '#set-v-name'), address = val(d, '#set-v-address'), contact = val(d, '#set-v-contact');
          if (!name) { UI.dialogError(d, 'Enter a name.'); return false; }
          if (!address) { UI.dialogError(d, 'Enter an address.'); return false; }
          if (s.venues.some((v) => v !== venue && same(v.name, name))) { UI.dialogError(d, 'There is already a venue with this name.'); return false; }
          if (venue) {
            const oldName = venue.name;
            Object.assign(venue, { name, address, contact });
            App.log('Settings', oldName === name ? `Venue edited: ${name}.` : `Venue edited: ${oldName} is now ${name}.`);
          } else {
            s.venues.push({ id: Core.nextId(s, 'v'), name, city: '', address, contact });
            App.log('Settings', `Venue added: ${name}.`);
          }
          commit(close, 'Venue saved.');
          return undefined;
        }
      }]
    });
  }

  /* ---------- Event types ---------- */
  const typeUse = (id) => ({
    events: state().events.filter((e) => e.typeId === id).length,
    codes: state().codes.filter((c) => (c.typeIds || []).includes(id)).length
  });
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  function renderTypes(box) {
    box.innerHTML = head('Event types', 'The list used for filters, reports and code limits, and the defaults a new event starts with. A type that is in use cannot be removed.', '<button type="button" class="btn btn-primary" data-act="type-add">Add a type</button>') +
      UI.table({ subtitle: 'Each event type and how many events and codes use it.' }, [
        { label: 'Name', html: (t) => `<b>${UI.esc(t.name)}</b>` },
        { label: 'Defaults for new events', html: (t) => `<span>${UI.esc(templateText(t))}</span>` },
        { label: 'Used by', html: (t) => { const u = typeUse(t.id); return `<span>${plural(u.events, 'event')}, ${plural(u.codes, 'code')}</span>`; } },
        { label: 'Actions', html: (t) => { const u = typeUse(t.id); return `<div class="set-actions"><button type="button" class="btn btn-small" data-act="type-edit" data-id="${UI.esc(t.id)}" aria-label="Edit ${UI.esc(t.name)}">Edit</button>${u.events + u.codes ? '<span class="hint">In use, so it cannot be removed</span>' : `<button type="button" class="btn btn-small" data-act="type-remove" data-id="${UI.esc(t.id)}" aria-label="Remove ${UI.esc(t.name)}">Remove</button>`}</div>`; } }
      ], state().eventTypes, { emptyText: 'No event types yet.' });
  }
  /* What a new event of this type starts with. Staff can change any of it on the event itself. */
  const GUEST_DETAILS = [
    { value: 'lead', label: 'Booker only' },
    { value: 'name', label: 'Name for each guest' },
    { value: 'nameEmail', label: 'Name and email for each guest' }
  ];
  const Q_TYPES = [{ value: 'text', label: 'Text' }, { value: 'choice', label: 'Single choice' }, { value: 'tick', label: 'Tick box' }];
  const Q_SCOPES = [{ value: 'booking', label: 'Once per booking' }, { value: 'guest', label: 'For each guest' }];
  const templateText = (t) => {
    const x = t.template || Core.defaultTemplate();
    return `${UI.money(x.price)} · ${x.capacity} places · ${x.durationMin} min · ${labelOf(GUEST_DETAILS, x.guestDetails)}${x.questions.length ? ` · ${plural(x.questions.length, 'question')}` : ''}`;
  };
  function questionRowsHtml(list) {
    if (!list.length) return '<p class="hint">No questions. New events of this type ask none until staff add some.</p>';
    return `<ol class="set-q-list">${list.map((q, i) => `<li class="set-q">
      <div class="set-q-head"><b>Question ${i + 1}</b><button type="button" class="btn btn-ghost btn-small" data-q-rm="${i}" aria-label="Remove question ${i + 1}">Remove</button></div>
      ${field(`set-q-${i}-label`, 'Question', `<input id="set-q-${i}-label" type="text" data-q="${i}" data-k="label" maxlength="160" value="${UI.esc(q.label)}">`)}
      <div class="set-form-grid">
        ${field(`set-q-${i}-type`, 'Answer type', `<select id="set-q-${i}-type" data-q="${i}" data-k="type">${UI.options(Q_TYPES, q.type)}</select>`)}
        ${field(`set-q-${i}-scope`, 'Asked', `<select id="set-q-${i}-scope" data-q="${i}" data-k="scope">${UI.options(Q_SCOPES, q.scope)}</select>`)}
      </div>
      ${q.type === 'choice' ? field(`set-q-${i}-options`, 'Choices, separated by commas', `<input id="set-q-${i}-options" type="text" data-q="${i}" data-k="options" value="${UI.esc((q.options || []).join(', '))}">`) : ''}
      <label class="check"><input type="checkbox" data-q="${i}" data-k="required"${q.required ? ' checked' : ''}> <span>Required</span></label>
    </li>`).join('')}</ol>`;
  }
  function typeDialog(type) {
    const s = state();
    const tpl = JSON.parse(JSON.stringify((type && type.template) || Core.defaultTemplate()));
    if (!Array.isArray(tpl.questions)) tpl.questions = [];
    UI.dialog({
      title: type ? `Edit ${type.name}` : 'Add an event type', wide: true,
      subtitle: 'New events of this type start with these defaults, so a normal event takes a minute to set up.',
      body: `<div class="set-dialog">${textField('set-t-name', 'Name', type ? type.name : '')}
        <h3 class="set-sub">Defaults for new events</h3>
        <div class="set-form-grid">
          ${numberField('set-t-price', 'Standard price (£)', tpl.price, '', '0.01')}
          ${numberField('set-t-capacity', 'Places per session', tpl.capacity)}
          ${numberField('set-t-duration', 'Session length (minutes)', tpl.durationMin, '', '5')}
          ${numberField('set-t-max', 'Tickets per booking', tpl.maxPerBooking)}
          ${field('set-t-guests', 'Details for each guest', `<select id="set-t-guests">${UI.options(GUEST_DETAILS, tpl.guestDetails)}</select>`)}
        </div>
        <h3 class="set-sub">Questions to ask</h3>
        <div id="set-t-questions">${questionRowsHtml(tpl.questions)}</div>
        <button type="button" class="btn" data-q-add>Add a question</button></div>`,
      onOpen: (d) => {
        const box = d.querySelector('#set-t-questions');
        const redraw = (focusSel) => { box.innerHTML = questionRowsHtml(tpl.questions); const f = focusSel && d.querySelector(focusSel); if (f) f.focus(); };
        const read = (el) => {
          const q = tpl.questions[Number(el.dataset.q)];
          if (!q) return;
          if (el.dataset.k === 'required') q.required = el.checked;
          else if (el.dataset.k === 'options') q.options = el.value.split(',').map((x) => x.trim()).filter(Boolean);
          else q[el.dataset.k] = el.value;
        };
        d.addEventListener('input', (e) => { if (e.target.dataset && e.target.dataset.q !== undefined) read(e.target); });
        d.addEventListener('change', (e) => {
          if (!e.target.dataset || e.target.dataset.q === undefined) return;
          read(e.target);
          if (e.target.dataset.k === 'type') redraw(`#set-q-${e.target.dataset.q}-type`);
        });
        d.addEventListener('click', (e) => {
          if (e.target.closest('[data-q-add]')) { tpl.questions.push({ label: '', type: 'text', required: false, scope: 'booking', options: [] }); redraw(`#set-q-${tpl.questions.length - 1}-label`); }
          const rm = e.target.closest('[data-q-rm]');
          if (rm) { tpl.questions.splice(Number(rm.dataset.qRm), 1); redraw('[data-q-add]'); }
        });
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save', kind: 'primary', onClick: (d, close) => {
          if (!allowed()) return undefined;
          const name = val(d, '#set-t-name');
          if (!name) { UI.dialogError(d, 'Enter a name.'); return false; }
          if (s.eventTypes.some((t) => t !== type && same(t.name, name))) { UI.dialogError(d, 'There is already a type with this name.'); return false; }
          const num = (sel, label, whole, min) => {
            const text = val(d, sel), n = Number(text);
            if (text === '' || !Number.isFinite(n) || n < min || (whole && !Number.isInteger(n))) { UI.dialogError(d, `${label} must be ${whole ? 'a whole number' : 'a number'} of ${min} or more.`); d.querySelector(sel).focus(); return null; }
            return whole ? n : Core.round2(n);
          };
          const price = num('#set-t-price', 'The standard price', false, 0); if (price === null) return false;
          const capacity = num('#set-t-capacity', 'Places per session', true, 1); if (capacity === null) return false;
          const durationMin = num('#set-t-duration', 'Session length', true, 5); if (durationMin === null) return false;
          const maxPerBooking = num('#set-t-max', 'Tickets per booking', true, 1); if (maxPerBooking === null) return false;
          const questions = tpl.questions.map((q) => ({ label: String(q.label || '').trim(), type: q.type, required: !!q.required, scope: q.scope, options: q.type === 'choice' ? (q.options || []) : [] }));
          const blank = questions.findIndex((q) => !q.label);
          if (blank >= 0) { UI.dialogError(d, `Question ${blank + 1} needs some text, or remove it.`); return false; }
          const noChoices = questions.findIndex((q) => q.type === 'choice' && q.options.length < 2);
          if (noChoices >= 0) { UI.dialogError(d, `Question ${noChoices + 1} needs at least two choices.`); return false; }
          const template = { price, capacity, durationMin, maxPerBooking, guestDetails: val(d, '#set-t-guests'), questions };
          if (type) {
            const oldName = type.name, before = JSON.stringify(type.template || null);
            type.name = name;
            type.template = template;
            if (oldName !== name) App.log('Settings', `Event type renamed: ${oldName} is now ${name}.`);
            if (before !== JSON.stringify(template)) App.log('Settings', `Defaults for ${name} events changed: ${templateText(type)}.`);
          } else {
            const t = { id: Core.nextId(s, 'ty'), name, template };
            s.eventTypes.push(t);
            App.log('Settings', `Event type added: ${name}, defaults ${templateText(t)}.`);
          }
          commit(close, 'Event type saved.');
          return undefined;
        }
      }]
    });
  }
  function typeRemove(type) {
    UI.dialog({
      title: `Remove ${type.name}?`,
      body: '<p>This type will no longer be offered for new events.</p>',
      actions: [{ label: 'Keep it', kind: 'ghost' }, {
        label: 'Remove', kind: 'danger', onClick: (d, close) => {
          if (!allowed()) return undefined;
          const u = typeUse(type.id);
          if (u.events + u.codes) { UI.dialogError(d, 'This type is in use, so it cannot be removed.'); return false; }
          state().eventTypes = state().eventTypes.filter((t) => t !== type);
          App.log('Settings', `Event type removed: ${type.name}.`);
          commit(close, 'Event type removed.');
          return undefined;
        }
      }]
    });
  }

  /* ---------- Users and roles ---------- */
  const adminCount = () => state().users.filter((u) => u.role === 'admin').length;
  /* Returns the reason this person's access cannot be removed, or '' if it can. */
  function removeBlock(u) {
    if (u.id === state().currentUserId) return 'You are signed in as this user, so you cannot remove them.';
    if (u.role === 'admin' && adminCount() <= 1) return 'This is the last admin, so they cannot be removed.';
    return '';
  }
  function roleBlock(u) {
    if (u.role !== 'admin') return '';
    if (u.id === state().currentUserId) return 'You are signed in as this user, so you cannot change their role. This stops you locking yourself out of Settings.';
    if (adminCount() <= 1) return 'This is the last admin, so their role cannot be changed.';
    return '';
  }
  function renderUsers(box) {
    const s = state();
    const rows = s.users.filter((u) => Core.allVenues(u) || Core.userVenueIds(u).some((id) => App.inVenue(id)));
    box.innerHTML = head('Users and roles', `Add staff, set their role and venues, and remove access at once when someone leaves. ${viewNote()} A marketing admin covers all venues. A club manager runs events and bookings at their venues.`, '<button type="button" class="btn btn-primary" data-act="user-add">Add a user</button>') +
      UI.table({ subtitle: 'Each user with their role and venue.' }, [
        { label: 'Name', html: (u) => `<span>${UI.esc(u.name)}${u.id === s.currentUserId ? ` ${UI.badge('You', 'info')}` : ''}</span>` },
        { label: 'Role', html: (u) => `<span>${UI.esc(Core.ROLE_NAMES[u.role] || u.role)}</span>` },
        { label: 'Venues', html: (u) => { const names = Core.userVenueIds(u).map((id) => Core.findVenue(s, id)).filter(Boolean).map((v) => v.name); return `<span>${UI.esc(Core.allVenues(u) ? 'All venues' : names.join(', ') || 'None')}</span>`; } },
        { label: 'Email', html: (u) => (u.email ? `<span>${UI.esc(u.email)}</span>` : '<span class="muted">None</span>') },
        { label: 'Actions', html: (u) => { const why = removeBlock(u); return `<div class="set-actions"><button type="button" class="btn btn-small" data-act="user-edit" data-id="${UI.esc(u.id)}" aria-label="Edit ${UI.esc(u.name)}">Edit</button>${why ? `<span class="hint">${UI.esc(why)}</span>` : `<button type="button" class="btn btn-small" data-act="user-remove" data-id="${UI.esc(u.id)}" aria-label="Remove access for ${UI.esc(u.name)}">Remove access</button>`}</div>`; } }
      ], rows, { emptyText: 'No users at this venue.' });
  }
  function userDialog(user) {
    const s = state();
    const block = user ? roleBlock(user) : '';
    const roles = Object.keys(Core.ROLE_NAMES).map((k) => ({ value: k, label: Core.ROLE_NAMES[k] }));
    const venues = s.venues.map((v) => ({ value: v.id, label: v.name }));
    const startRole = user ? user.role : 'manager';
    const startVenues = user && Core.userVenueIds(user).length ? Core.userVenueIds(user) : [App.venueId() || (venues[0] ? venues[0].value : '')];
    UI.dialog({
      title: user ? `Edit ${user.name}` : 'Add a user',
      body: `<div class="set-dialog">${textField('set-u-name', 'Name', user ? user.name : '')}
        ${field('set-u-role', 'Role', `<select id="set-u-role"${block ? ' disabled aria-describedby="set-u-role-hint"' : ''}>${UI.options(roles, startRole)}</select>`, block)}
        ${textField('set-u-email', 'Work email (optional)', user && user.email ? user.email : '')}
        <fieldset class="set-venue-picks" id="set-u-venue-wrap"><legend>Venues</legend><p class="hint">Tick every club this person works at.</p>${venues.map((v) => `<label class="check"><input type="checkbox" name="set-u-venue" value="${UI.esc(v.value)}"${startVenues.includes(v.value) ? ' checked' : ''}> <span>${UI.esc(v.label)}</span></label>`).join('')}</fieldset>
        <p class="hint" id="set-u-all">A marketing admin covers all venues. A normal user only sees their own bookings.</p>
        ${user ? '' : UI.demo('no sign-in invite is really sent.')}</div>`,
      onOpen: (d) => {
        const role = d.querySelector('#set-u-role');
        const sync = () => {
          const tied = role.value === 'manager';
          d.querySelector('#set-u-venue-wrap').hidden = !tied;
          d.querySelector('#set-u-all').hidden = tied;
        };
        role.addEventListener('change', sync);
        sync();
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save', kind: 'primary', onClick: (d, close) => {
          if (!allowed()) return undefined;
          const name = val(d, '#set-u-name');
          const role = d.querySelector('#set-u-role').value;
          const venueIds = role !== 'manager' ? [] : [...d.querySelectorAll('input[name="set-u-venue"]:checked')].map((x) => x.value);
          const venueId = venueIds[0] || null;   /* kept for older code that reads one venue */
          const email = val(d, '#set-u-email').toLowerCase();
          if (!name) { UI.dialogError(d, 'Enter a name.'); return false; }
          if (s.users.some((u) => u !== user && same(u.name, name))) { UI.dialogError(d, 'There is already a user with this name. The activity log needs names to be different.'); return false; }
          if (role === 'manager' && !venueIds.length) { UI.dialogError(d, 'Tick at least one venue.'); return false; }
          if (role === 'user' && !email) { UI.dialogError(d, 'A normal user needs an email, so we can find their bookings.'); return false; }
          if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { UI.dialogError(d, 'This email does not look right.'); return false; }
          if (user && role !== user.role && roleBlock(user)) { UI.dialogError(d, roleBlock(user)); return false; }
          const describe = () => { const names = venueIds.map((id) => Core.findVenue(s, id)).filter(Boolean).map((v) => v.name); return `${Core.ROLE_NAMES[role]}, ${names.length ? names.join(', ') : 'all venues'}`; };
          if (user) {
            const oldName = user.name;
            Object.assign(user, { name, role, venueId, venueIds });
            if (email) user.email = email; else delete user.email;
            App.log('Access', `User edited: ${oldName === name ? name : `${oldName} is now ${name}`} (${describe()}).`);
          } else {
            s.users.push(Object.assign({ id: Core.nextId(s, 'u'), name, role, venueId, venueIds }, email ? { email } : {}));
            App.log('Access', `User added: ${name} (${describe()}).`);
          }
          commit(close, 'User saved.');
          return undefined;
        }
      }]
    });
  }
  function userRemove(user) {
    UI.dialog({
      title: `Remove access for ${user.name}?`,
      body: '<p>They will not be able to sign in from now on. Their past actions stay in the activity log.</p>',
      actions: [{ label: 'Keep access', kind: 'ghost' }, {
        label: 'Remove access', kind: 'danger', onClick: (d, close) => {
          if (!allowed()) return undefined;
          const why = removeBlock(user);
          if (why) { UI.dialogError(d, why); return false; }
          state().users = state().users.filter((u) => u !== user);
          App.log('Access', `Access removed: ${user.name}.`);
          commit(close, 'Access removed.');
          return undefined;
        }
      }]
    });
  }

  /* ---------- Add-ons ---------- */
  const addOnEverSold = (id) => state().bookings.some((b) => (b.addOns || []).some((x) => x.addOnId === id));
  function renderAddOns(box) {
    const s = state();
    const rows = s.addOns.filter((a) => App.inVenue(a.venueId));
    box.innerHTML = head('Add-ons', `The extras offered by venue. Sold counts add-ons that have not been refunded. ${viewNote()}`, '<button type="button" class="btn btn-primary" data-act="addon-add">Add an add-on</button>') +
      UI.table({ subtitle: 'Each add-on with its price, stock and how many have sold.' }, [
        { label: 'Name', html: (a) => `<b>${UI.esc(a.name)}</b>` },
        { label: 'Price', html: (a) => `<span>${UI.money(a.price)}</span>` },
        { label: 'Venue', html: (a) => { const v = Core.findVenue(s, a.venueId); return `<span>${UI.esc(v ? v.name : 'Unknown venue')}</span>`; } },
        { label: 'Stock', html: (a) => `<span>${a.stock === null || a.stock === undefined || a.stock === '' ? 'No limit' : UI.esc(a.stock)}</span>` },
        { label: 'Sold', html: (a) => `<span>${Core.addOnSold(s, a.id)}</span>` },
        { label: 'Left', html: (a) => { const left = Core.addOnLeft(s, a); return left === null ? '<span>No limit</span>' : (left === 0 ? UI.badge('None left', 'bad') : `<span>${left}</span>`); } },
        { label: 'Actions', html: (a) => `<div class="set-actions"><button type="button" class="btn btn-small" data-act="addon-edit" data-id="${UI.esc(a.id)}" aria-label="Edit ${UI.esc(a.name)}">Edit</button>${addOnEverSold(a.id) ? '' : `<button type="button" class="btn btn-small" data-act="addon-remove" data-id="${UI.esc(a.id)}" aria-label="Remove ${UI.esc(a.name)}">Remove</button>`}</div>` }
      ], rows, { emptyText: 'No add-ons at this venue.' });
  }
  function addOnDialog(addOn) {
    const s = state();
    const venues = s.venues.map((v) => ({ value: v.id, label: v.name }));
    const sold = addOn ? addOnEverSold(addOn.id) : false;
    const startVenue = addOn ? addOn.venueId : (App.venueId() || (venues[0] ? venues[0].value : ''));
    const lockedHint = sold ? 'This add-on has been sold, so its venue cannot be changed.' : '';
    UI.dialog({
      title: addOn ? `Edit ${addOn.name}` : 'Add an add-on',
      body: `<div class="set-dialog">${textField('set-a-name', 'Name', addOn ? addOn.name : '')}
        ${numberField('set-a-price', 'Price (£)', addOn ? addOn.price : '', '', '0.01')}
        ${field('set-a-venue', 'Venue', `<select id="set-a-venue"${sold ? ' disabled aria-describedby="set-a-venue-hint"' : ''}>${UI.options(venues, startVenue)}</select>`, lockedHint)}
        ${numberField('set-a-stock', 'Stock (optional)', addOn && addOn.stock !== null && addOn.stock !== undefined ? addOn.stock : '', 'Leave empty if there is no limit.')}</div>`,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save', kind: 'primary', onClick: (d, close) => {
          if (!allowed()) return undefined;
          const name = val(d, '#set-a-name');
          const venueId = d.querySelector('#set-a-venue').value;
          const priceText = val(d, '#set-a-price'), stockText = val(d, '#set-a-stock');
          const price = Core.round2(priceText);
          if (!name) { UI.dialogError(d, 'Enter a name.'); return false; }
          if (priceText === '' || !Number.isFinite(Number(priceText)) || Number(priceText) < 0) { UI.dialogError(d, 'Enter a price of £0 or more.'); return false; }
          if (!venueId) { UI.dialogError(d, 'Choose a venue.'); return false; }
          if (s.addOns.some((a) => a !== addOn && a.venueId === venueId && same(a.name, name))) { UI.dialogError(d, 'This venue already has an add-on with this name.'); return false; }
          let stock = null;
          if (stockText !== '') {
            stock = Number(stockText);
            if (!Number.isInteger(stock) || stock < 0) { UI.dialogError(d, 'Stock must be a whole number, or empty for no limit.'); return false; }
            const taken = addOn ? Core.addOnSold(s, addOn.id) : 0;
            if (stock < taken) { UI.dialogError(d, `${taken} have already been sold, so stock cannot be below ${taken}.`); return false; }
          }
          if (addOn) {
            const oldPrice = addOn.price;
            Object.assign(addOn, { name, price, venueId, stock });
            App.log('Settings', `Add-on edited: ${name}.`);
            if (oldPrice !== price) App.log('Price change', `Add-on ${name}: price changed from ${UI.money(oldPrice)} to ${UI.money(price)}.`);
          } else {
            s.addOns.push({ id: Core.nextId(s, 'ad'), name, price, venueId, stock });
            App.log('Settings', `Add-on added: ${name}, ${UI.money(price)}.`);
          }
          commit(close, 'Add-on saved.');
          return undefined;
        }
      }]
    });
  }
  function addOnRemove(addOn) {
    UI.dialog({
      title: `Remove ${addOn.name}?`,
      body: '<p>It will no longer be offered. This add-on has never been sold, so no booking is affected.</p>',
      actions: [{ label: 'Keep it', kind: 'ghost' }, {
        label: 'Remove', kind: 'danger', onClick: (d, close) => {
          if (!allowed()) return undefined;
          if (addOnEverSold(addOn.id)) { UI.dialogError(d, 'This add-on has been sold, so it cannot be removed.'); return false; }
          state().addOns = state().addOns.filter((a) => a !== addOn);
          App.log('Settings', `Add-on removed: ${addOn.name}.`);
          commit(close, 'Add-on removed.');
          return undefined;
        }
      }]
    });
  }

  /* ---------- Default policies ---------- */
  const STACKING = [
    { value: 'lower', label: 'Use whichever total is lower' },
    { value: 'stack', label: 'Take the code off the member price' }
  ];
  const TRANSFER = [
    { value: 'event', label: 'Another session of the same event' },
    { value: 'venue', label: 'Any session at the same venue, at the same price or lower' }
  ];
  const labelOf = (list, value) => { const x = list.find((i) => i.value === value); return x ? x.label : String(value); };
  const hoursText = (n) => `${n} hours`;
  const holdOf = (set) => (set.holdMinutes === undefined ? HOLD_DEFAULT : set.holdMinutes);
  const limitText = (v) => (Number(v) > 0 ? `${UI.money(v)} without approval` : 'No limit');
  const floorText = (v) => (Number(v) > 0 ? UI.money(v) : 'Off');
  const retentionText = (v) => (Number(v) > 0 ? `${v} days after the event ends` : 'Kept');
  /* The policies are read on the page and changed in a dialog. */
  function renderPolicies(box) {
    const set = state().settings, p = set.policy;
    const groups = [
      ['Member price and discount codes', [
        ['Stacking rule', labelOf(STACKING, set.stacking)],
        ['Return a single-use code when we cancel the event', set.releaseCodeOnCancel ? 'Yes' : 'No']]],
      ['Refunds', [
        ['Refund allowed up to', `${hoursText(p.refundHours)} before`],
        ['Refund fee', UI.money(p.refundFee)],
        ['Club manager refund limit', limitText(set.managerRefundLimit)]]],
      ['Prices', [
        ['Lowest price a ticket can drop to', floorText(set.minTicketPrice)]]],
      ['Transfers', [
        ['Transfer allowed up to', `${hoursText(p.transferHours)} before`],
        ['Transfer fee', UI.money(p.transferFee)],
        ['Where a place can move to', labelOf(TRANSFER, set.transferRule)]]],
      ['Spaces and holds', [
        ['Hold time', `${holdOf(set)} minutes`],
        ['Low-space warning', `${set.lowSpaceThreshold} places left`],
        ['Waitlist claim time', hoursText(set.waitlistClaimHours)]]],
      ['Privacy', [
        ['Delete guest details and answers', retentionText(set.retentionDays)]]]
    ];
    box.innerHTML = head('Default policies', 'These rules apply at every venue, so staff at each club give the same answer. Every change is written to the activity log.',
      '<button type="button" class="btn btn-primary" data-act="policy-edit">Edit policies</button>') +
      groups.map((g) => `<section class="card"><h3>${UI.esc(g[0])}</h3><dl class="set-summary">${g[1].map((r) => `<dt>${UI.esc(r[0])}</dt><dd>${UI.esc(r[1])}</dd>`).join('')}</dl>${g[0] === 'Privacy' ? retentionBox() : ''}</section>`).join('');
  }
  /* Data retention: what the clean-up would clear today, and a button to run it. */
  function retentionBox() {
    const set = state().settings;
    if (!(Number(set.retentionDays) > 0)) return '<p class="hint">Guest details are kept. Set a number of days to clear them after events end.</p>';
    const pv = Core.retentionPreview(state(), App.now());
    const waiting = pv.people + pv.answers;
    return `<p class="hint set-retention-note">${waiting ? `Ready to clear now: ${pv.people} guest contact ${pv.people === 1 ? 'detail' : 'details'} and ${pv.answers} ${pv.answers === 1 ? 'answer' : 'answers'} on ${pv.bookings} ${pv.bookings === 1 ? 'booking' : 'bookings'}.` : 'Nothing is old enough to clear right now.'} The booker's name, email and the money are always kept.</p>
      <button type="button" class="btn" data-act="retention-run"${waiting ? '' : ' disabled'}>Run clean-up now</button>`;
  }
  function retentionRun() {
    if (!allowed()) return;
    const pv = Core.retentionPreview(state(), App.now());
    if (!(pv.people + pv.answers)) { UI.toast('Nothing to clear.'); return; }
    UI.dialog({
      title: 'Delete old guest details?', subtitle: 'This cannot be undone.',
      body: `<p>For events that ended more than ${UI.esc(state().settings.retentionDays)} days ago, this deletes ${pv.people} guest contact ${pv.people === 1 ? 'detail' : 'details'} (email and phone) and ${pv.answers} ${pv.answers === 1 ? 'answer' : 'answers'} to custom questions, on ${pv.bookings} ${pv.bookings === 1 ? 'booking' : 'bookings'}.</p><p class="hint">The booker's name and email, the bookings and the money stay, so reports do not change. It is written to the activity log.</p>`,
      actions: [{ label: 'Keep them', kind: 'ghost' }, { label: 'Delete', kind: 'danger', onClick: (d, close) => {
        if (!allowed()) return false;
        const done = Core.retentionRun(state(), App.now(), App.user().name);
        commit(close, `Cleared ${done.people} contact details and ${done.answers} answers.`);
        return undefined;
      } }]
    });
  }
  function policyDialog() {
    const set = state().settings;
    UI.dialog({
      title: 'Edit default policies', subtitle: 'These rules apply at every venue. Every change is written to the activity log.', wide: true, body: policyForm(set, set.policy, holdOf(set)),
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save policies', kind: 'primary', onClick: (d) => savePolicies(d) }]
    });
  }
  function policyForm(set, p, hold) {
    return `<form id="set-policy-form" novalidate>
        <section class="card"><h3>Member price and discount codes</h3>
          ${field('set-p-stacking', 'Stacking rule', `<select id="set-p-stacking" aria-describedby="set-p-stacking-hint">${UI.options(STACKING, set.stacking)}</select>`, 'What happens when a member also uses a code. "Whichever total is lower" means the customer gets either the member price or the code, whichever costs them less. The other choice gives them both.')}
          <label class="check" for="set-p-release"><input id="set-p-release" type="checkbox" aria-describedby="set-p-release-hint"${set.releaseCodeOnCancel ? ' checked' : ''}> <span>Return a single-use code when we cancel the event</span></label>
          <p class="hint" id="set-p-release-hint">If this is on and we cancel an event or a session, a single-use code used on it can be used again. A refund on its own does not give the code back unless staff choose this.</p>
        </section>
        <section class="card"><h3>Refunds</h3><div class="set-form-grid">
          ${numberField('set-p-refund-hours', 'Refund allowed up to (hours before)', p.refundHours, 'A refund is inside the policy until this many hours before the session starts.')}
          ${numberField('set-p-refund-fee', 'Refund fee (£)', p.refundFee, 'The fee when a refund is given. Enter 0 for no fee.', '0.01')}
          ${numberField('set-p-mgr-limit', 'Club manager refund limit (£)', Core.managerRefundLimit(set), 'A club manager can refund up to this, inside the policy. Anything more is sent to the marketing admin for approval. Enter 0 for no limit.', '0.01')}
        </div></section>
        <section class="card"><h3>Prices</h3><div class="set-form-grid">
          ${numberField('set-p-floor', 'Lowest price a ticket can drop to (£)', Number(set.minTicketPrice) || 0, 'Staff are warned when a member price or discount code would take a ticket below this. Enter 0 to turn it off.', '0.01')}
        </div></section>
        <section class="card"><h3>Transfers</h3><div class="set-form-grid">
          ${numberField('set-p-transfer-hours', 'Transfer allowed up to (hours before)', p.transferHours, 'A transfer is inside the policy until this many hours before the session starts.')}
          ${numberField('set-p-transfer-fee', 'Transfer fee (£)', p.transferFee, 'The fee when a place is moved. Enter 0 for no fee.', '0.01')}
          ${field('set-p-transfer-rule', 'Where a place can move to', `<select id="set-p-transfer-rule" aria-describedby="set-p-transfer-rule-hint">${UI.options(TRANSFER, set.transferRule)}</select>`, 'The sessions staff are offered when they transfer a place.')}
        </div></section>
        <section class="card"><h3>Spaces and holds</h3><div class="set-form-grid">
          ${numberField('set-p-hold', 'Hold time (minutes)', hold, 'How long a place is kept for someone during checkout, so two people cannot buy the last one. This applies on the customer checkout, which is not part of this admin demo.')}
          ${numberField('set-p-low', 'Low-space warning (places left)', set.lowSpaceThreshold, 'A session is flagged as low on space when this many places or fewer are left.')}
          ${numberField('set-p-claim', 'Waitlist claim time (hours)', set.waitlistClaimHours, 'When a place opens, how long the next person on the waitlist has to claim it before it goes to the next person.')}
        </div></section>
        <section class="card"><h3>Privacy</h3><div class="set-form-grid">
          ${numberField('set-p-retention', 'Delete guest details and answers after (days)', Number(set.retentionDays) || 0, 'Counted from the day an event ends. Guest emails, phone numbers and answers to custom questions are deleted. The booker and the money are kept. Enter 0 to keep everything.')}
        </div></section>
      </form>`;
  }
  /* box is the dialog. Returning false keeps it open. */
  function savePolicies(box) {
    if (!allowed()) return false;
    const set = state().settings, p = set.policy;
    const fail = (text, id) => { UI.dialogError(box, text); box.querySelector(id).focus(); };
    UI.dialogError(box, '');
    const read = (id, label, opts) => {
      const text = val(box, id), n = Number(text);
      const min = opts.min || 0;
      if (text === '' || !Number.isFinite(n) || n < min || (opts.whole && !Number.isInteger(n))) {
        fail(`${label} must be ${opts.whole ? 'a whole number' : 'a number'} of ${min} or more.`, id);
        return null;
      }
      return opts.whole ? n : Core.round2(n);
    };
    const refundHours = read('#set-p-refund-hours', 'Refund hours', { whole: true }); if (refundHours === null) return false;
    const refundFee = read('#set-p-refund-fee', 'Refund fee', {}); if (refundFee === null) return false;
    const transferHours = read('#set-p-transfer-hours', 'Transfer hours', { whole: true }); if (transferHours === null) return false;
    const transferFee = read('#set-p-transfer-fee', 'Transfer fee', {}); if (transferFee === null) return false;
    const holdMinutes = read('#set-p-hold', 'Hold time', { whole: true, min: 1 }); if (holdMinutes === null) return false;
    const lowSpaceThreshold = read('#set-p-low', 'Low-space warning', { whole: true }); if (lowSpaceThreshold === null) return false;
    const waitlistClaimHours = read('#set-p-claim', 'Waitlist claim time', { whole: true, min: 1 }); if (waitlistClaimHours === null) return false;
    const managerRefundLimit = read('#set-p-mgr-limit', 'Club manager refund limit', {}); if (managerRefundLimit === null) return false;
    const minTicketPrice = read('#set-p-floor', 'Lowest ticket price', {}); if (minTicketPrice === null) return false;
    const retentionDays = read('#set-p-retention', 'Days before guest details are deleted', { whole: true }); if (retentionDays === null) return false;
    const stacking = box.querySelector('#set-p-stacking').value;
    const transferRule = box.querySelector('#set-p-transfer-rule').value;
    const releaseCodeOnCancel = box.querySelector('#set-p-release').checked;
    const onOff = (v) => (v ? 'on' : 'off');
    const oldHold = set.holdMinutes === undefined ? HOLD_DEFAULT : set.holdMinutes;
    const changes = [
      ['Stacking rule', set.stacking, stacking, (v) => labelOf(STACKING, v)],
      ['Return single-use code on event cancel', set.releaseCodeOnCancel, releaseCodeOnCancel, onOff],
      ['Refund allowed up to', p.refundHours, refundHours, hoursText],
      ['Refund fee', p.refundFee, refundFee, UI.money],
      ['Transfer allowed up to', p.transferHours, transferHours, hoursText],
      ['Transfer fee', p.transferFee, transferFee, UI.money],
      ['Where a place can move to', set.transferRule, transferRule, (v) => labelOf(TRANSFER, v)],
      ['Hold time', oldHold, holdMinutes, (v) => `${v} minutes`],
      ['Low-space warning', set.lowSpaceThreshold, lowSpaceThreshold, (v) => `${v} places`],
      ['Waitlist claim time', set.waitlistClaimHours, waitlistClaimHours, hoursText],
      ['Club manager refund limit', Core.managerRefundLimit(set), managerRefundLimit, limitText],
      ['Lowest ticket price', Number(set.minTicketPrice) || 0, minTicketPrice, floorText],
      ['Delete guest details and answers', Number(set.retentionDays) || 0, retentionDays, retentionText]
    ].filter((c) => c[1] !== c[2]);
    if (!changes.length) { UI.toast('Nothing has changed.'); return; }
    Object.assign(set, { stacking, transferRule, releaseCodeOnCancel, lowSpaceThreshold, waitlistClaimHours, holdMinutes, managerRefundLimit, minTicketPrice, retentionDays });
    Object.assign(p, { refundHours, refundFee, transferHours, transferFee });
    changes.forEach((c) => App.log('Settings', `${c[0]} changed from ${c[3](c[1])} to ${c[3](c[2])}.`));
    commit(null, 'Policies saved.');
  }

  /* ---------- Email templates ---------- */
  const isKlaviyo = (t) => t.owner === 'Klaviyo';
  const PH = /\{\{\s*([a-z_]+)\s*\}\}/gi;
  const fill = (text) => String(text).replace(PH, (whole, key) => {
    const ph = PLACEHOLDERS.find((x) => x.key === key.toLowerCase());
    return ph ? ph.sample() : whole;
  });
  /* Anything left in double braces would reach a customer as it stands, so it is stopped at save. */
  function placeholderProblem(text) {
    const unknown = [];
    const rest = String(text).replace(PH, (whole, key) => {
      if (!PLACEHOLDERS.some((x) => x.key === key.toLowerCase())) unknown.push(whole);
      return '';
    });
    if (unknown.length) return `${unknown[0]} is not a placeholder this system knows.`;
    if (rest.includes('{{') || rest.includes('}}')) return 'A placeholder is not written correctly. Use two braces on each side, like {{event}}.';
    return '';
  }
  const mailHtml = (subject, body) => `<div class="set-mail"><b>${UI.esc(fill(subject))}</b>${UI.esc(fill(body))}</div>`;
  function renderEmails(box) {
    const list = state().emailTemplates;
    box.innerHTML = head('Email templates', 'Change the wording of emails without a developer. The calendar invite is attached to the confirmation and change emails.') +
      UI.demo('no email is really sent.') +
      list.map((t) => `<section class="card">
        <div class="set-tpl-title"><h3>${UI.esc(t.name)}</h3>${isKlaviyo(t) ? UI.badge('Set up in Klaviyo', 'info') : UI.badge('Sent by this system', 'good')}</div>
        <p class="hint set-tpl-meta">${UI.esc(t.when)}</p>
        ${isKlaviyo(t)
          ? `<p>${UI.esc(t.body)}</p><p class="hint">To change these messages, edit them in Klaviyo. They cannot be edited here.</p>`
          : `${mailHtml(t.subject, t.body)}<p class="hint">Preview with sample data.</p><button type="button" class="btn btn-small" data-act="tpl-edit" data-id="${UI.esc(t.id)}" aria-label="Edit ${UI.esc(t.name)}">Edit</button>`}
      </section>`).join('') +
      `<section class="card"><h3>Placeholders you can use</h3><p class="hint">Write these in a subject or body. Each one is swapped for the real detail when the email goes out.</p>
      ${UI.table({ subtitle: 'Each placeholder, what it becomes, and a sample.' }, [
        { label: 'Placeholder', html: (x) => `<code>{{${UI.esc(x.key)}}}</code>` },
        { label: 'What it becomes', html: (x) => `<span>${UI.esc(x.means)}</span>` },
        { label: 'Sample', html: (x) => `<span>${UI.esc(x.sample())}</span>` }
      ], PLACEHOLDERS)}</section>`;
  }
  function templateDialog(t) {
    UI.dialog({
      title: `Edit ${t.name}`, wide: true,
      body: `<div class="set-dialog">
        <p class="hint">${UI.esc(t.when)}</p>
        ${textField('set-e-subject', 'Subject', t.subject)}
        ${field('set-e-body', 'Body', `<textarea id="set-e-body" rows="6">${UI.esc(t.body)}</textarea>`)}
        <p class="hint">Placeholders you can use:</p>
        <ul class="set-ph-list">${PLACEHOLDERS.map((x) => `<li><code>{{${UI.esc(x.key)}}}</code></li>`).join('')}</ul>
        <p class="set-preview-label">Preview with sample data</p>
        <div id="set-e-preview" aria-live="polite"></div>
      </div>`,
      onOpen: (d) => {
        const subject = d.querySelector('#set-e-subject'), body = d.querySelector('#set-e-body'), preview = d.querySelector('#set-e-preview');
        const draw = () => { preview.innerHTML = mailHtml(subject.value, body.value); };
        subject.addEventListener('input', draw);
        body.addEventListener('input', draw);
        draw();
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save', kind: 'primary', onClick: (d, close) => {
          if (!allowed()) return undefined;
          if (isKlaviyo(t)) { UI.dialogError(d, 'This message is set up in Klaviyo.'); return false; }
          const subject = val(d, '#set-e-subject'), body = val(d, '#set-e-body');
          if (!subject) { UI.dialogError(d, 'Enter a subject.'); return false; }
          if (!body) { UI.dialogError(d, 'Enter a body.'); return false; }
          const problem = placeholderProblem(subject) || placeholderProblem(body);
          if (problem) { UI.dialogError(d, problem); return false; }
          const changed = [subject !== t.subject ? 'subject' : '', body !== t.body ? 'body' : ''].filter(Boolean);
          if (!changed.length) { close(); return undefined; }
          t.subject = subject; t.body = body;
          App.log('Settings', `Email template ${t.name}: ${changed.join(' and ')} changed.`);
          commit(close, 'Template saved.');
          return undefined;
        }
      }]
    });
  }

  /* ---------- Klaviyo ---------- */
  function klaviyoRows() {
    const s = state();
    const rows = s.klaviyoLog.filter((k) => {
      const b = s.bookings.find((x) => x.ref === k.ref);
      const e = b ? Core.findEvent(s, b.eventId) : null;
      return !e || App.inVenue(e.venueId);
    });
    const newest = rows.slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return newest.filter((k) => k.status === 'Failed').concat(newest.filter((k) => k.status !== 'Failed'));
  }
  function renderKlaviyo(box) {
    const s = state();
    const rows = klaviyoRows();
    const failed = rows.filter((k) => k.status === 'Failed').length;
    box.innerHTML = head('Klaviyo', `What this system sends to Klaviyo, and what went wrong. ${viewNote()}`) +
      UI.demo('this log is simulated. Nothing is really sent to Klaviyo.') +
      `<div class="grid stats"><div class="stat">${UI.statIcon('alert', UI.statTone(0))}<b>${failed}</b><span>Failed sends</span></div><div class="stat">${UI.statIcon('check', UI.statTone(1))}<b>${rows.length - failed}</b><span>Sent</span></div></div>
      <section class="card"><h3>Send log</h3><p class="hint">Failed sends are listed first. In the real system a failed send is retried on its own, and one that keeps failing shows on the Today screen.</p>
      <div id="set-k-table">${UI.table({ subtitle: 'Each email sent to Klaviyo, failed sends first.' }, [
        { label: 'When', html: (k) => `<span>${UI.esc(UI.dateTime(k.at))}</span>` },
        { label: 'Trigger', html: (k) => `<span>${UI.esc(k.type)}</span>` },
        { label: 'Booking', html: (k) => { const b = s.bookings.find((x) => x.ref === k.ref); return b ? `<a href="#/bookings/${encodeURIComponent(b.id)}">${UI.esc(k.ref)}</a>` : `<span>${UI.esc(k.ref)}</span>`; } },
        { label: 'Status', html: (k) => (k.status === 'Failed' ? `<span>${UI.badge('Failed', 'bad')} ${UI.esc(k.error)}</span>` : `<span>${UI.badge('Sent', 'good')}${k.retriedAt ? ' after a retry' : ''}</span>`) },
        { label: 'Actions', html: (k) => (k.status === 'Failed' ? `<button type="button" class="btn btn-small" data-act="k-retry" data-id="${UI.esc(k.id)}" aria-label="Retry ${UI.esc(k.type)} for ${UI.esc(k.ref)}">Retry</button>` : '<span class="muted">None</span>') }
      ], rows, { emptyText: 'Nothing has been sent yet.', rowClass: (k) => (k.status === 'Failed' ? 'set-failed' : '') })}</div></section>
      <section class="card"><h3>What each trigger sends</h3>${UI.table({ subtitle: 'What each trigger sends to Klaviyo.' }, [
        { label: 'Trigger', html: (t) => `<b>${UI.esc(t[0])}</b>` },
        { label: 'Data sent', html: (t) => `<span>${UI.esc(t[1])}</span>` },
        { label: 'Used for', html: (t) => `<span>${UI.esc(t[2])}</span>` }
      ], TRIGGERS)}</section>
      <section class="card"><h3>Good to know</h3><ul class="set-note">
        <li><b>Guest consent.</b> Having a guest's email does not mean marketing can be sent to them. The lead booker cannot agree on their behalf, so consent is stored per person. Guests can be sent booking messages, and Klaviyo should treat them as not subscribed until they opt in. Please check this with whoever handles data protection for you.</li>
        <li><b>Sensitive answers.</b> Dietary or health answers are left out of Klaviyo.</li>
        <li><b>Who sends what.</b> This system sends confirmations itself, so they still go out if Klaviyo has a problem. Klaviyo handles reminders and follow-ups.</li>
      </ul></section>`;
  }
  function klaviyoRetry(entry) {
    UI.dialog({
      title: `Retry ${entry.type}?`,
      body: `<p>Send ${UI.esc(entry.type)} for ${UI.esc(entry.ref)} to Klaviyo again.</p>${UI.demo('nothing is really sent. The log entry is simply marked as sent.')}`,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Retry', kind: 'primary', onClick: (d, close) => {
          if (!allowed()) return undefined;
          entry.lastError = entry.error;
          entry.error = '';
          entry.status = 'Sent';
          entry.retriedAt = Core.toLocalISO(App.now());
          App.log('Klaviyo', `Retried ${entry.type} for ${entry.ref}. Demo: nothing was really sent.`);
          commit(close, 'Marked as sent (demo).');
          return undefined;
        }
      }]
    });
  }

  /* ---------- Activity log: read only, there is no edit or delete on purpose ---------- */
  function activityRows() {
    const q = logFilter.q.trim().toLowerCase();
    return state().audit.filter((a) => {
      if (logFilter.type && a.type !== logFilter.type) return false;
      if (!q) return true;
      return [a.by, a.type, a.text, UI.dateTime(a.at)].join(' ').toLowerCase().includes(q);
    });
  }
  function drawActivity(box) {
    const rows = activityRows();
    box.querySelector('#set-log-count').textContent = `${rows.length} of ${state().audit.length} entries`;
    box.querySelector('[data-act="log-export"]').disabled = !rows.length;
    box.querySelector('#set-log-results').innerHTML = UI.table({ title: 'Activity entries', subtitle: 'Who changed what, newest first.' }, [
      { label: 'When', html: (a) => `<span>${UI.esc(UI.dateTime(a.at))}</span>` },
      { label: 'Who', html: (a) => `<span>${UI.esc(a.by)}</span>` },
      { label: 'Type', html: (a) => UI.badge(a.type, 'quiet') },
      { label: 'What happened', html: (a) => `<span>${UI.esc(a.text)}</span>` }
    ], rows, { emptyText: 'No entries match this search.' });
  }
  function renderActivity(box) {
    const types = [...new Set(state().audit.map((a) => a.type))].sort();
    if (logFilter.type && !types.includes(logFilter.type)) logFilter.type = '';
    const typeOpts = [{ value: '', label: 'All types' }].concat(types.map((t) => ({ value: t, label: t })));
    box.innerHTML = head('Activity log', 'Who did what and when, across all venues: refunds, overrides, price changes, exports and settings. Entries cannot be edited or removed.') +
      `<div class="filters">
        <label><span>Type</span><select id="set-log-type">${UI.options(typeOpts, logFilter.type)}</select></label>
        <label><span>Search</span><input id="set-log-q" type="search" value="${UI.esc(logFilter.q)}"></label>
        <button type="button" class="btn" data-act="log-export">Download CSV</button>
      </div>
      <p class="hint" id="set-log-count" role="status"></p>
      <div id="set-log-results"></div>`;
    box.querySelector('#set-log-type').addEventListener('change', (e) => { logFilter.type = e.target.value; drawActivity(box); });
    box.querySelector('#set-log-q').addEventListener('input', (e) => { logFilter.q = e.target.value; drawActivity(box); });
    drawActivity(box);
  }
  function exportActivity() {
    const rows = activityRows();
    if (!rows.length) return;
    UI.downloadCSV('activity-log.csv', [['When', 'Who', 'Type', 'What happened']].concat(rows.map((a) => [String(a.at).replace('T', ' '), a.by, a.type, a.text])));
    App.log('Export', `Activity log downloaded: ${rows.length} entries.`);
    commit(null, 'Activity log downloaded.');
  }

  /* ---------- Screen ---------- */
  function onClick(ev) {
    const btn = ev.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    if (!allowed()) return;
    const s = state(), id = btn.dataset.id;
    const find = (list) => list.find((x) => x.id === id);
    switch (btn.dataset.act) {
      case 'venue-add': venueDialog(null); break;
      case 'venue-edit': venueDialog(find(s.venues)); break;
      case 'type-add': typeDialog(null); break;
      case 'type-edit': typeDialog(find(s.eventTypes)); break;
      case 'type-remove': typeRemove(find(s.eventTypes)); break;
      case 'user-add': userDialog(null); break;
      case 'user-edit': userDialog(find(s.users)); break;
      case 'user-remove': userRemove(find(s.users)); break;
      case 'addon-add': addOnDialog(null); break;
      case 'addon-edit': addOnDialog(find(s.addOns)); break;
      case 'addon-remove': addOnRemove(find(s.addOns)); break;
      case 'policy-edit': policyDialog(); break;
      case 'retention-run': retentionRun(); break;
      case 'tpl-edit': templateDialog(find(s.emailTemplates)); break;
      case 'k-retry': klaviyoRetry(find(s.klaviyoLog)); break;
      case 'log-export': exportActivity(); break;
      default: break;
    }
  }
  /* Right-hand cards: what is set up, and shortcuts to the sections people open most. */
  function sideCards() {
    const st = App.state;
    const stat = (n, label, key) => `<li><a href="#/settings/${key}"><span>${label}</span><b>${n}</b></a></li>`;
    return `<aside class="set-side">
      <section class="card"><h2>At a glance</h2><ul class="set-glance">${stat((st.venues || []).length, 'Venues', 'setup/venues')}${stat((st.users || []).length, 'Users', 'setup/users')}${stat((st.eventTypes || []).length, 'Event types', 'setup/event-types')}${stat((st.addOns || []).length, 'Add-ons', 'setup/add-ons')}</ul></section>
      <section class="card"><h2>Quick actions</h2><div class="set-quick"><a class="btn" href="#/settings/setup/users">Users and roles</a><a class="btn" href="#/settings/rules">Default policies</a><a class="btn" href="#/settings/messages/klaviyo">Klaviyo log</a><a class="btn" href="#/settings/activity">Activity log</a></div></section>
    </aside>`;
  }
  App.route('settings', {
    title: 'Settings',
    perm: 'settings',
    render(main, params) {
      if (!App.can('settings')) { main.innerHTML = UI.empty('Your role does not have access to this area.'); return; }
      const pick = pickSection(params);
      const group = pick ? pick.group : null, tab = pick ? pick.tab : null;
      const sub = group && group.sections.length > 1
        ? `<div class="set-subtabs">${UI.tabs(group.sections.map((k) => TABS.find((t) => t.key === k)).map((t) => ({ href: sectionHref(group, t.key), icon: TAB_ICONS[t.key] || 'list', label: t.label, on: t === tab })), { sub: true, label: `${group.label} sections` })}</div>`
        : '';
      const root = document.createElement('div');
      root.className = 'settings-screen';
      root.innerHTML = UI.pageHead('Settings', '', 'Set up venues and staff, the rules every club follows, customer messages, and the activity log. Only a marketing admin can see and change these.') +
        `<div class="set-tabs">${UI.tabs(GROUPS.map((g) => ({ href: `#/settings/${g.key}`, icon: TAB_ICONS[g.key] || 'list', label: g.label, on: g === group })), { label: 'Settings sections' })}</div>${sub}<div class="set-layout"><div id="set-panel"></div>${sideCards()}</div>`;
      main.appendChild(root);
      root.addEventListener('click', onClick);
      const panel = root.querySelector('#set-panel');
      if (tab) tab.render(panel); else panel.innerHTML = UI.empty('This section does not exist.');
    }
  });
})();
