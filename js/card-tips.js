/* Card tooltips: hovering a card says in plain words what the card is for.
   One handler on the page covers every card, so screens need no extra code, even when they redraw.
   Stat cards are not covered here: they keep their own tooltip in js/stat-tips.js.
   The Help page's points are left out on purpose, because each one is already an explanation.
   To add wording:
   - a card that repeats or has no fixed heading: add a line to KINDS, by its class;
   - a card with a heading: add a line to TIPS, using the heading in lower case, without brackets, with any number as #;
   - a card with no heading: TIPS can use its first field label instead;
   - if the same heading means something different on one page, add 'page :: heading' as well; that line wins.
   A table with no line here shows its own subtitle. Anything else shows FALLBACK. */
(function () {
  'use strict';
  const FALLBACK = 'Shows the details for this part of the page.';

  /* Only the words directly in this element, leaving out counts and notes in smaller tags inside it. */
  function ownText(el) {
    if (!el) return '';
    return Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
  }
  /* Today's "Needs action" list has one small card for each kind of job. Key: the job's title in lower case. */
  const ACTIONS = {
    'refunds waiting for approval': 'Refunds over a club manager\'s limit, which wait here for your decision.',
    'events waiting for approval': 'New events from club managers, which customers cannot book until you approve them.',
    'your events waiting for approval': 'Events you sent to marketing that have not been approved yet.',
    'events sent back by marketing': 'Events marketing did not approve, with the reason, so you can fix them.',
    'your refunds waiting for approval': 'Refunds you asked for that are waiting for a marketing admin to approve.',
    'open cancellation requests': 'Customers who asked to cancel and are still waiting for an answer.',
    'tickets missing guest details': 'Bookings that still need guest details before their session.',
    'failed klaviyo sends': 'Messages to Klaviyo that did not go through and may need sending again.'
  };
  /* The first line that matches wins. Each line is a class and the words, or a small function that picks the words. */
  const KINDS = [
    /* Today */
    ['.td-recovered', 'Shows how many freed places were booked by people on the waitlist instead of staying empty.'],
    ['.td-alert', 'The most urgent things today, with a button to go straight to each one.'],
    ['.td-next.is-live', 'The session happening right now, with how many are booked and checked in.'],
    ['.td-next', 'The next session to start, with how many are booked and checked in, so you can get ready for it.'],
    ['.td-action', (c) => ACTIONS[ownText(c.querySelector('.td-action-title')).toLowerCase()] || 'One kind of job waiting to be dealt with.'],
    /* Check-in */
    ['.ci-session', 'One session. Click it to open the list of people and check them in.'],
    ['.ci-progress', 'Shows how many people have arrived on this session and how many are still to come.'],
    ['.ci-sticky', 'Search for a person on this session, or filter the list, to find them quickly at the door.'],
    ['.ci-table-wrap', 'Everyone booked on this session, so you can check each person in as they arrive.'],
    ['.ci-private', 'A private answer from this person, shown only when you choose to reveal it.'],
    ['.ci-warning', 'A warning about this session.'],
    /* Customer: finding and booking events */
    ['.tk-card.is-sold', 'This event is sold out. Click to see its details and join the waitlist if it has one.'],
    ['.tk-card', 'An event you can look at. Click to see its dates and prices, and to book.'],
    ['.tk-banner', 'The event\'s name, next date, place and starting price, so you can check it is the right one.'],
    ['.tk-saving', 'Shows how much you save by booking all the sessions together.'],
    ['.tk-member', (c) => (/^From the waitlist/.test(c.textContent.trim()) ? 'Tells you this place came from the waitlist and is held for you for now.' : 'Explains the member price and how it changes what you pay.')],
    ['.tk-hold', 'Shows how long your places are held for you while you finish paying.'],
    ['.tk-success', 'Confirms that your booking went through.'],
    ['.ticket', 'One ticket, for one person on one session. Show the booking reference at the door.'],
    /* Customer: own bookings */
    ['.mb-next', 'Your next session, with when and where it is, so you can find it quickly.'],
    ['.mb-card.is-done', 'A booking that has finished or been cancelled. Open it to see what you booked and paid.'],
    ['.mb-card', 'One of your bookings. Open it to see your tickets, what you paid and how to ask for a change.'],
    /* Events and the event form */
    ['.ev-sessions', 'Lists every session of this event with its date, places and bookings, so you can manage each one.'],
    ['.ev-note', (c) => (/^Waiting for marketing/.test(c.textContent.trim()) ? 'Explains why customers cannot book this event yet.' : /^Blocks left/.test(c.textContent.trim()) ? 'Shows how many full series bookings can still be sold, and what limits them.' : 'A short note about the change you are making.')],
    ['.ev-warn', 'Explains why marketing sent this event back, so you can fix it.'],
    ['.ev-message', 'A sample of the message these customers will get.'],
    ['.ef-issues.ef-bad', 'Problems you must fix before this event can go on sale.'],
    ['.ef-issues.ef-info', 'Useful information about this step.'],
    ['.ef-issues', 'Something to check or keep in mind on this step.'],
    ['.ef-ready', 'Tells you whether this event has everything it needs, or what is still missing.'],
    ['.ef-publish', 'Choose when this event goes on sale.'],
    ['.ef-phone', 'A rough idea of how this event will look on a customer\'s phone.'],
    ['.ef-compact', 'Choose how this event\'s dates are set.'],
    /* Bookings */
    ['.bd-actions', 'The things you can do with this booking, such as a transfer or a refund.'],
    ['.bd-waiting', 'Tells you this booking has a request waiting for an answer.'],
    /* Warnings inside forms */
    ['.bd-warn, .bk-warn, .pp-warn, .codes-warn-note', 'A warning about what you are doing. Read it before you go on.'],
    /* Reports and lists */
    ['.rp-check', 'A warning that the report totals do not add up, so check the figures before using them.'],
    ['.rp-notes', 'Explains how the figures on this page are worked out.'],
    ['.filters', 'Narrow down what is listed here.'],
    /* Email templates: one line for all of them, by who sends them */
    ['.card:has(> .set-tpl-title)', (c) => { const words = c.querySelector('.set-tpl-title').textContent; return /Set up in Klaviyo/.test(words) ? 'Explains an email that Klaviyo sends. It can only be changed in Klaviyo.' : /Your template/.test(words) ? 'An email you added. Nothing sends it on its own: staff pick it in Message attendees on an event.' : 'An email this system sends, with when it goes out and what it says, so you can change the wording.'; }],
    /* Everyone */
    ['.pf-hero', 'Shows who you are signed in as and what kind of account you have.'],
    ['.demo-note', 'A reminder of what this demo does not really do.'],
    ['.help-key', 'Explains the labels used on the points below.'],
    ['.entry-card', 'Sign in, create an account or pick a demo user to get started.'],
    ['.pay-summary', 'What you are paying for and the total, so you can check it before you pay.'],
    ['.pay-test', 'A reminder that this is a test, so no real money moves.']
  ];
  const TIPS = {
    /* Today */
    'needs action': 'Your to-do list: the requests, approvals and missing details waiting for someone to deal with them.',
    'updates from clubs': 'News from club managers, such as new events and price changes. It stays here until you mark it as seen.',
    'low space and sold out': 'Warns you about sessions coming up soon that are nearly full or sold out.',
    'under half full': 'Warns you about sessions coming up soon with fewer than half their places booked.',
    'recent activity': 'The latest changes made in the system, so you can see what has happened.',
    'account :: recent activity': 'The latest things you did in the system.',
    'members :: recent activity': 'The latest things this person did in the system.',
    'check-in rate today': 'Shows how many of the people booked on today\'s sessions have arrived so far.',
    'bookings, last # days': 'Shows how many bookings were made each day for two weeks, so you can spot busy and quiet days.',
    'today\'s sessions': 'Lists every session running today, so you can see how full each one is and how many have arrived.',
    /* Events */
    'all events': 'Your full list of events. Find one here to open it, or see its status and bookings.',
    'events :: details': 'The main settings for this event, such as its venue, when sales open and what it asks guests.',
    'price summary': 'Shows what this event charges for each ticket, including any member price.',
    /* Event form */
    title: 'The basics of this event, starting with its name and venue.',
    'repeat rule: every week': 'Set up a weekly rule that creates this event\'s sessions for you.',
    schedule: 'The dates and times of this event\'s sessions.',
    'events :: tickets': 'The ticket types this event sells and their prices.',
    'member price': 'Choose whether members pay less for this event, and by how much.',
    tiers: 'Prices that sell in order, such as early bird, before the standard price.',
    'events :: add-ons': 'Choose the extras customers can buy with this event at checkout.',
    'preview: what customers pay': 'Shows what a guest and a member would pay, so you can check the prices before saving.',
    'limit per session': 'Set how many places each session has.',
    'events :: sessions': 'The number of places on each session. Change one row if a session is different.',
    'maximum tickets per booking': 'Choose how many tickets one booking can hold, and what details you need for each guest.',
    'custom questions': 'Extra questions to ask customers when they book.',
    /* Bookings */
    '# bookings': 'Every booking you can see. Use it to find a booking and open it.',
    'this booking at a glance': 'The main facts of this booking in one place: who, what, when and what they paid.',
    'bookings :: tickets': 'The places on this booking, by person and session, with what was paid for each.',
    'customer details': 'How to reach the person who made this booking, and whether they are a member now.',
    'can they get a refund?': 'Tells you what the refund rules allow for this booking right now.',
    'booking history': 'Shows whether this customer has booked before and how much they have paid.',
    'what they paid at booking': 'A record of the price on the day, which later price or membership changes do not alter.',
    'payment summary': 'The money on this booking added up: paid, refunded and kept.',
    'bookings :: add-ons': 'The extras bought with this booking and whether they have been paid or refunded.',
    'guest details': 'What we know about each person on this booking.',
    'custom answers': 'What each person answered to the event\'s questions.',
    payments: 'Every payment and refund on this booking, so you can see where the money went.',
    requests: 'Requests from the customer that staff have logged, such as a request to cancel.',
    notes: 'Notes staff have left about this booking.',
    timeline: 'What has happened to this booking, in order.',
    /* Add booking */
    'what they are booking': 'Choose the event, the sessions and the number of tickets for this booking.',
    'bookings :: customer': 'Pick an existing person or add someone new, so nobody is entered twice.',
    'bookings :: guests': 'The details of the other people on this booking.',
    'price and payment': 'Shows what this booking costs, and lets you add a discount and take payment.',
    /* Check-in */
    'checkin :: today': 'Today\'s sessions. Open one to check people in.',
    'checkin :: upcoming': 'Sessions still to come. Open one to see who is booked.',
    /* Discount codes and partners */
    'all discount codes': 'Every discount code, so you can see how each one is set up and how often it has been used.',
    'codes :: rules': 'How this code works: the discount, how often it can be used, when it ends and where it works.',
    'codes :: redemptions': 'Each booking that used this code, and the discount it gave.',
    'all partners': 'Every partner, so you can see which codes they have and what they bring in.',
    'partners :: details': 'How to contact this partner, and notes about them.',
    'the discount codes linked to this partner and how they performed.': 'The codes linked to this partner, so you can compare how each one has done.',
    /* Clubs */
    clubs: 'Your list of clubs. Open one to see its details and events.',
    'club :: details': 'The address and contact details for this club.',
    'events at this club': 'The events this club runs. Open one to manage it.',
    /* Users and memberships */
    'customers are matched across bookings and accounts by their email.': 'Everyone in the system: staff, members, customers and guests. Find a person here and open their page.',
    'this user at a glance': 'The main facts about this person in one place.',
    'members :: bookings': 'Every booking this person has made, so you can open any of them.',
    'contact details': 'How to reach this person, and whether they have an account.',
    'members :: membership': 'This person\'s membership, if they have one, and how to start or change it.',
    access: 'This person\'s role and which venues they can work with.',
    'test payments only: nothing renews or charges on its own.': 'Everyone with a subscription and its plan, price and status, so you can manage each one.',
    'subscriptions :: payments': 'The test payments on subscriptions, so you can see which went through, failed or are still to come.',
    'what people can subscribe to. a plan that has been used can be retired, not deleted.': 'The membership plans people can subscribe to, and how many members each one has.',
    'money off the first payment. later payments are the full plan price.': 'Offers that take money off someone\'s first membership payment.',
    /* Reports */
    'fill rate by event type': 'Shows how full each kind of event is, so you can see which ones sell best.',
    'by event type': 'Shows how much money each kind of event brings in.',
    'member or guest': 'Compares the money from bookers who are members with those who are not.',
    'booking source': 'Shows where bookings came from, so you can see what works best.',
    'spaces filled': 'Shows how many places were taken out of all the places on offer.',
    /* Settings and messages */
    'at a glance': 'A count of what is set up, with links to each one.',
    'quick actions': 'Shortcuts to the pages people open most.',
    'placeholders you can use': 'The words you can put in an email, which change into the real details when it is sent.',
    'send log': 'Each email sent to Klaviyo and whether it worked, so you can spot failed sends.',
    'what each trigger sends': 'Shows what each trigger sends to Klaviyo.',
    'good to know': 'Short notes on how consent, sensitive answers and sending work with Klaviyo.',
    'activity entries': 'A record of who changed what, so you can check what happened and when.',
    /* My profile */
    'what you can do': 'A plain list of what your role lets you do in this app.',
    'your limits': 'The limits that apply to your role.',
    'your access': 'Your role and the venues you can work with.',
    appearance: 'Choose how the app looks.',
    'account :: membership': 'Your membership: your plan and price, or how to join.',
    'account :: your details': 'The name, email and phone number on your account.',
    'emails from us': 'Choose whether we send you news and offers about events.',
    'what you get': 'What you get by creating an account.',
    memberships: 'The membership plans you can choose from.',
    /* Customer: event page and paying */
    'about this event': 'What the event is, so you can decide if it is right for you.',
    where: 'Where this takes place, with a map link and how to contact the club.',
    'cancelling or changing': 'Explains what you can do if your plans change.',
    'book tickets': 'Choose your sessions and number of tickets, and see the price before you pay.',
    'a place is free for you': 'A place has opened up for you from the waitlist. Book it before your offer ends.',
    'your waitlist': 'The sessions you are waiting for. We email you if a place opens.',
    'order summary': 'What you are booking and the price, so you can check it and pay.',
    'browse :: your details': 'Who this booking is for, and where we send your confirmation.',
    'browse :: guests': 'The details we need for the other people on your booking.',
    'browse :: add-ons': 'Optional extras you can buy with your booking.',
    payment: 'Explains how you will pay on the next screen.',
    /* Customer: a booking */
    'your tickets': 'Your places on this booking, with when each session is and who it is for.',
    'what you paid': 'What this booking cost, how you paid and anything refunded.',
    'need a change?': 'How to move a place or ask the club to cancel or change your booking.',
    'your booking': 'The main facts of your booking, so you can check everything is right.'
  };

  const TARGETS = '.card, .rp-card, .paged, .ci-session, .ci-progress, .ci-sticky, .ci-table-wrap, .ci-private, .ci-warning, .td-recovered, .td-alert, .td-action, .tk-banner, .tk-waitlist, .tk-saving, .tk-member, .tk-hold, .tk-success, .ticket, .ev-note, .ev-warn, .ev-message, .ef-issues, .ef-ready, .ef-publish, .ef-phone, .bd-actions, .bd-waiting, .bd-warn, .bk-warn, .pp-warn, .rp-check, .rp-notes, .filters, .demo-note, .help-key, .entry-card, .pay-summary, .pay-test';
  const LEFT_OUT = '.help-point';                  /* the card is itself the explanation */
  const OTHER_TIP = '.stat, .stat-pill';           /* js/stat-tips.js looks after these */
  const CONTROLS = 'button, input, select, textarea, label, summary, .btn, .pill-tab, .ci-tab, [role="tab"], [role="menu"]';
  const SHOW_AFTER = 500, SHOW_FOR = 6000, TALL = 220;
  let tip = null, timer = null, hideTimer = null, current = null, waiting = null, muted = null, pointerX = 0, pointerY = 0, touchedAt = 0;

  const clean = (s) => String(s || '').replace(/\s*\(.*\)\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/\d+/g, '#');
  /* The nearest card. A table with no heading of its own speaks for the card around it. */
  function cardOf(node) {
    let card = node.closest(TARGETS);
    if (!card || card.closest(LEFT_OUT)) return null;
    if (card.matches('.paged') && !card.querySelector('.tbl-title') && card.parentElement) {
      const outer = card.parentElement.closest('.card');
      if (outer) card = outer;
    }
    return card;
  }
  /* The heading that belongs to this card, not one in a card nested inside it. */
  function headingOf(card) {
    const own = Array.from(card.querySelectorAll('h1, h2, h3, h4')).find((h) => h.closest(TARGETS) === card);
    if (own) return clean(own.textContent);
    const named = card.getAttribute('aria-label');
    if (named) return clean(named);
    /* A form card with no heading goes by its first label. */
    const first = card.querySelector('label, legend');
    return first ? clean(first.textContent) : '';
  }
  function textFor(card) {
    const kind = KINDS.find(([sel]) => card.matches(sel));
    if (kind) return typeof kind[1] === 'function' ? kind[1](card) : kind[1];
    const page = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
    const subEl = card.matches('.paged') ? card.querySelector('.tbl-sub') : null;
    const sub = subEl ? subEl.textContent.trim() : '';
    const section = card.matches('.paged') && card.closest('.rp-section');
    const keys = [headingOf(card), sub.toLowerCase(), section ? clean(section.querySelector('h2').textContent) : ''].filter(Boolean);
    for (const k of keys) { const t = TIPS[`${page} :: ${k}`] || TIPS[k]; if (t) return t; }
    return sub || FALLBACK;
  }
  /* A small card gets the tooltip above or below it. On a tall card that would be far away, so it goes by the pointer. */
  function place(card) {
    const r = card.getBoundingClientRect(), gap = 8, edge = 8;
    const w = tip.offsetWidth, h = tip.offsetHeight, vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const tall = r.height > TALL;
    let left = (tall ? pointerX : r.left + r.width / 2) - w / 2;
    let top = tall ? pointerY + 16 : r.top - gap - h;
    if (tall ? top + h > vh - edge : top < edge) top = tall ? pointerY - 16 - h : r.bottom + gap;
    left = Math.max(edge, Math.min(left, vw - w - edge));
    top = Math.max(edge, Math.min(top, vh - h - edge));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }
  function show(card) {
    waiting = null;
    if (!card.isConnected) return;
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'card-tip';
      tip.setAttribute('role', 'tooltip');
      /* A popover sits above open dialogs, so cards inside a dialog show their tooltip too. */
      if (tip.showPopover) tip.setAttribute('popover', 'manual');
      document.body.appendChild(tip);
    }
    tip.textContent = textFor(card);
    tip.classList.add('is-on');
    if (tip.showPopover) { try { if (tip.matches(':popover-open')) tip.hidePopover(); tip.showPopover(); } catch (e) { /* still shown by the class above */ } }
    place(card);
    current = card;
    /* A big card should not stay covered, so it goes away and stays away until the pointer leaves this card. */
    hideTimer = setTimeout(() => { hide(); muted = card; }, SHOW_FOR);
  }
  function hide() {
    clearTimeout(timer);
    clearTimeout(hideTimer);
    timer = hideTimer = null;
    current = waiting = null;
    if (!tip) return;
    tip.classList.remove('is-on');
    if (tip.showPopover) { try { if (tip.matches(':popover-open')) tip.hidePopover(); } catch (e) { /* already closed */ } }
  }
  /* Hide, and do not come back until the pointer has left this card. */
  function dismiss() {
    const card = current || waiting;
    hide();
    if (card) muted = card;
  }
  /* A link does not count: the event card is itself a link, and plain links inside a card can still show the tooltip.
     A control that wraps the card does not count either. */
  function onControl(node, card) {
    const control = node.closest(CONTROLS);
    return !!control && !control.contains(card);
  }
  /* Phones have no hover. The check on the time covers a laptop with a touch screen, where a tap also acts like a hover. */
  const canHover = () => window.matchMedia('(hover: hover)').matches && Date.now() - touchedAt > 1000;

  document.addEventListener('mouseover', (ev) => {
    if (!ev.target.closest) return;
    pointerX = ev.clientX; pointerY = ev.clientY;
    if (!canHover()) { hide(); return; }
    const card = cardOf(ev.target);
    if (card !== muted) muted = null;
    if (!card || card === muted || ev.target.closest(OTHER_TIP) || onControl(ev.target, card)) { hide(); return; }
    if (card === current || card === waiting) return;
    hide();
    waiting = card;
    timer = setTimeout(() => show(card), SHOW_AFTER);
  });
  document.addEventListener('mousemove', (ev) => { pointerX = ev.clientX; pointerY = ev.clientY; }, { passive: true });
  document.addEventListener('mouseout', (ev) => { if (!ev.relatedTarget) { hide(); muted = null; } });
  document.addEventListener('touchstart', () => { touchedAt = Date.now(); hide(); }, { capture: true, passive: true });
  document.addEventListener('click', dismiss, true);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') dismiss(); }, true);
  window.addEventListener('hashchange', () => { hide(); muted = null; });
  window.addEventListener('scroll', () => { if (current || waiting) dismiss(); }, true);
})();
