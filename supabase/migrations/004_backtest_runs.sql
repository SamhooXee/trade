-- 004_backtest_runs.sql
-- 回测运行记录。每次用户对某个策略跑一次回测就一行。

CREATE TABLE trade260915a_backtest_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id   UUID NOT NULL REFERENCES trade260915a_strategies(id) ON DELETE CASCADE,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  initial_cash  NUMERIC(14, 2) NOT NULL CHECK (initial_cash > 0),
  status        TEXT NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'completed', 'failed')),
  result        JSONB,
  error_message TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  CHECK (end_date >= start_date)
);

CREATE INDEX trade260915a_backtest_runs_user_id_idx
  ON trade260915a_backtest_runs(user_id);
CREATE INDEX trade260915a_backtest_runs_strategy_id_idx
  ON trade260915a_backtest_runs(strategy_id);
CREATE INDEX trade260915a_backtest_runs_user_started_idx
  ON trade260915a_backtest_runs(user_id, started_at DESC);

-- ============ RLS ============
ALTER TABLE trade260915a_backtest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own backtest runs"
  ON trade260915a_backtest_runs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());