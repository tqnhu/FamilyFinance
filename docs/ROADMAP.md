# Roadmap

What has been built, what comes next, and why. Keep this file current: change a status when work starts or finishes,
and add a line to the decisions log when something is decided.

Related documents: [ARCHITECTURE.md](ARCHITECTURE.md) (how it is built) and [USER_JOURNEY.md](USER_JOURNEY.md) (who it is for and where families drop off).

## How to read this

**Status**

| Mark | Meaning |
|---|---|
| ✅ Done | Built, tested and live |
| 🔜 Next | Ready to start, nothing blocking |
| 📋 Planned | Agreed in principle, waiting its turn |
| 💡 Later | Worth doing, but not yet |
| ❓ Decision | Needs a choice from the owner before work can start |
| 🧑 Owner | An action only the project owner can take (a dashboard setting, a purchase, a domain) |

**Complexity** (rough estimates, not promises)

| Size | Meaning |
|---|---|
| **S** | About a day. Changes the web app only. |
| **M** | A few days. Often needs a database change or careful testing. |
| **L** | A week or more, or **new infrastructure**. The app has no server of its own today, so anything that must run on a schedule or hold a secret key counts as L. |

## 1. The list at a glance

| # | Step | Status | Impact | Complexity | Depends on |
|---|---|---|---|---|---|
| 1 | Reliable sign-up and reset emails (own email sender in Supabase) | 🧑 Owner | Very high | S–M | A domain you own, an email provider |
| 2 | First-run "Get started" checklist | ✅ Done | High | S | none |
| 3 | Waiting-item badges on the tab bar | ✅ Done | High | S | none |
| 4 | Live updates (a request appears as it is made) | 📋 Planned | Medium | S–M | none |
| 5 | Email reminders and a weekly summary | 📋 Planned | Very high | L | #1 (email provider), a scheduled job |
| 6 | Help for kids who have no email address | 📋 Planned | High for ages 6 to 9 | S for a guide, M–L for the real fix | A decision on the approach |
| 7 | Monthly fees recorded automatically | 📋 Planned | Medium | M | none |
| 8 | Budgets suggested from your own history | 📋 Planned | Medium | S–M | some history |
| 9 | Receipt reading (amount and shop from a photo) | ❓ Decision | Medium | M–L | in-browser reading or an AI service |
| 10 | Offline entry (log with no signal, sync later) | 💡 Later | Medium | L | none |
| 11 | Vietnamese and other languages | ❓ Decision | High if relatives or kids need it | M | who will use it |
| 12 | More than one tag per expense | 💡 Later | Low–medium | M | none |
| 13 | Data export (download everything) | 📋 Planned | Medium | S–M | none |
| 14 | Change email, remove a member, leave a family, delete an account | 📋 Planned | Medium–high | M | decisions on what happens to someone's data |
| 15 | Automatic tests on every push | 🔜 Next | High | S–M | none |
| 16 | Backups | 🧑 Owner | High | S | a Supabase plan decision |
| 17 | Two Supabase dashboard settings (leaked-password protection, reset-link address) | 🧑 Owner | Medium | S | none |
| 18 | Error reporting | 📋 Planned | Medium | S–M | a service choice |
| 19 | Username lookup exposes an email address | ❓ Decision | Low now, high before opening to strangers | M–L | see the decision log |
| 20 | Smaller JavaScript bundle and paging for long lists | 💡 Later | Low–medium | S and M | none |
| 21 | Privacy policy and terms | 💡 Later | Required before opening to others | S (writing), possibly legal review | none |

## 2. Done in the latest release

### #2 Getting-started checklist ✅

A "Get started" card at the top of Home for the current month.

* **Parents** see: add the first expense, check the monthly budgets, invite a partner or kids, set a child's allowance (only once a child has joined), plus two optional suggestions: add a regular bill, add the app to the home screen.
* **Children** see a short list: log the first expense, look at the three jars, and the optional home-screen step.
* **Nothing to maintain.** What is done is worked out from the family's own data using light count queries: any expense, more than one member, a weekly allowance set, any bill, edited or added budget categories. Adding an expense from the card ticks it at once.
* **Budgets.** The starting budgets are real numbers we chose, so the step is ticked when they are edited, a category is added, removed or archived, or a parent presses "They look right".
* **Finishing.** The card disappears by itself when the essentials are done (optional steps never hold it open) and can be hidden with one tap. Settings → My profile has "Show the checklist again".
* **Install.** Where the browser offers it, the step gets a real Install button. Elsewhere it explains the iPhone and Android steps. Running as an installed app ticks it.
* **Known limits.** "Hidden" and "budgets look right" are remembered on the device, not in the family's data, so another phone starts afresh. The card is not shown when browsing a past month.
* **Tests.** Covered together with #3 (below).

### #3 Waiting-item badges ✅

Small red counts on the tab bar.

* **Parents:** Jars shows purchase requests waiting for an answer. Plan shows bills that are overdue or due within a week (ended bills and bills further away do not count).
* **Children:** Jars shows answers (yes or no) to their requests that they have not seen yet. Looking at Jars clears it. Answers older than two weeks never count, so a new phone does not greet a child with old news.
* **Up to date without polling.** Counts refresh on navigation, when the app comes back to the front, and straight after an action that changes them (for example approving a request lowers the badge at once). Nothing runs in the background.
* **Accessible.** Screen readers hear "2 waiting", "2 bills due" or "2 new answers".
* **Known limit.** A badge only appears when the app is open or comes to the front. It cannot alert someone who has not opened the app. That needs notifications (#5).
* **Tests.** For both features together: 17 unit tests (checklist rules, badge counting, safe local storage) and 50 browser checks (every checklist state for parents and children, install handling, hiding and bringing back, and the badges for parents and children including live refresh).

### Upcoming bills highlighted in Plan ✅

Plan → Bills now shows which bill is next.

* **"Coming up" card at the top:** one row per bill that is overdue or due within 30 days, soonest first, with the amount, a countdown in plain words ("4 days overdue", "Due in 3 days", "Due today") and a Mark paid button. A monthly bill left unpaid for months shows once, with "+N more unpaid".
* **Three levels, each with words and an icon so colour is never the only signal:** overdue (⚠️, red), due within a week (⏰, amber), due within 30 days (🗓️, green). Nothing due says so.
* **Bill cards** are ordered by what is due next, carry a coloured edge and a countdown chip, and the next unpaid date inside each card is tinted and bold. Far-off bills just say "Next due …".
* **The Plan tab badge now counts bills, not due dates**, so it agrees with the list (a monthly bill that is months behind counts once, not as "9+").
* **Tests.** 10 new unit tests and 30 browser checks (ordering, level boundaries at 0, 7, 8, 30 and 31 days, marking paid from the list, the badge agreeing with the list, monthly bills, already-paid dates, accessibility).

## 3. The rest of the list

### A. Onboarding and retention

**#1 Reliable sign-up and reset emails 🧑.** Confirmation and password-reset emails come from Supabase's built-in sender, which allows only a few emails an hour for the whole project. One missing email ends a family's journey, so this is the biggest early drop-off risk. Almost no code is needed: choose an email provider, connect it in the Supabase dashboard (Authentication, SMTP settings), and add the DNS records the provider asks for. **Needs from you:** a domain you own, and an account with an email provider. Also the base for #5.

**#4 Live updates 📋.** Use Supabase realtime on a few tables (purchase requests, expenses) so a request appears on a parent's open screen as it is made. Row-level security still applies. Only helps while the app is open, so it complements rather than replaces #5.

**#5 Email reminders and a weekly summary 📋.** The strongest retention lever: a nudge when nothing was logged for several days, a bill due, a request waiting, a monthly family summary. New infrastructure: a scheduled job, an email provider (shared with #1), message templates, an unsubscribe and per-person preferences, and care with kids' addresses (a parent's address may be used for a child). Phone push is a further step and works on iPhones only for installed apps. Suggested phases: reminders first, then the summary.

**#6 Kids with no email address 📋.** A child under about ten has none. Three routes: (a) a short guide, using a plus-address the parent controls, such as `name+mia@gmail.com`, so confirmation lands in the parent's inbox (S); (b) parent-created child accounts through a server holding an admin key (L); (c) children managed by a parent without a login of their own, which changes the data model (M–L). Do (a) now, decide (b) or (c) later.

### B. Core product

**#7 Monthly fees recorded automatically 📋.** Today a parent taps Mark paid each month. It can reuse the approach allowances use (do the work when someone opens the screen), so no new infrastructure. The care is in amounts that vary, repeating the same month twice, and marking the amount as an estimate that can be corrected.

**#8 Budgets suggested from history 📋.** After a few months of data, offer "set budgets from the last three months". Client only, and removes the guesswork from first-time budgeting.

**#9 Receipt reading ❓.** Two routes. In-browser reading is free and private but less accurate and adds a large download. An AI vision service is accurate but needs a server holding a key, costs per receipt, and sends receipts to a third party. Either way a "check and confirm" screen is needed. **Needs from you:** which route.

**#10 Offline entry 💡.** Log an expense with no signal and sync later. A local queue, conflict handling and background sync, with limits on iPhones.

**#11 Other languages ❓.** Vietnamese first if relatives or kids need it. Move every on-screen text into translation files, then translate and maintain them. Money stays in euros. **Needs from you:** who will use it.

**#12 More than one tag per expense 💡.** Needs a link table. Tag totals would then overlap and no longer add up to total spending, so the reports need reworking.

**#13 Data export 📋.** Download everything as CSV for trust and portability. Client-side, with paging for long histories.

### C. Account and family management

**#14 Change email, remove a member, leave a family, delete an account 📋.** Email change is simple. The hard part is deciding what happens to a person's expenses, and to a child's jars, when they leave. Deleting an account needs a server function with an admin key.

### D. Trust, safety and engineering health

**#15 Automatic tests on every push 🔜.** Today the database checks, unit tests and browser checks run only when someone runs them, and every push deploys. A GitHub Actions workflow would run them on each push. Unit tests are easy, the database tests need a Postgres service, and the browser tests need Playwright.

**#16 Backups 🧑.** This is family financial data. Check what the Supabase plan includes: point-in-time recovery needs a paid plan, and a scheduled export is the cheaper fallback.

**#17 Two dashboard settings 🧑.** (a) Leaked-password protection (Authentication in Supabase; it may need a paid plan). (b) The app's address under Authentication → URL Configuration, as both Site URL and Redirect URLs, so password-reset links return to the app.

**#18 Error reporting 📋.** Add an error-tracking service so problems are noticed before a family reports them.

**#19 Username lookup exposes an email address ❓.** Signing in with a username works by asking the database for the email behind it, and the function must be callable before sign-in. Anyone who knows a username can therefore learn that person's email. Options: keep it, remove username sign-in, or move the lookup behind a rate-limited server function (M–L). Decided to keep it for now (see the log).

**#20 Bundle size and long lists 💡.** The browser downloads one large file, and plain lists are capped at about 1,000 rows per request. Splitting the code is S. Paging the monthly lists is M.

**#21 Privacy policy and terms 💡.** Not needed for your own family. Required before opening the app to others, because it holds children's data. The writing is S and may need legal review.

## 4. Suggested order

1. **Quick and high impact:** #1 reliable emails (needs you), #15 automatic tests, #16 backups (needs you), #17 two dashboard settings (needs you).
2. **Medium effort:** #7 automatic monthly fees, #8 budgets from history, #13 data export, #14 account management, #4 live updates, and the guide from #6.
3. **Bigger bets:** #5 email reminders and summary (reuses #1), #9 receipt reading, #11 Vietnamese, #10 offline entry, and the real fix for #6.

**What changes the order.** If the app stays within your own family, #19 and #21 can wait. If you plan to open it to others, they move to the front, together with #1 and #5.

## 5. What has been built so far

* **Foundations.** Family accounts with parent and child roles, sign-in by email or username, euro expense entry, monthly budgets, a dashboard.
* **Kids' money.** Spend, Save and Give jars, weekly allowance, purchase requests with parent approval, an optional savings match, badges and streaks.
* **Saving together.** Shared family goals with a time-to-goal estimate and a "what if" slider.
* **Planning.** Budget management (add, rename, archive categories), a bills tracker (yearly, half-yearly, quarterly, monthly) with reminders, monthly fees counted as everyday spending, a monthly review with a family-meeting prompt, a yearly overview with charts.
* **Working with the data.** Edit and delete expenses, browse older months, receipt photos, CSV bank import with undo, tags with month, year and all-time totals, a Home tag filter and bulk tagging, category previews and detail pages.
* **Accounts and family.** Forgot-password, an account menu with My profile and Family settings (name, members, invite codes with copy and a ready-made invitation, replacing leaked codes), forgiving invite codes.
* **Security.** Row-level security on every table, column-level permissions, money rules inside the database, signed-out visitors limited to one function, checked against Supabase's security advisor.
* **Quality.** 359 database checks, 189 unit tests and about 400 browser checks, plus architecture and user-journey documents.

## 6. Decisions log

| Decision | Choice | Why | Revisit when |
|---|---|---|---|
| Currency and language | Euro, English only | The family's brief | Relatives or kids need another language (#11) |
| Tags per expense | One | Tag totals then add up exactly to total spending | Someone needs overlapping tags (#12) |
| Tag names | Visible to the whole family | Simplicity | A parent needs a private tag |
| Kids' sign-up | Needs a real email address, a parent may help | Username-only sign-up was not wanted | #6 |
| Username sign-in | Kept, with the email lookup exposure | Convenient, and fine for a private family app | Before opening the app to strangers (#19) |
| Bills | Monthly fees count as everyday spending, the rest are kept apart | One big payment should not wreck a month | A parent wants them counted too |
| Notifications | In-app badges now, email later | Email needs infrastructure and an email provider | #1 is done |
| Checklist and badge memory | On the device, not in the family's data | No new database tables needed | A family wants it shared between phones |

## 7. Keeping this file honest

* Change a status here in the same change that does the work.
* Add a line to the decisions log when something is decided, including "not now".
* When an item is finished, move its description to section 2 (or section 5 for older work).
