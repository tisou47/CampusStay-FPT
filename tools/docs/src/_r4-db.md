**Accounts (AUTH): 18 tables**

*Table* `auth_action_token` (7 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| token_hash | character(64) | no |  |  |
| user_id | bigint | no |  | FK → auth_user |
| purpose | character varying(16) | no |  |  |
| expires_at | timestamp with time zone | no |  |  |
| used_at | timestamp with time zone | yes |  |  |
| created_at | timestamp with time zone | no | now() |  |

*Constraints of auth_action_token:* auth_action_token_purpose_check (CHECK): CHECK (((purpose)::text = ANY ((ARRAY['INVITE'::character varying, 'PASSWORD_RESET'::character varying])::text[]))) · auth_action_token_token_hash_key (UNIQUE): UNIQUE (token_hash)

*Table* `auth_reconciliation` (7 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| term_id | bigint | no |  | FK → cfg_term |
| kind | character varying(8) | no |  |  |
| file_name | character varying(200) | no |  |  |
| rows_read | integer | no |  |  |
| created_by | bigint | no |  | FK → auth_user |
| created_at | timestamp with time zone | no |  |  |

*Constraints of auth_reconciliation:* auth_reconciliation_kind_check (CHECK): CHECK (((kind)::text = ANY ((ARRAY['ENROLLED'::character varying, 'LEAVERS'::character varying])::text[]))) · auth_reconciliation_rows_read_check (CHECK): CHECK ((rows_read >= 0))

*Table* `auth_reconciliation_item` (15 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| reconciliation_id | bigint | no |  | FK → auth_reconciliation |
| grp | smallint | no |  |  |
| student_id | bigint | yes |  | FK → auth_user |
| student_code | character varying(20) | no |  |  |
| student_name | character varying(150) | yes |  |  |
| roles | character varying(60) | yes |  |  |
| file_status | character varying(12) | yes |  |  |
| directory_status | character varying(12) | yes |  |  |
| line_no | integer | yes |  |  |
| status | character varying(8) | no |  |  |
| outcome | character varying(12) | yes |  |  |
| note | character varying(500) | yes |  |  |
| resolved_by | bigint | yes |  | FK → auth_user |
| resolved_at | timestamp with time zone | yes |  |  |

*Constraints of auth_reconciliation_item:* auth_reconciliation_item_grp_check (CHECK): CHECK (((grp >= 1) AND (grp <= 4))) · auth_reconciliation_item_outcome_check (CHECK): CHECK (((outcome)::text = ANY ((ARRAY['NOT_ENROLLED'::character varying, 'ENROLLED'::character varying, 'SUPERSEDED'::character varying])::t… · auth_reconciliation_item_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'RESOLVED'::character varying, 'INFO'::character varying])::text[]))) · ck_reconciliation_open (CHECK): CHECK ((((status)::text = 'OPEN'::text) = ((grp = ANY (ARRAY[1, 2])) AND (resolved_at IS NULL)))) · ck_reconciliation_resolved (CHECK): CHECK ((((status)::text <> 'RESOLVED'::text) OR ((outcome IS NOT NULL) AND (note IS NOT NULL) AND (resolved_by IS NOT NULL))))

*Table* `auth_schedule_send` (4 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| week_start | date | no |  | PK |
| building_id | bigint | no |  | PK |
| sent_at | timestamp with time zone | no |  |  |
| sent_by | bigint | no |  | FK → auth_user |

*Table* `auth_schedule_week` (2 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| week_start | date | no |  | PK |
| reminded_at | timestamp with time zone | yes |  |  |

*Table* `auth_session` (11 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| token_hash | character(64) | no |  |  |
| user_id | bigint | no |  | FK → auth_user |
| remember | boolean | no | false |  |
| sign_in_method | character varying(10) | no |  |  |
| created_at | timestamp with time zone | no | now() |  |
| last_used_at | timestamp with time zone | no | now() |  |
| expires_at | timestamp with time zone | no |  |  |
| revoked_at | timestamp with time zone | yes |  |  |
| user_agent | character varying(300) | yes |  |  |
| ip_address | character varying(45) | yes |  |  |

*Constraints of auth_session:* auth_session_sign_in_method_check (CHECK): CHECK (((sign_in_method)::text = ANY ((ARRAY['PASSWORD'::character varying, 'GOOGLE'::character varying])::text[]))) · auth_session_token_hash_key (UNIQUE): UNIQUE (token_hash)

*Table* `auth_staff_account_request` (10 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| building_id | bigint | no |  | FK → inv_building |
| requested_by | bigint | no |  | FK → auth_user |
| name | character varying(150) | no |  |  |
| email | character varying(254) | no |  |  |
| role | character varying(10) | no |  |  |
| status | character varying(10) | no | 'PENDING'::character varying |  |
| created_at | timestamp with time zone | no | now() |  |
| decided_by | bigint | yes |  | FK → auth_user |
| decided_at | timestamp with time zone | yes |  |  |

*Constraints of auth_staff_account_request:* auth_staff_account_request_role_check (CHECK): CHECK (((role)::text = ANY ((ARRAY['STAFF'::character varying, 'MANAGER'::character varying])::text[]))) · auth_staff_account_request_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying])::text[])))

*Table* `auth_staff_activity` (11 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no | nextval('auth_staff_activity_id_seq'::re | PK |
| user_id | bigint | no |  | FK → auth_user |
| at | timestamp with time zone | no |  |  |
| method | character varying(10) | no |  |  |
| pattern | character varying(200) | no |  |  |
| object_id | character varying(100) | yes |  |  |
| handle | character varying(40) | yes |  |  |
| in_shift | boolean | no |  |  |
| role_match | boolean | no |  |  |
| acknowledged | boolean | no | false |  |
| status | smallint | no |  |  |

*Table* `auth_staff_profile` (3 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| user_id | bigint | no |  | PK, FK → auth_user |
| handles | ARRAY | no | '{}'::text[] |  |
| on_duty | boolean | no | false |  |

*Table* `auth_staff_shift` (5 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no | nextval('auth_staff_shift_id_seq'::regcl | PK |
| user_id | bigint | no |  | FK → auth_user |
| weekday | smallint | no |  |  |
| start_time | time without time zone | no |  |  |
| end_time | time without time zone | no |  |  |

*Constraints of auth_staff_shift:* auth_staff_shift_check (CHECK): CHECK ((start_time <> end_time)) · auth_staff_shift_user_id_weekday_start_time_key (UNIQUE): UNIQUE (user_id, weekday, start_time) · auth_staff_shift_weekday_check (CHECK): CHECK (((weekday >= 1) AND (weekday <= 7)))

*Table* `auth_staff_week` (4 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| user_id | bigint | no |  | PK, FK → auth_user |
| week_start | date | no |  | PK |
| updated_at | timestamp with time zone | no |  |  |
| updated_by | bigint | no |  | FK → auth_user |

*Constraints of auth_staff_week:* auth_staff_week_week_start_check (CHECK): CHECK ((EXTRACT(isodow FROM week_start) = (1)::numeric))

*Table* `auth_staff_week_shift` (6 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no | nextval('auth_staff_week_shift_id_seq':: | PK |
| user_id | bigint | no |  | FK → auth_staff_week |
| week_start | date | no |  | FK → auth_staff_week |
| weekday | smallint | no |  |  |
| start_time | time without time zone | no |  |  |
| end_time | time without time zone | no |  |  |

*Constraints of auth_staff_week_shift:* auth_staff_week_shift_check (CHECK): CHECK ((start_time <> end_time)) · auth_staff_week_shift_user_id_week_start_weekday_start_time_key (UNIQUE): UNIQUE (user_id, week_start, weekday, start_time) · auth_staff_week_shift_weekday_check (CHECK): CHECK (((weekday >= 1) AND (weekday <= 7)))

*Table* `auth_student` (28 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| user_id | bigint | no |  | PK, FK → auth_user |
| student_code | character varying(20) | no |  |  |
| gender | character(1) | no |  |  |
| date_of_birth | date | yes |  |  |
| major | character varying(100) | no |  |  |
| cohort | character varying(10) | no |  |  |
| semester_no | smallint | yes |  |  |
| hometown | character varying(100) | yes |  |  |
| region | character varying(50) | yes |  |  |
| enrollment_status | character varying(12) | no | 'ENROLLED'::character varying |  |
| priority_groups | ARRAY | no | '{}'::text[] |  |
| phone | character varying(20) | yes |  |  |
| emergency_name | character varying(150) | yes |  |  |
| emergency_relationship | character varying(50) | yes |  |  |
| emergency_phone | character varying(20) | yes |  |  |
| synced_at | timestamp with time zone | no | now() |  |
| verification | character varying(10) | no | 'VERIFIED'::character varying |  |
| verification_note | character varying(500) | yes |  |  |
| verified_at | timestamp with time zone | yes |  |  |
| verified_by | bigint | yes |  | FK → auth_user |
| source | character varying(10) | no | 'DIRECTORY'::character varying |  |
| refund_account_holder | character varying(100) | yes |  |  |
| refund_account_number | character varying(30) | yes |  |  |
| refund_bank | character varying(100) | yes |  |  |
| refund_account_at | timestamp with time zone | yes |  |  |
| refund_bank_bin | character varying(8) | yes |  |  |
| refund_account_accepted_at | timestamp with time zone | yes |  |  |
| personal_email | character varying(254) | yes |  |  |

*Constraints of auth_student:* auth_student_gender_check (CHECK): CHECK ((gender = ANY (ARRAY['M'::bpchar, 'F'::bpchar]))) · auth_student_semester_no_check (CHECK): CHECK (((semester_no >= 0) AND (semester_no <= 12))) · auth_student_student_code_key (UNIQUE): UNIQUE (student_code) · ck_student_enrollment (CHECK): CHECK (((enrollment_status)::text = ANY ((ARRAY['ENROLLED'::character varying, 'SUSPENDED'::character varying, 'GRADUATED'::character varyin… · ck_student_source (CHECK): CHECK (((source)::text = ANY ((ARRAY['DIRECTORY'::character varying, 'IMPORT'::character varying, 'SIGN_UP'::character varying])::text[]))) · ck_student_verification (CHECK): CHECK (((verification)::text = ANY ((ARRAY['VERIFIED'::character varying, 'PENDING'::character varying, 'REJECTED'::character varying])::tex…

*Table* `auth_student_emergency_contact` (8 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| student_id | bigint | no |  | FK → auth_student |
| name | character varying(150) | no |  |  |
| relationship | character varying(50) | no |  |  |
| phone | character varying(20) | no |  |  |
| position | smallint | no |  |  |
| created_at | timestamp with time zone | no | now() |  |
| updated_at | timestamp with time zone | no | now() |  |

*Table* `auth_student_import` (15 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| file_name | character varying(255) | no |  |  |
| uploaded_by | bigint | no |  | FK → auth_user |
| uploaded_at | timestamp with time zone | no | now() |  |
| status | character varying(10) | no | 'PREVIEW'::character varying |  |
| fields | ARRAY | no |  |  |
| mark_missing | boolean | yes |  |  |
| applied_by | bigint | yes |  | FK → auth_user |
| applied_at | timestamp with time zone | yes |  |  |
| created_count | integer | yes |  |  |
| updated_count | integer | yes |  |  |
| unchanged_count | integer | yes |  |  |
| error_count | integer | yes |  |  |
| verified_count | integer | yes |  |  |
| marked_count | integer | yes |  |  |

*Constraints of auth_student_import:* auth_student_import_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['PREVIEW'::character varying, 'APPLIED'::character varying])::text[])))

*Table* `auth_student_import_row` (8 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| import_id | bigint | no |  | FK → auth_student_import |
| line_no | integer | no |  |  |
| student_code | character varying(20) | yes |  |  |
| data | jsonb | no |  |  |
| outcome | character varying(10) | no |  |  |
| message | character varying(500) | yes |  |  |
| user_id | bigint | yes |  | FK → auth_user |

*Constraints of auth_student_import_row:* auth_student_import_row_import_id_line_no_key (UNIQUE): UNIQUE (import_id, line_no) · auth_student_import_row_outcome_check (CHECK): CHECK (((outcome)::text = ANY ((ARRAY['NEW'::character varying, 'UPDATE'::character varying, 'UNCHANGED'::character varying, 'ERROR'::charac…

*Table* `auth_user` (16 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| email | character varying(254) | no |  |  |
| display_name | character varying(150) | no |  |  |
| password_hash | character varying(100) | yes |  |  |
| google_sub | character varying(64) | yes |  |  |
| role | character varying(10) | no |  |  |
| title | character varying(100) | yes |  |  |
| status | character varying(10) | no | 'ACTIVE'::character varying |  |
| failed_attempts | integer | no | 0 |  |
| locked_until | timestamp with time zone | yes |  |  |
| last_sign_in_at | timestamp with time zone | yes |  |  |
| created_at | timestamp with time zone | no | now() |  |
| updated_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |
| locale | character varying(2) | no | 'vi'::character varying |  |
| demo | boolean | no | false |  |

*Constraints of auth_user:* auth_user_failed_attempts_check (CHECK): CHECK ((failed_attempts >= 0)) · auth_user_google_sub_key (UNIQUE): UNIQUE (google_sub) · auth_user_role_check (CHECK): CHECK (((role)::text = ANY ((ARRAY['STUDENT'::character varying, 'STAFF'::character varying, 'MANAGER'::character varying, 'ADMIN'::characte… · auth_user_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['INVITED'::character varying, 'ACTIVE'::character varying, 'DISABLED'::character varying])::text[]))) · ck_user_locale (CHECK): CHECK (((locale)::text = ANY ((ARRAY['vi'::character varying, 'en'::character varying])::text[])))

*Table* `auth_user_block` (2 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| user_id | bigint | no |  | PK, FK → auth_user |
| building_id | bigint | no |  | PK, FK → inv_building |

**Configuration (CFG): 19 tables**

*Table* `cfg_block_settings` (10 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| building_id | bigint | no |  | PK, FK → inv_building |
| desk_opens | time without time zone | no |  |  |
| desk_closes | time without time zone | no |  |  |
| visit_from | time without time zone | no |  |  |
| visit_until | time without time zone | no |  |  |
| quiet_from | time without time zone | no |  |  |
| house_rules | text | no | ''::text |  |
| edited_at | timestamp with time zone | no | now() |  |
| edited_by | bigint | yes |  | FK → auth_user |
| version | bigint | no | 0 |  |

*Constraints of cfg_block_settings:* ck_block_desk (CHECK): CHECK ((desk_opens < desk_closes)) · ck_block_visit (CHECK): CHECK ((visit_from < visit_until))

*Table* `cfg_eligibility_criterion` (5 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| key | character varying(40) | no |  | PK |
| title | character varying(150) | no |  |  |
| note | character varying(300) | yes |  |  |
| enabled | boolean | no | true |  |
| sort_order | smallint | no | 0 |  |

*Table* `cfg_fee_policy` (8 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | smallint | no | 1 | PK |
| deposit_percent | numeric | no |  |  |
| deposit_hours | integer | no |  |  |
| balance_days | integer | no |  |  |
| policy_confirmed | boolean | no | false |  |
| updated_at | timestamp with time zone | no | now() |  |
| updated_by | bigint | yes |  | FK → auth_user |
| version | bigint | no | 0 |  |

*Constraints of cfg_fee_policy:* cfg_fee_policy_balance_days_check (CHECK): CHECK ((balance_days > 0)) · cfg_fee_policy_deposit_hours_check (CHECK): CHECK ((deposit_hours > 0)) · cfg_fee_policy_deposit_percent_check (CHECK): CHECK (((deposit_percent > (0)::numeric) AND (deposit_percent <= (100)::numeric))) · cfg_fee_policy_id_check (CHECK): CHECK ((id = 1))

*Table* `cfg_lookup` (5 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| list_key | character varying(40) | no |  | PK |
| code | character varying(40) | no |  | PK |
| label | character varying(150) | no |  |  |
| sort_order | smallint | no | 0 |  |
| active | boolean | no | true |  |

*Table* `cfg_matching_snapshot` (9 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| label | character varying(20) | no |  |  |
| hard_constraints | jsonb | no |  |  |
| criteria_order | jsonb | no |  |  |
| weights | jsonb | no |  |  |
| boost | numeric | no |  |  |
| active | boolean | no | false |  |
| created_at | timestamp with time zone | no | now() |  |
| created_by | bigint | yes |  | FK → auth_user |

*Constraints of cfg_matching_snapshot:* cfg_matching_snapshot_boost_check (CHECK): CHECK (((boost >= (1)::numeric) AND (boost <= (5)::numeric))) · cfg_matching_snapshot_label_key (UNIQUE): UNIQUE (label)

*Table* `cfg_parameter` (12 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| key | character varying(60) | no |  | PK |
| section | character varying(60) | no |  |  |
| label | character varying(150) | no |  |  |
| value_type | character varying(10) | no |  |  |
| value | character varying(500) | no |  |  |
| helper | character varying(300) | yes |  |  |
| options | jsonb | yes |  |  |
| sort_order | smallint | no | 0 |  |
| updated_at | timestamp with time zone | no | now() |  |
| updated_by | bigint | yes |  | FK → auth_user |
| settings_group | character varying(20) | yes |  |  |
| used_in | character varying(300) | yes |  |  |

*Constraints of cfg_parameter:* cfg_parameter_settings_group_check (CHECK): CHECK (((settings_group)::text = ANY ((ARRAY['DEADLINES'::character varying, 'REFUNDS'::character varying, 'STAY'::character varying])::text… · cfg_parameter_value_type_check (CHECK): CHECK (((value_type)::text = ANY ((ARRAY['INT'::character varying, 'DECIMAL'::character varying, 'BOOL'::character varying, 'TEXT'::characte…

*Table* `cfg_priority_group` (6 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| key | character varying(40) | no |  |  |
| title | character varying(150) | no |  |  |
| note | character varying(300) | yes |  |  |
| applied | boolean | no | true |  |
| sort_order | smallint | no | 0 |  |

*Constraints of cfg_priority_group:* cfg_priority_group_key_key (UNIQUE): UNIQUE (key)

*Table* `cfg_refund_rule` (7 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| trigger_code | character varying(40) | no |  |  |
| description | character varying(200) | no |  |  |
| refund_percent | numeric | no |  |  |
| approver_role | character varying(10) | no |  |  |
| active | boolean | no | true |  |
| sort_order | smallint | no | 0 |  |

*Constraints of cfg_refund_rule:* cfg_refund_rule_approver_role_check (CHECK): CHECK (((approver_role)::text = ANY ((ARRAY['SYSTEM'::character varying, 'STAFF'::character varying, 'MANAGER'::character varying, 'ADMIN'::… · cfg_refund_rule_refund_percent_check (CHECK): CHECK (((refund_percent >= (0)::numeric) AND (refund_percent <= (100)::numeric)))

*Table* `cfg_room_class` (9 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| name | character varying(50) | no |  |  |
| surcharge_rate | numeric | no |  |  |
| amenities | ARRAY | no | '{}'::text[] |  |
| status | character varying(8) | no | 'ACTIVE'::character varying |  |
| sort_order | smallint | no | 0 |  |
| created_at | timestamp with time zone | no | now() |  |
| updated_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |

*Constraints of cfg_room_class:* cfg_room_class_name_key (UNIQUE): UNIQUE (name) · cfg_room_class_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[]))) · cfg_room_class_surcharge_rate_check (CHECK): CHECK (((surcharge_rate >= (0)::numeric) AND (surcharge_rate <= (5)::numeric)))

*Table* `cfg_room_type` (11 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| name | character varying(50) | no |  |  |
| beds | smallint | no |  |  |
| base_price | bigint | no |  |  |
| roommate_selection | character varying(6) | no | 'AUTO'::character varying |  |
| description | character varying(500) | yes |  |  |
| status | character varying(8) | no | 'ACTIVE'::character varying |  |
| sort_order | smallint | no | 0 |  |
| created_at | timestamp with time zone | no | now() |  |
| updated_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |

*Constraints of cfg_room_type:* cfg_room_type_base_price_check (CHECK): CHECK ((base_price > 0)) · cfg_room_type_beds_check (CHECK): CHECK (((beds >= 1) AND (beds <= 12))) · cfg_room_type_name_key (UNIQUE): UNIQUE (name) · cfg_room_type_roommate_selection_check (CHECK): CHECK (((roommate_selection)::text = ANY ((ARRAY['AUTO'::character varying, 'MUTUAL'::character varying])::text[]))) · cfg_room_type_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[]))) · ck_room_type_mutual (CHECK): CHECK ((((roommate_selection)::text = 'AUTO'::text) OR (beds = 2)))

*Table* `cfg_term` (37 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| code | character varying(20) | no |  |  |
| name | character varying(100) | no |  |  |
| status | character varying(10) | no | 'DRAFT'::character varying |  |
| stay_start | date | no |  |  |
| stay_end | date | no |  |  |
| registration_opens_at | timestamp with time zone | yes |  |  |
| registration_closes_at | timestamp with time zone | yes |  |  |
| results_published_at | timestamp with time zone | yes |  |  |
| roommate_hours | integer | yes |  |  |
| deposit_hours | integer | yes |  |  |
| balance_due_at | timestamp with time zone | yes |  |  |
| check_in_start | date | yes |  |  |
| check_in_end | date | yes |  |  |
| check_out_by | date | yes |  |  |
| published_at | timestamp with time zone | yes |  |  |
| created_at | timestamp with time zone | no | now() |  |
| updated_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |
| publish_at | timestamp with time zone | yes |  |  |
| requests_open_at | timestamp with time zone | yes |  |  |
| requests_close_at | timestamp with time zone | yes |  |  |
| decisions_due_at | timestamp with time zone | yes |  |  |
| reconciliation_due_at | timestamp with time zone | yes |  |  |
| fees_issue_at | timestamp with time zone | yes |  |  |
| fees_due_at | timestamp with time zone | yes |  |  |
| reserved_new_percent | numeric | no | 0 |  |
| deposit_percent | numeric | yes |  |  |
| utility_deposit | bigint | yes |  |  |
| matching_snapshot_id | bigint | yes |  | FK → cfg_matching_snapshot |
| eligibility_keys | jsonb | yes |  |  |
| priority_group_keys | jsonb | yes |  |  |
| house_rules | text | yes |  |  |
| faq | jsonb | no | '[]'::jsonb |  |
| documents | jsonb | no | '[]'::jsonb |  |
| wizard_step | smallint | no | 7 |  |
| change_reasons | jsonb | no | '{}'::jsonb |  |

*Constraints of cfg_term:* cfg_term_code_key (UNIQUE): UNIQUE (code) · cfg_term_deposit_hours_check (CHECK): CHECK ((deposit_hours > 0)) · cfg_term_deposit_percent_check (CHECK): CHECK (((deposit_percent > (0)::numeric) AND (deposit_percent <= (100)::numeric))) · cfg_term_reserved_new_percent_check (CHECK): CHECK (((reserved_new_percent >= (0)::numeric) AND (reserved_new_percent <= (100)::numeric))) · cfg_term_roommate_hours_check (CHECK): CHECK ((roommate_hours > 0)) · cfg_term_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'PUBLISHED'::character varying, 'CLOSED'::character varying])::text[]))) · cfg_term_utility_deposit_check (CHECK): CHECK ((utility_deposit >= 0)) · cfg_term_wizard_step_check (CHECK): CHECK (((wizard_step >= 1) AND (wizard_step <= 7))) · ck_term_checkin (CHECK): CHECK (((check_in_start <= check_in_end) AND (check_in_end <= stay_end))) · ck_term_checkout (CHECK): CHECK ((check_out_by >= stay_start)) · ck_term_published_complete (CHECK): CHECK ((((status)::text = 'DRAFT'::text) OR ((registration_opens_at IS NOT NULL) AND (registration_closes_at IS NOT NULL) AND (results_publi… · ck_term_registration (CHECK): CHECK (((registration_opens_at < registration_closes_at) AND (registration_closes_at <= results_published_at))) · ck_term_renewal_complete (CHECK): CHECK (((num_nulls(publish_at, requests_open_at, requests_close_at, decisions_due_at, reconciliation_due_at, fees_issue_at, fees_due_at) = A… · ck_term_stay (CHECK): CHECK ((stay_start < stay_end)) · ex_term_no_overlap (EXCLUDE): EXCLUDE USING gist (daterange(stay_start, stay_end, '[]'::text) WITH &&) WHERE (((status)::text <> 'DRAFT'::text))

*Table* `cfg_term_block` (2 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| term_id | bigint | no |  | PK, FK → cfg_term |
| building_id | bigint | no |  | PK, FK → inv_building |

*Table* `cfg_term_price` (4 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| term_id | bigint | no |  | PK, FK → cfg_term |
| room_type_id | bigint | no |  | PK, FK → cfg_room_type |
| room_class_id | bigint | no |  | PK, FK → cfg_room_class |
| price | bigint | no |  |  |

*Constraints of cfg_term_price:* cfg_term_price_price_check (CHECK): CHECK ((price > 0))

*Table* `cfg_term_request` (14 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| code | character varying(20) | no |  |  |
| term_name | character varying(100) | no |  |  |
| stay_start | date | no |  |  |
| stay_end | date | no |  |  |
| proposal | jsonb | no |  |  |
| notes | character varying(2000) | yes |  |  |
| status | character varying(14) | no | 'SUBMITTED'::character varying |  |
| requested_by | bigint | no |  | FK → auth_user |
| term_id | bigint | yes |  | FK → cfg_term |
| decision_note | character varying(1000) | yes |  |  |
| created_at | timestamp with time zone | no | now() |  |
| updated_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |

*Constraints of cfg_term_request:* cfg_term_request_code_key (UNIQUE): UNIQUE (code) · cfg_term_request_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['SUBMITTED'::character varying, 'IN_PROGRESS'::character varying, 'NEEDS_CHANGES'::character varying, '… · ck_term_request_done (CHECK): CHECK ((((status)::text <> 'DONE'::text) OR (term_id IS NOT NULL))) · ck_term_request_stay (CHECK): CHECK ((stay_start < stay_end))

*Table* `cfg_term_request_event` (6 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| request_id | bigint | no |  | FK → cfg_term_request |
| kind | character varying(14) | no |  |  |
| actor_id | bigint | yes |  | FK → auth_user |
| note | character varying(2000) | yes |  |  |
| at | timestamp with time zone | no | now() |  |

*Constraints of cfg_term_request_event:* cfg_term_request_event_kind_check (CHECK): CHECK (((kind)::text = ANY ((ARRAY['SUBMITTED'::character varying, 'UPDATED'::character varying, 'COMMENT'::character varying, 'IN_PROGRESS'…

*Table* `cfg_term_room_class` (2 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| term_id | bigint | no |  | PK, FK → cfg_term |
| room_class_id | bigint | no |  | PK, FK → cfg_room_class |

*Table* `cfg_term_room_excluded` (2 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| term_id | bigint | no |  | PK, FK → cfg_term |
| room_id | bigint | no |  | PK, FK → inv_room |

*Table* `cfg_term_room_type` (2 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| term_id | bigint | no |  | PK, FK → cfg_term |
| room_type_id | bigint | no |  | PK, FK → cfg_room_type |

*Table* `cfg_utility_policy` (13 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | smallint | no | 1 | PK |
| price_kwh | bigint | no |  |  |
| price_m3 | bigint | no |  |  |
| reading_day | smallint | no |  |  |
| payment_due_days | smallint | no |  |  |
| rounding | character varying(20) | no |  |  |
| overdue_reminder | character varying(20) | no |  |  |
| estimate_monthly | bigint | no |  |  |
| months_held | smallint | no |  |  |
| block_changes_when_overdue | boolean | no | true |  |
| updated_at | timestamp with time zone | no | now() |  |
| updated_by | bigint | yes |  | FK → auth_user |
| version | bigint | no | 0 |  |

*Constraints of cfg_utility_policy:* cfg_utility_policy_estimate_monthly_check (CHECK): CHECK ((estimate_monthly >= 0)) · cfg_utility_policy_id_check (CHECK): CHECK ((id = 1)) · cfg_utility_policy_months_held_check (CHECK): CHECK ((months_held >= 0)) · cfg_utility_policy_payment_due_days_check (CHECK): CHECK ((payment_due_days > 0)) · cfg_utility_policy_price_kwh_check (CHECK): CHECK ((price_kwh >= 0)) · cfg_utility_policy_price_m3_check (CHECK): CHECK ((price_m3 >= 0)) · cfg_utility_policy_reading_day_check (CHECK): CHECK (((reading_day >= 1) AND (reading_day <= 28)))

**Inventory (INV): 14 tables**

*Table* `inv_bed` (4 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| room_id | bigint | no |  | FK → inv_room |
| label | character varying(4) | no |  |  |
| status | character varying(16) | no | 'IN_SERVICE'::character varying |  |

*Constraints of inv_bed:* inv_bed_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['IN_SERVICE'::character varying, 'OUT_OF_SERVICE'::character varying, 'RETIRED'::character varying])::t… · ux_bed (UNIQUE): UNIQUE (room_id, label)

*Table* `inv_building` (8 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| code | character varying(10) | no |  |  |
| name | character varying(100) | no |  |  |
| gender | character(1) | no |  |  |
| status | character varying(8) | no | 'ACTIVE'::character varying |  |
| created_at | timestamp with time zone | no | now() |  |
| updated_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |

*Constraints of inv_building:* inv_building_code_key (UNIQUE): UNIQUE (code) · inv_building_gender_check (CHECK): CHECK ((gender = ANY (ARRAY['M'::bpchar, 'F'::bpchar]))) · inv_building_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])))

*Table* `inv_door_code` (10 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| room_id | bigint | no |  | FK → inv_room |
| code_cipher | character varying(100) | no |  |  |
| status | character varying(10) | no |  |  |
| source | character varying(8) | no |  |  |
| proposed_by | bigint | no |  | FK → auth_user |
| proposed_at | timestamp with time zone | no |  |  |
| confirmed_by | bigint | yes |  | FK → auth_user |
| confirmed_at | timestamp with time zone | yes |  |  |
| ended_at | timestamp with time zone | yes |  |  |

*Constraints of inv_door_code:* ck_door_code_confirmed (CHECK): CHECK ((((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'RETIRED'::character varying])::text[])) = (confirmed_at IS NOT NULL))) · ck_door_code_ended (CHECK): CHECK ((((status)::text = ANY ((ARRAY['RETIRED'::character varying, 'CANCELLED'::character varying])::text[])) = (ended_at IS NOT NULL))) · inv_door_code_source_check (CHECK): CHECK (((source)::text = ANY ((ARRAY['MANUAL'::character varying, 'RANDOM'::character varying, 'IMPORT'::character varying])::text[]))) · inv_door_code_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['PROPOSED'::character varying, 'ACTIVE'::character varying, 'RETIRED'::character varying, 'CANCELLED'::…

*Table* `inv_door_code_task` (6 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| room_id | bigint | no |  | FK → inv_room |
| reason | character varying(12) | no |  |  |
| created_at | timestamp with time zone | no |  |  |
| done_at | timestamp with time zone | yes |  |  |
| door_code_id | bigint | yes |  | FK → inv_door_code |

*Constraints of inv_door_code_task:* ck_door_task_done (CHECK): CHECK (((done_at IS NULL) = (door_code_id IS NULL))) · ck_door_task_reason (CHECK): CHECK (((reason)::text = ANY ((ARRAY['CHECK_OUT'::character varying, 'MOVE_OUT'::character varying, 'TERMINATION'::character varying])::text…

*Table* `inv_floor` (4 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| building_id | bigint | no |  | FK → inv_building |
| floor_no | smallint | no |  |  |
| room_class_id | bigint | yes |  | FK → cfg_room_class |

*Constraints of inv_floor:* inv_floor_floor_no_check (CHECK): CHECK (((floor_no >= 0) AND (floor_no <= 60))) · ux_floor (UNIQUE): UNIQUE (building_id, floor_no)

*Table* `inv_floor_layout` (3 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| floor_id | bigint | no |  | PK, FK → inv_floor |
| room_type_id | bigint | no |  | PK, FK → cfg_room_type |
| room_count | smallint | no |  |  |

*Constraints of inv_floor_layout:* inv_floor_layout_room_count_check (CHECK): CHECK (((room_count >= 0) AND (room_count <= 200)))

*Table* `inv_furniture_condition` (6 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| code | character varying(16) | no |  | PK |
| name | character varying(60) | no |  |  |
| name_vi | character varying(60) | no |  |  |
| value_percent | smallint | no |  |  |
| sort_order | smallint | no |  |  |
| updated_at | timestamp with time zone | no | now() |  |

*Constraints of inv_furniture_condition:* inv_furniture_condition_value_percent_check (CHECK): CHECK (((value_percent >= 0) AND (value_percent <= 100)))

*Table* `inv_furniture_event` (8 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| item_id | bigint | no |  | FK → inv_furniture_item |
| kind | character varying(10) | no |  |  |
| from_value | character varying(40) | yes |  |  |
| to_value | character varying(40) | no |  |  |
| reason | character varying(500) | yes |  |  |
| by_user | bigint | no |  | FK → auth_user |
| at | timestamp with time zone | no |  |  |

*Constraints of inv_furniture_event:* inv_furniture_event_kind_check (CHECK): CHECK (((kind)::text = ANY ((ARRAY['REGISTERED'::character varying, 'STATUS'::character varying, 'MOVED'::character varying, 'REPAIR'::chara…

*Table* `inv_furniture_item` (12 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| asset_code | character varying(30) | no |  |  |
| furniture_type_id | bigint | no |  | FK → inv_furniture_type |
| status | character varying(10) | no |  |  |
| room_id | bigint | yes |  | FK → inv_room |
| store_building_id | bigint | yes |  | FK → inv_building |
| note | character varying(500) | yes |  |  |
| created_at | timestamp with time zone | no | now() |  |
| updated_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |
| bed_id | bigint | yes |  | FK → inv_bed |
| condition | character varying(10) | no | 'GOOD'::character varying |  |

*Constraints of inv_furniture_item:* ck_furniture_in_store (CHECK): CHECK ((((status)::text <> 'IN_STORE'::text) OR (store_building_id IS NOT NULL))) · ck_furniture_in_use (CHECK): CHECK ((((status)::text <> 'IN_USE'::text) OR (room_id IS NOT NULL))) · ck_furniture_location (CHECK): CHECK (((room_id IS NULL) <> (store_building_id IS NULL))) · inv_furniture_item_asset_code_key (UNIQUE): UNIQUE (asset_code) · inv_furniture_item_condition_check (CHECK): CHECK (((condition)::text = ANY ((ARRAY['GOOD'::character varying, 'WORN'::character varying, 'DAMAGED'::character varying, 'MISSING'::chara… · inv_furniture_item_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['IN_USE'::character varying, 'BROKEN'::character varying, 'IN_REPAIR'::character varying, 'IN_STORE'::c…

*Table* `inv_furniture_move` (12 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| item_id | bigint | no |  | FK → inv_furniture_item |
| from_room_id | bigint | yes |  | FK → inv_room |
| from_store_building_id | bigint | yes |  | FK → inv_building |
| to_room_id | bigint | yes |  | FK → inv_room |
| to_store_building_id | bigint | yes |  | FK → inv_building |
| reason | character varying(300) | no |  |  |
| status | character varying(10) | no |  |  |
| created_by | bigint | no |  | FK → auth_user |
| created_at | timestamp with time zone | no |  |  |
| closed_by | bigint | yes |  | FK → auth_user |
| closed_at | timestamp with time zone | yes |  |  |

*Constraints of inv_furniture_move:* ck_move_closed (CHECK): CHECK ((((status)::text = 'PLANNED'::text) = (closed_at IS NULL))) · ck_move_from (CHECK): CHECK (((from_room_id IS NULL) <> (from_store_building_id IS NULL))) · ck_move_to (CHECK): CHECK (((to_room_id IS NULL) <> (to_store_building_id IS NULL))) · inv_furniture_move_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['PLANNED'::character varying, 'DONE'::character varying, 'CANCELLED'::character varying])::text[])))

*Table* `inv_furniture_type` (13 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| code | character varying(10) | no |  |  |
| name | character varying(80) | no |  |  |
| name_vi | character varying(80) | no |  |  |
| category | character varying(10) | no |  |  |
| defines_class | boolean | no | false |  |
| status | character varying(8) | no | 'ACTIVE'::character varying |  |
| sort_order | smallint | no | 0 |  |
| created_at | timestamp with time zone | no | now() |  |
| updated_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |
| use_scope | character varying(8) | no | 'PERSONAL'::character varying |  |
| unit_price | bigint | yes |  |  |

*Constraints of inv_furniture_type:* ck_furniture_type_code (CHECK): CHECK (((code)::text ~ '^[A-Z][A-Z0-9]{0,9}$'::text)) · inv_furniture_type_category_check (CHECK): CHECK (((category)::text = ANY ((ARRAY['APPLIANCE'::character varying, 'FURNITURE'::character varying, 'FIXTURE'::character varying, 'OTHER'… · inv_furniture_type_code_key (UNIQUE): UNIQUE (code) · inv_furniture_type_name_key (UNIQUE): UNIQUE (name) · inv_furniture_type_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[]))) · inv_furniture_type_unit_price_check (CHECK): CHECK (((unit_price IS NULL) OR ((unit_price >= 0) AND (unit_price <= 1000000000)))) · inv_furniture_type_use_scope_check (CHECK): CHECK (((use_scope)::text = ANY ((ARRAY['PERSONAL'::character varying, 'SHARED'::character varying])::text[])))

*Table* `inv_room` (14 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| code | character varying(20) | no |  |  |
| building_id | bigint | no |  | FK → inv_building |
| floor_id | bigint | no |  | FK → inv_floor |
| room_type_id | bigint | no |  | FK → cfg_room_type |
| status | character varying(16) | no | 'IN_SERVICE'::character varying |  |
| oos_since | timestamp with time zone | yes |  |  |
| oos_reason | character varying(40) | yes |  |  |
| oos_note | character varying(500) | yes |  |  |
| oos_by | bigint | yes |  | FK → auth_user |
| created_at | timestamp with time zone | no | now() |  |
| updated_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |
| room_class_id | bigint | no |  | FK → cfg_room_class |

*Constraints of inv_room:* ck_room_oos (CHECK): CHECK ((((status)::text = 'OUT_OF_SERVICE'::text) = ((oos_since IS NOT NULL) AND (oos_reason IS NOT NULL)))) · inv_room_code_key (UNIQUE): UNIQUE (code) · inv_room_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['IN_SERVICE'::character varying, 'OUT_OF_SERVICE'::character varying, 'RETIRED'::character varying])::t…

*Table* `inv_room_class_requirement` (3 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| room_class_id | bigint | no |  | PK, FK → cfg_room_class |
| furniture_type_id | bigint | no |  | PK, FK → inv_furniture_type |
| quantity | smallint | no |  |  |

*Constraints of inv_room_class_requirement:* inv_room_class_requirement_quantity_check (CHECK): CHECK (((quantity >= 1) AND (quantity <= 20)))

*Table* `inv_room_class_term` (5 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| room_id | bigint | no |  | PK, FK → inv_room |
| term_id | bigint | no |  | PK, FK → cfg_term |
| room_class_id | bigint | no |  | FK → cfg_room_class |
| set_by | bigint | no |  | FK → auth_user |
| set_at | timestamp with time zone | no | now() |  |

**Applications (APP): 6 tables**

*Table* `app_application` (31 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| code | character varying(24) | no |  |  |
| term_id | bigint | no |  | FK → cfg_term |
| student_id | bigint | no |  | FK → auth_user |
| room_type_id | bigint | no |  | FK → cfg_room_type |
| room_class_id | bigint | no |  | FK → cfg_room_class |
| term_price | bigint | no |  |  |
| surcharge_rate | numeric | no |  |  |
| deposit_amount | bigint | no |  |  |
| status | character varying(20) | no |  |  |
| roommate_mode | character varying(6) | no | 'NONE'::character varying |  |
| partner_application_id | bigint | yes |  | FK → app_application |
| roommate_preferences | jsonb | yes |  |  |
| contact | jsonb | no |  |  |
| consent_matching | boolean | no |  |  |
| consent_rules | boolean | no |  |  |
| consented_at | timestamp with time zone | no |  |  |
| deposit_due_at | timestamp with time zone | yes |  |  |
| submitted_at | timestamp with time zone | yes |  |  |
| reviewed_by | bigint | yes |  | FK → auth_user |
| reviewed_at | timestamp with time zone | yes |  |  |
| decision_note | character varying(500) | yes |  |  |
| cancelled_at | timestamp with time zone | yes |  |  |
| cancel_reason | character varying(500) | yes |  |  |
| created_at | timestamp with time zone | no | now() |  |
| updated_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |
| student_name | character varying(150) | no |  |  |
| student_code | character varying(20) | no |  |  |
| gender | character(1) | no |  |  |
| stay_terms | smallint | no | 1 |  |

*Constraints of app_application:* app_application_code_key (UNIQUE): UNIQUE (code) · app_application_deposit_amount_check (CHECK): CHECK ((deposit_amount >= 0)) · app_application_gender_check (CHECK): CHECK ((gender = ANY (ARRAY['M'::bpchar, 'F'::bpchar]))) · app_application_roommate_mode_check (CHECK): CHECK (((roommate_mode)::text = ANY ((ARRAY['NONE'::character varying, 'INVITE'::character varying, 'AUTO'::character varying])::text[]))) · app_application_stay_terms_check (CHECK): CHECK (((stay_terms >= 1) AND (stay_terms <= 9))) · app_application_term_price_check (CHECK): CHECK ((term_price > 0)) · ck_app_consent (CHECK): CHECK ((consent_matching AND consent_rules)) · ck_app_partner (CHECK): CHECK (((partner_application_id IS NULL) OR ((roommate_mode)::text = 'INVITE'::text))) · ck_app_pref (CHECK): CHECK (((roommate_preferences IS NULL) OR ((roommate_mode)::text = 'AUTO'::text))) · ck_app_rejected (CHECK): CHECK ((((status)::text <> 'REJECTED'::text) OR (decision_note IS NOT NULL))) · ck_app_status (CHECK): CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'AWAITING_ROOMMATE'::character varying, 'AWAITING_DEPOSIT'::character varyi…

*Table* `app_application_event` (8 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| application_id | bigint | no |  | FK → app_application |
| status | character varying(20) | no |  |  |
| text | character varying(300) | no |  |  |
| note | character varying(500) | yes |  |  |
| visible_to_student | boolean | no | true |  |
| actor_id | bigint | yes |  | FK → auth_user |
| at | timestamp with time zone | no | now() |  |

*Table* `app_roommate_check` (5 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| term_id | bigint | no |  | FK → cfg_term |
| student_id | bigint | no |  | FK → auth_user |
| valid | boolean | no |  |  |
| at | timestamp with time zone | no | now() |  |

*Table* `app_roommate_invitation` (10 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| term_id | bigint | no |  | FK → cfg_term |
| inviter_application_id | bigint | no |  | FK → app_application |
| invitee_student_id | bigint | no |  | FK → auth_user |
| invitee_application_id | bigint | yes |  | FK → app_application |
| status | character varying(10) | no | 'PENDING'::character varying |  |
| expires_at | timestamp with time zone | no |  |  |
| responded_at | timestamp with time zone | yes |  |  |
| created_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |

*Constraints of app_roommate_invitation:* app_roommate_invitation_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'ACCEPTED'::character varying, 'DECLINED'::character varying, 'EXPIRED'::… · ck_invite_accepted (CHECK): CHECK ((((status)::text <> 'ACCEPTED'::text) OR (invitee_application_id IS NOT NULL)))

*Table* `app_round2_offer` (7 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| application_id | bigint | no |  | FK → app_application |
| status | character varying(10) | no | 'PENDING'::character varying |  |
| expires_at | timestamp with time zone | no |  |  |
| created_at | timestamp with time zone | no | now() |  |
| responded_at | timestamp with time zone | yes |  |  |
| version | bigint | no | 0 |  |

*Constraints of app_round2_offer:* app_round2_offer_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'ACCEPTED'::character varying, 'DECLINED'::character varying, 'EXPIRED'::…

*Table* `app_round2_option` (12 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| offer_id | bigint | no |  | FK → app_round2_offer |
| room_type_id | bigint | no |  | FK → cfg_room_type |
| room_class_id | bigint | no |  | FK → cfg_room_class |
| building_id | bigint | no |  | FK → inv_building |
| bed_id | bigint | no |  | FK → inv_bed |
| note | character varying(200) | yes |  |  |
| fill_rate | numeric | yes |  |  |
| term_price | bigint | no |  |  |
| difference | bigint | no |  |  |
| chosen | boolean | no | false |  |
| held | boolean | no | true |  |

*Constraints of app_round2_option:* app_round2_option_term_price_check (CHECK): CHECK ((term_price > 0))

**Assignment (ASG): 16 tables**

*Table* `asg_allocation` (26 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| term_id | bigint | no |  | FK → cfg_term |
| application_id | bigint | yes |  | FK → app_application |
| student_id | bigint | no |  | FK → auth_user |
| bed_id | bigint | no |  | FK → inv_bed |
| status | character varying(10) | no | 'ACTIVE'::character varying |  |
| source | character varying(12) | no |  |  |
| run_id | bigint | yes |  | FK → asg_run |
| previous_allocation_id | bigint | yes |  | FK → asg_allocation |
| allocated_at | timestamp with time zone | no | now() |  |
| allocated_by | bigint | yes |  | FK → auth_user |
| checked_in_at | timestamp with time zone | yes |  |  |
| checked_in_by | bigint | yes |  | FK → auth_user |
| hand_over_items | ARRAY | no | '{}'::text[] |  |
| check_in_note | character varying(500) | yes |  |  |
| ended_at | timestamp with time zone | yes |  |  |
| end_reason | character varying(20) | yes |  |  |
| version | bigint | no | 0 |  |
| resident_at | timestamp with time zone | yes |  |  |
| code_released_at | timestamp with time zone | yes |  |  |
| stay_id | bigint | yes |  | FK → asg_stay |
| renewal | character varying(18) | yes |  |  |
| fee_paid_at | timestamp with time zone | yes |  |  |
| utility_from | timestamp with time zone | yes |  |  |
| eligible_at | timestamp with time zone | yes |  |  |
| handover_needed | boolean | no | false |  |

*Constraints of asg_allocation:* asg_allocation_renewal_check (CHECK): CHECK (((renewal)::text = ANY ((ARRAY['AWAITING_EXTENSION'::character varying, 'CONTINUING'::character varying])::text[]))) · asg_allocation_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'ENDED'::character varying, 'CANCELLED'::character varying])::text[]))) · ck_alloc_code_resident (CHECK): CHECK (((code_released_at IS NULL) OR (resident_at IS NOT NULL))) · ck_alloc_end_reason (CHECK): CHECK (((end_reason)::text = ANY ((ARRAY['CHECK_OUT'::character varying, 'ROOM_CHANGE'::character varying, 'SWAP'::character varying, 'CANCE… · ck_alloc_ended (CHECK): CHECK ((((status)::text = 'ACTIVE'::text) = (ended_at IS NULL))) · ck_alloc_fee_paid (CHECK): CHECK (((fee_paid_at IS NULL) OR ((renewal)::text = 'CONTINUING'::text))) · ck_alloc_source (CHECK): CHECK (((source)::text = ANY ((ARRAY['ASSIGNMENT'::character varying, 'ROUND2'::character varying, 'ROOM_CHANGE'::character varying, 'SWAP':…

*Table* `asg_check_out` (25 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| allocation_id | bigint | no |  | FK → asg_allocation |
| reason | character varying(40) | no |  |  |
| status | character varying(10) | no | 'PENDING'::character varying |  |
| electricity | numeric | yes |  |  |
| water | numeric | yes |  |  |
| condition_good | boolean | yes |  |  |
| key_returned | boolean | yes |  |  |
| damage_charge | bigint | no | 0 |  |
| refund_amount | bigint | yes |  |  |
| refund_status | character varying(12) | yes |  |  |
| requested_at | timestamp with time zone | no | now() |  |
| completed_at | timestamp with time zone | yes |  |  |
| completed_by | bigint | yes |  | FK → auth_user |
| version | bigint | no | 0 |  |
| deposit_held | bigint | yes |  |  |
| utility_share | bigint | yes |  |  |
| unpaid_utility | bigint | yes |  |  |
| share_period | character varying(40) | yes |  |  |
| settled_amount | bigint | yes |  |  |
| draft_by | bigint | yes |  | FK → auth_user |
| updated_at | timestamp with time zone | no | now() |  |
| student_agreed_at | timestamp with time zone | yes |  |  |
| student_present | boolean | yes |  |  |
| previous_reason | character varying(40) | yes |  |  |

*Constraints of asg_check_out:* asg_check_out_allocation_id_key (UNIQUE): UNIQUE (allocation_id) · asg_check_out_damage_charge_check (CHECK): CHECK ((damage_charge >= 0)) · asg_check_out_deposit_held_check (CHECK): CHECK ((deposit_held >= 0)) · asg_check_out_refund_amount_check (CHECK): CHECK ((refund_amount >= 0)) · asg_check_out_refund_status_check (CHECK): CHECK (((refund_status)::text = ANY ((ARRAY['NONE'::character varying, 'PENDING'::character varying, 'APPROVED'::character varying, 'PAID'::… · asg_check_out_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'DRAFT'::character varying, 'COMPLETED'::character varying])::text[]))) · asg_check_out_unpaid_utility_check (CHECK): CHECK ((unpaid_utility >= 0)) · asg_check_out_utility_share_check (CHECK): CHECK ((utility_share >= 0)) · ck_checkout_completed (CHECK): CHECK ((((status)::text <> 'COMPLETED'::text) OR ((completed_at IS NOT NULL) AND (electricity IS NOT NULL) AND (water IS NOT NULL) AND (cond…

*Table* `asg_check_out_damage` (16 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| check_out_id | bigint | no |  | PK, FK → asg_check_out |
| furniture_item_id | bigint | no |  | PK, FK → inv_furniture_item |
| amount | bigint | no |  |  |
| note | character varying(300) | yes |  |  |
| condition | character varying(10) | yes |  |  |
| baseline_condition | character varying(10) | yes |  |  |
| unit_price | bigint | yes |  |  |
| percent | smallint | yes |  |  |
| source | character varying(12) | yes |  |  |
| override_reason | character varying(300) | yes |  |  |
| manager_review | character varying(10) | yes |  |  |
| reviewed_by | bigint | yes |  | FK → auth_user |
| reviewed_at | timestamp with time zone | yes |  |  |
| review_note | character varying(300) | yes |  |  |
| shared_with | integer | yes |  |  |
| full_amount | bigint | yes |  |  |

*Constraints of asg_check_out_damage:* asg_check_out_damage_amount_check (CHECK): CHECK ((amount >= 0)) · asg_check_out_damage_baseline_condition_check (CHECK): CHECK (((baseline_condition)::text = ANY ((ARRAY['GOOD'::character varying, 'WORN'::character varying, 'DAMAGED'::character varying, 'MISSIN… · asg_check_out_damage_condition_check (CHECK): CHECK (((condition)::text = ANY ((ARRAY['GOOD'::character varying, 'WORN'::character varying, 'DAMAGED'::character varying, 'MISSING'::chara… · asg_check_out_damage_full_amount_check (CHECK): CHECK ((full_amount >= 0)) · asg_check_out_damage_manager_review_check (CHECK): CHECK (((manager_review)::text = ANY ((ARRAY['PENDING'::character varying, 'KEPT'::character varying, 'DROPPED'::character varying])::text[]… · asg_check_out_damage_percent_check (CHECK): CHECK (((percent >= 0) AND (percent <= 100))) · asg_check_out_damage_shared_with_check (CHECK): CHECK ((shared_with >= 1)) · asg_check_out_damage_source_check (CHECK): CHECK (((source)::text = ANY ((ARRAY['PERSONAL'::character varying, 'ACKNOWLEDGED'::character varying, 'OVERRIDE'::character varying])::text… · asg_check_out_damage_unit_price_check (CHECK): CHECK ((unit_price >= 0))

*Table* `asg_damage_claim` (11 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| allocation_id | bigint | no |  | FK → asg_allocation |
| furniture_item_id | bigint | no |  | FK → inv_furniture_item |
| condition | character varying(10) | no |  |  |
| note | character varying(300) | yes |  |  |
| status | character varying(12) | no | 'PENDING'::character varying |  |
| amount | bigint | yes |  |  |
| created_by | bigint | no |  | FK → auth_user |
| created_at | timestamp with time zone | no | now() |  |
| due_at | timestamp with time zone | no |  |  |
| answered_at | timestamp with time zone | yes |  |  |

*Constraints of asg_damage_claim:* asg_damage_claim_amount_check (CHECK): CHECK ((amount >= 0)) · asg_damage_claim_condition_check (CHECK): CHECK (((condition)::text = ANY ((ARRAY['DAMAGED'::character varying, 'MISSING'::character varying])::text[]))) · asg_damage_claim_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'ACKNOWLEDGED'::character varying, 'DECLINED'::character varying, 'EXPIRE…

*Table* `asg_furniture_report` (7 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| allocation_id | bigint | no |  | FK → asg_allocation |
| furniture_item_id | bigint | no |  | FK → inv_furniture_item |
| condition | character varying(10) | no |  |  |
| note | character varying(300) | yes |  |  |
| reported_at | timestamp with time zone | no | now() |  |
| updated_at | timestamp with time zone | no | now() |  |

*Constraints of asg_furniture_report:* asg_furniture_report_allocation_id_furniture_item_id_key (UNIQUE): UNIQUE (allocation_id, furniture_item_id) · asg_furniture_report_condition_check (CHECK): CHECK (((condition)::text = ANY ((ARRAY['WORN'::character varying, 'DAMAGED'::character varying, 'MISSING'::character varying])::text[])))

*Table* `asg_handover` (33 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| allocation_id | bigint | no |  | FK → asg_allocation |
| room_id | bigint | no |  | FK → inv_room |
| status | character varying(10) | no | 'DRAFT'::character varying |  |
| source | character varying(10) | yes |  |  |
| opened_at | timestamp with time zone | no |  |  |
| due_at | timestamp with time zone | no |  |  |
| submitted_at | timestamp with time zone | yes |  |  |
| electricity | numeric | yes |  |  |
| water | numeric | yes |  |  |
| baseline_electricity | numeric | yes |  |  |
| baseline_water | numeric | yes |  |  |
| baseline_at | timestamp with time zone | yes |  |  |
| comparison | character varying(8) | yes |  |  |
| comparison_note | character varying(500) | yes |  |  |
| verify_requested_at | timestamp with time zone | yes |  |  |
| verify_requested_by | bigint | yes |  | FK → auth_user |
| visit_at | timestamp with time zone | yes |  |  |
| verified_at | timestamp with time zone | yes |  |  |
| verified_by | bigint | yes |  | FK → auth_user |
| verified_electricity | numeric | yes |  |  |
| verified_water | numeric | yes |  |  |
| student_comment | character varying(500) | yes |  |  |
| confirm_reason | character varying(500) | yes |  |  |
| finalized_at | timestamp with time zone | yes |  |  |
| finalized_by | bigint | yes |  | FK → auth_user |
| utility_from | timestamp with time zone | yes |  |  |
| cancelled_reason | character varying(300) | yes |  |  |
| late_note | character varying(500) | yes |  |  |
| late_submitted_at | timestamp with time zone | yes |  |  |
| reminders_sent | smallint | no | 0 |  |
| created_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |

*Constraints of asg_handover:* asg_handover_comparison_check (CHECK): CHECK (((comparison)::text = ANY ((ARRAY['MATCHED'::character varying, 'MINOR'::character varying, 'MAJOR'::character varying])::text[]))) · asg_handover_electricity_check (CHECK): CHECK ((electricity >= (0)::numeric)) · asg_handover_source_check (CHECK): CHECK (((source)::text = ANY ((ARRAY['STUDENT'::character varying, 'VERIFIED'::character varying, 'AUTO'::character varying])::text[]))) · asg_handover_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'SUBMITTED'::character varying, 'VERIFYING'::character varying, 'FINAL'::ch… · asg_handover_verified_electricity_check (CHECK): CHECK ((verified_electricity >= (0)::numeric)) · asg_handover_verified_water_check (CHECK): CHECK ((verified_water >= (0)::numeric)) · asg_handover_water_check (CHECK): CHECK ((water >= (0)::numeric)) · ck_handover_final (CHECK): CHECK ((((status)::text <> 'FINAL'::text) OR ((finalized_at IS NOT NULL) AND (source IS NOT NULL))))

*Table* `asg_handover_item` (9 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| handover_id | bigint | no |  | PK, FK → asg_handover |
| furniture_item_id | bigint | no |  | PK, FK → inv_furniture_item |
| condition | character varying(10) | yes |  |  |
| note | character varying(300) | yes |  |  |
| baseline_condition | character varying(10) | yes |  |  |
| baseline_source | character varying(12) | yes |  |  |
| verified_condition | character varying(10) | yes |  |  |
| verified_note | character varying(300) | yes |  |  |
| pre_existing | boolean | no | false |  |

*Constraints of asg_handover_item:* asg_handover_item_baseline_condition_check (CHECK): CHECK (((baseline_condition)::text = ANY ((ARRAY['GOOD'::character varying, 'WORN'::character varying, 'DAMAGED'::character varying, 'MISSIN… · asg_handover_item_baseline_source_check (CHECK): CHECK (((baseline_source)::text = ANY ((ARRAY['INSPECTION'::character varying, 'HANDOVER'::character varying, 'CHECK_OUT'::character varying… · asg_handover_item_condition_check (CHECK): CHECK (((condition)::text = ANY ((ARRAY['GOOD'::character varying, 'WORN'::character varying, 'DAMAGED'::character varying, 'MISSING'::chara… · asg_handover_item_verified_condition_check (CHECK): CHECK (((verified_condition)::text = ANY ((ARRAY['GOOD'::character varying, 'WORN'::character varying, 'DAMAGED'::character varying, 'MISSIN…

*Table* `asg_handover_photo` (6 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| handover_id | bigint | no |  | FK → asg_handover |
| furniture_item_id | bigint | yes |  | FK → inv_furniture_item |
| file_id | bigint | no |  | FK → shared_file |
| taken_by | bigint | no |  | FK → auth_user |
| created_at | timestamp with time zone | no | now() |  |

*Table* `asg_late_check_in` (16 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| allocation_id | bigint | no |  | FK → asg_allocation |
| reason | character varying(500) | no |  |  |
| received_by | bigint | yes |  | FK → auth_user |
| requested_for | date | no |  |  |
| evidence_file_id | bigint | yes |  | FK → shared_file |
| window_closed_at | timestamp with time zone | no |  |  |
| suggested_deadline | date | yes |  |  |
| status | character varying(10) | no | 'PENDING'::character varying |  |
| deadline | date | yes |  |  |
| decision_reason | character varying(500) | yes |  |  |
| decided_by | bigint | yes |  | FK → auth_user |
| decided_at | timestamp with time zone | yes |  |  |
| created_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |
| source | character varying(6) | no | 'DESK'::character varying |  |

*Constraints of asg_late_check_in:* asg_late_check_in_source_check (CHECK): CHECK (((source)::text = ANY ((ARRAY['DESK'::character varying, 'ONLINE'::character varying])::text[]))) · asg_late_check_in_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying])::text[]))) · ck_late_approved (CHECK): CHECK ((((status)::text <> 'APPROVED'::text) OR (deadline IS NOT NULL))) · ck_late_rejected (CHECK): CHECK ((((status)::text <> 'REJECTED'::text) OR (decision_reason IS NOT NULL)))

*Table* `asg_move` (13 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| term_id | bigint | no |  | FK → cfg_term |
| student_id | bigint | no |  | FK → auth_user |
| from_allocation_id | bigint | no |  | FK → asg_allocation |
| to_allocation_id | bigint | no |  | FK → asg_allocation |
| from_bed_id | bigint | no |  | FK → inv_bed |
| to_bed_id | bigint | no |  | FK → inv_bed |
| reason | character varying(20) | no |  |  |
| note | character varying(500) | yes |  |  |
| next_term | character varying(8) | no | 'NONE'::character varying |  |
| reissued_fee | boolean | no | false |  |
| moved_by | bigint | no |  | FK → auth_user |
| moved_at | timestamp with time zone | no |  |  |

*Constraints of asg_move:* asg_move_next_term_check (CHECK): CHECK (((next_term)::text = ANY ((ARRAY['FOLLOWED'::character varying, 'KEPT'::character varying, 'NONE'::character varying])::text[]))) · ck_move_note (CHECK): CHECK ((((reason)::text <> 'OTHER'::text) OR (note IS NOT NULL)))

*Table* `asg_proposal_item` (12 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| run_id | bigint | no |  | FK → asg_run |
| application_id | bigint | no |  | FK → app_application |
| building_id | bigint | yes |  | FK → inv_building |
| bed_id | bigint | yes |  | FK → inv_bed |
| fit | numeric | yes |  |  |
| issue_code | character varying(40) | yes |  |  |
| issue_tone | character varying(10) | yes |  |  |
| resolved | boolean | no | false |  |
| resolution_key | character varying(40) | yes |  |  |
| waitlisted | boolean | no | false |  |
| reason | character varying(500) | yes |  |  |

*Constraints of asg_proposal_item:* asg_proposal_item_issue_tone_check (CHECK): CHECK (((issue_tone)::text = ANY ((ARRAY['INFO'::character varying, 'WARNING'::character varying, 'DANGER'::character varying])::text[]))) · ck_proposal_waitlist (CHECK): CHECK (((NOT waitlisted) OR (bed_id IS NULL))) · ux_proposal_app (UNIQUE): UNIQUE (run_id, application_id)

*Table* `asg_renewal` (10 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| term_id | bigint | no |  | PK, FK → cfg_term |
| previous_term_id | bigint | no |  | FK → cfg_term |
| opened_at | timestamp with time zone | no |  |  |
| continuing | integer | no | 0 |  |
| awaiting | integer | no | 0 |  |
| closed_at | timestamp with time zone | yes |  |  |
| escalated_at | timestamp with time zone | yes |  |  |
| fees_issued_at | timestamp with time zone | yes |  |  |
| fees_issued_by | bigint | yes |  | FK → auth_user |
| fees_closed_at | timestamp with time zone | yes |  |  |

*Constraints of asg_renewal:* ck_renewal_fees (CHECK): CHECK (((fees_issued_at IS NULL) = (fees_issued_by IS NULL))) · ck_renewal_terms (CHECK): CHECK ((term_id <> previous_term_id))

*Table* `asg_run` (16 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| term_id | bigint | no |  | FK → cfg_term |
| kind | character varying(8) | no |  |  |
| status | character varying(12) | no | 'RUNNING'::character varying |  |
| stage | smallint | no | 0 |  |
| matching_snapshot_id | bigint | no |  | FK → cfg_matching_snapshot |
| started_by | bigint | no |  | FK → auth_user |
| started_at | timestamp with time zone | no | now() |  |
| finished_at | timestamp with time zone | yes |  |  |
| input_count | integer | no | 0 |  |
| proposed_count | integer | no | 0 |  |
| conflict_count | integer | no | 0 |  |
| waitlisted_count | integer | no | 0 |  |
| average_fit | numeric | yes |  |  |
| error_message | character varying(1000) | yes |  |  |
| version | bigint | no | 0 |  |

*Constraints of asg_run:* asg_run_kind_check (CHECK): CHECK (((kind)::text = ANY ((ARRAY['DRY_RUN'::character varying, 'REAL'::character varying, 'ROUND2'::character varying])::text[]))) · asg_run_stage_check (CHECK): CHECK (((stage >= 0) AND (stage <= 5))) · asg_run_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['RUNNING'::character varying, 'PROPOSED'::character varying, 'IN_REVIEW'::character varying, 'COMMITTED…

*Table* `asg_run_block` (10 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| run_id | bigint | no |  | PK, FK → asg_run |
| building_id | bigint | no |  | PK, FK → inv_building |
| status | character varying(10) | no | 'REVIEW'::character varying |  |
| submitted_by | bigint | yes |  | FK → auth_user |
| submitted_at | timestamp with time zone | yes |  |  |
| decided_by | bigint | yes |  | FK → auth_user |
| decided_at | timestamp with time zone | yes |  |  |
| comment | character varying(1000) | yes |  |  |
| committed_at | timestamp with time zone | yes |  |  |
| version | bigint | no | 0 |  |

*Constraints of asg_run_block:* asg_run_block_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['REVIEW'::character varying, 'SUBMITTED'::character varying, 'APPROVED'::character varying, 'RETURNED':… · ck_run_block_returned (CHECK): CHECK ((((status)::text <> 'RETURNED'::text) OR (comment IS NOT NULL)))

*Table* `asg_stay` (11 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| student_id | bigint | no |  | FK → auth_user |
| first_term_id | bigint | no |  | FK → cfg_term |
| last_term_id | bigint | no |  | FK → cfg_term |
| committed_terms | smallint | no |  |  |
| terms_used | smallint | no | 1 |  |
| status | character varying(8) | no | 'ACTIVE'::character varying |  |
| end_kind | character varying(12) | yes |  |  |
| started_at | timestamp with time zone | no |  |  |
| ended_at | timestamp with time zone | yes |  |  |
| version | bigint | no | 0 |  |

*Constraints of asg_stay:* asg_stay_committed_terms_check (CHECK): CHECK (((committed_terms >= 1) AND (committed_terms <= 30))) · asg_stay_end_kind_check (CHECK): CHECK (((end_kind)::text = ANY ((ARRAY['COMPLETED'::character varying, 'ENDED_EARLY'::character varying, 'TERMINATED'::character varying])::… · asg_stay_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'ENDED'::character varying])::text[]))) · asg_stay_terms_used_check (CHECK): CHECK ((terms_used >= 0)) · ck_stay_ended (CHECK): CHECK ((((status)::text = 'ENDED'::text) = ((ended_at IS NOT NULL) AND (end_kind IS NOT NULL))))

*Table* `asg_termination` (16 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| allocation_id | bigint | no |  | FK → asg_allocation |
| term_id | bigint | no |  | FK → cfg_term |
| student_id | bigint | no |  | FK → auth_user |
| reason | character varying(12) | no |  |  |
| note | character varying(500) | yes |  |  |
| debt | bigint | yes |  |  |
| status | character varying(12) | no | 'NOTICE_SENT'::character varying |  |
| started_at | timestamp with time zone | no |  |  |
| started_by | bigint | yes |  | FK → auth_user |
| move_out_by | date | no |  |  |
| overdue_at | timestamp with time zone | yes |  |  |
| ended_at | timestamp with time zone | yes |  |  |
| ended_by | bigint | yes |  | FK → auth_user |
| cancel_reason | character varying(500) | yes |  |  |
| version | bigint | no | 0 |  |

*Constraints of asg_termination:* asg_termination_debt_check (CHECK): CHECK ((debt >= 0)) · asg_termination_reason_check (CHECK): CHECK (((reason)::text = ANY ((ARRAY['UTILITY_DEBT'::character varying, 'NOT_ENROLLED'::character varying, 'MANAGER'::character varying])::t… · asg_termination_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['NOTICE_SENT'::character varying, 'OVERDUE'::character varying, 'CHECKED_OUT'::character varying, 'CANC… · ck_termination_cancel (CHECK): CHECK ((((status)::text <> 'CANCELLED'::text) OR (cancel_reason IS NOT NULL))) · ck_termination_ended (CHECK): CHECK ((((status)::text = ANY ((ARRAY['CHECKED_OUT'::character varying, 'CANCELLED'::character varying])::text[])) = (ended_at IS NOT NULL))… · ck_termination_note (CHECK): CHECK ((((reason)::text <> 'MANAGER'::text) OR (note IS NOT NULL))) · ck_termination_overdue (CHECK): CHECK ((((status)::text <> 'OVERDUE'::text) OR (overdue_at IS NOT NULL)))

**Billing (BIL): 9 tables**

*Table* `bil_bank_transaction_archive` (16 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| provider | character varying(10) | no |  |  |
| provider_txn_id | character varying(40) | no |  |  |
| gateway | character varying(50) | yes |  |  |
| account_number | character varying(30) | yes |  |  |
| transaction_at | timestamp with time zone | no |  |  |
| transfer_type | character varying(3) | no |  |  |
| amount | bigint | no |  |  |
| content | character varying(500) | yes |  |  |
| code | character varying(40) | yes |  |  |
| reference_code | character varying(60) | yes |  |  |
| raw | jsonb | no |  |  |
| received_at | timestamp with time zone | no | now() |  |
| match_status | character varying(16) | no | 'PENDING'::character varying |  |
| invoice_id | bigint | yes |  | FK → bil_invoice |
| processed_at | timestamp with time zone | yes |  |  |

*Constraints of bil_bank_transaction_archive:* bil_bank_transaction_amount_check (CHECK): CHECK ((amount >= 0)) · bil_bank_transaction_match_status_check (CHECK): CHECK (((match_status)::text = ANY ((ARRAY['PENDING'::character varying, 'MATCHED'::character varying, 'UNMATCHED'::character varying, 'AMOU… · bil_bank_transaction_provider_check (CHECK): CHECK (((provider)::text = ANY ((ARRAY['SEPAY'::character varying, 'MOCK'::character varying])::text[]))) · bil_bank_transaction_transfer_type_check (CHECK): CHECK (((transfer_type)::text = ANY ((ARRAY['in'::character varying, 'out'::character varying])::text[]))) · ux_bank_txn (UNIQUE): UNIQUE (provider, provider_txn_id)

*Table* `bil_invoice` (30 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| code | character varying(24) | no |  |  |
| term_id | bigint | no |  | FK → cfg_term |
| student_id | bigint | no |  | FK → auth_user |
| application_id | bigint | yes |  | FK → app_application |
| allocation_id | bigint | yes |  | FK → asg_allocation |
| type | character varying(12) | no |  |  |
| title | character varying(150) | no |  |  |
| amount | bigint | no |  |  |
| status | character varying(22) | no | 'UNPAID'::character varying |  |
| lines | jsonb | yes |  |  |
| breakdown | jsonb | yes |  |  |
| utility_deposit | bigint | no | 0 |  |
| transfer_content | character varying(30) | no |  |  |
| qr_expires_at | timestamp with time zone | yes |  |  |
| issued_at | timestamp with time zone | no | now() |  |
| due_at | timestamp with time zone | no |  |  |
| paid_at | timestamp with time zone | yes |  |  |
| payment_method | character varying(10) | yes |  |  |
| reminded_at | timestamp with time zone | yes |  |  |
| voided_reason | character varying(300) | yes |  |  |
| created_at | timestamp with time zone | no | now() |  |
| updated_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |
| reference | character varying(60) | yes |  |  |
| student_name | character varying(150) | no |  |  |
| student_code | character varying(20) | no |  |  |
| gender | character(1) | no |  |  |
| building_id | bigint | yes |  | FK → inv_building |
| reminders_sent | smallint | no | 0 |  |

*Constraints of bil_invoice:* bil_invoice_amount_check (CHECK): CHECK ((amount > 0)) · bil_invoice_code_key (UNIQUE): UNIQUE (code) · bil_invoice_gender_check (CHECK): CHECK ((gender = ANY (ARRAY['M'::bpchar, 'F'::bpchar]))) · bil_invoice_reminders_sent_check (CHECK): CHECK (((reminders_sent >= 0) AND (reminders_sent <= 2))) · bil_invoice_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['UPCOMING'::character varying, 'UNPAID'::character varying, 'AWAITING_CONFIRMATION'::character varying,… · bil_invoice_transfer_content_key (UNIQUE): UNIQUE (transfer_content) · bil_invoice_utility_deposit_check (CHECK): CHECK ((utility_deposit >= 0)) · ck_invoice_paid (CHECK): CHECK ((((status)::text = ANY ((ARRAY['PAID'::character varying, 'REFUNDED'::character varying])::text[])) = (paid_at IS NOT NULL))) · ck_invoice_payment_method (CHECK): CHECK (((payment_method)::text = ANY ((ARRAY['VIETQR'::character varying, 'MANUAL'::character varying, 'TRANSFER'::character varying])::text… · ck_invoice_type (CHECK): CHECK (((type)::text = ANY ((ARRAY['DEPOSIT'::character varying, 'BALANCE'::character varying, 'UTILITY'::character varying, 'ROOM_CHANGE'::…

*Table* `bil_meter_cut` (9 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| room_id | bigint | no |  | FK → inv_room |
| cut_date | date | no |  |  |
| electricity | numeric | no |  |  |
| water | numeric | no |  |  |
| reason | character varying(12) | no |  |  |
| allocation_id | bigint | yes |  | FK → asg_allocation |
| recorded_by | bigint | yes |  | FK → auth_user |
| created_at | timestamp with time zone | no | now() |  |

*Constraints of bil_meter_cut:* ck_meter_cut_reason (CHECK): CHECK (((reason)::text = ANY ((ARRAY['CHECK_IN'::character varying, 'CHECK_OUT'::character varying, 'ROOM_CHANGE'::character varying, 'SWAP'…

*Table* `bil_meter_period` (9 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| building_id | bigint | no |  | FK → inv_building |
| label | character varying(30) | no |  |  |
| period_start | date | no |  |  |
| period_end | date | no |  |  |
| due_at | timestamp with time zone | no |  |  |
| closed_at | timestamp with time zone | yes |  |  |
| closed_by | bigint | yes |  | FK → auth_user |
| reminded_on | date | yes |  |  |

*Constraints of bil_meter_period:* ck_meter_period (CHECK): CHECK ((period_start < period_end)) · ux_meter_period (UNIQUE): UNIQUE (building_id, period_start)

*Table* `bil_meter_reading` (12 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| period_id | bigint | no |  | FK → bil_meter_period |
| room_id | bigint | no |  | FK → inv_room |
| electricity_prev | numeric | no |  |  |
| electricity_curr | numeric | yes |  |  |
| water_prev | numeric | no |  |  |
| water_curr | numeric | yes |  |  |
| status | character varying(12) | no | 'MISSING'::character varying |  |
| entered_by | bigint | yes |  | FK → auth_user |
| entered_at | timestamp with time zone | yes |  |  |
| confirmed_by | bigint | yes |  | FK → auth_user |
| confirmed_at | timestamp with time zone | yes |  |  |

*Constraints of bil_meter_reading:* bil_meter_reading_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['MISSING'::character varying, 'ENTERED'::character varying, 'CHECK_VALUE'::character varying, 'CONFIRME… · ck_meter_monotonic (CHECK): CHECK ((((electricity_curr IS NULL) OR (electricity_curr >= electricity_prev)) AND ((water_curr IS NULL) OR (water_curr >= water_prev)))) · ux_meter_reading (UNIQUE): UNIQUE (period_id, room_id)

*Table* `bil_payment` (12 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| invoice_id | bigint | no |  | FK → bil_invoice |
| amount | bigint | no |  |  |
| method | character varying(10) | no |  |  |
| status | character varying(10) | no | 'CONFIRMED'::character varying |  |
| bank_transaction_id | bigint | yes |  | FK → bil_bank_transaction_archive |
| reference | character varying(60) | yes |  |  |
| receipt_file_id | bigint | yes |  | FK → shared_file |
| paid_at | timestamp with time zone | no |  |  |
| confirmed_by | bigint | yes |  | FK → auth_user |
| created_at | timestamp with time zone | no | now() |  |
| claim_id | bigint | yes |  | FK → bil_payment_claim |

*Constraints of bil_payment:* bil_payment_amount_check (CHECK): CHECK ((amount > 0)) · bil_payment_bank_transaction_id_key (UNIQUE): UNIQUE (bank_transaction_id) · bil_payment_claim_id_key (UNIQUE): UNIQUE (claim_id) · bil_payment_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['CONFIRMED'::character varying, 'REVERSED'::character varying])::text[]))) · ck_payment_method (CHECK): CHECK (((method)::text = ANY ((ARRAY['VIETQR'::character varying, 'MANUAL'::character varying, 'TRANSFER'::character varying])::text[]))) · ck_payment_source (CHECK): CHECK (((((method)::text = 'VIETQR'::text) AND (bank_transaction_id IS NOT NULL)) OR (((method)::text = 'MANUAL'::text) AND (confirmed_by IS…

*Table* `bil_payment_claim` (12 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| invoice_id | bigint | no |  | FK → bil_invoice |
| student_id | bigint | no |  | FK → auth_user |
| claimed_at | timestamp with time zone | no |  |  |
| claimed_by | bigint | no |  | FK → auth_user |
| reference | character varying(60) | yes |  |  |
| time_left_seconds | bigint | no |  |  |
| status | character varying(10) | no | 'CLAIMED'::character varying |  |
| decided_by | bigint | yes |  | FK → auth_user |
| decided_at | timestamp with time zone | yes |  |  |
| reason | character varying(500) | yes |  |  |
| receipt_file_id | bigint | yes |  | FK → shared_file |

*Constraints of bil_payment_claim:* bil_payment_claim_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['CLAIMED'::character varying, 'CONFIRMED'::character varying, 'REJECTED'::character varying])::text[]))… · bil_payment_claim_time_left_seconds_check (CHECK): CHECK ((time_left_seconds >= 0)) · ck_claim_decided (CHECK): CHECK ((((status)::text = 'CLAIMED'::text) = (decided_at IS NULL))) · ck_claim_rejected (CHECK): CHECK ((((status)::text <> 'REJECTED'::text) OR (reason IS NOT NULL)))

*Table* `bil_refund` (25 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| term_id | bigint | no |  | FK → cfg_term |
| student_id | bigint | no |  | FK → auth_user |
| building_id | bigint | yes |  | FK → inv_building |
| source_type | character varying(20) | no |  |  |
| source_id | bigint | yes |  |  |
| reason | character varying(300) | no |  |  |
| rule_id | bigint | yes |  | FK → cfg_refund_rule |
| paid_amount | bigint | no |  |  |
| amount | bigint | no |  |  |
| exception | boolean | no | false |  |
| status | character varying(10) | no | 'PENDING'::character varying |  |
| note | character varying(500) | yes |  |  |
| decided_by | bigint | yes |  | FK → auth_user |
| decided_at | timestamp with time zone | yes |  |  |
| created_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |
| student_name | character varying(150) | no |  |  |
| student_code | character varying(20) | no |  |  |
| gender | character(1) | no |  |  |
| invoice_id | bigint | yes |  | FK → bil_invoice |
| account_reminded_at | timestamp with time zone | yes |  |  |
| paid_reference | character varying(100) | yes |  |  |
| paid_at | timestamp with time zone | yes |  |  |
| paid_by | bigint | yes |  | FK → auth_user |

*Constraints of bil_refund:* bil_refund_amount_check (CHECK): CHECK ((amount >= 0)) · bil_refund_gender_check (CHECK): CHECK ((gender = ANY (ARRAY['M'::bpchar, 'F'::bpchar]))) · bil_refund_paid_amount_check (CHECK): CHECK ((paid_amount >= 0)) · bil_refund_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying, 'PAID'::cha… · ck_refund_amount (CHECK): CHECK ((amount <= paid_amount)) · ck_refund_exception_note (CHECK): CHECK (((NOT (exception AND ((status)::text = 'APPROVED'::text))) OR (note IS NOT NULL))) · ck_refund_note (CHECK): CHECK ((((status)::text <> 'REJECTED'::text) OR (note IS NOT NULL))) · ck_refund_source (CHECK): CHECK (((source_type)::text = ANY ((ARRAY['APPLICATION_CANCEL'::character varying, 'CHECK_OUT'::character varying, 'ROOM_CHANGE'::character …

*Table* `bil_utility_warning` (13 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| allocation_id | bigint | no |  | FK → asg_allocation |
| student_id | bigint | no |  | FK → auth_user |
| term_id | bigint | no |  | FK → cfg_term |
| building_id | bigint | yes |  | FK → inv_building |
| level | character varying(5) | no |  |  |
| invoice_id | bigint | no |  | FK → bil_invoice |
| overdue_count | integer | no |  |  |
| debt | bigint | no |  |  |
| terminate_on | date | yes |  |  |
| issued_at | timestamp with time zone | no |  |  |
| closed_at | timestamp with time zone | yes |  |  |
| closed_reason | character varying(10) | yes |  |  |

*Constraints of bil_utility_warning:* bil_utility_warning_closed_reason_check (CHECK): CHECK (((closed_reason)::text = ANY ((ARRAY['PAID'::character varying, 'TERMINATED'::character varying, 'ENDED'::character varying])::text[]… · bil_utility_warning_debt_check (CHECK): CHECK ((debt >= 0)) · bil_utility_warning_level_check (CHECK): CHECK (((level)::text = ANY ((ARRAY['FIRST'::character varying, 'FINAL'::character varying])::text[]))) · bil_utility_warning_overdue_count_check (CHECK): CHECK ((overdue_count >= 0)) · ck_warning_closed (CHECK): CHECK (((closed_at IS NULL) = (closed_reason IS NULL))) · ck_warning_final (CHECK): CHECK ((((level)::text = 'FINAL'::text) = (terminate_on IS NOT NULL)))

**Requests (REQ): 10 tables**

*Table* `req_escalation` (22 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| building_id | bigint | no |  | FK → inv_building |
| term_id | bigint | yes |  | FK → cfg_term |
| kind | character varying(20) | no |  |  |
| source_type | character varying(20) | no |  |  |
| source_id | bigint | no |  |  |
| title | character varying(200) | no |  |  |
| why | character varying(500) | no |  |  |
| tone | character varying(10) | no | 'WARNING'::character varying |  |
| owner_id | bigint | yes |  | FK → auth_user |
| status | character varying(8) | no | 'OPEN'::character varying |  |
| opened_at | timestamp with time zone | no | now() |  |
| handled_action | character varying(20) | yes |  |  |
| handled_at | timestamp with time zone | yes |  |  |
| handled_by | bigint | yes |  | FK → auth_user |
| handled_note | character varying(1000) | yes |  |  |
| version | bigint | no | 0 |  |
| source_code | character varying(30) | yes |  |  |
| source_at | timestamp with time zone | yes |  |  |
| subtitle | character varying(200) | yes |  |  |
| room_code | character varying(20) | yes |  |  |
| link | character varying(200) | yes |  |  |

*Constraints of req_escalation:* req_escalation_handled_action_check (CHECK): CHECK (((handled_action)::text = ANY ((ARRAY['REASSIGN'::character varying, 'TEMPORARY_BED'::character varying, 'CLOSED'::character varying]… · req_escalation_kind_check (CHECK): CHECK (((kind)::text = ANY ((ARRAY['SLA_BREACH'::character varying, 'NO_ASSIGNEE'::character varying, 'REOPENED'::character varying, 'NO_BED… · req_escalation_source_type_check (CHECK): CHECK (((source_type)::text = ANY ((ARRAY['MAINTENANCE'::character varying, 'ROOM_CHANGE'::character varying, 'SWAP'::character varying, 'AP… · req_escalation_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'HANDLED'::character varying])::text[]))) · req_escalation_tone_check (CHECK): CHECK (((tone)::text = ANY ((ARRAY['INFO'::character varying, 'WARNING'::character varying, 'DANGER'::character varying])::text[])))

*Table* `req_escalation_event` (4 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| escalation_id | bigint | no |  | FK → req_escalation |
| text | character varying(300) | no |  |  |
| at | timestamp with time zone | no | now() |  |

*Table* `req_room_change` (23 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| code | character varying(24) | no |  |  |
| term_id | bigint | no |  | FK → cfg_term |
| student_id | bigint | no |  | FK → auth_user |
| allocation_id | bigint | no |  | FK → asg_allocation |
| kind | character varying(6) | no |  |  |
| target_room_type_id | bigint | no |  | FK → cfg_room_type |
| target_room_class_id | bigint | no |  | FK → cfg_room_class |
| reason_code | character varying(40) | no |  |  |
| details | character varying(1000) | yes |  |  |
| price_difference | bigint | no | 0 |  |
| status | character varying(10) | no | 'SUBMITTED'::character varying |  |
| assignee_id | bigint | yes |  | FK → auth_user |
| sla_due_at | timestamp with time zone | yes |  |  |
| target_bed_id | bigint | yes |  | FK → inv_bed |
| decided_by | bigint | yes |  | FK → auth_user |
| decided_at | timestamp with time zone | yes |  |  |
| decision_reason | character varying(40) | yes |  |  |
| decision_note | character varying(1000) | yes |  |  |
| invoice_id | bigint | yes |  | FK → bil_invoice |
| submitted_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |
| building_id | bigint | no |  | FK → inv_building |

*Constraints of req_room_change:* ck_rc_approved (CHECK): CHECK ((((status)::text <> 'APPROVED'::text) OR (target_bed_id IS NOT NULL))) · ck_rc_rejected (CHECK): CHECK ((((status)::text <> 'REJECTED'::text) OR (decision_reason IS NOT NULL))) · req_room_change_code_key (UNIQUE): UNIQUE (code) · req_room_change_kind_check (CHECK): CHECK (((kind)::text = ANY ((ARRAY['SAME'::character varying, 'CLASS'::character varying, 'TYPE'::character varying])::text[]))) · req_room_change_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['SUBMITTED'::character varying, 'PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'…

*Table* `req_room_class_change` (19 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| code | character varying(24) | no |  |  |
| term_id | bigint | no |  | FK → cfg_term |
| room_id | bigint | no |  | FK → inv_room |
| building_id | bigint | no |  | FK → inv_building |
| room_code | character varying(20) | no |  |  |
| from_class_id | bigint | no |  | FK → cfg_room_class |
| to_class_id | bigint | no |  | FK → cfg_room_class |
| requested_by | bigint | no |  | FK → auth_user |
| requester_role | character varying(8) | no |  |  |
| reason | character varying(500) | yes |  |  |
| status | character varying(16) | no |  |  |
| sla_due_at | timestamp with time zone | yes |  |  |
| furniture | jsonb | yes |  |  |
| decided_by | bigint | yes |  | FK → auth_user |
| decided_at | timestamp with time zone | yes |  |  |
| decision_note | character varying(1000) | yes |  |  |
| submitted_at | timestamp with time zone | no |  |  |
| version | bigint | no | 0 |  |

*Constraints of req_room_class_change:* ck_class_change_classes (CHECK): CHECK ((from_class_id <> to_class_id)) · ck_class_change_decided (CHECK): CHECK ((((status)::text <> ALL ((ARRAY['APPROVED'::character varying, 'REJECTED'::character varying, 'SET_BACK'::character varying])::text[]… · req_room_class_change_code_key (UNIQUE): UNIQUE (code) · req_room_class_change_requester_role_check (CHECK): CHECK (((requester_role)::text = ANY ((ARRAY['STUDENT'::character varying, 'MANAGER'::character varying])::text[]))) · req_room_class_change_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['AWAITING_CONSENT'::character varying, 'SUBMITTED'::character varying, 'APPROVED'::character varying, '…

*Table* `req_room_class_consent` (6 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| change_id | bigint | no |  | PK, FK → req_room_class_change |
| student_id | bigint | no |  | PK, FK → auth_user |
| allocation_id | bigint | no |  | FK → asg_allocation |
| status | character varying(8) | no | 'PENDING'::character varying |  |
| asked_at | timestamp with time zone | no |  |  |
| answered_at | timestamp with time zone | yes |  |  |

*Constraints of req_room_class_consent:* ck_consent_answered (CHECK): CHECK ((((status)::text = 'PENDING'::text) = (answered_at IS NULL))) · req_room_class_consent_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'AGREED'::character varying, 'DECLINED'::character varying])::text[])))

*Table* `req_routing_rule` (11 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| building_id | bigint | no |  | FK → inv_building |
| request_type | character varying(20) | no |  |  |
| scope | character varying(100) | no | 'ALL'::character varying |  |
| condition | character varying(100) | yes |  |  |
| assignee_id | bigint | no |  | FK → auth_user |
| fallback_id | bigint | yes |  | FK → auth_user |
| active | boolean | no | true |  |
| sort_order | smallint | no | 0 |  |
| updated_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |

*Constraints of req_routing_rule:* ck_routing_fallback (CHECK): CHECK (((fallback_id IS NULL) OR (fallback_id <> assignee_id))) · req_routing_rule_request_type_check (CHECK): CHECK (((request_type)::text = ANY ((ARRAY['MAINTENANCE'::character varying, 'ROOM_CHANGE'::character varying, 'SWAP'::character varying, 'P…

*Table* `req_sla_policy` (6 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| building_id | bigint | no |  | PK, FK → inv_building |
| urgent_hours | smallint | no |  |  |
| normal_hours | smallint | no |  |  |
| room_change_hours | smallint | no |  |  |
| updated_at | timestamp with time zone | no | now() |  |
| updated_by | bigint | yes |  | FK → auth_user |

*Constraints of req_sla_policy:* req_sla_policy_normal_hours_check (CHECK): CHECK ((normal_hours > 0)) · req_sla_policy_room_change_hours_check (CHECK): CHECK ((room_change_hours > 0)) · req_sla_policy_urgent_hours_check (CHECK): CHECK ((urgent_hours > 0))

*Table* `req_stay_request` (17 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| code | character varying(24) | no |  |  |
| term_id | bigint | no |  | FK → cfg_term |
| student_id | bigint | no |  | FK → auth_user |
| allocation_id | bigint | no |  | FK → asg_allocation |
| building_id | bigint | no |  | FK → inv_building |
| kind | character varying(12) | no |  |  |
| extra_terms | smallint | yes |  |  |
| reason | character varying(500) | yes |  |  |
| status | character varying(10) | no |  |  |
| automatic | boolean | no | false |  |
| sla_due_at | timestamp with time zone | yes |  |  |
| decided_by | bigint | yes |  | FK → auth_user |
| decided_at | timestamp with time zone | yes |  |  |
| decision_note | character varying(1000) | yes |  |  |
| submitted_at | timestamp with time zone | no |  |  |
| version | bigint | no | 0 |  |

*Constraints of req_stay_request:* ck_stay_request_extension (CHECK): CHECK ((((kind)::text = 'EXTENSION'::text) = (extra_terms IS NOT NULL))) · ck_stay_request_rejected (CHECK): CHECK ((((status)::text <> 'REJECTED'::text) OR (decision_note IS NOT NULL))) · req_stay_request_code_key (UNIQUE): UNIQUE (code) · req_stay_request_extra_terms_check (CHECK): CHECK (((extra_terms >= 1) AND (extra_terms <= 9))) · req_stay_request_kind_check (CHECK): CHECK (((kind)::text = ANY ((ARRAY['EXTENSION'::character varying, 'END_OF_STAY'::character varying])::text[]))) · req_stay_request_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['SUBMITTED'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying, 'CANCELLE…

*Table* `req_swap` (21 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| term_id | bigint | no |  | FK → cfg_term |
| kind | character varying(6) | no |  |  |
| post_id | bigint | yes |  | FK → req_swap_post |
| a_allocation_id | bigint | no |  | FK → asg_allocation |
| b_allocation_id | bigint | no |  | FK → asg_allocation |
| status | character varying(10) | no | 'INVITED'::character varying |  |
| cross_block | boolean | no |  |  |
| price_difference | bigint | no | 0 |  |
| reason | character varying(500) | yes |  |  |
| expires_at | timestamp with time zone | no |  |  |
| agreed_at | timestamp with time zone | yes |  |  |
| decided_by | bigint | yes |  | FK → auth_user |
| decided_at | timestamp with time zone | yes |  |  |
| decision_reason | character varying(500) | yes |  |  |
| created_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |
| a_building_id | bigint | no |  | FK → inv_building |
| b_building_id | bigint | no |  | FK → inv_building |
| staff_decided_by | bigint | yes |  | FK → auth_user |
| staff_decided_at | timestamp with time zone | yes |  |  |

*Constraints of req_swap:* ck_swap_distinct (CHECK): CHECK ((a_allocation_id <> b_allocation_id)) · ck_swap_rejected (CHECK): CHECK ((((status)::text <> 'REJECTED'::text) OR (decision_reason IS NOT NULL))) · ck_swap_status (CHECK): CHECK (((status)::text = ANY ((ARRAY['INVITED'::character varying, 'DECLINED'::character varying, 'EXPIRED'::character varying, 'PENDING'::c… · req_swap_kind_check (CHECK): CHECK (((kind)::text = ANY ((ARRAY['DIRECT'::character varying, 'BOARD'::character varying])::text[])))

*Table* `req_swap_post` (11 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| term_id | bigint | no |  | FK → cfg_term |
| allocation_id | bigint | no |  | FK → asg_allocation |
| wanted_building_id | bigint | yes |  | FK → inv_building |
| wanted_room_type_id | bigint | no |  | FK → cfg_room_type |
| wanted_room_class_id | bigint | no |  | FK → cfg_room_class |
| status | character varying(8) | no | 'ACTIVE'::character varying |  |
| expires_at | timestamp with time zone | no |  |  |
| created_at | timestamp with time zone | no | now() |  |
| updated_at | timestamp with time zone | no | now() |  |
| building_id | bigint | no |  | FK → inv_building |

*Constraints of req_swap_post:* req_swap_post_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'CLOSED'::character varying])::text[])))

**Maintenance (MNT): 11 tables**

*Table* `mnt_checklist` (8 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| family_key | character varying(40) | no |  |  |
| name | character varying(150) | no |  |  |
| version | smallint | no |  |  |
| status | character varying(10) | no | 'DRAFT'::character varying |  |
| published_at | timestamp with time zone | yes |  |  |
| archived_at | timestamp with time zone | yes |  |  |
| updated_at | timestamp with time zone | no | now() |  |

*Constraints of mnt_checklist:* mnt_checklist_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'PUBLISHED'::character varying, 'REPLACED'::character varying, 'ARCHIVED'::… · mnt_checklist_version_check (CHECK): CHECK ((version > 0)) · ux_checklist_version (UNIQUE): UNIQUE (family_key, version)

*Table* `mnt_checklist_item` (6 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| checklist_id | bigint | no |  | FK → mnt_checklist |
| label | character varying(200) | no |  |  |
| category | character varying(40) | no |  |  |
| severity | character varying(8) | no |  |  |
| sort_order | smallint | no | 0 |  |

*Constraints of mnt_checklist_item:* mnt_checklist_item_severity_check (CHECK): CHECK (((severity)::text = ANY ((ARRAY['CRITICAL'::character varying, 'MAJOR'::character varying, 'MINOR'::character varying, 'TRIVIAL'::cha…

*Table* `mnt_inspection_photo` (6 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| inspection_room_id | bigint | no |  | FK → mnt_inspection_room |
| check_key | character varying(30) | yes |  |  |
| file_id | bigint | no |  | FK → shared_file |
| taken_by | bigint | no |  | FK → auth_user |
| created_at | timestamp with time zone | no | now() |  |

*Constraints of mnt_inspection_photo:* mnt_inspection_photo_check_key_check (CHECK): CHECK (((check_key IS NULL) OR ((check_key)::text ~ '^FURNITURE:[0-9]+$'::text)))

*Table* `mnt_inspection_result` (5 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| inspection_room_id | bigint | no |  | PK, FK → mnt_inspection_room |
| item_id | bigint | no |  | PK, FK → mnt_checklist_item |
| result | character varying(12) | no |  |  |
| note | character varying(500) | yes |  |  |
| created_request_id | bigint | yes |  | FK → mnt_request |

*Constraints of mnt_inspection_result:* mnt_inspection_result_result_check (CHECK): CHECK (((result)::text = ANY ((ARRAY['PASS'::character varying, 'FAIL'::character varying, 'NOT_CHECKED'::character varying])::text[])))

*Table* `mnt_inspection_room` (9 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| run_id | bigint | no |  | FK → mnt_inspection_run |
| room_id | bigint | no |  | FK → inv_room |
| status | character varying(12) | no | 'PENDING'::character varying |  |
| inspected_at | timestamp with time zone | yes |  |  |
| electricity | numeric | yes |  |  |
| water | numeric | yes |  |  |
| meter_replaced | boolean | no | false |  |
| inspected_by | bigint | yes |  | FK → auth_user |

*Constraints of mnt_inspection_room:* mnt_inspection_room_electricity_check (CHECK): CHECK ((electricity >= (0)::numeric)) · mnt_inspection_room_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'INSPECTED'::character varying, 'UNREACHABLE'::character varying])::text[… · mnt_inspection_room_water_check (CHECK): CHECK ((water >= (0)::numeric)) · ux_inspection_room (UNIQUE): UNIQUE (run_id, room_id)

*Table* `mnt_inspection_room_check` (6 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| inspection_room_id | bigint | no |  | PK, FK → mnt_inspection_room |
| check_key | character varying(30) | no |  | PK |
| result | character varying(12) | no |  |  |
| note | character varying(500) | yes |  |  |
| created_request_id | bigint | yes |  | FK → mnt_request |
| condition | character varying(10) | yes |  |  |

*Constraints of mnt_inspection_room_check:* ck_inspection_check_key (CHECK): CHECK ((((check_key)::text = 'PEOPLE'::text) OR ((check_key)::text ~ '^FURNITURE:[0-9]+$'::text))) · mnt_inspection_room_check_condition_check (CHECK): CHECK (((condition)::text = ANY ((ARRAY['GOOD'::character varying, 'WORN'::character varying, 'DAMAGED'::character varying, 'MISSING'::chara… · mnt_inspection_room_check_result_check (CHECK): CHECK (((result)::text = ANY ((ARRAY['PASS'::character varying, 'FAIL'::character varying, 'NOT_CHECKED'::character varying])::text[])))

*Table* `mnt_inspection_run` (10 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| schedule_id | bigint | yes |  | FK → mnt_inspection_schedule |
| building_id | bigint | no |  | FK → inv_building |
| checklist_id | bigint | no |  | FK → mnt_checklist |
| run_date | date | no |  |  |
| due_at | timestamp with time zone | no |  |  |
| inspector_id | bigint | yes |  | FK → auth_user |
| status | character varying(12) | no | 'SCHEDULED'::character varying |  |
| submitted_at | timestamp with time zone | yes |  |  |
| created_at | timestamp with time zone | no | now() |  |

*Constraints of mnt_inspection_run:* mnt_inspection_run_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['SCHEDULED'::character varying, 'IN_PROGRESS'::character varying, 'SUBMITTED'::character varying])::tex…

*Table* `mnt_inspection_schedule` (16 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| building_id | bigint | no |  | FK → inv_building |
| name | character varying(150) | no |  |  |
| checklist_family | character varying(40) | no |  |  |
| scope | character varying(20) | no |  |  |
| floors | ARRAY | yes |  |  |
| repeat | character varying(10) | no |  |  |
| assignee_id | bigint | yes |  | FK → auth_user |
| due_within_days | smallint | no |  |  |
| create_requests | boolean | no | true |  |
| notify_residents | boolean | no | true |  |
| next_run_at | timestamp with time zone | yes |  |  |
| status | character varying(12) | no | 'ACTIVE'::character varying |  |
| created_at | timestamp with time zone | no | now() |  |
| version | bigint | no | 0 |  |
| kind | character varying(12) | no | 'PERIODIC'::character varying |  |

*Constraints of mnt_inspection_schedule:* ck_inspection_schedule_scope (CHECK): CHECK (((scope)::text = ANY ((ARRAY['ALL_ROOMS'::character varying, 'OCCUPIED'::character varying, 'EMPTY'::character varying, 'FLOORS'::cha… · ck_schedule_floors (CHECK): CHECK ((((scope)::text <> 'FLOORS'::text) OR (floors IS NOT NULL))) · mnt_inspection_schedule_due_within_days_check (CHECK): CHECK ((due_within_days > 0)) · mnt_inspection_schedule_kind_check (CHECK): CHECK (((kind)::text = ANY ((ARRAY['PERIODIC'::character varying, 'PRE_ARRIVAL'::character varying])::text[]))) · mnt_inspection_schedule_repeat_check (CHECK): CHECK (((repeat)::text = ANY ((ARRAY['ONCE'::character varying, 'WEEKLY'::character varying, 'MONTHLY'::character varying, 'TERMLY'::charact… · mnt_inspection_schedule_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'PAUSED'::character varying, 'COMPLETED'::character varying])::text[])))

*Table* `mnt_request` (28 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| code | character varying(24) | no |  |  |
| term_id | bigint | yes |  | FK → cfg_term |
| room_id | bigint | no |  | FK → inv_room |
| bed_id | bigint | yes |  | FK → inv_bed |
| reporter_id | bigint | no |  | FK → auth_user |
| source | character varying(10) | no | 'STUDENT'::character varying |  |
| title | character varying(150) | no |  |  |
| description | character varying(2000) | no |  |  |
| category | character varying(40) | no |  |  |
| location | character varying(40) | no |  |  |
| urgency | character varying(8) | no |  |  |
| priority | character varying(8) | no |  |  |
| staff_may_enter | boolean | no | false |  |
| status | character varying(12) | no | 'SUBMITTED'::character varying |  |
| assignee_id | bigint | yes |  | FK → auth_user |
| visit_window_start | timestamp with time zone | yes |  |  |
| visit_window_end | timestamp with time zone | yes |  |  |
| sla_due_at | timestamp with time zone | yes |  |  |
| reported_at | timestamp with time zone | no | now() |  |
| resolved_at | timestamp with time zone | yes |  |  |
| closed_at | timestamp with time zone | yes |  |  |
| confirmed_fixed | boolean | yes |  |  |
| reopen_count | smallint | no | 0 |  |
| version | bigint | no | 0 |  |
| building_id | bigint | no |  | FK → inv_building |
| room_code | character varying(20) | no |  |  |
| furniture_item_id | bigint | yes |  | FK → inv_furniture_item |

*Constraints of mnt_request:* ck_mnt_assigned (CHECK): CHECK ((((status)::text = ANY ((ARRAY['SUBMITTED'::character varying, 'CLOSED'::character varying])::text[])) OR (assignee_id IS NOT NULL))) · ck_mnt_visit (CHECK): CHECK (((visit_window_start IS NULL) OR (visit_window_end > visit_window_start))) · mnt_request_code_key (UNIQUE): UNIQUE (code) · mnt_request_priority_check (CHECK): CHECK (((priority)::text = ANY ((ARRAY['HIGH'::character varying, 'MEDIUM'::character varying, 'LOW'::character varying])::text[]))) · mnt_request_source_check (CHECK): CHECK (((source)::text = ANY ((ARRAY['STUDENT'::character varying, 'STAFF'::character varying, 'INSPECTION'::character varying])::text[]))) · mnt_request_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['SUBMITTED'::character varying, 'ASSIGNED'::character varying, 'IN_PROGRESS'::character varying, 'RESOL… · mnt_request_urgency_check (CHECK): CHECK (((urgency)::text = ANY ((ARRAY['NORMAL'::character varying, 'URGENT'::character varying])::text[])))

*Table* `mnt_request_event` (8 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| request_id | bigint | no |  | FK → mnt_request |
| actor_id | bigint | yes |  | FK → auth_user |
| actor_role | character varying(10) | yes |  |  |
| text | character varying(300) | yes |  |  |
| message | character varying(2000) | yes |  |  |
| internal | boolean | no | false |  |
| at | timestamp with time zone | no | now() |  |

*Constraints of mnt_request_event:* ck_mnt_event_content (CHECK): CHECK (((text IS NOT NULL) OR (message IS NOT NULL)))

*Table* `mnt_request_photo` (2 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| request_id | bigint | no |  | PK, FK → mnt_request |
| file_id | bigint | no |  | PK, FK → shared_file |

**Notifications (NTF): 9 tables**

*Table* `ntf_announcement` (16 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| category | character varying(12) | no |  |  |
| audience | character varying(16) | no |  |  |
| term_id | bigint | yes |  | FK → cfg_term |
| title | character varying(200) | no |  |  |
| title_vi | character varying(200) | no |  |  |
| body | character varying(4000) | no |  |  |
| body_vi | character varying(4000) | no |  |  |
| changes | jsonb | yes |  |  |
| link | character varying(300) | yes |  |  |
| pinned | boolean | no | false |  |
| shown_from | timestamp with time zone | no | now() |  |
| shown_until | timestamp with time zone | yes |  |  |
| source | character varying(14) | no |  |  |
| created_by | bigint | yes |  | FK → auth_user |
| created_at | timestamp with time zone | no | now() |  |

*Constraints of ntf_announcement:* ck_announcement_term (CHECK): CHECK ((((audience)::text <> 'TERM_APPLICANTS'::text) OR (term_id IS NOT NULL))) · ck_announcement_window (CHECK): CHECK (((shown_until IS NULL) OR (shown_until > shown_from))) · ntf_announcement_audience_check (CHECK): CHECK (((audience)::text = ANY ((ARRAY['ALL_STUDENTS'::character varying, 'RESIDENTS'::character varying, 'BLOCK_RESIDENTS'::character varyi… · ntf_announcement_category_check (CHECK): CHECK (((category)::text = ANY ((ARRAY['REGISTRATION'::character varying, 'FINANCE'::character varying, 'RULES'::character varying, 'OPERATI… · ntf_announcement_source_check (CHECK): CHECK (((source)::text = ANY ((ARRAY['TERM_PUBLISHED'::character varying, 'TERM_CHANGED'::character varying, 'POLICY_CHANGED'::character var…

*Table* `ntf_announcement_block` (2 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| announcement_id | bigint | no |  | PK, FK → ntf_announcement |
| building_id | bigint | no |  | PK, FK → inv_building |

*Table* `ntf_announcement_read` (3 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| announcement_id | bigint | no |  | PK, FK → ntf_announcement |
| user_id | bigint | no |  | PK, FK → auth_user |
| read_at | timestamp with time zone | no | now() |  |

*Table* `ntf_device` (8 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| user_id | bigint | no |  | FK → auth_user |
| token | character varying(4096) | no |  |  |
| token_hash | character(64) | no |  |  |
| platform | character varying(8) | no |  |  |
| created_at | timestamp with time zone | no | now() |  |
| last_seen_at | timestamp with time zone | no | now() |  |
| disabled_at | timestamp with time zone | yes |  |  |

*Constraints of ntf_device:* ntf_device_platform_check (CHECK): CHECK (((platform)::text = ANY ((ARRAY['ANDROID'::character varying, 'WEB'::character varying])::text[]))) · ntf_device_token_hash_key (UNIQUE): UNIQUE (token_hash)

*Table* `ntf_email_campaign` (16 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| mode | character varying(10) | no |  |  |
| term_id | bigint | yes |  | FK → cfg_term |
| recipient_group | character varying(40) | yes |  |  |
| building_id | bigint | yes |  | FK → inv_building |
| gender | character(1) | yes |  |  |
| student_id | bigint | yes |  | FK → auth_user |
| template_key | character varying(60) | no |  | FK → ntf_email_template |
| subject | character varying(200) | no |  |  |
| channel | character varying(12) | no |  |  |
| send_at | timestamp with time zone | no |  |  |
| status | character varying(10) | no | 'QUEUED'::character varying |  |
| queued_count | integer | no | 0 |  |
| sent_count | integer | no | 0 |  |
| created_by | bigint | no |  | FK → auth_user |
| created_at | timestamp with time zone | no | now() |  |

*Constraints of ntf_email_campaign:* ck_campaign_one (CHECK): CHECK ((((mode)::text <> 'ONE'::text) OR (student_id IS NOT NULL))) · ntf_email_campaign_channel_check (CHECK): CHECK (((channel)::text = ANY ((ARRAY['EMAIL'::character varying, 'EMAIL_PUSH'::character varying])::text[]))) · ntf_email_campaign_gender_check (CHECK): CHECK ((gender = ANY (ARRAY['M'::bpchar, 'F'::bpchar]))) · ntf_email_campaign_mode_check (CHECK): CHECK (((mode)::text = ANY ((ARRAY['ONE'::character varying, 'GROUP'::character varying])::text[]))) · ntf_email_campaign_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['QUEUED'::character varying, 'SENDING'::character varying, 'SENT'::character varying, 'FAILED'::charact…

*Table* `ntf_email_outbox` (12 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| campaign_id | bigint | yes |  | FK → ntf_email_campaign |
| to_email | character varying(254) | no |  |  |
| subject | character varying(200) | no |  |  |
| body_html | text | no |  |  |
| status | character varying(8) | no | 'PENDING'::character varying |  |
| attempts | smallint | no | 0 |  |
| last_error | character varying(1000) | yes |  |  |
| not_before | timestamp with time zone | no | now() |  |
| created_at | timestamp with time zone | no | now() |  |
| sent_at | timestamp with time zone | yes |  |  |
| demo_recipient | boolean | no | false |  |

*Constraints of ntf_email_outbox:* ntf_email_outbox_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'SENT'::character varying, 'FAILED'::character varying])::text[])))

*Table* `ntf_email_template` (8 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| key | character varying(60) | no |  | PK |
| name | character varying(150) | no |  |  |
| subject | character varying(200) | no |  |  |
| body_html | text | no |  |  |
| transactional | boolean | no | false |  |
| updated_at | timestamp with time zone | no | now() |  |
| subject_vi | character varying(200) | yes |  |  |
| body_html_vi | text | yes |  |  |

*Table* `ntf_notification` (10 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| user_id | bigint | no |  | FK → auth_user |
| event_key | character varying(60) | no |  |  |
| title | character varying(200) | no |  |  |
| body | character varying(1000) | no |  |  |
| link | character varying(300) | yes |  |  |
| created_at | timestamp with time zone | no | now() |  |
| read_at | timestamp with time zone | yes |  |  |
| title_vi | character varying(200) | yes |  |  |
| body_vi | character varying(1000) | yes |  |  |

*Table* `ntf_template` (11 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| key | character varying(60) | no |  | PK |
| event | character varying(150) | no |  |  |
| push | boolean | no | true |  |
| in_app | boolean | no | true |  |
| title_en | character varying(200) | no |  |  |
| title_vi | character varying(200) | no |  |  |
| body | character varying(1000) | no |  |  |
| variables | ARRAY | no | '{}'::text[] |  |
| updated_at | timestamp with time zone | no | now() |  |
| updated_by | bigint | yes |  | FK → auth_user |
| body_vi | character varying(1000) | no |  |  |

**Family Day (VIS): 4 tables**

*Table* `vis_family_day` (18 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no | nextval('vis_family_day_id_seq'::regclas | PK |
| building_id | bigint | no |  | FK → inv_building |
| title | character varying(120) | no |  |  |
| description | character varying(2000) | yes |  |  |
| area | character varying(200) | no |  |  |
| registration_opens_at | timestamp with time zone | no |  |  |
| registration_closes_at | timestamp with time zone | no |  |  |
| max_guests | integer | no |  |  |
| status | character varying(20) | no | 'DRAFT'::character varying |  |
| created_by | bigint | no |  | FK → auth_user |
| created_at | timestamp with time zone | no |  |  |
| published_at | timestamp with time zone | yes |  |  |
| cancelled_at | timestamp with time zone | yes |  |  |
| cancel_reason | character varying(500) | yes |  |  |
| closed_at | timestamp with time zone | yes |  |  |
| closed_by | bigint | yes |  | FK → auth_user |
| close_note | character varying(500) | yes |  |  |
| version | bigint | no | 0 |  |

*Constraints of vis_family_day:* ck_vis_family_day_window (CHECK): CHECK ((registration_closes_at > registration_opens_at)) · vis_family_day_max_guests_check (CHECK): CHECK (((max_guests >= 1) AND (max_guests <= 10))) · vis_family_day_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'PUBLISHED'::character varying, 'CANCELLED'::character varying, 'COMPLETED'…

*Table* `vis_registration` (9 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no | nextval('vis_registration_id_seq'::regcl | PK |
| family_day_id | bigint | no |  | FK → vis_family_day |
| time_slot_id | bigint | no |  | FK → vis_time_slot |
| student_id | bigint | no |  | FK → auth_user |
| status | character varying(20) | no | 'APPROVED'::character varying |  |
| created_at | timestamp with time zone | no |  |  |
| cancelled_at | timestamp with time zone | yes |  |  |
| cancelled_by | bigint | yes |  | FK → auth_user |
| cancel_reason | character varying(500) | yes |  |  |

*Constraints of vis_registration:* vis_registration_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['APPROVED'::character varying, 'CANCELLED'::character varying])::text[])))

*Table* `vis_time_slot` (6 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no | nextval('vis_time_slot_id_seq'::regclass | PK |
| family_day_id | bigint | no |  | FK → vis_family_day |
| starts_at | timestamp with time zone | no |  |  |
| ends_at | timestamp with time zone | no |  |  |
| capacity | integer | no |  |  |
| booked | integer | no | 0 |  |

*Constraints of vis_time_slot:* ck_vis_time_slot_capacity (CHECK): CHECK (((booked >= 0) AND (booked <= capacity))) · ck_vis_time_slot_order (CHECK): CHECK ((ends_at > starts_at)) · vis_time_slot_capacity_check (CHECK): CHECK (((capacity >= 1) AND (capacity <= 5000)))

*Table* `vis_visitor` (16 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no | nextval('vis_visitor_id_seq'::regclass) | PK |
| registration_id | bigint | no |  | FK → vis_registration |
| full_name | character varying(100) | no |  |  |
| relationship | character varying(40) | no |  |  |
| birth_year | integer | no |  |  |
| pass_token | character varying(64) | no |  |  |
| status | character varying(20) | no | 'NOT_ARRIVED'::character varying |  |
| checked_in_at | timestamp with time zone | yes |  |  |
| checked_in_by | bigint | yes |  | FK → auth_user |
| checked_out_at | timestamp with time zone | yes |  |  |
| checked_out_by | bigint | yes |  | FK → auth_user |
| check_out_note | character varying(500) | yes |  |  |
| overdue_reminded_at | timestamp with time zone | yes |  |  |
| overdue_reminders | integer | no | 0 |  |
| safety_confirmed_at | timestamp with time zone | yes |  |  |
| safety_note | character varying(500) | yes |  |  |

*Constraints of vis_visitor:* ck_vis_visitor_in (CHECK): CHECK ((((status)::text <> ALL ((ARRAY['CHECKED_IN'::character varying, 'CHECKED_OUT'::character varying])::text[])) OR (checked_in_at IS NO… · ck_vis_visitor_out (CHECK): CHECK ((((status)::text <> 'CHECKED_OUT'::text) OR (checked_out_at IS NOT NULL))) · vis_visitor_status_check (CHECK): CHECK (((status)::text = ANY ((ARRAY['NOT_ARRIVED'::character varying, 'CHECKED_IN'::character varying, 'CHECKED_OUT'::character varying, 'N…

**Shared: 2 tables**

*Table* `shared_audit_log` (11 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| at | timestamp with time zone | no | now() |  |
| actor_id | bigint | yes |  |  |
| actor_label | character varying(150) | no |  |  |
| action | character varying(60) | no |  |  |
| tone | character varying(10) | no | 'INFO'::character varying |  |
| object_type | character varying(40) | no |  |  |
| object_id | character varying(60) | yes |  |  |
| object_label | character varying(200) | yes |  |  |
| change | jsonb | yes |  |  |
| ip_address | character varying(45) | yes |  |  |

*Constraints of shared_audit_log:* shared_audit_log_tone_check (CHECK): CHECK (((tone)::text = ANY ((ARRAY['INFO'::character varying, 'SUCCESS'::character varying, 'WARNING'::character varying, 'DANGER'::characte…

*Table* `shared_file` (9 columns)

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | no |  | PK |
| storage_key | character varying(255) | no |  |  |
| original_name | character varying(255) | no |  |  |
| content_type | character varying(100) | no |  |  |
| size_bytes | bigint | no |  |  |
| sha256 | character(64) | no |  |  |
| owner_module | character varying(10) | no |  |  |
| created_by | bigint | yes |  |  |
| created_at | timestamp with time zone | no | now() |  |

*Constraints of shared_file:* shared_file_size_bytes_check (CHECK): CHECK ((size_bytes >= 0)) · shared_file_storage_key_key (UNIQUE): UNIQUE (storage_key)

**Views: 33** (the report views read by RPT and the views of each feature)

| View | Columns |
|---|---|
| rpt_v_allocation | id, term_id, student_id, bed_id, status, allocated_at, checked_in_at, ended_at, end_reason, resident_at, code_released_at, source, renewal, fee_paid_at, stay_id |
| rpt_v_application | id, code, term_id, student_id, student_name, student_code, gender, room_type_id, room_class_id, status, created_at, submitted_at, deposit_due_at, stay_terms |
| rpt_v_assignment_run | id, term_id, kind, status, started_at, input_count, proposed_count, conflict_count, waitlisted_count |
| rpt_v_assignment_run_block | run_id, building_id, status, submitted_at |
| rpt_v_bed | bed_id, bed, bed_status, room_id, room, room_status, oos_since, room_type_id, room_class_id, floor, building_id, block, gender, block_status |
| rpt_v_checklist | id, family_key, name, version, status |
| rpt_v_escalation | id, building_id, term_id, kind, source_type, source_code, title, why, tone, status, opened_at, link |
| rpt_v_fee_policy | policy_confirmed |
| rpt_v_invoice | id, code, term_id, student_id, student_name, student_code, gender, building_id, type, title, amount, status, issued_at, due_at, paid_at |
| rpt_v_late_check_in | id, allocation_id, status, created_at, source |
| rpt_v_maintenance | id, code, term_id, building_id, room_code, category, priority, urgency, source, status, assignee_id, reported_at, resolved_at, closed_at, sla_due_at |
| rpt_v_meter_period | id, building_id, label, period_start, period_end, closed_at |
| rpt_v_payment_claim | id, invoice_id, term_id, building_id, gender, type, amount, status, claimed_at, decided_at |
| rpt_v_proposal | run_id, building_id, bed_id, open_conflict, waitlisted |
| rpt_v_reconciliation_item | id, term_id, kind, grp, status, outcome, created_at, resolved_at |
| rpt_v_refund | id, term_id, student_id, building_id, source_type, amount, status, decided_at, gender |
| rpt_v_renewal | term_id, previous_term_id, opened_at, continuing, awaiting, closed_at, fees_issued_at, fees_closed_at |
| rpt_v_room_change | id, code, term_id, student_id, building_id, kind, status, submitted_at, decided_at |
| rpt_v_room_class | room_id, term_id, room_class_id |
| rpt_v_room_class_change | id, code, term_id, room_id, building_id, from_class_id, to_class_id, status, submitted_at, decided_at |
| rpt_v_routing_rule | building_id, request_type, scope, active |
| rpt_v_sla_policy | building_id, urgent_hours, normal_hours, room_change_hours |
| rpt_v_stay | id, student_id, first_term_id, last_term_id, committed_terms, terms_used, status, end_kind, started_at, ended_at |
| rpt_v_stay_request | id, code, term_id, student_id, building_id, kind, extra_terms, status, automatic, submitted_at, decided_at |
| rpt_v_swap | id, term_id, a_building_id, b_building_id, status, created_at, decided_at |
| rpt_v_term | id, code, name, status, stay_start, stay_end, registration_opens_at, registration_closes_at, results_published_at, balance_due_at, check_in_start, check_in_end, check_out_by, published_at, publish_at, requests_open_at, requests_close_at, decisions_due_at, reconciliation_due_at, fees_issue_at, fees_due_at, reserved_new_percent, deposit_percent, utility_deposit |
| rpt_v_term_price | term_id, room_type_id, room_class_id, price |
| rpt_v_term_request | id, code, term_name, status, term_id, created_at |
| rpt_v_term_room | term_id, room_id, used |
| rpt_v_termination | id, allocation_id, term_id, student_id, reason, status, started_at, move_out_by, ended_at |
| rpt_v_user | id, role, status, last_sign_in_at |
| rpt_v_user_block | user_id, building_id |
| rpt_v_utility_warning | id, allocation_id, student_id, term_id, building_id, level, issued_at, closed_at, closed_reason |
