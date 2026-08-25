-- `sessions` was insert-only (On-Air writes one row per question and
-- never revisits it). Mock Interview inserts a parent row at session
-- start and updates it once with the aggregate score at completion --
-- needs an update policy that didn't exist before.
create policy "Users can update their own sessions"
  on public.sessions for update
  using (auth.uid() = user_id);
