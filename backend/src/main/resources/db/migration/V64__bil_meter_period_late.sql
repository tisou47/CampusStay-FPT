-- =====================================================================
-- CampusStay FPT — V64: months whose meter period is not closed (review
-- item R-27, 30/10/2026). Utility Invoices are issued only when Staff
-- close a Block's month (D-16); once the month ended more than
-- utility.close_days ago, the Overviews of Staff and Managers show it and
-- the Block's Staff are reminded once a day (METER_PERIOD_LATE).
-- =====================================================================

INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, sort_order, settings_group, used_in) VALUES
  ('utility.close_days', 'Deadlines and reminders', 'Days after a month ends to close its meter period',
     'INT', '3', NULL, 44, 'DEADLINES', 'Meter readings: Staff and Manager Overviews, daily reminders to Staff')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE bil_meter_period ADD COLUMN reminded_on DATE;  -- campus day of the last reminder to the Block's Staff

INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('METER_PERIOD_LATE', 'A month ended and its meter period is still open', TRUE,
     'Close the meter period {{period}} · Block {{block}}', 'Hãy chốt kỳ điện nước {{period}} · Block {{block}}',
     'The month {{period}} ended {{days}} days ago and Block {{block}} has not closed it. Enter the missing readings and close the period: its residents get no Utility Invoice until then.',
     'Tháng {{period}} đã kết thúc {{days}} ngày nhưng Block {{block}} chưa chốt kỳ. Hãy nhập các chỉ số còn thiếu và chốt kỳ: sinh viên chỉ nhận hóa đơn điện nước sau khi chốt.',
     '{period,block,days}')
ON CONFLICT (key) DO NOTHING;

CREATE VIEW rpt_v_meter_period AS
SELECT id, building_id, label, period_start, period_end, closed_at
FROM bil_meter_period;
