-- Migration 013: signed-out visitors cannot call internal functions, and two functions get a fixed search_path. Apply after 012.
-- Found by Supabase's security advisor. Nothing here changes what a signed-in person can do.
-- email_for_username stays callable before sign-in (it is how signing in with a username works).

-- Signed-out visitors have no use for these. They refused or returned nothing already; now they cannot even call them.
revoke execute on function create_family(text, text), join_family(text, text), family_codes(), is_parent(), my_family() from public, anon;
grant execute on function create_family(text, text), join_family(text, text), family_codes(), is_parent(), my_family() to authenticated;

-- A fixed (empty) search_path means these functions cannot be redirected to look things up in another schema.
-- Both only use built-in functions and schema-qualified names, so nothing they do changes.
alter function normalize_code(text) set search_path = '';
alter function stamp_expense_edit() set search_path = '';
