-- =====================================================================
-- CampusStay FPT — V6: BIL (Invoices, Payments, bank-feed inbox,
-- refunds, meter readings for Utility Invoices)
-- =====================================================================

CREATE TABLE bil_invoice (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code              VARCHAR(24)  NOT NULL UNIQUE,          -- e.g. INV-SP27-000123
    term_id           BIGINT       NOT NULL REFERENCES cfg_term (id),
    student_id        BIGINT       NOT NULL REFERENCES auth_user (id),
    application_id    BIGINT       REFERENCES app_application (id),
    allocation_id     BIGINT       REFERENCES asg_allocation (id),
    type              VARCHAR(12)  NOT NULL CHECK (type IN ('DEPOSIT', 'BALANCE', 'UTILITY', 'ROOM_CHANGE', 'DAMAGE')),
    title             VARCHAR(150) NOT NULL,
    amount            BIGINT       NOT NULL CHECK (amount > 0),
    status            VARCHAR(22)  NOT NULL DEFAULT 'UNPAID'
                      CHECK (status IN ('UPCOMING', 'UNPAID', 'AWAITING_CONFIRMATION', 'PAID',
                                        'OVERDUE', 'REFUNDED', 'VOID')),
    lines             JSONB,                                 -- [{label, amount}]; sums to amount
    breakdown         JSONB,                                 -- Utility: segments, prices, rounding note
    utility_deposit   BIGINT       NOT NULL DEFAULT 0 CHECK (utility_deposit >= 0),
    -- Unique transfer memo the student must type; SePay extracts it as "code".
    transfer_content  VARCHAR(30)  NOT NULL UNIQUE,
    qr_expires_at     TIMESTAMPTZ,
    issued_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    due_at            TIMESTAMPTZ  NOT NULL,
    paid_at           TIMESTAMPTZ,
    payment_method    VARCHAR(10)  CHECK (payment_method IN ('VIETQR', 'MANUAL')),
    reminded_at       TIMESTAMPTZ,
    voided_reason     VARCHAR(300),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version           BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_invoice_paid CHECK ((status IN ('PAID', 'REFUNDED')) = (paid_at IS NOT NULL))
);
CREATE INDEX ix_invoice_student_term ON bil_invoice (student_id, term_id);
CREATE INDEX ix_invoice_term_status  ON bil_invoice (term_id, status);
CREATE INDEX ix_invoice_due ON bil_invoice (due_at) WHERE status IN ('UNPAID', 'OVERDUE');
-- One live Deposit per Application.
CREATE UNIQUE INDEX ux_invoice_one_deposit ON bil_invoice (application_id)
    WHERE type = 'DEPOSIT' AND status <> 'VOID';

-- Raw inbox of bank-feed webhooks (SePay). Dedup key = provider + provider id
-- (SePay keeps the same "id" across retries and replays).
CREATE TABLE bil_bank_transaction (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider         VARCHAR(10)  NOT NULL CHECK (provider IN ('SEPAY', 'MOCK')),
    provider_txn_id  VARCHAR(40)  NOT NULL,
    gateway          VARCHAR(50),
    account_number   VARCHAR(30),
    transaction_at   TIMESTAMPTZ  NOT NULL,
    transfer_type    VARCHAR(3)   NOT NULL CHECK (transfer_type IN ('in', 'out')),
    amount           BIGINT       NOT NULL CHECK (amount >= 0),
    content          VARCHAR(500),
    code             VARCHAR(40),
    reference_code   VARCHAR(60),
    raw              JSONB        NOT NULL,
    received_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    match_status     VARCHAR(16)  NOT NULL DEFAULT 'PENDING'
                     CHECK (match_status IN ('PENDING', 'MATCHED', 'UNMATCHED', 'AMOUNT_MISMATCH',
                                             'ALREADY_PAID', 'IGNORED')),
    invoice_id       BIGINT REFERENCES bil_invoice (id),
    processed_at     TIMESTAMPTZ,
    CONSTRAINT ux_bank_txn UNIQUE (provider, provider_txn_id)
);
CREATE INDEX ix_bank_txn_pending ON bil_bank_transaction (received_at) WHERE match_status = 'PENDING';

CREATE TABLE bil_payment (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id          BIGINT       NOT NULL REFERENCES bil_invoice (id),
    amount              BIGINT       NOT NULL CHECK (amount > 0),
    method              VARCHAR(10)  NOT NULL CHECK (method IN ('VIETQR', 'MANUAL')),
    status              VARCHAR(10)  NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'REVERSED')),
    bank_transaction_id BIGINT       UNIQUE REFERENCES bil_bank_transaction (id),
    reference           VARCHAR(60),
    receipt_file_id     BIGINT REFERENCES shared_file (id),
    paid_at             TIMESTAMPTZ  NOT NULL,
    confirmed_by        BIGINT REFERENCES auth_user (id),     -- NULL = automatic
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_payment_source CHECK (
        (method = 'VIETQR' AND bank_transaction_id IS NOT NULL)
        OR (method = 'MANUAL' AND confirmed_by IS NOT NULL AND reference IS NOT NULL))
);
-- An Invoice is settled by exactly one confirmed Payment.
CREATE UNIQUE INDEX ux_payment_one_confirmed ON bil_payment (invoice_id) WHERE status = 'CONFIRMED';

CREATE TABLE bil_refund (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    term_id        BIGINT       NOT NULL REFERENCES cfg_term (id),
    student_id     BIGINT       NOT NULL REFERENCES auth_user (id),
    building_id    BIGINT       REFERENCES inv_building (id),
    source_type    VARCHAR(16)  NOT NULL CHECK (source_type IN ('APPLICATION_CANCEL', 'CHECK_OUT', 'ROOM_CHANGE', 'OTHER')),
    source_id      BIGINT,
    reason         VARCHAR(300) NOT NULL,
    rule_id        BIGINT REFERENCES cfg_refund_rule (id),
    paid_amount    BIGINT       NOT NULL CHECK (paid_amount >= 0),
    amount         BIGINT       NOT NULL CHECK (amount >= 0),
    exception      BOOLEAN      NOT NULL DEFAULT FALSE,     -- differs from the rule
    status         VARCHAR(10)  NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'PAID')),
    note           VARCHAR(500),
    decided_by     BIGINT REFERENCES auth_user (id),
    decided_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version        BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_refund_amount CHECK (amount <= paid_amount),
    CONSTRAINT ck_refund_note CHECK (status NOT IN ('REJECTED') OR note IS NOT NULL),
    CONSTRAINT ck_refund_exception_note CHECK (NOT (exception AND status = 'APPROVED') OR note IS NOT NULL)
);
CREATE INDEX ix_refund_block_status ON bil_refund (building_id, status);

-- ---------- meter readings (Utility) ----------
CREATE TABLE bil_meter_period (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    building_id  BIGINT      NOT NULL REFERENCES inv_building (id),
    label        VARCHAR(30) NOT NULL,           -- e.g. 10/2026
    period_start DATE        NOT NULL,
    period_end   DATE        NOT NULL,
    due_at       TIMESTAMPTZ NOT NULL,
    closed_at    TIMESTAMPTZ,
    closed_by    BIGINT REFERENCES auth_user (id),
    CONSTRAINT ux_meter_period UNIQUE (building_id, period_start),
    CONSTRAINT ck_meter_period CHECK (period_start < period_end)
);

CREATE TABLE bil_meter_reading (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    period_id         BIGINT        NOT NULL REFERENCES bil_meter_period (id),
    room_id           BIGINT        NOT NULL REFERENCES inv_room (id),
    electricity_prev  NUMERIC(10,1) NOT NULL,
    electricity_curr  NUMERIC(10,1),
    water_prev        NUMERIC(10,1) NOT NULL,
    water_curr        NUMERIC(10,1),
    status            VARCHAR(12)   NOT NULL DEFAULT 'MISSING'
                      CHECK (status IN ('MISSING', 'ENTERED', 'CHECK_VALUE', 'CONFIRMED')),
    entered_by        BIGINT REFERENCES auth_user (id),
    entered_at        TIMESTAMPTZ,
    confirmed_by      BIGINT REFERENCES auth_user (id),
    confirmed_at      TIMESTAMPTZ,
    CONSTRAINT ux_meter_reading UNIQUE (period_id, room_id),
    CONSTRAINT ck_meter_monotonic CHECK (
        (electricity_curr IS NULL OR electricity_curr >= electricity_prev)
        AND (water_curr IS NULL OR water_curr >= water_prev))
);

-- Intermediate readings taken when residents change mid-period
-- (Check-in, Check-out, Room-Change): they split the period into segments.
CREATE TABLE bil_meter_cut (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id       BIGINT        NOT NULL REFERENCES inv_room (id),
    cut_date      DATE          NOT NULL,
    electricity   NUMERIC(10,1) NOT NULL,
    water         NUMERIC(10,1) NOT NULL,
    reason        VARCHAR(12)   NOT NULL CHECK (reason IN ('CHECK_IN', 'CHECK_OUT', 'ROOM_CHANGE', 'SWAP')),
    allocation_id BIGINT REFERENCES asg_allocation (id),
    recorded_by   BIGINT REFERENCES auth_user (id),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX ix_meter_cut_room ON bil_meter_cut (room_id, cut_date);
