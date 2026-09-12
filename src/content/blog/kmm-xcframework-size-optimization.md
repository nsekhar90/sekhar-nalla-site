---
title: "Shrinking Kotlin Multiplatform XCFrameworks"
description: "How we cut per-feature bundles in half—then consolidated core and features into one lean umbrella XCFramework for iOS."
publishedAt: 2026-09-12
tags: ["Kotlin Multiplatform", "iOS", "KMP", "Mobile Architecture", "Performance"]
draft: false
---

<div class="kmm-guide">
  <figure class="diagram-wrap">
    <svg class="arch-diagram" viewBox="0 0 720 340" width="720" height="340" role="img" aria-label="KMM Feature SDKs branching into Core Infrastructure and four feature modules">
      <defs>
        <filter id="kmm-architecture-shadow" x="-4%" y="-4%" width="108%" height="112%"><feDropShadow dx="2" dy="2" stdDeviation="3" flood-opacity="0.15" /></filter>
        <marker id="kmm-architecture-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#333" /></marker>
      </defs>
      <rect x="20" y="130" width="200" height="80" rx="4" fill="#4a90e2" filter="url(#kmm-architecture-shadow)" />
      <text x="120" y="162" text-anchor="middle" fill="#fff" font-family="monospace" font-size="15" font-weight="600">KMM Feature</text>
      <text x="120" y="182" text-anchor="middle" fill="#fff" font-family="monospace" font-size="15" font-weight="600">SDKs</text>
      <path d="M 220 148 C 300 148, 320 58, 400 58" fill="none" stroke="#333" stroke-width="2" marker-end="url(#kmm-architecture-arrow)" />
      <path d="M 220 158 C 310 158, 330 118, 400 118" fill="none" stroke="#333" stroke-width="2" marker-end="url(#kmm-architecture-arrow)" />
      <path d="M 220 170 L 400 170" fill="none" stroke="#333" stroke-width="2" marker-end="url(#kmm-architecture-arrow)" />
      <path d="M 220 182 C 310 182, 330 222, 400 222" fill="none" stroke="#333" stroke-width="2" marker-end="url(#kmm-architecture-arrow)" />
      <path d="M 220 192 C 300 192, 320 282, 400 282" fill="none" stroke="#333" stroke-width="2" marker-end="url(#kmm-architecture-arrow)" />
      <rect x="400" y="30" width="280" height="56" rx="4" fill="#7ed321" filter="url(#kmm-architecture-shadow)" /><text x="540" y="64" text-anchor="middle" fill="#1a1a2e" font-family="monospace" font-size="16" font-weight="600">Core Infrastructure</text>
      <rect x="400" y="96" width="280" height="44" rx="4" fill="#f5a623" filter="url(#kmm-architecture-shadow)" /><text x="540" y="124" text-anchor="middle" fill="#1a1a2e" font-family="monospace" font-size="15" font-weight="600">Account Monitoring</text>
      <rect x="400" y="152" width="280" height="44" rx="4" fill="#f5a623" filter="url(#kmm-architecture-shadow)" /><text x="540" y="180" text-anchor="middle" fill="#1a1a2e" font-family="monospace" font-size="15" font-weight="600">Device Security</text>
      <rect x="400" y="208" width="280" height="44" rx="4" fill="#f5a623" filter="url(#kmm-architecture-shadow)" /><text x="540" y="236" text-anchor="middle" fill="#1a1a2e" font-family="monospace" font-size="15" font-weight="600">Subscription Hub</text>
      <rect x="400" y="264" width="280" height="44" rx="4" fill="#f5a623" filter="url(#kmm-architecture-shadow)" /><text x="540" y="292" text-anchor="middle" fill="#1a1a2e" font-family="monospace" font-size="15" font-weight="600">Fraud Protection</text>
    </svg>
    <figcaption>Our starting point: a modular KMP monorepo with one XCFramework per feature.</figcaption>
  </figure>

  <div class="tldr">
    <h2>TL;DR</h2>
    <ol>
      <li><strong>The problem.</strong> Our iOS app consumed separate XCFrameworks per feature (account monitoring, device security, subscription hub, fraud protection, plus a shared core). Each bundle was 35–65&nbsp;MB — bloated by transitive exports, duplicated core code, and leaked implementation details.</li>
      <li><strong>Phase 1 — slim each bundle.</strong> We applied export-surface discipline: no <code>transitiveExport</code>, no core re-exports, <code>internal</code> visibility, network API/impl split. Individual bundles shrank <strong>44–60%</strong>.</li>
      <li><strong>Phase 1 wasn't enough.</strong> Linking multiple lean bundles still duplicated the Kotlin stdlib and shared libraries in the final app binary. Worse, the same Kotlin type exported from two frameworks became <strong>two incompatible Swift types</strong>.</li>
      <li><strong>Phase 2 — one umbrella framework.</strong> We consolidated core + all features into a single <code>AppKmmBundle</code> XCFramework. One <code>import</code>, shared types work across features, and total size dropped from <strong>~111&nbsp;MB</strong> to <strong>~58&nbsp;MB</strong>.</li>
      <li><strong>What we'd do again.</strong> Always optimize each module's export surface first — that's prerequisite work. For any iOS app shipping multiple KMP features that share core types, ship an umbrella framework from the start.</li>
    </ol>
  </div>

  <h2 class="section">Where we started</h2>
  <p>We built a multi-feature Kotlin Multiplatform monorepo: shared core infrastructure plus independent feature modules, each packaged as its own XCFramework for the iOS app.</p>
  <div class="table-wrap"><table><thead><tr><th>Bundle</th><th>Purpose</th></tr></thead><tbody>
    <tr><td><code>CoreBundle</code></td><td>Shared utilities, logging, networking</td></tr><tr><td><code>AccountMonitoringBundle</code></td><td>Account / transaction monitoring</td></tr><tr><td><code>DeviceSecurityBundle</code></td><td>Device protection and alerts</td></tr><tr><td><code>SubscriptionHubBundle</code></td><td>Plans, billing, and upgrades</td></tr><tr><td><code>FraudProtectionBundle</code></td><td>Fraud and scam alerts</td></tr>
  </tbody></table></div>
  <p>The iOS app imported core once, then pulled in feature bundles as needed:</p>
  <pre><code class="language-swift">import CoreBundle
import AccountMonitoringBundle
import DeviceSecurityBundle</code></pre>
  <p>Modular on paper. In practice, the frameworks were far too large.</p>

  <h2 class="section">What went wrong</h2>
  <p>Five anti-patterns showed up in every bloated bundle:</p>
  <ol><li><code>transitiveExport = true</code> — entire dependency trees exported to iOS</li><li><strong>Core re-export</strong> — every feature bundle duplicated networking, logging, and utils</li><li><strong>No API/impl split</strong> — full HTTP client stacks shipped alongside lightweight models</li><li><strong>Public-by-default Kotlin</strong> — mappers, DTOs, and helpers visible in Swift for no reason</li><li><strong>Missing SKIE exports</strong> — <code>kotlinx-datetime</code> not exported explicitly, breaking date conversions once transitive exports were removed</li></ol>
  <p>The symptoms were predictable: larger app downloads, slower Xcode builds, and a growing Swift surface full of types iOS never called.</p>

  <div class="phase-header"><span class="phase-badge p1">Phase 1</span><h2>Slim down each bundle</h2></div>
  <p>Before touching architecture, we made every individual XCFramework as lean as possible. The goal: export only what Swift actually needs.</p>
  <div class="strategy"><h3>1. Never use <code>transitiveExport = true</code></h3><p class="label-bad">Before</p><pre><code class="language-kotlin">framework {
    export(projects.feature.payments.paymentsModel)
    transitiveExport = true
}</code></pre><p class="label-good">After</p><pre><code class="language-kotlin">framework {
    export(projects.feature.payments.paymentsModel)
    // defaults to false — only explicit exports ship to iOS
}</code></pre></div>
  <div class="strategy"><h3>2. Don't re-export core from feature bundles</h3><p class="label-bad">Before</p><pre><code class="language-kotlin">framework {
    export(projects.feature.accountMonitoring.accountMonitoringModel)
    export(projects.core.kmp)
    export(projects.core.logging)
    export(projects.core.networking)
}</code></pre><p class="label-good">After</p><pre><code class="language-kotlin">framework {
    export(projects.feature.accountMonitoring.accountMonitoringModel)
    export(projects.feature.accountMonitoring.accountMonitoringNetworkApi)
}</code></pre></div>
  <div class="strategy"><h3>3. Export surgically — including what SKIE needs</h3><p><a href="https://skie.touchlab.co/">SKIE</a> requires explicit exports for types like <code>kotlinx-datetime</code> to generate <code>Instant.toNSDate()</code> and similar helpers (~100 KB, high value).</p><pre><code class="language-kotlin">framework {
    export(projects.feature.orders.ordersModel)
    export("org.jetbrains.kotlinx:kotlinx-datetime:0.6.1")
}</code></pre></div>
  <div class="strategy"><h3>4. Separate network API from implementation</h3><p>HTTP clients (Ktor) add 5–8 MB per feature. iOS needs interfaces (~50–100 KB), not the client.</p><pre><code>feature/my-feature/
  my-network-api/      ← export this
  my-network-client/   ← implementation() only
  shared-xcframework/</code></pre><pre><code class="language-kotlin">sourceSets {
    commonMain.dependencies {
        api(projects.feature.myFeature.myNetworkApi)
        implementation(projects.feature.myFeature.myNetworkClient)
    }
}</code></pre></div>
  <div class="strategy"><h3>5. Mark non-Swift types <code>internal</code></h3><p>Mappers, repositories, DTOs, and helpers stay in Kotlin. Only domain types Swift calls are public.</p></div>
  <div class="strategy"><h3>6. Strip dead code at link time</h3><pre><code class="language-kotlin">linkerOpts("-dead_strip")</code></pre></div>
  <h3>Phase 1 results</h3><p>Every bundle shrank significantly. No breaking changes to the public Swift API.</p>
  <div class="table-wrap"><table><thead><tr><th>Bundle</th><th>Before</th><th>After Phase 1</th><th>Reduction</th></tr></thead><tbody><tr><td>Account monitoring</td><td>42.5 MB</td><td>19.0 MB</td><td>~55%</td></tr><tr><td>Fraud protection</td><td>41.7 MB</td><td>20.0 MB</td><td>~52%</td></tr><tr><td>Subscription Hub</td><td>36.7 MB</td><td>14.6 MB</td><td>~60%</td></tr><tr><td>Device security</td><td>65.1 MB</td><td>36.4 MB</td><td>~44%</td></tr><tr><td>Shared core</td><td>38.3 MB</td><td>21.2 MB</td><td>~45%</td></tr></tbody></table></div>
  <h3>Worked example: account monitoring</h3><p class="label-bad">Before</p><pre><code class="language-kotlin">framework {
    export(projects.feature.accountMonitoring.accountMonitoringModel)
    export(projects.feature.accountMonitoring.accountMonitoringNetworkClient)
    export(projects.core.kmp)
    export(projects.core.logging)
    export(projects.core.networking)
    export("dev.icerock.moko:resources:0.24.5")
    export("dev.icerock.moko:graphics:0.9.0")
    transitiveExport = true
}</code></pre><p class="label-good">After</p><pre><code class="language-kotlin">framework {
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
}</code></pre>
  <div class="callout p1"><p><strong>Phase 1 takeaway:</strong> Per-bundle optimization is real and worthwhile. But it solves export-surface bloat inside each framework — not duplication <em>across</em> frameworks in the final app.</p></div>

  <div class="phase-header"><span class="phase-badge p2">Phase 2</span><h2>Consolidate into one umbrella framework</h2></div>
  <p>With lean individual bundles in hand, we hit three problems that per-feature optimization cannot fix.</p>
  <h3>Problem 1: Kotlin stdlib multiplies</h3><p>Each XCFramework must be self-contained. Kotlin/Native embeds the stdlib in every one. Five bundles ≈ five copies (~3–5 MB each → <strong>12–20 MB</strong> of duplicate stdlib in the app).</p>
  <h3>Problem 2: Shared libraries duplicate</h3><div class="table-wrap"><table><thead><tr><th>Dependency</th><th>Core</th><th>Device sec.</th><th>Account mon.</th><th>Sub. hub</th></tr></thead><tbody><tr><td>kotlinx-datetime</td><td>✓</td><td>✓</td><td>✓</td><td>—</td></tr><tr><td>kotlinx-coroutines</td><td>—</td><td>✓</td><td>✓</td><td>—</td></tr><tr><td>moko-resources</td><td>✓</td><td>✓</td><td>✓</td><td>—</td></tr></tbody></table></div><p>Every ✓ is a full binary copy in the linked app.</p>
  <h3>Problem 3: Swift type incompatibility</h3><p>The same Kotlin class exported from two frameworks becomes two different Swift types — even from identical Kotlin source.</p><pre><code class="language-swift">// Separate bundles
let token: CoreBundle.TokenProvider = getToken()
securityManager.setToken(token)
// ❌ DeviceSecurityBundle.TokenProvider ≠ CoreBundle.TokenProvider</code></pre>
  <div class="callout p2"><p><strong>Our decision:</strong> Ship a single umbrella XCFramework — <code>AppKmmBundle</code> — that aggregates core + all features. One stdlib, one copy of each shared library, one Swift type per Kotlin class.</p></div>
  <figure class="diagram-wrap"><pre class="ascii"><code>┌────────────────────────────────────────────────────────────┐
│                      AppKmmBundle                          │
│                                                            │
│   core · networking · logging                              │
│   account monitoring · device security · subscription hub  │
│   fraud protection                                         │
│                                                            │
│   Single stdlib · single kotlinx-datetime · single moko    │
└────────────────────────────────────────────────────────────┘</code></pre><figcaption>End state: one umbrella XCFramework replaces five separate bundles.</figcaption></figure>
  <h3>Umbrella configuration</h3><pre><code class="language-kotlin">// app-kmm-bundle-xcframework/build.gradle.kts
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
}</code></pre>
  <p>iOS integration becomes a single import:</p><pre><code class="language-swift">import AppKmmBundle

let token: TokenProvider = getToken()
securityManager.setToken(token)  // ✅ same type everywhere</code></pre>
  <h3>Phase 2 results</h3><div class="table-wrap"><table><thead><tr><th>Approach</th><th>Total size</th><th>Notes</th></tr></thead><tbody><tr><td>Separate lean bundles (sum)</td><td>~111 MB</td><td>Stdlib + shared deps duplicated per framework</td></tr><tr><td><strong>Single umbrella (<code>AppKmmBundle</code>)</strong></td><td><strong>~58 MB</strong></td><td>Shared binaries included once</td></tr></tbody></table></div>
  <h3>What each phase solves</h3><div class="table-wrap"><table><thead><tr><th>Problem</th><th>Phase 1</th><th>Phase 2 (umbrella)</th></tr></thead><tbody><tr><td>Transitive export bloat</td><td>✅</td><td>✅</td></tr><tr><td>Core re-export inside bundles</td><td>✅</td><td>✅</td></tr><tr><td>Internal types exposed to Swift</td><td>✅</td><td>✅</td></tr><tr><td>Kotlin stdlib duplication in app</td><td>❌</td><td>✅</td></tr><tr><td>Third-party library duplication</td><td>❌</td><td>✅</td></tr><tr><td>Cross-feature Swift type compatibility</td><td>❌</td><td>✅</td></tr></tbody></table></div>

  <div class="ref-section"><h2 class="section">Quick reference</h2><h3>When to use separate bundles vs umbrella</h3><div class="table-wrap"><table><thead><tr><th>Scenario</th><th>Recommendation</th></tr></thead><tbody><tr><td>iOS app uses multiple features sharing core</td><td><strong>Umbrella framework</strong></td></tr><tr><td>Features exchange shared types (tokens, config)</td><td><strong>Umbrella framework</strong></td></tr><tr><td>Minimizing total app binary size</td><td><strong>Umbrella framework</strong></td></tr><tr><td>App uses one isolated feature only</td><td>Per-feature bundle may suffice</td></tr><tr><td>Independent per-feature versioning required</td><td>Separate bundles (accept trade-offs)</td></tr></tbody></table></div>
  <h3>Checklist for any new KMP module</h3><ul class="checklist"><li><code>transitiveExport</code> is not <code>true</code></li><li>Core modules are not re-exported from feature bundles</li><li>Mappers, DTOs, repositories, and helpers are <code>internal</code></li><li>Network API exported; network client is <code>implementation</code></li><li><code>kotlinx-datetime</code> exported if public models use it</li><li><code>linkerOpts("-dead_strip")</code> is set</li><li>Heavy deps (Ktor, etc.) use <code>implementation</code>, not <code>api</code></li><li>If shipping multiple features to one iOS app → umbrella framework</li></ul>
  <h3>Gradle dependency cheat sheet</h3><div class="table-wrap"><table><thead><tr><th>API</th><th>Use when</th></tr></thead><tbody><tr><td><code>implementation()</code></td><td>Default for heavy/internal deps</td></tr><tr><td><code>api()</code></td><td>Type must be visible to module consumers</td></tr><tr><td><code>export()</code></td><td>Type must be visible to Swift/ObjC</td></tr></tbody></table></div></div>
  <footer>Adapt bundle and module names to your repo. The two-phase pattern — lean exports first, umbrella consolidation second — transfers to any multi-feature KMP/iOS setup.</footer>
</div>
