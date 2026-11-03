/* The booking page: everything about one booking, with its actions in one place.
   bookings.js calls BookingDetail.render(mainEl, bookingId) for #/bookings/<id>. */
(function () {
  'use strict';
  const esc = (v) => UI.esc(v);
  const S = () => App.state;
  const by = () => App.user().name;
  const r2 = (n) => Core.round2(n);
  const sum = (list, fn) => r2(list.reduce((n, x) => n + fn(x), 0));
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  /* ---------- Checks: run when the page draws and again before each action ---------- */
  const bookingEvent = (b) => (b ? Core.findEvent(S(), b.eventId) : null);
  const canSee = (b) => {
    const e = bookingEvent(b);
    return !!e && App.can('bookings.view') && Core.canSeeVenue(App.user(), e.venueId) && App.inVenue(e.venueId);
  };
  const allowed = (b, perms) => {
    const list = [].concat(perms);
    if (canSee(b) && list.some((p) => App.can(p))) return true;
    UI.toast('Your role cannot do this for this booking.', 'bad');
    return false;
  };
  const canRefund = () => App.can('refund.full') || App.can('refund.partial');

  /* ---------- Small lookups ---------- */
  const sessionOf = (t) => Core.findSession(S(), t.sessionId);
  const personOf = (b, t) => b.people.find((p) => p.id === t.personId);
  const nameOf = (b, t) => { const p = personOf(b, t); return p ? Core.personName(b, p) : 'Unknown person'; };
  const whenOf = (t) => { const f = sessionOf(t); return f ? UI.dateTime(f.session.start) : 'Session not found'; };
  const ticketText = (b, t) => {
    const f = sessionOf(t);
    const other = f && f.event.id !== b.eventId ? `${f.event.title}, ` : '';
    return `${nameOf(b, t)} · ${other}${whenOf(t)}`;
  };
  const sessionsOf = (tickets) => {
    const out = [];
    tickets.forEach((t) => { const f = sessionOf(t); if (f && !out.includes(f.session)) out.push(f.session); });
    return out;
  };
  const activeTickets = (b) => b.tickets.filter((t) => t.status === 'active');
  /* A place that has been used is kept: moving or cancelling it would wipe the check-in record. */
  const openTickets = (b) => activeTickets(b).filter((t) => !t.checkedInAt);
  const refundableTickets = (b) => b.tickets.filter((t) => Core.ticketRefundable(t) > 0);
  const leftOn = (tickets) => sum(tickets, Core.ticketRefundable);
  /* The next session still to come sets the policy. With none to come, the past sessions are used, which is outside. */
  const policySessions = (b) => {
    const now = App.now();
    const coming = sessionsOf(activeTickets(b)).filter((x) => new Date(x.start) > now);
    return coming.length ? coming : sessionsOf(b.tickets);
  };
  const hoursText = (hours) => {
    if (hours === Infinity) return 'no session found';
    if (hours <= 0) return 'the session has already started';
    return hours < 48 ? `${plural(Math.floor(hours), 'hour')} before the session` : `${plural(Math.floor(hours / 24), 'day')} before the session`;
  };
  const policyLine = (sessions, kind) => {
    const p = Core.policyFor(S().settings, sessions, App.now());
    const inside = kind === 'transfer' ? p.transferInside : p.refundInside;
    const limit = kind === 'transfer' ? p.transferHours : p.refundHours;
    const fee = kind === 'transfer' ? p.transferFee : p.refundFee;
    const word = kind === 'transfer' ? 'transfer' : 'refund';
    return `${UI.badge(inside ? 'Inside policy' : 'Outside policy', inside ? 'good' : 'warn')} <span class="hint">The ${word} policy allows up to ${limit} hours before the session${fee > 0 ? `, with a ${UI.money(fee)} fee` : ''}. Now: ${esc(hoursText(p.hours))}.</span>`;
  };
  /* Paid divided by sessions: £48 ÷ 4 = £12 a session. */
  const personShare = (b, personId) => {
    const own = b.tickets.filter((t) => t.personId === personId);
    const paid = sum(own, (t) => t.paid);
    return { paid, sessions: own.length, each: own.length ? r2(paid / own.length) : 0 };
  };
  const suggestedAmount = (b, tickets) => sum(tickets, (t) => Math.min(Core.ticketRefundable(t), personShare(b, t.personId).each));
  const shareText = (b, tickets) => {
    const seen = new Set();
    const out = [];
    tickets.forEach((t) => {
      if (seen.has(t.personId)) return;
      seen.add(t.personId);
      const x = personShare(b, t.personId);
      out.push(`${nameOf(b, t)}: ${UI.money(x.paid)} ÷ ${plural(x.sessions, 'session')} = ${UI.money(x.each)} a session`);
    });
    return out.join('; ');
  };
  const returnableCode = (b) => {
    const c = b.codeId ? Core.findCode(S(), b.codeId) : null;
    return c && c.kind === 'single' && b.pricing && b.pricing.codeApplied && !b.codeReleased ? c : null;
  };
  const codeTick = (b) => {
    const c = returnableCode(b);
    if (!c) return '';
    return `<label class="check"><input type="checkbox" name="returnCode"><span>Return single-use code ${esc(c.code)} so it can be used again. A refund or cancellation does not return it by itself.</span></label>`;
  };
  const applyCodeReturn = (d, b) => {
    const box = d.querySelector('[name=returnCode]');
    const c = returnableCode(b);
    if (!box || !box.checked || !c) return;
    Core.releaseCode(S(), b, { by: by(), now: App.now() });
    App.log('Code returned', `${b.ref}: single-use code ${c.code} returned by staff.`);
  };
  const klaviyo = (b, type) => Core.klaviyo(S(), { at: App.now(), type, ref: b.ref });
  const finish = (text) => { App.save(); App.render(); if (text) UI.toast(text); };
  const parseAmount = (text) => (/^\d+(\.\d{1,2})?$/.test(String(text).trim()) ? Number(text) : NaN);
  const val = (d, sel) => { const el = d.querySelector(sel); return el ? el.value.trim() : ''; };
  const radio = (d, name) => { const el = d.querySelector(`[name=${name}]:checked`); return el ? el.value : ''; };

  /* ---------- Dialog: edit guest details ---------- */
  const isTick = (q) => /tick|check|box/i.test(q.type || '');
  const questionsFor = (event, person) => (event.questions || []).filter((q) => {
    if (q.scope === 'booking') return person.isLead;
    return person.isLead || event.guestDetails !== 'lead';
  });
  function editDetails(b) {
    if (!allowed(b, 'bookings.modify')) return;
    const event = bookingEvent(b);
    const block = (p) => {
      const id = esc(p.id);
      const questions = questionsFor(event, p).map((q) => {
        const answer = (p.answers || {})[q.id] || '';
        const label = `${esc(q.label)}${q.required ? ' (required)' : ''}`;
        if (isTick(q)) return `<label class="check"><input type="checkbox" data-q="${esc(q.id)}"${answer ? ' checked' : ''}><span>${label}</span></label>`;
        if (q.type === 'choice') return `<label class="field"><span>${label}</span><select data-q="${esc(q.id)}"><option value="">No answer</option>${UI.options((q.options || []).map((o) => ({ value: o, label: o })), answer)}</select></label>`;
        return `<label class="field"><span>${label}</span><input type="text" data-q="${esc(q.id)}" value="${esc(answer)}"></label>`;
      }).join('');
      return `<fieldset class="bd-fieldset" data-person="${id}"><legend>${p.isLead ? 'Lead booker' : `Guest ${b.people.indexOf(p)}`}</legend>
        <label class="field"><span>Name</span><input type="text" data-f="name" value="${esc(p.name)}" autocomplete="off"></label>
        <label class="field"><span>Email</span><input type="email" data-f="email" value="${esc(p.email)}" autocomplete="off"></label>
        ${p.isLead ? `<label class="field"><span>Phone</span><input type="tel" data-f="phone" value="${esc(p.phone)}" autocomplete="off"></label>` : ''}
        <label class="check"><input type="checkbox" data-f="marketingConsent"${p.marketingConsent ? ' checked' : ''}><span>This person agreed to marketing<span class="hint bd-block">Tick only if this person agreed themselves. The lead booker cannot agree for them.</span></span></label>
        ${questions}</fieldset>`;
    };
    UI.dialog({
      title: `Edit guest details: ${b.ref}`, wide: true,
      body: `<div class="bd-form">${b.people.map(block).join('')}<p class="hint">Each change is recorded on the booking. Answers are not sent to Klaviyo.</p></div>`,
      actions: [{ label: 'Keep as it is', kind: 'ghost' }, {
        label: 'Save details', kind: 'primary', onClick: (d) => {
          if (!allowed(b, 'bookings.modify')) return undefined;
          const read = b.people.map((p) => {
            const box = d.querySelector(`[data-person="${CSS.escape(p.id)}"]`);
            const answers = {};
            box.querySelectorAll('[data-q]').forEach((el) => { answers[el.dataset.q] = el.type === 'checkbox' ? (el.checked ? 'Yes' : '') : el.value.trim(); });
            const phone = box.querySelector('[data-f=phone]');
            return { p, answers, name: box.querySelector('[data-f=name]').value.trim(), email: box.querySelector('[data-f=email]').value.trim(), phone: phone ? phone.value.trim() : null, consent: box.querySelector('[data-f=marketingConsent]').checked };
          });
          for (const x of read) {
            const who = x.p.isLead ? 'The lead booker' : `Guest ${b.people.indexOf(x.p)}`;
            if (x.p.isLead && !x.name) { UI.dialogError(d, 'The lead booker needs a name.'); return false; }
            if (x.p.isLead && !x.email) { UI.dialogError(d, 'The lead booker needs an email.'); return false; }
            if (x.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email)) { UI.dialogError(d, `${who}: this email does not look right.`); return false; }
            if (x.consent && !x.email) { UI.dialogError(d, `${who}: marketing consent needs an email.`); return false; }
          }
          const now = App.now();
          let changedAny = false, guestAdded = false;
          read.forEach((x) => {
            const p = x.p, changes = [];
            const before = Core.personName(b, p);
            if (x.name !== (p.name || '')) { changes.push('name'); if (!p.isLead && !p.name && x.name) guestAdded = true; p.name = x.name; }
            if (x.email !== (p.email || '')) { changes.push('email'); if (!p.isLead && !p.email && x.email) guestAdded = true; p.email = x.email; }
            if (x.phone !== null && x.phone !== (p.phone || '')) { changes.push('phone'); p.phone = x.phone; }
            if (x.consent !== !!p.marketingConsent) {
              changes.push(`marketing consent ${x.consent ? 'on' : 'off'}`);
              p.marketingConsent = x.consent;
              App.log('Consent', `${b.ref}: marketing consent turned ${x.consent ? 'on' : 'off'} for ${Core.personName(b, p)}.`);
            }
            p.answers = p.answers || {};
            questionsFor(event, p).forEach((q) => {
              const next = x.answers[q.id] || '';
              if (next !== String(p.answers[q.id] || '')) { changes.push(`answer to "${q.label}"`); p.answers[q.id] = next; }
            });
            if (p.isLead) { b.customer.name = p.name; b.customer.email = p.email; if (x.phone !== null) b.customer.phone = p.phone; }
            /* The timeline names what changed, not the new value, so health or dietary answers stay out of it. */
            if (changes.length) { changedAny = true; Core.logBooking(b, now, by(), `Details changed for ${before}: ${changes.join(', ')}.`); }
          });
          if (!changedAny) { UI.toast('Nothing changed.'); return undefined; }
          klaviyo(b, guestAdded ? 'Guest details added' : 'Booking changed');
          finish('Details saved.');
          return undefined;
        }
      }]
    });
  }

  /* ---------- Dialog: transfer ---------- */
  /* Core.transferTargets works out the difference and leaves out dearer events, so money only ever goes back. Never more than is left on the place. */
  const giveBack = (t, target) => Math.min(Math.max(0, -(target.difference || 0)), Core.ticketRefundable(t));
  function transfer(b, ticketId) {
    if (!allowed(b, 'bookings.transfer')) return;
    const list = openTickets(b);
    if (!list.length) { UI.toast('There are no places left to move.', 'bad'); return; }
    const first = list.find((t) => t.id === ticketId) || list[0];
    const fee = () => Number(S().settings.policy.transferFee) || 0;
    UI.dialog({
      title: `Transfer a ticket: ${b.ref}`,
      body: `<div class="bd-form">
        <label class="field"><span>Place to move</span><select name="ticket">${UI.options(list.map((t) => ({ value: t.id, label: ticketText(b, t) })), first.id)}</select></label>
        <label class="field"><span>Move to</span><select name="target"></select></label>
        <div class="bd-live" data-live aria-live="polite"></div>
        <label class="field" data-reason-box hidden><span>Reason for going outside the policy</span><textarea name="reason" rows="2"></textarea></label>
        ${UI.demo('The customer would get an updated confirmation and calendar invite. No email or payment is real.')}
      </div>`,
      onOpen: (d) => {
        const refresh = (rebuild) => {
          const t = b.tickets.find((x) => x.id === val(d, '[name=ticket]'));
          const targets = Core.transferTargets(S(), b, t, App.now());
          const sel = d.querySelector('[name=target]');
          if (rebuild) {
            sel.innerHTML = targets.map((x) => `<option value="${esc(x.session.id)}"${x.left < 1 ? ' disabled' : ''}>${esc(x.event.title)}, ${esc(UI.dateTime(x.session.start))} (${x.left < 1 ? 'full' : `${x.left} left`})</option>`).join('');
            const open = targets.find((x) => x.left > 0);
            if (open) sel.value = open.session.id;
            sel.disabled = !targets.length;
          }
          const from = sessionOf(t);
          const policy = Core.policyFor(S().settings, from ? [from.session] : [], App.now());
          const target = targets.find((x) => x.session.id === sel.value && x.left > 0);
          const box = d.querySelector('[data-reason-box]');
          box.hidden = policy.transferInside || !App.can('override');
          let html = `<p>${policyLine(from ? [from.session] : [], 'transfer')}</p>`;
          if (!policy.transferInside && !App.can('override')) html += '<p class="bd-warn">This is outside the policy. Ask a club manager to move this place.</p>';
          if (!targets.length) html += '<p class="bd-warn">There are no other sessions this place can move to.</p>';
          else if (!target) html += '<p class="bd-warn">All of these sessions are full. Choose another place or free a space first.</p>';
          if (target) {
            const back = giveBack(t, target);
            html += `<dl class="bd-dl"><dt>Price difference</dt><dd>${back > 0 ? `${UI.money(back)} to give back` : 'None'}</dd><dt>Policy fee</dt><dd>${fee() > 0 ? UI.money(fee()) : 'None'}</dd></dl>`;
            if (back > 0) {
              const can = Core.refundAllowed(App.role(), S().settings, { type: 'part', amount: back, sessions: from ? [from.session] : [], now: App.now() });
              html += can.ok
                ? `<label class="check"><input type="checkbox" name="refundDiff" checked><span>Refund the ${UI.money(back)} difference to the original payment</span></label>`
                : '<p class="bd-warn">Front of house cannot refund this difference. Move the place, then ask a club manager to refund it.</p>';
            }
          }
          d.querySelector('[data-live]').innerHTML = html;
        };
        d.querySelector('[name=ticket]').addEventListener('change', () => refresh(true));
        d.querySelector('[name=target]').addEventListener('change', () => refresh(false));
        refresh(true);
      },
      actions: [{ label: 'Keep as it is', kind: 'ghost' }, {
        label: 'Move this place', kind: 'primary', onClick: (d) => {
          if (!allowed(b, 'bookings.transfer')) return undefined;
          const now = App.now();
          const t = b.tickets.find((x) => x.id === val(d, '[name=ticket]'));
          const targetId = val(d, '[name=target]');
          const target = Core.transferTargets(S(), b, t, now).find((x) => x.session.id === targetId);
          if (!target) { UI.dialogError(d, 'Choose a session to move to.'); return false; }
          const from = sessionOf(t);
          const policy = Core.policyFor(S().settings, from ? [from.session] : [], now);
          const reason = val(d, '[name=reason]');
          if (!policy.transferInside) {
            if (!App.can('override')) { UI.dialogError(d, 'This is outside the policy. Ask a club manager.'); return false; }
            if (!reason) { UI.dialogError(d, 'Going outside the policy needs a reason.'); return false; }
          }
          const back = giveBack(t, target);
          const oldText = ticketText(b, t);
          const moved = Core.transferTicket(S(), b, t.id, targetId, { by: by(), now, describe: UI.dateTime, fee: fee() });
          if (!moved.ok) { UI.dialogError(d, moved.reason); return false; }
          let extra = fee() > 0 ? ` Fee ${UI.money(fee())}.` : '';
          if (back > 0) {
            const box = d.querySelector('[name=refundDiff]');
            if (box && box.checked) {
              const paid = Core.refund(S(), b, { ticketIds: [t.id], amount: back, reason: 'Price difference on a transfer', by: by(), freePlaces: false, now });
              extra += paid.ok ? ` Difference refunded ${UI.money(back)}.` : ` Difference of ${UI.money(back)} not refunded.`;
            } else {
              Core.logBooking(b, now, by(), `Price difference of ${UI.money(back)} not refunded at the time of the move.`);
              extra += ` Difference of ${UI.money(back)} not refunded.`;
            }
          }
          App.log('Transfer', `${b.ref}: ${oldText} moved to ${target.event.title}, ${UI.dateTime(target.session.start)}.${extra}`);
          if (!policy.transferInside) App.log('Override', `${b.ref}: transfer outside the policy. Reason: ${reason}`);
          klaviyo(b, 'Booking changed');
          finish('Place moved.');
          return undefined;
        }
      }]
    });
  }

  /* ---------- Dialog: cancel ---------- */
  function cancel(b, opts) {
    if (!allowed(b, 'bookings.cancel')) return;
    const o = opts || {};
    const list = openTickets(b);
    if (!list.length) { UI.toast('There are no places left to cancel.', 'bad'); return; }
    const sessions = sessionsOf(list);
    const open = b.requests.filter((r) => r.status === 'Open');
    const startScope = o.ticketId ? 'ticket' : 'all';
    const rad = (name, value, text, checked, disabled) => `<label class="check"><input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}><span>${text}</span></label>`;
    const chosen = (d) => {
      const scope = radio(d, 'scope');
      if (scope === 'ticket') return list.filter((t) => t.id === val(d, '[name=ticket]'));
      if (scope === 'session') return list.filter((t) => t.sessionId === val(d, '[name=session]'));
      return list;
    };
    const check = (d) => {
      const tickets = chosen(d);
      const mode = radio(d, 'refund');
      const left = leftOn(tickets);
      if (mode === 'none') return { tickets, amount: 0, left, ok: true };
      const amount = mode === 'full' ? left : parseAmount(val(d, '[name=amount]'));
      const can = Core.refundAllowed(App.role(), S().settings, { type: mode === 'full' ? 'full' : 'part', amount: amount || 0, refundable: left, sessions: sessionsOf(tickets), now: App.now() });
      return { tickets, amount, left, ok: can.ok, why: can.reason };
    };
    UI.dialog({
      title: `Cancel: ${b.ref}`, wide: true,
      body: `<div class="bd-form">
        <fieldset class="bd-fieldset"><legend>What to cancel</legend>
          ${rad('scope', 'ticket', 'One ticket', startScope === 'ticket')}
          <label class="field" data-show="ticket"><span>Ticket</span><select name="ticket">${UI.options(list.map((t) => ({ value: t.id, label: ticketText(b, t) })), o.ticketId || list[0].id)}</select></label>
          ${rad('scope', 'session', 'One session', false)}
          <label class="field" data-show="session"><span>Session</span><select name="session">${UI.options(sessions.map((x) => ({ value: x.id, label: UI.dateTime(x.start) })), sessions[0].id)}</select></label>
          ${rad('scope', 'all', 'The whole booking', startScope === 'all')}
          ${list.length < activeTickets(b).length ? '<p class="hint">Places already checked in are kept.</p>' : ''}
        </fieldset>
        <fieldset class="bd-fieldset"><legend>Refund</legend>
          ${rad('refund', 'none', 'Do not refund', true)}
          ${canRefund() ? rad('refund', 'full', 'Refund all that is left on these places', false) : ''}
          ${App.can('refund.partial') ? rad('refund', 'other', 'Refund a different amount', false) : ''}
          <label class="field" data-show-refund hidden><span>Amount to refund (£)</span><input type="text" inputmode="decimal" name="amount" autocomplete="off"></label>
        </fieldset>
        <div class="bd-live" data-live aria-live="polite"></div>
        <label class="field"><span>Reason (required)</span><textarea name="reason" rows="2"></textarea></label>
        ${open.length ? `<label class="field"><span>Request this answers</span><select name="request"><option value="">None</option>${UI.options(open.map((r) => ({ value: r.id, label: r.note })), o.requestId || '')}</select></label>` : ''}
        ${codeTick(b)}
        ${UI.demo('The customer would be told by email and any refund would go back to the original payment. Neither is real here.')}
      </div>`,
      onOpen: (d) => {
        const refresh = () => {
          const scope = radio(d, 'scope');
          d.querySelectorAll('[data-show]').forEach((el) => { el.hidden = el.dataset.show !== scope; });
          d.querySelector('[data-show-refund]').hidden = radio(d, 'refund') !== 'other';
          const c = check(d);
          let html = `<p>${plural(c.tickets.length, 'place')} chosen, ${UI.money(c.left)} left to refund on them.</p><p>${policyLine(sessionsOf(c.tickets), 'refund')}</p>`;
          if (b.kind === 'block' && c.left > 0) html += `<p class="hint">Suggested for a block: ${esc(shareText(b, c.tickets))}. That comes to ${UI.money(suggestedAmount(b, c.tickets))}.</p>`;
          if (!c.ok) html += `<p class="bd-warn">${esc(c.why)} You can still cancel without a refund.</p>`;
          d.querySelector('[data-live]').innerHTML = html;
        };
        d.querySelector('.bd-form').addEventListener('change', refresh);
        d.querySelector('[name=amount]').addEventListener('input', refresh);
        refresh();
      },
      actions: [{ label: 'Keep the booking', kind: 'ghost' }, {
        label: 'Cancel these places', kind: 'danger', onClick: (d) => {
          if (!allowed(b, 'bookings.cancel')) return undefined;
          const c = check(d);
          const reason = val(d, '[name=reason]');
          const mode = radio(d, 'refund');
          if (!c.tickets.length) { UI.dialogError(d, 'Choose what to cancel.'); return false; }
          if (!reason) { UI.dialogError(d, 'A reason is needed.'); return false; }
          if (mode !== 'none' && !canRefund()) { UI.dialogError(d, 'Your role cannot give refunds.'); return false; }
          if (mode === 'other' && !App.can('refund.partial')) { UI.dialogError(d, 'Your role cannot give part refunds.'); return false; }
          if (mode === 'other' && !(c.amount > 0)) { UI.dialogError(d, 'Enter an amount above £0, such as 12.50.'); return false; }
          if (mode !== 'none' && !c.ok) { UI.dialogError(d, c.why); return false; }
          const now = App.now();
          const ids = c.tickets.map((t) => t.id);
          let refunded = 0;
          if (mode !== 'none' && c.amount > 0) {
            const paid = Core.refund(S(), b, { ticketIds: ids, amount: c.amount, reason, by: by(), freePlaces: false, now });
            if (!paid.ok) { UI.dialogError(d, paid.reason); return false; }
            refunded = paid.amount;
            if (!Core.policyFor(S().settings, sessionsOf(c.tickets), now).refundInside) App.log('Override', `${b.ref}: refund outside the policy. Reason: ${reason}`);
          }
          const n = Core.cancelTickets(S(), b, { ticketIds: ids, reason, by: by(), now });
          const reqId = val(d, '[name=request]');
          const req = reqId ? b.requests.find((r) => r.id === reqId) : null;
          if (req && req.status === 'Open') { req.status = 'Done'; req.closedBy = by(); req.closedAt = Core.toLocalISO(now); req.outcome = `${plural(n, 'place')} cancelled.`; }
          applyCodeReturn(d, b);
          Core.logBooking(b, now, by(), 'Customer told by email (demo).');
          App.log('Cancellation', `${b.ref}: ${plural(n, 'place')} cancelled, ${refunded > 0 ? `${UI.money(refunded)} refunded` : 'no refund'}. Reason: ${reason}`);
          klaviyo(b, Core.bookingStatus(b) === 'Cancelled' ? 'Booking cancelled' : 'Booking changed');
          finish(`${plural(n, 'place')} cancelled.`);
          return undefined;
        }
      }]
    });
  }

  /* ---------- Dialog: refund ---------- */
  function refund(b, ticketId) {
    if (!allowed(b, ['refund.full', 'refund.partial'])) return;
    const list = refundableTickets(b);
    if (!list.length) { UI.toast('There is nothing left to refund on these tickets.', 'bad'); return; }
    const canPart = App.can('refund.partial');
    const start = ticketId ? 'tickets' : 'full';
    const rad = (value, text, checked, disabled) => `<label class="check"><input type="radio" name="mode" value="${value}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}><span>${text}</span></label>`;
    const ticks = list.map((t) => `<label class="check"><input type="checkbox" name="tk" value="${esc(t.id)}"${!ticketId || t.id === ticketId ? ' checked' : ''}><span>${esc(ticketText(b, t))} · ${UI.money(Core.ticketRefundable(t))} left${t.status !== 'active' ? ' · cancelled' : ''}</span></label>`).join('');
    const chosen = (d) => {
      if (radio(d, 'mode') === 'full') return list;
      const ids = [...d.querySelectorAll('[name=tk]:checked')].map((x) => x.value);
      return list.filter((t) => ids.includes(t.id));
    };
    const check = (d) => {
      const mode = radio(d, 'mode');
      const tickets = chosen(d);
      const amount = mode === 'part' ? parseAmount(val(d, '[name=amount]')) : leftOn(tickets);
      const can = Core.refundAllowed(App.role(), S().settings, { type: mode === 'part' ? 'part' : 'full', amount: amount || 0, refundable: leftOn(tickets), sessions: sessionsOf(tickets), now: App.now() });
      return { mode, tickets, amount, ok: can.ok, why: can.reason };
    };
    UI.dialog({
      title: `Refund: ${b.ref}`, wide: true,
      body: `<div class="bd-form">
        <fieldset class="bd-fieldset"><legend>Type of refund</legend>
          ${rad('full', `Full: all that is left, ${UI.money(leftOn(list))}`, start === 'full')}
          ${rad('tickets', 'Per ticket: all that is left on the tickets you choose', start === 'tickets')}
          ${rad('part', 'Part: an amount you choose', false, !canPart)}
          ${canPart ? '' : '<p class="hint">Front of house gives full refunds inside the policy. Ask a club manager for a part refund.</p>'}
        </fieldset>
        <fieldset class="bd-fieldset" data-ticks hidden><legend>Tickets</legend>${ticks}</fieldset>
        <div data-part hidden>
          <label class="field"><span>Amount to refund (£)</span><input type="text" inputmode="decimal" name="amount" autocomplete="off"></label>
          ${b.kind === 'block' ? '<p class="row"><span class="hint" data-suggest></span> <button type="button" class="btn btn-small" data-use>Use suggested amount</button></p>' : ''}
        </div>
        <div class="bd-live" data-live aria-live="polite"></div>
        <label class="field"><span>Reason (required)</span><textarea name="reason" rows="2"></textarea></label>
        <label class="check"><input type="checkbox" name="free"><span>Also cancel these places and free them up</span></label>
        ${codeTick(b)}
        ${UI.demo('The refund would go back to the original payment through the payment provider. No money moves here.')}
      </div>`,
      onOpen: (d) => {
        const refresh = () => {
          const c = check(d);
          d.querySelector('[data-ticks]').hidden = c.mode === 'full';
          d.querySelector('[data-part]').hidden = c.mode !== 'part';
          const hint = d.querySelector('[data-suggest]');
          if (hint) hint.textContent = c.tickets.length ? `Suggested: ${shareText(b, c.tickets)}. For the tickets chosen: ${UI.money(suggestedAmount(b, c.tickets))}.` : 'Choose a ticket to see the suggested amount.';
          let html = `<p>${policyLine(sessionsOf(c.tickets), 'refund')}</p>`;
          html += `<p><b>This refund: ${c.amount > 0 ? UI.money(c.amount) : 'enter an amount'}</b></p>`;
          if (!c.ok) html += `<p class="bd-warn">${esc(c.why)}</p>`;
          d.querySelector('[data-live]').innerHTML = html;
        };
        d.querySelector('.bd-form').addEventListener('change', refresh);
        d.querySelector('[name=amount]').addEventListener('input', refresh);
        const use = d.querySelector('[data-use]');
        if (use) use.addEventListener('click', () => { d.querySelector('[name=amount]').value = suggestedAmount(b, chosen(d)).toFixed(2); refresh(); });
        refresh();
      },
      actions: [{ label: 'Keep as it is', kind: 'ghost' }, {
        label: 'Give refund', kind: 'danger', onClick: (d) => {
          if (!allowed(b, ['refund.full', 'refund.partial'])) return undefined;
          const c = check(d);
          const reason = val(d, '[name=reason]');
          if (!c.tickets.length) { UI.dialogError(d, 'Choose at least one ticket.'); return false; }
          if (c.mode === 'part' && !canPart) { UI.dialogError(d, 'Your role cannot give part refunds.'); return false; }
          if (!(c.amount > 0)) { UI.dialogError(d, 'Enter an amount above £0, such as 12.50.'); return false; }
          if (!reason) { UI.dialogError(d, 'A reason is needed.'); return false; }
          if (!c.ok) { UI.dialogError(d, c.why); return false; }
          const now = App.now();
          const ids = c.tickets.map((t) => t.id);
          const paid = Core.refund(S(), b, { ticketIds: ids, amount: c.amount, reason, by: by(), freePlaces: false, now });
          if (!paid.ok) { UI.dialogError(d, paid.reason); return false; }
          if (!Core.policyFor(S().settings, sessionsOf(c.tickets), now).refundInside) App.log('Override', `${b.ref}: refund outside the policy. Reason: ${reason}`);
          if (d.querySelector('[name=free]').checked) {
            const open = c.tickets.filter((t) => t.status === 'active' && !t.checkedInAt).map((t) => t.id);
            if (open.length) Core.cancelTickets(S(), b, { ticketIds: open, reason, by: by(), now });
          }
          applyCodeReturn(d, b);
          klaviyo(b, Core.bookingStatus(b) === 'Cancelled' ? 'Booking cancelled' : 'Booking changed');
          finish(`Refund of ${UI.money(paid.amount)} recorded.`);
          return undefined;
        }
      }]
    });
  }

  function refundAddOn(b, lineId) {
    if (!allowed(b, ['refund.full', 'refund.partial'])) return;
    const line = (b.addOns || []).find((x) => x.id === lineId && x.status === 'active');
    if (!line) { UI.toast('This add-on cannot be refunded.', 'bad'); return; }
    const sessions = policySessions(b);
    const can = Core.refundAllowed(App.role(), S().settings, { type: 'full', amount: line.paid, sessions, now: App.now() });
    UI.dialog({
      title: `Refund add-on: ${line.name}`,
      body: `<div class="bd-form"><p>${line.qty} × ${esc(line.name)}, ${UI.money(line.paid)}. Add-ons are refunded apart from tickets.</p>
        <p>${policyLine(sessions, 'refund')}</p>${can.ok ? '' : `<p class="bd-warn">${esc(can.reason)}</p>`}
        <label class="field"><span>Reason (required)</span><textarea name="reason" rows="2"></textarea></label>
        ${UI.demo('The refund would go back to the original payment. No money moves here.')}</div>`,
      actions: [{ label: 'Keep as it is', kind: 'ghost' }, {
        label: 'Refund add-on', kind: 'danger', onClick: (d) => {
          if (!allowed(b, ['refund.full', 'refund.partial'])) return undefined;
          const reason = val(d, '[name=reason]');
          const now = App.now();
          const again = Core.refundAllowed(App.role(), S().settings, { type: 'full', amount: line.paid, sessions, now });
          if (!again.ok) { UI.dialogError(d, again.reason); return false; }
          if (!reason) { UI.dialogError(d, 'A reason is needed.'); return false; }
          const res = Core.refundAddOn(S(), b, line.id, { reason, by: by(), now });
          if (!res.ok) { UI.dialogError(d, res.reason); return false; }
          if (!Core.policyFor(S().settings, sessions, now).refundInside) App.log('Override', `${b.ref}: add-on refund outside the policy. Reason: ${reason}`);
          klaviyo(b, 'Booking changed');
          finish(`Add-on refund of ${UI.money(res.amount)} recorded.`);
          return undefined;
        }
      }]
    });
  }

  /* ---------- Dialogs: requests, resend, note ---------- */
  function logRequest(b) {
    if (!allowed(b, 'bookings.cancel')) return;
    UI.dialog({
      title: 'Log a cancellation request received by email',
      body: `<div class="bd-form"><p class="hint">Customers cannot cancel on their own. They email the team, and staff record the request here so nothing is lost. This does not cancel anything yet.</p>
        <label class="field"><span>What did they ask for? (required)</span><textarea name="note" rows="3"></textarea></label></div>`,
      actions: [{ label: 'Keep as it is', kind: 'ghost' }, {
        label: 'Log request', kind: 'primary', onClick: (d) => {
          if (!allowed(b, 'bookings.cancel')) return undefined;
          const note = val(d, '[name=note]');
          if (!note) { UI.dialogError(d, 'Say what the customer asked for.'); return false; }
          const now = App.now();
          b.requests.push({ id: Core.nextId(S(), 'rq'), at: Core.toLocalISO(now), by: by(), source: 'Email', note, status: 'Open' });
          Core.logBooking(b, now, by(), 'Cancellation request logged from an email.');
          finish('Request logged.');
          return undefined;
        }
      }]
    });
  }
  function resolveRequest(b, id) {
    if (!allowed(b, 'bookings.cancel')) return;
    const r = b.requests.find((x) => x.id === id && x.status === 'Open');
    if (!r) return;
    UI.dialog({
      title: 'Resolve this request',
      body: `<div class="bd-form"><p>${esc(r.note)}</p>
        <fieldset class="bd-fieldset"><legend>Outcome</legend>
          <label class="check"><input type="radio" name="outcome" value="Done" checked><span>Done: we have dealt with it</span></label>
          <label class="check"><input type="radio" name="outcome" value="Declined"><span>Declined: we will not do this</span></label>
        </fieldset>
        <label class="field"><span>What happened? (required)</span><textarea name="note" rows="2"></textarea></label>
        <p class="hint">To cancel places as well, use "Cancel places" on the request instead. It closes the request for you.</p></div>`,
      actions: [{ label: 'Keep open', kind: 'ghost' }, {
        label: 'Resolve', kind: 'primary', onClick: (d) => {
          if (!allowed(b, 'bookings.cancel')) return undefined;
          const note = val(d, '[name=note]');
          if (!note) { UI.dialogError(d, 'Say what happened.'); return false; }
          const now = App.now();
          r.status = radio(d, 'outcome'); r.closedBy = by(); r.closedAt = Core.toLocalISO(now); r.outcome = note;
          Core.logBooking(b, now, by(), `Request resolved (${r.status}): ${note}`);
          finish('Request resolved.');
          return undefined;
        }
      }]
    });
  }
  function resend(b) {
    if (!allowed(b, 'bookings.modify')) return;
    UI.dialog({
      title: 'Resend confirmation',
      body: `<p>Send the booking confirmation again to <b>${esc(b.customer.email)}</b>.</p>${UI.demo('The booking system would send this email itself. Nothing is sent here.')}`,
      actions: [{ label: 'Keep as it is', kind: 'ghost' }, {
        label: 'Resend', kind: 'primary', onClick: () => {
          if (!allowed(b, 'bookings.modify')) return undefined;
          Core.logBooking(b, App.now(), by(), `Confirmation resent to ${b.customer.email} (demo).`);
          finish('Confirmation resent (demo).');
          return undefined;
        }
      }]
    });
  }
  function addNote(b) {
    if (!allowed(b, 'bookings.modify')) return;
    UI.dialog({
      title: 'Add note',
      body: '<div class="bd-form"><label class="field"><span>Note (staff only)</span><textarea name="note" rows="3"></textarea></label></div>',
      actions: [{ label: 'Keep as it is', kind: 'ghost' }, {
        label: 'Add note', kind: 'primary', onClick: (d) => {
          if (!allowed(b, 'bookings.modify')) return undefined;
          const text = val(d, '[name=note]');
          if (!text) { UI.dialogError(d, 'Write the note first.'); return false; }
          const now = App.now();
          b.notes = b.notes || [];
          b.notes.unshift({ id: Core.nextId(S(), 'n'), at: Core.toLocalISO(now), by: by(), text });
          Core.logBooking(b, now, by(), 'Note added.');
          finish('Note added.');
          return undefined;
        }
      }]
    });
  }

  /* ---------- The page ---------- */
  const card = (title, inner, cls) => `<section class="card ${cls || ''}"><h2>${esc(title)}</h2>${inner}</section>`;
  const dl = (rows) => `<dl class="bd-dl">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const smallBtn = (act, id, text, label, kind) => `<button type="button" class="btn btn-small ${kind || ''}" data-act="${act}" data-id="${esc(id)}" aria-label="${esc(label)}">${esc(text)}</button>`;

  function ticketsCard(b) {
    const blocks = b.people.map((p) => {
      const rows = b.tickets.filter((t) => t.personId === p.id);
      if (!rows.length) return '';
      const miss = Core.personMissing(bookingEvent(b), p);
      const table = UI.table([
        { label: 'Session', html: (t) => { const f = sessionOf(t); return `${esc(whenOf(t))}${f && f.event.id !== b.eventId ? `<div class="hint">${esc(f.event.title)}</div>` : ''}`; } },
        { label: 'Status', html: (t) => (t.status !== 'active' ? UI.badge('Cancelled', 'bad') : t.checkedInAt ? UI.badge('Checked in', 'good') : UI.badge('Booked', 'info')) },
        { label: 'Paid', html: (t) => UI.money(t.paid) },
        { label: 'Refunded', html: (t) => (t.refunded > 0 ? UI.money(t.refunded) : '<span class="muted">None</span>') },
        { label: 'Actions', html: (t) => {
          const open = t.status === 'active' && !t.checkedInAt;
          const when = whenOf(t);
          const btns = [
            open && App.can('bookings.transfer') ? smallBtn('transfer', t.id, 'Transfer', `Transfer ${when}`) : '',
            open && App.can('bookings.cancel') ? smallBtn('cancel', t.id, 'Cancel', `Cancel ${when}`) : '',
            Core.ticketRefundable(t) > 0 && canRefund() ? smallBtn('refund', t.id, 'Refund', `Refund ${when}`) : ''
          ].join(' ');
          return btns.trim() ? `<div class="bd-btns">${btns}</div>` : '<span class="muted">None</span>';
        } }
      ], rows);
      return `<div class="bd-person"><h3>${esc(Core.personName(b, p))}${p.isLead ? ' <span class="muted">(lead booker)</span>' : ''} ${miss.length ? UI.badge('Details missing', 'warn') : UI.badge('Details complete', 'good')}</h3>${table}</div>`;
    }).join('');
    return card('Tickets', blocks || UI.empty('No tickets on this booking.'));
  }
  function atBookingCard(b, event) {
    const a = b.atBooking;
    const type = b.ticketTypeId ? event.tickets.find((t) => t.id === b.ticketTypeId) : null;
    const rows = [['Ticket', esc(b.kind === 'block' ? 'Block' : type ? `Drop-in, ${type.name}` : 'Drop-in')]];
    if (a) {
      rows.push(['Member when booked', a.isMember ? 'Yes' : 'No'], ['Price for one', UI.money(a.unitPrice)], ['Member price for one', UI.money(a.memberUnitPrice)]);
    }
    if (b.pricing) {
      if (b.pricing.memberDiscount > 0) rows.push(['Member saving', UI.money(b.pricing.memberDiscount)]);
      if (b.pricing.codeDiscount > 0) rows.push(['Code saving', UI.money(b.pricing.codeDiscount)]);
    }
    const code = b.codeId ? Core.findCode(S(), b.codeId) : null;
    if (code) rows.push(['Code', `${esc(code.code)}${b.codeReleased ? ' (returned by staff)' : ''}`]);
    if (a) rows.push(['Total at booking', `<b>${UI.money(a.total)}</b>`]);
    if (b.compReason) rows.push(['Free place reason', esc(b.compReason)]);
    return card('What they paid at booking', `${dl(rows)}<p class="hint">Kept as it was on the day. Later price or membership changes do not alter this booking.</p>`);
  }
  function paymentSummary(b) {
    const addOns = b.addOns || [];
    const paid = Core.paidTotal(b), refunded = Core.refundedTotal(b);
    const addPaid = sum(addOns, (x) => x.paid), addRefunded = sum(addOns, (x) => x.refunded);
    const net = r2(paid + addPaid - refunded - addRefunded);
    const stat = (label, n) => `<div class="stat"><b>${UI.money(n)}</b><span>${esc(label)}</span></div>`;
    const first = b.payments.find((x) => x.type === 'Payment');
    return card('Payment summary', `<div class="grid bd-stats">${stat('Tickets paid', paid)}${stat('Add-ons paid', addPaid)}${stat('Refunded', r2(refunded + addRefunded))}${stat('Kept after refunds', net)}</div>
      <p class="hint">Paid by ${esc(first ? first.method : 'no payment')}. The admin never stores card details.</p>`);
  }
  function addOnsCard(b) {
    const list = b.addOns || [];
    if (!list.length) return card('Add-ons', '<p class="muted">No add-ons on this booking.</p>');
    return card('Add-ons', UI.table([
      { label: 'Add-on', html: (x) => `${x.qty} × ${esc(x.name)}` },
      { label: 'Paid', html: (x) => UI.money(x.paid) },
      { label: 'Status', html: (x) => (x.status === 'active' ? UI.badge('Paid', 'good') : UI.badge('Refunded', 'quiet')) },
      { label: 'Actions', html: (x) => (x.status === 'active' && canRefund() ? smallBtn('refundAddOn', x.id, 'Refund', `Refund ${x.name}`) : '<span class="muted">None</span>') }
    ], list));
  }
  function guestsCard(b, event) {
    const rule = { lead: 'Lead booker only', name: 'Name for each guest', nameEmail: 'Name and email for each guest' }[event.guestDetails] || '';
    return card('Guest details', `${UI.table([
      { label: 'Person', html: (p) => `${esc(Core.personName(b, p))}${p.isLead ? ' <span class="muted">(lead)</span>' : ''}` },
      { label: 'Email', html: (p) => (p.email ? `<span class="bd-wrap">${esc(p.email)}</span>` : '<span class="muted">Not given</span>') },
      { label: 'Marketing consent', html: (p) => (p.marketingConsent ? UI.badge('Agreed', 'good') : UI.badge('Not subscribed', 'quiet')) },
      { label: 'Missing', html: (p) => { const m = Core.personMissing(event, p); return m.length ? esc(m.join(', ')) : '<span class="muted">Nothing</span>'; } }
    ], b.people)}<p class="hint">This event collects: ${esc(rule)}. Consent is kept for each person. The lead booker cannot agree for a guest.</p>`);
  }
  function answersCard(b, event) {
    const qs = event.questions || [];
    if (!qs.length) return '';
    const rows = [];
    qs.forEach((q) => b.people.forEach((p) => { if (questionsFor(event, p).includes(q)) rows.push({ q, p }); }));
    return card('Custom answers', `${UI.table([
      { label: 'Question', html: (x) => esc(x.q.label) },
      { label: 'Person', html: (x) => esc(Core.personName(b, x.p)) },
      { label: 'Answer', html: (x) => { const v = (x.p.answers || {})[x.q.id]; return v ? `<span class="bd-wrap">${esc(v)}</span>` : `<span class="muted">${x.q.required ? 'Missing' : 'No answer'}</span>`; } }
    ], rows)}<p class="hint">Answers can be sensitive. They are not sent to Klaviyo.</p>`);
  }
  function paymentsCard(b) {
    const isOut = (x) => x.type === 'Refund';
    const rows = b.payments.slice().sort((x, y) => String(y.at).localeCompare(String(x.at)));
    return card('Payments', UI.table([
      { label: 'When', html: (x) => esc(UI.dateTime(x.at)) },
      { label: 'Type', html: (x) => UI.badge(x.type, isOut(x) ? 'warn' : 'quiet') },
      { label: 'Amount', html: (x) => `${isOut(x) ? '−' : ''}${UI.money(x.amount)}` },
      { label: 'Method', html: (x) => esc(x.method) },
      { label: 'By', html: (x) => esc(x.by) },
      { label: 'Reason', html: (x) => esc(x.reason) || '<span class="muted">None</span>' }
    ], rows, { emptyText: 'No payments yet.' }));
  }
  function requestsCard(b) {
    const list = b.requests || [];
    const mayAct = App.can('bookings.cancel');
    const tone = { Open: 'warn', Done: 'good', Declined: 'quiet' };
    const body = list.length ? UI.table([
      { label: 'Received', html: (r) => `${esc(UI.dateTime(r.at))}<div class="hint">${esc(r.source)}, logged by ${esc(r.by)}</div>` },
      { label: 'Request', html: (r) => `<span class="bd-wrap">${esc(r.note)}</span>${r.outcome ? `<div class="hint">Outcome: ${esc(r.outcome)}</div>` : ''}` },
      { label: 'Status', html: (r) => `${UI.badge(r.status, tone[r.status] || 'quiet')}${r.closedBy ? `<div class="hint">By ${esc(r.closedBy)}</div>` : ''}` },
      { label: 'Actions', html: (r) => (r.status === 'Open' && mayAct
        ? `<div class="bd-btns">${openTickets(b).length ? smallBtn('cancelFromRequest', r.id, 'Cancel places', 'Cancel places for this request') : ''} ${smallBtn('resolve', r.id, 'Resolve', 'Resolve this request')}</div>`
        : '<span class="muted">None</span>') }
    ], list) : '<p class="muted">No requests logged.</p>';
    return card('Requests', `${body}<p class="hint">Customers cannot cancel on their own. They email the team, and staff log it here.</p>${mayAct ? '<button type="button" class="btn btn-small" data-act="logRequest">Log a cancellation request received by email</button>' : ''}`);
  }
  function notesCard(b) {
    const notes = b.notes || [];
    return card('Notes', notes.length
      ? `<ul class="bd-list">${notes.map((n) => `<li><span class="bd-wrap">${esc(n.text)}</span><div class="hint">${esc(UI.dateTime(n.at))}, ${esc(n.by)}</div></li>`).join('')}</ul>`
      : '<p class="muted">No notes yet.</p>');
  }
  function timelineCard(b) {
    const rows = b.timeline.slice().sort((x, y) => String(y.at).localeCompare(String(x.at)));
    return card('Timeline', rows.length
      ? `<ul class="bd-list">${rows.map((x) => `<li><span class="bd-wrap">${esc(x.text)}</span><div class="hint">${esc(UI.dateTime(x.at))}, ${esc(x.by)}</div></li>`).join('')}</ul>`
      : '<p class="muted">Nothing yet.</p>');
  }
  function policyCard(b) {
    const sessions = policySessions(b);
    return card('Policy check', `<p>${policyLine(sessions, 'refund')}</p><p>${policyLine(sessions, 'transfer')}</p><p class="hint">Set in Settings, so every club gives the same answer. Based on the next session still to come.</p>`);
  }

  const ACTIONS = {
    edit: (b) => editDetails(b),
    transfer: (b, id) => transfer(b, id),
    cancel: (b, id) => cancel(b, { ticketId: id }),
    cancelFromRequest: (b, id) => cancel(b, { requestId: id }),
    refund: (b, id) => refund(b, id),
    refundAddOn: (b, id) => refundAddOn(b, id),
    logRequest: (b) => logRequest(b),
    resolve: (b, id) => resolveRequest(b, id),
    resend: (b) => resend(b),
    note: (b) => addNote(b)
  };

  function render(mainEl, bookingId) {
    const back = '<p><a href="#/bookings">Back to Bookings</a></p>';
    const b = Core.findBooking(S(), bookingId);
    if (!canSee(b)) {
      mainEl.innerHTML = `${back}${UI.empty('This booking was not found in the venue you are viewing.')}`;
      return;
    }
    const event = bookingEvent(b);
    const venue = Core.findVenue(S(), event.venueId);
    const status = Core.bookingStatus(b);
    const c = b.customer;
    const top = [
      App.can('bookings.modify') ? '<button type="button" class="btn" data-act="edit">Edit guest details</button>' : '',
      App.can('bookings.transfer') && openTickets(b).length ? '<button type="button" class="btn" data-act="transfer">Transfer</button>' : '',
      App.can('bookings.cancel') && openTickets(b).length ? '<button type="button" class="btn" data-act="cancel">Cancel</button>' : '',
      canRefund() && refundableTickets(b).length ? '<button type="button" class="btn" data-act="refund">Refund</button>' : '',
      App.can('bookings.modify') && status !== 'Cancelled' ? '<button type="button" class="btn" data-act="resend">Resend confirmation</button>' : '',
      App.can('bookings.modify') ? '<button type="button" class="btn" data-act="note">Add note</button>' : ''
    ].join('');
    const root = document.createElement('div');
    root.className = 'bd';
    root.innerHTML = `${back}${UI.pageHead(`Booking ${b.ref}`, '', `${event.title} · ${venue ? venue.name : 'Unknown venue'}. See everything about this booking, and change, transfer, cancel or refund it.`)}
      <p class="row bd-badges">${UI.badge(status, status === 'Cancelled' ? 'bad' : 'good')} ${UI.badge(Core.paymentStatus(b), 'info')} ${UI.badge(b.source || 'Online', 'quiet')} ${UI.badge(event.format, 'quiet')}</p>
      <div class="bd-actions" role="group" aria-label="Booking actions">${top}</div>
      <div class="bd-cols">
        <div class="bd-col">
          ${paymentSummary(b)}
          ${ticketsCard(b)}
          ${addOnsCard(b)}
          ${guestsCard(b, event)}
          ${answersCard(b, event)}
          ${paymentsCard(b)}
          ${requestsCard(b)}
        </div>
        <div class="bd-col">
          ${card('Lead booker', dl([['Name', esc(c.name)], ['Email', `<span class="bd-wrap">${esc(c.email)}</span>`], ['Phone', esc(c.phone) || '<span class="muted">Not given</span>'], ['Member now', c.isMember ? 'Yes' : 'No'], ['Booked', esc(UI.dateTime(b.createdAt))], ['Came from', esc(b.channel || 'Website')]]))}
          ${policyCard(b)}
          ${atBookingCard(b, event)}
          ${notesCard(b)}
          ${timelineCard(b)}
        </div>
      </div>`;
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (btn && ACTIONS[btn.dataset.act]) ACTIONS[btn.dataset.act](b, btn.dataset.id);
    });
    mainEl.appendChild(root);
  }

  window.BookingDetail = { render };
})();
