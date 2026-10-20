-- =====================================================================
-- CampusStay FPT — V8: MNT (Maintenance Requests, inspection
-- checklists, schedules and runs)
-- =====================================================================

CREATE TABLE mnt_request (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code                 VARCHAR(24)  NOT NULL UNIQUE,         -- e.g. MR-000321
    term_id              BIGINT       REFERENCES cfg_term (id),
    room_id              BIGINT       NOT NULL REFERENCES inv_room (id),
    bed_id               BIGINT       REFERENCES inv_bed (id),
    reporter_id          BIGINT       NOT NULL REFERENCES auth_user (id),
    source               VARCHAR(10)  NOT NULL DEFAULT 'STUDENT' CHECK (source IN ('STUDENT', 'STAFF', 'INSPECTION')),
    title                VARCHAR(150) NOT NULL,
    description          VARCHAR(2000) NOT NULL,
    category             VARCHAR(40)  NOT NULL,                -- cfg_lookup MAINTENANCE_CATEGORY
    location             VARCHAR(40)  NOT NULL,                -- cfg_lookup MAINTENANCE_LOCATION
    urgency              VARCHAR(8)   NOT NULL CHECK (urgency IN ('NORMAL', 'URGENT')),
    priority             VARCHAR(8)   NOT NULL CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
    staff_may_enter      BOOLEAN      NOT NULL DEFAULT FALSE,
    status               VARCHAR(12)  NOT NULL DEFAULT 'SUBMITTED'
                         CHECK (status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    assignee_id          BIGINT       REFERENCES auth_user (id),
    visit_window_start   TIMESTAMPTZ,
    visit_window_end     TIMESTAMPTZ,
    sla_due_at           TIMESTAMPTZ,
    reported_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    resolved_at          TIMESTAMPTZ,
    closed_at            TIMESTAMPTZ,
    confirmed_fixed      BOOLEAN,
    reopen_count         SMALLINT     NOT NULL DEFAULT 0,
    version              BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_mnt_assigned CHECK (status IN ('SUBMITTED', 'CLOSED') OR assignee_id IS NOT NULL),
    CONSTRAINT ck_mnt_visit CHECK (visit_window_start IS NULL OR visit_window_end > visit_window_start)
);
CREATE INDEX ix_mnt_room ON mnt_request (room_id, reported_at DESC);
CREATE INDEX ix_mnt_status ON mnt_request (status, priority);
CREATE INDEX ix_mnt_assignee ON mnt_request (assignee_id) WHERE status IN ('ASSIGNED', 'IN_PROGRESS');
CREATE INDEX ix_mnt_sla ON mnt_request (sla_due_at) WHERE status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS');

CREATE TABLE mnt_request_photo (
    request_id BIGINT NOT NULL REFERENCES mnt_request (id) ON DELETE CASCADE,
    file_id    BIGINT NOT NULL REFERENCES shared_file (id),
    PRIMARY KEY (request_id, file_id)
);

CREATE TABLE mnt_request_event (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id  BIGINT        NOT NULL REFERENCES mnt_request (id) ON DELETE CASCADE,
    actor_id    BIGINT        REFERENCES auth_user (id),   -- NULL = system
    actor_role  VARCHAR(10),
    text        VARCHAR(300),                               -- system-generated line ("Assigned to …")
    message     VARCHAR(2000),                              -- free text update
    internal    BOOLEAN       NOT NULL DEFAULT FALSE,       -- internal notes are never shown to students
    at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT ck_mnt_event_content CHECK (text IS NOT NULL OR message IS NOT NULL)
);
CREATE INDEX ix_mnt_event_request ON mnt_request_event (request_id, at);

-- ---------- inspections ----------
-- Each published version of a checklist is its own row; "family_key" groups
-- versions so runs keep the exact version they used.
CREATE TABLE mnt_checklist (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    family_key  VARCHAR(40)  NOT NULL,
    name        VARCHAR(150) NOT NULL,
    version     SMALLINT     NOT NULL CHECK (version > 0),
    status      VARCHAR(10)  NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'REPLACED', 'ARCHIVED')),
    published_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ux_checklist_version UNIQUE (family_key, version)
);
CREATE UNIQUE INDEX ux_checklist_one_published ON mnt_checklist (family_key) WHERE status = 'PUBLISHED';

CREATE TABLE mnt_checklist_item (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    checklist_id BIGINT       NOT NULL REFERENCES mnt_checklist (id) ON DELETE CASCADE,
    label        VARCHAR(200) NOT NULL,
    category     VARCHAR(40)  NOT NULL,
    severity     VARCHAR(8)   NOT NULL CHECK (severity IN ('CRITICAL', 'MAJOR', 'MINOR', 'TRIVIAL')),
    sort_order   SMALLINT     NOT NULL DEFAULT 0
);

CREATE TABLE mnt_inspection_schedule (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    building_id       BIGINT       NOT NULL REFERENCES inv_building (id),
    name              VARCHAR(150) NOT NULL,
    checklist_family  VARCHAR(40)  NOT NULL,          -- runs use the version published at run time
    scope             VARCHAR(20)  NOT NULL CHECK (scope IN ('ALL_ROOMS', 'OCCUPIED', 'EMPTY', 'FLOORS')),
    floors            SMALLINT[],
    repeat            VARCHAR(10)  NOT NULL CHECK (repeat IN ('ONCE', 'WEEKLY', 'MONTHLY', 'TERMLY')),
    assignee_id       BIGINT       REFERENCES auth_user (id),
    due_within_days   SMALLINT     NOT NULL CHECK (due_within_days > 0),
    create_requests   BOOLEAN      NOT NULL DEFAULT TRUE,
    notify_residents  BOOLEAN      NOT NULL DEFAULT TRUE,
    next_run_at       TIMESTAMPTZ,
    status            VARCHAR(8)   NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED')),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version           BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_schedule_floors CHECK (scope <> 'FLOORS' OR floors IS NOT NULL)
);

CREATE TABLE mnt_inspection_run (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    schedule_id   BIGINT       REFERENCES mnt_inspection_schedule (id),
    building_id   BIGINT       NOT NULL REFERENCES inv_building (id),
    checklist_id  BIGINT       NOT NULL REFERENCES mnt_checklist (id),
    run_date      DATE         NOT NULL,
    due_at        TIMESTAMPTZ  NOT NULL,
    inspector_id  BIGINT       REFERENCES auth_user (id),
    status        VARCHAR(12)  NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'SUBMITTED')),
    submitted_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_inspection_run_block ON mnt_inspection_run (building_id, run_date);

CREATE TABLE mnt_inspection_room (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id        BIGINT      NOT NULL REFERENCES mnt_inspection_run (id) ON DELETE CASCADE,
    room_id       BIGINT      NOT NULL REFERENCES inv_room (id),
    status        VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'INSPECTED', 'UNREACHABLE')),
    inspected_at  TIMESTAMPTZ,
    CONSTRAINT ux_inspection_room UNIQUE (run_id, room_id)
);

CREATE TABLE mnt_inspection_result (
    inspection_room_id BIGINT      NOT NULL REFERENCES mnt_inspection_room (id) ON DELETE CASCADE,
    item_id            BIGINT      NOT NULL REFERENCES mnt_checklist_item (id),
    result             VARCHAR(12) NOT NULL CHECK (result IN ('PASS', 'FAIL', 'NOT_CHECKED')),
    note               VARCHAR(500),
    created_request_id BIGINT      REFERENCES mnt_request (id),
    PRIMARY KEY (inspection_room_id, item_id)
);
