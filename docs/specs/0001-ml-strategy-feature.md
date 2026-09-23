---
id: 0001
title: ML signal as a factor in the strategy DSL
status: ready-for-agent
created: 2026-09-23
labels: [ready-for-agent, ml, strategy, factor-registry, walk-forward, onnx]
adr_refs: [0001-ml-signal-as-factor, 0002-walk-forward-eval, 0003-onnx-on-vercel]
related_files:
  - src/lib/factors/registry.ts
  - src/lib/strategy/evaluate.ts
  - src/lib/strategy/types.ts
  - src/lib/backtest/engine.ts
  - src/lib/backtest/metrics.ts
  - src/lib/risk/engine.ts
  - src/lib/data/provider.ts
---

# 0001 — ML signal as a factor in the strategy DSL

## Problem Statement

The user has a quantitative trading system with rule-based strategies composed of AND / OR condition trees over a closed set of six hand-coded factors. They want to bring machine-learned signals into the system without rewriting the strategy DSL or splitting strategy types. The current DSL only supports rule-based composition; ML outputs must fit into the same evaluator with consistent risk checks, backtest integration, and UI presentation. The user also wants the evaluation methodology to be trustworthy — single-interval backtests overfit easily and silently in ML quant work, so ML strategies must walk forward through history.

## Solution

Register an `ML_PRED` factor in the existing factor registry. The factor returns a sigmoid probability P(tomorrow's close > today's close). Strategies compose `ML_PRED` with existing factors through the existing AND / OR / comparator primitives. Models train offline in Python (LightGBM, `binary` objective), export to ONNX with a sigmoid output layer, and upload to Supabase Storage. Inference runs in Next.js via `onnxruntime-node` with an LRU cache of loaded sessions. ML strategies are evaluated using 12-month train + 3-month OOS walk-forward windows; each window produces IC / AUC / decile-spread metrics aggregated into the backtest output. Cold start and missing-model cases return a NaN sentinel that `evaluateConditions` treats as false. Risk checks apply uniformly to ML signals.

## User Stories

### Strategy composition

1. As a strategy creator, I want to add an `ML_PRED` factor to my entry block, so I can use a learned signal alongside traditional indicators.
2. As a strategy creator, I want to compose `ML_PRED` with existing factors like `RETURN_20D` using AND / OR, so I can build hybrid rules.
3. As a strategy creator, I want to set a comparator (`>`, `<`, `cross_up`, etc.) and a numeric threshold on `ML_PRED`, so I can encode entry conditions the same way as any other factor.
4. As a strategy creator, I want to select which model version to use via a `model_ref` dropdown, so I can choose between models without editing raw JSON.
5. As a strategy creator, I want `ML_PRED` to default to threshold 0.5 with comparator `>`, so a freshly added ML factor behaves reasonably out of the box.

### Backtest and ML metrics

6. As a strategy creator, I want to run a backtest on a strategy that uses `ML_PRED`, so I can validate its historical performance.
7. As a strategy creator, I want to see IC (Pearson correlation between predicted P(up) and realised next-day return) in the backtest result, so I can judge whether the ML factor has monotonic relationship with outcomes.
8. As a strategy creator, I want to see ICIR (IC mean / IC std across OOS days), so I can judge signal stability.
10. As a strategy creator, I want to see AUC, so I can judge binary discrimination ability.
11. As a strategy creator, I want to see decile spread (mean return of decile-10 minus mean return of decile-1 across OOS days), so I can judge tail behaviour.
12. As a strategy creator, I want to see signal coverage (fraction of trading days where ML_PRED passes its threshold), so I can understand how active the strategy is.
13. As a strategy creator, I want the backtest to fail loudly with a clear error when the referenced model is missing, so I never silently get wrong results.

### Walk-forward evaluation

14. As a strategy creator, I want a backtest to walk forward in 12-month train + 3-month OOS windows, so I can trust that metrics are not overfit to one interval.
15. As a strategy creator, I want each walk-forward window to be evaluated independently, so I can see model behaviour across market regimes.
16. As a strategy creator, I want walk-forward metrics aggregated into a final report (mean IC, mean decile spread, etc.), so I can compare strategies at a glance.
17. As a strategy creator, I want per-window metrics persisted in the backtest result, so I can drill into individual windows.

### Model training and lifecycle

18. As an ML engineer, I want to train a LightGBM binary classifier on the top-100 most liquid A-share symbols, so the model learns from tradable names.
19. As an ML engineer, I want to use the existing 6 hand-coded factors plus 14–24 derived OHLCV features (rolling volatility, RSI, multi-window momentum, turnover) as input features, so the model has rich signal.
20. As an ML engineer, I want to label each training row with the next-day close-to-close return sign, so the model learns the same target it will predict at inference.
21. As an ML engineer, I want to export the trained model to ONNX with a sigmoid output layer, so it runs in the Next.js runtime.
22. As an ML engineer, I want the training script to emit a `feature_schema` (ordered list of feature names with dtype), so the inference path knows exactly what features to compute.
23. As an ML engineer, I want to upload a trained ONNX artifact to Supabase Storage and register a row in `ml_models`, so a strategy can reference it by `model_ref`.
24. As an ML engineer, I want the retraining cron to produce a new `active` model weekly and supersede the previous one, so users always have a fresh model.
25. As an ML engineer, I want ONNX opset, LightGBM, and `onnxruntime-node` versions pinned together, so inference stays reproducible.

### Cold start and failure modes

26. As a strategy creator, I want a strategy that references a non-existent model to fail safely at inference (NaN sentinel, no entry), so I never get phantom trades.
27. As a strategy creator, I want a warning logged when an ML signal is dropped due to cold start or missing model, so I can see why a strategy is under-trading.
28. As an ML engineer, I want inference failures (corrupted artifact, version mismatch, OOM) to surface as typed errors with diagnostics, so I can debug them quickly.

### Risk engine and decision logging

29. As a strategy creator, I want ML signals to flow through the same risk checks (`maxPositions`, `positionSizePct`, `maxDrawdownPct`), so ML strategies obey the same discipline as rule-based ones.
30. As a strategy creator, I want the risk decision log to record ML signal values per symbol per day, so I can audit why a position was opened or closed.

### Feature engineering

31. As an ML engineer, I want features computed inside the ML factor at inference time using existing factor compute functions plus new OHLCV helpers, so the data flow stays straightforward.
32. As an ML engineer, I want training and inference to use the same feature computation logic, so train / inference skew is impossible.

## Implementation Decisions

### Schema and storage

- **New table**: `trade260915a_ml_models` with columns `model_id uuid pk`, `artifact_path text` (Supabase Storage), `feature_schema jsonb` (ordered feature names + dtypes), `hyperparams jsonb`, `train_metrics jsonb`, `oos_metrics jsonb`, `status text` (`active` | `superseded` | `failed`), `created_at timestamptz`, `notes text`. RLS by `user_id` for end-user models; service-role write paths for the retrain cron.
- **New table**: `trade260915a_ml_features` is **not** created in this spec — features are computed inline by the factor (decision Q15 in the design tree).
- **Backtest result extension**: `trade260915a_backtest_runs.result` gains `ml_metrics: { ic, icir, auc, decileSpread, signalCoverage }` and `oos_windows: [{ windowStart, windowEnd, metrics, tradesCount }]`.
- **Storage**: Supabase Storage bucket `trade260915a-ml-models/<model_id>.onnx`. The DB row stores the path; the artifact lives in Storage.
- **StrategySpec surface unchanged**: `ML_PRED`'s `params: { model_ref: '<uuid>' }` references a model. No top-level schema changes.

### New modules

- **ML factor** (`src/lib/factors/ml-predictor.ts`): registered as `ML_PRED`. Implements `compute(bars, params) -> number | NaN`. Loads ONNX session via `loadMlFactor` cache. Returns sigmoid probability in [0, 1], or NaN if model missing / inference fails. The factor's `paramsSchema` accepts `{ model_ref: string (uuid) }` only.
- **Model loader** (`src/lib/ml/onnx-loader.ts`): LRU cache keyed by `model_ref`. Loads artifacts from Supabase Storage, parses with `onnxruntime-node`, caches sessions. Exposes `loadMlFactor(modelRef): Promise<Session | null>`.
- **Walk-forward harness** (`src/lib/backtest/walk-forward.ts`): given a strategy spec and a date range, partitions into 12-month train + 3-month OOS windows, calls `runBacktest` for each, aggregates metrics, returns `WalkForwardResult`.
- **Feature computation** (`src/lib/ml/features.ts`): pure functions that compute the 20–30 features from a `DailyBar[]` window. Used by both training script and inference factor.
- **Training script** (`scripts/train_ml.py`): pulls data from Supabase Postgres, builds features + labels, trains LightGBM binary, exports ONNX (sigmoid output), uploads to Storage, inserts a row in `ml_models`. CLI flags for date range, universe size, hyperparams.
- **Walk-forward eval script** (`scripts/walk_forward_eval.py`): runs walk-forward over history, writes aggregated metrics, fails if IC or AUC under thresholds.

### ONNX contract

- Output is **sigmoid probability** in [0, 1] (decision Q14). Single scalar output tensor of shape `[1, 1]`.
- Input tensor shape `[1, num_features]`, dtype `float32`. Order and names match `feature_schema`.
- Opset version pinned (e.g. opset 17). `onnxruntime-node` version pinned (e.g. ^1.17).

### Walk-forward semantics

- Window: 12 months train, 3 months OOS, roll by 3 months.
- First window's train start = earliest available history (e.g. `ALL_START_DATE = 2025-01-01`, or earlier if real data extends back). If history is too short for even one full window, the spec defers to a future iteration; the harness should report an error rather than emit a partial window.
- Aggregation: IC and ICIR aggregate as **mean** across OOS windows; decile spread as **mean of per-window spread**; AUC as **mean**. Per-window metrics are also retained.
- Point-in-time universe: the harness filters symbols to those listed on each `trainStart`. First implementation may use a simplified approximation (drop symbols delisted before `trainStart`).

### Lifecycle

- Retrain cron: weekly, Sunday 02:00 (UTC). Creates a new row with `status='active'`, sets prior `active` rows to `status='superseded'`. Cron auth via existing `withCronGuard` wrapper.
- Inference is read-only at request time; only the retrain cron and ML engineers write to `ml_models`.

### Risk and cold start

- NaN condition results are treated as false in `evaluateConditions` (decision Q13).
- Risk engine (`src/lib/risk/engine.ts`) is unchanged in behavior; ML signals flow through the same checks as any other factor (decision Q18).
- Decision log gains an optional `mlSignalValue?: number` field per entry when the source condition is `ML_PRED`.

### UI

- `factor-selector.tsx`: add `ML_PRED` option with description "ML-predicted probability".
- `condition-row.tsx`: when factor is `ML_PRED`, show a `model_ref` dropdown populated from the user's `ml_models` where `status='active'`.
- Backtest result page: render `ml_metrics` and `oos_windows` in a new section.
- Strategy page: when an ML_PRED condition references a model that no longer exists or has `status='superseded'`, surface a non-blocking warning.

## Testing Decisions

### What makes a good test

- Test **external behaviour**, not implementation. For factors: the return value, not how the ONNX session was loaded. For the walk-forward harness: the aggregated metrics shape, not how `runBacktest` was called internally.
- **Deterministic fixtures**: small synthetic ONNX models for tests, not the real training output.
- **Hermetic DB / storage**: tests use the existing test DB setup; ONNX loader is mocked via `BacktestEngineDeps`-style injection.

### Seams

- **Existing seams to test through**:
  - `factorRegistry.compute(bars, params)` — single entry point for all factor unit tests; ML_PRED follows the same pattern as `RETURN_5D` etc.
  - `evaluateConditions(block, bars)` — covers NaN sentinel behaviour.
  - `runBacktest(input, deps)` with injected `loadBars` and (new) `loadMlFactor` — covers walk-forward integration.
  - Playwright UI flow — covers strategy form and backtest results rendering.

- **New seams**:
  - `loadMlFactor(modelRef): Session | null` (with internal LRU). Mocked in unit tests; real DI through `runBacktest` deps.
  - `walkForwardHarness(strategy, schedule): WalkForwardResult`. Mocked `runBacktest` per window in integration tests; real in E2E.

### Modules to test

| Module | Level | Coverage target |
|---|---|---|
| ML factor (`ML_PRED` compute) | Unit | Cold start (model missing) returns NaN; valid model returns probability in [0, 1]; inference error returns NaN with logged warning |
| Model loader (LRU) | Unit | First load fetches artifact; second load uses cache; eviction on LRU size |
| `evaluateConditions` with NaN condition | Unit | NaN-as-false for AND, NaN-as-false for OR, NaN with `cross_up` returns false |
| Walk-forward harness | Integration | Window generation; per-window runBacktest invocation count; aggregation math |
| Strategy form + model_ref dropdown | E2E (Playwright) | User selects ML_PRED, picks model_ref, saves strategy |
| Backtest result page | E2E (Playwright) | `ml_metrics` and `oos_windows` render with correct fields |
| Training script | Smoke (CI) | Train a tiny model (10 features, 1000 rows) end-to-end, verify ONNX upload + DB row |
| ONNX parity | Smoke (CI) | Same artifact evaluated by Python `onnxruntime` and Node `onnxruntime-node` produce identical outputs |

### Prior art in the codebase

- [src/lib/strategy/evaluate.ts](src/lib/strategy/evaluate.ts) — pure-function evaluator already covered by unit tests; the NaN-as-false addition follows the same test style.
- [src/lib/backtest/engine.ts](src/lib/backtest/engine.ts) — already takes `BacktestEngineDeps` for DI; the walk-forward harness uses the same injection.
- [src/lib/factors/registry.ts](src/lib/factors/registry.ts) — factor pattern exercised by `RETURN_5D` tests; ML_PRED follows the same contract.
- Existing Vitest setup under `coverage/` — extend rather than introduce a new test tool.

## Out of Scope

- **Live broker integration** (`ctp`, `xtp`, `uft`) — slots reserved but not implemented. This spec stops at paper execution.
- **Real data sources** (`tushare`, `akshare`) — current data is `MockDataProvider`. Models trained on mock data are not credible; this spec provides infrastructure but assumes real data lands before serious model evaluation. (User has begun experimentation under `tusharetest/`; this spec does not depend on it.)
- **Paper-trading cron integration** — Q1 decided ML connects to backtest, not paper cron. Cron-driven trading of ML strategies is a follow-up.
- **Model drift monitoring** — drift detection (e.g., live IC decay) is deferred until baseline walk-forward results exist.
- **Multiple ML factors** (`ML_PRED_MOMENTUM`, `ML_PRED_REVERSAL`) — architecture supports it; first spec delivers only `ML_PRED`.
- **Hyperparameter search** — first spec uses fixed conservative defaults (`num_leaves=31`, `learning_rate=0.05`, `n_estimators=200`, `min_child_samples=20`, `is_unbalance=True`). Grid / Bayesian search is a follow-up.
- **LightGBM version migration** — pinned versions only; no upgrade path in this spec.
- **Multi-symbol training** — single binary objective per symbol per day; ranking / LambdaRank objectives deferred.

## Further Notes

- **Walk-forward aggregation method**: mean for IC, ICIR, AUC, decile spread. Configurable later via `WalkForwardConfig.aggregation: 'mean' | 'median' | 'weighted'`.
- **Survivorship bias**: walk-forward uses a point-in-time universe. First implementation uses listing status from the `quant_symbols` table at `trainStart`; a future iteration can pull actual delist dates.
- **Cold start UX**: a strategy whose ML factor returns NaN every day will produce zero trades. The strategy page should surface a banner ("this strategy references an unavailable model") so users don't mistake silence for "the strategy doesn't trade."
- **Opset / runtime parity**: CI runs a parity test (Python `onnxruntime` ↔ Node `onnxruntime-node`) on every artifact upload to surface silent version skew.
- **TypeScript strictness**: existing `tsconfig.json` is strict; new code must satisfy it. No `any` except at the ONNX boundary where it's annotated and isolated.
- **i18n**: new UI strings go through the `quant.*` locale files; both `zh` and `en` translations required (existing convention).

## Acceptance Criteria

For each ADR referenced, the implementation must demonstrate:

- **ADR-0001**: A strategy with an `ML_PRED` condition runs end-to-end through `evaluateConditions` → `runBacktest` and produces a backtest result. Missing model produces a backtest result with zero trades, no exceptions, and a logged warning.
- **ADR-0002**: A backtest run with `[startDate, endDate]` spanning more than one walk-forward window produces `oos_windows` with one entry per window and an aggregated `ml_metrics`. A backtest spanning less than one window produces a clear error, not a partial result.
- **ADR-0003**: An ONNX artifact uploaded to Supabase Storage can be loaded by `onnxruntime-node` and infer a number in [0, 1]. The Python training script and the Node factor produce identical numbers on a parity test fixture.