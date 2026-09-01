import type { ShellName } from "../history/types.js";
import type { Invocation } from "../parse/invocation.js";

export interface CommandStat {
  command: string;
  count: number;
  share: number;
  /** Invocations that carried no flags at all. */
  bareCount: number;
  bareRatio: number;
  perShell: Record<ShellName, number>;
  /** Alias names typed to reach this command, most used first. */
  aliases: Array<{ name: string; count: number }>;
}

export interface SubcommandStat {
  command: string;
  subcommand: string;
  count: number;
  share: number;
  bareCount: number;
  bareRatio: number;
}

export interface ShellStat {
  shell: ShellName;
  entries: number;
  invocations: number;
  share: number;
}

function emptyPerShell(): Record<ShellName, number> {
  return { fish: 0, zsh: 0, bash: 0 };
}

export function collectCommandStats(invocations: Invocation[]): CommandStat[] {
  const buckets = new Map<
    string,
    {
      count: number;
      bare: number;
      perShell: Record<ShellName, number>;
      aliases: Map<string, number>;
    }
  >();

  for (const invocation of invocations) {
    let bucket = buckets.get(invocation.command);
    if (!bucket) {
      bucket = {
        count: 0,
        bare: 0,
        perShell: emptyPerShell(),
        aliases: new Map(),
      };
      buckets.set(invocation.command, bucket);
    }

    bucket.count += 1;
    if (invocation.flags.length === 0) {
      bucket.bare += 1;
    }
    bucket.perShell[invocation.shell] += 1;
    if (invocation.alias !== undefined) {
      bucket.aliases.set(
        invocation.alias,
        (bucket.aliases.get(invocation.alias) ?? 0) + 1,
      );
    }
  }

  const total = invocations.length;

  return [...buckets.entries()]
    .map(([command, bucket]) => ({
      command,
      count: bucket.count,
      share: ratio(bucket.count, total),
      bareCount: bucket.bare,
      bareRatio: ratio(bucket.bare, bucket.count),
      perShell: bucket.perShell,
      aliases: [...bucket.aliases.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count || a.command.localeCompare(b.command));
}

export function collectSubcommandStats(
  invocations: Invocation[],
): SubcommandStat[] {
  const buckets = new Map<
    string,
    { command: string; subcommand: string; count: number; bare: number }
  >();

  for (const invocation of invocations) {
    if (invocation.subcommand === undefined) {
      continue;
    }

    const key = `${invocation.command} ${invocation.subcommand}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        command: invocation.command,
        subcommand: invocation.subcommand,
        count: 0,
        bare: 0,
      };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (invocation.flags.length === 0) {
      bucket.bare += 1;
    }
  }

  const total = [...buckets.values()].reduce(
    (sum, bucket) => sum + bucket.count,
    0,
  );

  return [...buckets.values()]
    .map((bucket) => ({
      command: bucket.command,
      subcommand: bucket.subcommand,
      count: bucket.count,
      share: ratio(bucket.count, total),
      bareCount: bucket.bare,
      bareRatio: ratio(bucket.bare, bucket.count),
    }))
    .sort((a, b) => b.count - a.count);
}

export function collectShellStats(
  invocations: Invocation[],
  entriesPerShell: Record<ShellName, number>,
): ShellStat[] {
  const counts = emptyPerShell();
  for (const invocation of invocations) {
    counts[invocation.shell] += 1;
  }

  const total = invocations.length;

  return (Object.keys(counts) as ShellName[])
    .filter((shell) => counts[shell] > 0 || entriesPerShell[shell] > 0)
    .map((shell) => ({
      shell,
      entries: entriesPerShell[shell],
      invocations: counts[shell],
      share: ratio(counts[shell], total),
    }))
    .sort((a, b) => b.invocations - a.invocations);
}

export function collectWrapperStats(
  invocations: Invocation[],
): Array<{ wrapper: string; count: number }> {
  const counts = new Map<string, number>();

  for (const invocation of invocations) {
    for (const wrapper of invocation.wrappers) {
      counts.set(wrapper, (counts.get(wrapper) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([wrapper, count]) => ({ wrapper, count }))
    .sort((a, b) => b.count - a.count);
}

export function ratio(part: number, total: number): number {
  return total === 0 ? 0 : part / total;
}
