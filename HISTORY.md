# History

Evolution of the Catalog Health tool: each prompt given to Claude Code and a
summary of what was built in response. Newest entries at the bottom — append a
new section per session.

---

## 1. Initial build — 2026-07-07 (reconstructed)

> **Prompt:** _Not captured — this entry was reconstructed from the repo after
> the fact. The goal was an internal tool for CSMs and merchandising
> strategists to analyze a BigCommerce store's catalog health and
> AI-readiness._

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
