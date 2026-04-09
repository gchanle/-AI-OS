# Codex Key Migration Checkpoint - 2026-04-01

## Purpose

This file preserves the latest implementation state, product decisions, and debugging outcomes before the Codex key migration.

If the current Codex thread is lost, the next session should read this file first, then optionally also read:

- `docs/codex_handoff_2026-04-01_approval_message_integration.md`

This newer file supersedes that earlier handoff for the most recent changes.

## Current product state

The project already has live Chaoxing integrations for:

- Study unread messages
- Approval todo data
- Approval record data

These data are currently integrated into:

- Right sidebar personal space
- Firefly/chat context injection
- Richer chat rendering
- Morning digest assembly

## Architecture direction confirmed with user

Current recommendation and implementation direction:

- Layer 1: connectors/adapters
- Layer 2: domain services
- Layer 3: skills / task orchestration
- Layer 4: MCP only after interfaces become stable and worth standardizing

Important clarification:

- Current unread message / approval integration is **not** MCP runtime integration
- Current unread message / approval integration is also **not** true skill runtime orchestration
- Current implementation is best described as direct connector/adapter + app service integration

This direction was explicitly preferred because more data sources are expected later, and over-abstracting too early would make the product harder to extend.

## What is working now

### 0. Firefly Agent Runtime v1

This was added after the earlier handoff and is now the new core direction for Firefly.

Implemented:

- task model
- planner
- skill registry
- executor
- execution logs
- task local persistence
- message-center/write-back through existing Firefly completion notifications
- agent-first / chat-fallback behavior in `FireflySideDrawer`

Current runtime behavior:

- Firefly first calls a new internal route:
  - `POST /api/firefly/agent`
- if a question matches an executable skill:
  - Firefly creates a task
  - planner selects one or more skills
  - executor runs them
  - results are returned as structured Markdown
  - the task is persisted locally
  - the reply is written back into the current Firefly thread
  - completion still flows into message center via existing Firefly notification logic
- if no skill matches:
  - Firefly falls back to the original `/api/chat` general conversation path

Current v1 runtime modules:

- `services/fireflyTaskService.js`
- `services/fireflyPlannerService.js`
- `services/fireflySkillRegistry.js`
- `services/fireflyExecutorService.js`
- `services/fireflyAgentService.js`
- `app/api/firefly/agent/route.js`
- `data/fireflyTasks.js`

Current v1 executable skills:

- `message_unread_summary`
- `approval_center_overview`
- `library_reading_companion`

Important note:

- approval realtime API is currently environment-dependent and may be blocked by source IP
- approval skill therefore now has a degradation path:
  - if realtime approval fetch fails
  - but `approvalSummary` already exists in current Firefly context
  - runtime will still complete using the in-session approval summary instead of fully failing

This means:

- message skill can work directly from realtime service
- library skill works directly from current page context
- approval skill works either from realtime service or from preloaded context summary

### 1. Unread study messages

Implemented and verified:

- AES auth payload generation
- Chaoxing `createToken`
- unread message fetch
- message center sync
- Firefly recall / context injection

Key files:

- `lib/chaoxingAuth.js`
- `lib/chaoxingMessages.js`
- `services/messageService.js`
- `app/api/messages/study-unread/route.js`
- `data/messageCenter.js`

### 2. Approval todo + approval records

Implemented and verified:

- `待我审批`
- `我发起的`
- approval records:
  - `已审批`
  - `抄送我`
  - `他人已处理`

Integrated into:

- Right sidebar `审批待办`
- Firefly context injection
- morning digest source data

Key files:

- `lib/chaoxingApprovals.js`
- `services/approvalService.js`
- `app/api/approvals/route.js`
- `data/approvalCenter.js`
- `components/RightSidebar.js`
- `components/RightSidebar.css`

### 3. Firefly/chat structured rendering

Already supports richer rendering than plain text:

- markdown headings
- paragraphs
- lists
- quotes
- code blocks
- tables
- summary blocks
- action links
- subsection blocks

Key files:

- `components/RichMessageContent.js`
- `components/ChatArea.js`
- `components/ChatArea.css`
- `components/FireflySideDrawer.js`
- `components/FireflySideDrawer.css`

### 4. Generic scheduled task foundation

This is the biggest new addition after the earlier handoff.

Implemented:

- generic scheduled task registry
- scheduled task preference storage
- a first task type: `campus.morning_digest`
- delivery decision logic using `snapshotHash`
- `onlyWhenChanged` behavior
- in-app runtime that checks due tasks while browser/app is open
- unified API for listing and executing tasks

Important note:

- this is **not yet** a true background server scheduler
- this currently runs in the browser/app runtime while the app is open
- this is a valid foundation for future Web Push / email / enterprise bot delivery

Key files:

- `lib/scheduledTaskCatalog.js`
- `services/digestService.js`
- `services/scheduledTaskService.js`
- `data/scheduledTasks.js`
- `data/digestPreferences.js`
- `components/CampusSchedulerRuntime.js`
- `app/api/scheduled-tasks/route.js`
- `app/api/digests/morning/route.js`

## Verified API behavior

### Approval API

Latest successful local `/api/approvals` verification returned:

- `pendingCount: 159`
- `initiatedCount: 8`
- `recordCount: 4555`
- `recordCountsByStatus.approved: 2224`
- `recordCountsByStatus.copied: 56`
- `recordCountsByStatus.othersProcessed: 2275`

### Morning digest task

`GET /api/scheduled-tasks` now returns the task registry and scheduler mode:

- scheduler status: `foundation_ready`
- runtime mode: `in_app_when_browser_open`

`POST /api/scheduled-tasks` with `campus.morning_digest` was verified successfully and returned:

- unread + approval counts
- digest sections
- snapshot hash
- `delivery.shouldDeliver`
- in-app notification payload

## Important API rules and credentials

### Approval todo endpoint

Currently working endpoint:

- `POST https://demo.hall.chaoxing.com/homepage/approval/getApprovalData`

Current mapping:

- `aprvType=1` -> `待我审批`
- `aprvType=4` -> `我发起的`

### Approval record endpoint

Currently working endpoint:

- `http://m.oa.chaoxing.com/api/approve/forms/user/approval/list`

Working signature rule:

- `enc = md5(source + [key])`

Important:

- brackets around `key` are required
- current verified request omits `fid` from signature/query

Current working credentials for `fid=217097`:

- `sign=approveData_zhizhen`
- `key=DaJHNgE&HNF%EIRXbc`

User explicitly warned:

- `sign/key` may vary by `fid`
- response data obviously also varies by `uid`

## UID / FID strategy

UID must not be hardcoded in business UI logic.

Current approach:

- default profile values still point to the current test user
- runtime profile abstraction lives in `data/userProfile.js`
- future login integration should replace these values dynamically

Key file:

- `data/userProfile.js`

## Firefly / side drawer fixes completed in the latest part of this session

### 1. External workspace drawer reopening bug fixed

There was a bug where Firefly in external workspaces such as `AI 智能体` would flash open and immediately close.

Root cause:

- the path-change auto-close logic in `components/FireflySideDrawer.js` was interacting badly with the controlled `isOpen` mode

Status:

- fixed

### 2. External workspaces got a clearer Firefly entry

In external shell pages such as `AI 智能体`, a more explicit Firefly button was added to the top-right floating controls instead of relying only on the small draggable bubble.

Key files:

- `components/ExternalWorkspaceShell.js`
- `components/ExternalWorkspaceShell.css`

### 3. Firefly drawer chrome simplified

User felt the top area of the side drawer was too crowded.

Latest applied simplification:

- top chips hidden by default
- shortcut pills hidden by default
- `完整工作台` link hidden by default
- top area reduced to a lighter minimal header
- bottom `稍后继续` button removed
- top now uses a clearer `收起` action

Current behavior:

- contextual data is still injected into prompts
- that context is simply no longer shown visually in the drawer header

Key files:

- `components/FireflySideDrawer.js`
- `components/FireflySideDrawer.css`

## Context-reading capability clarified

This was explicitly discussed with the user and is important.

### Native in-app pages

For native pages like `AI 图书馆`, Firefly **can** receive rich current-page context because the page itself constructs a context snapshot and passes it into the drawer.

For `AI 图书馆`, current prompt context already includes things like:

- current view
- current book title
- author
- summary
- current page title
- current quote
- current page body
- note title
- note quote
- note content
- reading progress

Key file:

- `app/library/page.js`

### External embedded pages

For pages like `AI 智能体` / `AI 办事` that are shown as external embedded systems:

- if the iframe is cross-origin, the browser does **not** allow direct DOM reading
- current implementation can only access outer-shell context:
  - current module
  - current tab label
  - current URL
  - open mode

If richer context is needed later for these external pages, the likely paths are:

- `postMessage` bridge
- backend summary API from the target system
- a page adapter that actively reports state to Firefly

## Product decisions confirmed in this latest session

- Side drawer should be lighter and less cluttered
- top contextual chips and shortcut rows do not need to be visible by default
- `稍后继续` does not need to sit in the input area
- contextual understanding should remain, but visual chrome should be reduced
- morning push is only the first example; the real requirement is a **general scheduled task system**

## What remains to do next

Recommended next steps, in order:

1. Build a visible scheduled-task settings UI
2. Let users configure:
   - enable/disable
   - schedule time
   - channel
   - only when changed
   - included data categories
3. Choose the first real delivery channel beyond in-app:
   - Web Push is likely the most product-aligned next step
4. Decide whether external systems should expose richer page state to Firefly:
   - probably via `postMessage` or explicit adapter APIs
5. Keep moving message/approval capability consumption away from UI-specific code and toward domain services

## Useful prompt for the next Codex session

If a fresh Codex session is opened after key migration, a good continuation prompt is:

> 先阅读 `docs/codex_handoff_2026-04-01_key_migration_checkpoint.md`，然后继续我们上次关于通用定时任务系统、萤火虫抽屉精简、以及外部工作区上下文桥接的实现。

## Worktree note

The git worktree is currently dirty and contains both:

- recent changes from this session
- older unrelated edits already present in the repo

Do **not** assume the modified/untracked file list is only from this session.
