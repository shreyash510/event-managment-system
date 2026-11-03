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
        <p class="hint">Notes stay inside the team. They are not in the export.</p>`,
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
    const rows = S().partners.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ p, st: Core.partnerStats(ctx, p) }));
    main.innerHTML = UI.pageHead('Partners', edit ? '<button type="button" class="btn btn-primary" id="partner-new">New partner</button>' : '', `Businesses that promote your events with a discount code, and what they bring in.${edit ? '' : ' View only. Ask an admin to change a partner.'}`) +
      (Shared().venueNote() ? '<p class="hint">Figures are for the venue in view.</p>' : '') +
      UI.table([
        { label: 'Partner', html: (r) => `<a href="#/partners/${encodeURIComponent(r.p.id)}">${UI.esc(r.p.name)}</a>` },
        { label: 'Contact', html: (r) => (r.p.contact ? UI.esc(r.p.contact) : '<span class="muted">None</span>') },
        { label: 'Codes', html: (r) => String(r.st.codes.filter(Shared().codeInView).length) },
        { label: 'Redemptions (Bookings that used their codes)', html: (r) => String(r.st.redemptions) },
        { label: 'Discount given', html: (r) => UI.money(r.st.discount) },
        { label: 'Net revenue after refunds', html: (r) => UI.money(r.st.net) }
      ], rows, { emptyText: 'No partners yet.' });
    const btn = main.querySelector('#partner-new');
    if (btn) btn.addEventListener('click', () => openForm(null));
  };

  const renderDetail = function (main, id) {
    const partner = Core.findPartner(S(), id);
    if (!partner) { main.innerHTML = UI.empty('This partner does not exist.') + '<p><a href="#/partners">Back to Partners</a></p>'; return; }
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
    actions += '<button type="button" class="btn btn-primary" id="partner-export">Export CSV</button>';
    main.innerHTML = UI.pageHead(partner.name, actions, 'This partner\'s codes, the bookings they brought in and the money involved.') + `
      <div class="grid">
        <div class="stat"><b>${totals.redemptions}</b><span>Redemptions (Bookings that used their codes)</span></div>
        <div class="stat"><b>${UI.money(totals.discount)}</b><span>Discount given</span></div>
        <div class="stat"><b>${UI.money(paidTotal)}</b><span>Paid before refunds</span></div>
        <div class="stat"><b>${UI.money(totals.net)}</b><span>Net revenue after refunds</span></div>
      </div>
      ${sh.venueNote() ? `<p class="hint">${UI.esc(sh.venueNote())}</p>` : ''}
      <div class="card"><h2>Details</h2><dl class="codes-dl">
        <dt>Contact</dt><dd>${partner.contact ? UI.esc(partner.contact) : '<span class="muted">None</span>'}</dd>
        <dt>Notes</dt><dd>${partner.notes ? UI.esc(partner.notes) : '<span class="muted">None</span>'}</dd>
      </dl></div>
      <h2>Codes</h2>
      ${UI.table([
        { label: 'Code', html: (r) => `<a class="codes-name" href="#/codes/${encodeURIComponent(r.c.id)}">${UI.esc(r.c.code)}</a>` },
        { label: 'Status', html: (r) => sh.statusBadge(r.c) },
        { label: 'Used / cap', html: (r) => UI.esc(sh.usedCapText(r.c)) },
        { label: 'Redemptions (Bookings that used this code)', html: (r) => String(r.st.bookings.length) },
        { label: 'Discount given', html: (r) => UI.money(r.st.discount) },
        { label: 'Paid before refunds', html: (r) => UI.money(r.paid) },
        { label: 'Net revenue after refunds', html: (r) => UI.money(r.st.net) }
      ], rows, { emptyText: 'This partner has no codes yet.' })}
      <p class="hint">Redemptions include cancelled bookings. Their use may have been given back, so this count can be above Used.</p>`;
    const editBtn = main.querySelector('#partner-edit');
    if (editBtn) editBtn.addEventListener('click', () => openForm(partner));
    main.querySelector('#partner-export').addEventListener('click', () => {
      const venue = App.venueId() ? Core.findVenue(S(), App.venueId()) : null;
      const csv = [['Partner', 'Code', 'Status', 'Used', 'Cap', 'Redemptions', 'Discount given', 'Paid before refunds', 'Net revenue after refunds', 'Venue']];
      const venueText = venue ? venue.name : 'All venues';
      rows.forEach((r) => csv.push([partner.name, r.c.code, Core.codeStatus(S(), r.c, App.now()), Core.codeUsage(S(), r.c), r.c.usageCap || 'No cap', r.st.bookings.length, r.st.discount, r.paid, r.st.net, venueText]));
      csv.push([partner.name, 'Total', '', '', '', totals.redemptions, totals.discount, paidTotal, totals.net, venueText]);
      UI.downloadCSV(`partner-${String(partner.name).replace(/[^A-Za-z0-9-]+/g, '-')}.csv`, csv);
      App.log('Export', `Partner report for ${partner.name}, ${rows.length} codes, ${venueText}.`);
      App.save(); UI.toast('Export downloaded.');
    });
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
