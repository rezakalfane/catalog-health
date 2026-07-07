import Link from "next/link";
import { listEnvironments, listCompletedAnalyses, redactEnvironment } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import GradeLozenge from "@/components/GradeLozenge";
import Sparkline from "@/components/Sparkline";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const environments = listEnvironments(user.id).map(redactEnvironment);
  const analyses = listCompletedAnalyses(user.id);

  const latestByEnv = new Map();
  const historyByEnv = new Map();
  for (const a of [...analyses].reverse()) {
    // oldest -> newest
    if (!historyByEnv.has(a.environmentId)) historyByEnv.set(a.environmentId, []);
    historyByEnv.get(a.environmentId).push({
      id: a.id,
      createdAt: a.createdAt,
      overall: a.summary.overall,
      grade: a.summary.grade,
      productCount: a.summary.productCount,
    });
    latestByEnv.set(a.environmentId, a);
  }

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <Link className="btn" href="/analyses/new">
          Run new analysis
        </Link>
      </div>

      {environments.length === 0 && (
        <div className="card">
          <h2>No environments yet</h2>
          <p className="muted">
            Add a BigCommerce store under <Link href="/environments">Environments</Link>,
            or run a <Link href="/analyses/new">demo analysis</Link> to see the tool in
            action with synthetic data.
          </p>
        </div>
      )}

      <div className="grid">
        {environments.map((env) => {
          const latest = latestByEnv.get(env.id);
          return (
            <div className="card" key={env.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <div>
                  <h2>
                    <Link href={`/environments/${env.id}`}>{env.name}</Link>
                  </h2>
                  <p className="muted">
                    {env.storeHash} ·{" "}
                    {latest
                      ? `last analyzed ${new Date(latest.createdAt).toLocaleDateString()}`
                      : "never analyzed"}
                  </p>
                </div>
                {latest && <GradeLozenge grade={latest.summary.grade} />}
              </div>
              <Sparkline points={historyByEnv.get(env.id) || []} />
            </div>
          );
        })}
      </div>

      {analyses.length > 0 && (
        <div className="card">
          <h2>Recent analyses</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Environment</th>
                <th>Products</th>
                <th>Score</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {analyses.slice(0, 10).map((a) => {
                const env = environments.find((e) => e.id === a.environmentId);
                return (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/analyses/${a.id}`}>
                        {new Date(a.createdAt).toLocaleString()}
                      </Link>
                    </td>
                    <td>
                      {env ? (
                        <Link href={`/environments/${env.id}`}>{env.name}</Link>
                      ) : (
                        a.environmentId
                      )}
                    </td>
                    <td>{a.summary.productCount}</td>
                    <td>{a.summary.overall}</td>
                    <td>
                      <GradeLozenge grade={a.summary.grade} small />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
