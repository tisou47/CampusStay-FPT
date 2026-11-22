-- A termination turns an existing pending check-out into a TERMINATION one; cancelling it puts the earlier reason
-- back instead of deleting the row (review finding BE-ASG-07).
ALTER TABLE asg_check_out ADD COLUMN previous_reason VARCHAR(40);
