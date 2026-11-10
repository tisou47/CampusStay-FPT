-- =====================================================================
-- CampusStay FPT — V70: Family Day (feature VIS, ADR-29, contract A-69).
-- A Manager organises a day on which residents' families visit a common
-- area of one Block (never the Rooms, never overnight). Residents of the
-- Block register their guests for one time slot; a registration within
-- the slot's capacity is approved at once and every guest gets their own
-- pass (QR). The Block's Staff check each guest in and out at the desk.
-- Guests have no account: only the name, the relationship to the student
-- and the year of birth are kept (no identity number, phone or address).
-- =====================================================================

CREATE TABLE vis_family_day (
    id                      BIGSERIAL PRIMARY KEY,
    building_id             BIGINT       NOT NULL REFERENCES inv_building (id),
    title                   VARCHAR(120) NOT NULL,
    description             VARCHAR(2000),
    area                    VARCHAR(200) NOT NULL,             -- the common area where families are received
    registration_opens_at   TIMESTAMPTZ  NOT NULL,
    registration_closes_at  TIMESTAMPTZ  NOT NULL,
    max_guests              INT          NOT NULL CHECK (max_guests BETWEEN 1 AND 10),
    status                  VARCHAR(20)  NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED')),
    created_by              BIGINT       NOT NULL REFERENCES auth_user (id),
    created_at              TIMESTAMPTZ  NOT NULL,
    published_at            TIMESTAMPTZ,
    cancelled_at            TIMESTAMPTZ,
    cancel_reason           VARCHAR(500),
    closed_at               TIMESTAMPTZ,
    closed_by               BIGINT       REFERENCES auth_user (id),
    close_note              VARCHAR(500),
    version                 BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_vis_family_day_window CHECK (registration_closes_at > registration_opens_at)
);

CREATE INDEX ix_vis_family_day_building ON vis_family_day (building_id, status);

-- booked counts the guests of approved registrations; the CHECK keeps it within the capacity even when two
-- registrations race for the last places (each one adds its guests with a single UPDATE).
CREATE TABLE vis_time_slot (
    id              BIGSERIAL PRIMARY KEY,
    family_day_id   BIGINT      NOT NULL REFERENCES vis_family_day (id) ON DELETE CASCADE,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    capacity        INT         NOT NULL CHECK (capacity BETWEEN 1 AND 5000),
    booked          INT         NOT NULL DEFAULT 0,
    CONSTRAINT ck_vis_time_slot_order CHECK (ends_at > starts_at),
    CONSTRAINT ck_vis_time_slot_capacity CHECK (booked BETWEEN 0 AND capacity)
);

CREATE INDEX ix_vis_time_slot_day ON vis_time_slot (family_day_id, starts_at);

CREATE TABLE vis_registration (
    id              BIGSERIAL PRIMARY KEY,
    family_day_id   BIGINT       NOT NULL REFERENCES vis_family_day (id),
    time_slot_id    BIGINT       NOT NULL REFERENCES vis_time_slot (id),
    student_id      BIGINT       NOT NULL REFERENCES auth_user (id),
    status          VARCHAR(20)  NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('APPROVED', 'CANCELLED')),
    created_at      TIMESTAMPTZ  NOT NULL,
    cancelled_at    TIMESTAMPTZ,
    cancelled_by    BIGINT       REFERENCES auth_user (id),
    cancel_reason   VARCHAR(500)
);

-- One live registration per student and Family Day.
CREATE UNIQUE INDEX ux_vis_registration_live ON vis_registration (family_day_id, student_id) WHERE status = 'APPROVED';
CREATE INDEX ix_vis_registration_slot ON vis_registration (time_slot_id);

-- A guest and their pass. pass_token is the random value in the QR (Tokens.newToken, 256 bits); it is kept as is
-- because the student opens the pass again and again; it lets nobody into a Room and stops working when the
-- registration or the Family Day is cancelled. One visit per guest: no re-entry once checked out.
CREATE TABLE vis_visitor (
    id               BIGSERIAL PRIMARY KEY,
    registration_id  BIGINT       NOT NULL REFERENCES vis_registration (id),
    full_name        VARCHAR(100) NOT NULL,
    relationship     VARCHAR(40)  NOT NULL,
    birth_year       INT          NOT NULL,
    pass_token       VARCHAR(64)  NOT NULL,
    status           VARCHAR(20)  NOT NULL DEFAULT 'NOT_ARRIVED'
                     CHECK (status IN ('NOT_ARRIVED', 'CHECKED_IN', 'CHECKED_OUT', 'NO_SHOW', 'CANCELLED')),
    checked_in_at    TIMESTAMPTZ,
    checked_in_by    BIGINT       REFERENCES auth_user (id),
    checked_out_at   TIMESTAMPTZ,
    checked_out_by   BIGINT       REFERENCES auth_user (id),
    check_out_note   VARCHAR(500),                              -- set when Staff close a visit the guest did not end at the desk
    CONSTRAINT ck_vis_visitor_in CHECK (status NOT IN ('CHECKED_IN', 'CHECKED_OUT') OR checked_in_at IS NOT NULL),
    CONSTRAINT ck_vis_visitor_out CHECK (status <> 'CHECKED_OUT' OR checked_out_at IS NOT NULL)
);

CREATE UNIQUE INDEX ux_vis_visitor_pass ON vis_visitor (pass_token);
CREATE INDEX ix_vis_visitor_registration ON vis_visitor (registration_id);

INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, sort_order, settings_group, used_in) VALUES
  ('family_day.early_minutes', 'Deadlines and reminders', 'Minutes before a Family Day time slot when guests may be checked in',
     'INT', '15', NULL, 60, 'DEADLINES', 'Family Day: the visitor desk'),
  ('family_day.adult_age', 'Deadlines and reminders', 'Age from which a Family Day guest counts as an adult',
     'INT', '18', 'A registration with a younger guest must also have an adult guest.', 61, 'DEADLINES',
     'Family Day: student registration')
ON CONFLICT (key) DO NOTHING;

INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('FAMILY_DAY_PUBLISHED', 'A Manager published a Family Day for the student''s Block', TRUE,
     'Family Day · {{title}}', 'Ngày gia đình · {{title}}',
     'Your family can visit Block {{block}} ({{area}}) on {{date}}. Register your guests by {{closes}}.',
     'Gia đình bạn có thể đến thăm Block {{block}} ({{area}}) vào ngày {{date}}. Hãy đăng ký khách trước {{closes}}.',
     '{title,block,area,date,closes}'),
  ('FAMILY_DAY_REGISTERED', 'A student registered guests for a Family Day', FALSE,
     'Guests registered · {{title}}', 'Đã đăng ký khách · {{title}}',
     '{{guests}} guests are registered for {{slot}}. Each guest has their own pass: show it at the visitor desk.',
     'Đã đăng ký {{guests}} khách cho khung giờ {{slot}}. Mỗi khách có một mã vào riêng: hãy xuất trình tại quầy tiếp đón.',
     '{title,guests,slot}'),
  ('FAMILY_DAY_REGISTRATION_CANCELLED', 'A Manager cancelled a student''s Family Day registration', TRUE,
     'Family Day registration cancelled · {{title}}', 'Đăng ký Ngày gia đình đã bị hủy · {{title}}',
     'A Manager cancelled your guests'' registration: {{reason}}. Their passes no longer work.',
     'Quản lý đã hủy đăng ký khách của bạn: {{reason}}. Các mã vào của khách không còn hiệu lực.',
     '{title,reason}'),
  ('FAMILY_DAY_CANCELLED', 'A Manager cancelled a Family Day', TRUE,
     'Family Day cancelled · {{title}}', 'Ngày gia đình đã bị hủy · {{title}}',
     'The Family Day of {{date}} is cancelled: {{reason}}. Your guests'' passes no longer work.',
     'Ngày gia đình {{date}} đã bị hủy: {{reason}}. Các mã vào của khách không còn hiệu lực.',
     '{title,date,reason}')
ON CONFLICT (key) DO NOTHING;
