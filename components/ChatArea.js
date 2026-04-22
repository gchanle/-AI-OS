'use client';
import Link from 'next/link';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
} from '@/data/capabilityMarket';
import {
    campusCapabilities,
    capabilityMap,
    chatModelOptions,
    resolveChatModel,
} from '@/data/workspace';
import {
    decideFireflyResponseMode,
    shouldInjectCampusContext as shouldInjectCampusContextForQuestion,
    shouldUseWebSearch,
} from '@/lib/fireflyResponseMode';
import {
    isFireflyRuntimeTaskStreaming,
    requestFireflyRuntimeControl,
    resolveFireflyRuntimeTaskPhase,
} from '@/lib/fireflyRuntimeControlClient';
import {
    loadApprovalCenterState,
    syncCampusApprovals,
} from '@/data/approvalCenter';
import {
    formatMessageTime as formatCenterMessageTime,
    loadMessageCenterItems,
    syncStudyNoticeMessages,
} from '@/data/messageCenter';
import {
    ensureCampusUserProfile,
    loadCampusUserProfile,
    subscribeCampusUserProfile,
} from '@/data/userProfile';
import { saveServerChatSessions } from '@/data/campusPlatform';
import { rememberFireflyTask, buildFireflyMemorySnapshot } from '@/data/fireflyMemory';
import { patchFireflyTask, upsertFireflyTask } from '@/data/fireflyTasks';
import {
    buildApprovalSummary,
    buildUnreadSummary,
    renderRichMessageContent,
} from '@/components/RichMessageContent';
import FireflyControlPlanePanel from '@/components/FireflyControlPlanePanel';
import FireflyThreadRuntimePanel from '@/components/FireflyThreadRuntimePanel';
import FireflyRuntimeStrip from '@/components/FireflyRuntimeStrip';
import './ChatArea.css';

function shouldAttachUnreadSummary(question = '') {
    const normalizedQuestion = String(question || '').trim();
    if (!normalizedQuestion) {
        return false;
    }

    if (/未读消息|学习通|校园通知|站内信|消息中心|通知中心|未读通知|校园提醒|维度消息|收件箱/.test(normalizedQuestion)) {
        return true;
    }

    return /消息/.test(normalizedQuestion) && /最近|最新|我的|帮我看|帮我查|获取|整理|汇总|报告|简报|文档/.test(normalizedQuestion);
}

function shouldAttachApprovalSummary(question = '') {
    return /审批|待办|流程|我发起|待我审批|AI ?办事/.test(question);
}

function isTroubleshootingQuestion(question = '') {
    return /token|bearer|cookie|登录|认证|auth|enc|密钥|key|会话|失效|为什么|报错|失败|不能用/i.test(String(question || '').trim());
}

function isFailureLikeAssistantMessage(message = {}) {
    if (message.role !== 'ai') {
        return false;
    }

    return /任务执行失败|执行失败|登录态已失效|审批实时查询失败|未读消息查询失败|MCP|认证|Token|Bearer/.test(String(message.content || ''));
}

function buildFallbackChatHistory(allMessages = [], latestUserMessage = null) {
    const trimmedMessages = allMessages
        .filter((message) => String(message?.content || '').trim())
        .map((message) => ({
            role: message.role === 'ai' ? 'assistant' : 'user',
            content: String(message.content || '').trim(),
        }));

    const latestQuestion = String(latestUserMessage?.content || '').trim();
    if (!trimmedMessages.length) {
        return trimmedMessages;
    }

    if (isTroubleshootingQuestion(latestQuestion)) {
        const lastFailureIndex = [...allMessages]
            .map((message, index) => ({ message, index }))
            .reverse()
            .find(({ message }) => isFailureLikeAssistantMessage(message))?.index;

        if (typeof lastFailureIndex === 'number') {
            const focusedHistory = allMessages
                .slice(Math.max(0, lastFailureIndex - 1))
                .filter((message) => String(message?.content || '').trim())
                .map((message) => ({
                    role: message.role === 'ai' ? 'assistant' : 'user',
                    content: String(message.content || '').trim(),
                }));

            return focusedHistory.slice(-4);
        }
    }

    return trimmedMessages.slice(-8);
}

function formatTaskStatus(status = '') {
    if (status === 'completed') return '已完成';
    if (status === 'failed') return '失败';
    if (status === 'running') return '执行中';
    if (status === 'planning') return '规划中';
    return status || '待执行';
}

function buildPendingAgentContent(mode = 'planning') {
    if (mode === 'fallback') {
        return [
            '## 已切换到普通对话',
            '- 当前问题没有命中特定可执行工具。',
            '- 我会保留上下文，继续用普通对话方式回答。',
        ].join('\n');
    }

    return [
        '## 萤火虫正在准备',
        '- 正在识别可执行工具。',
        '- 稍后会把计划、步骤和产出逐步显示在这里。',
    ].join('\n');
}

function buildStreamingTaskContent(task, phase = 'running') {
    if (!task) {
        return buildPendingAgentContent();
    }

    const title = phase === 'failed'
        ? '## Agent 执行失败'
        : phase === 'completed'
            ? '## Agent 执行完成'
            : '## Agent 正在执行';
    const lines = [
        title,
        `- 任务：${task.title || '萤火虫任务'}`,
        `- 状态：${formatTaskStatus(task.status)}`,
    ];

    if (task.selectedSkillLabels?.length) {
        lines.push(`- 已调度：${task.selectedSkillLabels.join('、')}`);
    }

    if (task.resultSummary) {
        lines.push(`- 结果摘要：${task.resultSummary}`);
    }

    if (task.steps?.length) {
        lines.push('', '## 执行链路');
        task.steps.forEach((step, index) => {
            const summary = step.summary ? `｜${step.summary}` : '';
            lines.push(`${index + 1}. ${step.label}｜${formatStepStatus(step.status)}${summary}`);
        });
    }

    if (task.artifacts?.length) {
        lines.push('', '## 当前产出');
        task.artifacts.slice(-3).forEach((artifact) => {
            lines.push(`### ${artifact.label}`);
            if (artifact.content) {
                lines.push(artifact.content);
            }
            if (artifact.href) {
                lines.push('', `[打开结果](${artifact.href})`);
            }
        });
    }

    return lines.join('\n\n');
}

function buildDirectStatusContent({ title = '', summary = '' } = {}) {
    const normalizedTitle = String(title || '').trim() || '正在处理';
    const normalizedSummary = String(summary || '').trim();

    return [
        `## ${normalizedTitle}`,
        normalizedSummary ? `- ${normalizedSummary}` : '- 正在准备回复，请稍候。',
    ].join('\n');
}

function buildCampusContextRuntimeTask({
    question = '',
    includeUnread = false,
    includeApproval = false,
    unreadCount = 0,
    approvalCount = 0,
    stage = 'collecting',
} = {}) {
    const normalizedQuestion = String(question || '').trim() || '校园数据整理';
    const steps = [];

    if (includeUnread) {
        steps.push({
            id: 'collect-messages',
            label: '提取未读消息',
            toolId: 'messages.unread_summary',
            status: ['messages_ready', 'approvals_ready', 'answering', 'completed'].includes(stage) ? 'completed' : 'running',
            summary: unreadCount > 0 ? `已同步 ${unreadCount} 条未读消息` : '正在同步消息中心数据',
        });
    }

    if (includeApproval) {
        steps.push({
            id: 'collect-approvals',
            label: '提取审批待办',
            toolId: 'approvals.center_overview',
            status: ['approvals_ready', 'answering', 'completed'].includes(stage)
                ? 'completed'
                : includeUnread && ['messages_ready'].includes(stage)
                    ? 'running'
                    : 'running',
            summary: approvalCount > 0 ? `已同步 ${approvalCount} 条审批记录` : '正在同步审批中心数据',
        });
    }

    steps.push({
        id: 'compose-answer',
        label: '整理结构化结果',
        toolId: 'compose.report',
        status: stage === 'completed' ? 'completed' : stage === 'answering' ? 'running' : 'pending',
        summary: stage === 'completed' ? '结构化结果已生成' : '正在根据同步结果整理为最终文档',
    });

    const currentStageTitleMap = {
        collecting: '正在同步校园数据',
        messages_ready: '未读消息已同步',
        approvals_ready: '校园数据已同步',
        answering: '正在整理结构化结果',
        completed: '结果已整理完成',
    };
    const currentStageSummaryMap = {
        collecting: '正在读取消息中心和相关校园数据。',
        messages_ready: '未读消息已同步，正在继续整理其他数据。',
        approvals_ready: '校园数据已同步完成，正在生成最终结果。',
        answering: '正在把同步结果整理成结构化文档。',
        completed: '校园数据整理已完成。',
    };

    return {
        id: `campus-${Date.now()}`,
        title: normalizedQuestion,
        status: stage === 'completed' ? 'completed' : 'running',
        resultSummary: currentStageSummaryMap[stage] || '正在处理校园数据。',
        currentStage: stage,
        currentStageTitle: currentStageTitleMap[stage] || '正在处理',
        currentStageSummary: currentStageSummaryMap[stage] || '正在处理校园数据。',
        planKind: 'campus_summary',
        planMetadata: {
            routeLabel: '校园数据整理',
            webProfileLabel: '校园工具',
        },
        steps,
        subtasks: steps.map((step) => ({
            id: step.id,
            label: step.label,
            linkedToolIds: [step.toolId],
            status: step.status,
        })),
        stepResults: {},
    };
}

function filterUnreadItemsByQuestion(items = [], question = '') {
    const normalizedQuestion = String(question || '').trim();
    const now = Date.now();
    let durationMs = 0;

    if (/上周|最近一周|过去一周|近一周|7天/.test(normalizedQuestion)) {
        durationMs = 7 * 24 * 60 * 60 * 1000;
    } else if (/最近三天|过去三天|近三天|3天/.test(normalizedQuestion)) {
        durationMs = 3 * 24 * 60 * 60 * 1000;
    }

    if (!durationMs) {
        return Array.isArray(items) ? items : [];
    }

    return (Array.isArray(items) ? items : []).filter((item) => {
        const createdAt = new Date(item?.createdAt || '').getTime();
        return Number.isFinite(createdAt) && now - createdAt <= durationMs;
    });
}

function buildCampusStructuredReply({
    question = '',
    unreadItems = [],
    approvalState = null,
    includeUnread = false,
    includeApproval = false,
    formatter = () => '',
} = {}) {
    const sections = [];

    if (includeUnread) {
        const filteredUnreadItems = filterUnreadItemsByQuestion(unreadItems, question);
        const scopedUnreadItems = filteredUnreadItems.length > 0 ? filteredUnreadItems : unreadItems;
        sections.push('## 未读消息整理');
        sections.push(buildUnreadSummary(scopedUnreadItems, formatter));
    }

    if (includeApproval && approvalState) {
        sections.push('## 审批待办整理');
        sections.push(buildApprovalSummary({
            pending: approvalState.pending,
            pendingCount: approvalState.pendingCount,
            initiated: approvalState.initiated,
            initiatedCount: approvalState.initiatedCount,
            records: approvalState.records,
            recordsByStatus: approvalState.recordsByStatus,
            recordCountsByStatus: approvalState.recordCountsByStatus,
            formatter,
        }));
    }

    return sections.join('\n\n').trim();
}

function buildRuntimeTraceMessage(task, phase = 'running', modelId = '') {
    return {
        role: 'ai',
        content: '',
        time: new Date(),
        modelId,
        messageKind: 'runtime-trace',
        runtimeTask: task || null,
        runtimePhase: phase,
        streaming: phase === 'running',
        traceExpanded: false,
    };
}

function buildAssistantMessage(content, modelId = '', options = {}) {
    return {
        role: 'ai',
        content,
        time: new Date(),
        modelId,
        messageKind: 'assistant-final',
        streaming: Boolean(options.streaming),
        sourceRefs: Array.isArray(options.sourceRefs) ? options.sourceRefs : [],
        showGeneratedBy: Boolean(options.showGeneratedBy),
    };
}

function sanitizeTitleSegment(value = '') {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .replace(/[《》"'`#*]+/g, '')
        .trim();
}

function buildConversationTitle(messages = []) {
    const normalizedMessages = Array.isArray(messages) ? messages : [];
    const userMessages = normalizedMessages.filter((message) => message?.role === 'user');
    const assistantMessages = normalizedMessages.filter((message) => message?.role === 'ai');
    const runtimeTitles = normalizedMessages
        .filter((message) => message?.messageKind === 'runtime-trace' && message?.runtimeTask)
        .map((message) => sanitizeTitleSegment(
            message.runtimeTask?.title
            || message.runtimeTask?.planMetadata?.resumeTarget
            || message.runtimeTask?.intentLabel
            || ''
        ))
        .filter(Boolean);
    const firstQuestion = sanitizeTitleSegment(userMessages[0]?.content || '');
    const latestQuestion = sanitizeTitleSegment(userMessages[userMessages.length - 1]?.content || '');
    const latestAnswer = sanitizeTitleSegment(
        assistantMessages
            .filter((message) => message?.messageKind === 'assistant-final')
            .slice(-1)[0]?.content || ''
    );

    const candidate = [
        runtimeTitles[runtimeTitles.length - 1],
        latestQuestion,
        firstQuestion,
        latestAnswer,
    ].find((item) => item && item.length > 0) || '新对话';

    const normalized = candidate
        .split(/[。！？\n]/)
        .map((item) => item.trim())
        .filter(Boolean)[0] || candidate;

    return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
}

function stripAssistantDisclosure(content = '') {
    const normalized = String(content || '').trim();
    return normalized
        .replace(/\n*\s*---\s*\n*\s*本次回复来自“[^”]+”整理生成，请注意甄别。\s*$/u, '')
        .trim();
}

function AssistantMessageFooter({ message }) {
    const modelLabel = String(resolveChatModel(message?.modelId)?.label || message?.modelId || '大模型').trim();
    const sources = Array.isArray(message?.sourceRefs) ? message.sourceRefs.filter((item) => item?.title && item?.url) : [];
    const shouldShowFooter = Boolean(message?.showGeneratedBy || sources.length > 0);
    const sourceGroups = [
        {
            key: 'web',
            label: '网页查询',
            items: sources.filter((item) => (item.kind || 'web') === 'web'),
        },
        {
            key: 'knowledge',
            label: '知识库查询',
            items: sources.filter((item) => item.kind === 'knowledge'),
        },
        {
            key: 'mcp',
            label: 'MCP / Skill',
            items: sources.filter((item) => item.kind === 'mcp' || item.kind === 'skill'),
        },
    ].filter((group) => group.items.length > 0);

    if (!shouldShowFooter) {
        return null;
    }

    const openSourceInNewTab = (event, url = '') => {
        event.preventDefault();
        event.stopPropagation();

        const targetUrl = String(url || '').trim();
        if (!targetUrl || typeof window === 'undefined') {
            return;
        }

        window.open(targetUrl, '_blank', 'noopener,noreferrer');
    };

    const closePopover = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const details = event.currentTarget.closest('.assistant-source-popover');
        if (details) {
            details.open = false;
            details.dataset.side = 'right';
        }
    };

    const handlePopoverToggle = (event) => {
        const details = event.currentTarget;
        if (!details.open) {
            details.dataset.side = 'right';
            return;
        }

        const card = details.querySelector('.assistant-source-popover-card');
        if (!card || typeof window === 'undefined') {
            return;
        }

        const summaryRect = details.getBoundingClientRect();
        const bubble = details.closest('.msg-bubble');
        const container = details.closest('.messages-container');
        const bubbleRect = bubble?.getBoundingClientRect();
        const containerRect = container?.getBoundingClientRect();
        const viewportPadding = 20;
        const desiredWidth = Math.min(
            560,
            Math.floor(window.innerWidth * 0.72),
            Math.max(320, Math.floor((containerRect?.width || window.innerWidth) - 32))
        );
        const availableRightEdge = Math.min(
            window.innerWidth - viewportPadding,
            bubbleRect?.right || window.innerWidth - viewportPadding,
            containerRect?.right || window.innerWidth - viewportPadding
        );
        const availableLeftEdge = Math.max(
            viewportPadding,
            bubbleRect?.left || viewportPadding,
            containerRect?.left || viewportPadding
        );
        const rightSpace = availableRightEdge - summaryRect.left;
        const leftSpace = summaryRect.right - availableLeftEdge;
        const shouldOpenLeft = rightSpace < desiredWidth + 16 && leftSpace >= rightSpace;
        details.dataset.side = shouldOpenLeft ? 'left' : 'right';
    };

    return (
        <div className="assistant-message-footer">
            <span className="assistant-model-badge">{modelLabel}</span>
            <div className="assistant-message-footer-copy">
                <span>该回复由“{modelLabel}”模型整理生成，请注意甄别。</span>
                {sources.length > 0 ? (
                    <details className="assistant-source-popover" data-side="right" onToggle={handlePopoverToggle}>
                        <summary>参考信源</summary>
                        <div className="assistant-source-popover-card">
                            <div className="assistant-source-popover-head">
                                <strong>参考资料</strong>
                                <button
                                    type="button"
                                    className="assistant-source-popover-close"
                                    aria-label="关闭参考资料"
                                    onClick={closePopover}
                                >
                                    ×
                                </button>
                            </div>
                            <div className="assistant-source-tabs">
                                {sourceGroups.map((group) => (
                                    <span key={group.key} className="assistant-source-tab">
                                        {group.label}
                                    </span>
                                ))}
                            </div>
                            {sourceGroups.map((group) => (
                                <div key={group.key} className="assistant-source-group">
                                    <div className="assistant-source-group-title">{group.label}</div>
                                    <div className="assistant-source-table">
                                        <div className="assistant-source-table-head">
                                            <span>序号</span>
                                            <span>参考信息名称</span>
                                            <span>操作</span>
                                        </div>
                                        {group.items.map((source, index) => (
                                            <div key={source.id || source.url} className="assistant-source-row">
                                                <span>{group.label === '网页查询' ? `网页${source.order || index + 1}` : `${group.label}${source.order || index + 1}`}</span>
                                                <a
                                                    href={source.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="assistant-source-link"
                                                    title={source.title}
                                                    onClick={(event) => openSourceInNewTab(event, source.url)}
                                                >
                                                    {source.title}
                                                </a>
                                                <a
                                                    href={source.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="assistant-source-action"
                                                    onClick={(event) => openSourceInNewTab(event, source.url)}
                                                >
                                                    访问
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </details>
                ) : null}
            </div>
        </div>
    );
}

function buildSearchRuntimeTask(question = '', stage = 'search_started', meta = {}) {
    const sourceCount = Number(meta.sourceCount || 0);
    const fetchedCount = Number(meta.fetchedCount || 0);
    const normalizedStage = String(stage || 'search_started').trim() || 'search_started';
    const title = String(question || '联网检索任务').trim() || '联网检索任务';
    const stageTitleMap = {
        search_started: meta.title || '正在搜索来源',
        sources_ready: meta.title || '已锁定候选来源',
        thinking: meta.title || (fetchedCount > 0 ? '正在研读页面' : '正在整理线索'),
        answer_started: meta.title || '正在整理回答',
        completed: meta.title || '结果已整理完成',
        failed: meta.title || '本轮检索失败',
    };
    const stageSummaryMap = {
        search_started: meta.summary || '正在寻找可引用的网页来源。',
        sources_ready: meta.summary || `已锁定 ${sourceCount} 个候选来源。`,
        thinking: meta.summary || (
            fetchedCount > 0
                ? `已读取 ${fetchedCount} 个页面摘录，正在交叉核对关键信息。`
                : '已拿到候选来源，正在判断下一步整理方式。'
        ),
        answer_started: meta.summary || '已拿到来源，正在整理成最终回答。',
        completed: meta.summary || '结果已经整理完成。',
        failed: meta.summary || '本轮联网检索失败，请稍后重试。',
    };

    const hasFetchedPages = fetchedCount > 0;
    const searchStatus = ['sources_ready', 'thinking', 'answer_started', 'completed'].includes(normalizedStage)
        ? 'completed'
        : normalizedStage === 'failed'
            ? (sourceCount > 0 ? 'completed' : 'failed')
            : 'running';
    const fetchStatus = ['thinking', 'answer_started', 'completed'].includes(normalizedStage)
        ? (hasFetchedPages ? 'completed' : 'pending')
        : normalizedStage === 'sources_ready'
            ? (hasFetchedPages ? 'completed' : 'pending')
            : normalizedStage === 'failed' && hasFetchedPages
                ? 'completed'
                : 'pending';
    const answerStatus = ['thinking', 'answer_started'].includes(normalizedStage)
        ? 'running'
        : normalizedStage === 'completed'
            ? 'completed'
            : normalizedStage === 'failed'
                ? 'failed'
                : 'pending';
    const overallStatus = normalizedStage === 'completed'
        ? 'completed'
        : normalizedStage === 'failed'
            ? 'failed'
            : 'running';

    return {
        id: `search-${Date.now()}`,
        title,
        status: overallStatus,
        resultSummary: stageSummaryMap[normalizedStage] || '正在推进联网检索。',
        currentStage: normalizedStage,
        currentStageTitle: stageTitleMap[normalizedStage] || '正在处理中',
        currentStageSummary: stageSummaryMap[normalizedStage] || '正在推进联网检索。',
        planKind: 'web_research',
        planMetadata: {
            routeLabel: '联网搜索',
            webProfileLabel: '联网搜索',
        },
        steps: [
            {
                id: 'search-step',
                label: '搜索来源',
                subtaskLabel: '搜索来源',
                toolId: 'web.search',
                status: searchStatus,
                summary: sourceCount > 0 ? `已找到 ${sourceCount} 个候选来源` : '正在查询搜索引擎',
            },
            {
                id: 'fetch-step',
                label: '读取页面',
                subtaskLabel: '读取页面',
                toolId: 'web.fetch',
                status: fetchStatus,
                summary: hasFetchedPages
                    ? `已读取 ${fetchedCount} 个页面摘录`
                    : '按可信度挑选关键页面并读取摘录',
            },
            {
                id: 'answer-step',
                label: '整理回答',
                subtaskLabel: '整理回答',
                toolId: 'web.answer',
                status: answerStatus,
                summary: fetchedCount > 0
                    ? '正在基于页面摘录组织最终回答'
                    : '正在根据候选来源生成回答',
            },
        ],
        subtasks: [
            { id: 'search-step', label: '搜索来源', linkedToolIds: ['web.search'], status: searchStatus },
            { id: 'fetch-step', label: '读取页面', linkedToolIds: ['web.fetch'], status: fetchStatus },
            { id: 'answer-step', label: '整理回答', linkedToolIds: ['web.answer'], status: answerStatus },
        ],
        stepResults: {
            'web.search': {
                data: {
                    results: Array.from({ length: sourceCount }, (_, index) => ({ id: `source-${index + 1}` })),
                },
            },
            'web.fetch': {
                data: {
                    pages: Array.from({ length: fetchedCount }, (_, index) => ({ id: `page-${index + 1}` })),
                    failedPages: [],
                },
            },
            'web.answer': {
                data: {
                    groundedBy: fetchedCount > 0 ? 'page_excerpt' : 'search_snippet',
                },
            },
        },
    };
}

function buildRuntimeTraceSummary(task = null) {
    if (!task) {
        return '正在准备可执行工具。';
    }

    if (task.resultSummary) {
        return task.resultSummary;
    }

    if (Array.isArray(task.selectedSkillLabels) && task.selectedSkillLabels.length > 0) {
        return `已调度 ${task.selectedSkillLabels.join('、')}`;
    }

    return '正在组织执行过程。';
}

function buildRenderableMessages(messages = []) {
    const blocks = [];

    for (let index = 0; index < messages.length; index += 1) {
        const current = messages[index];
        const next = messages[index + 1];

        if (
            current?.messageKind === 'runtime-trace'
            && current?.runtimeTask
            && next?.role === 'ai'
            && next?.messageKind === 'assistant-final'
        ) {
            blocks.push({
                type: 'assistant-with-runtime',
                assistant: next,
                runtime: current,
                key: `assistant-runtime-${index}-${next.time || ''}`,
            });
            index += 1;
            continue;
        }

        blocks.push({
            type: 'message',
            message: current,
            key: `message-${index}-${current?.time || ''}`,
        });
    }

    return blocks;
}

function ensureClientSessionKey(explicitSessionId = '') {
    if (typeof window === 'undefined') {
        return explicitSessionId || `session-${Date.now()}`;
    }

    const existing = String(explicitSessionId || sessionStorage.getItem('current_sid') || '').trim();
    if (existing) {
        sessionStorage.setItem('current_sid', existing);
        return existing;
    }

    const created = `session-${Date.now()}`;
    sessionStorage.setItem('current_sid', created);
    return created;
}

const fireflyStarterPrompts = [
    '帮我看下今天要紧的事',
    '帮我整理一下未读和待办',
    '帮我查个问题',
];
function buildTimeGreeting(name = '') {
    const hour = new Date().getHours();
    const displayName = String(name || '').trim();
    const suffix = displayName ? `，${displayName}` : '';

    if (hour < 6) return `夜深了${suffix}`;
    if (hour < 12) return `早上好${suffix}`;
    if (hour < 18) return `下午好${suffix}`;
    return `晚上好${suffix}`;
}

export default function ChatArea({
    initialMessage,
    sessionId,
    defaultCapabilityIds,
    preferredModelId,
    onPreferredModelChange,
    availableModels = chatModelOptions,
    variant = 'classic',
    onToggleCapability,
    webSearchEnabled = false,
    deepResearchEnabled = false,
    onWebSearchChange,
    onDeepResearchChange,
    initialRuntimeContext = null,
    initialThreadKey = null,
}) {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [activeCapabilityIds, setActiveCapabilityIds] = useState(defaultCapabilityIds);
    const [activeModelId, setActiveModelId] = useState(preferredModelId);
    const [showToolsMenu, setShowToolsMenu] = useState(false);
    const [showAgentPanel, setShowAgentPanel] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [runtimeRecovery, setRuntimeRecovery] = useState(null);
    const [runtimeControlState, setRuntimeControlState] = useState({
        pendingAction: '',
        taskId: '',
        stepId: '',
        message: '',
        error: '',
    });
    const [userProfile, setUserProfile] = useState(() => ensureCampusUserProfile());
    const messagesContainerRef = useRef(null);
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);
    const toolsMenuRef = useRef(null);
    const hasInitialized = useRef(false);
    const abortControllerRef = useRef(null);
    const speechRecognitionRef = useRef(null);
    const launchRuntimeContextRef = useRef(initialRuntimeContext);
    const launchThreadKeyRef = useRef(initialThreadKey);
    const shouldStickToBottomRef = useRef(true);
    const autoScrollBehaviorRef = useRef('auto');

    useEffect(() => {
        launchRuntimeContextRef.current = initialRuntimeContext;
    }, [initialRuntimeContext]);

    useEffect(() => {
        launchThreadKeyRef.current = initialThreadKey;
    }, [initialThreadKey]);

    const refreshRuntimeRecovery = useCallback(async (threadKey) => {
        const nextThreadKey = String(threadKey || '').trim();
        if (!nextThreadKey) {
            setRuntimeRecovery(null);
            return null;
        }

        try {
            const response = await fetch(`/api/firefly/runtime/recovery?threadKey=${encodeURIComponent(nextThreadKey)}`);
            if (!response.ok) {
                setRuntimeRecovery(null);
                return null;
            }

            const payload = await response.json();
            if (payload?.ok && payload.available) {
                setRuntimeRecovery(payload);
                return payload;
            }

            setRuntimeRecovery(null);
            return null;
        } catch {
            setRuntimeRecovery(null);
            return null;
        }
    }, []);

    useEffect(() => {
        const candidateThreadKey = String(initialThreadKey || sessionId || '').trim();
        if (!candidateThreadKey) {
            setRuntimeRecovery(null);
            return;
        }

        refreshRuntimeRecovery(candidateThreadKey);
    }, [initialThreadKey, refreshRuntimeRecovery, sessionId]);

    useEffect(() => subscribeCampusUserProfile(setUserProfile), []);

    const applyRuntimeControlResultToMessages = useCallback((items = [], {
        taskId = '',
        nextTask = null,
        nextReply = '',
    } = {}) => {
        const normalizedTaskId = String(taskId || '').trim();
        if (!normalizedTaskId) {
            return items;
        }

        const updated = Array.isArray(items) ? [...items] : [];
        const traceIndex = updated.findIndex((message) => (
            message?.messageKind === 'runtime-trace'
            && String(message?.runtimeTask?.id || '').trim() === normalizedTaskId
        ));

        if (traceIndex < 0) {
            return items;
        }

        const traceMessage = updated[traceIndex];
        const nextRuntimeTask = nextTask || traceMessage.runtimeTask || null;

        updated[traceIndex] = {
            ...traceMessage,
            runtimeTask: nextRuntimeTask,
            runtimePhase: resolveFireflyRuntimeTaskPhase(nextRuntimeTask),
            streaming: isFireflyRuntimeTaskStreaming(nextRuntimeTask),
            time: new Date(),
            modelId: activeModelId,
        };

        if (nextReply) {
            const assistantIndex = traceIndex + 1;
            const assistantMessage = updated[assistantIndex];

            if (assistantMessage?.role === 'ai' && assistantMessage?.messageKind === 'assistant-final') {
                updated[assistantIndex] = buildAssistantMessage(nextReply, activeModelId, {
                    showGeneratedBy: true,
                });
            } else {
                updated.splice(assistantIndex, 0, buildAssistantMessage(nextReply, activeModelId, {
                    showGeneratedBy: true,
                }));
            }
        }

        return updated;
    }, [activeModelId]);

    useEffect(() => {
        if (!showToolsMenu) {
            return undefined;
        }

        const handlePointerDown = (event) => {
            if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target)) {
                setShowToolsMenu(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
        };
    }, [showToolsMenu]);

    const marketAccessContext = useMemo(() => (
        buildCapabilityMarketAccessContextFromCatalog({
            skills: buildSkillDefinitions(loadSkillDefinitionState()),
            mcps: buildMcpDefinitions(loadMcpDefinitionState()),
            installs: loadUserCapabilityInstalls(userProfile),
        })
    ), [userProfile]);
    const renderableMessages = useMemo(
        () => buildRenderableMessages(messages),
        [messages]
    );
    const chatThreadKey = ensureClientSessionKey(sessionId);
    const activeRuntimeTask = (() => {
        for (let index = messages.length - 1; index >= 0; index -= 1) {
            const message = messages[index];
            if (message?.messageKind === 'runtime-trace' && message?.runtimeTask?.id) {
                return message.runtimeTask;
            }
        }

        return runtimeRecovery?.task || null;
    })();
    const agentPanelContextSnapshot = (
        activeRuntimeTask?.contextSnapshot
        || runtimeRecovery?.task?.contextSnapshot
        || launchRuntimeContextRef.current
        || initialRuntimeContext
        || {
            webSearchEnabled,
            deepResearchEnabled,
        }
    );

    const scrollToBottom = (behavior = 'auto') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    };

    useEffect(() => {
        if (shouldStickToBottomRef.current) {
            scrollToBottom(autoScrollBehaviorRef.current);
        }
    }, [messages]);

    const handleMessagesScroll = useCallback(() => {
        const container = messagesContainerRef.current;
        if (!container) {
            shouldStickToBottomRef.current = true;
            return;
        }

        const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        shouldStickToBottomRef.current = distanceToBottom < 80;
    }, []);

    const pinToBottom = useCallback((behavior = 'smooth') => {
        shouldStickToBottomRef.current = true;
        autoScrollBehaviorRef.current = behavior;
        scrollToBottom(behavior);
    }, []);

    useEffect(() => {
        if (!sessionId) {
            setActiveCapabilityIds(defaultCapabilityIds);
            setActiveModelId(preferredModelId);
        }
    }, [sessionId, defaultCapabilityIds, preferredModelId]);

    // Update messages when sessionId changes
    useEffect(() => {
        if (sessionId) {
            try {
                const sessions = JSON.parse(localStorage.getItem('chat_sessions') || '[]');
                const found = sessions.find(s => s.id === sessionId);
                if (found) {
                    setMessages(found.messages);
                    setActiveCapabilityIds(found.meta?.capabilityIds?.length ? found.meta.capabilityIds : defaultCapabilityIds);
                    setActiveModelId(found.meta?.modelId || preferredModelId);
                    onWebSearchChange?.(Boolean(found.meta?.webSearchEnabled));
                    onDeepResearchChange?.(Boolean(found.meta?.deepResearchEnabled));
                    hasInitialized.current = true; // prevent initialMessage from triggering
                }
            } catch(e) {}
        } else if (!initialMessage) {
            setMessages([]);
            hasInitialized.current = false;
            setActiveCapabilityIds(defaultCapabilityIds);
            setActiveModelId(preferredModelId);
        }
    }, [sessionId, initialMessage, defaultCapabilityIds, preferredModelId, onWebSearchChange, onDeepResearchChange]);

    const persistConversation = useCallback((nextMessages, meta) => {
        try {
            const updatedComplete = Array.isArray(nextMessages) ? nextMessages : [];
            const sessions = JSON.parse(localStorage.getItem('chat_sessions') || '[]');
            const sid = ensureClientSessionKey(sessionId);

            const existingIdx = sessions.findIndex((session) => session.id === sid);
            const generatedTitle = buildConversationTitle(updatedComplete);
            const sessionObj = {
                id: sid,
                title: generatedTitle,
                date: new Date().toLocaleDateString(),
                updatedAt: new Date().toISOString(),
                messages: updatedComplete,
                meta,
            };

            if (existingIdx >= 0) {
                sessions[existingIdx] = sessionObj;
            } else {
                sessions.unshift(sessionObj);
            }

            localStorage.setItem('chat_sessions', JSON.stringify(sessions));
            const profile = loadCampusUserProfile();
            saveServerChatSessions({
                uid: profile.uid,
                fid: profile.fid,
                chatSessions: sessions,
            }).catch(() => {});
            window.dispatchEvent(new Event('chat-history-updated'));

            return sid;
        } catch (error) {
            console.error('History save error', error);
            return null;
        }
    }, [sessionId]);

    const handleRuntimeControlAction = useCallback(async (action, task, stepId = '', options = {}) => {
        const taskId = String(task?.id || '').trim();
        if (!taskId) {
            return;
        }
        const note = String(options?.note || '').trim();

        setRuntimeControlState({
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
                note,
            });
            const nextTask = result.task
                ? {
                    ...result.task,
                    sessionId: String(result.task.sessionId || task.sessionId || task.threadKey || sessionId || '').trim(),
                    resumeContext: task.resumeContext || {},
                }
                : null;

            if (nextTask?.id) {
                upsertFireflyTask(nextTask);
            }

            let nextMessages = null;
            setMessages((prev) => {
                nextMessages = applyRuntimeControlResultToMessages(prev, {
                    taskId,
                    nextTask,
                    nextReply: result.reply,
                });
                return nextMessages;
            });

            if (nextMessages) {
                persistConversation(nextMessages, {
                    capabilityIds: activeCapabilityIds,
                    modelId: activeModelId,
                    webSearchEnabled,
                    deepResearchEnabled,
                    runtimeMode: 'agent',
                    responseMode: 'agent',
                });
            }

            setRuntimeControlState({
                pendingAction: '',
                taskId,
                stepId,
                message: result.message,
                error: '',
            });
            await refreshRuntimeRecovery(String(nextTask?.threadKey || task.threadKey || sessionId || '').trim());
        } catch (error) {
            setRuntimeControlState({
                pendingAction: '',
                taskId,
                stepId,
                message: '',
                error: error instanceof Error ? error.message : '运行控制动作执行失败。',
            });
        }
    }, [
        activeCapabilityIds,
        activeModelId,
        applyRuntimeControlResultToMessages,
        deepResearchEnabled,
        persistConversation,
        refreshRuntimeRecovery,
        sessionId,
        userProfile.fid,
        userProfile.uid,
        webSearchEnabled,
    ]);

    const sendToAI = useCallback(async (allMessages) => {
        setIsTyping(true);

        const latestUserMessage = [...allMessages].reverse().find((message) => message.role === 'user');
        const activeUserProfile = userProfile || loadCampusUserProfile();
        let unreadSummary = '';
        let approvalSummary = '';

        if (latestUserMessage) {
            if (shouldAttachUnreadSummary(latestUserMessage.content)) {
                try {
                    const syncedMessages = await syncStudyNoticeMessages({
                        uid: activeUserProfile.uid,
                        fid: activeUserProfile.fid,
                    });
                    const unreadItems = Array.isArray(syncedMessages)
                        ? syncedMessages.filter((item) => !item.read)
                        : [];
                    unreadSummary = buildUnreadSummary(unreadItems, formatCenterMessageTime);
                } catch {
                    unreadSummary = '';
                }
            }

            if (shouldAttachApprovalSummary(latestUserMessage.content)) {
                try {
                    const approvalState = await syncCampusApprovals({
                        uid: activeUserProfile.uid,
                        fid: activeUserProfile.fid,
                    });
                    approvalSummary = buildApprovalSummary({
                        pending: approvalState.pending,
                        pendingCount: approvalState.pendingCount,
                        initiated: approvalState.initiated,
                        initiatedCount: approvalState.initiatedCount,
                        records: approvalState.records,
                        recordsByStatus: approvalState.recordsByStatus,
                        recordCountsByStatus: approvalState.recordCountsByStatus,
                        formatter: formatCenterMessageTime,
                    });
                } catch {
                    approvalSummary = '';
                }
            }
        }

        const memorySnapshot = buildFireflyMemorySnapshot({
            uid: activeUserProfile.uid,
            capabilityIds: activeCapabilityIds,
            question: latestUserMessage?.content || '',
            limit: 4,
        });
        const sessionThreadKey = ensureClientSessionKey(sessionId);
        const baseRuntimeContext = {
            ...(launchRuntimeContextRef.current || {}),
            ...(latestUserMessage?.context || {}),
            webSearchEnabled,
            deepResearchEnabled,
            ...(unreadSummary ? { unreadSummary } : {}),
            ...(approvalSummary ? { approvalSummary } : {}),
            ...(memorySnapshot.markdown ? {
                memorySummary: memorySnapshot.markdown,
                memoryIds: memorySnapshot.items.map((item) => item.id),
            } : {}),
        };

        const updateStreamingMessage = (content, streaming = true) => {
            setMessages((prev) => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].role === 'ai') {
                    updated[lastIdx] = {
                        ...updated[lastIdx],
                        content,
                        streaming,
                        modelId: activeModelId,
                    };
                }
                return updated;
            });
        };

        const updateRuntimeTraceMessage = (task, phase = 'running') => {
            setMessages((prev) => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].role === 'ai') {
                    updated[lastIdx] = {
                        ...updated[lastIdx],
                        content: '',
                        messageKind: 'runtime-trace',
                        runtimeTask: task || updated[lastIdx].runtimeTask || null,
                        runtimePhase: phase,
                        streaming: phase === 'running',
                        traceExpanded: false,
                        modelId: activeModelId,
                    };
                }
                return updated;
            });
        };

        const ensureAssistantReplyMessage = (streaming = true) => {
            setMessages((prev) => {
                const updated = [...prev];
                const lastMessage = updated[updated.length - 1] || null;
                if (lastMessage?.role === 'ai' && lastMessage?.messageKind === 'assistant-final') {
                    return updated;
                }
                updated.push(buildAssistantMessage('', activeModelId, { streaming }));
                return updated;
            });
        };

        const updateAgentReplyMessage = (content, streaming = true) => {
            setMessages((prev) => {
                const updated = [...prev];
                const lastMessage = updated[updated.length - 1] || null;

                if (lastMessage?.role === 'ai' && lastMessage?.messageKind === 'assistant-final') {
                    updated[updated.length - 1] = {
                        ...lastMessage,
                        content,
                        streaming,
                        modelId: activeModelId,
                    };
                    return updated;
                }

                updated.push(buildAssistantMessage(content, activeModelId, { streaming }));
                return updated;
            });
        };

        try {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            abortControllerRef.current = new AbortController();

            const runtimeThreadKey = String(
                launchThreadKeyRef.current
                || baseRuntimeContext.threadKey
                || sessionId
                || sessionThreadKey
            ).trim();
            let runtimeRecoveryContext = null;

            try {
                runtimeRecoveryContext = await refreshRuntimeRecovery(runtimeThreadKey);
            } catch (error) {
                if (error.name === 'AbortError') {
                    throw error;
                }
            }

            const mergedRuntimeContext = {
                ...baseRuntimeContext,
                ...marketAccessContext,
                ...((baseRuntimeContext?.resumeMode && runtimeRecoveryContext?.summary) ? {
                    runtimeRecoverySummary: runtimeRecoveryContext.summary,
                    parentTaskId: runtimeRecoveryContext.task?.id || baseRuntimeContext.parentTaskId || '',
                    taskTitle: runtimeRecoveryContext.task?.title || baseRuntimeContext.taskTitle || '',
                    taskGoal: runtimeRecoveryContext.task?.goal || baseRuntimeContext.taskGoal || '',
                    taskResultSummary: runtimeRecoveryContext.task?.resultSummary || baseRuntimeContext.taskResultSummary || '',
                    taskMemorySummary: runtimeRecoveryContext.summary,
                    taskSelectedSkills: runtimeRecoveryContext.task?.selectedSkillLabels || [],
                } : {}),
                ...((baseRuntimeContext?.resumeMode && runtimeRecoveryContext?.preferredToolIds?.length) ? {
                    preferredToolIds: runtimeRecoveryContext.preferredToolIds,
                } : {}),
            };

            const responseMode = decideFireflyResponseMode({
                question: latestUserMessage?.content || '',
                webSearchEnabled,
                deepResearchEnabled,
                runtimeContext: mergedRuntimeContext,
                hasRuntimeRecovery: Boolean(runtimeRecoveryContext?.available),
            });
            const effectiveWebSearchEnabled = shouldUseWebSearch(latestUserMessage?.content || '', {
                webSearchEnabled,
                deepResearchEnabled,
            }) || responseMode.id === 'search';
            const shouldInjectCampusContext = responseMode.id !== 'search'
                && shouldInjectCampusContextForQuestion(latestUserMessage?.content || '');

            if (responseMode.id === 'agent' || responseMode.id === 'workspace') {
                const placeholderEntry = {
                    role: 'ai',
                    content: buildPendingAgentContent(),
                    time: new Date(),
                    streaming: true,
                    modelId: activeModelId,
                    messageKind: 'runtime-trace',
                    runtimeTask: null,
                    runtimePhase: 'planning',
                    traceExpanded: false,
                };
                setMessages((prev) => [...prev, placeholderEntry]);
            } else if (responseMode.id === 'search') {
                const placeholderEntry = {
                    role: 'ai',
                    content: '',
                    time: new Date(),
                    streaming: true,
                    modelId: activeModelId,
                    messageKind: 'runtime-trace',
                    runtimeTask: buildSearchRuntimeTask(latestUserMessage?.content || '', 'search_started'),
                    runtimePhase: 'running',
                    traceExpanded: false,
                };
                setMessages((prev) => [...prev, placeholderEntry]);
            } else {
                const placeholderEntry = buildAssistantMessage('', activeModelId, { streaming: true });
                setMessages((prev) => [...prev, placeholderEntry]);
            }
            pinToBottom('smooth');

            if (responseMode.id === 'agent' || responseMode.id === 'workspace') {
                try {
                const agentResponse = await fetch('/api/firefly/agent/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        question: latestUserMessage?.content || '',
                        threadKey: runtimeThreadKey,
                        capabilityIds: activeCapabilityIds,
                        contextSnapshot: mergedRuntimeContext,
                        uid: activeUserProfile.uid,
                        fid: activeUserProfile.fid,
                    }),
                    signal: abortControllerRef.current.signal,
                });

                if (!agentResponse.ok) {
                    let agentErrorMessage = `萤火虫接口异常（${agentResponse.status}）`;

                    try {
                        const payload = await agentResponse.json();
                        if (payload?.error) {
                            agentErrorMessage = payload.error;
                        }
                    } catch {
                        try {
                            const text = await agentResponse.text();
                            if (text) {
                                agentErrorMessage = text;
                            }
                        } catch {
                            // ignore response parsing errors
                        }
                    }

                    throw new Error(agentErrorMessage);
                }

                if (agentResponse.body) {
                    const reader = agentResponse.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    let latestTask = null;
                    let finalTask = null;
                    let finalReply = '';
                    let shouldFallbackToChat = true;
                    let agentHandled = false;

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed || !trimmed.startsWith('data: ')) continue;

                            const data = trimmed.slice(6);
                            if (data === '[DONE]') continue;

                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.task?.id) {
                                    latestTask = {
                                        ...parsed.task,
                                        sessionId: runtimeThreadKey,
                                        resumeContext: mergedRuntimeContext,
                                    };
                                    upsertFireflyTask(latestTask);
                                }

                                if (parsed.type === 'error') {
                                    throw new Error(parsed.message || '萤火虫任务执行失败，请稍后重试。');
                                }

                                if (parsed.type === 'unhandled') {
                                    updateStreamingMessage(buildPendingAgentContent('fallback'));
                                    shouldFallbackToChat = true;
                                    continue;
                                }

                                if (['task_created', 'plan_ready', 'task_started', 'step_started', 'step_completed', 'step_failed'].includes(parsed.type)) {
                                    agentHandled = true;
                                    shouldFallbackToChat = false;
                                    updateRuntimeTraceMessage(
                                        latestTask,
                                        latestTask?.status === 'failed' || parsed.type === 'step_failed' ? 'failed' : 'running'
                                    );
                                    continue;
                                }

                                if (parsed.type === 'task_completed' || parsed.type === 'task_failed') {
                                    agentHandled = true;
                                    shouldFallbackToChat = false;
                                    finalTask = parsed.task
                                        ? {
                                            ...parsed.task,
                                            sessionId: runtimeThreadKey,
                                            resumeContext: mergedRuntimeContext,
                                        }
                                        : latestTask;
                                    finalReply = parsed.reply || buildStreamingTaskContent(finalTask, parsed.type === 'task_failed' ? 'failed' : 'completed');
                                    updateRuntimeTraceMessage(finalTask, parsed.type === 'task_failed' ? 'failed' : 'completed');
                                    continue;
                                }

                                if (parsed.type === 'reply_started') {
                                    agentHandled = true;
                                    shouldFallbackToChat = false;
                                    updateAgentReplyMessage('', true);
                                    continue;
                                }

                                if (parsed.type === 'reply_delta') {
                                    agentHandled = true;
                                    shouldFallbackToChat = false;
                                    finalReply += parsed.content || '';
                                    updateAgentReplyMessage(finalReply, true);
                                    continue;
                                }

                                if (parsed.type === 'reply_completed') {
                                    agentHandled = true;
                                    shouldFallbackToChat = false;
                                    updateAgentReplyMessage(finalReply, false);
                                    continue;
                                }

                                if (parsed.type === 'done') {
                                    shouldFallbackToChat = !parsed.handled;
                                    if (parsed.handled) {
                                        agentHandled = true;
                                        finalTask = parsed.task
                                            ? {
                                                ...parsed.task,
                                                sessionId: runtimeThreadKey,
                                                resumeContext: mergedRuntimeContext,
                                            }
                                            : (finalTask || latestTask);
                                        finalReply = parsed.reply || finalReply || buildStreamingTaskContent(finalTask, 'completed');
                                    }
                                    continue;
                                }
                            } catch (streamError) {
                                if (streamError instanceof Error) {
                                    throw streamError;
                                }
                            }
                        }
                    }

                    if (agentHandled && !shouldFallbackToChat) {
                        const finalContent = finalReply || buildStreamingTaskContent(finalTask, finalTask?.status === 'failed' ? 'failed' : 'completed');
                        const finalizedTraceMessage = buildRuntimeTraceMessage(
                            finalTask || latestTask,
                            finalTask?.status === 'failed' ? 'failed' : 'completed',
                            activeModelId
                        );
                        const finalAssistantMessage = buildAssistantMessage(finalContent, activeModelId, {
                            showGeneratedBy: true,
                        });
                        const finalMessages = [...allMessages, finalizedTraceMessage, finalAssistantMessage];
                        setMessages(finalMessages);

                        const persistedSessionId = persistConversation(finalMessages, {
                            capabilityIds: activeCapabilityIds,
                            modelId: activeModelId,
                            webSearchEnabled,
                            deepResearchEnabled,
                        runtimeMode: 'agent',
                        responseMode: responseMode.id,
                    });

                        if (finalTask?.id) {
                            upsertFireflyTask(finalTask);
                            const memoryEntry = rememberFireflyTask(finalTask, {
                                uid: activeUserProfile.uid,
                                fid: activeUserProfile.fid,
                                sessionId: persistedSessionId,
                            });
                            const mergedMemoryIds = [
                                ...(Array.isArray(finalTask.memoryIds) ? finalTask.memoryIds : []),
                                ...(memoryEntry ? [memoryEntry.id] : []),
                            ].filter((item, index, array) => item && array.indexOf(item) === index);
                            patchFireflyTask(finalTask.id, {
                                sessionId: persistedSessionId,
                                resumeContext: mergedRuntimeContext,
                                memoryIds: mergedMemoryIds,
                            });
                        }

                        launchRuntimeContextRef.current = null;
                        launchThreadKeyRef.current = null;
                        refreshRuntimeRecovery(runtimeThreadKey);
                        return;
                    }
                }
                } catch (error) {
                    if (error.name === 'AbortError') {
                        throw error;
                    }
                }
            }

            let apiMessages = buildFallbackChatHistory(allMessages, latestUserMessage);

            if (shouldInjectCampusContext && latestUserMessage && (unreadSummary || approvalSummary || memorySnapshot.markdown)) {
                const contextSections = ['你可以访问当前校园工作台中已经同步的业务数据。'];
                if (unreadSummary) contextSections.push(`未读消息摘要：\n${unreadSummary}`);
                if (approvalSummary) contextSections.push(`审批摘要：\n${approvalSummary}`);
                if (memorySnapshot.markdown) contextSections.push(memorySnapshot.markdown);
                contextSections.push(
                    `用户问题：${latestUserMessage.content}`,
                    isTroubleshootingQuestion(latestUserMessage.content)
                        ? '用户当前是在追问排障或认证问题。请优先解释失败原因、缺少的认证条件和下一步排查动作，不要继续生成审批/消息汇总文档。'
                        : '请优先基于以上摘要直接回答，不要再说“系统未接入”或“无法获取数据”。请使用清晰的 Markdown 结构，适合时用小标题和列表组织信息。如果需要给用户返回链接，请使用 Markdown 链接格式，例如 [查看详情](/messages/xx) 或 [打开审批](https://example.com)，不要直接输出长网址。若摘要显示为空，就明确告诉用户当前没有对应数据。'
                );

                const targetIndex = apiMessages.map((message, index) => ({ ...message, index })).reverse().find((message) => message.role === 'user');
                if (typeof targetIndex?.index === 'number') {
                    apiMessages = apiMessages.map((message, index) => (
                        index === targetIndex.index
                            ? { ...message, content: contextSections.join('\n\n') }
                            : message
                    ));
                }
            }

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: apiMessages,
                    originalQuestion: latestUserMessage?.content || '',
                    model: activeModelId,
                    capabilityIds: activeCapabilityIds,
                    webSearchEnabled: effectiveWebSearchEnabled,
                    deepResearchEnabled,
                    userName: activeUserProfile.chaoxingName || activeUserProfile.name || '',
                }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                let chatErrorMessage = `聊天接口异常（${response.status}）`;

                try {
                    const payload = await response.json();
                    if (payload?.error) {
                        chatErrorMessage = payload.error;
                    }
                } catch {
                    try {
                        const text = await response.text();
                        if (text) {
                            chatErrorMessage = text;
                        }
                    } catch {
                        // ignore response parsing errors
                    }
                }

                throw new Error(chatErrorMessage);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            let buffer = '';
            let sourceRefs = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;
                    const data = trimmed.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.type === 'error' && parsed.error) {
                            throw new Error(parsed.error);
                        }
                        if (parsed.type === 'sources') {
                            sourceRefs = Array.isArray(parsed.sources) ? parsed.sources : [];
                            continue;
                        }
                        if (parsed.type === 'status') {
                            if (responseMode.id === 'search') {
                                updateRuntimeTraceMessage(
                                    buildSearchRuntimeTask(latestUserMessage?.content || '', parsed.stage || 'search_started', parsed),
                                    parsed.stage === 'failed' ? 'failed' : 'running'
                                );
                            } else {
                                updateStreamingMessage(buildDirectStatusContent(parsed), true);
                            }
                            continue;
                        }
                        if (!parsed.content) continue;
                        if (responseMode.id === 'search') {
                            ensureAssistantReplyMessage(true);
                        }
                        fullContent += parsed.content;
                        updateStreamingMessage(fullContent);
                    } catch (streamError) {
                        if (streamError instanceof Error) {
                            throw streamError;
                        }
                    }
                }
            }

            const finalContent = fullContent || '抱歉，我暂时无法回答这个问题，请稍后再试。';
            const finalMessages = responseMode.id === 'search'
                ? [
                    ...allMessages,
                    buildRuntimeTraceMessage(
                        buildSearchRuntimeTask(latestUserMessage?.content || '', 'completed', {
                            summary: '来源检索和回答整理已完成。',
                        }),
                        'completed',
                        activeModelId
                    ),
                    buildAssistantMessage(finalContent, activeModelId, {
                        sourceRefs,
                        showGeneratedBy: true,
                    }),
                ]
                : [...allMessages, buildAssistantMessage(finalContent, activeModelId, {
                    sourceRefs,
                    showGeneratedBy: responseMode.id === 'agent',
                })];
            setMessages(finalMessages);
            autoScrollBehaviorRef.current = 'smooth';

            const persistedSessionId = persistConversation(finalMessages, {
                capabilityIds: activeCapabilityIds,
                modelId: activeModelId,
                webSearchEnabled: effectiveWebSearchEnabled,
                deepResearchEnabled,
                runtimeMode: responseMode.id === 'search' ? 'chat_search' : 'chat_direct',
                responseMode: responseMode.id,
            });

            try {
                const userText = allMessages[allMessages.length - 1]?.content || '';
                fetch('/api/extract-tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: `User: ${userText}\nAI: ${finalContent}`,
                        sessionId: persistedSessionId,
                    })
                }).then(res => res.json()).then(data => {
                    if (data.tasks && data.tasks.length > 0) {
                        const existingTasks = JSON.parse(localStorage.getItem('dynamic_tasks') || '[]');
                        const newTasks = [
                            ...data.tasks.map((task) => ({
                                ...task,
                                createdAt: task.createdAt || new Date().toISOString(),
                            })),
                            ...existingTasks,
                        ];
                        localStorage.setItem('dynamic_tasks', JSON.stringify(newTasks));
                        window.dispatchEvent(new CustomEvent('tasks-updated', { detail: data.tasks }));
                    }
                }).catch(console.error);
            } catch {}

            launchRuntimeContextRef.current = null;
            launchThreadKeyRef.current = null;
            refreshRuntimeRecovery(sessionThreadKey);
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('Chat error:', error);
            const message = error instanceof Error && error.message
                ? `⚠️ ${error.message}`
                : '⚠️ 网络连接异常，请检查网络后重试。';
            updateStreamingMessage(message, false);
        } finally {
            setIsTyping(false);
        }
    }, [persistConversation, activeCapabilityIds, activeModelId, webSearchEnabled, deepResearchEnabled, sessionId, refreshRuntimeRecovery, userProfile, marketAccessContext, pinToBottom]);

    // Handle initial message from landing page
    useEffect(() => {
        if (initialMessage && !hasInitialized.current) {
            hasInitialized.current = true;
            const userMsg = {
                role: 'user',
                content: initialMessage,
                time: new Date(),
                context: launchRuntimeContextRef.current || {},
            };
            setMessages([userMsg]);
            sendToAI([userMsg]);
        }
    }, [initialMessage, sendToAI]);

    const handleSend = () => {
        const message = inputValue.trim();
        if (!message || isTyping) return;
        setShowToolsMenu(false);
        const userMsg = { role: 'user', content: message, time: new Date() };
        const newMessages = [...messages.filter(m => !m.streaming), userMsg];
        setMessages(newMessages);
        setInputValue('');
        sendToAI(newMessages);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const formatTime = (date) => {
        const d = new Date(date);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const handleModelChange = (e) => {
        const nextModelId = e.target.value;
        setActiveModelId(nextModelId);
        onPreferredModelChange?.(nextModelId);
    };

    const handleCapabilityToggle = (capabilityId) => {
        setActiveCapabilityIds((prev) => {
            const next = prev.includes(capabilityId)
                ? (prev.length === 1 ? prev : prev.filter((item) => item !== capabilityId))
                : [...prev, capabilityId];

            onToggleCapability?.(capabilityId);
            return next;
        });
    };

    const handleVoiceInput = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            return;
        }

        if (speechRecognitionRef.current) {
            speechRecognitionRef.current.stop();
            speechRecognitionRef.current = null;
            setIsListening(false);
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'zh-CN';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            const transcript = event.results?.[0]?.[0]?.transcript;
            if (transcript) {
                setInputValue((prev) => `${prev}${prev ? '\n' : ''}${transcript}`);
            }
        };

        recognition.onend = () => {
            speechRecognitionRef.current = null;
            setIsListening(false);
        };

        recognition.onerror = () => {
            speechRecognitionRef.current = null;
            setIsListening(false);
        };

        speechRecognitionRef.current = recognition;
        setIsListening(true);
        recognition.start();
    };

    const preventComposerFocusSteal = (event) => {
        event.stopPropagation();
    };

    const handlePrefillPrompt = (prompt) => {
        setInputValue(prompt);
        requestAnimationFrame(() => {
            textareaRef.current?.focus();
        });
    };
    const toggleAgentPanel = () => {
        setShowAgentPanel((current) => !current);
        setShowToolsMenu(false);
    };

    const workspaceTitle = buildConversationTitle(messages.length > 0 ? messages : [{
        role: 'user',
        content: initialMessage || '新的校园任务',
    }]);
    const activeCapabilities = activeCapabilityIds.map((id) => capabilityMap[id]).filter(Boolean);
    const activeModel = resolveChatModel(activeModelId || preferredModelId);
    const capabilitySummary = activeCapabilities.map((capability) => capability.name).join('、');
    const isMinimal = variant === 'minimal';
    const hasConversation = messages.length > 0 || isTyping;
    const runtimeRecoveryLabel = runtimeRecovery?.task?.title || runtimeRecovery?.session?.title || '最近任务';
    const runtimeRecoveryStatus = runtimeRecovery?.task?.status || runtimeRecovery?.run?.phase || '可恢复';
    const emptyGreeting = buildTimeGreeting(userProfile?.chaoxingName || userProfile?.name || '');
    const workspaceBadges = hasConversation
        ? [
            sessionId ? '历史会话' : '当前对话',
            activeModel?.label || '默认模型',
            `${activeCapabilities.length} 个校园能力`,
        ]
        : [
            sessionId ? '历史会话' : '当前工作区',
            'Agent Runtime',
            activeModel?.label || '默认模型',
            `${activeCapabilities.length} 个校园能力`,
        ];

    const renderToolsMenu = () => (
        <div className="chat-floating-menu glass-strong tools-menu">
            <div className="chat-floating-section">
                <div className="chat-floating-section-title">对话设置</div>
                <label className="chat-floating-select">
                    <span>模型</span>
                    <select value={activeModelId} onChange={handleModelChange}>
                        {availableModels.map((model) => (
                            <option key={model.id} value={model.id}>
                                {model.label}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="chat-floating-toggle-row">
                    <button
                        className={`chat-tool-chip ${webSearchEnabled ? 'active' : ''}`}
                        type="button"
                        onClick={() => onWebSearchChange?.(!webSearchEnabled)}
                    >
                        联网搜索
                    </button>
                    <button
                        className={`chat-tool-chip ${deepResearchEnabled ? 'active' : ''}`}
                        type="button"
                        onClick={() => onDeepResearchChange?.(!deepResearchEnabled)}
                    >
                        深度研究
                    </button>
                </div>
                <button
                    className={`chat-floating-action ${isListening ? 'active' : ''}`}
                    type="button"
                    onClick={handleVoiceInput}
                >
                    <strong>{isListening ? '停止语音输入' : '语音输入'}</strong>
                    <span>{isListening ? '正在监听你的语音' : '把语音转成输入内容'}</span>
                </button>
            </div>
            <div className="chat-floating-section">
                <div className="chat-floating-section-title">已接入能力</div>
                {campusCapabilities.map((capability) => (
                    <button
                        key={capability.id}
                        type="button"
                        className={`chat-floating-item ${activeCapabilityIds.includes(capability.id) ? 'active' : ''}`}
                        onClick={() => handleCapabilityToggle(capability.id)}
                    >
                        <strong>{capability.name}</strong>
                        <span>{capability.source}</span>
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <div className={`chat-area ${isMinimal ? 'minimal' : ''}`}>
            <div className="messages-container" ref={messagesContainerRef} onScroll={handleMessagesScroll}>
                <div className="chat-container-inner">
                    <div className={`chat-workspace-head glass ${hasConversation ? 'compact' : ''}`}>
                        <div className="chat-workspace-copy">
                            {!isMinimal && (
                                <span className="chat-workspace-badge">萤火虫工作区</span>
                            )}
                            <h2 className="chat-workspace-title">{workspaceTitle}</h2>
                            {!isMinimal && !hasConversation && (
                                <p className="chat-workspace-desc">
                                    从这里直接开始聊就可以。
                                </p>
                            )}
                        </div>
                        <div className="chat-workspace-tags">
                            {workspaceBadges.map((badge) => (
                                <span
                                    key={badge}
                                    className="chat-workspace-tag"
                                    title={badge.includes('校园能力') ? capabilitySummary : undefined}
                                >
                                    {badge}
                                </span>
                            ))}
                        </div>
                    </div>

                    {runtimeRecovery?.available && (
                        <div className="chat-runtime-strip glass">
                            <div className="chat-runtime-strip-copy">
                                <span className="chat-runtime-strip-kicker">恢复</span>
                                <strong>{runtimeRecoveryLabel}</strong>
                                <span>上次任务仍可继续</span>
                            </div>
                            <div className="chat-runtime-strip-actions">
                                <span className="chat-runtime-strip-summary">{runtimeRecoveryStatus}</span>
                                <Link
                                    href={`/runtime?threadKey=${encodeURIComponent(runtimeRecovery.threadKey)}`}
                                    className="chat-runtime-strip-link"
                                >
                                    查看详情
                                </Link>
                            </div>
                        </div>
                    )}

                    {messages.length === 0 && !isTyping ? (
                        <div className="chat-empty">
                            <div className="empty-icon glass-strong">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                            </div>
                            <p>{emptyGreeting}</p>
                            <div className="chat-empty-actions">
                                {fireflyStarterPrompts.map((prompt) => (
                                    <button
                                        key={prompt}
                                        type="button"
                                        className="chat-empty-action"
                                        onClick={() => handlePrefillPrompt(prompt)}
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        renderableMessages.map((item) => {
                            if (item.type === 'assistant-with-runtime') {
                                const runtimeMessage = item.runtime;
                                const assistantMessage = item.assistant;

                                return (
                                    <div key={item.key} className="message ai">
                                        <div className="msg-avatar ai-av">
                                            <FireflyMark size={18} className="msg-firefly-mark" decorative />
                                        </div>
                                        <div className="msg-stack">
                                            <div className="msg-runtime-slot">
                                                <FireflyRuntimeStrip
                                                    task={runtimeMessage.runtimeTask}
                                                    timeLabel={runtimeMessage.streaming ? '正在运行' : formatTime(runtimeMessage.time)}
                                                    defaultExpanded={Boolean(runtimeMessage.traceExpanded)}
                                                    surface="chat"
                                                    controlState={runtimeControlState}
                                                    onControlAction={handleRuntimeControlAction}
                                                />
                                            </div>
                                            <div className="msg-bubble">
                                                <div className="msg-content">
                                                    {renderRichMessageContent(stripAssistantDisclosure(assistantMessage.content))}
                                                    {assistantMessage.streaming && <span className="streaming-cursor">|</span>}
                                                </div>
                                                <AssistantMessageFooter message={assistantMessage} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            const msg = item.message;

                            return (
                                <div
                                    key={item.key}
                                    className={`message ${msg.role === 'user' ? 'user' : 'ai'} ${msg.messageKind === 'runtime-trace' && msg.runtimeTask ? 'runtime-only' : ''}`}
                                >
                                    {msg.role !== 'user' && (
                                        <div className="msg-avatar ai-av">
                                            <FireflyMark size={18} className="msg-firefly-mark" decorative />
                                        </div>
                                    )}
                                    {msg.messageKind === 'runtime-trace' && msg.runtimeTask ? (
                                        <div className="msg-stack msg-stack-runtime">
                                            <div className="msg-runtime-slot">
                                                <FireflyRuntimeStrip
                                                    task={msg.runtimeTask}
                                                    timeLabel={msg.streaming ? '正在运行' : formatTime(msg.time)}
                                                    defaultExpanded={Boolean(msg.traceExpanded)}
                                                    surface="chat"
                                                    controlState={runtimeControlState}
                                                    onControlAction={handleRuntimeControlAction}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="msg-bubble">
                                            <div className="msg-content">
                                                {renderRichMessageContent(stripAssistantDisclosure(msg.content))}
                                                {msg.streaming && <span className="streaming-cursor">|</span>}
                                            </div>
                                            {msg.role !== 'user' ? <AssistantMessageFooter message={msg} /> : null}
                                        </div>
                                    )}
                                    {msg.role === 'user' && (
                                        <div className="msg-avatar user-av">
                                            <img
                                                src={userProfile?.avatar || '/user-avatar.png'}
                                                alt={userProfile?.name || '用户头像'}
                                                className="msg-avatar-image"
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                    {isTyping && !messages.find(m => m.streaming) && (
                        <div className="message ai typing-indicator">
                            <div className="msg-avatar ai-av">
                                <FireflyMark size={18} className="msg-firefly-mark" decorative />
                            </div>
                            <div className="msg-bubble typing-dots">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            <div className="chat-input-area">
                <div className="chat-container-inner">
                    {showAgentPanel ? (
                        <div className="chat-agent-panel-wrap">
                            <FireflyControlPlanePanel
                                surface="chat"
                                threadKey={String(
                                    activeRuntimeTask?.threadKey
                                    || runtimeRecovery?.threadKey
                                    || launchThreadKeyRef.current
                                    || chatThreadKey
                                ).trim()}
                                activeTask={activeRuntimeTask}
                                userProfile={userProfile}
                                capabilityIds={activeCapabilityIds}
                                marketAccess={marketAccessContext.marketAccess}
                                contextSnapshot={agentPanelContextSnapshot}
                                className="chat-agent-panel"
                                defaultExpanded={false}
                            />
                            <FireflyThreadRuntimePanel
                                threadKey={String(
                                    activeRuntimeTask?.threadKey
                                    || runtimeRecovery?.threadKey
                                    || launchThreadKeyRef.current
                                    || chatThreadKey
                                ).trim()}
                                activeTask={activeRuntimeTask}
                                controlState={runtimeControlState}
                                onControlAction={handleRuntimeControlAction}
                                userProfile={userProfile}
                                capabilityIds={activeRuntimeTask?.capabilityIds || activeCapabilityIds}
                                className="chat-agent-runtime-panel"
                                defaultExpanded={Boolean(activeRuntimeTask?.id || runtimeRecovery?.available)}
                            />
                        </div>
                    ) : null}
                    {isMinimal ? (
                        <div className="chat-composer-minimal glass-strong">
                            <div className="chat-composer-status">
                                继续输入，萤火虫会拆解任务、组织结果，并围绕当前任务保持简洁对话。
                            </div>
                            <div className="chat-input-box chat-input-box-minimal" onClick={() => textareaRef.current?.focus()}>
                                <textarea
                                    ref={textareaRef}
                                    className="chat-textarea chat-textarea-minimal"
                                    placeholder=""
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    rows={3}
                                />
                            </div>
                            <div
                                className="chat-composer-footer"
                                onMouseDown={preventComposerFocusSteal}
                                onClick={preventComposerFocusSteal}
                            >
                                <div className="chat-composer-tools">
                                    <button
                                        className={`chat-tool-btn ${showAgentPanel ? 'active' : ''}`}
                                        type="button"
                                        onClick={toggleAgentPanel}
                                    >
                                        {showAgentPanel ? '收起 Agent 面板' : 'Agent 面板'}
                                    </button>
                                    <button
                                        className={`chat-tool-chip ${webSearchEnabled ? 'active' : ''}`}
                                        type="button"
                                        onClick={() => onWebSearchChange?.(!webSearchEnabled)}
                                    >
                                        联网搜索
                                    </button>
                                    <button
                                        className={`chat-tool-chip ${deepResearchEnabled ? 'active' : ''}`}
                                        type="button"
                                        onClick={() => onDeepResearchChange?.(!deepResearchEnabled)}
                                    >
                                        深度研究
                                    </button>
                                    <div className="chat-menu-wrap" ref={toolsMenuRef}>
                                        <button className={`chat-tool-chip ${showToolsMenu ? 'active' : ''}`} type="button" onClick={() => setShowToolsMenu((prev) => !prev)}>
                                            工具
                                        </button>
                                        {showToolsMenu && renderToolsMenu()}
                                    </div>
                                    <span className="chat-inline-config" title={capabilitySummary}>
                                        {activeModel?.label || '默认模型'} · {activeCapabilities.length} 个能力
                                    </span>
                                </div>
                                <button
                                    className={`chat-send ${inputValue.trim() ? 'active' : ''}`}
                                    onClick={handleSend}
                                    disabled={!inputValue.trim() || isTyping}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div
                            className="chat-input-box glass-strong"
                            onClick={() => textareaRef.current?.focus()}
                        >
                                <textarea
                                    ref={textareaRef}
                                    className="chat-textarea"
                                    placeholder="发消息给萤火虫"
                                    value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                rows={3}
                            />
                            <div
                                className="chat-input-footer"
                                onMouseDown={preventComposerFocusSteal}
                                onClick={preventComposerFocusSteal}
                            >
                                <div className="chat-composer-tools">
                                    <button
                                        className={`chat-tool-btn ${showAgentPanel ? 'active' : ''}`}
                                        type="button"
                                        onClick={toggleAgentPanel}
                                    >
                                        {showAgentPanel ? '收起 Agent 面板' : 'Agent 面板'}
                                    </button>
                                    <button
                                        className={`chat-tool-chip ${webSearchEnabled ? 'active' : ''}`}
                                        type="button"
                                        onClick={() => onWebSearchChange?.(!webSearchEnabled)}
                                    >
                                        联网搜索
                                    </button>
                                    <button
                                        className={`chat-tool-chip ${deepResearchEnabled ? 'active' : ''}`}
                                        type="button"
                                        onClick={() => onDeepResearchChange?.(!deepResearchEnabled)}
                                    >
                                        深度研究
                                    </button>
                                    <div className="chat-menu-wrap" ref={toolsMenuRef}>
                                        <button className={`chat-tool-chip ${showToolsMenu ? 'active' : ''}`} type="button" onClick={() => setShowToolsMenu((prev) => !prev)}>
                                            工具
                                        </button>
                                        {showToolsMenu && renderToolsMenu()}
                                    </div>
                                    <span className="chat-inline-config" title={capabilitySummary}>
                                        {activeModel?.label || '默认模型'} · {activeCapabilities.length} 个能力
                                    </span>
                                </div>
                                <button
                                    className={`chat-send ${inputValue.trim() ? 'active' : ''}`}
                                    onClick={handleSend}
                                    disabled={!inputValue.trim() || isTyping}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="chat-footer-hint">Enter 发送，Shift + Enter 换行。AI 生成内容仅供参考，涉及制度与流程时请以校园正式通知为准。</div>
                </div>
            </div>
        </div>
    );
}
