-- grade-session's Claude call always produces pointers_good/pointers_work
-- alongside category_scores, but session_questions had nowhere to put
-- them for the voice path -- needed so the aggregate session's
-- pointers can be built from real per-question feedback.
alter table public.session_questions add column pointers_good jsonb;
alter table public.session_questions add column pointers_work jsonb;

-- Seed follow-up banks so the follow-up-probe mechanic has real
-- content to test against before the user's guide docs arrive.
update public.questions set follow_up_bank = array[
  'What would you have done differently?',
  'How did the other person respond?'
] where opener = true or (category = 'behavioral' and closing_friendly = false);

update public.questions set follow_up_bank = array[
  'Can you walk me through that in a bit more detail?',
  'What was the actual outcome?'
] where category = 'technical';
