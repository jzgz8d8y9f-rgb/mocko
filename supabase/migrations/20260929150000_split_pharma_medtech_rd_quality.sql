-- Splits the flat 'pharma'/'medtech' industries (added in
-- 20260929120000_pharma_medtech_questions.sql) into four: pharma-rd,
-- pharma-mfg-quality, medtech-rd, medtech-mfg-quality -- matching the
-- session-setup dropdown's two sub-industries per field. Re-derived from
-- which of the source doc's four role tables (Pharma R&D, Pharma
-- Mfg/Quality, MedTech R&D, MedTech Mfg/Quality) each question actually
-- appeared in, rather than guessed.

delete from public.questions where industries && array['pharma', 'medtech'];

insert into public.questions (text, category, difficulty, industries) values

-- In all four tables
('Why is it important to keep an updated ELN (electronic lab notebook)?', 'technical', 'easy', '{pharma-rd,pharma-mfg-quality,medtech-rd,medtech-mfg-quality}'),
('What role does quality play in your day-to-day work as a bench scientist?', 'technical', 'easy', '{pharma-rd,pharma-mfg-quality,medtech-rd,medtech-mfg-quality}'),
('Why is it important to read and understand SOPs?', 'technical', 'easy', '{pharma-rd,pharma-mfg-quality,medtech-rd,medtech-mfg-quality}'),
('How would you handle transitioning from paper laboratory documentation to electronic documentation?', 'technical', 'medium', '{pharma-rd,pharma-mfg-quality,medtech-rd,medtech-mfg-quality}'),
('At what point do you escalate an equipment issue you''re having with colleagues and/or equipment maintenance personnel?', 'technical', 'medium', '{pharma-rd,pharma-mfg-quality,medtech-rd,medtech-mfg-quality}'),
('How would you handle an outlier in an experimental dataset?', 'technical', 'medium', '{pharma-rd,pharma-mfg-quality,medtech-rd,medtech-mfg-quality}'),
('What''s the difference between verification and validation?', 'technical', 'medium', '{pharma-rd,pharma-mfg-quality,medtech-rd,medtech-mfg-quality}'),
('What would you do if a manager asked you to complete a task that was inconsistent with an SOP?', 'technical', 'hard', '{pharma-rd,pharma-mfg-quality,medtech-rd,medtech-mfg-quality}'),

-- Manufacturing/Quality only, both fields
('Why are you interested in working in Quality?', 'behavioral', 'easy', '{pharma-mfg-quality,medtech-mfg-quality}'),
('Explain the differences between IQ, OQ, and PQ.', 'technical', 'medium', '{pharma-mfg-quality,medtech-mfg-quality}'),
('What is process validation?', 'technical', 'medium', '{pharma-mfg-quality,medtech-mfg-quality}'),
('How would you determine if a CAPA was effective?', 'technical', 'medium', '{pharma-mfg-quality,medtech-mfg-quality}'),
('How would you qualify a new manufacturing process or piece of equipment?', 'technical', 'medium', '{pharma-mfg-quality,medtech-mfg-quality}'),
('How would you qualify a new supplier?', 'technical', 'medium', '{pharma-mfg-quality,medtech-mfg-quality}'),
('You see something on the manufacturing floor that could become a safety hazard. How do you act in this situation?', 'technical', 'hard', '{pharma-mfg-quality,medtech-mfg-quality}'),

-- R&D only, both fields
('How do you prioritize experiments when several projects have competing priorities?', 'technical', 'medium', '{pharma-rd,medtech-rd}'),
('Have you designed a controlled experiment? Describe what you did.', 'technical', 'hard', '{pharma-rd,medtech-rd}'),

-- Pharma R&D, Pharma Mfg/Quality, MedTech Mfg/Quality (not MedTech R&D)
('What does ALCOA+ stand for?', 'technical', 'medium', '{pharma-rd,pharma-mfg-quality,medtech-mfg-quality}'),

-- Pharma Mfg/Quality, MedTech R&D, MedTech Mfg/Quality (not Pharma R&D)
('What is Risk Management and why does it matter in a manufacturing environment?', 'technical', 'medium', '{pharma-mfg-quality,medtech-rd,medtech-mfg-quality}'),
('Have you ever developed a standard?', 'technical', 'medium', '{pharma-mfg-quality,medtech-rd,medtech-mfg-quality}'),
('Have you ever run a validation study? If so, walk me through the steps of a validation.', 'technical', 'hard', '{pharma-mfg-quality,medtech-rd,medtech-mfg-quality}'),

-- Pharma R&D only
('If you had to know one property of a protein, what would it be?', 'technical', 'easy', '{pharma-rd}'),
('What are the steps of PCR?', 'technical', 'easy', '{pharma-rd}'),
('You are performing electroporation on hiPSCs and your experiment run fails. What do you do with the data?', 'technical', 'medium', '{pharma-rd}'),
('Why do you envision yourself working in Pharma as opposed to MedTech?', 'behavioral', 'easy', '{pharma-rd}'),

-- Pharma Mfg/Quality only
('What differences do you foresee in working within a pharmaceutical quality department compared to quality departments in other industries?', 'technical', 'medium', '{pharma-mfg-quality}'),
('Why is traceability important in pharmaceutical manufacturing?', 'technical', 'medium', '{pharma-mfg-quality}'),
('Explain what 21 CFR Parts 210 and 211 are and how they are relevant to the role you are applying for.', 'technical', 'hard', '{pharma-mfg-quality}'),
('Our QC Microbiology team performs routine environmental monitoring at five locations within a manufacturing room. Two of these locations have consistently shown little to no microbial growth. Would you recommend discontinuing environmental monitoring at these two locations? Why or why not?', 'technical', 'hard', '{pharma-mfg-quality}'),

-- MedTech R&D + MedTech Mfg/Quality (device/design-controls concepts, not in Pharma tables)
('What are the differences between a Class I, Class II, and Class III medical device?', 'technical', 'easy', '{medtech-rd,medtech-mfg-quality}'),
('What is 21 CFR Part 820 and what is its relevance to the role you are applying for?', 'technical', 'medium', '{medtech-rd,medtech-mfg-quality}'),
('What is ISO 13485:2016 and why is it relevant to the job you are applying for?', 'technical', 'medium', '{medtech-rd,medtech-mfg-quality}'),
('What is your experience with GD&T?', 'technical', 'medium', '{medtech-rd,medtech-mfg-quality}'),
('What is a Design History File (DHF)?', 'technical', 'medium', '{medtech-rd,medtech-mfg-quality}'),
('How would you handle a design change late in product development?', 'technical', 'hard', '{medtech-rd,medtech-mfg-quality}'),

-- MedTech R&D only
('Why do you envision yourself working in MedTech as opposed to Pharma?', 'behavioral', 'easy', '{medtech-rd}');
