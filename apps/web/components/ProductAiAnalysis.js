"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ActionIcon from "./ActionIcon";
import ProductThumb from "./ProductThumb";
import { getProductAiAnalysis, runProductAiAnalysis } from "@/lib/api-client";

export function useProductAiAnalysis(analysisId, productId) {
  const [review, setReview] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    getProductAiAnalysis(analysisId, productId)
      .then((data) => {
        if (!active) return;
        setReview(data.review);
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

  return {
    review,
    models,
    selectedModelId,
    setSelectedModelId,
    loading,
    running,
    progress,
    error,
    run,
  };
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
          {model.name} — {model.model}{model.isDefault ? " (default)" : ""}
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

function CopyBlock({ label, text }) {
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
        <button type="button" className="secondary ai-copy-button" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="ai-copy-text">{text || "—"}</div>
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

export default function ProductAiAnalysis({ state }) {
  const review = state.review;
  const result = review?.result;
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
        {review && (
          <div className="ai-action-controls">
            <ModelSelect state={state} id="ai-model-section" />
            <button type="button" className="secondary" onClick={state.run} disabled={state.running || !state.models.length}>
              <ActionIcon name="refresh" />
              {state.running ? "Analyzing…" : "Refresh"}
            </button>
          </div>
        )}
      </div>

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
              <CopyBlock label="Suggested title" text={result.title.suggestedTitle} />
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
            <CopyBlock label="Rewritten product description" text={result.description.rewrittenDescription} />
            <div className="ai-two-column">
              <div className="ai-list-block"><strong>Selling points</strong><ul>{result.description.sellingPoints.map((item) => <li key={item}>{item}</li>)}</ul></div>
              <div className="ai-list-block"><strong>Information still needed</strong><ul>{result.description.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul></div>
            </div>
          </div>

          <div className="ai-subsection">
            <h3>Suggested fields</h3>
            {result.derivedFields.length === 0 ? <p className="muted">No defensible fields could be derived.</p> : (
              <div className="table-scroll"><table><thead><tr><th>Field</th><th>Value</th><th>Type</th><th>Confidence</th><th>Evidence</th></tr></thead><tbody>
                {result.derivedFields.map((field, index) => <tr key={`${field.field}-${index}`}><td>{field.field}</td><td>{field.value}{field.needsVerification && <span className="ai-verify">Verify</span>}</td><td>{field.fieldType}</td><td>{field.confidence}</td><td className="muted">{field.evidence}</td></tr>)}
              </tbody></table></div>
            )}
          </div>

          <div className="ai-two-column ai-subsection">
            <div>
              <h3>Placement &amp; merchandising</h3>
              <div className="ai-list-block"><strong>Suggested categories</strong><ul>{result.placement.suggestedCategories.map((category, index) => <li key={`${category.name}-${index}`}><strong>{category.name}</strong>{category.categoryId != null ? ` (#${category.categoryId})` : " (new)"}<br/><span className="muted">{category.rationale}</span></li>)}</ul></div>
              <div className="ai-list-block"><strong>Collections</strong><ul>{result.placement.merchandisingCollections.map((item) => <li key={item}>{item}</li>)}</ul></div>
              <div className="ai-list-block"><strong>Cross-sell ideas</strong><ul>{result.placement.crossSellIdeas.map((item) => <li key={item}>{item}</li>)}</ul></div>
            </div>
            <div>
              <h3>Feed, SEO &amp; discovery</h3>
              <CopyBlock label="Google product category" text={result.feedAndDiscovery.googleProductCategory} />
              <CopyBlock label="Product type" text={result.feedAndDiscovery.productType} />
              <CopyBlock label="SEO title" text={result.feedAndDiscovery.seoTitle} />
              <CopyBlock label="SEO description" text={result.feedAndDiscovery.seoDescription} />
              <div className="ai-keywords">{result.feedAndDiscovery.searchTerms.map((term) => <Pill key={term}>{term}</Pill>)}</div>
            </div>
          </div>

          {result.feedAndDiscovery.attributes.length > 0 && <div className="ai-subsection"><h3>Feed-ready attributes</h3><div className="table-scroll"><table><thead><tr><th>Attribute</th><th>Suggested value</th><th>Confidence</th><th>Evidence</th></tr></thead><tbody>{result.feedAndDiscovery.attributes.map((attribute, index) => <tr key={`${attribute.name}-${index}`}><td>{attribute.name}</td><td>{attribute.value}{attribute.needsVerification && <span className="ai-verify">Verify</span>}</td><td>{attribute.confidence}</td><td className="muted">{attribute.evidence}</td></tr>)}</tbody></table></div></div>}

          <div className="ai-subsection">
            <h3>Image review</h3>
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
                    <CopyBlock label="Suggested alt text" text={image.suggestedAltText} />
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
