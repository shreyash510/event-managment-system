/* My profile: every role has this page, and it shows what matters for that role.
   Marketing admin and club manager: their details, what they can do, the limits on it, and what they did recently.
   Normal user: their details, next booking, membership and preferences.
   Guest: no account yet, so the page offers one.
   #/account                     the profile
   #/account/new[/<eventId>]     create an account (guests)
   #/account/membership[/<eventId>]   choose and buy a membership. A guest creates an account first.
   With an event id, the person goes back to that event afterwards, now on the member price.
   Payments are test records only (see js/pay.js), and nothing renews on its own. */
(function () {
  'use strict';
  const S = () => App.state;
  const esc = (v) => UI.esc(v);
  const validEmail = (x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const THEMES = [{ value: 'system', label: 'Same as my device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }];
  const STATUS_TONE = { Active: 'good', 'Payment failed': 'bad', Paused: 'warn', Cancelled: 'quiet', Expired: 'quiet' };
  /* What each role can do, read from the same permissions the rest of the app checks. */
  const CAN = [
    ['events.edit', 'Create, edit and duplicate events'],
    ['events.cancel', 'Cancel events and sessions'],
    ['pricing.edit', 'Set prices, member prices and block prices'],
    ['bookings.modify', 'Add, change and transfer bookings'],
    ['refund.full', 'Cancel bookings and give refunds'],
    ['refund.approve', 'Approve refunds and new events sent by club managers'],
    ['checkin', 'See attendee lists and check people in'],
    ['codes.edit', 'Create and manage discount codes'],
    ['reports', 'See reports'],
    ['club.manage', 'Edit venue details'],
    ['venues.manage', 'Add a venue or change its name'],
    ['membership.manage', 'Manage users, subscriptions and plans'],
    ['settings', 'Change settings and see the activity log']
  ];

  const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  const stat = (i, icon, value, label, note) => `<div class="stat">${UI.statIcon(icon, UI.statTone(i))}<b>${esc(value)}</b><span>${esc(label)}</span><small>${esc(note)}</small></div>`;
  const facts = (rows) => `<dl class="pf-dl">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  const field = (id, label, control, hint) => `<div class="field"><span><label for="${id}">${esc(label)}</label></span>${control}${hint ? `<p class="hint">${esc(hint)}</p>` : ''}</div>`;
  const textInput = (id, label, value, type, extra, hint) => field(id, label, `<input id="${id}" type="${type}" value="${esc(value || '')}" ${extra}>`, hint);
  const eventFrom = (id) => { const e = id ? Core.findEvent(S(), id) : null; return e && window.FindEvents && FindEvents.canShow(e) ? e : null; };
  const eventHash = (e) => `#/browse/${encodeURIComponent(e.id)}`;
  const buyHash = (e) => `#/account/membership${e ? `/${encodeURIComponent(e.id)}` : ''}`;
  const isLive = (sub) => !!sub && !['Cancelled', 'Expired'].includes(Core.subStatus(sub, App.now()));
  const planOf = (id) => S().plans.find((p) => p.id === id);
  const priceText = (price, interval) => `${UI.money(price)} a ${interval === 'year' ? 'year' : 'month'}`;
  const done = (message, hash) => {
    App.save();
    if (hash && location.hash !== hash) App.go(hash); else App.render();
    if (message) UI.toast(message);
  };

  function hero(u, extra) {
    return `<section class="card pf-hero"><span class="pf-avatar" aria-hidden="true">${esc(initials(u.name))}</span>
      <div class="pf-who"><h2>${esc(u.name)}</h2><p class="muted">${esc(u.email || 'No email added')}</p><p>${extra}</p></div>
      <button type="button" class="btn" data-pf="edit">Edit details</button></section>`;
  }
  const appearance = () => `<section class="card"><h2>Appearance</h2>${field('pf-theme', 'Theme', `<select id="pf-theme">${UI.options(THEMES, App.theme())}</select>`)}</section>`;

  /* ---------- Editing your own details ---------- */
  function editDetails() {
    const u = App.user(), customer = u.role === 'user';
    UI.dialog({
      title: 'Edit your details',
      subtitle: 'Only you can change these here.',
      body: `<div class="pf-form">${textInput('pf-name', 'Name', u.name, 'text', 'autocomplete="name" maxlength="80"')}
        ${textInput('pf-email', customer ? 'Email' : 'Email (optional)', u.email, 'email', 'autocomplete="email" maxlength="120"', customer ? 'Your bookings and membership move to the new email.' : '')}
        ${textInput('pf-phone', 'Phone (optional)', u.phone, 'tel', 'autocomplete="tel" maxlength="30"', customer ? 'We fill this in for you at checkout.' : '')}
        ${customer ? UI.demo('the live system would send a link to confirm a new email before moving anything to it.') : ''}</div>`,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save details', kind: 'primary', onClick: (d, close) => {
          const name = d.querySelector('#pf-name').value.trim(), email = d.querySelector('#pf-email').value.trim(), phone = d.querySelector('#pf-phone').value.trim();
          const bad = !name ? 'Enter your name.' : customer && !email ? 'Enter your email.' : email && !validEmail(email) ? 'Your email does not look right.'
            : email && Core.emailTaken(S(), email, u.id) ? 'Someone else already uses this email.' : '';
          if (bad) { UI.dialogError(d, bad); return false; }
          const oldEmail = u.email || '', movedEmail = oldEmail.toLowerCase() !== email.toLowerCase();
          const changed = u.name !== name || movedEmail || (u.phone || '') !== phone;
          if (u.name !== name) {
            /* The activity log keeps the name used at the time, so remember the old one to keep showing those actions. */
            u.formerNames = (u.formerNames || []).concat(u.name);
            u.name = name;
            if (customer) (S().subscriptions || []).filter((x) => x.email === oldEmail.toLowerCase()).forEach((x) => { x.name = name; });
          }
          if (customer && movedEmail) Core.moveCustomerEmail(S(), oldEmail, email);
          u.email = customer ? email.toLowerCase() : email;
          u.phone = phone;
          close();
          if (changed) App.log('Account', `${name} updated their own details.`);
          done(changed ? 'Your details are saved.' : 'Nothing to change.');
          return undefined;
        }
      }]
    });
  }

  /* ---------- Marketing admin and club manager ---------- */
  function limitsFor(u) {
    if (u.role !== 'manager') return [];
    const set = S().settings, limit = Core.managerRefundLimit(set), floor = Number(set.minTicketPrice) || 0;
    return [
      Number.isFinite(limit) && limit > 0 ? `You can refund up to ${UI.money(limit)} inside the refund policy. Anything more goes to the marketing admin to approve.` : 'A refund outside the refund policy goes to the marketing admin to approve.',
      'A new event waits for marketing to approve it. A copy of an event that is already live publishes straight away.',
      floor > 0 ? `You cannot set a ticket price below ${UI.money(floor)}.` : '',
      'Marketing is told when you change a price.'
    ].filter(Boolean);
  }
  function myActions(u) {
    const names = [u.name].concat(u.formerNames || []);
    return (S().audit || []).filter((a) => names.includes(a.by));
  }
  function renderStaff(main, u) {
    const s = S(), now = App.now(), today = Core.dayKey(now);
    const all = Core.allVenues(u);
    const venues = all ? s.venues : Core.userVenueIds(u).map((id) => Core.findVenue(s, id)).filter(Boolean);
    const events = s.events.filter((e) => Core.canSeeVenue(u, e.venueId));
    const onSale = events.filter((e) => Core.eventStatus(s, e, now) === 'On sale').length;
    const sessionsToday = events.reduce((n, e) => n + e.sessions.filter((x) => !x.cancelled && Core.dayKey(x.start) === today).length, 0);
    const actions = myActions(u), month = actions.filter((a) => now - new Date(a.at) < 30 * 86400000).length;
    const can = CAN.filter(([perm]) => App.can(perm)), limits = limitsFor(u);
    const admin = App.can('membership.manage');
    main.innerHTML = `<div class="pf-screen">${UI.pageHead('My profile', '', 'Your details, what you can do, and what you did recently.', false)}
      ${hero(u, UI.badge(Core.ROLE_NAMES[u.role] || u.role, 'info'))}
      <div class="grid stats">${stat(0, 'pin', venues.length, venues.length === 1 ? 'My venue' : 'My venues', all ? 'All venues' : venues.map((v) => v.name).join(', ') || 'None yet')}${stat(1, 'calendar', onSale, 'Events on sale', 'At your venues')}${stat(2, 'clock', sessionsToday, 'Sessions today', 'At your venues')}${stat(3, 'check', month, 'My actions', 'In the last 30 days')}</div>
      <div class="pf-cols"><div>
        <section class="card"><h2>What you can do</h2><ul class="pf-ticks">${can.map(([, text]) => `<li>${esc(text)}</li>`).join('')}</ul></section>
        ${limits.length ? `<section class="card"><h2>Your limits</h2><ul class="pf-list">${limits.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
        <section class="card" id="pf-activity"><h2>Recent activity</h2>${actions.length ? `<ul class="pf-list">${actions.slice(0, 8).map((a) => `<li><b>${esc(a.type)}</b> ${esc(a.text)}<small class="muted">${esc(UI.dateTime(a.at))}</small></li>`).join('')}</ul>` : '<p class="muted">Nothing yet. What you do here will show in this list.</p>'}
          ${App.can('settings') ? '<a class="btn btn-ghost btn-small" href="#/activity">See all activity</a>' : ''}</section>
      </div><div>
        <section class="card"><h2>Your access</h2>${facts([['Role', esc(Core.ROLE_NAMES[u.role] || u.role)], ['Venues', all ? 'All venues' : esc(venues.map((v) => v.name).join(', ') || 'No venue yet. Ask a marketing admin.')], ['Phone', esc(u.phone || 'Not added')]])}
          <p class="hint">${admin ? 'People, roles and venues are on the <a href="#/members">Users</a> page.' : 'A marketing admin changes your role and venues.'}</p></section>
        ${appearance()}
      </div></div></div>`;
  }

  /* ---------- Normal user ---------- */
  function membershipCard(u) {
    const s = S(), now = App.now(), sub = Core.subscriptionFor(s, u.email, now), status = sub ? Core.subStatus(sub, now) : '';
    const head = `<div class="pf-card-head"><h2>Membership</h2>${status ? UI.badge(status, STATUS_TONE[status]) : ''}</div>`;
    const join = (label) => `<a class="btn btn-primary" href="${buyHash()}">${label}</a>`;
    const plans = s.plans.filter((p) => p.active);
    if (!isLive(sub)) {
      const ended = sub ? `Your ${esc((planOf(sub.planId) || {}).name || '')} membership ended on ${esc(UI.date(sub.status === 'cancelled' ? sub.cancelledAt || sub.renewsAt : sub.renewsAt))}. ` : '';
      return `<section class="card pf-member" id="pf-membership">${head}<p>${ended}Members pay less on events, and the member price is applied for you when you book.</p>
        ${plans.length ? `<p class="muted">From ${esc(priceText(Math.min(...plans.map((p) => p.price)), plans.slice().sort((a, b) => a.price - b.price)[0].interval))}.</p>${join(sub ? 'Join again' : 'Become a member')}` : '<p class="muted">Memberships are not on offer right now.</p>'}</section>`;
    }
    const plan = planOf(sub.planId), name = plan ? plan.name : 'Membership';
    const rows = [['Plan', esc(name)], ['Price', esc(priceText(sub.price, sub.interval))], ['Member since', esc(UI.date(sub.startedAt))]];
    let text = '', buttons = '';
    if (status === 'Active' && sub.cancelAtEnd) {
      rows.push(['Ends on', esc(UI.date(sub.renewsAt))]);
      text = 'You keep the member price until then, and you will not be charged again.';
      buttons = '<button type="button" class="btn" data-pf="keep">Keep my membership</button>';
    } else if (status === 'Active') {
      rows.push(['Next payment', esc(UI.date(sub.renewsAt))]);
      text = 'The member price is applied for you when you book.';
      buttons = '<button type="button" class="btn btn-ghost" data-pf="cancel">Cancel membership</button>';
    } else if (status === 'Payment failed') {
      text = Core.subGivesMemberPrice(sub, now) ? `Your last payment failed. You keep the member price for up to ${Core.MEMBER_GRACE_DAYS} days after that, so please pay soon.` : 'Your last payment failed, so the member price has stopped until you pay.';
      buttons = `<button type="button" class="btn btn-primary" data-pf="pay">Pay ${esc(UI.money(sub.price))}</button>`;
    } else if (status === 'Paused') {
      text = 'The club team has paused your membership, so the member price has stopped. Contact your club to start it again.';
    }
    return `<section class="card pf-member" id="pf-membership">${head}${facts(rows)}<p>${esc(text)}</p>${buttons}</section>`;
  }
  /* Saved on the account, or for an older account, what they last agreed to on a booking. */
  const wantsNews = (u, mine) => (u.marketingConsent !== undefined ? u.marketingConsent : mine.some((b) => b.customer.marketingConsent));
  function renderCustomer(main, u) {
    const s = S(), now = App.now(), mine = window.MyBookings ? MyBookings.mine() : [];
    const upcoming = mine.filter((b) => MyBookings.kind(b) === 'upcoming').sort((a, b) => MyBookings.nextStart(a).localeCompare(MyBookings.nextStart(b)));
    const past = mine.filter((b) => MyBookings.kind(b) === 'past');
    const spent = Core.round2(mine.reduce((n, b) => n + Core.paidTotal(b) - Core.refundedTotal(b), 0));
    const key = String(u.email || '').toLowerCase();
    const waiting = (s.waitlist || []).filter((w) => String(w.email || '').toLowerCase() === key && ['Waiting', 'Offered'].includes(w.status)).length;
    const member = Core.hasMembership(s, u.email, now);
    const next = upcoming[0], nextEvent = next ? Core.findEvent(s, next.eventId) : null, nextVenue = nextEvent ? Core.findVenue(s, nextEvent.venueId) : null;
    main.innerHTML = `<div class="pf-screen">${UI.pageHead('My profile', '', 'Your details, bookings and membership.', false)}
      ${hero(u, member ? UI.badge('Member', 'good') : UI.badge('Account', 'info'))}
      <div class="grid stats">${stat(0, 'calendar', upcoming.length, 'Upcoming bookings', 'Still to come')}${stat(1, 'check', past.length, 'Past bookings', 'Already happened')}${stat(2, 'users', waiting, 'Waitlist places', 'Waiting for a space')}${stat(3, 'tag', UI.money(spent), 'Spent', 'After refunds')}</div>
      <div class="pf-cols"><div>
        ${membershipCard(u)}
        <section class="card"><h2>Your next booking</h2>${next && nextEvent ? `<p><a href="#/mybookings/${encodeURIComponent(next.id)}"><b>${esc(nextEvent.title)}</b></a></p><p class="muted">${esc(UI.dateTime(MyBookings.nextStart(next)))}${nextVenue ? ` · ${esc(nextVenue.name)}` : ''}</p><p class="muted">Booking ${esc(next.ref)}</p>` : '<p class="muted">You have nothing coming up.</p><a class="btn" href="#/browse">Find events</a>'}</section>
      </div><div>
        <section class="card"><h2>Your details</h2>${facts([['Name', esc(u.name)], ['Email', esc(u.email)], ['Phone', esc(u.phone || 'Not added')]])}</section>
        <section class="card"><h2>Emails from us</h2><label class="check"><input type="checkbox" id="pf-news"${wantsNews(u, mine) ? ' checked' : ''}><span>Send me news and offers about events</span></label><p class="hint">You will always get emails about your own bookings.</p></section>
        ${appearance()}
      </div></div></div>`;
    const news = main.querySelector('#pf-news');
    news.addEventListener('change', () => {
      Core.setCustomerConsent(S(), u, news.checked);
      App.log('Consent', `${u.name} turned ${news.checked ? 'on' : 'off'} news and offers.`);
      App.save();
      UI.toast(news.checked ? 'You will get news and offers.' : 'You will no longer get news and offers.');
    });
  }

  /* ---------- Guest: no account yet ---------- */
  function renderGuest(main, event) {
    const plans = S().plans.filter((p) => p.active);
    main.innerHTML = `<div class="pf-screen">${UI.pageHead('Create your account', '', 'You can still book as a guest. An account just makes it easier.', false)}
      <div class="pf-cols"><div><section class="card"><h2>What you get</h2><ul class="pf-ticks"><li>All your bookings in one place</li><li>Your details filled in at checkout</li><li>The option to become a member and pay less on events</li></ul>
        <div class="pf-actions"><a class="btn btn-primary" href="#/account/new${event ? `/${encodeURIComponent(event.id)}` : ''}">Create account</a>${window.Entry ? '<button type="button" class="btn" data-pf="signin">I already have an account</button>' : ''}</div></section></div>
      <div>${plans.length ? `<section class="card"><h2>Memberships</h2><ul class="pf-list">${plans.map((p) => `<li><b>${esc(p.name)}</b> ${esc(priceText(p.price, p.interval))}<small class="muted">${esc(p.description || '')}</small></li>`).join('')}</ul><a class="btn" href="${buyHash(event)}">Become a member</a></section>` : ''}</div></div></div>`;
  }
  function openCreate(guest, next, back) {
    const body = App.modal({ title: 'Create your account', subtitle: 'It takes a minute. We never ask for card details here.', back });
    body.innerHTML = `<form class="pf-form" id="pf-create" novalidate>
      ${textInput('pf-new-name', 'Name', guest.name === 'Guest' ? '' : guest.name, 'text', 'autocomplete="name" maxlength="80"')}
      ${textInput('pf-new-email', 'Email', guest.email, 'email', 'autocomplete="email" maxlength="120"', 'Bookings you made with this email will show in your account.')}
      ${textInput('pf-new-phone', 'Phone (optional)', '', 'tel', 'autocomplete="tel" maxlength="30"')}
      <label class="check"><input type="checkbox" id="pf-new-news"><span>Send me news and offers about events</span></label>
      ${UI.demo('there is no password, because sign-in comes from the website. The live system would send a link to confirm the email before showing any bookings made with it.')}
      <p class="form-error" role="alert" hidden></p>
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-pf-close>Cancel</button><button type="submit" class="btn btn-primary">Create account</button></div></form>`;
    const form = body.querySelector('#pf-create'), error = form.querySelector('.form-error');
    form.querySelector('[data-pf-close]').addEventListener('click', () => App.go(back));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const name = form.querySelector('#pf-new-name').value.trim(), email = form.querySelector('#pf-new-email').value.trim();
      const taken = validEmail(email) && Core.emailTaken(S(), email);
      const bad = !name ? ['Enter your name.', '#pf-new-name'] : !validEmail(email) ? ['Enter a valid email.', '#pf-new-email']
        : taken ? ['There is already an account with this email. Sign in instead.', '#pf-new-email'] : null;
      error.hidden = !bad;
      if (bad) { error.textContent = bad[0]; form.querySelector(bad[1]).focus(); return; }
      const user = Core.createAccount(S(), { name, email, phone: form.querySelector('#pf-new-phone').value.trim(), marketing: form.querySelector('#pf-new-news').checked });
      Object.assign(guest, { name: 'Guest', email: '', guestBookings: [] });
      S().currentUserId = user.id;
      App.syncVenue();
      App.log('Account', `${name} created an account.`);
      const found = window.MyBookings ? MyBookings.mine().length : 0;
      done(`Your account is ready.${found ? ` We found ${plural(found, 'booking')} made with this email.` : ''}`, next);
    });
    const first = form.querySelector('#pf-new-name');
    (first.value ? form.querySelector('#pf-new-email') : first).focus();
  }

  /* ---------- Buying a membership ---------- */
  function openPlans(u, event) {
    const s = S(), now = App.now(), plans = s.plans.filter((p) => p.active);
    const back = event ? eventHash(event) : '#/account';
    const body = App.modal({ title: 'Become a member', subtitle: event ? `The member price is applied to ${event.title} straight away.` : 'The member price is applied for you whenever you book.', back });
    if (!plans.length) { body.innerHTML = `<p>Memberships are not on offer right now.</p><div class="dialog-actions"><a class="btn" href="${esc(back)}">Close</a></div>`; return; }
    const offerFor = (p) => Core.bestOffer(s, p, now);
    body.innerHTML = `<form class="pf-form" id="pf-buy" novalidate>
      <fieldset class="pf-plans"><legend class="sr-only">Choose a plan</legend>${plans.map((p, i) => {
        const o = offerFor(p);
        return `<label class="pf-plan"><input type="radio" name="pf-plan" value="${esc(p.id)}"${i === 0 ? ' checked' : ''}><span class="pf-plan-text"><b>${esc(p.name)}</b><span>${esc(priceText(p.price, p.interval))}</span>${p.description ? `<small class="muted">${esc(p.description)}</small>` : ''}${o ? `<small class="pf-offer">${esc(o.name)}: ${esc(Core.offerText(o))}</small>` : ''}</span></label>`;
      }).join('')}</fieldset>
      <p class="pf-due" id="pf-due" role="status"></p>
      <p class="hint">You can cancel from your profile at any time, and you keep the member price until the end of the time you have paid for.</p>
      ${UI.demo('this is a test payment. Nothing is charged, and nothing renews on its own.')}
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-pf-close>Cancel</button><button type="submit" class="btn btn-primary" id="pf-buy-go">Continue to payment</button></div></form>`;
    const form = body.querySelector('#pf-buy'), due = form.querySelector('#pf-due'), go = form.querySelector('#pf-buy-go');
    const chosen = () => planOf(form.querySelector('input[name="pf-plan"]:checked').value);
    const show = () => { const p = chosen(); due.textContent = `First payment ${UI.money(Core.offerPrice(p, offerFor(p)))}, then ${priceText(p.price, p.interval)}.`; };
    form.addEventListener('change', show);
    form.querySelector('[data-pf-close]').addEventListener('click', () => App.go(back));
    show();
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const plan = chosen(), offer = offerFor(plan), amount = Core.offerPrice(plan, offer);
      go.disabled = true;
      Pay.checkout({
        amount, currency: 'GBP', description: `${plan.name} membership`, email: u.email,
        lines: [{ label: `${plan.name} membership`, amount: plan.price }].concat(offer && amount < plan.price ? [{ label: offer.name, amount: Core.round2(amount - plan.price) }] : []),
        onCancel: () => { go.disabled = false; go.focus(); },
        onSuccess: (receipt) => {
          /* Checked again: the person may have joined in another tab while this was open. */
          if (isLive(Core.subscriptionFor(S(), u.email, App.now()))) { App.go('#/account'); UI.toast('You already have a membership, so this payment will not be taken.', 'bad'); return; }
          const sub = Core.startSubscription(S(), { name: u.name, email: u.email, plan, offer, now: App.now(), by: u.name });
          if (receipt && receipt.id) sub.history.unshift({ at: Core.toLocalISO(App.now()), by: u.name, text: `Paid online by ${receipt.wallet || receipt.brand || 'card'}${receipt.last4 ? ` ending ${receipt.last4}` : ''}, receipt ${receipt.id} (test checkout).` });
          App.log('Membership', `${u.name} joined ${plan.name} online, first payment ${UI.money(amount)}${offer ? ` with offer ${offer.name}` : ''}.`);
          done(`Welcome! You are now a member${event ? ', so you get the member price on this event' : ''}.`, back);
        }
      });
    });
  }
  function cancelMembership(u) {
    const sub = Core.subscriptionFor(S(), u.email, App.now());
    if (!sub) return;
    UI.dialog({
      title: 'Cancel your membership?',
      body: `<p>You keep the member price until ${esc(UI.date(sub.renewsAt))}, and you will not be charged again. Your bookings stay as they are.</p>`,
      actions: [{ label: 'Keep membership', kind: 'ghost' }, {
        label: 'Cancel membership', kind: 'danger', onClick: (d, close) => {
          sub.cancelAtEnd = true;
          sub.cancelReason = 'Cancelled by the member';
          sub.history.unshift({ at: Core.toLocalISO(App.now()), by: u.name, text: `Cancelled by the member. Ends on ${UI.date(sub.renewsAt)}.` });
          App.log('Membership', `${u.name} cancelled their membership. It ends on ${UI.date(sub.renewsAt)}.`);
          close();
          done('Your membership is cancelled.');
          return undefined;
        }
      }]
    });
  }
  function keepMembership(u) {
    const sub = Core.subscriptionFor(S(), u.email, App.now());
    if (!sub) return;
    sub.cancelAtEnd = false;
    delete sub.cancelReason;
    sub.history.unshift({ at: Core.toLocalISO(App.now()), by: u.name, text: 'Cancellation taken back by the member.' });
    App.log('Membership', `${u.name} kept their membership.`);
    done('Your membership carries on.');
  }
  function payFailed(u) {
    const sub = Core.subscriptionFor(S(), u.email, App.now());
    if (!sub) return;
    Pay.checkout({
      amount: sub.price, currency: 'GBP', description: 'Membership payment', email: u.email,
      onSuccess: () => {
        const now = App.now();
        sub.status = 'active';
        delete sub.failedAt;
        if (new Date(sub.renewsAt) <= now) sub.renewsAt = Core.nextRenewal(sub, now);
        sub.history.unshift({ at: Core.toLocalISO(now), by: u.name, text: `Payment received online: ${UI.money(sub.price)} (test payment).` });
        App.log('Membership', `${u.name} paid a failed membership payment online, ${UI.money(sub.price)}.`);
        done('Thank you. Your membership is active again.');
      }
    });
  }

  function wire(main, u) {
    main.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-pf]');
      if (!b) return;
      ({
        edit: () => editDetails(),
        cancel: () => cancelMembership(u),
        keep: () => keepMembership(u),
        pay: () => payFailed(u),
        signin: () => Entry.signOut('Sign in to see your bookings and member price.')
      }[b.dataset.pf] || (() => {}))();
    });
    const theme = main.querySelector('#pf-theme');
    if (theme) theme.addEventListener('change', (ev) => App.setTheme(ev.target.value));
  }

  App.route('account', {
    title: 'My profile',
    perm: 'account',
    render(main, params) {
      /* The main element stays between screens, so its click handler goes on a fresh inner box. */
      const box = document.createElement('div');
      main.appendChild(box);
      const u = App.user(), [page, eventId] = (params || []).map((p) => String(p).split('?')[0]).filter(Boolean);
      const event = eventFrom(eventId);
      if (u.guest) {
        renderGuest(box, event);
        wire(box, u);
        if (page === 'new') openCreate(u, event ? buyHash(event) : '#/account', '#/account');
        else if (page === 'membership') openCreate(u, buyHash(event), event ? eventHash(event) : '#/account');
        return;
      }
      if (u.role === 'user') {
        renderCustomer(box, u);
        wire(box, u);
        if (page === 'membership' && !isLive(Core.subscriptionFor(S(), u.email, App.now()))) openPlans(u, event);
        return;
      }
      renderStaff(box, u);
      wire(box, u);
    }
  });
})();
