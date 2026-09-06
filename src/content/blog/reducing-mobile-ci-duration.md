---
title: "Reducing Mobile CI Duration with Change-Aware Pipelines"
description: "How conditional execution and remote Gradle build caching cut mobile CI duration by 53%."
publishedAt: 2026-09-05
tags: ["Android", "Gradle", "TeamCity", "CI/CD"]
draft: false
---

Mobile CI systems tend to get slower over time. Repositories grow, variants multiply,
test suites expand, and release paths fan out. Before long, a pull request that should
give feedback in a few minutes takes twenty. This post walks through the principles that
let a mobile team cut CI duration by roughly 53% — without stripping coverage.

## The problem with naive pipelines

A common starting point is a single pipeline that runs everything on every change:

- Build all modules
- Run all unit tests
- Run instrumentation tests
- Lint and static analysis
- Assemble release variants

This is correct and safe, but it does a lot of wasted work. If a change touches a single
feature module, there's no reason to rebuild and retest every other module in the graph.
The first lever is to stop running work that can't possibly be affected.

## Change detection before expensive work

The foundation is knowing what actually changed. For a Gradle-based Android build, that
means understanding module dependencies and computing an affected set:

```text
changed module  →  its dependents  →  tests for those modules
```

If module `feature:billing` changed, you need to build and test `feature:billing` and any
module that depends on it (typically `app` and integration modules). Modules that are
pure dependencies of `feature:billing` — like `core:networking` — do not need to be rebuilt.

In practice this is a graph traversal. You take the changed files, map them to owning
modules, then walk upward through dependents to produce the affected set.

## Conditional execution

Once you have the affected set, you make pipeline stages conditional:

- If no affected modules need Android instrumentation tests, skip them.
- If the change is documentation-only, skip the build entirely.
- If only `core:networking` changed, run only its dependents' tests — not the entire suite.

Conditional execution alone can remove a surprising amount of redundant work. In our
case it contributed roughly 37% of the total CI reduction.

## Remote Gradle build caching

The second lever is remote build caching. Gradle's build cache lets task outputs be
stored and reused across machines and runs. With a shared remote cache:

- A task that produced the same inputs on another machine is downloaded instead of
  re-executed.
- Clean builds on CI become cache hits instead of cold work.
- Switching branches no longer means rebuilding everything.

```kotlin
// settings.gradle.kts
buildCache {
    remote {
        url = uri("https://cache.example.com/cache/")
        isPush = true
    }
}
```

The critical detail: cacheability depends on stable, content-addressable inputs. Tasks
must declare all their inputs and outputs, and they must not embed volatile values like
absolute paths or timestamps into cache keys. Spend time making tasks cacheable — that
investment pays back across every build.

## Measuring and guardrails

You can't improve what you don't measure. Track pipeline stage duration over time and
alert on regressions. Useful signals:

- Median and p95 time-to-feedback per pipeline.
- Cache hit rate (local and remote).
- Percentage of stages that executed conditionally.
- Flaky test rate, which silently inflates duration through retries.

Add guardrails so optimizations don't silently reduce coverage. For example, gate
"skip instrumentation tests" behind a label that requires a non-trivial affected-set
threshold, and periodically run a full pipeline on a schedule to catch drift.

## Results

Combining change-aware conditional execution with remote Gradle build caching reduced
mobile CI duration by about 53%. The split was roughly:

- **Conditional execution:** 37% of the reduction
- **Remote build caching:** the remainder

The bigger lesson is about discipline: stop doing unaffected work, reuse work that's
already been done, and measure both continuously. The tools are well within reach for
any Gradle-based mobile team — the work is in wiring them together carefully and keeping
task inputs honest.
