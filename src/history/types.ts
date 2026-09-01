export type ShellName = "fish" | "zsh" | "bash";

export const SHELL_NAMES: readonly ShellName[] = ["fish", "zsh", "bash"];

export function isShellName(value: string): value is ShellName {
  return (SHELL_NAMES as readonly string[]).includes(value);
}

/**
 * A single command line as recorded by a shell.
 *
 * `timestamp` is in Unix seconds and is absent for shells that do not record
 * it (plain bash history, zsh without EXTENDED_HISTORY).
 * `paths` is only ever populated by fish.
 */
export interface HistoryEntry {
  command: string;
  shell: ShellName;
  timestamp?: number;
  paths?: string[];
}

export interface HistorySource {
  shell: ShellName;
  file: string;
}
