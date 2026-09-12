---
title: "Reducing Kotlin Multiplatform XCFramework Size: From 111 MB to 58 MB"
description: "How we reduced iOS binary bloat in a multi-feature Kotlin Multiplatform architecture by minimizing exports, separating API from implementation, and shipping an umbrella XCFramework."
publishedAt: 2026-09-12
tags:
  - Kotlin Multiplatform
  - iOS
  - XCFramework
  - Build Systems
draft: false
---

We built a multi-feature Kotlin Multiplatform monorepo with shared core infrastructure and independently packaged feature modules. Each feature shipped as its own XCFramework to the iOS app.

On paper, the design was modular. In practice, the frameworks were far too large. The iOS app imported core once and pulled in features as needed:

```swift
import CoreBundle
import AccountMonitoringBundle
import DeviceSecurityBundle
```

The result was larger app downloads, slower Xcode builds, and a Swift-facing API surface full of types iOS never called.

This is the approach we used to reduce the sum of our lean feature frameworks from about 111 MB to about 58 MB in the final application.

## The starting architecture

| Bundle | Purpose |
| --- | --- |
| `CoreBundle` | Shared utilities, logging, networking |
| `AccountMonitoringBundle` | Account and transaction monitoring |
| `DeviceSecurityBundle` | Device protection and alerts |
| `SubscriptionHubBundle` | Plans, billing, and upgrades |
| `FraudProtectionBundle` | Fraud and scam alerts |

Five recurring anti-patterns were responsible for most of the bloat:

- `transitiveExport = true` exported complete dependency trees to iOS.
- Feature bundles re-exported shared core modules they did not need to expose.
- Networking implementations, including HTTP clients, crossed the Swift boundary.
- Internal Kotlin types became public framework surface area.
- Shared dependencies were bundled repeatedly across independently linked frameworks.

## Phase 1: Make every framework lean

Before changing the packaging model, we reduced each individual XCFramework to the smallest export surface that Swift genuinely needed.

### Stop exporting transitively

`transitiveExport = true` feels convenient, but it exports an entire dependency tree. Start with explicit exports instead.

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
    // false is the default: only explicit exports cross to iOS
}
```

### Do not re-export core by default

A feature framework should export its public domain model and its Swift-facing contracts—not all of core.

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

### Export contracts, not HTTP clients

HTTP clients such as Ktor can add roughly 5–8 MB to a feature framework. iOS generally needs a small interface or contract, not the client implementation.

```text
feature/my-feature/
├── my-network-api/       # Export this
├── my-network-client/    # Keep implementation-only
└── shared-xcframework/
```

```kotlin
sourceSets {
    commonMain.dependencies {
        api(projects.feature.myFeature.myNetworkApi)
        implementation(projects.feature.myFeature.myNetworkClient)
    }
}
```

### Keep implementation types internal

Mappers, repositories, DTOs, and helpers stay in Kotlin unless Swift directly calls them. `internal` visibility is a useful guardrail: it makes the intended interop surface explicit and keeps implementation details out of generated framework headers.

### Export required interop dependencies explicitly

Removing transitive exports can reveal a real public dependency. For example, if public models use `kotlinx-datetime`, SKIE needs an explicit export to generate helpers such as `Instant.toNSDate()`. The additional size is small—about 100 KB in this case—and justified by the public API.

```kotlin
framework {
    export(projects.feature.orders.ordersModel)
    export("org.jetbrains.kotlinx:kotlinx-datetime:0.6.1")
}
```

We also enabled dead stripping:

```kotlin
linkerOpts("-dead_strip")
```

## Phase 1 results

Every bundle became materially smaller without breaking the intended public Swift API.

| Bundle | Before | After phase 1 | Reduction |
| --- | ---: | ---: | ---: |
| Account monitoring | 42.5 MB | 19.0 MB | ~55% |
| Fraud protection | 41.7 MB | 20.0 MB | ~52% |
| Subscription Hub | 36.7 MB | 14.6 MB | ~60% |
| Device security | 65.1 MB | 36.4 MB | ~44% |
| Shared core | 38.3 MB | 21.2 MB | ~45% |

The important limitation: per-framework optimization solves export-surface bloat inside each framework. It does not eliminate duplication across frameworks in the final iOS app.

## Phase 2: Remove cross-framework duplication

After trimming each bundle, three problems remained.

### Kotlin and shared libraries were duplicated

Every standalone XCFramework must be self-contained. That means Kotlin/Native can embed the standard library in every framework. With five bundles, the final app can carry multiple copies of the same runtime and shared libraries.

| Dependency | Core | Device security | Account monitoring | Subscription Hub |
| --- | :---: | :---: | :---: | :---: |
| `kotlinx-datetime` | ✓ | ✓ | ✓ | — |
| `kotlinx-coroutines` | — | ✓ | ✓ | — |
| `moko-resources` | ✓ | ✓ | ✓ | — |

Each check mark can represent another full binary copy in the linked application.

### Swift type identity broke across framework boundaries

The same Kotlin class exported from two frameworks becomes two distinct Swift types—even if they originated from identical Kotlin source.

```swift
let token: CoreBundle.TokenProvider = getToken()
securityManager.setToken(token)
// DeviceSecurityBundle.TokenProvider is a different Swift type
```

### The umbrella framework

We moved to a single umbrella XCFramework, `AppKmmBundle`, that aggregates core and feature modules. This gives the app one Kotlin runtime, one copy of shared dependencies, and one Swift type for each exported Kotlin class.

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

iOS integration then becomes one import:

```swift
import AppKmmBundle

let token: TokenProvider = getToken()
securityManager.setToken(token)
```

## The outcome

| Approach | Total size | Notes |
| --- | ---: | --- |
| Separate lean bundles, summed | ~111 MB | Kotlin runtime and shared dependencies are duplicated per framework |
| Single `AppKmmBundle` umbrella | ~58 MB | Shared binaries are linked once |

| Problem | Lean individual bundles | Umbrella framework |
| --- | :---: | :---: |
| Transitive export bloat | ✓ | ✓ |
| Unnecessary core re-exports | ✓ | ✓ |
| Internal types exposed to Swift | ✓ | ✓ |
| Kotlin standard-library duplication | — | ✓ |
| Third-party dependency duplication | — | ✓ |
| Cross-feature Swift type compatibility | — | ✓ |

## Choosing a packaging model

| Scenario | Recommendation |
| --- | --- |
| The iOS app uses multiple features that share core infrastructure | Use an umbrella framework |
| Features exchange shared types such as tokens or configuration | Use an umbrella framework |
| Minimizing total app binary size is a priority | Use an umbrella framework |
| The app uses only one isolated feature | A per-feature XCFramework can be sufficient |
| Independent feature versioning is required | Separate frameworks can work, with the trade-offs accepted |

## Practical checklist

- Keep `transitiveExport` disabled.
- Make the Swift-facing API deliberate: export only public models and contracts.
- Use `implementation()` by default for heavy or internal dependencies.
- Use `api()` when a type must be visible to Kotlin module consumers.
- Use `export()` only when a type must be visible to Swift or Objective-C.
- Export interop dependencies such as `kotlinx-datetime` when public API types require them.
- Keep mappers, repositories, DTOs, and helpers `internal` unless Swift must use them.
- Enable `linkerOpts("-dead_strip")`.
- Use an umbrella XCFramework when several iOS-consumed features share runtime dependencies or domain types.

The core lesson is simple: a modular Kotlin Multiplatform codebase does not have to mean a fragmented iOS binary. First make every framework honest about its Swift API. Then, when features share runtime code and types, package them together so the final app pays for shared infrastructure only once.
