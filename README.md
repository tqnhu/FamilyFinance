# FamilyFinance

Shared family expense and savings tracker (PWA) for parents and kids.

## Features
- **Phase 1:** family login (email or username), parent/child roles, euro expense entry, monthly budgets, dashboard.
- **Phase 2:** kids' Spend/Save/Give jars, weekly allowance, purchase requests with parent approval, optional parent match on savings.

## Run it
1. Create a free project at supabase.com and run `supabase/schema.sql` in the SQL editor.
   Upgrading an existing project? Run the files in `supabase/migrations/` you haven't applied yet, in order.
2. `cd app && cp .env.example .env` and fill in the project URL and anon key.
3. `npm install && npm run dev`
