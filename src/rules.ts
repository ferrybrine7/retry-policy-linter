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

const LOOP_RE = /\b(while\s*\(\s*(?:true|1)\s*\)|for\s*\(\s*;\s*;\s*\))/;
const BREAK_RE = /\bbreak\b/;

interface LoopFrame {
  depth: number;
  sawBreak: boolean;
  retryLine: number | null;
}

/**
 * Flags a retry() call inside a `while (true)` or `for (;;)` loop that
 * never hits a `break`. Without a break, there is nothing in the loop
 * itself that can stop it — a max-attempts check that never breaks out
 * is just a counter nobody reads, so `break` is the one signal that a
 * loop like this actually ends.
 *
 * Same brace-depth-tracking approach as no-immediate-retry, and the same
 * trade-off: it will flag a genuinely bounded loop if the only exit is a
 * `return` or `throw` rather than a `break`, and it can miss a break that
 * lives inside a nested conditional block on its own line pattern. That
 * is an acceptable false-positive rate for a rule that has to run one
 * line at a time with no parser.
 */
function createUnboundedRetryLoopChecker(): LineChecker {
  const stack: LoopFrame[] = [];
  let depth = 0;

  return {
    onLine(line: string, lineNumber: number): Finding[] {
      const findings: Finding[] = [];
      const opensLoop = LOOP_RE.test(line);

      for (const ch of line) {
        if (ch === "{") {
          depth++;
          if (opensLoop && (stack.length === 0 || stack[stack.length - 1]!.depth !== depth)) {
            stack.push({ depth, sawBreak: false, retryLine: null });
          }
        } else if (ch === "}") {
          if (stack.length > 0 && stack[stack.length - 1]!.depth === depth) {
            const frame = stack.pop()!;
            if (frame.retryLine !== null && !frame.sawBreak) {
              findings.push({
                line: frame.retryLine,
                ruleId: "unbounded-retry-loop",
                severity: "warning",
                message:
                  "retry() inside a while(true)/for(;;) loop with no break — this can retry forever with no attempt limit",
              });
            }
          }
          depth--;
        }
      }

      if (stack.length === 0) {
        return findings;
      }

      const frame = stack[stack.length - 1]!;

      if (RETRY_CALL_RE.test(line) && frame.retryLine === null) {
        frame.retryLine = lineNumber;
      }

      if (BREAK_RE.test(line)) {
        frame.sawBreak = true;
      }

      return findings;
    },
  };
}

export const unboundedRetryLoopRule: LintRule = {
  id: "unbounded-retry-loop",
  description: "retry() in a while(true)/for(;;) loop should have a break so it can't run forever",
  createChecker: createUnboundedRetryLoopChecker,
};

export const rules: LintRule[] = [noImmediateRetryRule, unboundedRetryLoopRule];
