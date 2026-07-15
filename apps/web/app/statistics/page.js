import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import ActionIcon from "@/components/ActionIcon";
import AiAnalyzedBadge from "@/components/AiAnalyzedBadge";
import DimensionBars from "@/components/DimensionBars";
import GradeLozenge from "@/components/GradeLozenge";
import ProductThumb from "@/components/ProductThumb";
import { issueLabel } from "@/components/issue-info";
import { formatDuration } from "@/lib/format";
import {
  STAT_GRADES,
  loadAccountStatistics,
  statisticDeltaClass,
  statisticDeltaLabel,
  statisticGrade,
  statisticNumber,
  statisticPct,
} from "@/lib/account-statistics";

export const dynamic = "force-dynamic";

function StatCard({ label, value, detail, tone }) {
  return (
    <div className="card stat-card">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {detail && <span className={`stat-detail ${tone || ""}`}>{detail}</span>}
    </div>
  );
}

function DistributionBar({ grade: gradeName, count, total }) {
  return (
    <div className="distribution-row">
      <GradeLozenge grade={gradeName} small />
      <div className="distribution-track" aria-label={`${gradeName}: ${count} products`}>
        <span
          className={`distribution-fill ${gradeName}`}
          style={{ width: statisticPct(count, total) }}
        />
      </div>
      <span className="distribution-count">{statisticNumber(count)} ({statisticPct(count, total)})</span>
    </div>
  );
}

function EmptyCard({ title, children }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="muted">{children}</p>
    </div>
  );
}

export default async function StatisticsPage() {
  const user = await requireUser();
  const { environments, completedAnalyses, stats } = loadAccountStatistics(user.id);
  const hasCurrentHealth = stats.latestAnalyses.length > 0;
  const accountGrade = statisticGrade(stats.currentScore);

  return (
    <>
      <div className="page-head statistics-page-head">
        <div className="statistics-title-block">
          <h1>Statistics</h1>
          <p className="muted">
            Account-wide catalog health, activity, impact, and AI coverage.<br />
            Based on the latest live-catalog analysis per environment.
          </p>
        </div>
        <div className="page-actions">
          <a className="btn secondary" href="/api/statistics/pdf">
            <ActionIcon name="download" />
            Export as PDF
          </a>
          <Link className="btn" href="/analyses/new">
            <ActionIcon name="play" />
            Run new analysis
          </Link>
        </div>
      </div>

      {environments.length === 0 && (
        <EmptyCard title="No environments yet">
          Add an environment or run a demo analysis before account statistics can be calculated.
        </EmptyCard>
      )}

      <div className="stats-grid">
        <StatCard label="Environments" value={statisticNumber(environments.length)} />
        <StatCard
          label="Analyses"
          value={statisticNumber(stats.totalAnalyses)}
          detail={`${statisticNumber(stats.completedCount)} completed · ${statisticNumber(stats.statusCounts.running || 0)} running · ${statisticNumber(stats.statusCounts.failed || 0)} failed`}
        />
        <StatCard
          label="Products in latest snapshots"
          value={statisticNumber(stats.productCount)}
          detail={`${statisticNumber(stats.productsBelowC)} below C`}
          tone={stats.productsBelowC ? "bad" : "good"}
        />
        <StatCard
          label="AI analyzed products"
          value={statisticNumber(stats.aiAnalyzedCount)}
          detail={`${statisticPct(stats.aiAnalyzedCount, stats.productCount)} of latest products`}
        />
      </div>

      {hasCurrentHealth ? (
        <>
          <div className="grid">
            <div className="card">
              <h2>Account health</h2>
              <div className="stat-hero">
                <GradeLozenge grade={accountGrade} />
                <div>
                  <div className="stat-hero-score">{statisticNumber(stats.currentScore, 1)} / 100</div>
                  <div className={`stat-detail ${statisticDeltaClass(stats.accountDelta)}`}>
                    {statisticDeltaLabel(stats.accountDelta)}
                  </div>
                </div>
              </div>
              <p className="muted">
                Weighted by product count across {statisticNumber(stats.latestAnalyses.length)} analyzed environment{stats.latestAnalyses.length === 1 ? "" : "s"}.
              </p>
            </div>

            <div className="card">
              <h2>Grade distribution</h2>
              <div className="distribution-list">
                {STAT_GRADES.map((g) => (
                  <DistributionBar key={g} grade={g} count={stats.gradeDist[g] || 0} total={stats.productCount} />
                ))}
              </div>
            </div>

            <div className="card">
              <h2>Dimension averages</h2>
              <DimensionBars averages={stats.dimensionAverages} />
            </div>
          </div>

          <div className="split-grid">
            <div className="card">
              <h2>AI &amp; semantic coverage</h2>
              <table>
                <tbody>
                  <tr><th>Semantic analyses</th><td>{statisticNumber(stats.semanticAnalyses)} of {statisticNumber(stats.completedCount)}</td></tr>
                  <tr><th>AI analyzed products</th><td>{statisticNumber(stats.aiAnalyzedCount)} of {statisticNumber(stats.productCount)} latest products</td></tr>
                  <tr><th>Profile recalculations</th><td>{statisticNumber(stats.derivedCount)}</td></tr>
                  <tr><th>Average analysis duration</th><td>{stats.avgDurationMs ? formatDuration(stats.avgDurationMs) : "n/a"}</td></tr>
                </tbody>
              </table>
            </div>

            <div className="card">
              <h2>Commercial exposure</h2>
              <table>
                <tbody>
                  <tr><th>Views on D/F products</th><td>{statisticNumber(stats.impactedViews)}</td></tr>
                  <tr><th>Units sold on D/F products</th><td>{statisticNumber(stats.impactedUnits)}</td></tr>
                  <tr><th>D/F product share</th><td>{statisticPct(stats.productsBelowC, stats.productCount)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Environment leaderboard</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Environment</th>
                    <th>Latest score</th>
                    <th>Grade</th>
                    <th>Change</th>
                    <th>Products</th>
                    <th>Analyses</th>
                    <th>Last run</th>
                  </tr>
                </thead>
                <tbody>
                  {[...stats.envSummaries]
                    .sort((a, b) => Number(b.latest?.summary?.overall || -1) - Number(a.latest?.summary?.overall || -1))
                    .map(({ env, latest, delta, analysisCount, daysSinceRun }) => (
                      <tr key={env.id}>
                        <td><Link href={`/environments/${env.id}`}>{env.name}</Link></td>
                        {latest ? (
                          <>
                            <td>{statisticNumber(latest.summary.overall, 1)}</td>
                            <td><GradeLozenge grade={latest.summary.grade} small /></td>
                            <td className={statisticDeltaClass(delta)}>{statisticDeltaLabel(delta)}</td>
                            <td>{statisticNumber(latest.summary.productCount)}</td>
                            <td>{statisticNumber(analysisCount)}</td>
                            <td>{daysSinceRun === 0 ? "today" : `${daysSinceRun}d ago`}</td>
                          </>
                        ) : (
                          <>
                            <td className="muted">n/a</td>
                            <td className="muted">n/a</td>
                            <td className="muted">No runs</td>
                            <td className="muted">n/a</td>
                            <td>0</td>
                            <td className="muted">never</td>
                          </>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="split-grid">
            <div className="card">
              <h2>Top issues by count</h2>
              <table>
                <thead><tr><th>Issue</th><th>Products</th></tr></thead>
                <tbody>
                  {stats.topIssueCounts.map(({ key, value }) => (
                    <tr key={key}><td>{issueLabel(key)}</td><td>{statisticNumber(value)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h2>Top issues by impact</h2>
              <table>
                <thead><tr><th>Issue</th><th>Impact</th></tr></thead>
                <tbody>
                  {stats.topIssueImpact.map(({ key, value }) => (
                    <tr key={key}><td>{issueLabel(key)}</td><td>{statisticNumber(value, 1)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Highest-impact products</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Environment</th>
                    <th>Score</th>
                    <th>Grade</th>
                    <th>Views</th>
                    <th>Units</th>
                    <th>Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topProducts.map((product) => (
                    <tr key={`${product.analysisId}-${product.id}`}>
                      <td>
                        <Link className="prod-cell" href={`/analyses/${product.analysisId}/products/${product.id}`}>
                          <ProductThumb src={product.details?.thumbnailUrl || product.details?.imageUrl} alt="" size={28} />
                          <span className="product-name-with-ai">
                            <span>{product.name || product.sku || product.id}</span>
                            <AiAnalyzedBadge analyzed={product.aiAnalyzed} />
                          </span>
                        </Link>
                      </td>
                      <td>{product.environmentName}</td>
                      <td>{statisticNumber(product.overall, 1)}</td>
                      <td><GradeLozenge grade={product.grade} small /></td>
                      <td>{statisticNumber(product.viewCount || 0)}</td>
                      <td>{statisticNumber(product.totalSold || 0)}</td>
                      <td>{statisticNumber(product.impact || 0, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="split-grid">
            <div className="card">
              <h2>Weakest categories</h2>
              <table>
                <thead><tr><th>Category</th><th>Environment</th><th>Products</th><th>Avg score</th><th>Grade</th></tr></thead>
                <tbody>
                  {stats.categories.map((category) => (
                    <tr key={`${category.environmentName}-${category.categoryId}`}>
                      <td>{category.categoryName}</td>
                      <td>{category.environmentName}</td>
                      <td>{statisticNumber(category.products)}</td>
                      <td>{statisticNumber(category.avgScore, 1)}</td>
                      <td><GradeLozenge grade={category.grade} small /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h2>Scoring profiles in use</h2>
              <table>
                <thead><tr><th>Profile</th><th>Latest environments</th></tr></thead>
                <tbody>
                  {stats.profileCounts.map(({ key, value }) => (
                    <tr key={key}><td>{key}</td><td>{statisticNumber(value)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : environments.length > 0 ? (
        <EmptyCard title="No completed analyses yet">
          Run at least one analysis to populate account health, grade distribution, issue, product, and AI coverage statistics.
        </EmptyCard>
      ) : null}
    </>
  );
}
