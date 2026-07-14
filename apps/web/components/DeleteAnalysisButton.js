"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAnalysis } from "@/lib/api-client";
import ActionIcon from "@/components/ActionIcon";

const CONFIRMATION =
  "Delete this analysis permanently? Its report and product results will be removed. " +
  "Recalculated reports derived from it will remain but lose their source link. " +
  "This cannot be undone.";

export default function DeleteAnalysisButton({
  analysisId,
  redirectHref = null,
  iconOnly = false,
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (!window.confirm(CONFIRMATION)) return;
    setDeleting(true);
    setError("");
    try {
      await deleteAnalysis(analysisId);
      if (redirectHref) {
        router.replace(redirectHref);
      } else {
        router.refresh();
      }
    } catch (requestError) {
      setDeleting(false);
      setError(requestError.body?.error || "Could not delete this analysis");
    }
  }

  return (
    <span className="delete-analysis-control">
      <button
        type="button"
        className={`delete-analysis-button${iconOnly ? " icon-only" : ""}`}
        disabled={deleting}
        onClick={remove}
        aria-label={deleting ? "Deleting analysis" : "Delete analysis"}
        title={deleting ? "Deleting analysis…" : "Delete analysis"}
      >
        {iconOnly ? <ActionIcon name="trash" /> : deleting ? "Deleting…" : "Delete analysis"}
      </button>
      {error && <span className="error delete-analysis-error" role="alert">{error}</span>}
    </span>
  );
}
