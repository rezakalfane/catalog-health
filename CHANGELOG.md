# Changelog

Git-level history of the repo: every branch, its commits, and the merge that
brought it into `main`. Newest first — add an entry each time a branch is
merged. For the prompt-by-prompt evolution of the tool, see
[HISTORY.md](HISTORY.md).

---

## chore/changelog — 2026-07-07

Add this CHANGELOG.md tracking branches, commits, and merges, and log the
change in HISTORY.md. (Hashes for a branch's own entry aren't known until it
is committed — fill them in, or don't, in the next entry.)

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
