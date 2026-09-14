# retry-policy-linter

Retry logic looks harmless in a code review — a `catch` block, a call to
`retry()`, done. What's easy to miss is *when* that retry happens. Retry
immediately after a failure and you've turned one upstream blip into a
synchronized retry storm from every client that just failed at once. This
is a small linter that scans source files for that specific mistake (and
is meant to grow more retry-policy checks over time) and reports each hit
with a file and line number, the way a compiler warning would.

## Why streaming

The linter reads its input line by line with `readline` over a Node
stream instead of `fs.readFileSync`. A rule only keeps small bounded
state (brace depth, whether the current catch block has seen a delay
call) — never the file contents. That means it can lint a huge generated
file, or a live log/source stream piped over stdin, without holding the
whole thing in memory at once.

## Usage

```
npm run build
node dist/cli.js src/api-client.ts
```

or without a file argument, from stdin:

```
cat src/*.ts | node dist/cli.js
```

Given a file like this:

```ts
async function fetchData(url: string) {
  try {
    return await fetch(url);
  } catch (err) {
    retry(() => fetchData(url));
  }
}
```

the linter reports:

```
src/api-client.ts:5: [no-immediate-retry] retry() called in a catch block with no preceding delay/backoff — this can cause a retry storm
5 finding(s)
```

Add a delay before retrying (`await sleep(backoffMs)`, `setTimeout(...)`,
etc.) and the finding goes away.

## Rules

| id | what it flags |
| --- | --- |
| `no-immediate-retry` | `retry()` called in a `catch` block before any delay/backoff call |

This checks for retry() calls and delay-like function names by regex and
tracks brace depth to know when a `catch` block ends — it does not parse
the file. That keeps it dependency-free and cheap to run per line, at
the cost of being foolable by braces inside strings or comments.

## Status

Early skeleton. One rule, a CLI, and the streaming core it runs on. See
the roadmap in the project notes for what's next — more retry-specific
rules (unbounded retry loops, missing jitter, catching everything before
retrying), a config file for turning rules on/off, and a test suite.
