/* Help and guide: goes through the client's requirements document point by point, in its order and wording, and says in plain
   words how each point works. A search box finds any point. Each role only sees the steps that apply to it.

   A point: title (the document's words), req (the rest of its words, staff only), state, then the steps for each kind of reader:
   customer, staff (club managers and marketing), admin (marketing only). A point with no steps for a reader is hidden from them.
   cTitle is a plainer title for customers. words adds search terms that are not in the text.
   state: works, partly, demo (works here, but the real thing needs a live system), missing.
   Text between ** ** shows in bold. Keep this page up to date when a feature changes. */
(function () {
  'use strict';
  const STATES = {
    works: ['Works', 'good', 'You can use this now.'],
    partly: ['Part done', 'info', 'Most of this works. The steps say what is missing.'],
    demo: ['Demo only', 'warn', 'You can try it, but nothing real happens yet, such as a real payment or email.'],
    missing: ['Not built yet', 'bad', 'This is asked for, but it is not in the app yet.']
  };
  const SECTIONS = [
    { id: 'overview', title: 'Overview', points: [
      { title: 'We want customers to book events directly on our website.', state: 'demo', words: 'website booking app demo',
        customer: ['Everything you need to find and book an event is in this app.', 'This is a demo, so all the events, people and money are made up.'],
        staff: [
          'Today this is a separate demo app, not yet built into the club website. Customers reach it from a link.',
          'All the data is made up, and it is saved in this browser only, so another phone or computer will not see your changes.',
          'To see the app as someone else, use **Signed in as** at the top of the page. To start again, press **Reset demo data**.',
          'There are three kinds of user: **Marketing admin** runs every club, **Club manager** runs their own clubs, and **Normal user** is a customer.'
        ] }
    ] },
    { id: 'types', title: 'Event types', points: [
      { title: 'The system needs to handle a mix of formats: single one-off events, seasonal event series (such as Padel & Pilates), regular event series and coaching.', cTitle: 'Types of event', state: 'works', words: 'format one-off seasonal regular series coaching',
        customer: ['Some events happen once. Others are a series of sessions, such as a weekly class or coaching course.', 'Each event page shows which kind it is, and every date.'],
        staff: [
          'Every event is built the same way: an event, its sessions and its tickets.',
          'In **Events**, press **New event**. Choose **One date** or **Every week**.',
          'Press **More options** to choose the exact format: **One-off**, **Seasonal series**, **Regular series** or **Coaching**.',
          'The **Events** list has a tab for each format.'
        ] }
    ] },
    { id: 'must', title: 'Must have', points: [
      { title: 'Member discounts', req: 'Members log in and see member pricing automatically. Non-members must be able to book just as easily, via guest checkout with no account needed. Discount level should be configurable per event, e.g. 20% off, or a fixed member price.', state: 'works', words: 'member price login sign in guest checkout no account percent fixed subscription',
        customer: [
          '**Members:** press **Member sign in** at the bottom of the page. Member prices then show by themselves.',
          '**Everyone else:** you do not need an account. Enter your name and email at checkout, and pay the standard price.',
          'To become a member, create an account, then choose a plan on your profile page.'
        ],
        staff: [
          'To set the discount on an event: **Edit**, then **Step 3: Tickets and pricing**, then **Member price**.',
          'Choose **Percent off**, such as 20%, or a **Fixed price**. Each event can be different.',
          'Sign-in has no password in this demo. Anyone with a live membership counts as a member.'
        ] },
      { title: 'Discount codes', req: 'Single-use and multi-use codes for offers and partnerships, with controls for: percentage or fixed-amount discounts; expiry dates and usage caps; restricting codes to specific events, venues or event types; tracking which partner a code belongs to.', state: 'works', words: 'code voucher promo single-use multi-use percent fixed expiry cap partner redemption',
        customer: ['At checkout, type your code in **Discount code** and press **Apply**. The total changes straight away.', 'If a code cannot be used, a message says why.'],
        staff: [
          'Go to **Discount codes** and press **New code**.',
          '**Use type:** **Single-use** works once. **Multi-use** is one code many people can share.',
          '**Discount type:** a percent off, or a fixed amount off.',
          '**Limits:** set an **Expiry date** and a **Usage cap**.',
          '**Where it works:** tick certain events, clubs or event types. Leave them empty to allow all.',
          '**Partner:** choose which partner the code belongs to. A club manager can make codes for their own clubs.'
        ],
        links: [['Discount codes', '#/codes']] },
      { title: 'Block booking', cTitle: 'Book a full series', req: 'Book a series (e.g. 4-week Pilates) in a single transaction, with the option to price the block below the cost of individual sessions. Should also allow single drop-in sessions where we choose.', state: 'works', words: 'block series full series drop-in single session one payment save',
        customer: [
          'On a series, choose **Full series** to book every session left with one payment. The panel shows how much you save.',
          'Or choose **Individual session** and pick one date.'
        ],
        staff: [
          'To set this up: **Edit**, then **Step 3: Tickets and pricing**.',
          '**Block price** is the price of the full series, and it can be lower than paying for each session.',
          'Switch single sessions (drop-ins) on or off for each event.',
          'A full series takes one place in every session.',
          'In the demo, a series that has started keeps selling at a share of the price, for the sessions left.'
        ] },
      { title: 'Capacity management', req: 'Set ticket limits per session; sold-out events show clearly.', state: 'works', words: 'capacity limit places spaces sold out full',
        customer: ['Each session shows how many places are left when few remain.', 'A full session or event shows **Sold out**. You can often join its waitlist.'],
        staff: [
          '**Every session:** **Edit**, then **Step 4: Capacity**, then **Limit per session**. Change one row if a session is different.',
          '**One session:** press **Edit** on that session and change **Limit**.',
          'Places left = the limit less the people booked. For a full series, the fullest session decides.',
          'When full, it shows **Sold out** to customers and staff. Customers cannot go over the limit.',
          'Staff can still add someone to a full session by hand, with a reason.'
        ] },
      { title: 'Multi-venue', req: 'Every event tied to a venue, with customers able to filter by club.', state: 'works', words: 'venue club location filter',
        customer: ['On **Find events**, choose a club from **Venue**.', 'Each event shows its club, address and a map link.'],
        staff: [
          'Every event belongs to one club, chosen when you create it.',
          'Use **Venue** at the top of the page to look at one club or all of yours.',
          'A club manager only sees the clubs they run.'
        ],
        admin: ['Add a club in **My club**, with **Add a venue**.', 'Give someone a club in **Users**: **Add a user**, set **Role** to **Club manager**, tick their clubs and save. Check the ticks, as a club can already be ticked.'],
        links: [['My club', '#/club']] },
      { title: 'Guest information', req: 'Ability to buy multiple tickets to certain events, and control what additional guest information we need. Currently someone could buy 4 tickets and we\'d only have the information for the lead booker, so we are missing out on valuable data.', state: 'works', words: 'guest details tickets name email lead booker data missing',
        customer: [
          'Buying more than one ticket? The event may ask for each guest\'s name, or name and email.',
          'Some events ask at checkout. Others let you add them after paying, from **My bookings**.'
        ],
        staff: [
          'Set this on each event: **Edit**, then **Step 5: Guest details**.',
          '**Most tickets per booking:** how many one person can buy.',
          '**Details for each guest:** **Lead booker only**, **Name**, or **Name and email**.',
          '**When:** at checkout, or by a link after paying.',
          'Each ticket then belongs to a person. See them on a booking\'s **Guests** tab and in **Check-in**.',
          'To see who is missing details, go to **Bookings**, then **Details missing**.',
          'A guest\'s email is not permission to send them marketing: they have their own marketing choice.'
        ] }
    ] },
    { id: 'nice', title: 'Nice to have', points: [
      { title: 'Waitlists that auto-notify when a space opens', state: 'demo', words: 'waitlist queue notify offer sold out',
        customer: [
          'A waitlist is a queue for a full session. Press **Join the waitlist**. It is free and does not promise a place.',
          'When someone cancels, the first person in the queue is offered the place, and it is held for 12 hours.',
          'The offer shows in the app with **Book this place**. If it is not booked in time, it goes to the next person.',
          'No real email is sent in this demo.'
        ],
        staff: [
          'On an event page, press **Waitlist** on a session to see who is waiting. You can change the order or remove someone.',
          'When a place opens, the next person gets an offer by themselves. To stop that for a session, untick **Offer freed places automatically**.',
          '**Notify next person** sends an offer by hand.',
          'What is missing: no real email goes out, so people only see an offer in the app.'
        ] },
      { title: 'Multiple ticket tiers per event (e.g. early bird, standard)', state: 'partly', words: 'tier early bird standard price',
        customer: ['Some events have a lower price at first. You always pay the price that applies right now.'],
        staff: [
          '**Edit**, then **Step 3**, open **More pricing options**, then press **Add a tier**.',
          'Give it a name, price, number of tickets and end date. When it sells out or ends, the next price starts by itself.',
          'What is missing: customers pay the right price, but do not see the name, such as "Early bird".'
        ] },
      { title: 'Add-ons at checkout, e.g. racket hire or a protein shake', cTitle: 'Add-ons at checkout', state: 'works', words: 'add-on extra racket hire shake towel stock',
        customer: ['On the payment step, some events offer extras, such as towel or racket hire.', 'Choose how many you want, and they are added to your total. Discount codes do not come off them.'],
        staff: ['Add-ons show on the booking, with its other payments, and can be refunded on their own.', 'Choose which ones an event offers: **Edit**, then **Step 3**, then **More pricing options**.'],
        admin: ['Create them in **Settings**, then **Add-ons**: a name, price, club and stock, if there is a limit.'],
        links: [['Settings', '#/settings/setup/add-ons']] },
      { title: 'Self-serve modifying bookings', req: 'Ideally keeping to transfer only. Currently with Eventbrite we don\'t allow cancellations direct by the customer, they have to email us and we\'d like to keep that process.', cTitle: 'Change or cancel your booking', state: 'works', words: 'transfer move place self-serve cancel request change email',
        customer: [
          '**Move a place:** in **My bookings**, move to another session of the same event yourself, up to 24 hours before it starts.',
          '**Cancel:** you cannot cancel by yourself. Press **Request a change** or **Email the club**, and the club sorts it out.',
          'If you ask at least 48 hours before the session, you get your money back. After that, a refund is up to the club.'
        ],
        staff: [
          'A customer\'s move happens straight away, and shows on the booking\'s history. Staff do not approve it.',
          'Requests show on **Today**, and in **Bookings** under **Cancellation requests**.',
          'If a customer emails instead, press **Log a cancellation request** on the booking, so nothing gets lost.'
        ],
        links: [['My bookings', '#/mybookings']] },
      { title: 'Stacking rules for discounts (e.g. can a member also use a code)', state: 'partly', words: 'stacking member code combine discount rule',
        customer: ['Members can use a discount code too. It comes off their member price.'],
        staff: ['Today there is one rule: a code always comes off the member price.', 'What is missing: there is no screen to change this rule. It is fixed for now.'] },
      { title: 'Custom questions per event, e.g. skill level, dietary requirements', cTitle: 'Questions about you', state: 'works', words: 'custom question skill level dietary sensitive answers',
        customer: ['Some events ask questions when you book, such as skill level or dietary needs.'],
        staff: [
          '**Edit**, then **Step 5: Guest details**, then add a question.',
          'Choose who answers it and whether it must be answered.',
          'Mark health or dietary questions as sensitive, so answers stay hidden until staff choose to show them.',
          'Answers show on the booking and in **Check-in**.'
        ] }
    ] },
    { id: 'admin', title: 'Admin requirements', points: [
      { title: 'Our marketing and club teams need to run events day to day without developer support', state: 'partly', words: 'marketing club team developer rules settings policy',
        staff: [
          'Nearly everything in this section can be done on screen, with no developer.',
          'What is missing: refund times, limits, the lowest ticket price and the stacking rule are fixed, because the screen for them was removed.'
        ] },
      { title: 'Create, edit, duplicate and cancel events, including recurring and multi-week series', state: 'works', words: 'create new edit duplicate copy cancel recurring weekly series approval publish',
        staff: [
          '**Create:** in **Events**, press **New event** and fill in one short screen. For a series, choose **Every week** and how many weeks. **More options** opens all six steps.',
          '**Edit:** open the event and press **Edit**. Once tickets are sold, a new price only applies to new bookings.',
          '**Duplicate:** makes a copy, so you only change the dates.',
          '**Cancel:** **Cancel event** cancels it all, and **Cancel** on a session cancels one date. Give a reason, then refund people or move them to another session.',
          'A marketing admin publishes straight away. A club manager presses **Send for approval**, and customers cannot see the event until marketing approves it.'
        ],
        admin: ['New events from club managers show on **Today**. Open one, then press **Approve** or **Reject**. A rejection needs a reason, which the manager sees.'],
        links: [['Events', '#/events']] },
      { title: 'Set pricing, member pricing, block pricing and capacity per event', state: 'works', words: 'price member block capacity lowest',
        staff: [
          '**Prices:** **Edit**, then **Step 3: Tickets and pricing**. Set **Standard price**, **Block price** and **Member price**.',
          '**Capacity:** **Edit**, then **Step 4: Capacity**.',
          'A live preview shows what guests and members would pay.',
          'A club manager cannot go below the lowest ticket price of £5.'
        ] },
      { title: 'Create and manage discount codes, and see redemptions by code and partner', state: 'works', words: 'code redemption partner used report',
        staff: [
          '**By code:** in **Discount codes**, open a code to see each booking that used it, and the discount given.',
          '**By partner:** on the **Partners** tab, open a partner to see their codes, how many bookings they brought and the money involved.',
          '**Totals:** go to **Reports**, then **Discount codes**.',
          'A partner is another business that shares your code, such as a physio or juice bar. A club manager can only look at partners.'
        ],
        links: [['Discount codes', '#/codes'], ['Partners', '#/partners']] },
      { title: 'View attendee lists per session, exportable to CSV, with check-in on the day', state: 'partly', words: 'attendee list check-in door csv export download walk-in',
        staff: [
          'Go to **Check-in** and choose a session to see the list of people.',
          'Press **Check in** next to each person as they arrive. Pressed by mistake? Press **Undo**.',
          'Search by name or booking reference. **Add walk-in** adds someone who just turns up.',
          'What is missing: **there is no CSV download in the app right now.** You can only see the lists on screen.'
        ],
        links: [['Check-in', '#/checkin']] },
      { title: 'Process refunds and cancellations', state: 'demo', words: 'refund cancel money approval limit',
        staff: [
          'Open the booking in **Bookings**, then press **Refund** or **Cancel booking**. A reason is always needed.',
          'A marketing admin can give any refund.',
          'A club manager can refund up to £100, when it is at least 48 hours before the session. Anything else becomes **Send for approval**, and marketing sees it on **Today**.',
          'No real money moves in this demo.'
        ],
        links: [['Bookings', '#/bookings']] },
      { title: 'See basic reporting: bookings, revenue and discount usage by event, venue and period', state: 'partly', words: 'report revenue money bookings discount period venue export source',
        staff: [
          'Go to **Reports**. The tabs are **Summary**, **Events**, **Discount codes**, **People** and **Source**.',
          'Press **Filter** to choose the period, club, event type or event.',
          'On **Events**, group the money by event, event type, club, or member or guest.',
          'A club manager only sees their own clubs.',
          'What is missing: there is no table by week or month, and reports cannot be downloaded. To see one period, use **Filter**.'
        ],
        links: [['Reports', '#/reports']] },
      { title: 'Note: we want our front of house teams to be able to access the event bookings (to modify, cancel and download lists). Currently this sits with marketing.', state: 'missing', words: 'front of house reception desk door staff role login access',
        staff: [
          'There is no separate role for front of house teams right now.',
          'They would need a **Club manager** login. That lets them change and cancel bookings, but it also lets them change events and prices, and see reports.',
          'They cannot download lists, as there is no CSV download.'
        ] }
    ] },
    { id: 'journey', title: 'Customer journey', points: [
      { title: 'Customer browses the events page and filters by venue, date or event type.', cTitle: 'Find an event', state: 'works', words: 'browse find filter search venue date type',
        customer: [
          'Open **Find events**.',
          'Pick a type, such as Pilates or Padel, or a date: **Today**, **This week** or **This month**.',
          'Choose a club from **Venue**, or type in the search box.'
        ],
        staff: ['Customers see this with no staff menu. Use **Signed in as** and choose a normal user, or a guest link, to see it their way.'],
        links: [['Find events', '#/browse']] },
      { title: 'They open an event page with full details, price and remaining spaces.', cTitle: 'Look at the event', state: 'works', words: 'event page details price spaces places left map',
        customer: ['Open an event to see the details, dates, club address, map link and cancellation rules.', 'The **Book tickets** panel shows the price and how many places are left in each session.'],
        staff: ['For a full series, the places left only show when few remain.'] },
      { title: 'They choose a single session or the full block.', cTitle: 'Choose one session or the full series', state: 'works', words: 'single session full block series tickets hold',
        customer: [
          'Choose **Full series** or **Individual session**, then how many tickets with **−** and **+**.',
          'Press **Proceed to pay**. Your place is held for 10 minutes while you finish.'
        ],
        staff: ['The hold is a countdown only in this demo, as different devices do not share data.'] },
      { title: 'They pay at checkout on our site.', cTitle: 'Pay', state: 'demo', words: 'pay payment checkout card test stripe apple google',
        customer: [
          'Press **Continue to payment**, then fill in the secure checkout screen.',
          'No real money moves. Try these test cards: **4242 4242 4242 4242** works, **4000 0000 0000 0002** is declined, and **4000 0000 0000 9995** has no funds.',
          'Use any future expiry date and any 3 digit security code.'
        ],
        staff: ['This is a test screen only. A live system needs a real payment provider. Only the card type, last 4 digits and a receipt number are kept.'] },
      { title: 'They receive a branded confirmation and calendar invite, and their booking data lands in Klaviyo.', cTitle: 'After you book', state: 'demo', words: 'confirmation email calendar invite klaviyo branded template',
        customer: [
          'You see a confirmation page with your booking reference. Show this at the door.',
          'Press **Add to calendar** to save the dates.',
          'No real email is sent in this demo.'
        ],
        staff: ['What is missing: no real email or invite goes out, and Klaviyo is not connected.'],
        admin: [
          '**Messages**, then **Email templates**: change the wording, or press **New template** to add your own, which you send by hand with **Message** on a session.',
          '**Messages**, then **Klaviyo**: shows what would be sent to Klaviyo.'
        ],
        links: [['Messages', '#/messages']] },
      { title: 'Optional: Klaviyo sends reminders before the event and a follow-up afterwards.', state: 'demo', words: 'klaviyo reminder follow-up',
        staff: ['What is missing: nothing is connected, so no reminder or follow-up goes out.'],
        admin: ['**Messages**, then **Email templates** shows this message as **Set up in Klaviyo**. It cannot be edited here.'] },
      { title: 'The journey should be fully mobile-optimised, as most of our traffic comes from Instagram and email on mobile.', cTitle: 'Using it on a phone', state: 'partly', words: 'mobile phone instagram email responsive share link',
        customer: ['Every page is laid out to fit your phone.'],
        staff: [
          'The pages fit a phone, and **Share** on an event page gives a tracked link for Instagram or email. **Reports**, then **Source**, shows where bookings came from.',
          'What is missing: it has been checked at phone size in a browser, but not yet on a real phone.'
        ] }
    ] },
    { id: 'more', title: 'Also in the app', points: [
      { title: 'Memberships', state: 'demo', words: 'plan offer subscription payment failed pause',
        admin: [
          '**Plans and offers:** what people can subscribe to, and any money off the first payment.',
          '**Subscriptions:** each member\'s plan. You can pause, cancel or change it.',
          'The **Payments** tab shows failed, succeeded and upcoming payments. Nothing is charged by itself in this demo.'
        ],
        links: [['Subscriptions', '#/subscriptions'], ['Plans and offers', '#/plans']] },
      { title: 'See who did what', state: 'works', words: 'activity log audit history',
        admin: ['**Activity** is a record of refunds, price changes, access changes and more, with who did it and when.'],
        links: [['Activity', '#/activity']] }
    ] }
  ];

  const esc = (v) => UI.esc(v);
  const bold = (text) => esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const plain = (text) => String(text || '').replace(/\*\*/g, '');
  const reader = () => ({ admin: 'admin', manager: 'manager' }[App.role()] || 'customer');
  const INTRO = {
    customer: 'How to find an event, book it and manage your booking, step by step.',
    manager: 'Goes through the requirements point by point, and says how each one works.',
    admin: 'Goes through the requirements point by point, and says how each one works.'
  };
  /* The steps this reader gets for a point, in groups. */
  function groupsFor(p) {
    const me = reader();
    if (me === 'customer') return p.customer ? [{ steps: p.customer }] : [];
    const out = [];
    if (p.customer) out.push({ label: 'What customers do', steps: p.customer });
    const staff = (p.staff || []).concat(me === 'admin' ? p.admin || [] : []);
    if (staff.length) out.push({ label: p.customer ? 'What staff do' : '', steps: staff });
    return out;
  }
  const keyOf = (href) => href.replace(/^#\//, '').split('/')[0];
  function pointHtml(p, n) {
    const st = STATES[p.state], staffView = reader() !== 'customer', groups = groupsFor(p);
    const title = !staffView && p.cTitle ? p.cTitle : p.title;
    const links = (p.links || []).filter(([, href]) => App.canOpen(keyOf(href)));
    const text = [title, staffView ? p.req : '', p.words, groups.map((g) => g.steps.map(plain).join(' ')).join(' ')].join(' ').toLowerCase();
    return `<article class="card help-point" data-text="${esc(text)}">
      <div class="help-point-head"><h3><span class="help-n" aria-hidden="true">${n}</span>${esc(title)}</h3>${UI.badge(st[0], st[1])}</div>
      ${staffView && p.req ? `<p class="help-req">${esc(p.req)}</p>` : ''}
      ${groups.map((g) => `${g.label ? `<h4 class="help-who">${esc(g.label)}</h4>` : ''}<ol class="help-steps">${g.steps.map((s) => `<li>${bold(s)}</li>`).join('')}</ol>`).join('')}
      ${links.length ? `<p class="help-links">${links.map(([label, href]) => `<a class="btn btn-small" href="${esc(href)}">Go to ${esc(label)}</a>`).join(' ')}</p>` : ''}
    </article>`;
  }
  function visibleSections() {
    return SECTIONS.map((x) => Object.assign({}, x, { points: x.points.filter((p) => groupsFor(p).length) })).filter((x) => x.points.length);
  }
  function render(main) {
    const sections = visibleSections();
    const used = new Set(sections.flatMap((x) => x.points.map((p) => p.state)));
    main.innerHTML = `<div class="help-screen">
      ${UI.pageHead('Help and guide', '', INTRO[reader()], false)}
      <div class="help-search">
        <label for="help-q">Search this guide</label>
        <input id="help-q" type="search" autocomplete="off" placeholder="Try refund, waitlist or capacity" data-tip="Type any word to find the points about it.">
        <p class="hint" id="help-found" role="status"></p>
      </div>
      <nav class="help-jump" id="help-jump" aria-label="Parts of this guide">${sections.map((x) => `<button type="button" class="btn btn-small" data-jump="${esc(x.id)}">${esc(x.title)}</button>`).join('')}</nav>
      <dl class="help-key" id="help-key">${Object.keys(STATES).filter((k) => used.has(k)).map((k) => `<div><dt>${UI.badge(STATES[k][0], STATES[k][1])}</dt><dd>${esc(STATES[k][2])}</dd></div>`).join('')}</dl>
      ${sections.map((x) => `<section class="help-section" id="help-${esc(x.id)}" tabindex="-1" aria-labelledby="help-h-${esc(x.id)}">
        <h2 id="help-h-${esc(x.id)}">${esc(x.title)}</h2>
        ${x.points.map((p, i) => pointHtml(p, i + 1)).join('')}
      </section>`).join('')}
      <p class="help-none" id="help-none" hidden>Nothing found. Try a shorter word, such as "code" or "refund".</p>
    </div>`;
    const search = main.querySelector('#help-q'), found = main.querySelector('#help-found'), none = main.querySelector('#help-none');
    const all = [...main.querySelectorAll('.help-point')];
    search.addEventListener('input', () => {
      const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      all.forEach((el) => {
        const hit = words.every((w) => el.dataset.text.includes(w));
        el.hidden = !hit;
        if (hit) shown++;
      });
      main.querySelectorAll('.help-section').forEach((s) => { s.hidden = !s.querySelector('.help-point:not([hidden])'); });
      const searching = words.length > 0;
      found.textContent = searching ? `${shown} ${shown === 1 ? 'point' : 'points'} found` : '';
      none.hidden = !searching || shown > 0;
      main.querySelector('#help-jump').hidden = searching;
      main.querySelector('#help-key').hidden = searching;
    });
    main.querySelector('#help-jump').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-jump]');
      if (!b) return;
      const to = main.querySelector(`#help-${CSS.escape(b.dataset.jump)}`);
      if (to) { to.scrollIntoView({ block: 'start' }); to.focus({ preventScroll: true }); }
    });
  }
  App.route('help', { title: 'Help and guide', perm: 'help', render });
})();
