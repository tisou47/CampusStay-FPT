-- =====================================================================
-- CampusStay FPT — V32: Managers work for the whole dormitory (ADR-19,
-- Change Specification v2 D-09). Their Block links are removed; sessions
-- give Managers every active Block. Staff keep their Blocks.
-- =====================================================================

DELETE FROM auth_user_block ub
USING auth_user u
WHERE u.id = ub.user_id AND u.role = 'MANAGER';

UPDATE auth_user SET title = 'Dormitory Manager', updated_at = now()
WHERE role = 'MANAGER' AND title ~ '^Block [A-Z0-9]+ Manager$';
