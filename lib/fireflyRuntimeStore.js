import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

const RUNTIME_ROOT = path.join(process.cwd(), '.runtime', 'firefly');
const STATE_FILE = path.join(RUNTIME_ROOT, 'runtime-state.json');
const EVENTS_FILE = path.join(RUNTIME_ROOT, 'runtime-events.jsonl');
const MAX_RUNTIME_EVENTS = 500;
const MAX_RUNS = 200;
const MAX_TASKS = 200;
const MAX_SESSIONS = 120;
const MAX_WORKSPACES = 100;
const MAX_RECOVERY_EVENTS = 10;

let runtimeMutationQueue = Promise.resolve();

function now() {
    return new Date().toISOString();
}

function buildId(prefix = 'firefly') {
    return `${prefix}-${crypto.randomUUID()}`;
}

function defaultState() {
    return {
        sessions: [],
        tasks: [],
        runs: [],
        workspaces: [],
        events: [],
    };
}

function limit(list = [], size = 120) {
    return Array.isArray(list) ? list.slice(0, size) : [];
}

function sortByUpdatedAt(list = []) {
    return [...list].sort((left, right) => {
        const leftTime = new Date(left?.updatedAt || left?.createdAt || 0).getTime();
        const rightTime = new Date(right?.updatedAt || right?.createdAt || 0).getTime();
        return rightTime - leftTime;
    });
}

async function ensureRuntimeRoot() {
    await fs.mkdir(RUNTIME_ROOT, { recursive: true });
}

async function atomicWrite(filePath, content) {
    const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempFilePath, content, 'utf8');
    await fs.rename(tempFilePath, filePath);
}

async function backupCorruptedState(raw = '') {
    await ensureRuntimeRoot();
    const backupFile = path.join(RUNTIME_ROOT, `runtime-state.corrupt-${Date.now()}.json`);
    await fs.writeFile(backupFile, raw, 'utf8');
    return backupFile;
}

function normalizeWorkspaceRecord({
    threadKey = '',
    capabilityIds = [],
    contextSnapshot = {},
} = {}) {
    const pathValue = String(
        contextSnapshot.pathname
        || contextSnapshot.pagePath
        || contextSnapshot.href
        || ''
    ).trim();

    return {
        id: pathValue || String(threadKey || buildId('workspace')).trim(),
        threadKey: String(threadKey || '').trim(),
        moduleLabel: String(
            contextSnapshot.moduleLabel
            || contextSnapshot.workspaceTitle
            || contextSnapshot.surfaceLabel
            || ''
        ).trim(),
        pageLabel: String(
            contextSnapshot.pageLabel
            || contextSnapshot.activeTabLabel
            || contextSnapshot.viewLabel
            || ''
        ).trim(),
        path: pathValue,
        activeTabId: String(contextSnapshot.activeTabId || contextSnapshot.tabId || '').trim(),
        drawerTarget: String(contextSnapshot.drawerTarget || '').trim(),
        historyOrigin: String(contextSnapshot.historyOrigin || '').trim(),
        capabilityIds: Array.isArray(capabilityIds) ? capabilityIds.filter(Boolean) : [],
        updatedAt: now(),
    };
}

function normalizeRunRecord(record = {}) {
    return {
        id: String(record.id || buildId('run')).trim(),
        threadKey: String(record.threadKey || 'default').trim(),
        sessionKey: String(record.sessionKey || record.threadKey || 'default').trim(),
        taskId: String(record.taskId || '').trim(),
        uid: String(record.uid || '').trim(),
        fid: String(record.fid || '').trim(),
        question: String(record.question || '').trim(),
        title: String(record.title || '').trim(),
        status: String(record.status || 'created').trim(),
        phase: String(record.phase || 'booting').trim(),
        capabilityIds: Array.isArray(record.capabilityIds) ? record.capabilityIds.filter(Boolean) : [],
        selectedSkillLabels: Array.isArray(record.selectedSkillLabels) ? record.selectedSkillLabels.filter(Boolean) : [],
        currentStepLabel: String(record.currentStepLabel || '').trim(),
        resultSummary: String(record.resultSummary || '').trim(),
        workspaceId: String(record.workspaceId || '').trim(),
        createdAt: record.createdAt || now(),
        updatedAt: record.updatedAt || record.createdAt || now(),
    };
}

function normalizeTaskRecord(task = {}, extra = {}) {
    return {
        id: String(task.id || '').trim(),
        threadKey: String(task.threadKey || 'default').trim(),
        title: String(task.title || '未命名任务').trim(),
        goal: String(task.goal || '').trim(),
        status: String(task.status || 'planning').trim(),
        intent: task.intent && typeof task.intent === 'object' ? task.intent : null,
        intentLabel: String(task.intent?.label || '').trim(),
        planKind: String(task.planKind || 'single_tool').trim(),
        capabilityIds: Array.isArray(task.capabilityIds) ? task.capabilityIds.filter(Boolean) : [],
        selectedSkillIds: Array.isArray(task.selectedSkillIds) ? task.selectedSkillIds.filter(Boolean) : [],
        selectedSkillLabels: Array.isArray(task.selectedSkillLabels) ? task.selectedSkillLabels.filter(Boolean) : [],
        memoryIds: Array.isArray(task.memoryIds) ? task.memoryIds.filter(Boolean) : [],
        reasoning: Array.isArray(task.reasoning) ? task.reasoning : [],
        planMetadata: task.planMetadata && typeof task.planMetadata === 'object' ? task.planMetadata : {},
        contextSnapshot: task.contextSnapshot && typeof task.contextSnapshot === 'object' ? task.contextSnapshot : {},
        resumeContext: task.resumeContext && typeof task.resumeContext === 'object' ? task.resumeContext : {},
        workspaceSnapshot: task.workspaceSnapshot || {},
        recoveryIntent: task.recoveryIntent && typeof task.recoveryIntent === 'object' ? task.recoveryIntent : {},
        recoveryState: task.recoveryState || {},
        checkpointSummary: String(task.checkpointSummary || '').trim(),
        subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
        checkpoints: Array.isArray(task.checkpoints) ? task.checkpoints : [],
        nextActions: Array.isArray(task.nextActions) ? task.nextActions : [],
        steps: Array.isArray(task.steps) ? task.steps : [],
        workerTree: Array.isArray(task.workerTree) ? task.workerTree : [],
        stepResults: task.stepResults && typeof task.stepResults === 'object' ? task.stepResults : {},
        executionLogs: Array.isArray(task.executionLogs) ? task.executionLogs : [],
        artifacts: Array.isArray(task.artifacts) ? task.artifacts : [],
        sessionId: String(task.sessionId || '').trim(),
        parentTaskId: String(task.parentTaskId || '').trim(),
        runId: String(extra.runId || task.runId || '').trim(),
        controlState: String(task.controlState || 'idle').trim(),
        controlUpdatedAt: String(task.controlUpdatedAt || '').trim(),
        controlNote: String(task.controlNote || '').trim(),
        resultSummary: String(task.resultSummary || '').trim(),
        updatedAt: task.updatedAt || now(),
        createdAt: task.createdAt || now(),
    };
}

function normalizeSessionRecord(record = {}) {
    return {
        id: String(record.id || record.threadKey || buildId('session')).trim(),
        threadKey: String(record.threadKey || 'default').trim(),
        title: String(record.title || '').trim(),
        status: String(record.status || 'idle').trim(),
        capabilityIds: Array.isArray(record.capabilityIds) ? record.capabilityIds.filter(Boolean) : [],
        lastTaskId: String(record.lastTaskId || '').trim(),
        lastRunId: String(record.lastRunId || '').trim(),
        workspaceId: String(record.workspaceId || '').trim(),
        updatedAt: record.updatedAt || now(),
        createdAt: record.createdAt || now(),
    };
}

function normalizeEventRecord(runId, payload = {}) {
    return {
        id: buildId('event'),
        runId: String(runId || '').trim(),
        type: String(payload.type || 'runtime_event').trim(),
        label: String(payload.label || payload.type || '运行事件').trim(),
        detail: String(payload.detail || '').trim(),
        taskId: String(payload.taskId || '').trim(),
        threadKey: String(payload.threadKey || '').trim(),
        stepId: String(payload.stepId || '').trim(),
        skillId: String(payload.skillId || '').trim(),
        level: String(payload.level || 'info').trim(),
        metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
        createdAt: now(),
    };
}

function mergeToFront(list = [], item, key = 'id', size = 100) {
    return limit([item, ...list.filter((entry) => entry?.[key] !== item?.[key])], size);
}

async function readState() {
    await ensureRuntimeRoot();
    try {
        const raw = await fs.readFile(STATE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            ...defaultState(),
            ...(parsed || {}),
        };
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return defaultState();
        }

        if (error instanceof SyntaxError) {
            const raw = await fs.readFile(STATE_FILE, 'utf8').catch(() => '');
            if (raw) {
                await backupCorruptedState(raw);
            }
            await atomicWrite(STATE_FILE, JSON.stringify(defaultState(), null, 2));
            return defaultState();
        }

        throw error;
    }
}

async function writeState(state) {
    await ensureRuntimeRoot();
    await atomicWrite(STATE_FILE, JSON.stringify(state, null, 2));
}

async function appendEventLine(event) {
    await ensureRuntimeRoot();
    await fs.appendFile(EVENTS_FILE, `${JSON.stringify(event)}\n`, 'utf8');
}

function enqueueRuntimeMutation(mutator) {
    const scheduled = runtimeMutationQueue.then(async () => {
        const state = await readState();
        const result = await mutator(state);
        const nextState = result?.state || state;
        await writeState(nextState);

        if (Array.isArray(result?.eventsToAppend)) {
            for (const event of result.eventsToAppend) {
                await appendEventLine(event);
            }
        }

        return result?.value ?? null;
    });

    runtimeMutationQueue = scheduled.catch(() => {});
    return scheduled;
}

function pickRecoveryTask(tasks = [], threadKey = '') {
    return sortByUpdatedAt(tasks).find((task) => (
        task.threadKey === threadKey
        && ['running', 'planning', 'awaiting_approval', 'completed', 'failed'].includes(task.status)
    )) || null;
}

function buildRecoverySummary(task = null, session = null, run = null, events = []) {
    if (!task && !session && !run) {
        return '';
    }

    const lines = [
        '## 服务端运行恢复',
    ];

    if (task) {
        lines.push(
            `- 最近任务：${task.title || '未命名任务'}`,
            `- 任务状态：${task.status || '未知状态'}`,
        );

        if (task.resultSummary) {
            lines.push(`- 当前摘要：${task.resultSummary}`);
        }

        if (Array.isArray(task.selectedSkillLabels) && task.selectedSkillLabels.length) {
            lines.push(`- 最近能力：${task.selectedSkillLabels.join('、')}`);
        }

        if (task.checkpointSummary) {
            lines.push(`- 运行检查点：${task.checkpointSummary}`);
        }
    }

    if (session?.title && session.title !== task?.title) {
        lines.push(`- 会话标题：${session.title}`);
    }

    if (run?.phase) {
        lines.push(`- 当前阶段：${run.phase}`);
    }

    if (events.length) {
        lines.push('', '### 最近事件');
        events.slice(0, MAX_RECOVERY_EVENTS).forEach((event, index) => {
            lines.push(`${index + 1}. ${event.label}${event.detail ? `：${event.detail}` : ''}`);
        });
    }

    return lines.join('\n');
}

export async function createFireflyRuntimeRun({
    threadKey,
    question,
    capabilityIds = [],
    contextSnapshot = {},
    uid = '',
    fid = '',
    task = null,
}) {
    return enqueueRuntimeMutation(async (state) => {
        const createdAt = now();
        const workspace = normalizeWorkspaceRecord({ threadKey, capabilityIds, contextSnapshot });
        const run = normalizeRunRecord({
            id: buildId('run'),
            threadKey,
            sessionKey: threadKey,
            taskId: task?.id || '',
            uid,
            fid,
            question,
            title: task?.title || '',
            status: task?.status || 'planning',
            phase: 'created',
            capabilityIds,
            selectedSkillLabels: task?.selectedSkillLabels || [],
            workspaceId: workspace.id,
            createdAt,
            updatedAt: createdAt,
        });
        const session = normalizeSessionRecord({
            id: threadKey,
            threadKey,
            title: task?.title || question.slice(0, 30) || '萤火虫会话',
            status: task?.status || 'planning',
            capabilityIds,
            lastTaskId: task?.id || '',
            lastRunId: run.id,
            workspaceId: workspace.id,
            createdAt,
            updatedAt: createdAt,
        });
        const event = {
            id: buildId('event'),
            runId: run.id,
            type: 'run_created',
            label: '创建运行',
            detail: question,
            createdAt,
        };

        state.workspaces = mergeToFront(state.workspaces, workspace, 'id', MAX_WORKSPACES);
        state.runs = mergeToFront(state.runs, run, 'id', MAX_RUNS);
        state.sessions = mergeToFront(state.sessions, session, 'id', MAX_SESSIONS);
        state.events = limit([event, ...state.events], MAX_RUNTIME_EVENTS);

        return {
            state,
            value: run,
            eventsToAppend: [event],
        };
    });
}

export async function patchFireflyRuntimeRun(runId, patch = {}) {
    if (!runId) {
        return null;
    }

    return enqueueRuntimeMutation(async (state) => {
        let updatedRun = null;

        state.runs = state.runs.map((item) => {
            if (item.id !== runId) {
                return item;
            }

            updatedRun = normalizeRunRecord({
                ...item,
                ...patch,
                updatedAt: now(),
            });
            return updatedRun;
        });

        return {
            state,
            value: updatedRun,
        };
    });
}

export async function appendFireflyRuntimeEvent(runId, payload = {}) {
    return enqueueRuntimeMutation(async (state) => {
        const event = normalizeEventRecord(runId, payload);
        state.events = limit([event, ...state.events], MAX_RUNTIME_EVENTS);

        return {
            state,
            value: event,
            eventsToAppend: [event],
        };
    });
}

export async function upsertFireflyRuntimeTask(task, extra = {}) {
    if (!task?.id) {
        return null;
    }

    return enqueueRuntimeMutation(async (state) => {
        const normalized = normalizeTaskRecord(task, extra);
        state.tasks = mergeToFront(state.tasks, normalized, 'id', MAX_TASKS);

        return {
            state,
            value: normalized,
        };
    });
}

export async function patchFireflyRuntimeTask(taskId, patch = {}) {
    if (!taskId) {
        return null;
    }

    return enqueueRuntimeMutation(async (state) => {
        let updatedTask = null;

        state.tasks = state.tasks.map((item) => {
            if (item.id !== taskId) {
                return item;
            }

            updatedTask = normalizeTaskRecord({
                ...item,
                ...patch,
                updatedAt: now(),
            }, {
                runId: patch.runId || item.runId || '',
            });
            return updatedTask;
        });

        return {
            state,
            value: updatedTask,
        };
    });
}

export async function syncFireflyRuntimeSession({
    threadKey,
    title = '',
    status = 'idle',
    capabilityIds = [],
    lastTaskId = '',
    lastRunId = '',
    workspaceId = '',
}) {
    if (!threadKey) {
        return null;
    }

    return enqueueRuntimeMutation(async (state) => {
        const existing = state.sessions.find((item) => item.id === threadKey);
        const session = normalizeSessionRecord({
            ...existing,
            id: threadKey,
            threadKey,
            title,
            status,
            capabilityIds,
            lastTaskId,
            lastRunId,
            workspaceId,
            updatedAt: now(),
            createdAt: existing?.createdAt || now(),
        });
        state.sessions = mergeToFront(state.sessions, session, 'id', MAX_SESSIONS);

        return {
            state,
            value: session,
        };
    });
}

export async function listFireflyRuntimeState() {
    await runtimeMutationQueue.catch(() => {});
    const state = await readState();

    return {
        sessions: state.sessions || [],
        tasks: state.tasks || [],
        runs: state.runs || [],
        workspaces: state.workspaces || [],
        events: state.events || [],
        storage: {
            root: RUNTIME_ROOT,
            stateFile: STATE_FILE,
            eventsFile: EVENTS_FILE,
        },
    };
}

export async function getFireflyRuntimeThread(threadKey = '') {
    if (!threadKey) {
        return null;
    }

    const runtime = await listFireflyRuntimeState();
    const sessions = runtime.sessions.filter((item) => item.threadKey === threadKey || item.id === threadKey);
    const tasks = sortByUpdatedAt(runtime.tasks.filter((item) => item.threadKey === threadKey));
    const runs = sortByUpdatedAt(runtime.runs.filter((item) => item.threadKey === threadKey));
    const workspaceIds = new Set([
        ...tasks.map((item) => item.workspaceSnapshot?.path || '').filter(Boolean),
        ...runs.map((item) => item.workspaceId).filter(Boolean),
        ...sessions.map((item) => item.workspaceId).filter(Boolean),
    ]);
    const workspaces = sortByUpdatedAt(runtime.workspaces.filter((item) => (
        item.threadKey === threadKey || workspaceIds.has(item.id)
    )));
    const runIds = new Set(runs.map((item) => item.id));
    const events = runtime.events.filter((item) => runIds.has(item.runId)).slice(0, MAX_RUNTIME_EVENTS);
    const session = sortByUpdatedAt(sessions)[0] || null;
    const activeTask = pickRecoveryTask(tasks, threadKey);
    const activeRun = runs[0] || null;

    return {
        threadKey,
        session,
        activeTask,
        activeRun,
        tasks,
        runs,
        workspaces,
        events,
        recovery: {
            available: Boolean(activeTask || session || activeRun),
            summary: buildRecoverySummary(activeTask, session, activeRun, events),
            preferredToolIds: Array.isArray(activeTask?.selectedSkillIds)
                ? activeTask.selectedSkillIds.filter(Boolean)
                : [],
        },
    };
}

export async function getFireflyRuntimeRecovery(threadKey = '') {
    const thread = await getFireflyRuntimeThread(threadKey);

    if (!thread) {
        return {
            available: false,
            threadKey,
            summary: '',
            task: null,
            session: null,
            run: null,
            events: [],
            preferredToolIds: [],
            contextSnapshot: {},
        };
    }

    const activeTask = thread.activeTask;

    return {
        available: thread.recovery.available,
        threadKey,
        summary: thread.recovery.summary,
        task: activeTask,
        session: thread.session,
        run: thread.activeRun,
        events: thread.events,
        preferredToolIds: Array.isArray(activeTask?.nextActions)
            ? [
                ...(Array.isArray(activeTask?.selectedSkillIds) ? activeTask.selectedSkillIds.filter(Boolean) : []),
                ...activeTask.nextActions.flatMap((item) => Array.isArray(item.preferredToolIds) ? item.preferredToolIds : []),
            ].filter((item, index, array) => item && array.indexOf(item) === index)
            : [],
        contextSnapshot: activeTask?.workspaceSnapshot || thread.workspaces[0] || {},
    };
}
