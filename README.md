# FamilyFinance

Shared family expense and savings tracker for parents and kids (a web app you can install on a phone). English, euros.
No server of its own: a static React app on Vercel talking to Supabase (login, database with row-level security, file storage).

**Where things are:** [docs/ROADMAP.md](docs/ROADMAP.md) (full list, decisions, what is next), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (how it is built), [docs/USER_JOURNEY.md](docs/USER_JOURNEY.md) (who it is for), [docs/kpi-queries.sql](docs/kpi-queries.sql) (success numbers).

## Status at a glance

| | |
|---|---|
| **Stage** | Working product for your own family; not yet opened to others |
| **Built** | Phases 1 to 7 below |
| **Live database** | Up to date through migration 019 (`supabase/migrations/`) |
| **Tests** | 432 database checks, 260 unit tests, about 650 browser checks; GitHub runs all of them on every push |
| **Next** | Email: reliable sign-up emails, then reminders and a weekly summary (needs a domain and an email provider) |

## What is built, by phase

### Phase 1: Family tracking ✅
- Family login (email or username), parent and child roles, invite codes.
- Euro expense entry (amount, note, date, category, tags), monthly budgets per category.

### Phase 2: Kids' money ✅
- Spend, Save and Give jars, a weekly allowance, purchase requests that a parent approves, an optional parent match on savings.

### Phase 3: Goals ✅
- Shared family savings goals with a time-to-goal estimate and a "what if" slider; kids' badges and saving streaks.

### Phase 4: Budgets and bills ✅
- Add, rename and archive categories; a yearly bills tracker (insurance and similar: due dates, mark paid, monthly set-aside, reminders). Bills charged monthly count as normal spending; yearly ones are kept apart.

### Phase 5: Better entry and data ✅
- **Editing:** tap any expense to fix it or delete it; changes are marked "edited by"; older months can be browsed and corrected.
- **Receipt photos:** shrunk on the phone, kept in a private bucket that follows the expense's permissions.
- **CSV import** (Plan, Import): columns, date format and signs are detected, likely duplicates are unticked, every import can be undone, and yearly fees can be marked so they stay out of monthly spending.
- **Automatic categories:** suggestions from your own history, family rules, and a European starter list; "Remember this choice"; Tidy up Other with undo. Managed in Settings, Configuration.
- **Tags:** up to 5 tags per expense (trips, projects), a default tag on a bill, or on a whole import; bulk tag or untag from Home.
- **Add expense** is ordered Amount, Note, Date, Category, Tags.

### Phase 6: Understanding spending ✅
- **Home:** what is left to spend this month (with days left and a daily figure), then a tile per category, tightest first. Tap a tile for its details: budget left, comparison with last month, tags, and its expenses.
- **Review** (parents): Month and Year with a pie, bars or flow chart, budget hints, a comparison with last month, goals in Year; a wide two-column layout on big screens.
- **Tag filter** on Month and Year: choose several tags to see only expenses that have all of them.

### Phase 7: Account, onboarding and quality ✅
- Forgot-password by email; a menu on your name for My profile, Family settings and Configuration (tags and rules, parents only).
- A Get started checklist and tab-bar badges (waiting requests, bills due, unseen answers); forgiving invite codes.
- Automatic tests on every push (GitHub Actions); 18 success-number queries and first-party usage counts (which screen was opened, never amounts or names).

## What comes next

| Order | Item | Needs |
|---|---|---|
| 1 | Reliable sign-up and reset emails | A domain and an email provider (you) |
| 2 | Weekly summary and reminder emails | #1 above |
| 3 | Backups, two Supabase dashboard settings | A few clicks in Supabase (you) |
| 4 | Help for kids without an email address, change email and leave or delete a family, data export | Decisions on approach |
| 5 | Live updates, error reporting, budgets suggested from history, automatic monthly fees | Nothing blocking |
| Later | Receipt reading, other languages (Vietnamese), offline entry, income tracking, privacy policy before opening to others | Decisions |

The complete list with status, size and reasons is in [docs/ROADMAP.md](docs/ROADMAP.md).

## Run it
1. Create a free project at supabase.com and run `supabase/schema.sql` in the SQL editor.
   Upgrading an existing project? Run the files in `supabase/migrations/` you haven't applied yet, in order.
2. `cd app && cp .env.example .env` and fill in the project URL and anon key.
3. `npm install && npm run dev`

## Tests
- `npm test` (in `app/`): unit tests. Type check: `npx tsc -b`.
- Database: `supabase/tests/run-all.sh` against a scratch Postgres (never your real project); see `supabase/tests/README.md`.
- Browser: `app/e2e/run-all.sh` drives the real app in Chromium against a stubbed backend; see `app/e2e/README.md`.
- All three run on every push through `.github/workflows/tests.yml`.
