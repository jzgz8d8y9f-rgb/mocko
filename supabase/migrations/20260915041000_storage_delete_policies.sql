-- avatars/banners/recordings had upload (insert) and, for avatars/banners,
-- update policies, but no delete policy -- so a user could never actually
-- remove their own avatar, banner, or recording files (storage.remove()
-- silently no-ops under RLS instead of erroring). Caught while building
-- self-serve account deletion, which needs this to actually clean up a
-- deleted user's files rather than leaving them orphaned in storage.
create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own banner"
  on storage.objects for delete
  using (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own recordings"
  on storage.objects for delete
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
