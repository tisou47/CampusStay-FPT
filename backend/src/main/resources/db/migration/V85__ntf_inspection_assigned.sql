-- =====================================================================
-- CampusStay FPT — V85: notify Staff when an inspection run is assigned
-- =====================================================================

INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('INSPECTION_ASSIGNED', 'An inspection run is assigned to a Staff member', TRUE,
     'Inspection assigned · {{schedule}}',
     'Được giao đợt kiểm tra · {{schedule}}',
     'You are assigned to inspection {{run}} ({{schedule}}), due {{dueAt}}.',
     'Bạn được giao thực hiện đợt kiểm tra {{run}} ({{schedule}}), hạn chót {{dueAt}}.',
     '{schedule,run,dueAt}')
ON CONFLICT (key) DO NOTHING;
