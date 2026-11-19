-- =====================================================================
-- CampusStay FPT — V78: Staff shifts and the record of what Staff do.
-- A Manager gives each Staff member a weekly shift pattern (a weekday and a
-- time span; a span ending before it starts runs past midnight). Every change
-- a Staff member makes is recorded with whether it happened inside their
-- shift and inside what they handle; outside either, the Staff member
-- confirmed a warning first.
-- =====================================================================

CREATE TABLE auth_staff_shift (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES auth_user (id) ON DELETE CASCADE,
    weekday     SMALLINT    NOT NULL CHECK (weekday BETWEEN 1 AND 7),   -- ISO: 1 = Monday … 7 = Sunday
    start_time  TIME        NOT NULL,
    end_time    TIME        NOT NULL,
    CHECK (start_time <> end_time),
    UNIQUE (user_id, weekday, start_time)
);
CREATE INDEX ix_auth_staff_shift_user ON auth_staff_shift (user_id);

CREATE TABLE auth_staff_activity (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT       NOT NULL REFERENCES auth_user (id) ON DELETE CASCADE,
    at            TIMESTAMPTZ  NOT NULL,
    method        VARCHAR(10)  NOT NULL,
    pattern       VARCHAR(200) NOT NULL,     -- the endpoint, e.g. /maintenance-requests/{id}/updates
    object_id     VARCHAR(100),              -- the record the call named in its path, when any
    handle        VARCHAR(40),               -- the kind of work of the endpoint (STAFF_HANDLE code), NULL = any
    in_shift      BOOLEAN      NOT NULL,
    role_match    BOOLEAN      NOT NULL,
    acknowledged  BOOLEAN      NOT NULL DEFAULT FALSE,
    status        SMALLINT     NOT NULL      -- the HTTP status of the answer
);
CREATE INDEX ix_auth_staff_activity_user_at ON auth_staff_activity (user_id, at DESC);
CREATE INDEX ix_auth_staff_activity_flagged ON auth_staff_activity (at DESC) WHERE NOT (in_shift AND role_match);
