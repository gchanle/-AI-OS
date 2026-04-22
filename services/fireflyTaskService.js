import crypto from 'crypto';

export const FIREFLY_TASK_STATUS = {
    PLANNING: 'planning',
    RUNNING: 'running',
    AWAITING_APPROVAL: 'awaiting_approval',
    COMPLETED: 'completed',
    FAILED: 'failed',
};

export const FIREFLY_TASK_STEP_STATUS = {
    PENDING: 'pending',
    RUNNING: 'running',
    AWAITING_APPROVAL: 'awaiting_approval',
    COMPLETED: 'completed',
    FAILED: 'failed',
};

export const FIREFLY_TASK_SUBTASK_STATUS = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
};

function buildId(prefix = 'firefly-task') {
    return `${prefix}-${crypto.randomUUID()}`;
}

function buildNow() {
    return new Date().toISOString();
}

function normalizeSubtaskSeed(subtask = {}, index = 0, steps = []) {
    const linkedToolIds = Array.isArray(subtask.linkedToolIds)
        ? subtask.linkedToolIds.filter(Boolean)
        : [];
    const fallbackLinkedToolIds = linkedToolIds.length > 0
        ? linkedToolIds
        : steps
            .filter((step) => step.subtaskId === subtask.id || step.subtaskId === `subtask-${index + 1}`)
            .map((step) => step.toolId || step.skillId)
            .filter(Boolean);

    return {
        id: String(subtask.id || `subtask-${index + 1}`).trim(),
        label: String(subtask.label || `子任务 ${index + 1}`).trim(),
        summary: String(subtask.summary || '').trim(),
        linkedToolIds: fallbackLinkedToolIds,
        outputKeys: Array.isArray(subtask.outputKeys) ? subtask.outputKeys.filter(Boolean) : [],
        order: Number(subtask.order || index + 1),
        status: FIREFLY_TASK_SUBTASK_STATUS.PENDING,
        startedAt: null,
        completedAt: null,
        resultSummary: '',
    };
}

function buildTaskSubtasks(planSteps = [], planMetadata = {}) {
    const seeds = Array.isArray(planMetadata?.subtasks) ? planMetadata.subtasks : [];
    if (seeds.length > 0) {
        return seeds
            .slice(0, 12)
            .map((subtask, index) => normalizeSubtaskSeed(subtask, index, planSteps));
    }

    return planSteps.map((step, index) => normalizeSubtaskSeed({
        id: step.subtaskId || `subtask-${index + 1}`,
        label: step.subtaskLabel || step.label || `子任务 ${index + 1}`,
        summary: step.purpose || '',
        linkedToolIds: [step.toolId || step.skillId].filter(Boolean),
        outputKeys: [step.outputKey].filter(Boolean),
        order: index + 1,
    }, index, planSteps));
}

function buildCheckpointSummary(task = {}) {
    const checkpoints = Array.isArray(task.checkpoints) ? task.checkpoints : [];
    if (!checkpoints.length) {
        return '';
    }

    const latest = checkpoints[checkpoints.length - 1];
    const completed = checkpoints.filter((item) => item.status === 'completed').length;
    return `已记录 ${completed}/${checkpoints.length} 个运行检查点，最近检查点：${latest.label}`;
}

function buildWorkspaceSnapshot(contextSnapshot = {}, capabilityIds = [], selectedSkillLabels = []) {
    const path = String(
        contextSnapshot.pathname
        || contextSnapshot.pagePath
        || contextSnapshot.href
        || ''
    ).trim();
    const moduleLabel = String(
        contextSnapshot.moduleLabel
        || contextSnapshot.workspaceTitle
        || contextSnapshot.surfaceLabel
        || ''
    ).trim();
    const pageLabel = String(
        contextSnapshot.pageLabel
        || contextSnapshot.activeTabLabel
        || contextSnapshot.viewLabel
        || ''
    ).trim();
    const openMode = String(contextSnapshot.openModeLabel || '').trim();
    const activeTabId = String(contextSnapshot.activeTabId || contextSnapshot.tabId || '').trim();

    return {
        moduleLabel,
        pageLabel,
        path,
        openMode,
        activeTabId,
        capabilityIds: Array.isArray(capabilityIds) ? capabilityIds.filter(Boolean) : [],
        selectedSkillLabels: Array.isArray(selectedSkillLabels) ? selectedSkillLabels.filter(Boolean) : [],
        updatedAt: buildNow(),
    };
}

function buildRecoveryIntent(planMetadata = {}, contextSnapshot = {}) {
    const resumeTarget = String(planMetadata.resumeTarget || '').trim();
    const resumeSummary = String(planMetadata.resumeSummary || '').trim();
    const explicitIntent = String(contextSnapshot.recoveryIntent || '').trim();

    return {
        mode: planMetadata.isResume ? 'resume' : 'fresh',
        summary: explicitIntent || resumeSummary || (resumeTarget ? `继续推进「${resumeTarget}」` : '从当前工作面新发起任务'),
        targetLabel: resumeTarget,
    };
}

function buildNextActions({
    task = {},
    selectedSkillLabels = [],
    capabilityIds = [],
    contextSnapshot = {},
}) {
    const actions = [];
    const pageLabel = contextSnapshot.pageLabel || contextSnapshot.activeTabLabel || contextSnapshot.viewLabel || '当前页面';
    const moduleLabel = contextSnapshot.moduleLabel || contextSnapshot.workspaceTitle || '当前工作面';
    const workspacePath = contextSnapshot.pathname || contextSnapshot.pagePath || '';
    const activeTabId = contextSnapshot.activeTabId || contextSnapshot.tabId || '';
    const drawerTarget = contextSnapshot.drawerTarget || '';

    if (task.planMetadata?.isResume) {
        actions.push({
            id: 'resume-main-thread',
            kind: 'continue_task',
            label: '在主会话继续',
            summary: `先承接上一轮任务结果，再回到「${task.planMetadata.resumeTarget || task.title}」继续推进。`,
        });
    }

    if (selectedSkillLabels.length > 0) {
        actions.push({
            id: 'focus-tools',
            kind: 'execute_runtime',
            label: '按当前能力继续执行',
            summary: `优先使用已命中的能力：${selectedSkillLabels.slice(0, 3).join('、')}。`,
            preferredToolIds: Array.isArray(task.selectedSkillIds) ? task.selectedSkillIds.slice(0, 3) : [],
            prompt: '请直接承接当前任务结果，优先沿用上一轮已命中的能力继续执行，不要回到泛泛建议。',
        });
    }

    if (capabilityIds.includes('library')) {
        actions.push({
            id: 'return-workspace',
            kind: 'open_workspace',
            label: '回到阅读工作面',
            summary: `如果还在阅读协同阶段，建议继续停留在「${pageLabel}」围绕当前书籍追问。`,
            pathname: workspacePath || '/library',
            target: drawerTarget || 'library_firefly_drawer_v1',
            tabId: activeTabId,
        });
    } else if (capabilityIds.length > 0) {
        actions.push({
            id: 'return-workspace',
            kind: 'open_workspace',
            label: '回到对应工作面',
            summary: `若继续处理，建议回到「${moduleLabel} / ${pageLabel}」这一工作面完成下一步。`,
            pathname: workspacePath || '',
            target: drawerTarget || '',
            tabId: activeTabId,
        });
    }

    if (task.status === FIREFLY_TASK_STATUS.FAILED) {
        actions.push({
            id: 'retry-narrow',
            kind: 'execute_runtime',
            label: '缩小范围重试',
            summary: '本轮存在失败步骤，适合先缩小问题范围或切成单能力重试。',
            preferredToolIds: Array.isArray(task.selectedSkillIds) ? task.selectedSkillIds.slice(0, 1) : [],
            prompt: '请基于当前失败点缩小范围，只保留最相关的一项能力重新执行，并明确说明你在重试哪一步。',
        });
    }

    if (task.status === FIREFLY_TASK_STATUS.COMPLETED) {
        actions.push({
            id: 'confirm-result',
            kind: 'execute_runtime',
            label: '基于结果继续推进',
            summary: '这轮已经有结果，下一步更适合确认结果、继续追问，或触发后续动作。',
            preferredToolIds: Array.isArray(task.selectedSkillIds) ? task.selectedSkillIds.slice(0, 2) : [],
            prompt: '请承接已有结果，直接推进最合理的下一步，不要重复总结刚刚已经完成的内容。',
        });
    }

    return actions.filter(Boolean).slice(0, 4);
}

export function buildFireflyRecoveryState(task = {}) {
    const hasWorkspace = Boolean(task.workspaceSnapshot?.moduleLabel || task.workspaceSnapshot?.pageLabel || task.workspaceSnapshot?.path);
    const hasIntent = Boolean(task.recoveryIntent?.summary);
    const hasActions = Array.isArray(task.nextActions) && task.nextActions.length > 0;
    const hasMemory = Array.isArray(task.memoryIds) && task.memoryIds.length > 0;
    const hasCheckpoints = Array.isArray(task.checkpoints) && task.checkpoints.length > 0;

    return {
        ready: hasWorkspace && hasIntent,
        hasWorkspace,
        hasIntent,
        hasActions,
        hasMemory,
        hasCheckpoints,
    };
}

export function enrichFireflyTaskRecovery(task = {}) {
    const workspaceSnapshot = task.workspaceSnapshot || buildWorkspaceSnapshot(
        task.contextSnapshot,
        task.capabilityIds,
        task.selectedSkillLabels
    );
    const recoveryIntent = task.recoveryIntent || buildRecoveryIntent(task.planMetadata || {}, task.contextSnapshot || {});
    const nextActions = Array.isArray(task.nextActions) && task.nextActions.length > 0
        ? task.nextActions
        : buildNextActions({
            task,
            selectedSkillLabels: task.selectedSkillLabels,
            capabilityIds: task.capabilityIds,
            contextSnapshot: task.contextSnapshot,
        });
    const recoveryState = buildFireflyRecoveryState({
        ...task,
        workspaceSnapshot,
        recoveryIntent,
        nextActions,
    });

    return {
        ...task,
        workspaceSnapshot,
        recoveryIntent,
        nextActions,
        recoveryState,
        checkpointSummary: task.checkpointSummary || buildCheckpointSummary({
            ...task,
            nextActions,
        }),
    };
}

export function createFireflyTask({
    question,
    threadKey = 'default',
    capabilityIds = [],
    contextSnapshot = {},
    plan,
}) {
    const now = buildNow();
    const planSteps = Array.isArray(plan.steps) && plan.steps.length > 0
        ? plan.steps
        : plan.selectedSkills.map((skill, index) => ({
            id: `plan-step-${skill.id}-${index + 1}`,
            order: index + 1,
            toolId: skill.id,
            label: skill.name,
            outputKey: skill.id,
        }));

    return enrichFireflyTaskRecovery({
        id: buildId('firefly-task'),
        title: plan.title,
        goal: question,
        threadKey,
        status: FIREFLY_TASK_STATUS.PLANNING,
        intent: plan.intent,
        capabilityIds: [...capabilityIds],
        contextSnapshot,
        parentTaskId: String(plan.metadata?.parentTaskId || contextSnapshot?.parentTaskId || '').trim(),
        resumeContext: contextSnapshot && typeof contextSnapshot === 'object'
            ? {
                parentTaskId: String(contextSnapshot.parentTaskId || '').trim(),
                taskTitle: String(contextSnapshot.taskTitle || '').trim(),
                taskGoal: String(contextSnapshot.taskGoal || '').trim(),
                taskResultSummary: String(contextSnapshot.taskResultSummary || '').trim(),
                taskMemorySummary: String(contextSnapshot.taskMemorySummary || '').trim(),
                takeoverNote: String(contextSnapshot.takeoverNote || '').trim(),
                takeoverAction: String(contextSnapshot.takeoverAction || '').trim(),
                takeoverStepId: String(contextSnapshot.takeoverStepId || '').trim(),
                takeoverStepLabel: String(contextSnapshot.takeoverStepLabel || '').trim(),
            }
            : {},
        memoryIds: Array.isArray(plan.metadata?.memoryIds)
            ? plan.metadata.memoryIds.filter(Boolean)
            : [],
        selectedSkillIds: planSteps.map((step) => step.toolId || step.skillId).filter(Boolean),
        selectedSkillLabels: planSteps.map((step) => step.label).filter(Boolean),
        reasoning: [...plan.reasoning],
        planKind: plan.planKind || 'single_tool',
        planMetadata: plan.metadata || {},
        workerTree: Array.isArray(plan.metadata?.workerTree) ? plan.metadata.workerTree : [],
        subtasks: buildTaskSubtasks(planSteps, plan.metadata || {}),
        checkpoints: [],
        checkpointSummary: '',
        stepResults: {},
        steps: planSteps.map((step, index) => ({
            id: String(step.id || buildId('firefly-step')).trim(),
            order: index + 1,
            toolId: step.toolId || step.skillId || '',
            skillId: step.toolId || step.skillId || '',
            label: step.label || step.name || `步骤 ${index + 1}`,
            outputKey: step.outputKey || step.toolId || step.skillId || `step-${index + 1}`,
            purpose: step.purpose || '',
            input: step.input || {},
            continueOnError: Boolean(step.continueOnError),
            requiresApproval: Boolean(step.requiresApproval),
            approvalLabel: String(step.approvalLabel || '').trim(),
            approvalReason: String(step.approvalReason || '').trim(),
            workerId: String(step.workerId || '').trim(),
            workerLabel: String(step.workerLabel || '').trim(),
            workerRole: String(step.workerRole || '').trim(),
            parallelGroup: String(step.parallelGroup || '').trim(),
            subtaskId: String(step.subtaskId || '').trim(),
            subtaskLabel: String(step.subtaskLabel || '').trim(),
            status: FIREFLY_TASK_STEP_STATUS.PENDING,
            summary: '',
            startedAt: null,
            completedAt: null,
        })),
        executionLogs: [],
        artifacts: [],
        resultSummary: '',
        createdAt: now,
        updatedAt: now,
    });
}

export function appendFireflyTaskLog(task, log = {}) {
    const nextLog = {
        id: buildId('firefly-log'),
        level: log.level || 'info',
        message: log.message || '',
        stepId: log.stepId || null,
        createdAt: buildNow(),
    };

    return enrichFireflyTaskRecovery({
        ...task,
        executionLogs: [...task.executionLogs, nextLog],
        updatedAt: nextLog.createdAt,
    });
}

export function updateFireflyTaskStatus(task, status, patch = {}) {
    return enrichFireflyTaskRecovery({
        ...task,
        ...patch,
        status,
        updatedAt: buildNow(),
    });
}

export function updateFireflyTaskStep(task, stepId, patch = {}) {
    const updatedAt = buildNow();

    return enrichFireflyTaskRecovery({
        ...task,
        steps: task.steps.map((step) => (
            step.id === stepId
                ? {
                    ...step,
                    ...patch,
                }
                : step
        )),
        updatedAt,
    });
}

export function setFireflyTaskStepResult(task, key, result = null) {
    return enrichFireflyTaskRecovery({
        ...task,
        stepResults: {
            ...(task.stepResults || {}),
            [key]: result,
        },
        updatedAt: buildNow(),
    });
}

export function updateFireflyTaskSubtask(task, subtaskId, patch = {}) {
    const updatedAt = buildNow();

    return enrichFireflyTaskRecovery({
        ...task,
        subtasks: Array.isArray(task.subtasks)
            ? task.subtasks.map((subtask) => (
                subtask.id === subtaskId
                    ? {
                        ...subtask,
                        ...patch,
                    }
                    : subtask
            ))
            : [],
        updatedAt,
    });
}

export function updateFireflyTaskWorker(task, workerId, patch = {}) {
    const updatedAt = buildNow();

    return enrichFireflyTaskRecovery({
        ...task,
        workerTree: Array.isArray(task.workerTree)
            ? task.workerTree.map((worker) => (
                worker.id === workerId
                    ? {
                        ...worker,
                        ...patch,
                    }
                    : worker
            ))
            : [],
        updatedAt,
    });
}

export function pushFireflyTaskCheckpoint(task, checkpoint = {}) {
    const createdAt = checkpoint.createdAt || buildNow();
    const nextCheckpoint = {
        id: String(checkpoint.id || buildId('checkpoint')).trim(),
        label: String(checkpoint.label || '运行检查点').trim(),
        summary: String(checkpoint.summary || '').trim(),
        status: String(checkpoint.status || 'completed').trim(),
        batchIndex: Number(checkpoint.batchIndex || 0),
        stepIds: Array.isArray(checkpoint.stepIds) ? checkpoint.stepIds.filter(Boolean) : [],
        subtaskIds: Array.isArray(checkpoint.subtaskIds) ? checkpoint.subtaskIds.filter(Boolean) : [],
        workerIds: Array.isArray(checkpoint.workerIds) ? checkpoint.workerIds.filter(Boolean) : [],
        subagentRunIds: Array.isArray(checkpoint.subagentRunIds) ? checkpoint.subagentRunIds.filter(Boolean) : [],
        createdAt,
    };

    return enrichFireflyTaskRecovery({
        ...task,
        checkpoints: [...(Array.isArray(task.checkpoints) ? task.checkpoints : []), nextCheckpoint].slice(-12),
        checkpointSummary: '',
        updatedAt: createdAt,
    });
}

export function pushFireflyTaskArtifact(task, artifact = {}) {
    const createdAt = buildNow();
    return enrichFireflyTaskRecovery({
        ...task,
        artifacts: [...task.artifacts, {
            id: buildId('firefly-artifact'),
            type: artifact.type || 'text',
            label: artifact.label || '执行结果',
            content: artifact.content || '',
            href: artifact.href || '',
            fileName: artifact.fileName || '',
            relativePath: artifact.relativePath || '',
            mimeType: artifact.mimeType || '',
            size: Number(artifact.size || 0),
            summary: artifact.summary || '',
            createdAt,
        }],
        updatedAt: createdAt,
    });
}
