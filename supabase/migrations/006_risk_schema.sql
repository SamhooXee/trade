-- 006_risk_schema.sql
-- Phase 4: 风控所需的 equity snapshots 表。

CREATE TABLE trade260915a_portfolio_equity_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES trade260915a_portfolios(id) ON DELETE CASCADE,
  trade_date   DATE NOT NULL,
  equity       NUMERIC(14, 2) NOT NULL,
  cash         NUMERIC(14, 2) NOT NULL,
  market_value NUMERIC(14, 2) NOT NULL,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, trade_date)
);

CREATE INDEX trade260915a_equity_snapshots_portfolio_idx
  ON trade260915a_portfolio_equity_snapshots(portfolio_id, trade_date DESC);
CREATE INDEX trade260915a_equity_snapshots_user_idx
  ON trade260915a_portfolio_equity_snapshots(user_id, trade_date DESC);

ALTER TABLE trade260915a_portfolio_equity_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own equity snapshots"
  ON trade260915a_portfolio_equity_snapshots FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own equity snapshots"
  ON trade260915a_portfolio_equity_snapshots FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- service_role 走单独的 policy(全权,绕过 user_id 校验,cron 用)
CREATE POLICY "Service role manages equity snapshots"
  ON trade260915a_portfolio_equity_snapshots FOR ALL TO service_role
  USING (true) WITH CHECK (true);