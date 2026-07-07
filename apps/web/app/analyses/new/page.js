"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function NewAnalysisForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedEnv = searchParams.get("env");
  const [environments, setEnvironments] = useState([]);
  const [selected, setSelected] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/environments")
      .then((r) => r.json())
      .then((envs) => {
        setEnvironments(envs);
        if (!envs.length) return;
        const preselected = envs.find((env) => env.id === preselectedEnv);
        setSelected(preselected ? preselected.id : envs[0].id);
      });
  }, [preselectedEnv]);

  async function run(demo = false) {
    setRunning(true);
    setError("");
    const res = await fetch("/api/analyses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(demo ? { demo: true } : { environmentId: selected }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 409 && body.analysisId) {
      // Already running — take the user to the run in progress.
      router.push(`/analyses/${body.analysisId}`);
      return;
    }
    if (!res.ok) {
      setRunning(false);
      setError(body.error || "Could not start the analysis");
      return;
    }
    router.push(`/analyses/${body.id}`);
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
                  {env.name} ({env.storeHash})
                </option>
              ))}
            </select>
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
          needed. Useful for demos and for checking the tool works.
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
