import ActionIcon from "@/components/ActionIcon";

export default function AnalysisExportActions({ analysis }) {
  return (
    <span className="analysis-history-actions">
      <a
        className="btn analysis-history-action pdf"
        href={`/api/analyses/${analysis.id}/pdf`}
        aria-label="Export analysis as PDF"
        title="Export analysis as PDF"
      >
        <ActionIcon name="fileText" />
      </a>
      {analysis.hasRows && (
        <a
          className="btn analysis-history-action csv"
          href={`/api/analyses/${analysis.id}/products?format=csv`}
          aria-label="Export all products as CSV"
          title="Export all products as CSV"
        >
          <ActionIcon name="table" />
        </a>
      )}
    </span>
  );
}
