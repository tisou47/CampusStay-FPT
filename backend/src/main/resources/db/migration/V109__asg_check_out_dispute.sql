-- =====================================================================
-- CampusStay FPT — V109: a student who does not agree with the furniture
-- charges of their check-out says which items and why; the Staff member
-- who recorded them checks again, changes the charges or keeps them, and
-- answers; the student then agrees. One open disagreement at a time.
-- =====================================================================

CREATE TABLE asg_check_out_dispute (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    allocation_id BIGINT       NOT NULL REFERENCES asg_allocation (id) ON DELETE CASCADE,
    reason        VARCHAR(500) NOT NULL,
    status        VARCHAR(10)  NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ANSWERED')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    answer        VARCHAR(500),
    answered_at   TIMESTAMPTZ,
    answered_by   BIGINT       REFERENCES auth_user (id)
);
CREATE UNIQUE INDEX ux_check_out_dispute_open ON asg_check_out_dispute (allocation_id) WHERE status = 'OPEN';

CREATE TABLE asg_check_out_dispute_item (
    dispute_id        BIGINT NOT NULL REFERENCES asg_check_out_dispute (id) ON DELETE CASCADE,
    furniture_item_id BIGINT NOT NULL REFERENCES inv_furniture_item (id),
    PRIMARY KEY (dispute_id, furniture_item_id)
);

INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('CHECK_OUT_DISPUTED', 'A student does not agree with the furniture charges of their check-out', TRUE,
     'Charges disputed · Room {{room}}',
     'Sinh viên không đồng ý khoản đền · Phòng {{room}}',
     '{{student}} does not agree with the furniture charges: {{reason}} Check the Room again, change the charges or keep them, and answer.',
     '{{student}} không đồng ý khoản đền nội thất: {{reason}} Hãy kiểm tra lại phòng, sửa hoặc giữ khoản đền rồi trả lời.',
     '{student,room,reason}'),
  ('CHECK_OUT_DISPUTE_ANSWERED', 'Staff answered a student who disagreed with the furniture charges', TRUE,
     'Charges checked again · Room {{room}}',
     'Nhân viên đã xem lại khoản đền · Phòng {{room}}',
     'Staff checked the furniture again ({{amount}}): {{answer}} Open Check-out to read the charges and agree.',
     'Nhân viên đã kiểm tra lại nội thất ({{amount}}): {{answer}} Mở Trả phòng để xem khoản đền và đồng ý.',
     '{room,amount,answer}')
ON CONFLICT (key) DO NOTHING;
