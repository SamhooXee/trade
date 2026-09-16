-- 005_trading_schema.sql
-- 模拟交易 schema: portfolios / positions / orders / fills / strategy_run_log。

-- =============== portfolios ===============
CREATE TABLE trade260915a_portfolios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id   UUID NOT NULL REFERENCES trade260915a_strategies(id) ON DELETE CASCADE,
  cash          NUMERIC(14, 2) NOT NULL DEFAULT 1000000 CHECK (cash >= 0),
  initial_cash  NUMERIC(14, 2) NOT NULL DEFAULT 1000000,
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'paused', 'stopped')),
  stop_reason   TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at    TIMESTAMPTZ,
  UNIQUE (user_id, strategy_id)
);

CREATE INDEX trade260915a_portfolios_user_id_idx ON trade260915a_portfolios(user_id);
CREATE INDEX trade260915a_portfolios_status_idx ON trade260915a_portfolios(status);

-- =============== positions ===============
CREATE TABLE trade260915a_positions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id     UUID NOT NULL REFERENCES trade260915a_portfolios(id) ON DELETE CASCADE,
  symbol_code      TEXT NOT NULL,
  shares           INTEGER NOT NULL DEFAULT 0 CHECK (shares >= 0),
  available_shares INTEGER NOT NULL DEFAULT 0 CHECK (available_shares >= 0),
  cost_price       NUMERIC(12, 4) NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, symbol_code)
);

CREATE INDEX trade260915a_positions_portfolio_idx ON trade260915a_positions(portfolio_id);

-- =============== orders ===============
CREATE TABLE trade260915a_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id    UUID NOT NULL REFERENCES trade260915a_portfolios(id) ON DELETE CASCADE,
  symbol_code     TEXT NOT NULL,
  side            TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  shares          INTEGER NOT NULL CHECK (shares > 0),
  intended_price  NUMERIC(12, 4) NOT NULL,
  trade_date      DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'filled', 'rejected', 'cancelled')),
  reject_reason   TEXT,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  filled_at       TIMESTAMPTZ,
  filled_price    NUMERIC(12, 4),
  filled_shares   INTEGER,
  fee             NUMERIC(14, 2)
);

CREATE INDEX trade260915a_orders_portfolio_status_idx
  ON trade260915a_orders(portfolio_id, status);
CREATE INDEX trade260915a_orders_user_status_idx
  ON trade260915a_orders(user_id, status);

-- 幂等性: 同一 portfolio + symbol + side + 当日 trade_date 只能有一条 pending 订单
CREATE UNIQUE INDEX trade260915a_orders_pending_unique
  ON trade260915a_orders(portfolio_id, symbol_code, side, trade_date)
  WHERE status = 'pending';

-- =============== fills ===============
CREATE TABLE trade260915a_fills (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id  UUID NOT NULL REFERENCES trade260915a_portfolios(id) ON DELETE CASCADE,
  order_id      UUID NOT NULL REFERENCES trade260915a_orders(id) ON DELETE CASCADE,
  symbol_code   TEXT NOT NULL,
  side          TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  price         NUMERIC(12, 4) NOT NULL,
  shares        INTEGER NOT NULL,
  amount        NUMERIC(14, 2) NOT NULL,
  fee           NUMERIC(14, 2) NOT NULL,
  filled_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX trade260915a_fills_portfolio_filled_idx
  ON trade260915a_fills(portfolio_id, filled_at DESC);
CREATE INDEX trade260915a_fills_user_filled_idx
  ON trade260915a_fills(user_id, filled_at DESC);

-- =============== strategy_run_log ===============
CREATE TABLE trade260915a_strategy_run_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id   UUID NOT NULL REFERENCES trade260915a_portfolios(id) ON DELETE CASCADE,
  trade_date     DATE NOT NULL,
  run_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  signals_count  INTEGER NOT NULL DEFAULT 0,
  orders_count   INTEGER NOT NULL DEFAULT 0,
  notes          TEXT,
  UNIQUE (portfolio_id, trade_date)
);

CREATE INDEX trade260915a_strategy_run_log_portfolio_idx
  ON trade260915a_strategy_run_log(portfolio_id);

-- =============== RLS ===============
ALTER TABLE trade260915a_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade260915a_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade260915a_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade260915a_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade260915a_strategy_run_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own portfolios"
  ON trade260915a_portfolios FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage own positions"
  ON trade260915a_positions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage own orders"
  ON trade260915a_orders FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users view own fills"
  ON trade260915a_fills FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users view own strategy run logs"
  ON trade260915a_strategy_run_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());