# FamilyFinance

Shared family expense and savings tracker (PWA) for parents and kids.

## Features
- **Phase 1:** family login (email or username), parent/child roles, euro expense entry, monthly budgets, dashboard.
- **Phase 2:** kids' Spend/Save/Give jars, weekly allowance, purchase requests with parent approval, optional parent match on savings.
- **Phase 3:** shared family savings goals with a time-to-goal estimate and "what if" slider, kids' badges and saving streaks, and a monthly family review for parents.
- **Phase 4:** budget management (add, rename, archive categories), a yearly bills tracker (car/home insurance and similar: due dates, mark paid, monthly set-aside, reminders; bills charged monthly count as normal spending in the month they are paid), and a yearly spending overview with charts.
- **Tags:** put one tag ("Vietnam trip", "Kitchen") on any expense, or a default tag on a bill, or on a whole CSV import. Review → Tags adds up each tag by month, year or all time, with its expenses and a monthly breakdown. On Home, filter the list by tag (or "Without a tag"), and use Select to tag or untag many expenses at once.
- **Category details:** on Home, hover a category (mouse or keyboard) to preview its 3 latest expenses for that month; click it to open Review with every expense in that category for the same month, a budget bar, the share of spending and a comparison with last month.
- **Account and settings:** forgot-password by email, and a menu on your name (top left) for My profile (name, username, password, sign out of all devices) and Family settings (family name, members, invite codes with copy and a ready-made invitation, replace leaked codes).
- **Getting started and badges:** a "Get started" checklist on Home (worked out from your own data, hideable) and small counts on the tab bar for waiting purchase requests, bills due, and a child's unseen answers. See `docs/ROADMAP.md` for what comes next.
- **Joining a family:** invite codes are forgiving (any capitalisation, spaces, dashes, a letter O typed for a zero), and someone who started an empty family by mistake can still join the real one.
- **Editing expenses:** tap any expense to fix the amount, category, note or date, or delete it. Kids can fix their own, parents any. Changes are marked "edited by", and older months can be browsed and corrected.
- **Receipt photos:** attach a photo to any expense (camera or gallery). It is shrunk on the phone and kept in a private bucket that follows the expense's permissions.
- **CSV import:** import a bank export (Plan → Import). Columns, date format and sign convention are detected, categories are suggested from your own history, likely duplicates are unticked, and every import can be undone.

## Run it
1. Create a free project at supabase.com and run `supabase/schema.sql` in the SQL editor.
   Upgrading an existing project? Run the files in `supabase/migrations/` you haven't applied yet, in order.
2. `cd app && cp .env.example .env` and fill in the project URL and anon key.
3. `npm install && npm run dev`
4. `npm test` runs the unit tests; database tests are in `supabase/tests/`; browser tests are in `app/e2e/`.
