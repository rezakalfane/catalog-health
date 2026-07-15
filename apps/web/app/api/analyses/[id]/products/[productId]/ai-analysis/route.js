import { NextResponse } from "next/server";
import {
  demoCatalog,
  fetchProduct,
  stripHtml,
  updateProduct,
  updateProductImage,
  upsertProductCustomField,
} from "@catalog-health/core";
import { getApiUser } from "@/lib/auth-helpers";
import {
  getAnalysis,
  getAnalysisProduct,
  getAnalysisRows,
  getEnvironment,
  getProductAiAnalysis,
  getDefaultLlmModel,
  getLlmModel,
  listLlmModels,
  redactLlmModel,
  saveProductAiAnalysis,
} from "@/lib/db";
import { analyzeProductWithAi } from "@/lib/product-ai-analysis";

function categoryContext(analysis, row) {
  const categories = analysis.catalog?.categories || [];
  const byId = new Map(categories.map((item) => [String(item.id), item]));
  return {
    current: (row.categories || []).map((id) => ({
      id,
      name: byId.get(String(id))?.name || `Category ${id}`,
    })),
    available: categories.slice(0, 250).map(({ id, name, parent_id, parentId, treeId }) => ({
      id,
      name,
      parentId: parentId ?? parent_id ?? null,
      treeId: treeId ?? null,
    })),
    taxonomyTruncated: categories.length > 250,
  };
}

function compactProduct(product, row) {
  return {
    id: product?.id ?? row.id,
    name: product?.name ?? row.name ?? "",
    sku: product?.sku ?? row.sku ?? "",
    description: product?.description ?? row.details?.descriptionExcerpt ?? "",
    brandId: product?.brand_id ?? (row.details?.hasBrand ? "assigned" : null),
    price: product?.price ?? row.details?.price ?? null,
    salePrice: product?.sale_price ?? row.details?.salePrice ?? null,
    weight: product?.weight ?? row.details?.weight ?? null,
    inventoryTracking: product?.inventory_tracking ?? row.details?.inventoryTracking ?? null,
    inventoryLevel: product?.inventory_level ?? row.details?.inventoryLevel ?? null,
    isVisible: product?.is_visible ?? row.details?.isVisible ?? null,
    relatedProducts: product?.related_products || [],
    identifiers: {
      gtin: product?.gtin ?? row.details?.gtin ?? "",
      upc: product?.upc ?? row.details?.upc ?? "",
      mpn: product?.mpn ?? row.details?.mpn ?? "",
    },
    customFields: (product?.custom_fields || []).map(({ name, value }) => ({ name, value })),
    options: (product?.options || []).map(({ id, display_name, type }) => ({
      id,
      name: display_name || "",
      type: type || "",
    })),
    variants: (product?.variants || []).slice(0, 50).map((variant) => ({
      sku: variant.sku || "",
      price: variant.price ?? null,
      inventoryLevel: variant.inventory_level ?? null,
      optionValues: (variant.option_values || []).map((value) => ({
        option: value.option_display_name || "",
        label: value.label || "",
      })),
    })),
    imageMetadata: (product?.images || []).slice(0, 10).map((image, index) => ({
      index: index + 1,
      isThumbnail: Boolean(image.is_thumbnail),
      altText: image.description || "",
    })),
  };
}

function semanticContext(analysis, row) {
  if (!row.semantic) return null;
  const questions = [
    ["what_it_is", "What is it?"],
    ["who_its_for", "Who's it for?"],
    ["made_of", "What's it made of?"],
  ];
  return {
    judge: analysis.catalog?.semanticJudge || analysis.scoringMetadata?.semantic?.judgeLabel || null,
    score: row.scores?.semantic ?? null,
    questions: questions.map(([key, label]) => ({
      key,
      label,
      verdict: row.semantic?.[key]?.verdict || "no",
      reason: row.semantic?.[key]?.reason || "",
      needsImprovement: row.semantic?.[key]?.verdict !== "yes",
    })),
    unevaluated: Boolean(row.semantic.unevaluated),
  };
}

function imageUrls(product) {
  return (product?.images || [])
    .map((image) => image.url_zoom || image.url_standard || image.url_thumbnail)
    .filter(Boolean);
}

const CANDIDATE_LIMIT = 12;
const STOP_WORDS = new Set([
  "and", "the", "for", "with", "from", "this", "that", "your", "product",
  "new", "pro", "lite", "pack", "set", "size", "colour", "color",
]);

function words(value) {
  return new Set(
    stripHtml(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  );
}

function shortlistCatalogRows(rows, current) {
  const currentCategories = new Set((current.categories || []).map(String));
  const currentWords = words(`${current.name || ""} ${current.details?.descriptionExcerpt || ""}`);
  return rows
    .filter((row) => String(row.id) !== String(current.id))
    .map((row) => {
      const sharedCategories = (row.categories || []).filter((id) => currentCategories.has(String(id))).length;
      const candidateWords = words(`${row.name || ""} ${row.details?.descriptionExcerpt || ""}`);
      const sharedWords = [...candidateWords].filter((word) => currentWords.has(word)).length;
      const commercialSignal = Math.log1p((row.totalSold || 0) * 3 + (row.viewCount || 0));
      return { row, relevance: sharedCategories * 100 + sharedWords * 12 + commercialSignal };
    })
    .sort((a, b) => b.relevance - a.relevance || (b.row.impact || 0) - (a.row.impact || 0))
    .slice(0, CANDIDATE_LIMIT)
    .map(({ row }) => row);
}

function candidateContext(product, row, categoriesById) {
  const categoryIds = product?.categories || row.categories || [];
  const images = product?.images || [];
  const thumbnail = images.find((image) => image.is_thumbnail) || images[0];
  const price = product?.price ?? row.details?.price ?? null;
  const salePrice = product?.sale_price ?? row.details?.salePrice ?? null;
  return {
    productId: Number(product?.id ?? row.id),
    title: product?.name ?? row.name ?? "",
    sku: product?.sku ?? row.sku ?? "",
    description: stripHtml(product?.description ?? row.details?.descriptionExcerpt ?? "").slice(0, 2400),
    categoryIds,
    categoryNames: categoryIds.map((id) => categoriesById.get(String(id))?.name || `Category ${id}`),
    price,
    salePrice: Number(salePrice) > 0 ? salePrice : null,
    thumbnailUrl: thumbnail?.url_thumbnail || thumbnail?.url_standard || row.details?.thumbnailUrl || "",
    imageCount: images.length || row.details?.imageCount || 0,
    imageAltText: images.slice(0, 5).map((image) => image.description || "").filter(Boolean),
    customFields: (product?.custom_fields || []).slice(0, 20).map(({ name, value }) => ({ name, value })),
    options: (product?.options || []).slice(0, 12).map(({ display_name, type }) => ({
      name: display_name || "",
      type: type || "",
    })),
    additionalFields: {
      brandId: product?.brand_id ?? (row.details?.hasBrand ? "assigned" : null),
      weight: product?.weight ?? row.details?.weight ?? null,
      inventoryTracking: product?.inventory_tracking ?? row.details?.inventoryTracking ?? null,
      inventoryLevel: product?.inventory_level ?? row.details?.inventoryLevel ?? null,
      identifiers: {
        gtin: product?.gtin ?? row.details?.gtin ?? "",
        upc: product?.upc ?? row.details?.upc ?? "",
        mpn: product?.mpn ?? row.details?.mpn ?? "",
      },
    },
    catalogSignals: {
      score: row.overall,
      grade: row.grade,
      views: row.viewCount,
      unitsSold: row.totalSold,
    },
  };
}

async function inBatches(items, batchSize, mapper) {
  const output = [];
  for (let index = 0; index < items.length; index += batchSize) {
    output.push(...await Promise.all(items.slice(index, index + batchSize).map(mapper)));
  }
  return output;
}

async function productRecommendationCandidates(analysis, current, userId) {
  const rows = shortlistCatalogRows(getAnalysisRows(userId, analysis.id), current);
  const categoriesById = new Map((analysis.catalog?.categories || []).map((category) => [String(category.id), category]));
  if (analysis.environmentId === "demo") {
    const byId = new Map(demoCatalog().products.map((product) => [String(product.id), product]));
    return rows.map((row) => candidateContext(byId.get(String(row.id)), row, categoriesById));
  }
  const environment = getEnvironment(userId, analysis.environmentId);
  if (!environment) return rows.map((row) => candidateContext(null, row, categoriesById));
  return inBatches(rows, 4, async (row) => {
    const product = await fetchProduct({
      storeHash: environment.storeHash,
      token: environment.accessToken,
      productId: row.id,
    }).catch(() => null);
    return candidateContext(product, row, categoriesById);
  });
}

async function sourceProduct(analysis, row, userId) {
  if (analysis.environmentId === "demo") {
    return {
      product: demoCatalog().products.find((item) => String(item.id) === String(row.id)) || null,
      source: "demo catalog",
      warning: null,
    };
  }
  const environment = getEnvironment(userId, analysis.environmentId);
  if (!environment) {
    return { product: null, source: "analysis snapshot", warning: "The source environment no longer exists." };
  }
  try {
    const product = await fetchProduct({
      storeHash: environment.storeHash,
      token: environment.accessToken,
      productId: row.id,
    });
    return { product, source: "current BigCommerce product", warning: null };
  } catch (error) {
    return {
      product: null,
      source: "analysis snapshot",
      warning: `The current product could not be loaded; the saved analysis snapshot was used (${error.message}).`,
    };
  }
}

async function ownedProduct(userId, id, productId) {
  const analysis = getAnalysis(userId, id);
  if (!analysis) return {};
  const row = getAnalysisProduct(userId, id, productId);
  return { analysis, row };
}

function modelOptions(userId) {
  const models = listLlmModels(userId).map(redactLlmModel);
  const defaultModel = models.find((model) => model.isDefault) || models[0] || null;
  return { models, defaultModelId: defaultModel?.id || null };
}

function pushStateFromProduct(product) {
  return {
    relatedProductIds: (product?.related_products || [])
      .map(Number)
      .filter((id) => Number.isFinite(id) && id > 0),
  };
}

async function currentPushState(analysis, row, userId) {
  if (analysis.environmentId === "demo") return pushStateFromProduct(null);
  const environment = getEnvironment(userId, analysis.environmentId);
  if (!environment) return pushStateFromProduct(null);
  const product = await fetchProduct({
    storeHash: environment.storeHash,
    token: environment.accessToken,
    productId: row.id,
  }).catch(() => null);
  return pushStateFromProduct(product);
}

function normalizeFieldName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function numericValue(value, field) {
  const number = Number(String(value).replace(/[$,]/g, "").trim());
  if (!Number.isFinite(number)) throw new Error(`Suggested ${field} is not a valid number.`);
  return number;
}

function booleanValue(value) {
  const normalized = normalizeFieldName(value);
  if (["true", "yes", "visible", "1"].includes(normalized)) return true;
  if (["false", "no", "hidden", "0"].includes(normalized)) return false;
  throw new Error("Suggested visibility is not a valid yes/no value.");
}

function normalizeComparable(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeDescriptionHtmlForPush(value) {
  let html = String(value || "").trim();
  html = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/\son\w+=\S+/gi, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
  if (!html) return "<div></div>";
  if (!/<[a-z][\s\S]*>/i.test(html)) html = `<p>${escapeHtml(html)}</p>`;
  if (!/^<div(?:\s[^>]*)?>[\s\S]*<\/div>$/i.test(html)) html = `<div>${html}</div>`;
  return html.replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();
}

function sameNumber(a, b) {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 0.000001;
}

function coreFieldPatch(field, value) {
  const key = normalizeFieldName(field);
  if (["title", "name", "product title"].includes(key)) return { name: String(value) };
  if (["description", "product description"].includes(key)) return { description: String(value) };
  if (key === "sku") return { sku: String(value) };
  if (key === "gtin") return { gtin: String(value) };
  if (key === "upc") return { upc: String(value) };
  if (key === "mpn") return { mpn: String(value) };
  if (key === "price") return { price: numericValue(value, "price") };
  if (["sale price", "sale_price"].includes(key)) return { sale_price: numericValue(value, "sale price") };
  if (key === "weight") return { weight: numericValue(value, "weight") };
  if (["visible", "visibility", "is visible"].includes(key)) return { is_visible: booleanValue(value) };
  return null;
}

function productChangeHasEffect(current, data) {
  return Object.entries(data || {}).some(([key, value]) => {
    if (["price", "sale_price", "weight"].includes(key)) return !sameNumber(current?.[key] || 0, value);
    if (key === "categories") {
      const before = new Set((current?.categories || []).map(String));
      const after = new Set((value || []).map(String));
      return before.size !== after.size || [...after].some((id) => !before.has(id));
    }
    if (typeof value === "boolean") return Boolean(current?.[key]) !== value;
    return normalizeComparable(current?.[key]) !== normalizeComparable(value);
  });
}

function assertHasEffect(hasEffect) {
  if (!hasEffect) {
    const error = new Error("This suggestion already matches the current BigCommerce product.");
    error.status = 409;
    throw error;
  }
}

function savedPushIds(review) {
  return new Set((review?.result?.pushedChanges || []).map((change) => change.id));
}

function pushableChangesFromReview(review) {
  const result = review?.result || {};
  const changes = [];
  if (result.title?.suggestedTitle) {
    changes.push({
      id: "title.suggestedTitle",
      label: "Suggested title",
      kind: "product",
      data: { name: result.title.suggestedTitle },
      value: result.title.suggestedTitle,
    });
  }
  if (result.description?.rewrittenDescription) {
    const descriptionHtml = normalizeDescriptionHtmlForPush(result.description.rewrittenDescription);
    changes.push({
      id: "description.rewrittenDescription",
      label: "Rewritten product description",
      kind: "product",
      data: { description: descriptionHtml },
      value: descriptionHtml,
    });
  }
  (result.derivedFields || []).forEach((field, index) => {
    if (!field?.field || field.value == null) return;
    if (field.fieldType === "custom") {
      changes.push({
        id: `derivedFields.${index}`,
        label: `Custom field: ${field.field}`,
        kind: "customField",
        name: field.field,
        value: String(field.value),
      });
      return;
    }
    if (field.fieldType === "core") {
      const data = coreFieldPatch(field.field, field.value);
      if (data) {
        changes.push({
          id: `derivedFields.${index}`,
          label: `Product field: ${field.field}`,
          kind: "product",
          data,
          value: field.value,
        });
      }
    }
  });
  (result.placement?.suggestedCategories || []).forEach((category, index) => {
    if (category?.categoryId == null || category.isNewCategory) return;
    changes.push({
      id: `placement.suggestedCategories.${index}`,
      label: `Category: ${category.name || category.categoryId}`,
      kind: "category",
      categoryId: Number(category.categoryId),
      value: category.name || `Category ${category.categoryId}`,
    });
  });
  if (result.feedAndDiscovery?.seoTitle) {
    changes.push({
      id: "feedAndDiscovery.seoTitle",
      label: "SEO title",
      kind: "product",
      data: { page_title: result.feedAndDiscovery.seoTitle },
      value: result.feedAndDiscovery.seoTitle,
    });
  }
  if (result.feedAndDiscovery?.seoDescription) {
    changes.push({
      id: "feedAndDiscovery.seoDescription",
      label: "SEO description",
      kind: "product",
      data: { meta_description: result.feedAndDiscovery.seoDescription },
      value: result.feedAndDiscovery.seoDescription,
    });
  }
  if ((result.feedAndDiscovery?.searchTerms || []).length) {
    changes.push({
      id: "feedAndDiscovery.searchTerms",
      label: "Search terms",
      kind: "product",
      data: { search_keywords: result.feedAndDiscovery.searchTerms.join(", ") },
      value: result.feedAndDiscovery.searchTerms.join(", "),
    });
  }
  (result.imageReview?.images || []).forEach((image) => {
    if (!image?.imageIndex || !image.suggestedAltText) return;
    changes.push({
      id: `imageReview.images.${image.imageIndex}.altText`,
      label: `Image ${image.imageIndex} alt text`,
      kind: "image",
      imageIndex: Number(image.imageIndex),
      value: image.suggestedAltText,
    });
  });
  (result.productRecommendations || []).forEach((recommendation) => {
    const relatedProductId = Number(recommendation?.productId);
    if (!Number.isFinite(relatedProductId) || relatedProductId <= 0) return;
    changes.push({
      id: `productRecommendations.${relatedProductId}.relatedProduct`,
      label: `Related product: ${recommendation.title || relatedProductId}`,
      kind: "relatedProduct",
      relatedProductId,
      value: recommendation.title || `Product ${relatedProductId}`,
    });
  });
  const pushed = savedPushIds(review);
  return changes.map((change) => ({ ...change, pushed: pushed.has(change.id) }));
}

async function applyPushableChange({ change, analysis, row, userId }) {
  if (analysis.environmentId === "demo") {
    throw new Error("Demo products cannot be updated in BigCommerce.");
  }
  const environment = getEnvironment(userId, analysis.environmentId);
  if (!environment) throw new Error("The source environment no longer exists.");
  const current = await fetchProduct({
    storeHash: environment.storeHash,
    token: environment.accessToken,
    productId: row.id,
  });
  if (!current) throw new Error("The current BigCommerce product could not be loaded.");

  if (change.kind === "product") {
    assertHasEffect(productChangeHasEffect(current, change.data));
    await updateProduct({
      storeHash: environment.storeHash,
      token: environment.accessToken,
      productId: row.id,
      data: change.data,
    });
  } else if (change.kind === "customField") {
    const existing = (current.custom_fields || []).find(
      (field) => normalizeFieldName(field.name) === normalizeFieldName(change.name)
    );
    assertHasEffect(!existing || normalizeComparable(existing.value) !== normalizeComparable(change.value));
    await upsertProductCustomField({
      storeHash: environment.storeHash,
      token: environment.accessToken,
      productId: row.id,
      customFieldId: existing?.id,
      name: change.name,
      value: change.value,
    });
  } else if (change.kind === "category") {
    const categories = [...new Set([...(current.categories || row.categories || []), change.categoryId].map(Number))];
    assertHasEffect(!(current.categories || []).map(String).includes(String(change.categoryId)));
    await updateProduct({
      storeHash: environment.storeHash,
      token: environment.accessToken,
      productId: row.id,
      data: { categories },
    });
  } else if (change.kind === "image") {
    const image = (current.images || [])[change.imageIndex - 1];
    if (!image?.id) throw new Error(`Image ${change.imageIndex} is not available on the current BigCommerce product.`);
    assertHasEffect(normalizeComparable(image.description) !== normalizeComparable(change.value));
    await updateProductImage({
      storeHash: environment.storeHash,
      token: environment.accessToken,
      productId: row.id,
      imageId: image.id,
      data: { description: change.value },
    });
  } else if (change.kind === "relatedProduct") {
    const relatedProducts = (current.related_products || [])
      .map(Number)
      .filter((id) => Number.isFinite(id) && id > 0);
    assertHasEffect(!relatedProducts.map(String).includes(String(change.relatedProductId)));
    await updateProduct({
      storeHash: environment.storeHash,
      token: environment.accessToken,
      productId: row.id,
      data: { related_products: [...new Set([...relatedProducts, change.relatedProductId])] },
    });
  } else {
    throw new Error("This AI suggestion cannot be pushed to BigCommerce.");
  }
}

export async function GET(_request, { params }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, productId } = await params;
  const { analysis, row } = await ownedProduct(user.id, id, productId);
  if (!analysis || !row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    review: getProductAiAnalysis(user.id, id, productId),
    pushState: await currentPushState(analysis, row, user.id),
    ...modelOptions(user.id),
  });
}

export async function PATCH(request, { params }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, productId } = await params;
  const { analysis, row } = await ownedProduct(user.id, id, productId);
  if (!analysis || !row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const review = getProductAiAnalysis(user.id, id, productId);
  if (!review?.result) return NextResponse.json({ error: "Run AI Analysis before pushing changes." }, { status: 409 });

  const body = await request.json().catch(() => ({}));
  const change = pushableChangesFromReview(review).find((item) => item.id === body.changeId);
  if (!change) return NextResponse.json({ error: "This AI suggestion cannot be pushed to BigCommerce." }, { status: 400 });
  if (change.pushed && !body.force) {
    return NextResponse.json({
      review,
      change,
      pushState: await currentPushState(analysis, row, user.id),
    });
  }

  try {
    await applyPushableChange({ change, analysis, row, userId: user.id });
    const pushedChange = {
      id: change.id,
      label: change.label,
      kind: change.kind,
      value: change.value,
      pushedAt: new Date().toISOString(),
    };
    const nextResult = {
      ...review.result,
      pushedChanges: [
        ...(review.result.pushedChanges || []).filter((item) => item.id !== change.id),
        pushedChange,
      ],
    };
    const nextReview = saveProductAiAnalysis(user.id, id, productId, {
      ...review,
      result: nextResult,
      generatedAt: review.generatedAt,
    });
    return NextResponse.json({
      review: nextReview,
      change: pushedChange,
      pushState: await currentPushState(analysis, row, user.id),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Could not push this change to BigCommerce." },
      { status: error?.status || 502 }
    );
  }
}

export async function POST(request, { params }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, productId } = await params;
  const { analysis, row } = await ownedProduct(user.id, id, productId);
  if (!analysis || !row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (analysis.status !== "done") {
    return NextResponse.json({ error: "AI Analysis is available after the analysis completes." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const settings = body.modelConfigurationId
    ? getLlmModel(user.id, body.modelConfigurationId)
    : getDefaultLlmModel(user.id);
  const readiness = redactLlmModel(settings);
  if (!readiness?.configured) {
    return NextResponse.json(
      { error: "Configure and select an LLM model in Settings → Models before running AI Analysis." },
      { status: 409 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let open = true;
      const send = (event) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      const close = () => {
        if (!open) return;
        open = false;
        controller.close();
      };

      (async () => {
        try {
          send({
            type: "progress",
            step: "Loading product data",
            detail: "Fetching the current BigCommerce product and its stored scoring context.",
          });
          const source = await sourceProduct(analysis, row, user.id);
          send({
            type: "progress",
            step: "Preparing catalog context",
            detail: "Combining product content, categories, scoring signals, and a relevant catalog shortlist.",
          });
          const product = compactProduct(source.product, row);
          const recommendationCandidates = await productRecommendationCandidates(analysis, row, user.id);
          const generated = await analyzeProductWithAi({
            settings,
            onProgress: (progress) => send({ type: "progress", ...progress }),
            context: {
              source: source.source,
              sourceWarning: source.warning,
              analyzedSnapshotAt: analysis.createdAt,
              product,
              semanticReview: semanticContext(analysis, row),
              productRecommendationCandidates: recommendationCandidates,
              categories: categoryContext(analysis, row),
              health: {
                score: row.overall,
                grade: row.grade,
                dimensions: row.scores,
                issues: row.issues,
                views: row.viewCount,
                unitsSold: row.totalSold,
                impact: row.impact,
              },
            },
            imageUrls: imageUrls(source.product),
          });
          if (source.warning) {
            generated.result.limitations = [
              ...new Set([source.warning, ...(generated.result.limitations || [])]),
            ];
          }
          send({
            type: "progress",
            step: "Saving AI Analysis",
            detail: "Persisting the validated review so it remains available on this product.",
          });
          const review = saveProductAiAnalysis(user.id, id, productId, {
            provider: generated.provider,
            model: generated.model,
            modelConfigurationId: settings.id,
            modelConfigurationName: settings.name,
            source: source.source,
            imageAnalysis: generated.imageAnalysis,
            result: generated.result,
            generatedAt: new Date().toISOString(),
          });
          send({
            type: "result",
            review,
            pushState: pushStateFromProduct(source.product),
            ...modelOptions(user.id),
          });
        } catch (error) {
          console.error("Product AI analysis failed", error);
          send({ type: "error", error: error?.message || "AI Analysis failed." });
        } finally {
          close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
