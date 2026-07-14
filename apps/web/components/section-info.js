/**
 * Rich-text help content for the report sections, shown in InfoPopover.
 * Shared by the analysis page and the environment page. Keep in sync with
 * packages/core/src/scoring.js and report.js.
 */

export const sectionInfo = {
  healthScore: (
    <>
      <p>
        The catalog-wide average of every product&apos;s <strong>overall score</strong>{" "}
        (0–100), a weighted blend of the five health dimensions.
      </p>
      <p>
        Grades: <strong>A</strong> ≥ 90 · <strong>B</strong> ≥ 80 ·{" "}
        <strong>C</strong> ≥ 70 · <strong>D</strong> ≥ 60 · <strong>F</strong> below 60.
      </p>
    </>
  ),

  gradeDistribution: (
    <>
      <p>How many products land in each grade band.</p>
      <p>
        A healthy catalog is mostly <strong>A/B</strong>. Products graded{" "}
        <strong>D/F</strong> hurt conversion, search ranking, and feed
        eligibility — they&apos;re where the fix list will focus.
      </p>
    </>
  ),

  dimensions: (
    <>
      <p>Average score per dimension across the whole catalog. Weights:</p>
      <ul>
        <li>
          <strong>Content (25%)</strong> — description depth, image count, alt
          text, title quality, brand.
        </li>
        <li>
          <strong>Structure (25%)</strong> — custom fields <em>vs category
          peers</em>, GTIN/UPC/MPN, variant completeness.
        </li>
        <li>
          <strong>Taxonomy (15%)</strong> — orphaned products, missing
          categories, over-categorization (judged per channel tree on
          multi-storefront stores).
        </li>
        <li>
          <strong>Hygiene (20%)</strong> — zero prices, sale ≥ regular price,
          missing weight, visible but out of stock.
        </li>
        <li>
          <strong>Feed (15%)</strong> — minimum field set for Google Shopping
          and AI-agent feeds.
        </li>
        <li>
          <strong>Semantic</strong> — <em>when enabled in Settings</em>, an LLM
          judges whether each description answers: what is it, who&apos;s it
          for, what&apos;s it made of. It takes 15% of the overall score and
          the other dimensions scale down proportionally.
        </li>
      </ul>
    </>
  ),

  commonIssues: (
    <>
      <p>
        Every failed check flags the product with a named issue; this table
        counts <strong>how many products</strong> carry each flag.
      </p>
      <p>
        The top rows are usually systemic (a missing template field, an import
        gap) — fixing the cause clears many products at once.
      </p>
    </>
  ),

  weakestCategories: (
    <>
      <p>
        Average product score per category, <strong>worst first</strong>.
      </p>
      <p>
        <strong>% below C</strong> is the share of that category&apos;s products
        scoring under 70. A product assigned to several categories counts in
        each of them.
      </p>
    </>
  ),

  topFixes: (
    <>
      <p>The products where fixing content pays off most.</p>
      <p>
        <strong>Impact</strong> = (100 − score) ×
        log(1 + views + 5 × sales) — a weak product that people actually view
        or buy outranks an equally weak one nobody sees. Views and sales come
        from the product record itself.
      </p>
    </>
  ),

  latestHealth: (
    <>
      <p>
        The overall score and grade from the <strong>most recent completed
        analysis</strong> of this store, with when it ran and how many products
        it covered.
      </p>
    </>
  ),

  scoreHistory: (
    <>
      <p>
        The overall score of every completed analysis, oldest to newest — the
        trend line of this catalog&apos;s health over time.
      </p>
      <p>Run analyses regularly (e.g. after imports) to make this useful.</p>
    </>
  ),

  analysisHistory: (
    <>
      <p>
        All completed analysis runs for this environment, newest first. Each
        row is a full snapshot of the catalog&apos;s health at that moment. The
        actions export its PDF report or complete product CSV, or delete it.
      </p>
    </>
  ),
};
