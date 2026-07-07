import { NextResponse } from "next/server";
import {
  fetchCatalog,
  demoCatalog,
  analyzeCatalog,
  summarize,
} from "@catalog-health/core";
import { getEnvironment, createAnalysis, listAnalyses } from "@/lib/db";

export async function GET(request) {
  const environmentId = new URL(request.url).searchParams.get("environmentId");
  return NextResponse.json(listAnalyses(environmentId || undefined));
}

/**
 * POST { environmentId } -> runs a full analysis against that store.
 * POST { demo: true, environmentId? } -> runs against a synthetic catalog.
 */
export async function POST(request) {
  const body = await request.json();
  let products, categories, environmentId;

  if (body?.demo) {
    ({ products, categories } = demoCatalog());
    environmentId = body.environmentId || "demo";
  } else {
    const env = getEnvironment(body?.environmentId);
    if (!env) {
      return NextResponse.json({ error: "Unknown environment" }, { status: 400 });
    }
    environmentId = env.id;
    try {
      ({ products, categories } = await fetchCatalog({
        storeHash: env.storeHash,
        token: env.accessToken,
      }));
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
  }

  if (!products.length) {
    return NextResponse.json({ error: "No products found in this catalog" }, { status: 422 });
  }

  const rows = analyzeCatalog(products, categories);
  const summary = summarize(rows, categories);
  const analysis = createAnalysis({ environmentId, summary });
  return NextResponse.json(analysis, { status: 201 });
}
