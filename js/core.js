/* Core rules: no DOM in this file, so the same code runs in the browser and in node tests. */
(function (root) {
  'use strict';
  const Core = {};

  /* ---------- Numbers and dates ---------- */
  const toP = (n) => Math.round(Number(((Number(n) || 0) * 100).toFixed(6)));
  const fromP = (p) => p / 100;
  Core.round2 = (n) => fromP(toP(n));

  /* Split a total into n parts that add up exactly, to the penny. */
  Core.split = function (total, n) {
    if (n <= 0) return [];
    const p = toP(total), base = Math.floor(p / n);
    let extra = p - base * n;
    const out = [];
    for (let i = 0; i < n; i++) { out.push(fromP(base + (extra > 0 ? 1 : 0))); extra--; }
    return out;
  };

  const pad = (n) => String(n).padStart(2, '0');
  Core.toLocalISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  Core.dayKey = (v) => { const d = new Date(v); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  Core.addDays = function (iso, days) { const d = new Date(iso); d.setDate(d.getDate() + days); return Core.toLocalISO(d); };

  /* ---------- Roles ---------- */
  /* Three roles: an admin runs everything, a club manager runs one venue, a customer books tickets for themselves. */
  Core.ROLE_NAMES = { admin: 'Admin', manager: 'Club manager', user: 'Customer' };
  Core.ROLES = Object.keys(Core.ROLE_NAMES);
  Core.isStaff = (role) => role === 'admin' || role === 'manager';
  /* Pages and actions that only a customer has, so the admin's '*' does not switch them on. */
  const CUSTOMER_ONLY = ['browse', 'mytickets'];
  const PERMS = {
    admin: ['*'],
    manager: ['today', 'events.view', 'events.edit', 'events.cancel', 'pricing.view', 'pricing.edit',
      'bookings.view', 'bookings.create', 'bookings.modify', 'bookings.transfer', 'bookings.cancel',
      'bookings.comp', 'refund.full', 'refund.partial', 'lists.export', 'checkin', 'reports', 'override', 'codes.view', 'partners.view'],
    user: CUSTOMER_ONLY
  };
  Core.can = (role, perm) => { const p = PERMS[role] || []; return p.includes(perm) || (p.includes('*') && !CUSTOMER_ONLY.includes(perm)); };
  /* Admins and customers see every venue; a club manager is fixed to their own. */
  Core.allVenues = (user) => user.role === 'admin' || user.role === 'user';
  /* A staff member can be linked to more than one venue: venueIds is optional, next to venueId. */
  Core.canSeeVenue = (user, venueId) => Core.allVenues(user) || user.venueId === venueId || (user.venueIds || []).includes(venueId);

  /* ---------- Lookups ---------- */
  Core.findEvent = (s, id) => s.events.find((e) => e.id === id);
  Core.findVenue = (s, id) => s.venues.find((v) => v.id === id);
  Core.findBooking = (s, id) => s.bookings.find((b) => b.id === id);
  Core.findCode = (s, id) => s.codes.find((c) => c.id === id);
  Core.findPartner = (s, id) => s.partners.find((p) => p.id === id);
  Core.findType = (s, id) => s.eventTypes.find((t) => t.id === id);
  Core.findSession = function (s, sessionId) {
    for (const e of s.events) {
      const session = e.sessions.find((x) => x.id === sessionId);
      if (session) return { event: e, session };
    }
    return null;
  };
  Core.nextId = (s, prefix) => `${prefix}${++s.seq}`;
  Core.sortedSessions = (e) => e.sessions.slice().sort((a, b) => a.start.localeCompare(b.start));

  /* ---------- Capacity ---------- */
  Core.sessionTaken = function (s, sessionId) {
    let n = 0;
    for (const b of s.bookings) for (const t of b.tickets) if (t.sessionId === sessionId && t.status === 'active') n++;
    return n;
  };
  Core.sessionCheckedIn = function (s, sessionId) {
    let n = 0;
    for (const b of s.bookings) for (const t of b.tickets) if (t.sessionId === sessionId && t.status === 'active' && t.checkedInAt) n++;
    return n;
  };
  Core.placesLeft = (s, session) => Math.max(0, session.capacity - Core.sessionTaken(s, session.id));
  Core.remainingSessions = (e, now) => Core.sortedSessions(e).filter((x) => !x.cancelled && new Date(x.start) > now);
  /* A block takes one place in every remaining session, so the fullest session sets the limit. */
  Core.blockPlacesLeft = function (s, e, now) {
    const rem = Core.remainingSessions(e, now);
    if (!rem.length) return 0;
    return Math.min(...rem.map((x) => Core.placesLeft(s, x)));
  };
  Core.capacityShortfall = function (s, sessionIds, qty) {
    const short = [];
    for (const id of sessionIds) {
      const f = Core.findSession(s, id);
      if (!f) continue;
      const left = Core.placesLeft(s, f.session);
      if (left < qty) short.push({ session: f.session, left });
    }
    return short;
  };

  /* Block sales stop when the first session starts, unless staff allow otherwise (decision 7). */
  Core.blockSaleOpen = function (e, now) {
    if (!e.block || !e.block.enabled) return false;
    if (e.block.allowLate) return true;
    const live = Core.sortedSessions(e).filter((x) => !x.cancelled);
    return !!live.length && new Date(live[0].start) > now;
  };
  /* Optional cap on drop-ins (event.dropInLimit), so drop-ins do not block all future block sales. */
  Core.dropInsTaken = function (s, sessionId) {
    let n = 0;
    for (const b of s.bookings) if (b.kind !== 'block') for (const t of b.tickets) if (t.sessionId === sessionId && t.status === 'active') n++;
    return n;
  };
  Core.dropInLeft = function (s, e, session) {
    const left = Core.placesLeft(s, session);
    const cap = e.dropInLimit;
    if (cap === null || cap === undefined || cap === '') return left;
    return Math.min(left, Math.max(0, Number(cap) - Core.dropInsTaken(s, session.id)));
  };
  /* "Few spaces left": the event's own setting (lowSpaceAt) or the default from Settings. */
  Core.isLowSpace = function (s, e, session) {
    const left = Core.placesLeft(s, session);
    const at = e && e.lowSpaceAt !== undefined && e.lowSpaceAt !== null && e.lowSpaceAt !== '' ? Number(e.lowSpaceAt) : s.settings.lowSpaceThreshold;
    return left > 0 && left <= at;
  };

  /* ---------- Event status ---------- */
  Core.STATUSES = ['Draft', 'Scheduled', 'On sale', 'Sold out', 'Sales closed', 'Completed', 'Cancelled'];
  Core.FORMATS = ['One-off', 'Seasonal series', 'Regular series', 'Coaching'];
  Core.eventStatus = function (s, e, now) {
    if (e.cancelled) return 'Cancelled';
    if (e.draft) return 'Draft';
    if (e.sessions.length && e.sessions.every((x) => x.cancelled)) return 'Cancelled';
    const rem = Core.remainingSessions(e, now);
    if (!rem.length) return 'Completed';
    if (e.salesOpenAt && new Date(e.salesOpenAt) > now) return 'Scheduled';
    if (e.salesClosed || (e.salesCloseAt && new Date(e.salesCloseAt) <= now)) return 'Sales closed';
    if (rem.every((x) => Core.placesLeft(s, x) === 0)) return 'Sold out';
    /* Block only: one full session means nothing can be sold. */
    if (e.dropInsEnabled === false && Core.blockPlacesLeft(s, e, now) === 0) return 'Sold out';
    return 'On sale';
  };

  /* ---------- Pricing ---------- */
  Core.standardPrice = function (e) {
    if (!e.tickets.length) return 0;
    const named = e.tickets.find((t) => /standard/i.test(t.name));
    return named ? named.price : Math.max(...e.tickets.map((t) => t.price));
  };
  /* Tiers: the first ticket type that has not ended or sold out is the one on sale. */
  Core.ticketSold = function (s, ticketTypeId) {
    let n = 0;
    for (const b of s.bookings) if (b.ticketTypeId === ticketTypeId) n += b.people.filter((p) => b.tickets.some((t) => t.personId === p.id && t.status === 'active')).length;
    return n;
  };
  Core.currentTicket = function (s, e, now) {
    return e.tickets.find((t) => {
      if (t.salesEnd && new Date(t.salesEnd) < now) return false;
      if (t.qty && Core.ticketSold(s, t.id) >= t.qty) return false;
      return true;
    }) || null;
  };
  /* The member price for one ticket. Fixed prices are set separately for drop-in and block. */
  Core.memberUnit = function (e, base, kind) {
    const m = e.memberPricing;
    if (!m || m.mode === 'none') return base;
    if (kind === 'block' && !m.applyToBlock) return base;
    if (kind !== 'block' && m.applyToDropin === false) return base;
    let price = base;
    if (m.mode === 'percent') price = fromP(Math.round(toP(base) * (100 - m.value) / 100));
    if (m.mode === 'fixed') {
      const v = kind === 'block' ? m.blockValue : m.value;
      price = v === null || v === undefined || v === '' ? base : Number(v);
    }
    return Core.round2(Math.min(base, Math.max(0, price)));
  };
  /* Discount per ticket. A percent code applies to each ticket. A fixed code applies once per booking, unless staff chose per ticket. */
  const codeOffLines = (code, prices) => {
    if (code.type === 'percent') return prices.map((x) => Math.min(toP(x), Math.max(0, Math.round(toP(x) * code.value / 100))));
    if (code.perTicket) return prices.map((x) => Math.min(toP(x), Math.max(0, toP(code.value))));
    const totalP = prices.reduce((n, x) => n + toP(x), 0);
    const off = Math.min(totalP, Math.max(0, toP(code.value)));
    if (!totalP) return prices.map(() => 0);
    const parts = prices.map((x) => Math.floor(off * toP(x) / totalP));
    let left = off - parts.reduce((n, x) => n + x, 0);
    for (let i = 0; left > 0 && i < parts.length * 2; i++) { const k = i % parts.length; if (parts[k] < toP(prices[k])) { parts[k]++; left--; } }
    return parts;
  };
  /* Order: ticket price, then member price, then code.
     The member price covers only the member's own ticket, unless the event allows guests too. */
  Core.quote = function ({ event, kind, ticketTypeId, qty, isMember, code, settings }) {
    const ticket = event.tickets.find((t) => t.id === ticketTypeId) || event.tickets[0];
    const unit = kind === 'block' ? (event.block ? event.block.price : 0) : (ticket ? ticket.price : 0);
    const n = Math.max(1, qty || 1);
    const memberUnit = Core.memberUnit(event, unit, kind);
    const listPrices = Array.from({ length: n }, () => unit);
    const afterMember = listPrices.map((x, i) => (isMember && (i === 0 || event.memberCoversGuests) ? memberUnit : x));
    const sumP = (arr) => arr.reduce((t, x) => t + toP(x), 0);
    const subtotal = fromP(sumP(listPrices));
    const memberTotal = fromP(sumP(afterMember));
    let basis = afterMember, codeP = listPrices.map(() => 0), codeApplied = false, note = '';
    const hasMember = isMember && memberTotal < subtotal;
    if (code) {
      if (settings.stacking === 'stack' || !hasMember) {
        codeP = codeOffLines(code, afterMember); codeApplied = true;
      } else {
        const fromList = codeOffLines(code, listPrices);
        const withCode = sumP(listPrices) - fromList.reduce((t, x) => t + x, 0);
        if (withCode < toP(memberTotal)) {
          basis = listPrices; codeP = fromList; codeApplied = true;
          note = 'The code gives a lower total than the member price, so the code is used.';
        } else {
          note = 'The member price gives a lower or equal total, so the code is not used.';
        }
      }
    }
    const lines = basis.map((x, i) => ({ list: listPrices[i], code: fromP(codeP[i]), paid: fromP(toP(x) - codeP[i]) }));
    const codeDiscount = fromP(codeP.reduce((t, x) => t + x, 0));
    const total = fromP(sumP(lines.map((l) => l.paid)));
    const memberDiscount = fromP(toP(subtotal) - toP(total) - toP(codeDiscount));
    return { unit, memberUnit, qty: n, subtotal, memberDiscount, codeDiscount, total, codeApplied, note, lines };
  };
  Core.pricingWarnings = function (e, sessionCount) {
    const out = [];
    const count = sessionCount === undefined ? e.sessions.filter((x) => !x.cancelled).length : sessionCount;
    const std = Core.standardPrice(e);
    const m = e.memberPricing;
    if (m && m.mode !== 'none') {
      if (m.mode === 'percent' && !(m.value > 0)) out.push('The member discount is 0%, so members pay the same as everyone else.');
      if (m.mode === 'fixed' && m.applyToDropin !== false && !(Number(m.value) < std)) out.push(`The member drop-in price (£${Number(m.value || 0).toFixed(2)}) is not below the standard price (£${std.toFixed(2)}).`);
      if (m.mode === 'fixed' && m.applyToBlock && e.block && e.block.enabled && !(Number(m.blockValue) < e.block.price)) out.push(`The member block price (£${Number(m.blockValue || 0).toFixed(2)}) is not below the block price (£${Number(e.block.price || 0).toFixed(2)}).`);
    }
    if (e.block && e.block.enabled) {
      const sum = Core.round2(std * count);
      if (!(e.block.price < sum)) out.push(`The block price (£${Number(e.block.price || 0).toFixed(2)}) is not below the cost of the single sessions (${count} × £${std.toFixed(2)} = £${sum.toFixed(2)}).`);
    }
    return out;
  };

  /* ---------- Discount codes ---------- */
  /* Decision 9: a refund does not give a code back. It comes back when WE cancel the event or session,
     or when staff choose to release it (b.codeReleased, see Core.releaseCode). */
  const codeReturned = (s, b) => {
    if (b.codeReleased) return true;
    if (!s.settings.releaseCodeOnCancel || !b.tickets.length) return false;
    const event = Core.findEvent(s, b.eventId);
    return b.tickets.every((t) => {
      if (t.status === 'active') return false;
      const f = Core.findSession(s, t.sessionId);
      return !!(event && event.cancelled) || !!(f && (f.session.cancelled || f.event.cancelled));
    });
  };
  Core.codeUsage = function (s, code) {
    return s.bookings.filter((b) => b.codeId === code.id && b.pricing.codeApplied && !codeReturned(s, b)).length;
  };
  /* A date with no time means the whole of that day. */
  const endOf = (v) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? `${v}T23:59:59` : v);
  const startOf = (v) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? `${v}T00:00:00` : v);
  /* A use is held during checkout, so a capped code cannot go over its limit. */
  const liveHolds = (s, code, now) => (s.codeHolds || []).filter((h) => h.codeId === code.id && new Date(h.until) > now);
  Core.codeHeld = (s, code, now) => liveHolds(s, code, now).length;
  Core.codeUsesLeft = function (s, code, now, exceptHoldId) {
    if (!code.usageCap) return null;
    const held = liveHolds(s, code, now).filter((h) => h.id !== exceptHoldId).length;
    return Math.max(0, code.usageCap - Core.codeUsage(s, code) - held);
  };
  Core.codeStatus = function (s, code, now) {
    if (code.paused) return 'Paused';
    if (code.expiresAt && endOf(code.expiresAt) < now) return 'Expired';
    if (code.startsAt && startOf(code.startsAt) > now) return 'Not started';
    if (code.usageCap && Core.codeUsesLeft(s, code, now) <= 0) return 'Used up';
    return 'Active';
  };
  Core.holdCode = function (s, code, { now, minutes }) {
    const left = Core.codeUsesLeft(s, code, now);
    if (left !== null && left <= 0) return { ok: false, reason: 'This code is used up.' };
    const mins = minutes || s.settings.holdMinutes || 10;
    if (!s.codeHolds) s.codeHolds = [];
    s.codeHolds = s.codeHolds.filter((h) => new Date(h.until) > now);
    const hold = { id: Core.nextId(s, 'hold'), codeId: code.id, until: Core.toLocalISO(new Date(now.getTime() + mins * 60000)) };
    s.codeHolds.push(hold);
    return { ok: true, hold };
  };
  Core.releaseCodeHold = function (s, holdId) { s.codeHolds = (s.codeHolds || []).filter((h) => h.id !== holdId); };
  /* Staff chose to give a code back to a refunded booking (decision 9). */
  Core.releaseCode = function (s, b, { by, now }) {
    if (!b.codeId) return { ok: false, reason: 'This booking did not use a code.' };
    b.codeReleased = true;
    log(b, now, by, 'Discount code given back by staff.');
    return { ok: true };
  };
  /* Warns when a code would take a ticket to £0, so a free ticket is a choice and not an accident. */
  Core.codeWarnings = function (code, prices) {
    const out = [];
    if (code.type === 'percent' ? Number(code.value) >= 100 : (prices || []).some((x) => toP(code.value) >= toP(x))) out.push('This code can take a ticket to £0.00. Check that a free ticket is what you want.');
    return out;
  };
  Core.codeUsesByCustomer = function (s, code, email) {
    const key = String(email || '').trim().toLowerCase();
    if (!key) return 0;
    return s.bookings.filter((b) => b.codeId === code.id && b.pricing.codeApplied && !codeReturned(s, b) && String(b.customer.email || '').trim().toLowerCase() === key).length;
  };
  Core.customerOverLimit = (s, code, email) => !!code.perCustomerLimit && !!String(email || '').trim() && Core.codeUsesByCustomer(s, code, email) >= Number(code.perCustomerLimit);
  Core.validateCode = function (s, code, event, now, customerEmail) {
    if (!code) return { ok: false, reason: 'No code with that name.' };
    const st = Core.codeStatus(s, code, now);
    if (st === 'Not started') return { ok: false, reason: `This code starts on ${startOf(code.startsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.` };
    if (st !== 'Active') return { ok: false, reason: `This code is ${st.toLowerCase()}.` };
    if (code.eventIds.length && !code.eventIds.includes(event.id)) return { ok: false, reason: 'This code cannot be used on this event.' };
    if (code.venueIds.length && !code.venueIds.includes(event.venueId)) return { ok: false, reason: 'This code cannot be used at this venue.' };
    if (code.typeIds.length && !code.typeIds.includes(event.typeId)) return { ok: false, reason: 'This code cannot be used on this event type.' };
    /* Optional limit per customer: checked when the customer's email is passed. */
    if (Core.customerOverLimit(s, code, customerEmail)) return { ok: false, reason: `This customer has already used this code the most times allowed (${code.perCustomerLimit}).` };
    return { ok: true };
  };
  Core.findCodeByName = (s, text) => s.codes.find((c) => c.code.toUpperCase() === String(text || '').trim().toUpperCase());
  Core.generateCodes = function (s, base, count, prefix, seedText) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const made = [];
    let x = 7;
    for (const ch of String(seedText || '') + s.seq) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
    const batchId = Core.nextId(s, 'batch');
    while (made.length < count) {
      let tail = '';
      for (let i = 0; i < 6; i++) { x = (x * 1664525 + 1013904223) >>> 0; tail += chars[(x >>> 16) % chars.length]; }
      const text = `${prefix}-${tail}`;
      if (Core.findCodeByName(s, text)) continue;
      const c = Object.assign({}, base, { id: Core.nextId(s, 'c'), code: text, kind: 'single', usageCap: 1, batchId });
      s.codes.push(c); made.push(c);
    }
    return made;
  };

  /* ---------- Audit and Klaviyo log ---------- */
  Core.audit = function (s, { at, by, type, text }) {
    s.audit.unshift({ id: Core.nextId(s, 'a'), at: Core.toLocalISO(at), by, type, text });
  };
  Core.klaviyo = function (s, { at, type, ref, failed, error }) {
    s.klaviyoLog.unshift({ id: Core.nextId(s, 'k'), at: Core.toLocalISO(at), type, ref, status: failed ? 'Failed' : 'Sent', error: error || '' });
  };
  const log = (b, at, by, text) => b.timeline.unshift({ at: Core.toLocalISO(at), by, text });
  Core.logBooking = log;

  /* ---------- Bookings ---------- */
  Core.createBooking = function (s, a) {
    const { event, kind, sessionIds, ticketTypeId, customer, guests, code, payment, source, by, now } = a;
    const people = [Object.assign({ id: Core.nextId(s, 'p'), isLead: true, answers: {} }, customer)];
    (guests || []).forEach((g) => people.push(Object.assign({ id: Core.nextId(s, 'p'), isLead: false, name: '', email: '', marketingConsent: false, answers: {} }, g)));
    const qty = people.length;
    /* Last check: a code at its cap is never applied, even if a screen forgot to check it. */
    const overCap = !!code && !a.comp && ((code.usageCap && Core.codeUsesLeft(s, code, now, a.codeHoldId) <= 0) || Core.customerOverLimit(s, code, customer.email));
    if (a.codeHoldId) Core.releaseCodeHold(s, a.codeHoldId);
    const quote = Core.quote({ event, kind, ticketTypeId, qty, isMember: a.comp ? false : !!customer.isMember, code: a.comp || overCap ? null : code, settings: s.settings });
    if (overCap) quote.note = 'This code has reached its limit, so it was not used.';
    if (a.comp) {
      quote.lines.forEach((l) => { l.paid = 0; l.code = 0; });
      quote.total = 0; quote.compDiscount = quote.subtotal; quote.note = 'Free place given by staff.';
    }
    const b = {
      id: Core.nextId(s, 'b'), ref: `BK-${1000 + (++s.refSeq)}`, eventId: event.id, kind, ticketTypeId: kind === 'block' ? null : ticketTypeId,
      customer: { name: customer.name, email: customer.email, phone: customer.phone || '', isMember: !!customer.isMember },
      people, tickets: [], codeId: code && quote.codeApplied ? code.id : null, pricing: quote,
      /* Kept as it was on the day, so later price or membership changes do not alter this booking. */
      atBooking: { isMember: !!customer.isMember, unitPrice: quote.unit, memberUnitPrice: quote.memberUnit, total: quote.total },
      compReason: a.comp ? (a.compReason || '') : '',
      addOns: [], payments: [], requests: [], notes: [], timeline: [], createdAt: Core.toLocalISO(now), source: source || 'Online', channel: a.channel || 'Website'
    };
    people.forEach((person, pi) => {
      const line = quote.lines[pi];
      const n = sessionIds.length;
      const paid = Core.split(line.paid, n), list = Core.split(line.list, n), codeShare = Core.split(line.code, n);
      sessionIds.forEach((sessionId, k) => {
        b.tickets.push({ id: Core.nextId(s, 't'), sessionId, personId: person.id, status: 'active', list: list[k], paid: paid[k], refunded: 0, codeShare: codeShare[k], checkedInAt: null });
      });
    });
    b.payments.push({ id: Core.nextId(s, 'pay'), type: 'Payment', amount: quote.total, at: Core.toLocalISO(now), method: a.comp ? 'Free place' : (payment || 'Card'), by: by || 'Customer', reason: a.comp ? (a.compReason || '') : '' });
    log(b, now, by || 'Customer', `Booking made (${source || 'Online'}), ${qty} ${qty === 1 ? 'person' : 'people'}, £${quote.total.toFixed(2)}.`);
    s.bookings.push(b);
    return b;
  };
  /* Add-ons: name, price, venue, optional stock. Refunded separately from tickets. */
  Core.addOnSold = (s, id) => s.bookings.reduce((n, b) => n + (b.addOns || []).filter((x) => x.addOnId === id && x.status === 'active').reduce((t, x) => t + x.qty, 0), 0);
  Core.addOnLeft = (s, a) => (a.stock === null || a.stock === undefined || a.stock === '' ? null : Math.max(0, a.stock - Core.addOnSold(s, a.id)));
  Core.addAddOn = function (s, b, addOn, qty, { by, now }) {
    const left = Core.addOnLeft(s, addOn);
    if (left !== null && left < qty) return { ok: false, reason: `Only ${left} ${addOn.name} left.` };
    const amount = Core.round2(addOn.price * qty);
    const line = { id: Core.nextId(s, 'ao'), addOnId: addOn.id, name: addOn.name, price: addOn.price, qty, paid: amount, refunded: 0, status: 'active' };
    b.addOns.push(line);
    b.payments.push({ id: Core.nextId(s, 'pay'), type: 'Add-on', amount, at: Core.toLocalISO(now), method: 'Card', by, reason: addOn.name });
    log(b, now, by, `Add-on: ${qty} × ${addOn.name}, £${amount.toFixed(2)}.`);
    return { ok: true, line };
  };
  Core.refundAddOn = function (s, b, lineId, { reason, by, now }) {
    const line = (b.addOns || []).find((x) => x.id === lineId);
    if (!line || line.status !== 'active') return { ok: false, reason: 'This add-on cannot be refunded.' };
    line.refunded = line.paid; line.status = 'refunded';
    b.payments.push({ id: Core.nextId(s, 'pay'), type: 'Refund', amount: line.paid, at: Core.toLocalISO(now), method: 'Back to original payment', by, reason: `${line.name}: ${reason}` });
    log(b, now, by, `Add-on refunded: ${line.name}, £${line.paid.toFixed(2)}. Reason: ${reason}.`);
    Core.audit(s, { at: now, by, type: 'Refund', text: `${b.ref}: add-on ${line.name}, £${line.paid.toFixed(2)}. ${reason}` });
    return { ok: true, amount: line.paid };
  };
  Core.paidTotal = (b) => Core.round2(b.tickets.reduce((n, t) => n + t.paid, 0));
  Core.refundedTotal = (b) => Core.round2(b.tickets.reduce((n, t) => n + t.refunded, 0));
  Core.ticketRefundable = (t) => Core.round2(t.paid - t.refunded);
  Core.bookingStatus = function (b) {
    if (b.tickets.length && b.tickets.every((t) => t.status !== 'active')) return 'Cancelled';
    return 'Confirmed';
  };
  Core.paymentStatus = function (b) {
    const r = Core.refundedTotal(b), p = Core.paidTotal(b);
    if (r <= 0) return p === 0 ? 'Free' : 'Paid';
    return r >= p ? 'Refunded' : 'Part refunded';
  };
  Core.personName = function (b, person) {
    if (person.name) return person.name;
    const i = b.people.indexOf(person);
    return `Guest ${i} of ${b.customer.name}`;
  };
  Core.personMissing = function (event, person) {
    const miss = [];
    if (person.isLead) {
      if (!person.name) miss.push('name');
      if (!person.email) miss.push('email');
    } else if (event.guestDetails === 'name' || event.guestDetails === 'nameEmail') {
      if (!person.name) miss.push('name');
      if (event.guestDetails === 'nameEmail' && !person.email) miss.push('email');
    }
    for (const q of event.questions || []) {
      if (!q.required) continue;
      if (q.scope === 'booking' && !person.isLead) continue;
      if (q.scope === 'guest' && !person.isLead && event.guestDetails === 'lead') continue;
      if (!person.answers || !String(person.answers[q.id] || '').trim()) miss.push(q.label);
    }
    return miss;
  };
  Core.bookingMissing = function (s, b) {
    const event = Core.findEvent(s, b.eventId);
    const out = [];
    for (const person of b.people) {
      if (!b.tickets.some((t) => t.personId === person.id && t.status === 'active')) continue;
      const miss = Core.personMissing(event, person);
      if (miss.length) out.push({ person, miss });
    }
    return out;
  };

  /* Suggested refund for leaving a block early: what was paid per session, for places not yet attended. */
  Core.suggestedRefund = function (s, b, now, personId) {
    const tickets = b.tickets.filter((t) => {
      if (t.status !== 'active' || t.checkedInAt || (personId && t.personId !== personId)) return false;
      const f = Core.findSession(s, t.sessionId);
      return !!f && new Date(f.session.start) > now;
    });
    return { tickets, perSession: tickets.length ? Core.ticketRefundable(tickets[0]) : 0, amount: Core.round2(tickets.reduce((n, t) => n + Core.ticketRefundable(t), 0)) };
  };

  /* Share the refund across the chosen tickets in line with what is left on each. */
  Core.refund = function (s, b, { ticketIds, amount, reason, by, freePlaces, now }) {
    const tickets = b.tickets.filter((t) => ticketIds.includes(t.id));
    const room = tickets.map((t) => toP(Core.ticketRefundable(t)));
    const roomTotal = room.reduce((n, x) => n + x, 0);
    const want = toP(amount);
    if (want <= 0) return { ok: false, reason: 'Enter an amount above £0.' };
    if (want > roomTotal) return { ok: false, reason: `You can refund up to £${fromP(roomTotal).toFixed(2)} on the chosen places.` };
    const parts = room.map((x) => Math.floor(want * x / roomTotal));
    let left = want - parts.reduce((n, x) => n + x, 0);
    for (let i = 0; left > 0 && i < parts.length * 2; i++) {
      const k = i % parts.length;
      if (parts[k] < room[k]) { parts[k]++; left--; }
    }
    tickets.forEach((t, i) => {
      t.refunded = Core.round2(t.refunded + fromP(parts[i]));
      if (freePlaces) t.status = 'cancelled';
    });
    b.payments.push({ id: Core.nextId(s, 'pay'), type: 'Refund', amount: fromP(want), at: Core.toLocalISO(now), method: 'Back to original payment', by, reason });
    log(b, now, by, `Refund of £${fromP(want).toFixed(2)}. Reason: ${reason}.${freePlaces ? ' Place(s) freed up.' : ''}`);
    Core.audit(s, { at: now, by, type: 'Refund', text: `${b.ref}: £${fromP(want).toFixed(2)}. ${reason}` });
    if (freePlaces && b.tickets.every((t) => t.status !== 'active')) {
      b.requests.forEach((r) => { if (r.status === 'Open') { r.status = 'Done'; r.closedBy = by; } });
    }
    return { ok: true, amount: fromP(want) };
  };
  /* The refund and transfer policy from Settings: how close to the event, and any fee. */
  Core.policyFor = function (settings, sessions, now) {
    const p = settings.policy;
    const hours = sessions.length ? Math.min(...sessions.map((x) => (new Date(x.start) - now) / 3600000)) : Infinity;
    return {
      hours,
      refundInside: hours >= p.refundHours, refundHours: p.refundHours, refundFee: p.refundFee,
      transferInside: hours >= p.transferHours, transferHours: p.transferHours, transferFee: p.transferFee
    };
  };
  /* Only an admin or a club manager can give refunds. */
  Core.refundAllowed = function (role) {
    return Core.isStaff(role) ? { ok: true } : { ok: false, reason: 'Only a club manager or admin can give refunds.' };
  };
  /* Bookings by hand are staff only. Free places need a reason, and going over the limit needs a reason too. */
  Core.manualBookingAllowed = function (role, { comp, compReason, short, overrideReason }) {
    if (comp && !Core.can(role, 'bookings.comp')) return { ok: false, reason: 'Only a club manager or admin can give a free place.' };
    if (comp && !String(compReason || '').trim()) return { ok: false, reason: 'A free place needs a reason.' };
    if (short) {
      if (!Core.can(role, 'override')) return { ok: false, reason: 'There are not enough spaces left.' };
      if (!String(overrideReason || '').trim()) return { ok: false, reason: 'This goes over the limit, so a reason is needed.' };
    }
    return { ok: true };
  };
  Core.cancelTickets = function (s, b, { ticketIds, reason, by, now }) {
    let n = 0;
    for (const t of b.tickets) if (ticketIds.includes(t.id) && t.status === 'active') { t.status = 'cancelled'; n++; }
    log(b, now, by, `${n} place(s) cancelled. Reason: ${reason}.`);
    if (b.tickets.every((t) => t.status !== 'active')) {
      b.requests.forEach((r) => { if (r.status === 'Open') { r.status = 'Done'; r.closedBy = by; } });
    }
    return n;
  };
  Core.transferTargets = function (s, b, ticket, now) {
    const from = Core.findSession(s, ticket.sessionId);
    if (!from) return [];
    const out = [];
    const taken = new Set(b.tickets.filter((t) => t.personId === ticket.personId && t.status === 'active').map((t) => t.sessionId));
    const sameEvent = s.settings.transferRule !== 'venue';
    for (const e of s.events) {
      if (e.draft || e.cancelled) continue;
      if (sameEvent ? e.id !== from.event.id : e.venueId !== from.event.venueId) continue;
      if (e.id !== from.event.id && Core.standardPrice(e) > Core.standardPrice(from.event)) continue;
      for (const x of Core.sortedSessions(e)) {
        if (x.id === ticket.sessionId || x.cancelled || new Date(x.start) <= now || taken.has(x.id)) continue;
        out.push({ event: e, session: x, left: Core.placesLeft(s, x), difference: Core.round2(Core.standardPrice(e) - Core.standardPrice(from.event)) });
      }
    }
    return out;
  };
  Core.transferTicket = function (s, b, ticketId, targetSessionId, { by, now, describe, fee }) {
    const t = b.tickets.find((x) => x.id === ticketId);
    const target = Core.findSession(s, targetSessionId);
    if (!t || !target) return { ok: false, reason: 'Could not find that place or session.' };
    if (t.status !== 'active') return { ok: false, reason: 'This place is cancelled.' };
    if (target.session.cancelled) return { ok: false, reason: 'That session is cancelled.' };
    if (t.sessionId === targetSessionId) return { ok: false, reason: 'This place is already in that session.' };
    if (b.tickets.some((x) => x.id !== t.id && x.personId === t.personId && x.status === 'active' && x.sessionId === targetSessionId)) return { ok: false, reason: 'This person already has a place in that session.' };
    if (Core.placesLeft(s, target.session) < 1) return { ok: false, reason: 'That session is full.' };
    const d = describe || ((x) => x);
    const old = Core.findSession(s, t.sessionId);
    const oldText = old ? d(old.session.start) : 'old session';
    t.sessionId = targetSessionId; t.checkedInAt = null;
    log(b, now, by, `Place moved from ${oldText} to ${target.event.title}, ${d(target.session.start)}.`);
    if (fee > 0) {
      t.list = Core.round2(t.list + fee); t.paid = Core.round2(t.paid + fee);
      b.payments.push({ id: Core.nextId(s, 'pay'), type: 'Transfer fee', amount: fee, at: Core.toLocalISO(now), method: 'Card', by, reason: 'Transfer fee from the policy' });
      log(b, now, by, `Transfer fee of £${fee.toFixed(2)} charged.`);
    }
    return { ok: true };
  };

  /* Apply one session edit to this session, this and following, or all sessions. */
  Core.applySessionEdit = function (s, event, sessionId, change, scope) {
    const list = Core.sortedSessions(event);
    const index = list.findIndex((x) => x.id === sessionId);
    if (index < 0) return { ok: false, errors: ['Session not found.'] };
    const chosen = scope === 'one' ? [list[index]] : scope === 'following' ? list.slice(index) : list;
    const targets = chosen.filter((x) => !x.cancelled);
    const errors = [];
    if (change.capacity !== undefined) {
      for (const x of targets) {
        const taken = Core.sessionTaken(s, x.id);
        if (change.capacity < taken) errors.push(`${x.start.replace('T', ' ')} already has ${taken} booked, so the limit cannot be ${change.capacity}.`);
      }
    }
    if (errors.length) return { ok: false, errors };
    for (const x of targets) {
      if (change.deltaMs) x.start = Core.toLocalISO(new Date(new Date(x.start).getTime() + change.deltaMs));
      if (change.durationMin !== undefined) x.durationMin = change.durationMin;
      if (change.capacity !== undefined) x.capacity = change.capacity;
    }
    return { ok: true, changed: targets.length };
  };

  /* Cancel sessions: frees places, optionally refunds what is left on each place. */
  Core.affected = function (s, sessionIds) {
    const rows = [];
    for (const b of s.bookings) {
      const tickets = b.tickets.filter((t) => sessionIds.includes(t.sessionId) && t.status === 'active');
      if (tickets.length) rows.push({ booking: b, tickets, amount: Core.round2(tickets.reduce((n, t) => n + Core.ticketRefundable(t), 0)) });
    }
    return rows;
  };
  Core.cancelSessions = function (s, event, sessionIds, { refund, reason, by, now }) {
    const rows = Core.affected(s, sessionIds);
    let refunded = 0;
    for (const r of rows) {
      const ids = r.tickets.map((t) => t.id);
      if (refund && r.amount > 0) {
        Core.refund(s, r.booking, { ticketIds: ids, amount: r.amount, reason, by, freePlaces: true, now });
        refunded += r.amount;
      } else {
        Core.cancelTickets(s, r.booking, { ticketIds: ids, reason, by, now });
      }
    }
    event.sessions.forEach((x) => { if (sessionIds.includes(x.id)) x.cancelled = true; });
    s.waitlist.forEach((w) => { if (sessionIds.includes(w.sessionId) && w.status !== 'Booked') w.status = 'Removed'; });
    return { bookings: rows.length, refunded: Core.round2(refunded) };
  };

  /* ---------- Lists ---------- */
  Core.attendees = function (s, sessionId) {
    const out = [];
    for (const b of s.bookings) for (const t of b.tickets) {
      if (t.sessionId !== sessionId || t.status !== 'active') continue;
      out.push({ ticket: t, booking: b, person: b.people.find((p) => p.id === t.personId) });
    }
    out.sort((a, c) => Core.personName(a.booking, a.person).localeCompare(Core.personName(c.booking, c.person)));
    return out;
  };
  /* Stops a spreadsheet treating a text value as a formula. */
  Core.toCSV = function (rows) {
    const cell = (v) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'number') return String(v);
      let t = String(v);
      if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
      return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    return rows.map((r) => r.map(cell).join(',')).join('\r\n');
  };

  /* ---------- Reports: every figure is worked out from the tickets ---------- */
  /* f.basis: 'event' (default, by session date: how much was delivered) or 'booking' (by the day it was sold).
     A block is spread evenly across its sessions in the event view, because each session has its own ticket. */
  Core.report = function (s, f) {
    const blank = () => ({ bookingIds: new Set(), tickets: 0, gross: 0, discounts: 0, refunds: 0, net: 0, codeDiscount: 0 });
    const add = (g, b, t) => {
      g.bookingIds.add(b.id);
      if (t.status === 'active') g.tickets++;
      g.gross += toP(t.list); g.discounts += toP(t.list) - toP(t.paid); g.refunds += toP(t.refunded);
      g.net += toP(t.paid) - toP(t.refunded); g.codeDiscount += toP(t.codeShare);
    };
    const groupAdd = (map, key, label, b, t) => {
      if (!map.has(key)) map.set(key, Object.assign(blank(), { key, label }));
      add(map.get(key), b, t);
    };
    const total = blank();
    const byEvent = new Map(), byVenue = new Map(), byType = new Map(), byCode = new Map(), byPartner = new Map(), byMember = new Map(), byChannel = new Map();
    let addOnNet = 0;
    const byBookingDate = f.basis === 'booking';
    const inScope = (event, session, booking) => {
      if (f.venueIds && !f.venueIds.includes(event.venueId)) return false;
      if (f.venueId && event.venueId !== f.venueId) return false;
      if (f.eventId && event.id !== f.eventId) return false;
      if (f.typeId && event.typeId !== f.typeId) return false;
      const day = Core.dayKey(byBookingDate && booking ? booking.createdAt : session.start);
      if (f.from && day < f.from) return false;
      if (f.to && day > f.to) return false;
      return true;
    };
    for (const b of s.bookings) {
      for (const t of b.tickets) {
        const found = Core.findSession(s, t.sessionId);
        if (!found || !inScope(found.event, found.session, b)) continue;
        const e = found.event;
        add(total, b, t);
        groupAdd(byEvent, e.id, e.title, b, t);
        const venue = Core.findVenue(s, e.venueId);
        groupAdd(byVenue, e.venueId, venue ? venue.name : 'Unknown venue', b, t);
        const type = Core.findType(s, e.typeId);
        groupAdd(byType, e.typeId, type ? type.name : 'No type', b, t);
        const wasMember = b.atBooking ? b.atBooking.isMember : b.customer.isMember;
        groupAdd(byMember, wasMember ? 'member' : 'guest', wasMember ? 'Members' : 'Non-members (guest checkout)', b, t);
        groupAdd(byChannel, b.channel || 'Website', b.channel || 'Website', b, t);
        if (b.codeId) {
          const code = Core.findCode(s, b.codeId);
          if (code) {
            groupAdd(byCode, code.id, code.code, b, t);
            const partner = code.partnerId ? Core.findPartner(s, code.partnerId) : null;
            groupAdd(byPartner, partner ? partner.id : 'none', partner ? partner.name : 'No partner', b, t);
          }
        }
      }
    }
    /* Add-ons sit on the booking, so they count once, under the booking's first session. */
    for (const b of s.bookings) {
      if (!(b.addOns || []).length || !b.tickets.length) continue;
      const found = Core.findSession(s, b.tickets[0].sessionId);
      if (!found || !inScope(found.event, found.session, b)) continue;
      for (const x of b.addOns) addOnNet += toP(x.paid) - toP(x.refunded);
    }
    let capacity = 0, taken = 0;
    for (const e of s.events) {
      if (e.draft) continue;
      for (const x of e.sessions) {
        if (x.cancelled || !inScope(e, x)) continue;
        capacity += x.capacity; taken += Core.sessionTaken(s, x.id);
      }
    }
    const finish = (g) => ({
      key: g.key, label: g.label, bookings: g.bookingIds.size, tickets: g.tickets, gross: fromP(g.gross), discounts: fromP(g.discounts),
      refunds: fromP(g.refunds), net: fromP(g.net), codeDiscount: fromP(g.codeDiscount)
    });
    const list = (m) => [...m.values()].map(finish).sort((a, c) => c.net - a.net);
    return {
      basis: byBookingDate ? 'booking' : 'event', total: finish(total), capacity, taken, fillRate: capacity ? taken / capacity : null,
      byEvent: list(byEvent), byVenue: list(byVenue), byType: list(byType), byCode: list(byCode), byPartner: list(byPartner), byMember: list(byMember), byChannel: list(byChannel), addOnNet: fromP(addOnNet)
    };
  };
  Core.codeStats = function (s, code) {
    const bookings = s.bookings.filter((b) => b.codeId === code.id);
    return {
      bookings,
      discount: Core.round2(bookings.reduce((n, b) => n + b.pricing.codeDiscount, 0)),
      /* net is after refunds. netBeforeRefunds is what was paid after the discount, before any refunds: the document's "net revenue" for codes and partners. */
      net: Core.round2(bookings.reduce((n, b) => n + Core.paidTotal(b) - Core.refundedTotal(b), 0)),
      netBeforeRefunds: Core.round2(bookings.reduce((n, b) => n + Core.paidTotal(b), 0)),
      refunds: Core.round2(bookings.reduce((n, b) => n + Core.refundedTotal(b), 0))
    };
  };
  Core.partnerStats = function (s, partner) {
    const codes = s.codes.filter((c) => c.partnerId === partner.id);
    const stats = codes.map((c) => Core.codeStats(s, c));
    return {
      codes,
      redemptions: stats.reduce((n, x) => n + x.bookings.length, 0),
      discount: Core.round2(stats.reduce((n, x) => n + x.discount, 0)),
      net: Core.round2(stats.reduce((n, x) => n + x.net, 0)),
      netBeforeRefunds: Core.round2(stats.reduce((n, x) => n + x.netBeforeRefunds, 0)),
      refunds: Core.round2(stats.reduce((n, x) => n + x.refunds, 0))
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Core; else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
