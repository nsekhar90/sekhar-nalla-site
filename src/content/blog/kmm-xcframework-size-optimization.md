---
title: "Shrinking Kotlin Multiplatform XCFrameworks"
description: "How we cut per-feature bundles in half—then consolidated core and features into one lean umbrella XCFramework for iOS."
publishedAt: 2026-09-12
tags: ["Kotlin Multiplatform", "iOS", "KMP", "Mobile Architecture", "Performance"]
draft: false
---

# Shrinking Kotlin Multiplatform XCFrameworks

*How we cut per-feature bundles in half — then consolidated into one umbrella framework.*

```text
┌─────────────────┐       ┌──────────────────────────────┐
│ KMM Feature SDKs│ ────▶ │ Core Infrastructure          │
│                 │ ────▶ │ Account Monitoring           │
│                 │ ────▶ │ Device Security              │
│                 │ ────▶ │ Subscription Hub             │
│                 │ ────▶ │ Fraud Protection             │
└─────────────────┘       └──────────────────────────────┘
```

*Our starting point: a modular KMP monorepo with one XCFramework per feature.*

## TL;DR

1. **The problem.** Our iOS app consumed separate XCFrameworks per feature—account monitoring, device security, subscription hub, fraud protection, plus a shared core. Each bundle was 35–65 MB, bloated by transitive exports, duplicated core code, and leaked implementation details.
2. **Phase 1 — slim each bundle.** We applied export-surface discipline: no `transitiveExport`, no core re-exports, `internal` visibility, and a network API/implementation split. Individual bundles shrank **44–60%**.
3. **Phase 1 wasn’t enough.** Linking multiple lean bundles still duplicated the Kotlin stdlib and shared libraries in the final app binary. Worse, the same Kotlin type exported from two frameworks became **two incompatible Swift types**.
4. **Phase 2 — one umbrella framework.** We consolidated core and all features into a single `AppKmmBundle` XCFramework. One `import`, shared types work across features, and total size dropped from **~111 MB** (sum of separate bundles) to **~58 MB**.
5. **What we’d do again.** Always optimize each module’s export surface first—that is prerequisite work. For any iOS app shipping multiple KMP features that share core types, ship an umbrella framework from the start.

## Where we started

We built a multi-feature Kotlin Multiplatform monorepo: shared core infrastructure plus independent feature modules, each packaged as its own XCFramework for the iOS app.

| Bundle | Purpose |
| --- | --- |
| `CoreBundle` | Shared utilities, logging, networking |
| `AccountMonitoringBundle` | Account / transaction monitoring |
| `DeviceSecurityBundle` | Device protection and alerts |
| `SubscriptionHubBundle` | Plans, billing, and upgrades |
| `FraudProtectionBundle` | Fraud and scam alerts |

The iOS app imported core once, then pulled in feature bundles as needed:

```swift
import CoreBundle
import AccountMonitoringBundle
import DeviceSecurityBundle
```

Modular on paper. In practice, the frameworks were far too large.

## What went wrong

Five anti-patterns showed up in every bloated bundle:

1. `transitiveExport = true` — entire dependency trees exported to iOS
2. **Core re-export** — every feature bundle duplicated networking, logging, and utilities
3. **No API/implementation split** — full HTTP client stacks shipped alongside lightweight models
4. **Public-by-default Kotlin** — mappers, DTOs, and helpers visible in Swift for no reason
5. **Missing SKIE exports** — `kotlinx-datetime` was not exported explicitly, breaking date conversions once we removed transitive exports

The symptoms were predictable: larger app downloads, slower Xcode builds, and a growing Swift surface full of types iOS never called.

## Phase 1: Slim down each bundle

Before touching architecture, we made every individual XCFramework as lean as possible. The goal: export only what Swift actually needs.

### 1. Never use `transitiveExport = true`

**Before**

```kotlin
framework {
    export(projects.feature.payments.paymentsModel)
    transitiveExport = true
}
```

**After**

```kotlin
framework {
    export(projects.feature.payments.paymentsModel)
    // defaults to false — only explicit exports ship to iOS
}
```

### 2. Don’t re-export core from feature bundles

**Before**

```kotlin
framework {
    export(projects.feature.accountMonitoring.accountMonitoringModel)
    export(projects.core.kmp)
    export(projects.core.logging)
    export(projects.core.networking)
}
```

**After**

```kotlin
framework {
    export(projects.feature.accountMonitoring.accountMonitoringModel)
    export(projects.feature.accountMonitoring.accountMonitoringNetworkApi)
}
```

### 3. Export surgically—including what SKIE needs

[SKIE](https://skie.touchlab.co/) requires explicit exports for types such as `kotlinx-datetime` to generate `Instant.toNSDate()` and similar helpers (~100 KB, high value).

```kotlin
framework {
    export(projects.feature.orders.ordersModel)
    export("org.jetbrains.kotlinx:kotlinx-datetime:0.6.1")
}
```

### 4. Separate network API from implementation

HTTP clients such as Ktor add 5–8 MB per feature. iOS needs interfaces (~50–100 KB), not the client.

```text
feature/my-feature/
  my-network-api/      ← export this
  my-network-client/   ← implementation() only
  shared-xcframework/
```

```kotlin
sourceSets {
    commonMain.dependencies {
        api(projects.feature.myFeature.myNetworkApi)
        implementation(projects.feature.myFeature.myNetworkClient)
    }
}
```

### 5. Mark non-Swift types `internal`

Mappers, repositories, DTOs, and helpers stay in Kotlin. Only domain types Swift calls are public.

### 6. Strip dead code at link time

```kotlin
linkerOpts("-dead_strip")
```

### Phase 1 results

Every bundle shrank significantly, with no breaking changes to the public Swift API.

| Bundle | Before | After Phase 1 | Reduction |
| --- | ---: | ---: | ---: |
| Account monitoring | 42.5 MB | 19.0 MB | ~55% |
| Fraud protection | 41.7 MB | 20.0 MB | ~52% |
| Subscription Hub | 36.7 MB | 14.6 MB | ~60% |
| Device security | 65.1 MB | 36.4 MB | ~44% |
| Shared core | 38.3 MB | 21.2 MB | ~45% |

### Worked example: account monitoring

**Before**

```kotlin
framework {
    export(projects.feature.accountMonitoring.accountMonitoringModel)
    export(projects.feature.accountMonitoring.accountMonitoringNetworkClient)
    export(projects.core.kmp)
    export(projects.core.logging)
    export(projects.core.networking)
    export("dev.icerock.moko:resources:0.24.5")
    export("dev.icerock.moko:graphics:0.9.0")
    transitiveExport = true
}
```

**After**

```kotlin
framework {
    export(projects.feature.accountMonitoring.accountMonitoringModel)
    export(projects.feature.accountMonitoring.accountMonitoringNetworkApi)
    export("dev.icerock.moko:resources:0.24.5")
    export("org.jetbrains.kotlinx:kotlinx-datetime:0.6.1")
}

sourceSets {
    commonMain.dependencies {
        api(projects.feature.accountMonitoring.accountMonitoringModel)
        api(projects.feature.accountMonitoring.accountMonitoringNetworkApi)
        implementation(projects.feature.accountMonitoring.accountMonitoringNetworkClient)
    }
}
```

> **Phase 1 takeaway:** Per-bundle optimization is real and worthwhile. But it solves export-surface bloat inside each framework—not duplication *across* frameworks in the final app.

## Phase 2: Consolidate into one umbrella framework

With lean individual bundles in hand, we hit three problems that per-feature optimization cannot fix.

### Problem 1: Kotlin stdlib multiplies

Each XCFramework must be self-contained. Kotlin/Native embeds the stdlib in every one. Five bundles means roughly five copies: about 3–5 MB each, or **12–20 MB** of duplicate stdlib in the app.

### Problem 2: Shared libraries duplicate

| Dependency | Core | Device sec. | Account mon. | Sub. hub |
| --- | :---: | :---: | :---: | :---: |
| kotlinx-datetime | ✓ | ✓ | ✓ | — |
| kotlinx-coroutines | — | ✓ | ✓ | — |
| moko-resources | ✓ | ✓ | ✓ | — |

Every check mark is a full binary copy in the linked app.

### Problem 3: Swift type incompatibility

The same Kotlin class exported from two frameworks becomes two different Swift types—even from identical Kotlin source.

```swift
// Separate bundles
let token: CoreBundle.TokenProvider = getToken()
securityManager.setToken(token)
// ❌ DeviceSecurityBundle.TokenProvider ≠ CoreBundle.TokenProvider
```

> **Our decision:** Ship a single umbrella XCFramework—`AppKmmBundle`—that aggregates core and all features. One stdlib, one copy of each shared library, and one Swift type per Kotlin class.

```text
┌────────────────────────────────────────────────────────────┐
│                        AppKmmBundle                        │
│                                                            │
│  core · networking · logging                               │
│  account monitoring · device security · subscription hub   │
│  fraud protection                                          │
│                                                            │
│  Single stdlib · single kotlinx-datetime · single moko     │
└────────────────────────────────────────────────────────────┘
```

*End state: one umbrella XCFramework replaces five separate bundles.*

### Umbrella configuration

```kotlin
// app-kmm-bundle-xcframework/build.gradle.kts
framework {
    export(projects.core.kmp)
    export(projects.core.networking)
    export(projects.core.logging)
    export(projects.feature.deviceSecurity.deviceSecurityModel)
    export(projects.feature.deviceSecurity.deviceSecurityNetworkApi)
    export(projects.feature.accountMonitoring.accountMonitoringModel)
    export(projects.feature.accountMonitoring.accountMonitoringNetworkApi)
    export(projects.feature.subscriptionHub.subscriptionHubModel)
    export(projects.feature.fraudProtection.fraudProtectionModel)
    export(libs.multiplatform.resources)
    export("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.1")
    export("org.jetbrains.kotlinx:kotlinx-datetime:0.6.1")
    linkerOpts("-lsqlite3")
    linkerOpts("-dead_strip")
}
```

iOS integration becomes a single import:

```swift
import AppKmmBundle

let token: TokenProvider = getToken()
securityManager.setToken(token)  // ✅ same type everywhere
```

### Phase 2 results

| Approach | Total size | Notes |
| --- | ---: | --- |
| Separate lean bundles (sum) | ~111 MB | Stdlib and shared dependencies duplicated per framework |
| **Single umbrella (`AppKmmBundle`)** | **~58 MB** | Shared binaries included once |

### What each phase solves

| Problem | Phase 1 | Phase 2 (umbrella) |
| --- | :---: | :---: |
| Transitive export bloat | ✅ | ✅ |
| Core re-export inside bundles | ✅ | ✅ |
| Internal types exposed to Swift | ✅ | ✅ |
| Kotlin stdlib duplication in app | ❌ | ✅ |
| Third-party library duplication | ❌ | ✅ |
| Cross-feature Swift type compatibility | ❌ | ✅ |

## Quick reference

### When to use separate bundles vs. an umbrella

| Scenario | Recommendation |
| --- | --- |
| iOS app uses multiple features sharing core | **Umbrella framework** |
| Features exchange shared types (tokens, configuration) | **Umbrella framework** |
| Minimizing total app binary size | **Umbrella framework** |
| App uses one isolated feature only | Per-feature bundle may suffice |
| Independent per-feature versioning required | Separate bundles (accept trade-offs) |

### Checklist for any new KMP module

- [ ] `transitiveExport` is not `true`
- [ ] Core modules are not re-exported from feature bundles
- [ ] Mappers, DTOs, repositories, and helpers are `internal`
- [ ] Network API is exported; network client uses `implementation`
- [ ] `kotlinx-datetime` is exported if public models use it
- [ ] `linkerOpts("-dead_strip")` is set
- [ ] Heavy dependencies such as Ktor use `implementation`, not `api`
- [ ] If shipping multiple features to one iOS app, use an umbrella framework

### Gradle dependency cheat sheet

| API | Use when |
| --- | --- |
| `implementation()` | Default for heavy/internal dependencies |
| `api()` | A type must be visible to module consumers |
| `export()` | A type must be visible to Swift/Objective-C |

*Adapt bundle and module names to your repository. The two-phase pattern—lean exports first, umbrella consolidation second—transfers to any multi-feature KMP/iOS setup.*
