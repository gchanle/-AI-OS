import { executeFireflyTask } from '@/services/fireflyExecutorService';
import {
    appendFireflyRuntimeEvent,
    createFireflyRuntimeRun,
    patchFireflyRuntimeRun,
    syncFireflyRuntimeSession,
    upsertFireflyRuntimeTask,
} from '@/lib/fireflyRuntimeStore';
import {
    buildFireflyServerMemorySnapshot,
    rememberFireflyServerTask,
} from '@/lib/fireflyMemoryStore';
import { planFireflyPresetTask, planFireflyTask } from '@/services/fireflyPlannerService';
import { createFireflyTask } from '@/services/fireflyTaskService';
import { loadAdminAgentRuntimeConfig } from '@/lib/adminAgentRuntimeStore';
import { resolveFireflyTool } from '@/services/fireflyToolRegistry';

function emitEvent(onEvent, type, payload = {}) {
    onEvent?.({
        type,
        timestamp: new Date().toISOString(),
        ...payload,
    });
}

function buildUserFacingReply(task, results = []) {
    const failedSteps = Array.isArray(task.steps)
        ? task.steps.filter((step) => step.status === 'failed').length
        : 0;
    const usableResults = Array.isArray(results)
        ? results.filter((item) => item && item.markdown)
        : [];
    const preferredResult = [...usableResults].reverse().find((item) => item.preferAsReply);
    const lines = [];

    if (task.status === 'completed' && failedSteps > 0) {
        lines.push('已先整理出当前可用结果，部分步骤暂时没有完成。');
    }

    if (preferredResult) {
        if (lines.length > 0) {
            lines.push('');
        }
        lines.push(preferredResult.markdown);
    } else if (usableResults.length > 0) {
        usableResults.forEach((result, index) => {
            if (index > 0 || lines.length > 0) {
                lines.push('');
            }
            lines.push(result.markdown);
        });
    } else if (task.resultSummary) {
        lines.push(task.resultSummary);
    }

    return lines.join('\n').trim();
}

function mergeMemorySummaries(existingSummary = '', serverSummary = '') {
    return [String(existingSummary || '').trim(), String(serverSummary || '').trim()]
        .filter(Boolean)
        .join('\n\n');
}

async function buildManagedContextSnapshot({
    question = '',
    threadKey = '',
    capabilityIds = [],
    contextSnapshot = {},
    uid = '',
    fid = '',
}) {
    const agentConfig = loadAdminAgentRuntimeConfig();
    if (!agentConfig.memory?.enabled) {
        return {
            contextSnapshot,
            memorySnapshot: {
                items: [],
                markdown: '',
            },
        };
    }

    const memorySnapshot = await buildFireflyServerMemorySnapshot({
        uid,
        fid,
        threadKey,
        capabilityIds,
        question,
        limit: agentConfig.memory.injectTopK,
    });
    const mergedMemoryIds = [
        ...(Array.isArray(contextSnapshot?.memoryIds) ? contextSnapshot.memoryIds : []),
        ...memorySnapshot.items.map((item) => item.id),
    ].filter((item, index, array) => item && array.indexOf(item) === index);

    return {
        contextSnapshot: {
            ...contextSnapshot,
            ...(memorySnapshot.markdown ? {
                memorySummary: mergeMemorySummaries(contextSnapshot?.memorySummary, memorySnapshot.markdown),
                memoryIds: mergedMemoryIds,
                serviceMemoryIds: memorySnapshot.items.map((item) => item.id),
                serviceMemorySummary: memorySnapshot.markdown,
                serviceMemoryGroups: memorySnapshot.groups || {},
                serviceMemoryStrategy: {
                    compressedCount: Array.isArray(memorySnapshot.groups?.compressed) ? memorySnapshot.groups.compressed.length : 0,
                    workflowHintCount: Array.isArray(memorySnapshot.groups?.workflow_hint) ? memorySnapshot.groups.workflow_hint.length : 0,
                    directTaskCount: Array.isArray(memorySnapshot.groups?.task_result) ? memorySnapshot.groups.task_result.length : 0,
                    preferenceCount: Array.isArray(memorySnapshot.groups?.user_preference) ? memorySnapshot.groups.user_preference.length : 0,
                },
            } : {}),
        },
        memorySnapshot,
    };
}

export async function runFireflyTaskPlan({
    plan,
    question,
    threadKey,
    capabilityIds = [],
    contextSnapshot = {},
    uid,
    fid,
    onEvent,
    runtimeInput = {},
}) {
    if (!plan.handled) {
        emitEvent(onEvent, 'unhandled', {
            plan,
        });
        return {
            handled: false,
            plan,
        };
    }

    let task = createFireflyTask({
        question,
        threadKey,
        capabilityIds,
        contextSnapshot,
        plan,
    });
    const runtimeRun = await createFireflyRuntimeRun({
        threadKey,
        question,
        capabilityIds,
        contextSnapshot,
        uid,
        fid,
        task,
    });
    await upsertFireflyRuntimeTask(task, {
        runId: runtimeRun.id,
    });
    await syncFireflyRuntimeSession({
        threadKey,
        title: task.title,
        status: task.status,
        capabilityIds,
        lastTaskId: task.id,
        lastRunId: runtimeRun.id,
        workspaceId: task.workspaceSnapshot?.path || task.workspaceSnapshot?.moduleLabel || '',
    });
    emitEvent(onEvent, 'task_created', {
        task,
    });
    await appendFireflyRuntimeEvent(runtimeRun.id, {
        type: 'task_created',
        label: '任务已创建',
        detail: task.title,
    });
    emitEvent(onEvent, 'plan_ready', {
        task,
        plan: {
            intent: plan.intent,
            title: plan.title,
            reasoning: plan.reasoning,
            metadata: plan.metadata || {},
            selectedSkills: plan.selectedSkills.map((skill) => ({
                id: skill.id,
                name: skill.name,
                capabilityId: skill.capabilityId,
                description: skill.description,
            })),
        },
    });
    await patchFireflyRuntimeRun(runtimeRun.id, {
        title: task.title,
        status: task.status,
        phase: 'planned',
        selectedSkillLabels: task.selectedSkillLabels,
        currentStepLabel: task.steps?.[0]?.label || '',
    });
    await appendFireflyRuntimeEvent(runtimeRun.id, {
        type: 'plan_ready',
        label: '计划已生成',
        detail: task.selectedSkillLabels.join('、') || '尚未命中能力',
    });
    if (contextSnapshot?.serviceMemoryStrategy && typeof contextSnapshot.serviceMemoryStrategy === 'object') {
        await appendFireflyRuntimeEvent(runtimeRun.id, {
            type: 'memory_snapshot_ready',
            label: '长期记忆已注入',
            detail: `压缩 ${contextSnapshot.serviceMemoryStrategy.compressedCount || 0} · 流程 ${contextSnapshot.serviceMemoryStrategy.workflowHintCount || 0} · 任务 ${contextSnapshot.serviceMemoryStrategy.directTaskCount || 0} · 偏好 ${contextSnapshot.serviceMemoryStrategy.preferenceCount || 0}`,
            taskId: task.id,
            threadKey,
            metadata: contextSnapshot.serviceMemoryStrategy,
        });
    }
    if (task.planMetadata?.plannerReview) {
        await appendFireflyRuntimeEvent(runtimeRun.id, {
            type: 'planner_review_ready',
            label: '规划自检完成',
            detail: task.planMetadata.plannerReview.revisions?.join('；') || '本轮规划通过自检，无需修正。',
            taskId: task.id,
            threadKey,
            metadata: task.planMetadata.plannerReview,
        });
    }
    if (Array.isArray(task.workerTree)) {
        for (const worker of task.workerTree.filter((item) => item.id !== 'supervisor-root')) {
            await appendFireflyRuntimeEvent(runtimeRun.id, {
                type: 'worker_planned',
                label: `已分配 ${worker.label}`,
                detail: `${worker.role}${worker.linkedToolIds?.length ? ` · ${worker.linkedToolIds.join('、')}` : ''}`,
                taskId: task.id,
                threadKey,
                metadata: {
                    workerId: worker.id,
                    role: worker.role,
                    stepIds: worker.stepIds || [],
                },
            });
        }
    }

    const runtimeAwareOnEvent = async (event) => {
        onEvent?.(event);

        if (!runtimeRun?.id) {
            return;
        }

        const taskPayload = event?.task || null;
        if (taskPayload?.id) {
            await upsertFireflyRuntimeTask(taskPayload, {
                runId: runtimeRun.id,
            });
            await patchFireflyRuntimeRun(runtimeRun.id, {
                title: taskPayload.title,
                status: taskPayload.status,
                phase: event.type || 'runtime_event',
                selectedSkillLabels: taskPayload.selectedSkillLabels,
                currentStepLabel: event?.step?.label || taskPayload.steps?.find((item) => item.status === 'running')?.label || '',
                resultSummary: taskPayload.resultSummary,
            });
            await syncFireflyRuntimeSession({
                threadKey,
                title: taskPayload.title,
                status: taskPayload.status,
                capabilityIds,
                lastTaskId: taskPayload.id,
                lastRunId: runtimeRun.id,
                workspaceId: taskPayload.workspaceSnapshot?.path || taskPayload.workspaceSnapshot?.moduleLabel || '',
            });
        }

        await appendFireflyRuntimeEvent(runtimeRun.id, {
            type: event.type || 'runtime_event',
            label: event?.step?.label || event?.skill?.name || event.type || '运行事件',
            detail: event?.detail || event?.result?.summary || event?.error || taskPayload?.resultSummary || '',
            taskId: taskPayload?.id || '',
            threadKey,
            stepId: event?.step?.id || '',
            skillId: event?.skill?.id || '',
            level: event?.error ? 'error' : 'info',
            metadata: {
                taskStatus: taskPayload?.status || '',
                stepStatus: event?.step?.status || '',
                stepLabel: event?.step?.label || '',
                skillName: event?.skill?.name || '',
                resultSummary: event?.result?.summary || '',
                workerId: event?.worker?.id || '',
                workerLabel: event?.worker?.label || '',
                subtaskId: event?.subtask?.id || '',
            },
        });
    };

    try {
        const executed = await executeFireflyTask(task, {
            plannedSteps: plan.steps || [],
            question,
            contextSnapshot,
            uid,
            fid,
            onEvent: runtimeAwareOnEvent,
            runtimeInput,
        });
        task = executed.task;
        await upsertFireflyRuntimeTask(task, {
            runId: runtimeRun.id,
        });
        const taskPhase = executed.waitingForApproval ? 'awaiting_approval' : 'completed';
        await patchFireflyRuntimeRun(runtimeRun.id, {
            title: task.title,
            status: task.status,
            phase: taskPhase,
            selectedSkillLabels: task.selectedSkillLabels,
            currentStepLabel: task.steps?.slice(-1)[0]?.label || '',
            resultSummary: task.resultSummary,
        });
        await syncFireflyRuntimeSession({
            threadKey,
            title: task.title,
            status: task.status,
            capabilityIds,
            lastTaskId: task.id,
            lastRunId: runtimeRun.id,
            workspaceId: task.workspaceSnapshot?.path || task.workspaceSnapshot?.moduleLabel || '',
        });
        await appendFireflyRuntimeEvent(runtimeRun.id, executed.waitingForApproval ? {
            type: 'task_awaiting_approval',
            label: '任务等待审批',
            detail: task.resultSummary,
            taskId: task.id,
            threadKey,
            stepId: executed.waitingStepId || '',
            metadata: {
                status: task.status,
                selectedSkillLabels: task.selectedSkillLabels || [],
            },
        } : {
            type: 'task_completed',
            label: '任务已完成',
            detail: task.resultSummary,
            taskId: task.id,
            threadKey,
            metadata: {
                status: task.status,
                selectedSkillLabels: task.selectedSkillLabels || [],
            },
        });
        await rememberFireflyServerTask(task, {
            uid,
            fid,
            sessionId: threadKey,
        });
        const reply = buildUserFacingReply(task, executed.results);
        emitEvent(onEvent, executed.waitingForApproval ? 'task_awaiting_approval' : 'task_completed', {
            task,
            results: executed.results,
            reply,
            waitingStepId: executed.waitingStepId || '',
        });

        return {
            handled: true,
            task,
            reply,
        };
    } catch (payload) {
        const failedTask = payload?.task || task;
        await upsertFireflyRuntimeTask(failedTask, {
            runId: runtimeRun.id,
        });
        await patchFireflyRuntimeRun(runtimeRun.id, {
            title: failedTask.title,
            status: failedTask.status || 'failed',
            phase: 'failed',
            selectedSkillLabels: failedTask.selectedSkillLabels,
            currentStepLabel: failedTask.steps?.find((item) => item.status === 'failed')?.label || '',
            resultSummary: failedTask.resultSummary,
        });
        await syncFireflyRuntimeSession({
            threadKey,
            title: failedTask.title,
            status: failedTask.status || 'failed',
            capabilityIds,
            lastTaskId: failedTask.id,
            lastRunId: runtimeRun.id,
            workspaceId: failedTask.workspaceSnapshot?.path || failedTask.workspaceSnapshot?.moduleLabel || '',
        });
        await appendFireflyRuntimeEvent(runtimeRun.id, {
            type: 'task_failed',
            label: '任务失败',
            detail: payload?.error instanceof Error ? payload.error.message : '未知错误',
            taskId: failedTask.id,
            threadKey,
            level: 'error',
            metadata: {
                status: failedTask.status || 'failed',
                failedStepLabel: failedTask.steps?.find((item) => item.status === 'failed')?.label || '',
            },
        });
        await rememberFireflyServerTask(failedTask, {
            uid,
            fid,
            sessionId: threadKey,
        });
        const reply = [
            '## 任务执行失败',
            `- 任务名称：${failedTask.title}`,
            `- 失败原因：${payload?.error instanceof Error ? payload.error.message : '未知错误'}`,
            '',
            '可以稍后重试，或把问题缩小到单一技能后继续让我执行。',
        ].join('\n');
        emitEvent(onEvent, 'task_failed', {
            task: failedTask,
            error: payload?.error instanceof Error ? payload.error.message : '未知错误',
            reply,
        });

        return {
            handled: true,
            task: failedTask,
            reply,
        };
    }
}

export async function runFireflyAgentTask({
    question,
    threadKey,
    capabilityIds = [],
    contextSnapshot = {},
    uid,
    fid,
    onEvent,
}) {
    const managedContext = await buildManagedContextSnapshot({
        question,
        threadKey,
        capabilityIds,
        contextSnapshot,
        uid,
        fid,
    });
    const plan = planFireflyTask({
        question,
        contextSnapshot: managedContext.contextSnapshot,
        capabilityIds,
    });

    return runFireflyTaskPlan({
        plan,
        question,
        threadKey,
        capabilityIds,
        contextSnapshot: managedContext.contextSnapshot,
        uid,
        fid,
        onEvent,
    });
}

function buildReplaySelectedSkills(steps = []) {
    const selected = [];
    const seen = new Set();

    steps.forEach((step) => {
        const tool = resolveFireflyTool(step.toolId || step.skillId || '');
        if (!tool || seen.has(tool.id)) {
            return;
        }

        seen.add(tool.id);
        selected.push({
            id: tool.id,
            name: tool.name,
            capabilityId: tool.capabilityId,
            description: tool.description,
        });
    });

    return selected;
}

function buildReplayWorkerTree(steps = [], title = '') {
    const workers = [];
    const seen = new Set();

    steps.forEach((step, index) => {
        const workerId = String(step.workerId || `worker-${index + 1}`).trim();
        if (!workerId || seen.has(workerId)) {
            return;
        }

        seen.add(workerId);
        workers.push({
            id: workerId,
            parentId: 'supervisor-root',
            label: String(step.workerLabel || step.subtaskLabel || step.label || `Worker ${index + 1}`).trim(),
            role: String(step.workerRole || 'tool_worker').trim(),
            status: 'pending',
            linkedToolIds: [step.toolId || step.skillId].filter(Boolean),
            stepIds: [step.id].filter(Boolean),
        });
    });

    return [
        {
            id: 'supervisor-root',
            parentId: '',
            label: title || 'Firefly Supervisor',
            role: 'supervisor',
            status: 'pending',
            linkedToolIds: [],
            stepIds: steps.map((step) => step.id).filter(Boolean),
        },
        ...workers,
    ];
}

function buildReplaySubtasks(steps = []) {
    const subtasks = [];
    const seen = new Set();

    steps.forEach((step, index) => {
        const subtaskId = String(step.subtaskId || `replay-subtask-${index + 1}`).trim();
        if (!subtaskId || seen.has(subtaskId)) {
            return;
        }

        seen.add(subtaskId);
        subtasks.push({
            id: subtaskId,
            order: subtasks.length + 1,
            label: String(step.subtaskLabel || step.label || `重试子任务 ${index + 1}`).trim(),
            summary: String(step.purpose || step.summary || '').trim(),
            linkedToolIds: [step.toolId || step.skillId].filter(Boolean),
            outputKeys: [step.outputKey || step.toolId || step.skillId].filter(Boolean),
        });
    });

    return subtasks;
}

function buildReplayPlan(task = {}, mode = 'full', stepId = '') {
    const steps = Array.isArray(task.steps) ? task.steps : [];
    const stepIndex = steps.findIndex((step) => step.id === stepId);
    const replaySteps = mode === 'failed_only'
        ? steps.filter((step) => step.status === 'failed')
        : mode === 'single_step'
            ? steps.filter((step) => step.id === stepId)
            : mode === 'from_step'
                ? (stepIndex >= 0 ? steps.slice(stepIndex) : [])
            : steps;

    if (!replaySteps.length) {
        return null;
    }

    const selectedSkills = buildReplaySelectedSkills(replaySteps);
    const preferredToolIds = replaySteps.map((step) => step.toolId || step.skillId).filter(Boolean);
    const replayTitle = mode === 'failed_only'
        ? `失败重试：${task.title || '萤火虫任务'}`
        : mode === 'single_step'
            ? `步骤重试：${replaySteps[0]?.label || task.title || '萤火虫任务'}`
            : mode === 'from_step'
                ? `审批后继续：${replaySteps[0]?.label || task.title || '萤火虫任务'}`
                : `重新执行：${task.title || '萤火虫任务'}`;
    const replayPlanSteps = replaySteps.map((step, index) => ({
        id: `replay-step-${step.toolId || step.skillId || index + 1}-${index + 1}`,
        order: index + 1,
        toolId: step.toolId || step.skillId || '',
        label: step.label || `步骤 ${index + 1}`,
        outputKey: step.outputKey || step.toolId || step.skillId || `replay-output-${index + 1}`,
        purpose: step.purpose || step.summary || '',
        input: step.input || {},
        continueOnError: Boolean(step.continueOnError),
        requiresApproval: Boolean(step.requiresApproval),
        approvalLabel: String(step.approvalLabel || '').trim(),
        approvalReason: String(step.approvalReason || '').trim(),
        parallelGroup: mode === 'failed_only' ? '' : String(step.parallelGroup || '').trim(),
        subtaskId: String(step.subtaskId || `replay-subtask-${index + 1}`).trim(),
        subtaskLabel: String(step.subtaskLabel || step.label || `重试步骤 ${index + 1}`).trim(),
        workerId: String(step.workerId || `worker-replay-${index + 1}`).trim(),
        workerLabel: String(step.workerLabel || step.subtaskLabel || step.label || `重试 Worker ${index + 1}`).trim(),
        workerRole: String(step.workerRole || 'tool_worker').trim(),
    }));
    const workerTree = buildReplayWorkerTree(replayPlanSteps, replayTitle);
    const subtasks = buildReplaySubtasks(replayPlanSteps);
    const basePlannerReview = task.planMetadata?.plannerReview && typeof task.planMetadata.plannerReview === 'object'
        ? task.planMetadata.plannerReview
        : {};

    return {
        handled: true,
        intent: task.intent || { id: 'runtime_replay', label: '任务重试' },
        title: replayTitle,
        selectedSkills,
        steps: replayPlanSteps,
        reasoning: [
            mode === 'failed_only'
                ? '控制面指令：仅重试上一轮失败步骤。'
                : mode === 'single_step'
                    ? '控制面指令：仅重跑指定步骤。'
                    : mode === 'from_step'
                        ? '控制面指令：审批通过后，从指定步骤继续后续执行。'
                    : '控制面指令：整轮任务重新执行。',
            `继承任务「${task.title || task.goal || '萤火虫任务'}」的既有执行结构，避免重新走一轮工具匹配。`,
            selectedSkills.length > 0
                ? `本轮优先沿用原任务能力：${selectedSkills.map((item) => item.name).join('、')}`
                : '当前未恢复到可用工具定义，重试能力可能受限。',
        ],
        planKind: mode === 'failed_only'
            ? 'retry_failed_steps'
            : mode === 'single_step'
                ? 'retry_single_step'
                : mode === 'from_step'
                    ? 'resume_from_step'
                : 'replay_task',
        metadata: {
            ...(task.planMetadata || {}),
            replayOfTaskId: task.id,
            replayMode: mode,
            replayStepId: mode === 'single_step' ? stepId : '',
            parentTaskId: task.id,
            isResume: true,
            resumeTarget: task.title || task.goal || '',
            resumeSummary: task.resultSummary || '',
            memoryIds: Array.isArray(task.memoryIds) ? task.memoryIds : [],
            preferredToolIds,
            plannerReview: {
                ...basePlannerReview,
                verdict: 'revised',
                revisions: [
                    mode === 'failed_only'
                        ? '控制面已自动收缩为失败步骤重试。'
                        : mode === 'single_step'
                            ? '控制面已自动收缩为单步骤重跑。'
                            : mode === 'from_step'
                                ? '控制面已从审批节点继续后续步骤。'
                                : '控制面已基于原始计划重新发起执行。',
                ],
                replayMode: mode,
            },
            toolSelectionControl: {
                preferredToolIds,
                candidateToolIds: preferredToolIds,
                selectedToolIds: preferredToolIds,
                selectedTools: selectedSkills.map((skill) => ({
                    id: skill.id,
                    name: skill.name,
                    capabilityId: skill.capabilityId,
                })),
                excludedToolIds: [],
                excludedTools: [],
                resumeMode: true,
                replayMode: mode,
                requiresApprovalToolIds: replayPlanSteps
                    .filter((step) => step.requiresApproval)
                    .map((step) => step.toolId)
                    .filter(Boolean),
                selectionStrategy: 'runtime_replay',
            },
            workerTree,
            subtasks,
            executionMode: mode === 'failed_only' || mode === 'single_step'
                ? 'sequential'
                : task.planMetadata?.executionMode || 'sequential',
        },
    };
}

function buildResumeContextSnapshot(task = {}, preferredToolIds = []) {
    return {
        ...(task.contextSnapshot || {}),
        resumeMode: true,
        parentTaskId: task.id,
        taskTitle: task.title || '',
        taskGoal: task.goal || '',
        taskResultSummary: task.resultSummary || '',
        taskMemorySummary: task.contextSnapshot?.memorySummary || '',
        taskSelectedSkills: Array.isArray(task.selectedSkillLabels) ? task.selectedSkillLabels : [],
        preferredToolIds,
        memoryIds: Array.isArray(task.memoryIds) ? task.memoryIds : [],
    };
}

export async function replayFireflyTask({
    task,
    mode = 'full',
    stepId = '',
    approvedStepIds = [],
    uid = '',
    fid = '',
    onEvent,
}) {
    const plan = buildReplayPlan(task, mode, stepId);
    if (!plan) {
        return {
            handled: false,
            reason: mode === 'single_step' ? 'step_not_found' : 'no_replay_steps',
        };
    }

    const preferredToolIds = Array.isArray(plan.metadata?.preferredToolIds)
        ? plan.metadata.preferredToolIds
        : [];
    const managedContext = await buildManagedContextSnapshot({
        question: String(task?.goal || task?.title || '').trim(),
        threadKey: String(task?.threadKey || 'default').trim(),
        capabilityIds: Array.isArray(task?.capabilityIds) ? task.capabilityIds : [],
        contextSnapshot: buildResumeContextSnapshot(task, preferredToolIds),
        uid,
        fid,
    });

    return runFireflyTaskPlan({
        plan,
        question: String(task?.goal || task?.title || '').trim(),
        threadKey: String(task?.threadKey || 'default').trim(),
        capabilityIds: Array.isArray(task?.capabilityIds) ? task.capabilityIds : [],
        contextSnapshot: managedContext.contextSnapshot,
        uid,
        fid,
        onEvent,
        runtimeInput: {
            approvedStepIds,
        },
    });
}

export async function resumeFireflyTask({
    task,
    uid = '',
    fid = '',
    onEvent,
}) {
    const failedToolIds = Array.isArray(task?.steps)
        ? task.steps.filter((step) => step.status === 'failed').map((step) => step.toolId || step.skillId).filter(Boolean)
        : [];
    const preferredToolIds = failedToolIds.length > 0
        ? failedToolIds
        : (Array.isArray(task?.selectedSkillIds) ? task.selectedSkillIds : []);

    return runFireflyAgentTask({
        question: String(task?.goal || task?.title || '').trim(),
        threadKey: String(task?.threadKey || 'default').trim(),
        capabilityIds: Array.isArray(task?.capabilityIds) ? task.capabilityIds : [],
        contextSnapshot: buildResumeContextSnapshot(task, preferredToolIds),
        uid,
        fid,
        onEvent,
    });
}

export async function runFireflyPresetTask({
    presetId,
    question,
    threadKey,
    capabilityIds = [],
    contextSnapshot = {},
    uid,
    fid,
    preferences = {},
    onEvent,
    runtimeInput = {},
}) {
    const managedContext = await buildManagedContextSnapshot({
        question: question || '',
        threadKey,
        capabilityIds,
        contextSnapshot,
        uid,
        fid,
    });
    const plan = planFireflyPresetTask({
        presetId,
        question,
        preferences,
    });

    return runFireflyTaskPlan({
        plan,
        question: question || plan.title,
        threadKey,
        capabilityIds,
        contextSnapshot: managedContext.contextSnapshot,
        uid,
        fid,
        onEvent,
        runtimeInput: {
            ...runtimeInput,
            preferences,
        },
    });
}
