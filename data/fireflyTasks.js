'use client';

export const FIREFLY_TASKS_STORAGE_KEY = 'campus_firefly_tasks_v1';
export const FIREFLY_TASKS_EVENT = 'campus-firefly-tasks-sync';

function canUseStorage() {
    return typeof window !== 'undefined';
}

function normalizeNextAction(action, index = 0) {
    if (!action) {
        return null;
    }

    if (typeof action === 'string') {
        return {
            id: `next-action-${index}`,
            kind: 'continue_task',
            label: '继续推进',
            summary: action,
            pathname: '',
            target: '',
            tabId: '',
        };
    }

    return {
        id: String(action.id || `next-action-${index}`).trim(),
        kind: String(action.kind || 'continue_task').trim(),
        label: String(action.label || '继续推进').trim(),
        summary: String(action.summary || '').trim(),
        pathname: String(action.pathname || '').trim(),
        target: String(action.target || '').trim(),
        tabId: String(action.tabId || '').trim(),
        prompt: String(action.prompt || '').trim(),
        preferredToolIds: Array.isArray(action.preferredToolIds) ? action.preferredToolIds.filter(Boolean).map((item) => String(item).trim()) : [],
    };
}

function normalizeTask(task = {}) {
    return {
        id: String(task.id || '').trim(),
        title: String(task.title || '未命名任务').trim(),
        goal: String(task.goal || '').trim(),
        threadKey: String(task.threadKey || 'default').trim(),
        status: String(task.status || 'completed').trim(),
        intent: task.intent || null,
        capabilityIds: Array.isArray(task.capabilityIds) ? task.capabilityIds : [],
        contextSnapshot: task.contextSnapshot && typeof task.contextSnapshot === 'object'
            ? task.contextSnapshot
            : {},
        uiContext: task.uiContext && typeof task.uiContext === 'object'
            ? task.uiContext
            : {},
        selectedSkillIds: Array.isArray(task.selectedSkillIds) ? task.selectedSkillIds : [],
        selectedSkillLabels: Array.isArray(task.selectedSkillLabels) ? task.selectedSkillLabels : [],
        reasoning: Array.isArray(task.reasoning) ? task.reasoning : [],
        planKind: String(task.planKind || 'single_tool').trim(),
        planMetadata: task.planMetadata && typeof task.planMetadata === 'object'
            ? task.planMetadata
            : {},
        sessionId: String(task.sessionId || '').trim(),
        parentTaskId: String(task.parentTaskId || '').trim(),
        memoryIds: Array.isArray(task.memoryIds) ? task.memoryIds.filter(Boolean).map((item) => String(item).trim()) : [],
        resumeContext: task.resumeContext && typeof task.resumeContext === 'object'
            ? task.resumeContext
            : {},
        workspaceSnapshot: task.workspaceSnapshot && typeof task.workspaceSnapshot === 'object'
            ? task.workspaceSnapshot
            : {},
        recoveryIntent: task.recoveryIntent && typeof task.recoveryIntent === 'object'
            ? task.recoveryIntent
            : {},
        nextActions: Array.isArray(task.nextActions) ? task.nextActions.map(normalizeNextAction).filter(Boolean) : [],
        recoveryState: task.recoveryState && typeof task.recoveryState === 'object'
            ? task.recoveryState
            : {},
        checkpointSummary: String(task.checkpointSummary || '').trim(),
        subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
        checkpoints: Array.isArray(task.checkpoints) ? task.checkpoints : [],
        steps: Array.isArray(task.steps) ? task.steps : [],
        workerTree: Array.isArray(task.workerTree) ? task.workerTree : [],
        stepResults: task.stepResults && typeof task.stepResults === 'object'
            ? task.stepResults
            : {},
        executionLogs: Array.isArray(task.executionLogs) ? task.executionLogs : [],
        artifacts: Array.isArray(task.artifacts) ? task.artifacts : [],
        resultSummary: String(task.resultSummary || '').trim(),
        createdAt: task.createdAt || new Date().toISOString(),
        updatedAt: task.updatedAt || task.createdAt || new Date().toISOString(),
    };
}

export function loadFireflyTasks() {
    if (!canUseStorage()) {
        return [];
    }

    try {
        const raw = JSON.parse(localStorage.getItem(FIREFLY_TASKS_STORAGE_KEY) || '[]');
        return Array.isArray(raw)
            ? raw.map(normalizeTask).sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
            : [];
    } catch (error) {
        console.error('Failed to restore Firefly tasks:', error);
        return [];
    }
}

export function saveFireflyTasks(tasks = []) {
    if (!canUseStorage()) {
        return [];
    }

    const normalized = tasks
        .map(normalizeTask)
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
        .slice(0, 80);

    try {
        localStorage.setItem(FIREFLY_TASKS_STORAGE_KEY, JSON.stringify(normalized));
        window.dispatchEvent(new CustomEvent(FIREFLY_TASKS_EVENT, {
            detail: normalized,
        }));
    } catch (error) {
        console.error('Failed to persist Firefly tasks:', error);
    }

    return normalized;
}

export function upsertFireflyTask(task) {
    const current = loadFireflyTasks();
    const nextTask = normalizeTask(task);
    const preserved = current.filter((item) => item.id !== nextTask.id);
    return saveFireflyTasks([nextTask, ...preserved]);
}

export function patchFireflyTask(taskId, patch = {}) {
    const current = loadFireflyTasks();
    const next = current.map((task) => (
        task.id === taskId
            ? normalizeTask({
                ...task,
                ...patch,
                updatedAt: new Date().toISOString(),
            })
            : task
    ));

    return saveFireflyTasks(next);
}

export function removeFireflyTask(taskId) {
    const current = loadFireflyTasks();
    const next = current.filter((task) => task.id !== taskId);
    return saveFireflyTasks(next);
}

export function subscribeFireflyTasks(callback) {
    if (!canUseStorage()) {
        return () => {};
    }

    const handleSync = (event) => {
        if (Array.isArray(event.detail)) {
            callback(event.detail);
            return;
        }

        callback(loadFireflyTasks());
    };

    const handleStorage = (event) => {
        if (event.key === FIREFLY_TASKS_STORAGE_KEY) {
            callback(loadFireflyTasks());
        }
    };

    window.addEventListener(FIREFLY_TASKS_EVENT, handleSync);
    window.addEventListener('storage', handleStorage);

    return () => {
        window.removeEventListener(FIREFLY_TASKS_EVENT, handleSync);
        window.removeEventListener('storage', handleStorage);
    };
}

export function buildFireflyTaskRecoveryMetrics(tasks = []) {
    const list = Array.isArray(tasks) ? tasks : [];
    return {
        total: list.length,
        recoverable: list.filter((item) => item.recoveryState?.ready).length,
        resumed: list.filter((item) => item.planMetadata?.isResume).length,
        withNextActions: list.filter((item) => Array.isArray(item.nextActions) && item.nextActions.length > 0).length,
    };
}
