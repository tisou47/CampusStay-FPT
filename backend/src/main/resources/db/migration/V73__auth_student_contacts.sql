-- =====================================================================
-- CampusStay FPT — V73: students keep their own contact details on My profile.
-- A personal email next to the phone, and several emergency contacts instead of one.
-- The first emergency contact (lowest position) stays mirrored in
-- auth_student.emergency_* so Applications, eligibility and the desk read it as before.
-- =====================================================================

ALTER TABLE auth_student ADD COLUMN personal_email VARCHAR(254);

CREATE TABLE auth_student_emergency_contact (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id   BIGINT       NOT NULL REFERENCES auth_student (user_id) ON DELETE CASCADE,
    name         VARCHAR(150) NOT NULL,
    relationship VARCHAR(50)  NOT NULL,   -- code of the RELATIONSHIP option list
    phone        VARCHAR(20)  NOT NULL,
    position     SMALLINT     NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_auth_student_emergency_contact_student ON auth_student_emergency_contact (student_id, position);

-- Existing single contacts become the first of the list.
INSERT INTO auth_student_emergency_contact (student_id, name, relationship, phone, position)
SELECT user_id, emergency_name, coalesce(nullif(trim(emergency_relationship), ''), 'OTHER'), emergency_phone, 0
FROM auth_student
WHERE coalesce(trim(emergency_name), '') <> '' AND coalesce(trim(emergency_phone), '') <> '';

INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, sort_order, settings_group, used_in) VALUES
  ('student.emergency_contacts_max', 'Stay', 'Emergency contacts a student may keep',
     'INT', '3', 'The first one is the contact the dormitory calls first.', 65, 'STAY', 'My profile: emergency contacts')
ON CONFLICT (key) DO NOTHING;
