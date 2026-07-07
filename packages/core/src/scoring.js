/**
 * Catalog health scoring engine.
 * Five dimensions: content, structure, taxonomy, hygiene, feed.
 */

export const DIMENSION_WEIGHTS = {
  content: 0.25,
  structure: 0.25,
  taxonomy: 0.15,
  hygiene: 0.2,
  feed: 0.15,
};

/**
 * When the semantic pass runs, it takes this share of the overall score and
 * the five heuristic dimensions scale down proportionally to make room.
 */
export const SEMANTIC_WEIGHT = 0.15;

export const THRESHOLDS = {
  minDescriptionChars: 200,
  goodDescriptionChars: 500,
  minImages: 2,
  maxSaneCategories: 5,
  titleMin: 10,
  titleMax: 150,
};

const SKU_LIKE_TITLE = /^[A-Z0-9\-_]{4,}$/;

export function grade(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function stripHtml(text) {
  return (text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function scoreContent(p, issues) {
  let pts = 0;
  const desc = stripHtml(p.description);
  if (desc.length === 0) issues.push("missing_description");
  else if (desc.length < THRESHOLDS.minDescriptionChars) {
    issues.push("thin_description");
    pts += 15;
  } else if (desc.length < THRESHOLDS.goodDescriptionChars) pts += 28;
  else pts += 35;

  const images = p.images || [];
  if (images.length === 0) issues.push("no_images");
  else if (images.length < THRESHOLDS.minImages) {
    issues.push("single_image");
    pts += 12;
  } else pts += 25;

  if (images.length) {
    const withAlt = images.filter((i) => (i.description || "").trim()).length;
    const ratio = withAlt / images.length;
    pts += Math.round(15 * ratio);
    if (ratio < 0.5) issues.push("missing_alt_text");
  }

  const name = (p.name || "").trim();
  if (
    name.length >= THRESHOLDS.titleMin &&
    name.length <= THRESHOLDS.titleMax &&
    !SKU_LIKE_TITLE.test(name)
  ) {
    pts += 15;
    if (name === name.toUpperCase() && name.length > 12) {
      pts -= 5;
      issues.push("all_caps_title");
    }
  } else issues.push("weak_title");

  if (p.brand_id) pts += 10;
  else issues.push("missing_brand");

  return Math.min(pts, 100);
}

function scoreStructure(p, peerMedianCf, issues) {
  let pts = 0;
  const cfCount = (p.custom_fields || []).length;
  if (peerMedianCf > 0) {
    const ratio = Math.min(cfCount / peerMedianCf, 1);
    pts += Math.round(40 * ratio);
    if (ratio < 0.5) issues.push("attribute_gap_vs_peers");
  } else {
    pts += cfCount > 0 ? 20 : 0;
    if (cfCount === 0) issues.push("no_custom_fields");
  }

  if (p.gtin || p.upc || p.mpn) pts += 30;
  else issues.push("missing_identifiers");

  const variants = p.variants || [];
  const options = p.options || [];
  if (options.length) {
    const broken = variants.filter(
      (v) => (v.option_values || []).length < options.length
    );
    if (broken.length) {
      issues.push("incomplete_variant_options");
      pts += 15;
    } else pts += 30;
  } else pts += 30;

  return Math.min(pts, 100);
}

function scoreTaxonomy(p, validCategoryIds, treeByCat, issues) {
  const cats = p.categories || [];
  if (!cats.length) {
    issues.push("orphaned_no_category");
    return 0;
  }
  let pts = 60;
  const unknown = cats.filter(
    (c) => validCategoryIds.size && !validCategoryIds.has(c)
  );
  if (unknown.length) issues.push("assigned_to_missing_category");
  else pts += 25;
  // Over-categorization is judged per channel tree (multi-storefront):
  // 12 assignments spread across 4 channels is 3 per channel — fine.
  // Stores without trees (or the demo) group everything as one tree.
  const perTree = new Map();
  for (const c of cats) {
    const tree = treeByCat.get(c) ?? "default";
    perTree.set(tree, (perTree.get(tree) || 0) + 1);
  }
  if (Math.max(...perTree.values()) > THRESHOLDS.maxSaneCategories) {
    issues.push("over_categorized");
  } else pts += 15;
  return Math.min(pts, 100);
}

function scoreHygiene(p, issues) {
  let pts = 0;
  const price = p.price || 0;
  const sale = p.sale_price || 0;
  if (price > 0) pts += 30;
  else issues.push("zero_price");
  if (sale && price && sale >= price) issues.push("sale_price_not_lower");
  else pts += 20;
  if ((p.weight || 0) > 0) pts += 20;
  else issues.push("missing_weight");
  const tracking = p.inventory_tracking || "none";
  const visible = p.is_visible !== false;
  const stock = p.inventory_level || 0;
  if (visible && tracking === "product" && stock === 0)
    issues.push("visible_but_out_of_stock");
  else pts += 30;
  return Math.min(pts, 100);
}

function scoreFeed(p, issues) {
  const desc = stripHtml(p.description);
  const checks = {
    feed_missing_image: (p.images || []).length > 0,
    feed_missing_description: desc.length >= 50,
    feed_missing_brand: Boolean(p.brand_id),
    feed_missing_identifier: Boolean(p.gtin || p.upc || p.mpn),
    feed_missing_price: (p.price || 0) > 0,
  };
  let passed = 0;
  for (const [flag, ok] of Object.entries(checks)) {
    if (ok) passed += 1;
    else issues.push(flag);
  }
  return Math.round((100 * passed) / Object.keys(checks).length);
}

/**
 * Merge semantic verdicts (from the LLM judge) into analyzed rows: adds a
 * `semantic` dimension, re-weights the overall score, and appends semantic
 * issues. Rows without a verdict (no description, or a failed chunk with a
 * missing description signal) score 0 on the dimension.
 */
export function applySemanticVerdicts(rows, verdictsById) {
  const pts = { yes: 1, partial: 0.5, no: 0 };
  const NO_DESCRIPTION = "Not evaluated — no description was available to judge.";
  const NO_RESULT =
    "The judge did not return a result for this product — the batch may have failed or the model's response was incomplete. Try re-running the analysis.";
  return rows.map((row) => {
    const v = verdictsById.get(row.id);
    const issues = [...row.issues];
    let semantic = 0;
    let semanticDetail;
    if (v) {
      semantic = Math.round(
        100 *
          (0.5 * pts[v.what_it_is.verdict] +
            0.25 * pts[v.who_its_for.verdict] +
            0.25 * pts[v.made_of.verdict])
      );
      if (pts[v.what_it_is.verdict] < 1) issues.push("desc_unclear_what_it_is");
      if (pts[v.who_its_for.verdict] < 1) issues.push("desc_no_target_audience");
      if (pts[v.made_of.verdict] < 1) issues.push("desc_no_materials_or_specs");
      semanticDetail = {
        what_it_is: v.what_it_is,
        who_its_for: v.who_its_for,
        made_of: v.made_of,
      };
    } else {
      issues.push(
        "desc_unclear_what_it_is",
        "desc_no_target_audience",
        "desc_no_materials_or_specs"
      );
      // Distinguish "genuinely had no description" from "was submitted to the
      // judge but no usable verdict came back" — the messages are different.
      const hadDescription = (row.details?.descriptionChars || 0) >= 20;
      const reason = hadDescription ? NO_RESULT : NO_DESCRIPTION;
      semanticDetail = {
        what_it_is: { verdict: "no", reason },
        who_its_for: { verdict: "no", reason },
        made_of: { verdict: "no", reason },
        unevaluated: true,
      };
    }
    const scores = { ...row.scores, semantic };
    const overall = Math.round(
      Object.entries(DIMENSION_WEIGHTS).reduce(
        (acc, [d, w]) => acc + scores[d] * w * (1 - SEMANTIC_WEIGHT),
        0
      ) + semantic * SEMANTIC_WEIGHT
    );
    const impact =
      Math.round((100 - overall) * Math.log1p(row.viewCount + 5 * row.totalSold) * 10) / 10;
    return { ...row, scores, overall, grade: grade(overall), impact, issues, semantic: semanticDetail };
  });
}

/**
 * Analyze a catalog. Returns per-product rows with scores, issues, impact.
 */
export function analyzeCatalog(products, categories) {
  const validCategoryIds = new Set(
    categories.map((c) => c.category_id ?? c.id)
  );
  const treeByCat = new Map(
    categories.map((c) => [c.category_id ?? c.id, c.tree_id ?? null])
  );

  // Peer baseline: median custom-field count per category
  const cfByCat = new Map();
  for (const p of products) {
    const cf = (p.custom_fields || []).length;
    const cats = p.categories?.length ? p.categories : [null];
    for (const c of cats) {
      if (!cfByCat.has(c)) cfByCat.set(c, []);
      cfByCat.get(c).push(cf);
    }
  }
  const medianCf = new Map(
    [...cfByCat.entries()].map(([c, v]) => [c, median(v)])
  );

  return products.map((p) => {
    const issues = [];
    const cats = p.categories?.length ? p.categories : [null];
    const peer = Math.max(...cats.map((c) => medianCf.get(c) || 0), 0);

    // The raw facts each dimension inspected — persisted with the row so
    // the product drill-down can show what the scores were based on.
    const desc = stripHtml(p.description);
    const images = p.images || [];
    const options = p.options || [];
    const variants = p.variants || [];
    const thumb = images.find((i) => i.is_thumbnail) || images[0];
    const details = {
      descriptionChars: desc.length,
      descriptionExcerpt: desc.slice(0, 255),
      thumbnailUrl: thumb?.url_thumbnail || thumb?.url_standard || "",
      imageCount: images.length,
      imagesWithAlt: images.filter((i) => (i.description || "").trim()).length,
      hasBrand: Boolean(p.brand_id),
      customFieldCount: (p.custom_fields || []).length,
      peerMedianCustomFields: peer,
      gtin: p.gtin || "",
      upc: p.upc || "",
      mpn: p.mpn || "",
      optionCount: options.length,
      variantCount: variants.length,
      incompleteVariants: options.length
        ? variants.filter((v) => (v.option_values || []).length < options.length).length
        : 0,
      price: p.price ?? 0,
      salePrice: p.sale_price ?? 0,
      weight: p.weight ?? 0,
      isVisible: p.is_visible !== false,
      inventoryTracking: p.inventory_tracking || "none",
      inventoryLevel: p.inventory_level ?? 0,
    };

    const scores = {
      content: scoreContent(p, issues),
      structure: scoreStructure(p, peer, issues),
      taxonomy: scoreTaxonomy(p, validCategoryIds, treeByCat, issues),
      hygiene: scoreHygiene(p, issues),
      feed: scoreFeed(p, issues),
    };
    const overall = Math.round(
      Object.entries(DIMENSION_WEIGHTS).reduce(
        (acc, [d, w]) => acc + scores[d] * w,
        0
      )
    );
    const views = p.view_count || 0;
    const sold = p.total_sold || 0;
    const impact =
      Math.round((100 - overall) * Math.log1p(views + 5 * sold) * 10) / 10;

    return {
      id: p.id,
      sku: p.sku || "",
      name: p.name || "",
      categories: p.categories || [],
      overall,
      grade: grade(overall),
      scores,
      viewCount: views,
      totalSold: sold,
      impact,
      issues,
      details,
    };
  });
}
