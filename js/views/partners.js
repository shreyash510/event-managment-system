/* Partners: list, create, edit, and a detail page with the partner's codes and totals.
   Uses helpers from codes.js (window.CodesShared), which loads first. */
(function () {
  'use strict';
  const S = () => App.state;
  const Shared = () => window.CodesShared;
  const denied = 'Your role can view partners but not change them.';
  const openForm = function (partner) {
    if (!App.can('partners.edit')) { UI.toast(denied, 'bad'); return; }
    const p = partner || { name: '', contact: '', notes: '' };
    UI.dialog({
      title: partner ? `Edit ${partner.name}` : 'New partner',
      body: `
        <label class="field"><span>Name</span><input id="pf-name" type="text" maxlength="80" value="${UI.esc(p.name)}"></label>
        <label class="field"><span>Contact</span><input id="pf-contact" type="text" maxlength="120" value="${UI.esc(p.contact)}"></label>
        <label class="field"><span>Notes</span><textarea id="pf-notes" rows="3" maxlength="500">${UI.esc(p.notes)}</textarea></label>
        <p class="hint">Notes stay inside the team.</p>`,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: partner ? 'Save changes' : 'Create partner', kind: 'primary', onClick: (d) => {
          if (!App.can('partners.edit')) { UI.dialogError(d, denied); return false; }
          const name = d.querySelector('#pf-name').value.trim();
          const contact = d.querySelector('#pf-contact').value.trim();
          const notes = d.querySelector('#pf-notes').value.trim();
          if (!name) { UI.dialogError(d, 'Enter the partner name.'); d.querySelector('#pf-name').focus(); return false; }
          const clash = S().partners.find((x) => x.name.toLowerCase() === name.toLowerCase() && (!partner || x.id !== partner.id));
          if (clash) { UI.dialogError(d, `A partner called ${clash.name} already exists.`); return false; }
          if (partner) {
            const changed = [p.name !== name && 'name', p.contact !== contact && 'contact', p.notes !== notes && 'notes'].filter(Boolean);
            const oldName = partner.name;
            Object.assign(partner, { name, contact, notes });
            if (changed.length) App.log('Partner', `${oldName} changed: ${changed.join(', ')}.`);
            App.save(); UI.toast('Partner saved.'); App.render();
          } else {
            const made = { id: Core.nextId(S(), 'pt'), name, contact, notes };
            S().partners.push(made);
            App.log('Partner', `${name} created.`);
            App.save(); UI.toast('Partner created.'); App.go(`#/partners/${encodeURIComponent(made.id)}`);
          }
          return undefined;
        }
      }]
    });
  };

  const renderList = function (main) {
    const edit = App.can('partners.edit');
    const ctx = Shared().scoped();
    const rows = S().partners.filter(Shared().partnerInView).sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ p, st: Core.partnerStats(ctx, p) }));
    main.innerHTML = UI.crumbs([{ label: 'Events Admin', href: App.home() }, { label: 'Discount codes', href: '#/codes' }, { label: 'Partners' }]) + UI.pageHead('Discount codes', (edit ? '<button type="button" class="btn btn-primary" id="partner-new">New partner</button>' : ''), `Partners: businesses that promote your events with a discount code, and what they bring in.${edit ? '' : ' View only. Ask an admin to change a partner.'}`) +
      (Shared().promoTabs ? Shared().promoTabs('partners') : '') +
      (Shared().venueNote() ? '<p class="hint">Figures are for the venue in view.</p>' : '') +
      `<div class="grid stats">
        <div class="stat">${UI.statIcon('users', 'blue')}<b>${rows.length}</b><span>Partners</span><small>${rows.filter((r) => r.st.redemptions > 0).length} with sales</small></div>
        <div class="stat">${UI.statIcon('ticket', 'amber')}<b>${rows.reduce((n, r) => n + r.st.redemptions, 0)}</b><span>Redemptions</span><small>Bookings that used a code</small></div>
        <div class="stat">${UI.statIcon('seat', 'cyan')}<b>${UI.money(Core.round2(rows.reduce((n, r) => n + r.st.discount, 0)))}</b><span>Discount given</span><small>Across all partner codes</small></div>
        <div class="stat">${UI.statIcon('wallet', 'violet')}<b>${UI.money(Core.round2(rows.reduce((n, r) => n + r.st.net, 0)))}</b><span>Net revenue</span><small>After refunds</small></div>
      </div>` +
      UI.table({ title: 'All partners', subtitle: 'Each partner with their codes and what they bring in. Redemptions are bookings that used one of their codes.' }, [
        { label: 'Partner', html: (r) => UI.person(r.p.name, '', `#/partners/${encodeURIComponent(r.p.id)}`) },
        { label: 'Contact', html: (r) => (r.p.contact ? UI.esc(r.p.contact) : '<span class="muted">None</span>') },
        { label: 'Codes', html: (r) => String(r.st.codes.filter(Shared().codeInView).length) },
        { label: 'Redemptions', html: (r) => String(r.st.redemptions) },
        { label: 'Discount given', html: (r) => UI.money(r.st.discount) },
        { label: 'Net revenue after refunds', html: (r) => UI.money(r.st.net) }
      ], rows, { emptyText: 'No partners yet.' });
    const btn = main.querySelector('#partner-new');
    if (btn) btn.addEventListener('click', () => openForm(null));
  };

  const renderDetail = function (main, id) {
    const partner = Core.findPartner(S(), id);
    if (!partner || !Shared().partnerInView(partner)) { main.innerHTML = UI.empty('This partner is not available for the venue in view.') + '<p><a href="#/partners">Back to Partners</a></p>'; return; }
    const edit = App.can('partners.edit');
    const sh = Shared();
    const ctx = sh.scoped();
    const totals = Core.partnerStats(ctx, partner);
    const rows = totals.codes.filter(sh.codeInView).sort((a, b) => a.code.localeCompare(b.code)).map((c) => {
      const st = Core.codeStats(ctx, c);
      return { c, st, paid: sh.paidBeforeRefunds(st.bookings) };
    });
    const paidTotal = Core.round2(rows.reduce((n, r) => n + r.paid, 0));
    let actions = '<a class="btn btn-ghost" href="#/partners">All partners</a> ';
    if (edit) actions += `<button type="button" class="btn" id="partner-edit">Edit</button> <a class="btn" href="#/codes/new/${encodeURIComponent(partner.id)}">New code for this partner</a> `;
    main.innerHTML = UI.pageHead(partner.name, actions, 'This partner\'s codes, the bookings they brought in and the money involved.', '#/partners') + `
      <div class="grid stats">
        <div class="stat">${UI.statIcon('ticket', 'blue')}<b>${totals.redemptions}</b><span>Redemptions</span><small>Bookings that used their codes</small></div>
        <div class="stat">${UI.statIcon('seat', 'amber')}<b>${UI.money(totals.discount)}</b><span>Discount given</span><small>Value of the codes used</small></div>
        <div class="stat">${UI.statIcon('wallet', 'cyan')}<b>${UI.money(paidTotal)}</b><span>Paid before refunds</span><small>What customers paid</small></div>
        <div class="stat">${UI.statIcon('check', 'violet')}<b>${UI.money(totals.net)}</b><span>Net revenue</span><small>After refunds</small></div>
      </div>
      ${sh.venueNote() ? `<p class="hint">${UI.esc(sh.venueNote())}</p>` : ''}
      <div class="card"><h2>Details</h2><dl class="codes-dl">
        <dt>Contact</dt><dd>${partner.contact ? UI.esc(partner.contact) : '<span class="muted">None</span>'}</dd>
        <dt>Notes</dt><dd>${partner.notes ? UI.esc(partner.notes) : '<span class="muted">None</span>'}</dd>
      </dl></div>
      <h2>Codes</h2>
      ${UI.table({ subtitle: 'The discount codes linked to this partner and how they performed.' }, [
        { label: 'Code', html: (r) => `<a class="codes-name" href="#/codes/${encodeURIComponent(r.c.id)}">${UI.esc(r.c.code)}</a>` },
        { label: 'Status', html: (r) => sh.statusBadge(r.c) },
        { label: 'Used / cap', html: (r) => UI.esc(sh.usedCapText(r.c)) },
        { label: 'Redemptions', html: (r) => String(r.st.bookings.length) },
        { label: 'Discount given', html: (r) => UI.money(r.st.discount) },
        { label: 'Paid before refunds', html: (r) => UI.money(r.paid) },
        { label: 'Net revenue after refunds', html: (r) => UI.money(r.st.net) }
      ], rows, { emptyText: 'This partner has no codes yet.' })}
      <p class="hint">Redemptions include cancelled bookings. Their use may have been given back, so this count can be above Used.</p>`;
    const editBtn = main.querySelector('#partner-edit');
    if (editBtn) editBtn.addEventListener('click', () => openForm(partner));
  };

  App.route('partners', {
    title: 'Partners',
    perm: 'partners.view',
    render(main, params) {
      if (!Shared()) { main.innerHTML = UI.empty('This page is not available.'); return; }
      if (params[0]) renderDetail(main, params[0]); else renderList(main);
    }
  });
})();
