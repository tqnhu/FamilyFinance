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
| 22 | Measure it: KPI queries, then first-party usage events | 🔜 Next | High (shows what to build next) | S for the queries (written), M for usage events | none |
| 23 | Where the money goes: spending broken down by category, with shares | ✅ Done | High | M | none |
| 24 | Income tracking (spending as a share of income, a savings slice) | 📋 Planned | Medium–high | M–L | A decision on how income is recorded |
| 25 | Annual fees from a bank import kept out of monthly spending | ✅ Done | High | S–M | none |
| 26 | Automatic classification: rules plus learning from your own choices | ✅ Phases 1 to 3 done, phase 4 later | High (fewer "Other", faster entry and import) | M for phases 2 and 3, one new table | #25 (done) |
| 27 | Review redesigned: Month and Year with a pie, budget hints, Goals in Year | ✅ Done | High | M | #23 (done) |

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

### #27 Review: Month and Year ✅ (replaces the Breakdown tab of #23)

Review now has three tabs, **Month**, **Year** and **Tags**.

* **Month** opens on the current month; the arrows go back up to 24 months. It shows the total, the comparison with the month before (same days for the current month, the whole month for a finished one; on by default), the share chart, and the category list with tags and budget hints.
* **Pie by default**, with a name and share on every slice (leader lines, labels kept apart), a **Bars | Pie** switch (and **Flow** on screens at least 600 px wide), remembered on the device.
* **Budget hint** on each category that has a budget: a thin bar and a sentence ("€280 left of €1,000", "€120 left of €600, nearly used" from 80%, "€60 over its €300 budget"; "Ended €190 under its €1,000 budget" for a finished month). Words as well as colour. Budgets are today's budgets.
* **Year** shows the total and tiles, **Where the money went** (pie or bars; Bars keeps the yearly budget marks), **Spending by month**, **How the mix changed** and **Goals** (always today's progress).
* **Removed:** the Breakdown tab, the old "This month" review cards (Wins, Comfortably within budget, Worth a look), the "For your family meeting" card, and the Goals card on the month page (now in Year).
* **Tests.** 17 unit tests for the pie geometry, the budget hint and the stored choice, and 71 browser checks.

### #23 Where the money goes ✅ (now inside Month and Year, see #27)

Shows where the money went and what share that is.

* **Month or year**, with a stepper. The month view is compared with the same days of the month before (a finished month with the whole of the one before). The comparison is **on by default** and can be switched off.
* **One bar and a ranked list.** A single share bar shows every slice at once. The list under it gives each category's amount and percentage, and how it moved ("▲ €60 vs Oct"). The five biggest categories get their own row, the rest are grouped as "N more categories" (a single leftover category is never hidden inside a group). Shares are rounded so that they add up to exactly 100.0%.
* **Tap a row to see inside it.** A category shows its tags with each tag's share of the category ("No tag" last), and a link to every expense in it (the existing category page). The group shows the categories inside it.
* **Year view** adds the average per month and a 12-column chart of how the mix changed from month to month.
* **Flow diagram.** On screens at least 600 px wide there is a List / Flow switch: all spending flowing into its categories, drawn to scale. Phones keep the list.
* **Same rules as Home.** Monthly fees count as everyday spending; yearly and other non-monthly bills are never inside the shares and are reported in a note with a link to Plan.
* **No database change.** Months read the expenses directly, the year reuses `year_summary`.
* **Not included yet.** Spending is the whole (there is no income to compare with, see #24). The flow diagram stops at categories: tags are shown in the list. Months are read up to the usual 1,000-row limit (#20).
* **Tests.** 16 new unit tests (rounding to 100, grouping, comparison windows, tags, year, flow geometry) and 52 browser checks.

### #25 Annual fees marked on expenses (bank import fix) ✅

**The problem.** A yearly payment that arrived through a bank import (an insurance, a club membership) was an ordinary expense, so it inflated that month's spending, budgets and shares. Only payments made through Plan → Bills were kept apart.

**The fix.** Any expense can be marked as an **annual fee**. It then behaves like a yearly bill payment: left out of the month total, the budgets, the category pages and the Breakdown shares, and reported as "kept apart" instead (and in the Year view as a yearly bill).

* **In the import review** every row has an "Annual fee" checkbox. It starts ticked when the description says annual, yearly, per year or jaarlijks (a hint only, marked with a sparkle, and your choice always wins). A line under the list says how many rows (and how much) will be kept apart.
* **On the expense form**, new or existing, there is the same checkbox, so a mistake can be fixed later and a manual entry can be marked too.
* **Still visible.** An annual fee stays in the Home and category lists with an "annual fee" label, so it can be found and un-marked. Home and the category page say how much is kept apart.
* **Database.** Migration 014 adds `expenses.annual_fee` (off by default, so nothing existing changes) and makes `year_summary` report it as kept apart. The app only sends the field when it is ticked. **Apply migration 014 before using the checkbox.** Until then, ticking it fails with a clear error; everything else works.
* **Rules.** Anyone can mark their own expenses, parents any, other families none. Bill payments cannot be flagged. Marking does not count as an "edit" in the edited-by stamp.
* **Not covered.** Tag totals still include annual fees (they add up everything with that tag, bills included). Existing imported expenses are not flagged automatically; open one and tick the box.
* **Tests.** 12 database checks, 6 unit tests and 33 browser checks.

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

**#24 Income tracking 📋.** The breakdown shows shares of *spending*. Showing shares of *income* (and a Savings slice, as bank apps do) needs a way to record income: a new table, a screen to add or repeat it, and a decision on who may see it (a child should not see parents' income). Planned for later, after the breakdown has been used for a while.

**#26 Automatic classification ✅ (phases 1 to 3 are live; phase 4 is for later).** Sort expenses into categories (and optionally a tag or the annual-fee flag) from predefined rules and from what the family has taught it. UI proposal: [Automatic classification mock-ups](https://claude.ai/artifact/LKEbsgq2CgqB8qMwNjyur1) (sample data).

* **Today.** Only the bank import suggests a category, from the last 1,000 notes plus a built-in shop list that is matched by category *name* (rename "Groceries" and its keywords stop working). Adding an expense by hand suggests nothing, nothing is explained, nothing can be edited, and a correction is not remembered.
* **How it decides, in order.** (1) The family's own rules, most specific first. (2) What it learned from the family's corrections (at least 3 consistent examples and no contradicting ones). (3) Starter rules for common shops. If none is sure it leaves the category empty and asks. A guess is never saved without being shown first.
* **Every suggestion says why**: *Rule*, *Learned* (with how many times) or *Unsure*, with a "Why this suggestion?" link.
* **Learning is deliberate.** Only a category the person changes on the expense form or in the import review, and only after "Remember this choice?". Nothing is learned silently. Learned patterns wait in Plan → Rules → "Learned from you" until a parent presses "Make a rule".
* **Rules.** "When the description contains … (and the amount is between … and …), put it in category …, with tag …, as an annual fee". Case, accents and spaces are ignored. Each can be switched off. A preview shows which earlier expenses it would match. Parents manage rules; children only receive suggestions.
* **Where it shows.** Add expense (preselected chip), the import review (a "sorted automatically" summary, a "Needs you" filter), Plan → Rules, and a "Tidy up Other" screen that proposes categories for past expenses with a preview and an undo.
* **Phases.** (1) ✅ **Done.** One shared engine (`lib/classify.ts`) used by Add expense and the import. A European starter list (NL, BE, DE, FR, ES, IT, UK/IE, Nordics, PL, AT, CH) that understands other names for a category (Food, Supermarket, Leisure, Travel…). Every suggestion has a label (Rule, Learned, Unsure, Your choice) and a reason. Confident suggestions are pre-selected on the expense form (3 or more consistent earlier expenses, or a starter rule); weaker ones (2 examples) are only offered with a "Use" button. Children get suggestions too. The import shows "N of M sorted automatically" and a "Needs you" filter. No database change. What it learns still comes from the expenses the family has saved (their latest 1,000); a starter rule is found by category *name*, so a category with an unrelated name gets no starter suggestions until a real category id link exists (phase 2). (2) ✅ **Built (apply migration 015 to use it).** A `classification_rules` table (family, text, optional amount range, category, tag, annual-fee flag, on / off / dismissed; at most 300 per family; everyone in the family can read, only parents change). **Plan → Rules**: a summary of how much is in Other, "Learned from you" (a text seen at least 3 times and nearly always in one category, not already a rule or a starter shop) with Make a rule / Not this one (a turned-down pattern is never offered again), Your rules (on/off switch, edit, delete, a preview of earlier expenses it matches) and the starter list. **Remember this choice?** appears on the expense form when a parent changes a suggestion (a known shop is remembered by its name alone), and the bank import has a "Remember the categories I choose here" option, one rule per shop. A rule can also set a tag and the annual-fee flag. Rules always win over history and the starter list. Children get the suggestions but never see or change rules. Until the migration is applied everything else works and the Rules tab explains it cannot save. (3) ✅ **Done.** **Tidy up Other** (Plan → Rules → "Tidy up Other…"): the expenses filed under Other (not bill payments, up to 500, newest first) that a rule, the family's history or the starter list can now place. Other is never suggested, and what was filed in Other teaches nothing. Each row shows where it would go and why; the sure ones (rules, starter shops, three or more consistent examples) are ticked, the weaker ones are offered unticked and marked "maybe". Nothing changes until "Move N expenses" is pressed. A rule's tag and annual-fee flag are applied too (an existing tag is never overwritten). Updates are grouped, so many rows move per request. Straight afterwards an **Undo this move** puts back exactly what was changed (category, and the tag and flag only where they were set). The undo is available while the screen is open; after that, change expenses one by one on Home. Moved expenses show as "edited by" the parent. 5 unit tests and 26 browser checks. (4) Later: more starter lists by country; possibly suggestions from the amount or day of month (recurring payments).
* **Privacy and safety.** Everything runs inside the family's own data; no description is sent to a third party. Rules are family-wide and row-secured like categories. Wrong suggestions are caught by the review step, and re-sorting past expenses always previews first.
* **Not built yet (phase 4).** More starter lists by country, rules that suggest from the day of the month or a repeating amount, and an undo that survives leaving the screen.
* **Measuring it.** Share of expenses in Other (already measurable), and, once usage events exist (#22), how often a suggestion is accepted.
* **Decided.** European starter list; children get suggestions; confident suggestions are pre-selected and weaker ones only offered.

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

**#22 Measure it 🔜.** Step one is done: [kpi-queries.sql](kpi-queries.sql) holds 16 read-only queries behind the metrics in section 7, checked against a scratch database. Run them weekly, by hand. Step two (M): a small `usage_events` table (who, when, which screen or action, never an amount) so that visits, such as opening the monthly review, can be counted too. It needs a decision on retention and on how children's activity is recorded, so it waits until the queries show a need.

## 4. Suggested order

1. **Quick and high impact:** #22 run the KPI queries weekly (nothing to build), #1 reliable emails (needs you), #15 automatic tests, #16 backups (needs you), #17 two dashboard settings (needs you).
2. **Medium effort:** #7 automatic monthly fees, #8 budgets from history, #13 data export, #14 account management, #4 live updates, and the guide from #6.
3. **Bigger bets:** #5 email reminders and summary (reuses #1), #9 receipt reading, #11 Vietnamese, #10 offline entry, and the real fix for #6.

**What changes the order.** If the app stays within your own family, #19 and #21 can wait. If you plan to open it to others, they move to the front, together with #1 and #5.

## 5. What has been built so far

* **Foundations.** Family accounts with parent and child roles, sign-in by email or username, euro expense entry, monthly budgets, a dashboard.
* **Kids' money.** Spend, Save and Give jars, weekly allowance, purchase requests with parent approval, an optional savings match, badges and streaks.
* **Saving together.** Shared family goals with a time-to-goal estimate and a "what if" slider.
* **Planning.** Budget management (add, rename, archive categories), a bills tracker (yearly, half-yearly, quarterly, monthly) with reminders, monthly fees counted as everyday spending, a Month and a Year review with a pie of where the money went, budget hints and goals.
* **Working with the data.** Edit and delete expenses, browse older months, receipt photos, CSV bank import with undo, tags with month, year and all-time totals, a Home tag filter and bulk tagging, category previews and detail pages, and where the money goes with shares as a pie, bars or a flow diagram.
* **Accounts and family.** Forgot-password, an account menu with My profile and Family settings (name, members, invite codes with copy and a ready-made invitation, replacing leaked codes), forgiving invite codes.
* **Security.** Row-level security on every table, column-level permissions, money rules inside the database, signed-out visitors limited to one function, checked against Supabase's security advisor.
* **Quality.** 394 database checks, 251 unit tests and about 610 browser checks, plus architecture and user-journey documents.

## 6. Decisions log

| Decision | Choice | Why | Revisit when |
|---|---|---|---|
| Currency and language | Euro, English only | The family's brief | Relatives or kids need another language (#11) |
| Tags per expense | One | Tag totals then add up exactly to total spending | Someone needs overlapping tags (#12) |
| Tag names | Visible to the whole family | Simplicity | A parent needs a private tag |
| Kids' sign-up | Needs a real email address, a parent may help | Username-only sign-up was not wanted | #6 |
| Username sign-in | Kept, with the email lookup exposure | Convenient, and fine for a private family app | Before opening the app to strangers (#19) |
| Bills | Monthly fees count as everyday spending, the rest are kept apart | One big payment should not wreck a month | A parent wants them counted too |
| Review layout | Three tabs (Month, Year, Tags); the shares are inside Month and Year; Pie is the default, remembered per device; five biggest categories, the rest grouped; comparison on by default; no review cards or family-meeting prompt | Reads best at phone width; the comparison answers "is this normal?" straight away | Families ask for other names or more slices |
| Annual fees | A flag on any expense, kept apart like a yearly bill, still listed and editable | Simplest fix that also covers bank imports, with no new screens | Families want yearly bills on Plan to be created from an imported payment |
| Classification | European starter list; children get suggestions; confident ones pre-selected, weaker ones offered | A pre-filled wrong category is caught by the label and reason shown beside it | Wrong pre-selections are reported often (raise the confidence bar) |
| Breakdown scope | Spending only; income is planned later (#24) | The app has no income today | A parent asks to see spending against income |
| Notifications | In-app badges now, email later | Email needs infrastructure and an email provider | #1 is done |
| KPIs | First-party and family-level; north star is weekly engaged families; targets are provisional | Privacy for a family and children's app, and only a few families so far | There are enough families for the percentages to mean something |
| KPI queries | Run by hand in the SQL editor, never stored as views or functions | They read across all families, and the public schema is exposed through the API | A real admin area exists |
| Checklist and badge memory | On the device, not in the family's data | No new database tables needed | A family wants it shared between phones |

## 7. Measuring success (KPIs)

How we will know the app is doing its two jobs: **helping a family control spending** and **teaching kids about money**. Everything here is provisional. With one family using the app today, treat the numbers as a conversation starter, not a score. The queries that produce them are in [kpi-queries.sql](kpi-queries.sql) (read-only, run by hand in the Supabase SQL editor).

### North star

**Weekly engaged families**: families in which at least two different members did something in the app that week (logged an expense, asked for a purchase, moved jar money, or put money into a goal). Two people, not one, because the product is for sharing; a week, because the habit it builds is weekly.

### The metrics

Data today: ✅ the database already holds it, 🟡 partly, 🔴 needs new tracking (see "Gaps" below). Targets are first guesses to revisit after a few months of real use.

| Group | Metric | Why it matters | Data | Provisional target |
|---|---|---|---|---|
| **Onboarding** | Activation: at least 3 expenses and 2 members within 7 days of creating the family | The first week decides whether it sticks | ✅ | 60% |
| | Median time from creating the family to the first expense | A long wait means the first screen is confusing | ✅ | Under 1 day |
| | Sign-up funnel: signed up, confirmed email, reached a family | Shows where people give up, and whether email delivery (#1) is the culprit | ✅ | 80% reach a family |
| | Failed invite-code attempts per person who got in | Join problems were the first real bug report | ✅ | Falling |
| **Engagement** | Weekly engaged families (north star) | See above | ✅ | Rising |
| | Logging consistency: weeks in the last 8 with at least 3 expenses | Tracking only works as a habit | ✅ | 4 or more of 8 |
| | Shared use: families where two or more people logged in the last 30 days | Shared use is the point | ✅ | 70% |
| | Feature adoption: tags, receipts, import, bills, goals, allowance | Shows which features earn their place | ✅ | Track only |
| **Kids' learning** | Child participation: children active in a week, out of all children | Kids are the second job | ✅ | 60% |
| | Voluntary saving: share of jar money a child moved into Save or Give | The clearest sign of learning | ✅ | Rising |
| | Request answer time and share answered within 24 hours | A slow answer teaches nothing | ✅ | Median under 12 hours |
| | Goals reached | Saving with a purpose | ✅ | Track only |
| **Spending control** | Budgeted categories within budget this month | The adult outcome | 🟡 (today's budgets only, no history) | Improving over months |
| | Bills paid on or before the due date | Late fees are avoidable | ✅ | 95% |
| | Month over month change in "Other" and uncategorised spending | Honest categories make the review useful | ✅ | Falling |
| | Monthly review opened | The monthly check-in moment | 🔴 | Once a month |
| **Retention** | Families still active in week 4, and in month 3 | Whether it became a habit | ✅ | 50% in week 4 |
| | Families at risk: were active, quiet for 14 days | A list to reach out to, or to trigger a reminder (#5) | ✅ | Track only |
| **Health** | Share of expenses edited after saving | A high number means entry is error-prone | ✅ | Under 10% |
| | Receipt storage used | Free storage allowance runs out | ✅ | Watch |
| | Errors per week | Problems found before families report them | 🔴 (needs #18) | Near zero |

### Which roadmap item moves which number

| Item | Moves |
|---|---|
| #1 Reliable emails | Sign-up funnel, time to first expense |
| #2 Checklist (done) | Activation, time to first expense |
| #3 Badges (done) | Request answer time |
| #4 Live updates, #5 Email reminders | Request answer time, logging consistency, retention, families at risk |
| #6 Help for kids without email | Child participation |
| #7 Automatic monthly fees | Logging consistency, budget adherence |
| #8 Budgets from history | Budgets within budget, adoption |
| #13 Data export | Retention (trust) |

### Gaps in what we can measure

* **The database records changes, not visits.** Looking at the Home screen or opening the monthly review leaves no trace. Two metrics (monthly review opened, anyone who only looks) cannot be measured until the app records usage events. That is the second half of #22.
* **No history of budgets or deleted rows.** "Within budget" uses today's budgets. Deleting an expense removes it entirely, so mistakes fixed by deleting are invisible.
* **Very small sample.** Until several families use the app, read the counts and each family's story, not the percentages.

### Principles for measuring

* **First-party only.** Counts come from our own database. No advertising or analytics service sees any family's data.
* **Family level, never amounts or names.** Every query returns counts per family or per week. None returns a name, email address or euro amount.
* **Children's data gets extra care.** Keep child-level numbers to counts (active or not), and do not add behaviour tracking of individual children.
* **Keep the queries private.** They read across all families. Save them in the SQL editor; do not turn them into views or functions in the `public` schema, which Supabase exposes through its API.

### Cadence

* **Weekly (about 15 minutes):** north star, activation, sign-up funnel, join friction, request answer time.
* **Monthly:** the rest, then pick one number to improve next month and write the choice in the decisions log.
* **Before any release that changes onboarding:** note activation and time to first expense, then compare a few weeks later.

## 8. Keeping this file honest

* Change a status here in the same change that does the work.
* Add a line to the decisions log when something is decided, including "not now".
* When an item is finished, move its description to section 2 (or section 5 for older work).
