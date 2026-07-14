const CSV_HEADERS = [
  "Product ID",
  "Product",
  "SKU",
  "Score",
  "Grade",
  "Impact",
  "Views",
  "Sold",
  "Issue count",
  "Issues",
];

function csvCell(value) {
  const text = value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function productRowsCsv(rows, issueLabel = String) {
  return [
    CSV_HEADERS.map(csvCell).join(","),
    ...rows.map((row) =>
      [
        row.id,
        row.name || `#${row.id}`,
        row.sku,
        row.overall,
        row.grade,
        row.impact,
        row.viewCount,
        row.totalSold,
        row.issues.length,
        row.issues.map(issueLabel).join("; "),
      ]
        .map(csvCell)
        .join(",")
    ),
  ].join("\r\n");
}

export function downloadProductCsv(filename, rows, issueLabel) {
  const blob = new Blob([`\uFEFF${productRowsCsv(rows, issueLabel)}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
