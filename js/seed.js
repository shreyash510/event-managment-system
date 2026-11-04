/* Made-up demo data. Dates are set from the day the data is created so "Today" always has sessions. */
(function (root) {
  'use strict';
  const Core = root.Core || (typeof require !== 'undefined' ? require('./core.js') : null);

  function build(now) {
    const today = Core.dayKey(now);
    const at = (offset, time) => Core.addDays(`${today}T${time}`, offset);
    const notFuture = (d) => (d > now ? new Date(now.getTime()) : d);
    const when = (offset) => notFuture(new Date(at(offset, '10:00')));
    const ADMIN = 'Marketing admin (demo user)', RIVER_MGR = 'Club manager (demo user)';
    /* One club manager, for Riverside and Northgate. Harbour has no manager, so only the marketing admin runs it. */
    const NORTH_MGR = RIVER_MGR, HARBOUR_MGR = ADMIN;
    /* A session later today if there is still time, so the Today screen has something coming up. */
    const laterToday = (time) => {
      const base = new Date(at(0, time)), soon = new Date(now.getTime() + 2 * 3600000);
      if (base >= soon) return at(0, time);
      return Core.dayKey(soon) === today ? Core.toLocalISO(soon) : at(0, '23:45');
    };
    const s = {
      version: 1, seq: 0, refSeq: 0, createdAt: Core.toLocalISO(now),
      venues: [
        { id: 'v1', name: 'Riverside Club', city: 'Riverside', address: '1 River Walk, Riverside', contact: 'riverside@example.com' },
        { id: 'v2', name: 'Northgate Club', city: 'Northgate', address: '20 North Gate, Northgate', contact: 'northgate@example.com' },
        { id: 'v3', name: 'Harbour Club', city: 'Harbour', address: '5 Quay Side, Harbour', contact: 'harbour@example.com' }
      ],
      eventTypes: [
        /* template: what a new event of this type starts with, so a normal event takes a minute to set up. */
        { id: 'ty1', name: 'Pilates', template: { price: 15, capacity: 12, durationMin: 60, maxPerBooking: 2, guestDetails: 'name', questions: [{ label: 'Any injuries we should know about?', type: 'text', required: false, scope: 'guest', options: [] }] } },
        { id: 'ty2', name: 'Padel', template: { price: 20, capacity: 8, durationMin: 90, maxPerBooking: 4, guestDetails: 'name', questions: [{ label: 'Skill level', type: 'choice', required: true, scope: 'guest', options: ['Beginner','Improver','Advanced'] }] } },
        { id: 'ty3', name: 'Running', template: { price: 8, capacity: 25, durationMin: 60, maxPerBooking: 4, guestDetails: 'lead', questions: [] } },
        { id: 'ty4', name: 'Social', template: { price: 25, capacity: 40, durationMin: 180, maxPerBooking: 6, guestDetails: 'nameEmail', questions: [{ label: 'Dietary needs', type: 'text', required: false, scope: 'guest', options: [] }] } },
        { id: 'ty5', name: 'Wellness', template: { price: 18, capacity: 15, durationMin: 75, maxPerBooking: 2, guestDetails: 'name', questions: [] } }
      ],
      users: [
        { id: 'u1', name: ADMIN, role: 'admin', venueId: null, venueIds: [] },
        /* Works across two clubs, so the venue switcher offers just those two. */
        { id: 'u2', name: RIVER_MGR, role: 'manager', venueId: 'v1', venueIds: ['v1', 'v2'] },
        /* Reception works the desk and the door, only at the venue they are linked to. */
        { id: 'u4', name: 'Riverside Reception', email: 'reception.riverside@example.com', role: 'reception', venueId: 'v1', venueIds: ['v1'] },
        { id: 'u5', name: 'Northgate Reception', email: 'reception.northgate@example.com', role: 'reception', venueId: 'v2', venueIds: ['v2'] },
        /* Name and email are filled in from a real customer once the bookings exist (see the end of build). */
        { id: 'u3', name: 'Normal user (demo user)', role: 'user', venueId: null, venueIds: [] }
      ],
      currentUserId: 'u1',
      settings: {
        stacking: 'lower', transferRule: 'event',
        policy: { refundHours: 48, refundFee: 0, transferHours: 24, transferFee: 0 },
        releaseCodeOnCancel: true, lowSpaceThreshold: 3, waitlistClaimHours: 12, holdMinutes: 10,
        /* Business rules: club managers refund up to this without approval; discounts never take a ticket below the floor;
           guest details and answers are cleared this many days after an event ends. */
        managerRefundLimit: 100, receptionRefundLimit: 20, goodwillMax: 20, minTicketPrice: 5, retentionDays: 365
      },
      events: [], bookings: [], codes: [], codeHolds: [], partners: [], waitlist: [], klaviyoLog: [], audit: [],
      addOns: [
        { id: 'ad1', name: 'Racket hire', price: 5, venueId: 'v1', stock: 8 },
        { id: 'ad2', name: 'Protein shake', price: 4, venueId: 'v1', stock: null },
        { id: 'ad3', name: 'Racket hire', price: 5, venueId: 'v2', stock: 6 },
        { id: 'ad4', name: 'Towel hire', price: 2, venueId: 'v3', stock: null },
        { id: 'ad5', name: 'Towel hire', price: 2, venueId: 'v2', stock: null },
        { id: 'ad6', name: 'Wetsuit hire', price: 9, venueId: 'v3', stock: 12 }
      ],
      emailTemplates: [
        { id: 'tpl1', name: 'Booking confirmation', when: 'Right after payment', owner: 'This system', subject: 'You are booked in: {{event}}', body: 'Hi {{first_name}}, your place is confirmed for {{event}} at {{venue}} on {{date}}. Your calendar invite is attached. Booking reference: {{ref}}.' },
        { id: 'tpl2', name: 'Guest details request', when: 'After booking, when the event collects details by link', owner: 'This system', subject: 'Who is coming with you to {{event}}?', body: 'Hi {{first_name}}, please add the details for your guests here: {{link}}. It takes under a minute.' },
        { id: 'tpl3', name: 'Booking changed', when: 'After a transfer or a change by staff', owner: 'This system', subject: 'Your booking has changed: {{event}}', body: 'Hi {{first_name}}, your booking {{ref}} is now for {{date}} at {{venue}}. An updated calendar invite is attached.' },
        { id: 'tpl4', name: 'Booking cancelled and refund', when: 'After staff cancel a booking or a session', owner: 'This system', subject: 'Your booking has been cancelled: {{event}}', body: 'Hi {{first_name}}, your booking {{ref}} has been cancelled. Refund: {{amount}}. It can take a few working days to reach you.' },
        { id: 'tpl5', name: 'Waitlist space open', when: 'When staff notify the next person', owner: 'This system', subject: 'A space has opened: {{event}}', body: 'Hi {{first_name}}, a place is free on {{date}}. It is held for you for {{hours}} hours: {{link}}.' },
        { id: 'tpl6', name: 'Event reminder and follow-up', when: 'Before and after the event', owner: 'Klaviyo', subject: 'Set up in Klaviyo', body: 'These messages are built in Klaviyo using the booking data sent from this system.' }
      ]
    };

    /* Simple repeatable random numbers, so every reset gives the same data. */
    let r = 12345;
    const rnd = (n) => { r = (r * 1664525 + 1013904223) >>> 0; return (r >>> 16) % n; };
    const first = ['Maya', 'Leo', 'Nina', 'Omar', 'Ruth', 'Theo', 'Isla', 'Kofi', 'Elena', 'Jonah', 'Zara', 'Felix', 'Amara', 'Ben', 'Clara', 'Dev', 'Erin', 'Hugo', 'Ivy', 'Joel', 'Lena', 'Max', 'Noor', 'Owen', 'Pia', 'Reza', 'Tara', 'Uma', 'Wes', 'Yara'];
    const last = ['Adams', 'Brook', 'Chen', 'Dale', 'Evans', 'Frost', 'Gill', 'Hart', 'Iqbal', 'Jones', 'Khan', 'Lowe', 'Mills', 'Nash', 'Okoro', 'Patel', 'Quinn', 'Reid', 'Shaw', 'Turner', 'Usman', 'Vale', 'Walsh', 'Young'];
    let personN = 0;
    const person = (isMember) => {
      const a = first[(personN * 7 + 3) % first.length], c = last[(personN * 5 + 1) % last.length];
      personN++;
      return { name: `${a} ${c}`, email: `${a}.${c}${personN}@example.com`.toLowerCase(), phone: `07700 900${String(100 + personN).slice(-3)}`, isMember: !!isMember, marketingConsent: rnd(3) > 0 };
    };
    const guestFrom = (extra) => { const g = person(false); return Object.assign({ name: g.name, email: g.email, marketingConsent: g.marketingConsent }, extra); };

    const makeEvent = (o) => {
      const e = Object.assign({
        id: Core.nextId(s, 'e'), description: '', image: '', draft: false, cancelled: false, salesClosed: false, salesOpenAt: '', salesCloseAt: '',
        memberPricing: { mode: 'none', value: 0, blockValue: null, applyToDropin: true, applyToBlock: false }, memberCoversGuests: false,
        block: { enabled: false, price: 0 }, dropInsEnabled: true, guestDetails: 'lead', collectAt: 'checkout',
        questions: [], maxPerBooking: 6, waitlistOn: true
      }, o);
      e.tickets = (o.tickets || []).map((t) => ({ id: Core.nextId(s, 'tt'), name: t.name, price: t.price, salesEnd: t.salesEnd || '' }));
      e.sessions = (o.sessions || []).map((x) => ({ id: Core.nextId(s, 's'), start: x.start, durationMin: x.durationMin || 60, capacity: x.capacity, cancelled: false }));
      s.events.push(e);
      return e;
    };
    const weekly = (startOffset, time, count, capacity, durationMin) => Array.from({ length: count }, (_, i) => ({ start: at(startOffset + i * 7, time), capacity, durationMin }));
    const CHANNELS = ['Instagram', 'Instagram', 'Instagram', 'Email', 'Email', 'Direct', 'Direct'];
    const book = (e, o) => {
      const ids = o.sessionIds || (o.kind === 'block' ? e.sessions.filter((x) => !x.cancelled).map((x) => x.id) : [e.sessions[0].id]);
      return Core.createBooking(s, {
        event: e, kind: o.kind || 'dropin', sessionIds: ids, ticketTypeId: o.ticketTypeId || (e.tickets[0] && e.tickets[0].id),
        customer: o.customer || person(o.member), guests: o.guests, code: o.code || null, payment: o.payment, source: o.source, by: o.by,
        now: notFuture(new Date(at(-(o.daysAgo === undefined ? 5 : o.daysAgo), '10:00'))), comp: o.comp, compReason: o.compReason,
        channel: o.channel || (o.code && o.code.partnerId ? 'Partner' : CHANNELS[rnd(CHANNELS.length)])
      });
    };

    /* Partners and codes */
    const p1 = { id: 'pt1', name: 'Stride Physio', contact: 'hello@stride-physio.example.com', notes: 'Offer for their patients.', cost: { type: 'percent', value: 10 } };
    const p2 = { id: 'pt2', name: 'Urban Juice Bar', contact: 'team@urbanjuice.example.com', notes: 'Shared offer in store.', cost: { type: 'fixed', value: 1.5 } };
    const p3 = { id: 'pt3', name: 'Courtside Sports', contact: 'sales@courtside.example.com', notes: 'Padel equipment partner.', cost: { type: 'percent', value: 12 } };
    s.partners.push(p1, p2, p3);
    const makeCode = (o) => {
      const c = Object.assign({ id: Core.nextId(s, 'c'), code: '', type: 'percent', value: 0, kind: 'multi', usageCap: null, expiresAt: '', eventIds: [], venueIds: [], typeIds: [], partnerId: null, paused: false, batchId: null, createdAt: at(-60, '09:00') }, o);
      s.codes.push(c);
      return c;
    };
    const cStride = makeCode({ code: 'STRIDE20', type: 'percent', value: 20, usageCap: 100, expiresAt: at(90, '23:59'), partnerId: p1.id, typeIds: ['ty1', 'ty5'] });
    const cJuice = makeCode({ code: 'JUICE5', type: 'fixed', value: 5, usageCap: 200, expiresAt: at(60, '23:59'), partnerId: p2.id });
    const cCourt = makeCode({ code: 'COURT15', type: 'percent', value: 15, usageCap: 50, expiresAt: at(45, '23:59'), partnerId: p3.id, typeIds: ['ty2'], venueIds: ['v1'] });
    const cSummer = makeCode({ code: 'SUMMER10', type: 'percent', value: 10, expiresAt: at(-30, '23:59') });
    makeCode({ code: 'SOFTLAUNCH', type: 'fixed', value: 10, paused: true });
    const cWelcome = makeCode({ code: 'WELCOME-7KQ2MP', type: 'fixed', value: 5, kind: 'single', usageCap: 1, expiresAt: at(30, '23:59'), batchId: 'batch-welcome' });
    makeCode({ code: 'WELCOME-H4T9XW', type: 'fixed', value: 5, kind: 'single', usageCap: 1, expiresAt: at(30, '23:59'), batchId: 'batch-welcome' });
    makeCode({ code: 'WELCOME-R8NC3D', type: 'fixed', value: 5, kind: 'single', usageCap: 1, expiresAt: at(30, '23:59'), batchId: 'batch-welcome' });

    /* 1. The worked example: limit 12, 8 block places sold, 3 drop-ins in week 2. */
    const pilates = makeEvent({
      title: 'Autumn Pilates (4 weeks)', venueId: 'v1', format: 'Regular series', typeId: 'ty1',
      description: 'Four weekly Pilates classes. All levels welcome. Mats provided.',
      tickets: [{ name: 'Standard', price: 15 }], sessions: weekly(5, '09:30', 4, 12, 50),
      memberPricing: { mode: 'percent', value: 20, blockValue: null, applyToBlock: true },
      block: { enabled: true, price: 48 }, guestDetails: 'name',
      questions: [{ id: 'q1', label: 'Any injuries we should know about?', type: 'text', required: false, scope: 'guest', options: [], sensitive: true }]
    });
    const pilatesBlocks = [
      book(pilates, { kind: 'block', member: true, daysAgo: 12 }),
      book(pilates, { kind: 'block', member: false, daysAgo: 11 }),
      book(pilates, { kind: 'block', member: false, code: cStride, daysAgo: 10 }),
      book(pilates, { kind: 'block', member: true, daysAgo: 9 }),
      book(pilates, { kind: 'block', member: true, daysAgo: 8 }),
      book(pilates, { kind: 'block', member: false, daysAgo: 6 }),
      book(pilates, { kind: 'block', member: false, guests: [{}], daysAgo: 4 })
    ];
    const week2 = pilates.sessions[1].id;
    book(pilates, { sessionIds: [week2], member: true, daysAgo: 3 });
    book(pilates, { sessionIds: [week2], member: false, daysAgo: 2 });
    book(pilates, { sessionIds: [week2], member: false, daysAgo: 1 });
    pilatesBlocks[1].requests.push({ id: Core.nextId(s, 'rq'), at: at(-1, '11:20'), by: ADMIN, source: 'Email', note: 'Customer emailed: cannot make week 3 and asks to cancel that class.', status: 'Open' });
    Core.logBooking(pilatesBlocks[1], when(-1), ADMIN, 'Cancellation request logged from an email.');

    /* 2. One-off today, nearly full, with a group that has guest details missing. */
    const social = makeEvent({
      title: 'Padel Social Night', venueId: 'v1', format: 'One-off', typeId: 'ty2',
      description: 'Friendly mixed games, with a drink at the end.',
      tickets: [{ name: 'Standard', price: 20 }], sessions: [{ start: laterToday('19:00'), capacity: 16, durationMin: 120 }],
      memberPricing: { mode: 'fixed', value: 16, blockValue: null, applyToBlock: false }, guestDetails: 'nameEmail', collectAt: 'link',
      questions: [{ id: 'q2', label: 'Skill level', type: 'choice', required: true, scope: 'guest', options: ['New to padel', 'Some games', 'Regular player'], sensitive: false }]
    });
    const skills = ['New to padel', 'Some games', 'Regular player'];
    for (let i = 0; i < 6; i++) {
      const b = book(social, { member: i % 2 === 0, code: i === 3 ? cCourt : null, daysAgo: 9 - i });
      b.people[0].answers.q2 = skills[i % 3];
    }
    const group = book(social, { member: false, guests: [{ name: 'Rosa Bell' }, {}, {}], daysAgo: 3 });
    group.people[0].answers.q2 = 'Some games';
    group.requests.push({ id: Core.nextId(s, 'rq'), at: Core.toLocalISO(notFuture(new Date(at(0, '08:40')))), by: RIVER_MGR, source: 'Email', note: 'Lead booker asks if one of their guests can get a refund.', status: 'Open' });
    const pair = book(social, { member: true, guests: [{ name: 'Sol Pryce', email: 'sol.pryce@example.com', answers: { q2: 'Regular player' } }], daysAgo: 2 });
    pair.people[0].answers.q2 = 'Regular player';
    book(social, { member: false, code: cWelcome, daysAgo: 1 }).people[0].answers.q2 = 'New to padel';
    const shakes = book(social, { member: false, daysAgo: 1 });
    shakes.people[0].answers.q2 = 'Some games';
    Core.addAddOn(s, shakes, s.addOns[0], 1, { by: 'Customer', now: when(-1) });
    Core.addAddOn(s, shakes, s.addOns[1], 1, { by: 'Customer', now: when(-1) });
    Core.addAddOn(s, pair, s.addOns[0], 2, { by: 'Customer', now: when(-2) });

    /* 3. Morning run club: weekly drop-ins, some check-ins today. */
    const run = makeEvent({
      title: 'Morning Run Club', venueId: 'v2', format: 'Regular series', typeId: 'ty3',
      description: 'A 5K group run from the club door. All paces welcome.',
      tickets: [{ name: 'Standard', price: 8 }], sessions: [-14, -7, 0, 7, 14].map((d) => ({ start: at(d, '07:30'), capacity: 20, durationMin: 45 })),
      memberPricing: { mode: 'percent', value: 50, blockValue: null, applyToBlock: false }
    });
    run.sessions.forEach((x, i) => {
      const n = [14, 12, 9, 4, 2][i];
      for (let k = 0; k < n; k++) {
        const b = book(run, { sessionIds: [x.id], member: k % 3 === 0, code: k === 2 && i < 3 ? cJuice : null, daysAgo: Math.max(1, 16 - i * 4 - k % 2) });
        if (i < 2) b.tickets[0].checkedInAt = x.start;
        if (i === 2 && k < 5) b.tickets[0].checkedInAt = x.start;
      }
    });

    /* 4. Coaching course: no drop-ins, sold out, with a waitlist. */
    const coach = makeEvent({
      title: 'Padel Coaching: Beginners', venueId: 'v1', format: 'Coaching', typeId: 'ty2',
      description: 'Six weekly small group lessons with a club coach.',
      tickets: [{ name: 'Standard', price: 30 }], sessions: [-14, -7, 0, 7, 14, 21].map((d) => ({ start: at(d, '18:00'), capacity: 6, durationMin: 60 })),
      memberPricing: { mode: 'percent', value: 10, blockValue: null, applyToBlock: true }, block: { enabled: true, price: 150 }, dropInsEnabled: false, maxPerBooking: 2,
      questions: [{ id: 'q3', label: 'Have you played before?', type: 'choice', required: false, scope: 'guest', options: ['No', 'A little', 'Yes'], sensitive: false }]
    });
    for (let i = 0; i < 6; i++) {
      const b = book(coach, { kind: 'block', member: i < 2, code: i === 5 ? cCourt : null, daysAgo: 30 - i });
      b.tickets.forEach((t) => {
        const st = Core.findSession(s, t.sessionId).session.start;
        if (new Date(st) < when(-1)) t.checkedInAt = st;
      });
    }
    const coachToday = coach.sessions[2].id;
    s.waitlist.push(
      { id: Core.nextId(s, 'w'), sessionId: coachToday, name: 'Kit Marlow', email: 'kit.marlow@example.com', joinedAt: at(-6, '12:10'), status: 'Waiting', offerUntil: '' },
      { id: Core.nextId(s, 'w'), sessionId: coachToday, name: 'Ash Doyle', email: 'ash.doyle@example.com', joinedAt: at(-4, '17:45'), status: 'Waiting', offerUntil: '' }
    );

    /* 5. Supper with ticket tiers and a dietary question. */
    const supper = makeEvent({
      title: 'Founders Supper', venueId: 'v3', format: 'One-off', typeId: 'ty4',
      description: 'Three-course supper on the terrace with a short talk.',
      tickets: [{ name: 'Early bird', price: 30, salesEnd: at(-3, '23:59') }, { name: 'Standard', price: 40 }],
      sessions: [{ start: at(10, '19:30'), capacity: 30, durationMin: 150 }],
      memberPricing: { mode: 'percent', value: 10, blockValue: null, applyToBlock: false }, guestDetails: 'nameEmail',
      questions: [{ id: 'q4', label: 'Dietary needs', type: 'text', required: true, scope: 'guest', options: [], sensitive: true }]
    });
    for (let i = 0; i < 12; i++) {
      const tier = i < 7 ? supper.tickets[0].id : supper.tickets[1].id;
      const guests = i % 3 === 0 ? [guestFrom({ answers: { q4: i % 2 ? 'None' : 'Vegetarian' } })] : (i % 4 === 1 ? [{ name: 'Morgan Tate' }] : []);
      const b = book(supper, { ticketTypeId: tier, member: i % 2 === 0, guests, code: i === 4 ? cJuice : null, daysAgo: 20 - i });
      b.people[0].answers.q4 = i % 2 ? 'None' : 'Vegan';
    }
    for (let i = 0; i < 9; i++) {
      book(supper, { ticketTypeId: supper.tickets[1].id, member: false, daysAgo: 2 }).people[0].answers.q4 = 'None';
    }

    /* 6. Draft */
    makeEvent({
      title: 'Winter Yoga Day', venueId: 'v3', format: 'One-off', typeId: 'ty5', draft: true, description: 'A slow day of yoga and rest. Details to be confirmed.',
      tickets: [{ name: 'Standard', price: 55 }], sessions: [{ start: at(45, '10:00'), capacity: 20, durationMin: 300 }]
    });

    /* 7. Past tournament for report history */
    const tourn = makeEvent({
      title: 'Summer Padel Tournament', venueId: 'v1', format: 'One-off', typeId: 'ty2',
      tickets: [{ name: 'Standard', price: 25 }], sessions: [{ start: at(-75, '10:00'), capacity: 32, durationMin: 360 }],
      memberPricing: { mode: 'fixed', value: 20, blockValue: null, applyToBlock: false }
    });
    for (let i = 0; i < 14; i++) {
      const b = book(tourn, { member: i % 2 === 1, guests: i % 2 === 0 ? [guestFrom()] : [], code: i === 4 ? cSummer : null, daysAgo: 90 - i });
      b.tickets.forEach((t) => { if (i !== 9) t.checkedInAt = at(-75, '09:50'); });
    }

    /* 8. Cancelled event, all refunded */
    const wine = makeEvent({
      title: 'Wine Tasting Evening', venueId: 'v2', format: 'One-off', typeId: 'ty4',
      tickets: [{ name: 'Standard', price: 35 }], sessions: [{ start: at(-20, '19:00'), capacity: 24, durationMin: 120 }],
      memberPricing: { mode: 'percent', value: 15, blockValue: null, applyToBlock: false }
    });
    for (let i = 0; i < 5; i++) book(wine, { member: i < 2, daysAgo: 35 - i });
    Core.cancelSessions(s, wine, wine.sessions.map((x) => x.id), { refund: true, reason: 'Host not available', by: ADMIN, now: when(-25) });
    wine.cancelled = true;

    /* 9. Scheduled: sales open later */
    makeEvent({
      title: 'Christmas Wreath Workshop', venueId: 'v3', format: 'One-off', typeId: 'ty4', salesOpenAt: at(3, '09:00'),
      description: 'Make your own wreath. All materials included.',
      tickets: [{ name: 'Standard', price: 45 }], sessions: [{ start: at(30, '14:00'), capacity: 15, durationMin: 120 }],
      memberPricing: { mode: 'fixed', value: 38, blockValue: null, applyToBlock: false }
    });

    /* 10. Sales closed by staff */
    const swim = makeEvent({
      title: 'Harbour Sea Swim', venueId: 'v3', format: 'Regular series', typeId: 'ty5', salesClosed: true,
      description: 'A guided cold-water swim. Sales are closed while safety checks are done.',
      tickets: [{ name: 'Standard', price: 12 }], sessions: [-21, -14, -7, 7].map((d) => ({ start: at(d, '08:00'), capacity: 10, durationMin: 45 })),
      memberPricing: { mode: 'percent', value: 25, blockValue: null, applyToBlock: false }
    });
    swim.sessions.forEach((x, i) => { for (let k = 0; k < [7, 8, 6, 3][i]; k++) book(swim, { sessionIds: [x.id], member: k % 2 === 0, daysAgo: 24 - i * 3 }); });

    /* 11. Seasonal series at Northgate, with a refund of one session from a block. */
    const season = makeEvent({
      title: 'Padel & Pilates Season', venueId: 'v2', format: 'Seasonal series', typeId: 'ty1',
      description: 'Eight weeks of padel drills and Pilates, one session a week.',
      tickets: [{ name: 'Standard', price: 18 }], sessions: weekly(-28, '12:30', 8, 10, 75),
      memberPricing: { mode: 'percent', value: 20, blockValue: null, applyToBlock: true }, block: { enabled: true, price: 120 }, guestDetails: 'name'
    });
    const seasonBlocks = [];
    for (let i = 0; i < 6; i++) seasonBlocks.push(book(season, { kind: 'block', member: i % 2 === 0, code: i === 1 ? cStride : null, daysAgo: 40 - i }));
    book(season, { sessionIds: [season.sessions[4].id], member: false, daysAgo: 2 });
    book(season, { sessionIds: [season.sessions[5].id], member: true, daysAgo: 1 });
    const rt = seasonBlocks[3].tickets[5];
    Core.refund(s, seasonBlocks[3], { ticketIds: [rt.id], amount: rt.paid, reason: 'Medical note for one session', by: NORTH_MGR, freePlaces: true, now: when(-2) });

    /* 12. Past block for report history, with one goodwill part refund. */
    const spring = makeEvent({
      title: 'Spring Pilates (4 weeks)', venueId: 'v1', format: 'Regular series', typeId: 'ty1',
      tickets: [{ name: 'Standard', price: 15 }], sessions: weekly(-70, '09:30', 4, 12, 50),
      memberPricing: { mode: 'percent', value: 20, blockValue: null, applyToBlock: true }, block: { enabled: true, price: 48 }
    });
    const springBlocks = [];
    for (let i = 0; i < 9; i++) {
      const b = book(spring, { kind: 'block', member: i % 2 === 0, daysAgo: 80 - i });
      b.tickets.forEach((t) => { t.checkedInAt = Core.findSession(s, t.sessionId).session.start; });
      springBlocks.push(b);
    }
    Core.refund(s, springBlocks[2], { ticketIds: springBlocks[2].tickets.map((t) => t.id), amount: 5, reason: 'Goodwill: class started late', by: RIVER_MGR, freePlaces: false, now: when(-50) });

    /* ---------- More demo data, so every screen has plenty in all three venues ---------- */
    const SEED_NOW = now;
    const dayOffset = (iso) => Math.round((new Date(`${Core.dayKey(iso)}T12:00`) - new Date(`${today}T12:00`)) / 86400000);
    const afterBooking = (b, days) => { const d = new Date(b.createdAt); d.setDate(d.getDate() + days); return d > SEED_NOW ? new Date(SEED_NOW.getTime() - 3600000) : d; };
    const describe = (iso) => iso.replace('T', ' ');
    const staffOf = { v1: [RIVER_MGR, RIVER_MGR], v2: [NORTH_MGR, NORTH_MGR], v3: [HARBOUR_MGR, HARBOUR_MGR] };
    const addOnsOf = { v1: 'ad2', v2: 'ad5', v3: 'ad4' };
    const TEXT_ANSWERS = ['None', 'Vegetarian', 'Sore left knee', 'No nuts please', 'Nothing to add'];

    /* Regular customers come back, so a search on one person finds several bookings. */
    const regulars = {};
    ['v1', 'v2', 'v3'].forEach((v) => { regulars[v] = [person(true), person(true), person(false)]; });

    const leavesGaps = (i) => i % 6 === 2 || i % 10 === 4;
    const answerAll = (b, e, i) => {
      (e.questions || []).forEach((q, k) => {
        b.people.forEach((p, pi) => {
          if (q.scope === 'booking' && !p.isLead) return;
          if (!p.isLead && e.guestDetails === 'lead') return;
          if (!p.isLead && leavesGaps(i)) return; /* some guests have not answered yet */
          if (q.type === 'choice') p.answers[q.id] = q.options[(i + k + pi) % q.options.length];
          else if (q.type === 'tick') { if ((i + pi) % 2 === 0) p.answers[q.id] = 'Yes'; }
          else p.answers[q.id] = TEXT_ANSWERS[(i + k + pi) % TEXT_ANSWERS.length];
        });
      });
    };
    /* Sells places until there are n of them on the session (or block), with a mix of member, guest, group and staff bookings. */
    const fill = (e, sessionIds, n, o) => {
      const opts = o || {};
      const codes = (opts.codes || []).slice();
      const every = opts.codeEvery || 3;
      const staff = staffOf[e.venueId];
      const list = [];
      const firstOffset = Math.min(...sessionIds.map((id) => dayOffset(Core.findSession(s, id).session.start)));
      const maxGroup = Math.min(e.maxPerBooking || 6, opts.maxGroup === undefined ? 4 : opts.maxGroup);
      let places = 0, i = 0;
      while (places < n) {
        const room = n - places;
        const wanted = i % 5 === 4 ? 1 + (i % 3) + 1 : 1;
        const size = Math.max(1, Math.min(room, wanted, maxGroup));
        const guests = [];
        for (let g = 1; g < size; g++) {
          guests.push(e.guestDetails === 'lead' || !leavesGaps(i) ? guestFrom() : {});
        }
        const byPhone = i % 7 === 3, walkIn = i % 7 === 5 && firstOffset <= 0, comp = i % 13 === 6 && !opts.noComp;
        const useCode = !comp && i % every === 1 && codes.length ? codes.shift() : null;
        const repeat = i % 8 === 2 && !useCode;
        const daysAgo = walkIn ? Math.max(0, -firstOffset) : Math.max(1, -firstOffset + 1 + (i * 3) % 12);
        const fields = {
          sessionIds, kind: opts.kind || 'dropin', guests, code: useCode, daysAgo, ticketTypeId: opts.ticketTypeId ? opts.ticketTypeId(i) : undefined,
          customer: repeat ? regulars[e.venueId][i % 3] : undefined, member: i % 3 === 0
        };
        if (byPhone || walkIn || comp) {
          fields.by = staff[i % 2]; fields.source = comp ? 'Staff' : (walkIn ? 'Walk-in' : 'Phone'); fields.channel = 'Direct';
          fields.payment = walkIn && i % 2 ? 'Cash' : 'Card';
        }
        if (comp) { fields.comp = true; fields.compReason = i % 2 ? 'Make-good for a cancelled class' : 'Prize from a club raffle'; }
        const b = book(e, fields);
        answerAll(b, e, i);
        if (comp) Core.audit(s, { at: new Date(b.createdAt), by: fields.by, type: 'Free place', text: `${b.ref}: ${e.title}. Reason: ${fields.compReason}` });
        list.push(b);
        places += size;
        i++;
      }
      return list;
    };
    const eachSession = (e, counts, o) => e.sessions.reduce((all, x, i) => all.concat(fill(e, [x.id], counts[i], o)), []);
    const addNote = (b, at, by, text) => b.notes.unshift({ id: Core.nextId(s, 'n'), at: Core.toLocalISO(at), by, text });
    const NOTES = ['Called to check parking. All fine.', 'Asked for a quiet spot near the door.', 'First visit, please say hello.', 'Will arrive ten minutes late.', 'Paid the wrong amount at first, now sorted.'];
    const REFUND_REASONS = ['Customer unwell', 'Booked the wrong date', 'Work trip clash'];
    /* Staff actions on bookings: refunds, part refunds, cancellations, transfers, notes, add-ons. */
    const touch = (list, e, o) => {
      const opts = o || {};
      const [mgr, foh] = staffOf[e.venueId];
      list.forEach((b, i) => {
        if (i % 8 === 2) addNote(b, afterBooking(b, 1), foh, NOTES[i % NOTES.length]);
        if (i % 8 === 5 && !opts.noAddOns) {
          const addOn = s.addOns.find((a) => a.id === addOnsOf[e.venueId]);
          Core.addAddOn(s, b, addOn, 1 + (i % 2), { by: 'Customer', now: new Date(b.createdAt) });
          if (i % 16 === 13) Core.refundAddOn(s, b, b.addOns[b.addOns.length - 1].id, { reason: 'Not needed on the day', by: foh, now: afterBooking(b, 2) });
        }
        if (opts.keepPlaces) return;
        const paid = Core.paidTotal(b);
        if (i % 9 === 1 && paid > 0) {
          Core.refund(s, b, { ticketIds: b.tickets.map((t) => t.id), amount: paid, reason: REFUND_REASONS[i % 3], by: i % 2 ? mgr : foh, freePlaces: true, now: afterBooking(b, 2) });
          return;
        }
        if (i % 9 === 4 && paid >= 10) {
          Core.refund(s, b, { ticketIds: b.tickets.map((t) => t.id), amount: Core.round2(paid / 4), reason: 'Goodwill: class started late', by: mgr, freePlaces: false, now: afterBooking(b, 3) });
          return;
        }
        if (i % 9 === 7) {
          Core.cancelTickets(s, b, { ticketIds: b.tickets.map((t) => t.id), reason: 'Customer asked to cancel after the refund window, so no refund', by: foh, now: afterBooking(b, 2) });
          return;
        }
        if (i % 10 === 3 && b.tickets.length === 1) {
          const when2 = new Date(b.createdAt);
          const target = Core.transferTargets(s, b, b.tickets[0], when2).find((x) => x.left > 1 && x.event.id === e.id);
          if (target) Core.transferTicket(s, b, b.tickets[0].id, target.session.id, { by: foh, now: when2, describe, fee: 0 });
        }
      });
    };
    const checkInSome = (sessionId, share) => {
      const session = Core.findSession(s, sessionId).session;
      const started = new Date(session.start) <= SEED_NOW;
      const at2 = Core.toLocalISO(started ? new Date(session.start) : SEED_NOW);
      const people = Core.attendees(s, sessionId);
      people.forEach((row, i) => { if (i % 100 < share * 100 && (i * 7) % 10 < share * 10) row.ticket.checkedInAt = at2; });
    };
    const checkInPast = (e, noShowEvery) => {
      e.sessions.forEach((x) => {
        if (new Date(x.start) > SEED_NOW || x.cancelled) return;
        Core.attendees(s, x.id).forEach((row, i) => { if ((i + 1) % noShowEvery !== 0) row.ticket.checkedInAt = x.start; });
      });
    };
    const addRequest = (b, days, by, source, note, closed) => {
      const at2 = Core.toLocalISO(notFuture(new Date(Core.addDays(`${today}T11:15`, -days))));
      const r = { id: Core.nextId(s, 'rq'), at: at2, by, source, note, status: closed ? 'Done' : 'Open' };
      if (closed) { r.closedBy = by; r.closedAt = at2; r.outcome = closed; }
      b.requests.push(r);
      Core.logBooking(b, new Date(at2), by, closed ? `Cancellation request closed: ${closed}` : `Cancellation request logged from ${source.toLowerCase()}.`);
    };
    const addWait = (sessionId, status, days) => {
      const g = person(false);
      s.waitlist.push({ id: Core.nextId(s, 'w'), sessionId, name: g.name, email: g.email, joinedAt: at(-days, '12:30'), status, offerUntil: status === 'Offered' ? Core.toLocalISO(new Date(SEED_NOW.getTime() + s.settings.waitlistClaimHours * 3600000)) : '' });
    };

    /* More partners, each with redemptions below. */
    const p4 = { id: 'pt4', name: 'Northgate Cycles', contact: 'shop@northgate-cycles.example.com', notes: 'Offer printed on their receipts.', cost: { type: 'fixed', value: 2 } };
    const p5 = { id: 'pt5', name: 'Tidewater Surf School', contact: 'crew@tidewater-surf.example.com', notes: 'Summer offer for their students.', cost: { type: 'percent', value: 8 } };
    const p6 = { id: 'pt6', name: 'Pressed Coffee Co', contact: 'hello@pressed-coffee.example.com', notes: 'Paused while their shop is being refitted.', cost: { type: 'none', value: 0 } };
    const p7 = { id: 'pt7', name: 'Calm Studio', contact: 'studio@calm-studio.example.com', notes: 'Small first run of codes, now all used.', cost: { type: 'fixed', value: 3 } };
    const p8 = { id: 'pt8', name: 'Harbour Deli', contact: 'orders@harbour-deli.example.com', notes: 'Offer on the back of their menu.', cost: { type: 'none', value: 0 } };
    s.partners.push(p4, p5, p6, p7, p8);
    const cCycles = makeCode({ code: 'NORTHCYCLE10', type: 'percent', value: 10, usageCap: 40, perCustomerLimit: 1, expiresAt: at(75, '23:59'), partnerId: p4.id, venueIds: ['v2'] });
    const cTide = makeCode({ code: 'TIDEWATER25', type: 'percent', value: 25, usageCap: 30, expiresAt: at(-5, '23:59'), partnerId: p5.id, venueIds: ['v3'] });
    const cPressed = makeCode({ code: 'PRESSED5', type: 'fixed', value: 5, perTicket: true, usageCap: 60, expiresAt: at(120, '23:59'), partnerId: p6.id, venueIds: ['v1'] });
    const cCalm = makeCode({ code: 'CALM10', type: 'fixed', value: 10, usageCap: 3, expiresAt: at(50, '23:59'), partnerId: p7.id, typeIds: ['ty5'] });
    const cDeli = makeCode({ code: 'DELI10', type: 'percent', value: 10, expiresAt: at(100, '23:59'), partnerId: p8.id, venueIds: ['v3'] });
    const cFew = makeCode({ code: 'LASTFEW50', type: 'percent', value: 50, usageCap: 4, expiresAt: at(20, '23:59'), venueIds: ['v2'] });
    const cFriends = makeCode({ code: 'FRIENDS15', type: 'percent', value: 15, perCustomerLimit: 2, startsAt: at(-200, '00:00') });
    makeCode({ code: 'NEWYEAR20', type: 'percent', value: 20, usageCap: 150, startsAt: at(30, '00:00'), expiresAt: at(75, '23:59') });
    const batchBase = (extra) => Object.assign({ type: 'fixed', value: 5, expiresAt: at(60, '23:59'), eventIds: [], venueIds: [], typeIds: [], partnerId: null, paused: false, createdAt: at(-45, '09:00') }, extra);
    const vip = Core.generateCodes(s, batchBase({ partnerId: p1.id, value: 8 }), 10, 'STRIDEVIP', 'stride');
    const guestPass = Core.generateCodes(s, batchBase({ partnerId: p3.id, type: 'percent', value: 20, venueIds: ['v1'] }), 8, 'COURTPASS', 'court');
    const oldBatch = Core.generateCodes(s, batchBase({ expiresAt: at(-10, '23:59'), createdAt: at(-170, '09:00') }), 6, 'SPRINGGIFT', 'spring');

    /* Riverside */
    const breakfast = makeEvent({
      title: 'Members Breakfast Talks', venueId: 'v1', format: 'Regular series', typeId: 'ty4',
      description: 'A monthly breakfast with a short talk from a local speaker.',
      tickets: [{ name: 'Standard', price: 12 }], sessions: [-150, -120, -90, -60, -30, 12].map((d) => ({ start: at(d, '08:00'), capacity: 20, durationMin: 90 })),
      memberPricing: { mode: 'fixed', value: 9, blockValue: null, applyToBlock: false },
      questions: [{ id: 'q5', label: 'Would you like a seat near the speaker?', type: 'tick', required: false, scope: 'booking', options: [], sensitive: false }]
    });
    const breakfastList = eachSession(breakfast, [14, 16, 12, 15, 17, 6], { codes: [cFriends, oldBatch[0], cFriends, cPressed, oldBatch[1], cPressed, cPressed, cPressed, cFriends, vip[0], vip[1], guestPass[0], guestPass[1]], codeEvery: 2 });
    touch(breakfastList, breakfast);
    checkInPast(breakfast, 6);
    const barre = makeEvent({
      title: 'Barre Taster', venueId: 'v1', format: 'One-off', typeId: 'ty5', salesClosed: true,
      description: 'A one-hour taster. Sales are closed so the host can plan numbers.',
      tickets: [{ name: 'Standard', price: 18 }], sessions: [{ start: at(4, '10:30'), capacity: 14, durationMin: 60 }], guestDetails: 'nameEmail', collectAt: 'link',
      memberPricing: { mode: 'percent', value: 10, blockValue: null, applyToBlock: false },
      questions: [{ id: 'q6', label: 'Any injuries or health conditions?', type: 'text', required: true, scope: 'guest', options: [], sensitive: true }]
    });
    const barreList = eachSession(barre, [10], { codes: [cFriends] });
    touch(barreList, barre, { keepPlaces: true });
    const quiz = makeEvent({
      title: 'Quiz Night', venueId: 'v1', format: 'One-off', typeId: 'ty4',
      tickets: [{ name: 'Standard', price: 10 }], sessions: [{ start: at(-10, '19:30'), capacity: 30, durationMin: 120 }]
    });
    eachSession(quiz, [11], { codes: [guestPass[2]], noComp: true });
    Core.cancelSessions(s, quiz, quiz.sessions.map((x) => x.id), { refund: true, reason: 'Quiz host not available', by: RIVER_MGR, now: when(-14) });
    quiz.cancelled = true;
    const cocktail = makeEvent({
      title: 'Cocktail Masterclass', venueId: 'v1', format: 'One-off', typeId: 'ty4',
      description: 'Learn three classic drinks with the club bar team.',
      tickets: [{ name: 'Early bird', price: 28, salesEnd: at(-5, '23:59') }, { name: 'Standard', price: 35 }],
      sessions: [{ start: at(6, '18:30'), capacity: 10, durationMin: 90 }], guestDetails: 'name', maxPerBooking: 4,
      memberPricing: { mode: 'percent', value: 10, blockValue: null, applyToBlock: false },
      questions: [{ id: 'q7', label: 'Do you drink alcohol?', type: 'choice', required: false, scope: 'guest', options: ['Yes', 'No, please make mine alcohol free'], sensitive: false }]
    });
    const cocktailList = fill(cocktail, [cocktail.sessions[0].id], 10, { noComp: true, ticketTypeId: (i) => (i < 3 ? cocktail.tickets[0].id : cocktail.tickets[1].id) });
    touch(cocktailList, cocktail, { keepPlaces: true, noAddOns: true });
    const cocktailId = cocktail.sessions[0].id;
    addWait(cocktailId, 'Offered', 5); addWait(cocktailId, 'Waiting', 4); addWait(cocktailId, 'Waiting', 3); addWait(cocktailId, 'Removed', 6);
    const stretch = makeEvent({
      title: 'Sunday Stretch', venueId: 'v1', format: 'Regular series', typeId: 'ty5',
      description: 'A gentle weekly stretch class. One date is cancelled while the studio floor is repaired.',
      tickets: [{ name: 'Standard', price: 11 }], sessions: [-21, -14, -7, 7, 14, 21].map((d) => ({ start: at(d, '10:00'), capacity: 15, durationMin: 45 })),
      memberPricing: { mode: 'percent', value: 20, blockValue: null, applyToBlock: true }, block: { enabled: true, price: 55 }
    });
    const stretchList = eachSession(stretch, [10, 9, 11, 7, 6, 3], { codes: [cPressed, cCalm, cFriends] });
    touch(stretchList, stretch);
    checkInPast(stretch, 5);
    Core.cancelSessions(s, stretch, [stretch.sessions[4].id], { refund: true, reason: 'Studio floor repair', by: RIVER_MGR, now: when(-1) });
    makeEvent({
      title: 'Winter Padel League', venueId: 'v1', format: 'Seasonal series', typeId: 'ty2', salesOpenAt: at(6, '09:00'),
      description: 'Six weeks of ladder matches. Sales open soon.',
      tickets: [{ name: 'Standard', price: 28 }], sessions: weekly(21, '19:00', 6, 16, 90),
      memberPricing: { mode: 'percent', value: 15, blockValue: null, applyToBlock: true }, block: { enabled: true, price: 140 }
    });
    makeEvent({
      title: 'Family Fun Day', venueId: 'v1', format: 'One-off', typeId: 'ty4', draft: true, description: 'Games and food for all ages. Details to be confirmed.',
      tickets: [{ name: 'Standard', price: 15 }], sessions: [{ start: at(40, '11:00'), capacity: 60, durationMin: 240 }]
    });

    /* Northgate */
    const ladder = makeEvent({
      title: 'Padel Ladder Nights', venueId: 'v2', format: 'Regular series', typeId: 'ty2',
      description: 'A monthly ladder for all levels.',
      tickets: [{ name: 'Standard', price: 16 }], sessions: [-130, -100, -70, -40, -10, 20].map((d) => ({ start: at(d, '18:30'), capacity: 12, durationMin: 120 })),
      memberPricing: { mode: 'percent', value: 10, blockValue: null, applyToBlock: false }, guestDetails: 'name',
      questions: [{ id: 'q8', label: 'Skill level', type: 'choice', required: true, scope: 'guest', options: ['New to padel', 'Some games', 'Regular player'], sensitive: false }]
    });
    const ladderList = eachSession(ladder, [9, 11, 10, 12, 8, 10], { codes: [cCycles, oldBatch[2], cCycles, vip[2], cCycles, cCycles, cCycles] });
    touch(ladderList.slice(0, -5), ladder);
    checkInPast(ladder, 7);
    const junior = makeEvent({
      title: 'Junior Padel Coaching', venueId: 'v2', format: 'Coaching', typeId: 'ty2',
      description: 'Four small group lessons for ages 10 to 15.',
      tickets: [{ name: 'Standard', price: 25 }],
      sessions: [{ start: at(-7, '16:00'), capacity: 4, durationMin: 60 }, { start: laterToday('16:00'), capacity: 4, durationMin: 60 }, { start: at(7, '16:00'), capacity: 4, durationMin: 60 }, { start: at(14, '16:00'), capacity: 4, durationMin: 60 }],
      memberPricing: { mode: 'percent', value: 10, blockValue: null, applyToBlock: true }, block: { enabled: true, price: 90 }, dropInsEnabled: false, maxPerBooking: 2, guestDetails: 'name',
      questions: [{ id: 'q9', label: 'Medical needs the coach should know about', type: 'text', required: true, scope: 'guest', options: [], sensitive: true }]
    });
    const juniorIds = junior.sessions.map((x) => x.id);
    const juniorList = fill(junior, juniorIds, 4, { kind: 'block', noComp: true, maxGroup: 2 });
    touch(juniorList, junior, { keepPlaces: true });
    checkInPast(junior, 9);
    addWait(junior.sessions[1].id, 'Waiting', 5); addWait(junior.sessions[1].id, 'Waiting', 2); addWait(junior.sessions[2].id, 'Offered', 3); addWait(junior.sessions[2].id, 'Booked', 8);
    const bootcamp = makeEvent({
      title: 'Autumn Bootcamp', venueId: 'v2', format: 'Seasonal series', typeId: 'ty3',
      description: 'Five weeks of outdoor circuits.',
      tickets: [{ name: 'Standard', price: 15 }], sessions: weekly(-80, '18:00', 5, 15, 60),
      memberPricing: { mode: 'percent', value: 20, blockValue: null, applyToBlock: true }, block: { enabled: true, price: 60 }
    });
    const bootBlocks = fill(bootcamp, bootcamp.sessions.map((x) => x.id), 8, { kind: 'block', codes: [cFew, cCycles], noComp: true });
    const bootDrops = eachSession(bootcamp, [3, 2, 4, 2, 3], { codes: [cFew, cFew, cFew] });
    touch(bootBlocks.concat(bootDrops), bootcamp);
    checkInPast(bootcamp, 6);
    const bookClub = makeEvent({
      title: 'Book Club Supper', venueId: 'v2', format: 'One-off', typeId: 'ty4', salesCloseAt: at(-1, '18:00'),
      description: 'Supper and a chat about this month\'s book. Sales closed yesterday.',
      tickets: [{ name: 'Standard', price: 24 }], sessions: [{ start: at(2, '19:00'), capacity: 18, durationMin: 120 }], guestDetails: 'nameEmail',
      memberPricing: { mode: 'fixed', value: 20, blockValue: null, applyToBlock: false },
      questions: [{ id: 'q10', label: 'Dietary needs', type: 'text', required: true, scope: 'guest', options: [], sensitive: true }]
    });
    touch(eachSession(bookClub, [12], { codes: [cFriends, cCycles] }), bookClub, { keepPlaces: true });
    makeEvent({
      title: 'Christmas Social', venueId: 'v2', format: 'One-off', typeId: 'ty4', salesOpenAt: at(5, '09:00'),
      description: 'Festive food, games and a raffle.',
      tickets: [{ name: 'Standard', price: 30 }], sessions: [{ start: at(35, '19:00'), capacity: 50, durationMin: 180 }],
      memberPricing: { mode: 'percent', value: 10, blockValue: null, applyToBlock: false }
    });
    makeEvent({
      title: 'Mobility Workshop', venueId: 'v2', format: 'One-off', typeId: 'ty5', draft: true, description: 'Hands-on mobility work. Details to be confirmed.',
      tickets: [{ name: 'Standard', price: 22 }], sessions: [{ start: at(25, '10:00'), capacity: 16, durationMin: 90 }]
    });

    /* Harbour */
    const sunset = makeEvent({
      title: 'Sunset Yoga', venueId: 'v3', format: 'Regular series', typeId: 'ty5',
      description: 'An easy evening flow on the terrace.',
      tickets: [{ name: 'Standard', price: 14 }],
      sessions: [{ start: at(-14, '18:30'), capacity: 12, durationMin: 60 }, { start: at(-7, '18:30'), capacity: 12, durationMin: 60 }, { start: laterToday('18:30'), capacity: 12, durationMin: 60 }, { start: at(7, '18:30'), capacity: 12, durationMin: 60 }, { start: at(14, '18:30'), capacity: 12, durationMin: 60 }],
      memberPricing: { mode: 'percent', value: 25, blockValue: null, applyToBlock: false }, guestDetails: 'nameEmail',
      questions: [{ id: 'q11', label: 'Any injuries we should know about?', type: 'text', required: false, scope: 'guest', options: [], sensitive: true }, { id: 'q12', label: 'Do you need a mat?', type: 'tick', required: false, scope: 'guest', options: [], sensitive: false }]
    });
    const sunsetList = [];
    sunset.sessions.forEach((x, i) => { fill(sunset, [x.id], [9, 11, 10, 5, 3][i], { codes: i === 1 ? [cCalm, cCalm] : (i === 0 ? [cDeli, cDeli] : [cDeli]), noComp: i === 2 }).forEach((b) => sunsetList.push(b)); });
    touch(sunsetList.filter((b) => b.tickets[0].sessionId !== sunset.sessions[2].id), sunset);
    touch(sunsetList.filter((b) => b.tickets[0].sessionId === sunset.sessions[2].id), sunset, { keepPlaces: true });
    checkInPast(sunset, 6);
    const paddle = makeEvent({
      title: 'Paddleboard Coaching', venueId: 'v3', format: 'Coaching', typeId: 'ty5',
      description: 'Three small group lessons in the harbour.',
      tickets: [{ name: 'Standard', price: 38 }], sessions: [0, 7, 14].map((d) => ({ start: at(d, '11:00'), capacity: 5, durationMin: 75 })),
      memberPricing: { mode: 'percent', value: 10, blockValue: null, applyToBlock: true }, block: { enabled: true, price: 95 }, dropInsEnabled: false, maxPerBooking: 2,
      questions: [{ id: 'q13', label: 'Can you swim 50 metres?', type: 'choice', required: true, scope: 'guest', options: ['Yes', 'Not sure'], sensitive: false }]
    });
    const paddleList = fill(paddle, paddle.sessions.map((x) => x.id), 5, { kind: 'block', noComp: true, maxGroup: 2, codes: [cDeli] });
    touch(paddleList, paddle, { keepPlaces: true });
    addWait(paddle.sessions[0].id, 'Waiting', 6); addWait(paddle.sessions[0].id, 'Offered', 4); addWait(paddle.sessions[1].id, 'Waiting', 3);
    const summerSwim = makeEvent({
      title: 'Summer Swim Season', venueId: 'v3', format: 'Seasonal series', typeId: 'ty5',
      description: 'Four guided open-water swims.',
      tickets: [{ name: 'Standard', price: 20 }], sessions: weekly(-110, '07:30', 4, 12, 60),
      memberPricing: { mode: 'percent', value: 15, blockValue: null, applyToBlock: true }, block: { enabled: true, price: 64 }
    });
    const swimBlocks = fill(summerSwim, summerSwim.sessions.map((x) => x.id), 7, { kind: 'block', codes: [cTide, cTide, cTide], noComp: true });
    const swimDrops = eachSession(summerSwim, [3, 4, 2, 3], { codes: [cTide, cTide, cTide, oldBatch[3]] });
    touch(swimBlocks.concat(swimDrops), summerSwim);
    checkInPast(summerSwim, 8);
    const clean = makeEvent({
      title: 'Beach Clean and Brunch', venueId: 'v3', format: 'One-off', typeId: 'ty4',
      tickets: [{ name: 'Standard', price: 9 }], sessions: [{ start: at(-15, '09:30'), capacity: 25, durationMin: 180 }]
    });
    eachSession(clean, [9], { noComp: true });
    Core.cancelSessions(s, clean, clean.sessions.map((x) => x.id), { refund: true, reason: 'Storm warning', by: HARBOUR_MGR, now: when(-16) });
    clean.cancelled = true;
    const breath = makeEvent({
      title: 'Breathwork Season', venueId: 'v3', format: 'Seasonal series', typeId: 'ty5',
      description: 'Four guided breathwork sessions.',
      tickets: [{ name: 'Standard', price: 16 }], sessions: weekly(-7, '09:00', 4, 14, 60),
      memberPricing: { mode: 'percent', value: 20, blockValue: null, applyToBlock: true }, block: { enabled: true, price: 52 }
    });
    const breathList = fill(breath, breath.sessions.map((x) => x.id), 6, { kind: 'block', codes: [cDeli, cFriends], noComp: true }).concat(eachSession(breath, [2, 3, 4, 2], {}));
    touch(breathList, breath);
    checkInPast(breath, 6);
    const coffee = makeEvent({
      title: 'Harbour Coffee Mornings', venueId: 'v3', format: 'Regular series', typeId: 'ty4',
      description: 'Monthly coffee and cake with club members.',
      tickets: [{ name: 'Standard', price: 7 }], sessions: [-140, -110, -80, -50, -20, 10].map((d) => ({ start: at(d, '10:30'), capacity: 20, durationMin: 60 })),
      memberPricing: { mode: 'fixed', value: 5, blockValue: null, applyToBlock: false }
    });
    const coffeeList = eachSession(coffee, [13, 15, 12, 16, 14, 5], { codes: [cDeli, oldBatch[4], cDeli, cDeli, vip[3], cFriends, cDeli] });
    touch(coffeeList, coffee);
    checkInPast(coffee, 7);

    /* Some people checked in on today's sessions, in every venue. */
    [social, coach, run, season, junior, sunset, paddle, breath].forEach((e) => {
      e.sessions.filter((x) => Core.dayKey(x.start) === today && !x.cancelled).forEach((x) => checkInSome(x.id, 0.4));
    });

    /* Waitlist on the sold-out coaching, and an older answered one. */
    addWait(coach.sessions[3].id, 'Waiting', 2);
    addWait(coach.sessions[3].id, 'Offered', 3);

    /* Cancellation requests in every venue, some waiting and some closed. */
    addRequest(ladderList[ladderList.length - 2], 1, NORTH_MGR, 'Email', 'Customer emailed: cannot make the next ladder night and asks for a refund.');
    addRequest(bookClub.sessions.length ? s.bookings.find((b) => b.eventId === bookClub.id) : ladderList[0], 0, NORTH_MGR, 'Phone', 'Customer rang: asks to cancel because of a family event.');
    addRequest(sunsetList[sunsetList.length - 1], 2, HARBOUR_MGR, 'Email', 'Customer emailed: moving away and asks to cancel.');
    addRequest(coffeeList[coffeeList.length - 1], 0, HARBOUR_MGR, 'Email', 'Customer emailed: wants to know if a refund is possible.');
    addRequest(breakfastList[breakfastList.length - 1], 3, RIVER_MGR, 'Email', 'Customer emailed: double booked and asks to cancel.');
    addRequest(breakfastList[3], 110, RIVER_MGR, 'Email', 'Customer emailed: asked to cancel.', 'Refund given in full.');
    addRequest(ladderList[4], 90, NORTH_MGR, 'Phone', 'Customer rang: asked to move to the next night.', 'Moved to the next night.');
    addRequest(coffeeList[5], 100, HARBOUR_MGR, 'Email', 'Customer emailed: asked for a refund outside the policy.', 'Explained the policy. No refund given.');

    /* Activity log */
    const AUDIT = [
      [-120, ADMIN, 'Settings', 'Refund policy set: refunds up to 48 hours before, transfers up to 24 hours before.'],
      [-95, ADMIN, 'Code', 'FRIENDS15 created: 15% off, limit of 2 per customer.'],
      [-60, RIVER_MGR, 'Price change', 'Members Breakfast Talks: Standard ticket changed from £10.00 to £12.00.'],
      [-45, ADMIN, 'Code', 'Batch of 10 single-use codes created for Stride Physio.'],
      [-40, NORTH_MGR, 'Override', 'Padel Ladder Nights: 1 place over the limit. Reason: a regular player rang before the list closed.'],
      [-30, HARBOUR_MGR, 'Price change', 'Sunset Yoga: member discount changed from 20% to 25%.'],
      [-21, NORTH_MGR, 'Export', 'Attendee list downloaded: Autumn Bootcamp.'],
      [-14, HARBOUR_MGR, 'Export', 'Attendee list downloaded: Sunset Yoga.'],
      [-12, ADMIN, 'Export', 'Discount use report downloaded.'],
      [-9, ADMIN, 'Code', 'PRESSED5 paused while the partner shop is being refitted.'],
      [-8, RIVER_MGR, 'Override', 'Sunday Stretch: limit raised from 12 to 15. Reason: bigger studio booked.'],
      [-6, NORTH_MGR, 'Price change', 'Book Club Supper: member price changed from £18.00 to £20.00.'],
      [-5, ADMIN, 'Settings', 'Low space warning set to 3 places.'],
      [-4, ADMIN, 'Price change', 'Founders Supper: Standard ticket changed from £38.00 to £40.00.'],
      [-3, RIVER_MGR, 'Override', 'Padel Coaching: Beginners: limit raised from 5 to 6. Reason: second coach confirmed.'],
      [-2, HARBOUR_MGR, 'Export', 'Attendee list downloaded: Paddleboard Coaching.'],
      [-1, RIVER_MGR, 'Export', 'Attendee list downloaded: Morning Run Club.'],
      [-1, ADMIN, 'Export', 'Partner report downloaded: Northgate Cycles.']
    ];
    AUDIT.forEach(([d, by, type, text]) => Core.audit(s, { at: when(d), by, type, text }));
    cPressed.paused = true;

    /* Klaviyo log: what each booking sent, with some failed sends in every venue. */
    s.bookings.forEach((b, i) => {
      if (i % 3 === 0) Core.klaviyo(s, { at: new Date(b.createdAt), type: 'Booking confirmed', ref: b.ref });
      if (i % 11 === 2 && b.people.length > 1) Core.klaviyo(s, { at: afterBooking(b, 1), type: 'Guest details added', ref: b.ref });
      if (i % 9 === 4 && Core.bookingStatus(b) === 'Cancelled') Core.klaviyo(s, { at: afterBooking(b, 3), type: 'Booking changed or cancelled', ref: b.ref });
      if (i % 7 === 1 && b.tickets.some((t) => t.checkedInAt)) Core.klaviyo(s, { at: notFuture(new Date(b.tickets.find((t) => t.checkedInAt).checkedInAt)), type: 'Checked in', ref: b.ref });
      if (i % 13 === 5 && b.tickets.some((t) => new Date(Core.findSession(s, t.sessionId).session.start) > SEED_NOW)) Core.klaviyo(s, { at: when(-1), type: 'Session coming up', ref: b.ref });
    });
    Core.klaviyo(s, { at: when(-1), type: 'Booking confirmed', ref: group.ref, failed: true, error: 'Timed out (demo)' });
    Core.klaviyo(s, { at: when(0), type: 'Booking changed', ref: pair.ref, failed: true, error: 'Rate limited (demo)' });
    Core.klaviyo(s, { at: when(-2), type: 'Guest details added', ref: ladderList[ladderList.length - 1].ref, failed: true, error: 'Timed out (demo)' });
    Core.klaviyo(s, { at: when(0), type: 'Booking confirmed', ref: sunsetList[sunsetList.length - 1].ref, failed: true, error: 'Rate limited (demo)' });

    /* Nobody has checked in to a session in the future, whatever time of day the data is built. */
    const nowIso = Core.toLocalISO(now);
    s.bookings.forEach((b) => b.tickets.forEach((x) => { if (x.checkedInAt && x.checkedInAt > nowIso) x.checkedInAt = nowIso; }));

    /* Newest first, the way the screens show them. */
    const newestFirst = (a, c) => String(c.at).localeCompare(String(a.at));
    s.audit.sort(newestFirst); s.klaviyoLog.sort(newestFirst);
    s.bookings.forEach((b) => { b.timeline.sort(newestFirst); b.notes.sort(newestFirst); });
    /* A photo for each event: links to free-to-use pictures from Pexels. Staff can change a link in the event form. */
    const EVENT_IMAGES = {
      "Autumn Pilates (4 weeks)": 'https://images.pexels.com/photos/9288101/pexels-photo-9288101.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Spring Pilates (4 weeks)": 'https://images.pexels.com/photos/25596885/pexels-photo-25596885.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Padel & Pilates Season": 'https://images.pexels.com/photos/25596896/pexels-photo-25596896.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Padel Social Night": 'https://images.pexels.com/photos/38155778/pexels-photo-38155778.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Padel Ladder Nights": 'https://images.pexels.com/photos/35248469/pexels-photo-35248469.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Winter Padel League": 'https://images.pexels.com/photos/31012869/pexels-photo-31012869.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Summer Padel Tournament": 'https://images.pexels.com/photos/38690521/pexels-photo-38690521.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Padel Coaching: Beginners": 'https://images.pexels.com/photos/35248259/pexels-photo-35248259.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Junior Padel Coaching": 'https://images.pexels.com/photos/34399235/pexels-photo-34399235.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Morning Run Club": 'https://images.pexels.com/photos/33860616/pexels-photo-33860616.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Autumn Bootcamp": 'https://images.pexels.com/photos/6339487/pexels-photo-6339487.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Founders Supper": 'https://images.pexels.com/photos/5962043/pexels-photo-5962043.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Winter Yoga Day": 'https://images.pexels.com/photos/39190415/pexels-photo-39190415.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Wine Tasting Evening": 'https://images.pexels.com/photos/36643212/pexels-photo-36643212.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Christmas Wreath Workshop": 'https://images.pexels.com/photos/6063424/pexels-photo-6063424.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Harbour Sea Swim": 'https://images.pexels.com/photos/1249545/pexels-photo-1249545.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Summer Swim Season": 'https://images.pexels.com/photos/29280139/pexels-photo-29280139.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Members Breakfast Talks": 'https://images.pexels.com/photos/16265222/pexels-photo-16265222.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Harbour Coffee Mornings": 'https://images.pexels.com/photos/31711944/pexels-photo-31711944.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Barre Taster": 'https://images.pexels.com/photos/3901644/pexels-photo-3901644.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Quiz Night": 'https://images.pexels.com/photos/5428832/pexels-photo-5428832.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Cocktail Masterclass": 'https://images.pexels.com/photos/18817906/pexels-photo-18817906.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Sunday Stretch": 'https://images.pexels.com/photos/6339459/pexels-photo-6339459.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Family Fun Day": 'https://images.pexels.com/photos/10037054/pexels-photo-10037054.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Book Club Supper": 'https://images.pexels.com/photos/39924598/pexels-photo-39924598.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Christmas Social": 'https://images.pexels.com/photos/35344524/pexels-photo-35344524.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Mobility Workshop": 'https://images.pexels.com/photos/6926019/pexels-photo-6926019.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Sunset Yoga": 'https://images.pexels.com/photos/2280200/pexels-photo-2280200.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Paddleboard Coaching": 'https://images.pexels.com/photos/13128204/pexels-photo-13128204.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Beach Clean and Brunch": 'https://images.pexels.com/photos/8018592/pexels-photo-8018592.jpeg?auto=compress&cs=tinysrgb&w=800',
      "Breathwork Season": 'https://images.pexels.com/photos/14253849/pexels-photo-14253849.jpeg?auto=compress&cs=tinysrgb&w=800'
    };
    s.events.forEach((e) => { if (EVENT_IMAGES[e.title]) e.image = EVENT_IMAGES[e.title]; });
    /* The demo normal user is one customer with several bookings, so My bookings has an order history to show:
       some still to come, some finished, one cancelled. */
    (function () {
      const sessionStarts = (b) => b.tickets.map((t) => { const f = Core.findSession(s, t.sessionId); return f ? new Date(f.session.start).getTime() : 0; });
      const kind = (b) => (Core.bookingStatus(b) === 'Cancelled' ? 'cancelled' : sessionStarts(b).some((t) => t > now.getTime()) ? 'upcoming' : 'past');
      const pool = s.bookings.filter((b) => b.customer && b.customer.email);
      const lead = pool.find((b) => kind(b) === 'upcoming');
      if (!lead) return;
      const me = Object.assign({}, lead.customer);
      const picks = [lead].concat(pool.filter((b) => b !== lead && kind(b) === 'upcoming').slice(0, 1), pool.filter((b) => kind(b) === 'cancelled').slice(0, 1), pool.filter((b) => kind(b) === 'past').slice(0, 4));
      picks.forEach((b) => {
        Object.assign(b.customer, { name: me.name, email: me.email, phone: me.phone });
        const leadPerson = (b.people || []).find((p) => p.isLead);
        if (leadPerson) Object.assign(leadPerson, { name: me.name, email: me.email });
      });
      const u = s.users.find((x) => x.id === 'u3');
      if (u) Object.assign(u, { name: me.name, email: me.email });
    })();
    Core.migrate(s);
    return s;
  }

  const Seed = { build };
  if (typeof module !== 'undefined' && module.exports) module.exports = Seed; else root.Seed = Seed;
})(typeof window !== 'undefined' ? window : globalThis);
