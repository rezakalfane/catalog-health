"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function NewAnalysisPage() {
  const router = useRouter();
  const [environments, setEnvironments] = useState([]);
  const [selected, setSelected] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/environments")
      .then((r) => r.json())
      .then((envs) => {
        setEnvironments(envs);
        if (envs.length) setSelected(envs[0].id);
      });
  }, []);

  async function run(demo = false) {
    setRunning(true);
    setError("");
    const res = await fetch("/api/analyses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(demo ? { demo: true } : { environmentId: selected }),
    });
    setRunning(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Analysis failed");
      return;
    }
    const analysis = await res.json();
    router.push(
      analysis.environmentId === "demo"
        ? "/"
        : `/environments/${analysis.environmentId}`
    );
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
          Large catalogs can take a few minutes.
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
              {running ? "Analyzing…" : "Run analysis"}
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
          {running ? "Analyzing…" : "Run demo analysis"}
        </button>
      </div>
    </>
  );
}
