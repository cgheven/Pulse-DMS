-- Backfill is_sales_rep = true for active sales team members whose flag was not set.
-- Scoped to profiles with NO shop_id and NOT is_admin to prevent accidentally
-- demoting/altering shop owners or admins who may also appear in a sales team.

UPDATE dms_profiles
SET is_sales_rep = true
WHERE id IN (
  SELECT DISTINCT user_id
  FROM dms_sales_team_members
  WHERE is_active = true
)
AND (is_sales_rep IS NULL OR is_sales_rep = false)
AND (is_admin IS NULL OR is_admin = false)
AND shop_id IS NULL;
