# 0002 — ML strategies are evaluated via walk-forward, not a single backtest interval

The existing [runBacktest](src/lib/backtest/engine.ts) takes a single `[startDate, endDate]` interval, which is sufficient for deterministic rule-based strategies but unsafe for ML models: a single train / test split is highly optimisable, and a model that beats one window is not evidence. ML strategies instead walk forward through history in 12-month train + 3-month OOS windows; each window produces its own metrics and the harness aggregates them into a final report. Walk-forward is a prerequisite for trustworthy IC / AUC numbers, because IC over a single window is too noisy to interpret.

**Status**: accepted

**Considered Options**:

- Single train / test split (e.g. 2020-2023 train, 2024 test): rejected — this is the canonical pitfall in ML quant research; one good split is cheap to find and tells us nothing about deployment.
- Time-series cross-validation (e.g. `sklearn.TimeSeriesSplit` with non-overlapping folds): rejected — does not reflect deployment, where exactly one model trains on the most-recent window.
- Combinatorially-Purged Cross-Validation with PBO (López de Prado): deferred — strictly more rigorous, but the harness complexity is reserved for the next phase once we have baseline walk-forward working.

**Consequences**:

- The `BacktestEngine` itself does not need to change; only the orchestration around it. A new `WalkForwardHarness` invokes `runBacktest` per OOS window and writes an `oos_metrics` field into the existing `BacktestRun.result` JSONB.
- Each walk-forward window also gates production-model training. The weekly retrain cron produces a candidate model per window; only the latest becomes `status='active'`.
- Walk-forward windows must use a point-in-time universe — training on the symbol list that existed on `trainStart` — or survivorship bias will inflate every reported metric.