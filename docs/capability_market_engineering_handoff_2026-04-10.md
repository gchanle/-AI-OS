# Capability Market Engineering Handoff

Date: 2026-04-10

## What this prototype is

The current `能力市场` is a local prototype that demonstrates one product idea:

1. Admin reviews and publishes `Skill / MCP`
2. End users browse the approved catalog
3. Users install and enable the abilities they want
4. Firefly only sees the user-enabled subset at runtime

This is not yet a real production integration layer.

The current codebase mixes:

- local mock definitions
- local storage install state
- package-like markdown artifacts
- partial real endpoint experiments

So the right engineering handoff is not “please continue polishing this page”.
It should be “please re-implement this as a three-layer capability delivery system”.

## Recommended product boundary

Keep only three concepts in the production design:

1. Supply side
Admin uploads, validates, reviews, and publishes `Skill / MCP`.

2. Consumption side
User browses market catalog, installs, uninstalls, enables, and disables abilities.

3. Runtime side
Firefly resolves tools from the user-enabled ability set instead of the platform-global set.

Everything else should be treated as implementation detail, not a first-level product concept.

Examples of concepts that should stay internal:

- package markdown generation
- connector binding details
- local mock runtime health
- prototype-only storage strategy
- tool source kind mapping

## Recommended system split for engineering

### A. Capability Registry Service

Owns the admin-side source of truth.

Core responsibilities:

- create and update capability definitions
- validate schema and artifact completeness
- review and publish workflow
- publish market-visible catalog
- record version and audit history

Core entities:

- `Capability`
- `CapabilityVersion`
- `CapabilityReview`
- `CapabilityPublishState`

### B. User Capability Service

Owns user-side install and enable state.

Core responsibilities:

- install ability for a user
- uninstall ability for a user
- enable or disable ability for runtime use
- query “my installed abilities”

Core entities:

- `UserCapabilityInstall`
- `UserCapabilityRuntimePreference`

### C. Firefly Capability Resolver

Owns runtime authorization and tool exposure.

Core responsibilities:

- load published catalog
- load user-enabled installs
- map abilities to actual runtime tools
- filter inaccessible tools before planning and execution

This layer should not decide publish status by itself.
It should only consume upstream states.

## State model that engineering should use

For admin publish lifecycle:

- `draft`
- `review`
- `listed`
- `limited`
- `private`
- `archived`

For runtime readiness:

- `design`
- `pilot`
- `ready`
- `paused`
- `invalid`

Important rule:

`publish state` and `runtime state` must remain separate.

Example:

- an MCP can be `pilot + limited`
- an MCP can be `ready + listed`
- an MCP can be `ready + private`
- an MCP can be `paused + listed`, but marketplace should hide it from new installs

## What is local-only today

These parts are still prototype behavior and should not be directly inherited into production:

- user install state in `localStorage`
- local definition catalogs in `data/skills.js` and `data/mcp.js`
- markdown package files used as pseudo-artifacts
- direct coupling between page rendering and mock registry state
- partial real MCP experiments mixed into the same registry

## What engineering should connect for real

Production implementation needs four real backends or adapters:

1. Admin capability registry API
2. User install state API
3. Firefly runtime capability resolution API
4. External system integration adapters

The external system integration adapters should be isolated behind runtime contracts.
The market itself should not directly care whether a capability is backed by:

- MCP
- internal service
- connector
- proxy
- browser automation

## Frontend pages that should remain

Frontend should keep only:

1. `能力市场`
Catalog of approved and publishable abilities.

2. `我的能力`
Installed abilities and enable-disable state.

3. `后台能力治理`
Admin review and publish console.

The following should not be mixed into the end-user market page:

- runtime observability
- connector low-level config
- raw protocol diagnostics
- package artifact maintenance

## Short-term engineering milestone plan

### Milestone 1

Freeze the product contract.

- define admin publish states
- define user install states
- define runtime resolution contract
- define Firefly capability filtering rules

### Milestone 2

Replace local storage and mock registry.

- admin catalog from backend API
- user installs from backend API
- runtime filter from backend snapshot

### Milestone 3

Move real integrations behind adapters.

- service hall
- approvals
- messages
- library
- future teaching systems

### Milestone 4

Separate prototype-only tooling.

- remove mock package generation from production path
- move validation tools to admin-only pipeline
- keep experimental integrations behind feature flags

## Current code references

Marketplace page:

- `components/CapabilityMarketplaceCenter.js`
- `components/CapabilityMarketplaceCenter.css`

Current local market state:

- `data/capabilityMarket.js`

Current local admin definitions:

- `data/skills.js`
- `data/mcp.js`

Current runtime filtering:

- `services/fireflyToolRegistry.js`
- `components/ChatArea.js`
- `components/FireflySideDrawer.js`

## Recommendation for handoff message

When handing this to engineering, use this sentence:

“当前仓库里的能力市场是产品原型，不是生产接入层；请按‘管理员供给侧、用户安装侧、Firefly 运行时解析层’三层重构，不要直接把本地 mock 状态和页面逻辑当成最终架构。” 
