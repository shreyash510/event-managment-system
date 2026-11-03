/* Arriving at the portal. People come from the club website with a link, and are signed in with their role.
   Opening the portal with no link shows a "Continue from the website" screen, with a demo way in.

   The link (everything after the ? is optional unless it says needed):
     ?role=user                        needed: admin (or marketing), manager (or club-manager), user (or customer)
     &email=sam@x.com                  needed for a normal user: it is how their bookings are found. Also names a staff member.
     &name=Sam%20Lee                   who they are
     &venue=Soho,v2                    needed for a club manager: venue ids or names, comma separated. An admin or a normal user may name one to start on.
     &page=bookings&id=BK-1379         open a page, and a record on it:  #/page/id
     &ref=BK-1379                      open that booking (a normal user only reaches their own)
     &return=https://club.example.com  adds a "Back to website" link in the top bar

   DEMO ONLY: anyone can type these values, so a link is not proof of who someone is. In the live system the website
   signs the link (or the portal has its own login, with a second step for staff) and this file checks it. */
(function () {
  'use strict';
  const FLAG = 'events-admin-entered', RETURN = 'events-admin-return';
  const ROLE_ALIAS = { admin: 'admin', marketing: 'admin', 'marketing-admin': 'admin', manager: 'manager', 'club-manager': 'manager', user: 'user', 'normal-user': 'user', customer: 'user' };
  const PAGES = ['browse', 'mybookings', 'today', 'events', 'bookings', 'checkin', 'codes', 'partners', 'reports', 'settings', 'account'];
  const ROLE_TEXT = {
    admin: 'Plan events across all venues, set prices, run codes and partners, read reports.',
    manager: 'Run events and bookings at their venues, process refunds, read venue reports.',
    user: 'Find events and book tickets, and see their own bookings, past and coming up.'
  };
  const Entry = {};
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* works for this visit */ } }
  };
  const clean = (v, n) => String(v === null || v === undefined ? '' : v).trim().slice(0, n);
  const validEmail = (x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
  const webLink = (x) => { try { const u = new URL(x); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch (e) { return ''; } };
  const S = () => App.state;
  const sameEmail = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

  /* ---------- Reading the link ---------- */
  function venueIds(text) {
    const ids = [];
    clean(text, 300).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).forEach((w) => {
      const v = S().venues.find((x) => x.id.toLowerCase() === w || x.name.toLowerCase() === w || x.name.toLowerCase().replace(/\s+club$/, '') === w);
      if (v && !ids.includes(v.id)) ids.push(v.id);
    });
    return ids;
  }
  /* Same email (or, with no email, same name and role) is the same person, so their record is reused. */
  function upsert({ name, email, role, ids }) {
    const key = email ? email.toLowerCase() : `${name.toLowerCase()}|${role}`;
    let u = S().users.find((x) => x.extKey === key);
    /* A demo user with this email is the same person, so they are not added twice. */
    if (!u && email) u = S().users.find((x) => sameEmail(x.email, email) && x.role === role);
    if (!u) { u = { id: Core.nextId(S(), 'u'), extKey: key }; S().users.push(u); }
    Object.assign(u, { name, email, role, venueId: ids[0] || null, venueIds: ids });
    if (!email) delete u.email;
    return u;
  }
  function handover(p) {
    const role = ROLE_ALIAS[clean(p.get('role'), 30).toLowerCase()];
    if (!role) return { ok: false, error: `The link names a role we do not know (${clean(p.get('role'), 30) || 'blank'}). It should be admin, manager or user.` };
    const ids = venueIds(p.get('venue'));
    if (role === 'manager' && !ids.length) return { ok: false, error: 'The link did not name a venue we know, and a club manager only works inside their own venues. Ask the person who sent the link.' };
    const email = clean(p.get('email'), 120);
    if (role === 'user' && !email) return { ok: false, error: 'The link did not include an email, so we cannot find your bookings. Go back to the website and try again.' };
    if (email && !validEmail(email)) return { ok: false, error: 'The email in the link does not look right.' };
    const name = clean(p.get('name'), 80) || (role === 'user' ? email.split('@')[0] : Core.ROLE_NAMES[role]);
    const user = upsert({ name, email, role, ids: role === 'manager' ? ids : [] });
    S().currentUserId = user.id;
    if ((role === 'admin' || role === 'user') && ids.length) App.venueChoice = ids[0];   /* start on the venue the link names */
    let target = '', notice = '';
    const ref = clean(p.get('ref'), 40).toLowerCase(), page = clean(p.get('page'), 20).toLowerCase(), id = clean(p.get('id'), 80), ev = clean(p.get('event'), 80);
    const mine = ref && S().bookings.find((x) => x.ref.toLowerCase() === ref);
    if (ref && role === 'user') {
      /* A customer only ever reaches a booking made with their own email. */
      target = mine && sameEmail(mine.customer.email, user.email) ? `#/mybookings/${encodeURIComponent(mine.id)}` : '#/mybookings';
    } else if (ref) {
      const e = mine && Core.findEvent(S(), mine.eventId);
      target = mine && e && Core.canSeeVenue(user, e.venueId) ? `#/bookings/${encodeURIComponent(mine.id)}` : `#/bookings/?q=${encodeURIComponent(ref)}`;
    } else if (page && PAGES.includes(page)) {
      target = `#/${page}${id ? '/' + encodeURIComponent(id) : ''}${page === 'bookings' && id === 'new' && ev ? '/' + encodeURIComponent(ev) : ''}`;
    }
    const key = target.replace(/^#\//, '').split(/[/?]/)[0];
    if (target && !App.canOpen(key)) { target = ''; notice = 'That page is not open to your role, so you are on your start page instead.'; }
    return { ok: true, user, target: target || App.home(), notice: notice || `Signed in as ${user.name}, ${Core.ROLE_NAMES[role]}.` };
  }

  /* ---------- Signing in and out ---------- */
  function setIn(user, target) {
    S().currentUserId = user.id;
    App.save();
    store.set(FLAG, '1');
    return target;
  }
  Entry.signOut = (message) => {
    store.set(FLAG, null); store.set(RETURN, null);
    gate(message || 'You have signed out.', '');
  };
  Entry.topbarHtml = () => {
    const back = store.get(RETURN);
    return `${back ? `<a class="btn btn-ghost btn-small" href="${UI.esc(back)}" rel="noopener">Back to website</a>` : ''}<button type="button" class="btn btn-ghost btn-small" id="sign-out">Sign out</button>`;
  };

  /* ---------- The "Continue from the website" screen ---------- */
  function gate(message, pending) {
    const old = document.getElementById('entry');
    if (old) old.remove();
    const wanted = pending === undefined ? '' : pending;
    const demo = Core.ROLES.map((role) => ({ role, user: S().users.find((u) => u.role === role && !u.extKey) || S().users.find((u) => u.role === role) })).filter((x) => x.user);
    const detail = (u) => {
      if (u.role === 'user') { const n = S().bookings.filter((b) => sameEmail(b.customer.email, u.email)).length; return `${u.name} · ${n} ${n === 1 ? 'booking' : 'bookings'}`; }
      const v = Core.allVenues(u) ? 'All venues' : Core.userVenueIds(u).map((id) => (Core.findVenue(S(), id) || {}).name).filter(Boolean).join(', ');
      return `${u.name} · ${v}`;
    };
    const box = document.createElement('div');
    box.id = 'entry'; box.className = 'entry';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'entry-title');
    box.innerHTML = `<div class="entry-card">
      <p class="entry-brand">Events Admin <span class="brand-tag">Demo</span></p>
      <h1 id="entry-title">Continue from the website</h1>
      <p class="muted">Open this portal from the link on the club website. It signs you in with your own role, and takes you straight to the page the link names.</p>
      ${message ? `<p class="entry-note" role="alert">${UI.esc(message)}</p>` : ''}
      <h2>Or try the demo as</h2>
      <div class="entry-roles">${demo.map((x) => `<button type="button" class="entry-role" data-entry-user="${UI.esc(x.user.id)}"><b>${UI.esc(Core.ROLE_NAMES[x.role])}</b><span>${UI.esc(detail(x.user))}</span><span class="muted">${UI.esc(ROLE_TEXT[x.role] || '')}</span></button>`).join('')}</div>
      <details class="entry-how"><summary>What the website link looks like</summary>
        <p><code>?role=user&amp;email=sam@club.com&amp;name=Sam%20Lee&amp;ref=BK-1379&amp;return=https://club.example.com</code></p>
        <ul>
          <li><b>role</b>: admin, manager or user. A normal user needs <b>email</b>, a club manager needs <b>venue</b>.</li>
          <li><b>page</b> and <b>id</b> open a page and a record on it. <b>ref</b> opens a booking by its reference.</li>
          <li><b>return</b> adds a Back to website link at the top.</li>
        </ul>
        <p class="hint">Demo only: anyone can type a link like this, so it does not prove who they are. The live system signs the link, and staff sign in with a second step.</p>
      </details></div>`;
    document.body.appendChild(box);
    ['shell', 'bottombar'].forEach((id) => { const el = document.getElementById(id); if (el) el.inert = true; });
    box.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-entry-user]');
      if (!b) return;
      const user = S().users.find((u) => u.id === b.dataset.entryUser);
      if (!user) return;
      box.remove();
      ['shell', 'bottombar'].forEach((id) => { const el = document.getElementById(id); if (el) el.inert = false; });
      setIn(user);
      const key = wanted.replace(/^#\//, '').split(/[/?]/)[0];
      App.go(wanted && key && App.canOpen(key) ? wanted : App.home());
      UI.toast(`Signed in as ${user.name}, ${Core.ROLE_NAMES[user.role]}. Demo only.`);
    });
    const first = box.querySelector('.entry-role');
    if (first) first.focus();
  }

  /* Called once by App.start, before the first screen is drawn. */
  Entry.run = () => {
    const p = new URLSearchParams(location.search);
    if (p.has('role')) {
      const r = handover(p);
      const clearQuery = (hash) => { try { history.replaceState(null, '', location.pathname + (hash || '')); } catch (e) { /* the address stays as it is */ } };
      if (r.ok) {
        store.set(RETURN, webLink(clean(p.get('return'), 500)) || null);
        clearQuery(setIn(r.user, r.target));   /* the details leave the address bar, so a refresh does not repeat them */
        setTimeout(() => UI.toast(r.notice), 300);
        return;
      }
      clearQuery(location.hash);
      gate(r.error, location.hash);
      return;
    }
    if (store.get(FLAG)) return;
    gate('', location.hash);
  };
  window.Entry = Entry;
})();
