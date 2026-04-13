'use client';

import { useState } from 'react';
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
        groundedBy: groundedBy || (fetchedCount > 0 ? 'page_excerpt' : 'search_snippet'),
    };
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
        return [
            {
                id: 'tool-search',
                title: '搜索来源',
                description: `已找到 ${webMetrics.searchCount} 条候选来源`,
                status: formatStepStatus(steps.find((item) => item.toolId === 'web.search')?.status || 'pending'),
            },
            {
                id: 'tool-fetch',
                title: '读取网页摘录',
                description: webMetrics.failedFetchCount > 0
                    ? `已抓取 ${webMetrics.fetchedCount} 页正文，失败 ${webMetrics.failedFetchCount} 页`
                    : `已抓取 ${webMetrics.fetchedCount} 页正文`,
                status: formatStepStatus(steps.find((item) => item.toolId === 'web.fetch')?.status || 'pending'),
            },
            {
                id: 'tool-answer',
                title: '生成结构化回答',
                description: webMetrics.groundedBy === 'page_excerpt' ? '优先基于网页正文摘录' : '主要基于搜索摘要',
                status: formatStepStatus(steps.find((item) => item.toolId === 'web.answer')?.status || 'pending'),
            },
        ];
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
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);

    if (!task) {
        return null;
    }

    const progress = summarizeProgress(task);
    const phaseClass = buildPhaseClass(task.status, progress.failedSteps);
    const statusLabel = formatTaskStatus(task.status, progress.failedSteps);
    const webMetrics = buildWebRuntimeMetrics(task);
    const planItems = buildPlanItems(task);
    const toolItems = buildToolItems(task, webMetrics);
    const progressItems = buildProgressItems(task);
    const outputItems = buildOutputItems(task, compact);
    const narrativeLabel = buildNarrativeLabel(task, progress);
    const stageOverview = buildStageOverview(task, progress, outputItems);
    const highlightCard = buildHighlightCard(task, outputItems);

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

            <div className="firefly-runtime-card-kicker">{narrativeLabel}</div>

            {task.resultSummary ? (
                <div className="firefly-runtime-card-summary">{task.resultSummary}</div>
            ) : null}

            <div className="firefly-runtime-stage-strip">
                {stageOverview.map((stage) => (
                    <div key={stage.id} className={`firefly-runtime-stage-item ${stage.state}`}>
                        <strong>{stage.title}</strong>
                        <span>{stage.description}</span>
                    </div>
                ))}
            </div>

            <div className="firefly-runtime-card-stats">
                <span className="firefly-runtime-card-stat">步骤 {progress.completedSteps}/{progress.stepCount || 0}</span>
                <span className="firefly-runtime-card-stat">子任务 {progress.completedSubtasks}/{progress.subtaskCount || 0}</span>
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

            {highlightCard ? (
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

            {webMetrics ? (
                <div className="firefly-runtime-card-pipeline">
                    <div className="firefly-runtime-card-pipeline-item">
                        <strong>搜索</strong>
                        <span>{webMetrics.searchCount} 条来源</span>
                    </div>
                    <div className="firefly-runtime-card-pipeline-arrow">→</div>
                    <div className="firefly-runtime-card-pipeline-item">
                        <strong>摘录</strong>
                        <span>{webMetrics.fetchedCount} 页正文{webMetrics.failedFetchCount ? ` / 失败 ${webMetrics.failedFetchCount}` : ''}</span>
                    </div>
                    <div className="firefly-runtime-card-pipeline-arrow">→</div>
                    <div className="firefly-runtime-card-pipeline-item">
                        <strong>回答</strong>
                        <span>{webMetrics.groundedBy === 'page_excerpt' ? '基于正文摘录' : '基于搜索摘要'}</span>
                    </div>
                </div>
            ) : null}

            {expanded ? (
                <div className="firefly-runtime-card-body">
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
                    <SectionCard
                        id="outputs"
                        title="结果列表"
                        summary="本轮已经生成的结果对象"
                        items={outputItems}
                    />
                </div>
            ) : null}
        </div>
    );
}
