function percent(value) {
  return value == null ? "—" : `${Math.round(Number(value) * 100)}%`;
}

function yesNo(value) {
  return value == null ? "—" : value ? "Yes" : "No";
}

function humanize(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function metadataRows(metadata) {
  if (!metadata) return [];

  const profile = metadata.profile || {};
  const semantic = metadata.semantic || {};
  return [
    {
      group: "Versions",
      rows: [
        ["Metadata schema", metadata.schemaVersion],
        ["Scoring engine", metadata.engineVersion],
        ["Profile name", profile.label],
        ["Scoring profile", profile.id],
        ["Profile version", profile.version],
      ],
    },
    {
      group: "Dimension weights",
      rows: Object.entries(profile.dimensionWeights || {}).map(([key, value]) => [
        humanize(key),
        percent(value),
      ]),
    },
    {
      group: "Scoring thresholds",
      rows: Object.entries(profile.thresholds || {}).map(([key, value]) => [
        humanize(key),
        value,
      ]),
    },
    {
      group: "Semantic scoring",
      rows: [
        ["Requested", yesNo(semantic.requested)],
        ["Applied", yesNo(semantic.applied)],
        ["Score weight", percent(profile.semanticWeight)],
        ["Prompt version", semantic.promptVersion],
        ["Provider", semantic.provider],
        ["Model configuration", semantic.configurationName],
        ["Model", semantic.model],
        ["Judge", semantic.judgeLabel],
      ],
    },
  ].map((section) => ({
    ...section,
    rows: section.rows.map(([label, value]) => [label, value ?? "—"]),
  }));
}

function comparisonSections(base, target) {
  const baseSections = metadataRows(base);
  const targetSections = metadataRows(target);
  const groupNames = [...new Set([
    ...baseSections.map((section) => section.group),
    ...targetSections.map((section) => section.group),
  ])];

  return groupNames.map((group) => {
    const baseRows = new Map(
      (baseSections.find((section) => section.group === group)?.rows || []).map((row) => [
        row[0],
        row[1],
      ])
    );
    const targetRows = new Map(
      (targetSections.find((section) => section.group === group)?.rows || []).map((row) => [
        row[0],
        row[1],
      ])
    );
    const labels = [...new Set([...baseRows.keys(), ...targetRows.keys()])];
    return {
      group,
      rows: labels.map((label) => ({
        label,
        base: baseRows.get(label) ?? "—",
        target: targetRows.get(label) ?? "—",
        changed: baseRows.get(label) !== targetRows.get(label),
      })),
    };
  });
}

export default function ScoringMetadataPanel({ metadata, base, target }) {
  const comparison = base !== undefined || target !== undefined;

  if (comparison && (!base || !target)) {
    return (
      <div className="card">
        <h2>Scoring metadata</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          Metadata is unavailable for one or both legacy analyses, so their scoring
          configurations cannot be compared.
        </p>
      </div>
    );
  }

  if (!comparison && !metadata) {
    return (
      <div className="card">
        <h2>Scoring metadata</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          This legacy analysis predates scoring metadata snapshots.
        </p>
      </div>
    );
  }

  const sections = comparison ? comparisonSections(base, target) : metadataRows(metadata);

  return (
    <div className="card scoring-metadata-card">
      <div className="section-action-head">
        <div>
          <h2>Scoring metadata</h2>
          <p className="muted scoring-metadata-intro">
            {comparison
              ? "The exact scoring configuration stored with each analysis. Changed values are highlighted."
              : "The scoring configuration captured when this analysis ran."}
          </p>
        </div>
        {comparison && (
          <span className={`metadata-status ${sections.some((section) => section.rows.some((row) => row.changed)) ? "changed" : "matching"}`}>
            {sections.some((section) => section.rows.some((row) => row.changed))
              ? "Configurations differ"
              : "Configurations match"}
          </span>
        )}
      </div>
      <div className="table-scroll">
        <table className="scoring-metadata-table">
          <thead>
            <tr>
              <th>Setting</th>
              {comparison ? (
                <>
                  <th>Previous</th>
                  <th>Current</th>
                </>
              ) : (
                <th>Value</th>
              )}
            </tr>
          </thead>
          {sections.map((section) => (
            <tbody key={section.group}>
              <tr className="metadata-group-row">
                <th colSpan={comparison ? 3 : 2}>{section.group}</th>
              </tr>
              {section.rows.map((row) => {
                const label = comparison ? row.label : row[0];
                return (
                  <tr key={label} className={comparison && row.changed ? "metadata-changed-row" : undefined}>
                    <td>{label}</td>
                    {comparison ? (
                      <>
                        <td>{String(row.base)}</td>
                        <td>
                          {String(row.target)}
                          {row.changed && <span className="metadata-change-label">Changed</span>}
                        </td>
                      </>
                    ) : (
                      <td>{String(row[1])}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
