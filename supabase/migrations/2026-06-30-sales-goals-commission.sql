-- Add plan_type to leads (monthly / annual subscription sold)
ALTER TABLE dms_leads
  ADD COLUMN IF NOT EXISTS plan_type TEXT
  CHECK (plan_type IN ('monthly', 'annual'));

-- Add goals and commission columns to sales team members
ALTER TABLE dms_sales_team_members
  ADD COLUMN IF NOT EXISTS monthly_commission_pct NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (monthly_commission_pct >= 0 AND monthly_commission_pct <= 100),
  ADD COLUMN IF NOT EXISTS annual_commission_pct NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (annual_commission_pct >= 0 AND annual_commission_pct <= 100),
  ADD COLUMN IF NOT EXISTS monthly_deal_target INTEGER NOT NULL DEFAULT 0
    CHECK (monthly_deal_target >= 0),
  ADD COLUMN IF NOT EXISTS monthly_revenue_target NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (monthly_revenue_target >= 0);
