/**
 * BigCommerce v3 Catalog API client + synthetic demo catalog.
 * Uses global fetch (Node 18+).
 */

const API_BASE = "https://api.bigcommerce.com/stores";
const PAGE_LIMIT = 250;
const PRODUCT_INCLUDES = "variants,images,custom_fields,options";
const REQUEST_TIMEOUT_MS = 30000;

async function getPage(storeHash, token, path, params) {
  const url = new URL(`${API_BASE}/${storeHash}/v3${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  for (let attempt = 0; attempt < 5; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { "X-Auth-Token": token, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        throw new Error(
          `BigCommerce API timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s on ${path}`
        );
      }
      throw err;
    }
    if (res.status === 429) {
      const wait = Number(res.headers.get("X-Rate-Limit-Time-Reset-Ms") || 30000);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (res.status === 401) {
      throw new Error(
        "Authentication failed (401). Check the token has Products: read-only scope."
      );
    }
    if (!res.ok) throw new Error(`BigCommerce API ${res.status} on ${path}`);
    return res.json();
  }
  throw new Error("Gave up after repeated rate limiting.");
}

async function sendJson(storeHash, token, method, path, body) {
  const url = new URL(`${API_BASE}/${storeHash}/v3${path}`);
  for (let attempt = 0; attempt < 5; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          "X-Auth-Token": token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        throw new Error(
          `BigCommerce API timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s on ${path}`
        );
      }
      throw err;
    }
    if (res.status === 429) {
      const wait = Number(res.headers.get("X-Rate-Limit-Time-Reset-Ms") || 30000);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `BigCommerce API ${res.status}. Check the token has Products: modify scope.`
      );
    }
    if (!res.ok) throw new Error(`BigCommerce API ${res.status} on ${path}`);
    return res.json();
  }
  throw new Error("Gave up after repeated rate limiting.");
}

async function fetchAll(storeHash, token, path, params = {}, onProgress) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  do {
    const payload = await getPage(storeHash, token, path, {
      ...params,
      limit: PAGE_LIMIT,
      page,
    });
    items.push(...(payload.data || []));
    totalPages = payload.meta?.pagination?.total_pages || page;
    onProgress?.({ path, page, totalPages, count: items.length });
    page += 1;
  } while (page <= totalPages);
  return items;
}

/**
 * Fetch products + categories for a store. Read-only (GET requests only).
 */
export async function fetchCatalog({ storeHash, token, onProgress }) {
  const products = await fetchAll(
    storeHash,
    token,
    "/catalog/products",
    { include: PRODUCT_INCLUDES },
    onProgress
  );
  let categories;
  try {
    categories = await fetchAll(storeHash, token, "/catalog/trees/categories", {}, onProgress);
  } catch {
    categories = await fetchAll(storeHash, token, "/catalog/categories", {}, onProgress);
  }
  // Category trees (multi-storefront channels) — names used for display and
  // per-channel taxonomy checks. Optional: older stores may not expose it.
  let trees = [];
  try {
    trees = await fetchAll(storeHash, token, "/catalog/trees", {}, onProgress);
  } catch {
    trees = [];
  }
  // Channel names for display. Optional: needs the Channels read scope —
  // without it, the UI falls back to tree names + channel ids.
  let channels = [];
  try {
    channels = await fetchAll(storeHash, token, "/channels", {}, onProgress);
  } catch {
    channels = [];
  }
  return { products, categories, trees, channels };
}

/** Fetch one current product with the same rich fields used by a catalog run. */
export async function fetchProduct({ storeHash, token, productId }) {
  const payload = await getPage(
    storeHash,
    token,
    `/catalog/products/${encodeURIComponent(productId)}`,
    { include: PRODUCT_INCLUDES }
  );
  return payload.data || null;
}

/** Update deterministic product fields through the BigCommerce Catalog API. */
export async function updateProduct({ storeHash, token, productId, data }) {
  const payload = await sendJson(
    storeHash,
    token,
    "PUT",
    `/catalog/products/${encodeURIComponent(productId)}`,
    data
  );
  return payload.data || null;
}

/** Create or update one product custom field. */
export async function upsertProductCustomField({
  storeHash,
  token,
  productId,
  customFieldId,
  name,
  value,
}) {
  const path = customFieldId
    ? `/catalog/products/${encodeURIComponent(productId)}/custom-fields/${encodeURIComponent(customFieldId)}`
    : `/catalog/products/${encodeURIComponent(productId)}/custom-fields`;
  const payload = await sendJson(
    storeHash,
    token,
    customFieldId ? "PUT" : "POST",
    path,
    { name, value }
  );
  return payload.data || null;
}

/** Update one product image, currently used for suggested alt text. */
export async function updateProductImage({ storeHash, token, productId, imageId, data }) {
  const payload = await sendJson(
    storeHash,
    token,
    "PUT",
    `/catalog/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
    data
  );
  return payload.data || null;
}

// ---------------------------------------------------------------------------
// Demo catalog (deterministic, no credentials needed)
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoCatalog(n = 120, seed = 42) {
  const rand = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const categories = ["Footwear", "Outerwear", "Accessories", "Camping", "Electronics", "Clearance"]
    .map((name, i) => ({ id: i + 1, name }));
  const adjectives = ["Trail", "Urban", "Alpine", "Coastal", "Summit", "Nomad", "Ridge"];
  const nouns = ["Runner", "Jacket", "Backpack", "Tent", "Headlamp", "Beanie", "Parka", "Sandal"];

  const products = [];
  for (let i = 1; i <= n; i++) {
    const quality = rand();
    let name = `${pick(adjectives)} ${pick(nouns)} ${pick(["Pro", "X", "Lite", "2.0", ""])}`.trim();
    if (quality < 0.12) name = `SKU-${1000 + i}`;
    const descLen = Math.floor(quality * 900);
    const description =
      descLen > 40
        ? `<p>${"High-performance gear built for the outdoors. ".repeat(Math.floor(descLen / 45))}</p>`
        : "";
    const imgCount = quality < 0.08 ? 0 : quality < 0.3 ? 1 : 2 + Math.floor(rand() * 4);
    const images = Array.from({ length: imgCount }, () => ({
      description: rand() < quality ? "alt text" : "",
    }));
    const cfCount = quality < 0.25 ? 0 : 1 + Math.floor(rand() * 6);
    const catCount = quality < 0.05 ? 0 : pick([1, 1, 1, 2, 6]);
    const catIds = [...categories.map((c) => c.id)]
      .sort(() => rand() - 0.5)
      .slice(0, catCount);
    const hasOptions = quality > 0.4;

    products.push({
      id: i,
      sku: `SKU-${1000 + i}`,
      name,
      description,
      brand_id: quality < 0.5 ? pick([null, 2, 3]) : 2,
      categories: catIds,
      images,
      custom_fields: Array.from({ length: cfCount }, (_, k) => ({
        name: `attr${k}`,
        value: "v",
      })),
      options: hasOptions ? [{ id: 1 }] : [],
      variants: hasOptions
        ? [0, 1].map(() => ({ option_values: rand() < quality ? [{ id: 1 }] : [] }))
        : [],
      gtin: quality > 0.55 ? "0012345678905" : "",
      upc: "",
      mpn: "",
      price: quality < 0.06 ? 0 : Math.round((9 + rand() * 391) * 100) / 100,
      sale_price: rand() < 0.15 ? Math.round((9 + rand() * 491) * 100) / 100 : 0,
      weight: quality < 0.2 ? 0 : Math.round((0.1 + rand() * 7.9) * 100) / 100,
      inventory_tracking: "product",
      inventory_level: rand() < 0.12 ? 0 : 1 + Math.floor(rand() * 200),
      is_visible: true,
      view_count: Math.floor(-400 * Math.log(1 - rand())),
      total_sold: Math.floor(-30 * Math.log(1 - rand())),
    });
  }
  return { products, categories };
}
