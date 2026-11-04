/* Person picker: staff choose someone who already exists, so the same customer is not typed in twice.
   Type a name, email or phone and pick from the list. "New customer" shows the empty fields, for someone not on it.
   It works with a form's own name, email and phone fields: it fills them in and hides them, so the form saves as it always did.

   PersonPicker.attach(root, {
     state,            kept by the form, so a redraw does not lose the choice: { mode: 'find' | 'picked' | 'new' }
     name, email, phone,   the form's own fields (phone is optional)
     blocked(person),  optional: words saying why this person cannot be chosen
     onChange(person), optional: called with the person chosen, or null for a new customer
     start             optional: a person already chosen when the form opens
   })
   PersonPicker.waiting(state) says nobody has been chosen yet, so the form can ask for that.

   A club manager only finds people who booked at their own venues, like everywhere else in the app. */
(function () {
  'use strict';
  const SHOWN = 8;
  const esc = (v) => UI.esc(v);
  const key = (x) => String(x || '').trim().toLowerCase();

  /* Everyone this person may look up. */
  function people() {
    const s = App.state, now = App.now(), user = App.user(), all = Core.allVenues(user);
    const phones = new Map(), counts = new Map();
    s.bookings.slice().sort((a, c) => a.createdAt.localeCompare(c.createdAt)).forEach((b) => {
      const e = Core.findEvent(s, b.eventId), k = key(b.customer && b.customer.email);
      if (!k || !e || !Core.canSeeVenue(user, e.venueId)) return;
      counts.set(k, (counts.get(k) || 0) + 1);
      if (b.customer.phone) phones.set(k, b.customer.phone);
    });
    return Core.customerDirectory(s, now)
      .filter((p) => all || counts.has(p.email))
      .map((p) => Object.assign({}, p, { phone: phones.get(p.email) || '', seen: counts.get(p.email) || 0 }));
  }
  function search(list, text) {
    const words = key(text).split(/\s+/).filter(Boolean);
    const found = words.length ? list.filter((p) => { const hay = key(`${p.name} ${p.email} ${p.phone}`); return words.every((w) => hay.includes(w)); }) : list;
    /* Most bookings first when nothing is typed, as the regulars are the likeliest. */
    return words.length ? found : found.slice().sort((a, c) => c.seen - a.seen);
  }
  const fieldBox = (el) => (el ? el.closest('.field') || el : null);
  const plural = (n) => `${n} ${n === 1 ? 'booking' : 'bookings'}`;

  function attach(root, o) {
    const st = o.state;
    if (!st.mode) st.mode = 'find';
    if (o.start && !st.started) {
      st.started = true;
      const found = people().find((p) => p.email === key(o.start.email));
      st.person = found || Object.assign({ phone: '', seen: 0, isMember: false }, o.start, { email: key(o.start.email) });
      st.mode = 'picked';
    }
    const inputs = [o.name, o.email, o.phone].filter(Boolean);
    const first = fieldBox(o.name);
    let box = root.querySelector('.pp');
    if (!box) {
      box = document.createElement('div');
      box.className = 'pp';
      first.parentNode.insertBefore(box, first);
    }
    /* Named once per form, so a redraw brings keyboard focus back to the same place. */
    const id = `${o.name.id}-find`;
    const list = people();
    const set = (el, value) => {
      if (!el || el.value === value) return;
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const showFields = (on) => inputs.forEach((el) => { fieldBox(el).hidden = !on; });
    const fill = (p) => { set(o.name, p ? p.name : ''); set(o.email, p ? p.email : ''); set(o.phone, p ? p.phone : ''); };

    function choose(p) {
      st.mode = 'picked'; st.person = p; st.query = ''; st.focus = 'change';
      fill(p);
      draw();
      if (o.onChange) o.onChange(p);
    }
    function goNew() {
      st.mode = 'new'; st.person = null; st.focus = 'name';
      fill(null);
      draw();
      if (o.onChange) o.onChange(null);
    }
    function goFind() {
      st.mode = 'find'; st.person = null; st.focus = 'find';
      fill(null);
      draw();
      if (o.onChange) o.onChange(null);
    }

    function drawFind() {
      box.innerHTML = `<div class="field pp-field"><span><label for="${id}">Customer</label></span>
        <input id="${id}" type="search" role="combobox" aria-expanded="false" aria-controls="${id}-list" aria-autocomplete="list" autocomplete="off" placeholder="Type a name, email or phone" value="${esc(st.query || '')}"></div>
        <div class="pp-list" id="${id}-list" role="listbox" aria-label="Customers" hidden></div>`;
      const input = box.querySelector('input'), panel = box.querySelector('.pp-list');
      let rows = [], active = -1;
      const paint = () => {
        const found = search(list, input.value);
        rows = found.slice(0, SHOWN);
        active = -1;
        const more = found.length - rows.length;
        panel.innerHTML = `${rows.map((p, i) => {
          const why = o.blocked ? o.blocked(p) : '';
          return `<div class="pp-row${why ? ' is-off' : ''}" role="option" id="${id}-o${i}" data-i="${i}" aria-selected="false"${why ? ' aria-disabled="true"' : ''}>
            <b>${esc(p.name || p.email)}</b>${p.isMember ? ` ${UI.badge('Member', 'info')}` : ''}
            <span class="hint">${esc(p.email)}${p.phone ? ` · ${esc(p.phone)}` : ''} · ${plural(p.seen)}${why ? ` · ${esc(why)}` : ''}</span></div>`;
        }).join('') || `<p class="hint pp-none">Nobody matches "${esc(input.value.trim())}".</p>`}
          ${more > 0 ? `<p class="hint pp-more">${more} more. Keep typing to narrow the list.</p>` : ''}
          <button type="button" class="pp-new" data-new tabindex="-1">+ New customer</button>`;
      };
      const open = (on) => { panel.hidden = !on; input.setAttribute('aria-expanded', String(on)); if (!on) input.removeAttribute('aria-activedescendant'); };
      const mark = () => {
        panel.querySelectorAll('.pp-row').forEach((r, i) => {
          r.classList.toggle('is-active', i === active);
          r.setAttribute('aria-selected', String(i === active));
        });
        const row = panel.querySelector('.is-active');
        if (row) { input.setAttribute('aria-activedescendant', row.id); row.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
      };
      const pick = (i) => { const p = rows[i]; if (p && !(o.blocked && o.blocked(p))) choose(p); };
      input.addEventListener('focus', () => { paint(); open(true); });
      input.addEventListener('input', () => { st.query = input.value; paint(); open(true); });
      input.addEventListener('blur', () => { setTimeout(() => { if (box.contains(input)) open(false); }, 120); });
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
          ev.preventDefault();
          if (panel.hidden) { paint(); open(true); }
          if (rows.length) { active = (active + (ev.key === 'ArrowDown' ? 1 : rows.length - 1 + (active < 0 ? 1 : 0))) % rows.length; mark(); }
        } else if (ev.key === 'Enter') {
          /* Never submits the form from here. */
          ev.preventDefault();
          if (active >= 0) pick(active);
          else if (rows.length === 1) pick(0);
        } else if (ev.key === 'Escape' && !panel.hidden) {
          /* Closes the list, not the dialog around it. */
          ev.preventDefault();
          ev.stopPropagation();
          open(false);
        }
      });
      /* Stops the field losing focus, so the click lands. */
      panel.addEventListener('mousedown', (ev) => ev.preventDefault());
      panel.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-new]')) { goNew(); return; }
        const row = ev.target.closest('.pp-row');
        if (row) pick(Number(row.dataset.i));
      });
      /* Always in reach, without having to open the list first. */
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'btn btn-small pp-add';
      link.textContent = '+ New customer';
      link.addEventListener('click', goNew);
      box.appendChild(link);
      if (st.focus === 'find') { st.focus = ''; input.focus(); }
    }
    function drawPicked() {
      const p = st.person;
      box.innerHTML = `<div class="field pp-field"><span>Customer</span><div class="pp-chosen">
        <div class="pp-who"><b>${esc(p.name || p.email)}</b>${p.isMember ? ` ${UI.badge('Member', 'info')}` : ''}
          <span class="hint">${esc(p.email)}${p.phone ? ` · ${esc(p.phone)}` : ''}${p.seen ? ` · ${plural(p.seen)}` : ''}</span></div>
        <button type="button" class="btn btn-small" id="${id}-change" aria-label="Choose a different customer">Change</button></div></div>`;
      const change = box.querySelector('button');
      change.addEventListener('click', goFind);
      if (st.focus === 'change') { st.focus = ''; change.focus(); }
    }
    function drawNew() {
      box.innerHTML = `<div class="pp-newhead"><b>New customer</b><button type="button" class="btn btn-small" id="${id}-back">Find an existing customer</button></div><div class="pp-warn" role="status" hidden></div>`;
      box.querySelector('button').addEventListener('click', goFind);
      const warn = box.querySelector('.pp-warn');
      /* The same email is the same person, so this is where a repeat would slip through. */
      const look = () => {
        const p = list.find((x) => x.email === key(o.email.value));
        warn.hidden = !p;
        if (!p) { warn.innerHTML = ''; return; }
        warn.innerHTML = `<span>This email is already <b>${esc(p.name || p.email)}</b>.</span> <button type="button" class="btn btn-small">Use this customer</button>`;
        warn.querySelector('button').addEventListener('click', () => {
          const why = o.blocked ? o.blocked(p) : '';
          if (why) { UI.toast(why, 'bad'); return; }
          choose(p);
        });
      };
      if (!o.email.dataset.ppLook) {
        o.email.dataset.ppLook = '1';
        o.email.addEventListener('input', () => { if (st.mode === 'new' && st.look) st.look(); });
      }
      st.look = look;
      look();
      if (st.focus === 'name') { st.focus = ''; o.name.focus(); }
    }
    function draw() {
      showFields(st.mode === 'new');
      if (st.mode === 'picked') drawPicked();
      else if (st.mode === 'new') drawNew();
      else drawFind();
    }
    draw();
  }
  window.PersonPicker = { attach, waiting: (state) => !state.mode || state.mode === 'find', findId: (nameEl) => `${nameEl.id}-find` };
})();
