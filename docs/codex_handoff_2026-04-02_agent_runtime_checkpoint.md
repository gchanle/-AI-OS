# Codex Handoff - 2026-04-02 Agent Runtime Checkpoint

## Purpose

This file preserves the latest implementation state, architectural decisions, and recent conversation context before the next Codex API key migration.

If the current thread is lost, read this file first.

Recommended supporting files:

- `docs/codex_handoff_2026-04-01_key_migration_checkpoint.md`
- `docs/codex_handoff_2026-04-01_approval_message_integration.md`

This file supersedes both of the above for the newest changes.

## Current project state

The project is no longer just doing direct app-side data integration for unread messages and approvals.

It has now moved into an early but real Firefly Agent Runtime phase:

- unified tool registry
- multi-step task planning
- observable step-by-step execution
- local task persistence
- task continuation from sidebar
- scheduled task execution through the same runtime

Practical maturity judgment:

- not yet a full autonomous agent OS
- no longer only a chatbot or fixed skill switcher
- roughly an `Agent v0.7` stage

## What was already completed before this checkpoint

These were already in place before the latest architecture work:

- Chaoxing unread message integration
- approval todo integration
- approval record integration
- right sidebar `审批待办`
- Firefly context injection for messages and approvals
- markdown / structured rendering in chat
- Firefly side drawer interaction fixes
- generic morning digest foundation

## Major updates completed in this checkpoint

### 1. Firefly now has a unified Tool Runtime

Previous situation:

- message logic, approval logic, reading logic, scheduled digest logic were not truly running through one shared runtime

Current situation:

- all executable business abilities are now registered in:
  - `services/fireflyToolRegistry.js`

Current tools:

- `messages.unread_summary`
- `approvals.center_overview`
- `library.reading_context`
- `digest.morning_briefing`

Compatibility layer kept for older code:

- `services/fireflySkillRegistry.js`

This now acts as a thin adapter over the tool registry, so existing code paths still work while the runtime direction has shifted from `skill-first` to `tool-first`.

### 2. Firefly planner now supports multi-step plans

Previous situation:

- planner selected matching skills
- executor simply ran matched skills in a simple loop

Current situation:

- planner now builds explicit steps
- steps carry:
  - `toolId`
  - `label`
  - `outputKey`
  - `purpose`
  - `input`
  - `continueOnError`

Key file:

- `services/fireflyPlannerService.js`

Current verified multi-step case:

- asking for unread messages + approval overview together
- Firefly plans two ordered steps:
  - first unread message tool
  - then approval overview tool

### 3. Firefly executor now supports partial completion

Previous situation:

- if one step failed, the whole task failed immediately

Current situation:

- steps can be marked `continueOnError`
- failed steps can degrade into warning-style step results
- completed steps are preserved
- final task can end as:
  - full completion
  - partial completion shown as `status=completed` with failed substeps
  - full failure when nothing useful succeeds

Key file:

- `services/fireflyExecutorService.js`

Important verified behavior:

- in the current environment, approval API may fail because source IP is not opened
- when a message + approval combined task runs:
  - message step succeeds
  - approval step may fail
  - final task still returns a usable result
  - task summary becomes:
    - `1 个步骤成功，1 个步骤失败`
  - user sees a `部分完成` style result instead of total collapse

### 4. Firefly execution is now observable in chat

Previously:

- user either saw nothing or one large final response

Now:

- Firefly emits stepwise SSE events through:
  - `app/api/firefly/agent/stream/route.js`

Event types now include:

- `task_created`
- `plan_ready`
- `task_started`
- `step_started`
- `step_completed`
- `step_failed`
- `task_completed`
- `task_failed`
- `done`

Frontend consumer:

- `components/FireflySideDrawer.js`

This gives OpenClaw-like visible execution progress inside the Firefly conversation.

### 5. Firefly tasks are now first-class objects in the sidebar

What was added:

- Firefly tasks are persisted locally
- task metadata is preserved
- sidebar task board merges:
  - old `dynamic_tasks`
  - new Firefly tasks
- Firefly tasks support:
  - rename
  - remove
  - continue task

Key files:

- `data/fireflyTasks.js`
- `components/LeftSidebar.js`
- `components/TasksModal.js`

Current continue behavior:

- clicking a Firefly task in the sidebar opens a new main chat continuation
- continuation prompt includes:
  - original goal
  - source label
  - result summary
  - next-step request

This is a practical first version of task continuation.

It is not yet “return to the original exact workspace and resume execution in place”.

### 6. Scheduled tasks now use the same Firefly Agent Runtime

This is one of the most important architecture updates in this checkpoint.

Previous situation:

- morning digest had its own scheduled-task service path

Current situation:

- scheduled tasks now call Firefly preset task execution
- current preset task:
  - `campus.morning_digest`

Key files:

- `services/scheduledTaskService.js`
- `services/fireflyAgentService.js`
- `services/fireflyPlannerService.js`
- `services/fireflyToolRegistry.js`

Result:

- scheduled digest execution now shares:
  - planning model
  - task model
  - step model
  - result structure
  - task persistence direction

This is the first real convergence between:

- conversation tasks
- background scheduled tasks

### 7. Scheduled tasks now have retry foundation

Added preference/state fields:

- `retryLimit`
- `retryDelayMinutes`
- `retryCount`
- `nextRetryAt`
- `lastFailedAt`
- `lastError`

Key files:

- `data/scheduledTasks.js`
- `lib/scheduledTaskCatalog.js`
- `components/CampusSchedulerRuntime.js`

Current behavior:

- successful scheduled runs reset retry state
- failed scheduled runs compute next retry time
- runtime checks `nextRetryAt`

Important limitation:

- this still runs in `browser/app open` mode
- it is not yet a true server-side always-on scheduler

### 8. Morning digest now degrades gracefully when approval source is blocked

Current real-world issue:

- approval source may return errors like:
  - `接口暂未开通223.76.185.2`

Previous risk:

- one bad source could make the whole digest fail

Current behavior:

- digest uses `Promise.allSettled`
- message source and approval source are treated independently
- unavailable sources produce warnings instead of crashing the whole digest

Key file:

- `services/digestService.js`

Current digest output now includes:

- counts
- suggestions
- warnings
- snapshot hash
- push text

## Verified behavior at the time of this checkpoint

### Firefly combined multi-step task

Verified endpoint:

- `POST /api/firefly/agent/stream`

Verified prompt:

- `帮我看下现在的未读消息和审批待办，一起给我个总览`

Verified runtime behavior:

- planner generated two-step plan
- unread message step completed
- approval step failed due to current IP restriction
- task still ended with usable final reply
- final task state:
  - `completed`
  - with failed substep
  - summary equivalent to partial completion

### Scheduled morning digest

Verified endpoint:

- `POST /api/scheduled-tasks`

Verified request:

- `taskId=campus.morning_digest`

Verified result:

- execution succeeds through Firefly Agent Runtime
- digest returns normal structured payload
- warning is included when approval source is unavailable
- notification payload is generated

### Lint status

`npm run lint` passes except pre-existing warnings:

- `components/Navbar.js`
- both are `next/no-img-element`

No new lint errors from this checkpoint work.

## Important architectural decisions confirmed in this session

### 1. Tool-first runtime is preferred over MCP-first implementation

Current direction remains:

- Layer 1: connectors / adapters
- Layer 2: domain services
- Layer 3: Firefly tool runtime and task orchestration
- Layer 4: MCP later, only after interfaces stabilize

This was chosen because:

- more campus data sources are expected later
- forcing MCP too early would over-standardize unstable internal contracts
- Firefly needs execution and orchestration first

### 2. Firefly should become a real orchestrator, not only a chat entry

Confirmed direction:

- visible execution
- task persistence
- tool orchestration
- scheduled execution
- continuation

This is now partially implemented.

### 3. Partial completion is better than hard failure for campus workflows

This is now encoded in runtime behavior for multi-step tasks.

Meaning:

- if one campus source is down
- Firefly should still preserve the parts that succeeded
- user should see what failed and what can continue

## Important current limitations

### 1. Approval source is still environment / IP sensitive

Current real failure seen in this environment:

- `接口暂未开通223.76.185.2`

Impact:

- approval-related live fetches may fail depending on current network/IP
- UI/runtime now degrades more gracefully, but this is still not a real backend-side fix

### 2. Scheduled runtime is not yet always-on

Current runtime mode:

- in-app while browser/app is open

This is good enough as a product prototype foundation, but not enough for:

- guaranteed 9:00 delivery when the app is closed
- durable background enterprise delivery

Future work would need:

- server-side scheduler
- push/email/bot delivery worker
- persistent execution log store

### 3. Task continuation is chat-level, not workspace-resume-level

Current behavior:

- continue task opens a new chat continuation

Not yet implemented:

- exact return to original workspace surface
- exact rehydration of original tool context
- exact resume from a paused step

### 4. There is still no long-term agent memory layer

Missing pieces:

- durable memory by user
- tool result caching strategy
- user preference memory beyond simple local settings
- cross-session recovery of runtime state from backend storage

## Key files added or heavily changed in this checkpoint

- `services/fireflyToolRegistry.js`
- `services/fireflySkillRegistry.js`
- `services/fireflyPlannerService.js`
- `services/fireflyExecutorService.js`
- `services/fireflyAgentService.js`
- `services/fireflyTaskService.js`
- `data/fireflyTasks.js`
- `components/FireflySideDrawer.js`
- `components/LeftSidebar.js`
- `components/TasksModal.js`
- `services/scheduledTaskService.js`
- `services/digestService.js`
- `data/scheduledTasks.js`
- `components/CampusSchedulerRuntime.js`
- `lib/scheduledTaskCatalog.js`
- `app/api/scheduled-tasks/route.js`

## Suggested “read first” list for the next Codex session

If continuing this work after key migration, inspect these in order:

1. `docs/codex_handoff_2026-04-02_agent_runtime_checkpoint.md`
2. `services/fireflyToolRegistry.js`
3. `services/fireflyPlannerService.js`
4. `services/fireflyExecutorService.js`
5. `services/fireflyAgentService.js`
6. `components/FireflySideDrawer.js`
7. `components/LeftSidebar.js`
8. `services/scheduledTaskService.js`
9. `components/CampusSchedulerRuntime.js`

## Best next steps after migration

Recommended next implementation priorities:

1. Make task continuation return to the original workspace surface when possible.
2. Add a task detail / execution record panel for Firefly tasks.
3. Introduce a server-side scheduler so morning digest and future reminders do not depend on the app being open.
4. Add more preset scheduled tasks:
   - approval reminder
   - unread message digest
   - reading summary / reading reminder
5. Introduce a real tool permission / confirmation layer for high-impact actions.

## Short session summary

In this session, Firefly moved from:

- “chat plus some executable skills”

to:

- “a shared agent runtime that now powers both chat tasks and scheduled tasks”

This is the most important architecture shift completed so far.
