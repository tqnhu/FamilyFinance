-- Migration 008: receipt photos and CSV import. Apply after 007.
-- A receipt photo lives in a private storage bucket at <family id>/<expense id>/<file>. Whoever may see
-- the expense may see its photo: a child only their own, a parent the whole family's.

alter table expenses add column receipt_path text, add column import_batch uuid;
-- the stored path must point inside this very expense's folder
alter table expenses add constraint receipt_path_matches
  check (receipt_path is null or receipt_path like family_id::text || '/' || id::text || '/%');
create index on expenses (import_batch) where import_batch is not null;

-- Clients choose the id (so the photo can be uploaded under it) and tag imports; the photo path is set after upload.
grant insert (id, import_batch) on expenses to authenticated;
grant update (receipt_path) on expenses to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 3145728, array['image/jpeg'])
on conflict (id) do nothing;

create policy "receipts: read" on storage.objects for select to authenticated using (
  bucket_id = 'receipts' and exists (
    select 1 from public.expenses e
    where e.id::text = (storage.foldername(name))[2] and e.family_id::text = (storage.foldername(name))[1]
      and e.family_id = public.my_family() and (public.is_parent() or e.member_id = auth.uid())));
create policy "receipts: upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'receipts' and exists (
    select 1 from public.expenses e
    where e.id::text = (storage.foldername(name))[2] and e.family_id::text = (storage.foldername(name))[1]
      and e.family_id = public.my_family() and (public.is_parent() or e.member_id = auth.uid())));
create policy "receipts: delete" on storage.objects for delete to authenticated using (
  bucket_id = 'receipts' and exists (
    select 1 from public.expenses e
    where e.id::text = (storage.foldername(name))[2] and e.family_id::text = (storage.foldername(name))[1]
      and e.family_id = public.my_family() and (public.is_parent() or e.member_id = auth.uid())));
