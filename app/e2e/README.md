# Browser tests

End-to-end checks that drive the real app in Chromium with a **stubbed Supabase** (no network, no real data):
adding and editing expenses, receipt photos, CSV import, monthly fees, joining a family, tags, the Home filter/bulk tagging, the category preview and detail pages, forgot-password, the account menu, profile and family settings, the getting-started checklist and tab badges, the highlighted upcoming bills in Plan, the Review tabs (Month with pie, bars, flow and budget hints; Year with goals; the wide two-column layout), marking annual fees (import review, expense form, totals), automatic classification (suggestions on the expense form and in the import), the family's rules (Plan → Rules, Remember this choice, import), and Tidy up Other (preview, move, undo).
They check what is sent to the database and what appears on screen. About 630 checks.

```bash
# once: Playwright must be installed (the cloud session has it; elsewhere: npm i -g playwright && npx playwright install chromium) and Pillow (pip install Pillow)
app/e2e/run-all.sh /tmp/ff-e2e      # starts the dev server if needed, runs every script (one retry each), prints ok / FAIL
# one script on its own: start `npm run dev -- --port 5173` in app/, then
NODE_PATH=$(npm root -g) node app/e2e/tags.cjs /tmp/ff-e2e
```

GitHub runs all of this on every push (`.github/workflows/tests.yml`). Each script prints `PASS:` / `FAIL:` lines and exits non-zero on a failure. Screenshots are written to `$OUT/ui/`.
The stub answers for the Supabase project in `app/.env`; it never contacts it.
