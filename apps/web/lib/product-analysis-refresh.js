import {
  analyzeCatalog,
  applySemanticVerdicts,
  createJudge,
  fetchProduct,
  judgeCatalog,
  summarize,
} from "@catalog-health/core";
import {
  analysisStatus,
  getAnalysis,
  getAnalysisRows,
  getEnvironment,
  getLlmModel,
  updateAnalysis,
} from "./db.js";

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function productFromRow(row, profile) {
  const details = row.details;
  if (!details) {
    throw httpError("This analysis predates stored scoring facts and cannot refresh individual products.", 409);
  }
  const descriptionCap = Math.max(50, profile.thresholds.goodDescriptionChars) + 1;
  const imageCount = Math.max(0, details.imageCount || 0);
  const imagesWithAlt = Math.min(imageCount, Math.max(0, details.imagesWithAlt || 0));
  const optionCount = Math.max(0, details.optionCount || 0);
  const incompleteVariants = Math.max(0, details.incompleteVariants || 0);
  const descriptionChars = Math.min(
    descriptionCap,
    Math.max(0, details.descriptionChars || 0)
  );

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: "x".repeat(descriptionChars),
    images: Array.from({ length: imageCount }, (_, index) => ({
      description: index < imagesWithAlt ? "alt" : "",
    })),
    brand_id: details.hasBrand ? 1 : 0,
    custom_fields: Array.from({ length: Math.max(0, details.customFieldCount || 0) }),
    gtin: details.gtin || "",
    upc: details.upc || "",
    mpn: details.mpn || "",
    options: Array.from({ length: optionCount }),
    variants: optionCount
      ? [
          {
            option_values: incompleteVariants
              ? []
              : Array.from({ length: optionCount }),
          },
        ]
      : [],
    categories: row.categories || [],
    price: details.price ?? 0,
    sale_price: details.salePrice ?? 0,
    weight: details.weight ?? 0,
    is_visible: details.isVisible !== false,
    inventory_tracking: details.inventoryTracking || "none",
    inventory_level: details.inventoryLevel ?? 0,
    view_count: row.viewCount ?? 0,
    total_sold: row.totalSold ?? 0,
  };
}

function productWithHistoricalSignals(product, row) {
  return {
    ...product,
    images: (product.images || []).map((image) => ({
      ...image,
      url_thumbnail:
        image.url_thumbnail ||
        image.url_standard ||
        image.url_zoom ||
        image.url_tiny ||
        image.url,
      url_standard:
        image.url_standard ||
        image.url_zoom ||
        image.url_thumbnail ||
        image.url_tiny ||
        image.url,
    })),
    view_count: row.viewCount ?? 0,
    total_sold: row.totalSold ?? 0,
  };
}

function preserveUnchangedRowDetails(rows, originalRows, refreshedProductId) {
  const originalById = new Map(originalRows.map((row) => [String(row.id), row]));
  return rows.map((row) => {
    const original = originalById.get(String(row.id));
    if (!original) return row;
    if (String(row.id) !== String(refreshedProductId)) {
      return { ...row, details: original.details };
    }
    if (!row.details?.thumbnailUrl && original.details?.thumbnailUrl) {
      return {
        ...row,
        details: {
          ...row.details,
          thumbnailUrl: original.details.thumbnailUrl,
        },
      };
    }
    return row;
  });
}

function semanticVerdictsFromRows(rows) {
  return new Map(
    rows
      .filter((row) => row.semantic && !row.semantic.unevaluated)
      .map((row) => [Number(row.id), row.semantic])
  );
}

async function refreshedSemanticVerdicts({ analysis, product, rows, userId }) {
  const semantic = analysis.scoringMetadata?.semantic || {};
  if (!semantic.applied) return null;

  let judgeSettings;
  if (analysis.environmentId === "demo") {
    judgeSettings = { provider: "demo" };
  } else {
    judgeSettings = semantic.configurationId
      ? getLlmModel(userId, semantic.configurationId)
      : null;
    if (!judgeSettings) {
      judgeSettings = semantic.provider && semantic.model
        ? { provider: semantic.provider, model: semantic.model }
        : null;
    }
    if (!judgeSettings) {
      throw httpError(
        "This analysis used semantic scoring, but its original semantic model metadata is unavailable.",
        409
      );
    }
  }

  let judge;
  try {
    judge = createJudge(judgeSettings);
  } catch (error) {
    throw httpError(`Semantic refresh is unavailable: ${error.message}`, 409);
  }

  const verdicts = semanticVerdictsFromRows(rows);
  const refreshed = await judgeCatalog([product], {
    judgeChunk: judge.judgeChunk,
    concurrency: judge.concurrency,
    minDelayMs: judge.minDelayMs,
  });
  verdicts.delete(Number(product.id));
  for (const [id, verdict] of refreshed) verdicts.set(Number(id), verdict);
  return verdicts;
}

export async function refreshAnalysisProduct({ userId, analysisId, productId }) {
  const analysis = getAnalysis(userId, analysisId);
  if (!analysis) throw httpError("Analysis not found", 404);
  if (analysisStatus(analysis) !== "done" || !analysis.hasRows) {
    throw httpError("Only completed analyses with stored product details can be refreshed.", 409);
  }
  if (analysis.sourceAnalysisId) {
    throw httpError("Profile recalculations are stored snapshots and cannot refresh live products.", 409);
  }
  if (analysis.environmentId === "demo") {
    throw httpError("Demo analyses cannot refresh products from BigCommerce.", 409);
  }

  const environment = getEnvironment(userId, analysis.environmentId);
  if (!environment) throw httpError("The source environment no longer exists.", 404);

  const rows = getAnalysisRows(userId, analysisId);
  const target = rows.find((row) => String(row.id) === String(productId));
  if (!target) throw httpError("Product not found in this analysis.", 404);
  if (rows.some((row) => !row.details)) {
    throw httpError("This analysis predates stored scoring facts and cannot refresh individual products.", 409);
  }

  const liveProduct = await fetchProduct({
    storeHash: environment.storeHash,
    token: environment.accessToken,
    productId: target.id,
  });
  if (!liveProduct) throw httpError("The current BigCommerce product could not be loaded.", 502);

  const profile = analysis.scoringMetadata?.profile || environment.scoringProfile;
  const categories = analysis.catalog?.categories || [];
  const normalizedCategories = categories.map((category) => ({
    ...category,
    tree_id: category.tree_id ?? category.treeId ?? null,
  }));

  const products = rows.map((row) =>
    String(row.id) === String(target.id)
      ? productWithHistoricalSignals(liveProduct, row)
      : productFromRow(row, profile)
  );

  const startedAt = Date.now();
  let nextRows = analyzeCatalog(products, normalizedCategories, profile);
  let semanticMs = null;
  const semanticStart = Date.now();
  const semanticVerdicts = await refreshedSemanticVerdicts({
    analysis,
    product: productWithHistoricalSignals(liveProduct, target),
    rows,
    userId,
  });
  if (semanticVerdicts) {
    nextRows = applySemanticVerdicts(nextRows, semanticVerdicts, profile);
    semanticMs = Date.now() - semanticStart;
  }
  nextRows = preserveUnchangedRowDetails(nextRows, rows, target.id);

  const summary = summarize(nextRows, categories);
  const metadata = {
    ...analysis.scoringMetadata,
    productRefresh: {
      productId: target.id,
      refreshedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      semanticMs,
    },
  };

  const updated = updateAnalysis(analysisId, {
    summary,
    rows: nextRows,
    scoringMetadata: metadata,
    progress: { percent: 100, stage: "done", label: "Analysis complete", detail: null },
  });
  return {
    analysis: updated,
    product: nextRows.find((row) => String(row.id) === String(target.id)),
    summary,
    refreshedAt: metadata.productRefresh.refreshedAt,
    semanticMs,
  };
}
