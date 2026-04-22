'use client';

import { useEffect, useMemo, useState } from 'react';
import './AdminRuntimePanel.css';

function formatDateTime(value) {
    if (!value) {
        return '未记录';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
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
    if (status === 'running') return '执行中';
    if (status === 'planning') return '规划中';
    return status || '待处理';
}

function formatStepStatus(status = '') {
    if (status === 'awaiting_approval') return '等待审批';
    if (status === 'completed') return '已完成';
    if (status === 'failed') return '失败';
    if (status === 'running') return '执行中';
    if (status === 'pending') return '待开始';
    return status || '处理中';
}

function formatControlState(status = '') {
    if (status === 'approved') return '已批准';
    if (status === 'paused') return '已暂停';
    if (status === 'rejected') return '已拒绝';
    return '待观察';
}

function computeOpsMetrics(runtime) {
    const sessions = Array.isArray(runtime?.sessions) ? runtime.sessions : [];
    const tasks = Array.isArray(runtime?.tasks) ? runtime.tasks : [];
    const workspaces = Array.isArray(runtime?.workspaces) ? runtime.workspaces : [];
    const events = Array.isArray(runtime?.events) ? runtime.events : [];

    return [
        {
            label: '当前会话',
            value: sessions.length,
            hint: '正在被记录的萤火虫会话',
        },
        {
            label: '在途任务',
            value: tasks.filter((item) => !['completed', 'failed', 'cancelled'].includes(item.status)).length,
            hint: '仍在推进或等待恢复的任务',
        },
        {
            label: '工作面恢复点',
            value: workspaces.length,
            hint: '可用于页面接力恢复的快照',
        },
        {
            label: '最近事件',
            value: events.length,
            hint: '服务端记录的运行事件数',
        },
    ];
}

function summarizeTask(task = null) {
    const steps = Array.isArray(task?.steps) ? task.steps : [];
    const checkpoints = Array.isArray(task?.checkpoints) ? task.checkpoints : [];
    const logs = Array.isArray(task?.executionLogs) ? task.executionLogs : [];
    const completedSteps = steps.filter((item) => item.status === 'completed').length;
    const failedSteps = steps.filter((item) => item.status === 'failed').length;
    const runningSteps = steps.filter((item) => item.status === 'running').length;

    return {
        stepCount: steps.length,
        checkpointCount: checkpoints.length,
        logCount: logs.length,
        completedSteps,
        failedSteps,
        runningSteps,
    };
}

function buildTaskOutputs(task = null) {
    const stepResults = task?.stepResults && typeof task.stepResults === 'object' ? task.stepResults : {};
    const steps = Array.isArray(task?.steps) ? task.steps : [];

    return steps
        .map((step, index) => {
            const result = stepResults[step.outputKey] || stepResults[step.toolId] || null;
            return {
                id: step.id || `output-${index + 1}`,
                label: step.label || step.toolId || `步骤 ${index + 1}`,
                toolId: step.toolId || step.outputKey || '',
                summary: step.summary || result?.summary || '当前还没有返回结构化结果。',
                status: step.status || 'pending',
            };
        })
        .filter((item) => item.toolId || item.status !== 'pending');
}

function formatWorkerStatus(status = '') {
    if (status === 'completed') return '已完成';
    if (status === 'failed') return '失败';
    if (status === 'running') return '执行中';
    if (status === 'awaiting_approval') return '等待审批';
    return status || '待开始';
}

function formatThreadStatus(status = '') {
    if (status === 'booting') return '引导中';
    if (status === 'planned') return '已规划';
    if (status === 'planning') return '规划中';
    if (status === 'completed') return '已完成';
    if (status === 'failed') return '失败';
    if (status === 'running') return '执行中';
    if (status === 'idle') return '空闲';
    return status || '未记录';
}

function formatProjectedTodoStatus(status = '') {
    if (status === 'completed') return '已完成';
    if (status === 'failed') return '失败';
    if (status === 'in_progress') return '进行中';
    if (status === 'running') return '执行中';
    return status || '待开始';
}

function summarizeIdList(items = [], limit = 2) {
    const normalized = Array.isArray(items)
        ? items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)
        : [];

    if (!normalized.length) {
        return '未关联';
    }

    if (normalized.length <= limit) {
        return normalized.join('、');
    }

    return `${normalized.slice(0, limit).join('、')} 等 ${normalized.length} 项`;
}

function formatPlannerVerdict(verdict = '') {
    if (verdict === 'revised') return '已修正';
    if (verdict === 'accepted') return '已通过';
    return verdict || '未记录';
}

function formatPriorityBand(priorityBand = '') {
    if (priorityBand === 'critical') return '关键';
    if (priorityBand === 'high') return '高优先级';
    if (priorityBand === 'working') return '工作中';
    if (priorityBand === 'standard') return '标准';
    return priorityBand || '未标记';
}

function formatRetentionPolicy(policy = '') {
    if (policy === 'compressed_rollup') return '压缩汇总';
    if (policy === 'rolling') return '滚动保留';
    return policy || '未标记';
}

function formatVisibility(visibility = '') {
    if (visibility === 'runtime') return '运行时';
    if (visibility === 'admin') return '后台';
    return visibility || '默认';
}

function formatSelectionStrategy(strategy = '') {
    if (strategy === 'planner_trimmed_candidates') return '候选裁剪';
    if (strategy === 'runtime_replay') return '重放沿用';
    if (strategy === 'direct_match') return '直接命中';
    return strategy || '默认';
}

export default function AdminRuntimePanel({ initialRuntime }) {
    const [runtime, setRuntime] = useState(initialRuntime);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState(() => new Date().toISOString());
    const [selectedTaskId, setSelectedTaskId] = useState('');
    const [selectedThreadRuntime, setSelectedThreadRuntime] = useState({
        thread: null,
        threadState: null,
        subagents: [],
    });
    const [isThreadRuntimeLoading, setIsThreadRuntimeLoading] = useState(false);
    const [controlState, setControlState] = useState({
        pendingAction: '',
        taskId: '',
        stepId: '',
        message: '',
        error: '',
    });

    const refreshRuntime = async ({ silent = false } = {}) => {
        if (!silent) {
            setIsRefreshing(true);
        }

        try {
            const response = await fetch('/api/firefly/runtime', { cache: 'no-store' });
            const payload = await response.json();
            if (payload?.ok) {
                setRuntime(payload);
                setLastUpdatedAt(new Date().toISOString());
            }
        } catch (error) {
            console.error('Failed to refresh admin runtime panel:', error);
        } finally {
            if (!silent) {
                setIsRefreshing(false);
            }
        }
    };

    useEffect(() => {
        let disposed = false;

        const refresh = async () => {
            try {
                const response = await fetch('/api/firefly/runtime', { cache: 'no-store' });
                const payload = await response.json();
                if (!disposed && payload?.ok) {
                    setRuntime(payload);
                    setLastUpdatedAt(new Date().toISOString());
                }
            } catch (error) {
                if (!disposed) {
                    console.error('Failed to refresh admin runtime panel:', error);
                }
            }
        };

        const timer = window.setInterval(refresh, 30000);
        return () => {
            disposed = true;
            window.clearInterval(timer);
        };
    }, []);

    const metrics = useMemo(() => computeOpsMetrics(runtime), [runtime]);
    const recentSessions = useMemo(() => (runtime?.sessions || []).slice(0, 6), [runtime]);
    const recentTasks = useMemo(() => (runtime?.tasks || []).slice(0, 8), [runtime]);
    const recentEvents = useMemo(() => (runtime?.events || []).slice(0, 10), [runtime]);

    useEffect(() => {
        if (!recentTasks.length) {
            setSelectedTaskId('');
            return;
        }

        if (!selectedTaskId || !recentTasks.some((item) => item.id === selectedTaskId)) {
            setSelectedTaskId(recentTasks[0].id);
        }
    }, [recentTasks, selectedTaskId]);

    const selectedTask = useMemo(() => (
        recentTasks.find((item) => item.id === selectedTaskId) || recentTasks[0] || null
    ), [recentTasks, selectedTaskId]);

    useEffect(() => {
        if (!selectedTask?.threadKey) {
            setSelectedThreadRuntime({
                thread: null,
                threadState: null,
                subagents: [],
            });
            setIsThreadRuntimeLoading(false);
            return;
        }

        let disposed = false;

        const loadSelectedThreadRuntime = async () => {
            setIsThreadRuntimeLoading(true);

            try {
                const response = await fetch(`/api/firefly/runtime?threadKey=${encodeURIComponent(selectedTask.threadKey)}`, {
                    cache: 'no-store',
                });
                const payload = await response.json();

                if (!disposed && payload?.ok) {
                    setSelectedThreadRuntime({
                        thread: payload.thread || null,
                        threadState: payload.threadState || null,
                        subagents: Array.isArray(payload.subagents) ? payload.subagents : [],
                    });
                }
            } catch (error) {
                if (!disposed) {
                    console.error('Failed to load firefly thread runtime detail:', error);
                }
            } finally {
                if (!disposed) {
                    setIsThreadRuntimeLoading(false);
                }
            }
        };

        loadSelectedThreadRuntime();

        return () => {
            disposed = true;
        };
    }, [selectedTask?.threadKey, selectedTask?.id, selectedTask?.updatedAt, selectedTask?.runId, selectedTask?.status, lastUpdatedAt]);

    const taskSummary = useMemo(() => summarizeTask(selectedTask), [selectedTask]);
    const selectedTaskOutputs = useMemo(() => buildTaskOutputs(selectedTask), [selectedTask]);
    const selectedTaskEvents = useMemo(() => {
        if (!selectedTask) {
            return [];
        }

        return (runtime?.events || [])
            .filter((item) => (
                item.taskId === selectedTask.id
                || item.runId === selectedTask.runId
                || item.threadKey === selectedTask.threadKey
            ))
            .slice(0, 10);
    }, [runtime, selectedTask]);

    const selectedTaskLogs = useMemo(() => (
        Array.isArray(selectedTask?.executionLogs) ? selectedTask.executionLogs.slice(-8).reverse() : []
    ), [selectedTask]);

    const selectedTaskCheckpoints = useMemo(() => (
        Array.isArray(selectedTask?.checkpoints) ? [...selectedTask.checkpoints].reverse().slice(0, 6) : []
    ), [selectedTask]);
    const selectedWorkers = useMemo(() => (
        Array.isArray(selectedTask?.workerTree)
            ? [...selectedTask.workerTree].sort((left, right) => {
                if (left.id === 'supervisor-root') return -1;
                if (right.id === 'supervisor-root') return 1;
                return 0;
            })
            : []
    ), [selectedTask]);
    const selectedTaskPlanMetadata = useMemo(() => (
        selectedTask?.planMetadata && typeof selectedTask.planMetadata === 'object' ? selectedTask.planMetadata : {}
    ), [selectedTask]);
    const selectedPlannerReview = useMemo(() => (
        selectedTaskPlanMetadata?.plannerReview && typeof selectedTaskPlanMetadata.plannerReview === 'object'
            ? selectedTaskPlanMetadata.plannerReview
            : {}
    ), [selectedTaskPlanMetadata]);
    const selectedPlannerSelfRevisions = useMemo(() => (
        Array.isArray(selectedPlannerReview?.selfRevisions)
            ? selectedPlannerReview.selfRevisions
            : Array.isArray(selectedPlannerReview?.revisions)
                ? selectedPlannerReview.revisions
                : []
    ), [selectedPlannerReview]);
    const selectedPlannerGovernanceInfluences = useMemo(() => (
        Array.isArray(selectedPlannerReview?.governanceInfluences)
            ? selectedPlannerReview.governanceInfluences
            : []
    ), [selectedPlannerReview]);
    const selectedToolSelectionControl = useMemo(() => (
        selectedTaskPlanMetadata?.toolSelectionControl && typeof selectedTaskPlanMetadata.toolSelectionControl === 'object'
            ? selectedTaskPlanMetadata.toolSelectionControl
            : {}
    ), [selectedTaskPlanMetadata]);
    const selectedMemoryStrategy = useMemo(() => (
        selectedTaskPlanMetadata?.memoryStrategy && typeof selectedTaskPlanMetadata.memoryStrategy === 'object'
            ? selectedTaskPlanMetadata.memoryStrategy
            : selectedTask?.contextSnapshot?.serviceMemoryStrategy && typeof selectedTask.contextSnapshot.serviceMemoryStrategy === 'object'
                ? selectedTask.contextSnapshot.serviceMemoryStrategy
                : {}
    ), [selectedTask, selectedTaskPlanMetadata]);
    const selectedMemoryGroups = useMemo(() => {
        const groups = selectedTask?.contextSnapshot?.serviceMemoryGroups && typeof selectedTask.contextSnapshot.serviceMemoryGroups === 'object'
            ? selectedTask.contextSnapshot.serviceMemoryGroups
            : {};

        return [
            { key: 'compressed', label: '跨周期摘要', items: Array.isArray(groups.compressed) ? groups.compressed : [] },
            { key: 'workflow_hint', label: '流程线索', items: Array.isArray(groups.workflow_hint) ? groups.workflow_hint : [] },
            { key: 'task_result', label: '直接相关任务', items: Array.isArray(groups.task_result) ? groups.task_result : [] },
            { key: 'user_preference', label: '用户偏好', items: Array.isArray(groups.user_preference) ? groups.user_preference : [] },
            { key: 'reading_context', label: '阅读上下文', items: Array.isArray(groups.reading_context) ? groups.reading_context : [] },
        ].filter((group) => group.items.length > 0);
    }, [selectedTask]);
    const selectedSubtasks = useMemo(() => (
        Array.isArray(selectedTask?.subtasks) ? selectedTask.subtasks : []
    ), [selectedTask]);
    const selectedThreadState = useMemo(() => (
        selectedThreadRuntime?.threadState && typeof selectedThreadRuntime.threadState === 'object'
            ? selectedThreadRuntime.threadState
            : null
    ), [selectedThreadRuntime]);
    const selectedThreadTodos = useMemo(() => (
        Array.isArray(selectedThreadState?.todos) ? selectedThreadState.todos : []
    ), [selectedThreadState]);
    const selectedThreadArtifacts = useMemo(() => (
        Array.isArray(selectedThreadState?.artifacts) ? selectedThreadState.artifacts : []
    ), [selectedThreadState]);
    const selectedThreadPaths = useMemo(() => ([
        {
            label: '工作区',
            value: selectedThreadState?.workspacePath || selectedTask?.contextSnapshot?.threadData?.workspacePath || '',
        },
        {
            label: '上传区',
            value: selectedThreadState?.uploadsPath || selectedTask?.contextSnapshot?.threadData?.uploadsPath || '',
        },
        {
            label: '输出区',
            value: selectedThreadState?.outputsPath || selectedTask?.contextSnapshot?.threadData?.outputsPath || '',
        },
    ]), [selectedTask, selectedThreadState]);
    const selectedThreadLatestCheckpoint = useMemo(() => (
        selectedThreadState?.latestCheckpoint && typeof selectedThreadState.latestCheckpoint === 'object'
            ? selectedThreadState.latestCheckpoint
            : null
    ), [selectedThreadState]);
    const selectedTaskSubagentRuns = useMemo(() => {
        const runs = Array.isArray(selectedThreadRuntime?.subagents) ? selectedThreadRuntime.subagents : [];
        if (!runs.length || !selectedTask) {
            return [];
        }

        const matches = runs.filter((item) => (
            item.parentTaskId === selectedTask.id
            || item.parentRunId === selectedTask.runId
        ));
        const preferredRuns = matches.length > 0 ? matches : runs;

        return [...preferredRuns]
            .sort((left, right) => (
                new Date(right.updatedAt || right.createdAt || 0).getTime()
                - new Date(left.updatedAt || left.createdAt || 0).getTime()
            ))
            .slice(0, 12);
    }, [selectedTask, selectedThreadRuntime]);
    const subagentStatusSummary = useMemo(() => ({
        running: selectedTaskSubagentRuns.filter((item) => item.status === 'running').length,
        failed: selectedTaskSubagentRuns.filter((item) => item.status === 'failed').length,
        completed: selectedTaskSubagentRuns.filter((item) => item.status === 'completed').length,
    }), [selectedTaskSubagentRuns]);

    const handleControlAction = async (action, stepId = '') => {
        if (!selectedTask?.id) {
            return;
        }

        setControlState({
            pendingAction: action,
            taskId: selectedTask.id,
            stepId,
            message: '',
            error: '',
        });

        try {
            const response = await fetch('/api/firefly/runtime/control', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action,
                    taskId: selectedTask.id,
                    stepId,
                }),
            });
            const payload = await response.json();

            if (!response.ok || !payload?.ok) {
                throw new Error(payload?.error || '运行控制动作执行失败。');
            }

            const nextTaskTitle = payload?.result?.task?.title || selectedTask.title || '当前任务';
            const actionLabel = action === 'retry_full'
                ? '已触发整轮重试'
                : action === 'retry_failed'
                    ? '已触发失败步骤重试'
                        : action === 'retry_step'
                            ? '已触发单步骤重跑'
                            : action === 'approve_step'
                                ? '已批准步骤并继续执行'
                        : action === 'approve_continue'
                            ? '已批准继续'
                            : action === 'pause_task'
                                ? '已标记暂停'
                                : action === 'reject_continue'
                                    ? '已拒绝继续'
                        : '已触发恢复续跑';

            setControlState({
                pendingAction: '',
                taskId: '',
                stepId: '',
                message: `${actionLabel}：${nextTaskTitle}`,
                error: '',
            });
            await refreshRuntime({ silent: true });
        } catch (error) {
            setControlState({
                pendingAction: '',
                taskId: '',
                stepId: '',
                message: '',
                error: error instanceof Error ? error.message : '运行控制动作执行失败。',
            });
        }
    };

    return (
        <div className="admin-runtime">
            <section className="admin-runtime-hero glass-strong">
                <div>
                    <span className="admin-runtime-kicker">Operations View</span>
                    <h2>运行观测</h2>
                    <p>这里不只看任务是否完成，还能从管理员视角检查运行链路、阶段推进、失败位置和可恢复入口，逐步靠近 OpenClaw 式的 runtime control plane。</p>
                </div>
                <div className="admin-runtime-meta">
                    <span>{isRefreshing ? '刷新中…' : '每 30 秒自动刷新'}</span>
                    <strong>最近更新：{formatDateTime(lastUpdatedAt)}</strong>
                </div>
            </section>

            <section className="admin-runtime-metrics">
                {metrics.map((item) => (
                    <article key={item.label} className="admin-runtime-metric glass">
                        <small>{item.label}</small>
                        <strong>{item.value}</strong>
                        <span>{item.hint}</span>
                    </article>
                ))}
            </section>

            <section className="admin-runtime-grid">
                <article className="admin-runtime-panel glass">
                    <div className="admin-runtime-head">
                        <h3>最近会话</h3>
                        <small>帮助判断老师和学生是否在持续使用</small>
                    </div>
                    <div className="admin-runtime-list">
                        {recentSessions.map((item) => (
                            <div key={item.id} className="admin-runtime-item">
                                <strong>{item.title || item.threadKey}</strong>
                                <span>{item.capabilityIds?.join('、') || '未标记能力'}</span>
                                <small>{formatDateTime(item.updatedAt)}</small>
                            </div>
                        ))}
                    </div>
                </article>

                <article className="admin-runtime-panel glass">
                    <div className="admin-runtime-head">
                        <h3>任务推进</h3>
                        <small>可选中查看具体运行阶段和工具输出摘要</small>
                    </div>
                    <div className="admin-runtime-list">
                        {recentTasks.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={`admin-runtime-item admin-runtime-task-button ${selectedTask?.id === item.id ? 'active' : ''}`}
                                onClick={() => setSelectedTaskId(item.id)}
                            >
                                <strong>{item.title}</strong>
                                <span>{formatTaskStatus(item.status)} · {item.planKind || '默认流程'}</span>
                                <small>{item.resultSummary || '尚未生成摘要'} · {formatDateTime(item.updatedAt)}</small>
                            </button>
                        ))}
                    </div>
                </article>

                <article className="admin-runtime-panel admin-runtime-panel-wide glass">
                    <div className="admin-runtime-head">
                        <h3>任务运行详情</h3>
                        <small>查看步骤、检查点、日志和事件，评估当前 runtime 离 OpenClaw 还差多少</small>
                    </div>

                    {selectedTask ? (
                        <div className="admin-runtime-detail">
                            <div className="admin-runtime-summary">
                                <div className="admin-runtime-highlight">
                                    <span className="admin-runtime-kicker">当前任务</span>
                                    <strong>{selectedTask.title}</strong>
                                    <p>{selectedTask.resultSummary || selectedTask.goal || '当前任务还没有形成结果摘要。'}</p>
                                </div>
                                <div className="admin-runtime-chip-row">
                                    <span className="admin-runtime-chip">{formatTaskStatus(selectedTask.status)}</span>
                                    <span className="admin-runtime-chip">{selectedTask.planKind || 'single_tool'}</span>
                                    <span className={`admin-runtime-chip ${selectedTask.controlState === 'rejected' ? 'danger' : selectedTask.controlState === 'approved' ? 'success' : ''}`}>控制 {formatControlState(selectedTask.controlState)}</span>
                                    <span className="admin-runtime-chip">{selectedTask.selectedSkillLabels?.length || 0} 个能力</span>
                                    <span className="admin-runtime-chip">{taskSummary.completedSteps}/{taskSummary.stepCount || 0} 步完成</span>
                                    {taskSummary.failedSteps > 0 ? <span className="admin-runtime-chip danger">失败 {taskSummary.failedSteps}</span> : null}
                                </div>
                                <div className="admin-runtime-actions">
                                    <button
                                        type="button"
                                        className="admin-runtime-action success"
                                        disabled={controlState.pendingAction === 'approve_continue' && controlState.taskId === selectedTask.id}
                                        onClick={() => handleControlAction('approve_continue')}
                                    >
                                        {controlState.pendingAction === 'approve_continue' && controlState.taskId === selectedTask.id ? '正在提交…' : '批准继续'}
                                    </button>
                                    <button
                                        type="button"
                                        className="admin-runtime-action"
                                        disabled={controlState.pendingAction === 'pause_task' && controlState.taskId === selectedTask.id}
                                        onClick={() => handleControlAction('pause_task')}
                                    >
                                        {controlState.pendingAction === 'pause_task' && controlState.taskId === selectedTask.id ? '正在提交…' : '暂停观察'}
                                    </button>
                                    <button
                                        type="button"
                                        className="admin-runtime-action danger"
                                        disabled={controlState.pendingAction === 'reject_continue' && controlState.taskId === selectedTask.id}
                                        onClick={() => handleControlAction('reject_continue')}
                                    >
                                        {controlState.pendingAction === 'reject_continue' && controlState.taskId === selectedTask.id ? '正在提交…' : '拒绝继续'}
                                    </button>
                                    <button
                                        type="button"
                                        className="admin-runtime-action primary"
                                        disabled={selectedTask.controlState === 'rejected' || selectedTask.controlState === 'paused' || (controlState.pendingAction === 'retry_full' && controlState.taskId === selectedTask.id)}
                                        onClick={() => handleControlAction('retry_full')}
                                    >
                                        {controlState.pendingAction === 'retry_full' && controlState.taskId === selectedTask.id ? '正在重试…' : '整轮重试'}
                                    </button>
                                    <button
                                        type="button"
                                        className="admin-runtime-action"
                                        disabled={selectedTask.controlState === 'rejected' || selectedTask.controlState === 'paused' || taskSummary.failedSteps === 0 || (controlState.pendingAction === 'retry_failed' && controlState.taskId === selectedTask.id)}
                                        onClick={() => handleControlAction('retry_failed')}
                                    >
                                        {controlState.pendingAction === 'retry_failed' && controlState.taskId === selectedTask.id ? '正在重试…' : '失败步骤重试'}
                                    </button>
                                    <button
                                        type="button"
                                        className="admin-runtime-action"
                                        disabled={selectedTask.controlState === 'rejected' || selectedTask.controlState === 'paused' || (controlState.pendingAction === 'resume_plan' && controlState.taskId === selectedTask.id)}
                                        onClick={() => handleControlAction('resume_plan')}
                                    >
                                        {controlState.pendingAction === 'resume_plan' && controlState.taskId === selectedTask.id ? '正在恢复…' : '恢复续跑'}
                                    </button>
                                </div>
                                {controlState.message ? (
                                    <div className="admin-runtime-feedback success">{controlState.message}</div>
                                ) : null}
                                {controlState.error ? (
                                    <div className="admin-runtime-feedback error">{controlState.error}</div>
                                ) : null}
                                <div className="admin-runtime-stat-grid">
                                    <div className="admin-runtime-stat-card">
                                        <small>检查点</small>
                                        <strong>{taskSummary.checkpointCount}</strong>
                                    </div>
                                    <div className="admin-runtime-stat-card">
                                        <small>日志条数</small>
                                        <strong>{taskSummary.logCount}</strong>
                                    </div>
                                    <div className="admin-runtime-stat-card">
                                        <small>运行线程</small>
                                        <strong>{selectedTask.threadKey || '默认线程'}</strong>
                                    </div>
                                    <div className="admin-runtime-stat-card">
                                        <small>恢复状态</small>
                                        <strong>{selectedTask.recoveryState?.ready ? '可恢复' : '待补足'}</strong>
                                    </div>
                                    <div className="admin-runtime-stat-card">
                                        <small>控制更新时间</small>
                                        <strong>{selectedTask.controlUpdatedAt ? formatDateTime(selectedTask.controlUpdatedAt) : '未干预'}</strong>
                                    </div>
                                    <div className="admin-runtime-stat-card">
                                        <small>控制备注</small>
                                        <strong>{selectedTask.controlNote || '暂无备注'}</strong>
                                    </div>
                                </div>
                            </div>

                            <div className="admin-runtime-columns">
                                <div className="admin-runtime-block">
                                    <div className="admin-runtime-subhead">
                                        <h4>Thread State / Deer Runtime</h4>
                                        <small>看线程态、目录投影、todo/artifact 和最新检查点是否真的被 runtime 接住</small>
                                    </div>
                                    <div className="admin-runtime-chip-row">
                                        <span className="admin-runtime-chip">{formatThreadStatus(selectedThreadState?.status || selectedTask?.status)}</span>
                                        <span className="admin-runtime-chip">{selectedThreadTodos.length} 个投影待办</span>
                                        <span className="admin-runtime-chip">{selectedThreadArtifacts.length} 个线程产物</span>
                                        <span className="admin-runtime-chip">{selectedTaskSubagentRuns.length} 个 subagent</span>
                                        {selectedThreadLatestCheckpoint ? (
                                            <span className="admin-runtime-chip success">最新检查点 {selectedThreadLatestCheckpoint.label || selectedThreadLatestCheckpoint.id}</span>
                                        ) : null}
                                    </div>
                                    {isThreadRuntimeLoading ? (
                                        <div className="admin-runtime-empty">正在拉取当前线程的运行态详情…</div>
                                    ) : selectedThreadState ? (
                                        <div className="admin-runtime-section-stack">
                                            <div className="admin-runtime-stat-grid admin-runtime-stat-grid-compact">
                                                <div className="admin-runtime-stat-card">
                                                    <small>线程键</small>
                                                    <strong>{selectedThreadState.threadKey || selectedTask.threadKey || '未记录'}</strong>
                                                </div>
                                                <div className="admin-runtime-stat-card">
                                                    <small>最后任务</small>
                                                    <strong>{selectedThreadState.lastTaskId || '未记录'}</strong>
                                                </div>
                                                <div className="admin-runtime-stat-card">
                                                    <small>最后运行</small>
                                                    <strong>{selectedThreadState.lastRunId || selectedTask.runId || '未记录'}</strong>
                                                </div>
                                                <div className="admin-runtime-stat-card">
                                                    <small>线程更新时间</small>
                                                    <strong>{formatDateTime(selectedThreadState.updatedAt)}</strong>
                                                </div>
                                            </div>
                                            <div className="admin-runtime-list">
                                                {selectedThreadPaths.map((item) => (
                                                    <div key={item.label} className="admin-runtime-item">
                                                        <strong>{item.label}</strong>
                                                        <small className="admin-runtime-item-path">{item.value || '未建立目录'}</small>
                                                    </div>
                                                ))}
                                            </div>
                                            {selectedThreadLatestCheckpoint ? (
                                                <div className="admin-runtime-item">
                                                    <strong>{selectedThreadLatestCheckpoint.label || '最新检查点'}</strong>
                                                    <span>{selectedThreadLatestCheckpoint.status || 'pending'} · 批次 {selectedThreadLatestCheckpoint.batchIndex || '-'}</span>
                                                    <small>{selectedThreadLatestCheckpoint.summary || '当前检查点暂无补充说明。'} · {formatDateTime(selectedThreadLatestCheckpoint.createdAt)}</small>
                                                    <div className="admin-runtime-chip-row">
                                                        <span className="admin-runtime-chip">{selectedThreadLatestCheckpoint.stepIds?.length || 0} 个步骤</span>
                                                        <span className="admin-runtime-chip">{selectedThreadLatestCheckpoint.workerIds?.length || 0} 个 worker</span>
                                                        <span className="admin-runtime-chip success">{selectedThreadLatestCheckpoint.subagentRunIds?.length || 0} 个 subagent</span>
                                                    </div>
                                                </div>
                                            ) : null}
                                            <div className="admin-runtime-columns">
                                                <div className="admin-runtime-block">
                                                    <div className="admin-runtime-subhead">
                                                        <h4>线程待办投影</h4>
                                                        <small>当前 thread state 里保存的 todo 快照</small>
                                                    </div>
                                                    <div className="admin-runtime-list">
                                                        {selectedThreadTodos.length > 0 ? selectedThreadTodos.slice(0, 6).map((todo) => (
                                                            <div key={todo.id} className="admin-runtime-item">
                                                                <strong>{todo.label}</strong>
                                                                <span>{formatProjectedTodoStatus(todo.status)}{todo.linkedToolIds?.length ? ` · ${todo.linkedToolIds.join('、')}` : ''}</span>
                                                                <small>{todo.summary || '当前待办暂无额外摘要。'}</small>
                                                            </div>
                                                        )) : (
                                                            <div className="admin-runtime-empty">当前线程还没有投影待办。</div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="admin-runtime-block">
                                                    <div className="admin-runtime-subhead">
                                                        <h4>线程产物投影</h4>
                                                        <small>看结果是否已经沉淀到可恢复的线程产物里</small>
                                                    </div>
                                                    <div className="admin-runtime-list">
                                                        {selectedThreadArtifacts.length > 0 ? selectedThreadArtifacts.slice(0, 6).map((artifact) => (
                                                            <div key={artifact.id} className="admin-runtime-item">
                                                                <strong>{artifact.label}</strong>
                                                                <span>{artifact.type || 'summary'}</span>
                                                                <small>{artifact.href || '当前产物暂无链接。'} · {formatDateTime(artifact.updatedAt)}</small>
                                                            </div>
                                                        )) : (
                                                            <div className="admin-runtime-empty">当前线程还没有沉淀产物。</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="admin-runtime-empty">当前任务还没有拉到 Deer runtime 的线程态详情。</div>
                                    )}
                                </div>

                                <div className="admin-runtime-block">
                                    <div className="admin-runtime-subhead">
                                        <h4>Subagent Runs</h4>
                                        <small>看并发执行有没有真正进入“子代理批次”，而不是停留在 Promise.all</small>
                                    </div>
                                    <div className="admin-runtime-chip-row">
                                        <span className="admin-runtime-chip">{selectedTaskSubagentRuns.length} 个运行单元</span>
                                        <span className="admin-runtime-chip">{subagentStatusSummary.completed} 个已完成</span>
                                        {subagentStatusSummary.running > 0 ? (
                                            <span className="admin-runtime-chip">执行中 {subagentStatusSummary.running}</span>
                                        ) : null}
                                        {subagentStatusSummary.failed > 0 ? (
                                            <span className="admin-runtime-chip danger">失败 {subagentStatusSummary.failed}</span>
                                        ) : null}
                                    </div>
                                    <div className="admin-runtime-list">
                                        {isThreadRuntimeLoading ? (
                                            <div className="admin-runtime-empty">正在同步 subagent 运行明细…</div>
                                        ) : selectedTaskSubagentRuns.length > 0 ? selectedTaskSubagentRuns.map((item) => {
                                            const isLinkedToLatestCheckpoint = selectedThreadLatestCheckpoint?.subagentRunIds?.includes(item.id);

                                            return (
                                                <div key={item.id} className="admin-runtime-item">
                                                    <strong>{item.label}</strong>
                                                    <span>{formatWorkerStatus(item.status)} · {item.toolId || '未绑定工具'}</span>
                                                    <small>{item.summary || item.error || '当前运行单元暂无额外摘要。'} · {formatDateTime(item.updatedAt || item.createdAt)}</small>
                                                    <div className="admin-runtime-chip-row">
                                                        <span className="admin-runtime-chip">trace {item.traceId}</span>
                                                        {item.workerId ? <span className="admin-runtime-chip">worker {item.workerId}</span> : null}
                                                        {item.stepId ? <span className="admin-runtime-chip">step {item.stepId}</span> : null}
                                                        {item.subtaskId ? <span className="admin-runtime-chip">subtask {item.subtaskId}</span> : null}
                                                        {item.parentRunId ? <span className="admin-runtime-chip">run {item.parentRunId}</span> : null}
                                                        {isLinkedToLatestCheckpoint ? <span className="admin-runtime-chip success">已写入最新检查点</span> : null}
                                                    </div>
                                                </div>
                                            );
                                        }) : (
                                            <div className="admin-runtime-empty">当前任务还没有记录到 subagent 执行明细。</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="admin-runtime-columns">
                                <div className="admin-runtime-block">
                                    <div className="admin-runtime-subhead">
                                        <h4>规划自检 / 工具选择</h4>
                                        <small>看 planner 有没有自反馈、修正和明确的工具裁剪</small>
                                    </div>
                                    <div className="admin-runtime-chip-row">
                                        <span className="admin-runtime-chip">{formatPlannerVerdict(selectedPlannerReview.verdict)}</span>
                                        <span className="admin-runtime-chip">{selectedToolSelectionControl.selectedToolIds?.length || 0} 个已选工具</span>
                                        <span className="admin-runtime-chip">{selectedToolSelectionControl.candidateToolIds?.length || 0} 个候选工具</span>
                                        <span className="admin-runtime-chip">{formatSelectionStrategy(selectedToolSelectionControl.selectionStrategy)}</span>
                                        {(selectedToolSelectionControl.requiresApprovalToolIds?.length || 0) > 0 ? (
                                            <span className="admin-runtime-chip danger">需审批 {selectedToolSelectionControl.requiresApprovalToolIds.length}</span>
                                        ) : null}
                                    </div>
                                    <div className="admin-runtime-list">
                                        {selectedPlannerSelfRevisions.length > 0 ? selectedPlannerSelfRevisions.map((item, index) => (
                                            <div key={`planner-revision-${index + 1}`} className="admin-runtime-item">
                                                <strong>修正 {index + 1}</strong>
                                                <span>planner_review</span>
                                                <small>{item}</small>
                                            </div>
                                        )) : (
                                            <div className="admin-runtime-empty">本轮规划没有触发额外修正，已经直接通过自检。</div>
                                        )}

                                        {selectedPlannerGovernanceInfluences.length > 0 ? selectedPlannerGovernanceInfluences.map((item, index) => (
                                            <div key={`governance-influence-${index + 1}`} className="admin-runtime-item">
                                                <strong>治理影响 {index + 1}</strong>
                                                <span>front_control_plane</span>
                                                <small>{item}</small>
                                            </div>
                                        )) : null}

                                        {(selectedToolSelectionControl.selectedTools || []).length > 0 ? selectedToolSelectionControl.selectedTools.map((tool) => (
                                            <div key={`selected-tool-${tool.id}`} className="admin-runtime-item">
                                                <strong>{tool.name}</strong>
                                                <span>selected · {tool.id}</span>
                                                <small>{tool.capabilityId || '未标记能力域'}</small>
                                            </div>
                                        )) : null}

                                        {(selectedToolSelectionControl.excludedTools || []).length > 0 ? selectedToolSelectionControl.excludedTools.map((tool) => (
                                            <div key={`excluded-tool-${tool.id}`} className="admin-runtime-item">
                                                <strong>{tool.name}</strong>
                                                <span>excluded · {tool.id}</span>
                                                <small>{tool.reason}</small>
                                            </div>
                                        )) : null}
                                    </div>
                                </div>

                                <div className="admin-runtime-block">
                                    <div className="admin-runtime-subhead">
                                        <h4>记忆注入 / 治理</h4>
                                        <small>看长期记忆是否已经进入压缩、分层检索和优先级治理</small>
                                    </div>
                                    <div className="admin-runtime-stat-grid admin-runtime-stat-grid-compact">
                                        <div className="admin-runtime-stat-card">
                                            <small>压缩摘要</small>
                                            <strong>{selectedMemoryStrategy.compressedCount || 0}</strong>
                                        </div>
                                        <div className="admin-runtime-stat-card">
                                            <small>流程线索</small>
                                            <strong>{selectedMemoryStrategy.workflowHintCount || 0}</strong>
                                        </div>
                                        <div className="admin-runtime-stat-card">
                                            <small>直接任务</small>
                                            <strong>{selectedMemoryStrategy.directTaskCount || 0}</strong>
                                        </div>
                                        <div className="admin-runtime-stat-card">
                                            <small>用户偏好</small>
                                            <strong>{selectedMemoryStrategy.preferenceCount || 0}</strong>
                                        </div>
                                    </div>
                                    <div className="admin-runtime-list">
                                        {selectedMemoryGroups.length > 0 ? selectedMemoryGroups.map((group) => (
                                            <div key={group.key} className="admin-runtime-item">
                                                <strong>{group.label}</strong>
                                                <span>{group.items.length} 条记忆命中</span>
                                                <small>{group.items.map((item) => (
                                                    `${item.title}（${formatPriorityBand(item.priorityBand)} / ${formatRetentionPolicy(item.retentionPolicy)} / ${formatVisibility(item.visibility)}）`
                                                )).join('；')}</small>
                                            </div>
                                        )) : (
                                            <div className="admin-runtime-empty">当前任务没有命中服务端长期记忆，或还没有进入记忆注入阶段。</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="admin-runtime-columns">
                                <div className="admin-runtime-block">
                                    <div className="admin-runtime-subhead">
                                        <h4>Supervisor / Workers</h4>
                                        <small>查看当前任务是否已经进入多 worker 结构</small>
                                    </div>
                                    <div className="admin-runtime-list">
                                        {selectedWorkers.length > 0 ? selectedWorkers.map((worker) => (
                                            <div key={worker.id} className="admin-runtime-item">
                                                <strong>{worker.label}</strong>
                                                <span>{worker.role} · {formatWorkerStatus(worker.status)}{worker.parentId ? ` · parent ${worker.parentId}` : ''}</span>
                                                <small>{Array.isArray(worker.linkedToolIds) && worker.linkedToolIds.length ? worker.linkedToolIds.join('、') : '无关联工具'}{Array.isArray(worker.stepIds) && worker.stepIds.length ? ` · ${worker.stepIds.length} 个步骤` : ''}{worker.resultSummary ? ` · ${worker.resultSummary}` : ''}</small>
                                            </div>
                                        )) : (
                                            <div className="admin-runtime-empty">当前任务还没有 worker 结构。</div>
                                        )}
                                    </div>
                                </div>

                                <div className="admin-runtime-block">
                                    <div className="admin-runtime-subhead">
                                        <h4>子任务拆解</h4>
                                        <small>看多步执行是否已经从单步骤演化成更稳定的 subtask 结构</small>
                                    </div>
                                    <div className="admin-runtime-list">
                                        {selectedSubtasks.length > 0 ? selectedSubtasks.map((subtask) => (
                                            <div key={subtask.id} className="admin-runtime-item">
                                                <strong>{subtask.label}</strong>
                                                <span>{subtask.status || 'pending'} · {subtask.id}</span>
                                                <small>{subtask.summary || '当前子任务暂无额外说明。'}{Array.isArray(subtask.linkedToolIds) && subtask.linkedToolIds.length ? ` · ${subtask.linkedToolIds.join('、')}` : ''}</small>
                                            </div>
                                        )) : (
                                            <div className="admin-runtime-empty">当前任务还没有显式的子任务拆解。</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="admin-runtime-columns">
                                <div className="admin-runtime-block">
                                    <div className="admin-runtime-subhead">
                                        <h4>步骤状态</h4>
                                        <small>看任务卡在哪一步</small>
                                    </div>
                                    <div className="admin-runtime-list">
                                        {(selectedTask.steps || []).length > 0 ? selectedTask.steps.map((step) => (
                                            <div key={step.id} className="admin-runtime-item">
                                                <strong>{step.label}</strong>
                                                <span>{formatStepStatus(step.status)} · {step.outputKey || step.toolId || '未标记输出键'}</span>
                                                <small>{step.summary || step.purpose || '当前步骤暂无补充说明。'}</small>
                                                <div className="admin-runtime-inline-actions">
                                                    {step.status === 'awaiting_approval' ? (
                                                        <button
                                                            type="button"
                                                            className="admin-runtime-inline-action success"
                                                            disabled={controlState.pendingAction === 'approve_step' && controlState.taskId === selectedTask.id && controlState.stepId === step.id}
                                                            onClick={() => handleControlAction('approve_step', step.id)}
                                                        >
                                                            {controlState.pendingAction === 'approve_step' && controlState.taskId === selectedTask.id && controlState.stepId === step.id ? '正在批准…' : (step.approvalLabel || '批准并继续')}
                                                        </button>
                                                    ) : null}
                                                    <button
                                                        type="button"
                                                        className="admin-runtime-inline-action"
                                                        disabled={selectedTask.controlState === 'rejected' || selectedTask.controlState === 'paused' || step.status === 'running' || (controlState.pendingAction === 'retry_step' && controlState.taskId === selectedTask.id && controlState.stepId === step.id)}
                                                        onClick={() => handleControlAction('retry_step', step.id)}
                                                    >
                                                        {controlState.pendingAction === 'retry_step' && controlState.taskId === selectedTask.id && controlState.stepId === step.id ? '正在重跑…' : '重跑这一步'}
                                                    </button>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="admin-runtime-empty">当前没有记录到可展示的步骤。</div>
                                        )}
                                    </div>
                                </div>

                                <div className="admin-runtime-block">
                                    <div className="admin-runtime-subhead">
                                        <h4>运行检查点</h4>
                                        <small>看每个阶段有没有顺利推进</small>
                                    </div>
                                    <div className="admin-runtime-list">
                                        {selectedTaskCheckpoints.length > 0 ? selectedTaskCheckpoints.map((item) => (
                                            <div key={item.id} className="admin-runtime-item">
                                                <strong>{item.label}</strong>
                                                <span>{item.status} · 阶段 {item.batchIndex || '-'}</span>
                                                <small>{item.summary || '当前检查点暂无补充说明'} · {formatDateTime(item.createdAt)}</small>
                                                <div className="admin-runtime-chip-row">
                                                    {item.stepIds?.length ? (
                                                        <span className="admin-runtime-chip">步骤 {summarizeIdList(item.stepIds)}</span>
                                                    ) : null}
                                                    {item.workerIds?.length ? (
                                                        <span className="admin-runtime-chip">worker {summarizeIdList(item.workerIds)}</span>
                                                    ) : null}
                                                    {item.subagentRunIds?.length ? (
                                                        <span className="admin-runtime-chip success">subagent {summarizeIdList(item.subagentRunIds)}</span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="admin-runtime-empty">当前还没有检查点记录。</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="admin-runtime-columns">
                                <div className="admin-runtime-block">
                                    <div className="admin-runtime-subhead">
                                        <h4>工具结果摘要</h4>
                                        <small>判断每一步到底返回了什么</small>
                                    </div>
                                    <div className="admin-runtime-list">
                                        {selectedTaskOutputs.length > 0 ? selectedTaskOutputs.map((item) => (
                                            <div key={item.id} className="admin-runtime-item">
                                                <strong>{item.label}</strong>
                                                <span>{item.toolId || '未标记工具'} · {formatStepStatus(item.status)}</span>
                                                <small>{item.summary}</small>
                                            </div>
                                        )) : (
                                            <div className="admin-runtime-empty">当前没有工具结果摘要。</div>
                                        )}
                                    </div>
                                </div>

                                <div className="admin-runtime-block">
                                    <div className="admin-runtime-subhead">
                                        <h4>任务日志</h4>
                                        <small>更像 runtime trace，而不是普通聊天消息</small>
                                    </div>
                                    <div className="admin-runtime-list">
                                        {selectedTaskLogs.length > 0 ? selectedTaskLogs.map((item) => (
                                            <div key={item.id} className="admin-runtime-item">
                                                <strong>{item.message}</strong>
                                                <span>{item.level || 'info'}{item.stepId ? ` · ${item.stepId}` : ''}</span>
                                                <small>{formatDateTime(item.createdAt)}</small>
                                            </div>
                                        )) : (
                                            <div className="admin-runtime-empty">当前没有任务日志。</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="admin-runtime-block">
                                <div className="admin-runtime-subhead">
                                    <h4>相关系统事件</h4>
                                    <small>服务端 runtime 侧的事件时间线</small>
                                </div>
                                <div className="admin-runtime-list">
                                    {selectedTaskEvents.length > 0 ? selectedTaskEvents.map((item) => (
                                        <div key={item.id} className="admin-runtime-item">
                                            <strong>{item.label}</strong>
                                            <span>{item.type}{item.metadata?.stepLabel ? ` · ${item.metadata.stepLabel}` : ''}{item.metadata?.workerId ? ` · ${item.metadata.workerId}` : ''}</span>
                                            <small>{item.detail || '无补充说明'} · {formatDateTime(item.createdAt)}</small>
                                        </div>
                                    )) : (
                                        <div className="admin-runtime-empty">当前没有匹配到相关系统事件。</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="admin-runtime-empty">当前还没有可查看的任务运行详情。</div>
                    )}
                </article>

                <article className="admin-runtime-panel admin-runtime-panel-wide glass">
                    <div className="admin-runtime-head">
                        <h3>最近系统事件</h3>
                        <small>用来判断是否出现异常波动或大批量任务推进</small>
                    </div>
                    <div className="admin-runtime-list">
                        {recentEvents.map((item) => (
                            <div key={item.id} className="admin-runtime-item">
                                <strong>{item.label}</strong>
                                <span>{item.type}</span>
                                <small>{item.detail || '无补充说明'} · {formatDateTime(item.createdAt)}</small>
                            </div>
                        ))}
                    </div>
                </article>
            </section>
        </div>
    );
}
