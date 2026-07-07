/**
 * Per-dimension scoring rubrics (how a product earns its 0–100 in each
 * dimension). Shown as popovers on the product drill-down page. Keep in
 * sync with packages/core/src/scoring.js and semantic.js.
 */

export const dimensionInfo = {
  content: (
    <>
      <p>How this product earns its content score:</p>
      <ul>
        <li><strong>35 pts</strong> — description depth: 0 if missing, 15 under 200 chars, 28 under 500, full at 500+.</li>
        <li><strong>25 pts</strong> — images: 0 none, 12 one, full with 2+.</li>
        <li><strong>15 pts</strong> — alt text: scaled by the share of images that have it.</li>
        <li><strong>15 pts</strong> — title: 10–150 chars, not SKU-like (−5 if ALL CAPS).</li>
        <li><strong>10 pts</strong> — brand assigned.</li>
      </ul>
    </>
  ),
  structure: (
    <>
      <p>How this product earns its structure score:</p>
      <ul>
        <li><strong>40 pts</strong> — custom fields vs <em>category peers</em>: scaled by this product&apos;s attribute count relative to the median of products in the same categories (20 pts flat if there&apos;s no peer baseline).</li>
        <li><strong>30 pts</strong> — a product identifier (GTIN, UPC or MPN).</li>
        <li><strong>30 pts</strong> — variant completeness: every variant has all option values (15 if some are incomplete; full if no options).</li>
      </ul>
    </>
  ),
  taxonomy: (
    <>
      <p>How this product earns its taxonomy score:</p>
      <ul>
        <li><strong>60 pts</strong> — assigned to at least one category (0 for the whole dimension if not).</li>
        <li><strong>25 pts</strong> — every assigned category actually exists.</li>
        <li><strong>15 pts</strong> — not over-categorized: at most 5 categories <em>within any single channel tree</em> (multi-storefront assignments are counted per channel).</li>
      </ul>
    </>
  ),
  hygiene: (
    <>
      <p>How this product earns its hygiene score:</p>
      <ul>
        <li><strong>30 pts</strong> — a non-zero price.</li>
        <li><strong>20 pts</strong> — sale price lower than the regular price (or no sale).</li>
        <li><strong>20 pts</strong> — a weight is set.</li>
        <li><strong>30 pts</strong> — not visible-but-out-of-stock.</li>
      </ul>
    </>
  ),
  feed: (
    <>
      <p>Five required feed attributes (Google Shopping / AI-agent feeds), <strong>20 pts</strong> each:</p>
      <ul>
        <li>at least one image</li>
        <li>a description of 50+ characters</li>
        <li>a brand</li>
        <li>an identifier (GTIN/UPC/MPN)</li>
        <li>a non-zero price</li>
      </ul>
    </>
  ),
  semantic: (
    <>
      <p>
        An LLM judges whether the <em>description text alone</em> answers
        three questions (yes = full points, partial = half, no = 0):
      </p>
      <ul>
        <li><strong>50 pts</strong> — what is it? (what the product is and does)</li>
        <li><strong>25 pts</strong> — who&apos;s it for? (audience, use case, occasion)</li>
        <li><strong>25 pts</strong> — what&apos;s it made of? (materials, ingredients, specs)</li>
      </ul>
      <p>Marketing fluff and the product name don&apos;t earn credit.</p>
    </>
  ),
};
