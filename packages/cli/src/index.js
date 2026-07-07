#!/usr/bin/env node
/**
 * catalog-health CLI
 *
 *   catalog-health analyze --demo
 *   catalog-health analyze --store-hash abc123 --token $BC_AUTH_TOKEN --out report/
 */
import fs from "node:fs";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  fetchCatalog,
  demoCatalog,
  analyzeCatalog,
  summarize,
  rowsToCsv,
  objectsToCsv,
} from "@catalog-health/core";

function printSummary(summary, outdir) {
  const line = "=".repeat(62);
  console.log(`\n${line}\n CATALOG HEALTH & AI-READINESS REPORT\n${line}`);
  console.log(` Products analyzed : ${summary.productCount}`);
  console.log(` Overall score     : ${summary.overall} / 100  (grade ${summary.grade})`);
  console.log(
    " Grade distribution: " +
      Object.entries(summary.gradeDist)
        .map(([g, n]) => `${g}:${n}`)
        .join("  ")
  );
  console.log("\n Dimension averages:");
  for (const [d, avg] of Object.entries(summary.dimensionAverages)) {
    console.log(`   ${d.padEnd(10)} ${String(avg).padStart(5)}  ${"#".repeat(Math.round(avg / 4))}`);
  }
  console.log("\n Most common issues:");
  for (const { issue, count } of summary.issueFrequency.slice(0, 8)) {
    console.log(`   ${String(count).padStart(5)}  ${issue}`);
  }
  console.log("\n Weakest categories:");
  for (const c of summary.categoryRollup.slice(0, 5)) {
    console.log(
      `   ${String(c.avgScore).padStart(5)} (${c.grade})  ${c.categoryName}` +
        `  [${c.products} products, ${c.pctFailing}% below C]`
    );
  }
  console.log("\n Top 10 highest-impact fixes (traffic/sales weighted):");
  for (const r of summary.topFixes.slice(0, 10)) {
    console.log(
      `   impact ${String(r.impact).padStart(8)}  [${r.grade}] ${r.name.slice(0, 44).padEnd(44)} issues: ${r.issues.length}`
    );
  }
  if (outdir) console.log(`\n CSV output written to: ${outdir}/`);
  console.log(line + "\n");
}

yargs(hideBin(process.argv))
  .scriptName("catalog-health")
  .command(
    "analyze",
    "Analyze a store catalog and produce a health report",
    (y) =>
      y
        .option("store-hash", {
          type: "string",
          describe: "BigCommerce store hash",
          default: process.env.BC_STORE_HASH,
        })
        .option("token", {
          type: "string",
          describe: "API token (Products: read-only scope)",
          default: process.env.BC_AUTH_TOKEN,
        })
        .option("demo", {
          type: "boolean",
          default: false,
          describe: "Run against a synthetic 120-product catalog",
        })
        .option("out", {
          type: "string",
          default: "health_report",
          describe: "Output directory for CSVs",
        })
        .option("json", {
          type: "boolean",
          default: false,
          describe: "Print the summary as JSON instead of a console report",
        }),
    async (argv) => {
      let products, categories;
      if (argv.demo) {
        console.error("Running in DEMO mode with a synthetic 120-product catalog.\n");
        ({ products, categories } = demoCatalog());
      } else {
        if (!argv.storeHash || !argv.token) {
          console.error(
            "Provide --store-hash and --token (or BC_STORE_HASH / BC_AUTH_TOKEN env vars), or use --demo."
          );
          process.exit(1);
        }
        ({ products, categories } = await fetchCatalog({
          storeHash: argv.storeHash,
          token: argv.token,
          onProgress: ({ path: p, page, totalPages }) =>
            console.error(`  fetched page ${page}/${totalPages} of ${p}`),
        }));
      }

      if (!products.length) {
        console.error("No products found.");
        process.exit(1);
      }

      const rows = analyzeCatalog(products, categories);
      const summary = summarize(rows, categories);

      fs.mkdirSync(argv.out, { recursive: true });
      fs.writeFileSync(path.join(argv.out, "catalog_health_products.csv"), rowsToCsv(rows));
      fs.writeFileSync(
        path.join(argv.out, "catalog_health_categories.csv"),
        objectsToCsv(summary.categoryRollup)
      );
      fs.writeFileSync(
        path.join(argv.out, "catalog_health_top_fixes.csv"),
        rowsToCsv(summary.topFixes)
      );

      if (argv.json) console.log(JSON.stringify(summary, null, 2));
      else printSummary(summary, argv.out);
    }
  )
  .demandCommand(1, "Specify a command, e.g.: catalog-health analyze --demo")
  .strict()
  .help()
  .parse();
