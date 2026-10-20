-- =====================================================================
-- CampusStay FPT — V2: CFG (Terms, Room Types, Room Classes, policies,
-- eligibility, matching, lookups, system parameters)
-- No business value is hard-coded in code: everything here is Admin data.
-- =====================================================================

CREATE TABLE cfg_term (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code                   VARCHAR(20)  NOT NULL UNIQUE,   -- e.g. SP27
    name                   VARCHAR(100) NOT NULL,          -- e.g. Spring 2027
    status                 VARCHAR(10)  NOT NULL DEFAULT 'DRAFT'
                           CHECK (status IN ('DRAFT', 'PUBLISHED', 'CLOSED')),
    stay_start             DATE         NOT NULL,
    stay_end               DATE         NOT NULL,
    registration_opens_at  TIMESTAMPTZ  NOT NULL,
    registration_closes_at TIMESTAMPTZ  NOT NULL,
    results_published_at   TIMESTAMPTZ  NOT NULL,
    roommate_hours         INT          NOT NULL CHECK (roommate_hours > 0),
    deposit_hours          INT          NOT NULL CHECK (deposit_hours > 0),
    balance_due_at         TIMESTAMPTZ  NOT NULL,
    check_in_start         DATE         NOT NULL,
    check_in_end           DATE         NOT NULL,
    check_out_by           DATE         NOT NULL,
    published_at           TIMESTAMPTZ,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version                BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_term_stay        CHECK (stay_start < stay_end),
    CONSTRAINT ck_term_registration CHECK (registration_opens_at < registration_closes_at
                                           AND registration_closes_at <= results_published_at),
    CONSTRAINT ck_term_checkin     CHECK (check_in_start <= check_in_end AND check_in_end <= stay_end),
    CONSTRAINT ck_term_checkout    CHECK (check_out_by >= stay_start),
    -- Edge case "term overlaps": published Terms may not overlap in stay dates.
    CONSTRAINT ex_term_no_overlap EXCLUDE USING gist (
        daterange(stay_start, stay_end, '[]') WITH &&
    ) WHERE (status <> 'DRAFT')
);

-- Room Type = number of Beds + base term price (OI-04).
CREATE TABLE cfg_room_type (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name               VARCHAR(50)  NOT NULL UNIQUE,     -- e.g. "2-bed"
    beds               SMALLINT     NOT NULL CHECK (beds BETWEEN 1 AND 12),
    base_price         BIGINT       NOT NULL CHECK (base_price > 0),
    roommate_selection VARCHAR(6)   NOT NULL DEFAULT 'AUTO' CHECK (roommate_selection IN ('AUTO', 'MUTUAL')),
    description        VARCHAR(500),
    status             VARCHAR(8)   NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    sort_order         SMALLINT     NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version            BIGINT       NOT NULL DEFAULT 0,
    -- Mutual roommate selection only makes sense for 2-bed rooms.
    CONSTRAINT ck_room_type_mutual CHECK (roommate_selection = 'AUTO' OR beds = 2)
);

-- Room Class = surcharge on top of the Room Type price; assigned per Floor.
CREATE TABLE cfg_room_class (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name           VARCHAR(50)   NOT NULL UNIQUE,      -- Basic / Standard / Premium
    surcharge_rate NUMERIC(5,4)  NOT NULL CHECK (surcharge_rate >= 0 AND surcharge_rate <= 5),
    amenities      TEXT[]        NOT NULL DEFAULT '{}',
    status         VARCHAR(8)    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    sort_order     SMALLINT      NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    version        BIGINT        NOT NULL DEFAULT 0
);

-- Singleton: deposit and payment policy (Admin › Fees).
CREATE TABLE cfg_fee_policy (
    id                      SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    deposit_percent         NUMERIC(5,2) NOT NULL CHECK (deposit_percent > 0 AND deposit_percent <= 100),
    deposit_hours           INT          NOT NULL CHECK (deposit_hours > 0),
    balance_days            INT          NOT NULL CHECK (balance_days > 0),
    block_check_in_if_unpaid BOOLEAN     NOT NULL DEFAULT TRUE,
    allow_manual_confirm    BOOLEAN      NOT NULL DEFAULT TRUE,
    policy_confirmed        BOOLEAN      NOT NULL DEFAULT FALSE,
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by              BIGINT REFERENCES auth_user (id),
    version                 BIGINT       NOT NULL DEFAULT 0
);

CREATE TABLE cfg_refund_rule (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trigger_code   VARCHAR(40)  NOT NULL,   -- e.g. CANCEL_BEFORE_RESULTS, CHECK_OUT_EARLY
    description    VARCHAR(200) NOT NULL,   -- "when" text shown in Admin › Fees
    refund_percent NUMERIC(5,2) NOT NULL CHECK (refund_percent BETWEEN 0 AND 100),
    approver_role  VARCHAR(10)  NOT NULL CHECK (approver_role IN ('SYSTEM', 'STAFF', 'MANAGER', 'ADMIN')),
    active         BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order     SMALLINT     NOT NULL DEFAULT 0
);

-- Singleton: utility billing (Admin › Utility).
CREATE TABLE cfg_utility_policy (
    id                          SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    price_kwh                   BIGINT      NOT NULL CHECK (price_kwh >= 0),
    price_m3                    BIGINT      NOT NULL CHECK (price_m3 >= 0),
    reading_day                 SMALLINT    NOT NULL CHECK (reading_day BETWEEN 1 AND 28),
    payment_due_days            SMALLINT    NOT NULL CHECK (payment_due_days > 0),
    rounding                    VARCHAR(20) NOT NULL,      -- e.g. ROUND_UP_1000
    overdue_reminder            VARCHAR(20) NOT NULL,      -- e.g. DAILY_AFTER_DUE
    estimate_monthly            BIGINT      NOT NULL CHECK (estimate_monthly >= 0),
    months_held                 SMALLINT    NOT NULL CHECK (months_held >= 0),
    block_changes_when_overdue  BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by                  BIGINT REFERENCES auth_user (id),
    version                     BIGINT      NOT NULL DEFAULT 0
);

CREATE TABLE cfg_eligibility_criterion (
    key     VARCHAR(40)  PRIMARY KEY,      -- e.g. ENROLLED, NO_OVERDUE_INVOICE, GENDER_BLOCK_AVAILABLE
    title   VARCHAR(150) NOT NULL,
    note    VARCHAR(300),
    enabled BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order SMALLINT  NOT NULL DEFAULT 0
);

CREATE TABLE cfg_priority_group (
    id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key     VARCHAR(40)  NOT NULL UNIQUE,  -- referenced by auth_student.priority_groups
    title   VARCHAR(150) NOT NULL,
    note    VARCHAR(300),
    applied BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order SMALLINT  NOT NULL DEFAULT 0
);

-- Matching criteria are immutable snapshots; every assignment run records
-- the snapshot it used. Exactly one snapshot is active.
CREATE TABLE cfg_matching_snapshot (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    label            VARCHAR(20)  NOT NULL UNIQUE,   -- e.g. v3
    hard_constraints JSONB        NOT NULL,          -- ["Same gender as the Block", ...]
    criteria_order   JSONB        NOT NULL,          -- [{key,title,note}]
    weights          JSONB        NOT NULL,          -- [{key,label,note,on,value}]
    boost            NUMERIC(4,2) NOT NULL CHECK (boost >= 1 AND boost <= 5),
    active           BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by       BIGINT REFERENCES auth_user (id)
);
CREATE UNIQUE INDEX ux_matching_one_active ON cfg_matching_snapshot (active) WHERE active;

-- Generic option lists (regions, relationships, reasons, categories...).
CREATE TABLE cfg_lookup (
    list_key   VARCHAR(40)  NOT NULL,
    code       VARCHAR(40)  NOT NULL,
    label      VARCHAR(150) NOT NULL,
    sort_order SMALLINT     NOT NULL DEFAULT 0,
    active     BOOLEAN      NOT NULL DEFAULT TRUE,
    PRIMARY KEY (list_key, code)
);

-- Admin › System parameters (typed key/value, grouped into sections).
CREATE TABLE cfg_parameter (
    key        VARCHAR(60)  PRIMARY KEY,
    section    VARCHAR(60)  NOT NULL,
    label      VARCHAR(150) NOT NULL,
    value_type VARCHAR(10)  NOT NULL CHECK (value_type IN ('INT', 'DECIMAL', 'BOOL', 'TEXT', 'CHOICE')),
    value      VARCHAR(500) NOT NULL,
    helper     VARCHAR(300),
    options    JSONB,                       -- for CHOICE: [{value,label}]
    sort_order SMALLINT     NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by BIGINT REFERENCES auth_user (id)
);
