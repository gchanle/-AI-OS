# Project Recovery Brief

Updated: 2026-03-26

## Current Snapshot

- Workspace: `ai-campus`
- Branch: `codex/campus-os-refresh`
- Working tree: clean
- Build status: `npm run build` passes
- Local runtime status checked on 2026-03-26:
  - `http://localhost:3000`: not running
  - `PaperHelper` local service: retired, no longer recommended for this project

## Product Framing

This project is no longer just a chat UI. The direction that has emerged over the last few days is:

- company brand: `超星`
- top-level concept: `超星 AI 校园 OS`
- assistant/workspace name: `萤火虫`
- product style: restrained B-end workspace, not a pure C-end chat window

The current structure reflects that direction:

- persistent left sidebar for task/history/workspace context
- main workspace that can switch between `工作台` and `对话`
- external system shells for major campus capability areas
- right sidebar for personal space in classic mode

## Recent Milestones

### 2026-03-24

- `7a7c3cd` `snapshot: pre-codex-ui-refresh`
  - baseline before the Codex refresh work

- `63e0901` `checkpoint: campus os refresh preview`
  - first major UI refresh toward Campus OS

- `b25ac32` `checkpoint: campus os capabilities and model controls`
  - capability configuration
  - model selection groundwork
  - shared workspace config

- `a842a59` `checkpoint: pre-shell-polish round`
  - stabilization checkpoint before external system shell polish

- `02a2023` `checkpoint: workspace shell polish`
  - unified external workspace shell
  - shell loading behavior
  - AI 办事 / AI 科研 / AI 助教 / AI 智能体 shell alignment

### 2026-03-26

- `7c30971` `checkpoint: dialogue mode and brand assets`
  - brand asset integration
  - dialogue/minimal mode
  - richer Firefly workspace interactions
  - added `OperationPanel`

- `b68e8d2` `checkpoint: firefly search library and paperhelper`
  - Firefly strategy docs
  - AI 图书馆 page
  - initial PaperHelper integration track

- `13c8b32` `checkpoint: vendor paperhelper source`
  - brought PaperHelper source into the repo

- `db21cb3` `checkpoint: add paperhelper source files`
  - PaperHelper source files committed into `integrations/PaperHelper`

- `e8e4d3d` `checkpoint: library alignment and research switcher`
  - AI 图书馆 layout refinement
  - research switcher iteration

- `7b308c0` `checkpoint: fix paperhelper boot and research header layout`
  - PaperHelper boot fixes
  - research header cleanup

- `f8badff` `checkpoint: research platform rollback and analysis`
  - rolled `AI 科研` back to the WenDao shell as the visible platform
  - documented why PaperHelper should be treated as an internal capability, not the public research hall

## Current Functional State

### 1. Firefly Home Workspace

Core file:

- `app/page.js`

Current behavior:

- supports `工作台` and `对话` modes
- persists workspace preferences in local storage
- remembers:
  - selected capabilities
  - preferred model
  - workspace mode
  - web search toggle
  - deep research toggle
- accepts handoff from library through `firefly_prompt` and `firefly_caps`

### 2. Landing / Composer Experience

Core file:

- `components/LandingView.js`

Current behavior:

- classic landing mode and minimal mode both exist
- model picker is already surfaced on the outer landing layer
- capability selection exists
- web search and deep research toggles exist in minimal mode
- voice input scaffold exists through browser speech recognition

### 3. Chat Workspace

Core file:

- `components/ChatArea.js`

Current behavior:

- supports session restore from local storage
- persists model and capability metadata into chat history
- supports:
  - model switching
  - capability toggling
  - web search
  - deep research
  - speech input scaffolding
- sends chat requests through `app/api/chat/route.js`
- extracts tasks through `app/api/extract-tasks/route.js`

### 4. Capability and Model Layer

Core files:

- `data/workspace.js`
- `app/api/models/route.js`

Current state:

- capability map includes:
- AI 办事
- AI 科研
- AI 助教
- AI 图书馆
- AI 智能体
- model candidate list currently includes:
  - `firefly-general-demo`
  - `firefly-knowledge-demo`
  - `firefly-reasoner-demo`
  - `firefly-coder-demo`
  - `firefly-lite-demo`
- `/api/models` dynamically probes availability against the configured DashScope-compatible endpoint and caches the supported list

### 5. External System Shell

Core file:

- `components/ExternalWorkspaceShell.js`

Current behavior:

- shared shell for:
  - `AI 办事`
  - `AI 科研`
  - `AI 助教`
  - `AI 智能体`
- supports:
  - embed mode
  - current-window open mode
  - new-tab open mode
- remembers loaded tabs in session storage to reduce repeated loading banners
- shows a first-time open-mode hint
- provides a dismissible inline loading banner instead of a large blocking overlay

### 6. AI 图书馆

Core files:

- `app/library/page.js`
- `data/library.js`

Current behavior:

- library is now a native in-product workspace, not just an iframe shell
- includes:
  - intelligent search
  - recommendation plaza
  - reading mode
  - personal space
  - Firefly handoff actions
  - reading notes persisted to local storage

This is currently one of the strongest and most productized parts of the project.

### 7. AI 科研

Core files:

- `app/research/page.js`
- `docs/research_platform_evaluation.md`

Current product decision:

- public-facing `AI 科研` currently stays on `闻道科研大厅`
- third-party research platform switching is intentionally held back
- `PaperHelper` evaluation path has been retired and is no longer part of the current product direction

Reason:

- it is useful for reading/QA/citation workflows
- but it does not match the product ambition of a true research workspace like Bohrium

## Documents Worth Reusing

- `docs/firefly_system_integration_strategy.md`
  - best current summary of how Firefly should connect to campus systems

- `docs/research_platform_evaluation.md`
  - archived summary of why the `PaperHelper` path was evaluated and then retired

## Brand / Asset State

Current brand assets in repo:

- `public/chaoxing-logo-wordmark.png`
- `public/chaoxing-logo-mark.svg`
- `public/user-avatar.png`

Navbar is currently wired to the wordmark image.

## What Is Most Likely Still In Progress

These were recurring threads across the recent work and may still need further iteration:

- continued polish of the Firefly dialogue UI
- continued refinement of the external system shell interaction details
- deciding how much of research should stay external vs. become native product surfaces
- deeper Firefly-to-system adapter design beyond static shell embedding
- clarifying the long-term native strategy for `AI 科研`

## Recommended Next Resume Points

If resuming work in a new thread, the highest-value next entry points are:

1. Read this file first.
2. Read `docs/firefly_system_integration_strategy.md`.
3. Read `docs/research_platform_evaluation.md`.
4. Inspect `app/page.js`, `components/LandingView.js`, `components/ChatArea.js`, and `components/ExternalWorkspaceShell.js`.
5. Decide whether the next task is:
   - dialogue/workspace polish
   - system integration architecture
   - research platform strategy
   - native `AI 科研` product design
