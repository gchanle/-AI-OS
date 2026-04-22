import {
    ensureFireflyThreadState,
    patchFireflyThreadState,
    buildFireflyThreadPaths,
} from '@/lib/fireflyThreadStateStore';
import { loadAdminAgentRuntimeConfig } from '@/lib/adminAgentRuntimeStore';

function now() {
    return new Date().toISOString();
}

function normalizeTodoStatus(status = '') {
    if (status === 'completed') return 'completed';
    if (status === 'failed') return 'failed';
    if (status === 'running') return 'in_progress';
    if (status === 'awaiting_approval') return 'in_progress';
    return 'pending';
}

function buildThreadTitle(question = '', plan = null) {
    return String(plan?.title || question || '萤火虫会话').trim().slice(0, 32);
}

function buildPlanTodos(plan = {}) {
    const subtasks = Array.isArray(plan?.metadata?.subtasks) ? plan.metadata.subtasks : [];
    if (subtasks.length > 0) {
        return subtasks.map((item, index) => ({
            id: String(item.id || `todo-${index + 1}`).trim(),
            label: String(item.label || `任务 ${index + 1}`).trim(),
            status: index === 0 ? 'in_progress' : 'pending',
            summary: String(item.summary || '').trim(),
            linkedToolIds: Array.isArray(item.linkedToolIds) ? item.linkedToolIds.filter(Boolean) : [],
            updatedAt: now(),
        }));
    }

    const steps = Array.isArray(plan?.steps) ? plan.steps : [];
    return steps.map((step, index) => ({
        id: String(step.id || `todo-${index + 1}`).trim(),
        label: String(step.subtaskLabel || step.label || `任务 ${index + 1}`).trim(),
        status: index === 0 ? 'in_progress' : 'pending',
        summary: String(step.purpose || '').trim(),
        linkedToolIds: [step.toolId || step.skillId].filter(Boolean),
        updatedAt: now(),
    }));
}

function buildTaskTodos(task = {}) {
    if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
        return task.subtasks.map((item) => ({
            id: String(item.id || '').trim(),
            label: String(item.label || '未命名子任务').trim(),
            status: normalizeTodoStatus(item.status),
            summary: String(item.resultSummary || item.summary || '').trim(),
            linkedToolIds: Array.isArray(item.linkedToolIds) ? item.linkedToolIds.filter(Boolean) : [],
            updatedAt: now(),
        }));
    }

    const steps = Array.isArray(task.steps) ? task.steps : [];
    return steps.map((step) => ({
        id: String(step.id || '').trim(),
        label: String(step.subtaskLabel || step.label || '未命名步骤').trim(),
        status: normalizeTodoStatus(step.status),
        summary: String(step.summary || step.purpose || '').trim(),
        linkedToolIds: [step.toolId || step.skillId].filter(Boolean),
        updatedAt: now(),
    }));
}

function buildTaskArtifacts(task = {}) {
    const artifacts = Array.isArray(task.artifacts) ? task.artifacts : [];
    return artifacts.slice(-8).map((item, index) => ({
        id: String(item.id || `artifact-${index + 1}`).trim(),
        label: String(item.label || item.type || `产物 ${index + 1}`).trim(),
        href: String(item.href || '').trim(),
        type: String(item.type || 'summary').trim(),
        fileName: String(item.fileName || '').trim(),
        relativePath: String(item.relativePath || '').trim(),
        mimeType: String(item.mimeType || '').trim(),
        size: Number(item.size || 0),
        summary: String(item.summary || '').trim(),
        updatedAt: now(),
    }));
}

function buildLatestCheckpoint(task = {}) {
    const checkpoints = Array.isArray(task.checkpoints) ? task.checkpoints : [];
    if (!checkpoints.length) {
        return null;
    }

    const latest = checkpoints[checkpoints.length - 1];
    return {
        id: String(latest.id || '').trim(),
        label: String(latest.label || '').trim(),
        summary: String(latest.summary || '').trim(),
        status: String(latest.status || '').trim(),
        batchIndex: Number(latest.batchIndex || 0),
        stepIds: Array.isArray(latest.stepIds) ? latest.stepIds.filter(Boolean) : [],
        subtaskIds: Array.isArray(latest.subtaskIds) ? latest.subtaskIds.filter(Boolean) : [],
        workerIds: Array.isArray(latest.workerIds) ? latest.workerIds.filter(Boolean) : [],
        subagentRunIds: Array.isArray(latest.subagentRunIds) ? latest.subagentRunIds.filter(Boolean) : [],
        createdAt: String(latest.createdAt || '').trim(),
    };
}

export async function prepareFireflyDeerRuntime({
    question = '',
    threadKey = 'default',
    capabilityIds = [],
    contextSnapshot = {},
    uid = '',
    fid = '',
    onEvent,
} = {}) {
    const agentConfig = loadAdminAgentRuntimeConfig();
    if (!agentConfig.runtime?.enableThreadStateProjection) {
        return {
            contextSnapshot,
            threadState: null,
        };
    }

    const paths = buildFireflyThreadPaths(threadKey);
    const nextContextSnapshot = {
        ...(contextSnapshot || {}),
        deerRuntime: {
            architecture: 'deerflow_hybrid',
            threadKey,
            threadData: {
                workspacePath: paths.workspacePath,
                uploadsPath: paths.uploadsPath,
                outputsPath: paths.outputsPath,
            },
        },
        threadData: {
            workspacePath: paths.workspacePath,
            uploadsPath: paths.uploadsPath,
            outputsPath: paths.outputsPath,
        },
    };

    const threadState = await ensureFireflyThreadState({
        threadKey,
        title: buildThreadTitle(question),
        status: 'booting',
        uid,
        fid,
        capabilityIds,
        contextSnapshot: nextContextSnapshot,
    });

    onEvent?.({
        type: 'thread_state_ready',
        timestamp: now(),
        detail: '已建立 DeerFlow 风格的线程态与工作目录。',
        threadState,
    });

    return {
        contextSnapshot: nextContextSnapshot,
        threadState,
    };
}

export async function syncFireflyPlanToDeerRuntime({
    threadKey = 'default',
    question = '',
    plan = null,
    capabilityIds = [],
    contextSnapshot = {},
    task = null,
    onEvent,
} = {}) {
    const agentConfig = loadAdminAgentRuntimeConfig();
    if (!agentConfig.runtime?.enableThreadStateProjection) {
        return null;
    }

    const todos = task ? buildTaskTodos(task) : buildPlanTodos(plan);
    const title = buildThreadTitle(question, plan || task);
    const threadState = await patchFireflyThreadState(threadKey, {
        title,
        status: task?.status || 'planned',
        capabilityIds,
        todos: agentConfig.runtime?.enableTodoProjection ? todos : [],
        lastTaskId: task?.id || '',
        contextSnapshot,
    });

    onEvent?.({
        type: 'todo_projection_ready',
        timestamp: now(),
        detail: `已把本轮任务拆成 ${todos.length} 个可跟踪待办。`,
        threadState,
    });

    return threadState;
}

export async function syncFireflyTaskToDeerRuntime({
    threadKey = 'default',
    task = null,
    runId = '',
    uid = '',
    fid = '',
    onEvent,
} = {}) {
    const agentConfig = loadAdminAgentRuntimeConfig();
    if (!agentConfig.runtime?.enableThreadStateProjection || !task) {
        return null;
    }

    const threadState = await patchFireflyThreadState(threadKey, {
        title: String(task.title || '').trim(),
        status: String(task.status || 'running').trim(),
        uid,
        fid,
        capabilityIds: Array.isArray(task.capabilityIds) ? task.capabilityIds : [],
        memoryIds: Array.isArray(task.memoryIds) ? task.memoryIds : [],
        artifacts: agentConfig.runtime?.enableArtifactProjection ? buildTaskArtifacts(task) : [],
        todos: agentConfig.runtime?.enableTodoProjection ? buildTaskTodos(task) : [],
        checkpointSummary: String(task.checkpointSummary || '').trim(),
        latestCheckpoint: buildLatestCheckpoint(task),
        lastTaskId: String(task.id || '').trim(),
        lastRunId: String(runId || task.runId || '').trim(),
        contextSnapshot: task.contextSnapshot && typeof task.contextSnapshot === 'object' ? task.contextSnapshot : {},
    });

    onEvent?.({
        type: 'thread_state_synced',
        timestamp: now(),
        detail: `线程态已同步到 ${task.status || 'running'}。`,
        threadState,
    });

    return threadState;
}
