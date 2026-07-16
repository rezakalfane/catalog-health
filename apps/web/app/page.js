import Link from "next/link";
import { listEnvironments, listCompletedAnalyses, redactEnvironment } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import GradeLozenge from "@/components/GradeLozenge";
import Sparkline from "@/components/Sparkline";
import { formatDuration } from "@/lib/format";
import SemanticBadge from "@/components/SemanticBadge";
import ActionIcon from "@/components/ActionIcon";
import ScoringProfileSubtitle from "@/components/ScoringProfileSubtitle";
import AnalysisExportActions from "@/components/AnalysisExportActions";
import DeleteAnalysisButton from "@/components/DeleteAnalysisButton";

export const dynamic = "force-dynamic";

const SCORE_HISTORY_LIMIT = 30;

export default async function Dashboard() {
  const user = await requireUser();
  const environments = listEnvironments(user.id).map(redactEnvironment);
  const analyses = listCompletedAnalyses(user.id);

  const latestByEnv = new Map();
  const historyByEnv = new Map();
  for (const a of [...analyses].reverse()) {
    // Profile recalculations are scenario reports over an existing snapshot;
    // they must not replace the latest live-catalog health or distort trends.
    if (a.sourceAnalysisId) continue;
    // oldest -> newest
    if (!historyByEnv.has(a.environmentId)) historyByEnv.set(a.environmentId, []);
    historyByEnv.get(a.environmentId).push({
      id: a.id,
      createdAt: a.createdAt,
      overall: a.summary.overall,
      grade: a.summary.grade,
      productCount: a.summary.productCount,
    });
    if (historyByEnv.get(a.environmentId).length > SCORE_HISTORY_LIMIT) {
      historyByEnv.get(a.environmentId).shift();
    }
    latestByEnv.set(a.environmentId, a);
  }

  environments.sort((a, b) => {
    const aLatest = latestByEnv.get(a.id);
    const bLatest = latestByEnv.get(b.id);
    if (!aLatest && !bLatest) return 0;
    if (!aLatest) return 1;
    if (!bLatest) return -1;
    return new Date(bLatest.createdAt) - new Date(aLatest.createdAt);
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Monitor catalog health, latest analyses, scoring profiles, and improvement activity across your stores.</p>
        </div>
        <Link className="btn" href="/analyses/new">
          <ActionIcon name="play" />
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
                  <ScoringProfileSubtitle profileId={env.scoringProfileId} profile={env.scoringProfile} />
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
                <th>Duration</th>
                <th>Actions</th>
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
                      <SemanticBadge analysis={a} />
                    </td>
                    <td>
                      {env ? (
                        <>
                          <Link href={`/environments/${env.id}`}>{env.name}</Link>
                          <ScoringProfileSubtitle
                            profileId={a.scoringMetadata?.profile?.id || env.scoringProfileId}
                            profile={a.scoringMetadata?.profile || env.scoringProfile}
                          />
                        </>
                      ) : (
                        a.environmentId
                      )}
                    </td>
                    <td>{a.summary.productCount}</td>
                    <td>{a.summary.overall}</td>
                    <td>
                      <GradeLozenge grade={a.summary.grade} small />
                    </td>
                    <td title={a.semanticMs != null ? `semantic ${formatDuration(a.semanticMs)}` : undefined}>
                      {formatDuration(a.durationMs)}
                    </td>
                    <td>
                      <span className="analysis-history-actions">
                        <AnalysisExportActions analysis={a} />
                        <DeleteAnalysisButton analysisId={a.id} iconOnly />
                      </span>
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
