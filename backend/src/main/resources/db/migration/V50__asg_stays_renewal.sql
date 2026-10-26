-- =====================================================================
-- CampusStay FPT — V50: Stays, next-Term Allocations, the requests window
-- and operational moves (Change Specification v2 phase 6; D-13 … D-15,
-- D-30, D-31, spec §4, §5.1, §6.10, §6.13, §7, §12).
--   * A Stay is one student's residence from their first Term to their last:
--     the Terms committed (Gia hạn, grown by extensions) and the Terms used.
--     It starts when the student becomes a resident and counts a further Term
--     when its next-Term room fee is paid.
--   * At M2 every resident of Term N who is not leaving gets a next-Term
--     Allocation on the same Bed in N+1 (source RENEWAL): Continuing while
--     Terms remain on the Stay, Awaiting extension in its last Term. Every
--     next-Term change is made on it; the unique index on Bed and Term keeps
--     two decisions from giving the same Bed.
--   * asg_renewal records, per Term N+1, which steps of the window have run
--     (M2 opened, M3 closed, the alert before M4, M6 fees, M7 unpaid fees).
--   * An operational move (Staff or a Manager, during a Term) is recorded
--     with its reason; it costs nothing.
-- =====================================================================

CREATE TABLE asg_stay (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id      BIGINT       NOT NULL REFERENCES auth_user (id),
    first_term_id   BIGINT       NOT NULL REFERENCES cfg_term (id),
    last_term_id    BIGINT       NOT NULL REFERENCES cfg_term (id),       -- the latest Term counted
    committed_terms SMALLINT     NOT NULL CHECK (committed_terms BETWEEN 1 AND 30),
    terms_used      SMALLINT     NOT NULL DEFAULT 1 CHECK (terms_used >= 0),
    status          VARCHAR(8)   NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ENDED')),
    end_kind        VARCHAR(12)  CHECK (end_kind IN ('COMPLETED', 'ENDED_EARLY', 'TERMINATED')),
    started_at      TIMESTAMPTZ  NOT NULL,
    ended_at        TIMESTAMPTZ,
    version         BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_stay_ended CHECK ((status = 'ENDED') = (ended_at IS NOT NULL AND end_kind IS NOT NULL))
);
-- One Stay at a time per student.
CREATE UNIQUE INDEX ux_stay_active ON asg_stay (student_id) WHERE status = 'ACTIVE';

ALTER TABLE asg_allocation
    ADD COLUMN stay_id     BIGINT REFERENCES asg_stay (id),
    -- A next-Term Allocation (spec §7): Awaiting extension → Continuing; null for every other Allocation.
    ADD COLUMN renewal     VARCHAR(18) CHECK (renewal IN ('AWAITING_EXTENSION', 'CONTINUING')),
    -- When its next-Term room fee was paid (the time of the confirmed claim).
    ADD COLUMN fee_paid_at TIMESTAMPTZ;
ALTER TABLE asg_allocation ADD CONSTRAINT ck_alloc_fee_paid CHECK (fee_paid_at IS NULL OR renewal = 'CONTINUING');
CREATE INDEX ix_alloc_stay ON asg_allocation (stay_id);
CREATE INDEX ix_alloc_renewal ON asg_allocation (term_id, renewal) WHERE status = 'ACTIVE' AND renewal IS NOT NULL;

ALTER TABLE asg_allocation DROP CONSTRAINT asg_allocation_source_check;
ALTER TABLE asg_allocation ADD CONSTRAINT ck_alloc_source CHECK (source IN ('ASSIGNMENT', 'ROUND2', 'ROOM_CHANGE',
    'SWAP', 'TEMPORARY', 'MANUAL', 'RENEWAL', 'MOVE'));
-- End reasons of next-Term Allocations: the student ended the stay, did not extend by M3, did not pay the
-- next-Term fee by M7, is not enrolled (reconciliation) or was terminated; MOVE = an operational move.
ALTER TABLE asg_allocation DROP CONSTRAINT ck_alloc_end_reason;
ALTER TABLE asg_allocation ADD CONSTRAINT ck_alloc_end_reason CHECK (end_reason IN ('CHECK_OUT', 'ROOM_CHANGE',
    'SWAP', 'CANCELLED', 'TERM_END', 'FORFEIT', 'END_OF_STAY', 'NOT_EXTENDED', 'FEE_NOT_PAID', 'NOT_ENROLLED',
    'TERMINATED', 'MOVE'));

-- Residents of today (and their earlier Allocations of the same stay, through moves) belong to a Stay that
-- counts their current Term; Gia hạn comes from their Application (1 without one).
INSERT INTO asg_stay (student_id, first_term_id, last_term_id, committed_terms, terms_used, started_at)
SELECT DISTINCT ON (a.student_id) a.student_id, a.term_id, a.term_id,
       coalesce((SELECT p.stay_terms FROM app_application p WHERE p.id = a.application_id), 1), 1, a.resident_at
FROM asg_allocation a
WHERE a.status = 'ACTIVE' AND a.resident_at IS NOT NULL
ORDER BY a.student_id, a.resident_at;
UPDATE asg_allocation a SET stay_id = s.id
FROM asg_stay s
WHERE s.student_id = a.student_id AND a.term_id = s.first_term_id AND a.resident_at IS NOT NULL;

-- ---------- the requests window of a Term (spec §5.1) ----------
CREATE TABLE asg_renewal (
    term_id          BIGINT       PRIMARY KEY REFERENCES cfg_term (id),   -- N+1
    previous_term_id BIGINT       NOT NULL REFERENCES cfg_term (id),      -- N, whose residents continue
    opened_at        TIMESTAMPTZ  NOT NULL,                               -- M2: next-Term Allocations created
    continuing       INT          NOT NULL DEFAULT 0,
    awaiting         INT          NOT NULL DEFAULT 0,
    closed_at        TIMESTAMPTZ,                                         -- M3: Awaiting extension cancelled
    escalated_at     TIMESTAMPTZ,                                         -- Managers alerted before M4
    fees_issued_at   TIMESTAMPTZ,                                         -- M6
    fees_issued_by   BIGINT       REFERENCES auth_user (id),
    fees_closed_at   TIMESTAMPTZ,                                         -- M7: unpaid next-Term fees cancelled
    CONSTRAINT ck_renewal_terms CHECK (term_id <> previous_term_id),
    CONSTRAINT ck_renewal_fees CHECK ((fees_issued_at IS NULL) = (fees_issued_by IS NULL))
);

-- ---------- operational moves during a Term (spec §6.13) ----------
CREATE TABLE asg_move (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    term_id            BIGINT       NOT NULL REFERENCES cfg_term (id),
    student_id         BIGINT       NOT NULL REFERENCES auth_user (id),
    from_allocation_id BIGINT       NOT NULL REFERENCES asg_allocation (id),
    to_allocation_id   BIGINT       NOT NULL REFERENCES asg_allocation (id),
    from_bed_id        BIGINT       NOT NULL REFERENCES inv_bed (id),
    to_bed_id          BIGINT       NOT NULL REFERENCES inv_bed (id),
    reason             VARCHAR(20)  NOT NULL,                             -- cfg_lookup MOVE_REASON
    note               VARCHAR(500),
    -- What happened to the student's next-Term Allocation: it followed to the new Bed, it stayed, or none.
    next_term          VARCHAR(8)   NOT NULL DEFAULT 'NONE' CHECK (next_term IN ('FOLLOWED', 'KEPT', 'NONE')),
    -- A move of a next-Term Allocation after the fees were issued (D-31): the fee voided and issued again.
    reissued_fee       BOOLEAN      NOT NULL DEFAULT FALSE,
    moved_by           BIGINT       NOT NULL REFERENCES auth_user (id),
    moved_at           TIMESTAMPTZ  NOT NULL,
    CONSTRAINT ck_move_note CHECK (reason <> 'OTHER' OR note IS NOT NULL)
);
CREATE INDEX ix_move_term ON asg_move (term_id, moved_at DESC);

-- ---------- read contract for reports ----------
CREATE OR REPLACE VIEW rpt_v_allocation AS
SELECT id, term_id, student_id, bed_id, status, allocated_at, checked_in_at, ended_at, end_reason, resident_at,
       code_released_at, source, renewal, fee_paid_at, stay_id
FROM asg_allocation;

CREATE VIEW rpt_v_stay AS
SELECT id, student_id, first_term_id, last_term_id, committed_terms, terms_used, status, end_kind, started_at, ended_at
FROM asg_stay;

CREATE VIEW rpt_v_renewal AS
SELECT term_id, previous_term_id, opened_at, continuing, awaiting, closed_at, fees_issued_at, fees_closed_at
FROM asg_renewal;
