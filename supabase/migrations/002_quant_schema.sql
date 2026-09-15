-- 002_quant_schema.sql
-- 行情数据 schema。所有表带 trade260915a_ 前缀。

-- 股票元数据
CREATE TABLE trade260915a_quant_symbols (
  code         TEXT PRIMARY KEY,             -- "600000"
  market       TEXT NOT NULL CHECK (market IN ('SH', 'SZ')),
  name         TEXT NOT NULL,
  list_date    DATE NOT NULL,
  delist_date  DATE,
  is_mainboard BOOLEAN NOT NULL DEFAULT true,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 日线 (按月分区)
CREATE TABLE trade260915a_quant_daily_bars (
  symbol_code TEXT NOT NULL,
  trade_date  DATE NOT NULL,
  open        NUMERIC(12, 4) NOT NULL,
  high        NUMERIC(12, 4) NOT NULL,
  low         NUMERIC(12, 4) NOT NULL,
  close       NUMERIC(12, 4) NOT NULL,
  volume      BIGINT NOT NULL,
  amount      BIGINT NOT NULL,
  PRIMARY KEY (symbol_code, trade_date)
) PARTITION BY RANGE (trade_date);

-- 2025 年分区
CREATE TABLE trade260915a_quant_daily_bars_2025 PARTITION OF trade260915a_quant_daily_bars
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- 2026 年分区
CREATE TABLE trade260915a_quant_daily_bars_2026 PARTITION OF trade260915a_quant_daily_bars
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- 分钟线 (按月分区, 与日线同构 + trade_time)
CREATE TABLE trade260915a_quant_minute_bars (
  symbol_code TEXT NOT NULL,
  trade_date  DATE NOT NULL,
  trade_time  TIMESTAMPTZ NOT NULL,
  open        NUMERIC(12, 4) NOT NULL,
  high        NUMERIC(12, 4) NOT NULL,
  low         NUMERIC(12, 4) NOT NULL,
  close       NUMERIC(12, 4) NOT NULL,
  volume      BIGINT NOT NULL,
  amount      BIGINT NOT NULL,
  PRIMARY KEY (symbol_code, trade_date, trade_time)
) PARTITION BY RANGE (trade_date);

CREATE TABLE trade260915a_quant_minute_bars_2025 PARTITION OF trade260915a_quant_minute_bars
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

CREATE TABLE trade260915a_quant_minute_bars_2026 PARTITION OF trade260915a_quant_minute_bars
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- 数据同步状态 (用于增量入库的游标)
CREATE TABLE trade260915a_quant_ingest_state (
  data_type       TEXT PRIMARY KEY CHECK (data_type IN ('daily', 'minute')),
  last_synced_at  TIMESTAMPTZ NOT NULL
);

-- 初始化同步状态
INSERT INTO trade260915a_quant_ingest_state (data_type, last_synced_at) VALUES
  ('daily',  '1970-01-01 00:00:00+00'),
  ('minute', '1970-01-01 00:00:00+00');

-- ============ RLS ============
-- 行情数据所有登录用户可读,只有 service_role 可写。

ALTER TABLE trade260915a_quant_symbols       ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade260915a_quant_daily_bars    ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade260915a_quant_minute_bars   ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade260915a_quant_ingest_state  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read symbols"     ON trade260915a_quant_symbols
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth read daily"       ON trade260915a_quant_daily_bars
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth read minute"      ON trade260915a_quant_minute_bars
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth read ingest"      ON trade260915a_quant_ingest_state
  FOR SELECT TO authenticated USING (true);

-- 写权限仅 service_role (cron 用),authenticated 无写权限。
-- 不显式 grant 默认就是无权限。