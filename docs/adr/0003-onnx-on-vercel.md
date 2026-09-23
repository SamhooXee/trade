# 0003 — Models train locally in Python, deploy as ONNX, and infer in Next.js via onnxruntime-node

Vercel-hosted Next.js cannot host a long-running Python ML service, and standing one up just for inference adds operational burden (auth, scaling, separate observability stack). Instead, models are trained offline in Python with LightGBM (`binary` objective, sigmoid output layer), exported to ONNX, uploaded to Supabase Storage, and loaded at inference time by `onnxruntime-node` inside the factor registry. Inference stays on the same deployment surface as the rest of the app, at the cost of accepting Vercel's function-size and cold-start limits.

**Status**: accepted

**Considered Options**:

- Stand up a FastAPI Python service for inference, called from Next.js: rejected — adds an independent service to operate, observe, and authenticate against, with no clear benefit at our scale (~6000 symbols × 1 inference per trading day ≈ well under 100 ms total in a batched setup).
- Run inference in Supabase via pgvector / SQL ML extensions: rejected — operational novelty, weaker ecosystem, and ONNX-to-SQL tooling is thin and unstable.
- Client-side inference in the browser: rejected — backtests and cron jobs need server-side inference; client-side only covers interactive UI scenarios and adds no deployment simplification.

**Consequences**:

- `package.json` gains `onnxruntime-node` (~30 MB on disk). We must monitor Vercel's 50 MB function-size limit — if we exceed it, the fall-back is tree-shaking the runtime or moving the call to a small dedicated edge function.
- Training becomes a separate process owned by ML engineers. The hand-off steps (run training, upload artifact to Supabase Storage, mark `ml_models.status='active'`) live in `scripts/train_ml.py` plus a wrapper script.
- ONNX opset version, LightGBM version, and `onnxruntime-node` version must be pinned together. Mismatches produce silent inference drift that walk-forward will surface eventually but localise poorly; CI must run a parity test (Python `onnxruntime` ↔ Node `onnxruntime-node`) on every artifact upload.