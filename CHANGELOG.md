# Changelog

Git-level history of the repo: every branch, its commits, and the merge that
brought it into `main`. Newest first — add an entry each time a branch is
merged. For the prompt-by-prompt evolution of the tool, see
[HISTORY.md](HISTORY.md).

---

## feature/custom-scoring-profiles — 2026-07-14

Reusable custom scoring profiles. Developed on
`feature/custom-scoring-profiles`, merged into `main` (no-ff). HISTORY.md entry
42.

Highlights:

- Added Settings → Profiles with protected, inspectable built-in definitions
  followed by owner-scoped custom profiles supporting add, edit, and remove.
- Added validated percentage weights, semantic weight, and description, image,
  taxonomy, and title thresholds through authenticated CRUD APIs and SQLite
  migration 11.
- Integrated custom profiles into environment selection, new analyses, profile
  subtitles, immutable scoring metadata, and stored-fact recalculation.
- Versioned every custom-profile edit so historical analyses can be replayed
  with a newer revision of the same profile while retaining old snapshots.
- Reassigns environments to Balanced when a custom profile is removed without
  altering historical analyses; built-in mutation is blocked server-side.
- Displays profile names and versions in compact analysis headers while keeping
  internal IDs in the detailed metadata panel.
- Added `npm run test_scoring_profiles` for validation, CRUD, ownership,
  environment usage, revision replay, protected built-ins, and deletion safety.

## feature/settings-navigation — 2026-07-14

Grouped configuration navigation. Developed on
`feature/settings-navigation`, merged into `main` (no-ff). HISTORY.md entry 41.

Highlights:

- Reorganized the sidebar into Dashboard, New analysis, and a Settings group
  with Environments first and Models second.
- Preserved the existing `/environments` and `/settings` routes while renaming
  the model-configuration page heading from Settings to Models.
- Added semantic navigation labels, responsive nested-link styling, and mobile
  wrapping for the expanded navigation.
- Updated model setup and error guidance to direct users to Settings → Models.

## feature/ai-product-recommendations — 2026-07-14

Catalog-grounded product recommendations in AI Analysis. Developed on
`feature/ai-product-recommendations`, merged into `main` (no-ff). HISTORY.md
entry 40.

Highlights:

- Added a bounded catalog-shortlisting stage that combines shared taxonomy,
  title and description relevance, and commercial signals, then hydrates the
  strongest candidates with current BigCommerce product data in small batches.
- Extended structured AI output with up to five complementary, substitute,
  upgrade, or adjacent-use recommendations selected exclusively from real
  candidate IDs.
- Rejects unknown and duplicate model selections and attaches trusted titles,
  categories, prices, SKUs, IDs, and thumbnails on the server before saving.
- Added responsive linked recommendation cards with a product-specific reason,
  plus matching recommendation cards and safely loaded thumbnails in product
  PDF exports.
- Expanded product AI and product PDF integration fixtures, and visually
  verified every page of the enriched eight-page PDF report.

## feature/multiple-ai-models — 2026-07-14

Reusable AI model configurations and per-task selection. Developed on
`feature/multiple-ai-models`, merged into `main` (no-ff). HISTORY.md entry 39.

Highlights:

- Replaced the single global provider/model setting with named, owner-scoped
  Anthropic, OpenAI, and Ollama configurations supporting add, edit, remove,
  connection testing, readiness status, and exactly one default.
- Added backward-compatible import of existing settings, encrypted write-only
  credentials, provider-key isolation, and safe fallback promotion when the
  default configuration is removed through SQLite migration 10.
- Added explicit model selection to new semantic analyses and product AI
  Analysis runs, with the default preselected and an immutable configuration
  snapshot passed to background work.
- Persisted and displayed configuration name, provider, and model in analysis
  metadata, comparisons, product reviews, and all relevant PDF exports.
- Added `npm run test_llm_models` for CRUD, default invariants, ownership,
  migration, redaction, and safe local-provider validation, plus expanded AI,
  scoring-metadata, and PDF coverage.

## feature/product-ai-analysis — 2026-07-14

Rich on-demand product recommendations. Developed on
`feature/product-ai-analysis`, merged into `main` (no-ff). HISTORY.md entry 36.

Highlights:

- Added an authenticated, persisted AI Analysis for each analysis/product,
  generated with the Anthropic, OpenAI, or Ollama model selected in Settings.
- Uses the current full BigCommerce product when available and falls back to
  immutable analysis facts; outputs validated merchant-ready copy, derived
  fields, placement, feed/SEO data, priorities, risks, and follow-up questions.
- Added safe multimodal review for up to five BigCommerce CDN images, including
  quality scores, hero selection, missing shots, alt text, and the exact
  analyzed image thumbnail; unsupported vision input retries text-only.
- Streams real generation stages into the running UI and persists the latest
  completed review separately from scoring facts through SQLite migration 9.
- Shows an accessible AI sparkle beside analyzed products in All Products, Top
  Fixes, and comparison Product Changes, with report-specific comparison hints.
- Added AI SDK provider adapters, raised the Node.js requirement to 20, and
  introduced an integration test covering schemas, streaming, retrieval,
  ownership, persistence, image binding, comparison flags, and cascade cleanup.

## feat/scoring-version-metadata — 2026-07-14

Versioned scoring metadata, configuration comparison, and report exports.
Developed on `feat/scoring-version-metadata`, merged into `main` (no-ff);
merge hash backfilled next entry. HISTORY.md entry 35.

Highlights:

- Added an immutable per-analysis snapshot containing scoring schema, engine,
  and profile versions; dimension weights; thresholds; semantic weight; prompt
  version; and the applied semantic provider and model.
- Persisted snapshots through a SQLite migration and exposed them in analysis
  and comparison API payloads, including a compatibility result that identifies
  score-affecting configuration differences.
- Added compact three-line version context plus a complete metadata table to
  analysis pages, and a side-by-side comparison table with highlighted changes
  and legacy-analysis fallbacks.
- Included complete metadata tables in analysis PDFs and previous/current
  metadata with changed-row highlighting in comparison PDFs.
- Added scoring-compatibility tests and expanded both PDF smoke fixtures,
  including multi-page rendering and visual verification.

## feat/top-fixes-table-controls — 2026-07-14

Interactive Top Fixes table and export. Developed on
`feat/top-fixes-table-controls`, merged into `main` (no-ff); merge hash
backfilled next entry. HISTORY.md entry 34.

Highlights:

- Added product/SKU search, grade filtering, and sortable Product, SKU, Score,
  Grade, Impact, and Issues columns to Top Fixes.
- Added a top-right CSV action that exports every current match in the active
  sort order, using the same Excel-friendly format as All Products.
- Analysis reports show up to 100 matching products; environment overview
  pages retain a compact 15-row limit.
- Extracted the product CSV serializer so both export locations share column,
  escaping, BOM, and line-ending behavior.

## feat/comparison-table-exports — 2026-07-14

Comparison-table sorting and exports. Developed on
`feat/comparison-table-exports`, merged into `main` (no-ff); merge hash
backfilled next entry. HISTORY.md entry 33.

Highlights:

- Made every Product Changes column sortable, with score change descending as
  the default and visible ascending/descending indicators.
- Added an Excel-friendly CSV export containing every product matching the
  current search/status filters in the active sort order.
- Added an authenticated comparison PDF export with headline score, grade,
  and product-count changes; dimension, issue, and category tables; and the
  top 15 changed products ordered by score change descending.
- Added `npm run test_comparison_pdf_export` for a representative multi-page
  structural and visual smoke test.

## feat/analysis-comparison-picker — 2026-07-14

Expanded analysis comparison selection. Developed on
`feat/analysis-comparison-picker`, merged into `main` (no-ff); merge hash
backfilled next entry. HISTORY.md entry 32.

Highlights:

- Replaced the single "Compare with previous" link with a dropdown picker for
  up to ten preceding completed analyses from the same environment.
- Each option mirrors the analysis-history details: date, semantic-scoring
  badge, product count, score, grade, and duration.
- Added outside-click and Escape dismissal plus accessible menu semantics.

## feat/report-pdf-export — 2026-07-13

Completed-analysis PDF export. Developed on `feat/report-pdf-export`, merged
into `main` (no-ff); merge hash backfilled next entry. HISTORY.md entry 31.

Highlights:

- Added an authenticated `GET /api/analyses/[id]/pdf` endpoint and an
  "Export as PDF" action on completed report pages.
- Reports include headline health statistics, grade distribution and
  dimension charts, common issues, weakest categories, and the ten
  highest-impact fixes in a paginated A4 layout.
- Download names include the environment, UTC analysis timestamp, and short
  analysis id to remain unique across multiple runs per day.
- Added `npm run test_pdf_export`, which generates and structurally validates
  a representative report under the gitignored `tmp/pdfs/` directory.
- Kept PDFKit external to the Next.js server bundle so its built-in Helvetica
  metrics remain available at runtime.

## openai-judge-throttling — 2026-07-10

OpenAI semantic-judge robustness for model compatibility and rate limits.
Developed on `openai-judge-throttling`, merged into `main` (no-ff); merge hash
backfilled next entry. HISTORY.md entry 30.

Highlights:

- OpenAI judge now falls back from strict `response_format: json_schema` to
  JSON-object mode, then prompt-only JSON parsing, when the selected model
  does not support Structured Outputs.
- Added transient 429 retry handling using `retry-after-ms`, `retry-after`, or
  OpenAI's "try again in Xms" message, with a minimum wait to avoid retry
  churn.
- Added proactive OpenAI throttling: default one semantic chunk at a time with
  at least 500ms between requests. Overrides documented via
  `OPENAI_JUDGE_CONCURRENCY` and `OPENAI_JUDGE_MIN_DELAY_MS`.

## analysis-comparison — 2026-07-10

Analysis comparison workflow for completed runs from the same environment.
Developed on `analysis-comparison`, merged into `main` (no-ff); merge hash
backfilled next entry. HISTORY.md entry 29.

Highlights:

- Added `GET /api/analyses/compare?base=<id>&target=<id>` plus shared
  comparison helpers for summary, dimension, issue, category, and product
  diffs.
- Added `/analyses/compare` with score/grade/product-count cards, semantic
  comparability warning, dimension/issue/category tables, and product-level
  changed/added/removed/unchanged filtering.
- Added "Compare with previous" on completed analysis pages when an earlier
  completed run exists for the same environment.
- Polished the product comparison table so grade changes stay on one line and
  resolved/new issue columns stay compact.

## product-csv-export — 2026-07-10

Excel-friendly CSV export for analysis product lists. Developed on
`product-csv-export`, merged into `main` (no-ff); merge hash backfilled next
entry. HISTORY.md entry 28.

Highlights:

- Added an "Export as CSV" button to `/analyses/[id]/products` that exports
  all rows matching the current filters and sort, not just the visible page.
- CSV includes product id, product name, SKU, score, grade, impact, views,
  units sold, issue count, and a semicolon-separated list of human-readable
  issue labels.
- Output uses Excel-friendly CSV details: UTF-8 BOM, CRLF line endings,
  quoted cells, and basic formula-injection protection.

## review-hardening-fixes — 2026-07-10

Security/reliability fixes from a code review. Developed on
`review-hardening-fixes`, merged into `main` (no-ff); merge hash backfilled
next entry. HISTORY.md entry 27.

Highlights:

- Fixed legacy LLM secret encryption sweep so each user's `settings.llm` row
  is updated by `(user_id, key)`, avoiding cross-user settings overwrite when
  enabling `APP_ENCRYPTION_KEY` after multiple users exist.
- Restricted Ollama base URLs to local HTTP endpoints only (`localhost`,
  `127.0.0.1`, `[::1]`) and applied the same validation when saving settings,
  testing the connection, and running semantic scoring.
- Added a 30-second timeout to each BigCommerce API request so stalled
  upstream calls fail analyses cleanly instead of leaving jobs running
  indefinitely.

## refactor/central-api-client — 2026-07-09

Refactoring exercise plus a small incidental fix, merged into `main` (no-ff),
branch deleted after merge; merge hash backfilled next entry. HISTORY.md
entries 25–26.

Highlights:

- All browser-side `fetch("/api/…")` calls centralized in a new
  `apps/web/lib/api-client.js` (named function per endpoint, shared
  `request()` helper, typed `ApiError` carrying status + body). Call sites
  switched to try/catch; no behavior change. Commit `7d5d260`.
- Suppress the benign VWO (`vwo-smartcode-listener`) hydration warning on
  `<html>` via `suppressHydrationWarning` in `app/layout.js`. Commit
  `38720b9`.

## feat/semantic-badge — 2026-07-08

Two small features developed in one arc (entangled in the analysis/dashboard
page files, so committed together). Merged into `main` (no-ff), branch deleted
after merge; hashes backfilled next entry. HISTORY.md entries 23–24. (The
`feat/analysis-duration` branch had no commits of its own — the timing work
rode into this branch and is included here.)

Highlights:

- Per-analysis timing: total wall-clock + semantic-stage share, schema
  migration v5 (`analyses.duration_ms`, `semantic_ms`), shown in the analysis
  header and Duration columns.
- "✦ semantic" badge marking analyses that included the LLM scoring pass,
  across history/dashboard/latest-health/analysis-header.

## fix/ollama-error-detail — 2026-07-07

Surface Ollama's real error body (e.g. cloud-model subscription 403) instead
of a misleading "is it running?"; reserve that hint for genuine connection
failures. Commit `c9dde12`, merged into `main` as `4703287` (no-ff), branch
deleted after merge. HISTORY.md entry 22.

## feat/semantic-detail — 2026-07-07

Semantic review section on the product page (per-criterion verdict + reason),
plus judge robustness hardening for local/proxied models. Commit `dc11a8b`,
merged into `main` as `1784f86` (no-ff), branch deleted after merge.
HISTORY.md entry 21.

Highlights:

- Judge returns `{verdict, reason}` per criterion; schema migration v4 stores
  it (`analysis_products.semantic`); Semantic review section on the drill-down.
- Robustness: `num_predict` bump (truncation), lenient verdict validation,
  `parseJsonLoose` (code fences/prose), explicit output contract in the prompt
  (models that ignore the schema), and a retry pass for batch-omitted items.

## feat/auth-multitenancy — 2026-07-07

Two security/accounts features developed in one arc (entangled in db.js /
sqlite.js, so committed together). Commit `0017a3c`, merged into `main` as
`ded4696` (no-ff), branch deleted after merge. HISTORY.md entries 19–20.
(The `feat/token-encryption` branch had no commits of its own — the
encryption work rode into this branch and is included here.)

Highlights:

- **Secrets encrypted at rest** (AES-256-GCM, `lib/crypto.js`) keyed by
  `APP_ENCRYPTION_KEY`; `secureDb()` migrates legacy plaintext on first
  access and vacuums. Key lives in untracked `.env.local`.
- **Auth.js (NextAuth v5)**: Google SSO (company-domain restricted) +
  dev-login provider (non-prod); `middleware.js` gates pages, API routes
  return 401; `/signin` page + sidebar user menu (sticky).
- **Per-user multi-tenancy**: schema v3 (`users` + `user_id` ownership,
  per-user settings); all db.js functions scoped by user and threaded
  through routes/pages/runner; first sign-in claims pre-auth data.

## feat/product-details — 2026-07-07

Product-detail attributes, control-panel deep link, thumbnails, and
column sorting. Merged into `main` (no-ff), branch deleted after merge;
hashes backfilled in the next entry. HISTORY.md entry 18.

Highlights:

- Scoring engine records the raw attributes behind each score (description
  length + 255-char excerpt, thumbnail URL, images/alt, brand, custom
  fields + peer median, identifiers, variants, price/weight/stock) in a
  JSON `details` field per product row.
- First SQLite schema migration (`user_version` 1→2: `analysis_products.details`),
  plus a `getDb()` cache-heal so hot-reloaded dev servers apply new
  migrations without a restart.
- Drill-down page: Product details table above Issues, title deep-links to
  the BigCommerce control panel, main thumbnail top-left, description
  excerpt.
- Shared `ProductThumb` (with aligned placeholder) in the all-products table
  and Top-fixes tables; click-to-sort column headers on the all-products
  table (replaces the sort dropdown).

## feat/score-history-hover — 2026-07-07

Interactive score-history sparkline: hover a point for date, product count,
score, and grade; click through to that analysis. Keyboard-accessible hit
targets. Commit `459dd37`, merged into `main` as `4d29efc` (no-ff), branch
deleted after merge. HISTORY.md entry 17.

## feat/sqlite-store — 2026-07-07

SQLite replaces the JSON-file store. Commit `48857bf`, merged into `main`
as `ba3f27a` (no-ff), branch deleted after merge. HISTORY.md entry 16.

Highlights:

- better-sqlite3 (WAL) behind the unchanged `lib/db.js` function surface;
  `lib/sqlite.js` owns connection, schema, and append-only versioned
  migrations (`PRAGMA user_version`).
- Tables: environments, analyses (JSON summary/progress/catalog columns),
  analysis_products (per-product rows, FK cascade, indexed), settings.
- Legacy `data/db.json` auto-imports on first open (renamed to
  `db.json.migrated`); progress updates became single-row UPDATEs.

## feat/product-drilldown — 2026-07-07

Full product table with filters, per-product drill-down pages, and
channel-aware taxonomy. Commit `2a4f7ed`, merged into `main` as `80b42b3`
(no-ff), branch deleted after merge. HISTORY.md entries 12–14.

Highlights:

- Analyses persist full per-product rows; new products endpoint + table page
  (search / grade / issue / category filters, six sorts, pagination) and
  drill-down page (dimension bars with per-dimension scoring rubric
  popovers, issues with fix hints for all 27 codes, traffic & impact).
- Over-categorization is now judged per channel tree (multi-storefront):
  >5 categories within one tree flags, assignments across channels don't.
- Product page lists categories per channel (name, ID, count) using
  `/catalog/trees` + `/v3/channels` metadata persisted with each analysis.

## feat/semantic-scoring — 2026-07-07

Semantic scoring pass (LLM judge) with provider selection, plus in-progress
UX improvements found while testing. Commit `0c73369`, merged into `main`
as `c52368f` (no-ff), branch deleted after merge. HISTORY.md entries 7–11.

Highlights:

- Optional 6th "semantic" dimension (15%): LLM judges whether descriptions
  answer *what is it / who's it for / what's it made of*; `desc_*` issues.
- Provider-pluggable judge in `packages/core/src/semantic.js`: Anthropic
  (default `claude-opus-4-8`, structured outputs), OpenAI, Ollama (local,
  free), demo (simulated, free). Judge failures degrade to the 5-dimension
  report with a warning instead of failing the run.
- New Settings page: connect a provider (keys write-only; env fallbacks),
  live model list, save model choice. New Analysis page gained an "Include
  semantic scoring" checkbox; runner gained a judging progress stage and a
  "Cancel semantic scoring" action (`POST /api/analyses/[id]/skip-semantic`).
- Environment page now shows the live skeleton report while a run is in
  progress (shared `AnalysisLiveReport`); history rows link to each
  analysis's own page, including the in-progress one.

## chore/changelog — 2026-07-07

Add this CHANGELOG.md tracking branches, commits, and merges, and log the
change in HISTORY.md. Commit `22d57b8`, merged into `main` as `ba76ab5`
(no-ff). (Hashes for a branch's own entry aren't known until it is
committed — they get backfilled later.)

## feat/async-analysis-ux — 2026-07-07

Async analysis runs with live progress and skeleton report sections, plus UX
polish. Merged into `main` as `6ab7576` (no-ff), branch deleted after merge.

| Commit | Description |
|---|---|
| `3d0ce5f` | Async analyses with live progress, section help popovers, UX fixes |

Highlights:

- Background analysis runner; the analysis record doubles as the job
  (status / progress / progressively-filled summary). Interrupted runs are
  reconciled to failed; one run per environment (409 points at the existing run).
- New `/analyses/[id]` page: progress bar (percentage + stage + detail) and
  skeleton sections that fill in as the run advances.
- Environment page: "Run new analysis" swaps to a live mini progress bar
  while a run is active; starting an analysis from an environment pre-selects
  it in the dropdown.
- Info "i" popovers with rich-text explanations on every report section.
- Fix: dimension bars never rendered their fill (inline span ignored
  width/height).
- Added HISTORY.md (prompt-by-prompt evolution).

## Initial commit — 2026-07-07

Committed directly to `main` as `ef1703a` ("first commit").

Monorepo skeleton: `packages/core` (read-only BigCommerce v3 client, 5-dimension
scoring engine, summaries, CSV export), `packages/cli` (yargs CLI with `--demo`
mode), `apps/web` (Next.js app: environments, analyses, dashboards, JSON-file
store in `data/db.json`).
