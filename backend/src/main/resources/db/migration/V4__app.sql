-- =====================================================================
-- CampusStay FPT — V4: APP (Applications, roommate invitations,
-- Round-2 offers). One Application covers exactly one Term.
-- =====================================================================

CREATE TABLE app_application (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code                VARCHAR(24)  NOT NULL UNIQUE,            -- e.g. APP-SP27-000123
    term_id             BIGINT       NOT NULL REFERENCES cfg_term (id),
    student_id          BIGINT       NOT NULL REFERENCES auth_user (id),
    room_type_id        BIGINT       NOT NULL REFERENCES cfg_room_type (id),
    room_class_id       BIGINT       NOT NULL REFERENCES cfg_room_class (id),
    -- Price snapshot at submission: later price changes do not affect it.
    term_price          BIGINT       NOT NULL CHECK (term_price > 0),
    surcharge_rate      NUMERIC(5,4) NOT NULL,
    deposit_amount      BIGINT       NOT NULL CHECK (deposit_amount >= 0),
    status              VARCHAR(20)  NOT NULL
                        CHECK (status IN ('DRAFT', 'AWAITING_ROOMMATE', 'AWAITING_DEPOSIT', 'SUBMITTED',
                                          'UNDER_REVIEW', 'APPROVED', 'WAITLISTED', 'ALLOCATED',
                                          'REJECTED', 'CANCELLED', 'EXPIRED')),
    roommate_mode       VARCHAR(6)   NOT NULL DEFAULT 'NONE' CHECK (roommate_mode IN ('NONE', 'INVITE', 'AUTO')),
    partner_application_id BIGINT    REFERENCES app_application (id),
    roommate_preferences JSONB,                                   -- {region, semester, major}; optional free service
    contact             JSONB        NOT NULL,                    -- snapshot {phone,email,emergencyName,relationship,emergencyPhone}
    consent_matching    BOOLEAN      NOT NULL,
    consent_rules       BOOLEAN      NOT NULL,
    consented_at        TIMESTAMPTZ  NOT NULL,
    deposit_due_at      TIMESTAMPTZ,
    submitted_at        TIMESTAMPTZ,                              -- set when the Deposit is paid
    reviewed_by         BIGINT REFERENCES auth_user (id),
    reviewed_at         TIMESTAMPTZ,
    decision_note       VARCHAR(500),
    cancelled_at        TIMESTAMPTZ,
    cancel_reason       VARCHAR(500),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version             BIGINT       NOT NULL DEFAULT 0,
    -- Consent must be explicit (PDP Law 91/2025/QH15): both boxes ticked.
    CONSTRAINT ck_app_consent  CHECK (consent_matching AND consent_rules),
    CONSTRAINT ck_app_pref     CHECK (roommate_preferences IS NULL OR roommate_mode = 'AUTO'),
    CONSTRAINT ck_app_partner  CHECK (partner_application_id IS NULL OR roommate_mode = 'INVITE'),
    CONSTRAINT ck_app_rejected CHECK (status <> 'REJECTED' OR decision_note IS NOT NULL)
);
-- A student has at most one live Application per Term.
CREATE UNIQUE INDEX ux_app_one_live_per_term ON app_application (term_id, student_id)
    WHERE status NOT IN ('REJECTED', 'CANCELLED', 'EXPIRED');
CREATE INDEX ix_app_term_status ON app_application (term_id, status);
CREATE INDEX ix_app_student ON app_application (student_id, created_at DESC);
-- Scheduler: Applications whose Deposit window has passed.
CREATE INDEX ix_app_deposit_due ON app_application (deposit_due_at) WHERE status = 'AWAITING_DEPOSIT';

-- Timeline shown to the student and activity shown to Staff.
CREATE TABLE app_application_event (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id BIGINT       NOT NULL REFERENCES app_application (id) ON DELETE CASCADE,
    status         VARCHAR(20)  NOT NULL,
    text           VARCHAR(300) NOT NULL,
    note           VARCHAR(500),
    visible_to_student BOOLEAN  NOT NULL DEFAULT TRUE,
    actor_id       BIGINT REFERENCES auth_user (id),
    at             TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_app_event_app ON app_application_event (application_id, at);

CREATE TABLE app_roommate_invitation (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    term_id                BIGINT      NOT NULL REFERENCES cfg_term (id),
    inviter_application_id BIGINT      NOT NULL REFERENCES app_application (id),
    invitee_student_id     BIGINT      NOT NULL REFERENCES auth_user (id),
    invitee_application_id BIGINT      REFERENCES app_application (id),
    status                 VARCHAR(10) NOT NULL DEFAULT 'PENDING'
                           CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED')),
    expires_at             TIMESTAMPTZ NOT NULL,
    responded_at           TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    version                BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT ck_invite_accepted CHECK (status <> 'ACCEPTED' OR invitee_application_id IS NOT NULL)
);
CREATE UNIQUE INDEX ux_invite_one_pending_per_inviter ON app_roommate_invitation (inviter_application_id)
    WHERE status = 'PENDING';
CREATE INDEX ix_invite_invitee ON app_roommate_invitation (invitee_student_id, status);
CREATE INDEX ix_invite_expires ON app_roommate_invitation (expires_at) WHERE status = 'PENDING';

-- Rate limit for the privacy-safe roommate code check (checksLeft).
CREATE TABLE app_roommate_check (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    term_id    BIGINT      NOT NULL REFERENCES cfg_term (id),
    student_id BIGINT      NOT NULL REFERENCES auth_user (id),
    valid      BOOLEAN     NOT NULL,
    at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_roommate_check ON app_roommate_check (term_id, student_id, at);

CREATE TABLE app_round2_offer (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id BIGINT      NOT NULL REFERENCES app_application (id),
    status         VARCHAR(10) NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN')),
    expires_at     TIMESTAMPTZ NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at   TIMESTAMPTZ,
    version        BIGINT      NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ux_round2_one_pending ON app_round2_offer (application_id) WHERE status = 'PENDING';
CREATE INDEX ix_round2_expires ON app_round2_offer (expires_at) WHERE status = 'PENDING';

-- Each option holds one Bed until the offer is answered or expires.
CREATE TABLE app_round2_option (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    offer_id      BIGINT       NOT NULL REFERENCES app_round2_offer (id) ON DELETE CASCADE,
    room_type_id  BIGINT       NOT NULL REFERENCES cfg_room_type (id),
    room_class_id BIGINT       NOT NULL REFERENCES cfg_room_class (id),
    building_id   BIGINT       NOT NULL REFERENCES inv_building (id),
    bed_id        BIGINT       NOT NULL REFERENCES inv_bed (id),
    note          VARCHAR(200),
    fill_rate     NUMERIC(5,4),                          -- current fill of the Room, shown as "fill"
    term_price    BIGINT       NOT NULL CHECK (term_price > 0),
    difference    BIGINT       NOT NULL,                 -- vs. the original Application price
    chosen        BOOLEAN      NOT NULL DEFAULT FALSE,
    held          BOOLEAN      NOT NULL DEFAULT TRUE     -- released when the offer closes
);
CREATE INDEX ix_round2_option_offer ON app_round2_option (offer_id);
-- A Bed can be held by at most one open Round-2 option.
CREATE UNIQUE INDEX ux_round2_bed_held ON app_round2_option (bed_id) WHERE held;
