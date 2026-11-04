/* Six-step event form. Sets window.EventForm; events.js calls it for #/events/new and #/events/<id>/edit.
   Edits happen on a working copy held in memory, and reach App.state only through a save. */
(function () {
  'use strict';
  const STEPS = ['Basics', 'Schedule', 'Tickets and pricing', 'Capacity', 'Guest details', 'Review and publish'];
  const STEP_INTROS = [
    'Name the event, and say where it is and what kind of event it is.',
    'Set the dates and times of every session.',
    'Set what people pay, and see what a guest and a member will be charged.',
    'Set how many people can come to each session.',
    'Choose what you need to know about each person who comes.',
    'See what is missing, check how it looks on a phone, then publish.'
  ];
  const RULE_MAX = 104;
  const UNTITLED = 'Untitled draft';
  const SENSITIVE = /health|medical|medication|injur|allerg|intoleran|dietar|\bdiet\b|food|disab|pregnan|religio|halal|kosher|vegan|vegetarian/i;
  const works = new Map();
  const lastHtml = new WeakMap();
  let w = null;      /* the working copy on screen */
  let root = null;   /* this screen's root element, rebuilt on every render */
  let tmp = 0;
  const tempId = (p) => `tmp-${p}-${++tmp}`;
  const isTemp = (id) => String(id).startsWith('tmp-');
  const esc = (v) => UI.esc(v);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const blankNum = (v) => v === '' || v === null || v === undefined || Number.isNaN(Number(v));
  const isInt = (v) => !blankNum(v) && Number.isInteger(Number(v));
  const pence = (v) => Math.abs(Number(v) * 100 - Math.round(Number(v) * 100)) < 1e-6;

  /* ---------- Reading the data ---------- */
  const stdTicket = (d) => {
    const named = d.tickets.find((t) => /standard/i.test(t.name));
    if (named) return named;
    return d.tickets.reduce((best, t) => (!best || Number(t.price) > Number(best.price) ? t : best), null);
  };
  const tiers = (d) => { const std = stdTicket(d); return d.tickets.filter((t) => t !== std); };
  const liveSessions = (d) => d.sessions.filter((x) => !x.cancelled);
  const eventBookings = (id) => (id ? App.state.bookings.filter((b) => b.eventId === id) : []);
  const eventSold = (id) => eventBookings(id).reduce((n, b) => n + b.tickets.filter((t) => t.status === 'active').length, 0);
  const bookedOn = (session) => (isTemp(session.id) ? 0 : Core.sessionTaken(App.state, session.id));
  const dropInsOn = (id, sessionId) => eventBookings(id).filter((b) => b.kind !== 'block')
    .reduce((n, b) => n + b.tickets.filter((t) => t.sessionId === sessionId && t.status === 'active').length, 0);
  const ticketSold = (id, ticketId) => eventBookings(id).filter((b) => b.kind !== 'block' && b.ticketTypeId === ticketId)
    .reduce((n, b) => n + new Set(b.tickets.filter((t) => t.status === 'active').map((t) => t.personId)).size, 0);
  const isPublished = () => !!(w.id && !Core.findEvent(App.state, w.id).draft);
  const isAdmin = () => App.role() === 'admin';
  const approvalOf = (d) => (d.approval && d.approval.status) || '';
  const isPending = () => approvalOf(w.data) === 'pending';
  /* Waiting on marketing, seen by someone who cannot approve it. */
  const waitsOnMarketing = () => isPending() && !isAdmin();
  /* Would publishing this send it to marketing first? A rejected event always goes back to them. */
  const needsApproval = () => !isPublished() && (Core.needsEventApproval(App.state, App.role(), w.data) || (App.role() === 'manager' && approvalOf(w.data) === 'rejected'));
  const statusBadge = (st) => UI.badge(st, st === 'Pending approval' ? 'warn' : undefined);
  const APPROVAL_WORDS = 'Marketing checks new events from club managers. It will show as Pending approval, and customers cannot book it until marketing approves it.';
  const allowedVenues = () => App.state.venues.filter((v) => Core.canSeeVenue(App.user(), v.id) && App.inVenue(v.id));
  const venueAddOns = (d) => App.state.addOns.filter((a) => a.venueId === d.venueId);
  /* Core expects numbers, but the form can hold blanks while staff type. */
  const forCore = (d) => {
    const c = clone(d);
    c.tickets.forEach((t) => { t.price = Number(t.price) || 0; });
    c.block.price = Number(c.block.price) || 0;
    if (c.memberPricing.mode === 'percent') c.memberPricing.value = Number(c.memberPricing.value) || 0;
    return c;
  };

  /* ---------- Price guard: the lowest price in Settings (0 turns it off) ---------- */
  const floorPrice = () => Number(App.state.settings.minTicketPrice) || 0;
  /* Every price on sale that is under the lowest price, including the member price each ticket works out at. */
  function floorHits(d) {
    const floor = floorPrice(), out = [];
    if (!(floor > 0)) return out;
    const view = forCore(d), std = stdTicket(d);
    const hit = (key, label, v) => {
      if (blankNum(v) || Number(v) >= floor) return false;
      out.push({ key, label, value: Number(v) });
      return true;
    };
    if (d.dropInsEnabled) {
      d.tickets.forEach((t) => {
        const name = t === std ? 'standard price' : `"${t.name || 'tier'}" tier`;
        if (!hit(`t:${t.id}`, `The ${name}`, t.price) && !blankNum(t.price)) hit(`m:${t.id}`, `The member price for the ${name}`, Core.memberUnit(view, Number(t.price), 'dropin'));
      });
    }
    if (d.block.enabled && !hit('b', 'The block price', d.block.price) && !blankNum(d.block.price)) hit('mb', 'The member block price', Core.memberUnit(view, Number(d.block.price), 'block'));
    return out;
  }
  /* Only prices added or changed since the last save. */
  function newFloorHits() {
    const base = w.baseJson ? floorHits(normalise(JSON.parse(w.baseJson))) : [];
    return floorHits(w.data).filter((h) => !base.some((b) => b.key === h.key && b.value === h.value));
  }
  const floorText = (h) => `${h.label} is ${UI.money(h.value)}, below the lowest price of ${UI.money(floorPrice())}.`;
  function floorHint() {
    const floor = floorPrice();
    if (!(floor > 0) || !App.can('pricing.edit')) return '';
    return `<span class="hint ef-hint">${esc(isAdmin() ? `Below ${UI.money(floor)} needs a reason.` : `Lowest price allowed: ${UI.money(floor)}.`)}</span>`;
  }

  /* ---------- Working copy ---------- */
  function normalise(raw) {
    const s = App.state, d = clone(raw);
    d.memberPricing = Object.assign({ mode: 'none', value: 0, blockValue: null, applyToDropin: true, applyToBlock: false }, d.memberPricing);
    d.memberPricing.applyToDropin = d.memberPricing.applyToDropin !== false;
    d.memberPricing.applyToBlock = !!d.memberPricing.applyToBlock;
    if (d.memberPricing.value === null) d.memberPricing.value = '';
    if (d.memberPricing.blockValue === null) d.memberPricing.blockValue = '';
    d.block = Object.assign({ enabled: false, price: 0 }, d.block);
    d.dropInsEnabled = d.dropInsEnabled !== false;
    d.memberCoversGuests = !!d.memberCoversGuests;
    d.coachName = d.coachName || '';
    d.image = d.image || '';
    d.lowSpaceThreshold = d.lowSpaceThreshold === undefined || d.lowSpaceThreshold === null ? s.settings.lowSpaceThreshold : d.lowSpaceThreshold;
    d.dropInLimit = d.dropInLimit === undefined || d.dropInLimit === null ? '' : d.dropInLimit;
    if (!Array.isArray(d.addOnIds)) {
      /* Older events have no list, so tick anything already sold on them. */
      const sold = new Set();
      eventBookings(d.id).forEach((b) => (b.addOns || []).forEach((x) => sold.add(x.addOnId)));
      d.addOnIds = [...sold];
    }
    d.tickets.forEach((t) => {
      if (t.priceUnset) { t.price = ''; delete t.priceUnset; }
      t.qty = t.qty === undefined || t.qty === null ? '' : t.qty;
      t.salesStart = t.salesStart || '';
      t.salesEnd = t.salesEnd || '';
    });
    if (!d.tickets.length) d.tickets.push({ id: tempId('tt'), name: 'Standard', price: '', qty: '', salesStart: '', salesEnd: '' });
    d.questions = (d.questions || []).map((q) => {
      const out = Object.assign({ options: [] }, q);
      if (typeof out.sensitive !== 'boolean') out.sensitive = SENSITIVE.test(out.label);
      return out;
    });
    return d;
  }
  function blankEvent() {
    const s = App.state, venues = allowedVenues();
    const venueId = venues.length === 1 ? venues[0].id : '';
    return normalise({
      id: null, title: '', venueId, format: 'One-off', typeId: '', description: '', image: '', draft: true, cancelled: false, salesClosed: false,
      salesOpenAt: '', salesCloseAt: '', block: { enabled: false, price: '' }, dropInsEnabled: true,
      guestDetails: 'name', collectAt: 'checkout', questions: [], maxPerBooking: 6, waitlistOn: true,
      tickets: [], sessions: [{ id: tempId('s'), start: '', durationMin: 60, capacity: '', cancelled: false }],
      lowSpaceThreshold: s.settings.lowSpaceThreshold, addOnIds: []
    });
  }
  function commonCapacity(d) {
    const caps = [...new Set(liveSessions(d).map((x) => String(x.capacity)))];
    return caps.length === 1 ? caps[0] : '';
  }
  function newWork(key, event) {
    const data = event ? normalise(event) : blankEvent();
    if (data.title === UNTITLED) data.title = '';
    const rule = Object.assign({ first: '', durationMin: 60, end: 'count', count: 4, until: '', skips: [] }, data.repeat || {}, { skipInput: '' });
    return {
      key, id: event ? event.id : null, stateRef: App.state, baseJson: event ? JSON.stringify(event) : '',
      savedJson: JSON.stringify(data), data, step: 0, quick: !event, quickTried: false, morePricing: false, mode: data.format === 'Regular series' && !data.sessions.length ? 'rule' : 'dates',
      rule, capacity: commonCapacity(data), publish: data.salesOpenAt && new Date(data.salesOpenAt) > App.now() ? 'schedule' : 'now',
      touched: {}, focusHead: false,
      /* Questions whose "Sensitive answer" box staff set by hand, so typing does not change it back. */
      qManual: Object.fromEntries(data.questions.filter((q) => q.sensitive !== SENSITIVE.test(q.label)).map((q) => [q.id, true]))
    };
  }
  const isDirty = () => JSON.stringify(w.data) !== w.savedJson;

  /* ---------- Checks ----------
     hard: blocks every save, because saving would break bookings already made.
     missing: blocks publishing, but a draft can still be saved.
     warn: staff should look, and can carry on. */
  function checks() {
    const d = w.data, now = App.now(), out = { hard: [], missing: [], warn: [] };
    const hard = (step, text) => out.hard.push({ step, text });
    const miss = (step, text) => out.missing.push({ step, text });
    const warn = (step, text) => out.warn.push({ step, text });
    const draftish = !isPublished();
    const baseIds = new Set(w.baseJson ? JSON.parse(w.baseJson).sessions.map((x) => x.id) : []);
    const live = liveSessions(d), dated = live.filter((x) => x.start);
    const first = dated.map((x) => x.start).sort()[0];
    /* Blank gives the "missing" message; a bad number blocks every save. */
    const price = (step, label, v, blankText) => {
      if (blankNum(v)) { miss(step, blankText); return; }
      if (Number(v) < 0) hard(step, `${label} cannot be below £0.`);
      else if (!pence(v)) hard(step, `${label} can only go down to the penny.`);
    };

    /* 1 Basics */
    if (!String(d.title).trim()) miss(0, 'Add a title.');
    if (!d.venueId) hard(0, 'Choose a venue. Even a draft needs one.');
    if (!d.typeId) miss(0, 'Choose an event type.');
    if (!String(d.description).trim()) miss(0, 'Add a description.');
    if (d.image && !/^https?:\/\//i.test(String(d.image).trim())) miss(0, 'The image link must start with http:// or https://.');
    if (d.salesOpenAt && first && d.salesOpenAt >= first) miss(0, 'The on-sale date must be before the first session.');

    /* 2 Schedule */
    if (!live.length) miss(1, 'Add at least one session.');
    if (d.format === 'One-off' && live.length > 1) miss(1, `A one-off event has one session. This one has ${live.length}, so remove the extra ones or choose another format.`);
    let n = 0;
    const seen = new Set();
    for (const x of live) {
      n++;
      if (!x.start) { miss(1, `Session ${n} has no date and time.`); continue; }
      if (seen.has(x.start)) miss(1, `${UI.dateTime(x.start)} is listed twice.`);
      seen.add(x.start);
      if (new Date(x.start) <= now && (draftish || !baseIds.has(x.id))) miss(1, `${UI.dateTime(x.start)} is in the past.`);
      if (!isInt(x.durationMin) || Number(x.durationMin) < 1) miss(1, `Session ${n} needs a length in whole minutes.`);
    }
    if (d.format !== 'One-off' && w.mode === 'rule') {
      const toAdd = rulePending();
      if (toAdd > 0) warn(1, `The repeat rule has ${toAdd} session${toAdd === 1 ? '' : 's'} not added yet. Press the add button to include them.`);
    }

    /* 3 Tickets and pricing */
    const std = stdTicket(d);
    price(2, 'The standard price', std.price, 'Set the standard price.');
    tiers(d).forEach((t, i) => {
      const label = t.name ? `Tier "${t.name}"` : `Tier ${i + 1}`;
      if (!String(t.name).trim()) miss(2, `${label} needs a name.`);
      else if (/standard/i.test(t.name)) miss(2, `${label}: the word "standard" is kept for the standard price, so use another name.`);
      price(2, `${label} price`, t.price, `${label} needs a price.`);
      if (t.qty !== '') {
        const sold = ticketSold(w.id, t.id);
        if (!isInt(t.qty) || Number(t.qty) < 1) miss(2, `${label}: the number of tickets must be a whole number above 0.`);
        else if (Number(t.qty) < sold) hard(2, `${label}: ${sold} already sold, so the number cannot be ${t.qty}.`);
      }
      if (t.salesStart && t.salesEnd && t.salesEnd <= t.salesStart) miss(2, `${label}: sales must end after they start.`);
    });
    if (!d.dropInsEnabled && !d.block.enabled) miss(2, 'Turn on drop-ins or a block, so there is something to book.');
    if (d.block.enabled) price(2, 'The block price', d.block.price, 'Set the block price.');
    const m = d.memberPricing;
    if (m.mode === 'percent') {
      if (blankNum(m.value)) miss(2, 'Enter the member percent off.');
      else if (Number(m.value) < 0 || Number(m.value) > 100) hard(2, 'The member percent off must be from 0 to 100.');
    }
    if (m.mode === 'fixed') {
      if (m.applyToDropin && d.dropInsEnabled) price(2, 'The member drop-in price', m.value, 'Set the member drop-in price.');
      if (m.applyToBlock && d.block.enabled) price(2, 'The member block price', m.blockValue, 'Set the member block price.');
    }
    if (m.mode !== 'none' && !(m.applyToDropin && d.dropInsEnabled) && !(m.applyToBlock && d.block.enabled)) warn(2, 'The member price does not apply to anything on sale, so members pay the same as everyone else.');
    const coreView = forCore(d);
    coreView.block.enabled = coreView.block.enabled && live.length > 0;
    Core.pricingWarnings(coreView, live.length).forEach((t) => warn(2, t));
    /* Price guard. A club manager is stopped. The marketing admin is warned and gives a reason on saving.
       A live event's old prices do not block a manager who has not changed them. */
    const low = !App.can('pricing.edit') ? [] : isAdmin() || isPublished() ? newFloorHits() : floorHits(d);
    low.forEach((h) => (isAdmin() ? warn(2, `${floorText(h)} You will be asked for a reason when you save.`) : hard(2, `${floorText(h)} Ask marketing if it needs to be lower.`)));
    /* Margin guard: a member price that takes a ticket below the floor price set in Settings. */
    if (!low.length && typeof Core.priceFloorCheck === 'function') {
      try { (Core.priceFloorCheck(App.state, coreView, { isMember: true }) || []).forEach((t) => warn(2, t)); } catch (e) { /* the check is optional */ }
    }
    if (d.block.enabled && !live.length) warn(2, 'Add sessions in step 2 to check the block price against them.');

    /* 4 Capacity */
    n = 0;
    for (const x of live) {
      n++;
      const taken = bookedOn(x);
      const name = x.start ? UI.dateTime(x.start) : `Session ${n}`;
      if (blankNum(x.capacity)) {
        if (taken) hard(3, `${name} already has ${taken} booked, so it needs a limit of at least ${taken}.`);
        else miss(3, `${name} needs a limit.`);
      } else if (Number(x.capacity) < taken) {
        hard(3, `${name} already has ${taken} booked, so the limit cannot be ${x.capacity}.`);
      } else if (!isInt(x.capacity) || Number(x.capacity) < 1) {
        miss(3, `${name}: the limit must be a whole number above 0.`);
      }
    }
    if (!isInt(d.lowSpaceThreshold) || Number(d.lowSpaceThreshold) < 0) miss(3, 'The "few spaces left" number must be a whole number, 0 or above.');
    if (d.dropInLimit !== '') {
      if (!isInt(d.dropInLimit) || Number(d.dropInLimit) < 0) miss(3, 'The drop-in limit must be a whole number, or left empty.');
      else {
        const most = Math.max(0, ...live.map((x) => (isTemp(x.id) ? 0 : dropInsOn(w.id, x.id))));
        if (Number(d.dropInLimit) < most) hard(3, `One session already has ${most} drop-ins, so the drop-in limit cannot be ${d.dropInLimit}.`);
        if (live.some((x) => !blankNum(x.capacity) && Number(d.dropInLimit) > Number(x.capacity))) warn(3, 'The drop-in limit is above the session limit, so it will never be reached.');
      }
    }

    /* 5 Guest details */
    if (!isInt(d.maxPerBooking) || Number(d.maxPerBooking) < 1) miss(4, 'Tickets per booking must be a whole number, 1 or above.');
    d.questions.forEach((q, i) => {
      if (!String(q.label).trim()) miss(4, `Question ${i + 1} needs some text.`);
      if (q.type === 'choice' && q.options.length < 2) miss(4, `Question ${i + 1} needs at least 2 choices.`);
    });
    return out;
  }

  /* ---------- Repeat rule ---------- */
  function ruleDates() {
    const r = w.rule, out = [];
    if (!r.first) return out;
    const skips = new Set(r.skips);
    const useCount = r.end === 'count';
    if (useCount && !(isInt(r.count) && Number(r.count) >= 1)) return out;
    if (!useCount && !r.until) return out;
    const want = useCount ? Math.min(Number(r.count), RULE_MAX) : RULE_MAX;
    let made = 0;
    for (let i = 0; i < RULE_MAX * 3 && made < want; i++) {
      const start = Core.addDays(r.first, i * 7);
      const day = Core.dayKey(start);
      if (!useCount && day > r.until) break;
      if (skips.has(day)) { out.push({ start, skipped: true }); continue; }
      out.push({ start, skipped: false });
      made++;
    }
    return out;
  }
  function rulePending() {
    const have = new Set(liveSessions(w.data).map((x) => x.start));
    return ruleDates().filter((x) => !x.skipped && !have.has(x.start)).length;
  }

  /* ---------- Small HTML helpers ---------- */
  const ctlId = (path, extra) => `ef-${path}${extra ? '-' + extra : ''}`;
  const input = (path, value, o) => {
    const a = o || {};
    return `<input id="${esc(ctlId(path))}" data-b="${esc(path)}" type="${a.type || 'text'}" value="${esc(value)}"${a.attrs ? ' ' + a.attrs : ''}${a.re ? ' data-re="1"' : ''}${a.disabled ? ' disabled' : ''}>`;
  };
  const field = (label, control, hint) => `<label class="field"><span>${esc(label)}</span>${control}${hint ? `<span class="hint ef-hint">${esc(hint)}</span>` : ''}</label>`;
  const money = (path, value, o) => `<span class="ef-money"><span aria-hidden="true">£</span>${input(path, value, Object.assign({ type: 'number', attrs: 'min="0" step="0.01" inputmode="decimal"' }, o))}</span>`;
  const check = (path, on, label, o) => {
    const a = o || {};
    return `<label class="check"><input id="${esc(ctlId(path))}" data-b="${esc(path)}" type="checkbox"${on ? ' checked' : ''}${a.re ? ' data-re="1"' : ''}${a.disabled ? ' disabled' : ''}><span>${esc(label)}${a.hint ? `<span class="hint ef-hint">${esc(a.hint)}</span>` : ''}</span></label>`;
  };
  const radios = (legend, path, current, items, re) => `<fieldset class="ef-fieldset"><legend>${esc(legend)}</legend>${items.map((i) =>
    `<label class="check"><input id="${esc(ctlId(path, i.value))}" type="radio" name="${esc(path)}" data-b="${esc(path)}" value="${esc(i.value)}"${String(current) === String(i.value) ? ' checked' : ''}${re ? ' data-re="1"' : ''}><span>${esc(i.label)}${i.hint ? `<span class="hint ef-hint">${esc(i.hint)}</span>` : ''}</span></label>`).join('')}</fieldset>`;
  const select = (path, value, items, o) => `<select id="${esc(ctlId(path))}" data-b="${esc(path)}"${o && o.re ? ' data-re="1"' : ''}${o && o.disabled ? ' disabled' : ''}>${UI.options(items, value)}</select>`;
  const act = (name, label, o) => {
    const a = o || {};
    return `<button type="button" class="btn ${a.cls || 'btn-ghost'}" data-act="${name}"${a.id !== undefined ? ` data-id="${esc(a.id)}"` : ''}${a.aria ? ` aria-label="${esc(a.aria)}"` : ''}${a.elId ? ` id="${esc(a.elId)}"` : ''}${a.disabled ? ' disabled' : ''}>${esc(label)}</button>`;
  };
  const region = (name) => `<div data-r="${esc(name)}">${renderRegion(name)}</div>`;

  /* ---------- Regions: parts of the screen that update as staff type ---------- */
  function issuesHtml(step) {
    const c = checks();
    const show = (list) => list.filter((x) => x.step === step).map((x) => `<li>${esc(x.text)}</li>`).join('');
    const stops = show(c.hard) + (w.touched[step] ? show(c.missing) : '');
    const warns = show(c.warn);
    return (stops ? `<div class="ef-issues ef-bad" role="alert"><b>Fix before publishing</b><ul>${stops}</ul></div>` : '') +
      (warns ? `<div class="ef-issues ef-warn"><b>Check these</b><ul>${warns}</ul></div>` : '');
  }
  const STEP_ICONS = ["<svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v5M12 8h.01\"/></svg>","<svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M4 6h16v14H4zM4 10h16M8 3v4M16 3v4\"/></svg>","<svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z\"/><path d=\"M14 6v2.5M14 11v2M14 15.5V18\"/></svg>","<svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"9\" cy=\"8\" r=\"3.2\"/><path d=\"M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14c2 .7 3.5 2.7 3.5 6\"/></svg>","<svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"12\" cy=\"8\" r=\"3.5\"/><path d=\"M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7\"/></svg>","<svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M8 12.5l2.7 2.7L16 9.5\"/></svg>"];
  function stepsHtml() {
    const c = checks();
    const needs = (i) => w.touched[i] && c.hard.concat(c.missing).some((x) => x.step === i);
    return `<ol class="ef-steps">${STEPS.map((name, i) =>
      `<li><button type="button" class="ef-step${needs(i) ? ' ef-step-bad' : ''}" data-act="step" data-id="${i}"${i === w.step ? ' aria-current="step"' : ''}><span class="ef-dot" aria-hidden="true">${STEP_ICONS[i]}</span><span class="ef-step-name"><span class="ef-sr">Step ${i + 1}: </span>${esc(name)}</span>${needs(i) ? '<span class="ef-flag" aria-hidden="true">!</span><span class="ef-sr"> (needs attention)</span>' : ''}</button></li>`).join('')}</ol>`;
  }
  function ruleHtml() {
    const r = w.rule;
    if (!r.first) return '<p class="hint">Choose the first date and time to see the sessions.</p>';
    if (r.end === 'count' && !(isInt(r.count) && Number(r.count) >= 1)) return '<p class="form-error">Enter how many sessions, as a whole number above 0.</p>';
    if (r.end === 'until' && !r.until) return '<p class="hint">Choose the last date to see the sessions.</p>';
    const dates = ruleDates();
    if (!dates.length) return '<p class="form-error">The last date is before the first date.</p>';
    const have = new Set(liveSessions(w.data).map((x) => x.start));
    const real = dates.filter((x) => !x.skipped);
    const pending = real.filter((x) => !have.has(x.start)).length;
    const onPattern = new Set(dates.map((x) => Core.dayKey(x.start)));
    const offPattern = r.skips.filter((x) => !onPattern.has(x));
    return `<h3>This rule will create ${real.length} session${real.length === 1 ? '' : 's'}</h3>
      ${real.length >= RULE_MAX ? `<p class="hint">A rule can create up to ${RULE_MAX} sessions at a time.</p>` : ''}
      <ul class="ef-rule-list">${dates.map((x) => `<li${x.skipped ? ' class="ef-skipped"' : ''}>${esc(UI.dateTime(x.start))} ${x.skipped ? UI.badge('Skipped', 'quiet') : have.has(x.start) ? UI.badge('Already added', 'info') : ''}</li>`).join('')}</ul>
      ${offPattern.length ? `<p class="hint">${offPattern.map((x) => esc(UI.date(x))).join(', ')}: not on this rule's dates, so skipping changes nothing.</p>` : ''}
      ${pending ? act('add-rule', `Add ${pending} session${pending === 1 ? '' : 's'} to the schedule`, { cls: 'btn-primary', elId: 'ef-add-rule' }) : '<p class="hint">All of these are in the schedule below.</p>'}`;
  }
  function saveLabelHtml() {
    return isDirty() ? UI.badge('Unsaved changes', 'warn') : UI.badge('All saved', 'quiet');
  }
  function pricePreviewHtml() {
    const d = forCore(w.data), s = App.state;
    const options = [];
    if (d.dropInsEnabled) {
      const t2 = tiers(d), std = stdTicket(d);
      t2.forEach((t) => options.push({ label: t.name || 'Tier', kind: 'dropin', ticketTypeId: t.id }));
      options.push({ label: t2.length ? std.name : 'Drop-in', kind: 'dropin', ticketTypeId: std.id });
    }
    if (d.block.enabled) options.push({ label: `Block (${liveSessions(d).length} sessions)`, kind: 'block' });
    if (!options.length) return '<p class="hint">Turn on drop-ins or a block to see a preview.</p>';
    const pay = (opt, isMember, qty) => Core.quote({ event: d, kind: opt.kind, ticketTypeId: opt.ticketTypeId, qty, isMember, code: null, settings: s.settings }).total;
    const rows = [{ label: 'Guest, no account', member: false, qty: 1 }, { label: 'Logged-in member', member: true, qty: 1 }];
    if (Number(d.maxPerBooking) !== 1) rows.push({ label: 'Member and 1 guest, total', member: true, qty: 2 });
    const columns = [{ label: 'Who', html: (r) => esc(r.label) }].concat(options.map((o) => ({ label: o.label, html: (r) => esc(UI.money(pay(o, r.member, r.qty))) })));
    return UI.table({ title: 'Price preview', subtitle: 'What a guest and a member would pay for each ticket option.' }, columns, rows);
  }
  function blockNoteHtml() {
    const d = forCore(w.data), count = liveSessions(d).length;
    if (!d.block.enabled || !count) return '';
    const std = Core.standardPrice(d), sum = Core.round2(std * count), saved = Core.round2(sum - d.block.price);
    return `<p class="hint">${saved > 0 ? `Saves ${esc(UI.money(saved))} against ${count} drop-ins (${count} × ${esc(UI.money(std))}).` : `${count} drop-ins cost ${esc(UI.money(sum))}.`}</p>`;
  }
  function sessionLeftHtml(id) {
    const x = w.data.sessions.find((y) => y.id === id);
    if (!x) return '';
    const taken = bookedOn(x);
    const left = blankNum(x.capacity) ? '' : Math.max(0, Number(x.capacity) - taken);
    const bad = !blankNum(x.capacity) && Number(x.capacity) < taken;
    return `${taken} booked${left === '' ? '' : `, ${left} left`}${bad ? ` <b class="ef-bad-text">Cannot go below ${taken}</b>` : ''}`;
  }
  function questionNoteHtml(id) {
    const q = w.data.questions.find((y) => y.id === id);
    if (!q || !(q.sensitive || SENSITIVE.test(q.label))) return '';
    return '<p class="ef-issues ef-warn">This looks like a health or dietary question. Answers can reveal health or religious details, so ask only if you need them. They should be seen only by staff who need them, left out of Klaviyo, and deleted after a set time.</p>';
  }
  function renderRegion(name) {
    const [kind, arg] = name.split(':');
    if (kind === 'steps') return stepsHtml();
    if (kind === 'issues') return issuesHtml(w.step);
    if (kind === 'rule') return ruleHtml();
    if (kind === 'saved') return saveLabelHtml();
    if (kind === 'preview') return pricePreviewHtml();
    if (kind === 'blocknote') return blockNoteHtml();
    if (kind === 'left') return sessionLeftHtml(arg);
    if (kind === 'qnote') return questionNoteHtml(arg);
    if (kind === 'review') return reviewChecksHtml();
    if (kind === 'phone') return phoneHtml();
    if (kind === 'summary') return summaryHtml();
    if (kind === 'quickissues') return quickIssuesHtml();
    if (kind === 'capsum') return capSummaryHtml();
    return '';
  }
  /* Only touch what changed, so screen readers are not told the same thing on every key press. */
  function refresh() {
    root.querySelectorAll('[data-r]').forEach((el) => {
      const html = renderRegion(el.dataset.r);
      if (lastHtml.get(el) !== html) { el.innerHTML = html; lastHtml.set(el, html); }
    });
  }

  /* ---------- Step screens ---------- */
  function stepBasics() {
    const d = w.data, s = App.state, venues = allowedVenues(), sold = eventSold(w.id);
    const venueItems = venues.length === 1 ? [] : [{ value: '', label: 'Choose a venue' }];
    venues.forEach((v) => venueItems.push({ value: v.id, label: v.name }));
    const formatHint = { 'One-off': 'One session. No block option.', 'Seasonal series': 'A set run of dated sessions.', 'Regular series': 'Sessions made from a repeat rule, such as every Tuesday.', Coaching: 'Small sessions with a coach.' }[d.format];
    return `<div class="card">
      ${field('Title', input('d.title', d.title, { attrs: 'maxlength="120" autocomplete="off"' }))}
      <div class="ef-two">
        ${field('Venue', select('d.venueId', d.venueId, venueItems, { re: true, disabled: sold > 0 }), sold > 0 ? 'Tickets are sold, so the venue cannot change.' : '')}
        ${field('Format', select('d.format', d.format, Core.FORMATS.map((f) => ({ value: f, label: f })), { re: true }), formatHint)}
        ${field('Event type', select('d.typeId', d.typeId, [{ value: '', label: 'Choose a type' }].concat(s.eventTypes.map((t) => ({ value: t.id, label: t.name })))))}
        ${d.format === 'Coaching' ? field('Coach name (optional)', input('d.coachName', d.coachName, { attrs: 'maxlength="80" autocomplete="off"' })) : ''}
        ${field('On-sale date (optional)', input('d.salesOpenAt', d.salesOpenAt, { type: 'datetime-local' }), 'Leave empty to go on sale as soon as it is published.')}
      </div>
      ${field('Description', `<textarea id="ef-d.description" data-b="d.description" rows="5">${esc(d.description)}</textarea>`)}
      ${field('Image link (optional)', input('d.image', d.image, { type: 'url', attrs: 'placeholder="https://..." autocomplete="off"' }), 'Paste a link to a photo. Leave it empty to use a coloured poster.')}
    </div>`;
  }
  function sessionRow(x, n, canRemove) {
    const taken = bookedOn(x);
    const past = x.start && new Date(x.start) <= App.now();
    const locked = x.cancelled || taken > 0 || (isPublished() && past && !isTemp(x.id));
    if (locked) {
      const why = x.cancelled ? UI.badge('Cancelled', 'bad') : taken > 0 ? `<span class="hint">${taken} booked. Change this from the event page, so people can be told.</span>` : UI.badge('Past', 'quiet');
      return `<li class="ef-row ef-row-locked"><div><b>Session ${n}:</b> ${esc(UI.dateTime(x.start))}, ${esc(x.durationMin)} minutes</div><div>${why}</div></li>`;
    }
    return `<li class="ef-row ef-row-session">
      ${field(`Session ${n} date and time`, input(`s.${x.id}.start`, x.start, { type: 'datetime-local' }))}
      ${field('Minutes', input(`s.${x.id}.durationMin`, x.durationMin, { type: 'number', attrs: 'min="1" step="5"' }))}
      ${canRemove ? act('rm-session', 'Remove', { id: x.id, cls: 'btn-ghost btn-small', aria: `Remove session ${n}` }) : ''}
    </li>`;
  }
  function stepSchedule() {
    const d = w.data, oneOff = d.format === 'One-off', r = w.rule;
    const all = d.sessions.slice().sort((a, b) => (a.start || '9').localeCompare(b.start || '9'));
    const liveCount = liveSessions(d).length;
    const modeUi = oneOff ? '<p class="hint">A one-off event has one session.</p>' : radios('How do you want to set the dates?', 'w.mode', w.mode, [{ value: 'dates', label: 'Add dates one by one', hint: 'Pick each date yourself. Best when sessions are irregular.' }, { value: 'rule', label: 'Use a repeat rule (weekly)', hint: 'Repeats every week. You can skip holidays.' }], true);
    const rulePanel = !oneOff && w.mode === 'rule' ? `<div class="card">
      <h2>Repeat rule: every week</h2>
      <div class="ef-two">
        ${field('First date and time', input('w.rule.first', r.first, { type: 'datetime-local' }))}
        ${field('Minutes', input('w.rule.durationMin', r.durationMin, { type: 'number', attrs: 'min="1" step="5"' }))}
      </div>
      ${radios('When does it end?', 'w.rule.end', r.end, [{ value: 'count', label: 'After a number of sessions', hint: 'Skipped dates do not count.' }, { value: 'until', label: 'On a last date', hint: 'Runs weekly up to the date you choose.' }], true)}
      ${r.end === 'count' ? field('Number of sessions', input('w.rule.count', r.count, { type: 'number', attrs: `min="1" max="${RULE_MAX}" step="1"` })) : field('Last date', input('w.rule.until', r.until, { type: 'date' }))}
      <div class="ef-add-line">
        ${field('Skip a date, such as a public holiday', input('w.rule.skipInput', r.skipInput, { type: 'date' }))}
        ${act('add-skip', 'Add skip date', { elId: 'ef-add-skip' })}
      </div>
      ${r.skips.length ? `<ul class="ef-chips">${r.skips.map((x) => `<li>${esc(UI.date(x))} ${act('rm-skip', 'Remove', { id: x, cls: 'btn-ghost btn-small', aria: `Remove skip date ${UI.date(x)}` })}</li>`).join('')}</ul>` : ''}
      ${region('rule')}
    </div>` : '';
    return `<div class="card ef-compact">${modeUi}</div>${rulePanel}
      <div class="card">
        <h2>Schedule (${liveCount} session${liveCount === 1 ? '' : 's'})</h2>
        ${all.length ? `<ol class="ef-rows">${all.map((x, i) => sessionRow(x, i + 1, !oneOff || liveCount > 1)).join('')}</ol>` : '<p class="hint">No sessions yet.</p>'}
        ${!oneOff || liveCount === 0 ? act('add-session', 'Add a date', { elId: 'ef-add-session', cls: 'btn-ghost ef-add' }) : ''}
      </div>`;
  }
  function tierRow(t, i) {
    const sold = ticketSold(w.id, t.id);
    return `<li class="ef-row ef-row-tier">
      <div class="ef-row-head"><b>Tier ${i + 1}</b>${sold ? '<span class="hint">Tickets are sold, so this tier stays.</span>' : act('rm-tier', 'Remove', { id: t.id, cls: 'btn-ghost btn-small', aria: `Remove tier ${i + 1}` })}</div>
      ${field('Name', input(`t.${t.id}.name`, t.name, { attrs: 'maxlength="40" autocomplete="off"' }))}
      <label class="field"><span>Price</span>${money(`t.${t.id}.price`, t.price)}${floorHint()}</label>
      ${field('Number of tickets', input(`t.${t.id}.qty`, t.qty, { type: 'number', attrs: 'min="1" step="1"' }), sold ? `${sold} sold` : '')}
      ${field('Sales start', input(`t.${t.id}.salesStart`, t.salesStart, { type: 'datetime-local' }))}
      ${field('Sales end', input(`t.${t.id}.salesEnd`, t.salesEnd, { type: 'datetime-local' }))}
    </li>`;
  }
  function stepPricing() {
    const d = w.data, m = d.memberPricing, oneOff = d.format === 'One-off', std = stdTicket(d), t2 = tiers(d), addOns = venueAddOns(d);
    const canPrice = App.can('pricing.edit');
    /* Tiers and add-ons are for fewer events, so they stay folded unless in use or opened. */
    const more = w.morePricing || t2.length > 0 || d.addOnIds.length > 0;
    return `${isPublished() ? `<p class="ef-issues ef-warn">This event is live. Price changes apply to new bookings only, and each change is written to the activity log.${isAdmin() ? '' : ' Marketing gets a notice too.'}</p>` : ''}
    ${canPrice ? '' : '<p class="ef-issues ef-warn">Your role cannot change prices, so this step is read only.</p>'}
    <fieldset class="ef-plain"${canPrice ? '' : ' disabled'}>
      <legend class="ef-sr">Prices</legend>
      <div class="card">
        <h2>Tickets</h2>
        <div class="ef-two">
          <label class="field"><span>Standard price</span>${money(`t.${std.id}.price`, std.price)}${floorHint()}</label>
        </div>
        ${oneOff ? '<p class="hint">One-off events sell single tickets. There is no block option.</p>' : `
          ${check('d.dropInsEnabled', d.dropInsEnabled, 'Sell drop-ins (one session at a time)', { re: true })}
          ${check('d.block.enabled', d.block.enabled, 'Sell a block (one place in every session)', { re: true })}
          ${d.block.enabled ? `<div class="ef-two"><label class="field"><span>Block price</span>${money('d.block.price', d.block.price)}${floorHint()}</label></div>${region('blocknote')}` : ''}`}
      </div>
      <div class="card">
        <h2>Member price</h2>
        ${radios('Member pricing', 'd.memberPricing.mode', m.mode, [{ value: 'none', label: 'No member price', hint: 'Everyone pays the same.' }, { value: 'percent', label: 'Percent off', hint: 'Members get a percentage off.' }, { value: 'fixed', label: 'Fixed price', hint: 'Members pay a set price.' }], true)}
        ${m.mode === 'percent' ? `<div class="ef-two">${field('Percent off', input('d.memberPricing.value', m.value, { type: 'number', attrs: 'min="0" max="100" step="1"' }))}</div>` : ''}
        ${m.mode === 'fixed' ? `<div class="ef-two">
          <label class="field"><span>Member drop-in price</span>${money('d.memberPricing.value', m.value)}${floorHint()}</label>
          ${oneOff ? '' : `<label class="field"><span>Member block price</span>${money('d.memberPricing.blockValue', m.blockValue)}${floorHint()}</label>`}
        </div>` : ''}
        ${m.mode === 'none' ? '' : `<fieldset class="ef-fieldset"><legend>Member price applies to</legend>
          ${check('d.memberPricing.applyToDropin', m.applyToDropin, 'Drop-in', { re: true })}
          ${oneOff ? '' : check('d.memberPricing.applyToBlock', m.applyToBlock, 'Block', { re: true })}
        </fieldset>
        ${check('d.memberCoversGuests', d.memberCoversGuests, 'Member price covers guests too', { re: true, hint: 'If off, it covers only the member\'s own ticket.' })}`}
      </div>
      <details class="ef-more" data-more${more ? ' open' : ''}><summary>More pricing options <span class="hint">Tiers, such as early bird, and add-ons</span></summary>
      <div class="card">
        <h2>Tiers (optional)</h2>
        <p class="hint">Such as early bird. Tiers sell in the order shown, then the standard price. All tiers share the session limit, so they can never oversell a session.</p>
        ${t2.length ? `<ol class="ef-rows">${t2.map(tierRow).join('')}</ol>` : ''}
        ${act('add-tier', 'Add a tier', { elId: 'ef-add-tier', cls: 'btn-ghost ef-add' })}
      </div>
      <div class="card">
        <h2>Add-ons (optional)</h2>
        <p class="hint">Extras customers can buy at checkout, such as racket hire or a protein shake. Discount codes do not come off these.</p>
        ${!d.venueId ? '<p class="hint">Choose a venue in step 1 to see its add-ons.</p>' : addOns.length ? addOns.map((a) => {
          const left = Core.addOnLeft(App.state, a);
          return `<label class="check"><input type="checkbox" id="ef-addon-${esc(a.id)}" data-addon="${esc(a.id)}" data-tip="Tick to offer this at checkout for this event."${d.addOnIds.includes(a.id) ? ' checked' : ''}><span>${esc(a.name)}, ${esc(UI.money(a.price))}${left === null ? '' : ` <span class="hint">(${left} left)</span>`}</span></label>`;
        }).join('') : '<p class="hint">This venue has no add-ons yet. Marketing sets these up in Settings.</p>'}
      </div>
      </details>
    </fieldset>
    <div class="card">
      <h2>Preview: what customers pay</h2>
      <div aria-live="polite">${region('preview')}</div>
    </div>`;
  }
  function capacityRowsHtml() {
    const list = liveSessions(w.data).slice().sort((a, b) => (a.start || '9').localeCompare(b.start || '9'));
    if (!list.length) return '<p class="hint">Add sessions in step 2 to see them here.</p>';
    return `<ol class="ef-rows">${list.map((x, i) => `<li class="ef-row ef-row-cap">
      <div>${x.start ? esc(UI.dateTime(x.start)) : `Session ${i + 1} (no date yet)`}</div>
      ${field(`Limit, session ${i + 1}`, input(`s.${x.id}.capacity`, x.capacity, { type: 'number', attrs: 'min="1" step="1"' }))}
      <div class="hint">${region(`left:${x.id}`)}</div>
    </li>`).join('')}</ol>`;
  }
  function capSummaryHtml() {
    const list = liveSessions(w.data);
    const places = list.reduce((n, x) => n + (blankNum(x.capacity) ? 0 : Number(x.capacity)), 0);
    const booked = list.reduce((n, x) => n + bookedOn(x), 0);
    const stat = (v, l, ic, i) => `<div class="stat">${UI.statIcon(ic, UI.statTone(i))}<b>${esc(v)}</b><span>${esc(l)}</span></div>`;
    return `<div class="grid stats ef-stats">${stat(list.length, list.length === 1 ? 'Session' : 'Sessions', 'calendar', 0)}${stat(places, 'Places in total', 'users', 1)}${stat(booked, 'Already booked', 'check', 2)}</div>`;
  }
  function stepCapacity() {
    const d = w.data;
    return `${region('capsum')}<div class="card">
      <div class="ef-two">
        ${field('Limit per session', input('w.capacity', w.capacity, { type: 'number', attrs: 'min="1" step="1"' }), 'Sets every session below. Change one row if a session differs.')}
        ${field('Show "few spaces left" at', input('d.lowSpaceThreshold', d.lowSpaceThreshold, { type: 'number', attrs: 'min="0" step="1"' }), 'Places left in a session.')}
        ${field('Drop-in limit per session (optional)', input('d.dropInLimit', d.dropInLimit, { type: 'number', attrs: 'min="0" step="1"' }), 'So drop-ins in one week do not stop block sales.')}
      </div>
    </div>
    <div class="card"><h2>Sessions</h2><div id="ef-cap-rows">${capacityRowsHtml()}</div></div>`;
  }
  function questionRow(q, i) {
    return `<li class="ef-row ef-row-q">
      <div class="ef-row-head"><b>Question ${i + 1}</b>${act('rm-q', 'Remove', { id: q.id, cls: 'btn-ghost btn-small', aria: `Remove question ${i + 1}` })}</div>
      ${field('Question text', input(`q.${q.id}.label`, q.label, { attrs: 'maxlength="160" autocomplete="off"' }))}
      <div class="ef-two">
        ${field('Answer type', select(`q.${q.id}.type`, q.type, [{ value: 'text', label: 'Text' }, { value: 'choice', label: 'Single choice' }, { value: 'tick', label: 'Tick box' }], { re: true }))}
        ${field('Asked', select(`q.${q.id}.scope`, q.scope, [{ value: 'booking', label: 'Once per booking' }, { value: 'guest', label: 'For each guest' }]))}
      </div>
      ${q.type === 'choice' ? field('Choices, one on each line', `<textarea id="ef-q.${esc(q.id)}.options" data-b="q.${esc(q.id)}.options" data-lines="1" rows="3">${esc(q.options.join('\n'))}</textarea>`) : ''}
      ${check(`q.${q.id}.required`, q.required, 'Required')}
      ${check(`q.${q.id}.sensitive`, q.sensitive, 'Sensitive answer', { hint: 'Ticked for you when the question mentions health, injury, medical or dietary needs.' })}
      ${region(`qnote:${q.id}`)}
    </li>`;
  }
  function stepGuests() {
    const d = w.data;
    return `<div class="card">
      <div class="ef-two">${field('Maximum tickets per booking', input('d.maxPerBooking', d.maxPerBooking, { type: 'number', attrs: 'min="1" step="1"' }), 'Such as 1 for coaching or 4 for a social.')}</div>
      ${radios('Details for each guest', 'd.guestDetails', d.guestDetails, [{ value: 'lead', label: 'Lead booker only', hint: 'Quickest checkout. Only the booker is named.' }, { value: 'name', label: 'Name for each guest', hint: 'Each place has a name on the list.' }, { value: 'nameEmail', label: 'Name and email for each guest', hint: 'Guests can be contacted directly.' }], true)}
      ${d.guestDetails === 'lead' ? '<p class="hint">Only the lead booker is asked, so nothing needs collecting later.</p>' : `
      ${radios('When are they collected?', 'd.collectAt', d.collectAt, [{ value: 'checkout', label: 'At checkout', hint: 'Everything is asked before paying.' }, { value: 'link', label: 'By a follow-up link after payment', hint: 'Fewer fields at checkout on a phone. Missing details show on Today and attendee lists.' }], true)}
      ${d.collectAt === 'link' ? UI.demo('The follow-up link and its reminders are simulated. No email is sent.') : ''}`}
      <p class="ef-issues ef-info"><b>Guest marketing consent is per person.</b> The lead booker cannot agree for their guests. Guests get booking messages only, and Klaviyo treats them as not subscribed until they opt in themselves.</p>
    </div>
    <div class="card">
      <h2>Custom questions (optional)</h2>
      ${d.questions.length ? `<ol class="ef-rows">${d.questions.map(questionRow).join('')}</ol>` : ''}
      ${act('add-q', 'Add a question', { elId: 'ef-add-q', cls: 'btn-ghost ef-add' })}
      ${w.id && eventSold(w.id) ? '<p class="hint">Tickets are sold. A new required question will show as missing on bookings already made.</p>' : ''}
    </div>`;
  }
  function reviewChecksHtml() {
    const c = checks();
    const line = (x) => `<li><span>${esc(x.text)}</span><button type="button" class="ef-link" data-act="step" data-id="${x.step}">Fix in step ${x.step + 1}</button></li>`;
    const stops = c.hard.concat(c.missing);
    const ready = stops.length
      ? `<div class="ef-ready ef-ready-bad" role="alert"><span class="ef-ready-ic" aria-hidden="true">!</span><div><b>${stops.length} thing${stops.length === 1 ? '' : 's'} to fix before this can go on sale</b><ul>${stops.map(line).join('')}</ul></div></div>`
      : `<div class="ef-ready ef-ready-good"><span class="ef-ready-ic" aria-hidden="true">&#10003;</span><div><b>${isPublished() || waitsOnMarketing() ? 'Ready to save' : needsApproval() ? 'Ready to send for approval' : 'Ready to publish'}</b><p class="muted">Everything this event needs is filled in.</p></div></div>`;
    return `${ready}${c.warn.length ? `<div class="ef-issues ef-warn"><b>Check these</b><ul>${c.warn.map(line).join('')}</ul></div>` : ''}`;
  }
  function priceSummary(d0) {
    const d = forCore(d0), m = d.memberPricing, parts = [];
    parts.push(`Standard ${UI.money(Core.standardPrice(d))}`);
    tiers(d).forEach((t) => parts.push(`${t.name || 'Tier'} ${UI.money(t.price)}`));
    if (d.block.enabled) parts.push(`Block ${UI.money(d.block.price)}`);
    if (!d.dropInsEnabled) parts.push('No drop-ins');
    if (m.mode === 'percent') parts.push(`Members ${Number(m.value)}% off`);
    if (m.mode === 'fixed') parts.push('Members pay a fixed price');
    return parts.join(' · ');
  }
  function summaryHtml() {
    const d = w.data, s = App.state, v = Core.findVenue(s, d.venueId), t = Core.findType(s, d.typeId);
    const live = liveSessions(d).filter((x) => x.start).map((x) => x.start).sort();
    const rows = [
      [0, 'Basics', `${d.title || 'No title'} · ${v ? v.name : 'No venue'} · ${d.format} · ${t ? t.name : 'No type'}`],
      [1, 'Schedule', live.length ? `${live.length} session${live.length === 1 ? '' : 's'}, ${UI.dateTime(live[0])}${live.length > 1 ? ` to ${UI.dateTime(live[live.length - 1])}` : ''}` : 'No sessions'],
      [2, 'Prices', priceSummary(d)],
      [3, 'Capacity', `${w.capacity !== '' ? `${w.capacity} per session` : 'Differs by session'} · few spaces at ${d.lowSpaceThreshold}${d.dropInLimit !== '' ? ` · drop-in limit ${d.dropInLimit}` : ''}`],
      [4, 'Guests', `Up to ${d.maxPerBooking} per booking · ${{ lead: 'lead booker only', name: 'name for each guest', nameEmail: 'name and email for each guest' }[d.guestDetails]} · ${d.questions.length} question${d.questions.length === 1 ? '' : 's'}`]
    ];
    return `<ul class="ef-summary">${rows.map((r) => `<li><div><b>${esc(r[1])}</b><br>${esc(r[2])}</div>${act('step', 'Change', { id: r[0], cls: 'btn-ghost btn-small', aria: `Change ${r[1]}` })}</li>`).join('')}</ul>`;
  }
  function phoneHtml() {
    const d = forCore(w.data), s = App.state, v = Core.findVenue(s, d.venueId);
    const live = liveSessions(d).filter((x) => x.start).sort((a, b) => a.start.localeCompare(b.start));
    const shown = live.slice(0, 6);
    const pay = (kind, isMember) => Core.quote({ event: d, kind, ticketTypeId: stdTicket(d).id, qty: 1, isMember, code: null, settings: s.settings }).total;
    const priceRow = (label, kind) => `<li><span>${esc(label)}</span><b>${esc(UI.money(pay(kind, false)))}</b>${pay(kind, true) < pay(kind, false) ? `<small>Members ${esc(UI.money(pay(kind, true)))}</small>` : ''}</li>`;
    const details = { lead: 'Your details only.', name: 'A name for each guest.', nameEmail: 'A name and email for each guest.' }[d.guestDetails];
    return `<div class="ef-phone" role="group" aria-label="Phone preview">
      <div class="ef-phone-screen">
        <h3>${esc(d.title || 'Event title')}</h3>
        <p class="hint">${esc(v ? v.name : 'Venue')}</p>
        <p>${esc(d.description || 'Description goes here.')}</p>
        <ul class="ef-phone-prices">${d.dropInsEnabled ? priceRow(live.length > 1 ? 'Single session' : 'Ticket', 'dropin') : ''}${d.block.enabled ? priceRow(`All ${live.length} sessions`, 'block') : ''}</ul>
        <ul class="ef-phone-dates">${shown.map((x) => `<li>${esc(UI.dateTime(x.start))}</li>`).join('') || '<li>Dates to follow</li>'}${live.length > shown.length ? `<li>and ${live.length - shown.length} more</li>` : ''}</ul>
        <p class="hint">We will ask for: ${esc(details)}${d.collectAt === 'link' && d.guestDetails !== 'lead' ? ' You can add these after paying.' : ''}</p>
        <div class="ef-phone-btn" aria-hidden="true">Book now</div>
      </div>
    </div>`;
  }
  function stepReview() {
    const d = w.data, sold = eventSold(w.id);
    const asks = needsApproval();
    const panel = isPublished() ? `<section class="ef-sec">
        <h2>This event is live</h2>
        <p class="hint">Saving changes goes through the same checks. ${sold ? `${sold} place${sold === 1 ? ' is' : 's are'} booked and keep the price paid.` : ''}</p>
      </section>` : waitsOnMarketing() ? `<section class="ef-sec">
        <h2>Waiting for marketing</h2>
        <p class="hint">Customers cannot book this event until marketing approves it. You can still change it here, or take back the request to keep working on it as a draft.</p>
      </section>` : `<section class="ef-sec ef-publish">
        <h2>${asks ? 'Send for approval' : 'Publish'}</h2>
        ${asks ? `<p class="ef-issues ef-info">${esc(APPROVAL_WORDS)}</p>` : ''}
        ${isPending() ? '<p class="ef-issues ef-info">A club manager sent this for approval. Publishing it here also approves it. To reject it, use the event page.</p>' : ''}
        ${radios('When should it go on sale?', 'w.publish', w.publish, asks
          ? [{ value: 'now', label: 'When approved', hint: 'On sale as soon as marketing approves it.' }, { value: 'schedule', label: 'Schedule', hint: 'Stays hidden until it is approved and the on-sale date comes.' }]
          : [{ value: 'now', label: 'Publish now', hint: 'On sale straight away.' }, { value: 'schedule', label: 'Schedule', hint: 'Stays hidden until the on-sale date.' }], true)}
        ${w.publish === 'schedule' ? field('On-sale date', input('d.salesOpenAt', d.salesOpenAt, { type: 'datetime-local' })) : d.salesOpenAt && new Date(d.salesOpenAt) > App.now() ? `<p class="hint">${asks ? 'This' : 'Publishing now'} replaces the on-sale date you set in step 1.</p>` : ''}
        ${UI.demo('Publishing changes this demo only. No real website is updated.')}
      </section>`;
    return `<div class="ef-review">
      ${region('review')}
      <section class="ef-sec"><h2>Summary</h2>${region('summary')}</section>
      ${panel}
      <details class="ef-prev"><summary>Preview on a phone</summary>${region('phone')}</details>
    </div>`;
  }
  const STEP_FNS = [stepBasics, stepSchedule, stepPricing, stepCapacity, stepGuests, stepReview];

  /* The last step ends with the one action that matters, kept in view at the bottom. */
  function lastActions() {
    const c = checks(), blocked = c.hard.concat(c.missing).length > 0;
    if (isPublished()) return (eventSold(w.id) ? '' : act('to-draft', 'Move back to draft')) + act('save', 'Save changes', { cls: 'btn-primary', disabled: blocked });
    if (waitsOnMarketing()) return act('to-draft', 'Take back the request') + act('save', 'Save changes', { cls: 'btn-primary', disabled: blocked });
    if (isPending()) return act('save', 'Save changes') + act('publish', w.publish === 'schedule' ? 'Approve and schedule' : 'Approve and publish', { cls: 'btn-primary', disabled: blocked });
    if (needsApproval()) return act('save', 'Save as draft') + act('publish', 'Send for approval', { cls: 'btn-primary', disabled: blocked });
    return act('save', 'Save as draft') + act('publish', w.publish === 'schedule' ? 'Schedule' : 'Publish now', { cls: 'btn-primary', disabled: blocked });
  }

  /* ---------- Drawing ---------- */
  /* ---------- Quick create: one screen for an everyday event. "More options" opens the six steps on the same working copy. ---------- */
  function quickHtml() {
    const d = w.data, s = App.state, venues = allowedVenues(), std = stdTicket(d), r = w.rule, weekly = d.format !== 'One-off';
    const venueItems = (venues.length === 1 ? [] : [{ value: '', label: 'Choose a venue' }]).concat(venues.map((v) => ({ value: v.id, label: v.name })));
    const typeItems = [{ value: '', label: 'Choose a type' }].concat(s.eventTypes.map((t) => ({ value: t.id, label: t.name })));
    const hasTemplates = s.eventTypes.some((t) => t.template);
    return `<div class="ef-quick">
      ${field('Title', input('d.title', d.title, { attrs: 'maxlength="120" autocomplete="off"' }))}
      <div class="ef-two">
        ${field('Venue', select('d.venueId', d.venueId, venueItems, { re: true }))}
        ${field('Event type', select('d.typeId', d.typeId, typeItems, { re: true }), hasTemplates ? 'Fills in the price, places and questions for this type.' : '')}
      </div>
      ${radios('How often', 'd.format', weekly ? d.format : 'One-off', [{ value: 'One-off', label: 'One date', hint: 'A single session.' }, { value: 'Seasonal series', label: 'Every week', hint: 'Same day and time each week.' }], true)}
      <div class="ef-two">
        ${field(weekly ? 'First date and time' : 'Date and time', input('w.rule.first', r.first, { type: 'datetime-local' }))}
        ${field('Minutes', input('w.rule.durationMin', r.durationMin, { type: 'number', attrs: 'min="1" step="5"' }))}
        ${weekly ? field('Number of weeks', input('w.rule.count', r.count, { type: 'number', attrs: 'min="2" max="52" step="1"' })) : ''}
        <label class="field"><span>Price per ticket</span>${money(`t.${std.id}.price`, std.price)}${floorHint()}</label>
        ${field('Places per session', input('w.capacity', w.capacity, { type: 'number', attrs: 'min="1" step="1"' }))}
      </div>
      ${field('Description', `<textarea id="ef-d.description" data-b="d.description" rows="3">${esc(d.description)}</textarea>`)}
      ${region('quickissues')}
      ${needsApproval() ? `<p class="hint">${esc(APPROVAL_WORDS)}</p>` : ''}
      <p class="ef-quick-more"><button type="button" class="ef-link" data-act="more">More options</button> <span class="hint">Block and member prices, tiers, add-ons, guest details and questions.</span></p>
    </div>`;
  }
  function quickIssuesHtml() {
    if (!w.quickTried) return '';
    const c = checks(), stops = c.hard.concat(c.missing);
    return stops.length ? `<div class="ef-issues ef-bad" role="alert"><b>${stops.length} thing${stops.length === 1 ? '' : 's'} to fix before this can go on sale</b><ul>${stops.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul></div>` : '';
  }
  /* Turn the quick fields into sessions, the same way the schedule step would. */
  function quickApply() {
    const d = w.data, r = w.rule;
    const mins = isInt(r.durationMin) && Number(r.durationMin) > 0 ? Number(r.durationMin) : 60;
    const cap = w.capacity === '' || w.capacity === null || w.capacity === undefined ? '' : Number(w.capacity);
    const make = (start) => ({ id: tempId('s'), start, durationMin: mins, capacity: cap, cancelled: false });
    if (d.format === 'One-off') d.sessions = [make(r.first || '')];
    else {
      r.end = 'count';
      const dates = r.first ? ruleDates().filter((x) => !x.skipped) : [];
      d.sessions = dates.length ? dates.map((x) => make(x.start)) : [make('')];
    }
    w.mode = 'dates';
  }
  function quickSave(mode) {
    if (!App.can('events.edit')) { UI.toast('Your role cannot change events.', 'bad'); return; }
    quickApply();
    const c = checks(), stops = mode === 'draft' ? c.hard : c.hard.concat(c.missing);
    w.quickTried = true;
    if (stops.length) {
      refresh();
      UI.toast(mode === 'draft' ? stops[0].text : `${stops.length} thing${stops.length === 1 ? '' : 's'} to fix before publishing. See the list above the buttons.`, 'bad');
      return;
    }
    if (mode !== 'draft') w.publish = 'now';
    attemptSave(mode === 'draft' ? 'draft' : 'now');
  }
  function drawQuick(focusId) {
    const body = root.querySelector('.ef-body');
    root.dataset.step = 'quick';
    body.innerHTML = `${quickHtml()}<div class="ef-footer">${act('cancel', 'Cancel')}${act('quick-draft', 'Save as draft')}${act('quick-publish', needsApproval() ? 'Send for approval' : 'Publish now', { cls: 'btn-primary' })}</div>`;
    refresh();
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) el.focus();
    }
  }

  function drawStep(focusId) {
    if (w.quick) { drawQuick(focusId); return; }
    const body = root.querySelector('.ef-body');
    root.dataset.step = String(w.step);
    body.innerHTML = `<h2 class="ef-step-title" tabindex="-1">Step ${w.step + 1} of 6: ${esc(STEPS[w.step])}</h2><p class="muted ef-step-intro">${esc(STEP_INTROS[w.step])}</p>${w.step === 5 ? '' : region('issues')}${STEP_FNS[w.step]()}
      <div class="ef-footer">
        ${w.step === 0 ? act('cancel', 'Cancel') : act('back', 'Back')}
        ${w.step < 5 ? act('next', 'Next', { cls: 'btn-primary', aria: `Next: ${STEPS[w.step + 1]}` }) : lastActions()}
      </div>`;
    refresh();
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) el.focus();
    }
  }
  function goStep(i) {
    w.touched[w.step] = true;
    w.step = Math.max(0, Math.min(5, i));
    if (w.step === 5) STEPS.forEach((_, k) => { w.touched[k] = true; });
    drawStep();
    const h = root.querySelector('.ef-step-title');
    if (h) h.focus();
    const scroller = root.closest('.dialog-body');   /* the form scrolls inside its modal */
    if (scroller) scroller.scrollTop = 0; else window.scrollTo(0, 0);
  }

  /* ---------- Typing ---------- */
  function locate(path) {
    const [head, ...rest] = path.split('.');
    let obj;
    if (head === 'w') obj = w;
    else if (head === 'd') obj = w.data;
    else {
      const id = rest.shift();
      const list = { t: w.data.tickets, s: w.data.sessions, q: w.data.questions }[head];
      obj = list.find((x) => x.id === id);
    }
    if (!obj) return null;
    while (rest.length > 1) obj = obj[rest.shift()];
    return [obj, rest[0]];
  }
  /* A new event takes its defaults from the event type's template. Only blank fields are filled, so nothing typed is lost. */
  function applyTemplate() {
    const d = w.data, t = Core.findType ? Core.findType(App.state, d.typeId) : null, tpl = t && t.template;
    if (!tpl || w.id) return;
    const std = stdTicket(d);
    if (tpl.price !== undefined && tpl.price !== null && tpl.price !== '' && blankNum(std.price)) std.price = Number(tpl.price);
    if (tpl.capacity && (w.capacity === '' || w.capacity === null || w.capacity === undefined)) {
      w.capacity = Number(tpl.capacity);
      liveSessions(d).forEach((x) => { x.capacity = w.capacity; });
    }
    if (tpl.durationMin) {
      w.rule.durationMin = Number(tpl.durationMin);
      liveSessions(d).forEach((x) => { if (!x.start) x.durationMin = Number(tpl.durationMin); });
    }
    if (tpl.maxPerBooking) d.maxPerBooking = Number(tpl.maxPerBooking);
    if (tpl.guestDetails) d.guestDetails = tpl.guestDetails;
    if (Array.isArray(tpl.questions) && tpl.questions.length && !d.questions.length) {
      d.questions = tpl.questions.map((q) => Object.assign({ type: 'text', required: false, scope: 'booking', options: [] }, clone(q),
        { id: tempId('q'), sensitive: typeof q.sensitive === 'boolean' ? q.sensitive : SENSITIVE.test(q.label || '') }));
    }
  }
  function afterBind(path) {
    const d = w.data;
    if (path === 'd.typeId') applyTemplate();
    if (path === 'd.venueId') {
      const ok = new Set(venueAddOns(d).map((a) => a.id));
      d.addOnIds = d.addOnIds.filter((id) => ok.has(id));
    }
    if (path === 'd.format') {
      if (d.format === 'One-off') {
        d.block.enabled = false; d.dropInsEnabled = true; d.memberPricing.applyToBlock = false; w.mode = 'dates';
        if (!liveSessions(d).length) d.sessions.push({ id: tempId('s'), start: '', durationMin: 60, capacity: w.capacity, cancelled: false });
      } else if (d.format === 'Regular series' && !liveSessions(d).some((x) => x.start)) {
        w.mode = 'rule';
      }
    }
    const qPart = path.match(/^q.(.+).(label|sensitive)$/);
    if (qPart && qPart[2] === 'sensitive') w.qManual[qPart[1]] = true;
    if (qPart && qPart[2] === 'label' && !w.qManual[qPart[1]]) {
      const q = d.questions.find((y) => y.id === qPart[1]);
      q.sensitive = SENSITIVE.test(q.label);
      const box = document.getElementById(ctlId(`q.${q.id}.sensitive`));
      if (box) box.checked = q.sensitive;
    }
    if (path === 'd.memberPricing.mode') { d.memberPricing.value = ''; d.memberPricing.blockValue = ''; }
    if (path === 'w.capacity') {
      liveSessions(d).forEach((x) => { x.capacity = w.capacity; });
      const rows = document.getElementById('ef-cap-rows');
      if (rows) rows.innerHTML = capacityRowsHtml();
    }
    if (/^s\..*\.capacity$/.test(path)) {
      w.capacity = commonCapacity(d);
      const top = document.getElementById(ctlId('w.capacity'));
      if (top && top !== document.activeElement) top.value = w.capacity;
    }
  }
  function onEdit(ev) {
    const el = ev.target;
    if (el.dataset.addon) {
      const id = el.dataset.addon;
      w.data.addOnIds = w.data.addOnIds.filter((x) => x !== id);
      if (el.checked) w.data.addOnIds.push(id);
      refresh();
      return;
    }
    const path = el.dataset.b;
    if (!path) return;
    if (el.type === 'radio' && !el.checked) return;
    const spot = locate(path);
    if (!spot) return;
    let value = el.value;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.type === 'number') value = el.value === '' ? '' : Number(el.value);
    else if (el.dataset.lines) value = el.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    /* The second event for the same edit (input, then change) must not run the side effects again. */
    const same = JSON.stringify(spot[0][spot[1]]) === JSON.stringify(value);
    spot[0][spot[1]] = value;
    if (!same) afterBind(path);
    if (el.dataset.re && ev.type === 'change') drawStep(el.id);
    else refresh();
  }

  /* ---------- Buttons ---------- */
  const ACTIONS = {
    step: (id) => goStep(Number(id)),
    next: () => goStep(w.step + 1),
    cancel: () => App.go('#/events'),
    back: () => goStep(w.step - 1),
    save: () => attemptSave(isPublished() ? 'live' : isPending() ? 'pending' : 'draft'),
    publish: () => attemptSave(w.publish === 'schedule' ? 'schedule' : 'now'),
    'to-draft': () => attemptSave('to-draft'),
    discard: () => UI.dialog({
      title: 'Discard unsaved changes?',
      body: '<p>This goes back to the last saved version of this form.</p>',
      actions: [{ label: 'Keep editing', kind: 'ghost' }, { label: 'Discard', kind: 'danger', onClick: () => {
        works.delete(w.key); w = null; App.render();
      } }]
    }),
    'add-session': () => {
      const list = liveSessions(w.data), last = list[list.length - 1];
      const x = { id: tempId('s'), start: '', durationMin: last ? last.durationMin : 60, capacity: w.capacity, cancelled: false };
      w.data.sessions.push(x);
      drawStep(ctlId(`s.${x.id}.start`));
    },
    'rm-session': (id) => {
      const x = w.data.sessions.find((y) => y.id === id);
      if (!x || bookedOn(x) > 0) { UI.toast('This session has bookings, so it cannot be removed here.', 'bad'); return; }
      w.data.sessions = w.data.sessions.filter((y) => y.id !== id);
      w.capacity = commonCapacity(w.data) || w.capacity;
      drawStep('ef-add-session');
    },
    'add-rule': () => {
      if (!isInt(w.rule.durationMin) || Number(w.rule.durationMin) < 1) { UI.toast('Enter the session length in whole minutes.', 'bad'); return; }
      const have = new Set(liveSessions(w.data).map((x) => x.start));
      const toAdd = ruleDates().filter((x) => !x.skipped && !have.has(x.start));
      w.data.sessions = w.data.sessions.filter((x) => x.start || x.cancelled);
      toAdd.forEach((x) => w.data.sessions.push({ id: tempId('s'), start: x.start, durationMin: Number(w.rule.durationMin), capacity: w.capacity, cancelled: false }));
      UI.toast(`${toAdd.length} session${toAdd.length === 1 ? '' : 's'} added to the schedule.`);
      drawStep('ef-add-session');
    },
    'add-skip': () => {
      const v = w.rule.skipInput;
      if (!v) { UI.toast('Choose a date to skip first.', 'bad'); return; }
      if (!w.rule.skips.includes(v)) w.rule.skips.push(v);
      w.rule.skips.sort();
      w.rule.skipInput = '';
      drawStep('ef-add-skip');
    },
    'rm-skip': (id) => { w.rule.skips = w.rule.skips.filter((x) => x !== id); drawStep('ef-add-skip'); },
    'add-tier': () => {
      if (!App.can('pricing.edit')) return;
      const t = { id: tempId('tt'), name: '', price: '', qty: '', salesStart: '', salesEnd: '' };
      w.data.tickets.push(t);
      drawStep(ctlId(`t.${t.id}.name`));
    },
    'rm-tier': (id) => {
      if (!App.can('pricing.edit')) return;
      if (ticketSold(w.id, id) > 0) { UI.toast('This tier has sales, so it stays.', 'bad'); return; }
      w.data.tickets = w.data.tickets.filter((t) => t.id !== id);
      drawStep('ef-add-tier');
    },
    'add-q': () => {
      const q = { id: tempId('q'), label: '', type: 'text', required: false, scope: 'booking', options: [], sensitive: false };
      w.data.questions.push(q);
      drawStep(ctlId(`q.${q.id}.label`));
    },
    'quick-draft': () => quickSave('draft'),
    'quick-publish': () => quickSave('now'),
    more: () => { quickApply(); w.quick = false; w.step = 0; App.render(); },
    'rm-q': (id) => { w.data.questions = w.data.questions.filter((q) => q.id !== id); drawStep('ef-add-q'); }
  };

  /* ---------- Saving ---------- */
  function priceFacts(d) {
    const m = d.memberPricing, f = {}, std = stdTicket(d);
    const fmt = (v) => (blankNum(v) ? 'not set' : UI.money(v));
    f['Standard price'] = fmt(std.price);
    tiers(d).forEach((t) => { f[`Tier ${t.name || t.id}`] = fmt(t.price); });
    f['Drop-ins'] = d.dropInsEnabled ? 'on' : 'off';
    f.Block = d.block.enabled ? fmt(d.block.price) : 'off';
    f['Member price'] = m.mode === 'none' ? 'none' : m.mode === 'percent' ? `${blankNum(m.value) ? 0 : Number(m.value)}% off` : `fixed: drop-in ${fmt(m.value)}, block ${fmt(m.blockValue)}`;
    if (m.mode !== 'none') {
      f['Member price applies to'] = [m.applyToDropin ? 'drop-in' : '', m.applyToBlock ? 'block' : ''].filter(Boolean).join(' and ') || 'nothing';
      f['Member price covers guests'] = d.memberCoversGuests ? 'yes' : 'no';
    }
    return f;
  }
  function priceChanges(before, after) {
    const a = priceFacts(before), b = priceFacts(after), out = [];
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach((k) => {
      if (a[k] !== b[k]) out.push(`${k}: ${a[k] === undefined ? 'added' : a[k]} to ${b[k] === undefined ? 'removed' : b[k]}`);
    });
    return out;
  }
  function attemptSave(mode) {
    if (!App.can('events.edit')) { UI.toast('Your role cannot change events.', 'bad'); return; }
    const c = checks();
    if (c.hard.length) {
      UI.toast(c.hard[0].text, 'bad');
      if (w.step !== c.hard[0].step) goStep(c.hard[0].step); else refresh();
      return;
    }
    const publishing = mode === 'now' || mode === 'schedule' || mode === 'live' || mode === 'pending';
    if (publishing && c.missing.length) {
      UI.toast(`${c.missing.length} thing${c.missing.length === 1 ? '' : 's'} to fix first. See the list on this step.`, 'bad');
      goStep(5);
      return;
    }
    if (mode === 'schedule' && !(w.data.salesOpenAt && new Date(w.data.salesOpenAt) > App.now())) {
      UI.toast('To schedule, choose an on-sale date in the future.', 'bad');
      const el = document.getElementById(ctlId('d.salesOpenAt'));
      if (el) el.focus();
      return;
    }
    if (mode === 'to-draft' && eventSold(w.id) > 0) { UI.toast('This event has bookings, so it cannot go back to draft.', 'bad'); return; }
    const event = w.id ? Core.findEvent(App.state, w.id) : null;
    const changes = event && !event.draft && App.can('pricing.edit') ? priceChanges(normalise(event), w.data) : [];
    /* Only the marketing admin gets here with a price under the lowest price: the checks above stop anyone else. */
    const low = isAdmin() && App.can('pricing.edit') ? newFloorHits() : [];
    if (changes.length || low.length) {
      const booked = w.id ? eventBookings(w.id).length : 0;
      const changeHtml = changes.length ? `<p>These apply to new bookings only. ${booked ? `The ${booked} booking${booked === 1 ? '' : 's'} already made keep the price paid.` : ''} Each change goes in the activity log.${isAdmin() ? '' : ' Marketing gets a notice too.'}</p><ul>${changes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
      const lowHtml = low.length ? `<p><b>Below the lowest price</b></p><ul>${low.map((h) => `<li>${esc(floorText(h))}</li>`).join('')}</ul>
        <label class="field"><span>Reason for going below it (required, kept in the activity log)</span><input type="text" id="ef-floor-reason" maxlength="200" autocomplete="off"></label>` : '';
      UI.dialog({
        title: low.length ? 'Save a price below the lowest price?' : 'Change prices on a live event?',
        body: changeHtml + lowHtml,
        actions: [{ label: 'Keep editing', kind: 'ghost' }, { label: 'Save changes', kind: 'primary', onClick: (d) => {
          const reason = low.length ? d.querySelector('#ef-floor-reason').value.trim() : '';
          if (low.length && !reason) { UI.dialogError(d, 'Add a reason.'); return false; }
          commit(mode, changes, low.length ? { reason, text: low.map(floorText).join(' ') } : null);
          return undefined;
        } }]
      });
      return;
    }
    commit(mode, []);
  }
  function commit(mode, changes, floorOverride) {
    const s = App.state, now = App.now(), by = App.user().name;
    let event = w.id ? Core.findEvent(s, w.id) : null;
    /* Worked out before anything changes. */
    const publishing = mode === 'now' || mode === 'schedule';
    const asks = publishing && needsApproval();
    const settles = publishing && !asks && (isPending() || approvalOf(w.data) === 'rejected');
    const withdrawn = mode === 'to-draft' && isPending();
    w.quick = false;
    const d = clone(w.data);
    if (!App.can('pricing.edit') && event) {
      const old = normalise(event);
      ['tickets', 'block', 'memberPricing', 'memberCoversGuests', 'dropInsEnabled', 'addOnIds'].forEach((k) => { d[k] = old[k]; });
    }
    /* Tickets: tiers first, then the standard price. A blank price is kept as £0 with a flag, so a draft cannot pass as a free event. */
    const std = stdTicket(d);
    d.tickets = tiers(d).concat([std]).map((t) => {
      const out = Object.assign({}, t, { id: isTemp(t.id) ? Core.nextId(s, 'tt') : t.id, price: Number(t.price) || 0 });
      if (blankNum(t.price)) out.priceUnset = true;
      out.qty = blankNum(t.qty) ? null : Number(t.qty);
      return out;
    });
    const undated = d.sessions.filter((x) => !x.start).length;
    d.sessions = d.sessions.filter((x) => x.start).map((x) => Object.assign({}, x, {
      id: isTemp(x.id) ? Core.nextId(s, 's') : x.id,
      durationMin: Number(x.durationMin) || 60, capacity: Number(x.capacity) || 0
    })).sort((a, b) => a.start.localeCompare(b.start));
    d.questions = d.questions.map((q) => {
      const out = Object.assign({}, q, { id: isTemp(q.id) ? Core.nextId(s, 'q') : q.id, label: String(q.label).trim() });
      if (out.type !== 'choice') out.options = [];
      out.sensitive = !!q.sensitive;
      return out;
    });
    d.title = String(d.title).trim() || UNTITLED;
    d.block = { enabled: !!d.block.enabled, price: Number(d.block.price) || 0 };
    const m = d.memberPricing;
    m.value = m.mode === 'fixed' ? (blankNum(m.value) ? null : Number(m.value)) : Number(m.value) || 0;
    m.blockValue = blankNum(m.blockValue) ? null : Number(m.blockValue);
    d.lowSpaceThreshold = isInt(d.lowSpaceThreshold) ? Number(d.lowSpaceThreshold) : s.settings.lowSpaceThreshold;
    d.dropInLimit = blankNum(d.dropInLimit) ? null : Number(d.dropInLimit);
    d.maxPerBooking = isInt(d.maxPerBooking) && Number(d.maxPerBooking) > 0 ? Number(d.maxPerBooking) : 6;
    if (d.guestDetails === 'lead') d.collectAt = 'checkout';
    if (w.rule.first) d.repeat = { first: w.rule.first, durationMin: w.rule.durationMin, end: w.rule.end, count: w.rule.count, until: w.rule.until, skips: w.rule.skips };

    if (mode === 'draft' || mode === 'to-draft') d.draft = true;
    if (mode === 'now') {
      d.draft = false;
      if (d.salesOpenAt && new Date(d.salesOpenAt) > now) d.salesOpenAt = Core.toLocalISO(now);
    }
    if (mode === 'schedule') d.draft = false;
    /* While it waits it stays a draft underneath, so every booking screen and report leaves it out. */
    if (asks) { d.draft = true; d.approval = { status: 'pending', by, at: Core.toLocalISO(now) }; }
    if (settles) d.approval = { status: 'approved', by, at: Core.toLocalISO(now) };
    if (withdrawn) delete d.approval;
    if (!event) {
      d.id = Core.nextId(s, 'e');
      s.events.push(d);
      event = d;
    } else {
      Object.keys(event).forEach((k) => { if (!(k in d)) delete event[k]; });
      Object.assign(event, d);
    }
    changes.forEach((text) => App.log('Price change', `${event.title}: ${text}. Applies to new bookings only.`));
    if (changes.length && App.role() === 'manager') Core.notice(s, { at: now, by, kind: 'price', text: `${event.title}: ${changes.join('; ')}. Applies to new bookings only.` });
    if (floorOverride) App.log('Override', `${event.title}: ${floorOverride.text} Reason: ${floorOverride.reason}`);
    if (asks) {
      const venue = Core.findVenue(s, event.venueId);
      Core.notice(s, { at: now, by, kind: 'event', text: `${event.title}${venue ? ` at ${venue.name}` : ''} is waiting for approval.` });
      App.log('Event', `${event.title}: sent to marketing for approval.`);
    } else {
      if (settles) App.log('Event', `${event.title}: approved while publishing.`);
      if (mode === 'now') App.log('Event', `Published ${event.title}.`);
      if (mode === 'schedule') App.log('Event', `Scheduled ${event.title} to go on sale ${UI.dateTime(event.salesOpenAt)}.`);
    }
    if (mode === 'pending') App.log('Event', `Edited ${event.title} while it waits for approval.`);
    if (mode === 'to-draft') App.log('Event', withdrawn ? `${event.title}: approval request taken back.` : `Moved ${event.title} back to draft.`);
    if (mode === 'live') App.log('Event', `Edited ${event.title}.`);
    App.save();

    const keep = { step: w.step, mode: w.mode, touched: w.touched };
    works.delete(w.key);
    if (mode === 'now' || mode === 'schedule') {
      w = null;
      UI.toast(asks ? 'Sent to marketing for approval.' : mode === 'now' ? 'Published.' : 'Scheduled.');
      App.go(`#/events/${encodeURIComponent(event.id)}`);
      return;
    }
    const key = workKey(event.id);
    w = newWork(key, event);
    Object.assign(w, keep, { focusHead: true });
    works.set(key, w);
    const note = undated ? ` ${undated} session${undated === 1 ? '' : 's'} with no date ${undated === 1 ? 'was' : 'were'} left out.` : '';
    UI.toast((mode === 'pending' ? 'Changes saved. Still waiting for marketing.' : event.draft ? 'Draft saved.' : 'Changes saved.') + note);
    App.go(`#/events/${encodeURIComponent(event.id)}/edit`);
  }

  /* ---------- Entry point ---------- */
  const workKey = (id) => `${App.user().id}:${id || 'new'}`;
  const stop = (mainEl, text) => {
    mainEl.innerHTML = `${UI.empty(text)}<p><a class="btn" href="#/events">Back to events</a></p>`;
  };
  function render(mainEl, eventId) {
    if (!App.can('events.edit')) { stop(mainEl, 'Your role cannot create or change events.'); return; }
    const event = eventId ? Core.findEvent(App.state, eventId) : null;
    if (eventId && !event) { stop(mainEl, 'This event could not be found.'); return; }
    if (event && !Core.canSeeVenue(App.user(), event.venueId)) { stop(mainEl, 'This event is at another venue, so your role cannot change it.'); return; }
    if (event && !App.inVenue(event.venueId)) { stop(mainEl, 'This event is not at the venue in view. Change the venue at the top to edit it.'); return; }
    if (event && event.cancelled) { stop(mainEl, 'This event is cancelled, so it cannot be changed.'); return; }

    const key = workKey(eventId);
    let found = works.get(key), notice = '';
    if (found && found.stateRef !== App.state) found = null;
    if (found && event && found.baseJson !== JSON.stringify(event)) {
      if (JSON.stringify(found.data) !== found.savedJson) notice = 'This event was changed on another screen, so your unsaved changes here were dropped.';
      found = null;
    }
    if (!found) { found = newWork(key, event); works.set(key, found); }
    w = found;

    const status = event ? Core.eventStatus(App.state, event, App.now()) : 'Draft';
    const refused = event && event.draft && approvalOf(event) === 'rejected' ? event.approval : null;
    mainEl.innerHTML = `<div class="ef">
      ${w.quick ? '' : `<p class="ef-status">${statusBadge(status)} <span data-r="saved">${saveLabelHtml()}</span> ${act('save', isPublished() || isPending() ? 'Save changes' : 'Save draft')} ${act('discard', 'Discard changes')}</p>`}
      ${notice ? `<p class="ef-issues ef-warn" role="alert">${esc(notice)}</p>` : ''}
      ${refused ? `<p class="ef-issues ef-warn"><b>Marketing did not approve this event.</b> Reason: ${esc(refused.reason)}</p>` : ''}
      ${w.quick ? '' : `<nav aria-label="Form steps">${region('steps')}</nav>`}
      <div class="ef-body"></div>
    </div>`;
    root = mainEl.querySelector('.ef');
    root.addEventListener('input', onEdit);
    root.addEventListener('change', onEdit);
    /* toggle does not bubble, so listen while it travels down */
    root.addEventListener('toggle', (ev) => { if (ev.target.matches && ev.target.matches('details[data-more]')) w.morePricing = ev.target.open; }, true);
    root.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const fn = ACTIONS[b.dataset.act];
      if (fn) fn(b.dataset.id);
    });
    drawStep();
    if (w.focusHead) {
      w.focusHead = false;
      const h = root.querySelector('.ef-step-title');
      if (h) h.focus();
    }
  }
  /* events.js asks this to choose the modal subtitle. */
  const isQuick = (eventId) => {
    if (eventId) return false;
    const f = works.get(workKey(null));
    return !f || f.stateRef !== App.state || !!f.quick;
  };
  /* events.js asks this before a club manager publishes from the event page. */
  const floorIssues = (event) => floorHits(normalise(event)).map(floorText);
  window.EventForm = { render, isQuick, floorIssues };
})();
