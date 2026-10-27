# Human Gate v2 participant surface

**Status: TEST_ONLY static shell.** No real participants, consent records, or production collection are enabled.

## Run

```bash
npm install
npm run dev
npm run build
```

The current shell uses `src/fixture.ts` only. A deployment must replace the fixture adapter with a server API that:

1. creates a session and records consent server-side;
2. returns only vignette/facts before `pre_ai_judgment_submitted`;
3. assigns `HG2-C0_STANDARD_RAG`, `HG2-C1_COMPETITIVE`, or `HG2-C2_COMPETITIVE_AUDIT` from a server seed;
4. returns the condition and condition-specific artifact only after unlock;
5. writes append-only events through the backend/Supabase boundary.

The browser must never choose a condition. Do not put a Supabase service-role key, model key, Gold, adjudication labels, relevance labels, or correctness labels in this bundle. `VITE_*` values are public; use only a Supabase URL and anon/publishable key after the backend/RLS contract is deployed.

## Frozen artifacts

Build participant payloads with `tools/build_human_gate_v2_artifacts.py`. Copy a generated version directory under a static artifact host only after checking its `EXPERIMENT_ARTIFACT_MANIFEST.json` hashes. The frontend may consume the vignette, challenge, and condition artifacts; it must not consume Gold or offline evaluation files.

## Flow

`welcome → vignette → pre_ai → ai → post_ai → challenge → final → manipulation → complete`

This client-side flow is a usability guard only. The server is authoritative for order, condition, server timestamps, event hash-chain, and lock. The displayed condition is intentionally absent before unlock.

Release deployment uses `supabase/migrations/20261027000000_hg2_release_readiness.sql`
and `supabase/functions/hg2-api/index.ts`. The Edge Function uses the caller JWT
and security-definer RPCs; service-role credentials are not sent to the browser.
