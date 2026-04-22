'use client';

import { useState } from 'react';
import { buildFireflyDirectiveDisplay } from '@/lib/fireflyRuntimeDirectiveSummary';
import './FireflyRuntimeCard.css';

function formatTaskStatus(status = '', failedSteps = 0) {
    if (status === 'awaiting_approval') return '等待审批';
    if (status === 'failed') return '执行失败';
    if (status === 'completed' && failedSteps > 0) return '部分完成';
    if (status === 'completed') return '已完成';
    if (status === 'running') return '执行中';
    if (status === 'planning') return '规划中';
    return status || '处理中';
}

function formatStepStatus(status = '') {
    if (status === 'awaiting_approval') return '等待审批';
    if (status === 'completed') return '已完成';
    if (status === 'failed') return '失败';
    if (status === 'running') return '执行中';
    if (status === 'pending') return '待开始';
    return status || '处理中';
}

function formatTime(value, fallback = '') {
    if (!value) {
        return fallback;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return fallback || String(value);
    }

    return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
    });
}

function buildPhaseClass(status = '', failedSteps = 0) {
    if (status === 'awaiting_approval') return 'awaiting';
    if (status === 'failed') return 'failed';
    if (status === 'completed' && failedSteps > 0) return 'partial';
    if (status === 'completed') return 'completed';
    if (status === 'running') return 'running';
    if (status === 'planning') return 'planning';
    return 'running';
}

function summarizeProgress(task = {}) {
    const steps = Array.isArray(task.steps) ? task.steps : [];
    const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const completedSteps = steps.filter((step) => step.status === 'completed').length;
    const failedSteps = steps.filter((step) => step.status === 'failed').length;
    const runningSteps = steps.filter((step) => step.status === 'running').length;
    const awaitingApprovalSteps = steps.filter((step) => step.status === 'awaiting_approval').length;
    const completedSubtasks = subtasks.filter((subtask) => subtask.status === 'completed').length;

    return {
        stepCount: steps.length,
        completedSteps,
        failedSteps,
        runningSteps,
        awaitingApprovalSteps,
        subtaskCount: subtasks.length,
        completedSubtasks,
    };
}

function buildWebRuntimeMetrics(task = {}) {
    const stepResults = task.stepResults || {};
    const searchData = stepResults['web.search']?.data || null;
    const fetchData = stepResults['web.fetch']?.data || null;
    const answerData = stepResults['web.answer']?.data || null;

    const searchCount = Array.isArray(searchData?.results) ? searchData.results.length : 0;
    const fetchedCount = Array.isArray(fetchData?.pages) ? fetchData.pages.length : 0;
    const failedFetchCount = Array.isArray(fetchData?.failedPages) ? fetchData.failedPages.length : 0;
    const groundedBy = String(answerData?.groundedBy || '').trim();

    const isWebFlow = Boolean(searchData || fetchData || answerData || task.planKind === 'web_research');
    if (!isWebFlow) {
        return null;
    }

    return {
        searchCount,
        fetchedCount,
        failedFetchCount,
        citationCount: Array.isArray(answerData?.citations) ? answerData.citations.length : 0,
        groundedBy: groundedBy || (fetchedCount > 0 ? 'page_excerpt' : 'search_snippet'),
    };
}

function resolvePrimaryLinkedToolId(item = {}) {
    const linkedToolIds = Array.isArray(item.linkedToolIds) ? item.linkedToolIds.filter(Boolean) : [];
    if (linkedToolIds.length > 0) {
        return linkedToolIds[0];
    }

    return String(item.toolId || '').trim();
}

function resolveWebStageMetric(primaryToolId = '', webMetrics = null, fallbackSummary = '') {
    if (!webMetrics) {
        return fallbackSummary || '';
    }

    if (primaryToolId === 'web.search') {
        return `已初步筛出 ${webMetrics.searchCount} 条可参考来源`;
    }

    if (primaryToolId === 'web.fetch') {
        return webMetrics.failedFetchCount > 0
            ? `已读取 ${webMetrics.fetchedCount} 个页面摘录，失败 ${webMetrics.failedFetchCount} 个`
            : `已读取 ${webMetrics.fetchedCount} 个页面摘录`;
    }

    if (primaryToolId === 'web.answer') {
        return webMetrics.groundedBy === 'page_excerpt'
            ? '优先基于页面摘录组织回答'
            : '当前主要基于搜索摘要组织回答';
    }

    return fallbackSummary || '';
}

function buildWebStageItems(task = {}, webMetrics = null) {
    const steps = Array.isArray(task.steps) ? task.steps : [];
    const subtaskSeeds = Array.isArray(task.subtasks) && task.subtasks.length > 0
        ? task.subtasks
        : Array.isArray(task.planMetadata?.subtasks)
            ? task.planMetadata.subtasks
            : [];

    const webSubtasks = subtaskSeeds.filter((item) => {
        const primaryToolId = resolvePrimaryLinkedToolId(item);
        return /^web\./.test(primaryToolId);
    });

    if (webSubtasks.length === 0) {
        if (!webMetrics) {
            return [];
        }

        return [
            {
                id: 'tool-search',
                title: '搜集公开来源',
                description: resolveWebStageMetric('web.search', webMetrics),
                metric: `${webMetrics.searchCount} 条来源`,
                status: formatStepStatus(steps.find((item) => item.toolId === 'web.search')?.status || 'pending'),
            },
            {
                id: 'tool-fetch',
                title: '核对关键页面',
                description: resolveWebStageMetric('web.fetch', webMetrics),
                metric: `${webMetrics.fetchedCount} 个页面摘录${webMetrics.failedFetchCount ? ` / 失败 ${webMetrics.failedFetchCount}` : ''}`,
                status: formatStepStatus(steps.find((item) => item.toolId === 'web.fetch')?.status || 'pending'),
            },
            {
                id: 'tool-answer',
                title: '整理结论回答',
                description: resolveWebStageMetric('web.answer', webMetrics),
                metric: webMetrics.citationCount > 0
                    ? `引用 ${webMetrics.citationCount}`
                    : (webMetrics.groundedBy === 'page_excerpt' ? '基于页面摘录' : '基于搜索摘要'),
                status: formatStepStatus(steps.find((item) => item.toolId === 'web.answer')?.status || 'pending'),
            },
        ];
    }

    return webSubtasks.map((item) => {
        const primaryToolId = resolvePrimaryLinkedToolId(item);
        const matchedStep = steps.find((step) => (
            step.toolId === primaryToolId
            || (Array.isArray(item.linkedToolIds) && item.linkedToolIds.includes(step.toolId))
            || step.subtaskId === item.id
        ));
        const description = resolveWebStageMetric(primaryToolId, webMetrics, item.summary || '');
        const metric = primaryToolId === 'web.search'
            ? `${webMetrics?.searchCount || 0} 条来源`
            : primaryToolId === 'web.fetch'
                ? `${webMetrics?.fetchedCount || 0} 个页面摘录${webMetrics?.failedFetchCount ? ` / 失败 ${webMetrics.failedFetchCount}` : ''}`
                : primaryToolId === 'web.answer'
                    ? (webMetrics?.citationCount > 0 ? `引用 ${webMetrics.citationCount}` : (webMetrics?.groundedBy === 'page_excerpt' ? '基于页面摘录' : '基于搜索摘要'))
                    : '';

        return {
            id: item.id,
            title: item.label || matchedStep?.subtaskLabel || matchedStep?.label || '联网阶段',
            description,
            metric: metric || description,
            status: formatStepStatus(matchedStep?.status || item.status || 'pending'),
        };
    });
}

function buildPlanItems(task = {}) {
    const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    if (subtasks.length > 0) {
        return subtasks.map((item) => ({
            id: item.id,
            title: item.label,
            description: item.summary || '等待进入这一阶段。',
            status: formatStepStatus(item.status),
        }));
    }

    const steps = Array.isArray(task.steps) ? task.steps : [];
    return steps.map((step) => ({
        id: step.id,
        title: step.label,
        description: step.purpose || step.summary || '等待进入这一阶段。',
        status: formatStepStatus(step.status),
    }));
}

function buildToolItems(task = {}, webMetrics = null) {
    const steps = Array.isArray(task.steps) ? task.steps : [];

    if (webMetrics) {
        const webStageItems = buildWebStageItems(task, webMetrics);
        if (webStageItems.length > 0) {
            return webStageItems;
        }
    }

    return steps.map((step) => ({
        id: step.id,
        title: step.label,
        description: step.outputKey || step.toolId || '工具调用',
        status: formatStepStatus(step.status),
    }));
}

function buildProgressItems(task = {}) {
    const logs = Array.isArray(task.executionLogs) ? task.executionLogs.slice(-4) : [];
    if (logs.length > 0) {
        return logs.map((log) => ({
            id: log.id,
            title: log.message,
            description: formatTime(log.createdAt, ''),
            status: '',
        }));
    }

    const steps = Array.isArray(task.steps) ? task.steps : [];
    return steps.map((step) => ({
        id: step.id,
        title: step.label,
        description: step.summary || '等待这一阶段开始执行。',
        status: formatStepStatus(step.status),
    }));
}

function hasMeaningfulExecutionLogs(task = {}) {
    return Array.isArray(task.executionLogs) && task.executionLogs.length > 0;
}

function buildOutputItems(task = {}, compact = false) {
    const artifacts = Array.isArray(task.artifacts) ? task.artifacts.slice(-3) : [];
    return artifacts.map((artifact) => ({
        id: artifact.id,
        title: artifact.label,
        description: artifact.content ? artifact.content.slice(0, compact ? 80 : 180) : '',
        href: artifact.href || '',
    }));
}

function buildNarrativeLabel(task = {}, progress = {}) {
    if (task.status === 'awaiting_approval') {
        return '等待确认';
    }
    if (task.status === 'failed') {
        return '执行中断';
    }
    if (task.status === 'completed' && progress.failedSteps > 0) {
        return '部分完成';
    }
    if (task.status === 'completed') {
        return '已生成结果';
    }
    if (task.status === 'running') {
        return '正在处理';
    }
    if (task.status === 'planning') {
        return '已形成计划';
    }
    return '处理中';
}

function shortenText(value, maxLength = 72) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return '';
    }

    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function resolveActiveStep(task = {}) {
    const steps = Array.isArray(task.steps) ? task.steps : [];
    if (!steps.length) {
        return null;
    }

    return steps.find((step) => step.status === 'awaiting_approval')
        || steps.find((step) => step.status === 'running')
        || steps.find((step) => step.status === 'failed')
        || steps.find((step) => step.status === 'pending')
        || [...steps].reverse().find((step) => step.status === 'completed')
        || steps[0];
}

function buildCompactFocus(task = {}, progress = {}, webMetrics = null, outputItems = []) {
    const activeStep = resolveActiveStep(task);
    const currentToolId = activeStep?.toolId || '';

    if (webMetrics) {
        if (task.status === 'awaiting_approval' || currentToolId === 'web.fetch' && activeStep?.status === 'awaiting_approval') {
            return {
                title: '等待读取关键页面',
                description: '这一轮需要先确认后，才会继续读取网页摘录。',
            };
        }

        if (task.status === 'completed') {
            return {
                title: '联网结论已整理完成',
                description: task.resultSummary
                    ? shortenText(task.resultSummary, 96)
                    : `已综合 ${webMetrics.searchCount} 条来源与 ${webMetrics.fetchedCount} 个页面摘录。`,
            };
        }

        if (task.status === 'failed') {
            return {
                title: '联网步骤执行中断',
                description: shortenText(task.resultSummary || activeStep?.summary || '建议展开查看具体失败环节。', 88),
            };
        }

        if (currentToolId === 'web.answer') {
            return {
                title: '正在整理结论回答',
                description: webMetrics.fetchedCount > 0
                    ? `已拿到 ${webMetrics.fetchedCount} 个页面摘录，正在压缩成最终回答。`
                    : '正在把搜索结果整理成可直接阅读的回答。',
            };
        }

        if (currentToolId === 'web.fetch') {
            return {
                title: '正在核对关键页面',
                description: webMetrics.searchCount > 0
                    ? `已找到 ${webMetrics.searchCount} 条候选来源，正在读取更可信的正文摘录。`
                    : '正在读取页面摘录，避免只基于搜索标题回答。',
            };
        }

        return {
            title: '正在搜集公开来源',
            description: '先把可引用的来源收敛出来，再继续核对和整理。',
        };
    }

    if (task.status === 'completed') {
        return {
            title: '任务结果已生成',
            description: shortenText(task.resultSummary || outputItems[0]?.description || '本轮任务已经产出可继续使用的结果。', 92),
        };
    }

    if (task.status === 'failed') {
        return {
            title: '任务执行中断',
            description: shortenText(task.resultSummary || activeStep?.summary || '建议展开查看失败步骤。', 88),
        };
    }

    if (task.status === 'awaiting_approval') {
        return {
            title: activeStep?.label ? `等待确认：${activeStep.label}` : '等待你的确认',
            description: '确认后会继续推进后续步骤。',
        };
    }

    return {
        title: activeStep?.label || '正在推进任务',
        description: shortenText(
            activeStep?.summary
            || activeStep?.purpose
            || task.resultSummary
            || `当前已完成 ${progress.completedSteps}/${progress.stepCount || 0} 个步骤。`,
            92
        ),
    };
}

function buildCompactMilestones(task = {}, webMetrics = null) {
    const steps = Array.isArray(task.steps) ? task.steps : [];
    const items = webMetrics
        ? buildWebStageItems(task, webMetrics).map((item) => ({
            id: item.id,
            label: shortenText(item.title || '阶段', 8),
        }))
        : steps.slice(0, 3).map((step) => ({
            id: step.id,
            label: shortenText(step.subtaskLabel || step.label || '步骤', 8),
        }));

    return items.map((item) => {
        const step = webMetrics
            ? steps.find((entry) => entry.subtaskId === item.id || entry.id === item.id || entry.toolId === item.id)
            : steps.find((entry) => entry.id === item.id);
        const status = step?.status || 'pending';

        return {
            ...item,
            tone: status === 'completed'
                ? 'done'
                : status === 'failed'
                    ? 'failed'
                    : status === 'running'
                        ? 'current'
                        : status === 'awaiting_approval'
                            ? 'waiting'
                            : 'upcoming',
        };
    });
}

function buildCompactStatItems(task = {}, progress = {}, webMetrics = null, outputItems = []) {
    const items = [];

    if (webMetrics) {
        items.push({
            label: `来源 ${webMetrics.searchCount}`,
            tone: webMetrics.searchCount > 0 ? 'active' : 'neutral',
        });
        if (webMetrics.fetchedCount > 0 || webMetrics.failedFetchCount > 0) {
            items.push({
                label: webMetrics.failedFetchCount > 0
                    ? `正文 ${webMetrics.fetchedCount}/${webMetrics.fetchedCount + webMetrics.failedFetchCount}`
                    : `正文 ${webMetrics.fetchedCount}`,
                tone: webMetrics.failedFetchCount > 0 ? 'warning' : 'active',
            });
        }
    } else {
        items.push({
            label: `步骤 ${progress.completedSteps}/${progress.stepCount || 0}`,
            tone: progress.completedSteps > 0 ? 'active' : 'neutral',
        });
    }

    if (progress.runningSteps > 0) {
        items.push({
            label: `进行中 ${progress.runningSteps}`,
            tone: 'active',
        });
    }

    if (progress.awaitingApprovalSteps > 0) {
        items.push({
            label: `待确认 ${progress.awaitingApprovalSteps}`,
            tone: 'warning',
        });
    }

    if (progress.failedSteps > 0) {
        items.push({
            label: `失败 ${progress.failedSteps}`,
            tone: 'danger',
        });
    }

    if (task.status === 'completed' && outputItems.length > 0) {
        items.push({
            label: `结果 ${outputItems.length}`,
            tone: 'success',
        });
    }

    return items.slice(0, 4);
}

function buildStageOverview(task = {}, progress = {}, outputItems = []) {
    const hasOutputs = outputItems.length > 0;

    return [
        {
            id: 'stage-plan',
            title: '任务拆解',
            state: task.status === 'planning' ? 'current' : 'done',
            description: `${progress.stepCount || 0} 个步骤`,
        },
        {
            id: 'stage-execute',
            title: task.status === 'awaiting_approval' ? '等待确认' : '执行处理',
            state: task.status === 'failed'
                ? 'failed'
                : (task.status === 'planning' ? 'upcoming' : 'current'),
            description: task.status === 'awaiting_approval'
                ? '需要你确认后继续'
                : progress.runningSteps > 0
                    ? `${progress.runningSteps} 个步骤进行中`
                    : progress.failedSteps > 0
                        ? `${progress.failedSteps} 个步骤失败`
                        : '执行状态稳定',
        },
        {
            id: 'stage-result',
            title: '生成结果',
            state: hasOutputs
                ? 'done'
                : (task.status === 'completed' ? 'current' : 'upcoming'),
            description: hasOutputs ? `${outputItems.length} 个结果对象` : '等待生成可用结果',
        },
    ];
}

function buildHighlightCard(task = {}, outputItems = []) {
    if (task.status === 'awaiting_approval') {
        return {
            eyebrow: '需要确认',
            title: '当前任务已准备好继续执行',
            description: '系统已经完成前序整理，确认后可以进入下一步执行。',
            actionLabel: '查看运行详情',
            href: task.threadKey ? `/runtime?threadKey=${encodeURIComponent(task.threadKey)}` : '',
        };
    }

    const primaryOutput = outputItems[0];
    if (primaryOutput) {
        return {
            eyebrow: '已生成结果',
            title: primaryOutput.title,
            description: primaryOutput.description || '本轮已经生成结构化结果，可继续查看或承接后续动作。',
            actionLabel: primaryOutput.href ? '打开结果' : '',
            href: primaryOutput.href || '',
        };
    }

    return null;
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

function formatControlStateLabel(controlState = '') {
    if (controlState === 'paused') return '已暂停';
    if (controlState === 'rejected') return '已拒绝';
    if (controlState === 'approved') return '已允许继续';
    return '';
}

function SectionCard({
    id,
    title,
    summary = '',
    items = [],
    defaultOpen = false,
    dense = false,
}) {
    const [open, setOpen] = useState(defaultOpen);

    if (!items.length) {
        return null;
    }

    return (
        <section className="firefly-runtime-section-card">
            <button
                type="button"
                className="firefly-runtime-section-head"
                onClick={() => setOpen((value) => !value)}
            >
                <div className="firefly-runtime-section-head-copy">
                    <span className="firefly-runtime-section-title">{title}</span>
                    {summary ? <small>{summary}</small> : null}
                </div>
                <span className="firefly-runtime-section-toggle">{open ? '收起' : '展开'}</span>
            </button>

            {open ? (
                <div className={`firefly-runtime-section-list ${dense ? 'dense' : ''}`}>
                    {items.map((item) => (
                        <div key={`${id}-${item.id}`} className="firefly-runtime-section-item">
                            <div className="firefly-runtime-section-item-main">
                                <strong>{item.title}</strong>
                                {item.description ? <span>{item.description}</span> : null}
                                {item.href ? (
                                    <a href={item.href} className="firefly-runtime-card-link">
                                        打开结果
                                    </a>
                                ) : null}
                            </div>
                            {item.status ? <em>{item.status}</em> : null}
                        </div>
                    ))}
                </div>
            ) : null}
        </section>
    );
}

export default function FireflyRuntimeCard({
    task = null,
    compact = false,
    defaultExpanded = true,
    timeLabel = '',
    controlState = null,
    onControlAction = null,
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);

    if (!task) {
        return null;
    }

    const progress = summarizeProgress(task);
    const phaseClass = buildPhaseClass(task.status, progress.failedSteps);
    const statusLabel = formatTaskStatus(task.status, progress.failedSteps);
    const webMetrics = buildWebRuntimeMetrics(task);
    const webStageItems = buildWebStageItems(task, webMetrics);
    const planItems = buildPlanItems(task);
    const toolItems = buildToolItems(task, webMetrics);
    const progressItems = buildProgressItems(task);
    const outputItems = buildOutputItems(task, compact);
    const narrativeLabel = buildNarrativeLabel(task, progress);
    const stageOverview = buildStageOverview(task, progress, outputItems);
    const highlightCard = buildHighlightCard(task, outputItems);
    const showDenseRunningShell = compact && !expanded;
    const compactFocus = buildCompactFocus(task, progress, webMetrics, outputItems);
    const compactMilestones = buildCompactMilestones(task, webMetrics);
    const compactStatItems = buildCompactStatItems(task, progress, webMetrics, outputItems);
    const showWebSearchSections = Boolean(webMetrics);
    const webProgressItems = buildProgressItems(task).filter((item) => String(item.description || '').trim());
    const taskEvents = buildRuntimeEvents(task);
    const activeDirective = buildFireflyDirectiveDisplay(task, taskEvents);
    const steps = Array.isArray(task.steps) ? task.steps : [];
    const awaitingApprovalStep = steps.find((step) => step.status === 'awaiting_approval') || null;
    const failedSteps = steps.filter((step) => step.status === 'failed');
    const firstFailedStep = steps.find((step) => step.status === 'failed') || null;
    const canControl = typeof onControlAction === 'function' && String(task.id || '').trim();
    const taskIsBlocked = task.controlState === 'rejected' || task.controlState === 'paused';
    const taskIsRunning = task.status === 'running' || task.status === 'planning';
    const controlScopeMatch = controlState?.taskId === task.id;
    const controlFeedbackMessage = controlScopeMatch ? String(controlState?.message || '').trim() : '';
    const controlFeedbackError = controlScopeMatch ? String(controlState?.error || '').trim() : '';
    const pendingAction = controlScopeMatch ? String(controlState?.pendingAction || '').trim() : '';
    const pendingStepId = controlScopeMatch ? String(controlState?.stepId || '').trim() : '';
    const controlStateLabel = formatControlStateLabel(task.controlState);
    const showRuntimeControls = canControl && (
        Boolean(awaitingApprovalStep)
        || progress.failedSteps > 0
        || task.status === 'failed'
        || task.controlState === 'paused'
        || task.controlState === 'rejected'
    );

    return (
        <div className={`firefly-runtime-card ${compact ? 'compact' : ''}`}>
            <div className="firefly-runtime-card-head">
                <div className="firefly-runtime-card-head-main">
                    <span className={`firefly-runtime-card-status ${phaseClass}`}>{statusLabel}</span>
                    <strong className="firefly-runtime-card-title">{task.title || '萤火虫任务'}</strong>
                    <span className="firefly-runtime-card-time">
                        {timeLabel || (task.status === 'running' ? '正在运行' : formatTime(task.updatedAt, '刚刚更新'))}
                    </span>
                </div>
                <button
                    type="button"
                    className="firefly-runtime-card-toggle"
                    onClick={() => setExpanded((value) => !value)}
                    title={expanded ? '收起运行详情' : '展开运行详情'}
                    aria-label={expanded ? '收起运行详情' : '展开运行详情'}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        {expanded ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
                    </svg>
                </button>
            </div>

            {showDenseRunningShell ? (
                <div className="firefly-runtime-compact-shell">
                    <div className="firefly-runtime-compact-copy">
                        <span className="firefly-runtime-card-kicker">{narrativeLabel}</span>
                        <strong>{compactFocus.title}</strong>
                        <p>{compactFocus.description}</p>
                    </div>
                    {compactMilestones.length > 0 ? (
                        <div className="firefly-runtime-compact-milestones">
                            {compactMilestones.map((item) => (
                                <span key={item.id} className={`firefly-runtime-compact-milestone ${item.tone}`}>
                                    {item.label}
                                </span>
                            ))}
                        </div>
                    ) : null}
                    {compactStatItems.length > 0 ? (
                        <div className="firefly-runtime-card-stats compact-shell">
                            {compactStatItems.map((item) => (
                                <span key={item.label} className={`firefly-runtime-card-stat ${item.tone}`}>
                                    {item.label}
                                </span>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : (
                <>
                    <div className="firefly-runtime-card-kicker">{narrativeLabel}</div>
                    {task.resultSummary ? (
                        <div className="firefly-runtime-card-summary">{task.resultSummary}</div>
                    ) : null}
                    <div className="firefly-runtime-card-stats">
                        <span className="firefly-runtime-card-stat">步骤 {progress.completedSteps}/{progress.stepCount || 0}</span>
                        <span className="firefly-runtime-card-stat">子任务 {progress.completedSubtasks}/{progress.subtaskCount || 0}</span>
                        {activeDirective ? (
                            <span className="firefly-runtime-card-stat directive">{activeDirective.actionLabel}</span>
                        ) : null}
                        {progress.runningSteps > 0 ? (
                            <span className="firefly-runtime-card-stat active">进行中 {progress.runningSteps}</span>
                        ) : null}
                        {progress.awaitingApprovalSteps > 0 ? (
                            <span className="firefly-runtime-card-stat warning">待审批 {progress.awaitingApprovalSteps}</span>
                        ) : null}
                        {progress.failedSteps > 0 ? (
                            <span className="firefly-runtime-card-stat danger">失败 {progress.failedSteps}</span>
                        ) : null}
                    </div>
                </>
            )}

            {activeDirective ? (
                <div className="firefly-runtime-card-directive">
                    <div className="firefly-runtime-card-directive-head">
                        <strong>当前前台指令</strong>
                        <div className="firefly-runtime-card-directive-tags">
                            <span>{activeDirective.actionLabel}</span>
                            {activeDirective.stepLabel ? <span>{activeDirective.stepLabel}</span> : null}
                        </div>
                    </div>
                    <p>{activeDirective.note}</p>
                </div>
            ) : null}

            {!showDenseRunningShell ? (
                <div className="firefly-runtime-stage-strip">
                    {stageOverview.map((stage) => (
                        <div key={stage.id} className={`firefly-runtime-stage-item ${stage.state}`}>
                            <strong>{stage.title}</strong>
                            <span>{stage.description}</span>
                        </div>
                    ))}
                </div>
            ) : null}

            {showRuntimeControls ? (
                <div className="firefly-runtime-control-box">
                    <div className="firefly-runtime-control-copy">
                        <strong>
                            {taskIsBlocked
                                ? `当前任务${controlStateLabel}`
                                : awaitingApprovalStep
                                    ? '当前等待你确认'
                                    : '前台可干预运行'}
                        </strong>
                        <span>
                            {taskIsBlocked
                                ? '这轮任务已被前台标记为暂停或拒绝。若要继续批准、重试或恢复，请先重新允许继续。'
                                : awaitingApprovalStep
                                ? (awaitingApprovalStep.approvalReason || awaitingApprovalStep.summary || awaitingApprovalStep.label)
                                : firstFailedStep
                                    ? `最近失败步骤：${firstFailedStep.label}`
                                    : '你可以直接在这里恢复、重试或重新触发当前任务。'}
                        </span>
                    </div>
                    <div className="firefly-runtime-control-actions">
                        {taskIsBlocked ? (
                            <button
                                type="button"
                                className="firefly-runtime-control-button primary"
                                disabled={Boolean(pendingAction)}
                                onClick={() => onControlAction?.('approve_continue', task)}
                            >
                                {pendingAction === 'approve_continue' ? '正在解除…' : '允许继续'}
                            </button>
                        ) : null}
                        {awaitingApprovalStep && !taskIsBlocked ? (
                            <button
                                type="button"
                                className="firefly-runtime-control-button primary"
                                disabled={taskIsBlocked || Boolean(pendingAction)}
                                onClick={() => onControlAction?.('approve_step', task, awaitingApprovalStep.id)}
                            >
                                {pendingAction === 'approve_step' && pendingStepId === awaitingApprovalStep.id ? '正在批准…' : (awaitingApprovalStep.approvalLabel || '批准并继续')}
                            </button>
                        ) : null}
                        {awaitingApprovalStep && !taskIsBlocked ? (
                            <button
                                type="button"
                                className="firefly-runtime-control-button"
                                disabled={Boolean(pendingAction)}
                                onClick={() => onControlAction?.('pause_task', task)}
                            >
                                {pendingAction === 'pause_task' ? '正在暂停…' : '先停住'}
                            </button>
                        ) : null}
                        {awaitingApprovalStep && !taskIsBlocked ? (
                            <button
                                type="button"
                                className="firefly-runtime-control-button danger"
                                disabled={Boolean(pendingAction)}
                                onClick={() => onControlAction?.('reject_continue', task)}
                            >
                                {pendingAction === 'reject_continue' ? '正在结束…' : '结束本轮'}
                            </button>
                        ) : null}
                        {firstFailedStep && !taskIsBlocked ? (
                            <button
                                type="button"
                                className="firefly-runtime-control-button"
                                disabled={Boolean(pendingAction)}
                                onClick={() => onControlAction?.('retry_step', task, firstFailedStep.id)}
                            >
                                {pendingAction === 'retry_step' && pendingStepId === firstFailedStep.id ? '正在重跑…' : '只重跑最近失败步骤'}
                            </button>
                        ) : null}
                        <button
                            type="button"
                            className="firefly-runtime-control-button"
                            disabled={taskIsBlocked || task.status !== 'failed' || Boolean(pendingAction)}
                            onClick={() => onControlAction?.('resume_plan', task)}
                        >
                            {pendingAction === 'resume_plan' ? '正在恢复…' : '恢复续跑'}
                        </button>
                        <button
                            type="button"
                            className="firefly-runtime-control-button"
                            disabled={taskIsBlocked || failedSteps.length === 0 || Boolean(pendingAction)}
                            onClick={() => onControlAction?.('retry_failed', task)}
                        >
                            {pendingAction === 'retry_failed' ? '正在重试…' : '失败步骤重试'}
                        </button>
                        <button
                            type="button"
                            className="firefly-runtime-control-button"
                            disabled={taskIsRunning || Boolean(pendingAction)}
                            onClick={() => onControlAction?.('retry_full', task)}
                        >
                            {pendingAction === 'retry_full' ? '正在重跑…' : '整轮重试'}
                        </button>
                    </div>
                    {controlFeedbackMessage ? (
                        <div className="firefly-runtime-control-feedback success">{controlFeedbackMessage}</div>
                    ) : null}
                    {controlFeedbackError ? (
                        <div className="firefly-runtime-control-feedback error">{controlFeedbackError}</div>
                    ) : null}
                </div>
            ) : null}

            {!showDenseRunningShell && highlightCard ? (
                <div className="firefly-runtime-highlight-card">
                    <div className="firefly-runtime-highlight-copy">
                        <span>{highlightCard.eyebrow}</span>
                        <strong>{highlightCard.title}</strong>
                        <p>{highlightCard.description}</p>
                    </div>
                    {highlightCard.href ? (
                        <a href={highlightCard.href} className="firefly-runtime-highlight-link">
                            {highlightCard.actionLabel || '查看结果'}
                        </a>
                    ) : null}
                </div>
            ) : null}

            {!showDenseRunningShell && webMetrics ? (
                <div className="firefly-runtime-card-pipeline">
                    {(webStageItems.length > 0 ? webStageItems : buildWebStageItems({}, webMetrics)).map((item, index, array) => (
                        <div key={item.id} className="firefly-runtime-card-pipeline-cluster">
                            <div className="firefly-runtime-card-pipeline-item">
                                <strong>{item.title}</strong>
                                <span>{item.metric || item.description}</span>
                            </div>
                            {index < array.length - 1 ? <div className="firefly-runtime-card-pipeline-arrow">→</div> : null}
                        </div>
                    ))}
                </div>
            ) : null}

            {expanded ? (
                <div className="firefly-runtime-card-body">
                    {failedSteps.length > 0 ? (
                        <section className="firefly-runtime-section-card">
                            <div className="firefly-runtime-section-head static">
                                <div className="firefly-runtime-section-head-copy">
                                    <span className="firefly-runtime-section-title">失败步骤重跑</span>
                                    <small>可以直接指定要重跑的步骤，而不必整轮重试</small>
                                </div>
                            </div>
                            <div className="firefly-runtime-step-retry-list">
                                {failedSteps.map((step) => (
                                    <div key={step.id} className="firefly-runtime-step-retry-item">
                                        <div className="firefly-runtime-step-retry-copy">
                                            <strong>{step.label}</strong>
                                            <span>{step.summary || step.purpose || step.approvalReason || '当前步骤暂无额外说明。'}</span>
                                        </div>
                                        <button
                                            type="button"
                                            className="firefly-runtime-control-button"
                                            disabled={taskIsBlocked || Boolean(pendingAction)}
                                            onClick={() => onControlAction?.('retry_step', task, step.id)}
                                        >
                                            {pendingAction === 'retry_step' && pendingStepId === step.id ? '正在重跑…' : '重跑这一步'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ) : null}
                    {showWebSearchSections ? (
                        <>
                            <SectionCard
                                id="web-flow"
                                title="执行过程"
                                summary="这次问题实际经历的联网检索阶段"
                                items={buildWebStageItems(task, webMetrics)}
                                defaultOpen
                            />
                            <SectionCard
                                id="progress"
                                title="最新进展"
                                summary="仅展示这次问题相关的阶段状态"
                                items={hasMeaningfulExecutionLogs(task) ? progressItems : webProgressItems}
                                defaultOpen={task.status === 'running' || task.status === 'awaiting_approval'}
                                dense
                            />
                        </>
                    ) : (
                        <>
                            <SectionCard
                                id="plan"
                                title="任务拆解"
                                summary="本轮任务被整理成的阶段"
                                items={planItems}
                                defaultOpen={task.status === 'planning' || task.status === 'running'}
                            />
                            <SectionCard
                                id="tools"
                                title="执行方式"
                                summary="当前用了哪些能力和处理链路"
                                items={toolItems}
                                defaultOpen={Boolean(webMetrics)}
                            />
                            <SectionCard
                                id="progress"
                                title="最近进展"
                                summary="最近几个阶段的推进情况"
                                items={progressItems}
                                defaultOpen={task.status === 'running' || task.status === 'awaiting_approval'}
                                dense
                            />
                        </>
                    )}
                    <SectionCard
                        id="outputs"
                        title={showWebSearchSections ? '结果与来源' : '结果列表'}
                        summary={showWebSearchSections ? '这次问题最终整理出的结果对象与可继续查看的链接' : '本轮已经生成的结果对象'}
                        items={outputItems}
                    />
                </div>
            ) : null}
        </div>
    );
}
