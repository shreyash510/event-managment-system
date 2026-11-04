/* Membership: three marketing admin areas.
   Users: everyone, managed in one place: staff of each role, customer accounts, members and guests.
   Subscriptions: each member's subscription and what happens to it (pause, cancel, change plan, failed payments).
   Plans and offers: what people can subscribe to, and any money off the first payment.
   Payments here are test records only: nothing is charged and no renewal happens on its own. */
(function () {
  'use strict';
  const S = () => App.state;
  const esc = (v) => UI.esc(v);
  const clean = (v) => String(v === null || v === undefined ? '' : v).trim();
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const validEmail = (x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
  const planOf = (id) => S().plans.find((p) => p.id === id);
  const planName = (id) => { const p = planOf(id); return p ? p.name : 'Unknown plan'; };
  const every = (interval) => (interval === 'year' ? 'year' : 'month');
  const priceText = (price, interval) => `${UI.money(price)} a ${every(interval)}`;
  const STATUS_TONE = { Active: 'good', 'Payment failed': 'bad', Paused: 'warn', Cancelled: 'quiet', Expired: 'quiet' };
  const TYPE_TONE = { Member: 'good', Account: 'info', Guest: 'quiet' };
  const statusBadge = (text) => UI.badge(text, STATUS_TONE[text] || 'quiet');
  const stat = (i, icon, value, label, note) => `<div class="stat">${UI.statIcon(icon, UI.statTone(i))}<b>${esc(value)}</b><span>${esc(label)}</span><small>${esc(note)}</small></div>`;
  const field = (id, label, control, hint) => `<div class="field"><span><label for="${id}">${esc(label)}</label></span>${control}${hint ? `<p class="hint">${esc(hint)}</p>` : ''}</div>`;
  const input = (id, label, value, type, hint, extra) => field(id, label, `<input id="${id}" type="${type || 'text'}" value="${esc(value === null || value === undefined ? '' : value)}"${extra ? ` ${extra}` : ''}>`, hint);
  const val = (d, id) => clean(d.querySelector(`#${id}`).value);
  const allowed = () => {
    if (App.can('membership.manage')) return true;
    UI.toast('Your role cannot change memberships.', 'bad');
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
  const who = () => App.user().name;
  const note = (sub, text) => { sub.history.unshift({ at: Core.toLocalISO(App.now()), by: who(), text }); };
  const noAccess = (main) => { main.innerHTML = UI.empty('Your role does not have access to this area.'); };

  /* ---------- Starting a subscription: used from Users and from Subscriptions ---------- */
  function startDialog(person) {
    const s = S(), plans = s.plans.filter((p) => p.active);
    if (!plans.length) { UI.toast('Add a plan first, in Plans and offers.', 'bad'); return; }
    const offersFor = (planId) => {
      const plan = planOf(planId);
      return s.offers.filter((o) => Core.offerStatus(o, App.now()) === 'Live' && (!o.planId || o.planId === planId) && plan);
    };
    const offerOptions = (planId) => `<option value="">No offer</option>${offersFor(planId).map((o) => `<option value="${esc(o.id)}">${esc(o.name)} (${esc(Core.offerText(o))})</option>`).join('')}`;
    const subPick = {};
    UI.dialog({
      title: 'New subscription',
      subtitle: 'Gives this person the member price on events straight away.',
      body: `<div class="ms-dialog">${input('ms-s-name', 'Name', person ? person.name : '')}${input('ms-s-email', 'Email', person ? person.email : '', 'email', 'Their bookings and member price are matched by this email.')}
        ${field('ms-s-plan', 'Plan', `<select id="ms-s-plan">${plans.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(priceText(p.price, p.interval))})</option>`).join('')}</select>`)}
        ${field('ms-s-offer', 'Offer', `<select id="ms-s-offer">${offerOptions(plans[0].id)}</select>`)}
        <p class="ms-due" id="ms-s-due" role="status"></p>
        ${UI.demo('this records a test payment. Nothing is charged.')}</div>`,
      onOpen: (d) => {
        PersonPicker.attach(d, {
          state: subPick, start: person || null,
          name: d.querySelector('#ms-s-name'), email: d.querySelector('#ms-s-email'),
          blocked: (p) => { const live = Core.subscriptionFor(s, p.email, App.now()); return live && !['Cancelled', 'Expired'].includes(Core.subStatus(live, App.now())) ? 'Already has a subscription' : ''; }
        });
        const plan = d.querySelector('#ms-s-plan'), offer = d.querySelector('#ms-s-offer'), due = d.querySelector('#ms-s-due');
        const show = () => {
          const p = planOf(plan.value), o = s.offers.find((x) => x.id === offer.value);
          due.textContent = `First payment ${UI.money(Core.offerPrice(p, o))}, then ${priceText(p.price, p.interval)}.`;
        };
        plan.addEventListener('change', () => { offer.innerHTML = offerOptions(plan.value); show(); });
        offer.addEventListener('change', show);
        show();
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Start subscription', kind: 'primary', onClick: (d, close) => {
          if (!allowed()) return undefined;
          if (PersonPicker.waiting(subPick)) { UI.dialogError(d, 'Choose a customer, or add a new one.'); return false; }
          const name = val(d, 'ms-s-name'), email = val(d, 'ms-s-email').toLowerCase();
          const plan = planOf(d.querySelector('#ms-s-plan').value), offer = s.offers.find((x) => x.id === d.querySelector('#ms-s-offer').value) || null;
          if (!name) { UI.dialogError(d, 'Enter a name.'); return false; }
          if (!validEmail(email)) { UI.dialogError(d, 'Enter a valid email.'); return false; }
          const live = Core.subscriptionFor(s, email);
          if (live && !['Cancelled', 'Expired'].includes(Core.subStatus(live, App.now()))) { UI.dialogError(d, `${email} already has a subscription (${planName(live.planId)}). Change its plan instead.`); return false; }
          const sub = Core.startSubscription(s, { name, email, plan, offer, now: App.now(), by: who() });
          App.log('Membership', `Subscription started: ${name}, ${plan.name}, first payment ${UI.money(sub.firstPayment)}${offer ? ` with offer ${offer.name}` : ''}.`);
          commit(close, 'Subscription started.');
          return undefined;
        }
      }]
    });
  }

  /* ---------- Users: staff of every role, customer accounts, members and guests, all managed here ---------- */
  let userTab = '';
  const adminCount = () => S().users.filter((u) => u.role === 'admin').length;
  /* Returns the reason this person's access cannot be removed, or '' if it can. */
  function removeBlock(u) {
    if (u.id === S().currentUserId) return 'You are signed in as this user, so you cannot remove them.';
    if (u.role === 'admin' && adminCount() <= 1) return 'This is the last admin, so they cannot be removed.';
    return '';
  }
  function roleBlock(u) {
    if (u.role !== 'admin') return '';
    if (u.id === S().currentUserId) return 'You are signed in as this user, so you cannot change their role. This stops you locking yourself out.';
    if (adminCount() <= 1) return 'This is the last admin, so their role cannot be changed.';
    return '';
  }
  const venueList = (u) => {
    if (Core.allVenues(u)) return ['All venues'];
    const names = Core.userVenueIds(u).map((id) => Core.findVenue(S(), id)).filter(Boolean).map((v) => v.name);
    return names.length ? names : ['None'];
  };
  const venueNames = (u) => venueList(u).join(', ');
  /* Add or edit a person of any role. start fills a new user in, such as a guest getting an account. */
  function editUser(user, start) {
    const s = S(), from = start || {};
    const block = user ? roleBlock(user) : '';
    const roles = Core.ROLES.map((k) => ({ value: k, label: Core.ROLE_NAMES[k] }));
    const startRole = user ? user.role : (from.role || 'manager');
    const startVenues = user && Core.userVenueIds(user).length ? Core.userVenueIds(user) : [App.venueId() || (s.venues[0] ? s.venues[0].id : '')];
    UI.dialog({
      title: user ? `Edit ${user.name}` : 'Add a user',
      body: `<div class="ms-dialog">${input('ms-u-name', 'Name', user ? user.name : (from.name || ''))}
        ${field('ms-u-role', 'Role', `<select id="ms-u-role"${block ? ' disabled' : ''}>${UI.options(roles, startRole)}</select>`, block)}
        ${input('ms-u-email', 'Email', user && user.email ? user.email : (from.email || ''), 'email', 'Needed for a normal user. Bookings and memberships are matched by email, so changing it separates them.')}
        <fieldset class="ms-picks" id="ms-u-venues"><legend>Venues</legend><p class="hint">Tick every club this person works at.</p>${s.venues.map((v) => `<label class="check"><input type="checkbox" name="ms-u-venue" value="${esc(v.id)}"${startVenues.includes(v.id) ? ' checked' : ''}> <span>${esc(v.name)}</span></label>`).join('')}</fieldset>
        <p class="hint" id="ms-u-all">A marketing admin covers all venues. A normal user only sees their own bookings.</p>
        ${user ? '' : UI.demo('no sign-in invite is really sent.')}</div>`,
      onOpen: (d) => {
        const role = d.querySelector('#ms-u-role');
        const sync = () => {
          const tied = role.value === 'manager';
          d.querySelector('#ms-u-venues').hidden = !tied;
          d.querySelector('#ms-u-all').hidden = tied;
        };
        role.addEventListener('change', sync);
        sync();
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save', kind: 'primary', onClick: (d, close) => {
          if (!allowed()) return undefined;
          const name = val(d, 'ms-u-name'), role = d.querySelector('#ms-u-role').value, email = val(d, 'ms-u-email').toLowerCase();
          const venueIds = role !== 'manager' ? [] : [...d.querySelectorAll('input[name="ms-u-venue"]:checked')].map((x) => x.value);
          const venueId = venueIds[0] || null;   /* kept for older code that reads one venue */
          if (!name) { UI.dialogError(d, 'Enter a name.'); return false; }
          if (s.users.some((u) => u !== user && u.name.toLowerCase() === name.toLowerCase())) { UI.dialogError(d, 'There is already a user with this name. The activity log needs names to be different.'); return false; }
          if (role === 'manager' && !venueIds.length) { UI.dialogError(d, 'Tick at least one venue.'); return false; }
          if (role === 'user' && !email) { UI.dialogError(d, 'A normal user needs an email, so we can find their bookings.'); return false; }
          if (email && !validEmail(email)) { UI.dialogError(d, 'This email does not look right.'); return false; }
          if (email && s.users.some((u) => u !== user && u.role === role && clean(u.email).toLowerCase() === email)) { UI.dialogError(d, `There is already a ${Core.ROLE_NAMES[role]} with this email.`); return false; }
          if (user && role !== user.role && roleBlock(user)) { UI.dialogError(d, roleBlock(user)); return false; }
          const names = venueIds.map((id) => Core.findVenue(s, id)).filter(Boolean).map((v) => v.name);
          const describe = `${Core.ROLE_NAMES[role]}, ${role === 'user' ? 'own bookings only' : (names.length ? names.join(', ') : 'all venues')}`;
          if (user) {
            const oldName = user.name;
            Object.assign(user, { name, role, venueId, venueIds });
            if (email) user.email = email; else delete user.email;
            App.log('Access', `User edited: ${oldName === name ? name : `${oldName} is now ${name}`} (${describe}).`);
          } else {
            s.users.push(Object.assign({ id: Core.nextId(s, 'u'), name, role, venueId, venueIds }, email ? { email } : {}));
            App.log('Access', `User added: ${name} (${describe}).`);
          }
          commit(close, 'User saved.');
          return undefined;
        }
      }]
    });
  }
  function removeUser(user) {
    UI.dialog({
      title: `Remove access for ${user.name}?`,
      body: '<p>They will not be able to sign in from now on. Their past actions stay in the activity log, and any bookings or membership stay on their email.</p>',
      actions: [{ label: 'Keep access', kind: 'ghost' }, {
        label: 'Remove access', kind: 'danger', onClick: (d, close) => {
          if (!allowed()) return undefined;
          const why = removeBlock(user);
          if (why) { UI.dialogError(d, why); return false; }
          S().users = S().users.filter((u) => u !== user);
          App.log('Access', `Access removed: ${user.name}.`);
          commit(close, 'Access removed.');
          if (location.hash === `#/members/${encodeURIComponent(`u-${user.id}`)}`) App.go('#/members');
          return undefined;
        }
      }]
    });
  }
  /* Staff first, then everyone the business knows as a customer. A customer row carries its account, if it has one. */
  function allPeople() {
    const s = S();
    const staff = s.users.filter((u) => u.role !== 'user').sort((a, c) => a.name.localeCompare(c.name)).map((u) => ({
      staff: true, user: u, name: u.name, email: clean(u.email).toLowerCase(), type: Core.ROLE_NAMES[u.role] || u.role, isMember: false, subscription: null, subStatus: '', bookings: 0, spent: 0, lastBooking: ''
    }));
    const customers = Core.customerDirectory(s, App.now()).map((p) => Object.assign(p, {
      staff: false, user: s.users.find((u) => u.role === 'user' && !u.guest && clean(u.email).toLowerCase() === p.email) || null
    }));
    return staff.concat(customers);
  }
  /* ---------- One user's details page: #/members/<key> ---------- */
  /* An account keeps its address when its email changes. A guest only has their email. */
  const keyOf = (p) => (p.user ? `u-${p.user.id}` : p.email);
  const pageOf = (p) => `#/members/${encodeURIComponent(keyOf(p))}`;
  /* The same page from anywhere that only knows an email. */
  const pageForEmail = (email) => {
    const k = clean(email).toLowerCase();
    const u = S().users.find((x) => x.role === 'user' && !x.guest && clean(x.email).toLowerCase() === k);
    return `#/members/${encodeURIComponent(u ? `u-${u.id}` : k)}`;
  };
  function findPerson(key) {
    const all = allPeople();
    if (key.startsWith('u-')) {
      const u = S().users.find((x) => x.id === key.slice(2));
      if (!u) return null;
      return all.find((p) => p.user === u) || null;
    }
    return all.find((p) => !p.staff && p.email === key.toLowerCase()) || null;
  }
  const fact = (label, big, small) => `<div class="bd-fact"><span>${esc(label)}</span><b>${esc(big)}</b>${small ? `<small>${esc(small)}</small>` : ''}</div>`;
  const facts = (rows) => `<dl class="pf-dl">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  const pageButton = (act, label, id, kind) => `<button type="button" class="btn${kind ? ` ${kind}` : ''}" data-act="${act}" data-id="${esc(id)}">${esc(label)}</button>`;
  function nextOrLast(b) {
    const live = b.tickets.filter((t) => t.status === 'active');
    const starts = [...new Set((live.length ? live : b.tickets).map((t) => t.sessionId))].map((id) => Core.findSession(S(), id)).filter(Boolean).map((f) => f.session.start).sort();
    if (!starts.length) return 'None';
    const next = starts.find((x) => new Date(x) > App.now());
    return next ? `Next: ${UI.dateTime(next)}` : `Last: ${UI.dateTime(starts[starts.length - 1])}`;
  }
  function customerPage(p) {
    const s = S(), sub = p.subscription;
    const mine = s.bookings.filter((b) => b.customer && clean(b.customer.email).toLowerCase() === p.email).sort((a, c) => c.createdAt.localeCompare(a.createdAt));
    const newest = mine[0];
    const phone = (mine.find((b) => b.customer.phone) || { customer: {} }).customer.phone || '';
    const agreed = p.user && p.user.marketingConsent !== undefined ? p.user.marketingConsent : mine.some((b) => b.customer.marketingConsent);
    const live = sub && !['Cancelled', 'Expired'].includes(p.subStatus);
    const membership = sub
      ? `${facts([['Plan', esc(planName(sub.planId))], ['Price', esc(priceText(sub.price, sub.interval))], ['Status', statusBadge(p.subStatus)], ['Started', esc(UI.date(sub.startedAt))], [p.subStatus === 'Cancelled' ? 'Ended' : sub.cancelAtEnd ? 'Ends' : 'Renews', esc(UI.date(sub.status === 'cancelled' && sub.cancelledAt ? sub.cancelledAt : sub.renewsAt))]])}
         <div class="pf-actions"><a class="btn" href="#/subscriptions/${esc(encodeURIComponent(sub.id))}">Manage subscription</a>${live ? '' : pageButton('user-start', 'Start again', p.email)}</div>`
      : `<p class="muted">No membership. They pay the standard price on events.</p>${pageButton('user-start', 'Start membership', p.email)}`;
    return {
      subtitle: 'Bookings, membership and contact details.',
      actions: `${p.user ? pageButton('user-edit', 'Edit', p.user.id) : pageButton('user-account', 'Create account', p.email)}${p.user && !removeBlock(p.user) ? pageButton('user-remove', 'Remove access', p.user.id, 'btn-danger') : ''}`,
      glance: `${fact('Type', p.type, p.isMember ? 'Pays the member price' : 'Pays the standard price')}${fact('Bookings', String(p.bookings), newest ? `Last booked ${UI.date(newest.createdAt)}` : 'None yet')}${fact('Spent', UI.money(p.spent), 'After refunds')}${fact('Membership', sub ? planName(sub.planId) : 'None', sub ? p.subStatus : '')}`,
      left: `<section class="card"><h2>Bookings</h2>${mine.length ? UI.table({}, [
        { label: 'Reference', html: (b) => `<a href="#/bookings/${esc(encodeURIComponent(b.id))}"><b>${esc(b.ref)}</b></a><div class="hint">Booked ${esc(UI.date(b.createdAt))}</div>` },
        { label: 'Event', html: (b) => { const e = Core.findEvent(s, b.eventId); return `${esc(e ? e.title : 'Unknown event')}<div class="hint">${esc(nextOrLast(b))}</div>`; } },
        { label: 'Status', html: (b) => { const st = Core.bookingStatus(b); return UI.badge(st, st === 'Cancelled' ? 'bad' : 'good'); } },
        { label: 'Paid', html: (b) => { const r = Core.refundedTotal(b); return `<span>${esc(UI.money(Core.paidTotal(b)))}</span>${r > 0 ? `<div class="hint">${esc(UI.money(r))} refunded</div>` : ''}`; } }
      ], mine, { filter: false }) : '<p class="muted">No bookings yet.</p>'}</section>`,
      right: `<section class="card"><h2>Contact details</h2>${facts([['Email', esc(p.email)], ['Phone', phone ? esc(phone) : '<span class="muted">Not given</span>'], ['Account', p.user ? 'Yes, they can sign in' : 'No, booked as a guest'], ['Marketing', agreed ? 'Agreed' : 'Not agreed']])}</section>
        <section class="card"><h2>Membership</h2>${membership}</section>`
    };
  }
  function staffPage(p) {
    const s = S(), u = p.user, now = App.now();
    const names = [u.name].concat(u.formerNames || []);
    const done = (s.audit || []).filter((a) => names.includes(a.by));
    const month = done.filter((a) => now - new Date(a.at) < 30 * 86400000).length;
    const block = removeBlock(u);
    return {
      subtitle: 'Role, venues and recent activity.',
      actions: `${pageButton('user-edit', 'Edit role and venues', u.id)}${block ? '' : pageButton('user-remove', 'Remove access', u.id, 'btn-danger')}`,
      glance: `${fact('Role', p.type, u.role === 'admin' ? 'Runs everything' : 'Runs their own venues')}${fact('Venues', Core.allVenues(u) ? 'All venues' : String(Core.userVenueIds(u).length), Core.allVenues(u) ? '' : venueNames(u))}${fact('Actions in 30 days', String(month), `${done.length} in the log`)}${fact('Last active', done.length ? UI.date(done[0].at) : 'Nothing yet', '')}`,
      left: `<section class="card"><h2>Recent activity</h2>${done.length ? `<ul class="pf-list">${done.slice(0, 10).map((a) => `<li><b>${esc(a.type)}</b> ${esc(a.text)}<small class="muted">${esc(UI.dateTime(a.at))}</small></li>`).join('')}</ul>` : '<p class="muted">Nothing recorded yet.</p>'}${App.can('settings') ? '<a class="btn btn-ghost btn-small" href="#/activity">See all activity</a>' : ''}</section>`,
      right: `<section class="card"><h2>Access</h2>${facts([['Role', esc(p.type)], ['Venues', esc(venueNames(u))], ['Email', p.email ? esc(p.email) : '<span class="muted">Not given</span>']])}${block ? `<p class="hint">${esc(block)}</p>` : ''}</section>`
    };
  }
  function renderPerson(main, key) {
    if (!App.can('membership.manage')) { noAccess(main); return; }
    const p = findPerson(key);
    if (!p) {
      main.innerHTML = `<div class="ms-screen">${UI.pageHead('User not found', '', 'This user may have been removed.', '#/members')}</div>`;
      return;
    }
    const part = p.staff ? staffPage(p) : customerPage(p);
    const you = p.user && p.user.id === S().currentUserId ? ` ${UI.badge('You', 'info')}` : '';
    main.innerHTML = `<div class="ms-screen pf-screen ms-person">${UI.pageHead(p.name || p.email, part.actions, part.subtitle, '#/members')}
      ${p.email || you ? `<p class="ms-person-sub">${esc(p.email)}${you}</p>` : ''}
      <section class="card bd-glance" aria-label="This user at a glance">${part.glance}</section>
      <div class="pf-cols"><div>${part.left}</div><div>${part.right}</div></div></div>`;
    main.querySelector('.ms-screen').addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-act]');
      if (!btn) return;
      const user = S().users.find((u) => u.id === btn.dataset.id);
      switch (btn.dataset.act) {
        case 'user-start': startDialog(p); break;
        case 'user-account': editUser(null, { name: p.name, email: p.email, role: 'user' }); break;
        case 'user-edit': if (user) editUser(user); break;
        case 'user-remove': if (user) removeUser(user); break;
        default: break;
      }
    });
  }
  function renderUsers(main) {
    if (!App.can('membership.manage')) { noAccess(main); return; }
    const me = S().currentUserId;
    const all = allPeople();
    const count = (tab) => all.filter((p) => (tab === 'Staff' ? p.staff : !p.staff && p.type === tab)).length;
    if (!['', 'Staff', 'Member', 'Account', 'Guest'].includes(userTab)) userTab = '';
    const rows = all.filter((p) => !userTab || (userTab === 'Staff' ? p.staff : !p.staff && p.type === userTab));
    const action = (act, label, p, id) => `<button type="button" class="btn btn-small${act === 'user-remove' ? ' btn-danger' : ''}" data-act="${act}" data-id="${esc(id)}" aria-label="${esc(label)}: ${esc(p.name || p.email)}">${esc(label)}</button>`;
    const actions = (p) => {
      const list = [];
      list.push(action('user-view', 'View details', p, keyOf(p)));
      if (p.user) list.push(action('user-edit', 'Edit', p, p.user.id));
      else list.push(action('user-account', 'Create account', p, p.email));
      if (!p.staff && !p.isMember) list.push(action('user-start', 'Start membership', p, p.email));
      if (p.user && !removeBlock(p.user)) list.push(action('user-remove', 'Remove access', p, p.user.id));
      return list.join('');
    };
    main.innerHTML = `<div class="ms-screen">${UI.pageHead('Users', '<button type="button" class="btn" data-act="sub-new">New subscription</button><button type="button" class="btn btn-primary" data-act="user-add">Add a user</button>', 'Manage every user here: staff of each role, customer accounts, members and guests.', false)}
      <div class="grid stats">${stat(0, 'users', count('Staff'), 'Staff', 'Marketing admins and club managers')}${stat(1, 'check', count('Member'), 'Members', 'Pay the member price')}${stat(2, 'ticket', count('Account'), 'Accounts', 'Customers with no membership')}${stat(3, 'seat', count('Guest'), 'Guests', 'Booked without an account')}</div>
      ${UI.tabs([['', 'All', all.length], ['Staff', 'Staff', count('Staff')], ['Member', 'Members', count('Member')], ['Account', 'Accounts', count('Account')], ['Guest', 'Guests', count('Guest')]].map(([key, label, n]) => ({ key, label, count: n, on: userTab === key })), { attr: 'data-ms-tab', label: 'Kind of user' })}
      ${UI.table({ subtitle: 'Customers are matched across bookings and accounts by their email.' }, [
    { label: 'User', html: (p) => `<a class="ms-person-link" href="${esc(pageOf(p))}"><b>${esc(p.name || 'No name')}</b></a>${p.user && p.user.id === me ? ` ${UI.badge('You', 'info')}` : ''}<br><span class="muted">${esc(p.email || 'No email')}</span>` },
    { label: 'Type', html: (p) => UI.badge(p.type, p.staff ? 'info' : TYPE_TONE[p.type]) },
    { label: 'Plan or venues', html: (p) => (p.staff ? `<span>${esc(venueNames(p.user))}</span>` : p.subscription ? `<span>${esc(planName(p.subscription.planId))}</span> ${statusBadge(p.subStatus)}` : '<span class="muted">None</span>'), filterValues: (p) => (p.staff ? venueList(p.user) : [p.subscription ? planName(p.subscription.planId) : 'None']) },
    { label: 'Bookings', html: (p) => (p.staff ? '<span class="muted">None</span>' : `<span>${p.bookings}</span>`) },
    { label: 'Spent', html: (p) => (p.staff ? '<span class="muted">None</span>' : `<span>${esc(UI.money(p.spent))}</span>`) },
    { label: 'Last booking', html: (p) => (p.lastBooking ? `<span>${esc(UI.date(p.lastBooking))}</span>` : '<span class="muted">None</span>') },
    { label: 'Actions', html: actions }
  ], rows, { emptyText: 'Nobody here yet.' })}</div>`;
    main.querySelector('.ms-screen').addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-ms-tab]');
      if (t) { userTab = t.dataset.msTab; App.render(); return; }
      const btn = ev.target.closest('button[data-act]');
      if (!btn) {
        /* The whole row opens the user's page. */
        const row = ev.target.closest('tbody tr');
        if (!row || ev.target.closest('a, button, input, select, .row-menu')) return;
        if (window.getSelection && String(window.getSelection())) return;
        const link = row.querySelector('a.ms-person-link');
        if (link) App.go(link.getAttribute('href'));
        return;
      }
      const id = btn.dataset.id, person = all.find((p) => !p.staff && p.email === id), user = S().users.find((u) => u.id === id);
      switch (btn.dataset.act) {
        case 'sub-new': startDialog(null); break;
        case 'user-add': editUser(null); break;
        case 'user-view': App.go(`#/members/${encodeURIComponent(id)}`); break;
        case 'user-start': if (person) startDialog(person); break;
        case 'user-account': if (person) editUser(null, { name: person.name, email: person.email, role: 'user' }); break;
        case 'user-edit': if (user) editUser(user); break;
        case 'user-remove': if (user) removeUser(user); break;
        default: break;
      }
    });
  }

  /* ---------- Subscriptions ---------- */
  let subTab = '', payTab = 'Failed';
  /* A small "are you sure" step with an optional reason, shared by the simple actions. */
  function confirmStep({ title, body, label, kind, reason, run }) {
    UI.dialog({
      title,
      body: `<div class="ms-dialog"><p>${esc(body)}</p>${reason ? field('ms-reason', 'Reason', '<textarea id="ms-reason" rows="2"></textarea>', 'Saved in the history and the activity log.') : ''}</div>`,
      actions: [{ label: 'Go back', kind: 'ghost' }, {
        label, kind: kind || 'primary', onClick: (d, close) => {
          if (!allowed()) return undefined;
          const why = reason ? val(d, 'ms-reason') : '';
          if (reason && !why) { UI.dialogError(d, 'Enter a reason.'); return false; }
          run(why);
          commit(close, 'Saved.');
          return undefined;
        }
      }]
    });
  }
  function changePlan(sub) {
    const options = S().plans.filter((p) => p.active && p.id !== sub.planId);
    if (!options.length) { UI.toast('There is no other plan on sale.', 'bad'); return; }
    UI.dialog({
      title: `Change plan: ${sub.name}`,
      subtitle: `Now on ${planName(sub.planId)}, ${priceText(sub.price, sub.interval)}.`,
      body: `<div class="ms-dialog">${field('ms-c-plan', 'New plan', `<select id="ms-c-plan">${options.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(priceText(p.price, p.interval))})</option>`).join('')}</select>`, 'The new price starts at the next renewal. The renewal date stays the same.')}</div>`,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Change plan', kind: 'primary', onClick: (d, close) => {
          if (!allowed()) return undefined;
          const plan = planOf(d.querySelector('#ms-c-plan').value), old = planName(sub.planId);
          Object.assign(sub, { planId: plan.id, price: plan.price, interval: plan.interval });
          note(sub, `Plan changed from ${old} to ${plan.name}.`);
          App.log('Membership', `Plan changed: ${sub.name}, ${old} to ${plan.name}.`);
          commit(close, 'Plan changed.');
          return undefined;
        }
      }]
    });
  }
  function cancelDialog(sub) {
    UI.dialog({
      title: `Cancel subscription: ${sub.name}`,
      body: `<div class="ms-dialog"><fieldset class="ms-picks"><legend>When</legend>
          <label class="check"><input type="radio" name="ms-when" value="end" checked> <span>At the end of the period, ${esc(UI.date(sub.renewsAt))}. They keep the member price until then.</span></label>
          <label class="check"><input type="radio" name="ms-when" value="now"> <span>Now. The member price stops straight away.</span></label></fieldset>
        ${field('ms-reason', 'Reason', '<textarea id="ms-reason" rows="2"></textarea>', 'Saved in the history and the activity log.')}
        ${UI.demo('no refund is worked out here.')}</div>`,
      actions: [{ label: 'Keep subscription', kind: 'ghost' }, {
        label: 'Cancel subscription', kind: 'danger', onClick: (d, close) => {
          if (!allowed()) return undefined;
          const why = val(d, 'ms-reason'), when = d.querySelector('input[name="ms-when"]:checked').value;
          if (!why) { UI.dialogError(d, 'Enter a reason.'); return false; }
          /* A payment still owed will not be paid now, so it stops showing as failed. */
          if (when === 'now' && sub.status === 'failed') Core.settleSubPayment(S(), sub, 'Not paid', Core.toLocalISO(App.now()));
          if (when === 'now') Object.assign(sub, { status: 'cancelled', cancelledAt: Core.toLocalISO(App.now()), cancelAtEnd: false });
          else sub.cancelAtEnd = true;
          sub.cancelReason = why;
          const text = when === 'now' ? `Cancelled now. Reason: ${why}` : `Set to cancel on ${UI.date(sub.renewsAt)}. Reason: ${why}`;
          note(sub, text);
          App.log('Membership', `Subscription: ${sub.name}. ${text}`);
          commit(close, 'Subscription cancelled.');
          return undefined;
        }
      }]
    });
  }
  function historyDialog(sub) {
    UI.dialog({
      title: `History: ${sub.name}`,
      subtitle: `${planName(sub.planId)}, joined ${UI.date(sub.startedAt)}.`,
      body: `<ul class="ms-history">${sub.history.map((h) => `<li><b>${esc(UI.dateTime(h.at))}</b> <span class="muted">${esc(h.by)}</span><br>${esc(h.text)}</li>`).join('') || '<li>Nothing recorded.</li>'}</ul>`
    });
  }
  function subActions(sub, status) {
    const b = (act, label, extra) => `<button type="button" class="btn btn-small${extra || ''}" data-act="${act}" data-id="${esc(sub.id)}" aria-label="${esc(label)}: ${esc(sub.name)}">${esc(label)}</button>`;
    const list = [];
    if (status === 'Active') {
      list.push(b('renew', 'Record renewal'), b('change', 'Change plan'));
      if (sub.cancelAtEnd) list.push(b('keep', 'Do not cancel'));
      else list.push(b('pause', 'Pause'), b('failed', 'Mark payment failed'), b('cancel', 'Cancel', ' btn-danger'));
    } else if (status === 'Payment failed') list.push(b('paid', 'Mark as paid'), b('cancel', 'Cancel', ' btn-danger'));
    else if (status === 'Paused') list.push(b('resume', 'Resume'), b('cancel', 'Cancel', ' btn-danger'));
    else list.push(b('again', 'Start again'));
    return list.concat(b('history', 'History')).join('');
  }
  /* ---------- Payments tab ---------- */
  const PAY_TABS = [['Failed', 'Failed'], ['Succeeded', 'Succeeded'], ['Recovered', 'Paid after failing'], ['Upcoming', 'Upcoming'], ['', 'All']];
  const PAY_LOOK = { Succeeded: ['Succeeded', 'good'], Failed: ['Failed', 'bad'], Recovered: ['Paid after failing', 'info'], Upcoming: ['Upcoming', 'quiet'], 'Not paid': ['Not paid', 'warn'] };
  /* Every stored payment, plus the next one due on each subscription that will renew. */
  function paymentRows(all) {
    const rows = [];
    all.forEach((x) => {
      (x.sub.payments || []).forEach((p) => rows.push({ x, p }));
      if (x.status === 'Active' && !x.sub.cancelAtEnd) rows.push({ x, p: { id: `next-${x.sub.id}`, at: x.sub.renewsAt, amount: x.sub.price, status: 'Upcoming', note: 'Next renewal' } });
    });
    return rows;
  }
  function paymentsHtml(all) {
    const rows = paymentRows(all);
    const tally = (key) => (key ? rows.filter((r) => r.p.status === key).length : rows.length);
    /* Soonest first for what is coming, newest first for what has happened. */
    const shown = rows.filter((r) => !payTab || r.p.status === payTab)
      .sort((a, c) => (payTab === 'Upcoming' ? a.p.at.localeCompare(c.p.at) : c.p.at.localeCompare(a.p.at)));
    return `${UI.tabs(PAY_TABS.map(([key, label]) => ({ key, label, count: tally(key), on: payTab === key })), { sub: true, attr: 'data-ms-pay', label: 'Payment status' })}
      ${UI.table({ title: 'Payments', subtitle: 'Test payments only: nothing renews or charges on its own.' }, [
    { label: 'Member', html: (r) => `<a href="${esc(pageForEmail(r.x.sub.email))}"><b>${esc(r.x.sub.name)}</b></a><br><span class="muted">${esc(r.x.sub.email)}</span>` },
    { label: 'Plan', html: (r) => `<span>${esc(planName(r.x.sub.planId))}</span>` },
    { label: 'Amount', html: (r) => `<span>${esc(UI.money(r.p.amount))}</span>` },
    { label: 'Date', html: (r) => `<span>${esc(UI.date(r.p.at))}</span>` },
    { label: 'Status', html: (r) => UI.badge(PAY_LOOK[r.p.status][0], PAY_LOOK[r.p.status][1]) },
    { label: 'Details', html: (r) => `<span>${esc(r.p.note)}${r.p.settledAt && r.p.status === 'Recovered' ? `, paid ${esc(UI.date(r.p.settledAt))}` : ''}</span>` },
    { label: 'Actions', html: (r) => (r.p.status === 'Failed' && r.x.status === 'Payment failed' ? subActions(r.x.sub, r.x.status)
      : `<button type="button" class="btn btn-small" data-act="history" data-id="${esc(r.x.sub.id)}" aria-label="History: ${esc(r.x.sub.name)}">History</button>`) }
  ], shown, { emptyText: payTab === 'Failed' ? 'No failed payments. Nothing is owed.' : 'No payments here.' })}`;
  }
  function runSubAction(act, sub) {
    const now = App.now(), log = (text) => { note(sub, text); App.log('Membership', `Subscription: ${sub.name}. ${text}`); };
    switch (act) {
      case 'change': changePlan(sub); break;
      case 'cancel': cancelDialog(sub); break;
      case 'history': historyDialog(sub); break;
      case 'again': startDialog({ name: sub.name, email: sub.email }); break;
      case 'renew':
        confirmStep({ title: `Record renewal: ${sub.name}`, body: `Records a test payment of ${UI.money(sub.price)} and moves the renewal date on by one ${every(sub.interval)}. Nothing is charged.`, label: 'Record renewal', run: () => { Core.addSubPayment(S(), sub, { at: Core.toLocalISO(now), amount: sub.price, status: 'Succeeded', note: 'Renewal' }); sub.renewsAt = Core.nextRenewal(sub, now); log(`Renewed for ${UI.money(sub.price)} (test payment). Next renewal ${UI.date(sub.renewsAt)}.`); } });
        break;
      case 'pause':
        confirmStep({ title: `Pause: ${sub.name}`, body: 'The member price stops until the subscription is resumed.', label: 'Pause', reason: true, run: (why) => { sub.status = 'paused'; log(`Paused. Reason: ${why}`); } });
        break;
      case 'resume':
        confirmStep({ title: `Resume: ${sub.name}`, body: 'The member price starts again straight away.', label: 'Resume', run: () => { sub.status = 'active'; if (new Date(sub.renewsAt) <= now) sub.renewsAt = Core.nextRenewal(sub, now); log(`Resumed. Next renewal ${UI.date(sub.renewsAt)}.`); } });
        break;
      case 'failed':
        confirmStep({ title: `Payment failed: ${sub.name}`, body: `They keep the member price for ${Core.MEMBER_GRACE_DAYS} more days, then it stops until they pay.`, label: 'Mark payment failed', run: () => { Object.assign(sub, { status: 'failed', failedAt: Core.toLocalISO(now) }); Core.addSubPayment(S(), sub, { at: sub.failedAt, amount: sub.price, status: 'Failed', note: 'Renewal' }); log('Payment marked as failed.'); } });
        break;
      case 'paid':
        confirmStep({ title: `Mark as paid: ${sub.name}`, body: `Records a test payment of ${UI.money(sub.price)}. The subscription becomes active again.`, label: 'Mark as paid', run: () => { Core.settleSubPayment(S(), sub, 'Recovered', Core.toLocalISO(now)); sub.status = 'active'; delete sub.failedAt; if (new Date(sub.renewsAt) <= now) sub.renewsAt = Core.nextRenewal(sub, now); log(`Payment received: ${UI.money(sub.price)} (test payment).`); } });
        break;
      case 'keep':
        confirmStep({ title: `Do not cancel: ${sub.name}`, body: `The subscription carries on and renews on ${UI.date(sub.renewsAt)}.`, label: 'Do not cancel', run: () => { sub.cancelAtEnd = false; delete sub.cancelReason; log('Cancellation taken back.'); } });
        break;
      default: break;
    }
  }
  function renderSubscriptions(main, params) {
    if (!App.can('membership.manage')) { noAccess(main); return; }
    const s = S(), now = App.now();
    const onlyId = (params || []).map((p) => String(p).split('?')[0]).find(Boolean) || '';
    const all = s.subscriptions.map((sub) => ({ sub, status: Core.subStatus(sub, now) })).sort((a, c) => a.sub.name.localeCompare(c.sub.name));
    const count = (st) => all.filter((x) => x.status === st).length;
    const live = all.filter((x) => x.status === 'Active');
    const income = Core.round2(live.reduce((n, x) => n + (x.sub.interval === 'year' ? x.sub.price / 12 : x.sub.price), 0));
    const STATES = ['Active', 'Payments', 'Paused', 'Cancelled', 'Expired'];
    /* The Payments tab counts what needs attention: the payments still owed. */
    const tabCount = (st) => (st === 'Payments' ? paymentRows(all).filter((r) => r.p.status === 'Failed').length : count(st));
    if (subTab && !STATES.includes(subTab)) subTab = '';
    const rows = onlyId ? all.filter((x) => x.sub.id === onlyId) : all.filter((x) => !subTab || x.status === subTab);
    const add = '<button type="button" class="btn btn-primary" data-act="sub-new">New subscription</button>';
    main.innerHTML = `<div class="ms-screen">${onlyId ? UI.pageHead('Subscription', '', rows.length ? rows[0].sub.email : 'We could not find this subscription.', '#/subscriptions') : UI.pageHead('Subscriptions', add, 'Each member\'s plan, status and renewal date.', false)}
      ${onlyId ? '' : `<div class="grid stats">${stat(0, 'check', count('Active'), 'Active', `${all.filter((x) => x.status === 'Active' && x.sub.cancelAtEnd).length} set to cancel`)}${stat(1, 'alert', count('Payment failed'), 'Payment failed', `Member price stops after ${Core.MEMBER_GRACE_DAYS} days`)}${stat(2, 'clock', count('Paused'), 'Paused', 'No member price')}${stat(3, 'wallet', UI.money(income), 'Monthly income', 'Active plans, yearly shown per month')}</div>
      ${UI.tabs([['', 'All', all.length]].concat(STATES.map((st) => [st, st, tabCount(st)])).map(([key, label, n]) => ({ key, label, count: n, on: subTab === key })), { attr: 'data-ms-tab', label: 'Subscription status' })}`}
      ${!onlyId && subTab === 'Payments' ? paymentsHtml(all) : UI.table({ subtitle: 'Test payments only: nothing renews or charges on its own.' }, [
    { label: 'Member', html: (x) => `<a href="${esc(pageForEmail(x.sub.email))}"><b>${esc(x.sub.name)}</b></a><br><span class="muted">${esc(x.sub.email)}</span>` },
    { label: 'Plan', html: (x) => `<span>${esc(planName(x.sub.planId))}</span>` },
    { label: 'Price', html: (x) => `<span>${esc(priceText(x.sub.price, x.sub.interval))}</span>` },
    { label: 'Status', html: (x) => `${statusBadge(x.status)}${x.status === 'Active' && x.sub.cancelAtEnd ? ` ${UI.badge('Set to cancel', 'warn')}` : ''}` },
    { label: 'Started', html: (x) => `<span>${esc(UI.date(x.sub.startedAt))}</span>` },
    { label: 'Renews or ends', html: (x) => `<span>${esc(UI.date(x.status === 'Cancelled' && x.sub.cancelledAt ? x.sub.cancelledAt : x.sub.renewsAt))}</span>` },
    { label: 'Actions', html: (x) => subActions(x.sub, x.status) }
  ], rows, { emptyText: 'No subscriptions here.' })}</div>`;
    main.querySelector('.ms-screen').addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-ms-tab]');
      if (t) { subTab = t.dataset.msTab; App.render(); return; }
      const pay = ev.target.closest('[data-ms-pay]');
      if (pay) { payTab = pay.dataset.msPay; App.render(); return; }
      const btn = ev.target.closest('button[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'sub-new') { startDialog(null); return; }
      const sub = s.subscriptions.find((x) => x.id === btn.dataset.id);
      if (sub) runSubAction(btn.dataset.act, sub);
    });
  }

  /* ---------- Plans and offers ---------- */
  let planTab = 'plans';
  function planDialog(plan) {
    const s = S();
    UI.dialog({
      title: plan ? `Edit ${plan.name}` : 'Add a plan',
      subtitle: 'Anyone with an active plan gets the member price set on each event.',
      body: `<div class="ms-dialog">${input('ms-p-name', 'Name', plan ? plan.name : '')}
        ${input('ms-p-price', 'Price (£)', plan ? plan.price : '', 'number', plan ? 'A new price is for new subscribers. People already on this plan keep their price.' : '', 'min="0.01" step="0.01"')}
        ${field('ms-p-int', 'Billing', `<select id="ms-p-int">${UI.options([{ value: 'month', label: 'Every month' }, { value: 'year', label: 'Every year' }], plan ? plan.interval : 'month')}</select>`)}
        ${input('ms-p-desc', 'Description (optional)', plan ? plan.description : '')}</div>`,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save', kind: 'primary', onClick: (d, close) => {
          if (!allowed()) return undefined;
          const name = val(d, 'ms-p-name'), price = Number(val(d, 'ms-p-price')), interval = d.querySelector('#ms-p-int').value, description = val(d, 'ms-p-desc');
          if (!name) { UI.dialogError(d, 'Enter a name.'); return false; }
          if (s.plans.some((p) => p !== plan && p.name.toLowerCase() === name.toLowerCase())) { UI.dialogError(d, 'There is already a plan with this name.'); return false; }
          if (!(price > 0)) { UI.dialogError(d, 'Enter a price above £0.'); return false; }
          if (plan) {
            const before = `${plan.name}, ${priceText(plan.price, plan.interval)}`;
            Object.assign(plan, { name, price: Core.round2(price), interval, description });
            App.log('Membership', `Plan edited: ${before} is now ${name}, ${priceText(plan.price, interval)}.`);
          } else {
            s.plans.push({ id: Core.nextId(s, 'pl'), name, price: Core.round2(price), interval, description, active: true });
            App.log('Membership', `Plan added: ${name}, ${priceText(price, interval)}.`);
          }
          commit(close, 'Plan saved.');
          return undefined;
        }
      }]
    });
  }
  function offerDialog(offer) {
    const s = S(), today = Core.dayKey(App.now());
    UI.dialog({
      title: offer ? `Edit ${offer.name}` : 'Add an offer',
      subtitle: 'Money off the first payment when someone subscribes. For money off events, use Discount codes.',
      body: `<div class="ms-dialog">${input('ms-o-name', 'Name', offer ? offer.name : '')}
        ${field('ms-o-plan', 'Plan', `<select id="ms-o-plan">${UI.options([{ value: '', label: 'All plans' }].concat(s.plans.map((p) => ({ value: p.id, label: p.name }))), offer ? offer.planId : '')}</select>`)}
        ${field('ms-o-type', 'Discount', `<select id="ms-o-type">${UI.options([{ value: 'percent', label: 'Percent off' }, { value: 'fixed', label: 'Fixed amount off (£)' }], offer ? offer.type : 'percent')}</select>`)}
        ${input('ms-o-value', 'Amount', offer ? offer.value : '', 'number', '', 'min="0.01" step="0.01"')}
        ${input('ms-o-start', 'Starts', offer ? offer.startsOn : today, 'date')}
        ${input('ms-o-end', 'Ends (optional)', offer ? offer.endsOn : '', 'date')}</div>`,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save', kind: 'primary', onClick: (d, close) => {
          if (!allowed()) return undefined;
          const name = val(d, 'ms-o-name'), planId = d.querySelector('#ms-o-plan').value, type = d.querySelector('#ms-o-type').value, value = Number(val(d, 'ms-o-value')), startsOn = val(d, 'ms-o-start'), endsOn = val(d, 'ms-o-end');
          if (!name) { UI.dialogError(d, 'Enter a name.'); return false; }
          if (s.offers.some((o) => o !== offer && o.name.toLowerCase() === name.toLowerCase())) { UI.dialogError(d, 'There is already an offer with this name.'); return false; }
          if (!(value > 0)) { UI.dialogError(d, 'Enter an amount above 0.'); return false; }
          if (type === 'percent' && value > 100) { UI.dialogError(d, 'A percent cannot be more than 100.'); return false; }
          if (!startsOn) { UI.dialogError(d, 'Choose a start date.'); return false; }
          if (endsOn && endsOn < startsOn) { UI.dialogError(d, 'The end date is before the start date.'); return false; }
          const fields = { name, planId, type, value: Core.round2(value), startsOn, endsOn };
          if (offer) { Object.assign(offer, fields, { ended: false }); App.log('Membership', `Offer edited: ${name}, ${Core.offerText(offer)}.`); }
          else { const o = Object.assign({ id: Core.nextId(s, 'of') }, fields); s.offers.push(o); App.log('Membership', `Offer added: ${name}, ${Core.offerText(o)}.`); }
          commit(close, 'Offer saved.');
          return undefined;
        }
      }]
    });
  }
  function renderPlans(main) {
    if (!App.can('membership.manage')) { noAccess(main); return; }
    const s = S(), now = App.now();
    if (!['plans', 'offers'].includes(planTab)) planTab = 'plans';
    const onPlan = (id) => s.subscriptions.filter((x) => x.planId === id);
    const liveOn = (id) => onPlan(id).filter((x) => !['Cancelled', 'Expired'].includes(Core.subStatus(x, now))).length;
    const used = (id) => s.subscriptions.filter((x) => x.offerId === id).length;
    const plansTable = () => UI.table({ subtitle: 'What people can subscribe to. A plan that has been used can be retired, not deleted.' }, [
      { label: 'Plan', html: (p) => `<b>${esc(p.name)}</b>${p.description ? `<br><span class="muted">${esc(p.description)}</span>` : ''}` },
      { label: 'Price', html: (p) => `<span>${esc(priceText(p.price, p.interval))}</span>` },
      { label: 'Members', html: (p) => `<span>${liveOn(p.id)}</span>` },
      { label: 'Status', html: (p) => UI.badge(p.active ? 'On sale' : 'Retired', p.active ? 'good' : 'quiet') },
      { label: 'Actions', html: (p) => `<button type="button" class="btn btn-small" data-act="plan-edit" data-id="${esc(p.id)}" aria-label="Edit ${esc(p.name)}">Edit</button><button type="button" class="btn btn-small" data-act="plan-toggle" data-id="${esc(p.id)}" aria-label="${p.active ? 'Retire' : 'Put back on sale'}: ${esc(p.name)}">${p.active ? 'Retire' : 'Put back on sale'}</button>${onPlan(p.id).length ? '' : `<button type="button" class="btn btn-small btn-danger" data-act="plan-delete" data-id="${esc(p.id)}" aria-label="Delete ${esc(p.name)}">Delete</button>`}` }
    ], s.plans, { emptyText: 'No plans yet. Add one so people can subscribe.' });
    const offersTable = () => UI.table({ subtitle: 'Money off the first payment. Later payments are the full plan price.' }, [
      { label: 'Offer', html: (o) => `<b>${esc(o.name)}</b>` },
      { label: 'Discount', html: (o) => `<span>${esc(Core.offerText(o))}</span>` },
      { label: 'Plan', html: (o) => `<span>${esc(o.planId ? planName(o.planId) : 'All plans')}</span>` },
      { label: 'Dates', html: (o) => `<span>${esc(UI.date(o.startsOn))}${o.endsOn ? ` to ${esc(UI.date(o.endsOn))}` : ', no end date'}</span>` },
      { label: 'Used', html: (o) => `<span>${used(o.id)}</span>` },
      { label: 'Status', html: (o) => { const st = Core.offerStatus(o, now); return UI.badge(st, st === 'Live' ? 'good' : st === 'Starts later' ? 'info' : 'quiet'); } },
      { label: 'Actions', html: (o) => `<button type="button" class="btn btn-small" data-act="offer-edit" data-id="${esc(o.id)}" aria-label="Edit ${esc(o.name)}">Edit</button>${Core.offerStatus(o, now) === 'Ended' ? '' : `<button type="button" class="btn btn-small" data-act="offer-end" data-id="${esc(o.id)}" aria-label="End ${esc(o.name)}">End offer</button>`}${used(o.id) ? '' : `<button type="button" class="btn btn-small btn-danger" data-act="offer-delete" data-id="${esc(o.id)}" aria-label="Delete ${esc(o.name)}">Delete</button>`}` }
    ], s.offers, { emptyText: 'No offers yet.' });
    const action = planTab === 'plans' ? '<button type="button" class="btn btn-primary" data-act="plan-add">Add a plan</button>' : '<button type="button" class="btn btn-primary" data-act="offer-add">Add an offer</button>';
    main.innerHTML = `<div class="ms-screen">${UI.pageHead('Plans and offers', action, 'What people can subscribe to, and any money off when they join.', false)}
      ${UI.tabs([{ key: 'plans', label: 'Plans', count: s.plans.length, on: planTab === 'plans' }, { key: 'offers', label: 'Offers', count: s.offers.length, on: planTab === 'offers' }], { attr: 'data-ms-tab', label: 'Plans and offers sections' })}
      ${planTab === 'plans' ? plansTable() : offersTable()}</div>`;
    main.querySelector('.ms-screen').addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-ms-tab]');
      if (t) { planTab = t.dataset.msTab; App.render(); return; }
      const btn = ev.target.closest('button[data-act]');
      if (!btn) return;
      const plan = s.plans.find((p) => p.id === btn.dataset.id), offer = s.offers.find((o) => o.id === btn.dataset.id);
      switch (btn.dataset.act) {
        case 'plan-add': planDialog(null); break;
        case 'offer-add': offerDialog(null); break;
        case 'plan-edit': if (plan) planDialog(plan); break;
        case 'offer-edit': if (offer) offerDialog(offer); break;
        case 'plan-toggle':
          if (plan) confirmStep({ title: `${plan.active ? 'Retire' : 'Put back on sale'}: ${plan.name}`, body: plan.active ? 'Nobody new can join this plan. People already on it stay on it.' : 'People can join this plan again.', label: plan.active ? 'Retire plan' : 'Put back on sale', run: () => { plan.active = !plan.active; App.log('Membership', `Plan ${plan.active ? 'put back on sale' : 'retired'}: ${plan.name}.`); } });
          break;
        case 'plan-delete':
          if (plan && !onPlan(plan.id).length) confirmStep({ title: `Delete ${plan.name}?`, body: 'Nobody has used this plan. This cannot be undone.', label: 'Delete plan', kind: 'danger', run: () => { s.plans.splice(s.plans.indexOf(plan), 1); s.offers.forEach((o) => { if (o.planId === plan.id) o.planId = ''; }); App.log('Membership', `Plan deleted: ${plan.name}.`); } });
          break;
        case 'offer-end':
          if (offer) confirmStep({ title: `End ${offer.name}?`, body: 'Nobody new can use it. People who already used it are not changed.', label: 'End offer', run: () => { offer.ended = true; App.log('Membership', `Offer ended: ${offer.name}.`); } });
          break;
        case 'offer-delete':
          if (offer && !used(offer.id)) confirmStep({ title: `Delete ${offer.name}?`, body: 'Nobody has used this offer. This cannot be undone.', label: 'Delete offer', kind: 'danger', run: () => { s.offers.splice(s.offers.indexOf(offer), 1); App.log('Membership', `Offer deleted: ${offer.name}.`); } });
          break;
        default: break;
      }
    });
  }

  App.route('members', { title: 'Users', perm: 'membership.manage', render: (main, params) => { const key = (params || []).map((x) => String(x).split('?')[0]).find(Boolean); if (key) renderPerson(main, key); else renderUsers(main); } });
  App.route('subscriptions', { title: 'Subscriptions', perm: 'membership.manage', render: renderSubscriptions });
  App.route('plans', { title: 'Plans and offers', perm: 'membership.manage', render: renderPlans });
})();
