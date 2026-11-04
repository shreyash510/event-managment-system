/* Stat card tooltips: hovering a stat card says what its number shows.
   One handler on the page covers every card, so screens need no extra code, even when they redraw.
   To add wording, add a line below using the card's label in lower case.
   If the same label means something different on one page, add 'page :: label' as well; that line wins.
   A card with no line here shows its own small note, if it has one. */
(function () {
  'use strict';
  const TIPS = {
    /* Today */
    'sessions today': 'How many sessions run today at the venues in view, not counting cancelled ones.',
    'places booked': 'Places taken on these sessions.',
    'today :: places booked': 'Places taken on today\'s sessions, out of all the places on those sessions.',
    'checked in': 'People marked as arrived, out of the people booked.',
    'revenue today': 'Money paid today less refunds made today, at the venues in view. It is compared with the same day last week.',
    arrived: 'People checked in so far today.',
    'still to come': 'People booked on today\'s sessions that have not finished, who have not checked in yet.',
    'no-shows': 'People who booked but did not check in.',
    'today :: no-shows': 'People booked on today\'s finished sessions who did not check in.',
    'reports :: no-shows': 'Places on sessions in this period that have started, where nobody checked in.',
    'walk-ins': 'People added at the door today, and the money taken for them.',
    /* Check-in */
    'checked in today': 'People marked as arrived, out of everyone booked on today\'s sessions.',
    'still to arrive': 'People on today\'s unfinished sessions who have not checked in yet.',
    'upcoming sessions': 'Sessions that have not started yet.',
    'checkin :: upcoming sessions': 'Sessions after today that you can open for check-in.',
    /* Reports */
    gross: 'The full price of bookings in this period, before discounts and refunds.',
    discounts: 'Money taken off by member prices and codes in this period.',
    refunds: 'Money given back to customers in this period.',
    net: 'What is left: gross less discounts and refunds.',
    bookings: 'How many bookings this covers.',
    'reports :: bookings': 'Bookings in this period, and how many tickets they hold.',
    'events :: bookings': 'Bookings affected by this cancellation.',
    'repeat customers': 'The share of people booking in this period who have booked more than once.',
    'no-show rate': 'The share of booked places, on sessions that have started, where nobody checked in.',
    'refund rate': 'Refunds as a share of gross.',
    'places recovered': 'Places that were freed up, offered to the waitlist and then booked.',
    'checked in against booked': 'People who checked in, out of the places booked on sessions that have started.',
    'attendance rate': 'The share of booked places where the person checked in.',
    /* Users and subscriptions */
    staff: 'Marketing admins and club managers who can sign in to this system.',
    members: 'People with a subscription that gives them the member price.',
    accounts: 'Customers who have an account but no membership.',
    guests: 'People who have booked but have no account.',
    active: 'How many are running now.',
    'subscriptions :: active': 'Subscriptions running now, and how many of them are set to cancel at the end of their term.',
    'codes :: active': 'Codes that can be used now.',
    'payment failed': 'Subscriptions whose last payment failed. The member price stops if it is not fixed in time.',
    paused: 'Subscriptions on hold. These people do not get the member price while paused.',
    'monthly income': 'What active plans bring in each month. Yearly plans are shown as a monthly amount.',
    /* Codes and partners */
    'used / cap': 'How many times this code has been used, against the most it can be used.',
    redemptions: 'Bookings that used this code. This includes cancelled bookings.',
    'partners :: redemptions': 'Bookings that used this partner\'s codes. This includes cancelled bookings.',
    'discount given': 'The total value taken off bookings by these codes.',
    'paid before refunds': 'What customers paid on these bookings, before any refund.',
    'net revenue': 'What these bookings brought in after refunds.',
    partners: 'How many partners there are, and how many have made a sale.',
    expired: 'Codes that can no longer be used.',
    /* Booking */
    'tickets paid': 'What was paid for the tickets on this booking.',
    refunded: 'What has been given back on this booking so far.',
    'kept after refunds': 'What is left: tickets paid less refunds.',
    /* Event form and cancelling an event */
    session: 'The session in this event.',
    sessions: 'How many sessions this event has.',
    'places in total': 'All the places across these sessions added together.',
    'already booked': 'Places on these sessions that customers already hold.',
    people: 'People affected by this cancellation.',
    'money involved': 'The money these people paid, which this cancellation could refund.',
    'on sale': 'Events customers can book now.',
    draft: 'Events still being set up, which customers cannot see.',
    /* My club */
    events: 'All the events at this club.',
    'events on sale': 'Events at this club that customers can book now.',
    'club :: upcoming sessions': 'Sessions at this club that have not started yet.',
    'club :: places booked': 'Places taken on this club\'s upcoming sessions.',
    /* Klaviyo */
    'failed sends': 'Messages to Klaviyo that failed. This log is simulated in the demo.',
    sent: 'Messages to Klaviyo that went through. This log is simulated in the demo.',
    /* Customer's own bookings */
    upcoming: 'Your bookings that are still to come.',
    spent: 'What you have paid across your bookings.'
  };

  const TARGETS = '.stat, .stat-pill > div';
  const SHOW_AFTER = 250;
  let tip = null, timer = null, current = null;

  function textFor(card) {
    const span = card.querySelector('span:not(.stat-ico)');
    if (!span) return '';
    /* A label can carry extra words in brackets, such as "No-shows (1 session still running)". */
    const label = span.textContent.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();
    const page = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
    const small = card.querySelector('small');
    return TIPS[`${page} :: ${label}`] || TIPS[label] || (small ? small.textContent.trim() : '');
  }
  function place(card) {
    const r = card.getBoundingClientRect(), gap = 8, edge = 8;
    const w = tip.offsetWidth, h = tip.offsetHeight, vw = document.documentElement.clientWidth, vh = window.innerHeight;
    let top = r.bottom + gap;
    if (top + h > vh - edge) top = r.top - gap - h;
    tip.style.left = `${Math.round(Math.max(edge, Math.min(r.left + r.width / 2 - w / 2, vw - w - edge)))}px`;
    tip.style.top = `${Math.round(Math.max(edge, Math.min(top, vh - h - edge)))}px`;
  }
  function show(card) {
    const text = textFor(card);
    if (!text || !card.isConnected) return;
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'stat-tip';
      tip.setAttribute('role', 'tooltip');
      /* A popover sits above open dialogs, so cards inside a dialog show their tooltip too. */
      if (tip.showPopover) tip.setAttribute('popover', 'manual');
      document.body.appendChild(tip);
    }
    tip.textContent = text;
    tip.classList.add('is-on');
    if (tip.showPopover) { try { if (tip.matches(':popover-open')) tip.hidePopover(); tip.showPopover(); } catch (e) { /* still shown by the class above */ } }
    place(card);
    current = card;
  }
  function hide() {
    clearTimeout(timer);
    timer = null;
    current = null;
    if (!tip) return;
    tip.classList.remove('is-on');
    if (tip.showPopover) { try { if (tip.matches(':popover-open')) tip.hidePopover(); } catch (e) { /* already closed */ } }
  }
  /* Phones have no hover, and these cards already show their own small note there. */
  const canHover = () => window.matchMedia('(hover: hover)').matches;

  document.addEventListener('mouseover', (ev) => {
    if (!canHover()) return;
    const card = ev.target.closest && ev.target.closest(TARGETS);
    if (card === current && card) return;
    hide();
    if (card) timer = setTimeout(() => show(card), SHOW_AFTER);
  });
  document.addEventListener('click', hide, true);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') hide(); }, true);
  window.addEventListener('hashchange', hide);
  window.addEventListener('scroll', () => { if (current || timer) hide(); }, true);
})();
