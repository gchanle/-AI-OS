'use client';

import Link from 'next/link';
import { useState } from 'react';
import FireflyRuntimeCard from '@/components/FireflyRuntimeCard';
import { buildFireflyDirectiveDisplay } from '@/lib/fireflyRuntimeDirectiveSummary';
import './FireflyRuntimeStrip.css';

function formatTaskStatus(status = '', failedSteps = 0) {
    if (status === 'awaiting_approval') return '等待确认';
    if (status === 'failed') return '执行失败';
    if (status === 'completed' && failedSteps > 0) return '部分完成';
    if (status === 'completed') return '已完成';
    if (status === 'running') return '执行中';
    if (status === 'planning') return '规划中';
    return status || '处理中';
}

function mapStatusTone(status = '', failedSteps = 0) {
    if (status === 'awaiting_approval') return 'warning';
    if (status === 'failed') return 'danger';
    if (status === 'completed' && failedSteps > 0) return 'warning';
    if (status === 'completed') return 'success';
    return 'active';
}

function shortenText(value, maxLength = 88) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return '';
    }

    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function summarizeProgress(task = {}) {
    const steps = Array.isArray(task.steps) ? task.steps : [];
    return {
        stepCount: steps.length,
        completedSteps: steps.filter((step) => step.status === 'completed').length,
        failedSteps: steps.filter((step) => step.status === 'failed').length,
        runningSteps: steps.filter((step) => step.status === 'running').length,
        awaitingApprovalSteps: steps.filter((step) => step.status === 'awaiting_approval').length,
    };
}

function buildWebMetrics(task = {}) {
    const stepResults = task.stepResults || {};
    const searchData = stepResults['web.search']?.data || null;
    const fetchData = stepResults['web.fetch']?.data || null;
    const answerData = stepResults['web.answer']?.data || null;
    const isWebFlow = Boolean(searchData || fetchData || answerData || task.planKind === 'web_research');

    if (!isWebFlow) {
        return null;
    }

    return {
        searchCount: Array.isArray(searchData?.results) ? searchData.results.length : 0,
        fetchedCount: Array.isArray(fetchData?.pages) ? fetchData.pages.length : 0,
        failedFetchCount: Array.isArray(fetchData?.failedPages) ? fetchData.failedPages.length : 0,
        citationCount: Array.isArray(answerData?.citations) ? answerData.citations.length : 0,
        groundedBy: String(answerData?.groundedBy || '').trim() || (Array.isArray(fetchData?.pages) && fetchData.pages.length > 0 ? 'page_excerpt' : 'search_snippet'),
    };
}

function resolveActiveStep(task = {}) {
    const steps = Array.isArray(task.steps) ? task.steps : [];
    return steps.find((step) => step.status === 'awaiting_approval')
        || steps.find((step) => step.status === 'running')
        || steps.find((step) => step.status === 'failed')
        || steps.find((step) => step.status === 'pending')
        || [...steps].reverse().find((step) => step.status === 'completed')
        || null;
}

function resolvePrimaryLinkedToolId(item = {}) {
    const linkedToolIds = Array.isArray(item.linkedToolIds) ? item.linkedToolIds.filter(Boolean) : [];
    if (linkedToolIds.length > 0) {
        return linkedToolIds[0];
    }

    return String(item.toolId || '').trim();
}

function buildPhaseItems(task = {}, webMetrics = null) {
    const subtasks = Array.isArray(task.subtasks) && task.subtasks.length > 0
        ? task.subtasks
        : Array.isArray(task.planMetadata?.subtasks)
            ? task.planMetadata.subtasks
            : [];
    const steps = Array.isArray(task.steps) ? task.steps : [];
    const webAwareItems = webMetrics
        ? subtasks.filter((item) => /^web\./.test(resolvePrimaryLinkedToolId(item)))
        : subtasks;
    const baseItems = (webAwareItems.length > 0 ? webAwareItems : steps).slice(0, 3);

    return baseItems.map((item, index) => {
        const relatedStep = steps.find((step) => (
            step.subtaskId === item.id
            || step.id === item.id
            || step.toolId === resolvePrimaryLinkedToolId(item)
        )) || {};
        const status = relatedStep.status || item.status || 'pending';

        return {
            id: item.id || relatedStep.id || `phase-${index + 1}`,
            label: shortenText(item.label || relatedStep.subtaskLabel || relatedStep.label || `阶段 ${index + 1}`, 8),
            tone: status === 'completed'
                ? 'done'
                : status === 'failed'
                    ? 'danger'
                    : status === 'awaiting_approval'
                        ? 'warning'
                        : status === 'running'
                            ? 'active'
                            : 'neutral',
        };
    });
}

function buildStatItems(task = {}, progress = {}, webMetrics = null) {
    const items = [];

    if (webMetrics) {
        items.push({
            id: 'stat-sources',
            label: `来源 ${webMetrics.searchCount}`,
            tone: webMetrics.searchCount > 0 ? 'active' : 'neutral',
        });

        if (webMetrics.fetchedCount > 0 || webMetrics.failedFetchCount > 0) {
            items.push({
                id: 'stat-pages',
                label: webMetrics.failedFetchCount > 0
                    ? `正文 ${webMetrics.fetchedCount}/${webMetrics.fetchedCount + webMetrics.failedFetchCount}`
                    : `正文 ${webMetrics.fetchedCount}`,
                tone: webMetrics.failedFetchCount > 0 ? 'warning' : 'active',
            });
        }

        if (webMetrics.citationCount > 0) {
            items.push({
                id: 'stat-citations',
                label: `引用 ${webMetrics.citationCount}`,
                tone: 'active',
            });
        }
    } else {
        items.push({
            id: 'stat-steps',
            label: `步骤 ${progress.completedSteps}/${progress.stepCount || 0}`,
            tone: progress.completedSteps > 0 ? 'active' : 'neutral',
        });
    }

    if (progress.awaitingApprovalSteps > 0) {
        items.push({
            id: 'stat-awaiting',
            label: `待确认 ${progress.awaitingApprovalSteps}`,
            tone: 'warning',
        });
    } else if (progress.runningSteps > 0) {
        items.push({
            id: 'stat-running',
            label: `进行中 ${progress.runningSteps}`,
            tone: 'active',
        });
    }

    if (progress.failedSteps > 0) {
        items.push({
            id: 'stat-failed',
            label: `失败 ${progress.failedSteps}`,
            tone: 'danger',
        });
    }

    return items.slice(0, 4);
}

function resolveLatestProgressEvent(taskEvents = []) {
    const events = Array.isArray(taskEvents) ? taskEvents : [];
    const internalTypes = new Set([
        'task_created',
        'memory_snapshot_ready',
        'toolbelt_snapshot_ready',
        'planner_review_ready',
    ]);

    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index] || {};
        const type = String(event.type || '').trim();
        const label = String(event.label || '').trim();
        const detail = String(event.detail || '').trim();
        const stepLabel = String(event.metadata?.stepLabel || '').trim();
        const workerLabel = String(event.metadata?.workerLabel || '').trim();

        if (type && (type.startsWith('control_') || internalTypes.has(type))) {
            continue;
        }

        const summary = detail || [workerLabel, stepLabel].filter(Boolean).join(' · ');
        const title = label || stepLabel || workerLabel || '';

        if (!title && !summary) {
            continue;
        }

        return {
            type,
            title: shortenText(title || summary, 40),
            summary: shortenText(summary || title, 96),
        };
    }

    return null;
}

function buildHeadline(task = {}, progress = {}, webMetrics = null, taskEvents = []) {
    const activeStep = resolveActiveStep(task);
    const recentEvent = resolveLatestProgressEvent(taskEvents);
    const stageTitle = String(task.currentStageTitle || '').trim();
    const stageSummary = String(task.currentStageSummary || '').trim();

    if (task.status === 'running' && stageTitle) {
        return {
            title: stageTitle,
            summary: shortenText(stageSummary || activeStep?.summary || '系统正在推进当前阶段。'),
        };
    }

    if (task.status === 'running' && recentEvent?.title) {
        return {
            title: recentEvent.title,
            summary: recentEvent.summary || shortenText(activeStep?.summary || '系统正在推进当前阶段。'),
        };
    }

    if (task.status === 'completed') {
        return {
            title: stageTitle || recentEvent?.title || '结果已整理完成',
            summary: shortenText(stageSummary || task.resultSummary || recentEvent?.summary || activeStep?.summary || '本轮任务已产出可继续使用的结果。'),
        };
    }

    if (task.status === 'failed') {
        return {
            title: stageTitle || recentEvent?.title || '本轮执行中断',
            summary: shortenText(stageSummary || task.resultSummary || recentEvent?.summary || activeStep?.summary || '建议展开详情查看失败步骤。'),
        };
    }

    if (task.status === 'awaiting_approval') {
        return {
            title: activeStep?.subtaskLabel || activeStep?.label || '等待你的确认',
            summary: shortenText(activeStep?.approvalReason || activeStep?.summary || '确认后会继续推进后续步骤。'),
        };
    }

    if (webMetrics) {
        const toolId = activeStep?.toolId || '';

        if (toolId === 'web.answer') {
            return {
                title: activeStep?.subtaskLabel || '正在整理结论',
                summary: webMetrics.fetchedCount > 0
                    ? `已拿到 ${webMetrics.fetchedCount} 个页面摘录，正在压缩成最终回答。`
                    : '正在把搜索结果整理成可直接阅读的回答。',
            };
        }

        if (toolId === 'web.fetch') {
            return {
                title: activeStep?.subtaskLabel || '正在核对页面',
                summary: webMetrics.searchCount > 0
                    ? `已锁定 ${webMetrics.searchCount} 条候选来源，正在核对关键页面。`
                    : '正在读取关键页面摘录。',
            };
        }

        return {
            title: activeStep?.subtaskLabel || '正在搜集来源',
            summary: '先把可引用的来源收敛出来，再继续核对和整理。',
        };
    }

    return {
        title: activeStep?.subtaskLabel || activeStep?.label || task.title || '正在推进任务',
        summary: shortenText(activeStep?.summary || activeStep?.purpose || task.resultSummary || '系统正在组织本轮执行过程。'),
    };
}

function buildRuntimeEvents(task = {}) {
    const runtimeEvents = Array.isArray(task.runtimeEvents) ? task.runtimeEvents : [];
    const executionLogs = Array.isArray(task.executionLogs) ? task.executionLogs.slice(-6) : [];
    if (runtimeEvents.length > 0) {
        return runtimeEvents;
    }

    return executionLogs.map((log) => ({
        id: log.id,
        type: '',
        detail: log.message,
        metadata: {},
        taskId: task.id,
        stepId: log.stepId || '',
    }));
}

export default function FireflyRuntimeStrip({
    task = null,
    timeLabel = '',
    defaultExpanded = false,
    surface = 'chat',
    controlState = null,
    onControlAction = null,
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);

    if (!task) {
        return null;
    }

    const progress = summarizeProgress(task);
    const webMetrics = buildWebMetrics(task);
    const statusLabel = formatTaskStatus(task.status, progress.failedSteps);
    const statusTone = mapStatusTone(task.status, progress.failedSteps);
    const routeLabel = task.planMetadata?.webProfileLabel || task.planMetadata?.routeLabel || '任务执行';
    const phaseItems = buildPhaseItems(task, webMetrics);
    const statItems = buildStatItems(task, progress, webMetrics);
    const steps = Array.isArray(task.steps) ? task.steps : [];
    const taskEvents = buildRuntimeEvents(task);
    const headline = buildHeadline(task, progress, webMetrics, taskEvents);
    const activeDirective = buildFireflyDirectiveDisplay(task, taskEvents);
    const awaitingApprovalStep = steps.find((step) => step.status === 'awaiting_approval') || null;
    const firstFailedStep = steps.find((step) => step.status === 'failed') || null;
    const pendingAction = controlState?.taskId === task.id ? String(controlState?.pendingAction || '').trim() : '';
    const pendingStepId = controlState?.taskId === task.id ? String(controlState?.stepId || '').trim() : '';
    const taskIsBlocked = task.controlState === 'rejected' || task.controlState === 'paused';
    const showInlineControls = typeof onControlAction === 'function'
        && (Boolean(awaitingApprovalStep) || task.status === 'failed' || taskIsBlocked);

    return (
        <div className={`firefly-runtime-inline-strip ${surface}`}>
            <div className="firefly-runtime-inline-strip-head">
                <div className="firefly-runtime-inline-strip-main">
                    <span className={`firefly-runtime-inline-strip-status ${statusTone}`}>{statusLabel}</span>
                    <div className="firefly-runtime-inline-strip-copy">
                        <strong>{headline.title}</strong>
                        <p>{headline.summary}</p>
                    </div>
                </div>
                <div className="firefly-runtime-inline-strip-actions">
                    {timeLabel ? <span className="firefly-runtime-inline-strip-time">{timeLabel}</span> : null}
                    <button
                        type="button"
                        className="firefly-runtime-inline-strip-toggle"
                        onClick={() => setExpanded((value) => !value)}
                    >
                        {expanded ? '收起详情' : '展开详情'}
                    </button>
                </div>
            </div>

            <div className="firefly-runtime-inline-strip-meta">
                <span className="firefly-runtime-inline-strip-route">{routeLabel}</span>
                {activeDirective ? (
                    <>
                        <span className="firefly-runtime-inline-strip-chip directive">{activeDirective.actionLabel}</span>
                        {activeDirective.stepLabel ? (
                            <span className="firefly-runtime-inline-strip-chip directive-subtle">{activeDirective.stepLabel}</span>
                        ) : null}
                    </>
                ) : null}
                {phaseItems.map((item) => (
                    <span key={item.id} className={`firefly-runtime-inline-strip-chip ${item.tone}`}>
                        {item.label}
                    </span>
                ))}
                {statItems.map((item) => (
                    <span key={item.id} className={`firefly-runtime-inline-strip-chip ${item.tone}`}>
                        {item.label}
                    </span>
                ))}
                {task.threadKey ? (
                    <Link
                        href={`/runtime?threadKey=${encodeURIComponent(task.threadKey)}`}
                        className="firefly-runtime-inline-strip-link"
                    >
                        查看运行台
                    </Link>
                ) : null}
            </div>

            {activeDirective ? (
                <div className="firefly-runtime-inline-strip-directive">
                    <strong>当前前台指令</strong>
                    <p>{activeDirective.note}</p>
                </div>
            ) : null}

            {showInlineControls ? (
                <div className="firefly-runtime-inline-strip-controls">
                    {taskIsBlocked ? (
                        <button
                            type="button"
                            className="firefly-runtime-inline-strip-control primary"
                            disabled={Boolean(pendingAction)}
                            onClick={() => onControlAction?.('approve_continue', task)}
                        >
                            {pendingAction === 'approve_continue' ? '正在解除…' : '允许继续'}
                        </button>
                    ) : null}
                    {awaitingApprovalStep ? (
                        <button
                            type="button"
                            className="firefly-runtime-inline-strip-control primary"
                            disabled={taskIsBlocked || Boolean(pendingAction)}
                            onClick={() => onControlAction?.('approve_step', task, awaitingApprovalStep.id)}
                        >
                            {pendingAction === 'approve_step' && pendingStepId === awaitingApprovalStep.id
                                ? '正在批准…'
                                : (awaitingApprovalStep.approvalLabel || '批准并继续')}
                        </button>
                    ) : null}
                    {task.status === 'failed' ? (
                        <>
                            {firstFailedStep ? (
                                <button
                                    type="button"
                                    className="firefly-runtime-inline-strip-control"
                                    disabled={taskIsBlocked || Boolean(pendingAction)}
                                    onClick={() => onControlAction?.('retry_step', task, firstFailedStep.id)}
                                >
                                    {pendingAction === 'retry_step' && pendingStepId === firstFailedStep.id ? '正在重跑…' : '重跑失败步骤'}
                                </button>
                            ) : null}
                            <button
                                type="button"
                                className="firefly-runtime-inline-strip-control"
                                disabled={taskIsBlocked || Boolean(pendingAction)}
                                onClick={() => onControlAction?.('retry_failed', task)}
                            >
                                {pendingAction === 'retry_failed' ? '正在重试…' : '失败步骤重试'}
                            </button>
                            <button
                                type="button"
                                className="firefly-runtime-inline-strip-control"
                                disabled={taskIsBlocked || Boolean(pendingAction)}
                                onClick={() => onControlAction?.('retry_full', task)}
                            >
                                {pendingAction === 'retry_full' ? '正在重跑…' : '整轮重试'}
                            </button>
                        </>
                    ) : null}
                </div>
            ) : null}

            {expanded ? (
                <div className="firefly-runtime-inline-strip-detail">
                    <FireflyRuntimeCard
                        task={task}
                        compact={surface === 'drawer'}
                        defaultExpanded
                        timeLabel={timeLabel}
                        controlState={controlState}
                        onControlAction={onControlAction}
                    />
                </div>
            ) : null}
        </div>
    );
}
