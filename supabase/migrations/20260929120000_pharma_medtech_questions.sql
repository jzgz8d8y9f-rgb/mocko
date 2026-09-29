-- Pharma and MedTech question banks, sourced from a question set the user
-- provided (Teddy Pharma Question.docx), which organized questions into four
-- role tables (Pharma R&D, Pharma Mfg/Quality, MedTech R&D, MedTech
-- Mfg/Quality) plus a shared "General Behavioral/Situational" table. Per the
-- user's instructions: collapse into two industries (pharma, medtech),
-- tag each question by difficulty, and skip the shared behavioral/situational
-- questions entirely -- they duplicate what's already in the general
-- '{general}' behavioral bank (critical feedback, incomplete information,
-- challenging a process, teamwork, adaptability, etc.) and existing sessions
-- already draw on that pool for every industry. Only two genuinely
-- industry-specific behavioral "why this field" questions are added, mirroring
-- the existing 'Why investment banking?' / 'Why management consulting?' rows.
-- Questions common to both industries (quality mindset, SOPs, escalation,
-- IQ/OQ/PQ, validation, CAPA, etc.) are tagged '{pharma,medtech}' rather than
-- duplicated, following the existing '{ib,pe}' / '{consulting,tech}' pattern.

insert into public.questions (text, category, difficulty, industries) values

-- Shared technical (Pharma + MedTech) -- easy
('Why is it important to keep an updated ELN (electronic lab notebook)?', 'technical', 'easy', '{pharma,medtech}'),
('What role does quality play in your day-to-day work as a bench scientist?', 'technical', 'easy', '{pharma,medtech}'),
('Why is it important to read and understand SOPs?', 'technical', 'easy', '{pharma,medtech}'),
('Why are you interested in working in Quality?', 'behavioral', 'easy', '{pharma,medtech}'),

-- Shared technical (Pharma + MedTech) -- medium
('How would you handle transitioning from paper laboratory documentation to electronic documentation?', 'technical', 'medium', '{pharma,medtech}'),
('At what point do you escalate an equipment issue you''re having with colleagues and/or equipment maintenance personnel?', 'technical', 'medium', '{pharma,medtech}'),
('Explain the differences between IQ, OQ, and PQ.', 'technical', 'medium', '{pharma,medtech}'),
('What does ALCOA+ stand for?', 'technical', 'medium', '{pharma,medtech}'),
('What is process validation?', 'technical', 'medium', '{pharma,medtech}'),
('How would you determine if a CAPA was effective?', 'technical', 'medium', '{pharma,medtech}'),
('How would you qualify a new manufacturing process or piece of equipment?', 'technical', 'medium', '{pharma,medtech}'),
('How would you qualify a new supplier?', 'technical', 'medium', '{pharma,medtech}'),
('How would you handle an outlier in an experimental dataset?', 'technical', 'medium', '{pharma,medtech}'),
('How do you prioritize experiments when several projects have competing priorities?', 'technical', 'medium', '{pharma,medtech}'),
('What is Risk Management and why does it matter in a manufacturing environment?', 'technical', 'medium', '{pharma,medtech}'),
('Have you ever developed a standard?', 'technical', 'medium', '{pharma,medtech}'),
('What''s the difference between verification and validation?', 'technical', 'medium', '{pharma,medtech}'),

-- Shared technical (Pharma + MedTech) -- hard
('You see something on the manufacturing floor that could become a safety hazard. How do you act in this situation?', 'technical', 'hard', '{pharma,medtech}'),
('Have you ever run a validation study? If so, walk me through the steps of a validation.', 'technical', 'hard', '{pharma,medtech}'),
('Have you designed a controlled experiment? Describe what you did.', 'technical', 'hard', '{pharma,medtech}'),
('What would you do if a manager asked you to complete a task that was inconsistent with an SOP?', 'technical', 'hard', '{pharma,medtech}'),

-- Pharma-specific technical -- easy
('If you had to know one property of a protein, what would it be?', 'technical', 'easy', '{pharma}'),
('What are the steps of PCR?', 'technical', 'easy', '{pharma}'),

-- Pharma-specific technical -- medium
('You are performing electroporation on hiPSCs and your experiment run fails. What do you do with the data?', 'technical', 'medium', '{pharma}'),
('What differences do you foresee in working within a pharmaceutical quality department compared to quality departments in other industries?', 'technical', 'medium', '{pharma}'),
('Why is traceability important in pharmaceutical manufacturing?', 'technical', 'medium', '{pharma}'),

-- Pharma-specific technical -- hard
('Explain what 21 CFR Parts 210 and 211 are and how they are relevant to the role you are applying for.', 'technical', 'hard', '{pharma}'),
('Our QC Microbiology team performs routine environmental monitoring at five locations within a manufacturing room. Two of these locations have consistently shown little to no microbial growth. Would you recommend discontinuing environmental monitoring at these two locations? Why or why not?', 'technical', 'hard', '{pharma}'),

-- MedTech-specific technical -- easy
('What are the differences between a Class I, Class II, and Class III medical device?', 'technical', 'easy', '{medtech}'),

-- MedTech-specific technical -- medium
('What is 21 CFR Part 820 and what is its relevance to the role you are applying for?', 'technical', 'medium', '{medtech}'),
('What is ISO 13485:2016 and why is it relevant to the job you are applying for?', 'technical', 'medium', '{medtech}'),
('What is your experience with GD&T?', 'technical', 'medium', '{medtech}'),
('What is a Design History File (DHF)?', 'technical', 'medium', '{medtech}'),

-- MedTech-specific technical -- hard
('How would you handle a design change late in product development?', 'technical', 'hard', '{medtech}'),

-- Industry-motivation behavioral, mirroring the existing 'Why investment banking?' rows
('Why do you envision yourself working in Pharma as opposed to MedTech?', 'behavioral', 'easy', '{pharma}'),
('Why do you envision yourself working in MedTech as opposed to Pharma?', 'behavioral', 'easy', '{medtech}');
