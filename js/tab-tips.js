/* Tab tooltips: hovering a tab, or reaching it with the keyboard, says what that tab is for.
   One handler on the page covers every tab and menu item, so screens that redraw their tabs need no extra code.
   To add wording, add a line below: 'Group name :: Tab name', where the group name is the aria-label on the row of tabs.
   A tab with no line here still gets a plain sentence from fallback(). */
(function () {
  'use strict';
  const TIPS = {
    /* Bookings */
    'Needs action :: All bookings': 'Every booking you can see, with no filter.',
    'Needs action :: Cancellation requests': 'Bookings where a customer asked for a cancellation or a change, and nobody has answered yet.',
    'Needs action :: Details missing': 'Bookings still missing guest names or other details.',
    /* One booking */
    'Booking sections :: Tickets': 'Each session on this booking, the customer, and whether a refund is still allowed.',
    'Booking sections :: Guests': 'The people on this booking, their contact details, answers and marketing choice.',
    'Booking sections :: Payments': 'What was paid and refunded, every payment with who made it and why, and how the price was worked out.',
    'Booking sections :: Requests': 'Cancellation requests and refunds waiting for approval on this booking.',
    'Booking sections :: Notes & timeline': 'Staff notes, and a full history of what has happened to this booking.',
    /* Events */
    'Format :: All': 'Events of every format.',
    'Format :: One-off': 'Events that run once.',
    'Format :: Seasonal series': 'A set run of sessions, such as eight weeks in autumn.',
    'Format :: Regular series': 'Sessions that repeat on a weekly pattern.',
    'Format :: Coaching': 'Coaching courses and lessons.',
    /* Discount codes */
    'Discount codes :: Discount codes': 'Create and manage codes that take money off a booking, and see who used them.',
    'Discount codes :: Partners': 'The partners who share codes, and how their codes did.',
    'Use type :: All': 'Codes of both kinds.',
    'Use type :: Multi-use': 'One shared code that many people can use.',
    'Use type :: Single-use': 'Codes that work only once.',
    /* Reports */
    'Report views :: Summary': 'The headline numbers: bookings, money, refunds, spaces filled and business health.',
    'Report views :: Events': 'Bookings, tickets and money, grouped the way you choose.',
    'Report views :: Discount codes': 'How each code and partner did: uses, money off and net revenue.',
    'Report views :: People': 'Who came: fill rate and no-shows per session, free places and overrides by staff member, and how complete guest details are.',
    'Report views :: Source': 'Where bookings came from, such as Instagram or email.',
    'Group the money by :: Event': 'One row for each event.',
    'Group the money by :: Event type': 'One row for each type, such as Pilates or Padel.',
    'Group the money by :: Venue': 'One row for each club.',
    'Group the money by :: Member or guest': 'Compare what members and guests booked and paid.',
    /* Settings */
    'Setup sections :: Event types': 'The list of event types, and the starting values for a new event of each type.',
    'Setup sections :: Add-ons': 'Extras such as racket hire: name, price, venue and stock.',
    'Messages sections :: Email templates': 'Edit the wording of the emails customers get.',
    'Messages sections :: Klaviyo': 'Messages sent to Klaviyo, and any that failed. Failed ones can be sent again.',
    /* Membership */
    'Kind of user :: All': 'Everyone: staff and customers.',
    'Kind of user :: Staff': 'Marketing admins and club managers.',
    'Kind of user :: Members': 'People who pay the member price.',
    'Kind of user :: Accounts': 'People with an account who are not members.',
    'Kind of user :: Guests': 'People who have booked but do not have an account.',
    'Subscription status :: All': 'Subscriptions in every status.',
    'Subscription status :: Active': 'Running normally.',
    'Subscription status :: Payments': 'Every membership payment: failed, succeeded and coming up. The number is how many are still owed.',
    'Payment status :: Failed': 'Did not go through and still owed. The member keeps the member price for a short time, then it stops until they pay.',
    'Payment status :: Succeeded': 'Paid first time.',
    'Payment status :: Paid after failing': 'Failed at first, then paid later.',
    'Payment status :: Upcoming': 'The next payment due on each subscription that will renew.',
    'Payment status :: All': 'Every payment, whatever its status.',
    'Subscription status :: Paused': 'On hold for now.',
    'Subscription status :: Cancelled': 'Stopped by the member or by staff.',
    'Subscription status :: Expired': 'Reached the end of its term.',
    'Plans and offers sections :: Plans': 'What people can subscribe to.',
    'Plans and offers sections :: Offers': 'Money off the first payment when someone subscribes. For money off events, use Discount codes.',
    /* Check-in */
    'Show sessions :: All': "Today's sessions and the ones coming up.",
    'Show sessions :: Today': 'Only the sessions happening today.',
    'Show sessions :: Upcoming': 'Only sessions after today.',
    'Filter people :: All': 'Everyone on this session.',
    'Filter people :: Not checked in': 'People who have not arrived yet.',
    'Filter people :: Checked in': 'People who have already arrived.',
    /* Customer: Find events */
    'Event type :: All': 'Events of every type.',
    'When :: Any date': 'Events on any date.',
    'When :: Today': 'Events with a session today.',
    'When :: This week': 'Events with a session this week.',
    'When :: This month': 'Events with a session this month.',
    /* Customer: My bookings */
    'Show bookings :: All': 'Everything you have booked.',
    'Show bookings :: Upcoming': 'Bookings with a session still to come.',
    'Show bookings :: Past': 'Bookings that have finished.',
    'Show bookings :: Cancelled': 'Bookings that were cancelled.'
  };
  /* "Status" means something different on each page, so it is looked up by page. */
  const STATUS = {
    events: {
      All: 'Events in every status.',
      Draft: 'Still being set up. Customers cannot see these.',
      'Pending approval': 'Sent by a club manager and waiting for marketing to approve or reject.',
      Scheduled: 'Published, but booking has not opened yet.',
      'On sale': 'Customers can book these now.',
      'Sold out': 'No places left.',
      'Sales closed': 'Booking has stopped, but the event is still to come.',
      Completed: 'Every session has finished.',
      Cancelled: 'Called off by staff.'
    },
    bookings: {
      All: 'Bookings in every status.',
      Confirmed: 'Booked and going ahead.',
      Cancelled: 'The whole booking was cancelled.'
    },
    codes: {
      All: 'Codes in every status.',
      Active: 'Customers can use these now.',
      Expired: 'Past the end date.',
      'Used up': 'Reached the most uses allowed.'
    }
  };
  /* The main menu. */
  const NAV = {
    browse: 'See what is on and book a place.',
    mybookings: 'Your tickets and everything you have booked before.',
    today: 'What is happening today, and anything that needs action.',
    events: 'Create and manage events, sessions, prices and waitlists.',
    bookings: 'Find a booking and change, transfer, cancel or refund it.',
    checkin: 'Check people in at the door.',
    members: 'Manage every user: staff of each role, customer accounts, members and guests.',
    subscriptions: "Each member's subscription: pause, cancel, change plan or sort out a failed payment.",
    plans: 'What people can subscribe to, and any money off when they join.',
    codes: 'Discount codes and partners.',
    club: 'Add and edit venues.',
    reports: 'Bookings, money, attendance and where bookings came from.',
    messages: 'Email wording, and the log of what was sent to Klaviyo.',
    activity: 'A record of who did what and when. It cannot be changed.',
    settings: 'Event types and add-ons.',
    account: 'Your details, what you can do and your recent activity. Customers also see their membership.'
  };
  const tabLabel = (el) => {
    const copy = el.cloneNode(true);
    copy.querySelectorAll('.pill-n, .ci-tab-n, svg, .sr-only').forEach((x) => x.remove());
    return copy.textContent.trim().replace(/\s+/g, ' ');
  };
  const page = () => location.hash.replace(/^#\//, '').split(/[/?]/)[0];
  function fallback(group, label) {
    if (group === 'Event type') return `Only ${label} events.`;
    if (group === 'Status') return `Only items marked ${label}.`;
    return `Shows ${label}.`;
  }
  function textFor(el) {
    if (el.dataset.tip) return el.dataset.tip;
    const label = tabLabel(el);
    if (el.matches('#nav a, .cust-nav a')) {
      const key = (el.getAttribute('href') || '').replace(/^#\//, '');
      return NAV[key] ? `${label}: ${NAV[key]}` : '';
    }
    const row = el.closest('[role="group"], [role="tablist"]');
    const group = row ? row.getAttribute('aria-label') || '' : '';
    if (group === 'Status') {
      const list = STATUS[page()];
      if (list && list[label]) return list[label];
    }
    return TIPS[`${group} :: ${label}`] || fallback(group, label);
  }

  const TARGETS = '.pill-tab, .ci-tab, [role="tab"], #nav a, .cust-nav a';
  const SHOW_AFTER = 300;
  let tip = null, current = null, timer = null, quietUntil = 0;

  function build() {
    tip = document.createElement('div');
    tip.id = 'tab-tip';
    tip.setAttribute('role', 'tooltip');
    /* A popover sits above open dialogs, so tabs inside a dialog show their tooltip too. */
    if (tip.showPopover) tip.setAttribute('popover', 'manual');
    document.body.appendChild(tip);
  }
  function place(el) {
    const r = el.getBoundingClientRect(), gap = 8, edge = 8;
    const w = tip.offsetWidth, h = tip.offsetHeight, vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const sideways = el.matches('#nav a') && r.right + gap + w <= vw - edge;
    let left = sideways ? r.right + gap : r.left + r.width / 2 - w / 2;
    let top = sideways ? r.top + r.height / 2 - h / 2 : r.bottom + gap;
    if (!sideways && top + h > vh - edge) top = r.top - gap - h;
    left = Math.max(edge, Math.min(left, vw - w - edge));
    top = Math.max(edge, Math.min(top, vh - h - edge));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }
  function show(el) {
    const text = textFor(el);
    if (!text || !el.isConnected) return;
    if (!tip) build();
    tip.textContent = text;
    tip.classList.add('is-on');
    if (tip.showPopover) {
      /* Reopened each time, so it lands above a dialog that opened after the last one. */
      try { if (tip.matches(':popover-open')) tip.hidePopover(); tip.showPopover(); } catch (e) { /* still shown by the class above */ }
    }
    place(el);
    current = el;
    el.setAttribute('aria-describedby', 'tab-tip');
  }
  function hide() {
    clearTimeout(timer);
    timer = null;
    if (current) current.removeAttribute('aria-describedby');
    current = null;
    if (!tip) return;
    tip.classList.remove('is-on');
    if (tip.showPopover) { try { if (tip.matches(':popover-open')) tip.hidePopover(); } catch (e) { /* already closed */ } }
  }
  function schedule(el, wait) {
    if (el === current || Date.now() < quietUntil) return;
    hide();
    /* The browser's own tooltip would appear on top of this one. */
    if (el.hasAttribute('title')) el.removeAttribute('title');
    timer = setTimeout(() => show(el), wait);
  }
  /* Phones have no hover, so a tap must not leave a tooltip on the screen. */
  const canHover = () => window.matchMedia('(hover: hover)').matches;

  document.addEventListener('mouseover', (ev) => {
    if (!canHover()) return;
    const el = ev.target.closest && ev.target.closest(TARGETS);
    if (el) schedule(el, SHOW_AFTER);
    else if (current || timer) hide();
  });
  document.addEventListener('focusin', (ev) => {
    const el = ev.target.closest && ev.target.closest(TARGETS);
    if (el && el.matches(':focus-visible')) schedule(el, 0);
  });
  document.addEventListener('focusout', () => { if (current || timer) hide(); });
  /* A click usually redraws the tabs, so wait before showing another. */
  document.addEventListener('click', () => { quietUntil = Date.now() + 600; hide(); }, true);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && (current || timer)) hide(); }, true);
  window.addEventListener('hashchange', hide);
  window.addEventListener('scroll', () => { if (current || timer) hide(); }, true);
})();
