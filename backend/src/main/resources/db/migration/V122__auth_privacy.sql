-- Personal data under Decree 13/2023/ND-CP (W3-D3): the privacy notice a student accepted, and their erasure requests.
CREATE TABLE auth_consent (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES auth_user (id) ON DELETE CASCADE,
    version     VARCHAR(20) NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ux_auth_consent UNIQUE (user_id, version)
);

CREATE TABLE auth_erasure_request (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id   BIGINT       NOT NULL REFERENCES auth_user (id) ON DELETE CASCADE,
    reason       VARCHAR(500),
    status       VARCHAR(10)  NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'REJECTED', 'COMPLETED')),
    requested_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    decided_at   TIMESTAMPTZ,
    decided_by   BIGINT REFERENCES auth_user (id),
    note         VARCHAR(500),
    CONSTRAINT ck_erasure_note CHECK (status <> 'REJECTED' OR note IS NOT NULL)
);
-- one waiting request per student
CREATE UNIQUE INDEX ux_auth_erasure_pending ON auth_erasure_request (student_id) WHERE status = 'PENDING';
CREATE INDEX ix_auth_erasure_status ON auth_erasure_request (status, requested_at);

INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, sort_order) VALUES
  ('privacy.notice_version', 'Privacy', 'Privacy notice version', 'TEXT', '2026-11',
     'Students accept this version at verification; a new version asks them again', 1),
  ('privacy.bank_account_retention_days', 'Privacy', 'Keep refund bank accounts for (days)', 'INT', '90',
     'After the last refund was paid, with no refund open, the bank account is cleared', 2)
ON CONFLICT (key) DO NOTHING;
