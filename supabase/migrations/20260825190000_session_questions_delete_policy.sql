-- Retrying a question deletes its old session_questions row (replaced
-- by a freshly-graded one) -- no delete policy existed yet.
create policy "delete own session_questions"
  on public.session_questions for delete
  using (auth.uid() = user_id);
