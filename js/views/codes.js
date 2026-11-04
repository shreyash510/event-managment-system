/* Discount codes: list, create, edit, batches, detail page with redemptions.
   Stats use Core.codeStats on a copy of the state that holds only the bookings in the venue in view. */
(function () {
  'use strict';
  const S = () => App.state;
  const filters = { q: '', status: '', type: '', kind: '', partner: '', batch: '' };

  /* ---------- Helpers shared with partners.js ---------- */
  const scoped = () => Object.assign({}, S(), { bookings: App.visibleBookings() });
  const codeInView = function (code) {
    /* The marketing admin looking at all venues sees everything. Anyone else sees only what can apply to their venues. */
    if (!App.venueId() && Core.allVenues(App.user())) return true;
    if (App.visibleBookings().some((b) => b.codeId === code.id)) return true;
    if (code.venueIds.length && !code.venueIds.some((id) => App.inVenue(id))) return false;
    if (code.eventIds.length) return code.eventIds.some((id) => { const e = Core.findEvent(S(), id); return e && App.inVenue(e.venueId); });
    return true;
  };
  /* A club manager sees a partner only through a code that can apply to their venues. */
  const partnerInView = (p) => Core.allVenues(App.user()) || S().codes.some((c) => c.partnerId === p.id && codeInView(c));
  const statusBadge = function (code) {
    const st = Core.codeStatus(S(), code, App.now());
    const tone = { Active: 'good', Expired: 'quiet', 'Used up': 'info' }[st];
    return UI.badge(st, tone);
  };
  const discountText = function (code) {
    if (code.type === 'percent') return `${code.value}% off each ticket`;
    return `${UI.money(code.value)} off ${code.perTicket ? 'each ticket' : 'the booking'}`;
  };
  const usedCapText = (code) => `${Core.codeUsage(S(), code)} / ${code.usageCap || 'no cap'}`;
  const paidBeforeRefunds = (bookings) => Core.round2(bookings.reduce((n, b) => n + Core.paidTotal(b), 0));
  const venueNote = function () {
    const v = App.venueId() && Core.findVenue(S(), App.venueId());
    return v ? `Figures are for ${v.name}. Used / cap counts every venue, because a cap covers the whole code.` : '';
  };
  /* Codes and Partners are one area: the same two tabs sit at the top of both list pages. */
  const promoTabs = function (active) {
    const items = [];
    if (App.can('codes.view')) items.push({ icon: 'tag', label: 'Discount codes', href: '#/codes', on: active === 'codes' });
    if (App.can('partners.view')) items.push({ icon: 'users', label: 'Partners', href: '#/partners', on: active === 'partners' });
    return items.length > 1 ? `<div class="promo-tabs">${UI.tabs(items, { label: 'Discount codes' })}</div>` : '';
  };
  window.CodesShared = { scoped, codeInView, partnerInView, statusBadge, discountText, usedCapText, paidBeforeRefunds, venueNote, promoTabs };

  const partnerName = function (code) {
    const p = code.partnerId ? Core.findPartner(S(), code.partnerId) : null;
    return p ? p.name : '';
  };
  const partnerLink = function (code) {
    const p = code.partnerId ? Core.findPartner(S(), code.partnerId) : null;
    return p ? `<a href="#/partners/${encodeURIComponent(p.id)}">${UI.esc(p.name)}</a>` : '<span class="muted">None</span>';
  };
  const kindText = (code) => (code.kind === 'single' ? 'Single-use' : 'Multi-use');
  const eventLabel = function (e) {
    const v = Core.findVenue(S(), e.venueId);
    return `${e.title} (${v ? v.name : 'no venue'})`;
  };
  const batchCodes = (batchId) => S().codes.filter((c) => c.batchId === batchId);
  const batchLabel = function (batchId) {
    const list = batchCodes(batchId);
    return `${list.length ? list[0].code.split('-')[0] : batchId} (${list.length} codes)`;
  };
  const denied = (main) => { main.innerHTML = UI.empty('You can view this discount code but not change it. Club teams can change codes limited to their own venues.'); };
  /* Marketing can change any code. A club team can change a code only if it is limited to their own venues. */
  const ownsCode = (code) => Core.allVenues(App.user()) || (code.venueIds.length > 0 && code.venueIds.every((id) => Core.canSeeVenue(App.user(), id)));

  /* ---------- Would this code make a ticket free? Uses Core.quote, so stacking and member rules count. ---------- */
  const eventsInScope = function (c) {
    const now = App.now();
    return S().events.filter((e) => {
      const st = Core.eventStatus(S(), e, now);
      if (st === 'Cancelled' || st === 'Completed') return false;
      if (c.eventIds.length && !c.eventIds.includes(e.id)) return false;
      if (c.venueIds.length && !c.venueIds.includes(e.venueId)) return false;
      if (c.typeIds.length && !c.typeIds.includes(e.typeId)) return false;
      return true;
    });
  };
  const zeroPriceEvents = function (c) {
    if (!(c.value > 0)) return [];
    const settings = S().settings;
    const isFree = (e, kind, ticketTypeId) => [false, true].some((isMember) => {
      const q = Core.quote({ event: e, kind, ticketTypeId, qty: 1, isMember, code: c, settings });
      return q.codeApplied && q.total === 0;
    });
    return eventsInScope(c).filter((e) => {
      const paidTicket = e.dropInsEnabled !== false && e.tickets.some((t) => t.price > 0 && isFree(e, 'dropin', t.id));
      const paidBlock = e.block && e.block.enabled && e.block.price > 0 && isFree(e, 'block', null);
      return paidTicket || paidBlock;
    });
  };
  const zeroWarning = function (hits) {
    if (!hits.length) return '';
    const names = hits.slice(0, 3).map((e) => e.title).join(', ');
    return `This code can take a ticket to £0 on ${names}${hits.length > 3 ? ` and ${hits.length - 3} more` : ''}. The customer would pay nothing.`;
  };
  /* The lowest ticket price in Settings protects margin. Events already caught by the £0 warning are not repeated. */
  const floorWarning = function (c, zeroHits) {
    const floor = Number(S().settings.minTicketPrice) || 0;
    if (!(floor > 0) || !(c.value > 0)) return '';
    const skip = new Set((zeroHits || []).map((e) => e.id));
    const hits = eventsInScope(c).filter((e) => !skip.has(e.id) && [false, true].some((isMember) => Core.priceFloorCheck(S(), e, { code: c, isMember }).length));
    if (!hits.length) return '';
    const names = hits.slice(0, 3).map((e) => e.title).join(', ');
    return `This code can take a ticket below the lowest price of ${UI.money(floor)} on ${names}${hits.length > 3 ? ` and ${hits.length - 3} more` : ''}.`;
  };
  const priceWarnings = function (c) {
    const zero = zeroPriceEvents(c);
    return [zeroWarning(zero), floorWarning(c, zero)].filter(Boolean);
  };

  /* ---------- Actions ---------- */
  const deleteCode = function (code) {
    if (!App.can('codes.edit')) return;
    if (Core.codeStats(S(), code).bookings.length) { UI.toast('This code has been used, so it cannot be deleted.', 'bad'); return; }
    UI.dialog({
      title: `Delete ${code.code}?`,
      body: '<p>This code has never been used, so it can be deleted. This cannot be undone.</p>',
      actions: [{ label: 'Keep it', kind: 'ghost' }, {
        label: 'Delete code', kind: 'danger', onClick: (d) => {
          if (!App.can('codes.edit')) return false;
          if (Core.codeStats(S(), code).bookings.length) { UI.dialogError(d, 'This code has been used, so it cannot be deleted.'); return false; }
          S().codes = S().codes.filter((c) => c.id !== code.id);
          App.log('Discount code', `${code.code} deleted (never used).`);
          App.save(); UI.toast(`${code.code} deleted.`); App.go('#/codes');
        }
      }]
    });
  };

  /* ---------- List ---------- */
  const STATUS_ORDER = { Active: 0, 'Used up': 1, Expired: 2 };
  /* skip: leave one tab row out, so each tab can show how many codes it would give. */
  const listRows = function (skip) {
    const q = filters.q.trim().toUpperCase();
    const now = App.now();
    return S().codes.filter(codeInView).filter((c) => {
      if (q && !c.code.toUpperCase().includes(q) && !partnerName(c).toUpperCase().includes(q)) return false;
      if (skip !== 'status' && filters.status && Core.codeStatus(S(), c, now) !== filters.status) return false;
      if (filters.type && c.type !== filters.type) return false;
      if (skip !== 'kind' && filters.kind && c.kind !== filters.kind) return false;
      if (filters.partner && (filters.partner === 'none' ? c.partnerId : c.partnerId !== filters.partner)) return false;
      if (filters.batch && c.batchId !== filters.batch) return false;
      return true;
    }).sort((a, b) => (STATUS_ORDER[Core.codeStatus(S(), a, now)] - STATUS_ORDER[Core.codeStatus(S(), b, now)]) || a.code.localeCompare(b.code));
  };
  const renderList = function (main) {
    const edit = App.can('codes.edit');
    const actions = (edit ? '<a class="btn btn-primary" href="#/codes/new">New code</a> <a class="btn" href="#/codes/batch">Generate batch</a> ' : '');
    const visible = S().codes.filter(codeInView);
    const batches = [...new Set(visible.map((c) => c.batchId).filter(Boolean))];
    if (filters.batch && !batches.includes(filters.batch)) filters.batch = '';
    const partnerOpts = [{ value: '', label: 'All partners' }, { value: 'none', label: 'No partner' }].concat(S().partners.filter(partnerInView).map((p) => ({ value: p.id, label: p.name })));
    const nowStats = App.now(), mine = visible;
    const stats = UI.statPill([{ n: mine.filter((c) => Core.codeStatus(S(), c, nowStats) === 'Active').length, label: 'Active' }, { n: mine.filter((c) => Core.codeStatus(S(), c, nowStats) === 'Expired').length, label: 'Expired' }]);
    const STATUS_LIST = ['Active', 'Expired', 'Used up'], KINDS = [['multi', 'Multi-use'], ['single', 'Single-use']];
    const dialogCount = () => ['type', 'partner', 'batch'].filter((k) => filters[k]).length;
    const kindTabs = () => UI.tabs([{ icon: 'grid', key: '', label: 'All', count: listRows('kind').length, on: !filters.kind }]
      .concat(KINDS.map(([k, label]) => ({ icon: k === 'single' ? 'ticket' : 'tag', key: k, label, count: listRows('kind').filter((c) => c.kind === k).length, on: filters.kind === k }))), { attr: 'data-kind', label: 'Use type' });
    const statusTabs = () => {
      const base = listRows('status').filter((c) => !filters.kind || c.kind === filters.kind);
      return UI.tabs([{ key: '', label: 'All', count: base.length, on: !filters.status }]
        .concat(STATUS_LIST.map((st) => ({ key: st, label: st, count: base.filter((c) => Core.codeStatus(S(), c, nowStats) === st).length, on: filters.status === st }))), { sub: true, attr: 'data-status', label: 'Status' });
    };
    const crumbs = () => UI.crumbs([{ label: 'Events Admin', href: App.home() }, { label: 'Discount codes', href: '#/codes' }]
      .concat(filters.kind ? [{ label: filters.kind === 'single' ? 'Single-use' : 'Multi-use' }] : []).concat(filters.status ? [{ label: filters.status }] : []));
    main.innerHTML = '<div id="codes-crumbs"></div>' + UI.pageHead('Discount codes', stats + actions, `Create offer codes, set their limits and see how often each one is used.${Core.allVenues(App.user()) ? '' : ' You can create and change codes limited to your own venues.'}`) + promoTabs('codes') + `
      <div class="list-bar">
        <div id="codes-kinds"></div>
        <div class="list-row">
          <div id="codes-statuses"></div>
        </div>
      </div>
      ${venueNote() ? `<p class="hint">${UI.esc(venueNote())}</p>` : ''}
      <div id="codes-table"></div>`;
    const draw = function () {
      const ctx = scoped();
      const cols = [
        { label: 'Code', html: (c) => `<a class="codes-name" href="#/codes/${encodeURIComponent(c.id)}">${UI.esc(c.code)}</a>` },
        { label: 'Status', html: statusBadge },
        { label: 'Discount', html: (c) => UI.esc(discountText(c)) },
        { label: 'Use type', html: (c) => kindText(c) },
        { label: 'Used / cap', html: (c) => UI.esc(usedCapText(c)) },
        { label: 'Discount given', html: (c) => UI.money(Core.codeStats(ctx, c).discount) },
        { label: 'Partner', html: partnerLink },
        { label: 'Expires', html: (c) => (c.expiresAt ? UI.esc(UI.date(c.expiresAt)) : '<span class="muted">No expiry</span>') }
      ];
      main.querySelector('#codes-crumbs').innerHTML = crumbs();
      UI.keepFocus(() => { main.querySelector('#codes-kinds').innerHTML = kindTabs(); main.querySelector('#codes-statuses').innerHTML = statusTabs(); });
      UI.setFilterCount(main, dialogCount());
      UI.keepFocus(() => { main.querySelector('#codes-table').innerHTML = UI.table({ title: 'All discount codes', subtitle: 'Each code with its discount, limits and how often it has been used.' }, cols, listRows(), { emptyText: 'No codes match these filters.', tools: UI.search({ id: 'cf-q', value: filters.q, placeholder: 'Search code or partner...' }) + UI.filterButton('codes', dialogCount()) }); });
    };
    main.querySelector('#codes-table').addEventListener('input', (ev) => { if (ev.target.id === 'cf-q') { filters.q = ev.target.value; draw(); } });
    main.querySelector('#codes-kinds').addEventListener('click', (ev) => { const b = ev.target.closest('[data-kind]'); if (b) { filters.kind = b.dataset.kind; draw(); } });
    main.querySelector('#codes-statuses').addEventListener('click', (ev) => { const b = ev.target.closest('[data-status]'); if (b) { filters.status = b.dataset.status; draw(); } });
    UI.onFilter('codes', () => UI.filterDialog({
      title: 'Filter discount codes',
      fields: [
        { key: 'type', label: 'Discount', any: 'Percent and fixed', options: [{ value: 'percent', label: 'Percent off' }, { value: 'fixed', label: 'Fixed amount off' }] },
        { key: 'partner', label: 'Partner', any: 'All partners', options: partnerOpts.filter((o) => o.value) }
      ].concat(batches.length ? [{ key: 'batch', label: 'Batch', any: 'All codes', options: batches.map((b) => ({ value: b, label: batchLabel(b) })) }] : []),
      values: filters,
      onApply: (v) => { filters.type = v.type || ''; filters.partner = v.partner || ''; filters.batch = v.batch || ''; draw(); }
    }));
    /* Listeners go on elements inside this screen: #main itself lives on, so a listener on it would add up on each visit. */
    draw();
  };

  /* ---------- Detail ---------- */
  const restrictionHtml = function (ids, find, labelOf, inView) {
    if (!ids.length) return '<span class="muted">Any</span>';
    const items = ids.map((id) => find(id)).filter(Boolean);
    const shown = items.filter(inView);
    const hidden = ids.length - shown.length;
    return UI.esc(shown.map(labelOf).join(', ')) + (hidden ? ` <span class="muted">(and ${hidden} not in this venue)</span>` : '');
  };
  const renderDetail = function (main, id) {
    const code = Core.findCode(S(), id);
    if (!code || !codeInView(code)) { main.innerHTML = UI.empty('This code is not available for the venue in view.') + '<p><a href="#/codes">Back to Discount codes</a></p>'; return; }
    const edit = App.can('codes.edit') && ownsCode(code);
    const ctx = scoped();
    const stats = Core.codeStats(ctx, code);
    const everUsed = Core.codeStats(S(), code).bookings.length > 0;
    let actions = '';
    if (edit) {
      actions += `<a class="btn" href="#/codes/${encodeURIComponent(code.id)}/edit">Edit</a> `;
      if (!everUsed) actions += '<button type="button" class="btn btn-danger" id="code-delete">Delete</button> ';
    }
    actions += '<a class="btn ci-back" href="#/codes">&lsaquo; All codes</a>';
    const rows = stats.bookings.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((b) => {
      const e = Core.findEvent(S(), b.eventId);
      const v = e ? Core.findVenue(S(), e.venueId) : null;
      const wasMember = b.atBooking ? b.atBooking.isMember : b.customer.isMember;
      return { b, event: e ? e.title : 'Unknown event', venue: v ? v.name : 'Unknown venue', type: wasMember ? 'Member' : 'Non-member (guest checkout)', cancelled: Core.bookingStatus(b) === 'Cancelled' };
    });
    main.innerHTML = UI.pageHead(code.code, actions, `${discountText(code)}. See this code\'s limits and the bookings that used it.`, '#/codes') + `
      <div class="ci-chips">${statusBadge(code)}${code.expiresAt ? `<span class="ci-chip">Expires ${UI.esc(UI.date(code.expiresAt))}</span>` : '<span class="ci-chip">No expiry</span>'}<span class="ci-chip">${kindText(code)}</span>${code.partnerId ? `<span class="ci-chip">Partner: ${partnerLink(code)}</span>` : ''}</div>
      <div class="grid stats">
        <div class="stat">${UI.statIcon('ticket', UI.statTone(0))}<b>${UI.esc(usedCapText(code))}</b><span>Used / cap</span><small>Times used against the limit</small></div>
        <div class="stat">${UI.statIcon('users', UI.statTone(1))}<b>${stats.bookings.length}</b><span>Redemptions</span><small>Bookings that used this code</small></div>
        <div class="stat">${UI.statIcon('seat', UI.statTone(2))}<b>${UI.money(stats.discount)}</b><span>Discount given</span><small>Value taken off</small></div>
        <div class="stat">${UI.statIcon('wallet', UI.statTone(3))}<b>${UI.money(paidBeforeRefunds(stats.bookings))}</b><span>Paid before refunds</span><small>What customers paid</small></div>
        <div class="stat">${UI.statIcon('check', UI.statTone(4))}<b>${UI.money(stats.net)}</b><span>Net revenue</span><small>After refunds</small></div>
      </div>
      ${venueNote() ? `<p class="hint">${UI.esc(venueNote())}</p>` : ''}
      ${everUsed && edit ? '<p class="hint">This code has been used, so it cannot be deleted. To stop it, set its expiry date to today.</p>' : ''}
      <div class="card codes-rules"><h2>Rules</h2><dl class="codes-dl">
        <dt>Discount</dt><dd>${UI.esc(discountText(code))}</dd>
        <dt>Use type</dt><dd>${kindText(code)}</dd>
        <dt>Expires</dt><dd>${code.expiresAt ? UI.esc(UI.date(code.expiresAt)) : '<span class="muted">No expiry</span>'}</dd>
        <dt>Events</dt><dd>${restrictionHtml(code.eventIds, (x) => Core.findEvent(S(), x), eventLabel, (e) => App.inVenue(e.venueId))}</dd>
        <dt>Venues</dt><dd>${restrictionHtml(code.venueIds, (x) => Core.findVenue(S(), x), (v) => v.name, (v) => App.inVenue(v.id))}</dd>
        <dt>Event types</dt><dd>${restrictionHtml(code.typeIds, (x) => Core.findType(S(), x), (t) => t.name, () => true)}</dd>
        <dt>Partner</dt><dd>${partnerLink(code)}</dd>
        ${code.batchId ? `<dt>Batch</dt><dd>${UI.esc(batchLabel(code.batchId))}</dd>` : ''}
      </dl></div>
      ${UI.table({ title: 'Redemptions', subtitle: 'Each booking that used this code and the discount it gave. Cancelled bookings stay on this list, so the count can be above Used.' }, [
        { label: 'Booking', html: (r) => `<a href="#/bookings/${encodeURIComponent(r.b.id)}">${UI.esc(r.b.ref)}</a>${r.cancelled ? ` ${UI.badge('Cancelled', 'bad')}` : ''}` },
        { label: 'Event', html: (r) => UI.esc(r.event) },
        { label: 'Venue', html: (r) => UI.esc(r.venue) },
        { label: 'Date', html: (r) => UI.esc(UI.date(r.b.createdAt)) },
        { label: 'Customer type', html: (r) => UI.esc(r.type) },
        { label: 'Discount given', html: (r) => UI.money(r.b.pricing.codeDiscount) }
      ], rows, { emptyText: 'This code has not been used yet.' })}`;
    const on = (sel, fn) => { const el = main.querySelector(sel); if (el) el.addEventListener('click', fn); };
    on('#code-delete', () => deleteCode(code));
  };

  /* ---------- Create, edit and batch form ---------- */
  const pickList = function (legend, name, items, selected) {
    return `<fieldset class="codes-picks"><legend>${UI.esc(legend)}</legend><div class="codes-picks-list">${items.length ? items.map((i) =>
      `<label class="check"><input type="checkbox" name="${name}" value="${UI.esc(i.value)}"${selected.includes(i.value) ? ' checked' : ''}> <span>${UI.esc(i.label)}</span></label>`).join('') : '<p class="hint">Nothing to pick.</p>'}</div></fieldset>`;
  };
  const renderForm = function (main, code, mode, presetPartner) {
    if (!App.can('codes.edit') || (code && !ownsCode(code))) { denied(main); return; }
    const all = Core.allVenues(App.user());
    const myVenues = S().venues.filter((v) => Core.canSeeVenue(App.user(), v.id));
    const batch = mode === 'batch';
    const used = code ? Core.codeStats(S(), code).bookings.length > 0 : false;
    const c = code || { code: '', type: 'percent', value: '', perTicket: false, kind: 'multi', usageCap: null, expiresAt: '', eventIds: [], venueIds: !all && myVenues.length === 1 ? [myVenues[0].id] : [], typeIds: [], partnerId: presetPartner || null };
    const lock = used ? ' disabled' : '';
    const dayOf = (v) => (v ? Core.dayKey(v) : '');
    const now = App.now();
    const pickEvents = S().events.filter((e) => {
      const st = Core.eventStatus(S(), e, now);
      return c.eventIds.includes(e.id) || (st !== 'Cancelled' && st !== 'Completed' && Core.canSeeVenue(App.user(), e.venueId));
    }).slice().sort((a, b) => a.title.localeCompare(b.title));
    const back = code ? `#/codes/${encodeURIComponent(code.id)}` : '#/codes';
    main.innerHTML = `<form id="code-form" class="codes-form" novalidate>
        ${used ? '<p class="hint">This code has been used, so its name and discount are locked. Past bookings keep what they paid.</p>' : ''}
        <div class="codes-form-grid">
          ${batch ? `
            <label class="field"><span>How many codes</span><input id="f-count" type="number" min="1" max="500" step="1" value="10"></label>
            <label class="field"><span>Start of each code</span><input id="f-prefix" type="text" maxlength="12" autocomplete="off" value="" placeholder="WELCOME"><small class="hint">Letters and numbers. Each code becomes this, then a dash and 6 random characters.</small></label>
          ` : `
            <label class="field"><span>Code</span><input id="f-code" type="text" maxlength="30" autocomplete="off" value="${UI.esc(c.code)}"${lock}><small class="hint">Letters, numbers and dashes. Customers type this in.</small></label>
            <label class="field"><span>Use type</span><select id="f-kind"${lock}>${UI.options([{ value: 'multi', label: 'Multi-use (one shared code)' }, { value: 'single', label: 'Single-use' }], c.kind)}</select></label>
          `}
          <label class="field"><span>Discount type</span><select id="f-type"${lock}>${UI.options([{ value: 'percent', label: 'Percent off' }, { value: 'fixed', label: 'Fixed amount off' }], c.type)}</select></label>
          <label class="field"><span id="f-value-label">Amount</span><input id="f-value" type="number" min="0" step="0.01" value="${UI.esc(c.value)}" aria-labelledby="f-value-label"${lock}></label>
        </div>
        <label class="check" id="f-per-ticket-row"><input id="f-per-ticket" type="checkbox"${c.perTicket ? ' checked' : ''}${lock}> <span>Take this amount off each ticket. If not ticked, it comes off once per booking.</span></label>
        <div id="f-warn" class="codes-warn" role="status"></div>
        <div class="codes-form-grid">
          <label class="field"><span>Expiry date (optional)</span><input id="f-expiry" type="date" value="${UI.esc(dayOf(c.expiresAt))}"></label>
          ${batch ? '' : `<label class="field"><span>Usage cap (optional)</span><input id="f-cap" type="number" min="1" step="1" value="${UI.esc(c.usageCap || '')}"><small class="hint" id="f-cap-hint">Total uses across all customers.</small></label>`}
          <label class="field"><span>Partner (optional)</span><select id="f-partner">${UI.options([{ value: '', label: 'No partner' }].concat(S().partners.map((p) => ({ value: p.id, label: p.name }))), c.partnerId || '')}</select></label>
        </div>
        <h2>Where it works</h2>
        <p class="hint">${all ? 'Leave a list empty to allow all.' : 'Tick at least one of your venues. Leave the other lists empty to allow all.'} When you tick more than one list, an event must match every list.</p>
        <div class="codes-picks-grid">
          ${pickList('Events', 'ev', pickEvents.map((e) => ({ value: e.id, label: eventLabel(e) })), c.eventIds)}
          ${pickList('Venues', 'ven', myVenues.map((v) => ({ value: v.id, label: v.name })), c.venueIds)}
          ${pickList('Event types', 'typ', S().eventTypes.map((t) => ({ value: t.id, label: t.name })), c.typeIds)}
        </div>
        <p class="form-error" id="f-error" role="alert" hidden></p>
        <div class="row form-footer"><a class="btn btn-ghost" href="${back}">Cancel</a><button type="submit" class="btn btn-primary">${batch ? 'Generate codes' : code ? 'Save changes' : 'Create code'}</button></div>
      </form>`;
    const $ = (sel) => main.querySelector(sel);
    const picked = (name) => [...main.querySelectorAll(`input[name="${name}"]:checked`)].map((x) => x.value);
    const readCandidate = () => ({ type: $('#f-type').value, value: Number($('#f-value').value) || 0, perTicket: $('#f-type').value === 'fixed' && $('#f-per-ticket').checked, eventIds: picked('ev'), venueIds: picked('ven'), typeIds: picked('typ') });
    const refresh = function () {
      const isFixed = $('#f-type').value === 'fixed';
      $('#f-value-label').textContent = isFixed ? 'Amount off (£)' : 'Percent off (%)';
      $('#f-per-ticket-row').hidden = !isFixed;
      if (!batch) {
        const single = $('#f-kind').value === 'single';
        const cap = $('#f-cap');
        cap.disabled = single;
        if (single) cap.value = '1';
        $('#f-cap-hint').textContent = single ? 'A single-use code works once.' : 'Total uses across all customers.';
      }
      const cand = readCandidate();
      const warns = priceWarnings(cand);
      const none = !eventsInScope(cand).length ? 'No live event matches these choices yet, so this code cannot be used for now.' : '';
      $('#f-warn').innerHTML = warns.map((w) => `<p class="demo-note codes-warn-note">${UI.esc(w)}</p>`).join('') + (none ? `<p class="hint">${UI.esc(none)}</p>` : '');
    };
    main.querySelector('#code-form').addEventListener('input', refresh);
    main.querySelector('#code-form').addEventListener('change', refresh);
    refresh();

    const showError = function (text, focusSel) {
      const e = $('#f-error'); e.textContent = text; e.hidden = !text;
      if (focusSel && $(focusSel)) $(focusSel).focus();
    };
    const readWhole = function (sel) {
      const raw = $(sel).value.trim();
      if (!raw) return null;
      const n = Number(raw);
      return Number.isInteger(n) && n >= 1 ? n : NaN;
    };
    const today = Core.dayKey(now);
    const validate = function () {
      const out = readCandidate();
      if (!used) {
        if (!(out.value > 0)) return { error: 'Enter a discount above 0.', focus: '#f-value' };
        if (out.type === 'percent' && out.value > 100) return { error: 'A percent discount cannot be above 100.', focus: '#f-value' };
        if (out.type === 'fixed') out.value = Core.round2(out.value);
      } else { out.type = c.type; out.value = c.value; out.perTicket = !!c.perTicket; }
      const expiry = $('#f-expiry').value;
      if (!all && !out.venueIds.length) return { error: 'Tick at least one of your venues.' };
      if (expiry && expiry !== dayOf(c.expiresAt) && expiry < today) return { error: 'The expiry date is in the past.', focus: '#f-expiry' };
      /* An unchanged date keeps its exact time. */
      out.expiresAt = !expiry ? '' : expiry === dayOf(c.expiresAt) ? c.expiresAt : `${expiry}T23:59`;
      out.partnerId = $('#f-partner').value || null;
      if (batch) {
        const count = readWhole('#f-count');
        if (!count || count > 500) return { error: 'Enter how many codes, from 1 to 500.', focus: '#f-count' };
        const prefix = $('#f-prefix').value.trim().toUpperCase();
        if (!/^[A-Z0-9]{2,12}$/.test(prefix)) return { error: 'The start of each code needs 2 to 12 letters or numbers.', focus: '#f-prefix' };
        out.count = count; out.prefix = prefix;
        return { data: out };
      }
      const name = used ? c.code : $('#f-code').value.trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9-]{1,29}$/.test(name)) return { error: 'The code needs 2 to 30 letters, numbers or dashes, and must start with a letter or number.', focus: '#f-code' };
      const same = Core.findCodeByName(S(), name);
      if (same && (!code || same.id !== code.id)) return { error: `The code ${name} already exists.`, focus: '#f-code' };
      out.code = name;
      out.kind = used ? c.kind : $('#f-kind').value;
      const cap = out.kind === 'single' ? 1 : readWhole('#f-cap');
      if (Number.isNaN(cap)) return { error: 'The usage cap must be a whole number of 1 or more.', focus: '#f-cap' };
      if (code && cap && cap < Core.codeUsage(S(), code)) return { error: `This code has already been used ${Core.codeUsage(S(), code)} times, so the cap cannot be ${cap}.`, focus: '#f-cap' };
      out.usageCap = cap;
      return { data: out };
    };
    const describeChanges = function (before, after) {
      const show = (k, v) => {
        if (v === null || v === undefined || v === '') return 'none';
        if (Array.isArray(v)) return v.length ? `${v.length} chosen` : 'all';
        if (k === 'partnerId') { const p = Core.findPartner(S(), v); return p ? p.name : v; }
        return String(v);
      };
      const labels = { code: 'code', type: 'type', value: 'value', perTicket: 'per ticket', kind: 'use type', usageCap: 'cap', expiresAt: 'expiry', partnerId: 'partner', eventIds: 'events', venueIds: 'venues', typeIds: 'event types' };
      return Object.keys(labels).filter((k) => JSON.stringify(before[k] === undefined ? null : before[k]) !== JSON.stringify(after[k] === undefined ? null : after[k]) && !(!before[k] && !after[k]))
        .map((k) => `${labels[k]} ${show(k, before[k])} to ${show(k, after[k])}`).join('; ');
    };
    const commit = function (data) {
      if (!App.can('codes.edit')) { showError('Your role cannot change discount codes.'); return; }
      const fields = (({ type, value, perTicket, expiresAt, eventIds, venueIds, typeIds, partnerId }) => ({ type, value, perTicket, expiresAt, eventIds, venueIds, typeIds, partnerId }))(data);
      if (batch) {
        const base = Object.assign({ createdAt: Core.toLocalISO(App.now()) }, fields);
        const made = Core.generateCodes(S(), base, data.count, data.prefix, data.prefix + App.now().getTime());
        const batchId = made[0].batchId;
        App.log('Discount code', `Generated ${made.length} single-use codes, ${data.prefix}, ${discountText(made[0])}.`);
        App.save();
        Object.assign(filters, { q: '', status: '', type: '', kind: '', partner: '', batch: batchId });
        App.go('#/codes');
        UI.dialog({
          title: `${made.length} codes made`,
          body: `<p>Each code starts with ${UI.esc(data.prefix)}- and works once. Find them any time with the Batch filter.</p>`,
          actions: [{ label: 'Close', kind: 'ghost' }]
        });
        return;
      }
      Object.assign(fields, { code: data.code, kind: data.kind, usageCap: data.usageCap });
      if (code) {
        const changes = describeChanges(code, fields);
        Object.assign(code, fields);
        if (changes) App.log('Discount code', `${code.code} changed: ${changes}.`);
        App.save(); UI.toast('Code saved.'); App.go(`#/codes/${encodeURIComponent(code.id)}`);
      } else {
        const made = Object.assign({ id: Core.nextId(S(), 'c'), batchId: null, createdAt: Core.toLocalISO(App.now()) }, fields);
        S().codes.push(made);
        App.log('Discount code', `${made.code} created, ${discountText(made)}.`);
        App.save(); UI.toast('Code created.'); App.go(`#/codes/${encodeURIComponent(made.id)}`);
      }
    };
    main.querySelector('#code-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const r = validate();
      if (r.error) { showError(r.error, r.focus); return; }
      showError('');
      const warns = used ? [] : priceWarnings(r.data);
      if (warns.length) {
        const free = zeroPriceEvents(r.data).length > 0;
        UI.dialog({
          title: free ? 'This code can make a ticket free' : 'This code goes below the lowest price',
          body: warns.map((w) => `<p>${UI.esc(w)}</p>`).join(''),
          actions: [{ label: 'Go back', kind: 'ghost' }, { label: 'Save anyway', kind: 'danger', onClick: () => commit(r.data) }]
        });
        return;
      }
      commit(r.data);
    });
  };

  /* The form opens in a modal over the page it came from. */
  const openForm = function (main, code, mode, presetPartner) {
    if (!App.can('codes.edit') || (code && !ownsCode(code))) { denied(main); return undefined; }
    if (code) renderDetail(main, code.id); else renderList(main);
    const title = mode === 'batch' ? 'Generate a batch of codes' : code ? `Edit ${code.code}` : 'New discount code';
    renderForm(App.modal({ title, subtitle: mode === 'batch' ? 'Makes many unique codes. Each one works once.' : 'Set the discount, its limits and where the code can be used.', back: code ? `#/codes/${encodeURIComponent(code.id)}` : '#/codes' }), code, mode, presetPartner);
    return undefined;
  };
  App.route('codes', {
    title: 'Discount codes',
    perm: 'codes.view',
    render(main, params) {
      const first = params[0];
      if (!first) return renderList(main);
      if (first === 'new') return openForm(main, null, 'single', params[1]);
      if (first === 'batch') return openForm(main, null, 'batch', params[1]);
      if (params[1] === 'edit') {
        const code = Core.findCode(S(), first);
        if (!code) { main.innerHTML = UI.empty('This code does not exist.'); return undefined; }
        return openForm(main, code, 'single');
      }
      return renderDetail(main, first);
    }
  });
})();
