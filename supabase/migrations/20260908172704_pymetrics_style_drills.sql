-- Adds 8 new Pymetrics-inspired drill types alongside the existing
-- arithmetic/arithmetic_hard/risk/sequence: digits (memory span), stop
-- (go/no-go), cards (Iowa Gambling Task), arrows (rule-switching),
-- towers (Tower of Hanoi), magnitudes (fraction comparison), shapes
-- (odd-one-out), nback (2-back letters). Leaderboards, percentile, and
-- rank already work generically per drill_key -- no other schema
-- changes needed.

alter table public.drill_scores drop constraint drill_scores_drill_key_check;

alter table public.drill_scores add constraint drill_scores_drill_key_check
  check (drill_key = any (array[
    'arithmetic', 'arithmetic_hard', 'risk', 'sequence',
    'digits', 'stop', 'cards', 'arrows', 'towers', 'magnitudes', 'shapes', 'nback'
  ]));
