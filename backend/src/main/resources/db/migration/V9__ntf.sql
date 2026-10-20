-- =====================================================================
-- CampusStay FPT — V9: NTF (in-app notifications, device tokens, push and
-- email templates, email outbox and campaigns)
-- =====================================================================

CREATE TABLE ntf_notification (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT       NOT NULL REFERENCES auth_user (id) ON DELETE CASCADE,
    event_key  VARCHAR(60)  NOT NULL,
    title      VARCHAR(200) NOT NULL,
    body       VARCHAR(1000) NOT NULL,
    link       VARCHAR(300),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    read_at    TIMESTAMPTZ
);
CREATE INDEX ix_ntf_user_created ON ntf_notification (user_id, created_at DESC);
CREATE INDEX ix_ntf_user_unread  ON ntf_notification (user_id) WHERE read_at IS NULL;

-- FCM registration tokens (Android app). A token belongs to one user.
CREATE TABLE ntf_device (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT       NOT NULL REFERENCES auth_user (id) ON DELETE CASCADE,
    token        VARCHAR(4096) NOT NULL,
    token_hash   CHAR(64)     NOT NULL UNIQUE,
    platform     VARCHAR(8)   NOT NULL CHECK (platform IN ('ANDROID', 'WEB')),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    disabled_at  TIMESTAMPTZ                                  -- set when FCM reports the token invalid
);
CREATE INDEX ix_ntf_device_user ON ntf_device (user_id) WHERE disabled_at IS NULL;

-- Push / in-app templates per event (EN + VI titles). {{variable}} placeholders.
CREATE TABLE ntf_template (
    key        VARCHAR(60)   PRIMARY KEY,                      -- e.g. APPLICATION_APPROVED
    event      VARCHAR(150)  NOT NULL,                         -- human description of the trigger
    push       BOOLEAN       NOT NULL DEFAULT TRUE,
    in_app     BOOLEAN       NOT NULL DEFAULT TRUE,
    title_en   VARCHAR(200)  NOT NULL,
    title_vi   VARCHAR(200)  NOT NULL,
    body       VARCHAR(1000) NOT NULL,
    variables  TEXT[]        NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_by BIGINT REFERENCES auth_user (id)
);

CREATE TABLE ntf_email_template (
    key        VARCHAR(60)  PRIMARY KEY,                       -- e.g. PASSWORD_RESET, CHECK_IN_REMINDER
    name       VARCHAR(150) NOT NULL,
    subject    VARCHAR(200) NOT NULL,
    body_html  TEXT         NOT NULL,
    transactional BOOLEAN   NOT NULL DEFAULT FALSE,            -- TRUE = system mail, not offered for campaigns
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE ntf_email_campaign (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mode            VARCHAR(10)  NOT NULL CHECK (mode IN ('ONE', 'GROUP')),
    term_id         BIGINT       REFERENCES cfg_term (id),
    recipient_group VARCHAR(40),
    building_id     BIGINT       REFERENCES inv_building (id),
    gender          CHAR(1)      CHECK (gender IN ('M', 'F')),
    student_id      BIGINT       REFERENCES auth_user (id),
    template_key    VARCHAR(60)  NOT NULL REFERENCES ntf_email_template (key),
    subject         VARCHAR(200) NOT NULL,
    channel         VARCHAR(12)  NOT NULL CHECK (channel IN ('EMAIL', 'EMAIL_PUSH')),
    send_at         TIMESTAMPTZ  NOT NULL,
    status          VARCHAR(10)  NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SENDING', 'SENT', 'FAILED')),
    queued_count    INT          NOT NULL DEFAULT 0,
    sent_count      INT          NOT NULL DEFAULT 0,
    created_by      BIGINT       NOT NULL REFERENCES auth_user (id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_campaign_one CHECK (mode <> 'ONE' OR student_id IS NOT NULL)
);

-- Reliable email: every email (transactional or campaign) goes through this
-- outbox; a scheduler sends due rows and retries failures with back-off.
CREATE TABLE ntf_email_outbox (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    campaign_id BIGINT       REFERENCES ntf_email_campaign (id),
    to_email    VARCHAR(254) NOT NULL,
    subject     VARCHAR(200) NOT NULL,
    body_html   TEXT         NOT NULL,
    status      VARCHAR(8)   NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
    attempts    SMALLINT     NOT NULL DEFAULT 0,
    last_error  VARCHAR(1000),
    not_before  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    sent_at     TIMESTAMPTZ
);
CREATE INDEX ix_email_outbox_due ON ntf_email_outbox (not_before) WHERE status = 'PENDING';
