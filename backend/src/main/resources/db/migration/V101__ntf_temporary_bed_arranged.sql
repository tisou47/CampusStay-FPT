-- The escalation action "Temporary Bed arranged" tells the student and the request's owner (review finding BE-OPS-02).
INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('TEMPORARY_BED_ARRANGED', 'A Manager arranged a temporary Bed for an overdue Room-Change Request', TRUE,
     'Temporary Bed arranged · {{code}}', 'Đã sắp xếp giường tạm · {{code}}',
     'While your request {{code}} is decided: {{note}}',
     'Trong lúc yêu cầu {{code}} của bạn đang được xem xét: {{note}}',
     '{code,note}')
ON CONFLICT (key) DO NOTHING;
