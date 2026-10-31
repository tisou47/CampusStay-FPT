-- =====================================================================
-- Demo data — Settings (CFG): Term N (in stay) and N+1 with their prices
-- (N+1 5 % higher), Blocks, a finished registration-period request for
-- N+1 and one awaiting the Admin for the Term after it.
-- =====================================================================

INSERT INTO cfg_term (code, name, status, stay_start, stay_end, registration_opens_at, registration_closes_at,
                      results_published_at, roommate_hours, deposit_hours, balance_due_at, check_in_start, check_in_end,
                      check_out_by, published_at, reserved_new_percent, deposit_percent, utility_deposit,
                      matching_snapshot_id, eligibility_keys, priority_group_keys, house_rules, wizard_step, created_at,
                      updated_at)
SELECT t.n_code, t.n_name, 'PUBLISHED', t.n_start, t.n_end, t.n_reg_open, t.n_reg_close, t.n_results, 48,
       f.deposit_hours, t.n_balance_due, t.n_start - 3, t.n_start + 4, t.n_end + 1, t.n_reg_open - interval '7 days',
       0, f.deposit_percent, coalesce((SELECT estimate_monthly * months_held FROM cfg_utility_policy LIMIT 1), 600000),
       (SELECT max(id) FROM cfg_matching_snapshot),
       (SELECT jsonb_agg(key ORDER BY sort_order) FROM cfg_eligibility_criterion WHERE enabled),
       (SELECT jsonb_agg(key ORDER BY sort_order) FROM cfg_priority_group WHERE applied),
       'Keep quiet after 23:00. No cooking in the Rooms. Visitors leave the Block by 22:00.', 7,
       t.n_reg_open - interval '10 days', t.n_reg_open - interval '7 days'
FROM demo_t t CROSS JOIN (SELECT deposit_percent, deposit_hours FROM cfg_fee_policy ORDER BY id LIMIT 1) f;

INSERT INTO cfg_term (code, name, status, stay_start, stay_end, registration_opens_at, registration_closes_at,
                      results_published_at, roommate_hours, deposit_hours, balance_due_at, check_in_start, check_in_end,
                      check_out_by, published_at, publish_at, requests_open_at, requests_close_at, decisions_due_at,
                      reconciliation_due_at, fees_issue_at, fees_due_at, reserved_new_percent, deposit_percent,
                      utility_deposit, matching_snapshot_id, eligibility_keys, priority_group_keys, house_rules,
                      wizard_step, created_at, updated_at)
SELECT t.x_code, t.x_name, 'PUBLISHED', t.x_start, t.x_end, t.x_reg_open, t.x_reg_close, t.x_results, 48,
       f.deposit_hours, t.x_balance_due, t.x_start - 3, t.x_start + 4, t.x_end + 1, t.x_m1, t.x_m1, t.x_m2, t.x_m3,
       t.x_m4, t.x_m5, t.x_m6, t.x_m7, 10, f.deposit_percent,
       coalesce((SELECT estimate_monthly * months_held FROM cfg_utility_policy LIMIT 1), 600000),
       (SELECT max(id) FROM cfg_matching_snapshot),
       (SELECT jsonb_agg(key ORDER BY sort_order) FROM cfg_eligibility_criterion WHERE enabled),
       (SELECT jsonb_agg(key ORDER BY sort_order) FROM cfg_priority_group WHERE applied),
       'Keep quiet after 23:00. No cooking in the Rooms. Visitors leave the Block by 22:00.', 7,
       t.x_m1 - interval '12 days', t.x_m1
FROM demo_t t CROSS JOIN (SELECT deposit_percent, deposit_hours FROM cfg_fee_policy ORDER BY id LIMIT 1) f;

UPDATE demo_t SET n_id = (SELECT id FROM cfg_term WHERE code = demo_t.n_code),
                  x_id = (SELECT id FROM cfg_term WHERE code = demo_t.x_code);

INSERT INTO cfg_term_price (term_id, room_type_id, room_class_id, price)
SELECT t.n_id, rt.id, rc.id, round(rt.base_price * (1 + rc.surcharge_rate) / 1000) * 1000
FROM demo_t t CROSS JOIN cfg_room_type rt CROSS JOIN cfg_room_class rc;

INSERT INTO cfg_term_price (term_id, room_type_id, room_class_id, price)
SELECT t.x_id, rt.id, rc.id, round(rt.base_price * (1 + rc.surcharge_rate) * 1.05 / 1000) * 1000
FROM demo_t t CROSS JOIN cfg_room_type rt CROSS JOIN cfg_room_class rc;

INSERT INTO cfg_term_block (term_id, building_id)
SELECT t.n_id, b.id FROM demo_t t CROSS JOIN inv_building b
UNION ALL
SELECT t.x_id, b.id FROM demo_t t CROSS JOIN inv_building b;

-- The request manager01 filed for N+1, built into the Term by the Admin (Done) …
INSERT INTO cfg_term_request (code, term_name, stay_start, stay_end, proposal, notes, status, requested_by, term_id,
                              created_at, updated_at)
SELECT 'RP-DEMO-1', t.x_name, t.x_start, t.x_end,
       jsonb_build_object('blocks', '[]'::jsonb, 'excludedRooms', '[]'::jsonb,
           'places', (SELECT jsonb_agg(jsonb_build_object('gender', g.gender, 'places', 160,
                                                         'roomTypeId', rt.id::text, 'roomClassId', rc.id::text))
                      FROM (VALUES ('M'), ('F')) g (gender) CROSS JOIN cfg_room_type rt CROSS JOIN cfg_room_class rc
                      WHERE rt.name = '4-bed' AND rc.name = 'Standard'),
           'prices', (SELECT jsonb_agg(jsonb_build_object('price', p.price, 'roomTypeId', p.room_type_id::text,
                                                         'roomClassId', p.room_class_id::text))
                      FROM cfg_term_price p WHERE p.term_id = t.x_id),
           'timeline', jsonb_build_object('registrationOpensAt', t.x_reg_open, 'registrationClosesAt', t.x_reg_close,
                                          'resultsPublishedAt', t.x_results, 'balanceDueAt', t.x_balance_due,
                                          'checkInStart', t.x_start - 3, 'checkInEnd', t.x_start + 4,
                                          'checkOutBy', t.x_end + 1, 'depositHours', 48, 'roommateHours', 48,
                                          'publishAt', t.x_m1, 'requestsOpenAt', t.x_m2, 'requestsCloseAt', t.x_m3,
                                          'decisionsDueAt', t.x_m4, 'reconciliationDueAt', t.x_m5,
                                          'feesIssueAt', t.x_m6, 'feesDueAt', t.x_m7)),
       'Prices 5 % higher than this Term (new air conditioners in Blocks A and E).', 'DONE',
       (SELECT id FROM demo_staff WHERE account = 'manager01'), t.x_id, t.x_m1 - interval '30 days', t.x_m1
FROM demo_t t;

-- … and the one manager02 filed for the Term after it, waiting for the Admin.
INSERT INTO cfg_term_request (code, term_name, stay_start, stay_end, proposal, notes, status, requested_by, created_at,
                              updated_at)
SELECT 'RP-DEMO-2', t.f_name, t.f_start, t.f_end,
       jsonb_build_object('blocks', '[]'::jsonb, 'excludedRooms', jsonb_build_array('A-509'), 'places', '[]'::jsonb,
           'prices', (SELECT jsonb_agg(jsonb_build_object('price', p.price, 'roomTypeId', p.room_type_id::text,
                                                         'roomClassId', p.room_class_id::text))
                      FROM cfg_term_price p WHERE p.term_id = t.x_id),
           'timeline', jsonb_build_object('registrationOpensAt', NULL, 'registrationClosesAt', NULL,
                                          'resultsPublishedAt', NULL, 'balanceDueAt', NULL, 'checkInStart', NULL,
                                          'checkInEnd', NULL, 'checkOutBy', NULL, 'depositHours', 48,
                                          'roommateHours', 48, 'publishAt', NULL, 'requestsOpenAt', NULL,
                                          'requestsCloseAt', NULL, 'decisionsDueAt', NULL, 'reconciliationDueAt', NULL,
                                          'feesIssueAt', NULL, 'feesDueAt', NULL)),
       'Same prices as next Term; Room A-509 stays closed for its renovation.', 'SUBMITTED',
       (SELECT id FROM demo_staff WHERE account = 'manager02'), t.now - interval '2 days', t.now - interval '2 days'
FROM demo_t t;

UPDATE cfg_term_request SET code = 'RP-' || id WHERE code LIKE 'RP-DEMO-%';

INSERT INTO cfg_term_request_event (request_id, kind, actor_id, note, at)
SELECT r.id, e.kind, (SELECT id FROM demo_staff WHERE account = e.actor), e.note, r.created_at + e.wait
FROM cfg_term_request r CROSS JOIN demo_t t
JOIN (VALUES ('SUBMITTED', 'manager01', NULL, interval '0 days'),
             ('IN_PROGRESS', 'admin01', 'Building the Term from this request.', interval '3 days'),
             ('BUILT', 'admin01', NULL, interval '20 days'),
             ('DONE', 'admin01', NULL, interval '30 days')) e (kind, actor, note, wait) ON TRUE
WHERE r.term_id = t.x_id;

INSERT INTO cfg_term_request_event (request_id, kind, actor_id, at)
SELECT r.id, 'SUBMITTED', r.requested_by, r.created_at FROM cfg_term_request r WHERE r.status = 'SUBMITTED';
