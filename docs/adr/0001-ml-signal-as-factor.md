# 0001 — ML signal lives as a factor in the existing strategy registry

The strategy DSL today evaluates a `ConditionsBlock` to a boolean over a closed set of six hand-coded factors in [src/lib/factors/registry.ts](src/lib/factors/registry.ts). To bring in machine-learned signals without rewriting the DSL or splitting strategy types, we register `ML_PRED` as a new factor that returns a sigmoid probability of "tomorrow's close > today's close." Strategies compose `ML_PRED` with existing factors through the same AND / OR / comparator primitives, and existing UI components only need a `model_ref` dropdown. This keeps the strategy surface area unchanged and lets us add more ML-derived factors (predicted volatility, predicted sector relative strength) later as separate factor IDs.

**Status**: accepted

**Considered Options**:

- Replace `evaluateConditions` with an ML-based signal generator: rejected — rule-based strategies still serve as a coarse filter and a clean rewrite would block incremental rollout and existing tests.
- Add a top-level `model_ref` field on `StrategySpec` that bypasses the conditions DSL: rejected — splits strategy behaviour into two incompatible paths and breaks the existing strategy form and risk-decision log.
- Keep ML outputs entirely outside the strategy system as a separate "alpha model": rejected — leaves ML signals ungrounded (no risk checks, no backtest integration), defeating most of the value.

**Consequences**:

- `evaluateConditions` in [src/lib/strategy/evaluate.ts](src/lib/strategy/evaluate.ts) must handle the NaN sentinel from `ML_PRED` (cold start / missing model). NaN condition results are treated as false and logged.
- The factor registry gains a runtime dependency on `onnxruntime-node` and on Supabase Storage for artifact loading. Acceptance tests must cover cold start, missing artifact, and load failure.
- Multiple ML factors (`ML_PRED_MOMENTUM`, `ML_PRED_REVERSAL`, etc.) can be added later as separate factor IDs without schema changes to `StrategySpec`.