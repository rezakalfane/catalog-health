"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { listEnvironments, getSettings, createAnalysis } from "@/lib/api-client";
import ScoringProfileSubtitle from "@/components/ScoringProfileSubtitle";

function NewAnalysisForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedEnv = searchParams.get("env");
  const [environments, setEnvironments] = useState([]);
  const [selected, setSelected] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [models, setModels] = useState([]);
  const [semanticModelId, setSemanticModelId] = useState("");
  const [semantic, setSemantic] = useState(true);
  const selectedEnvironment = environments.find((env) => env.id === selected);

  useEffect(() => {
    listEnvironments().then((envs) => {
      setEnvironments(envs);
      if (!envs.length) return;
      const preselected = envs.find((env) => env.id === preselectedEnv);
      setSelected(preselected ? preselected.id : envs[0].id);
    });
    getSettings().then(({ models = [], defaultModelId }) => {
      const configured = models.filter((model) => model.configured);
      setModels(configured);
      const preferred = configured.find((model) => model.id === defaultModelId) || configured[0];
      setSemanticModelId(preferred?.id || "");
    });
  }, [preselectedEnv]);

  async function run(demo = false) {
    setRunning(true);
    setError("");
    try {
      const body = await createAnalysis(
        demo
          ? { demo: true, semantic }
          : {
              environmentId: selected,
              semantic: semantic && Boolean(semanticModelId),
              semanticModelId: semantic && semanticModelId ? semanticModelId : undefined,
            }
      );
      router.push(`/analyses/${body.id}`);
    } catch (err) {
      if (err.status === 409 && err.body?.analysisId) {
        // Already running — take the user to the run in progress.
        router.push(`/analyses/${err.body.analysisId}`);
        return;
      }
      setRunning(false);
      setError(err.body?.error || "Could not start the analysis");
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New analysis</h1>
          <p className="muted">Run a live catalog health report or use demo data to review scoring, issues, and product opportunities.</p>
        </div>
      </div>

      <div className="card">
        <h2>Analyze a store</h2>
        <p className="muted">
          Pulls the full catalog (read-only), scores every product across five
          health dimensions, and saves the report to this environment&apos;s history.
          The analysis runs in the background — you can navigate away and come
          back to it at any time.
        </p>
        {environments.length === 0 ? (
          <p className="muted">
            No environments configured yet — add one under{" "}
            <a href="/environments">Environments</a> first.
          </p>
        ) : (
          <>
            <label htmlFor="env-select">Environment</label>
            <select
              id="env-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name} — {env.scoringProfile?.label || "Balanced"}
                </option>
              ))}
            </select>
            {selectedEnvironment && (
              <ScoringProfileSubtitle
                profileId={selectedEnvironment.scoringProfileId}
                profile={selectedEnvironment.scoringProfile}
                description
              />
            )}
            {models.length ? (
              <div className="semantic-model-picker">
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={semantic}
                    onChange={(event) => setSemantic(event.target.checked)}
                  />
                  Include semantic scoring
                </label>
                {semantic && (
                  <>
                    <label htmlFor="semantic-model">Semantic model</label>
                    <select
                      id="semantic-model"
                      value={semanticModelId}
                      onChange={(event) => setSemanticModelId(event.target.value)}
                    >
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name || model.model}{model.isDefault ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            ) : (
              <p className="muted">
                Semantic scoring (LLM judges description quality) is available
                once a model is connected under <a href="/settings">Settings → Models</a>.
              </p>
            )}
            <button onClick={() => run(false)} disabled={running || !selected}>
              {running ? "Starting…" : "Run analysis"}
            </button>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      <div className="card">
        <h2>Or try it with demo data</h2>
        <p className="muted">
          Runs against a synthetic 120-product catalog — no store or credentials
          needed. Useful for demos and for checking the tool works. Semantic
          scoring uses a simulated judge here (free, no API calls).
        </p>
        <button className="secondary" onClick={() => run(true)} disabled={running}>
          {running ? "Starting…" : "Run demo analysis"}
        </button>
      </div>
    </>
  );
}

export default function NewAnalysisPage() {
  // useSearchParams requires a Suspense boundary at build time
  return (
    <Suspense>
      <NewAnalysisForm />
    </Suspense>
  );
}
