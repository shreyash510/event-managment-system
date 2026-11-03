/* My settings: the signed-in person's own details and screen preferences. Every role has this page.
   Venues, users, policies and the activity log stay on the admin-only Settings page. */
(function () {
  'use strict';
  const esc = (v) => UI.esc(v);
  const validEmail = (x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
  const THEMES = [{ value: 'system', label: 'Same as my device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }];

  function render(main) {
    const u = App.user();
    const needsEmail = false;
    const names = Core.userVenueIds(u).map((id) => Core.findVenue(App.state, id)).filter(Boolean).map((v) => v.name);
    const scope = Core.allVenues(u) ? 'All venues' : names.length ? names.join(', ') : 'No venue yet. Ask a marketing admin.';
    main.innerHTML = `<div class="acct-screen">${UI.pageHead('My settings', '', 'Your own details and how this screen looks. Only you can change these.')}
      <form class="card acct-card" id="acct-form" novalidate>
        <h2>Your details</h2>
        <div class="field"><span><label for="acct-name">Name</label></span><input id="acct-name" type="text" value="${esc(u.name)}" autocomplete="name" maxlength="80"></div>
        <div class="field"><span><label for="acct-email">Email${needsEmail ? '' : ' (optional)'}</label></span><input id="acct-email" type="email" value="${esc(u.email || '')}" autocomplete="email" maxlength="120"></div>
        <p class="form-error" id="acct-error" role="alert" hidden></p>
        <button type="submit" class="btn btn-primary">Save details</button>
      </form>
      <section class="card acct-card"><h2>Appearance</h2>
        <div class="field"><span><label for="acct-theme">Theme</label></span><select id="acct-theme">${UI.options(THEMES, App.theme())}</select></div>
      </section>
      <section class="card acct-card"><h2>Your access</h2>
        <dl class="acct-facts"><div><dt>Role</dt><dd>${esc(Core.ROLE_NAMES[u.role] || u.role)}</dd></div><div><dt>Venues</dt><dd>${esc(scope)}</dd></div></dl>
        ${UI.demo('Roles and venues are changed by a marketing admin under Settings, Setup. The "Signed in as" menu at the top switches who you are for this demo.')}
      </section></div>`;

    const error = main.querySelector('#acct-error');
    main.querySelector('#acct-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const name = main.querySelector('#acct-name').value.trim(), email = main.querySelector('#acct-email').value.trim();
      const bad = !name ? ['Enter your name.', '#acct-name'] : (needsEmail && !email) ? ['Enter your email.', '#acct-email'] : (email && !validEmail(email)) ? ['Your email does not look right.', '#acct-email'] : null;
      error.hidden = !bad;
      if (bad) { error.textContent = bad[0]; main.querySelector(bad[1]).focus(); return; }
      /* The signed-in user can change when the role menu is used, so write to whoever is signed in now. */
      const me = App.user();
      if (me.id !== u.id) { App.render(); return; }
      const changed = me.name !== name || (me.email || '') !== email;
      me.name = name;
      if (email || me.email !== undefined) me.email = email;
      if (changed) App.log('Account', `${name} updated their own details.`);
      App.save();
      App.render();
      UI.toast(changed ? 'Your details are saved.' : 'Nothing to change.');
    });
    main.querySelector('#acct-theme').addEventListener('change', (ev) => { App.setTheme(ev.target.value); });
  }

  App.route('account', { title: 'My settings', perm: 'account', render });
})();
