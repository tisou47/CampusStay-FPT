-- =====================================================================
-- CampusStay FPT — V81: a schedule per week. A Manager plans a Staff
-- member's shifts for a given week (its Monday); a week not planned uses
-- the person's default weekly shifts (auth_staff_shift). Planning next
-- week never changes this week. Staff see next week once it is sent.
-- =====================================================================

-- A person's week is planned once a Manager saved it (even with no shift: a week off).
CREATE TABLE auth_staff_week (
    user_id     BIGINT      NOT NULL REFERENCES auth_user (id) ON DELETE CASCADE,
    week_start  DATE        NOT NULL CHECK (extract(isodow FROM week_start) = 1),
    updated_at  TIMESTAMPTZ NOT NULL,
    updated_by  BIGINT      NOT NULL REFERENCES auth_user (id),
    PRIMARY KEY (user_id, week_start)
);

CREATE TABLE auth_staff_week_shift (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT   NOT NULL,
    week_start  DATE     NOT NULL,
    weekday     SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    start_time  TIME     NOT NULL,
    end_time    TIME     NOT NULL,
    CHECK (start_time <> end_time),
    UNIQUE (user_id, week_start, weekday, start_time),
    FOREIGN KEY (user_id, week_start) REFERENCES auth_staff_week (user_id, week_start) ON DELETE CASCADE
);
