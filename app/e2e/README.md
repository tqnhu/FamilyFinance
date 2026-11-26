# Browser tests

End-to-end checks that drive the real app in Chromium with a **stubbed Supabase** (no network, no real data):
adding and editing expenses, receipt photos, CSV import, monthly fees, joining a family, tags, the Home filter/bulk tagging, the category preview and detail pages, forgot-password, the account menu, profile and family settings, the getting-started checklist and tab badges, the highlighted upcoming bills in Plan, and the Breakdown of where the money goes (shares, comparison, tags, groups, year, flow diagram).
They check what is sent to the database and what appears on screen. About 450 checks.

```bash
# once: Playwright must be installed (the cloud session has it; elsewhere: npm i -g playwright && npx playwright install chromium)
OUT=/tmp/ff-e2e; mkdir -p $OUT/ui
python3 app/e2e/make_fixtures.py $OUT          # needs Pillow; makes the photos and CSV files
cd app && npm run dev -- --port 5173 &          # the tests open http://localhost:5173
for t in edit-expenses receipts-import monthly-fees join-family tags home-tags category-details account-settings getting-started-badges plan-upcoming-bills breakdown; do
  NODE_PATH=$(npm root -g) node e2e/$t.cjs $OUT
done
```

Each script prints `PASS:` / `FAIL:` lines and exits non-zero on a failure. Screenshots are written to `$OUT/ui/`.
The stub answers for the Supabase project in `app/.env`; it never contacts it.
