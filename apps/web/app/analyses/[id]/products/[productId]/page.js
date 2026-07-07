"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import GradeLozenge from "@/components/GradeLozenge";
import DimensionBars from "@/components/DimensionBars";
import { ISSUE_INFO, issueLabel } from "@/components/issue-info";
import { dimensionInfo } from "@/components/dimension-info";

export default function ProductDrilldownPage() {
  const { id, productId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/analyses/${id}/products`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Could not load product");
        setData(body);
      })
      .catch((err) => setError(err.message));
  }, [id]);

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
        <div>
          <h1>{row.name || `#${row.id}`}</h1>
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
    </>
  );
}
