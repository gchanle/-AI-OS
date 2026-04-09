# Codex Context Recovery - 2026-04-06

## Purpose

This file reconstructs the latest known project state after Codex API key migration caused thread history loss.

It summarizes:

- what was already completed
- what appears to be in progress but not fully closed
- what the most recent code changes added after the last written handoff
- what should be continued next

Read this file first if a new Codex session needs to resume work quickly.

## Current branch and worktree state

- active branch: `codex/campus-os-refresh`
- latest commit: `a27f9b6` - `feat: save campus os foundation refresh for engineering handoff`
- the worktree is currently dirty
- there are many modified and untracked files that go well beyond the last committed checkpoint

Important implication:

- the repo state is ahead of the latest committed handoff docs
- the newest code changes are only reflected in the local working tree, not in a clean committed milestone

## High-level product direction

The product is no longer being treated as a generic chatbot.

The direction remains:

- Chaoxing-branded `AI 校园 OS`
- restrained B-end product tone
- Firefly as the central workbench / orchestration entry
- capability areas like `AI 办事 / AI 科研 / AI 助教 / AI 图书馆 / AI 智能体`
- backend/admin governance increasingly separated from end-user experience

## Timeline reconstruction

### Before 2026-03-30

Recovered earlier context shows work had already established:

- campus OS shell direction
- B-end visual tone
- sidebars and workspace shell polish
- model switch placement work
- external system open-mode improvements
- AI agent navigation refinements

Supporting file:

- `../RECOVERED_CONTEXT_AI_CAMPUS_2026-03-24.md`

### 2026-03-30

Phase 1 foundation and assessment work formalized:

- platform registry and shared platform semantics
- unified workspace preference handling
- shared Firefly handoff model
- platform-level event alignment
- message source normalization
- initial Skills management center direction
- capability access center structure

Supporting files:

- `docs/phase1_platform_foundation.md`
- `docs/project_assessment_report_2026-03-30.md`

### 2026-04-01

Business data integration reached a real usable state:

- Chaoxing unread study messages integrated
- approval todo data integrated
- approval record data integrated
- right sidebar `审批待办` established
- Firefly context injection for messages / approvals
- richer chat markdown rendering
- generic morning digest scheduled-task foundation added

Supporting files:

- `docs/codex_handoff_2026-04-01_approval_message_integration.md`
- `docs/codex_handoff_2026-04-01_key_migration_checkpoint.md`

### 2026-04-02

Major architecture shift:

- Firefly moved from chat-plus-skills toward a real tool runtime
- multi-step planning added
- partial completion behavior added
- observable SSE execution flow added
- task persistence and sidebar continuation added
- scheduled tasks moved onto the same runtime
- retry foundation added for scheduled tasks

Supporting file:

- `docs/codex_handoff_2026-04-02_agent_runtime_checkpoint.md`

### 2026-04-04 to 2026-04-05

New work happened after the latest handoff doc and is visible only in code/runtime state:

- admin backend surfaces were added under `/admin`
- school policy / role / capability governance UI was added
- agent runtime governance panel was added
- runtime observability panel was added
- runtime storage and event persistence were added under `.runtime/firefly`
- tool runtime evolved further toward:
  - parallel tool execution batches
  - checkpointing
  - recovery metadata
  - server-side memory injection
  - runtime run/session/task/event persistence

This is the biggest missing piece from the written handoff docs.

## Confirmed completed work

### 1. Campus OS foundation and shell

Already present:

- Campus OS framing instead of plain chatbot framing
- unified major capability areas
- shared external workspace shell
- Firefly side drawer and main chat integration
- message center and sidebar structure
- model selection foundation

### 2. Platform-level semantic cleanup

Already present:

- platform registry
- shared workspace preference handling
- shared handoff construction
- shared platform event usage
- message source normalization direction
- capability access center direction

### 3. Real Chaoxing integrations

Already present:

- unread message fetching
- approval todo fetching
- approval record fetching
- integration into sidebar, message/digest flows, and Firefly context

Key areas:

- `lib/chaoxingAuth.js`
- `lib/chaoxingMessages.js`
- `lib/chaoxingApprovals.js`
- `services/messageService.js`
- `services/approvalService.js`

### 4. Firefly Tool Runtime

Already present:

- tool registry
- planner
- executor
- partial completion
- task persistence
- stepwise event streaming
- task continuation prompts
- preset scheduled execution via same runtime

Key files:

- `services/fireflyToolRegistry.js`
- `services/fireflyPlannerService.js`
- `services/fireflyExecutorService.js`
- `services/fireflyAgentService.js`
- `services/fireflyTaskService.js`

### 5. Scheduled task foundation

Already present:

- scheduled task catalog
- morning digest task
- `onlyWhenChanged` delivery gating
- retry state
- in-app runtime trigger

Important limitation:

- still not an always-on backend scheduler

### 6. Admin backend direction

Already present in local working tree:

- `/admin` overview
- `/admin/users`
- `/admin/access`
- `/admin/agents`
- school policy workspace
- runtime observability workspace
- agent runtime governance workspace

Key files:

- `app/admin/page.js`
- `app/admin/access/page.js`
- `components/admin/AdminAccessWorkspace.js`
- `components/admin/SchoolConsolePanel.js`
- `components/admin/AdminRuntimePanel.js`
- `components/admin/AdminAgentRuntimePanel.js`
- `app/api/admin/agent-runtime/route.js`

## Most recent code-level updates after the written handoff

These appear to be the newest meaningful local changes:

- `components/admin/AdminAgentRuntimePanel.js`
- `app/api/firefly/tools/route.js`
- `services/fireflyExecutorService.js`
- `lib/fireflyRuntimeStore.js`
- `services/fireflyTaskService.js`
- `services/fireflyPlannerService.js`
- `lib/adminAgentRuntimeStore.js`

What they added:

- admin-configurable model governance
- admin-configurable runtime policies
- tool exposure / enablement governance
- checkpoint/recovery-oriented runtime config
- runtime maturity checklist
- runtime state persistence in `.runtime/firefly`
- observable sessions / tasks / runs / events for admin viewing
- parallel execution batches in the executor

## Verified recent runtime behavior

Based on `.runtime/firefly/runtime-state.json` and `runtime-events.jsonl`:

- morning digest was executed successfully on 2026-04-05
- combined `未读消息 + 审批待办` task was executed successfully in partial-completion mode
- unread message step completed
- approval step failed due to IP restriction
- the runtime still completed the task and preserved the usable result
- a follow-up continuation task (`继续处理刚才的校园总览`) then generated a digest successfully

This confirms the runtime is not just scaffolded UI; it has been exercised locally.

## Unfinished work / open tasks

### 1. Worktree is ahead of documentation

The newest admin/runtime work is not yet captured in an official handoff doc.

This should be fixed before more changes pile on.

### 2. Approval integration is still environment-sensitive

Live approval fetch can still fail depending on source IP.

Current state:

- graceful degradation exists
- real backend/network solution does not yet exist

### 3. Scheduled tasks are still in-app only

Current state:

- scheduling works while the app/browser is open

Missing:

- always-on server scheduler
- push/email/bot delivery worker
- durable external delivery channel

### 4. Task continuation is not true workspace resume

Current state:

- continuation opens a new chat-level follow-up

Missing:

- return to exact originating workspace
- exact paused-step resume
- deeper tool-context rehydration

### 5. Long-term memory is only partial

Current state:

- runtime memory injection exists
- task memory artifacts exist
- some persistence exists

Missing:

- durable backend memory per user
- real retrieval/compression policy
- stronger cross-session memory governance

### 6. Admin backend is still mostly local/prototype governance

Current state:

- admin UI exists
- config persistence exists in local runtime files

Missing:

- true auth / role backend
- org sync
- publish workflow
- audit/reporting depth

### 7. Some older shell/product polish threads may still be unfinished

Recovered earlier context suggests the earlier interrupted work likely still included:

- final logo asset handling consistency
- external system richer context bridge
- more complete model list / routing behavior
- shell / loading / interaction polish not fully wrapped up

These were likely interrupted during session loss rather than explicitly closed.

## Recommended near-term continuation order

### Priority 1

Write an official new handoff / checkpoint covering the 2026-04-05 admin runtime work and cleanly describe the current architecture.

### Priority 2

Choose one of these product-closing directions and continue with focus:

- task continuation -> true workspace resume
- server-side scheduler for digest / reminders
- tool permission / confirmation layer for higher-impact actions

### Priority 3

Stabilize the approval source integration:

- clarify environment/IP requirements
- separate transport failure from business failure
- preserve stronger fallback behavior

### Priority 4

Move admin runtime / memory / scheduler config out of local file persistence toward a more production-shaped storage model.

### Priority 5

Return to older UI/product polish only after the runtime/admin direction is documented and stabilized.

## Suggested resume prompt for the next Codex session

> 先阅读 `docs/codex_handoff_2026-04-06_context_recovery.md`，然后基于当前 `codex/campus-os-refresh` 的本地工作树，继续梳理 4 月 5 日新增的 Agent Runtime 后台治理能力，并优先推进“任务续办回到原工作面”或“服务端定时任务”之一。

