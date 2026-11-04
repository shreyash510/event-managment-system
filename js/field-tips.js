/* Field tooltips: every form field in the app says what it is for.
   Hovering a field or its label shows the tooltip. So does reaching the field with the keyboard or tapping into it.
   One handler on the page covers every form, so a new form needs no extra code.
   To change wording, change a line in TIPS. The key is the field's label in lower case, without anything in brackets.
   To give one field its own wording, add data-tip="..." to it. A field with no line here uses its hint on the page,
   and then a plain sentence from its label, so no field is ever left without a tooltip. */
(function () {
  'use strict';
  const TIPS = {
    /* People */
    customer: 'Type a name, email or phone to find someone who has booked before. Choose New customer only if they are not on the list.',
    'member price': 'Use the member price or the standard price. It is set from their subscription when you choose a customer.',
    name: 'The full name of this person or place, as it should appear on screens and emails.',
    email: 'The email address. Bookings and memberships are matched by email, so check the spelling.',
    'email address': 'The email address. Bookings and memberships are matched by email, so check the spelling.',
    phone: 'A phone number to reach this person about their booking.',
    role: 'What this person can do. A marketing admin runs everything, a club manager runs their own venues, and a normal user only sees their own bookings.',
    venues: 'Tick every club this person works at. They only see the clubs ticked here.',
    theme: 'Choose a light or dark look for the app, or follow your device.',
    'signed in as': 'Demo only: switch to another user to see the app as they do.',
    /* Venues */
    venue: 'The club this applies to.',
    address: 'The full address of the club. Customers see it on event pages and emails.',
    'contact details': 'A phone number or email customers can use to reach the club.',
    contact: 'The person or address to use when talking to this partner.',
    'notes for staff': 'Things staff need on the day, such as where to park or how to open up. Customers do not see these.',
    notes: 'Anything staff should remember. Customers do not see this.',
    price: 'The full price for one, before any member price or discount code.',
    stock: 'How many of this you have to sell. Leave it empty if there is no limit.',
    'price per ticket': 'What one ticket costs before any member price or discount code.',
    'standard price': 'What a customer who is not a member pays for one session.',
    'the standard price': 'What a customer who is not a member pays for one session.',
    'block price': 'What one person pays for a place in every remaining session.',
    'member drop-in price': 'What a member pays for one session.',
    'member block price': 'What a member pays for a place in every remaining session.',
    /* Events */
    title: 'The event name customers see. Keep it short and clear.',
    description: 'What the event is about. Customers read this before they book.',
    'image link': 'A web address for the event picture. Leave it empty to use the standard picture.',
    format: 'How the event runs: once, as a set run of sessions, every week, or as coaching.',
    'event type': 'The kind of event, such as Pilates or Padel. It is used in filters, reports and code limits.',
    event: 'The event this applies to.',
    session: 'The date and time this applies to.',
    'date and time': 'When this session starts.',
    'session length': 'How long each session lasts, in minutes.',
    'limit': 'The most people who can come to this session.',
    'places per session': 'The most people who can come to each session.',
    'tickets per booking': 'The most tickets one person can buy in one booking.',
    'details for each guest': 'What we need to know about each guest: nothing extra, their name, or their name and email.',
    'offer freed places automatically': 'When a place opens, offer it to the next person on the waitlist without staff having to do it.',
    question: 'The question customers see.',
    'answer type': 'How customers answer: free text, one choice from a list, or a tick box.',
    'choices, separated by commas': 'The answers customers can pick from. Put a comma between each one.',
    required: 'Tick this if customers must answer before they can book.',
    asked: 'Ask this once for the whole booking, or once for each guest.',
    /* Booking */
    'booking type': 'One session, or a place in every remaining session.',
    tickets: 'How many tickets to book.',
    ticket: 'The kind of ticket.',
    'ticket type': 'The kind of ticket to book. Each kind can have its own price.',
    'member or guest': 'Members pay the member price. Everyone else pays the standard price.',
    guest: 'Details for this guest.',
    source: 'How this booking reached us, so reports can show where bookings come from.',
    'how they pay': 'How this person is paying for the booking.',
    payment: 'How this person is paying.',
    'discount code': 'A code that takes money off this booking. It is checked straight away.',
    'have a code': 'A code that takes money off this booking. It is checked straight away.',
    'give a free place': 'The customer pays nothing. A reason is needed, and it goes in the activity log.',
    'said yes to marketing messages': 'Tick only if this person agreed to get news and offers. Booking messages are sent either way.',
    'this person agreed to marketing': 'Tick only if this person agreed to get news and offers. Booking messages are sent either way.',
    'send me news and offers about events': 'Tick to get emails about new events and offers. You can stop them at any time.',
    'pick a session': 'Choose the date and time you want to come.',
    'how many people': 'How many people are in this group.',
    'lead person is a member': 'Tick if the person booking is a member, so they get the member price.',
    'check them in now': 'Mark this group as arrived as soon as the booking is saved.',
    'move to': 'The session to move this place to. Only sessions with a free place are listed.',
    'place to move': 'Which place on this booking to move.',
    'which place': 'Which place on your booking this is about.',
    'what would you like to change or cancel': 'Tell the team what you need. They will reply and make the change.',
    /* Changes and refunds */
    reason: 'Why this is being done. It is saved in the history and the activity log.',
    'reason for going over the limit': 'Why this session can go over its limit. It is saved in the activity log.',
    'reason for the free place': 'Why this person is not paying. It is saved in the activity log.',
    'reason for going outside the policy': 'Why this is allowed even though it is outside the refund or transfer policy. It is saved in the activity log.',
    'reason for going below it': 'Why this price may go below the lowest ticket price. It is saved in the activity log.',
    'reason for going below the number booked': 'Why the limit can go below the number already booked. It is saved in the activity log.',
    'amount to refund': 'How much to give back. It goes to the original payment.',
    refund: 'What to give back to the customer.',
    'type of refund': 'A full refund gives everything back. A part refund gives back only the amount you enter.',
    'what to cancel': 'Choose one ticket, one session, or the whole booking.',
    'also cancel these places and free them up': 'The places become free for someone else, and these tickets are cancelled.',
    'return single-use code': 'Let the customer use their single-use code again.',
    'note': 'A note only staff can see. It cannot be edited or deleted later.',
    'request this answers': 'The customer request this action deals with. It is closed when you save.',
    outcome: 'Whether the request was dealt with or declined.',
    'done: we have dealt with it': 'Close the request because the change has been made.',
    'declined: we will not do this': 'Close the request without making the change.',
    'what did they ask for': 'What the customer asked for, in your own words.',
    'what happened': 'What was done about this request.',
    /* Cancelling a session */
    'apply this to': 'Change this session only, this one and the later ones, or all of them.',
    'what should happen': 'What happens to the people booked on this session.',
    'refund everyone': 'Give everyone their money back.',
    'offer a transfer to another session': 'Move people to another session. They can still ask for a refund.',
    'decide for each booking': 'Choose what happens to each booking, one at a time.',
    'move them to': 'The session to move these people to.',
    'extra words for the customer message': 'Anything you want to add to the message customers get.',
    'tell them about the new time and send an updated calendar invite': 'Tell people who have booked about the new time, and send a new calendar invite.',
    template: 'A ready-made message to start from. You can change the words before it is sent.',
    'template name': 'A short name so staff can find this template in Message attendees. Customers do not see it.',
    subject: 'The subject line people see in their inbox.',
    message: 'The words people will read.',
    body: 'The main text of the email. Words in curly brackets are filled in for each person.',
    'partner or other place': 'Where this link will be shared. It shows in reports as the source of the booking.',
    /* Check-in and lists */
    'search name or booking': 'Type a name or booking reference to find a person.',
    search: 'Type a word to narrow the list.',
    'search this table': 'Type a word to narrow this list.',
    'sensitive answers': 'Answers about health or diet. Leave them out unless staff really need them.',
    'rows per page': 'How many rows to show on each page of this list.',
    'people per page': 'How many people to show on each page of this list.',
    'sessions per page': 'How many sessions to show on each page of this list.',
    /* Codes and partners */
    code: 'What customers type at checkout. Use capitals and no spaces.',
    'use type': 'Multi-use is one shared code. Single-use makes codes that each work only once.',
    'discount type': 'Take off a percent, or a fixed amount of money.',
    amount: 'How much to take off.',
    'amount off': 'How much money this code takes off.',
    discount: 'Take off a percent, or a fixed amount of money.',
    'how many codes': 'How many different single-use codes to make, from 1 to 500.',
    'start of each code': 'Each code starts with this, followed by 6 random characters.',
    'expiry date': 'The last day this works. Leave it empty for no end date.',
    'usage cap': 'The most times this can be used in total. Leave it empty for no limit.',
    partner: 'The partner this code belongs to, so their results can be tracked.',
    /* Reports */
    period: 'The dates to report on.',
    from: 'The first date to include.',
    to: 'The last date to include.',
    'date view': 'Count money on the day it was booked, or on the day of the session.',
    /* Membership */
    plan: 'What this person subscribes to, and how much it costs.',
    'new plan': 'The plan to move to. The new price starts at the next renewal.',
    offer: 'Money off the first payment. Later payments are the full plan price.',
    billing: 'How often the member pays.',
    starts: 'The first day this offer can be used.',
    ends: 'The last day this offer can be used. Leave it empty for no end date.',
    when: 'Cancel now, or let it run until the end of the period they paid for.',
    /* Settings */
    type: 'The kind of email.',
    'club manager refund limit': 'The most a club manager can refund without approval. Enter 0 for no limit.',
    /* Paying */
    'card number': 'The long number on the front of the card.',
    'expiry date, month and year': 'The month and year the card ends, shown on the card.',
    'security code': 'The 3 digits on the back of the card, or 4 on the front of an American Express card.',
    'card information': 'Your card details. They are only used for this payment.',
    'payment link': 'A link the customer can open to pay.',
    'name on card': 'The name as it is printed on the card.',
    country: 'The country your card is registered in.',
    postcode: 'The postcode of the address your card is registered to.',
    /* Event form */
    minutes: 'How long each session lasts, in minutes.',
    'percent off': 'How much members save, as a percent of the standard price.',
    block: 'Use the member price when someone books every remaining session.',
    'drop-in': 'Use the member price when someone books one session.',
    'sell a block': 'Let people book one place in every remaining session, for one price.',
    'sell drop-ins': 'Let people book one session at a time.',
    'question text': 'The question customers see. Keep it short and clear.',
    /* Share links */
    instagram: 'Copy this link into Instagram. Bookings from it show as Instagram in reports.',
    facebook: 'Copy this link into Facebook. Bookings from it show as Facebook in reports.',
    'email newsletter': 'Copy this link into your newsletter. Bookings from it show as Email newsletter in reports.',
    'link for that place': 'Copy this link to share it there. Bookings from it show in reports under the name you typed.',
    /* Partners and lists */
    'percent of net revenue': 'The share of the money this partner\'s codes bring in that we pay them.',
    'per page': 'How many rows to show on each page of this list.'
  };
  /* A choice whose words change with the prices shown, so it is found by what it does. */
  const BY_VALUE = {
    'kind:dropin': 'Book one place in the session you choose.',
    'kind:block': 'Book one place in every remaining session, for one price.'
  };
  const SKIP = 'input[type="hidden"], input[type="file"][hidden]';
  const CONTROLS = 'input, select, textarea';

  const norm = (text) => String(text || '').replace(/\([^)]*\)/g, ' ').replace(/£/g, ' ').replace(/,?\s*session \d+/gi, ' ').replace(/\s+/g, ' ').trim().replace(/[?:.…]+$/, '').trim().toLowerCase();
  /* The words of a label, without the field inside it, its hint or its list of choices. */
  function labelText(el) {
    const label = el.labels && el.labels[0];
    if (label) {
      const copy = label.cloneNode(true);
      copy.querySelectorAll('input, select, textarea, .hint, .ef-hint, .sr-only:not(:only-child), small').forEach((x) => x.remove());
      const text = copy.textContent.replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
    return el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
  }
  const legendText = (el) => {
    const set = el.closest('fieldset');
    const legend = set && set.querySelector('legend');
    return legend ? legend.textContent.replace(/\s+/g, ' ').trim() : '';
  };
  function hintText(el) {
    const box = el.closest('.field, .check, label');
    const hint = box && box.querySelector('.hint, .ef-hint');
    return hint ? hint.textContent.replace(/\s+/g, ' ').trim() : '';
  }
  /* A plain sentence from the label, so no field is left without a tooltip. */
  function plainSentence(el, label, legend) {
    /* The words people type a search for are in its placeholder, such as "Search name, email or code...". */
    const search = /^search\s+(.+?)[.…]*$/i.exec(label);
    if (search) return `Type here to find: ${search[1]}.`;
    const words = (label || legend || 'this field').replace(/\s*\((needed|required|optional)\)\s*$/i, '').trim();
    const low = /^[A-Z][a-z]/.test(words) ? words.charAt(0).toLowerCase() + words.slice(1) : words;
    /* A filter in a list's Filter dialog. */
    if (/^fd-/.test(el.id)) return `Filter the list by ${low}.`;
    /* An event's own question, written by staff. */
    if (/\?$/.test(words)) return `Please answer: ${words}`;
    if (/^pf-.*answers-/.test(el.id)) return `Please tell us: ${low}.`;
    if (el.type === 'checkbox') return `Tick to choose: ${low}.`;
    if (el.type === 'radio') return legend ? `${legend}: ${low}.` : `Choose this option: ${low}.`;
    if (el.tagName === 'SELECT') return `Choose ${low} from the list.`;
    if (el.type === 'date') return `Choose the date: ${low}.`;
    if (el.type === 'number') return `Enter a number for ${low}.`;
    return `Enter ${low}.`;
  }
  function describe(el) {
    if (el.dataset.tip) return { text: el.dataset.tip, source: 'own' };
    const byValue = BY_VALUE[`${el.name}:${el.value}`];
    if (byValue) return { text: byValue, source: 'list' };
    const label = labelText(el), legend = legendText(el);
    const own = TIPS[norm(label)];
    if (own) return { text: own, source: 'list' };
    /* Ticks and choices: the group's wording, then the words of this one choice. */
    if ((el.type === 'checkbox' || el.type === 'radio') && TIPS[norm(legend)]) return { text: label ? `${label}. ${TIPS[norm(legend)]}` : TIPS[norm(legend)], source: 'list' };
    const hint = hintText(el);
    if (hint) return { text: hint, source: 'hint' };
    return { text: plainSentence(el, label, legend), source: 'sentence' };
  }

  const SHOW_AFTER = 300;
  let tip = null, current = null, timer = null, pressed = false;
  function build() {
    tip = document.createElement('div');
    tip.id = 'field-tip';
    tip.setAttribute('role', 'tooltip');
    /* A popover sits above open dialogs, and nearly every form here is in a dialog. */
    if (tip.showPopover) tip.setAttribute('popover', 'manual');
    document.body.appendChild(tip);
  }
  /* Above the field if it fits, so it does not cover a list as it opens or the words being typed. */
  function place(el) {
    const box = el.type === 'checkbox' || el.type === 'radio' ? (el.closest('label') || el) : el;
    const r = box.getBoundingClientRect(), gap = 8, edge = 8;
    const w = tip.offsetWidth, h = tip.offsetHeight, vw = document.documentElement.clientWidth, vh = window.innerHeight;
    let top = r.top - gap - h;
    if (top < edge) top = r.bottom + gap;
    const left = Math.max(edge, Math.min(r.left, vw - w - edge));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(Math.max(edge, Math.min(top, vh - h - edge)))}px`;
  }
  function show(el) {
    if (!el.isConnected) return;
    if (!tip) build();
    tip.textContent = describe(el).text;
    tip.classList.add('is-on');
    if (tip.showPopover) {
      /* Reopened each time, so it lands above a dialog that opened after the last one. */
      try { if (tip.matches(':popover-open')) tip.hidePopover(); tip.showPopover(); } catch (e) { /* still shown by the class above */ }
    }
    place(el);
    current = el;
    /* Added to any description the field already has, so screen readers keep both. */
    const had = el.getAttribute('aria-describedby') || '';
    if (!had.split(' ').includes('field-tip')) el.setAttribute('aria-describedby', `${had} field-tip`.trim());
  }
  function hide() {
    clearTimeout(timer);
    timer = null;
    if (current) {
      const left = (current.getAttribute('aria-describedby') || '').split(' ').filter((x) => x && x !== 'field-tip').join(' ');
      if (left) current.setAttribute('aria-describedby', left); else current.removeAttribute('aria-describedby');
    }
    current = null;
    if (!tip) return;
    tip.classList.remove('is-on');
    if (tip.showPopover) { try { if (tip.matches(':popover-open')) tip.hidePopover(); } catch (e) { /* already closed */ } }
  }
  function schedule(el, wait) {
    if (el === current) return;
    hide();
    if (wait) timer = setTimeout(() => show(el), wait); else show(el);
  }
  /* The field this element belongs to: the field itself, or the one its label names. */
  function fieldOf(node) {
    if (!node || !node.closest) return null;
    const direct = node.closest(CONTROLS);
    if (direct) return direct.matches(SKIP) ? null : direct;
    const label = node.closest('label');
    const el = label && label.control;
    return el && !el.matches(SKIP) ? el : null;
  }
  const canHover = () => window.matchMedia('(hover: hover)').matches;

  document.addEventListener('mouseover', (ev) => {
    if (!canHover()) return;
    const el = fieldOf(ev.target);
    if (el) schedule(el, SHOW_AFTER);
    else if (current || timer) hide();
  });
  /* A list opening under the pointer should not have a tooltip on top of it. */
  document.addEventListener('pointerdown', (ev) => {
    pressed = true;
    setTimeout(() => { pressed = false; }, 300);
    const el = fieldOf(ev.target);
    if (el && el.tagName === 'SELECT' && ev.pointerType === 'mouse') hide();
  }, true);
  document.addEventListener('focusin', (ev) => {
    const el = fieldOf(ev.target);
    if (!el) return;
    /* With a mouse the hover has already shown it. Keyboard and touch show it here. */
    if (pressed && canHover()) return;
    schedule(el, 0);
  });
  document.addEventListener('focusout', () => { if (current || timer) hide(); });
  /* Once someone starts typing, the tooltip has done its job. */
  document.addEventListener('input', () => { if (current || timer) hide(); }, true);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && (current || timer)) hide(); }, true);
  window.addEventListener('hashchange', hide);
  window.addEventListener('scroll', () => { if (current || timer) hide(); }, true);

  window.FieldTips = { describe };
})();
