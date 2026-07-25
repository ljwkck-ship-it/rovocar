# RoVoCar CSV Maker — implementation decisions

Last checked: 2026-07-19

## Current choices

- **Frontend:** a static, mobile-first Vite application. It does not contain a Gemini key, Supabase service-role key, or a fallback API key.
- **OCR model:** `gemini-2.5-flash` through the Gemini Developer API, chosen for multimodal image input and structured JSON output. The final model name must be checked again immediately before deployment because availability and quotas change.
- **Key handling:** Gemini limits are applied **per project, not per API key**. Keep `GEMINI_API_KEY_PRIMARY` as the only active Edge Function secret. A second key is useful only as a manual emergency/rotation replacement; it must not be auto-used after HTTP 429 because it shares the same project quota. It is never exposed, logged, or sent to the browser.
- **Structured response:** `application/json` response MIME type plus a JSON Schema; the Edge Function validates the returned value again before responding to the browser.
- **Input:** one `image/jpeg`, `image/png`, or `image/webp` file. HEIC is explicitly rejected with a JPEG conversion/reselection message. The initial server-side maximum is **8 MiB**, configured by `MAX_IMAGE_BYTES` rather than trusted from the browser. Set `MAX_REQUEST_BYTES` to at least the Base64 JSON overhead for that image size (initially `11500000`) so the function rejects oversized bodies before JSON parsing.
- **Expected page density:** a normal family worksheet is about **80 English/Korean pairs in one photo**. The extraction contract permits up to 150 rows so a typical page is not truncated; 80-pair pages are the baseline for real-photo acceptance tests.
- **Usage policy:** defaults are defined only as deploy-time settings (`OCR_DAILY_LIMIT`, `OCR_MINUTE_LIMIT`). Set the actual family limit after checking the project-specific Gemini quota page; the API rate limits differ by model, tier, and project.
- **Hosting/auth URLs:** not selected yet. Before deploying, add the exact production origin and `http://localhost:5173` to Supabase Auth redirect URLs and `ALLOWED_ORIGINS` for the Edge Function.

## Official references checked

- [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding) — supported image MIME types and image input approaches.
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) — JSON schema output configuration and supported schema subset.
- [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) and [pricing](https://ai.google.dev/gemini-api/docs/pricing) — quota and data-use policy are tier-dependent; free-tier prompts may be used to improve products, while paid-tier terms differ.
- [Supabase Edge Function limits](https://supabase.com/docs/guides/functions/limits) — hosted runtime limits, including 256 MB memory and plan-specific wall-clock limits.

## Deployment prerequisites (not secrets)

1. The existing AI Studio `Default Gemini Project` is sufficient. Create one new restricted key for this service and put it only in Supabase Edge Function secrets as `GEMINI_API_KEY_PRIMARY`. Optionally create a second key and store it securely for manual rotation; do not use a second same-project key as quota failover.
2. Set `ALLOWED_ORIGINS`, `OCR_DAILY_LIMIT`, `OCR_MINUTE_LIMIT`, `MAX_IMAGE_BYTES`, and `MAX_REQUEST_BYTES` for the function. Supabase provides its URL and service-role credential inside the function runtime; no value belongs in this repository except safe browser publishable settings at build/deploy time.
3. Apply `supabase/migrations/20260719000000_ocr_usage.sql`, deploy `extract-vocabulary`, and configure Kakao OAuth redirect URLs.
4. Verify five real photographs and the target RoVoCar importer before turning on the production button.
