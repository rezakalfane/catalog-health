# Catalog Health

Internal tool for CSMs and merchandising strategists: analyze a BigCommerce
store's catalog health and AI-readiness, track it over time, and get a
prioritized fix list weighted by traffic and sales.

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

- Node.js >= 18.18 (uses native `fetch`)
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
  hash, access token). Tokens are write-only in the UI: the API never sends
  them back to the browser.
- **New analysis** — pick an environment and run; or run a demo analysis with
  no credentials to see the dashboards populated. Analyses run asynchronously:
  you land on a live analysis page (progress bar + sections filling in as the
  run advances) and can navigate away and come back at any time.
- **Dashboard / environment pages** — latest grade, score sparkline over
  time, dimension breakdown, most common issues, weakest categories, and the
  impact-weighted top-fix list.
- **Product table & drill-down** — every analysis stores its full per-product
  results: browse them with filters (search, grade, issue, category, sort),
  and open any product for its dimension scores, issues with fix hints,
  traffic and impact.
- **Settings** — connect an LLM for the optional semantic scoring pass:
  Anthropic (Claude, default `claude-opus-4-8`), OpenAI, or Ollama (local
  models, free, data never leaves the machine). API keys are stored
  write-only like store tokens (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` env
  vars work as fallbacks). "Connect & list models" pulls the live model list
  from the provider.

## The five scoring dimensions

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

Weights and thresholds live in `packages/core/src/scoring.js`; the judge in
`packages/core/src/semantic.js`.

## Data & security notes

- Data persists to `data/catalog-health.sqlite` (better-sqlite3, WAL mode).
  `apps/web/lib/db.js` is the only data-access surface — every page and API
  route goes through it — and `apps/web/lib/sqlite.js` owns the connection,
  schema, and migrations (append a block to `MIGRATIONS`; versions tracked
  via `PRAGMA user_version`). Tables: `environments`, `analyses`,
  `analysis_products` (per-product results, FK-cascaded), `settings`.
- A leftover `data/db.json` from the previous JSON-file store is imported
  automatically on first run and renamed to `db.json.migrated`.
- `data/` is **gitignored because it contains store API tokens and LLM API
  keys in plain text**. Fine for a local skeleton; before any shared
  deployment, move secrets to a secrets manager and encrypt at rest.
- There is **no authentication** on the web app yet. Do not expose it beyond
  localhost as-is.
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
- [ ] CSV / PDF export from the web app
- [ ] Compare two analyses (what improved / regressed)
- [x] Swap JSON store for SQLite (better-sqlite3, WAL, versioned migrations,
      auto-import of the legacy db.json)
- [ ] Auth (SSO) before any shared deployment
