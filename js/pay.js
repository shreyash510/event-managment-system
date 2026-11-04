/* Payments, as a checkout screen only. No money moves and nothing is sent anywhere: this shows how paying,
   refunding and a payment link will look and behave, so the flow can be agreed before a provider is chosen.
   Pay.checkout({ amount, currency, description, email, lines: [{ label, amount }], onSuccess(receipt), onCancel })
   Pay.refund({ amount, last4, brand, reason, onDone(refund) })
   Pay.link({ amount, email, description, onPaid(receipt), onCancel })
   A receipt only ever holds the card brand and last 4 digits. The full number and the security code are read once,
   checked, and cleared from the screen; they are never saved, logged or put in the receipt. */
(function () {
  'use strict';
  const esc = (v) => UI.esc(v);
  const money = (n) => UI.money(n);
  const svg = (d, size) => `<svg viewBox="0 0 24 24" width="${size || 18}" height="${size || 18}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
  const LOCK = svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
  const TICK = svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 28);
  const REFUND = svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-4"/>');
  const LINK = svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>');
  /* The test cards from the hint. Any other card that passes the checks succeeds. */
  const TEST_FAIL = { '4000000000000002': 'Your card was declined. You have not been charged. Try another card.', '4000000000009995': 'Your card has insufficient funds. You have not been charged. Try another card.' };
  const COUNTRIES = ['United Kingdom', 'Ireland', 'United States', 'India', 'Other'];

  const rid = (prefix) => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < 24; i++) s += c[Math.floor(Math.random() * c.length)]; return `${prefix}_${s}`; };
  const digitsOf = (v) => String(v || '').replace(/\D/g, '');
  const brandOf = (d) => (/^3[47]/.test(d) ? 'Amex' : /^(5[1-5]|2[2-7])/.test(d) ? 'Mastercard' : /^4/.test(d) ? 'Visa' : '');
  const luhn = (d) => { let sum = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = Number(d[i]); if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; } return d.length > 0 && sum % 10 === 0; };
  /* Amex is grouped 4-6-5; every other card in fours. */
  const formatNumber = (d) => (brandOf(d) === 'Amex' ? [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)] : d.slice(0, 19).match(/.{1,4}/g) || []).filter(Boolean).join(' ');
  const cardLabel = (brand, last4) => (last4 ? `${brand || 'Card'} •••• ${last4}` : 'the original payment method');

  /* A checkout-sized modal. UI.modal gives the header, X and Esc; this only narrows it. */
  function open(title, subtitle, icon, onCancel) {
    const m = UI.modal({ title, subtitle, icon, onCancel });
    m.dialog.classList.add('pay-dialog');
    return m;
  }
  const spinner = (text) => `<div class="pay-busy" role="status"><span class="pay-spin" aria-hidden="true"></span><span>${esc(text)}</span></div>`;

  /* ---------- Checkout ---------- */
  function checkout(o) {
    const amount = Core.round2(Number(o.amount) || 0);
    /* Nothing to pay: carry on without a payment screen. */
    if (amount <= 0) { if (o.onSuccess) o.onSuccess({ id: null, method: 'No payment', amount: 0 }); return null; }
    let busy = false, finished = false;
    const m = open('Secure checkout', o.description || '', LOCK, () => { if (!busy) end(false); });
    function end(ok, receipt) {
      if (finished) return;
      finished = true;
      m.close();
      if (ok) { if (o.onSuccess) o.onSuccess(receipt); } else if (o.onCancel) o.onCancel();
    }
    const lines = (o.lines && o.lines.length ? o.lines : [{ label: o.description || 'Total', amount }]);
    const f = (id, label, control, hint) => `<div class="field pay-field"><span><label for="${id}">${esc(label)}</label></span>${control}<small class="pay-err" id="${id}-err" aria-live="polite"></small>${hint || ''}</div>`;
    m.body.innerHTML = `<div class="pay">
      <p class="pay-test"><span class="pay-test-badge">Test mode</span><span>No real payment is taken. A Stripe-style demo checkout.</span></p>
      <section class="pay-summary" aria-label="Order summary">
        ${lines.map((l) => `<div class="pay-line"><span>${esc(l.label)}</span><span>${l.amount < 0 ? '−' : ''}${esc(money(Math.abs(l.amount)))}</span></div>`).join('')}
        <div class="pay-line pay-total"><span>Total to pay</span><b>${esc(money(amount))}</b></div>
      </section>
      <div class="pay-wallets">
        <button type="button" class="pay-wallet pay-apple" data-wallet="Apple Pay" aria-label="Pay ${esc(money(amount))} with Apple Pay (demo)"><span aria-hidden="true">&#63743;</span> Pay</button>
        <button type="button" class="pay-wallet pay-google" data-wallet="Google Pay" aria-label="Pay ${esc(money(amount))} with Google Pay (demo)"><b aria-hidden="true">G</b> Pay</button>
      </div>
      <div class="pay-or"><span>or pay with card</span></div>
      <form class="pay-form" novalidate>
        ${f('pay-email', 'Email', `<input id="pay-email" type="email" autocomplete="email" value="${esc(o.email || '')}" aria-describedby="pay-email-err">`)}
        <fieldset class="pay-cardset"><legend>Card information</legend>
          <div class="pay-num"><label class="sr-only" for="pay-number">Card number</label><input id="pay-number" type="text" inputmode="numeric" autocomplete="cc-number" placeholder="1234 1234 1234 1234" maxlength="23" aria-describedby="pay-number-err pay-cardset-err"><span class="pay-brand" id="pay-brand" aria-live="polite"></span></div>
          <div class="pay-row">
            <div><label class="sr-only" for="pay-exp">Expiry date, month and year</label><input id="pay-exp" type="text" inputmode="numeric" autocomplete="cc-exp" placeholder="MM / YY" maxlength="7" aria-describedby="pay-exp-err pay-cardset-err"></div>
            <div><label class="sr-only" for="pay-cvc">Security code</label><input id="pay-cvc" type="password" inputmode="numeric" autocomplete="cc-csc" placeholder="CVC" maxlength="4" aria-describedby="pay-cvc-err pay-cardset-err"></div>
          </div>
          <small class="pay-err" id="pay-number-err"></small><small class="pay-err" id="pay-exp-err"></small><small class="pay-err" id="pay-cvc-err"></small><span id="pay-cardset-err" hidden></span>
        </fieldset>
        ${f('pay-name', 'Name on card', '<input id="pay-name" type="text" autocomplete="cc-name" aria-describedby="pay-name-err">')}
        <div class="pay-row pay-addr">
          ${f('pay-country', 'Country', `<select id="pay-country" autocomplete="country-name">${UI.options(COUNTRIES.map((x) => ({ value: x, label: x })), 'United Kingdom')}</select>`)}
          ${f('pay-post', 'Postcode', '<input id="pay-post" type="text" autocomplete="postal-code" aria-describedby="pay-post-err">')}
        </div>
        <p class="form-error pay-decline" role="alert" hidden></p>
        <button type="submit" class="btn btn-primary pay-btn">${LOCK}<span>Pay ${esc(money(amount))}</span></button>
        <details class="pay-tests"><summary>Test cards</summary><ul>
          <li><code>4242 4242 4242 4242</code> succeeds</li>
          <li><code>4000 0000 0000 0002</code> is declined</li>
          <li><code>4000 0000 0000 9995</code> has insufficient funds</li>
          <li>Any future expiry date and any 3-digit CVC (4 for Amex).</li></ul></details>
      </form>
      <div class="pay-done" hidden></div>
    </div>`;
    const root = m.body.querySelector('.pay'), form = root.querySelector('.pay-form');
    const $ = (sel) => root.querySelector(sel);
    const num = $('#pay-number'), exp = $('#pay-exp'), cvc = $('#pay-cvc'), btn = $('.pay-btn'), decline = $('.pay-decline');
    const setErr = (input, text) => {
      const box = root.querySelector(`#${input.id}-err`);
      if (box) box.textContent = text || '';
      if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
      return !text;
    };
    /* Card number: groups as it is typed, and shows the brand. */
    num.addEventListener('input', () => {
      const d = digitsOf(num.value).slice(0, 19);
      num.value = formatNumber(d);
      $('#pay-brand').textContent = brandOf(d);
      cvc.maxLength = brandOf(d) === 'Amex' ? 4 : 3;
      if (num.getAttribute('aria-invalid')) checkNumber();
    });
    exp.addEventListener('input', () => {
      const d = digitsOf(exp.value).slice(0, 4);
      exp.value = d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d;
      if (exp.getAttribute('aria-invalid')) checkExp();
    });
    cvc.addEventListener('input', () => { cvc.value = digitsOf(cvc.value).slice(0, cvc.maxLength); });
    const checkEmail = () => setErr($('#pay-email'), /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('#pay-email').value.trim()) ? '' : 'Enter an email for the receipt.');
    const checkNumber = () => { const d = digitsOf(num.value); return setErr(num, d.length < 13 ? 'Enter the full card number.' : !luhn(d) ? 'This card number is not valid. Check the digits.' : ''); };
    const checkExp = () => {
      const d = digitsOf(exp.value), mm = Number(d.slice(0, 2)), yy = Number(d.slice(2, 4));
      if (d.length < 4 || mm < 1 || mm > 12) return setErr(exp, 'Enter the expiry as MM / YY.');
      const now = App.now();
      return setErr(exp, new Date(2000 + yy, mm, 1) <= new Date(now.getFullYear(), now.getMonth(), 1) ? 'This card has expired.' : '');
    };
    const checkCvc = () => { const need = brandOf(digitsOf(num.value)) === 'Amex' ? 4 : 3; return setErr(cvc, digitsOf(cvc.value).length === need ? '' : `Enter the ${need}-digit security code.`); };
    const checkName = () => setErr($('#pay-name'), $('#pay-name').value.trim() ? '' : 'Enter the name on the card.');
    const checkPost = () => setErr($('#pay-post'), $('#pay-post').value.trim().length >= 3 ? '' : 'Enter the postcode.');
    const CHECKS = [[$('#pay-email'), checkEmail], [num, checkNumber], [exp, checkExp], [cvc, checkCvc], [$('#pay-name'), checkName], [$('#pay-post'), checkPost]];
    /* Each field is checked when the person leaves it, not while they type. */
    CHECKS.forEach(([el, fn]) => el.addEventListener('blur', () => { if (el.value) fn(); }));

    const lockForm = (on) => { busy = on; form.querySelectorAll('input, select, button').forEach((x) => { x.disabled = on; }); root.querySelectorAll('[data-wallet]').forEach((x) => { x.disabled = on; }); };
    function success(receipt) {
      form.hidden = true;
      root.querySelector('.pay-wallets').hidden = true; root.querySelector('.pay-or').hidden = true;
      const done = $('.pay-done');
      done.hidden = false;
      done.innerHTML = `<div class="pay-ok" role="status"><span class="pay-tick">${TICK}</span><b>Payment successful</b>
        <span>${esc(money(amount))} paid with ${esc(receipt.wallet ? `${receipt.wallet} (${cardLabel(receipt.brand, receipt.last4)})` : cardLabel(receipt.brand, receipt.last4))}</span>
        <small class="muted">Receipt ${esc(receipt.id)}</small></div>
        <button type="button" class="btn btn-primary pay-btn" data-continue>Continue</button>`;
      busy = false;
      const go = done.querySelector('[data-continue]');
      go.addEventListener('click', () => end(true, receipt));
      go.focus();
    }
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      decline.hidden = true;
      const bad = CHECKS.filter(([, fn]) => !fn());
      if (bad.length) { bad[0][0].focus(); return; }
      const d = digitsOf(num.value), brand = brandOf(d) || 'Card', last4 = d.slice(-4), fail = TEST_FAIL[d];
      lockForm(true);
      btn.innerHTML = '<span class="pay-spin" aria-hidden="true"></span><span>Processing...</span>';
      setTimeout(() => {
        if (finished) return;
        lockForm(false);
        btn.innerHTML = `${LOCK}<span>Pay ${esc(money(amount))}</span>`;
        if (fail) {
          decline.textContent = fail; decline.hidden = false;
          num.setAttribute('aria-invalid', 'true'); num.focus(); num.select();
          return;
        }
        /* Only the brand and last 4 digits go further. The rest is wiped from the screen. */
        num.value = ''; cvc.value = ''; exp.value = '';
        success({ id: rid('pi'), method: 'Card', brand, last4, amount, email: $('#pay-email').value.trim(), at: Core.toLocalISO(App.now()) });
      }, 1200);
    });
    /* Wallets: a short pause, as if the phone sheet was confirmed. */
    root.querySelectorAll('[data-wallet]').forEach((b) => b.addEventListener('click', () => {
      const wallet = b.dataset.wallet;
      lockForm(true);
      const keep = b.innerHTML;
      b.innerHTML = '<span class="pay-spin" aria-hidden="true"></span>';
      setTimeout(() => {
        if (finished) return;
        b.innerHTML = keep; lockForm(false);
        success({ id: rid('pi'), method: wallet, wallet, brand: 'Visa', last4: String(1000 + Math.floor(Math.random() * 9000)), amount, email: $('#pay-email').value.trim(), at: Core.toLocalISO(App.now()) });
      }, 1200);
    }));
    ($('#pay-email').value ? num : $('#pay-email')).focus();
    return m.dialog;
  }

  /* ---------- Refund ---------- */
  function refund(o) {
    const amount = Core.round2(Number(o.amount) || 0);
    let finished = false, busy = true;
    const m = open('Refund', o.reason ? `Reason: ${o.reason}` : 'Back to the original payment', REFUND, () => { if (!busy) end(); });
    const result = { id: rid('re'), amount, brand: o.brand || null, last4: o.last4 || null, at: Core.toLocalISO(App.now()) };
    function end() { if (finished) return; finished = true; m.close(); if (o.onDone) o.onDone(result); }
    m.body.innerHTML = `<div class="pay"><p class="pay-test"><span class="pay-test-badge">Test mode</span><span>No real money is moved.</span></p>${spinner(`Sending ${money(amount)} back to ${cardLabel(o.brand, o.last4)}...`)}</div>`;
    setTimeout(() => {
      if (finished) return;
      busy = false;
      m.body.querySelector('.pay').innerHTML = `<p class="pay-test"><span class="pay-test-badge">Test mode</span><span>No real money is moved.</span></p>
        <div class="pay-ok" role="status"><span class="pay-tick">${TICK}</span><b>Refund sent</b>
        <span>Refund of ${esc(money(amount))} sent to ${esc(cardLabel(o.brand, o.last4))}. It usually arrives in 5–10 working days.</span>
        <small class="muted">Refund ${esc(result.id)}</small></div>
        <button type="button" class="btn btn-primary pay-btn" data-done>Done</button>`;
      const b = m.body.querySelector('[data-done]');
      b.addEventListener('click', end); b.focus();
    }, 1000);
    return m.dialog;
  }

  /* ---------- Payment link, for a booking taken by phone ---------- */
  function link(o) {
    const amount = Core.round2(Number(o.amount) || 0);
    let finished = false;
    const url = `https://pay.example.com/c/${rid('cs').slice(3, 19)}`;
    const m = open('Payment link sent', `${money(amount)} to ${o.email || 'the customer'}`, LINK, () => end(false));
    function end(paid) {
      if (finished) return;
      finished = true; m.close();
      if (paid) { if (o.onPaid) o.onPaid({ id: rid('pi'), method: 'Payment link', brand: null, last4: null, amount, at: Core.toLocalISO(App.now()) }); } else if (o.onCancel) o.onCancel();
    }
    m.body.innerHTML = `<div class="pay">
      <p class="pay-test"><span class="pay-test-badge">Test mode</span><span>No email is sent and the link does not work.</span></p>
      <p>We have emailed a secure payment link for <b>${esc(money(amount))}</b>${o.description ? ` (${esc(o.description)})` : ''} to <b>${esc(o.email || 'the customer')}</b>. The booking is made when they pay.</p>
      <div class="pay-link"><label class="sr-only" for="pay-link-url">Payment link</label><input id="pay-link-url" type="text" readonly value="${esc(url)}"><button type="button" class="btn" data-copy>Copy link</button></div>
      <p class="hint" data-copied role="status"></p>
      <div class="pay-actions">
        <button type="button" class="btn btn-ghost" data-wait>Close, still waiting</button>
        <button type="button" class="btn btn-primary" data-paid>Mark as paid (customer paid by link)</button>
      </div></div>`;
    const input = m.body.querySelector('#pay-link-url'), note = m.body.querySelector('[data-copied]');
    m.body.querySelector('[data-copy]').addEventListener('click', () => {
      const ok = () => { note.textContent = 'Link copied.'; };
      try { navigator.clipboard.writeText(url).then(ok, () => { input.select(); note.textContent = 'Press Ctrl+C to copy.'; }); } catch (e) { input.select(); note.textContent = 'Press Ctrl+C to copy.'; }
    });
    m.body.querySelector('[data-wait]').addEventListener('click', () => end(false));
    m.body.querySelector('[data-paid]').addEventListener('click', () => end(true));
    m.body.querySelector('[data-paid]').focus();
    return m.dialog;
  }

  /* The card on a booking, for refunds and receipts: brand and last 4 only. */
  const cardOf = (b) => {
    const p = (b.payments || []).find((x) => x.type === 'Payment' && (x.last4 || x.brand));
    return p ? { brand: p.brand || null, last4: p.last4 || null, method: p.method } : { brand: null, last4: null, method: ((b.payments || []).find((x) => x.type === 'Payment') || {}).method || '' };
  };
  /* Put a receipt on a booking's payment record. Nothing beyond brand, last 4 and the receipt id is kept. */
  const attach = (payment, receipt) => {
    if (!payment || !receipt) return;
    if (receipt.id) payment.receiptId = receipt.id;
    if (receipt.brand) payment.brand = receipt.brand;
    if (receipt.last4) payment.last4 = receipt.last4;
    if (receipt.wallet) payment.wallet = receipt.wallet;
  };
  const describe = (p) => {
    if (!p) return 'No payment';
    const card = p.last4 ? `${p.brand || 'Card'} •••• ${p.last4}` : '';
    return p.wallet ? `${p.wallet}${card ? ` (${card})` : ''}` : card ? `${p.method === 'Card' ? '' : p.method + ', '}${card}` : p.method;
  };

  window.Pay = { checkout, refund, link, cardOf, attach, describe };
})();
