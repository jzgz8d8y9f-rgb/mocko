-- Grows each industry's own pool of easy "why" questions (not just
-- general ones) -- fetchQuestions() in js/questions.js already prefers
-- exact-industry-tagged rows over general ones, so this is what
-- actually gives industry-focused sessions more variety.

insert into public.questions (text, category, difficulty, industries, weight) values
-- Investment Banking
('Why this bank specifically, rather than a peer firm?', 'behavioral', 'easy', '{ib}', 10),
('Why the group or desk you''re targeting, and not a different one?', 'behavioral', 'easy', '{ib}', 10),
('Why banking over consulting or a corporate role?', 'behavioral', 'easy', '{ib}', 10),
('Why does deal work appeal to you specifically?', 'behavioral', 'easy', '{ib}', 10),
('Why now, at this point in your career, is the right time for banking?', 'behavioral', 'easy', '{ib}', 10),
('Why do you think you''d be good at working long hours under pressure?', 'behavioral', 'easy', '{ib}', 10),
-- Consulting
('Why this consulting firm specifically, rather than a competitor?', 'behavioral', 'easy', '{consulting}', 10),
('Why the practice area or industry group you''re targeting?', 'behavioral', 'easy', '{consulting}', 10),
('Why consulting over going straight into industry?', 'behavioral', 'easy', '{consulting}', 10),
('Why does problem-solving across different clients appeal to you?', 'behavioral', 'easy', '{consulting}', 10),
('Why now is the right time in your career for consulting?', 'behavioral', 'easy', '{consulting}', 10),
('Why do you think you''d handle constant travel and client-facing work well?', 'behavioral', 'easy', '{consulting}', 10),
-- Tech
('Why this company specifically, rather than another tech employer?', 'behavioral', 'easy', '{tech}', 10),
('Why this particular role or team within the company?', 'behavioral', 'easy', '{tech}', 10),
('Why tech over finance or consulting?', 'behavioral', 'easy', '{tech}', 10),
('Why does building products excite you specifically?', 'behavioral', 'easy', '{tech}', 10),
('Why now is the right time in your career for this kind of role?', 'behavioral', 'easy', '{tech}', 10),
('Why do you think you''d thrive in a fast-changing environment?', 'behavioral', 'easy', '{tech}', 10),
-- Quant
('Why this fund or firm specifically, rather than a competitor?', 'behavioral', 'easy', '{quant}', 10),
('Why the strategy or desk you''re targeting?', 'behavioral', 'easy', '{quant}', 10),
('Why quant over traditional finance roles?', 'behavioral', 'easy', '{quant}', 10),
('Why does research-driven decision-making appeal to you specifically?', 'behavioral', 'easy', '{quant}', 10),
('Why now is the right time in your career for this path?', 'behavioral', 'easy', '{quant}', 10),
('Why do you think your background suits systematic, data-driven work?', 'behavioral', 'easy', '{quant}', 10),
-- Private Equity
('Why this firm specifically, rather than a peer fund?', 'behavioral', 'easy', '{pe}', 10),
('Why the sector or strategy you''re targeting?', 'behavioral', 'easy', '{pe}', 10),
('Why private equity over staying in banking or consulting?', 'behavioral', 'easy', '{pe}', 10),
('Why does owning and improving businesses appeal to you specifically?', 'behavioral', 'easy', '{pe}', 10),
('Why now is the right time in your career to move to the buy side?', 'behavioral', 'easy', '{pe}', 10),
('Why do you think you''d be effective working closely with management teams?', 'behavioral', 'easy', '{pe}', 10),
-- General
('Why do you want to work here specifically?', 'behavioral', 'easy', '{general}', 10),
('Why this career path over the alternatives you considered?', 'behavioral', 'easy', '{general}', 10),
('Why should we be excited about hiring you?', 'behavioral', 'easy', '{general}', 10),
('Why is now the right time for you to make this move?', 'behavioral', 'easy', '{general}', 10),
('Why do you think this role fits your strengths?', 'behavioral', 'easy', '{general}', 10),
('Why did you choose to apply to this specific opening?', 'behavioral', 'easy', '{general}', 10),
('Why do you think you''ll stick with this path long-term?', 'behavioral', 'easy', '{general}', 10);
