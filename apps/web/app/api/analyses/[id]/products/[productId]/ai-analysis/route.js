import { NextResponse } from "next/server";
import { demoCatalog, fetchProduct } from "@catalog-health/core";
import { getApiUser } from "@/lib/auth-helpers";
import {
  getAnalysis,
  getAnalysisProduct,
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
            detail: "Combining product content, variants, categories, health issues, traffic, and feed data.",
          });
          const product = compactProduct(source.product, row);
          const generated = await analyzeProductWithAi({
            settings,
            onProgress: (progress) => send({ type: "progress", ...progress }),
            context: {
              source: source.source,
              sourceWarning: source.warning,
              analyzedSnapshotAt: analysis.createdAt,
              product,
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
