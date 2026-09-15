-- 003_strategies.sql
-- 策略表。每条记录是用户的量化策略定义,spec JSONB 存 StrategySpec。

CREATE TABLE trade260915a_strategies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  spec        JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX trade260915a_strategies_user_id_idx ON trade260915a_strategies(user_id);
CREATE INDEX trade260915a_strategies_user_status_idx ON trade260915a_strategies(user_id, status);

-- updated_at 自动维护
CREATE OR REPLACE FUNCTION trade260915a_strategies_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trade260915a_strategies_updated_at
  BEFORE UPDATE ON trade260915a_strategies
  FOR EACH ROW EXECUTE FUNCTION trade260915a_strategies_touch_updated_at();

-- ============ RLS ============
ALTER TABLE trade260915a_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own strategies"
  ON trade260915a_strategies
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());