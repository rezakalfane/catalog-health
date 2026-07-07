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
