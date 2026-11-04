-- Private personal sticker bucket. Run in Supabase SQL Editor.
-- The bucket must already exist and remain PRIVATE.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-stickers', 'user-stickers', false, 2097152, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif'];

drop policy if exists "Users can list own personal stickers" on storage.objects;
drop policy if exists "Users can upload own personal stickers" on storage.objects;
drop policy if exists "Users can delete own personal stickers" on storage.objects;

create policy "Users can list own personal stickers"
on storage.objects for select to authenticated
using (bucket_id = 'user-stickers' and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub'));

create policy "Users can upload own personal stickers"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'user-stickers'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  and (storage.extension(name) in ('png','jpg','jpeg','webp','gif'))
);

create policy "Users can delete own personal stickers"
on storage.objects for delete to authenticated
using (bucket_id = 'user-stickers' and (storage.foldername(name))[1] = (select auth.uid()::text));
