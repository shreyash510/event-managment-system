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
  /* Three roles: marketing runs everything, a club manager runs their venues, and a normal user is a customer who
     comes from the website to see their own bookings. */
  Core.ROLE_NAMES = { admin: 'Marketing admin', manager: 'Club manager', user: 'Normal user' };
  Core.ROLES = Object.keys(Core.ROLE_NAMES);
  Core.isStaff = (role) => role === 'admin' || role === 'manager';
  const PERMS = {
    admin: ['*'],
    manager: ['today', 'events.view', 'events.edit', 'events.cancel', 'pricing.view', 'pricing.edit',
      'bookings.view', 'bookings.create', 'bookings.modify', 'bookings.transfer', 'bookings.cancel',
      'bookings.comp', 'refund.full', 'refund.partial', 'checkin', 'reports', 'override', 'codes.view', 'codes.edit', 'partners.view', 'club.manage', 'account'],
    /* Only their own bookings, and their own settings. */
    user: ['browse', 'mybookings', 'account']
  };
  /* These belong to one role only, so the admin's '*' does not switch them on. */
  /* 'refund.policyOnly' is held by no role now; it stays here so older screens asking for it never match the admin's '*'. */
  const LIMITS = ['refund.policyOnly', 'browse', 'mybookings'];
  Core.can = (role, perm) => { const p = PERMS[role] || []; return p.includes(perm) || (p.includes('*') && !LIMITS.includes(perm)); };
  /* Old saved data may hold a role that no longer exists (the customer role was removed). */
  Core.knownRole = (role) => (Core.ROLES.includes(role) ? role : 'user');
  /* A staff member can be linked to more than one venue. venueIds is the list; venueId is kept for old data. */
  Core.userVenueIds = (user) => {
    const ids = Array.isArray(user.venueIds) ? user.venueIds.slice() : [];
    if (user.venueId && !ids.includes(user.venueId)) ids.unshift(user.venueId);
    return ids;
  };
  /* The marketing admin and a normal user (who is choosing where to book) see every venue; a club manager only their own. */
  Core.allVenues = (user) => user.role === 'admin' || user.role === 'user';
  Core.canSeeVenue = (user, venueId) => Core.allVenues(user) || Core.userVenueIds(user).includes(venueId);

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
    /* A series needs at least two sessions left, or it is just one session. */
    if (e.block.allowLate) return Core.remainingSessions(e, now).length >= 2;
    const live = Core.sortedSessions(e).filter((x) => !x.cancelled);
    return !!live.length && new Date(live[0].start) > now;
  };
  /* What a block costs now. Once a series that keeps selling has started, the price is a share of the full price, for
     the sessions still to come, so nobody pays for sessions already gone. */
  Core.blockPrice = function (e, now) {
    const base = Number(e.block && e.block.price) || 0;
    if (!e.block || !e.block.allowLate) return base;
    const live = e.sessions.filter((x) => !x.cancelled), when = now || new Date();
    const left = live.filter((x) => new Date(x.start) > when).length;
    if (!live.length || left < 1 || left >= live.length) return base;
    return Core.round2(base * left / live.length);
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
  Core.STATUSES = ['Draft', 'Pending approval', 'Scheduled', 'On sale', 'Sold out', 'Sales closed', 'Completed', 'Cancelled'];
  Core.FORMATS = ['One-off', 'Seasonal series', 'Regular series', 'Coaching'];
  Core.eventStatus = function (s, e, now) {
    if (e.cancelled) return 'Cancelled';
    if (e.approval && e.approval.status === 'pending') return 'Pending approval';
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
      /* A fixed member block price shrinks with the block, when only part of the series is left. */
      const share = kind === 'block' && e.block && e.block.price > 0 ? base / e.block.price : 1;
      price = v === null || v === undefined || v === '' ? base : Core.round2(Number(v) * share);
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
    const unit = kind === 'block' ? (event.block ? Core.blockPrice(event) : 0) : (ticket ? ticket.price : 0);
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
  /* What a block saves against buying the same sessions one at a time, for this buyer. Codes are left out on both sides. */
  Core.blockSaving = function ({ event, ticketTypeId, sessionCount, qty, isMember, settings }) {
    const totalFor = (kind) => toP(Core.quote({ event, kind, ticketTypeId, qty, isMember, code: null, settings }).total);
    const singlesP = totalFor('dropin') * Math.max(0, sessionCount || 0), blockP = totalFor('block');
    return { singles: fromP(singlesP), block: fromP(blockP), saving: fromP(Math.max(0, singlesP - blockP)) };
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
  /* A use is held during checkout, so a capped code cannot go over its limit. */
  const liveHolds = (s, code, now) => (s.codeHolds || []).filter((h) => h.codeId === code.id && new Date(h.until) > now);
  Core.codeHeld = (s, code, now) => liveHolds(s, code, now).length;
  Core.codeUsesLeft = function (s, code, now, exceptHoldId) {
    if (!code.usageCap) return null;
    const held = liveHolds(s, code, now).filter((h) => h.id !== exceptHoldId).length;
    return Math.max(0, code.usageCap - Core.codeUsage(s, code) - held);
  };
  Core.codeStatus = function (s, code, now) {
    if (code.expiresAt && endOf(code.expiresAt) < now) return 'Expired';
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
  Core.validateCode = function (s, code, event, now) {
    if (!code) return { ok: false, reason: 'No code with that name.' };
    const st = Core.codeStatus(s, code, now);
    if (st !== 'Active') return { ok: false, reason: `This code is ${st.toLowerCase()}.` };
    if (code.eventIds.length && !code.eventIds.includes(event.id)) return { ok: false, reason: 'This code cannot be used on this event.' };
    if (code.venueIds.length && !code.venueIds.includes(event.venueId)) return { ok: false, reason: 'This code cannot be used at this venue.' };
    if (code.typeIds.length && !code.typeIds.includes(event.typeId)) return { ok: false, reason: 'This code cannot be used on this event type.' };
    return { ok: true };
  };
  /* Waitlists: when a place is free, the next people waiting get an offer on their own, unless staff turned it off for that
     session. Places already offered to someone stay held. Runs on every screen, so it does not wait for staff to open the event. */
  Core.runAutoOffers = function (s, now) {
    let made = 0;
    for (const e of s.events || []) {
      if (e.cancelled || e.draft) continue;
      for (const x of e.sessions) {
        if (x.autoOffer === false || x.cancelled || new Date(x.start) <= now) continue;
        const list = (s.waitlist || []).filter((w) => w.sessionId === x.id && w.status !== 'Removed' && w.status !== 'Booked');
        if (!list.length) continue;
        const live = (w) => w.status === 'Offered' && w.offerUntil && new Date(w.offerUntil) > now;
        let free = Core.placesLeft(s, x) - list.filter(live).length;
        for (const w of list) {
          if (free < 1) break;
          if (w.status !== 'Waiting') continue;
          w.status = 'Offered';
          w.offerUntil = Core.toLocalISO(new Date(now.getTime() + (Number(s.settings.waitlistClaimHours) || 12) * 3600000));
          w.autoOffered = true;
          free--; made++;
          Core.audit(s, { at: now, by: 'System', type: 'Waitlist', text: `${e.title}, ${String(x.start).replace('T', ' ')}: ${w.name} told a place is free, and offered it automatically (demo: no email is sent).` });
        }
      }
    }
    return made;
  };
  Core.findCodeByName = (s, text) => s.codes.find((c) => c.code.toUpperCase() === String(text || '').trim().toUpperCase());
  Core.generateCodes = function (s, base, count, prefix, seedText) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const made = [];
    let x = 7;
    for (const ch of String(seedText || '') + s.seq) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
    while (made.length < count) {
      let tail = '';
      for (let i = 0; i < 6; i++) { x = (x * 1664525 + 1013904223) >>> 0; tail += chars[(x >>> 16) % chars.length]; }
      const text = `${prefix}-${tail}`;
      if (Core.findCodeByName(s, text)) continue;
      const c = Object.assign({}, base, { id: Core.nextId(s, 'c'), code: text, kind: 'single', usageCap: 1 });
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
    const overCap = !!code && !a.comp && (code.usageCap && Core.codeUsesLeft(s, code, now, a.codeHoldId) <= 0);
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
  /* Add-ons: name, price, venue, optional stock. Refunded separately from tickets. Each has its own 'Add-on' payment line,
     so the 'Payment' line, Core.paidTotal and the ticket reports only ever hold ticket money, and nothing is counted twice. */
  Core.addOnSold = (s, id) => s.bookings.reduce((n, b) => n + (b.addOns || []).filter((x) => x.addOnId === id && x.status === 'active').reduce((t, x) => t + x.qty, 0), 0);
  Core.addOnLeft = (s, a) => (a.stock === null || a.stock === undefined || a.stock === '' ? null : Math.max(0, a.stock - Core.addOnSold(s, a.id)));
  /* What this event offers at checkout. An add-on removed or moved to another venue drops out. */
  Core.eventAddOns = (s, e) => (e.addOnIds || []).map((id) => (s.addOns || []).find((a) => a.id === id)).filter((a) => a && a.venueId === e.venueId);
  Core.addAddOn = function (s, b, addOn, qty, { by, now, method }) {
    const left = Core.addOnLeft(s, addOn);
    if (left !== null && left < qty) return { ok: false, reason: `Only ${left} ${addOn.name} left.` };
    const amount = Core.round2(addOn.price * qty);
    const line = { id: Core.nextId(s, 'ao'), addOnId: addOn.id, name: addOn.name, price: addOn.price, qty, paid: amount, refunded: 0, status: 'active' };
    (b.addOns || (b.addOns = [])).push(line);
    b.payments.push({ id: Core.nextId(s, 'pay'), type: 'Add-on', amount, at: Core.toLocalISO(now), method: method || 'Card', by, reason: addOn.name });
    log(b, now, by, `Add-on: ${qty} × ${addOn.name}, £${amount.toFixed(2)}.`);
    return { ok: true, line };
  };
  Core.refundAddOn = function (s, b, lineId, { reason, by, now }) {
    const line = (b.addOns || []).find((x) => x.id === lineId);
    if (!line || line.status !== 'active') return { ok: false, reason: 'This add-on cannot be refunded.' };
    line.refunded = line.paid; line.status = 'refunded';
    if (line.paid > 0) b.payments.push({ id: Core.nextId(s, 'pay'), type: 'Refund', amount: line.paid, at: Core.toLocalISO(now), method: 'Back to original payment', by, reason: `${line.name}: ${reason}` });
    log(b, now, by, `Add-on refunded: ${line.name}, £${line.paid.toFixed(2)}. Reason: ${reason}.`);
    Core.audit(s, { at: now, by, type: 'Refund', text: `${b.ref}: add-on ${line.name}, £${line.paid.toFixed(2)}. ${reason}` });
    return { ok: true, amount: line.paid };
  };
  Core.paidTotal = (b) => Core.round2(b.tickets.reduce((n, t) => n + t.paid, 0));
  Core.refundedTotal = (b) => Core.round2(b.tickets.reduce((n, t) => n + t.refunded, 0));
  Core.addOnsPaid = (b) => Core.round2((b.addOns || []).reduce((n, x) => n + x.paid, 0));
  Core.addOnsRefunded = (b) => Core.round2((b.addOns || []).reduce((n, x) => n + x.refunded, 0));
  /* Everything on the booking, tickets and add-ons: what the customer sees as paid. */
  Core.totalPaid = (b) => Core.round2(Core.paidTotal(b) + Core.addOnsPaid(b));
  Core.totalRefunded = (b) => Core.round2(Core.refundedTotal(b) + Core.addOnsRefunded(b));
  Core.ticketRefundable = (t) => Core.round2(t.paid - t.refunded);
  Core.bookingStatus = function (b) {
    if (b.tickets.length && b.tickets.every((t) => t.status !== 'active')) return 'Cancelled';
    return 'Confirmed';
  };
  Core.paymentStatus = function (b) {
    const r = Core.totalRefunded(b), p = Core.totalPaid(b);
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
  /* The marketing admin refunds freely. A club manager refunds inside the policy and up to the limit in Settings;
     anything more goes to the marketing admin for approval. Used until the setting has been saved once. */
  Core.MANAGER_REFUND_DEFAULT = 100;
  Core.managerRefundLimit = (settings) => (settings && settings.managerRefundLimit !== undefined && settings.managerRefundLimit !== null && settings.managerRefundLimit !== '' ? Number(settings.managerRefundLimit) : Core.MANAGER_REFUND_DEFAULT);
  /* o: { type: 'full' | 'part', amount, sessions, now }. Returns { ok, needsApproval, reason }. needsApproval says the
     marketing admin can still do it, so the screen can offer to ask for approval instead of a dead end. */
  Core.refundAllowed = function (role, settings, o) {
    const a = o || {};
    if (!Core.can(role, 'refund.full') && !Core.can(role, 'refund.partial')) return { ok: false, needsApproval: false, reason: 'Your role cannot give refunds.' };
    if (a.type === 'part' && !Core.can(role, 'refund.partial')) return { ok: false, needsApproval: true, reason: 'Your role can give full refunds only. The marketing admin needs to approve a part refund.' };
    if (Core.can(role, 'refund.approve')) return { ok: true, needsApproval: false, reason: '' };
    const ask = (reason) => ({ ok: false, needsApproval: true, reason });
    if (settings && a.sessions && a.sessions.length && !Core.policyFor(settings, a.sessions, a.now || new Date()).refundInside) {
      return ask('This is outside the refund policy, so the marketing admin needs to approve it.');
    }
    const limit = Core.managerRefundLimit(settings);
    if (Number.isFinite(limit) && limit > 0 && Number(a.amount) > limit) return ask(`A club manager can refund up to £${limit.toFixed(2)}. The marketing admin needs to approve this.`);
    return { ok: true, needsApproval: false, reason: '' };
  };
  /* ---------- Business rules: price floor, event type defaults, partner cost, data retention ---------- */
  /* What a new event of a type starts with. Used when a type has no defaults saved yet. */
  Core.defaultTemplate = () => ({ price: 15, capacity: 12, durationMin: 60, maxPerBooking: 4, guestDetails: 'name', questions: [] });
  /* ---------- Club managers: approval of new events, notices to marketing ---------- */
  /* A club manager's new event waits for marketing. A copy of an event that is already live (event.copyOf) does not, and
     neither does an event marketing has already approved. The marketing admin always publishes directly. */
  Core.needsEventApproval = function (s, role, event) {
    if (role !== 'manager') return false;
    if (event.approval && event.approval.status === 'approved') return false;
    if (event.copyOf) {
      const src = Core.findEvent(s, event.copyOf);
      if (src && !src.draft && !(src.approval && src.approval.status === 'pending')) return false;
    }
    return true;
  };
  /* An update for the marketing admin, shown on Today until they mark it as seen. kind: 'price' | 'cancel' | 'event'. */
  Core.notice = function (s, { at, by, kind, text }) {
    if (!Array.isArray(s.notices)) s.notices = [];
    s.notices.unshift({ id: Core.nextId(s, 'n'), at: Core.toLocalISO(at), by, kind, text, seen: false });
    if (s.notices.length > 200) s.notices.length = 200;
  };
  /* ---------- Membership: plans, offers and subscriptions ---------- */
  /* How long the member price carries on after a payment fails. Demo value. */
  Core.MEMBER_GRACE_DAYS = 7;
  const emailKey = (x) => String(x || '').trim().toLowerCase();
  /* Moves a date on by one billing period, keeping it valid at the end of a short month. */
  const addPeriod = function (iso, interval) {
    const d = new Date(iso), day = d.getDate();
    if (interval === 'year') d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1);
    if (d.getDate() !== day) d.setDate(0);
    return Core.toLocalISO(d);
  };
  /* The next renewal after this one, skipping any dates already gone. */
  Core.nextRenewal = function (sub, now) {
    let next = addPeriod(sub.renewsAt, sub.interval);
    while (new Date(next) <= now) next = addPeriod(next, sub.interval);
    return next;
  };
  /* The status people see. Cancelled at the end of a period and Expired come from the dates, so nothing has to run. */
  Core.subStatus = function (sub, now) {
    if (sub.status === 'cancelled') return 'Cancelled';
    if (sub.status === 'paused') return 'Paused';
    if (sub.status === 'failed') return 'Payment failed';
    if (new Date(sub.renewsAt) <= now) return sub.cancelAtEnd ? 'Cancelled' : 'Expired';
    return 'Active';
  };
  Core.subGivesMemberPrice = function (sub, now) {
    const status = Core.subStatus(sub, now);
    if (status === 'Active') return true;
    return status === 'Payment failed' && now.getTime() - new Date(sub.failedAt).getTime() < Core.MEMBER_GRACE_DAYS * 86400000;
  };
  /* This person's current subscription: one still running if there is one, otherwise their latest. */
  Core.subscriptionFor = function (s, email, now) {
    const key = emailKey(email), when = now || new Date();
    if (!key) return null;
    const mine = (s.subscriptions || []).filter((x) => emailKey(x.email) === key).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return mine.find((x) => !['Cancelled', 'Expired'].includes(Core.subStatus(x, when))) || mine[0] || null;
  };
  /* The one answer to "does this person get the member price?". */
  Core.hasMembership = function (s, email, now) {
    const when = now || new Date(), sub = Core.subscriptionFor(s, email, when);
    return !!sub && Core.subGivesMemberPrice(sub, when);
  };
  Core.offerStatus = function (offer, now) {
    const today = Core.dayKey(now);
    if (offer.ended || (offer.endsOn && offer.endsOn < today)) return 'Ended';
    return offer.startsOn > today ? 'Starts later' : 'Live';
  };
  Core.offerText = (offer) => (offer.type === 'percent' ? `${offer.value}% off the first payment` : `£${Number(offer.value).toFixed(2)} off the first payment`);
  Core.offerPrice = function (plan, offer) {
    if (!offer) return plan.price;
    const off = offer.type === 'percent' ? plan.price * offer.value / 100 : offer.value;
    return Core.round2(Math.max(0, plan.price - off));
  };
  Core.startSubscription = function (s, { name, email, plan, offer, now, by }) {
    const at = Core.toLocalISO(now), firstPayment = Core.offerPrice(plan, offer);
    const sub = {
      id: Core.nextId(s, 'sub'), name, email: emailKey(email), planId: plan.id, price: plan.price, interval: plan.interval,
      status: 'active', startedAt: at, renewsAt: addPeriod(at, plan.interval), cancelAtEnd: false,
      offerId: offer ? offer.id : '', firstPayment,
      history: [{ at, by, text: `Joined ${plan.name}. First payment £${firstPayment.toFixed(2)} (test payment)${offer ? `, with offer ${offer.name}` : ''}.` }]
    };
    s.subscriptions.push(sub);
    Core.addSubPayment(s, sub, { at, amount: firstPayment, status: 'Succeeded', note: offer ? `First payment, with offer ${offer.name}` : 'First payment' });
    return sub;
  };
  /* The payments on a subscription. status: Succeeded, Failed (still owed), Recovered (failed, then paid), Not paid (failed, then cancelled).
     Upcoming payments are not stored: they come from the renewal date. All of these are test records. */
  Core.addSubPayment = function (s, sub, { at, amount, status, note }) {
    if (!Array.isArray(sub.payments)) sub.payments = [];
    const p = { id: Core.nextId(s, 'sp'), at, amount: Core.round2(amount), status, note: note || '' };
    sub.payments.push(p);
    return p;
  };
  /* Closes the failed payment still owed, so one payment stays one row. */
  Core.settleSubPayment = function (s, sub, status, at) {
    const list = Array.isArray(sub.payments) ? sub.payments : [];
    const open = list.filter((p) => p.status === 'Failed').pop() || Core.addSubPayment(s, sub, { at: sub.failedAt || at, amount: sub.price, status: 'Failed', note: 'Renewal' });
    Object.assign(open, { status, settledAt: at });
    return open;
  };
  /* The live offer that gives this plan the lowest first payment, if any. */
  Core.bestOffer = function (s, plan, now) {
    return (s.offers || []).filter((o) => Core.offerStatus(o, now) === 'Live' && (!o.planId || o.planId === plan.id))
      .sort((a, b) => Core.offerPrice(plan, a) - Core.offerPrice(plan, b))[0] || null;
  };
  /* ---------- Customer accounts ---------- */
  /* Does another signed-in person already use this email? Bookings and memberships follow the email, so it must be theirs alone. */
  Core.emailTaken = function (s, email, exceptId) {
    const key = emailKey(email);
    return !!key && (s.users || []).some((u) => !u.guest && u.id !== exceptId && emailKey(u.email) === key);
  };
  Core.createAccount = function (s, { name, email, phone, marketing }) {
    const user = { id: Core.nextId(s, 'u'), name, email: emailKey(email), phone: phone || '', marketingConsent: !!marketing, role: 'user', venueId: null, venueIds: [] };
    s.users.push(user);
    return user;
  };
  /* A customer changes their own email: what they booked and paid for goes with them. */
  Core.moveCustomerEmail = function (s, from, to) {
    const old = emailKey(from), next = emailKey(to);
    if (!old || !next || old === next) return;
    (s.subscriptions || []).forEach((x) => { if (emailKey(x.email) === old) x.email = next; });
    (s.waitlist || []).forEach((w) => { if (emailKey(w.email) === old) w.email = next; });
    (s.bookings || []).forEach((b) => {
      if (!b.customer || emailKey(b.customer.email) !== old) return;
      b.customer.email = next;
      (b.people || []).forEach((p) => { if (p.isLead) p.email = next; });
    });
  };
  /* The choice from the profile. Saying no also applies to past bookings, so marketing stops. Saying yes does not reach back. */
  Core.setCustomerConsent = function (s, user, on) {
    user.marketingConsent = !!on;
    if (on) return;
    const key = emailKey(user.email);
    (s.bookings || []).forEach((b) => {
      if (!b.customer || emailKey(b.customer.email) !== key) return;
      b.customer.marketingConsent = false;
      (b.people || []).forEach((p) => { if (p.isLead) p.marketingConsent = false; });
    });
  };
  /* Everyone the business knows: accounts, people who booked and people who subscribed, as one row per email. */
  Core.customerDirectory = function (s, now) {
    const people = new Map();
    const get = (email, name) => {
      const key = emailKey(email);
      if (!key) return null;
      if (!people.has(key)) people.set(key, { email: key, name: '', hasAccount: false, bookings: 0, spent: 0, lastBooking: '' });
      const p = people.get(key);
      if (name && !p.name) p.name = name;
      return p;
    };
    (s.users || []).forEach((u) => { if (u.role === 'user') { const p = get(u.email, u.name); if (p) p.hasAccount = true; } });
    (s.bookings || []).forEach((b) => {
      const p = b.customer && get(b.customer.email, b.customer.name);
      if (!p) return;
      p.bookings++;
      p.spent = Core.round2(p.spent + Core.totalPaid(b) - Core.totalRefunded(b));
      if (b.createdAt > p.lastBooking) p.lastBooking = b.createdAt;
    });
    (s.subscriptions || []).forEach((x) => get(x.email, x.name));
    return [...people.values()].map((p) => {
      const subscription = Core.subscriptionFor(s, p.email, now), subStatus = subscription ? Core.subStatus(subscription, now) : '';
      const isMember = !!subscription && Core.subGivesMemberPrice(subscription, now);
      return Object.assign(p, { subscription, subStatus, isMember, type: isMember ? 'Member' : p.hasAccount ? 'Account' : 'Guest' });
    }).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  };
  /* Made-up plans and offers, and a subscription for everyone already marked as a member. Runs once. */
  /* Works out the payments of a subscription that has no list yet, from its dates. */
  const fillSubPayments = function (s, sub, now) {
    sub.payments = [];
    const failedAt = sub.status === 'failed' && sub.failedAt ? new Date(sub.failedAt) : null;
    const stop = sub.status === 'cancelled' && sub.cancelledAt ? new Date(sub.cancelledAt) : now;
    const paidUntil = new Date(sub.renewsAt);
    Core.addSubPayment(s, sub, { at: sub.startedAt, amount: sub.firstPayment === undefined ? sub.price : sub.firstPayment, status: 'Succeeded', note: 'First payment' });
    let due = addPeriod(sub.startedAt, sub.interval), guard = 0;
    while (new Date(due) <= stop && new Date(due) < paidUntil && (!failedAt || new Date(due) < failedAt) && guard < 600) {
      Core.addSubPayment(s, sub, { at: due, amount: sub.price, status: 'Succeeded', note: 'Renewal' });
      due = addPeriod(due, sub.interval);
      guard++;
    }
    if (failedAt) Core.addSubPayment(s, sub, { at: sub.failedAt, amount: sub.price, status: 'Failed', note: 'Renewal' });
  };
  const startMembership = function (s, now) {
    const at = (days) => Core.toLocalISO(new Date(now.getTime() + days * 86400000));
    s.plans = [
      { id: 'pl1', name: 'Monthly', price: 25, interval: 'month', description: 'Member price on events. Cancel any time.', active: true },
      { id: 'pl2', name: 'Annual', price: 250, interval: 'year', description: 'Two months free compared with Monthly.', active: true },
      { id: 'pl3', name: 'Off-peak', price: 15, interval: 'month', description: 'A lower price for weekday daytime members.', active: true }
    ];
    s.offers = [
      { id: 'of1', name: 'New member half price', planId: 'pl1', type: 'percent', value: 50, startsOn: Core.dayKey(at(-30)), endsOn: Core.dayKey(at(60)) },
      { id: 'of2', name: 'Spring joiners', planId: '', type: 'fixed', value: 10, startsOn: Core.dayKey(at(-200)), endsOn: Core.dayKey(at(-120)) }
    ];
    s.subscriptions = [];
    const seen = new Map();
    const add = (email, name, since) => {
      const key = emailKey(email);
      if (!key) return;
      if (!seen.has(key)) seen.set(key, { email: key, name, since });
      else if (since && since < seen.get(key).since) seen.get(key).since = since;
    };
    (s.users || []).forEach((u) => { if (u.role === 'user' && u.isMember && u.email) add(u.email, u.name, at(-90)); });
    (s.bookings || []).forEach((b) => { if (b.customer && b.customer.isMember) add(b.customer.email, b.customer.name, b.createdAt); });
    [...seen.values()].forEach((m, i) => {
      const plan = s.plans[i % 5 === 4 ? 1 : i % 5 === 3 ? 2 : 0];
      const startedAt = Core.toLocalISO(new Date(new Date(m.since).getTime() - 30 * 86400000));
      const sub = {
        id: Core.nextId(s, 'sub'), name: m.name, email: m.email, planId: plan.id, price: plan.price, interval: plan.interval,
        status: 'active', startedAt, renewsAt: startedAt, cancelAtEnd: false, offerId: '', firstPayment: plan.price,
        history: [{ at: startedAt, by: 'Demo data', text: `Joined ${plan.name}.` }]
      };
      sub.renewsAt = Core.nextRenewal(sub, now);
      /* The first few stay active, so the demo customer always has the member price. */
      if (i > 2 && i % 9 === 3) Object.assign(sub, { status: 'failed', failedAt: at(-2) });
      else if (i > 2 && i % 11 === 5) sub.status = 'paused';
      else if (i > 2 && i % 13 === 7) Object.assign(sub, { status: 'cancelled', cancelledAt: at(-20), cancelReason: 'Moved away' });
      else if (i > 2 && i % 17 === 9) sub.cancelAtEnd = true;
      s.subscriptions.push(sub);
      fillSubPayments(s, sub, now);
      /* Some past payments failed and were paid a few days later, so the demo shows them. */
      const earlier = sub.payments[sub.payments.length - 2];
      if (i % 7 === 2 && earlier && earlier.note === 'Renewal') {
        const late = new Date(earlier.at);
        late.setDate(late.getDate() + 3);
        Object.assign(earlier, { status: 'Recovered', settledAt: Core.toLocalISO(late) });
      }
    });
  };
  /* Gives the demo several customer accounts, some with a membership and some without. Each is a real person from the
     bookings, so their bookings show when you sign in as them. Runs once. */
  const addDemoAccounts = function (s, now) {
    const used = new Set((s.users || []).map((u) => emailKey(u.email)).filter(Boolean));
    const names = new Set((s.users || []).map((u) => String(u.name).toLowerCase()));
    const want = { member: 3, other: 5 };
    (s.bookings || []).forEach((b) => {
      const c = b.customer, key = c && emailKey(c.email);
      if (!key || used.has(key) || !c.name || names.has(c.name.toLowerCase())) return;
      const kind = Core.hasMembership(s, key, now) ? 'member' : 'other';
      if (!want[kind]) return;
      want[kind]--;
      used.add(key);
      names.add(c.name.toLowerCase());
      s.users.push({ id: Core.nextId(s, 'u'), name: c.name, email: key, role: 'user', venueId: null, venueIds: [] });
    });
  };
  /* Made-up add-ons for trying the checkout: plenty, limited, nearly gone and sold out. Runs once, and skips any
     name a venue already has, so nothing added by staff is changed. */
  const TEST_ADD_ONS = [
    { name: 'Yoga mat hire', price: 3, venueId: 'v1', stock: 10, events: ['Autumn Pilates (4 weeks)', 'Sunday Stretch'] },
    { name: 'Coffee and pastry', price: 5, venueId: 'v1', stock: null, events: ['Autumn Pilates (4 weeks)', 'Members Breakfast Talks', 'Sunday Stretch'] },
    { name: 'Padel balls (tube of 3)', price: 6, venueId: 'v1', stock: 2, events: ['Padel Social Night', 'Padel Coaching: Beginners'] },
    { name: 'Sweatband', price: 3, venueId: 'v1', stock: 0, events: ['Padel Social Night', 'Autumn Pilates (4 weeks)'] },
    { name: 'Coffee and pastry', price: 5, venueId: 'v2', stock: null, events: ['Morning Run Club', 'Padel Ladder Nights'] },
    { name: 'Energy bar', price: 2.5, venueId: 'v2', stock: 20, events: ['Morning Run Club', 'Autumn Bootcamp'] },
    { name: 'Padel balls (tube of 3)', price: 6, venueId: 'v2', stock: 5, events: ['Padel Ladder Nights', 'Junior Padel Coaching'] },
    { name: 'Wetsuit hire', price: 8, venueId: 'v3', stock: 4, events: ['Paddleboard Coaching', 'Harbour Sea Swim'] },
    { name: 'Dry bag', price: 3, venueId: 'v3', stock: 10, events: ['Paddleboard Coaching'] },
    { name: 'Hot chocolate', price: 3, venueId: 'v3', stock: null, events: ['Harbour Sea Swim', 'Breathwork Season', 'Sunset Yoga'] }
  ];
  const addTestAddOns = function (s) {
    TEST_ADD_ONS.forEach((x) => {
      if (!(s.venues || []).some((v) => v.id === x.venueId)) return;
      const same = String(x.name).toLowerCase();
      let a = s.addOns.find((y) => y.venueId === x.venueId && String(y.name).toLowerCase() === same);
      if (a) return;
      a = { id: Core.nextId(s, 'ad'), name: x.name, price: x.price, venueId: x.venueId, stock: x.stock };
      s.addOns.push(a);
      (s.events || []).filter((e) => e.venueId === x.venueId && x.events.includes(e.title)).forEach((e) => {
        if (!Array.isArray(e.addOnIds)) e.addOnIds = [];
        if (!e.addOnIds.includes(a.id)) e.addOnIds.push(a.id);
      });
    });
  };
  /* Gives every series in the demo a full series option. A regular series with too few dates left gets more weekly
     dates, as a series of one session means nothing. One-off events stay as they are, and so does anything finished
     or cancelled. Runs once. Made-up prices: about 15% less than the single sessions. */
  const addFullSeries = function (s, now) {
    (s.events || []).forEach((e) => {
      if (e.format === 'One-off' || e.cancelled || e.draft || e.dropInsEnabled === false || !(e.tickets || []).length) return;
      let left = Core.remainingSessions(e, now).length;
      if (!left) return;
      if (e.format === 'Regular series') {
        while (left < 4) {
          const last = Core.sortedSessions(e).filter((x) => !x.cancelled).pop();
          const d = new Date(last.start); d.setDate(d.getDate() + 7);
          e.sessions.push(Object.assign({}, last, { id: Core.nextId(s, 's'), start: Core.toLocalISO(d) }));
          left++;
        }
      }
      if (left < 2) return;
      const live = e.sessions.filter((x) => !x.cancelled), std = Core.standardPrice(e);
      if (!e.block || !e.block.enabled) {
        if (!(std > 0)) return;
        e.block = { enabled: true, price: Math.round(std * live.length * 0.85) };
      }
      e.block.allowLate = true;
      const m = e.memberPricing;
      if (m && m.mode === 'percent') m.applyToBlock = true;
      if (m && m.mode === 'fixed' && !m.applyToBlock) { m.applyToBlock = true; m.blockValue = Math.round(Number(m.value) * live.length * 0.85); }
    });
  };
  /* Settings and fields added after data was first saved. Changes nothing that is already set. */
  Core.migrate = function (s) {
    const set = s.settings || (s.settings = {});
    if (set.managerRefundLimit === undefined) set.managerRefundLimit = Core.MANAGER_REFUND_DEFAULT;
    /* Lists the newer screens read and write, so they never meet a missing one. */
    ['notices', 'waitlist', 'klaviyoLog', 'audit', 'codeHolds', 'addOns'].forEach((k) => { if (!Array.isArray(s[k])) s[k] = []; });
    /* Generating batches of codes was removed the same day. The codes stay, as ordinary single-use codes. */
    (s.codes || []).forEach((c) => { delete c.batchId; });
    (s.events || []).forEach((e) => { if (!Array.isArray(e.addOnIds)) e.addOnIds = []; });
    (s.bookings || []).forEach((b) => { if (!Array.isArray(b.addOns)) b.addOns = []; });
    if (!s.testAddOnsAdded) { addTestAddOns(s); s.testAddOnsAdded = true; }
    if (!s.fullSeriesAdded) { addFullSeries(s, new Date()); s.fullSeriesAdded = true; }
    s.notices = s.notices.filter((n) => n && typeof n === 'object');
    s.notices.forEach((n) => { n.seen = !!n.seen; });
    /* An approval we cannot read would block an event for ever, so it is dropped. The event keeps its draft setting. */
    (s.events || []).forEach((e) => { if (e.approval && !['pending', 'approved', 'rejected'].includes(e.approval.status)) delete e.approval; });
    if (set.minTicketPrice === undefined) set.minTicketPrice = 0;
    if (set.retentionDays === undefined) set.retentionDays = 365;
    delete set.fohRefundLimit;
    delete set.receptionRefundLimit;
    if (!Array.isArray(s.plans) || !Array.isArray(s.offers) || !Array.isArray(s.subscriptions)) startMembership(s, new Date());
    (s.subscriptions || []).forEach((sub) => { if (!Array.isArray(sub.payments)) fillSubPayments(s, sub, new Date()); });
    if (!s.demoAccounts) { addDemoAccounts(s, new Date()); s.demoAccounts = true; }
    (s.eventTypes || []).forEach((t) => { t.template = Object.assign(Core.defaultTemplate(), t.template || {}); if (!Array.isArray(t.template.questions)) t.template.questions = []; });
    (s.partners || []).forEach((p) => { delete p.cost; });
    /* Goodwill codes, pausing, start dates and per-customer limits were not in the requirements, so they went on 4 Nov 2026.
       A paused code stays stopped: it becomes expired rather than coming back to life. */
    delete set.goodwillMax;
    /* The Discount rules screen was removed on 4 Nov 2026, so no one could change a saved choice back. A code always comes off the member price. */
    set.stacking = 'stack';
    (s.codes || []).forEach((c) => {
      if (c.paused) c.expiresAt = Core.toLocalISO(new Date());
      ['paused', 'startsAt', 'perCustomerLimit', 'goodwill', 'reason', 'createdBy'].forEach((k) => { delete c[k]; });
    });
    s.notices = (s.notices || []).filter((n) => !n || n.kind !== 'goodwill');
    /* Guest checkout: one built-in customer with no account, who gives a name and email when booking. */
    if (Array.isArray(s.users) && !s.users.some((u) => u.guest)) s.users.push({ id: 'guest', name: 'Guest', role: 'user', guest: true, extKey: 'guest', email: '', venueId: null, venueIds: [] });
    return s;
  };
  /* Warnings when the member price and/or a code would take a ticket below the lowest price in Settings (0 = off).
     o: { code, isMember }. Returns a list of plain sentences, empty when nothing goes below the floor. */
  Core.priceFloorCheck = function (s, event, o) {
    const a = o || {}, floor = Number(s.settings.minTicketPrice) || 0;
    if (!(floor > 0) || !event) return [];
    const options = (event.dropInsEnabled === false ? [] : event.tickets.map((t) => ({ kind: 'dropin', ticketTypeId: t.id, label: t.name || 'Ticket' })))
      .concat(event.block && event.block.enabled ? [{ kind: 'block', ticketTypeId: null, label: 'Block' }] : []);
    const out = [];
    options.forEach((opt) => {
      const q = Core.quote({ event, kind: opt.kind, ticketTypeId: opt.ticketTypeId, qty: 1, isMember: !!a.isMember, code: a.code || null, settings: s.settings });
      const paid = q.lines.length ? q.lines[0].paid : q.total, list = q.lines.length ? q.lines[0].list : q.subtotal;
      /* The floor guards discounts: a ticket that is listed below the floor is staff's choice, not an accident. */
      if (paid < floor && paid < list) out.push(`${event.title}, ${opt.label}: £${paid.toFixed(2)} is below the lowest price of £${floor.toFixed(2)}.`);
    });
    return out;
  };
  /* Data retention: guest contact details and every answer are cleared on bookings whose event ended more than
     retentionDays ago (0 = keep). The lead booker's name, email, the booking record and money are kept. */
  const eventEndedAt = (e) => {
    const ends = (e.sessions || []).filter((x) => x.start).map((x) => new Date(x.start).getTime() + (Number(x.durationMin) || 0) * 60000);
    return ends.length ? Math.max(...ends) : null;
  };
  const retentionTargets = function (s, now) {
    const days = Number(s.settings.retentionDays) || 0;
    if (!(days > 0)) return [];
    const cutoff = now.getTime() - days * 86400000;
    return s.bookings.filter((b) => {
      const e = Core.findEvent(s, b.eventId), end = e ? eventEndedAt(e) : null;
      return end !== null && end < cutoff;
    });
  };
  const hasAnswers = (p) => Object.values(p.answers || {}).some((v) => String(v || '').trim());
  Core.retentionPreview = function (s, now) {
    let people = 0, answers = 0, bookings = 0;
    retentionTargets(s, now).forEach((b) => {
      let touched = false;
      b.people.forEach((p) => {
        const contact = !p.isLead && (p.email || p.phone);
        const n = Object.values(p.answers || {}).filter((v) => String(v || '').trim()).length;
        if (contact) people++;
        answers += n;
        if (contact || n) touched = true;
      });
      if (touched) bookings++;
    });
    return { bookings, people, answers };
  };
  Core.retentionRun = function (s, now, by) {
    const before = Core.retentionPreview(s, now);
    retentionTargets(s, now).forEach((b) => {
      let touched = false;
      b.people.forEach((p) => {
        if (!p.isLead && (p.email || p.phone)) { p.email = ''; p.phone = ''; touched = true; }
        if (hasAnswers(p)) { p.answers = {}; touched = true; }
      });
      if (touched) log(b, now, by || 'System', 'Guest contact details and answers deleted under the data retention rule.');
    });
    if (before.people || before.answers) {
      Core.audit(s, { at: now, by: by || 'System', type: 'Data retention', text: `Cleared ${before.people} guest contact details and ${before.answers} answers on ${before.bookings} bookings for events that ended more than ${s.settings.retentionDays} days ago.` });
    }
    return before;
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
