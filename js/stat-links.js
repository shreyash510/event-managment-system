/* Stat cards: clicking a card opens the page behind its number.
   One handler covers every card, so screens that draw stat cards need no extra code.
   To add a card, add a line to LINKS under its page, using the label on the card.
     to:   the page to open. Leave it out to stay on this page.
     tab:  [row of tabs, tab name], pressed once the page is open.
     find: something to scroll to, on the page.
     alt:  a page to open instead, for a role that cannot open the first one.
   Cards inside a form or a step-by-step flow stay as they are, because leaving would lose what was typed. */
(function () {
  'use strict';
  const SESSIONS_TODAY = { to: '#/checkin', tab: ['Show sessions', 'Today'] };
  const PEOPLE = { to: '#/reports', tab: ['Report views', 'People'] };
  const PROMOTIONS = { to: '#/reports', tab: ['Report views', 'Discount codes'] };
  const MONEY = { to: '#/reports', tab: ['Report views', 'Events'] };
  const REFUNDS = { to: '#/bookings/?payment=Refunded' };
  /* The Bookings list remembers its filters, so this link clears them and shows every booking. */
  const ALL_BOOKINGS = { to: '#/bookings/?view=all' };
  const ALL_SESSIONS = { to: '#/checkin', tab: ['Show sessions', 'All'] };
  const TABLE = { find: '.paged' };
  const kind = (name) => ({ tab: ['Kind of user', name] });
  const status = (name) => ({ tab: ['Subscription status', name] });
  const payments = { tab: ['Booking sections', 'Payments'] };
  const LINKS = {
    today: {
      'Sessions today': SESSIONS_TODAY,
      'Places booked': ALL_BOOKINGS,
      'Checked in': SESSIONS_TODAY,
      'Revenue today': { to: '#/reports', tab: ['Report views', 'Summary'] },
      Arrived: SESSIONS_TODAY,
      'Still to come': SESSIONS_TODAY,
      'No-shows': PEOPLE,
      'Walk-ins': SESSIONS_TODAY
    },
    checkin: {
      'Sessions today': { tab: ['Show sessions', 'Today'] },
      'Checked in today': { tab: ['Show sessions', 'Today'] },
      'Still to arrive': { tab: ['Show sessions', 'Today'] },
      'Upcoming sessions': { tab: ['Show sessions', 'Upcoming'] }
    },
    account: {
      'My venue': { to: '#/club' },
      'My venues': { to: '#/club' },
      'Events on sale': { to: '#/events' },
      'Sessions today': SESSIONS_TODAY,
      'My actions': { find: '#pf-activity' },
      'Upcoming bookings': { to: '#/mybookings', tab: ['Show bookings', 'Upcoming'] },
      'Past bookings': { to: '#/mybookings', tab: ['Show bookings', 'Past'] },
      'Waitlist places': { to: '#/mybookings' },
      Spent: { to: '#/mybookings', tab: ['Show bookings', 'All'] }
    },
    members: { Staff: kind('Staff'), Members: kind('Members'), Accounts: kind('Accounts'), Guests: kind('Guests') },
    subscriptions: {
      Active: status('Active'),
      'Payment failed': status('Payments'),
      Paused: status('Paused'),
      'Monthly income': { to: '#/plans' }
    },
    partners: {
      Partners: TABLE,
      Redemptions: { to: '#/codes' },
      'Discount given': PROMOTIONS,
      'Net revenue': PROMOTIONS
    },
    reports: {
      Gross: { tab: ['Report views', 'Events'] },
      Discounts: { tab: ['Report views', 'Discount codes'] },
      Refunds: REFUNDS,
      Net: { tab: ['Report views', 'Events'] },
      Bookings: ALL_BOOKINGS,
      'Repeat customers': { to: '#/members', tab: ['Kind of user', 'All'], alt: ALL_BOOKINGS.to },
      'No-show rate': { tab: ['Report views', 'People'] },
      'Refund rate': REFUNDS,
      'Places recovered': { to: '#/events' },
      'Checked in against booked': ALL_SESSIONS,
      'Attendance rate': ALL_SESSIONS,
      'No-shows': ALL_SESSIONS
    },
    messages: {
      'Failed sends': { find: '#set-k-table' },
      Sent: { find: '#set-k-table' }
    },
    /* One code, one partner and one booking. */
    'codes/*': {
      'Used / cap': TABLE,
      Redemptions: TABLE,
      'Paid before refunds': TABLE,
      'Discount given': PROMOTIONS,
      'Net revenue': PROMOTIONS
    },
    'partners/*': {
      Redemptions: TABLE,
      'Discount given': PROMOTIONS,
      'Paid before refunds': PROMOTIONS,
      'Net revenue': PROMOTIONS
    },
    'bookings/*': { 'Tickets paid': payments, 'Add-ons paid': payments, Refunded: payments, 'Kept after refunds': payments }
  };
  const IN_A_FLOW = 'dialog, .ev-stats, .ef-stats';

  const pageKey = () => {
    const parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
    const first = parts[0] || '';
    return ['codes', 'partners', 'bookings'].includes(first) && parts[1] && parts[1] !== 'filter' ? `${first}/*` : first;
  };
  const labelOf = (card) => {
    const el = card.querySelector(':scope > span:not(.stat-ico):not(.sr-only)');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  };
  const routeOf = (hash) => hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  /* Where this card goes for the person looking at it, or null. */
  function targetFor(card) {
    if (card.closest(IN_A_FLOW)) return null;
    const page = LINKS[pageKey()], link = page && page[labelOf(card)];
    if (!link) return null;
    if (!link.to) return link;
    if (App.canOpen(routeOf(link.to))) return link;
    return link.alt && App.canOpen(routeOf(link.alt)) ? { to: link.alt } : null;
  }
  const whereText = (link) => {
    if (link.tab) return link.tab[1];
    if (link.find) return 'the list below';
    const n = routeOf(link.to);
    return n.charAt(0).toUpperCase() + n.slice(1);
  };

  function upgrade() {
    document.querySelectorAll('#main .stat').forEach((card) => {
      const link = targetFor(card);
      card.classList.toggle('is-link', !!link);
      if (link) {
        card.setAttribute('role', 'link');
        card.tabIndex = 0;
        const value = (card.querySelector('b') || {}).textContent || '';
        card.setAttribute('aria-label', `${labelOf(card)}: ${value.trim()}. Open ${whereText(link)}.`);
      } else if (card.getAttribute('role') === 'link') {
        card.removeAttribute('role');
        card.removeAttribute('tabindex');
        card.removeAttribute('aria-label');
      }
    });
  }
  /* Screens draw in their own time, so wait for what the card needs, then give up quietly. */
  function whenReady(test, then) {
    const started = Date.now();
    const step = () => {
      const found = test();
      if (found) { then(found); return; }
      if (Date.now() - started < 1500) setTimeout(step, 30);
    };
    step();
  }
  const findTab = (group, name) => {
    const row = document.querySelector(`#main [role="group"][aria-label="${CSS.escape(group)}"]`);
    if (!row) return null;
    return [...row.querySelectorAll('.pill-tab, .ci-tab')].find((t) => {
      const copy = t.cloneNode(true);
      copy.querySelectorAll('.pill-n, .ci-tab-n, svg, .sr-only').forEach((x) => x.remove());
      return copy.textContent.trim() === name;
    }) || null;
  };
  const moveFocus = () => { const main = document.getElementById('main'); if (main) main.focus({ preventScroll: true }); };
  function finish(link) {
    if (link.tab) {
      whenReady(() => findTab(link.tab[0], link.tab[1]), (tab) => {
        const on = tab.getAttribute('aria-pressed') === 'true' || tab.hasAttribute('aria-current');
        if (!on) tab.click();
        moveFocus();
      });
    } else if (link.find) {
      whenReady(() => document.querySelector(`#main ${link.find}`), (el) => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        moveFocus();
      });
    }
  }
  function open(card) {
    const link = targetFor(card);
    if (!link) return;
    if (link.to && location.hash !== link.to) {
      if (link.tab || link.find) {
        window.addEventListener('hashchange', () => setTimeout(() => finish(link), 0), { once: true });
      }
      location.hash = link.to;
      return;
    }
    finish(link);
  }
  document.addEventListener('click', (ev) => {
    const card = ev.target.closest && ev.target.closest('.stat.is-link');
    if (!card || ev.target.closest('a, button, input, select, textarea')) return;
    /* Someone copying a number should not be sent to another page. */
    const picked = window.getSelection && String(window.getSelection());
    if (picked) return;
    open(card);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || !ev.target.matches || !ev.target.matches('.stat.is-link')) return;
    ev.preventDefault();
    open(ev.target);
  });

  /* Cards are drawn again whenever a screen changes. */
  let queued = false;
  function start() {
    const main = document.getElementById('main');
    if (!main) return;
    upgrade();
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      setTimeout(() => { queued = false; upgrade(); }, 0);
    }).observe(main, { childList: true, subtree: true });
    window.addEventListener('hashchange', () => setTimeout(upgrade, 0));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.StatLinks = { targetFor };
})();
