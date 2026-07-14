"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import GradeLozenge from "@/components/GradeLozenge";
import DimensionBars from "@/components/DimensionBars";
import { ISSUE_INFO, issueLabel } from "@/components/issue-info";
import { dimensionInfo } from "@/components/dimension-info";
import { getAnalysisProducts, getEnvironment } from "@/lib/api-client";
import ProductAiAnalysis, {
  ProductAiAnalysisAction,
  useProductAiAnalysis,
} from "@/components/ProductAiAnalysis";

// The three questions the semantic judge answers, in display order.
const SEMANTIC_CRITERIA = [
  { key: "what_it_is", label: "What is it?", hint: "Is it clear what the product is and does?" },
  { key: "who_its_for", label: "Who's it for?", hint: "Is the audience or use case clear?" },
  { key: "made_of", label: "What's it made of?", hint: "Are materials or specs stated?" },
];
const VERDICT_LABEL = { yes: "Yes", partial: "Partial", no: "No" };

export default function ProductDrilldownPage() {
  const { id, productId } = useParams();
  const [data, setData] = useState(null);
  const [storeHash, setStoreHash] = useState("");
  const [error, setError] = useState("");
  const aiAnalysis = useProductAiAnalysis(id, productId);

  useEffect(() => {
    getAnalysisProducts(id)
      .then(setData)
      .catch((err) => setError(err.body?.error || "Could not load product"));
  }, [id]);

  // Store hash for the deep link into the BigCommerce control panel.
  const environmentId = data?.environmentId;
  useEffect(() => {
    if (!environmentId || environmentId === "demo") return;
    getEnvironment(environmentId).then((env) => env?.storeHash && setStoreHash(env.storeHash));
  }, [environmentId]);

  const row = data?.rows.find((r) => String(r.id) === String(productId));

  if (error || (data && !row)) {
    return (
      <>
        <div className="page-head">
          <h1>Product</h1>
        </div>
        <div className="card">
          <p className="muted">{error || "This product isn't part of this analysis."}</p>
          <Link className="btn" href={`/analyses/${id}/products`}>
            Back to products
          </Link>
        </div>
      </>
    );
  }

  if (!row) {
    return (
      <>
        <div className="page-head">
          <h1>Product</h1>
        </div>
        <p className="muted">Loading…</p>
      </>
    );
  }

  // Group category assignments by channel tree (multi-storefront stores
  // repeat the same names across trees; over-categorization is per tree),
  // then expand each tree into the channel(s) it serves for display.
  const byTree = new Map();
  for (const c of row.categories) {
    const treeId = data.categoryTrees?.[String(c)] ?? null;
    if (!byTree.has(treeId)) byTree.set(treeId, []);
    byTree.get(treeId).push(data.categoryNames[String(c)] || `#${c}`);
  }
  const channelRows = [];
  for (const [treeId, names] of byTree) {
    const treeName =
      treeId === null ? "Default" : data.treeNames?.[String(treeId)] || `Tree ${treeId}`;
    const channelIds = treeId === null ? [] : data.treeChannels?.[String(treeId)] || [];
    if (channelIds.length === 0) {
      channelRows.push({ key: `tree-${treeId}`, channel: treeName, id: null, names });
    } else {
      for (const ch of channelIds) {
        channelRows.push({
          key: `ch-${ch}-${treeId}`,
          channel: data.channelNames?.[String(ch)] || treeName,
          id: ch,
          names,
        });
      }
    }
  }
  channelRows.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const hasChannelStructure = channelRows.length > 1 || channelRows.some((r) => r.id !== null);

  return (
    <>
      <div className="page-head">
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {row.details?.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.details.thumbnailUrl}
              alt={row.name || "Product thumbnail"}
              width={72}
              height={72}
              style={{
                borderRadius: 10,
                objectFit: "cover",
                border: "1px solid var(--line)",
                background: "#fff",
                flexShrink: 0,
              }}
            />
          )}
          <div>
          <h1>
            {storeHash ? (
              <a
                href={`https://store-${storeHash}.mybigcommerce.com/manage/products/edit/${row.id}`}
                target="_blank"
                rel="noreferrer"
                title="Edit in the BigCommerce control panel"
              >
                {row.name || `#${row.id}`} ↗
              </a>
            ) : (
              row.name || `#${row.id}`
            )}
          </h1>
          <p className="muted">
            {row.sku && <>SKU {row.sku} · </>}
            <Link href={`/analyses/${id}/products`}>all products</Link> ·{" "}
            <Link href={`/analyses/${id}`}>report</Link>
            {data.environmentId !== "demo" && (
              <>
                {" "}
                · <Link href={`/environments/${data.environmentId}`}>environment</Link>
              </>
            )}
          </p>
          </div>
        </div>
        <ProductAiAnalysisAction state={aiAnalysis} />
      </div>

      <div className="grid">
        <div className="card">
          <h2>Health score</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <GradeLozenge grade={row.grade} />
            <div>
              <div style={{ fontSize: "1.6rem", fontFamily: "var(--font-display)" }}>
                {row.overall} / 100
              </div>
              <div className="muted">
                analyzed {new Date(data.createdAt).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Traffic &amp; impact</h2>
          <table>
            <tbody>
              <tr>
                <td className="muted">Views</td>
                <td style={{ textAlign: "right" }}>{row.viewCount}</td>
              </tr>
              <tr>
                <td className="muted">Units sold</td>
                <td style={{ textAlign: "right" }}>{row.totalSold}</td>
              </tr>
              <tr>
                <td className="muted">Impact score</td>
                <td style={{ textAlign: "right" }}>{row.impact}</td>
              </tr>
            </tbody>
          </table>
          <p className="muted">
            Impact = (100 − score) × log(1 + views + 5 × sales) — how much
            fixing this product is worth.
          </p>
        </div>

        <div className="card">
          <h2>Dimensions</h2>
          <DimensionBars averages={row.scores} infoMap={dimensionInfo} />
          <p className="muted" style={{ marginBottom: 0 }}>
            Click a dimension&apos;s ⓘ for how its points are earned.
          </p>
        </div>
      </div>

      <div className="card">
        <h2>Product details</h2>
        {!row.details ? (
          <p className="muted">
            This analysis predates attribute capture — run a new analysis to
            see the product attributes behind the scores.
          </p>
        ) : (
          <table>
            <tbody>
              {[
                ["Title", `${row.name || "—"} (${(row.name || "").length} chars)`],
                [
                  "Description",
                  row.details.descriptionChars ? (
                    <>
                      {row.details.descriptionChars} characters
                      {row.details.descriptionExcerpt && (
                        <span className="muted" style={{ display: "block", fontStyle: "italic" }}>
                          “{row.details.descriptionExcerpt}
                          {row.details.descriptionChars > 255 ? "…" : ""}”
                        </span>
                      )}
                    </>
                  ) : (
                    "missing"
                  ),
                ],
                [
                  "Images",
                  row.details.imageCount
                    ? `${row.details.imageCount} (${row.details.imagesWithAlt} with alt text)`
                    : "none",
                ],
                ["Brand", row.details.hasBrand ? "assigned" : "not assigned"],
                [
                  "Custom fields",
                  `${row.details.customFieldCount}` +
                    (row.details.peerMedianCustomFields
                      ? ` (category peers' median: ${row.details.peerMedianCustomFields})`
                      : ""),
                ],
                ["GTIN", row.details.gtin || "—"],
                ["UPC", row.details.upc || "—"],
                ["MPN", row.details.mpn || "—"],
                [
                  "Options / variants",
                  row.details.optionCount
                    ? `${row.details.optionCount} options, ${row.details.variantCount} variants` +
                      (row.details.incompleteVariants
                        ? `, ${row.details.incompleteVariants} with missing option values`
                        : "")
                    : "none",
                ],
                [
                  "Price",
                  row.details.price > 0
                    ? `$${row.details.price}` +
                      (row.details.salePrice ? ` (sale: $${row.details.salePrice})` : "")
                    : "0",
                ],
                ["Weight", row.details.weight > 0 ? String(row.details.weight) : "not set"],
                [
                  "Visibility & stock",
                  `${row.details.isVisible ? "visible" : "hidden"} · inventory tracking: ${row.details.inventoryTracking}` +
                    (row.details.inventoryTracking !== "none"
                      ? ` · ${row.details.inventoryLevel} in stock`
                      : ""),
                ],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td className="muted" style={{ width: 180 }}>
                    {label}
                  </td>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {row.semantic && (
        <div className="card">
          <h2>Semantic review</h2>
          <p className="muted">
            An LLM judged the description against three questions
            {data.semanticJudge ? <> · {data.semanticJudge}</> : null}. It saw the
            product name and description (below), not the images or attributes.
          </p>
          {row.semantic.unevaluated ? (
            <p className="error" style={{ marginTop: 0 }}>
              {row.semantic.what_it_is.reason}
            </p>
          ) : (
          <table>
            <thead>
              <tr>
                <th>Question</th>
                <th>Verdict</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {SEMANTIC_CRITERIA.map(({ key, label, hint }) => {
                const c = row.semantic[key] || {};
                return (
                  <tr key={key}>
                    <td>
                      {label}
                      <div className="muted" style={{ fontSize: "0.78rem" }}>{hint}</div>
                    </td>
                    <td>
                      <span className={`verdict ${c.verdict}`}>
                        {VERDICT_LABEL[c.verdict] || "—"}
                      </span>
                    </td>
                    <td>{c.reason || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
          <details style={{ marginTop: "0.75rem" }}>
            <summary className="muted" style={{ cursor: "pointer" }}>
              Text the judge evaluated
            </summary>
            <p style={{ marginTop: "0.5rem" }}>
              <strong>{row.name || `#${row.id}`}</strong>
            </p>
            <p className="muted" style={{ fontStyle: "italic", whiteSpace: "pre-wrap" }}>
              {row.details?.descriptionChars
                ? `“${row.details.descriptionExcerpt}${row.details.descriptionChars > 255 ? "…" : ""}”`
                : "(no description)"}
            </p>
          </details>
        </div>
      )}

      <div className="card">
        <h2>Issues ({row.issues.length})</h2>
        {row.issues.length === 0 ? (
          <p className="muted">No issues — this product passes every check. 🎉</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Issue</th>
                <th>Dimension</th>
                <th>How to fix</th>
              </tr>
            </thead>
            <tbody>
              {row.issues.map((code) => (
                <tr key={code}>
                  <td>{issueLabel(code)}</td>
                  <td className="muted" style={{ textTransform: "capitalize" }}>
                    {ISSUE_INFO[code]?.dimension || "—"}
                  </td>
                  <td className="muted">{ISSUE_INFO[code]?.fix || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Categories per channel</h2>
        {channelRows.length === 0 ? (
          <p className="muted">Not assigned to any category.</p>
        ) : !hasChannelStructure ? (
          <p>{channelRows[0].names.join(" · ")}</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>ID</th>
                  <th>Categories</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {channelRows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.channel}</td>
                    <td className="muted">{r.id ?? "—"}</td>
                    <td>{r.names.join(" · ")}</td>
                    <td className={r.names.length > 5 ? "error" : "muted"}>{r.names.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ marginBottom: 0 }}>
              Over-categorization is judged per channel tree (more than 5 in
              one channel), not on the total across channels.
            </p>
          </>
        )}
      </div>

      <ProductAiAnalysis state={aiAnalysis} />
    </>
  );
}
