import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import type { Finding, LintRule } from "./types.js";

/**
 * Lints `input` one line at a time. `readline` reads the stream in
 * chunks and hands us complete lines as they arrive, so memory use stays
 * bounded by the longest single line plus each rule's own state — the
 * file (or stdin stream) is never buffered in full. This matters because
 * the intended input includes large generated source and log files.
 */
export async function* lint(input: Readable, rules: LintRule[]): AsyncGenerator<Finding> {
  const checkers = rules.map((rule) => rule.createChecker());
  const rl = createInterface({ input, crlfDelay: Infinity });

  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber++;
    for (const checker of checkers) {
      const findings = checker.onLine(line, lineNumber);
      for (const finding of findings) {
        yield finding;
      }
    }
  }
}
