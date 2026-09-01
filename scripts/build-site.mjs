// Assembles the static site: copies the recorded demo next to the page and
// renders a sample HTML report from the synthetic history, so the landing page
// can link to a real report without shipping anyone's actual history.
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildReport,
  parseEntries,
  parseFishHistory,
  renderHtml,
} from "../dist/index.js";

const root = new URL("../", import.meta.url);
const site = new URL("site/", root);

copyFileSync(
  fileURLToPath(new URL("demo/demo.gif", root)),
  fileURLToPath(new URL("demo.gif", site)),
);

const aliases = new Map([
  ["gst", "git status"],
  ["gp", "git push"],
  ["gd", "git diff"],
  ["ga", "git add"],
  ["gcm", "git commit -m"],
  ["ll", "ls -la"],
  ["nrb", "npm run build"],
  ["nrt", "npm run test"],
  ["dc", "docker compose"],
]);

const entries = parseFishHistory(
  readFileSync(fileURLToPath(new URL("demo/history.fish", root)), "utf8"),
);
const report = buildReport(entries, parseEntries(entries, aliases), {
  top: 10,
  redactSecrets: true,
});

writeFileSync(
  fileURLToPath(new URL("report.html", site)),
  renderHtml(report),
  "utf8",
);

console.log("site: demo.gif + report.html");
