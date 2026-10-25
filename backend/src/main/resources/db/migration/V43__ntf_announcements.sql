-- =====================================================================
-- CampusStay FPT — V43: announcements and the registration-period
-- notifications (Change Specification v2 phase 4, ADR-20, spec §6.5, §10).
-- An announcement is stored once, with a read state per user (no copy per
-- student); the bell shows it next to the personal notifications.
-- =====================================================================

CREATE TABLE ntf_announcement (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category    VARCHAR(12)   NOT NULL CHECK (category IN ('REGISTRATION', 'FINANCE', 'RULES', 'OPERATIONS')),
    audience    VARCHAR(16)   NOT NULL
                CHECK (audience IN ('ALL_STUDENTS', 'RESIDENTS', 'BLOCK_RESIDENTS', 'TERM_APPLICANTS')),
    term_id     BIGINT        REFERENCES cfg_term (id) ON DELETE CASCADE,  -- applicants of this Term; the Term it is about
    -- System announcements carry both languages; a typed one keeps its text as typed in both (spec D-01).
    title       VARCHAR(200)  NOT NULL,
    title_vi    VARCHAR(200)  NOT NULL,
    body        VARCHAR(4000) NOT NULL,
    body_vi     VARCHAR(4000) NOT NULL,
    -- A change announcement's old → new values, shown as a table: [{field, type, before, after}].
    changes     JSONB,
    link        VARCHAR(300),
    pinned      BOOLEAN       NOT NULL DEFAULT FALSE,
    shown_from  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    shown_until TIMESTAMPTZ,
    source      VARCHAR(14)   NOT NULL
                CHECK (source IN ('TERM_PUBLISHED', 'TERM_CHANGED', 'POLICY_CHANGED', 'BLOCK_SETTINGS', 'MANUAL')),
    created_by  BIGINT        REFERENCES auth_user (id),
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT ck_announcement_term CHECK (audience <> 'TERM_APPLICANTS' OR term_id IS NOT NULL),
    CONSTRAINT ck_announcement_window CHECK (shown_until IS NULL OR shown_until > shown_from)
);
CREATE INDEX ix_announcement_shown ON ntf_announcement (shown_from DESC, id DESC);

-- Blocks of an announcement to the residents of some Blocks.
CREATE TABLE ntf_announcement_block (
    announcement_id BIGINT NOT NULL REFERENCES ntf_announcement (id) ON DELETE CASCADE,
    building_id     BIGINT NOT NULL REFERENCES inv_building (id),
    PRIMARY KEY (announcement_id, building_id)
);

CREATE TABLE ntf_announcement_read (
    announcement_id BIGINT      NOT NULL REFERENCES ntf_announcement (id) ON DELETE CASCADE,
    user_id         BIGINT      NOT NULL REFERENCES auth_user (id),
    read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (announcement_id, user_id)
);

-- Registration-period requests and publishing (spec §10): in-app only, for Admins and Managers.
INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('TERM_REQUEST_SUBMITTED', 'A Manager requested a registration period', FALSE,
     'Registration period requested · {{term}}', 'Đề nghị mở đợt đăng ký · {{term}}',
     '{{name}} asks to open {{term}} ({{dates}}). Open request {{code}} to read it, comment or build the Term.',
     '{{name}} đề nghị mở {{term}} ({{dates}}). Mở đề nghị {{code}} để xem, bình luận hoặc dựng kỳ.',
     '{name,term,dates,code}'),
  ('TERM_REQUEST_COMMENTED', 'Someone commented on a registration-period request', FALSE,
     'New comment · {{term}}', 'Bình luận mới · {{term}}',
     '{{name}} on {{code}}: {{comment}}',
     '{{name}} về {{code}}: {{comment}}',
     '{name,term,code,comment}'),
  ('TERM_REQUEST_IN_PROGRESS', 'The Admin started building the Term of a request', FALSE,
     'Being built · {{term}}', 'Đang dựng kỳ · {{term}}',
     '{{name}} started building {{term}} from your request {{code}}. You will see every value that changes.',
     '{{name}} đã bắt đầu dựng {{term}} từ đề nghị {{code}} của bạn. Bạn sẽ thấy mọi giá trị được thay đổi.',
     '{name,term,code}'),
  ('TERM_REQUEST_NEEDS_CHANGES', 'The Admin sent a registration-period request back for changes', FALSE,
     'Changes needed · {{term}}', 'Cần chỉnh sửa · {{term}}',
     '{{name}} asks for changes to {{code}}: {{note}}',
     '{{name}} đề nghị chỉnh sửa {{code}}: {{note}}',
     '{name,term,code,note}'),
  ('TERM_REQUEST_REJECTED', 'The Admin rejected a registration-period request', FALSE,
     'Request rejected · {{term}}', 'Đề nghị bị từ chối · {{term}}',
     '{{name}} rejected {{code}}: {{note}}',
     '{{name}} đã từ chối {{code}}: {{note}}',
     '{name,term,code,note}'),
  ('TERM_PUBLISHED', 'A Term was published', FALSE,
     '{{term}} is published', 'Đã công bố {{term}}',
     '{{term}} is published: registration opens on {{opensAt}}. Open the Term dashboard to follow it.',
     'Đã công bố {{term}}: đăng ký mở lúc {{opensAt}}. Mở bảng theo dõi kỳ để theo dõi.',
     '{term,opensAt}')
ON CONFLICT (key) DO NOTHING;
