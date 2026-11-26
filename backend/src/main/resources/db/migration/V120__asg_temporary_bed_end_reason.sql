-- A Manager's temporary Bed on an escalated Room-Change Request moves the student at once (BE-OPS-21):
-- the Allocation left ends with reason TEMPORARY (its new one already has source TEMPORARY).
ALTER TABLE asg_allocation DROP CONSTRAINT ck_alloc_end_reason;
ALTER TABLE asg_allocation ADD CONSTRAINT ck_alloc_end_reason CHECK (end_reason IN ('CHECK_OUT', 'ROOM_CHANGE',
    'SWAP', 'CANCELLED', 'TERM_END', 'FORFEIT', 'END_OF_STAY', 'NOT_EXTENDED', 'FEE_NOT_PAID', 'NOT_ENROLLED',
    'TERMINATED', 'MOVE', 'TEMPORARY'));
