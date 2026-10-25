-- =====================================================================
-- CampusStay FPT — V42: registration periods (Change Specification v2
-- phase 4, ADR-20, spec §5, §6.3, §6.4, §9). A Manager requests a Term,
-- the Admin builds it step by step and publishes it. A published Term keeps
-- the prices, Deposit, Utility Deposit and rules it opened with.
-- =====================================================================

-- ---------- Drafts are saved after each wizard step ----------
-- Until publishing only the name and the stay dates are needed; a published
-- Term has every window (ck_term_published_complete).
ALTER TABLE cfg_term
    ALTER COLUMN registration_opens_at DROP NOT NULL,
    ALTER COLUMN registration_closes_at DROP NOT NULL,
    ALTER COLUMN results_published_at DROP NOT NULL,
    ALTER COLUMN roommate_hours DROP NOT NULL,
    ALTER COLUMN deposit_hours DROP NOT NULL,
    ALTER COLUMN balance_due_at DROP NOT NULL,
    ALTER COLUMN check_in_start DROP NOT NULL,
    ALTER COLUMN check_in_end DROP NOT NULL,
    ALTER COLUMN check_out_by DROP NOT NULL;

ALTER TABLE cfg_term
    -- Renewal milestones (spec §5.1) for the continuing residents of the Term before it: M1 is the planned
    -- publication, M2–M7 the requests window, decisions, reconciliation and next-Term fees. Optional until the
    -- renewal flow uses them (phase 6); when one is set, all are.
    ADD COLUMN publish_at            TIMESTAMPTZ,
    ADD COLUMN requests_open_at      TIMESTAMPTZ,
    ADD COLUMN requests_close_at     TIMESTAMPTZ,
    ADD COLUMN decisions_due_at      TIMESTAMPTZ,
    ADD COLUMN reconciliation_due_at TIMESTAMPTZ,
    ADD COLUMN fees_issue_at         TIMESTAMPTZ,
    ADD COLUMN fees_due_at           TIMESTAMPTZ,
    -- Share of the Term's Beds kept for new students (D-29).
    ADD COLUMN reserved_new_percent  NUMERIC(5,2) NOT NULL DEFAULT 0
                                     CHECK (reserved_new_percent >= 0 AND reserved_new_percent <= 100),
    -- Money of the Term (spec §6.4 step 4), fixed when it is published; null reads the defaults.
    ADD COLUMN deposit_percent       NUMERIC(5,2) CHECK (deposit_percent > 0 AND deposit_percent <= 100),
    ADD COLUMN utility_deposit       BIGINT CHECK (utility_deposit >= 0),
    -- Rules the Term opened with, fixed when it is published (null: the rules in use).
    ADD COLUMN matching_snapshot_id  BIGINT REFERENCES cfg_matching_snapshot (id),
    ADD COLUMN eligibility_keys      JSONB,                     -- ["ENROLLED", …] switched on
    ADD COLUMN priority_group_keys   JSONB,                     -- ["FIRST_YEAR", …] highest first
    -- Information for students (spec §6.4 step 6).
    ADD COLUMN house_rules           TEXT,
    ADD COLUMN faq                   JSONB NOT NULL DEFAULT '[]',   -- [{question, answer}]
    ADD COLUMN documents             JSONB NOT NULL DEFAULT '[]',   -- [{title, url}]
    -- Last wizard step saved (1–7); Terms of the old form are complete.
    ADD COLUMN wizard_step           SMALLINT NOT NULL DEFAULT 7 CHECK (wizard_step BETWEEN 1 AND 7),
    -- Why the Admin changed a value the Manager proposed: {field: reason}.
    ADD COLUMN change_reasons        JSONB NOT NULL DEFAULT '{}';

-- Price per Bed of each Room Type × Room Class in the Term (spec §6.4 step 4). Locked once an Invoice of the
-- Term exists (spec §5.2); changing the default prices only affects Terms built afterwards (spec §8).
CREATE TABLE cfg_term_price (
    term_id       BIGINT NOT NULL REFERENCES cfg_term (id) ON DELETE CASCADE,
    room_type_id  BIGINT NOT NULL REFERENCES cfg_room_type (id),
    room_class_id BIGINT NOT NULL REFERENCES cfg_room_class (id),
    price         BIGINT NOT NULL CHECK (price > 0),
    PRIMARY KEY (term_id, room_type_id, room_class_id)
);

-- Blocks the Term uses (none listed: every active Block) and Rooms it leaves out (spec §6.4 step 3).
CREATE TABLE cfg_term_block (
    term_id     BIGINT NOT NULL REFERENCES cfg_term (id) ON DELETE CASCADE,
    building_id BIGINT NOT NULL REFERENCES inv_building (id),
    PRIMARY KEY (term_id, building_id)
);

CREATE TABLE cfg_term_room_excluded (
    term_id BIGINT NOT NULL REFERENCES cfg_term (id) ON DELETE CASCADE,
    room_id BIGINT NOT NULL REFERENCES inv_room (id),
    PRIMARY KEY (term_id, room_id)
);

-- Existing Terms keep today's prices, Deposit and Utility Deposit from now on.
INSERT INTO cfg_term_price (term_id, room_type_id, room_class_id, price)
SELECT t.id, rt.id, rc.id,
       CEIL(rt.base_price * (1 + rc.surcharge_rate) / s.step) * s.step
FROM cfg_term t
CROSS JOIN cfg_room_type rt
CROSS JOIN cfg_room_class rc
CROSS JOIN (SELECT GREATEST(1, COALESCE((SELECT CAST(value AS INT) FROM cfg_parameter
                                          WHERE key = 'pricing.rounding_vnd'), 1)) AS step) s
WHERE rt.status = 'ACTIVE' AND rc.status = 'ACTIVE'
ON CONFLICT DO NOTHING;

UPDATE cfg_term
SET deposit_percent = (SELECT deposit_percent FROM cfg_fee_policy WHERE id = 1),
    utility_deposit = (SELECT estimate_monthly * months_held FROM cfg_utility_policy WHERE id = 1)
WHERE deposit_percent IS NULL
  AND EXISTS (SELECT 1 FROM cfg_fee_policy WHERE id = 1)
  AND EXISTS (SELECT 1 FROM cfg_utility_policy WHERE id = 1);

-- Publishing also fills the Term's money (deposit_percent, utility_deposit, cfg_term_price); a Term without it
-- (written by SQL, e.g. test data) reads the defaults.
ALTER TABLE cfg_term ADD CONSTRAINT ck_term_published_complete CHECK (
    status = 'DRAFT' OR (registration_opens_at IS NOT NULL AND registration_closes_at IS NOT NULL
        AND results_published_at IS NOT NULL AND roommate_hours IS NOT NULL AND deposit_hours IS NOT NULL
        AND balance_due_at IS NOT NULL AND check_in_start IS NOT NULL AND check_in_end IS NOT NULL
        AND check_out_by IS NOT NULL));

ALTER TABLE cfg_term ADD CONSTRAINT ck_term_renewal_complete CHECK (
    num_nulls(publish_at, requests_open_at, requests_close_at, decisions_due_at, reconciliation_due_at,
              fees_issue_at, fees_due_at) IN (0, 7) OR status = 'DRAFT');

-- ---------- Registration-period requests (spec §6.3) ----------
CREATE TABLE cfg_term_request (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code          VARCHAR(20)   NOT NULL UNIQUE,                 -- RP-1, RP-2 …
    term_name     VARCHAR(100)  NOT NULL,                        -- the Term asked for, e.g. Summer 2027
    stay_start    DATE          NOT NULL,
    stay_end      DATE          NOT NULL,
    -- The Manager's proposal as sent: milestones, Blocks, Rooms left out, places per Room Type × Room Class ×
    -- gender and prices. A snapshot shown next to the Term built from it, never filtered.
    proposal      JSONB         NOT NULL,
    notes         VARCHAR(2000),
    status        VARCHAR(14)   NOT NULL DEFAULT 'SUBMITTED'
                  CHECK (status IN ('SUBMITTED', 'IN_PROGRESS', 'NEEDS_CHANGES', 'DONE', 'REJECTED')),
    requested_by  BIGINT        NOT NULL REFERENCES auth_user (id),
    term_id       BIGINT        REFERENCES cfg_term (id) ON DELETE SET NULL,
    decision_note VARCHAR(1000),                                 -- the Admin's note (Needs changes) or reason (Rejected)
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    version       BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ck_term_request_stay CHECK (stay_start < stay_end),
    CONSTRAINT ck_term_request_done CHECK (status <> 'DONE' OR term_id IS NOT NULL)
);
-- One open request per target Term (D-11).
CREATE UNIQUE INDEX ux_term_request_open ON cfg_term_request (lower(term_name))
    WHERE status IN ('SUBMITTED', 'IN_PROGRESS', 'NEEDS_CHANGES');
CREATE UNIQUE INDEX ux_term_request_term ON cfg_term_request (term_id)
    WHERE term_id IS NOT NULL AND status <> 'REJECTED';

-- History of a request: every status change and the comments of the Managers and the Admin.
CREATE TABLE cfg_term_request_event (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id BIGINT        NOT NULL REFERENCES cfg_term_request (id) ON DELETE CASCADE,
    kind       VARCHAR(14)   NOT NULL CHECK (kind IN ('SUBMITTED', 'UPDATED', 'COMMENT', 'IN_PROGRESS',
                                                       'NEEDS_CHANGES', 'REJECTED', 'BUILT', 'DONE')),
    actor_id   BIGINT        REFERENCES auth_user (id),
    note       VARCHAR(2000),
    at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX ix_term_request_event ON cfg_term_request_event (request_id, at, id);

-- ---------- Grouped configuration (spec §9) ----------
-- A parameter with a settings group is edited on that Admin screen (Deadlines and reminders; Refunds,
-- penalties and terminations; Stay and renewal), not on System parameters. used_in says where it acts.
ALTER TABLE cfg_parameter
    ADD COLUMN settings_group VARCHAR(20) CHECK (settings_group IN ('DEADLINES', 'REFUNDS', 'STAY')),
    ADD COLUMN used_in        VARCHAR(300);

-- value_type INT on these screens allows 0 (the screen checks each item's own range).
INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, sort_order, settings_group, used_in) VALUES
  ('payment.reminder_first_days', 'Deadlines and reminders', 'First payment reminder (days before the deadline)',
     'INT', '3', NULL, 40, 'DEADLINES', 'Balance and next-Term fee reminders'),
  ('payment.reminder_second_days', 'Deadlines and reminders', 'Second payment reminder (days before the deadline)',
     'INT', '1', NULL, 41, 'DEADLINES', 'Balance and next-Term fee reminders'),
  ('payment.rejected_claim_min_hours', 'Deadlines and reminders', 'Time left after a rejected payment claim, at least (hours)',
     'INT', '12', NULL, 42, 'DEADLINES', 'Payment claims rejected by a Manager'),
  ('payment.rejections_to_cancel', 'Deadlines and reminders', 'Rejected claims that cancel the Invoice',
     'INT', '2', NULL, 43, 'DEADLINES', 'Payment claims rejected by a Manager'),
  ('termination.overdue_months', 'Refunds, penalties and terminations', 'Overdue Utility months that end a stay',
     'INT', '2', NULL, 50, 'REFUNDS', 'Utility debt terminations'),
  ('termination.debt_reaches_deposit', 'Refunds, penalties and terminations', 'End a stay when the Utility debt reaches the Utility Deposit',
     'BOOL', 'true', NULL, 51, 'REFUNDS', 'Utility debt terminations'),
  ('termination.days_after_final_warning', 'Refunds, penalties and terminations', 'Days between the final warning and the termination',
     'INT', '3', NULL, 52, 'REFUNDS', 'Utility debt terminations'),
  ('termination.move_out_days', 'Refunds, penalties and terminations', 'Days to move out after a termination notice',
     'INT', '3', NULL, 53, 'REFUNDS', 'Termination notices'),
  ('late_check_in.max_days', 'Refunds, penalties and terminations', 'Longest late check-in after the check-in end (days)',
     'INT', '14', NULL, 54, 'REFUNDS', 'Late check-in decisions'),
  ('stay.max_terms', 'Stay and renewal', 'Most Terms a student may commit to (Gia hạn)',
     'INT', '9', NULL, 60, 'STAY', 'Application wizard and extension requests'),
  ('stay.auto_extension', 'Stay and renewal', 'Approve extension requests of eligible students automatically',
     'BOOL', 'true', NULL, 61, 'STAY', 'Extension requests'),
  ('stay.reserved_new_percent', 'Stay and renewal', 'Share of Beds kept for new students in new Terms (%)',
     'INT', '0', NULL, 62, 'STAY', 'Registration-period wizard (default of each new Term)'),
  ('stay.escalate_before_hours', 'Stay and renewal', 'Alert Managers about undecided requests before the decision deadline (hours)',
     'INT', '48', NULL, 63, 'STAY', 'Requests window')
ON CONFLICT (key) DO NOTHING;

UPDATE cfg_parameter SET used_in = 'Term prices of new Terms and the Room Type and Room Class screens'
WHERE key = 'pricing.rounding_vnd' AND used_in IS NULL;

-- New refund triggers (spec §9); they act from phase 5 on.
INSERT INTO cfg_refund_rule (trigger_code, description, refund_percent, approver_role, sort_order)
SELECT v.code, v.description, v.percent, v.approver, v.sort
FROM (VALUES
  ('BALANCE_NOT_PAID', 'Balance not paid by its deadline (the Deposit is kept)', 0, 'SYSTEM', 5),
  ('NOT_ENROLLED',     'Stay ended because the student is no longer enrolled (unused room fee)', 30, 'MANAGER', 6),
  ('TERMINATION',      'Stay terminated for Utility debt or by a Manager (unused room fee)', 0, 'SYSTEM', 7)
) AS v(code, description, percent, approver, sort)
WHERE NOT EXISTS (SELECT 1 FROM cfg_refund_rule r WHERE r.trigger_code = v.code);

-- ---------- Read contract for reports (RPT reads views only) ----------
CREATE VIEW rpt_v_term AS
SELECT id, code, name, status, stay_start, stay_end, registration_opens_at, registration_closes_at,
       results_published_at, balance_due_at, check_in_start, check_in_end, check_out_by, published_at,
       publish_at, requests_open_at, requests_close_at, decisions_due_at, reconciliation_due_at, fees_issue_at,
       fees_due_at, reserved_new_percent, deposit_percent, utility_deposit
FROM cfg_term;

CREATE VIEW rpt_v_term_price AS
SELECT term_id, room_type_id, room_class_id, price FROM cfg_term_price;

CREATE VIEW rpt_v_term_room AS
SELECT t.id AS term_id, r.id AS room_id,
       (NOT EXISTS (SELECT 1 FROM cfg_term_block b WHERE b.term_id = t.id)
        OR EXISTS (SELECT 1 FROM cfg_term_block b WHERE b.term_id = t.id AND b.building_id = r.building_id))
       AND NOT EXISTS (SELECT 1 FROM cfg_term_room_excluded x WHERE x.term_id = t.id AND x.room_id = r.id) AS used
FROM cfg_term t CROSS JOIN inv_room r;

CREATE VIEW rpt_v_term_request AS
SELECT id, code, term_name, status, term_id, created_at FROM cfg_term_request;
