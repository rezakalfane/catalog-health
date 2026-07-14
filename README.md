# Catalog Health

Internal tool for CSMs and merchandising strategists: analyze a BigCommerce
store's catalog health and AI-readiness, track it over time, and get a
prioritized fix list weighted by traffic and sales.

![Catalog Health](./docs/images/catalog-health-00-v2.png)

Monorepo with three parts:

```
packages/core   Shared engine: BigCommerce v3 Catalog API client (read-only),
                scoring across 5 dimensions, summaries, CSV export.
packages/cli    yargs CLI — run an analysis from the terminal, get a console
                report + CSVs.
apps/web        Next.js app — manage environments (stores), run analyses,
                browse dashboards and per-environment history.
```

## Requirements

- Node.js >= 20 (uses native `fetch` and the AI SDK provider adapters)
- A BigCommerce API token per store with **Products: read-only** scope
  (the tool only issues GET requests). Optional: a **Channel settings:
  read-only** scope lets reports show channel names instead of tree ids.
- Optional, for semantic scoring: an Anthropic or OpenAI API key, or a
  local [Ollama](https://ollama.com) install (free) — configured under
  **Settings** in the web app.

## Setup

```bash
npm install
```

## CLI

```bash
# Instant demo with a synthetic 120-product catalog:
npm run cli -- analyze --demo

# Against a real store:
npm run cli -- analyze --store-hash abc123 --token $BC_AUTH_TOKEN

# Options: --out <dir> (CSV output, default health_report/), --json
```

Outputs a console report plus three CSVs: per-product scores, category
rollups, and a top-50 fix list.

## Web app

```bash
npm run dev
# open http://localhost:3000
```

- **Environments** — add / edit / remove BigCommerce stores (name, store
  hash, access token, and scoring profile). Tokens are write-only in the UI:
  the API never sends them back to the browser.
- **New analysis** — pick an environment and run; or run a demo analysis with
  no credentials to see the dashboards populated. Analyses run asynchronously:
  you land on a live analysis page (progress bar + sections filling in as the
  run advances) and can navigate away and come back at any time.
- **Dashboard / environment pages** — latest grade, score sparkline over
  time, dimension breakdown, most common issues, weakest categories, and the
  impact-weighted top-fix list. Top fixes support product/SKU search, grade
  filtering, sortable columns, and filtered/sorted CSV export; analysis pages
  show up to 100 matches while environment overviews remain capped at 15.
  Environment analysis history includes the profile captured by each run and
  compact actions for the PDF report, complete product CSV, and confirmed
  deletion. A full **Delete analysis** button is also available from the
  report itself. The Dashboard Recent analyses table provides the same blue
  PDF, green full-product CSV, and red confirmed-delete actions.
- **Analysis comparison** — from a completed analysis, choose any of the ten
  immediately preceding runs from the same environment. The picker shows each
  run's date, product count, score, grade, duration, and semantic-scoring tag.
  Comparisons include score/grade/product-count deltas, dimension shifts,
  issue and category changes, and sortable product-by-product resolved/new
  issue details. Export the current filtered/sorted product changes as CSV or
  download the complete comparison summary as a paginated PDF.
- **Profile recalculation** — replay any completed analysis under another
  static profile using the exact product facts and semantic verdicts captured
  by the original run. Recalculation makes no BigCommerce or LLM calls, leaves
  the environment default and source analysis untouched, and saves a linked
  derived analysis with a one-click comparison back to its source.
  Derived reports remain visible in history but do not replace the latest
  live-catalog result or alter environment score trends.
- **PDF report export** — download a completed analysis as a polished A4
  report with headline statistics, grade and dimension charts, common issues,
  weakest categories, and the ten highest-impact fixes. Filenames include the
  environment, analysis timestamp (UTC), and a short analysis id so repeated
  runs never overwrite one another.
- **Product table & drill-down** — every analysis stores its full per-product
  results: browse them with filters (search, grade, issue, category, sort),
  export the filtered/sorted list as an Excel-friendly CSV, and open any
  product for its dimension scores, issues with fix hints, traffic and impact.
- **On-demand product AI Analysis** — from a product drill-down, use the LLM
  selected in Settings to generate a saved, merchant-ready review: prioritized
  fixes, revised title and descriptions, derived catalog fields, category and
  merchandising placement, feed/SEO values, conversion opportunities, data
  risks, and merchant follow-up questions. Vision-capable models also review up
  to five BigCommerce-hosted images for quality, role, missing shots, hero
  selection, and accessible alt text; unsupported models retry text-only.
  While it runs, the product page streams the actual server stage—from loading
  catalog data through image preparation, generation, validation, and saving.
- **Settings** — connect an LLM for the optional semantic scoring pass:
  Anthropic (Claude, default `claude-opus-4-8`), OpenAI, or Ollama (local
  models, free, data never leaves the machine). API keys are stored
  write-only like store tokens (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` env
  vars work as fallbacks). "Connect & list models" pulls the live model list
  from the provider.

### PDF export smoke test

```bash
npm run test_pdf_export
```

This generates a representative two-page report, validates its PDF structure,
and leaves the ignored artifact at `tmp/pdfs/catalog-health-test.pdf` for
optional visual inspection.

Comparison PDFs have their own representative smoke test:

```bash
npm run test_comparison_pdf_export
```

It generates and validates a multi-page comparison report at
`tmp/pdfs/catalog-health-comparison-test.pdf`.

The product AI workflow has an integration test for structured output,
streamed stages, owner-scoped persistence, image binding, table indicators,
and deletion cascade:

```bash
npm run test_product_ai_analysis
```

## Scoring profiles

Each environment selects a static scoring profile when it is created or
edited. The profile changes both dimension weights and rule thresholds; every
analysis snapshots the exact configuration it used, so later profile changes
do not rewrite history. The selected profile appears below environment names
across the dashboard and analysis views, and each row in an environment's
Analysis history table shows the profile used for that specific run.

| Profile | Emphasis |
|---|---|
| Balanced | Even coverage across content, structure, taxonomy, commerce hygiene, and feeds; this is the default for existing environments and demo runs. |
| Content Quality | Richer descriptions, stronger titles, and deeper image coverage. |
| Marketplace Readiness | Complete attributes and dependable feed data for external channels. |
| Catalog Governance | Consistent attributes and disciplined taxonomy. |

The current static definitions live in `packages/core/src/profiles.js`. Their
shape is designed to support future user-created profiles, custom weights, and
per-rule enable/disable controls without changing stored analysis snapshots.

On a completed analysis, **Recalculate** offers every profile other than the
one already used. The scoring engine rebuilds all product scores, issues,
grades, impact rankings, dimension averages, category rollups, and headline
statistics from the stored facts. If semantic scoring was applied, its saved
per-criterion verdicts are reused rather than sent to a model again. Analyses
that predate per-product scoring facts cannot be recalculated.

The rollback-only integration test exercises the complete replay and SQLite
lineage flow without leaving fixture data behind:

```bash
npm run test_analysis_recalculation
```

### Balanced profile dimensions

| Dimension | Weight | What it checks |
|---|---|---|
| content | 25% | description depth, image count, alt text, title quality, brand |
| structure | 25% | custom fields **vs category peers**, GTIN/UPC/MPN, variant completeness |
| taxonomy | 15% | orphaned products, missing categories, over-categorization (judged per channel tree on multi-storefront stores) |
| hygiene | 20% | zero prices, sale >= regular price, missing weight, visible-but-OOS |
| feed | 15% | minimum field set for Google Shopping / AI-agent feeds |

Impact score = `(100 - score) x log(1 + views + 5*sales)` using `view_count`
and `total_sold` from the product record — no Orders scope needed.

**Optional 6th dimension — semantic (15%)**: an LLM judges whether each
description answers *what is it, who's it for, what's it made of*
(`yes`/`partial`/`no` per criterion; what-is-it counts double). When enabled,
the five heuristic dimensions scale down proportionally to make room. Failing
criteria add `desc_*` issues to the report. Products without a description
score 0 without spending tokens; demo analyses use a free simulated judge.
Configure the provider/model under **Settings**; enable per-run on the New
Analysis page. If the pass fails mid-run the analysis degrades gracefully to
the 5-dimension report with a warning.

OpenAI semantic judging is throttled proactively to avoid request-per-minute
bursts: by default it runs one chunk at a time with at least 500ms between
requests, and still retries transient 429 rate-limit responses. Override with
`OPENAI_JUDGE_CONCURRENCY` and `OPENAI_JUDGE_MIN_DELAY_MS` if your account has
higher limits.

Profile weights and thresholds live in `packages/core/src/profiles.js`; the
scoring engine is in `packages/core/src/scoring.js` and the judge in
`packages/core/src/semantic.js`.

Every new analysis stores a scoring metadata snapshot: engine and profile
versions, dimension weights, thresholds, semantic weight, prompt version, and
the provider/model actually used when semantic scores were applied. Analysis
pages and PDF exports show the complete snapshot as well as a compact header
summary. Comparisons in both the app and PDF exports display previous and
current settings side by side, highlight changed values, and warn when formula
differences—or missing metadata on a legacy run—mean a score delta may not be
entirely attributable to catalog changes.

## Issues detected

Every product is flagged with named issues; they drive the "most common
issues" table and the per-product drill-down (where each shows a fix hint).
The full set, by dimension:

| Dimension | Issue | What it flags |
|---|---|---|
| content | Missing description | No description at all. |
| content | Thin description | Description below the selected profile's minimum length. |
| content | No images | The product has no images. |
| content | Not enough images | Image count below the selected profile's target. |
| content | Missing image alt text | Fewer than half the images have alt text. |
| content | Weak title | Title too short, too long, or SKU-like (not human-readable). |
| content | ALL-CAPS title | Title is written in all capitals. |
| content | No brand assigned | No brand set on the product. |
| structure | Fewer attributes than peers | Under half the custom fields its category peers typically have. |
| structure | No custom fields | No structured attributes, and no peer baseline to compare against. |
| structure | No GTIN / UPC / MPN | No product identifier of any kind. |
| structure | Incomplete variant options | Some variants are missing option values. |
| taxonomy | Not in any category | The product is orphaned — assigned to no category. |
| taxonomy | Assigned to a missing category | References a category id that no longer exists. |
| taxonomy | In too many categories | Exceeds the selected profile's limit **within a single channel tree**. |
| hygiene | Zero price | Price is 0. |
| hygiene | Sale price ≥ regular price | The "sale" price isn't actually lower. |
| hygiene | Missing weight | No shipping weight set. |
| hygiene | Visible but out of stock | Visible, inventory-tracked, and at zero stock. |
| feed | Feed: no image | Fails the Google/AI-feed image requirement. |
| feed | Feed: description too short | Under ~50 characters — fails the feed requirement. |
| feed | Feed: no brand | Missing the feed's required brand attribute. |
| feed | Feed: no identifier | Missing the feed's required GTIN/UPC/MPN. |
| feed | Feed: no price | Missing a non-zero price for the feed. |
| semantic | Doesn't say what it is | LLM judged the description doesn't make clear what the product is. |
| semantic | Doesn't say who it's for | LLM judged it doesn't state the audience or use case. |
| semantic | Lacks materials / specs | LLM judged it doesn't state materials, ingredients, or specs. |

The three `semantic` issues appear only when semantic scoring is enabled.
Labels and fix hints for each live in `apps/web/components/issue-info.js`.

## Data & security notes

- Data persists to `data/catalog-health.sqlite` (better-sqlite3, WAL mode).
  `apps/web/lib/db.js` is the only data-access surface — every page and API
  route goes through it — and `apps/web/lib/sqlite.js` owns the connection,
  schema, and migrations (append a block to `MIGRATIONS`; versions tracked
  via `PRAGMA user_version`). Tables: `environments`, `analyses`,
  `analysis_products` (per-product results, FK-cascaded),
  `product_ai_analyses` (latest optional generated review), and `settings`.
  Recalculated analyses retain a nullable self-reference to their source;
  deleting the source clears that link without deleting the derived report.
  Deleting an analysis cascades to its stored per-product rows, while analyses
  still in progress are protected from deletion.
- A leftover `data/db.json` from the previous JSON-file store is imported
  automatically on first run and renamed to `db.json.migrated`.
- **Secrets are encrypted at rest** (AES-256-GCM) when `APP_ENCRYPTION_KEY`
  is set: store access tokens and LLM API keys are ciphertext in the DB, and
  the key lives only in the environment (an untracked `apps/web/.env.local`
  locally; a secrets manager in production) — never in `data/` or the repo.
  Copy `apps/web/.env.example` to `.env.local` and generate a key with
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
  On first run with a key set, any existing plaintext secrets are migrated to
  ciphertext and the freed pages are vacuumed. Without the key the app still
  runs but stores secrets in plaintext (a warning path). **Losing the key**
  means re-entering tokens under Environments / Settings.
- `data/` is still **gitignored** — the DB holds encrypted secrets, but treat
  it as sensitive. Before any shared deployment, add authentication to the
  app and move the key to a managed secrets store (per company policy, start
  with a GRC review).
- **Authentication & multi-tenancy** (Auth.js): the app requires sign-in and
  scopes environments, analyses, and settings per user — each account sees
  only its own data. Google SSO (restricted to the company domain) is used
  when `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are set; in non-production a
  **dev login** (sign in as any email) is available for local testing. The
  first account to sign in adopts any pre-auth data. See the auth vars in
  `apps/web/.env.example`.
- Product AI Analysis treats catalog copy as untrusted prompt data, never
  writes changes back to BigCommerce, and asks the model not to invent product
  claims or identifiers. Server-side image retrieval accepts only HTTPS images
  on BigCommerce CDN hosts, with count, timeout, media-type, and size limits.
- Company policy: no PII into Claude when developing against real catalogs,
  and any deployment must start with a GRC review — no personal
  Vercel/Netlify accounts.

## Roadmap ideas

- [x] Semantic scoring pass (LLM judges whether descriptions answer
      "what is it, who's it for, what's it made of") — Anthropic or Ollama,
      configured in Settings. CLI `--semantic` flag still to do.
- [x] Async analysis jobs with progress
      (in-process runner — jobs don't survive a server restart; they're marked
      failed. A real queue is only needed if this outgrows one process)
- [x] Per-product drill-down page and full product table with filters
      (`/analyses/[id]/products`; per-product rows persist with each new
      analysis — older analyses predating this have summary only)
- [x] CSV export from the web app (filtered/sorted product list)
- [x] PDF export from the web app
- [x] Compare two analyses (what improved / regressed)
- [x] Static scoring profiles with per-environment selection, profile-aware
      thresholds and weights, immutable analysis metadata, and PDF/comparison
      visibility
- [x] Recalculate an existing analysis with another profile using its stored
      scoring facts, preserve the original analysis, and link the derived run
      back to its source for one-click comparison
- [x] Delete completed analyses from history or the report, cascade stored
      product rows, preserve derived reports, and protect active runs
- [x] Compact PDF, full-product CSV, and confirmed-delete actions in both the
      Dashboard Recent analyses and environment Analysis history tables
- [x] On-demand, persisted product AI Analysis with provider-aware structured
      recommendations, live-product/snapshot fallback, copy-ready fields, and
      safe multimodal image review where the selected model supports it
- [x] Swap JSON store for SQLite (better-sqlite3, WAL, versioned migrations,
      auto-import of the legacy db.json)
- [x] Auth (Google SSO + dev login) and per-user multi-tenancy
      (production Google OAuth client + GRC review still needed before deploy)
