#!/usr/bin/env node
import { createReadStream } from "node:fs";
import process from "node:process";
import { lint } from "./linter.js";
import { rules } from "./rules.js";

async function main(): Promise<void> {
  const target = process.argv[2];
  const input = target ? createReadStream(target) : process.stdin;
  const label = target ?? "<stdin>";

  let findingCount = 0;
  for await (const finding of lint(input, rules)) {
    findingCount++;
    console.log(`${label}:${finding.line}: [${finding.ruleId}] ${finding.message}`);
  }

  if (findingCount > 0) {
    console.error(`\n${findingCount} finding(s)`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 2;
});
