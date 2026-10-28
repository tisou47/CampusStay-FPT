-- =====================================================================
-- CampusStay FPT — V60: the stay length in English. The labels and "used
-- in" texts of the two Stay and renewal settings named the number of Terms
-- a student commits to with its Vietnamese word; the English texts now say
-- "stay length" (the Vietnamese texts live in the translation files).
-- =====================================================================

UPDATE cfg_parameter
SET label   = 'Most Terms a student may commit to (stay length)',
    used_in = 'Application wizard (stay length) and extension requests (the most Terms of a Stay)'
WHERE key = 'stay.max_terms';

UPDATE cfg_parameter
SET label   = 'Semesters of a study programme (the stay length stops at the last one)',
    used_in = 'Application wizard: the stay length is at most the semesters the student has left'
WHERE key = 'stay.program_semesters';
