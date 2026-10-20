-- =====================================================================
-- CampusStay FPT — V1: shared kernel + AUTH
-- Conventions (all migrations):
--   * Table prefix = owning module (auth_, cfg_, inv_, app_, asg_, bil_,
--     req_, mnt_, ntf_; shared_ for the shared kernel). Only the owning
--     module's code reads or writes its tables. Cross-module foreign keys
--     exist for referential integrity only.
--   * PK: BIGINT identity. Money: BIGINT VND. Rates: NUMERIC(5,4) fractions.
--   * Timestamps: TIMESTAMPTZ (stored UTC). Statuses: UPPER_SNAKE text with
--     CHECK constraints (the API maps them to contract labels).
--   * Mutable aggregates carry "version" for optimistic locking.
-- =====================================================================

-- ---------- shared kernel ----------
CREATE TABLE shared_file (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    storage_key   VARCHAR(255) NOT NULL UNIQUE,
    original_name VARCHAR(255) NOT NULL,
    content_type  VARCHAR(100) NOT NULL,
    size_bytes    BIGINT       NOT NULL CHECK (size_bytes >= 0),
    sha256        CHAR(64)     NOT NULL,
    owner_module  VARCHAR(10)  NOT NULL,
    created_by    BIGINT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE shared_audit_log (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    actor_id     BIGINT,                       -- NULL = system job
    actor_label  VARCHAR(150) NOT NULL,        -- name at the time of the action
    action       VARCHAR(60)  NOT NULL,        -- e.g. APPLICATION_APPROVED, EXPORT_FINANCIAL
    tone         VARCHAR(10)  NOT NULL DEFAULT 'INFO'
                 CHECK (tone IN ('INFO', 'SUCCESS', 'WARNING', 'DANGER')),
    object_type  VARCHAR(40)  NOT NULL,
    object_id    VARCHAR(60),
    object_label VARCHAR(200),
    change       JSONB,                        -- {field: [old, new]} or free details
    ip_address   VARCHAR(45)
);
CREATE INDEX ix_audit_at        ON shared_audit_log (at DESC);
CREATE INDEX ix_audit_actor_at  ON shared_audit_log (actor_id, at DESC);
CREATE INDEX ix_audit_action_at ON shared_audit_log (action, at DESC);

-- ---------- AUTH ----------
CREATE TABLE auth_user (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email             VARCHAR(254) NOT NULL,
    display_name      VARCHAR(150) NOT NULL,
    password_hash     VARCHAR(100),             -- NULL = Google-only or not yet set (invited)
    google_sub        VARCHAR(64)  UNIQUE,      -- Google account id, linked on first Google sign-in
    role              VARCHAR(10)  NOT NULL CHECK (role IN ('STUDENT', 'STAFF', 'MANAGER', 'ADMIN')),
    title             VARCHAR(100),             -- job title for back-office users
    status            VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('INVITED', 'ACTIVE', 'DISABLED')),
    failed_attempts   INT          NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until      TIMESTAMPTZ,
    last_sign_in_at   TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version           BIGINT       NOT NULL DEFAULT 0
);
-- Emails are compared case-insensitively.
CREATE UNIQUE INDEX ux_auth_user_email ON auth_user (lower(email));
CREATE INDEX ix_auth_user_role_status ON auth_user (role, status);

-- Student directory. Directory fields come from the (mock) SIS; contact
-- fields are maintained by the student.
CREATE TABLE auth_student (
    user_id                BIGINT       PRIMARY KEY REFERENCES auth_user (id) ON DELETE CASCADE,
    student_code           VARCHAR(20)  NOT NULL UNIQUE,
    gender                 CHAR(1)      NOT NULL CHECK (gender IN ('M', 'F')),
    date_of_birth          DATE,
    major                  VARCHAR(100) NOT NULL,
    cohort                 VARCHAR(10)  NOT NULL,         -- e.g. K19
    semester_no            SMALLINT     CHECK (semester_no BETWEEN 0 AND 12),
    hometown               VARCHAR(100),
    region                 VARCHAR(50),                    -- matching/preference key
    enrollment_status      VARCHAR(12)  NOT NULL DEFAULT 'ENROLLED'
                           CHECK (enrollment_status IN ('ENROLLED', 'SUSPENDED', 'GRADUATED', 'WITHDRAWN')),
    priority_groups        TEXT[]       NOT NULL DEFAULT '{}',   -- keys of cfg_priority_group
    phone                  VARCHAR(20),
    emergency_name         VARCHAR(150),
    emergency_relationship VARCHAR(50),
    emergency_phone        VARCHAR(20),
    synced_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_auth_student_gender ON auth_student (gender);

-- Back-office profile used by routing (what the person handles, on duty).
CREATE TABLE auth_staff_profile (
    user_id  BIGINT  PRIMARY KEY REFERENCES auth_user (id) ON DELETE CASCADE,
    handles  TEXT[]  NOT NULL DEFAULT '{}',   -- e.g. {MAINTENANCE_ELECTRICAL, DESK, PAYMENTS}
    on_duty  BOOLEAN NOT NULL DEFAULT FALSE
);

-- Opaque bearer tokens (ADR-07). Only the SHA-256 hash is stored.
CREATE TABLE auth_session (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token_hash    CHAR(64)     NOT NULL UNIQUE,
    user_id       BIGINT       NOT NULL REFERENCES auth_user (id) ON DELETE CASCADE,
    remember      BOOLEAN      NOT NULL DEFAULT FALSE,
    sign_in_method VARCHAR(10) NOT NULL CHECK (sign_in_method IN ('PASSWORD', 'GOOGLE')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_used_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ  NOT NULL,
    revoked_at    TIMESTAMPTZ,
    user_agent    VARCHAR(300),
    ip_address    VARCHAR(45)
);
CREATE INDEX ix_auth_session_user ON auth_session (user_id) WHERE revoked_at IS NULL;
CREATE INDEX ix_auth_session_expires ON auth_session (expires_at);

-- One-time tokens: account invitation and password reset.
CREATE TABLE auth_action_token (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token_hash  CHAR(64)    NOT NULL UNIQUE,
    user_id     BIGINT      NOT NULL REFERENCES auth_user (id) ON DELETE CASCADE,
    purpose     VARCHAR(16) NOT NULL CHECK (purpose IN ('INVITE', 'PASSWORD_RESET')),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_auth_action_token_user ON auth_action_token (user_id, purpose);
