-- 007_quant_ingest_setup.sql
-- Phase 0 补强: 两件事一起做,保证首次 ingest-daily cron 只补 2025 起的业务数据,
-- 不会试图写 1970~2024 的"全历史"。
--
-- 1) 为 trade260915a_quant_daily_bars / trade260915a_quant_minute_bars
--    增加 DEFAULT 分区,作为兜底防止后续 trade_date 落在 RANGE 分区外时报错
--    (Postgres: no partition of relation found for row)。
--    DEFAULT 优先级低于其他 RANGE 分区,后续添加 _2027 等不会受影响。
--
-- 2) 覆盖 002 中写入的初始游标 '1970-01-01',改成业务起点 '2025-01-01'。
--    002 的 INSERT 是为了满足 NOT NULL,此处 UPDATE 才是真正的业务语义。
--    幂等: 重复执行结果一致。

CREATE TABLE trade260915a_quant_daily_bars_default
  PARTITION OF trade260915a_quant_daily_bars DEFAULT;

CREATE TABLE trade260915a_quant_minute_bars_default
  PARTITION OF trade260915a_quant_minute_bars DEFAULT;

UPDATE trade260915a_quant_ingest_state
SET last_synced_at = '2025-01-01 00:00:00+00'
WHERE data_type IN ('daily', 'minute');