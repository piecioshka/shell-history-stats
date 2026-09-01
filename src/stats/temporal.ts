import type { Invocation } from "../parse/invocation.js";

export interface TemporalStats {
  /** Invocations that carried a usable timestamp. */
  withTimestamp: number;
  /** Invocations skipped here because their shell records no timestamps. */
  withoutTimestamp: number;
  hours: Array<{ hour: number; count: number }>;
  weekdays: Array<{ weekday: number; label: string; count: number }>;
  months: Array<{ month: string; count: number }>;
  firstSeen?: string;
  lastSeen?: string;
}

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Time-of-day and trend breakdowns. Bash history usually has no timestamps, so
 * the counts of included and excluded invocations are reported alongside.
 */
export function collectTemporalStats(invocations: Invocation[]): TemporalStats {
  const hours = new Array<number>(24).fill(0);
  const weekdays = new Array<number>(7).fill(0);
  const months = new Map<string, number>();

  let withTimestamp = 0;
  let withoutTimestamp = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const invocation of invocations) {
    if (
      invocation.timestamp === undefined ||
      !Number.isFinite(invocation.timestamp)
    ) {
      withoutTimestamp += 1;
      continue;
    }

    withTimestamp += 1;
    min = Math.min(min, invocation.timestamp);
    max = Math.max(max, invocation.timestamp);

    const date = new Date(invocation.timestamp * 1000);
    hours[date.getHours()] = (hours[date.getHours()] ?? 0) + 1;
    weekdays[date.getDay()] = (weekdays[date.getDay()] ?? 0) + 1;

    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    months.set(month, (months.get(month) ?? 0) + 1);
  }

  return {
    withTimestamp,
    withoutTimestamp,
    hours: hours.map((count, hour) => ({ hour, count })),
    weekdays: weekdays.map((count, weekday) => ({
      weekday,
      label: WEEKDAY_LABELS[weekday] as string,
      count,
    })),
    months: [...months.entries()]
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    ...(withTimestamp > 0
      ? {
          firstSeen: new Date(min * 1000).toISOString().slice(0, 10),
          lastSeen: new Date(max * 1000).toISOString().slice(0, 10),
        }
      : {}),
  };
}
