# History

Evolution of the Catalog Health tool: each prompt given to Claude Code and a
summary of what was built in response. Newest entries at the bottom — append a
new section per session.

---

## 1. Initial build — 2026-07-07 (reconstructed)

> **Prompt:** Built over a Claude.ai conversation (2026-07-07) rather than a single prompt. The sequence: 
> - asked for ideas around new tools to analyze BigCommerce catalogs or otherwise help merchandisers in their everyday life; 
> - chose to explore "Catalog health & readiness" among the proposed directions; 
> - picked "internal teams (CSMs, strategists)" as the audience and asked for a working script against the Catalog API — delivered first as a Python CLI (catalog_health.py) with the five-dimension scoring, peer-relative attribute checks, and traffic/sales-weighted impact score; 
> - asked to convert everything into an independent Node.js yargs CLI plus a comprehensive, easy-to-use Next.js app — environment management (add/modify/remove BC instances with name, store hash, access token), creating analyses against a selected environment, and report dashboards with per-environment analysis history — as a repo-ready skeleton to continue in Claude Code.

**Summary:** Created the monorepo skeleton with three parts:

- `packages/core` — shared engine: read-only BigCommerce v3 Catalog API
  client, scoring across five dimensions (content, structure, taxonomy,
  hygiene, feed), summaries, and CSV export. Impact score weighted by
  `view_count` / `total_sold` so no Orders scope is needed.
- `packages/cli` — yargs CLI producing a console report plus three CSVs,
  with a `--demo` mode using a synthetic 120-product catalog.
- `apps/web` — Next.js app: environment (store) management with write-only
  tokens, a "New analysis" page (real store or demo), a dashboard, and
  per-environment pages with grade, score sparkline, dimension breakdown,
  common issues, weakest categories, and an impact-weighted fix list.

Data persists to a gitignored `data/db.json` via `apps/web/lib/db.js`, meant
to be swapped for SQLite/Postgres later. No auth yet — localhost only.

## 2. Pre-select environment from "Run new analysis" — 2026-07-07

> **Prompt:** When in an environment page in the NextJS page, clicking on
> "Run new analysis" should open the "New Analysis" page with the right
> environment pre-selected in the dropdown. Also create a new HISTORY.md file
> with each prompt and final summary so we can follow the evolution of the
> tool.

**Summary:** The "Run new analysis" button on the environment detail page
(`apps/web/app/environments/[id]/page.js`) now links to
`/analyses/new?env=<id>`. The New Analysis page
(`apps/web/app/analyses/new/page.js`) reads the `env` query param via
`useSearchParams` (wrapped in a `Suspense` boundary as Next.js requires) and
pre-selects that environment in the dropdown, falling back to the first
environment when the param is absent or unknown. Also created this HISTORY.md.

## 3. Async analyses with live progress — 2026-07-07

> **Prompt:** I'd like to make Analysis async. It could go to an Analysis page
> with skeleton of the different sections that would fill as analysis go, with
> a progress bar somewhere in the page with percentage of completion and
> current stage of the analysis instead of the "Run new analysis" button. It
> should be possible to navigate the app and come back to the analysis in
> progress at any time.

**Summary:** Analyses now run asynchronously on the server; the analysis
record in `data/db.json` doubles as the job (`status` running/done/failed,
`progress` with percent/stage/detail, `summary` filled in progressively).

- `apps/web/lib/analysis-runner.js` — background runner: fetch stage maps
  real API pagination onto the progress bar, scoring and aggregation stages
  follow, and the summary is persisted in slices (score/dimensions → issues →
  categories → top fixes) so report sections fill in as the run progresses.
  "Running" records with no live runner (server restarted) are reconciled to
  failed.
- `POST /api/analyses` returns `202` immediately with the running record, and
  `409` (with the existing run's id) if that environment already has one in
  flight. `GET /api/analyses` gained a `status` filter.
- New `/analyses/[id]` page polls the run: progress bar with percentage +
  stage + detail in the header, skeleton-shimmer sections that populate as
  their data arrives, error card with retry on failure.
- On the environment page the "Run new analysis" button is replaced by a live
  mini progress bar (linking to the run) whenever an analysis is in progress
  (`components/RunAnalysisAction.js`); when the run finishes it refreshes the
  page data. Dashboards and history tables only read completed analyses.
- Since the job lives server-side and every page just polls, you can navigate
  anywhere and come back to the run at any time.

## 4. Section info popovers — 2026-07-07

> **Prompt:** Absolutely perfect. Can you add some information icon next to
> each section title of an analysis to explain in a popup what it is (you can
> use rich text in the pop over).

**Summary:** Added a small "i" icon next to every report section title that
opens a rich-text popover explaining the section.

- `components/InfoPopover.js` — client component: circular icon button,
  popover with JSX content, closes on outside click or Escape, ARIA-labelled.
- `components/section-info.js` — the shared help content (health score &
  grade bands, dimension weights and what each checks, how issue counts /
  category rollup / impact-weighted top fixes are computed), kept in sync
  with `packages/core/src/scoring.js`.
- Wired into all sections of the analysis page and, since it shows the same
  report, the environment page (plus its Latest health / Score history /
  Analysis history sections).

## 5. Fix invisible dimension bars — 2026-07-07

> **Prompt:** [screenshot] Dimensions score are gray bars only, it should
> display some bar charts, right?

**Summary:** The blue fill inside each dimension bar never rendered: `.dim-fill`
is a `<span>` (inline by default), and `width`/`height` don't apply to inline
elements. The gray track only showed because being a flex item blockifies it.
Fixed with `display: block` on `.dim-fill` in `globals.css`, plus a width
transition so the bars animate when a running analysis fills them in.

## 6. Add CHANGELOG.md — 2026-07-07

> **Prompt:** Would be worth adding a CHANGELOG.md file with history of
> branches, commits and merges.

**Summary:** Created CHANGELOG.md at the repo root: one entry per merged
branch (newest first) listing its commits, the merge commit into `main`, and
highlights — starting with the initial commit and `feat/async-analysis-ux`.
Complements HISTORY.md: CHANGELOG.md tracks the git-level history, HISTORY.md
the prompt-by-prompt evolution; each references the other.

## 7. Semantic scoring pass (LLM judge) — 2026-07-07

> **Prompts:** (a) Let's implement Semantic scoring pass (LLM judges whether
> descriptions answer "what is it, who's it for, what's it made of"). First,
> how are you going to implement this feature? Which model? How is it
> implemented? (b) Can we use Opus 4.8 but in the settings of the app, be
> able to choose which model, connect it and use it? What's best so user can
> choose, and even use a free model? (c) Let's go.

**Summary:** Optional 6th scoring dimension "semantic" (15%, the five
heuristic dimensions scale by 0.85): an LLM grades each description on three
criteria — what is it (50 pts), who's it for (25), what's it made of (25) —
as yes/partial/no, adding `desc_*` issues for failures.

- `packages/core/src/semantic.js` — provider-pluggable judge: **Anthropic**
  (official SDK, structured outputs via `output_config.format`, default
  `claude-opus-4-8`) and **Ollama** (local, free, JSON-schema format mode),
  plus a deterministic **demo** judge (no API, no cost). `judgeCatalog`
  chunks 10 products/request, 4 concurrent, skips products without real
  descriptions, tolerates isolated chunk failures.
- **Settings page** (`/settings`) + `GET/PUT /api/settings` +
  `POST /api/settings/test`: pick provider, connect (key stored write-only
  like store tokens; `ANTHROPIC_API_KEY` env fallback), "Connect & list
  models" pulls the live model list (Anthropic Models API / Ollama tags).
- Runner gained a "Judging descriptions… (n/total)" progress stage; judge
  failures degrade to the 5-dimension report with a warning card instead of
  failing the run. New Analysis page: "Include semantic scoring" checkbox.
- Verified: demo run produced the semantic dimension + issues; real Ollama
  path (qwen2.5-coder:7b) graded a fluff description all-no, detailed ones
  all-yes.

## 8. Live in-progress report on the environment page — 2026-07-07

> **Prompt:** When launching an analysis, I can see the score card with
> skeletons. But when navigating to other pages and then back to the
> environment with an analysis in progress, I don't see the skeleton any
> longer, but the latest analysis. The progress section is ok.

**Summary:** Extracted the polling skeleton report from the analysis page
into a shared `components/AnalysisLiveReport.js`. The environment page now
renders it whenever a run is in progress (instead of the stale latest
report), so navigating away and back keeps the live filling-in view. The
Analysis history table stays visible during a run.

## 9. Clickable analysis history — 2026-07-07

> **Prompt:** Can you make items in the History clickable to we can navigate
> between sessions, including analysis in progress?

**Summary:** Analysis history rows (environment page) and Recent analyses
rows (dashboard) now link to that run's own `/analyses/[id]` page — each past
analysis is a browsable session with its full report. An in-progress run
appears as the top history row ("· in progress") linking to the live view.

## 10. OpenAI as a judge provider — 2026-07-07

> **Prompt:** Can you add OpenAI as a judge provider?

**Summary:** Third provider next to Anthropic and Ollama: Chat Completions
via plain fetch with strict structured outputs (same verdict schema),
`OPENAI_API_KEY` env fallback, model list from `/v1/models` filtered to chat
models. Key hygiene: switching provider deletes the stored key, and the test
endpoint only reuses a stored key for its own provider.

## 11. Cancel semantic scoring mid-run — 2026-07-07

> **Prompt:** Semantic judging can be long, add a "cancel semantic scoring"
> below the progress bar to skip it and show the result without semantic
> scoring.

**Summary:** During the semantic stage the analysis page shows "Cancel
semantic scoring (keep the rest)" under the progress bar. It calls
`POST /api/analyses/[id]/skip-semantic`; the judge loop aborts between
chunks and the run completes with the 5 heuristic dimensions plus a
"cancelled" note (partial verdicts are discarded so all products are scored
by the same formula). Verified end-to-end on a demo run.

## 12. Product table & per-product drill-down — 2026-07-07

> **Prompt:** Can you create Per-product drill-down page and full product
> table with filters?

**Summary:** Analyses now persist their full per-product rows (served by
`GET /api/analyses/[id]/products`; stripped from list/poll responses, which
carry a `hasRows` flag instead). New `/analyses/[id]/products` page: every
product with search, grade, issue, and category filters, six sort orders,
50/page pagination. New `/analyses/[id]/products/[productId]` drill-down:
health score, traffic & impact, per-dimension bars, categories, and an
issues table where all 27 issue codes have human labels + fix hints
(`components/issue-info.js`). Top-fixes tables and finished analysis pages
link into both. Older analyses without rows get a friendly explanation.

## 13. Dimension rubrics + channel-aware taxonomy — 2026-07-07

> **Prompt:** [screenshot] Is it possible to add explanation for each
> dimension scoring? Also "in too many categories" should take into account
> the different channels... a product can be in 6 or more different
> categories, but in many channels. It should be evaluated per channel.

**Summary:** (a) Each dimension bar on the product page has an ⓘ popover
with its exact point rubric (`components/dimension-info.js`). (b) The
over-categorization check now groups category assignments per channel tree
(`tree_id` from `/catalog/trees/categories`) and only flags >5 within a
single tree — 12 assignments across 4 channels is 3 per channel and scores
clean. `fetchCatalog` also pulls `/catalog/trees`; analyses persist a light
category/tree map. Verified: 12-across-4-trees → no flag, 6-in-one-tree →
flagged.

## 14. Categories listed per channel — 2026-07-07

> **Prompts:** Can you split the list of categories per channel (with
> channel name and id) at the bottom of the page? / I need to list each
> channel, and for each the list of categories.

**Summary:** `fetchCatalog` additionally reads `/v3/channels` (optional —
tolerates missing scope); trees carry their channel ids. The product page's
Categories card is now a per-channel table: channel name, channel ID, that
channel's category list, and a count highlighted red past the 5-category
threshold. Trees serving several channels render one row per channel;
single-tree stores and old analyses keep the flat list. Verified against the
real store (5 trees / 5 named channels).

## 15. Docs sync — 2026-07-07

> **Prompt:** Check that all .md files are up to date, update if needed and
> commit to main.

**Summary:** README: requirements now mention the optional Channel-settings
scope (channel names) and the optional LLM key/Ollama for semantic scoring;
the taxonomy dimension row notes per-channel-tree judging; the security note
covers LLM API keys living in `data/db.json` alongside store tokens.
CHANGELOG: backfilled commit/merge hashes for chore/changelog,
feat/semantic-scoring, and feat/product-drilldown. Committed directly to
main (docs-only chore, at the user's direction).

## 16. SQLite store — 2026-07-07

> **Prompt:** Let's create a new branch and get to sqllite implementation
> instead of a json file, with some clean structure, that would be easy to
> maintain and evolve.

**Summary:** Replaced the JSON-file store with SQLite (better-sqlite3, WAL).
`lib/sqlite.js` owns the connection, schema, and a versioned migration
runner (`PRAGMA user_version`; append-only `MIGRATIONS`); `lib/db.js` keeps
the exact same function surface (synchronous, so no consumer rewrites) —
only the products endpoint and environment page switched to `hasRows` /
`getAnalysisRows()`. Tables: `environments`, `analyses` (JSON columns for
summary/progress/catalog), `analysis_products` (real rows, FK cascade,
indexed), `settings`. A leftover `data/db.json` auto-imports on first open
and is renamed `db.json.migrated` — the user's 4 environments, 24 analyses,
2,736 product rows, and LLM settings migrated intact. Progress updates are
now single-row UPDATEs instead of full-file JSON rewrites. better-sqlite3 is
declared in `serverExternalPackages` (native module).

## 17. Interactive score history — 2026-07-07

> **Prompt:** [screenshot] Let's improve score history: when mouse over a
> point, show the report date, number of products, score and grade in a
> pop-over, and go to the analysis on click.

**Summary:** The Sparkline component is now interactive: hovering a point
shows a dark tooltip with the run's date/time, product count, score, and
grade (grade letter in its grade color); clicking navigates to that
analysis's report. Invisible ~10px hit areas make the small dots easy to
target, and points are keyboard-accessible. The environment page and
dashboard pass `id`/`grade`/`productCount` with each history point; points
without an id render as a plain non-clickable sparkline.

## 18. Product details, thumbnails & column sorting — 2026-07-07

> **Prompts:** (a) In the product detail page, add a "Product Details"
> section above Issues showing product attributes (title + everything the
> scoring checks, except categories), and deep-link the product title to the
> BigCommerce control panel. (b) Show the main product thumbnail top-left of
> the title/SKU, and the first 255 chars of the description when available.
> (c) Show a small thumbnail (or placeholder icon) left of the title in the
> all-products table and Top fixes sections. (d) Add column sorting to the
> all-products view.

**Summary:** The scoring engine now records, per product, the raw facts each
dimension inspected — description length + 255-char excerpt, thumbnail URL,
image/alt counts, brand, custom-field count (+ peer median), GTIN/UPC/MPN,
option/variant completeness, price/sale/weight, visibility & stock — in a
JSON `details` field on each row. This is the store's **first schema
migration** (SQLite `user_version` 1→2: new `analysis_products.details`
column); a cache-healing fix in `getDb()` lets a hot-reloaded dev server
apply new migrations without a restart.

Product drill-down page: a **Product details** table above Issues; the
title deep-links to the BigCommerce CP
(`store-{hash}.mybigcommerce.com/manage/products/edit/{id}`, hash from the
environment); the main thumbnail renders top-left; the description row shows
the 255-char excerpt. A shared `ProductThumb` component (28px, with a
fixed-size image-off placeholder so rows stay aligned) appears left of the
title in the all-products table and both Top-fixes tables. The all-products
table gained **click-to-sort column headers** (▲/▼, per-column default
direction, reverse on re-click), replacing the Sort-by dropdown.

Attributes/thumbnails are captured at analysis time, so they populate for
new analyses; older ones show placeholders / a "predates capture" note.

## 19. Encrypt secrets at rest — 2026-07-07

> **Prompts:** How can we add SSO / protect the token in the db? → Let's add
> the APP_ENCRYPTION_KEY feature first, generate one and store it in a .env
> local file for local run. (Followed by: I've deleted data/db.json.migrated.)

**Summary:** Store access tokens and LLM API keys are encrypted at rest with
AES-256-GCM (`lib/crypto.js`), keyed by `APP_ENCRYPTION_KEY` (in the
untracked `apps/web/.env.local`; `.env.example` is the committed template).
`lib/db.js` `secureDb()` sweeps legacy plaintext → ciphertext on first access
and VACUUMs the freed pages. Stored form `enc:v1:` + base64(iv|tag|ciphertext).
Without the key the app still runs but stores plaintext. The pre-SQLite
`data/db.json.migrated` plaintext backup was deleted.

## 20. Auth (Google SSO + dev login) & per-user multi-tenancy — 2026-07-07

> **Prompts:** [SSO design discussion — Google, localhost, env vars, creating
> the OAuth client] → build auth + multi-tenancy against a dev login now,
> Google-ready. → can the left menu be sticky?

**Summary:** Added Auth.js (NextAuth v5). Providers: **Google SSO** (active
when `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are set; restricted to the company
domain via `AUTH_ALLOWED_DOMAIN`, default commerce.com) and a **dev-login**
Credentials provider (non-production only) to work before the Google OAuth
client exists. Edge-safe `auth.config.js` powers `middleware.js` (gates
pages; API routes enforce auth in-handler → 401); the DB-backed jwt callback
lives in `auth.js`. A `/signin` page and a sidebar user menu (now sticky/
full-height) round out the UX.

Multi-tenancy: schema migration v3 adds a `users` table and per-user
ownership (`user_id` on environments/analyses; per-user `settings`). Every
`db.js` function is scoped by user id, threaded through all API routes,
server pages, and the background runner. The first account to sign in claims
all pre-auth data; subsequent users start isolated. Verified against a copy
of the real DB (6 environments / 28 analyses / settings claimed; a second
user sees nothing).

Still needed before deploy: a production Google OAuth client (localhost is
dev-only) and a GRC review.

## 21. Semantic review section on the product page — 2026-07-07

> **Prompts:** I'd like to show a new Semantic section in a product detail
> page, showing request and response for each semantic criterion. Would it
> help? → Yes, let's go, keep yes/partial/no with a separate reason returned
> by the judge. → [then three bug reports: "no description" shown despite a
> description; "```json ... is not valid JSON"; minimax returned no result].

**Summary:** The judge schema now returns, per criterion, a `{verdict, reason}`
(kept yes/partial/no, added a one-sentence justification). The product
drill-down gained a **Semantic review** section showing each criterion's
question → verdict badge → reason, the judging model, and a collapsible view
of the exact text the judge evaluated. Verdicts+reasons persist via schema
migration v4 (`analysis_products.semantic` JSON); new analyses only.

Hardened the judge for the reality of local/proxied models (found via the
bug reports, each reproduced and fixed against real models):
- **Truncation** — larger reason payloads overran Ollama's output cap →
  `num_predict: 8192`.
- **Dropped verdicts** — a missing `reason` no longer discards a valid
  verdict (normalize instead of reject).
- **Code fences / prose** — `parseJsonLoose` strips ```json wrappers and
  extracts the outermost JSON object; applied to all three providers.
- **Schema not honored** — cloud models proxied via Ollama ignore the
  structured-output schema, so the exact output contract (shape + example)
  now lives in the prompt too.
- **Omitted items** — a retry pass re-judges, one at a time, any product a
  batch response skipped (unit-tested).
- Honest fallback: products with a description but no verdict say "the judge
  did not return a result — try re-running", distinct from genuinely-missing
  descriptions.

## 22. Clearer Ollama error messages — 2026-07-07

> **Prompt:** ⚠ Semantic scoring skipped: Ollama returned 403 — is it
> running at http://localhost:11434? (trying glm-5.2:cloud)

**Summary:** `glm-5.2:cloud` is a subscription-gated Ollama cloud model the
account can't access — Ollama returns 403 with an explanatory body, but the
judge masked it behind a generic "is it running?". Fixed `ollamaJudge` to
surface Ollama's own error message on non-OK responses (e.g. "this model
requires a subscription, upgrade for access…") and to reserve the
"is it running?" hint for actual connection failures (fetch throwing). Not a
functional bug — a diagnosability fix.

## 23. Per-analysis timing (total + semantic stage) — 2026-07-08

> **Prompts:** Is it possible to know how long each analysis took? → Let's go
> with separate semantic stage timing.

**Summary:** The runner now records total wall-clock (`duration_ms`) and the
semantic-stage share (`semantic_ms`, null when semantic is off), persisted via
schema migration v5. Shown as "completed in 2m 14s (semantic 1m 50s)" in the
analysis page header and a Duration column (semantic share on hover) in the
environment history and dashboard recent-analyses tables. New analyses only;
older ones show "—". `lib/format.js` holds the shared `formatDuration`.

## 24. Semantic badge on analyses — 2026-07-08

> **Prompt:** Can we mark analyses with semantic, with an icon or something?

**Summary:** A small "✦ semantic" pill (`components/SemanticBadge.js`) marks
analyses that included the LLM scoring pass, on the environment history table,
the environment Latest-health card, the dashboard recent-analyses table, and
the analysis page header. Detection keys off the presence of the semantic
dimension in the summary, so degraded/cancelled runs (no semantic scores) are
correctly left unmarked.

## 25. Centralize API fetch calls in lib — 2026-07-09

> **Prompt:** Refactoring exercise: all fetch API calls in pages should be
> moved to central places in lib.

**Summary:** Every browser-side `fetch("/api/…")` scattered across pages and
components now goes through a single `apps/web/lib/api-client.js`. It exposes
named functions per endpoint — settings (`getSettings`, `updateSettings`,
`testSettingsConnection`), environments (`listEnvironments`, `getEnvironment`,
`saveEnvironment`, `deleteEnvironment`), and analyses (`listAnalyses`,
`getAnalysis`, `getAnalysisProducts`, `createAnalysis`, `skipSemantic`) — over
a shared `request()` helper that parses JSON and throws a typed `ApiError`
(carrying `status` and `body`) on non-2xx. Call sites switched to try/catch,
reading `err.body?.error` for the same messages as before and `err.status`
for the 409 "already running" redirect; `getEnvironment` swallows failures and
returns null to preserve the silent behavior the analysis pages relied on.
Refactored: `settings`, `analyses/new`, `environments`, `analyses/[id]`,
`analyses/[id]/products`, `analyses/[id]/products/[productId]` pages plus the
`RunAnalysisAction` and `AnalysisLiveReport` components. No behavior change;
`next build` passes with type-checking.

## 26. Silence VWO hydration warning — 2026-07-09

> **Prompt:** [Screenshot of a React hydration error: `vwo-smartcode-listener`
> attribute on `<html>` didn't match between server and client.]

**Summary:** VWO (Visual Website Optimizer — extension or injected snippet)
adds `vwo-smartcode-listener="true"` to `<html>` before React hydrates, so the
server HTML and client differ on that one attribute. Added
`suppressHydrationWarning` to the `<html>` element in `app/layout.js`; it
suppresses only that element's own attribute/text mismatch (does not cascade
to children, so real hydration bugs elsewhere still surface). Not caused by
the app's own rendering.

## 27. Code review hardening fixes — 2026-07-10

> **Prompts:** Can you do a code review of my project? → Can you fix 1, 2 and
> 3 in order, one by one? → Can you update CHANGELOG.md, HISTORY.md, create a
> branch, commit and merge into main?

**Summary:** Addressed the three concrete review findings in order:

- Fixed the encryption-at-rest migration for LLM settings: `secureDb()` now
  sweeps every `settings.llm` row and updates it by `(user_id, key)`, so
  enabling `APP_ENCRYPTION_KEY` after multiple users exist does not overwrite
  all users' settings with one row.
- Added a shared `normalizeOllamaBaseUrl()` guard and used it in the settings
  save route, connection-test route, and semantic runner. Ollama is now limited
  to local HTTP endpoints (`localhost`, `127.0.0.1`, `[::1]`) with no
  credentials, query, or fragment.
- Added a 30-second timeout around each BigCommerce API request, returning a
  clear path-specific timeout error so analyses fail cleanly instead of
  remaining stuck in `running`.

Verified with a production `next build` and a small Node check for allowed /
blocked Ollama URL forms.

## 28. Product list CSV export — 2026-07-10

> **Prompts:** In a Products page listing all products of an analysis, can you
> add an "Export as CSV" button, so I can open the list in Excel (should
> include all columns and list of issues for each product)? → Perfect, you can
> update docs, create branch, commit and merge.

**Summary:** Added an `Export as CSV` button to the analysis product table
(`/analyses/[id]/products`). The export uses the already-loaded product rows
and respects the current filters and sort order, exporting all matching rows
instead of only the current pagination page. Columns: product id, product
name, SKU, score, grade, impact, views, units sold, issue count, and
human-readable issue labels joined with semicolons.

The CSV writer quotes all cells, uses CRLF line endings and a UTF-8 BOM for
Excel, and prefixes formula-like values to reduce spreadsheet formula
injection risk. README now documents the feature and marks CSV export as
done in the roadmap.

## 29. Analysis comparison — 2026-07-10

> **Prompts:** Let's think about Analysis comparison, how would you best
> implement it, and show it in the front-end so it's easy to understand
> (global comparisons on scoring, number of products; product by product
> comparison; anything else?) → Let's go phase by phase, test what needs to
> be tested in between → [screenshot] Can you slightly better present the
> table, grade change should be on one line, maybe reduce a little bit the
> last column? → Perfect, you can document, branch, commit and merge.

**Summary:** Added a first-class comparison flow for completed analyses from
the same environment.

- Phase 1: server-side comparison helpers (`lib/compare.js`) and
  `GET /api/analyses/compare?base=<id>&target=<id>`, with same-user,
  same-environment, completed-analysis validation.
- Phase 2: `/analyses/compare` page plus a "Compare with previous" action on
  completed analysis pages. The page shows previous/current dates, headline
  score/grade/product-count changes, dimension deltas, issue-count deltas,
  category score/product-count deltas, and a warning when one run includes
  semantic scoring and the other does not.
- Phase 3: product-by-product comparison table, matching by BigCommerce
  product id. It classifies products as changed/added/removed/unchanged and
  shows score, grade, issue-count, resolved issues, and new issues, with
  search and status filters.
- UI polish: grade transitions now stay on one line, numeric columns avoid
  awkward wrapping, and resolved/new issue columns are more compact.

Each phase was checked with `npm run build`; the final build passed.

## 30. OpenAI semantic judge compatibility and throttling — 2026-07-10

> **Prompts:** Got the following error with OpenAI judge:
> `response_format` of type `json_schema` is not supported with this model →
> Got an issue with rate limit: `Rate limit reached ... RPM` → Error:
> `Cannot access 'body' before initialization` → looks stuck even if logs show
> polling → Should we also throttle the API calls based on rate limits in the
> documentation? → Ok → all good you can update documentation, create branch,
> commit and merge into main.

**Summary:** Hardened the OpenAI semantic judge path.

- Model compatibility: OpenAI still tries strict Structured Outputs first, but
  if the selected model rejects `response_format: json_schema`, it falls back
  to JSON-object mode and then to prompt-only JSON parsing using the existing
  `parseJsonLoose()` sanitizer.
- Rate limits: transient 429 responses now retry the same chunk, respecting
  `retry-after-ms`, `retry-after`, or OpenAI's "try again in Xms" response
  text, with a 500ms minimum wait to avoid rapid retry churn.
- Fixed the retry-path runtime bug caused by shadowing the request payload
  variable (`body`) with an error-response variable.
- Proactive throttle: OpenAI semantic scoring now defaults to one request
  worker and at least 500ms between chunk requests, while Anthropic/Ollama/demo
  keep the existing concurrency. The runner passes provider throttle settings
  through to `judgeCatalog()`.
- Documentation: README and `.env.example` document
  `OPENAI_JUDGE_CONCURRENCY` and `OPENAI_JUDGE_MIN_DELAY_MS`.

Verified with `npm run build`.

## 31. Completed-analysis PDF export — 2026-07-13

> **Prompts:** Add a new Export as PDF when looking at a report, with all main
> information shown and statistics/charts where useful. Add generated `tmp/`
> files to gitignore and a `test_pdf_export` package command. Fix the PDF
> endpoint's missing Helvetica metrics, make filenames unique across multiple
> analyses per day, then update docs, branch, commit, and merge.

**Summary:** Added a server-generated PDF report for completed analyses.

- The analysis header now offers "Export as PDF". The authenticated
  `GET /api/analyses/[id]/pdf` route applies the same user ownership checks as
  the report API and rejects incomplete analyses.
- The A4 report includes health score, product/pass/fail statistics, grade
  distribution and dimension charts, the ten most common issues, eight
  weakest categories, and ten traffic/sales-weighted priority fixes. Tables
  wrap long values, continue across pages, and include page-numbered footers.
- Filenames use the environment, UTC analysis start timestamp, and first eight
  characters of the analysis id, for example
  `catalog-health-store-2026-07-13T08-42-00Z-83d3d077.pdf`.
- PDFKit is listed in `serverExternalPackages`; bundling it caused Next.js to
  omit the package-relative Helvetica AFM files at runtime.
- `npm run test_pdf_export` generates a representative two-page report,
  validates its PDF signature, EOF marker, size, and page count, and writes the
  ignored artifact to `tmp/pdfs/catalog-health-test.pdf`.

Verified with the smoke test, production build, visual page renders, and an
authenticated request against a stored analysis.

## 32. Select an earlier analysis to compare — 2026-07-14

> **Prompts:** Improve "Compare to previous" so a completed analysis can be
> compared with any of the last ten analyses. Add a dropdown icon and show
> each option like the analysis list, including the semantic-scoring tag. →
> Excellent, update docs, create a branch, commit, and merge to main.

**Summary:** Expanded the completed-analysis comparison action into a compact
history picker.

- The picker offers up to the ten immediately preceding completed analyses
  from the same environment, keeping the viewed analysis as the comparison
  target.
- Each option shows the analysis date, semantic-scoring badge when applicable,
  product count, score, grade, and duration.
- The menu closes on selection, outside click, or Escape and exposes button,
  menu, and menu-item semantics for assistive technology.
- The existing authenticated comparison API and report page remain unchanged.

Verified with `npm run build`.
