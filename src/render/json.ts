import type { Report } from "../stats/report.js";

export function renderJson(report: Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
