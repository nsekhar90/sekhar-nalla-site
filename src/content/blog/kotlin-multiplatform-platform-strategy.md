---
title: "Kotlin Multiplatform as a Platform Strategy"
description: "When shared code becomes a platform — module boundaries, shared networking, and how KMP changes an organization, not just a codebase."
publishedAt: 2026-09-10
tags: ["Kotlin Multiplatform", "Architecture", "Mobile"]
draft: true
---

Kotlin Multiplatform is often pitched as a way to share code between Android and iOS.
That framing undersells it. Used well, KMP is a platform strategy — it changes how
multiple teams ship features, how code is owned and versioned, and how native UI and
shared logic stay in healthy tension.

## Start from the delivery problem

The trigger for adopting KMP is usually a delivery problem, not a language preference.
You have a portfolio of Android and iOS apps that overlap heavily in domain logic —
authentication, networking, feature business rules — and you're maintaining parallel
implementations that drift apart. Bugs fixed on one platform linger on the other.
Features ship late because every behavior is built twice.

The goal isn't "share code." It's to ship correct behavior to every platform faster,
with a single source of truth for the logic that genuinely should be shared.

## The three-layer boundary

A durable KMP platform separates concerns into three layers:

1. **Native UI** — Android Compose / Views and iOS SwiftUI / UIKit. Platform-owned,
   because UI is where platform conventions matter most.
2. **Shared model and repository modules** — feature business logic, domain models,
   and repository orchestration that loads data and applies rules. This is the shared
   heart, written in Kotlin and consumed by both platforms.
3. **Shared networking and core** — HTTP clients, authentication, serialization,
   logging, and observability. The foundational core every feature builds on.

The boundary between native UI and shared logic is the most important one. Keep it
clean: the shared layer exposes a stable API of models and functions; the UI layer
calls into it and renders state. Native teams retain full control of the experience,
while shared logic stops being duplicated.

## Independent versioning and consumption

A platform isn't just shared code — it's shared code that teams can adopt on their own
schedule. Each feature SDK should be independently versioned and consumable, so that:

- A partner app can adopt one feature SDK without pulling in the whole platform.
- Teams upgrade at their own pace, with clear migration paths.
- Releases aren't blocked by a single monolithic version bump.

On iOS this means producing XCFrameworks that consumers can integrate without a
compile-time dependency on the host app's build. That decoupling is what makes the
platform feel like a product rather than a shared folder.

## What changes for the organization

The interesting shift is organizational. With a shared platform:

- Feature teams own vertical slices — shared logic and native UI — rather than
  splitting work by platform.
- A networking or authentication change is made once and benefits every app.
- Cross-platform consistency becomes a property of the system, not a review checklist.

This only works if you treat the shared modules as a platform with real ownership,
API review, versioning, and deprecation policies. Without that discipline, shared
code becomes the most coupled and fragile part of your stack.

## When KMP is the wrong answer

KMP isn't free. It adds a compilation boundary, a tooling investment, and a need for
disciplined API design. It's the wrong choice when:

- You have a single app with no cross-platform sharing pressure.
- The logic you'd share is thin — a few helper functions aren't worth the platform.
- Your team can't invest in versioning, API review, and consumer migration.

KMP shines when there's a portfolio of apps, genuine domain overlap, and a team
willing to build a platform, not just a shared module. In that context, it stops
being "shared code" and becomes the substrate that lets the whole organization
ship faster.
