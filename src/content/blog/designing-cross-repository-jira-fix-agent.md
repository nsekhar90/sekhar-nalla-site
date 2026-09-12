---
title: "Designing an Agent for Cross-Repository Jira Bug Fixes"
description: "How to take a Jira bug from an ambiguous symptom to a verified pull request when the code spans multiple repositories."
publishedAt: 2026-09-12
tags: ["AI Agents", "Jira Automation", "android-cli", "maestro-cli", "Engineering Productivity"]
draft: false
---

In a large product, a Jira bug rarely arrives with a neat repository boundary attached.
A user-visible feature might be assembled from a host application, a shared feature
library, and a platform-specific implementation. The issue may describe what the user
saw, while the fix belongs somewhere else.

That makes cross-repository bug fixing a good agent-design problem. The hard part is not
asking an agent to edit a file. It is building a workflow that can identify ownership,
prove the bug exists, preserve context across handoffs, and show that the fix works.

## The core workflow

The design uses one coordinating agent and a focused repository worker. The coordinator
owns the issue lifecycle; the worker investigates and changes code in the selected
repository.

1. **Fetch and normalize the issue.** Collect the summary, reproduction steps, labels,
   attachments, environment, and test data. If the ticket is underspecified, ask for
   the missing reproduction detail before touching code.
2. **Identify likely ownership.** Search repository metadata, dependency relationships,
   feature vocabulary, and source code. Produce a ranked rationale rather than silently
   choosing the first plausible repository.
3. **Confirm the repository.** Show the recommendation and alternatives. A human should
   choose when confidence is low or the symptom crosses a library–host boundary.
4. **Reproduce before fixing.** For a logic bug, encode the reproduction as a failing
   test. For a UI, navigation, or crash bug, run the pre-fix build and capture a
   replayable flow that fails. Save the failure and a before-state screenshot.
5. **Dispatch a self-contained implementation brief.** Include the issue, confirmed
   reproduction, local repository instructions, constraints, and a requirement to
   return a plan before editing.
6. **Implement and test.** The worker makes the change, runs focused tests, and returns
   changed files, test output, a summary, and debugging notes.
7. **Replay the same validation.** Rebuild the relevant app and run the exact flow that
   was red before the fix. The failing assertion should now be green.
8. **Prepare the pull request.** Summarize root cause, fix, tests, validation artifacts,
   and any follow-up integration work. Request approval before pushing or creating the
   pull request.

The important detail is that the evidence moves forward with the ticket. The final PR
should not depend on someone remembering what the agent tried several steps earlier.

## The tool layer

The workflow is intentionally tool-agnostic at the orchestration level, but a mobile
implementation benefits from a small, explicit tool layer:

- **`android-cli`** handles the device-facing mechanics: selecting an emulator or
  device, building the relevant variant, installing the pre-fix and fixed binaries,
  launching a route, and collecting logs when a crash is part of the issue.
- **`maestro-cli`** handles the user journey: navigating to the affected screen,
  inspecting the visible UI, asserting the expected state, and capturing screenshots or
  recordings for the validation record.

The coordinator should keep these responsibilities separate. A build or installation
problem is infrastructure noise; a `maestro-cli` assertion that fails on a successfully
installed build is product evidence. That separation makes retries cheaper and keeps the
agent from misdiagnosing a device problem as a code problem.

For a UI issue, the red/green loop becomes:

1. Use `android-cli` to build and install the pre-fix binary.
2. Use `maestro-cli` to navigate and assert the expected behavior; save the failure.
3. Let the repository worker make and test the change.
4. Use `android-cli` to install the fixed binary from the new build.
5. Replay the identical `maestro-cli` flow and save the passing evidence.

The exact package name, repository path, app route, and local build task should come
from the selected repository's own instructions. Keeping those values local is what
makes the pattern reusable across organizations.

## Ownership is an explicit decision

Repository selection deserves its own stage because the visible app is not necessarily
the owning repository. A useful ownership record contains:

- the recommended repository;
- the signals that led to the recommendation;
- a confidence level;
- alternative repositories considered; and
- the condition that would change the decision.

This is more useful than a bare label such as “the mobile repo.” It also makes the
handoff reviewable. If the feature is shared, the coordinator can distinguish between
a bug inside the feature, an integration or routing bug, and behavior owned by the host
application.

## Red before green

The strongest invariant in the workflow is simple:

> The same flow that proves the bug exists should prove that the fix works.

For a unit-testable issue, this means a failing test becomes a passing test. For a
runtime issue, it means recording a reusable navigation-and-assertion flow against the
pre-fix build, then replaying it against the fixed build.

This prevents a common failure mode in agentic coding: producing a plausible patch for a
bug that was never actually reproduced. If the red phase cannot be established, the
agent should classify the issue as uncertain and stop for better reproduction details,
account data, or environment information.

## Human gates are part of the design

Autonomy is useful inside a well-defined envelope. Judgment still belongs at the points
where a wrong assumption can send work into the wrong codebase or create a misleading
PR. I would keep four gates:

- **Ownership:** confirm the selected repository when signals are ambiguous.
- **Fix plan:** review the proposed root cause before implementation begins.
- **Validation:** inspect the red-to-green evidence and failure classification.
- **PR creation:** approve the final title, body, and branch action.

These gates do not make the workflow less automated. They make the automation legible
and keep a small mistake from becoming a cross-repository change with a large blast
radius.

## Failure classification matters

The coordinator should distinguish code failures from infrastructure failures. A device
that failed to boot, a build that timed out, or a flaky UI-test connection is different
from a fixed build that still shows the bug.

That distinction enables bounded retries:

- **Validation failure:** the fix is not correct or the assertion still fails; return to
  the worker with the new evidence.
- **Infrastructure failure:** retry the affected build, install, or test phase without
  spending the fix-retry budget.
- **Uncertain:** the bug could not be reproduced or ownership is unclear; stop and ask.
- **Passed:** the original reproduction is green on the fixed build; continue to PR.

Without this classification, agents tend to retry blindly or report infrastructure
noise as a code diagnosis.

## What the agent leaves behind

Every run should produce a small, inspectable artifact set:

- the normalized issue brief;
- the ownership rationale;
- the implementation plan;
- the failing and passing test output or UI flow;
- before and after screenshots, plus a recording when relevant;
- the validation notes; and
- the rendered PR body.

This turns the workflow into something a second agent or a human can resume. It also
creates a useful audit trail without requiring the entire conversation to be replayed.

## The larger pattern

The lesson is broader than Jira or mobile development. When work spans repositories,
agents need explicit ownership, durable handoffs, reproducible validation, and human
approval at the decision boundaries. The coding step is only one part of the system.

The best version of this workflow does not try to remove engineering judgment. It
removes the coordination tax around that judgment: finding the right code, repeating
the same setup, reconstructing what failed, and assembling evidence for the PR.
