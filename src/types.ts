export interface Finding {
  line: number;
  ruleId: string;
  severity: "warning" | "error";
  message: string;
}

/**
 * A rule keeps whatever state it needs between calls (open brace depth,
 * whether it's currently inside a catch block, etc.) so the linter can
 * feed it one line at a time without ever holding the full file.
 */
export interface LineChecker {
  onLine(line: string, lineNumber: number): Finding[];
}

export interface LintRule {
  id: string;
  description: string;
  createChecker(): LineChecker;
}
