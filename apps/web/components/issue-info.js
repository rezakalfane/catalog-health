/**
 * Human-readable label + fix hint for every issue code the scoring engine
 * emits. Keep in sync with packages/core/src/scoring.js (heuristics) and
 * packages/core/src/semantic.js (desc_* semantic issues).
 */

export const ISSUE_INFO = {
  // content
  missing_description: {
    label: "Missing description",
    dimension: "content",
    fix: "Write a description — even a short one beats an empty field for shoppers, search, and AI agents.",
  },
  thin_description: {
    label: "Thin description",
    dimension: "content",
    fix: "Shorter than the selected scoring profile's minimum. Expand with what it is, who it's for, and materials/specs.",
  },
  no_images: {
    label: "No images",
    dimension: "content",
    fix: "Add product photos — listings without images barely convert and are excluded from most feeds.",
  },
  single_image: {
    label: "Not enough images",
    dimension: "content",
    fix: "Add more angles or in-context shots to meet the selected scoring profile's image target.",
  },
  missing_alt_text: {
    label: "Missing image alt text",
    dimension: "content",
    fix: "Fewer than half the images have alt text. Add descriptive alt text for accessibility and SEO.",
  },
  weak_title: {
    label: "Weak title",
    dimension: "content",
    fix: "Title is too short, too long, or looks like a SKU. Use a descriptive, human-readable product name.",
  },
  all_caps_title: {
    label: "ALL-CAPS title",
    dimension: "content",
    fix: "Rewrite the title in normal casing.",
  },
  missing_brand: {
    label: "No brand assigned",
    dimension: "content",
    fix: "Assign a brand — it's used by search filters, comparison shopping, and product feeds.",
  },

  // structure
  attribute_gap_vs_peers: {
    label: "Fewer attributes than category peers",
    dimension: "structure",
    fix: "This product has under half the custom fields its category peers have. Fill in the missing attributes.",
  },
  no_custom_fields: {
    label: "No custom fields",
    dimension: "structure",
    fix: "Add structured attributes (size, color, material…) as custom fields.",
  },
  missing_identifiers: {
    label: "No GTIN / UPC / MPN",
    dimension: "structure",
    fix: "Add a product identifier — required by Google Shopping and used for deduplication everywhere.",
  },
  incomplete_variant_options: {
    label: "Incomplete variant options",
    dimension: "structure",
    fix: "Some variants are missing option values. Complete every variant's option assignments.",
  },

  // taxonomy
  orphaned_no_category: {
    label: "Not in any category",
    dimension: "taxonomy",
    fix: "Assign the product to at least one category so it's navigable and included in category feeds.",
  },
  assigned_to_missing_category: {
    label: "Assigned to a missing category",
    dimension: "taxonomy",
    fix: "The product references a category id that no longer exists. Re-assign it to a real category.",
  },
  over_categorized: {
    label: "In too many categories",
    dimension: "taxonomy",
    fix: "This exceeds the selected profile's category limit within one channel tree. Keep the few categories that genuinely apply per channel.",
  },

  // hygiene
  zero_price: {
    label: "Zero price",
    dimension: "hygiene",
    fix: "Set a real price — zero-priced products break feeds and look like errors to shoppers.",
  },
  sale_price_not_lower: {
    label: "Sale price ≥ regular price",
    dimension: "hygiene",
    fix: "The sale price isn't lower than the regular price. Fix one of the two.",
  },
  missing_weight: {
    label: "Missing weight",
    dimension: "hygiene",
    fix: "Set the product weight — needed for shipping quotes and some feeds.",
  },
  visible_but_out_of_stock: {
    label: "Visible but out of stock",
    dimension: "hygiene",
    fix: "The product is visible with zero inventory. Restock it or hide it.",
  },

  // feed
  feed_missing_image: {
    label: "Feed: no image",
    dimension: "feed",
    fix: "An image is required for Google Shopping / AI-agent feeds.",
  },
  feed_missing_description: {
    label: "Feed: description too short",
    dimension: "feed",
    fix: "Feeds need at least a ~50-character description.",
  },
  feed_missing_brand: {
    label: "Feed: no brand",
    dimension: "feed",
    fix: "Brand is a required feed attribute.",
  },
  feed_missing_identifier: {
    label: "Feed: no identifier",
    dimension: "feed",
    fix: "GTIN/UPC/MPN is a required feed attribute.",
  },
  feed_missing_price: {
    label: "Feed: no price",
    dimension: "feed",
    fix: "A non-zero price is a required feed attribute.",
  },

  // semantic (LLM judge)
  desc_unclear_what_it_is: {
    label: "Description doesn't say what it is",
    dimension: "semantic",
    fix: "A first-time shopper can't tell what the product actually is. Open the description with a plain statement of what it is and does.",
  },
  desc_no_target_audience: {
    label: "Description doesn't say who it's for",
    dimension: "semantic",
    fix: "Add who the product is for or when to use it (audience, use case, occasion).",
  },
  desc_no_materials_or_specs: {
    label: "Description lacks materials / specs",
    dimension: "semantic",
    fix: "State what it's made of or its concrete specs (materials, ingredients, dimensions).",
  },
};

export function issueLabel(code) {
  return ISSUE_INFO[code]?.label || code.replaceAll("_", " ");
}
