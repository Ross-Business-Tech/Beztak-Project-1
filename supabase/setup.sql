-- One-time setup for the Beztakets demo Supabase project.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once.

-- 1) A private storage bucket for the team's shared files (10 MB per file).
insert into storage.buckets (id, name, public, file_size_limit)
values ('team-files', 'team-files', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

-- 2) Security rules: only signed-in users can see, add, or delete files in that bucket.
--    Visitors who are not signed in can do nothing.
drop policy if exists "Signed-in users can view team files" on storage.objects;
create policy "Signed-in users can view team files"
  on storage.objects for select to authenticated
  using (bucket_id = 'team-files');

drop policy if exists "Signed-in users can upload team files" on storage.objects;
create policy "Signed-in users can upload team files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'team-files');

drop policy if exists "Signed-in users can delete team files" on storage.objects;
create policy "Signed-in users can delete team files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'team-files');
