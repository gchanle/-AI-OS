'use client';

import Link from 'next/link';
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    buildFireflyDirectiveDisplay,
    buildFireflyStepDirectiveMap,
    formatFireflyControlAction,
} from '@/lib/fireflyRuntimeDirectiveSummary';
import {
    buildFireflyExecutionImpactDiff,
    buildFireflyGovernanceSuggestions,
    buildFireflyPlannerExplainers,
    buildFireflyExecutionPreview,
} from '@/lib/fireflyExecutionPreview';
import './FireflyThreadRuntimePanel.css';

function formatDateTime(value) {
    if (!value) {
        return '刚刚';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value || '刚刚');
    }

    return date.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatTaskStatus(status = '') {
    if (status === 'awaiting_approval') return '等待审批';
    if (status === 'completed') return '已完成';
    if (status === 'failed') return '失败';
    if (status === 'in_progress') return '进行中';
    if (status === 'running') return '执行中';
    if (status === 'planning') return '规划中';
    if (status === 'paused') return '已暂停';
    if (status === 'rejected') return '已拒绝';
    if (status === 'idle') return '空闲';
    if (status === 'pending') return '待开始';
    return status || '处理中';
}

function summarizePath(value = '') {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return '未建立';
    }

    const segments = normalized.split('/').filter(Boolean);
    if (segments.length <= 4) {
        return normalized;
    }

    return `.../${segments.slice(-4).join('/')}`;
}

function summarizeList(items = [], fallback = '暂无') {
    const values = Array.isArray(items) ? items.filter(Boolean) : [];
    return values.length > 0 ? values.join('、') : fallback;
}

function truncate(value = '', limit = 108) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= limit) {
        return normalized;
    }

    return `${normalized.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function formatMemoryType(type = '') {
    if (type === 'workflow_hint') return '流程线索';
    if (type === 'task_result') return '任务结果';
    if (type === 'user_preference') return '用户偏好';
    if (type === 'reading_context') return '阅读上下文';
    return type || '记忆';
}

function formatPriorityBand(priorityBand = '') {
    if (priorityBand === 'critical') return '关键';
    if (priorityBand === 'high') return '高优先';
    if (priorityBand === 'working') return '工作中';
    return '标准';
}

function formatSourceKind(kind = '') {
    if (kind === 'web_runtime') return '联网';
    if (kind === 'research_runtime') return '研究';
    if (kind === 'skill_adapter') return 'Skill';
    if (kind === 'mcp_backed') return 'MCP';
    if (kind === 'connector_backed') return '连接器';
    if (kind === 'thread_workspace') return '工作区';
    if (kind === 'url_runtime') return 'URL';
    if (kind === 'composed_runtime') return '内建';
    return kind || '工具';
}

function formatGovernanceKind(kind = '') {
    if (kind === 'memory') return '记忆';
    if (kind === 'tool') return '工具';
    if (kind === 'policy') return '策略';
    return kind || '治理';
}

function describeGovernanceImpact(event = {}) {
    const action = String(event.action || '').trim();
    if (action === 'tool_pin') return '再次应用后，这个工具会更稳定地进入下一轮优先候选。';
    if (action === 'tool_unpin') return '回到未固定状态后，planner 会更依赖自动收敛。';
    if (action === 'tool_lease') return '再次应用后，这个工具会在当前线程里被临时抬高优先级。';
    if (action === 'tool_revoke') return '撤销后，这个工具不会再享受线程级临时偏置。';
    if (action === 'tool_block') return '屏蔽后，下一轮不会再调度这个工具。';
    if (action === 'tool_unblock') return '恢复后，planner 会把这个工具重新纳入候选空间。';
    if (action === 'tool_require_confirm') return '命中该工具时，会先在前台暂停等你确认。';
    if (action === 'tool_skip_confirm') return '该工具命中后会恢复直接执行，不再先暂停确认。';
    if (action === 'settings_update') return '再次应用后，下一轮 managed context 会按这套前台策略重新生成。';
    if (action === 'memory_update') return '再次应用后，这条记忆的优先级/冻结状态会继续影响记忆注入。';
    if (action === 'memory_create' || action === 'memory_remember_task') return '再次应用后，这条记忆会继续作为下一轮规划的长期上下文输入。';
    if (action === 'memory_summarize') return '再次应用后，会再生成一条压缩记忆，帮助跨周期续跑。';
    if (action === 'memory_delete') return '回滚后，这条记忆会重新回到可注入集合。';
    return '再次应用后，下一轮执行路径会按这条治理动作重新收敛。';
}

function sortToolsByControlState(catalog = [], toolbeltMap = new Map(), blockedToolSet = new Set(), confirmBeforeUseSet = new Set()) {
    return [...catalog].sort((left, right) => {
        const leftState = toolbeltMap.get(left.id) || null;
        const rightState = toolbeltMap.get(right.id) || null;
        const leftPinned = leftState?.pinned ? 1 : 0;
        const rightPinned = rightState?.pinned ? 1 : 0;
        if (rightPinned !== leftPinned) {
            return rightPinned - leftPinned;
        }

        const leftLeased = leftState?.leased ? 1 : 0;
        const rightLeased = rightState?.leased ? 1 : 0;
        if (rightLeased !== leftLeased) {
            return rightLeased - leftLeased;
        }

        const leftBlocked = blockedToolSet.has(left.id) ? 1 : 0;
        const rightBlocked = blockedToolSet.has(right.id) ? 1 : 0;
        if (leftBlocked !== rightBlocked) {
            return leftBlocked - rightBlocked;
        }

        const leftConfirm = confirmBeforeUseSet.has(left.id) ? 1 : 0;
        const rightConfirm = confirmBeforeUseSet.has(right.id) ? 1 : 0;
        if (rightConfirm !== leftConfirm) {
            return rightConfirm - leftConfirm;
        }

        const leftScore = Number(leftState?.successCount || 0) - Number(leftState?.failureCount || 0);
        const rightScore = Number(rightState?.successCount || 0) - Number(rightState?.failureCount || 0);
        if (rightScore !== leftScore) {
            return rightScore - leftScore;
        }

        return String(left.name || left.id).localeCompare(String(right.name || right.id), 'zh-CN');
    });
}

function buildScopeQuery({ uid = '', fid = '', threadKey = '', capabilityIds = [] } = {}) {
    const params = new URLSearchParams();
    if (uid) params.set('uid', uid);
    if (fid) params.set('fid', fid);
    if (threadKey) params.set('threadKey', threadKey);
    (Array.isArray(capabilityIds) ? capabilityIds : []).filter(Boolean).forEach((item) => {
        params.append('capabilityIds', item);
    });
    return params.toString();
}

function buildDefaultInspectorState() {
    return {
        loading: false,
        error: '',
        message: '',
        memoryEntries: [],
        toolbelt: {
            items: [],
            pinnedToolIds: [],
            leasedToolIds: [],
            preferredToolIds: [],
            strategy: {
                pinnedCount: 0,
                leasedCount: 0,
                learnedCount: 0,
            },
        },
        toolCatalog: [],
        controlPlanePrefs: {
            presetId: 'balanced',
            memory: {
                injectTopK: 4,
                autoRememberTasks: true,
                defaultPriorityBand: 'standard',
            },
            tools: {
                selectionMode: 'auto',
                webSearchMode: 'auto',
                blockedToolIds: [],
                confirmBeforeUseToolIds: [],
            },
        },
        governanceEvents: [],
    };
}

function buildWorkerStatus(worker = {}, task = null, relatedRuns = []) {
    const stepIds = new Set(Array.isArray(worker.stepIds) ? worker.stepIds : []);
    const relatedSteps = Array.isArray(task?.steps)
        ? task.steps.filter((step) => step.workerId === worker.id || stepIds.has(step.id))
        : [];
    const statuses = [
        ...relatedSteps.map((step) => String(step.status || '').trim()).filter(Boolean),
        ...relatedRuns.map((item) => String(item.status || '').trim()).filter(Boolean),
    ];

    if (statuses.includes('failed')) return 'failed';
    if (statuses.includes('awaiting_approval')) return 'awaiting_approval';
    if (statuses.includes('paused')) return 'paused';
    if (statuses.includes('rejected')) return 'rejected';
    if (statuses.includes('running') || statuses.includes('planning') || statuses.includes('in_progress')) return 'running';
    if (statuses.length > 0 && statuses.every((item) => item === 'completed')) return 'completed';
    return String(worker.status || 'pending').trim() || 'pending';
}

function pickRelevantSubagents(detail = {}, task = null) {
    const runs = Array.isArray(detail?.subagents) ? detail.subagents : [];
    const activeRunId = String(detail?.thread?.activeRun?.id || '').trim();
    const taskId = String(task?.id || '').trim();
    const taskRunId = String(task?.runId || '').trim();

    if (!taskId && !activeRunId && !taskRunId) {
        return [...runs]
            .sort((left, right) => (
                new Date(right.updatedAt || right.createdAt || 0).getTime()
                - new Date(left.updatedAt || left.createdAt || 0).getTime()
            ));
    }

    const filtered = runs.filter((item) => (
        item.parentTaskId === taskId
        || item.parentRunId === activeRunId
        || item.parentRunId === taskRunId
    ));

    return [...(filtered.length > 0 ? filtered : runs)]
        .sort((left, right) => (
            new Date(right.updatedAt || right.createdAt || 0).getTime()
            - new Date(left.updatedAt || left.createdAt || 0).getTime()
        ));
}

function buildWorkerCards(task = null, subagents = []) {
    const workerTree = Array.isArray(task?.workerTree) ? task.workerTree : [];
    if (!workerTree.length) {
        return [];
    }

    return workerTree.map((worker) => {
        const stepIds = new Set(Array.isArray(worker.stepIds) ? worker.stepIds : []);
        const relatedRuns = subagents.filter((item) => (
            item.workerId === worker.id
            || (item.stepId && stepIds.has(item.stepId))
        ));
        const relatedSteps = Array.isArray(task?.steps)
            ? task.steps.filter((step) => step.workerId === worker.id || stepIds.has(step.id))
            : [];

        return {
            ...worker,
            workerStatus: buildWorkerStatus(worker, task, relatedRuns),
            relatedRuns,
            relatedSteps,
            latestRun: relatedRuns[0] || null,
        };
    }).sort((left, right) => {
        if (left.id === 'supervisor-root') return -1;
        if (right.id === 'supervisor-root') return 1;
        return String(left.label || '').localeCompare(String(right.label || ''), 'zh-CN');
    });
}

function buildPanelSummary({
    loading = false,
    error = '',
    detail = null,
    task = null,
    threadState = null,
    subagents = [],
    workers = [],
} = {}) {
    if (error) {
        return error;
    }

    if (loading && !detail) {
        return '正在同步线程运行态…';
    }

    if (task?.resultSummary) {
        return task.resultSummary;
    }

    if (threadState?.checkpointSummary) {
        return threadState.checkpointSummary;
    }

    if (detail?.thread?.recovery?.summary) {
        return detail.thread.recovery.summary;
    }

    if (workers.length > 0 || subagents.length > 0) {
        return `已编排 ${workers.length} 个 worker，记录 ${subagents.length} 条可追踪运行。`;
    }

    return '当前线程还没有形成完整的运行结构。';
}

function isLiveRuntime(task = null, detail = null) {
    const taskStatus = String(task?.status || '').trim();
    const runPhase = String(detail?.thread?.activeRun?.phase || '').trim();
    return ['planning', 'running', 'awaiting_approval', 'paused', 'rejected'].includes(taskStatus)
        || ['booting', 'planned', 'task_started', 'step_started', 'reply_started'].includes(runPhase);
}

function formatControlStateLabel(controlState = '') {
    if (controlState === 'paused') return '已暂停';
    if (controlState === 'rejected') return '已拒绝';
    if (controlState === 'approved') return '已允许继续';
    return '';
}

function pickWorkerAwaitingApprovalStep(worker = {}) {
    return Array.isArray(worker.relatedSteps)
        ? worker.relatedSteps.find((step) => step.status === 'awaiting_approval') || null
        : null;
}

function pickWorkerFailedStep(worker = {}) {
    return Array.isArray(worker.relatedSteps)
        ? worker.relatedSteps.find((step) => step.status === 'failed') || null
        : null;
}

function buildWorkerFocusSummary(worker = {}) {
    const awaitingStep = pickWorkerAwaitingApprovalStep(worker);
    if (awaitingStep) {
        return awaitingStep.approvalReason || awaitingStep.summary || '当前 worker 正在等待你批准继续。';
    }

    const failedStep = pickWorkerFailedStep(worker);
    if (failedStep) {
        return failedStep.summary || failedStep.purpose || '当前 worker 有失败步骤，可单独重跑。';
    }

    if (worker.latestRun?.summary) {
        return worker.latestRun.summary;
    }

    return '当前 worker 尚未产生可直接接管的动作。';
}

export default function FireflyThreadRuntimePanel({
    threadKey = '',
    activeTask = null,
    controlState = null,
    onControlAction = null,
    userProfile = null,
    capabilityIds = [],
    className = '',
    defaultExpanded = true,
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [runtimeState, setRuntimeState] = useState({
        loading: false,
        error: '',
        detail: null,
    });
    const [inspectorState, setInspectorState] = useState(() => buildDefaultInspectorState());
    const [pendingInspectorAction, setPendingInspectorAction] = useState('');
    const [pendingInspectorBatchAction, setPendingInspectorBatchAction] = useState('');
    const [takeoverNote, setTakeoverNote] = useState('');
    const [memoryNoteDrafts, setMemoryNoteDrafts] = useState({});
    const [workerNoteDrafts, setWorkerNoteDrafts] = useState({});
    const [stepNoteDrafts, setStepNoteDrafts] = useState({});
    const [manualMemoryDraft, setManualMemoryDraft] = useState({
        title: '',
        summary: '',
        detail: '',
        memoryType: 'user_preference',
        priorityBand: 'standard',
        retentionPolicy: 'rolling',
        crossThreadPinned: false,
    });

    const normalizedThreadKey = String(threadKey || '').trim();
    const uid = String(userProfile?.uid || '').trim();
    const fid = String(userProfile?.fid || '').trim();
    const normalizedCapabilityIds = useMemo(
        () => (Array.isArray(capabilityIds) ? capabilityIds.filter(Boolean) : []),
        [capabilityIds]
    );

    useEffect(() => {
        setExpanded(defaultExpanded);
    }, [defaultExpanded]);

    const loadRuntimeDetail = useCallback(async () => {
        if (!normalizedThreadKey) {
            setRuntimeState({
                loading: false,
                error: '',
                detail: null,
            });
            return;
        }

        setRuntimeState((current) => ({
            loading: true,
            error: '',
            detail: current.detail,
        }));

        try {
            const response = await fetch(`/api/firefly/runtime?threadKey=${encodeURIComponent(normalizedThreadKey)}`, {
                cache: 'no-store',
            });
            const payload = await response.json();

            if (!response.ok || !payload?.ok) {
                throw new Error(payload?.error || '加载运行结构失败');
            }

            setRuntimeState({
                loading: false,
                error: '',
                detail: payload,
            });
        } catch (error) {
            setRuntimeState((current) => ({
                loading: false,
                error: error instanceof Error ? error.message : '加载运行结构失败',
                detail: current.detail,
            }));
        }
    }, [normalizedThreadKey]);

    const loadInspector = useCallback(async () => {
        if (!normalizedThreadKey) {
            setInspectorState(buildDefaultInspectorState());
            return;
        }

        setInspectorState((current) => ({
            ...current,
            loading: true,
            error: '',
        }));

        try {
            const scopeQuery = buildScopeQuery({
                uid,
                fid,
                threadKey: normalizedThreadKey,
                capabilityIds: normalizedCapabilityIds,
            });
            const response = await fetch(`/api/firefly/control-plane?${scopeQuery}`, {
                cache: 'no-store',
            });
            const payload = await response.json();

            if (!response.ok || !payload?.ok) {
                throw new Error(payload?.error || '加载运行 Inspector 失败');
            }

            setInspectorState({
                loading: false,
                error: '',
                message: '',
                memoryEntries: Array.isArray(payload.memory?.entries) ? payload.memory.entries : [],
                toolbelt: payload.toolbelt || buildDefaultInspectorState().toolbelt,
                toolCatalog: Array.isArray(payload.toolCatalog) ? payload.toolCatalog : [],
                controlPlanePrefs: payload.controlPlanePrefs || buildDefaultInspectorState().controlPlanePrefs,
                governanceEvents: Array.isArray(payload.governanceEvents) ? payload.governanceEvents : [],
            });
        } catch (error) {
            setInspectorState((current) => ({
                ...current,
                loading: false,
                error: error instanceof Error ? error.message : '加载运行 Inspector 失败',
            }));
        }
    }, [fid, normalizedCapabilityIds, normalizedThreadKey, uid]);

    const mutateInspector = useCallback(async (action, extraPayload = {}) => {
        if (!normalizedThreadKey) {
            return;
        }

        setPendingInspectorAction(action);
        setInspectorState((current) => ({
            ...current,
            error: '',
            message: '',
        }));

        try {
            const response = await fetch('/api/firefly/control-plane', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action,
                    uid,
                    fid,
                    threadKey: normalizedThreadKey,
                    capabilityIds: normalizedCapabilityIds,
                    ...extraPayload,
                }),
            });
            const payload = await response.json();
            if (!response.ok || !payload?.ok) {
                throw new Error(payload?.error || '更新运行 Inspector 失败');
            }

            setInspectorState({
                loading: false,
                error: '',
                message: String(payload.message || '').trim(),
                memoryEntries: Array.isArray(payload.memory?.entries) ? payload.memory.entries : [],
                toolbelt: payload.toolbelt || buildDefaultInspectorState().toolbelt,
                toolCatalog: Array.isArray(payload.toolCatalog) ? payload.toolCatalog : [],
                controlPlanePrefs: payload.controlPlanePrefs || buildDefaultInspectorState().controlPlanePrefs,
                governanceEvents: Array.isArray(payload.governanceEvents) ? payload.governanceEvents : [],
            });
        } catch (error) {
            setInspectorState((current) => ({
                ...current,
                error: error instanceof Error ? error.message : '更新运行 Inspector 失败',
            }));
        } finally {
            setPendingInspectorAction('');
        }
    }, [fid, normalizedCapabilityIds, normalizedThreadKey, uid]);

    const applySuggestionGroup = useCallback(async (group) => {
        const items = Array.isArray(group?.items) ? group.items : [];
        if (!normalizedThreadKey || !items.length) {
            return;
        }

        setPendingInspectorBatchAction(group.id);
        setInspectorState((current) => ({
            ...current,
            error: '',
            message: '',
        }));

        try {
            for (const item of items) {
                const response = await fetch('/api/firefly/control-plane', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: item.action,
                        uid,
                        fid,
                        threadKey: normalizedThreadKey,
                        capabilityIds: normalizedCapabilityIds,
                        ...(item.payload || {}),
                    }),
                });
                const payload = await response.json();
                if (!response.ok || !payload?.ok) {
                    throw new Error(payload?.error || '批量更新运行 Inspector 失败');
                }

                setInspectorState({
                    loading: false,
                    error: '',
                    message: String(payload.message || '').trim(),
                    memoryEntries: Array.isArray(payload.memory?.entries) ? payload.memory.entries : [],
                    toolbelt: payload.toolbelt || buildDefaultInspectorState().toolbelt,
                    toolCatalog: Array.isArray(payload.toolCatalog) ? payload.toolCatalog : [],
                    controlPlanePrefs: payload.controlPlanePrefs || buildDefaultInspectorState().controlPlanePrefs,
                    governanceEvents: Array.isArray(payload.governanceEvents) ? payload.governanceEvents : [],
                });
            }

            setInspectorState((current) => ({
                ...current,
                message: `已应用「${group.title}」建议。`,
            }));
        } catch (error) {
            setInspectorState((current) => ({
                ...current,
                error: error instanceof Error ? error.message : '批量更新运行 Inspector 失败',
            }));
        } finally {
            setPendingInspectorBatchAction('');
        }
    }, [fid, normalizedCapabilityIds, normalizedThreadKey, uid]);

    useEffect(() => {
        loadRuntimeDetail().catch(() => {});
    }, [
        loadRuntimeDetail,
        normalizedThreadKey,
        activeTask?.id,
        activeTask?.status,
        activeTask?.updatedAt,
    ]);

    const detail = runtimeState.detail;
    const thread = detail?.thread || null;
    const threadState = detail?.threadState && typeof detail.threadState === 'object'
        ? detail.threadState
        : null;
    const workspace = detail?.workspace && typeof detail.workspace === 'object'
        ? detail.workspace
        : null;
    const task = activeTask?.id ? activeTask : thread?.activeTask || null;
    const steps = useMemo(
        () => (Array.isArray(task?.steps) ? task.steps : []),
        [task?.steps]
    );
    const awaitingApprovalStep = steps.find((step) => step.status === 'awaiting_approval') || null;
    const failedSteps = steps.filter((step) => step.status === 'failed');
    const firstFailedStep = failedSteps[0] || null;
    const canControl = typeof onControlAction === 'function' && String(task?.id || '').trim();
    const taskIsBlocked = task?.controlState === 'rejected' || task?.controlState === 'paused';
    const taskIsRunning = task?.status === 'running' || task?.status === 'planning';
    const controlScopeMatch = controlState?.taskId === task?.id;
    const controlFeedbackMessage = controlScopeMatch ? String(controlState?.message || '').trim() : '';
    const controlFeedbackError = controlScopeMatch ? String(controlState?.error || '').trim() : '';
    const pendingAction = controlScopeMatch ? String(controlState?.pendingAction || '').trim() : '';
    const pendingStepId = controlScopeMatch ? String(controlState?.stepId || '').trim() : '';
    const controlStateLabel = formatControlStateLabel(task?.controlState);
    const showTaskControls = canControl && (
        Boolean(awaitingApprovalStep)
        || failedSteps.length > 0
        || task?.status === 'failed'
        || task?.controlState === 'paused'
        || task?.controlState === 'rejected'
    );
    const subagents = useMemo(
        () => pickRelevantSubagents(detail, task),
        [detail, task]
    );
    const workerCards = useMemo(
        () => buildWorkerCards(task, subagents),
        [subagents, task]
    );
    const supervisor = workerCards.find((item) => item.id === 'supervisor-root') || null;
    const workers = workerCards.filter((item) => item.id !== 'supervisor-root');
    const timelineEvents = useMemo(
        () => (Array.isArray(thread?.events) ? thread.events : []),
        [thread?.events]
    );
    const recentEvents = timelineEvents.slice(0, 5);
    const activeDirective = useMemo(
        () => buildFireflyDirectiveDisplay(task, timelineEvents),
        [task, timelineEvents]
    );
    const stepDirectiveMap = useMemo(
        () => buildFireflyStepDirectiveMap(task, timelineEvents),
        [task, timelineEvents]
    );
    const allProjectedTodos = Array.isArray(threadState?.todos) ? threadState.todos : [];
    const allProjectedArtifacts = Array.isArray(threadState?.artifacts) ? threadState.artifacts : [];
    const projectedTodos = allProjectedTodos.slice(0, 4);
    const projectedArtifacts = allProjectedArtifacts.slice(0, 4);
    const workspaceFiles = Array.isArray(workspace?.workspaceEntries) ? workspace.workspaceEntries.slice(0, 4) : [];
    const outputFiles = Array.isArray(workspace?.outputEntries) ? workspace.outputEntries.slice(0, 4) : [];
    const subagentStatusSummary = {
        running: subagents.filter((item) => item.status === 'running').length,
        failed: subagents.filter((item) => item.status === 'failed').length,
        completed: subagents.filter((item) => item.status === 'completed').length,
    };
    const metrics = [
        {
            label: '线程状态',
            value: formatTaskStatus(threadState?.status || task?.status || thread?.session?.status || ''),
            hint: threadState?.latestCheckpoint?.label || '当前线程',
        },
        {
            label: '投影待办',
            value: allProjectedTodos.length,
            hint: threadState?.lastTaskId || '尚未沉淀',
        },
        {
            label: '产物',
            value: allProjectedArtifacts.length,
            hint: projectedArtifacts[0]?.label || '暂无产物',
        },
        {
            label: 'Subagent',
            value: subagents.length,
            hint: subagentStatusSummary.running > 0
                ? `执行中 ${subagentStatusSummary.running}`
                : subagentStatusSummary.failed > 0
                    ? `失败 ${subagentStatusSummary.failed}`
                    : `完成 ${subagentStatusSummary.completed}`,
        },
    ];
    const panelSummary = buildPanelSummary({
        loading: runtimeState.loading,
        error: runtimeState.error,
        detail,
        task,
        threadState,
        subagents,
        workers,
    });
    const showEmptyState = !runtimeState.loading && !runtimeState.error && !task && !threadState && !subagents.length;
    const liveRuntime = isLiveRuntime(task || thread?.activeTask || null, detail);

    useEffect(() => {
        if (!liveRuntime || !normalizedThreadKey) {
            return undefined;
        }

        const timer = window.setInterval(() => {
            loadRuntimeDetail().catch(() => {});
        }, 6000);

        return () => {
            window.clearInterval(timer);
        };
    }, [liveRuntime, loadRuntimeDetail, normalizedThreadKey]);

    useEffect(() => {
        if (!controlScopeMatch || pendingAction) {
            return;
        }

        loadRuntimeDetail().catch(() => {});
    }, [
        controlScopeMatch,
        controlFeedbackError,
        controlFeedbackMessage,
        loadRuntimeDetail,
        pendingAction,
    ]);

    useEffect(() => {
        if (!expanded) {
            return;
        }

        loadInspector().catch(() => {});
    }, [expanded, loadInspector, normalizedThreadKey, task?.id, task?.updatedAt]);

    useEffect(() => {
        setTakeoverNote(String(task?.controlNote || '').trim());
    }, [task?.controlNote, task?.id]);

    useEffect(() => {
        setMemoryNoteDrafts((current) => {
            const next = {};
            (Array.isArray(inspectorState.memoryEntries) ? inspectorState.memoryEntries : []).forEach((item) => {
                next[item.id] = Object.prototype.hasOwnProperty.call(current, item.id)
                    ? current[item.id]
                    : String(item.note || '').trim();
            });
            return next;
        });
    }, [inspectorState.memoryEntries]);

    useEffect(() => {
        setWorkerNoteDrafts((current) => {
            const next = {};
            workers.forEach((worker) => {
                next[worker.id] = Object.prototype.hasOwnProperty.call(current, worker.id)
                    ? current[worker.id]
                    : '';
            });
            return next;
        });
    }, [workers]);

    useEffect(() => {
        setStepNoteDrafts((current) => {
            const next = {};
            steps.forEach((step) => {
                next[step.id] = Object.prototype.hasOwnProperty.call(current, step.id)
                    ? current[step.id]
                    : '';
            });
            return next;
        });
    }, [steps]);

    if (!normalizedThreadKey) {
        return null;
    }

    const toolbeltMap = new Map((inspectorState.toolbelt?.items || []).map((item) => [item.toolId, item]));
    const blockedToolIds = Array.isArray(inspectorState.controlPlanePrefs?.tools?.blockedToolIds)
        ? inspectorState.controlPlanePrefs.tools.blockedToolIds
        : [];
    const confirmBeforeUseToolIds = Array.isArray(inspectorState.controlPlanePrefs?.tools?.confirmBeforeUseToolIds)
        ? inspectorState.controlPlanePrefs.tools.confirmBeforeUseToolIds
        : [];
    const blockedToolSet = new Set(blockedToolIds);
    const confirmBeforeUseSet = new Set(confirmBeforeUseToolIds);
    const relatedToolIds = Array.from(new Set([
        ...(Array.isArray(task?.selectedSkillIds) ? task.selectedSkillIds : []),
        ...(Array.isArray(task?.steps) ? task.steps.map((step) => step.toolId || step.skillId).filter(Boolean) : []),
        ...workers.flatMap((worker) => Array.isArray(worker.linkedToolIds) ? worker.linkedToolIds : []),
    ])).filter(Boolean);
    const sortedInspectorTools = sortToolsByControlState(
        Array.isArray(inspectorState.toolCatalog) ? inspectorState.toolCatalog : [],
        toolbeltMap,
        blockedToolSet,
        confirmBeforeUseSet
    );
    const relatedTools = sortedInspectorTools
        .filter((tool) => relatedToolIds.includes(tool.id))
        .slice(0, 6);
    const fallbackTools = sortedInspectorTools
        .filter((tool) => !relatedToolIds.includes(tool.id))
        .slice(0, 6);
    const visibleTools = relatedTools.length > 0 ? relatedTools : fallbackTools;
    const visibleToolMode = relatedTools.length > 0 ? 'related' : 'fallback';
    const relevantMemoryEntries = (() => {
        const all = Array.isArray(inspectorState.memoryEntries) ? inspectorState.memoryEntries : [];
        const taskMemoryIds = Array.isArray(task?.memoryIds) ? task.memoryIds : [];
        const preferred = taskMemoryIds.length > 0
            ? all.filter((item) => taskMemoryIds.includes(item.id))
            : all.filter((item) => (
                item.taskId === task?.id
                || item.threadKey === normalizedThreadKey
                || item.crossThreadPinned
            ));
        return (preferred.length > 0 ? preferred : all).slice(0, 4);
    })();
    const visibleMemoryMode = relevantMemoryEntries.length > 0 ? 'related' : 'empty';
    const inspectorPending = Boolean(pendingInspectorAction || pendingInspectorBatchAction);
    const resolveControlNote = (stepId = '', workerId = '') => {
        const stepNote = stepId ? String(stepNoteDrafts[stepId] || '').trim() : '';
        if (stepNote) {
            return stepNote;
        }

        const workerNote = workerId ? String(workerNoteDrafts[workerId] || '').trim() : '';
        if (workerNote) {
            return workerNote;
        }

        return String(takeoverNote || '').trim();
    };
    const taskScopedSteps = [awaitingApprovalStep, firstFailedStep]
        .filter((step, index, collection) => (
            step && collection.findIndex((candidate) => candidate?.id === step.id) === index
        ));
    const runTaskControl = (action, stepId = '') => {
        onControlAction?.(action, task, stepId, {
            note: resolveControlNote(stepId),
        });
    };
    const controlPlanePrefs = inspectorState.controlPlanePrefs || buildDefaultInspectorState().controlPlanePrefs;
    const selectionMode = String(controlPlanePrefs?.tools?.selectionMode || 'auto');
    const webSearchMode = String(controlPlanePrefs?.tools?.webSearchMode || 'auto');
    const injectTopK = String(controlPlanePrefs?.memory?.injectTopK ?? 4);
    const governanceEvents = Array.isArray(inspectorState.governanceEvents) ? inspectorState.governanceEvents : [];
    const runWorkerControl = (action, stepId = '', workerId = '') => {
        onControlAction?.(action, task, stepId, {
            note: resolveControlNote(stepId, workerId),
        });
    };
    const nextRunPreview = buildFireflyExecutionPreview({
        task,
        prefs: controlPlanePrefs,
        toolbelt: inspectorState.toolbelt,
        memoryEntries: relevantMemoryEntries,
        displayTools: visibleTools,
        displayToolMode: visibleToolMode,
        blockedToolIds,
        confirmBeforeUseToolIds,
        takeoverNote,
        activeDirective,
    });
    const plannerImpactDiff = buildFireflyExecutionImpactDiff({
        task,
        candidateTools: visibleTools,
        blockedToolIds,
        confirmBeforeUseToolIds,
        visibleToolMode,
        webSearchMode: controlPlanePrefs?.tools?.webSearchMode,
    });
    const plannerExplainers = buildFireflyPlannerExplainers(task);
    const governanceSuggestions = buildFireflyGovernanceSuggestions({
        task,
        prefs: controlPlanePrefs,
        candidateTools: visibleTools,
        toolbeltItems: inspectorState.toolbelt?.items || [],
        blockedToolIds,
        confirmBeforeUseToolIds,
        visibleToolMode,
    });

    return (
        <section className={`firefly-thread-runtime-panel glass ${className}`.trim()}>
            <button
                type="button"
                className="firefly-thread-runtime-head"
                onClick={() => setExpanded((current) => !current)}
            >
                <div className="firefly-thread-runtime-head-copy">
                    <span className="firefly-thread-runtime-kicker">运行结构</span>
                    <strong>Supervisor / Worker / Thread Runtime</strong>
                    <p>{panelSummary}</p>
                </div>
                <div className="firefly-thread-runtime-head-meta">
                    <span className={`firefly-thread-runtime-pill ${runtimeState.error ? 'danger' : runtimeState.loading ? 'pending' : 'success'}`}>
                        {runtimeState.error ? '同步异常' : runtimeState.loading ? '同步中' : '已接管'}
                    </span>
                    <span className="firefly-thread-runtime-chevron" aria-hidden="true">{expanded ? '−' : '+'}</span>
                </div>
            </button>

            {expanded ? (
                <div className="firefly-thread-runtime-body">
                    <div className="firefly-thread-runtime-topbar">
                        <div className="firefly-thread-runtime-threadline">
                            <span>线程：{normalizedThreadKey}</span>
                            <span>{task?.title || thread?.session?.title || '尚未命名'}</span>
                            <span>{formatDateTime(task?.updatedAt || threadState?.updatedAt || thread?.activeRun?.updatedAt)}</span>
                        </div>
                        <Link
                            href={`/runtime?threadKey=${encodeURIComponent(normalizedThreadKey)}`}
                                className="firefly-thread-runtime-link"
                            >
                                查看完整 Runtime
                            </Link>
                    </div>

                    <div className="firefly-thread-runtime-inspector-grid">
                        <section className="firefly-thread-runtime-inspector-card">
                            <div className="firefly-thread-runtime-section-head">
                                <strong>前台接管注记</strong>
                                <span>{inspectorPending ? '保存中' : '作用于本轮控制动作'}</span>
                            </div>
                            <div className="firefly-thread-runtime-note-box">
                                <textarea
                                    value={takeoverNote}
                                    onChange={(event) => setTakeoverNote(event.target.value)}
                                    placeholder="给这轮接管补一条注记，例如：先不要抓取外链正文，只保留搜索摘要。"
                                />
                                <small>这条注记会跟随当前运行控制动作一起写入 runtime control note。</small>
                            </div>
                            <div className="firefly-thread-runtime-policy-grid">
                                <label>
                                    <span>工具选择</span>
                                    <select
                                        value={selectionMode}
                                        disabled={inspectorPending}
                                        onChange={(event) => mutateInspector('settings_update', {
                                            controlPlanePrefs: {
                                                tools: {
                                                    selectionMode: event.target.value,
                                                },
                                            },
                                        })}
                                    >
                                        <option value="auto">自动</option>
                                        <option value="prefer_pinned">优先固定工具</option>
                                        <option value="pinned_only">仅固定工具</option>
                                    </select>
                                </label>
                                <label>
                                    <span>联网路由</span>
                                    <select
                                        value={webSearchMode}
                                        disabled={inspectorPending}
                                        onChange={(event) => mutateInspector('settings_update', {
                                            controlPlanePrefs: {
                                                tools: {
                                                    webSearchMode: event.target.value,
                                                },
                                            },
                                        })}
                                    >
                                        <option value="auto">自动判断</option>
                                        <option value="manual_only">仅手动开启</option>
                                    </select>
                                </label>
                                <label>
                                    <span>记忆注入</span>
                                    <select
                                        value={injectTopK}
                                        disabled={inspectorPending}
                                        onChange={(event) => mutateInspector('settings_update', {
                                            controlPlanePrefs: {
                                                memory: {
                                                    injectTopK: Number(event.target.value),
                                                },
                                            },
                                        })}
                                    >
                                        <option value="2">2 条</option>
                                        <option value="4">4 条</option>
                                        <option value="6">6 条</option>
                                        <option value="8">8 条</option>
                                    </select>
                                </label>
                            </div>
                            <div className="firefly-thread-runtime-policy-hint">
                                下次 `重跑 / 续跑 / 批准后继续` 时，会按这里最新的记忆与工具治理重新生成 managed context。
                            </div>
                            <div className="firefly-thread-runtime-inline-summary">
                                <span>记忆 {relevantMemoryEntries.length}</span>
                                <span>{visibleToolMode === 'related' ? '相关工具' : '线程工具'} {visibleTools.length}</span>
                                <span>固定 {inspectorState.toolbelt?.strategy?.pinnedCount || 0}</span>
                                <span>临时启用 {inspectorState.toolbelt?.strategy?.leasedCount || 0}</span>
                            </div>
                            <div className="firefly-thread-runtime-preview-card">
                                <div className="firefly-thread-runtime-preview-head">
                                    <strong>{nextRunPreview.title}</strong>
                                    <span>{nextRunPreview.summary}</span>
                                </div>
                                <div className="firefly-thread-runtime-inline-summary">
                                    {nextRunPreview.chips.map((item) => (
                                        <span key={item}>{item}</span>
                                    ))}
                                </div>
                                <div className="firefly-thread-runtime-preview-list">
                                    {nextRunPreview.lines.map((item) => (
                                        <p key={item}>{item}</p>
                                    ))}
                                </div>
                                {plannerImpactDiff.length > 0 ? (
                                    <div className="firefly-thread-runtime-diff-box">
                                        <strong>和当前执行路径相比</strong>
                                        <div className="firefly-thread-runtime-preview-list">
                                            {plannerImpactDiff.map((item) => (
                                                <p key={item}>{item}</p>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                                {plannerExplainers.map((section) => (
                                    <div key={section.id} className="firefly-thread-runtime-diff-box">
                                        <strong>{section.title}</strong>
                                        <div className="firefly-thread-runtime-preview-list">
                                            {section.lines.map((item) => (
                                                <p key={item}>{item}</p>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {governanceSuggestions.length > 0 ? (
                                    <div className="firefly-thread-runtime-diff-box">
                                        <strong>建议直接调整</strong>
                                        <div className="firefly-thread-runtime-suggestion-list">
                                            {governanceSuggestions.map((group) => (
                                                <section key={group.id} className="firefly-thread-runtime-suggestion-group">
                                                    <div className="firefly-thread-runtime-suggestion-group-head">
                                                        <strong>{group.title}</strong>
                                                        {group.items.length > 1 ? (
                                                            <button
                                                                type="button"
                                                                className="firefly-thread-runtime-control-button"
                                                                disabled={inspectorPending}
                                                                onClick={() => applySuggestionGroup(group)}
                                                            >
                                                                {pendingInspectorBatchAction === group.id ? '应用中…' : '整组应用'}
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                    {group.items.map((item) => (
                                                        <article key={item.id} className="firefly-thread-runtime-suggestion-card">
                                                            <div className="firefly-thread-runtime-preview-list">
                                                                <p><strong>{item.title}</strong></p>
                                                                <p>{item.detail}</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                className={`firefly-thread-runtime-control-button ${item.tone === 'accent' ? 'primary' : ''}`}
                                                                disabled={inspectorPending}
                                                                onClick={() => mutateInspector(item.action, item.payload || {})}
                                                            >
                                                                {pendingInspectorAction === item.action ? '处理中…' : item.buttonLabel}
                                                            </button>
                                                        </article>
                                                    ))}
                                                </section>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </section>

                        <section className="firefly-thread-runtime-inspector-card">
                            <div className="firefly-thread-runtime-section-head">
                                <strong>相关记忆</strong>
                                <span>{visibleMemoryMode === 'related' ? `${relevantMemoryEntries.length} 条` : '当前为空'}</span>
                            </div>
                            {inspectorState.error ? (
                                <div className="firefly-thread-runtime-empty danger">{inspectorState.error}</div>
                            ) : null}
                            {inspectorState.message ? (
                                <div className="firefly-thread-runtime-control-feedback success">{inspectorState.message}</div>
                            ) : null}
                            <div className="firefly-thread-runtime-list">
                                {relevantMemoryEntries.length > 0 ? relevantMemoryEntries.map((item) => (
                                    <div key={item.id} className="firefly-thread-runtime-memory-item">
                                        <div className="firefly-thread-runtime-item-top">
                                            <strong>{item.title}</strong>
                                            <span>{formatPriorityBand(item.priorityBand)}</span>
                                        </div>
                                        <small>{formatMemoryType(item.memoryType)} · {item.crossThreadPinned ? '跨线程固定' : item.frozen ? '已冻结' : '线程内记忆'}</small>
                                        <p>{truncate(item.summary || item.detail || '当前记忆暂无摘要。', 118)}</p>
                                        <textarea
                                            value={memoryNoteDrafts[item.id] || ''}
                                            disabled={inspectorPending}
                                            onChange={(event) => setMemoryNoteDrafts((current) => ({
                                                ...current,
                                                [item.id]: event.target.value,
                                            }))}
                                            placeholder="补一条治理备注"
                                        />
                                        <div className="firefly-thread-runtime-worker-actions">
                                            <button
                                                type="button"
                                                className={`firefly-thread-runtime-control-button ${item.frozen ? 'primary' : ''}`}
                                                disabled={inspectorPending}
                                                onClick={() => mutateInspector('memory_update', {
                                                    memoryId: item.id,
                                                    priorityBand: item.priorityBand || 'standard',
                                                    retentionPolicy: item.retentionPolicy || 'rolling',
                                                    visibility: item.visibility || 'runtime',
                                                    note: memoryNoteDrafts[item.id] || '',
                                                    frozen: !item.frozen,
                                                    crossThreadPinned: item.crossThreadPinned || false,
                                                })}
                                            >
                                                {item.frozen ? '取消冻结' : '冻结'}
                                            </button>
                                            <button
                                                type="button"
                                                className={`firefly-thread-runtime-control-button ${item.crossThreadPinned ? 'primary' : ''}`}
                                                disabled={inspectorPending}
                                                onClick={() => mutateInspector('memory_update', {
                                                    memoryId: item.id,
                                                    priorityBand: item.priorityBand || 'standard',
                                                    retentionPolicy: item.retentionPolicy || 'rolling',
                                                    visibility: item.visibility || 'runtime',
                                                    note: memoryNoteDrafts[item.id] || '',
                                                    frozen: item.frozen || false,
                                                    crossThreadPinned: !item.crossThreadPinned,
                                                })}
                                            >
                                                {item.crossThreadPinned ? '取消固定' : '跨线程固定'}
                                            </button>
                                            <button
                                                type="button"
                                                className="firefly-thread-runtime-control-button"
                                                disabled={inspectorPending}
                                                onClick={() => mutateInspector('memory_update', {
                                                    memoryId: item.id,
                                                    priorityBand: item.priorityBand || 'standard',
                                                    retentionPolicy: item.retentionPolicy || 'rolling',
                                                    visibility: item.visibility || 'runtime',
                                                    note: memoryNoteDrafts[item.id] || '',
                                                    frozen: item.frozen || false,
                                                    crossThreadPinned: item.crossThreadPinned || false,
                                                })}
                                            >
                                                保存备注
                                            </button>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="firefly-thread-runtime-empty">
                                        当前线程还没有沉淀出可直接治理的记忆。
                                        {task?.id ? (
                                            <button
                                                type="button"
                                                className="firefly-thread-runtime-control-button primary"
                                                disabled={inspectorPending}
                                                onClick={() => mutateInspector('memory_remember_task', {
                                                    taskId: task.id,
                                                    defaultPriorityBand: inspectorState.controlPlanePrefs?.memory?.defaultPriorityBand || 'standard',
                                                })}
                                            >
                                                记住当前任务
                                            </button>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="firefly-thread-runtime-inspector-card">
                            <div className="firefly-thread-runtime-section-head">
                                <strong>最近治理动作</strong>
                                <span>{governanceEvents.length} 条</span>
                            </div>
                            <div className="firefly-thread-runtime-list">
                                {governanceEvents.length > 0 ? governanceEvents.map((item) => (
                                    <div key={item.id} className="firefly-thread-runtime-item">
                                        <div className="firefly-thread-runtime-item-top">
                                            <strong>{item.label || '前台治理动作'}</strong>
                                            <span>{formatGovernanceKind(item.kind)}</span>
                                        </div>
                                        <small>{item.scope === 'thread' ? '线程级治理' : '用户级治理'} · {formatDateTime(item.createdAt)}</small>
                                        <p>{truncate(item.detail || '当前没有补充说明。', 118)}</p>
                                        <small>{describeGovernanceImpact(item)}</small>
                                        <div className="firefly-thread-runtime-worker-actions">
                                            {item.availableActions?.replay?.action ? (
                                                <button
                                                    type="button"
                                                    className="firefly-thread-runtime-control-button"
                                                    disabled={inspectorPending}
                                                    onClick={() => mutateInspector('governance_replay', {
                                                        instruction: item.availableActions.replay,
                                                    })}
                                                >
                                                    {pendingInspectorAction === 'governance_replay' ? '处理中…' : (item.availableActions.replay.label || '再次应用')}
                                                </button>
                                            ) : null}
                                            {item.availableActions?.rollback?.action ? (
                                                <button
                                                    type="button"
                                                    className="firefly-thread-runtime-control-button danger"
                                                    disabled={inspectorPending}
                                                    onClick={() => mutateInspector('governance_rollback', {
                                                        instruction: item.availableActions.rollback,
                                                    })}
                                                >
                                                    {pendingInspectorAction === 'governance_rollback' ? '处理中…' : (item.availableActions.rollback.label || '回滚')}
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                )) : (
                                    <div className="firefly-thread-runtime-empty">
                                        当前线程还没有形成前台治理轨迹。固定工具、冻结记忆、切换策略之后，这里会记录最近动作。
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="firefly-thread-runtime-inspector-card">
                            <div className="firefly-thread-runtime-section-head">
                                <strong>{visibleToolMode === 'related' ? '当前工具偏好' : '线程级工具箱'}</strong>
                                <span>{visibleToolMode === 'related' ? `${visibleTools.length} 个` : `回退展示 ${visibleTools.length} 个`}</span>
                            </div>
                            {visibleToolMode === 'fallback' ? (
                                <div className="firefly-thread-runtime-panel-note">
                                    当前任务还没有显式挂出相关工具，先回退展示这条线程里最值得接管的工具箱资源。
                                </div>
                            ) : null}
                            <div className="firefly-thread-runtime-list">
                                {visibleTools.length > 0 ? visibleTools.map((tool) => {
                                    const toolState = toolbeltMap.get(tool.id) || null;
                                    const blocked = blockedToolSet.has(tool.id);
                                    const requireConfirm = confirmBeforeUseSet.has(tool.id);
                                    return (
                                        <div key={tool.id} className="firefly-thread-runtime-tool-item">
                                            <div className="firefly-thread-runtime-item-top">
                                                <strong>{tool.name || tool.id}</strong>
                                                <span>{formatSourceKind(tool.sourceKind)}</span>
                                            </div>
                                            <small>{truncate(tool.description || tool.id, 96)}</small>
                                            <div className="firefly-thread-runtime-inline-summary">
                                                {toolState?.pinned ? <span>已固定</span> : null}
                                                {toolState?.leased ? <span>临时启用</span> : null}
                                                {blocked ? <span>已屏蔽</span> : null}
                                                {requireConfirm ? <span>使用前确认</span> : null}
                                                {visibleToolMode === 'related' && relatedToolIds.includes(tool.id) ? <span>任务关联</span> : null}
                                            </div>
                                            <div className="firefly-thread-runtime-worker-actions">
                                                <button
                                                    type="button"
                                                    className={`firefly-thread-runtime-control-button ${toolState?.pinned ? 'primary' : ''}`}
                                                    disabled={inspectorPending || blocked}
                                                    onClick={() => mutateInspector(toolState?.pinned ? 'tool_unpin' : 'tool_pin', {
                                                        toolId: tool.id,
                                                        label: tool.name || tool.id,
                                                    })}
                                                >
                                                    {toolState?.pinned ? '取消固定' : '固定'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`firefly-thread-runtime-control-button ${toolState?.leased ? 'primary' : ''}`}
                                                    disabled={inspectorPending || blocked}
                                                    onClick={() => mutateInspector(toolState?.leased ? 'tool_revoke' : 'tool_lease', {
                                                        toolId: tool.id,
                                                        label: tool.name || tool.id,
                                                        leaseReason: task?.title || 'runtime_inspector',
                                                    })}
                                                >
                                                    {toolState?.leased ? '撤销临时启用' : '临时启用'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`firefly-thread-runtime-control-button ${blocked ? 'danger' : ''}`}
                                                    disabled={inspectorPending}
                                                    onClick={() => mutateInspector(blocked ? 'tool_unblock' : 'tool_block', {
                                                        toolId: tool.id,
                                                    })}
                                                >
                                                    {blocked ? '恢复工具' : '屏蔽工具'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`firefly-thread-runtime-control-button ${requireConfirm ? 'primary' : ''}`}
                                                    disabled={inspectorPending}
                                                    onClick={() => mutateInspector(requireConfirm ? 'tool_skip_confirm' : 'tool_require_confirm', {
                                                        toolId: tool.id,
                                                    })}
                                                >
                                                    {requireConfirm ? '取消确认' : '使用前确认'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                }) : (
                                    <div className="firefly-thread-runtime-empty">当前线程还没有可治理的工具资源。</div>
                                )}
                            </div>
                        </section>

                        <section className="firefly-thread-runtime-inspector-card">
                            <div className="firefly-thread-runtime-section-head">
                                <strong>手动写入记忆</strong>
                                <span>前台直写</span>
                            </div>
                            <div className="firefly-thread-runtime-policy-grid">
                                <label>
                                    <span>记忆标题</span>
                                    <input
                                        value={manualMemoryDraft.title}
                                        disabled={inspectorPending}
                                        onChange={(event) => setManualMemoryDraft((current) => ({
                                            ...current,
                                            title: event.target.value,
                                        }))}
                                        placeholder="例如：打招呼只简短回应"
                                    />
                                </label>
                                <label>
                                    <span>记忆摘要</span>
                                    <input
                                        value={manualMemoryDraft.summary}
                                        disabled={inspectorPending}
                                        onChange={(event) => setManualMemoryDraft((current) => ({
                                            ...current,
                                            summary: event.target.value,
                                        }))}
                                        placeholder="下一轮最想被记住的点"
                                    />
                                </label>
                                <label>
                                    <span>记忆类型</span>
                                    <select
                                        value={manualMemoryDraft.memoryType}
                                        disabled={inspectorPending}
                                        onChange={(event) => setManualMemoryDraft((current) => ({
                                            ...current,
                                            memoryType: event.target.value,
                                        }))}
                                    >
                                        <option value="user_preference">用户偏好</option>
                                        <option value="workflow_hint">流程线索</option>
                                        <option value="task_result">任务结果</option>
                                        <option value="reading_context">阅读上下文</option>
                                    </select>
                                </label>
                                <label>
                                    <span>优先级</span>
                                    <select
                                        value={manualMemoryDraft.priorityBand}
                                        disabled={inspectorPending}
                                        onChange={(event) => setManualMemoryDraft((current) => ({
                                            ...current,
                                            priorityBand: event.target.value,
                                        }))}
                                    >
                                        <option value="working">工作中</option>
                                        <option value="standard">标准</option>
                                        <option value="high">高优先</option>
                                        <option value="critical">关键</option>
                                    </select>
                                </label>
                            </div>
                            <div className="firefly-thread-runtime-note-box">
                                <textarea
                                    value={manualMemoryDraft.detail}
                                    disabled={inspectorPending}
                                    onChange={(event) => setManualMemoryDraft((current) => ({
                                        ...current,
                                        detail: event.target.value,
                                    }))}
                                    placeholder="补充这条记忆的背景、约束或希望长期沿用的规则。"
                                />
                                <div className="firefly-thread-runtime-worker-actions">
                                    <label className="firefly-thread-runtime-inline-summary">
                                        <input
                                            type="checkbox"
                                            checked={manualMemoryDraft.crossThreadPinned}
                                            disabled={inspectorPending}
                                            onChange={(event) => setManualMemoryDraft((current) => ({
                                                ...current,
                                                crossThreadPinned: event.target.checked,
                                            }))}
                                        />
                                        <span>跨线程固定</span>
                                    </label>
                                    <button
                                        type="button"
                                        className="firefly-thread-runtime-control-button primary"
                                        disabled={inspectorPending || !manualMemoryDraft.title.trim() || !manualMemoryDraft.summary.trim()}
                                        onClick={async () => {
                                            await mutateInspector('memory_create', {
                                                taskId: task?.id || '',
                                                title: manualMemoryDraft.title.trim(),
                                                summary: manualMemoryDraft.summary.trim(),
                                                detail: manualMemoryDraft.detail.trim(),
                                                memoryType: manualMemoryDraft.memoryType,
                                                priorityBand: manualMemoryDraft.priorityBand,
                                                retentionPolicy: manualMemoryDraft.retentionPolicy,
                                                crossThreadPinned: manualMemoryDraft.crossThreadPinned,
                                            });
                                            setManualMemoryDraft({
                                                title: '',
                                                summary: '',
                                                detail: '',
                                                memoryType: 'user_preference',
                                                priorityBand: 'standard',
                                                retentionPolicy: 'rolling',
                                                crossThreadPinned: false,
                                            });
                                        }}
                                    >
                                        {pendingInspectorAction === 'memory_create' ? '写入中…' : '写入这条记忆'}
                                    </button>
                                </div>
                            </div>
                        </section>
                    </div>

                    {showTaskControls ? (
                        <section className="firefly-thread-runtime-control-box">
                            <div className="firefly-thread-runtime-control-copy">
                                <strong>
                                    {taskIsBlocked
                                        ? `当前任务${controlStateLabel}`
                                        : awaitingApprovalStep
                                            ? '当前等待你确认'
                                            : '前台可接管这轮执行'}
                                </strong>
                                <span>
                                    {taskIsBlocked
                                        ? '这轮任务已在前台被暂停或拒绝。若要继续批准、重试或恢复，请先重新允许继续。'
                                        : awaitingApprovalStep
                                            ? (awaitingApprovalStep.approvalReason || awaitingApprovalStep.summary || awaitingApprovalStep.label)
                                            : firstFailedStep
                                                ? `最近失败步骤：${firstFailedStep.label}`
                                                : '你可以直接在这里恢复、重试或重新触发当前任务。'}
                                </span>
                            </div>
                            <div className="firefly-thread-runtime-control-actions">
                                {taskIsBlocked ? (
                                    <button
                                        type="button"
                                        className="firefly-thread-runtime-control-button primary"
                                        disabled={Boolean(pendingAction)}
                                        onClick={() => runTaskControl('approve_continue')}
                                    >
                                        {pendingAction === 'approve_continue' ? '正在解除…' : '允许继续'}
                                    </button>
                                ) : null}
                                {awaitingApprovalStep && !taskIsBlocked ? (
                                    <button
                                        type="button"
                                        className="firefly-thread-runtime-control-button primary"
                                        disabled={taskIsBlocked || Boolean(pendingAction)}
                                        onClick={() => runTaskControl('approve_step', awaitingApprovalStep.id)}
                                    >
                                        {pendingAction === 'approve_step' && pendingStepId === awaitingApprovalStep.id
                                            ? '正在批准…'
                                            : (awaitingApprovalStep.approvalLabel || '批准并继续')}
                                    </button>
                                ) : null}
                                {awaitingApprovalStep && !taskIsBlocked ? (
                                    <button
                                        type="button"
                                        className="firefly-thread-runtime-control-button"
                                        disabled={Boolean(pendingAction)}
                                        onClick={() => runTaskControl('pause_task')}
                                    >
                                        {pendingAction === 'pause_task' ? '正在暂停…' : '先停住'}
                                    </button>
                                ) : null}
                                {awaitingApprovalStep && !taskIsBlocked ? (
                                    <button
                                        type="button"
                                        className="firefly-thread-runtime-control-button danger"
                                        disabled={Boolean(pendingAction)}
                                        onClick={() => runTaskControl('reject_continue')}
                                    >
                                        {pendingAction === 'reject_continue' ? '正在结束…' : '结束本轮'}
                                    </button>
                                ) : null}
                                {firstFailedStep && !taskIsBlocked ? (
                                    <button
                                        type="button"
                                        className="firefly-thread-runtime-control-button"
                                        disabled={Boolean(pendingAction)}
                                        onClick={() => runTaskControl('retry_step', firstFailedStep.id)}
                                    >
                                        {pendingAction === 'retry_step' && pendingStepId === firstFailedStep.id ? '正在重跑…' : '只重跑最近失败步骤'}
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    className="firefly-thread-runtime-control-button"
                                    disabled={taskIsBlocked || task?.status !== 'failed' || Boolean(pendingAction)}
                                    onClick={() => runTaskControl('resume_plan')}
                                >
                                    {pendingAction === 'resume_plan' ? '正在恢复…' : '恢复续跑'}
                                </button>
                                <button
                                    type="button"
                                    className="firefly-thread-runtime-control-button"
                                    disabled={taskIsBlocked || failedSteps.length === 0 || Boolean(pendingAction)}
                                    onClick={() => runTaskControl('retry_failed')}
                                >
                                    {pendingAction === 'retry_failed' ? '正在重试…' : '失败步骤重试'}
                                </button>
                                <button
                                    type="button"
                                    className="firefly-thread-runtime-control-button"
                                    disabled={taskIsRunning || Boolean(pendingAction)}
                                    onClick={() => runTaskControl('retry_full')}
                                >
                                        {pendingAction === 'retry_full' ? '正在重跑…' : '整轮重试'}
                                    </button>
                            </div>
                            {activeDirective?.note ? (
                                <div className="firefly-thread-runtime-active-note">
                                    <div className="firefly-thread-runtime-active-note-head">
                                        <strong>当前生效的前台指令</strong>
                                        <div className="firefly-thread-runtime-event-flags">
                                            <span>{activeDirective.actionLabel || formatFireflyControlAction(activeDirective.action)}</span>
                                            {activeDirective.stepLabel ? <span>{activeDirective.stepLabel}</span> : null}
                                        </div>
                                    </div>
                                    <p>{activeDirective.note}</p>
                                </div>
                            ) : null}
                            {taskScopedSteps.length > 0 ? (
                                <div className="firefly-thread-runtime-step-note-grid">
                                    {taskScopedSteps.map((step) => (
                                        <label key={step.id} className="firefly-thread-runtime-scope-note">
                                            <div className="firefly-thread-runtime-scope-note-head">
                                                <strong>{step.label}</strong>
                                                <span>只覆盖当前步骤，优先于全局接管注记</span>
                                            </div>
                                            <textarea
                                                value={stepNoteDrafts[step.id] || ''}
                                                disabled={Boolean(pendingAction)}
                                                onChange={(event) => setStepNoteDrafts((current) => ({
                                                    ...current,
                                                    [step.id]: event.target.value,
                                                }))}
                                                placeholder="给这一步单独补一条执行说明，例如：只保留来源摘要，不继续抓取全文。"
                                            />
                                        </label>
                                    ))}
                                </div>
                            ) : null}
                            {controlFeedbackMessage ? (
                                <div className="firefly-thread-runtime-control-feedback success">{controlFeedbackMessage}</div>
                            ) : null}
                            {controlFeedbackError ? (
                                <div className="firefly-thread-runtime-control-feedback error">{controlFeedbackError}</div>
                            ) : null}
                        </section>
                    ) : null}

                    {runtimeState.error ? (
                        <div className="firefly-thread-runtime-empty danger">{runtimeState.error}</div>
                    ) : null}

                    {showEmptyState ? (
                        <div className="firefly-thread-runtime-empty">当前线程还没有形成可视运行结构，先发起一轮正式任务后会在这里沉淀。</div>
                    ) : (
                        <>
                            <div className="firefly-thread-runtime-metrics">
                                {metrics.map((item) => (
                                    <div key={item.label} className="firefly-thread-runtime-metric">
                                        <small>{item.label}</small>
                                        <strong>{item.value}</strong>
                                        <span>{item.hint}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="firefly-thread-runtime-grid">
                                <div className="firefly-thread-runtime-column">
                                    <div className="firefly-thread-runtime-section">
                                        <div className="firefly-thread-runtime-section-head">
                                            <strong>线程投影</strong>
                                            <span>{threadState?.latestCheckpoint?.label || '暂无检查点'}</span>
                                        </div>
                                        <div className="firefly-thread-runtime-paths">
                                            <div>
                                                <small>工作区</small>
                                                <span title={threadState?.workspacePath || ''}>{summarizePath(threadState?.workspacePath)}</span>
                                            </div>
                                            <div>
                                                <small>上传区</small>
                                                <span title={threadState?.uploadsPath || ''}>{summarizePath(threadState?.uploadsPath)}</span>
                                            </div>
                                            <div>
                                                <small>输出区</small>
                                                <span title={threadState?.outputsPath || ''}>{summarizePath(threadState?.outputsPath)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="firefly-thread-runtime-section">
                                        <div className="firefly-thread-runtime-section-head">
                                            <strong>投影待办</strong>
                                            <span>{projectedTodos.length} 项</span>
                                        </div>
                                        <div className="firefly-thread-runtime-list">
                                            {projectedTodos.length > 0 ? projectedTodos.map((item) => (
                                                <div key={item.id} className="firefly-thread-runtime-item">
                                                    <div className="firefly-thread-runtime-item-top">
                                                        <strong>{item.label}</strong>
                                                        <span>{formatTaskStatus(item.status)}</span>
                                                    </div>
                                                    <small>{item.summary || '当前待办暂无补充说明。'}</small>
                                                </div>
                                            )) : (
                                                <div className="firefly-thread-runtime-empty">还没有沉淀出投影待办。</div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="firefly-thread-runtime-section">
                                        <div className="firefly-thread-runtime-section-head">
                                            <strong>近期产物</strong>
                                            <span>{projectedArtifacts.length} 项</span>
                                        </div>
                                        <div className="firefly-thread-runtime-artifacts">
                                            {projectedArtifacts.length > 0 ? projectedArtifacts.map((item) => (
                                                item.href ? (
                                                    <a key={item.id} href={item.href} target="_blank" rel="noreferrer">
                                                        {item.label}
                                                    </a>
                                                ) : (
                                                    <span key={item.id}>{item.label}</span>
                                                )
                                            )) : <span>暂无产物</span>}
                                        </div>
                                    </div>

                                    <div className="firefly-thread-runtime-section">
                                        <div className="firefly-thread-runtime-section-head">
                                            <strong>Workspace / Outputs</strong>
                                            <span>{workspaceFiles.length + outputFiles.length} 个条目</span>
                                        </div>
                                        <div className="firefly-thread-runtime-file-columns">
                                            <div>
                                                <small>Workspace</small>
                                                <div className="firefly-thread-runtime-artifacts">
                                                    {workspaceFiles.length > 0 ? workspaceFiles.map((item) => (
                                                        item.kind === 'file' ? (
                                                            <a
                                                                key={`workspace-${item.relativePath}`}
                                                                href={`/api/firefly/runtime/workspace?threadKey=${encodeURIComponent(normalizedThreadKey)}&zone=workspace&path=${encodeURIComponent(item.relativePath)}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                            >
                                                                {item.relativePath}
                                                            </a>
                                                        ) : (
                                                            <span key={`workspace-${item.relativePath}`}>{item.relativePath}/</span>
                                                        )
                                                    )) : <span>暂无</span>}
                                                </div>
                                            </div>
                                            <div>
                                                <small>Outputs</small>
                                                <div className="firefly-thread-runtime-artifacts">
                                                    {outputFiles.length > 0 ? outputFiles.map((item) => (
                                                        item.kind === 'file' ? (
                                                            <a
                                                                key={`output-${item.relativePath}`}
                                                                href={`/api/firefly/runtime/workspace?threadKey=${encodeURIComponent(normalizedThreadKey)}&zone=outputs&path=${encodeURIComponent(item.relativePath)}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                            >
                                                                {item.relativePath}
                                                            </a>
                                                        ) : (
                                                            <span key={`output-${item.relativePath}`}>{item.relativePath}/</span>
                                                        )
                                                    )) : <span>暂无</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="firefly-thread-runtime-column">
                                    <div className="firefly-thread-runtime-section">
                                        <div className="firefly-thread-runtime-section-head">
                                            <strong>Agent 树</strong>
                                            <span>{workers.length} 个 worker</span>
                                        </div>
                                        {supervisor ? (
                                            <div className="firefly-thread-runtime-supervisor">
                                                <div className="firefly-thread-runtime-item-top">
                                                    <strong>{supervisor.label}</strong>
                                                    <span>{formatTaskStatus(buildWorkerStatus(supervisor, task, supervisor.relatedRuns || []))}</span>
                                                </div>
                                                <small>
                                                    {supervisor.role} · 覆盖 {Array.isArray(supervisor.stepIds) ? supervisor.stepIds.length : 0} 个 step
                                                </small>
                                            </div>
                                        ) : null}
                                        <div className="firefly-thread-runtime-worker-list">
                                            {workers.length > 0 ? workers.map((worker) => {
                                                const workerAwaitingApprovalStep = pickWorkerAwaitingApprovalStep(worker);
                                                const workerFailedStep = pickWorkerFailedStep(worker);
                                                const workerNote = workerNoteDrafts[worker.id] || '';
                                                const workerScopedSteps = [workerAwaitingApprovalStep, workerFailedStep]
                                                    .filter((step, index, collection) => (
                                                        step && collection.findIndex((candidate) => candidate?.id === step.id) === index
                                                    ));

                                                return (
                                                    <div key={worker.id} className={`firefly-thread-runtime-worker ${worker.workerStatus}`}>
                                                        <div className="firefly-thread-runtime-item-top">
                                                            <strong>{worker.label}</strong>
                                                            <span>{formatTaskStatus(worker.workerStatus)}</span>
                                                        </div>
                                                        <small>{worker.role} · {summarizeList(worker.linkedToolIds, '未绑定工具')}</small>
                                                        <div className="firefly-thread-runtime-worker-meta">
                                                            <span>{worker.relatedSteps.length} 个步骤</span>
                                                            <span>{worker.relatedRuns.length} 个 subagent</span>
                                                        </div>
                                                        <p>{buildWorkerFocusSummary(worker)}</p>
                                                        {worker.relatedSteps.length > 0 ? (
                                                            <div className="firefly-thread-runtime-step-list">
                                                                {worker.relatedSteps.slice(0, 3).map((step) => (
                                                                    <div key={step.id} className={`firefly-thread-runtime-step ${step.status || 'pending'}`}>
                                                                        <span className="firefly-thread-runtime-step-dot" aria-hidden="true" />
                                                                        <div className="firefly-thread-runtime-step-copy">
                                                                            <strong>{step.label}</strong>
                                                                            <small>{step.summary || step.purpose || step.approvalReason || '当前步骤暂无额外说明。'}</small>
                                                                            {stepDirectiveMap.get(step.id)?.note ? (
                                                                                <div className="firefly-thread-runtime-step-directive">
                                                                                    <span>{formatFireflyControlAction(stepDirectiveMap.get(step.id)?.action)}</span>
                                                                                    <p>{stepDirectiveMap.get(step.id)?.note}</p>
                                                                                </div>
                                                                            ) : null}
                                                                        </div>
                                                                        <em>{formatTaskStatus(step.status)}</em>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : null}
                                                        {canControl && (workerAwaitingApprovalStep || workerFailedStep) ? (
                                                            <div className="firefly-thread-runtime-worker-control">
                                                                <textarea
                                                                    value={workerNote}
                                                                    disabled={Boolean(pendingAction)}
                                                                    onChange={(event) => setWorkerNoteDrafts((current) => ({
                                                                        ...current,
                                                                        [worker.id]: event.target.value,
                                                                    }))}
                                                                    placeholder="给这个 worker 补一条接管说明；留空时默认使用上面的全局接管注记。"
                                                                />
                                                                {workerScopedSteps.length > 0 ? (
                                                                    <div className="firefly-thread-runtime-step-note-grid compact">
                                                                        {workerScopedSteps.map((step) => (
                                                                            <label key={step.id} className="firefly-thread-runtime-scope-note">
                                                                                <div className="firefly-thread-runtime-scope-note-head">
                                                                                    <strong>{step.label}</strong>
                                                                                    <span>只作用于这一步</span>
                                                                                </div>
                                                                                <textarea
                                                                                    value={stepNoteDrafts[step.id] || ''}
                                                                                    disabled={Boolean(pendingAction)}
                                                                                    onChange={(event) => setStepNoteDrafts((current) => ({
                                                                                        ...current,
                                                                                        [step.id]: event.target.value,
                                                                                    }))}
                                                                                    placeholder="这一步的单独接管说明，优先于 worker 注记。"
                                                                                />
                                                                            </label>
                                                                        ))}
                                                                    </div>
                                                                ) : null}
                                                                <div className="firefly-thread-runtime-worker-actions">
                                                                    {workerAwaitingApprovalStep ? (
                                                                        <button
                                                                            type="button"
                                                                            className="firefly-thread-runtime-control-button primary"
                                                                            disabled={taskIsBlocked || Boolean(pendingAction)}
                                                                            onClick={() => runWorkerControl('approve_step', workerAwaitingApprovalStep.id, worker.id)}
                                                                        >
                                                                            {pendingAction === 'approve_step' && pendingStepId === workerAwaitingApprovalStep.id
                                                                                ? '正在批准…'
                                                                                : '批准当前 worker'}
                                                                        </button>
                                                                ) : null}
                                                                {workerFailedStep ? (
                                                                        <button
                                                                            type="button"
                                                                            className="firefly-thread-runtime-control-button"
                                                                            disabled={taskIsBlocked || Boolean(pendingAction)}
                                                                            onClick={() => runWorkerControl('retry_step', workerFailedStep.id, worker.id)}
                                                                        >
                                                                            {pendingAction === 'retry_step' && pendingStepId === workerFailedStep.id
                                                                                ? '正在重跑…'
                                                                                : '重跑当前 worker'}
                                                                        </button>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                );
                                            }) : (
                                                <div className="firefly-thread-runtime-empty">当前任务还没有可展示的 worker 树。</div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="firefly-thread-runtime-section">
                                        <div className="firefly-thread-runtime-section-head">
                                            <strong>Subagent 运行</strong>
                                            <span>{subagents.length} 条</span>
                                        </div>
                                        <div className="firefly-thread-runtime-subagent-summary">
                                            <span>{subagentStatusSummary.completed} 已完成</span>
                                            <span>{subagentStatusSummary.running} 执行中</span>
                                            <span>{subagentStatusSummary.failed} 失败</span>
                                        </div>
                                        <div className="firefly-thread-runtime-list">
                                            {subagents.length > 0 ? subagents.slice(0, 6).map((item) => (
                                                <div key={item.id} className="firefly-thread-runtime-item">
                                                    <div className="firefly-thread-runtime-item-top">
                                                        <strong>{item.label}</strong>
                                                        <span>{formatTaskStatus(item.status)}</span>
                                                    </div>
                                                    <small>{item.toolId || '未标记工具'} · {formatDateTime(item.updatedAt || item.createdAt)}</small>
                                                    <p>{item.summary || item.error || '当前 subagent 暂无补充说明。'}</p>
                                                </div>
                                            )) : (
                                                <div className="firefly-thread-runtime-empty">当前线程还没有 subagent 明细。</div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="firefly-thread-runtime-section">
                                        <div className="firefly-thread-runtime-section-head">
                                            <strong>最近进展</strong>
                                            <span>{recentEvents.length} 条</span>
                                        </div>
                                        <div className="firefly-thread-runtime-events">
                                            {recentEvents.length > 0 ? recentEvents.map((event) => (
                                                <div key={event.id} className="firefly-thread-runtime-event">
                                                    <div className={`firefly-thread-runtime-event-dot ${event.level || 'info'}`} />
                                                    <div>
                                                        <strong>{event.label}</strong>
                                                        {event.metadata?.controlNote || event.metadata?.stepLabel ? (
                                                            <div className="firefly-thread-runtime-event-flags">
                                                                {event.metadata?.controlNote ? <span>前台接管</span> : null}
                                                                {event.metadata?.stepLabel ? <span>{event.metadata.stepLabel}</span> : null}
                                                            </div>
                                                        ) : null}
                                                        <p>{event.detail || '已记录一条运行事件。'}</p>
                                                        <small>{formatDateTime(event.createdAt)}</small>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="firefly-thread-runtime-empty">当前线程还没有事件时间线。</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            ) : null}
        </section>
    );
}
