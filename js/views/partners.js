/* Partners: list, create, edit, and a detail page with the partner's codes and totals.
   Uses helpers from codes.js (window.CodesShared), which loads first. */
(function () {
  'use strict';
  const S = () => App.state;
  const Shared = () => window.CodesShared;
  const denied = 'Your role can view partners but not change them.';
  /* What a partner costs us: a share of the net revenue their codes bring in, or a fixed amount for each booking. */
  const COST_TYPES = [
    { value: 'none', label: 'Nothing' },
    { value: 'percent', label: 'A percent of net revenue' },
    { value: 'fixed', label: 'A fixed amount for each booking' }
  ];
  const costText = (c) => {
    const x = c || { type: 'none' };
    if (x.type === 'percent') return `${Number(x.value) || 0}% of net revenue`;
    if (x.type === 'fixed') return `${UI.money(x.value)} for each booking`;
    return 'Nothing';
  };
  const returnHtml = (n) => (n < 0 ? `<span class="codes-loss">${UI.money(n)}</span>` : UI.money(n));

  const openForm = function (partner) {
    if (!App.can('partners.edit')) { UI.toast(denied, 'bad'); return; }
    const p = partner || { name: '', contact: '', notes: '', cost: { type: 'none', value: 0 } };
    const cost = p.cost || { type: 'none', value: 0 };
    UI.dialog({
      title: partner ? `Edit ${partner.name}` : 'New partner',
      body: `
        <label class="field"><span>Name</span><input id="pf-name" type="text" maxlength="80" value="${UI.esc(p.name)}"></label>
        <label class="field"><span>Contact</span><input id="pf-contact" type="text" maxlength="120" value="${UI.esc(p.contact)}"></label>
        <div class="codes-form-grid">
          <label class="field"><span>What they cost us</span><select id="pf-cost-type">${UI.options(COST_TYPES, cost.type)}</select></label>
          <label class="field" id="pf-cost-value-row"${cost.type === 'none' ? ' hidden' : ''}><span id="pf-cost-value-label">${cost.type === 'fixed' ? 'Amount for each booking (£)' : 'Percent of net revenue (%)'}</span><input id="pf-cost-value" type="number" min="0" step="0.01" value="${UI.esc(cost.type === 'none' ? '' : cost.value)}"></label>
        </div>
        <p class="hint">Used to show the return on each partner: the net revenue their codes bring in, less what they cost.</p>
        <label class="field"><span>Notes</span><textarea id="pf-notes" rows="3" maxlength="500">${UI.esc(p.notes)}</textarea></label>
        <p class="hint">Notes stay inside the team. They are not in the export.</p>`,
      onOpen: (d) => {
        const sync = () => {
          const t = d.querySelector('#pf-cost-type').value;
          d.querySelector('#pf-cost-value-row').hidden = t === 'none';
          d.querySelector('#pf-cost-value-label').textContent = t === 'fixed' ? 'Amount for each booking (£)' : 'Percent of net revenue (%)';
        };
        d.querySelector('#pf-cost-type').addEventListener('change', sync);
      },
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: partner ? 'Save changes' : 'Create partner', kind: 'primary', onClick: (d) => {
          if (!App.can('partners.edit')) { UI.dialogError(d, denied); return false; }
          const name = d.querySelector('#pf-name').value.trim();
          const contact = d.querySelector('#pf-contact').value.trim();
          const notes = d.querySelector('#pf-notes').value.trim();
          if (!name) { UI.dialogError(d, 'Enter the partner name.'); d.querySelector('#pf-name').focus(); return false; }
          const costType = d.querySelector('#pf-cost-type').value;
          const costRaw = d.querySelector('#pf-cost-value').value.trim();
          const costValue = Number(costRaw);
          if (costType !== 'none' && (costRaw === '' || !Number.isFinite(costValue) || costValue < 0)) { UI.dialogError(d, 'Enter what this partner costs, as 0 or more.'); d.querySelector('#pf-cost-value').focus(); return false; }
          if (costType === 'percent' && costValue > 100) { UI.dialogError(d, 'A percent cannot be above 100.'); d.querySelector('#pf-cost-value').focus(); return false; }
          const newCost = costType === 'none' ? { type: 'none', value: 0 } : { type: costType, value: Core.round2(costValue) };
          const clash = S().partners.find((x) => x.name.toLowerCase() === name.toLowerCase() && (!partner || x.id !== partner.id));
          if (clash) { UI.dialogError(d, `A partner called ${clash.name} already exists.`); return false; }
          if (partner) {
            const changed = [p.name !== name && 'name', p.contact !== contact && 'contact', p.notes !== notes && 'notes', costText(p.cost) !== costText(newCost) && `cost ${costText(p.cost)} to ${costText(newCost)}`].filter(Boolean);
            const oldName = partner.name;
            Object.assign(partner, { name, contact, notes, cost: newCost });
            if (changed.length) App.log('Partner', `${oldName} changed: ${changed.join(', ')}.`);
            App.save(); UI.toast('Partner saved.'); App.render();
          } else {
            const made = { id: Core.nextId(S(), 'pt'), name, contact, notes, cost: newCost };
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
    main.innerHTML = UI.crumbs([{ label: 'Events Admin', href: App.home() }, { label: 'Promotions', href: '#/codes' }, { label: 'Partners' }]) + UI.pageHead('Promotions', (edit ? '<button type="button" class="btn btn-primary" id="partner-new">New partner</button>' : ''), `Partners: businesses that promote your events with a discount code, and what they bring in.${edit ? '' : ' View only. Ask an admin to change a partner.'}`) +
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
        { label: 'Net revenue after refunds', html: (r) => UI.money(r.st.net) },
        { label: 'Cost to us', html: (r) => UI.money(Core.partnerCost(r.p, r.st)) },
        { label: 'Return', html: (r) => returnHtml(r.st.net - Core.partnerCost(r.p, r.st)) }
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
    const cost = Core.partnerCost(partner, totals);
    let actions = '<a class="btn btn-ghost" href="#/partners">All partners</a> ';
    if (edit) actions += `<button type="button" class="btn" id="partner-edit">Edit</button> <a class="btn" href="#/codes/new/${encodeURIComponent(partner.id)}">New code for this partner</a> `;
    actions += '<button type="button" class="btn btn-primary" id="partner-export">Export CSV</button>';
    main.innerHTML = UI.pageHead(partner.name, actions, 'This partner\'s codes, the bookings they brought in and the money involved.', '#/partners') + `
      <div class="grid stats">
        <div class="stat">${UI.statIcon('ticket', 'blue')}<b>${totals.redemptions}</b><span>Redemptions</span><small>Bookings that used their codes</small></div>
        <div class="stat">${UI.statIcon('seat', 'amber')}<b>${UI.money(totals.discount)}</b><span>Discount given</span><small>Value of the codes used</small></div>
        <div class="stat">${UI.statIcon('wallet', 'cyan')}<b>${UI.money(paidTotal)}</b><span>Paid before refunds</span><small>What customers paid</small></div>
        <div class="stat">${UI.statIcon('check', 'violet')}<b>${UI.money(totals.net)}</b><span>Net revenue</span><small>After refunds</small></div>
        <div class="stat">${UI.statIcon('alert', 'blue')}<b>${UI.money(cost)}</b><span>Cost to us</span><small>${UI.esc(costText(partner.cost))}</small></div>
        <div class="stat">${UI.statIcon('wallet', 'amber')}<b>${returnHtml(Core.round2(totals.net - cost))}</b><span>Return</span><small>Net revenue less what they cost</small></div>
      </div>
      ${sh.venueNote() ? `<p class="hint">${UI.esc(sh.venueNote())}</p>` : ''}
      <div class="card"><h2>Details</h2><dl class="codes-dl">
        <dt>Contact</dt><dd>${partner.contact ? UI.esc(partner.contact) : '<span class="muted">None</span>'}</dd>
        <dt>What they cost</dt><dd>${UI.esc(costText(partner.cost))}</dd>
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
    main.querySelector('#partner-export').addEventListener('click', () => {
      const venue = App.venueId() ? Core.findVenue(S(), App.venueId()) : null;
      const csv = [['Partner', 'Code', 'Status', 'Used', 'Cap', 'Redemptions', 'Discount given', 'Paid before refunds', 'Net revenue after refunds', 'Venue']];
      const venueText = venue ? venue.name : 'All venues';
      rows.forEach((r) => csv.push([partner.name, r.c.code, Core.codeStatus(S(), r.c, App.now()), Core.codeUsage(S(), r.c), r.c.usageCap || 'No cap', r.st.bookings.length, r.st.discount, r.paid, r.st.net, venueText]));
      csv.push([partner.name, 'Total', '', '', '', totals.redemptions, totals.discount, paidTotal, totals.net, venueText]);
      csv.push([partner.name, 'Cost to us', costText(partner.cost), '', '', '', '', '', cost, venueText]);
      csv.push([partner.name, 'Return', '', '', '', '', '', '', Core.round2(totals.net - cost), venueText]);
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
