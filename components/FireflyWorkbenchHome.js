'use client';

import { useEffect, useMemo, useState } from 'react';
import FireflyMark from '@/components/FireflyMark';
import {
    buildMcpDefinitions,
    loadMcpDefinitionState,
} from '@/data/mcp';
import {
    buildSkillDefinitions,
    loadSkillDefinitionState,
} from '@/data/skills';
import {
    buildCapabilityMarketAccessContextFromCatalog,
    loadUserCapabilityInstalls,
    subscribeUserCapabilityInstalls,
} from '@/data/capabilityMarket';
import {
    campusCapabilities,
    resolveChatModel,
} from '@/data/workspace';
import {
    ensureCampusUserProfile,
    subscribeCampusUserProfile,
} from '@/data/userProfile';
import {
    loadFireflyTasks,
    subscribeFireflyTasks,
    upsertFireflyTask,
} from '@/data/fireflyTasks';
import FireflyControlPlanePanel from '@/components/FireflyControlPlanePanel';
import FireflyRuntimeCard from '@/components/FireflyRuntimeCard';
import { requestFireflyRuntimeControl } from '@/lib/fireflyRuntimeControlClient';
import './FireflyWorkbenchHome.css';

function formatDateTime(value) {
    if (!value) {
        return '刚刚';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
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
    if (status === 'idle') return '空闲';
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

function normalizeRuntimeTask(task = {}) {
    return {
        id: String(task.id || '').trim(),
        threadKey: String(task.threadKey || '').trim(),
        title: String(task.title || '未命名任务').trim(),
        goal: String(task.goal || '').trim(),
        status: String(task.status || 'planning').trim(),
        resultSummary: String(task.resultSummary || '').trim(),
        selectedSkillLabels: Array.isArray(task.selectedSkillLabels) ? task.selectedSkillLabels : [],
        capabilityIds: Array.isArray(task.capabilityIds) ? task.capabilityIds : [],
        updatedAt: task.updatedAt || task.createdAt || new Date().toISOString(),
        createdAt: task.createdAt || new Date().toISOString(),
    };
}

function normalizeLocalTask(task = {}) {
    return {
        id: String(task.id || '').trim(),
        threadKey: String(task.threadKey || task.id || '').trim(),
        title: String(task.title || '未命名任务').trim(),
        goal: String(task.goal || '').trim(),
        status: String(task.status || 'planning').trim(),
        resultSummary: String(task.resultSummary || '').trim(),
        selectedSkillLabels: Array.isArray(task.selectedSkillLabels) ? task.selectedSkillLabels : [],
        capabilityIds: Array.isArray(task.capabilityIds) ? task.capabilityIds : [],
        updatedAt: task.updatedAt || task.createdAt || new Date().toISOString(),
        createdAt: task.createdAt || new Date().toISOString(),
    };
}

function normalizeRuntimeSession(session = {}, taskMap = new Map()) {
    const activeTask = taskMap.get(session.lastTaskId) || null;
    return {
        id: String(session.id || session.threadKey || '').trim(),
        threadKey: String(session.threadKey || session.id || '').trim(),
        title: String(session.title || activeTask?.title || '萤火虫会话').trim(),
        status: String(activeTask?.status || session.status || 'idle').trim(),
        capabilityIds: Array.isArray(activeTask?.capabilityIds)
            ? activeTask.capabilityIds
            : (Array.isArray(session.capabilityIds) ? session.capabilityIds : []),
        summary: String(activeTask?.resultSummary || '').trim(),
        updatedAt: activeTask?.updatedAt || session.updatedAt || session.createdAt || new Date().toISOString(),
        lastTaskId: String(session.lastTaskId || '').trim(),
        activeTask,
    };
}

function buildTaskInbox(tasks = []) {
    const groups = {
        running: [],
        waiting: [],
        completed: [],
        failed: [],
    };

    tasks.forEach((task) => {
        if (task.status === 'running' || task.status === 'planning') {
            groups.running.push(task);
            return;
        }
        if (task.status === 'awaiting_approval') {
            groups.waiting.push(task);
            return;
        }
        if (task.status === 'completed') {
            groups.completed.push(task);
            return;
        }
        if (task.status === 'failed') {
            groups.failed.push(task);
        }
    });

    return groups;
}

const quickPrompts = [
    {
        id: 'campus-overview',
        title: '校园事项总览',
        prompt: '请先帮我梳理今天最值得推进的校园事项，并拆成一个按优先级排序的任务清单。',
    },
    {
        id: 'structured-brief',
        title: '生成结构化简报',
        prompt: '请把我当前最需要处理的事项整理成一份结构化简报，包含优先级、依据和下一步动作。',
    },
    {
        id: 'resume-last',
        title: '继续上次任务',
        prompt: '请继续处理我刚才的任务，并先告诉我当前最值得继续推进的下一步。',
    },
];

export default function FireflyWorkbenchHome({
    onStartChat,
    onSelectSession,
    selectedCapabilityIds = [],
    preferredModelId = '',
    webSearchEnabled = false,
    deepResearchEnabled = false,
}) {
    const [userProfile, setUserProfile] = useState(() => ensureCampusUserProfile());
    const [installs, setInstalls] = useState(() => loadUserCapabilityInstalls(ensureCampusUserProfile()));
    const [runtimeState, setRuntimeState] = useState({
        sessions: [],
        tasks: [],
        runs: [],
    });
    const [toolRuntime, setToolRuntime] = useState({
        tools: [],
        runtime: null,
        scheduledTasks: [],
    });
    const [localTasks, setLocalTasks] = useState(() => loadFireflyTasks());
    const [composerValue, setComposerValue] = useState('');
    const [selectedThreadKey, setSelectedThreadKey] = useState('');
    const [threadDetail, setThreadDetail] = useState(null);
    const [controlState, setControlState] = useState({
        pendingAction: '',
        taskId: '',
        stepId: '',
        message: '',
        error: '',
    });

    const loadRuntimeSnapshot = async () => {
        const [runtimeResponse, toolResponse] = await Promise.all([
            fetch('/api/firefly/runtime', { cache: 'no-store' }),
            fetch('/api/firefly/tools', { cache: 'no-store' }),
        ]);
        const [runtimePayload, toolPayload] = await Promise.all([
            runtimeResponse.json(),
            toolResponse.json(),
        ]);

        setRuntimeState({
            sessions: Array.isArray(runtimePayload.sessions) ? runtimePayload.sessions : [],
            tasks: Array.isArray(runtimePayload.tasks) ? runtimePayload.tasks : [],
            runs: Array.isArray(runtimePayload.runs) ? runtimePayload.runs : [],
        });
        setToolRuntime({
            tools: Array.isArray(toolPayload.tools) ? toolPayload.tools : [],
            runtime: toolPayload.runtime || null,
            scheduledTasks: Array.isArray(toolPayload.scheduledTasks) ? toolPayload.scheduledTasks : [],
        });
    };

    const loadThreadDetail = async (threadKey) => {
        const nextThreadKey = String(threadKey || '').trim();
        if (!nextThreadKey) {
            setThreadDetail(null);
            return;
        }

        try {
            const response = await fetch(`/api/firefly/runtime?threadKey=${encodeURIComponent(nextThreadKey)}`, { cache: 'no-store' });
            const payload = await response.json();
            if (payload?.ok && payload.thread) {
                setThreadDetail({
                    thread: payload.thread,
                    threadState: payload.threadState || null,
                    subagents: Array.isArray(payload.subagents) ? payload.subagents : [],
                    workspace: payload.workspace || null,
                });
                return;
            }
            setThreadDetail(null);
        } catch {
            setThreadDetail(null);
        }
    };

    useEffect(() => subscribeCampusUserProfile(setUserProfile), []);

    useEffect(() => {
        setInstalls(loadUserCapabilityInstalls(userProfile));
        return subscribeUserCapabilityInstalls(userProfile, setInstalls);
    }, [userProfile]);

    useEffect(() => {
        setLocalTasks(loadFireflyTasks());
        return subscribeFireflyTasks(setLocalTasks);
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadRuntime = async () => {
            try {
                if (cancelled) {
                    return;
                }

                await loadRuntimeSnapshot();
            } catch {
                if (!cancelled) {
                    setRuntimeState({
                        sessions: [],
                        tasks: [],
                        runs: [],
                    });
                    setToolRuntime({
                        tools: [],
                        runtime: null,
                        scheduledTasks: [],
                    });
                }
            }
        };

        loadRuntime();
        return () => {
            cancelled = true;
        };
    }, []);

    const marketAccess = useMemo(() => (
        buildCapabilityMarketAccessContextFromCatalog({
            skills: buildSkillDefinitions(loadSkillDefinitionState()),
            mcps: buildMcpDefinitions(loadMcpDefinitionState()),
            installs,
        }).marketAccess
    ), [installs]);

    const mergedTasks = useMemo(() => {
        const runtimeTasks = (runtimeState.tasks || []).map(normalizeRuntimeTask);
        const localTaskMap = new Map(
            (localTasks || []).map((task) => [String(task.id || '').trim(), normalizeLocalTask(task)])
        );
        const merged = runtimeTasks.map((task) => {
            const local = localTaskMap.get(task.id) || null;
            return {
                ...task,
                resultSummary: task.resultSummary || local?.resultSummary || '',
                selectedSkillLabels: task.selectedSkillLabels.length > 0 ? task.selectedSkillLabels : (local?.selectedSkillLabels || []),
            };
        });

        const mergedIds = new Set(merged.map((task) => task.id));
        const localOnly = Array.from(localTaskMap.values()).filter((task) => !mergedIds.has(task.id));

        return [...merged, ...localOnly].sort(
            (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
        );
    }, [localTasks, runtimeState.tasks]);

    const sessionItems = useMemo(() => {
        const taskMap = new Map(mergedTasks.map((task) => [task.id, task]));
        const runtimeSessions = (runtimeState.sessions || [])
            .map((session) => normalizeRuntimeSession(session, taskMap))
            .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
        const existingThreadKeys = new Set(runtimeSessions.map((session) => session.threadKey));
        const localFallbackSessions = mergedTasks
            .filter((task) => task.threadKey && !existingThreadKeys.has(task.threadKey))
            .map((task) => ({
                id: task.threadKey,
                threadKey: task.threadKey,
                title: task.title,
                status: task.status,
                capabilityIds: task.capabilityIds,
                summary: task.resultSummary,
                updatedAt: task.updatedAt,
                lastTaskId: task.id,
                activeTask: task,
            }));

        return [...runtimeSessions, ...localFallbackSessions]
            .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
    }, [mergedTasks, runtimeState.sessions]);

    const inbox = useMemo(() => buildTaskInbox(mergedTasks), [mergedTasks]);

    useEffect(() => {
        if (selectedThreadKey) {
            return;
        }

        const firstThreadKey = sessionItems[0]?.threadKey || '';
        if (firstThreadKey) {
            setSelectedThreadKey(firstThreadKey);
        }
    }, [selectedThreadKey, sessionItems]);

    useEffect(() => {
        loadThreadDetail(selectedThreadKey);
    }, [selectedThreadKey]);

    const environmentBadges = useMemo(() => {
        const labels = [];

        if (webSearchEnabled) {
            labels.push('联网搜索已开放');
        }
        if (deepResearchEnabled) {
            labels.push('深度研究已开放');
        }
        if (!webSearchEnabled && !deepResearchEnabled) {
            labels.push('默认离线执行');
        }
        labels.push(`${selectedCapabilityIds.length} 个前台能力域`);
        labels.push(`${toolRuntime.tools.length} 个可用工具`);

        return labels;
    }, [deepResearchEnabled, selectedCapabilityIds.length, toolRuntime.tools.length, webSearchEnabled]);

    const capabilityNameMap = useMemo(
        () => Object.fromEntries(campusCapabilities.map((item) => [item.id, item.name])),
        []
    );

    const handleLaunchPrompt = (prompt) => {
        const nextPrompt = String(prompt || composerValue || '').trim();
        if (!nextPrompt) {
            return;
        }

        onStartChat?.(nextPrompt);
    };

    const handleControlAction = async (action, task = activeTask, stepId = '') => {
        const taskId = String(task?.id || '').trim();
        if (!taskId) {
            return;
        }

        setControlState({
            pendingAction: action,
            taskId,
            stepId,
            message: '',
            error: '',
        });

        try {
            const result = await requestFireflyRuntimeControl({
                action,
                taskId,
                stepId,
                uid: userProfile.uid,
                fid: userProfile.fid,
            });

            if (result.task?.id) {
                upsertFireflyTask(result.task);
            }

            await loadRuntimeSnapshot();
            await loadThreadDetail(String(result.task?.threadKey || selectedThreadKey || task?.threadKey || '').trim());
            setControlState({
                pendingAction: '',
                taskId,
                stepId,
                message: result.message,
                error: '',
            });
        } catch (error) {
            setControlState({
                pendingAction: '',
                taskId,
                stepId,
                message: '',
                error: error instanceof Error ? error.message : '控制任务失败',
            });
        }
    };

    const selectedSession = sessionItems.find((item) => item.threadKey === selectedThreadKey) || sessionItems[0] || null;
    const selectedThread = threadDetail?.thread || null;
    const activeTask = selectedThread?.activeTask || selectedSession?.activeTask || null;
    const recentEvents = Array.isArray(selectedThread?.events) ? selectedThread.events.slice(0, 8) : [];
    const selectedThreadState = threadDetail?.threadState && typeof threadDetail.threadState === 'object'
        ? threadDetail.threadState
        : null;
    const selectedWorkspace = threadDetail?.workspace && typeof threadDetail.workspace === 'object'
        ? threadDetail.workspace
        : null;
    const selectedThreadTodoCount = Array.isArray(selectedThreadState?.todos) ? selectedThreadState.todos.length : 0;
    const selectedThreadArtifactCount = Array.isArray(selectedThreadState?.artifacts) ? selectedThreadState.artifacts.length : 0;
    const selectedThreadTodos = Array.isArray(selectedThreadState?.todos) ? selectedThreadState.todos.slice(0, 4) : [];
    const selectedThreadArtifacts = Array.isArray(selectedThreadState?.artifacts) ? selectedThreadState.artifacts.slice(0, 3) : [];
    const selectedWorkspaceFiles = Array.isArray(selectedWorkspace?.workspaceEntries) ? selectedWorkspace.workspaceEntries.slice(0, 4) : [];
    const selectedOutputFiles = Array.isArray(selectedWorkspace?.outputEntries) ? selectedWorkspace.outputEntries.slice(0, 4) : [];
    const selectedThreadSubagents = (() => {
        const runs = Array.isArray(threadDetail?.subagents) ? threadDetail.subagents : [];
        if (!runs.length) {
            return [];
        }

        const filtered = runs.filter((item) => (
            item.parentTaskId === activeTask?.id
            || item.parentRunId === selectedThread?.activeRun?.id
            || item.parentRunId === activeTask?.runId
        ));
        const preferred = filtered.length > 0 ? filtered : runs;

        return [...preferred]
            .sort((left, right) => (
                new Date(right.updatedAt || right.createdAt || 0).getTime()
                - new Date(left.updatedAt || left.createdAt || 0).getTime()
            ))
            .slice(0, 6);
    })();
    const selectedThreadSubagentSummary = {
        running: selectedThreadSubagents.filter((item) => item.status === 'running').length,
        failed: selectedThreadSubagents.filter((item) => item.status === 'failed').length,
        completed: selectedThreadSubagents.filter((item) => item.status === 'completed').length,
    };
    const heroMetrics = useMemo(() => ([
        {
            label: '可恢复线程',
            value: sessionItems.length,
            hint: '已经进入任务化记录的会话',
        },
        {
            label: '在途任务',
            value: inbox.running.length + inbox.waiting.length,
            hint: '仍在推进或等待授权',
        },
        {
            label: '能力供给',
            value: `${marketAccess.enabledSkillIds?.length || 0} / ${marketAccess.enabledMcpIds?.length || 0}`,
            hint: '启用 Skill / MCP',
        },
    ]), [inbox.running.length, inbox.waiting.length, marketAccess.enabledMcpIds?.length, marketAccess.enabledSkillIds?.length, sessionItems.length]);
    const threadRuntimeCards = [
        {
            label: '线程状态',
            value: formatTaskStatus(selectedThreadState?.status || selectedSession?.status || ''),
            hint: selectedThreadState?.threadKey || selectedSession?.threadKey || '当前线程',
        },
        {
            label: '投影待办',
            value: selectedThreadTodoCount,
            hint: selectedThreadState?.lastTaskId || '尚未同步',
        },
        {
            label: '线程产物',
            value: selectedThreadArtifactCount,
            hint: selectedThreadState?.latestCheckpoint?.label || '暂无检查点',
        },
        {
            label: 'Subagent',
            value: selectedThreadSubagents.length,
            hint: selectedThreadSubagentSummary.running > 0
                ? `执行中 ${selectedThreadSubagentSummary.running}`
                : selectedThreadSubagentSummary.failed > 0
                    ? `失败 ${selectedThreadSubagentSummary.failed}`
                    : '已进入可追踪运行',
        },
    ];

    return (
        <main className="firefly-workbench">
            <section className="firefly-workbench-hero glass-strong">
                <div className="firefly-workbench-brand">
                    <div className="firefly-workbench-logo">
                        <FireflyMark size={26} decorative />
                        <span>萤火虫 Workbench</span>
                    </div>
                    <h1>从对话入口，升级成任务会话入口</h1>
                    <p>这里不只是发一条消息，而是启动一个能被规划、执行、恢复和持续推进的 Agent 会话。你可以在这里看当前环境、打开最近会话，并直接进入任务收件箱。</p>
                    <div className="firefly-workbench-hero-metrics">
                        {heroMetrics.map((item) => (
                            <div key={item.label} className="firefly-workbench-hero-metric">
                                <small>{item.label}</small>
                                <strong>{item.value}</strong>
                                <span>{item.hint}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="firefly-workbench-launch glass">
                    <div className="firefly-workbench-launch-head">
                        <strong>发起一个新任务</strong>
                        <span>{resolveChatModel(preferredModelId).label}</span>
                    </div>
                    <div className="firefly-launch-meta">
                        <span>{webSearchEnabled ? '联网搜索已打开' : '默认离线执行'}</span>
                        <span>{deepResearchEnabled ? '深度研究可用' : '常规推理模式'}</span>
                        <span>{selectedCapabilityIds.length} 个能力域</span>
                    </div>
                    <textarea
                        value={composerValue}
                        onChange={(event) => setComposerValue(event.target.value)}
                        placeholder="例如：帮我把今天的校园事项、消息和审批整理成一份结构化工作简报"
                        rows={4}
                    />
                    <div className="firefly-workbench-launch-actions">
                        {quickPrompts.map((item) => (
                            <button key={item.id} type="button" className="firefly-pill-button" onClick={() => handleLaunchPrompt(item.prompt)}>
                                {item.title}
                            </button>
                        ))}
                        <button type="button" className="firefly-primary-button" onClick={() => handleLaunchPrompt()}>
                            启动任务会话
                        </button>
                    </div>
                </div>
            </section>

            <section className="firefly-workbench-grid">
                <article className="firefly-panel glass">
                    <div className="firefly-panel-head">
                        <div>
                            <span className="firefly-panel-kicker">Session</span>
                            <h2>最近会话</h2>
                        </div>
                        <span>{sessionItems.length} 个</span>
                    </div>
                    <div className="firefly-session-list">
                        {sessionItems.length === 0 ? (
                            <div className="firefly-empty-state">还没有形成正式会话，先从一个任务开始。</div>
                        ) : sessionItems.slice(0, 5).map((session) => (
                            <button
                                key={session.id}
                                type="button"
                                className={`firefly-session-card ${selectedThreadKey === session.threadKey ? 'active' : ''}`}
                                onClick={() => setSelectedThreadKey(session.threadKey || session.id)}
                            >
                                <div className="firefly-session-top">
                                    <strong>{session.title}</strong>
                                    <span className={`firefly-status-pill ${session.status}`}>{formatTaskStatus(session.status)}</span>
                                </div>
                                <p>{session.summary || '当前会话尚未沉淀出结果摘要。'}</p>
                                <small>{formatDateTime(session.updatedAt)}</small>
                            </button>
                        ))}
                    </div>
                </article>

                <article className="firefly-panel glass">
                    <div className="firefly-panel-head">
                        <div>
                            <span className="firefly-panel-kicker">Inbox</span>
                            <h2>任务收件箱</h2>
                        </div>
                        <span>{mergedTasks.length} 项</span>
                    </div>
                    <div className="firefly-inbox-grid">
                        <div className="firefly-inbox-group">
                            <strong>进行中</strong>
                            <span>{inbox.running.length}</span>
                            <p>{inbox.running[0]?.title || '当前没有进行中的任务。'}</p>
                        </div>
                        <div className="firefly-inbox-group">
                            <strong>等待处理</strong>
                            <span>{inbox.waiting.length}</span>
                            <p>{inbox.waiting[0]?.title || '当前没有等待授权的任务。'}</p>
                        </div>
                        <div className="firefly-inbox-group">
                            <strong>已完成</strong>
                            <span>{inbox.completed.length}</span>
                            <p>{inbox.completed[0]?.title || '完成结果会沉淀在这里。'}</p>
                        </div>
                        <div className="firefly-inbox-group warning">
                            <strong>失败待恢复</strong>
                            <span>{inbox.failed.length}</span>
                            <p>{inbox.failed[0]?.title || '失败任务可通过 replay / resume 继续。'}</p>
                        </div>
                    </div>
                    <div className="firefly-inbox-list">
                        {mergedTasks.slice(0, 4).map((task) => (
                            <div key={task.id} className="firefly-inbox-row">
                                <div>
                                    <strong>{task.title}</strong>
                                    <p>{task.resultSummary || task.goal || '等待生成结果摘要。'}</p>
                                </div>
                                <span>{formatDateTime(task.updatedAt)}</span>
                            </div>
                        ))}
                    </div>
                </article>
            </section>

            <section className="firefly-workbench-grid detail">
                <article className="firefly-panel glass">
                    <div className="firefly-panel-head">
                        <div>
                            <span className="firefly-panel-kicker">Thread</span>
                            <h2>会话详情</h2>
                        </div>
                        {selectedSession && onSelectSession ? (
                            <button type="button" className="firefly-primary-button" onClick={() => onSelectSession?.(selectedSession.threadKey || selectedSession.id)}>
                                打开对话
                            </button>
                        ) : null}
                    </div>
                    {!selectedSession ? (
                        <div className="firefly-empty-state">当前没有可查看的会话。</div>
                    ) : (
                        <div className="firefly-thread-detail">
                            <div className="firefly-thread-summary">
                                <strong>{selectedSession.title}</strong>
                                <span className={`firefly-status-pill ${selectedSession.status}`}>{formatTaskStatus(selectedSession.status)}</span>
                            </div>
                            <p>{activeTask?.resultSummary || activeTask?.goal || '当前会话尚未沉淀出结果摘要。'}</p>
                            <div className="firefly-badge-list compact">
                                {(activeTask?.selectedSkillLabels || []).slice(0, 4).map((item) => (
                                    <span key={item}>{item}</span>
                                ))}
                                {activeTask?.selectedSkillLabels?.length ? null : <span>暂无已命中能力</span>}
                            </div>
                            <div className="firefly-thread-runtime-grid">
                                {threadRuntimeCards.map((item) => (
                                    <div key={item.label} className="firefly-thread-runtime-card">
                                        <small>{item.label}</small>
                                        <strong>{item.value}</strong>
                                        <span>{item.hint}</span>
                                    </div>
                                ))}
                            </div>
                            {selectedThreadState ? (
                                <div className="firefly-thread-runtime-surface">
                                    <div className="firefly-thread-runtime-column">
                                        <div className="firefly-thread-runtime-head">
                                            <strong>线程投影</strong>
                                            <span>{selectedThreadState.latestCheckpoint?.label || '暂无检查点'}</span>
                                        </div>
                                        <div className="firefly-thread-runtime-paths">
                                            <div>
                                                <small>工作区</small>
                                                <span title={selectedThreadState.workspacePath || ''}>{summarizePath(selectedThreadState.workspacePath)}</span>
                                            </div>
                                            <div>
                                                <small>上传区</small>
                                                <span title={selectedThreadState.uploadsPath || ''}>{summarizePath(selectedThreadState.uploadsPath)}</span>
                                            </div>
                                            <div>
                                                <small>输出区</small>
                                                <span title={selectedThreadState.outputsPath || ''}>{summarizePath(selectedThreadState.outputsPath)}</span>
                                            </div>
                                        </div>
                                        {selectedWorkspace ? (
                                            <div className="firefly-thread-runtime-file-groups">
                                                <div className="firefly-thread-runtime-file-group">
                                                    <small>Workspace 文件</small>
                                                    <div className="firefly-thread-runtime-artifacts">
                                                        {selectedWorkspaceFiles.length > 0 ? selectedWorkspaceFiles.map((item) => (
                                                            item.kind === 'file' ? (
                                                                <a
                                                                    key={`workspace-${item.relativePath}`}
                                                                    href={`/api/firefly/runtime/workspace?threadKey=${encodeURIComponent(selectedThread?.threadKey || selectedSession?.threadKey || '')}&zone=workspace&path=${encodeURIComponent(item.relativePath)}`}
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
                                                <div className="firefly-thread-runtime-file-group">
                                                    <small>Outputs 文件</small>
                                                    <div className="firefly-thread-runtime-artifacts">
                                                        {selectedOutputFiles.length > 0 ? selectedOutputFiles.map((item) => (
                                                            item.kind === 'file' ? (
                                                                <a
                                                                    key={`output-${item.relativePath}`}
                                                                    href={`/api/firefly/runtime/workspace?threadKey=${encodeURIComponent(selectedThread?.threadKey || selectedSession?.threadKey || '')}&zone=outputs&path=${encodeURIComponent(item.relativePath)}`}
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
                                        ) : null}
                                        <div className="firefly-thread-runtime-list">
                                            {selectedThreadTodos.length > 0 ? selectedThreadTodos.map((item) => (
                                                <div key={item.id} className="firefly-thread-runtime-item">
                                                    <strong>{item.label}</strong>
                                                    <span>{formatTaskStatus(item.status)}</span>
                                                    <small>{item.summary || '当前待办暂无补充说明。'}</small>
                                                </div>
                                            )) : (
                                                <div className="firefly-empty-state">当前线程还没有可展示的投影待办。</div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="firefly-thread-runtime-column">
                                        <div className="firefly-thread-runtime-head">
                                            <strong>执行镜像</strong>
                                            <span>{selectedThreadSubagents.length} 个 subagent</span>
                                        </div>
                                        <div className="firefly-subagent-summary">
                                            <span>{selectedThreadSubagentSummary.completed} 已完成</span>
                                            <span>{selectedThreadSubagentSummary.running} 执行中</span>
                                            <span>{selectedThreadSubagentSummary.failed} 失败</span>
                                        </div>
                                        <div className="firefly-thread-runtime-list">
                                            {selectedThreadSubagents.length > 0 ? selectedThreadSubagents.map((item) => (
                                                <div key={item.id} className="firefly-thread-runtime-item">
                                                    <strong>{item.label}</strong>
                                                    <span>{formatTaskStatus(item.status)} · {item.toolId || '未标记工具'}</span>
                                                    <small>{item.summary || item.error || '当前 subagent 暂无额外摘要。'}</small>
                                                </div>
                                            )) : (
                                                <div className="firefly-empty-state">当前线程还没有 subagent 明细。</div>
                                            )}
                                            {selectedThreadArtifacts.length > 0 ? (
                                                <div className="firefly-thread-runtime-artifacts">
                                                    {selectedThreadArtifacts.map((item) => (
                                                        item.href ? (
                                                            <a key={item.id} href={item.href} target="_blank" rel="noreferrer" title={item.relativePath || item.fileName || item.label}>
                                                                {item.label}
                                                            </a>
                                                        ) : (
                                                            <span key={item.id} title={item.relativePath || item.fileName || item.label}>
                                                                {item.label}
                                                            </span>
                                                        )
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                            <FireflyControlPlanePanel
                                surface="workbench"
                                threadKey={selectedThread?.threadKey || selectedSession?.threadKey || ''}
                                activeTask={activeTask}
                                userProfile={userProfile}
                                capabilityIds={activeTask?.capabilityIds || selectedSession?.capabilityIds || selectedCapabilityIds}
                                marketAccess={marketAccess}
                                contextSnapshot={activeTask?.contextSnapshot || selectedThread?.session?.contextSnapshot || null}
                                className="firefly-thread-control-plane"
                                defaultExpanded={false}
                            />
                            {activeTask ? (
                                <FireflyRuntimeCard
                                    task={activeTask}
                                    controlState={controlState}
                                    onControlAction={handleControlAction}
                                    timeLabel={formatDateTime(activeTask.updatedAt)}
                                />
                            ) : null}
                        </div>
                    )}
                </article>

                <article className="firefly-panel glass">
                    <div className="firefly-panel-head">
                        <div>
                            <span className="firefly-panel-kicker">Events</span>
                            <h2>执行时间线</h2>
                        </div>
                        <span>{recentEvents.length} 条</span>
                    </div>
                    {recentEvents.length === 0 ? (
                        <div className="firefly-empty-state">当前会话还没有可展示的 runtime 事件。</div>
                    ) : (
                        <div className="firefly-event-list">
                            {recentEvents.map((event) => (
                                <div key={event.id} className="firefly-event-row">
                                    <div className={`firefly-event-dot ${event.level || 'info'}`} />
                                    <div>
                                        <strong>{event.label}</strong>
                                        <p>{event.detail || '执行事件已记录。'}</p>
                                        <small>{formatDateTime(event.createdAt)}</small>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </article>
            </section>

            <section className="firefly-workbench-grid three-up">
                <article className="firefly-panel glass">
                    <div className="firefly-panel-head">
                        <div>
                            <span className="firefly-panel-kicker">Environment</span>
                            <h2>运行环境</h2>
                        </div>
                    </div>
                    <div className="firefly-environment-meta">
                        <div>
                            <span>主模型</span>
                            <strong>{resolveChatModel(preferredModelId).label}</strong>
                        </div>
                        <div>
                            <span>Planner</span>
                            <strong>{toolRuntime.runtime?.config?.models?.plannerModelId || 'firefly planner'}</strong>
                        </div>
                        <div>
                            <span>能力市场</span>
                            <strong>{marketAccess.enabledSkillIds?.length || 0} Skill / {marketAccess.enabledMcpIds?.length || 0} MCP</strong>
                        </div>
                    </div>
                    <div className="firefly-badge-list">
                        {environmentBadges.map((item) => (
                            <span key={item}>{item}</span>
                        ))}
                    </div>
                </article>

                <article className="firefly-panel glass">
                    <div className="firefly-panel-head">
                        <div>
                            <span className="firefly-panel-kicker">Runtime</span>
                            <h2>执行内核</h2>
                        </div>
                    </div>
                    <div className="firefly-runtime-checklist">
                        <div><strong>{runtimeState.runs.length}</strong><span>历史运行</span></div>
                        <div><strong>{toolRuntime.scheduledTasks.length}</strong><span>定时任务</span></div>
                        <div><strong>{toolRuntime.runtime?.maturity || 'agent_v0.x'}</strong><span>当前成熟度</span></div>
                    </div>
                    <p className="firefly-panel-copy">当前萤火虫已经具备 planner、executor、task persistence 与 SSE trace，但仍在从“工具编排 runtime”向“任务型 agent workbench”升级。</p>
                </article>

                <article className="firefly-panel glass">
                    <div className="firefly-panel-head">
                        <div>
                            <span className="firefly-panel-kicker">Policy</span>
                            <h2>当前约束</h2>
                        </div>
                    </div>
                    <div className="firefly-badge-list compact">
                        <span>{userProfile.name || '校园用户'}</span>
                        <span>{selectedCapabilityIds.length > 0 ? `${selectedCapabilityIds.map((item) => capabilityNameMap[item] || item).join(' / ')}` : '未指定能力域'}</span>
                        <span>{marketAccess.enabledSkillIds?.length || 0} 个启用 Skill</span>
                        <span>{marketAccess.enabledMcpIds?.length || 0} 个启用 MCP</span>
                    </div>
                    <p className="firefly-panel-copy">这组环境会随用户当前模型、能力域、能力市场安装状态和学校策略一起进入本轮运行，不再只是聊天上下文里的隐藏参数。</p>
                </article>
            </section>
        </main>
    );
}
