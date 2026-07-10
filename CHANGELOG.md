# Changelog

Git-level history of the repo: every branch, its commits, and the merge that
brought it into `main`. Newest first — add an entry each time a branch is
merged. For the prompt-by-prompt evolution of the tool, see
[HISTORY.md](HISTORY.md).

---

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
