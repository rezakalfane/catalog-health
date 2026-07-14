"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { listEnvironments, getSettings, createAnalysis } from "@/lib/api-client";
import ScoringProfileSubtitle from "@/components/ScoringProfileSubtitle";
import { getScoringProfile } from "@catalog-health/core/profiles";

function NewAnalysisForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedEnv = searchParams.get("env");
  const [environments, setEnvironments] = useState([]);
  const [selected, setSelected] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [llm, setLlm] = useState(null);
  const [semantic, setSemantic] = useState(true);
  const selectedEnvironment = environments.find((env) => env.id === selected);

  useEffect(() => {
    listEnvironments().then((envs) => {
      setEnvironments(envs);
      if (!envs.length) return;
      const preselected = envs.find((env) => env.id === preselectedEnv);
      setSelected(preselected ? preselected.id : envs[0].id);
    });
    getSettings().then(({ llm }) => setLlm(llm));
  }, [preselectedEnv]);

  async function run(demo = false) {
    setRunning(true);
    setError("");
    try {
      const body = await createAnalysis(
        demo
          ? { demo: true, semantic }
          : { environmentId: selected, semantic: semantic && Boolean(llm?.configured) }
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
        <h1>New analysis</h1>
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
                  {env.name} — {getScoringProfile(env.scoringProfileId).label}
                </option>
              ))}
            </select>
            {selectedEnvironment && (
              <ScoringProfileSubtitle
                profileId={selectedEnvironment.scoringProfileId}
                description
              />
            )}
            {llm?.configured ? (
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={semantic}
                  onChange={(e) => setSemantic(e.target.checked)}
                  style={{ width: "auto", margin: 0 }}
                />
                Include semantic scoring — {llm.model}
                {llm.provider === "ollama"
                  ? " via Ollama (free, local)"
                  : llm.provider === "openai"
                    ? " via the OpenAI API"
                    : " via the Claude API"}
              </label>
            ) : (
              <p className="muted">
                Semantic scoring (LLM judges description quality) is available
                once a model is connected under <a href="/settings">Settings</a>.
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
