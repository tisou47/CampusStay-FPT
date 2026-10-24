-- =====================================================================
-- CampusStay FPT — V33: the language of each account (ADR-25). Notifications,
-- push and emails use it; the web sends it as Accept-Language. New accounts
-- start in Vietnamese.
-- =====================================================================

ALTER TABLE auth_user ADD COLUMN locale VARCHAR(2) NOT NULL DEFAULT 'vi'
    CONSTRAINT ck_user_locale CHECK (locale IN ('vi', 'en'));
