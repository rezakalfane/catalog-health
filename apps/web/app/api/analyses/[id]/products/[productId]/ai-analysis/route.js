import { NextResponse } from "next/server";
import { demoCatalog, fetchProduct, stripHtml } from "@catalog-health/core";
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

export async function GET(_request, { params }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, productId } = await params;
  const { analysis, row } = await ownedProduct(user.id, id, productId);
  if (!analysis || !row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    review: getProductAiAnalysis(user.id, id, productId),
    ...modelOptions(user.id),
  });
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
      { error: "Configure and select an LLM model in Settings before running AI Analysis." },
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
          send({ type: "result", review, ...modelOptions(user.id) });
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
