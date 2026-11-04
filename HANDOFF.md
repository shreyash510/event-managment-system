# Handoff: Event Booking System (admin + customer app)

Written 4 Nov 2026 so work can continue from another Claude account. Read this first, then run the "First steps" section.

## 1. What this project is
A **front-end only** demo app (plain HTML, CSS and JS, no build step, no backend). Data lives in `localStorage`. It is the admin side of an event booking system (marketing, club staff, customers), based on `Admin-Side-Design.docx` in the project root. Treat that document as the product spec. Open it by serving the folder over HTTP (for example `node` static server or any "serve" tool) and visiting `index.html`.

Stack and layout:
- `index.html` loads scripts in order: `core.js`, `seed.js`, `ui.js`, `app.js`, then the views in `js/views/`, plus `js/pay.js` and `js/entry.js`.
- `js/core.js`: data rules (permissions, pricing, capacity, refunds, reports, retention). `js/seed.js`: made-up demo data. `js/app.js`: shell, routing, venue filter. `js/ui.js`: shared helpers (dialogs, tables, tabs, stat cards, toasts).
- Views: `today`, `events`, `event-form`, `bookings`, `booking-detail`, `checkin`, `codes`, `partners`, `reports`, `settings`, `account`, `tickets` (customer Find events), `mybookings` (customer).
- CSS: `styles.css` (base), `shell.css` and `theme.css` (look and feel, loaded last), plus one file per screen.

## 2. Decisions the user made
- **No backend for now.** Keep it front-end only.
- **Payments:** a Stripe-style UI flow only, **no real payment**. Test mode wording, no Stripe logo.
- **Roles:** Marketing admin (`admin`), Club manager (`manager`), Normal user (`user`, the customer). The **Reception** role was added on 4 Nov and removed the same day at the user's request, along with its refund limit and the Team tab on My club. Do not add it back unless asked.
- **Customers book inside this app** (Find events, My bookings). Customers cannot self-cancel; they request a change and staff process it. Self-serve move to another session of the same event is allowed within the transfer policy.
- Publishing: a manager's new event needs marketing approval; duplicates of an approved event publish directly.
- Goodwill codes: managers can create single-use fixed-amount codes for their own venue, up to a limit (default £20).
- Managers can change prices only within the price floor; a price change on a live event notifies marketing.

- **Membership (4 Nov):** the user asked for three marketing-admin sections: Users, Subscriptions, Plans and offers (`js/views/membership.js`, rules in `js/core.js`, perm `membership.manage`, admin only). The app holds subscriptions itself, which overrides decision 2 in the design document. An active subscription gives the event's member price, and a coupon comes off that price (`settings.stacking = 'stack'`). Payments are test records and nothing renews on its own. The user asked for all user management (every role) to live on the Users page, and every venue action on My club, so neither is in Settings. Only the marketing admin can add a venue or change its name (perm `venues.manage`).

- **Settings > Rules removed (4 Nov):** the user asked for the Rules tab to go. Refund and transfer rules, limits, fees, lowest ticket price, goodwill limit, hold and waitlist times and data retention still apply, but keep their seeded values and cannot be changed on screen. Manual data retention cannot be run. `renderPolicies` in `js/views/settings.js` is kept, not shown.

- **Field tooltips (4 Nov):** the user asked for a tooltip on every form field in the app. One handler in `js/field-tips.js` covers all forms. Add wording to `TIPS` there (key: the label in lower case, without brackets), or `data-tip` on a field. New forms get a tooltip with no extra code.

- **Clickable stat cards (4 Nov):** the user asked for every stat card to open the page behind its number. One handler in `js/stat-links.js` covers them all. A new card needs a line in `LINKS` there, by page and card label. Cards inside a form or step-by-step flow are left unclickable on purpose.

- **Add-ons removed (4 Nov):** the user asked for the whole add-on feature to go: setup, stock, the choice on events, booking and refund screens, report figures and demo data. `Core.migrate` strips add-ons from older saved data. The client brief lists add-ons at checkout as a nice-to-have, so this is a deliberate choice.

- **Choosing existing customers (4 Nov):** the user asked that staff pick an existing person from a list, so nobody is typed in twice, with empty fields only for someone new. `js/person-picker.js` does this on Add booking, Walk-in and New subscription. Use it on any new staff form that asks for a customer. Add a user stays empty on purpose, because that person is new.

## 3. UI/UX conventions already set (keep them)
- **Every form opens in a modal** (`App.modal({title, subtitle, icon, back})` returns the dialog body; Esc/X go to `back`). Small dialogs use `UI.dialog`.
- Dialog look: header with title + subtitle + X, uppercase small labels, rounded fields, footer under a divider with two equal buttons (Cancel left, dark primary right). Scrollbars hidden inside modals.
- **Event form:** icon stepper (6 steps), pinned footer, choice cards for radios, switches for yes/no, row cards, dashed add buttons. A one-screen **Quick create** was added for new events; "More options" opens the six steps.
- **Stat cards:** always `<div class="grid stats">` with `.stat` cards using `UI.statIcon(name, UI.statTone(i))`, a label, a big number and a small note.
- **Tables:** `UI.table(...)` with `title`/`subtitle` options; per-table search + Filter only when more than 8 rows (`filter:false` hides it); search box is 6cm wide.
- **Reports:** page has a tab bar (icons), range, Filter dialog, Export CSV. Tabs: Summary, Events (group-by switch), Promotions, People, Source.
- Dropdowns: one style in `theme.css`. Plain words in customer copy (no "block", "drop-in", "lead booker").
- Menu items come from `NAV` in `app.js`, filtered by permission.

## 4. What was done in earlier rounds
Earlier rounds: modal forms; Review and publish step redesign; all event-form steps redesigned; stat-card consistency; table titles/subtitles/search/filter; Reports redesign; dialog restyle; dropdown fix; roles/access (Agent A), simplified screens (Agent B); then the business round:
- **Payments UI (`js/pay.js`, `css/pay.css`)**: `Pay.checkout`, `Pay.refund`, `Pay.link`. Test cards: `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` declined, `4000 0000 0000 9995` insufficient funds. Only brand, last 4 and receipt id are stored.
- **Business rules (core/settings/seed/today/codes/partners):** `refund.approve` permission (admin only), `settings.managerRefundLimit` (default 100), `Core.refundAllowed(role, settings, {type, amount, sessions, now})` returns `{ok, needsApproval, reason}`; price floor `settings.minTicketPrice` with `Core.priceFloorCheck`; event-type templates (`eventTypes[i].template`); partner cost (`partners[i].cost`, `Core.partnerCost`); data retention (`settings.retentionDays`, `Core.retentionPreview/Run`); `Core.migrate(state)` fills defaults for old saved data.
- **Events and Reports:** Quick create, folded "More pricing options", margin guard, Share links (tracked booking links), waitlist auto-offer and "mark as booked", business metrics on Summary (repeat customers, no-show rate, refund rate, places recovered, fill rate by type), partner cost/return columns.
- **Customer side:** Stripe-style checkout, My bookings receipts, "Request a change", self-serve "Move a place".

## 5. Status: briefs M and C finished on 4 Nov 2026 (not committed)
The rest of this section is history. Everything in the briefs in section 8 has been built, except Reception, which was removed. All of it is uncommitted in the working tree.

Tested in headless Chrome: every page for each role, with no exceptions or console errors, and no sideways overflow at 360px; customer checkout (declined card, good card, closing the success screen, UTM channel); event approval and rejection; price floor; price-change notice; goodwill codes and their limit; notices; message attendees; refund sent for approval; waitlist join and booking an offered place.

Not tested: a real phone, the light theme, check-in taps, Move a place, Request a change, .ics file contents, and Mark as seen across a reload.

Seed additions: a one-club manager (`u4`), so the club comparison in Reports shows; the demo customer is a member and has a live waitlist offer. Press Reset demo data to see these, because old saved data keeps its old contents.

### History: what was stopped part way
Both background agents were **stopped mid-work**. All JS files still pass `node --check`, but features are half built. State when stopped (checked by `git status` and grep, not in a browser):

- **Agent M (club manager), partly done.** Present: settings edits in `js/views/settings.js`, new files `js/views/club.js` and `css/club.css`, and the `club` NAV line plus script/link tags. **Not started or not saved:** event approval (no changes in `events.js` / `event-form.js`), notices to marketing, goodwill codes (`codes.js` untouched), message attendees, manager Today additions, Reports additions, manager price-floor block. The agent was about to edit the event form save logic when stopped.
- **Agent C (customer experience), barely started.** `js/app.js`, `js/entry.js` and `index.html` were edited (the agent was writing the customer shell when stopped; no customer-shell code was found, so treat it as not done). `tickets.js` and `mybookings.js` are unchanged: discovery, price breakdown, confirmation page, My bookings upgrades, waitlist, and UTM source tracking are **all still to do**.

Because of the partial edits, first read `git diff js/app.js js/entry.js js/core.js js/seed.js js/views/settings.js index.html` and `js/views/club.js` to see what exists, finish or revert half-done code, then continue from the briefs in section 8. Do not trust anything in this section as "done" until you have opened it in a browser.

**Agent M: Club manager** (owns core, seed, settings, today, events, event-form, codes, partners, reports, booking-detail, bookings, checkin, new `js/views/club.js` + `css/club.css`):
1. Reception role (removed, do not build), 2. "My club" page (venue details) with NAV line `{ key:'club', label:'My club', perm:'club.manage' }`, 3. Event approval flow, 4. Notices to marketing (`state.notices`), 5. Goodwill codes (`codes.goodwill`, `settings.goodwillMax`), 6. Message attendees, 7. Today additions, 8. Reports additions, 9. Manager price-floor block.

**Agent C: Customer experience** (owns app, ui, entry, index.html, pay, tickets, mybookings, account, theme/shell/styles css):
1. Separate customer shell (no staff controls; demo controls in footer link), 2. Find events discovery (search, venue, availability badges, member price), 3. Price breakdown + policy + map before checkout, 4. Confirmation page with add-to-calendar (.ics), 5. My bookings upgrades ("Next session", refund status, "Book again"), 6. Waitlist join and offers, 7. UTM source tracking saved as booking `channel`, 8. CSS cleanup.

## 6. Known issues and loose ends
- **Waitlist:** customers can book an offered place themselves. An offer holds the place from other online buyers only: staff can still book it.
- Leftover Front of house wording or `foh` references should be gone; `js/seed.js` has a local variable named `foh` that is only a staff-name variable.
- `refund.policyOnly` is kept in a core list only so old checks never match.
- Saved demo data is rebuilt/migrated on load; clearing `localStorage` key `events-admin-demo-v1` resets everything.
- Another process (other Claude sessions) has been committing and staging files in this repo. Never assume the working tree is only your changes.

## 7. How to work (rules the agents followed)
- Edit with targeted edits; re-read a region right before editing; never rewrite whole files.
- Files use **CRLF** line endings in many places; preserve them.
- Run `node --check <file>` on every JS file you touch.
- Do not commit unless the user asks. Git user: shreyesh kolhe. If asked to commit, end the message with the attribution line the harness gives.
- Give each parallel agent a **disjoint set of owned files**, otherwise edits collide.

## 8. Briefs for the two agents (paste these as prompts to resume)

### Brief M: Club manager
Roles now: admin (Marketing admin), manager (Club manager), user (customer). Build in this order and report what is left.
1. **Reception role:** removed at the user's request. Do not build it.
2. **"My club" page** (`js/views/club.js`, route `club`, perm `club.manage` for admin and manager). Venue details (own venues). Log every change.
3. **Event approval:** a manager's new event gets `event.approval = {status:'pending', by, at}` and status "Pending approval". Duplicates of an approved event (`event.copyOf`) publish directly. Admin sees "Events waiting for approval" on Today and an Events list chip, with Approve or Reject (reason required; event returns to draft).
4. **Notices:** `state.notices = [{id, at, by, kind, text, seen}]`. Create one when a manager changes a price on a live event, cancels a whole event (reason now required), or creates a goodwill code. Admin sees "Updates from clubs" on Today with "Mark as seen".
5. **Goodwill codes:** perm `codes.goodwill` (manager); single-use, fixed £ only, own venues only, up to `settings.goodwillMax` (default 20, in Settings > Rules), tagged `goodwill:true`, expiry default +30 days, logged.
6. **Message attendees:** per session on the event page; templates (Session moved, Session cancelled, Coach unavailable, Custom), recipient count, simulated send; write to booking timelines, the activity log and `state.klaviyoLog`.
7. **Today for managers:** next 7 days sessions under 50% full, "Waiting for approval", door today.
8. **Reports:** free places and overrides by staff member, fill rate and no-shows per session, "Your club vs all clubs average" (averages only), include in CSV.
9. **Price guard:** a manager cannot save a price below `settings.minTicketPrice` (admin can with a reason).
Rules: no "Front of house" wording; `node --check` everything; smoke-test `Core.refundAllowed` for admin/manager.

### Brief C: Customer experience (Normal user)
Goal: a customer on a phone can find, book, pay, get their ticket and come back, and never sees staff controls.
1. **Customer shell** when `App.role()==='user'`: no sidebar, venue switcher, role dropdown, reset or staff menu. Top bar with club name and Find events / My bookings / Account; phone bottom bar with the same three. Staff shell untouched. Demo controls (switch user, reset) behind a small footer link. Keep the `club` NAV line that Agent M adds.
2. **Find events:** search (title/venue/type), venue picker, existing type/date tabs, cards with visual, venue, next session, "From £X", member price for members, badge "N places left" (use `settings.lowSpaceThreshold`), "Sold out", "Booking soon". Plain words.
3. **Before checkout:** full price breakdown, cancellation/transfer policy in plain words (from `settings.policy`; "To cancel, email the club"), venue address with map link `https://www.google.com/maps/search/?api=1&query=<address>`. Checkout asks only for the booker; other guest details follow `guestDetails`/`collectAt`. Member banner explains member price.
4. **Confirmation page:** reference, what/when/where, "Add to calendar" (.ics generated in the browser, one VEVENT per session), map link, "Add guest details" if missing, "Book again", "View my booking".
5. **My bookings:** "Next session" card, refund status ("Refund sent to Visa •••• 4242, 5–10 working days"), "Book again" on past bookings. Keep "Request a change" and "Move a place".
6. **Waitlist:** "Join the waitlist" on sold-out sessions using the data shape the staff waitlist dialog in `events.js` reads; "You're on the waitlist" with Leave; show offers with a time-limited "Book this place".
7. **Source tracking:** parse `utm_source/utm_medium/utm_campaign` from hash links like `#/browse?event=<id>&utm_source=instagram&utm_medium=social&utm_campaign=<slug>`, keep through checkout (sessionStorage OK), set booking `channel` to Instagram / Email newsletter / Facebook / capitalised custom / default "Website". `#/browse?event=<id>` opens that event.
8. **Cleanup:** remove unused rules in `css/tickets.css`; accessible; good at phone widths.

## 9. First steps for the next session
1. `git status` and `git log --oneline -8` to see what is committed and what is not.
2. `for f in js/*.js js/views/*.js; do node --check $f; done` (all must pass).
3. Serve the folder over HTTP and open `index.html`. Click through as each role (admin, manager, customer). Use the demo user switcher.
4. Compare against sections 5 and 8; finish anything missing.
5. Fix browser bugs (console errors first), then ask the user whether to commit.

## 10. Suggested next work after that
- Merge cancel and refund into one flow on the booking page.
- Review the "business" list in the earlier audit: approval flows, retention, consent per person, activity log filters.
- Later (needs a real backend and decisions): real sign-in with a second step and idle sign-out, shared live check-in that works offline, real payments and emails, live member status from the membership system.
