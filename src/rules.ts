import type { Finding, LineChecker, LintRule } from "./types.js";

const CATCH_RE = /\bcatch\s*\(/;
const RETRY_CALL_RE = /\bretry\s*\(/;
const DELAY_RE = /\b(setTimeout|sleep|delay|backoff|wait)\s*\(/i;

interface CatchFrame {
  depth: number;
  sawDelay: boolean;
}

/**
 * Flags a retry() call inside a catch block that has no delay/backoff
 * call before it. Retrying immediately after a failure is how a single
 * upstream blip turns into a retry storm that takes the upstream down.
 *
 * This is line- and brace-counting based rather than a real parser, so it
 * can be fooled by braces inside strings, template literals, or comments.
 * That trade-off is deliberate: a real parser means depending on the
 * TypeScript compiler, and this project has no dependencies. The rule
 * errs toward flagging real-looking retry() calls and staying cheap
 * enough to run one line at a time on arbitrarily large input.
 */
function createNoImmediateRetryChecker(): LineChecker {
  const stack: CatchFrame[] = [];
  let depth = 0;

  return {
    onLine(line: string, lineNumber: number): Finding[] {
      const findings: Finding[] = [];
      const opensCatch = CATCH_RE.test(line);

      for (const ch of line) {
        if (ch === "{") {
          depth++;
          if (opensCatch && (stack.length === 0 || stack[stack.length - 1]!.depth !== depth)) {
            stack.push({ depth, sawDelay: false });
          }
        } else if (ch === "}") {
          if (stack.length > 0 && stack[stack.length - 1]!.depth === depth) {
            stack.pop();
          }
          depth--;
        }
      }

      if (stack.length === 0) {
        return findings;
      }

      const frame = stack[stack.length - 1]!;
      const retryMatch = RETRY_CALL_RE.exec(line);
      const delayMatch = DELAY_RE.exec(line);

      if (delayMatch && (!retryMatch || delayMatch.index <= retryMatch.index)) {
        frame.sawDelay = true;
      }

      if (retryMatch && !frame.sawDelay) {
        findings.push({
          line: lineNumber,
          ruleId: "no-immediate-retry",
          severity: "warning",
          message:
            "retry() called in a catch block with no preceding delay/backoff — this can cause a retry storm",
        });
      }

      if (delayMatch && retryMatch && delayMatch.index > retryMatch.index) {
        frame.sawDelay = true;
      }

      return findings;
    },
  };
}

export const noImmediateRetryRule: LintRule = {
  id: "no-immediate-retry",
  description: "retry() in a catch block should be preceded by a delay or backoff call",
  createChecker: createNoImmediateRetryChecker,
};

export const rules: LintRule[] = [noImmediateRetryRule];
