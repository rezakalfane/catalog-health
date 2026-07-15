"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ActionIcon from "./ActionIcon";
import ProductThumb from "./ProductThumb";
import { getProductAiAnalysis, pushProductAiChange, runProductAiAnalysis } from "@/lib/api-client";

function normalizeFieldName(value) {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function isPushableCoreField(field) {
  return new Set([
    "title",
    "name",
    "product title",
    "description",
    "product description",
    "sku",
    "gtin",
    "upc",
    "mpn",
    "price",
    "sale price",
    "weight",
    "visible",
    "visibility",
    "is visible",
  ]).has(normalizeFieldName(field));
}

function pushedChange(review, changeId) {
  return (review?.result?.pushedChanges || []).find((change) => change.id === changeId);
}

function normalizeComparable(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function numberEqual(a, b) {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 0.000001;
}

function booleanFromSuggestion(value) {
  const normalized = normalizeFieldName(value);
  if (["true", "yes", "visible", "1"].includes(normalized)) return true;
  if (["false", "no", "hidden", "0"].includes(normalized)) return false;
  return null;
}

function productFieldNoop(product, field, value) {
  if (!product) return false;
  const key = normalizeFieldName(field);
  const details = product.details || {};
  if (["title", "name", "product title"].includes(key)) {
    return normalizeComparable(product.name) === normalizeComparable(value);
  }
  if (key === "sku") return normalizeComparable(product.sku) === normalizeComparable(value);
  if (key === "gtin") return normalizeComparable(details.gtin) === normalizeComparable(value);
  if (key === "upc") return normalizeComparable(details.upc) === normalizeComparable(value);
  if (key === "mpn") return normalizeComparable(details.mpn) === normalizeComparable(value);
  if (key === "price") return numberEqual(details.price, String(value).replace(/[$,]/g, ""));
  if (["sale price", "sale_price"].includes(key)) return numberEqual(details.salePrice || 0, String(value).replace(/[$,]/g, ""));
  if (key === "weight") return numberEqual(details.weight, String(value).replace(/[$,]/g, ""));
  if (["visible", "visibility", "is visible"].includes(key)) {
    const suggested = booleanFromSuggestion(value);
    return suggested != null && Boolean(details.isVisible) === suggested;
  }
  return false;
}

function shouldShowPush({ state, product, changeId, field, value, categoryId, relatedProductId }) {
  if (pushedChange(state.review, changeId)) return true;
  if (categoryId != null) return !(product?.categories || []).map(String).includes(String(categoryId));
  if (relatedProductId != null) {
    return !(state.pushState?.relatedProductIds || []).map(String).includes(String(relatedProductId));
  }
  if (field) return !productFieldNoop(product, field, value);
  return true;
}

function pushableFieldChange({ state, product, field, index }) {
  const pushable = field.fieldType === "custom" || (field.fieldType === "core" && isPushableCoreField(field.field));
  const changeId = `derivedFields.${index}`;
  const showPush = pushable && shouldShowPush({
    state,
    product,
    changeId,
    field: field.fieldType === "core" ? field.field : null,
    value: field.value,
  });
  return { changeId, pushable, showPush };
}

function pushableCategoryChange({ state, product, category, index }) {
  const changeId = `placement.suggestedCategories.${index}`;
  const showPush = category.categoryId != null && !category.isNewCategory && shouldShowPush({
    state,
    product,
    changeId,
    categoryId: category.categoryId,
  });
  return { changeId, showPush };
}

function pushableRecommendationChange({ state, recommendation }) {
  const changeId = `productRecommendations.${recommendation.productId}.relatedProduct`;
  const showPush = shouldShowPush({
    state,
    changeId,
    relatedProductId: recommendation.productId,
  });
  return { changeId, showPush };
}

export function useProductAiAnalysis(analysisId, productId) {
  const [review, setReview] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [pushingId, setPushingId] = useState("");
  const [pushState, setPushState] = useState({});
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    getProductAiAnalysis(analysisId, productId)
      .then((data) => {
        if (!active) return;
        setReview(data.review);
        setPushState(data.pushState || {});
        const configured = (data.models || []).filter((model) => model.configured);
        setModels(configured);
        const reviewed = configured.find((model) => model.id === data.review?.modelConfigurationId);
        const preferred = reviewed || configured.find((model) => model.id === data.defaultModelId) || configured[0];
        setSelectedModelId(preferred?.id || "");
      })
      .catch((err) => active && setError(err.body?.error || "Could not load AI Analysis."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [analysisId, productId]);

  const run = useCallback(async () => {
    setRunning(true);
    setError("");
    setProgress({
      step: "Starting AI Analysis",
      detail: "Preparing the secured product analysis request.",
    });
    document.getElementById("ai-analysis")?.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const data = await runProductAiAnalysis(analysisId, productId, selectedModelId, setProgress);
      setReview(data.review);
      setPushState(data.pushState || {});
      const configured = (data.models || []).filter((model) => model.configured);
      setModels(configured);
      setSelectedModelId(data.review?.modelConfigurationId || selectedModelId);
    } catch (err) {
      setError(err.body?.error || "AI Analysis failed. Please try again.");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [analysisId, productId, selectedModelId]);

  const pushChange = useCallback(async (changeId, options = {}) => {
    setPushingId(changeId);
    setError("");
    try {
      const data = await pushProductAiChange(analysisId, productId, changeId, options);
      setReview(data.review);
      setPushState(data.pushState || {});
    } catch (err) {
      setError(err.body?.error || "Could not push this change to BigCommerce.");
    } finally {
      setPushingId("");
    }
  }, [analysisId, productId]);

  return {
    analysisId,
    review,
    models,
    selectedModelId,
    setSelectedModelId,
    loading,
    running,
    pushingId,
    pushState,
    progress,
    error,
    run,
    pushChange,
  };
}

function ProductRecommendationCard({ recommendation, analysisId, state }) {
  const hasSalePrice = Number(recommendation.salePrice) > 0;
  const price = Number(recommendation.price) > 0 ? `$${recommendation.price}` : "Price unavailable";
  const { changeId, showPush } = pushableRecommendationChange({ state, recommendation });
  return (
    <article className="ai-product-card">
      <div className="ai-product-card-main">
        <Link
          className="ai-product-thumb-link"
          href={`/analyses/${analysisId}/products/${recommendation.productId}`}
          aria-label={`Open ${recommendation.title}`}
        >
          <ProductThumb src={recommendation.thumbnailUrl} alt="" size={128} />
        </Link>
        <div className="ai-product-card-body">
          <div className="ai-product-title-row">
            <Link className="ai-product-title" href={`/analyses/${analysisId}/products/${recommendation.productId}`}>
              {recommendation.title}
            </Link>
            {showPush && (
              <PushChangeButton
                state={state}
                changeId={changeId}
                label={`${recommendation.title || "recommended product"} as related product`}
              />
            )}
          </div>
          <p className="muted ai-product-category">
            {(recommendation.categoryNames || []).join(" · ") || "Uncategorized"}
          </p>
          <div className="ai-product-facts">
            <span className={hasSalePrice ? "ai-old-price" : ""}>{price}</span>
            {hasSalePrice && <strong>${recommendation.salePrice}</strong>}
            <span>SKU {recommendation.sku || "—"}</span>
            <span>Product ID {recommendation.productId}</span>
          </div>
        </div>
      </div>
      <p className="ai-product-reason">{recommendation.reason}</p>
    </article>
  );
}

function ModelSelect({ state, id }) {
  if (!state.models.length) return null;
  return (
    <select
      id={id}
      className="ai-model-select"
      aria-label="AI model"
      value={state.selectedModelId}
      onChange={(event) => state.setSelectedModelId(event.target.value)}
      disabled={state.running}
    >
      {state.models.map((model) => (
        <option key={model.id} value={model.id}>
          {model.name || model.model}{model.isDefault ? " (default)" : ""}
        </option>
      ))}
    </select>
  );
}

export function ProductAiAnalysisAction({ state }) {
  const { review, loading, running, run } = state;
  const unavailable = !loading && !state.models.length;
  return (
    <div className="ai-action-controls">
      <ModelSelect state={state} id="ai-model-top" />
      <button type="button" onClick={run} disabled={loading || running || unavailable}>
        <ActionIcon name="sparkle" />
        {running ? "Analyzing…" : review ? "Refresh AI Analysis" : "AI Analysis"}
      </button>
    </div>
  );
}

function Pill({ children, className = "" }) {
  return <span className={`ai-pill ${className}`}>{children}</span>;
}

function PushChangeButton({ state, changeId, label, repushable = false }) {
  if (!state || !changeId) return null;
  const pushed = pushedChange(state.review, changeId);
  const busy = state.pushingId === changeId;
  const locked = Boolean(pushed) && !repushable;
  return (
    <button
      type="button"
      className={`ai-push-button${locked ? " pushed" : ""}`}
      onClick={() => state.pushChange(changeId, repushable ? { force: true } : {})}
      disabled={locked || Boolean(state.pushingId) || state.running}
      aria-label={locked ? `${label} already pushed` : `Push ${label} to BigCommerce`}
      title={locked ? `Pushed ${new Date(pushed.pushedAt).toLocaleString()}` : `Push ${label} to BigCommerce`}
    >
      <ActionIcon name={locked ? "check" : busy ? "refresh" : "upload"} />
    </button>
  );
}

function BulkPushButton({ state, changes, label }) {
  const [busy, setBusy] = useState(false);
  const eligible = changes.filter((change) => change?.changeId);
  if (eligible.length === 0) return null;

  async function pushAll() {
    setBusy(true);
    try {
      for (const change of eligible) {
        await state.pushChange(change.changeId, change.options || {});
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="secondary ai-bulk-push-button"
      onClick={pushAll}
      disabled={busy || Boolean(state.pushingId) || state.running}
      title={`Push ${eligible.length} suggestion${eligible.length === 1 ? "" : "s"} to BigCommerce`}
    >
      <ActionIcon name={busy ? "refresh" : "upload"} />
      {busy ? "Pushing…" : label}
    </button>
  );
}

function CopyBlock({ label, text, push, html = false }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div className="ai-copy-block">
      <div className="ai-copy-head">
        <strong>{label}</strong>
        <span className="ai-copy-actions">
          {push && push.show !== false && <PushChangeButton {...push} />}
          <button type="button" className="secondary ai-copy-button" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </span>
      </div>
      {html ? (
        <div
          className="ai-copy-text ai-html-preview"
          dangerouslySetInnerHTML={{ __html: text || "—" }}
        />
      ) : (
        <div className="ai-copy-text">{text || "—"}</div>
      )}
    </div>
  );
}

function EmptyState({ state }) {
  if (state.loading) return <p className="muted">Loading saved AI Analysis…</p>;
  if (!state.models.length) {
    return (
      <div className="ai-empty">
        <p>Select a provider and model to generate a product-specific review.</p>
        <Link className="btn" href="/settings">Configure LLM</Link>
      </div>
    );
  }
  return (
    <div className="ai-empty">
      <p>
        Generate merchant-ready copy, catalog fields, placement, feed values,
        conversion ideas, and—when the model supports vision—an image review.
      </p>
      <div className="ai-action-controls">
        <ModelSelect state={state} id="ai-model-empty" />
        <button type="button" onClick={state.run} disabled={state.running}>
          <ActionIcon name="sparkle" />
          {state.running ? "Analyzing product…" : "Run AI Analysis"}
        </button>
      </div>
    </div>
  );
}

export default function ProductAiAnalysis({ state, product }) {
  const review = state.review;
  const result = review?.result;
  const fieldPushes = result ? result.derivedFields
    .map((field, index) => pushableFieldChange({ state, product, field, index }))
    .filter((change) => change.pushable && change.showPush && !pushedChange(review, change.changeId)) : [];
  const categoryPushes = result ? result.placement.suggestedCategories
    .map((category, index) => pushableCategoryChange({ state, product, category, index }))
    .filter((change) => change.showPush && !pushedChange(review, change.changeId)) : [];
  const seoPushes = result ? [
    result.feedAndDiscovery?.seoTitle && !pushedChange(review, "feedAndDiscovery.seoTitle")
      ? { changeId: "feedAndDiscovery.seoTitle" }
      : null,
    result.feedAndDiscovery?.seoDescription && !pushedChange(review, "feedAndDiscovery.seoDescription")
      ? { changeId: "feedAndDiscovery.seoDescription" }
      : null,
    (result.feedAndDiscovery?.searchTerms || []).length > 0 && !pushedChange(review, "feedAndDiscovery.searchTerms")
      ? { changeId: "feedAndDiscovery.searchTerms" }
      : null,
  ].filter(Boolean) : [];
  const recommendationPushes = result ? (result.productRecommendations || [])
    .map((recommendation) => pushableRecommendationChange({ state, recommendation }))
    .filter((change) => change.showPush && !pushedChange(review, change.changeId)) : [];
  const imageAltPushes = result ? (result.imageReview?.images || [])
    .filter((image) => image?.imageIndex && image.suggestedAltText)
    .map((image) => ({ changeId: `imageReview.images.${image.imageIndex}.altText` }))
    .filter((change) => !pushedChange(review, change.changeId)) : [];
  return (
    <section className="card ai-analysis" id="ai-analysis">
      <div className="section-action-head">
        <div>
          <h2>AI Analysis</h2>
          <p className="muted ai-analysis-intro">
            Product-specific recommendations generated on demand. Review suggested
            facts and claims before publishing.
          </p>
        </div>
      </div>
      {review && (
        <div className="section-actions-row ai-analysis-actions">
          <ModelSelect state={state} id="ai-model-section" />
          <button type="button" className="secondary" onClick={state.run} disabled={state.running || !state.models.length}>
            <ActionIcon name="refresh" />
            {state.running ? "Analyzing…" : "Refresh"}
          </button>
        </div>
      )}

      {state.error && <p className="error ai-analysis-error">{state.error}</p>}
      {state.running && (
        <div className="ai-running" role="status">
          <span className="ai-spinner" aria-hidden="true" />
          <div>
            <strong>{state.progress?.step || "Analyzing product"}</strong>
            <div className="muted">
              {state.progress?.detail || "Rich reviews can take a minute, especially with images."}
            </div>
          </div>
        </div>
      )}
      {!result ? <EmptyState state={state} /> : (
        <div className="ai-results">
          <div className="ai-review-meta">
            {review.modelConfigurationName && <Pill>{review.modelConfigurationName}</Pill>}
            <Pill>{review.provider}</Pill>
            <Pill>{review.model}</Pill>
            <Pill>{review.source}</Pill>
            <Pill className={review.imageAnalysis ? "success" : "muted-pill"}>
              {review.imageAnalysis ? "Images analyzed" : "Text & data review"}
            </Pill>
            <span className="muted">Generated {new Date(review.generatedAt).toLocaleString()}</span>
          </div>

          <div className="ai-summary">
            <div>
              <span className="ai-kicker">Executive summary</span>
              <p>{result.executiveSummary}</p>
            </div>
            <Pill className={`confidence-${result.overallConfidence}`}>
              {result.overallConfidence} confidence
            </Pill>
          </div>

          <div className="ai-subsection">
            <h3>Priority actions</h3>
            <div className="ai-action-grid">
              {result.priorityActions.map((action, index) => (
                <article className="ai-action-card" key={`${action.title}-${index}`}>
                  <div className="ai-action-title">
                    <span className={`ai-priority ${action.priority}`}>{action.priority}</span>
                    <strong>{action.title}</strong>
                  </div>
                  <p>{action.recommendation}</p>
                  <p className="muted">Evidence: {action.evidence}</p>
                  <div className="ai-action-meta">
                    <span>Impact: {action.impact}</span><span>Effort: {action.effort}</span>
                    {action.needsVerification && <span>Verify first</span>}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="ai-two-column ai-subsection">
            <div>
              <h3>Title</h3>
              <p className="muted">{result.title.assessment}</p>
              <CopyBlock
                label="Suggested title"
                text={result.title.suggestedTitle}
                push={{
                  state,
                  changeId: "title.suggestedTitle",
                  label: "suggested title",
                  show: shouldShowPush({
                    state,
                    product,
                    changeId: "title.suggestedTitle",
                    field: "title",
                    value: result.title.suggestedTitle,
                  }),
                }}
              />
              {result.title.alternatives.length > 0 && (
                <div className="ai-list-block"><strong>Alternatives</strong><ul>{result.title.alternatives.map((item) => <li key={item}>{item}</li>)}</ul></div>
              )}
              <p className="muted">{result.title.rationale}</p>
            </div>
            <div>
              <h3>Description</h3>
              <p className="muted">{result.description.assessment}</p>
              <CopyBlock label="Short description" text={result.description.shortDescription} />
            </div>
          </div>

          <div className="ai-subsection">
            <CopyBlock
              label="Rewritten product description"
              text={result.description.rewrittenDescription}
              push={{
                state,
                changeId: "description.rewrittenDescription",
                label: "rewritten product description",
              }}
              html
            />
            <div className="ai-two-column">
              <div className="ai-list-block"><strong>Selling points</strong><ul>{result.description.sellingPoints.map((item) => <li key={item}>{item}</li>)}</ul></div>
              <div className="ai-list-block"><strong>Information still needed</strong><ul>{result.description.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul></div>
            </div>
          </div>

          <div className="ai-subsection">
            <div className="ai-subsection-head">
              <h3>Suggested fields</h3>
              <BulkPushButton state={state} changes={fieldPushes} label="Add all fields" />
            </div>
            {result.derivedFields.length === 0 ? <p className="muted">No defensible fields could be derived.</p> : (
              <div className="table-scroll"><table><thead><tr><th>Field</th><th>Value</th><th>Type</th><th>Confidence</th><th>Evidence</th></tr></thead><tbody>
                {result.derivedFields.map((field, index) => {
                  const { changeId, showPush } = pushableFieldChange({ state, product, field, index });
                  return (
                    <tr key={`${field.field}-${index}`}>
                      <td>{field.field}</td>
                      <td>
                        <span className="ai-push-cell">
                          <span>{field.value}{field.needsVerification && <span className="ai-verify">Verify</span>}</span>
                          {showPush && (
                            <PushChangeButton
                              state={state}
                              changeId={changeId}
                              label={`${field.field} field`}
                            />
                          )}
                        </span>
                      </td>
                      <td>{field.fieldType}</td>
                      <td>{field.confidence}</td>
                      <td className="muted">{field.evidence}</td>
                    </tr>
                  );
                })}
              </tbody></table></div>
            )}
          </div>

          <div className="ai-two-column ai-subsection">
            <div>
              <div className="ai-subsection-head">
                <h3>Placement &amp; merchandising</h3>
                <BulkPushButton state={state} changes={categoryPushes} label="Add all categories" />
              </div>
              <div className="ai-list-block"><strong>Suggested categories</strong><ul>{result.placement.suggestedCategories.map((category, index) => {
                const { changeId, showPush } = pushableCategoryChange({ state, product, category, index });
                return (
                  <li key={`${category.name}-${index}`}>
                    <span className="ai-inline-push">
                      <span><strong>{category.name}</strong>{category.categoryId != null ? ` (#${category.categoryId})` : " (new)"}</span>
                      {showPush && <PushChangeButton state={state} changeId={changeId} label={`${category.name} category`} />}
                    </span>
                    <br/><span className="muted">{category.rationale}</span>
                  </li>
                );
              })}</ul></div>
              <div className="ai-list-block"><strong>Collections</strong><ul>{result.placement.merchandisingCollections.map((item) => <li key={item}>{item}</li>)}</ul></div>
              <div className="ai-list-block"><strong>Cross-sell ideas</strong><ul>{result.placement.crossSellIdeas.map((item) => <li key={item}>{item}</li>)}</ul></div>
            </div>
            <div>
              <div className="ai-subsection-head">
                <h3>Feed, SEO &amp; discovery</h3>
                <BulkPushButton state={state} changes={seoPushes} label="Add all SEO" />
              </div>
              <CopyBlock label="Google product category" text={result.feedAndDiscovery.googleProductCategory} />
              <CopyBlock label="Product type" text={result.feedAndDiscovery.productType} />
              <CopyBlock
                label="SEO title"
                text={result.feedAndDiscovery.seoTitle}
                push={{ state, changeId: "feedAndDiscovery.seoTitle", label: "SEO title" }}
              />
              <CopyBlock
                label="SEO description"
                text={result.feedAndDiscovery.seoDescription}
                push={{ state, changeId: "feedAndDiscovery.seoDescription", label: "SEO description" }}
              />
              <div className="ai-keywords">
                {result.feedAndDiscovery.searchTerms.map((term) => <Pill key={term}>{term}</Pill>)}
                {result.feedAndDiscovery.searchTerms.length > 0 && (
                  <PushChangeButton state={state} changeId="feedAndDiscovery.searchTerms" label="search terms" />
                )}
              </div>
            </div>
          </div>

          <div className="ai-subsection">
            <div className="ai-subsection-head">
              <h3>Product recommendations</h3>
              <BulkPushButton state={state} changes={recommendationPushes} label="Push all recommendations" />
            </div>
            <p className="muted">
              Catalog-grounded products selected as relevant complements, alternatives, or adjacent options.
            </p>
            {(result.productRecommendations || []).length > 0 ? (
              <div className="ai-product-grid">
                {result.productRecommendations.map((recommendation) => (
                  <ProductRecommendationCard
                    key={recommendation.productId}
                    recommendation={recommendation}
                    analysisId={state.analysisId}
                    state={state}
                  />
                ))}
              </div>
            ) : <p className="muted">No sufficiently relevant catalog products were identified.</p>}
          </div>

          {result.feedAndDiscovery.attributes.length > 0 && <div className="ai-subsection"><h3>Feed-ready attributes</h3><div className="table-scroll"><table><thead><tr><th>Attribute</th><th>Suggested value</th><th>Confidence</th><th>Evidence</th></tr></thead><tbody>{result.feedAndDiscovery.attributes.map((attribute, index) => <tr key={`${attribute.name}-${index}`}><td>{attribute.name}</td><td>{attribute.value}{attribute.needsVerification && <span className="ai-verify">Verify</span>}</td><td>{attribute.confidence}</td><td className="muted">{attribute.evidence}</td></tr>)}</tbody></table></div></div>}

          <div className="ai-subsection">
            <div className="ai-subsection-head">
              <h3>Image review</h3>
              <BulkPushButton state={state} changes={imageAltPushes} label="Add all alt text" />
            </div>
            <p>{result.imageReview.summary}</p>
            {result.imageReview.heroImageIndex != null && <p><strong>Recommended hero:</strong> image {result.imageReview.heroImageIndex}</p>}
            {result.imageReview.images.length > 0 && (
              <div className="ai-image-grid">
                {result.imageReview.images.map((image) => (
                  <article className="ai-image-card" key={image.imageIndex}>
                    <div className="ai-image-card-main">
                      <ProductThumb
                        src={image.thumbnailUrl}
                        alt={image.suggestedAltText || `Analyzed product image ${image.imageIndex}`}
                        size={112}
                      />
                      <div className="ai-image-details">
                        <div className="ai-image-score">
                          <strong>Image {image.imageIndex}</strong>
                          <span>{image.qualityScore}/100</span>
                        </div>
                        <p className="muted">{image.role}</p>
                        <ul>{image.observations.map((item) => <li key={item}>{item}</li>)}</ul>
                      </div>
                    </div>
                    <CopyBlock
                      label="Suggested alt text"
                      text={image.suggestedAltText}
                      push={{
                        state,
                        changeId: `imageReview.images.${image.imageIndex}.altText`,
                        label: `image ${image.imageIndex} alt text`,
                      }}
                    />
                  </article>
                ))}
              </div>
            )}
            <div className="ai-two-column">
              <div className="ai-list-block"><strong>Missing shots</strong><ul>{result.imageReview.missingShots.map((item) => <li key={item}>{item}</li>)}</ul></div>
              <div className="ai-list-block"><strong>Image limitations</strong><ul>{result.imageReview.limitations.map((item) => <li key={item}>{item}</li>)}</ul></div>
            </div>
          </div>

          <div className="ai-three-column ai-subsection">
            <div className="ai-list-block"><h3>Conversion opportunities</h3><ul>{result.conversionOpportunities.map((item, index) => <li key={`${item.opportunity}-${index}`}><strong>{item.opportunity}</strong><br/><span className="muted">{item.rationale}</span></li>)}</ul></div>
            <div className="ai-list-block"><h3>Data-quality risks</h3><ul>{result.dataQualityRisks.map((item, index) => <li key={`${item.risk}-${index}`}><strong>{item.risk}</strong><br/><span className="muted">{item.evidence} · {item.recommendedCheck}</span></li>)}</ul></div>
            <div className="ai-list-block"><h3>Questions for the merchant</h3><ul>{result.merchantQuestions.map((item) => <li key={item}>{item}</li>)}</ul></div>
          </div>

          {(result.feedAndDiscovery.identifierWarnings.length > 0 || result.limitations.length > 0) && <div className="ai-cautions"><strong>Checks and limitations</strong><ul>{[...result.feedAndDiscovery.identifierWarnings, ...result.limitations].map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div>}
        </div>
      )}
    </section>
  );
}
