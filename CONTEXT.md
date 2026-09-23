# Trade Context

Quantitative trading research and backtest platform for A-share mainboard (paper-only execution today). Built on Next.js 16 + Supabase Postgres + Vercel Cron. This file is a glossary; it does not specify implementation.

## Language

### Strategy DSL

**Strategy**:
A user-defined trading rule persisted as a JSON spec in `trade260915a_strategies.spec`, composed of three blocks: `entry`, `exit`, and `holding`.
_Avoid_: algorithm, model, system

**ConditionsBlock**:
A combinator (`AND` | `OR`) plus a list of conditions that compose one of the entry or exit blocks of a strategy.
_Avoid_: rule set, predicate list

**Condition**:
A single clause `{ factor, params, comparator, threshold }`. Comparators are `>`, `<`, `>=`, `<=`, `cross_up`, `cross_down`.
_Avoid_: predicate, rule, signal

**Factor**:
A named numeric compute function registered in [src/lib/factors/registry.ts](src/lib/factors/registry.ts), evaluated per bar set. Today: `RETURN_5D`, `RETURN_20D`, `RETURN_60D`, `MA_CROSS`, `VOLUME_RATIO`, `PE_TTM`.
_Avoid_: indicator, signal, feature

**RebalanceIntent**:
The output of strategy evaluation on a single trading day — the list of symbols to BUY or SELL with target weights. Feeds both the backtest engine and the paper-trading pipeline.
_Avoid_: trade list, order list

### Data and adapters

**Daily Bar**:
One trading day's OHLCV plus amount for one symbol. Stored in `trade260915a_quant_daily_bars` keyed by `(symbol_code, trade_date)`.
_Avoid_: candle, kline, daily candle

**Minute Bar**:
One minute's OHLCV plus amount for one symbol. Stored in `trade260915a_quant_minute_bars`.
_Avoid_: tick, intraday bar

**MockDataProvider**:
The sole implementation of `MarketDataProvider`. Deterministic geometric Brownian motion, ±10% daily limit, deterministic by symbol code. Placeholder for real `tushare` / `akshare` adapters planned in [src/lib/data/provider.ts](src/lib/data/provider.ts).
_Avoid_: mock data, fake data, test data

**mockEpsTTM**:
A deterministic hash pseudo-value used by the `PE_TTM` factor. Explicit placeholder until real fundamental data is wired in.
_Avoid_: fake PE, mock EPS

**Paper Broker**:
The only broker implementation today ([src/lib/trading/adapters/paper.ts](src/lib/trading/adapters/paper.ts)). Reuses the backtest fill semantics. Adapter slots reserved for `ctp`, `xtp`, `uft` are not implemented.
_Avoid_: live broker, exchange adapter

### Backtest and risk

**Walk-forward**:
Rolling train / test evaluation expressed as a sequence of `(trainStart, trainEnd, oosStart, oosEnd)` windows. Configured as 12-month train + 3-month OOS for ML evaluation. Distinct from a single-interval backtest.
_Avoid_: rolling backtest, time-series split

**T+1 fill**:
Backtest and paper-broker fill semantics — BUY orders execute at the next session's `open`. Rejected at limit-up (open ≥ prevClose × 1.10) or limit-down.
_Avoid_: next-day fill, delayed fill

### ML extension

**ML signal**:
A probability in [0, 1] output by a trained ML model — concretely P(tomorrow's close > today's close). Wired into the strategy DSL via the `ML_PRED` factor.
_Avoid_: prediction, AI score, model output

**ML_PRED**:
The factor ID for an ML signal in the registry. Takes `params: { model_ref }`. Returns a sigmoid probability, or a sentinel value if no model is available.
_Avoid_: ML factor, model factor, AI factor

**model_ref**:
UUID pointing to one row of `trade260915a_ml_models`. Strategies reference trained models by `model_ref` rather than embedding artifacts.
_Avoid_: model id, model pointer, model reference

**Feature schema**:
The ordered list of feature names plus dtypes that a model expects, stored in `ml_models.feature_schema`. Used to compute features consistently at training and inference time.
_Avoid_: feature list, input schema, model features

**Sentinel value**:
A special return value (NaN) emitted by a factor when it cannot evaluate, for example `ML_PRED` with no model trained. `evaluateConditions` treats any NaN in a condition as false and logs a warning.
_Avoid_: missing signal, null signal, error value

**Walk-forward cadence**:
The schedule on which production models are retrained. Currently weekly (Sunday 02:00 cron) with a rolling 12-month training window.
_Avoid_: retrain schedule, refresh rate

**Point-in-time universe**:
The set of symbols that existed (listed and not yet delisted) at a given historical date. Critical for avoiding survivorship bias during ML training.
_Avoid_: trading universe, current symbols, all symbols